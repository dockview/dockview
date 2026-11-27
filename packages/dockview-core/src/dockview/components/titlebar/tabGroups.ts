import { forceReflow, toggleClass } from '../../../dom';
import { addDisposableListener } from '../../../events';
import {
    getPanelData,
    LocalSelectionTransfer,
    PanelTransfer,
} from '../../../dnd/dataTransfer';
import {
    html5Backend,
    IDragSource,
    pointerBackend,
} from '../../../dnd/backend';
import { LongPressDetector } from '../../../dnd/pointer/longPress';
import {
    CompositeDisposable,
    IDisposable,
    IValueDisposable,
} from '../../../lifecycle';
import { DockviewComponent } from '../../dockviewComponent';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { DockviewHeaderDirection } from '../../options';
import { resolveDndCapabilities } from '../../dndCapabilities';
import { Tab } from '../tab/tab';
import { ITabGroup } from '../../tabGroup';
import { applyTabGroupAccent } from '../../tabGroupAccent';
import { TabGroupChip } from './tabGroupChip';
import { ITabGroupChipRenderer } from '../../framework';
import {
    DroptargetEvent,
    DroptargetOptions,
    IDropTarget,
    Position,
} from '../../../dnd/droptarget';
import {
    ITabGroupIndicator,
    NoneTabGroupIndicator,
    WrapTabGroupIndicator,
} from './tabGroupIndicator';

const EMPTY_MAP: ReadonlyMap<string, HTMLElement> = new Map();

export interface TabGroupManagerContext {
    readonly group: DockviewGroupPanel;
    readonly accessor: DockviewComponent;
    readonly tabsList: HTMLElement;
    getTabs(): IValueDisposable<Tab>[];
    getTabMap(): Map<string, IValueDisposable<Tab>>;
    getDirection(): DockviewHeaderDirection;
}

export interface TabGroupManagerCallbacks {
    onChipContextMenu(tabGroup: ITabGroup, event: MouseEvent): void;
    onChipDragStart(
        tabGroup: ITabGroup,
        chip: ITabGroupChipRenderer,
        event: DragEvent | PointerEvent
    ): void;
    /**
     * HTML5 chip dragend only. Pointer dragend is handled centrally via
     * `PointerDragController.onDragEnd` in `tabs.ts`.
     */
    onChipDragEnd?(
        tabGroup: ITabGroup,
        chip: ITabGroupChipRenderer,
        event: DragEvent | PointerEvent
    ): void;
    onChipDrop(tabGroup: ITabGroup, event: DroptargetEvent): void;
}

interface ChipRendererEntry {
    chip: ITabGroupChipRenderer;
    /**
     * Created by the manager so it can be toggled live on strategy changes.
     * Undefined between an in-flight drag being torn down by
     * `disposeChipDrag` and the following `update()` re-arming it — the chip
     * element outlives a within-group move even though its drag sources do
     * not. (#1410)
     */
    html5DragSource: IDragSource | undefined;
    pointerDragSource: IDragSource | undefined;
    /** Disposes the two drag sources + their shared dragend listener. */
    dragSourcesDisposable: IDisposable | undefined;
    disposable: IDisposable;
    dropTarget: IDropTarget;
    pointerDropTarget: IDropTarget;
}

export class TabGroupManager {
    private readonly _chipRenderers = new Map<string, ChipRendererEntry>();
    private _indicator: ITabGroupIndicator | null = null;
    private _skipNextCollapseAnimation = false;
    private readonly _pendingTransitionCleanups = new Map<string, () => void>();

    get chipRenderers(): ReadonlyMap<string, ChipRendererEntry> {
        return this._chipRenderers;
    }

    get groupUnderlines(): ReadonlyMap<string, HTMLElement> {
        return this._indicator?.underlines ?? EMPTY_MAP;
    }

    get skipNextCollapseAnimation(): boolean {
        return this._skipNextCollapseAnimation;
    }

    set skipNextCollapseAnimation(value: boolean) {
        this._skipNextCollapseAnimation = value;
    }

    constructor(
        private readonly _ctx: TabGroupManagerContext,
        private readonly _callbacks: TabGroupManagerCallbacks
    ) {}

