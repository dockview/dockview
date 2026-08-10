import {
    prefersReducedMotion,
    resolveCssDurationMs,
    toggleClass,
} from '../../../dom';
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
import { Droptarget, DroptargetEvent } from '../../../dnd/droptarget';
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
    dropTarget: Droptarget;
}

export class TabGroupManager {
    private readonly _chipRenderers = new Map<string, ChipRendererEntry>();
    private _indicator: ITabGroupIndicator | null = null;
    private _skipNextCollapseAnimation = false;
    private readonly _pendingTransitionCleanups = new Map<string, () => void>();
    /**
     * In-flight Web Animations API collapse animations, keyed by panel id, so a
     * rapid expand/collapse, another collapse, or disposal can cancel the
     * running animation cleanly (see `_cancelCollapseAnimation`). Each entry
     * carries a `cleanup` that releases the inline transition-suppression the
     * animation set up.
     */
    private readonly _collapseAnimations = new Map<
        string,
        { animation: Animation; cleanup: () => void }
    >();
    /**
     * In-flight Web Animations API expand animations, keyed by panel id — the
     * counterpart to `_collapseAnimations`. A collapse, another expand, panel
     * removal, or disposal cancels the running animation cleanly (see
     * `_cancelExpandAnimation`); each entry carries a `cleanup` that removes the
     * inline transition-suppression and the `dv-tab--group-expanding` class.
     */
    private readonly _expandAnimations = new Map<
        string,
        { animation: Animation; cleanup: () => void }
    >();

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
            this._positionChipForGroup(tabGroup);
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