    /**
     * Synchronize chip elements and CSS classes for all tab groups
     * in the parent group model. Call after any tab group mutation.
     */
    update(): void {
        const model = this._ctx.group.model;
        const tabGroups = model.getTabGroups();

        const activeGroupIds = new Set<string>();

        for (const tabGroup of tabGroups) {
            activeGroupIds.add(tabGroup.id);
            this._ensureChipForGroup(tabGroup);
        }

        // Remove chips for dissolved/destroyed groups
        for (const [groupId, entry] of this._chipRenderers) {
            if (!activeGroupIds.has(groupId)) {
                entry.chip.element.remove();
                entry.chip.dispose();
                entry.dragSourcesDisposable?.dispose();
                entry.disposable.dispose();
                this._chipRenderers.delete(groupId);
            }
        }

        this.render();
    }

    /**
     * Re-read the active palette and re-apply colors to chips, tabs and
     * the indicator. Called when `tabGroupColors` / `tabGroupAccent`
     * options change at runtime.
     */
    refreshAccents(): void {
        for (const tabGroup of this._ctx.group.model.getTabGroups()) {
            const entry = this._chipRenderers.get(tabGroup.id);
            entry?.chip.update?.({ tabGroup });
        }
        this.render();
    }

    /**
     * Bring the chips and tab classes in line with the tab groups in one
     * walk over the tabs: each chip goes before its tab group's first
     * member, every tab takes its tab group's classes and accent, and a
     * newly collapsed tab group collapses its tabs. A chip whose tab group
     * has no tab to lead leaves the strip. A tab group without a chip yet
     * is left to `update`, which creates the chip first.
     */
    render(): void {
        if (
            this._chipRenderers.size === 0 &&
            (this._indicator?.underlines.size ?? 0) === 0
        ) {
            return; // nothing rendered and nothing left to clear
        }
        const tabGroups = this._ctx.group.model
            .getTabGroups()
            .filter((tg) => this._chipRenderers.has(tg.id));

        let hasAnimation = this._renderTabs(tabGroups);
        for (const tg of tabGroups) {
            hasAnimation = this._collapseTabs(tg) || hasAnimation;
        }
        this._skipNextCollapseAnimation = false;
        this._syncIndicator(tabGroups, hasAnimation);
    }

    /** Place each chip before its tab group's first tab, give every tab its
     *  tab group's classes, and drop chips with no tab to lead. Returns
     *  whether a tab started animating. */
    private _renderTabs(tabGroups: readonly ITabGroup[]): boolean {
        const tabGroupOf = new Map<string, ITabGroup>();
        for (const tg of tabGroups) {
            for (const id of tg.panelIds) {
                tabGroupOf.set(id, tg);
            }
        }

        const led = new Set<string>();
        let hasAnimation = false;
        for (const { value: tab } of this._ctx.getTabs()) {
            const tg = tabGroupOf.get(tab.panel.id);
            if (tg && this._placeChip(tg, tab.panel.id, tab.element)) {
                led.add(tg.id);
            }
            hasAnimation = this._renderTab(tab, tg) || hasAnimation;
        }
        for (const [id, entry] of this._chipRenderers) {
            if (!led.has(id)) {
                entry.chip.element.remove();
            }
        }
        return hasAnimation;
    }

    /** Put `tabGroup`'s chip before `tabEl` when it is the first member's
     *  tab. Returns whether the chip leads it. */
    private _placeChip(
        tabGroup: ITabGroup,
        panelId: string,
        tabEl: HTMLElement
    ): boolean {
        if (tabGroup.panelIds[0] !== panelId) {
            return false;
        }
        const chipEl = this._chipRenderers.get(tabGroup.id)?.chip.element;
        if (!chipEl) {
            return false;
        }
        if (chipEl.nextSibling !== tabEl) {
            this._ctx.tabsList.insertBefore(chipEl, tabEl);
        }
        return true;
    }

    private _syncIndicator(
        tabGroups: readonly ITabGroup[],
        hasAnimation: boolean
    ): void {
        this._ensureIndicator();
        if (!this._indicator) {
            return;
        }
        this._indicator.syncUnderlineElements(
            new Set(tabGroups.map((tg) => tg.id))
        );
        if (hasAnimation) {
            this._indicator.trackUnderlines();
        } else {
            this._indicator.positionUnderlines();
        }
    }

    updateDirection(): void {
        const isVertical = this._ctx.getDirection() === 'vertical';
        for (const [, entry] of this._chipRenderers) {
            const zones: Position[] = isVertical ? ['top'] : ['left'];
            entry.dropTarget.setTargetZones(zones);
            entry.pointerDropTarget.setTargetZones(zones);
        }
    }

    /**
     * Drop any overlay the chips are showing. A group move is committed by a
     * capturing listener on the tabs list that stops the event, so the chip
     * target under the cursor never sees the drop that would clear its own.
     */
    clearChipDropOverlays(): void {
        for (const [, entry] of this._chipRenderers) {
            // Optional-chained because tests may inject minimal entries that
            // skip the manager's normal `_ensureChipForGroup` flow.
            entry.dropTarget?.clearOverlay();
            entry.pointerDropTarget?.clearOverlay();
        }
    }

    /** Each chip's extent along the strip, margins included: the space it
     *  takes from the tabs either side. */
    snapshotChipSizes(): Map<string, number> {
        const isVertical = this._ctx.getDirection() === 'vertical';
        const sizes = new Map<string, number>();
        for (const [groupId, entry] of this._chipRenderers) {
            const el = entry.chip.element;
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            const margins = isVertical
                ? Number.parseFloat(style.marginTop) +
                  Number.parseFloat(style.marginBottom)
                : Number.parseFloat(style.marginLeft) +
                  Number.parseFloat(style.marginRight);
            sizes.set(
                groupId,
                (isVertical ? rect.height : rect.width) + (margins || 0)
            );
        }
        return sizes;
    }

    positionUnderlines(): void {
        this._indicator?.positionUnderlines();
    }

    trackUnderlines(): void {
        this._indicator?.trackUnderlines();
    }

    setGroupDragImage(
        event: DragEvent,
        tabGroup: ITabGroup,
        chipEl: HTMLElement
    ): void {
        if (!event.dataTransfer) {
            return;
        }

        const isVertical = this._ctx.getDirection() === 'vertical';

        // Clone the entire tabs list so cloned nodes inherit all
        // theme styles, CSS variables and class-based rules.
        const clone = this._ctx.tabsList.cloneNode(true) as HTMLElement;

        if (isVertical) {
            // Force horizontal orientation for the drag ghost by
            // removing vertical CSS classes and overriding writing-mode.
            clone.classList.remove('dv-tabs-container-vertical', 'dv-vertical');
            clone.classList.add('dv-horizontal');
            clone.style.writingMode = 'horizontal-tb';
            clone.style.height = `${this._ctx.tabsList.offsetWidth}px`;
        } else {
            clone.style.height = `${this._ctx.tabsList.offsetHeight}px`;
        }
        clone.style.width = 'auto';
        clone.style.overflow = 'visible';
        clone.style.pointerEvents = 'none';

        // Remove all elements except the chip so the drag ghost
        // shows only the chip regardless of the group's expanded state.
        const children = Array.from(clone.children);
        const realChildren = Array.from(this._ctx.tabsList.children);
        for (let i = children.length - 1; i >= 0; i--) {
            const real = realChildren[i];
            if (real === chipEl) {
                continue; // keep the chip only
            }
            children[i].remove();
        }

        // Wrap the clone in a minimal ancestor chain so that CSS
        // selectors like `.dv-groupview.dv-active-group > .dv-tabs-and-actions-container .dv-tabs-container > .dv-tab`
        // match the cloned tabs and apply correct color/background.
        const wrapper = document.createElement('div');
        wrapper.className = 'dv-groupview dv-active-group';
        wrapper.style.position = 'fixed';
        wrapper.style.top = '-10000px';
        wrapper.style.left = '0px';
        wrapper.style.height = 'auto';
        wrapper.style.width = 'auto';
        wrapper.style.pointerEvents = 'none';

        const actionsWrapper = document.createElement('div');
        actionsWrapper.className = 'dv-tabs-and-actions-container';
        actionsWrapper.style.height = 'auto';
        actionsWrapper.style.width = 'auto';
        wrapper.appendChild(actionsWrapper);
        actionsWrapper.appendChild(clone);

        // Append inside the dockview root so CSS variables are inherited
        this._ctx.accessor.element.appendChild(wrapper);

        // Compute cursor offset relative to the wrapper element.
        // The cloned chip is the first .dv-tab-group-chip in the clone.
        const clonedChip = clone.querySelector('.dv-tab-group-chip');
        const chipRect = chipEl.getBoundingClientRect();
        const cursorInChipX = event.clientX - chipRect.left;
        const cursorInChipY = event.clientY - chipRect.top;

        if (clonedChip) {
            const clonedChipRect = clonedChip.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();
            const offsetX =
                clonedChipRect.left - wrapperRect.left + cursorInChipX;
            const offsetY =
                clonedChipRect.top - wrapperRect.top + cursorInChipY;
            event.dataTransfer.setDragImage(wrapper, offsetX, offsetY);
        } else {
            event.dataTransfer.setDragImage(
                wrapper,
                cursorInChipX,
                cursorInChipY
            );
        }

        // Clean up after the browser captures the image
        requestAnimationFrame(() => {
            wrapper.remove();
        });
    }