        this._updateTabGroupClasses();
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
        this._updateTabGroupClasses();
    }

    positionAllChips(): void {
        if (this._chipRenderers.size === 0) {
            return;
        }
        for (const tabGroup of this._ctx.group.model.getTabGroups()) {
            this._positionChipForGroup(tabGroup);
        }
    }

    updateDirection(): void {
        const isVertical = this._ctx.getDirection() === 'vertical';
        for (const [, entry] of this._chipRenderers) {
            entry.dropTarget.setTargetZones(isVertical ? ['top'] : ['left']);
        }
    }

    snapshotChipWidths(): Map<string, number> {
        const widths = new Map<string, number>();
        for (const [groupId, entry] of this._chipRenderers) {
            widths.set(
                groupId,
                entry.chip.element.getBoundingClientRect().width
            );
        }
        return widths;
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
        // Also settle any in-flight scripted collapse/expand for this panel
        // (e.g. the tab is being removed mid-animation).
        this._cancelCollapseAnimation(panelId);
        this._cancelExpandAnimation(panelId);
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

        // Each cancel deletes only its own key, which is safe to do while
        // iterating the map's keys directly (no snapshot copy needed).
        for (const panelId of this._collapseAnimations.keys()) {
            this._cancelCollapseAnimation(panelId);
        }

        for (const panelId of this._expandAnimations.keys()) {
            this._cancelExpandAnimation(panelId);
        }

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
                this._updateTabGroupClasses();
            }),
            tabGroup.onDidPanelChange(() => {
                this._positionChipForGroup(tabGroup);
                this._updateTabGroupClasses();
            }),
            tabGroup.onDidCollapseChange(() => {
                this._updateTabGroupClasses();
            }),
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

        // The chip sits before its group's first tab in the DOM, so it
        // covers the "drop before the group" position. Without a drop
        // target here, dropping a tab over the chip is a dead zone,
        // particularly visible when the group is first in the tabs list
        // and there's no preceding tab whose right zone covers position 0.
        // The smooth animation path already shifts the chip's margin to
        // open a gap, so suppress the overlay in that mode.
        const isVertical = this._ctx.getDirection() === 'vertical';
        const dropTarget = new Droptarget(chip.element, {
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
                    if (
                        this._ctx.accessor.options.theme?.tabAnimation ===
                        'smooth'
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
        });
        disposables.push(
            dropTarget,
            dropTarget.onDrop((event) => {
                this._callbacks.onChipDrop(tabGroup, event);
            })
        );

        const disposable = new CompositeDisposable(...disposables);
        this._chipRenderers.set(tabGroup.id, {
            chip,
            html5DragSource: dragSources.html5DragSource,
            pointerDragSource: dragSources.pointerDragSource,
            dragSourcesDisposable: dragSources.disposable,
            disposable,
            dropTarget,
        });

        // Group is born collapsed (cross-group drop, layout restore, etc.):
        // its tabs are about to be added without the collapsed class. Skip
        // the animation in the upcoming _updateTabGroupClasses call so they
        // apply the class instantly instead of transitioning from expanded.
        if (tabGroup.collapsed) {
            this._skipNextCollapseAnimation = true;
        }
    }

    private _positionChipForGroup(tabGroup: ITabGroup): void {
        const entry = this._chipRenderers.get(tabGroup.id);
        if (!entry) {
            return;
        }

        const chipEl = entry.chip.element;
        const panelIds = tabGroup.panelIds;

        if (panelIds.length === 0) {
            chipEl.remove();
            return;
        }

        const firstPanelId = panelIds[0];
        const firstTabEntry = this._ctx.getTabMap().get(firstPanelId);

        if (!firstTabEntry) {
            chipEl.remove();
            return;
        }

        const firstTabEl = firstTabEntry.value.element;
        if (chipEl.nextSibling !== firstTabEl) {
            this._ctx.tabsList.insertBefore(chipEl, firstTabEl);
        }
    }

    private _updateTabGroupClasses(): void {
        const model = this._ctx.group.model;
        const tabGroups = model.getTabGroups();
        const tabs = this._ctx.getTabs();
        const tabMap = this._ctx.getTabMap();
        let hasAnimation = false;

        // Build a lookup: panelId → tabGroup
        const panelGroupMap = new Map<string, ITabGroup>();
        for (const tg of tabGroups) {
            for (const pid of tg.panelIds) {
                panelGroupMap.set(pid, tg);
            }
        }

        for (const tabEntry of tabs) {
            const tab = tabEntry.value;
            const panelId = tab.panel.id;
            const tg = panelGroupMap.get(panelId);

            const isGrouped = !!tg;
            toggleClass(tab.element, 'dv-tab--grouped', isGrouped);

            if (tg) {
                const ids = tg.panelIds;
                const isFirst = ids[0] === panelId;
                const isLast = ids[ids.length - 1] === panelId;

                toggleClass(tab.element, 'dv-tab--group-first', isFirst);
                toggleClass(tab.element, 'dv-tab--group-last', isLast);

                // Expose the resolved group color as a CSS custom property
                // so pure-CSS themes can use it for borders, backgrounds, etc.
                applyTabGroupAccent(
                    tab.element,
                    tg.color,
                    this._ctx.accessor.tabGroupColorPalette
                );

                // Collapse / expand with animation
                const isCollapsed = tab.element.classList.contains(
                    'dv-tab--group-collapsed'
                );
                if (!tg.collapsed && isCollapsed) {
                    // Collapsed → expanding: animate back to the natural size.
                    hasAnimation = true;
                    this._animateTabExpand(
                        tab.element,
                        panelId,
                        this._ctx.getDirection() === 'vertical'
                    );
                }
            } else {
                toggleClass(tab.element, 'dv-tab--group-first', false);
                toggleClass(tab.element, 'dv-tab--group-last', false);
                tab.element.classList.remove(
                    'dv-tab--group-collapsed',
                    'dv-tab--group-expanding'
                );
                tab.element.style.removeProperty('width');
                tab.element.style.removeProperty('--dv-tab-group-color');
            }
        }

        const activeGroupIds = new Set<string>();

        // Handle collapse animation per group
        for (const tg of tabGroups) {
            activeGroupIds.add(tg.id);

            const hasNewCollapse =
                tg.collapsed &&
                tg.panelIds.some((pid) => {
                    const te = tabMap.get(pid);
                    return (
                        te &&
                        !te.value.element.classList.contains(
                            'dv-tab--group-collapsed'
                        )
                    );
                });

            if (hasNewCollapse) {
                if (this._skipNextCollapseAnimation) {
                    // Apply collapsed state instantly (no animation).
                    // Disable transitions so the CSS transition on
                    // dv-tab--group-collapsed doesn't fire, committing the
                    // change with a single forced reflow before re-enabling
                    // them. This path only suppresses a style; it drives no
                    // animation, so the Web Animations API does not apply.
                    const affected: HTMLElement[] = [];
                    for (const pid of tg.panelIds) {
                        const te = tabMap.get(pid);
                        if (te) {
                            // Stop any in-flight animated collapse first so we
                            // don't leave a running animation on a tab we are
                            // about to force to its resting state.
                            this._cancelCollapseAnimation(pid);
                            te.value.element.style.transition = 'none';
                            te.value.element.classList.add(
                                'dv-tab--group-collapsed'
                            );
                            affected.push(te.value.element);
                        }
                    }
                    if (affected.length > 0) {
                        void affected[0].offsetHeight; // single reflow
                        for (const el of affected) {
                            el.style.removeProperty('transition');
                        }
                    }
                } else {
                    hasAnimation = true;
                    const isVert = this._ctx.getDirection() === 'vertical';
                    for (const pid of tg.panelIds) {
                        const te = tabMap.get(pid);
                        if (
                            te &&
                            !te.value.element.classList.contains(
                                'dv-tab--group-collapsed'
                            )
                        ) {
                            this._animateTabCollapse(
                                te.value.element,
                                pid,
                                isVert
                            );
                        }
                    }
                }
            }
        }

        this._skipNextCollapseAnimation = false;

        this._ensureIndicator();
        if (this._indicator) {
            this._indicator.syncUnderlineElements(activeGroupIds);
            if (hasAnimation) {
                this._indicator.trackUnderlines();
            } else {
                this._indicator.positionUnderlines();
            }
        }
    }

    /**
     * Collapse a single tab, animating it from its current geometry to the
     * collapsed rest state.
     *
     * This replaces the former "pin an inline size → force a synchronous
     * reflow → toggle the `dv-tab--group-collapsed` class" pattern with the
     * Web Animations API. `.dv-tab--group-collapsed` still provides the resting
     * state (size/opacity zeroed via `!important`); we add it up front as the
     * animation's base, suppress its CSS transition with an inline
     * `transition: none`, and let a scripted animation play the same geometry
     * the CSS transition would have. Because the class is the base, the
     * animation uses `fill: 'none'` and leaks no inline geometry once it
     * settles — only the inline transition-suppression, which the cleanup
     * removes.
     *
     * Timing and easing mirror the theme's CSS transition exactly: the duration
     * is read from `--dv-transition-duration` (default 200ms) and the easing is
     * `ease-out`, matching `tabs.scss`.
     */
    private _animateTabCollapse(
        el: HTMLElement,
        panelId: string,
        isVert: boolean
    ): void {
        // Tear down any competing in-flight work for this tab so rapid toggles
        // don't stack: a fallback expand cleanup, a scripted expand animation,
        // then any running collapse animation.
        this._pendingTransitionCleanups.get(panelId)?.();
        this._cancelExpandAnimation(panelId);
        this._cancelCollapseAnimation(panelId);

        // Reduced motion mirrors the CSS `@media (prefers-reduced-motion)` rule
        // that disables the transition: apply the collapsed class with no
        // scripted animation. No reflow is needed because the media query has
        // already stripped the CSS transition.
        if (prefersReducedMotion(el.ownerDocument)) {
            el.classList.add('dv-tab--group-collapsed');
            return;
        }

        // Environments without the Web Animations API (notably jsdom under
        // test, and very old browsers): fall back to the original
        // pin + forced-reflow + class pattern so the CSS transition still
        // drives the collapse where one exists.
        if (typeof el.animate !== 'function') {
            const rect = el.getBoundingClientRect();
            if (isVert) {
                el.style.height = `${rect.height}px`;
            } else {
                el.style.width = `${rect.width}px`;
            }
            el.getBoundingClientRect(); // force reflow to commit the pinned size
            el.classList.add('dv-tab--group-collapsed');
            return;
        }

        const win = el.ownerDocument.defaultView;
        const computed = win?.getComputedStyle(el);
        const sizeStart = isVert
            ? `${el.getBoundingClientRect().height}px`
            : `${el.getBoundingClientRect().width}px`;

        // Only geometry (and opacity) is expressed as keyframes; colours and
        // other themed properties stay in CSS. Longhands are used on both
        // keyframes so each animates as a matched pair.
        const from: Keyframe = {
            paddingTop: computed?.paddingTop ?? '',
            paddingRight: computed?.paddingRight ?? '',
            paddingBottom: computed?.paddingBottom ?? '',
            paddingLeft: computed?.paddingLeft ?? '',
            marginTop: computed?.marginTop ?? '',
            marginRight: computed?.marginRight ?? '',
            marginBottom: computed?.marginBottom ?? '',
            marginLeft: computed?.marginLeft ?? '',
            opacity: computed?.opacity ?? '1',
        };
        const to: Keyframe = {
            paddingTop: '0px',
            paddingRight: '0px',
            paddingBottom: '0px',
            paddingLeft: '0px',
            marginTop: '0px',
            marginRight: '0px',
            marginBottom: '0px',
            marginLeft: '0px',
            opacity: '0',
        };
        // Vertical collapses the block (height) axis; horizontal the inline
        // (width) axis — matching the CSS transition per direction.
        if (isVert) {
            from.height = sizeStart;
            to.height = '0px';
        } else {
            from.width = sizeStart;
            to.width = '0px';
        }

        const duration = resolveCssDurationMs(
            el,
            '--dv-transition-duration',
            200
        );

        // Suppress the class's CSS transition so only the scripted animation
        // plays, then add the class as the animation's resting base.
        el.style.transition = 'none';
        el.classList.add('dv-tab--group-collapsed');

        const animation = el.animate([from, to], {
            duration,
            easing: 'ease-out',
            fill: 'none',
        });

        let settled = false;
        const cleanup = () => {
            if (settled) {
                return;
            }
            settled = true;
            el.style.removeProperty('transition');
            if (
                this._collapseAnimations.get(panelId)?.animation === animation
            ) {
                this._collapseAnimations.delete(panelId);
            }
        };

        this._collapseAnimations.set(panelId, { animation, cleanup });

        animation.finished.then(cleanup).catch(() => {
            // `finished` rejects when the animation is cancelled; cancellation
            // runs its own cleanup via `_cancelCollapseAnimation`, so there is
            // nothing to do here.
        });
    }

    /**
     * Cancel an in-flight animated collapse for a tab, if any. The tab is left
     * in its collapsed resting state (the `.dv-tab--group-collapsed` class),
     * and the inline transition-suppression is removed so a subsequent expand
     * transition can play. Idempotent.
     */
    private _cancelCollapseAnimation(panelId: string): void {
        const entry = this._collapseAnimations.get(panelId);
        if (!entry) {
            return;
        }
        // Remove first so the `finished` rejection handler and `cleanup`'s
        // guard both see the entry as already gone.
        this._collapseAnimations.delete(panelId);
        entry.cleanup();
        entry.animation.cancel();
    }

    /**
     * Expand a single tab from its collapsed rest state back to its natural
     * geometry — the inverse of {@link _animateTabCollapse}, and the same
     * Web Animations API treatment. The old path added `dv-tab--group-expanding`
     * and relied on a CSS transition finishing via a `transitionend` listener
     * plus a `setTimeout` fallback (fragile: the event can be missed if the tab
     * is removed mid-transition, and the timer is a guess). Here a scripted
     * animation plays `0 → natural`, its `finished` promise runs the cleanup,
     * and interruptions cancel deterministically — no listeners, no timers.
     *
     * `dv-tab--group-expanding` is still added for the animation's duration
     * (with its CSS transition suppressed inline) so anything observing that
     * class — e.g. the group indicator — behaves exactly as before; the cleanup
     * removes it once the animation settles.
     */
    private _animateTabExpand(
        el: HTMLElement,
        panelId: string,
        isVert: boolean
    ): void {
        // Tear down competing in-flight work: a fallback cleanup, any scripted
        // expand already running, then any collapse animation still playing.
        this._pendingTransitionCleanups.get(panelId)?.();
        this._cancelExpandAnimation(panelId);
        this._cancelCollapseAnimation(panelId);

        // Leave the collapsed resting state so the element resolves back to its
        // natural size; add the expanding marker for the animation's duration.
        el.classList.remove('dv-tab--group-collapsed');
        el.classList.add('dv-tab--group-expanding');

        // Reduced motion mirrors the CSS `@media (prefers-reduced-motion)` rule:
        // apply the expanded (natural) state instantly, no scripted animation.
        if (prefersReducedMotion(el.ownerDocument)) {
            el.classList.remove('dv-tab--group-expanding');
            el.style.removeProperty('width');
            el.style.removeProperty('height');
            return;
        }

        // Environments without the Web Animations API (jsdom under test, very
        // old browsers): fall back to the original CSS-transition +
        // `transitionend` + `setTimeout` cleanup so the class-driven transition
        // still plays where one exists.
        if (typeof el.animate !== 'function') {
            const onEnd = () => {
                el.classList.remove('dv-tab--group-expanding');
                el.style.removeProperty('width');
                el.removeEventListener('transitionend', onEnd);
                clearTimeout(fallbackTimer);
                this._pendingTransitionCleanups.delete(panelId);
            };
            const fallbackTimer = setTimeout(onEnd, 300);
            this._pendingTransitionCleanups.set(panelId, onEnd);
            el.addEventListener('transitionend', onEnd);
            return;
        }

        // Measure the natural target now that the collapsed class is gone.
        const win = el.ownerDocument.defaultView;
        const computed = win?.getComputedStyle(el);
        const sizeEnd = isVert
            ? `${el.getBoundingClientRect().height}px`
            : `${el.getBoundingClientRect().width}px`;

        const from: Keyframe = {
            paddingTop: '0px',
            paddingRight: '0px',
            paddingBottom: '0px',
            paddingLeft: '0px',
            marginTop: '0px',
            marginRight: '0px',
            marginBottom: '0px',
            marginLeft: '0px',
            opacity: '0',
        };
        const to: Keyframe = {
            paddingTop: computed?.paddingTop ?? '',
            paddingRight: computed?.paddingRight ?? '',
            paddingBottom: computed?.paddingBottom ?? '',
            paddingLeft: computed?.paddingLeft ?? '',
            marginTop: computed?.marginTop ?? '',
            marginRight: computed?.marginRight ?? '',
            marginBottom: computed?.marginBottom ?? '',
            marginLeft: computed?.marginLeft ?? '',
            opacity: computed?.opacity ?? '1',
        };
        if (isVert) {
            from.height = '0px';
            to.height = sizeEnd;
        } else {
            from.width = '0px';
            to.width = sizeEnd;
        }

        const duration = resolveCssDurationMs(
            el,
            '--dv-transition-duration',
            200
        );

        // Suppress the expanding class's CSS transition so only the scripted
        // animation plays.
        el.style.transition = 'none';

        const animation = el.animate([from, to], {
            duration,
            easing: 'ease-out',
            fill: 'none',
        });

        let settled = false;
        const cleanup = () => {
            if (settled) {
                return;
            }
            settled = true;
            el.style.removeProperty('transition');
            el.classList.remove('dv-tab--group-expanding');
            el.style.removeProperty('width');
            el.style.removeProperty('height');
            if (this._expandAnimations.get(panelId)?.animation === animation) {
                this._expandAnimations.delete(panelId);
            }
        };

        this._expandAnimations.set(panelId, { animation, cleanup });

        animation.finished.then(cleanup).catch(() => {
            // `finished` rejects on cancellation; `_cancelExpandAnimation` runs
            // the cleanup itself, so there is nothing to do here.
        });
    }

    /**
     * Cancel an in-flight animated expand for a tab, if any — leaving it in its
     * natural (expanded) resting state with the transition-suppression and
     * `dv-tab--group-expanding` marker removed. Idempotent.
     */
    private _cancelExpandAnimation(panelId: string): void {
        const entry = this._expandAnimations.get(panelId);
        if (!entry) {
            return;
        }
        this._expandAnimations.delete(panelId);
        entry.cleanup();
        entry.animation.cancel();
    }
}