    cleanupTransition(panelId: string): void {
        this._pendingTransitionCleanups.get(panelId)?.();
        this._pendingTransitionCleanups.delete(panelId);
    }

    updateDragAndDropState(): void {
        const caps = resolveDndCapabilities(this._ctx.accessor.options);
        for (const entry of this._chipRenderers.values()) {
            entry.chip.element.draggable = caps.html5;
            entry.html5DragSource?.setDisabled(!caps.html5);
            entry.pointerDragSource?.setDisabled(!caps.pointer);
            entry.pointerDragSource?.setTouchOnly(!caps.pointerHandlesMouse);
        }
    }

    /**
     * Synchronously dispose the chip drag sources for an in-flight chip
     * drag. Called from `_commitGroupMove` so the transfer payload +
     * iframe shield are released before the cross-group move detaches
     * the chip (chip dispose is scheduled on a microtask via
     * `_scheduleTabGroupUpdate`, which is too late for callers that read
     * `getPanelData()` synchronously after the move).
     *
     * A cross-group move dissolves the source chip entirely, but a
     * within-group reorder keeps the same chip element — so the sources are
     * cleared to `undefined` here and the subsequent `update()` re-arms them
     * via `_ensureChipForGroup`. Without that re-arm the chip would fire a
     * native `dragstart` (the element keeps `draggable=true`) but never set
     * a transfer payload, leaving the group permanently undraggable after
     * its first move. (#1410)
     */
    disposeChipDrag(tabGroupId: string): void {
        const entry = this._chipRenderers.get(tabGroupId);
        if (!entry) {
            return;
        }
        // Optional-chained because tests may inject minimal entries
        // that skip the manager's normal `_ensureChipForGroup` flow.
        entry.dragSourcesDisposable?.dispose();
        entry.html5DragSource = undefined;
        entry.pointerDragSource = undefined;
        entry.dragSourcesDisposable = undefined;
    }

    /** Cloned chip rect used as the pointer follow-finger ghost. */
    private _buildChipGhostElement(chipEl: HTMLElement): HTMLElement {
        const style = getComputedStyle(chipEl);
        const clone = chipEl.cloneNode(true) as HTMLElement;
        Array.from(style).forEach((key) => {
            clone.style.setProperty(
                key,
                style.getPropertyValue(key),
                style.getPropertyPriority(key)
            );
        });
        clone.style.position = 'absolute';
        return clone;
    }

    disposeAll(): void {
        this._indicator?.dispose();
        this._indicator = null;

        for (const [, cleanup] of this._pendingTransitionCleanups) {
            cleanup();
        }
        this._pendingTransitionCleanups.clear();

        for (const [, entry] of this._chipRenderers) {
            entry.chip.element.remove();
            entry.chip.dispose();
            entry.dragSourcesDisposable?.dispose();
            entry.disposable.dispose();
        }
        this._chipRenderers.clear();
    }

    private _ensureIndicator(): void {
        const mode =
            this._ctx.accessor.options.theme?.tabGroupIndicator ?? 'wrap';

        const Ctor =
            mode === 'none' ? NoneTabGroupIndicator : WrapTabGroupIndicator;

        // Re-create if the indicator type changed (e.g. theme switch)
        if (this._indicator && !(this._indicator instanceof Ctor)) {
            this._indicator.dispose();
            this._indicator = null;
        }

        this._indicator ??= new Ctor({
            tabsList: this._ctx.tabsList,
            getTabGroups: () => this._ctx.group.model.getTabGroups(),
            getActivePanelId: () => this._ctx.group.activePanel?.id,
            getTabMap: () => this._ctx.getTabMap(),
            getChipElement: (id) => this._chipRenderers.get(id)?.chip.element,
            getDirection: () => this._ctx.getDirection(),
            getHeaderPosition: () => this._ctx.group.model.headerPosition,
            getColorPalette: () => this._ctx.accessor.tabGroupColorPalette,
        });
    }

    /**
     * Create the HTML5 + pointer drag sources for a chip (and the direct
     * dragend listener that clears the transfer synchronously). Extracted so
     * both the initial chip build and the post-move re-arm in
     * `_ensureChipForGroup` share one wiring path. (#1410)
     */
    private _createChipDragSources(
        chip: ITabGroupChipRenderer,
        tabGroup: ITabGroup
    ): {
        html5DragSource: IDragSource;
        pointerDragSource: IDragSource;
        disposable: IDisposable;
    } {
        const caps = resolveDndCapabilities(this._ctx.accessor.options);
        chip.element.draggable = caps.html5;

        const panelTransfer =
            LocalSelectionTransfer.getInstance<PanelTransfer>();
        // Shared `getData` for both backends. Sets a group-level
        // PanelTransfer (panelId=null, tabGroupId identifies the group).
        // The returned disposer clears it on drag end.
        const getData = () => {
            panelTransfer.setData(
                [
                    new PanelTransfer(
                        this._ctx.accessor.id,
                        this._ctx.group.id,
                        null,
                        tabGroup.id
                    ),
                ],
                PanelTransfer.prototype
            );
            return {
                dispose: () => {
                    panelTransfer.clearData(PanelTransfer.prototype);
                },
            };
        };

        // The chip's HTML5 drag image is the cloned tabs list (chip only),
        // mounted inside the dockview root for CSS-variable inheritance and
        // positioned against the chip's in-place rect. Layout-dependent
        // offset means we set the drag image directly in `onDragStart`
        // (inside the dragstart handler) rather than via the generic
        // `createGhost` factory, which only knows about ghost specs that
        // can be appended to `document.body`.
        const html5DragSource = html5Backend.createDragSource(chip.element, {
            getData,
            disabled: !caps.html5,
            isCancelled: () =>
                !resolveDndCapabilities(this._ctx.accessor.options).html5,
            onDragStart: (event) => {
                // Type guard via `dataTransfer`; `instanceof DragEvent`
                // would throw in jsdom, which doesn't ship a DragEvent
                // constructor.
                if ('dataTransfer' in event && event.dataTransfer) {
                    this.setGroupDragImage(
                        event as DragEvent,
                        tabGroup,
                        chip.element
                    );
                }
                this._callbacks.onChipDragStart(tabGroup, chip, event);
            },
            onDragEnd: (event) => {
                this._callbacks.onChipDragEnd?.(tabGroup, chip, event);
            },
        });

        // Synchronous panelTransfer cleanup directly on the chip element.
        // `Html5DragSource`'s dragend defers data disposal via `setTimeout(0)`
        // so drop handlers can read the payload, but a chip drag that
        // ends via `moveGroupOrPanel` (no actual drop event) needs the
        // singleton cleared immediately, otherwise a synchronous
        // `getPanelData()` after the move still sees the stale chip
        // payload. Attached directly (not via `addDisposableListener`) so
        // the listener survives chip disposal in the detach-then-dragend
        // cross-group path; `once: true` auto-removes after the single
        // dragend that we care about. (#1254)
        const onDragEndClear = () => {
            panelTransfer.clearData(PanelTransfer.prototype);
        };
        chip.element.addEventListener('dragend', onDragEndClear, {
            once: true,
        });

        const pointerDragSource = pointerBackend.createDragSource(
            chip.element,
            {
                getData,
                disabled: !caps.pointer,
                touchOnly: !caps.pointerHandlesMouse,
                isCancelled: () =>
                    !resolveDndCapabilities(this._ctx.accessor.options).pointer,
                createGhost: () => ({
                    element: this._buildChipGhostElement(chip.element),
                    offsetX: 8,
                    offsetY: 8,
                }),
                onDragStart: (event) => {
                    this._callbacks.onChipDragStart(tabGroup, chip, event);
                },
            }
        );

        return {
            html5DragSource,
            pointerDragSource,
            disposable: {
                dispose: () => {
                    html5DragSource.dispose();
                    pointerDragSource.dispose();
                    chip.element.removeEventListener('dragend', onDragEndClear);
                },
            },
        };
    }

    private _ensureChipForGroup(tabGroup: ITabGroup): void {
        const existing = this._chipRenderers.get(tabGroup.id);
        if (existing) {
            // A committed group move tears down the chip's drag sources via
            // `disposeChipDrag`, but a within-group reorder keeps the same
            // chip element alive. Re-arm the sources so the group stays
            // draggable; without this the chip is stuck after its first
            // move — `dragstart` still fires (the element keeps
            // `draggable=true`) but no transfer payload is set. (#1410)
            if (!existing.html5DragSource) {
                const sources = this._createChipDragSources(
                    existing.chip,
                    tabGroup
                );
                existing.html5DragSource = sources.html5DragSource;
                existing.pointerDragSource = sources.pointerDragSource;
                existing.dragSourcesDisposable = sources.disposable;
            }
            return;
        }

        const createChip =
            this._ctx.accessor.options.createTabGroupChipComponent;
        const chip: ITabGroupChipRenderer = createChip
            ? createChip(tabGroup)
            : new TabGroupChip(this._ctx.accessor.tabGroupColorPalette);

        chip.init({ tabGroup, api: this._ctx.accessor.api });

        const dragSources = this._createChipDragSources(chip, tabGroup);

        const disposables: IDisposable[] = [
            tabGroup.onDidChange(() => {
                chip.update?.({ tabGroup });
                this.render();
            }),
            tabGroup.onDidPanelChange(() => this.render()),
            tabGroup.onDidCollapseChange(() => this.render()),
        ];

        // Context menu: built-in TabGroupChip already aggregates right-click
        // + touch long-press into `onContextMenu`. Custom chip renderers
        // don't, so attach a long-press detector and contextmenu listener
        // directly on their element.
        const onContextMenu = (event: MouseEvent) => {
            // A long-press on a chip should preempt the in-flight pointer
            // drag and open the menu instead. Resolve the source from the
            // entry so a post-move re-armed source is cancelled, not the
            // stale one captured at build time. (#1410)
            this._chipRenderers
                .get(tabGroup.id)
                ?.pointerDragSource?.cancelPending();
            this._callbacks.onChipContextMenu(tabGroup, event);
        };
        if (chip instanceof TabGroupChip) {
            disposables.push(chip.onContextMenu(onContextMenu));
        } else {
            disposables.push(
                new LongPressDetector(chip.element, {
                    onLongPress: onContextMenu,
                }),
                addDisposableListener(
                    chip.element,
                    'contextmenu',
                    onContextMenu
                )
            );
        }

        // The chip sits before its group's first tab in the DOM, so it covers
        // the "drop before the group" position — no preceding tab's right
        // zone reaches it when the group leads the strip. One target per
        // backend, as tabs have.
        const isVertical = this._ctx.getDirection() === 'vertical';
        const dropTargetOptions: DroptargetOptions = {
            acceptedTargetZones: isVertical ? ['top'] : ['left'],
            overlayModel: {
                activationSize: { value: 100, type: 'percentage' },
            },
            canDisplayOverlay: (event, position) => {
                if (this._ctx.group.locked) {
                    return false;
                }
                if (this._ctx.accessor.options.disableDnd) {
                    return false;
                }
                const data = getPanelData();
                if (this._ctx.accessor.id === data?.viewId) {
                    // Smooth-reorder owns the in-flight visual for a single
                    // tab. A dragged group keeps the chip's overlay: its gap
                    // is drawn by shifting this chip aside, which marks no
                    // boundary of its own.
                    if (
                        this._ctx.accessor.options.theme?.tabAnimation ===
                            'smooth' &&
                        !data.tabGroupId
                    ) {
                        return false;
                    }
                    return true;
                }
                return this._ctx.group.model.canDisplayOverlay(
                    event,
                    position,
                    'tab'
                );
            },
        };
        const dropTarget = html5Backend.createDropTarget(
            chip.element,
            dropTargetOptions
        );
        const pointerDropTarget = pointerBackend.createDropTarget(
            chip.element,
            dropTargetOptions
        );
        const onDrop = (event: DroptargetEvent) => {
            this._callbacks.onChipDrop(tabGroup, event);
        };
        disposables.push(
            dropTarget,
            dropTarget.onDrop(onDrop),
            pointerDropTarget,
            pointerDropTarget.onDrop(onDrop)
        );

        const disposable = new CompositeDisposable(...disposables);
        this._chipRenderers.set(tabGroup.id, {
            chip,
            html5DragSource: dragSources.html5DragSource,
            pointerDragSource: dragSources.pointerDragSource,
            dragSourcesDisposable: dragSources.disposable,
            disposable,
            dropTarget,
            pointerDropTarget,
        });

        // Group is born collapsed (cross-group drop, layout restore, etc.):
        // its tabs are about to be added without the collapsed class. Skip
        // the animation in the upcoming render so they
        // apply the class instantly instead of transitioning from expanded.
        if (tabGroup.collapsed) {
            this._skipNextCollapseAnimation = true;
        }
    }

    /** Apply a tab's tab group classes and accent, or clear them; start
     *  the expand animation of a tab whose tab group opened. Returns
     *  whether it animates. */
    private _renderTab(tab: Tab, tg: ITabGroup | undefined): boolean {
        const el = tab.element;
        toggleClass(el, 'dv-tab--grouped', !!tg);
        const ids = tg?.panelIds ?? [];
        toggleClass(el, 'dv-tab--group-first', ids[0] === tab.panel.id);
        toggleClass(
            el,
            'dv-tab--group-last',
            ids[ids.length - 1] === tab.panel.id
        );

        if (!tg) {
            el.classList.remove(
                'dv-tab--group-collapsed',
                'dv-tab--group-expanding'
            );
            el.style.removeProperty('width');
            el.style.removeProperty('--dv-tab-group-color');
            return false;
        }

        // Expose the resolved group color as a CSS custom property so
        // pure-CSS themes can use it for borders, backgrounds, etc.
        applyTabGroupAccent(
            el,
            tg.color,
            this._ctx.accessor.tabGroupColorPalette
        );
        if (tg.collapsed || !el.classList.contains('dv-tab--group-collapsed')) {
            return false;
        }

        // Collapsed → expanding: animate back
        const panelId = tab.panel.id;
        el.classList.remove('dv-tab--group-collapsed');
        el.classList.add('dv-tab--group-expanding');
        // Clean up any previous transitionend listener from a rapid
        // collapse/expand cycle
        this._pendingTransitionCleanups.get(panelId)?.();
        const onEnd = () => {
            el.classList.remove('dv-tab--group-expanding');
            el.style.removeProperty('width');
            el.removeEventListener('transitionend', onEnd);
            clearTimeout(fallbackTimer);
            this._pendingTransitionCleanups.delete(panelId);
        };
        // Fallback in case transitionend never fires (e.g. element removed
        // from DOM mid-transition)
        const fallbackTimer = setTimeout(onEnd, 300);
        this._pendingTransitionCleanups.set(panelId, onEnd);
        el.addEventListener('transitionend', onEnd);
        return true;
    }

    /** Collapse the tabs of a collapsed tab group that are still open:
     *  animated, or at once after `skipNextCollapseAnimation`. Returns
     *  whether it animates. */
    private _collapseTabs(tg: ITabGroup): boolean {
        if (!tg.collapsed) {
            return false;
        }
        const tabMap = this._ctx.getTabMap();
        const open = tg.panelIds.flatMap((pid) => {
            const el = tabMap.get(pid)?.value.element;
            return el && !el.classList.contains('dv-tab--group-collapsed')
                ? [el]
                : [];
        });
        if (open.length === 0) {
            return false;
        }

        if (this._skipNextCollapseAnimation) {
            // Disable transitions so the CSS transition on
            // dv-tab--group-collapsed doesn't fire.
            const affected: HTMLElement[] = [];
            for (const pid of tg.panelIds) {
                const el = tabMap.get(pid)?.value.element;
                if (el) {
                    el.style.transition = 'none';
                    el.classList.add('dv-tab--group-collapsed');
                    affected.push(el);
                }
            }
            forceReflow(affected[0]); // one reflow for the batch
            for (const el of affected) {
                el.style.removeProperty('transition');
            }
            return false;
        }

        const isVert = this._ctx.getDirection() === 'vertical';
        for (const el of open) {
            const rect = el.getBoundingClientRect();
            if (isVert) {
                el.style.height = `${rect.height}px`;
            } else {
                el.style.width = `${rect.width}px`;
            }
            forceReflow(el);
            el.classList.add('dv-tab--group-collapsed');
        }
        return true;
    }
}
