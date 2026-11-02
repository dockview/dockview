import {
    parseCssTimeMs,
    prefersReducedMotion,
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

// Keep in sync with the `var(--dv-transition-duration, 200ms)` fallbacks in tabs.scss.
const DEFAULT_TRANSITION_MS = 200;
const EXPAND_FALLBACK_SLACK_MS = 100;

interface CollapseAnimationEntry {
    animation: Animation;
    el: HTMLElement;
    // Not read from `animation.playbackRate`: `reverse()` is a pending change,
    // so the getter reports the old direction until the animation is ready.
    collapsing: boolean;
}

interface TabTarget {
    el: HTMLElement;
    pid: string;
}

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
    /** In-flight WAAPI collapses (forward or reversed), keyed by panel id. */
    private readonly _collapseAnimations = new Map<
        string,
        CollapseAnimationEntry
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

    /** Each chip's extent along the strip's main axis: width for a horizontal
     *  header, height for a vertical one. */
    snapshotChipSizes(): Map<string, number> {
        const isVertical = this._ctx.getDirection() === 'vertical';
        const sizes = new Map<string, number>();
        for (const [groupId, entry] of this._chipRenderers) {
            const rect = entry.chip.element.getBoundingClientRect();
            sizes.set(groupId, isVertical ? rect.height : rect.width);
        }
        return sizes;
    }

    positionUnderlines(): void {
        this._indicator?.positionUnderlines();
    }

    trackUnderlines(durationMs?: number): void {
        this._indicator?.trackUnderlines(durationMs);
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
        this._cancelCollapseAnimation(panelId);
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

        for (const panelId of this._collapseAnimations.keys()) {
            this._cancelCollapseAnimation(panelId);
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

        // Resolved at most once per pass, and only when something animates.
        let durationMs: number | undefined;
        const getDurationMs = () =>
            (durationMs ??= this._transitionDurationMs(this._ctx.tabsList));

        for (const tabEntry of tabs) {
            const tab = tabEntry.value;
            const tg = panelGroupMap.get(tab.panel.id);
            if (tg) {
                hasAnimation =
                    this._syncGroupedTab(tab, tg, getDurationMs) ||
                    hasAnimation;
            } else {
                this._syncUngroupedTab(tab);
            }
        }

        const activeGroupIds = new Set<string>();

        // Handle collapse animation per group
        for (const tg of tabGroups) {
            activeGroupIds.add(tg.id);
            hasAnimation =
                this._collapseGroup(tg, tabMap, getDurationMs) || hasAnimation;
        }

        this._skipNextCollapseAnimation = false;

        this._ensureIndicator();
        if (this._indicator) {
            this._indicator.syncUnderlineElements(activeGroupIds);
            if (hasAnimation) {
                this._indicator.trackUnderlines(
                    getDurationMs() + EXPAND_FALLBACK_SLACK_MS
                );
            } else {
                this._indicator.positionUnderlines();
            }
        }
    }

    /** Returns whether an animation is now in flight for the tab. */
    private _syncGroupedTab(
        tab: Tab,
        tg: ITabGroup,
        getDurationMs: () => number
    ): boolean {
        const panelId = tab.panel.id;
        const ids = tg.panelIds;
        toggleClass(tab.element, 'dv-tab--grouped', true);
        toggleClass(tab.element, 'dv-tab--group-first', ids[0] === panelId);
        toggleClass(
            tab.element,
            'dv-tab--group-last',
            ids[ids.length - 1] === panelId
        );

        // Expose the resolved group color as a CSS custom property
        // so pure-CSS themes can use it for borders, backgrounds, etc.
        applyTabGroupAccent(
            tab.element,
            tg.color,
            this._ctx.accessor.tabGroupColorPalette
        );

        if (tg.collapsed || !this._isCollapsing(tab.element, panelId)) {
            return false;
        }

        const inFlight = this._inFlightCollapse(tab.element, panelId);
        if (inFlight) {
            // Mid-collapse: play it backwards rather than swapping classes.
            this._setCollapseDirection(inFlight, false);
        } else {
            this._expandTab(tab.element, panelId, getDurationMs());
        }
        return true;
    }

    private _syncUngroupedTab(tab: Tab): void {
        toggleClass(tab.element, 'dv-tab--grouped', false);
        toggleClass(tab.element, 'dv-tab--group-first', false);
        toggleClass(tab.element, 'dv-tab--group-last', false);
        this._cancelCollapseAnimation(tab.panel.id);
        tab.element.classList.remove(
            'dv-tab--group-collapsed',
            'dv-tab--group-expanding'
        );
        tab.element.style.removeProperty('width');
        tab.element.style.removeProperty('height');
        tab.element.style.removeProperty('--dv-tab-group-color');
    }

    /** Expand a tab collapsed at rest via the CSS transition. */
    private _expandTab(
        el: HTMLElement,
        panelId: string,
        durationMs: number
    ): void {
        el.classList.remove('dv-tab--group-collapsed');
        el.classList.add('dv-tab--group-expanding');

        this._pendingTransitionCleanups.get(panelId)?.();

        const onEnd = () => {
            el.classList.remove('dv-tab--group-expanding');
            el.style.removeProperty('width');
            el.style.removeProperty('height');
            el.removeEventListener('transitionend', onEnd);
            clearTimeout(fallbackTimer);
            this._pendingTransitionCleanups.delete(panelId);
        };
        // In case transitionend never fires (e.g. element removed mid-transition).
        const fallbackTimer = setTimeout(
            onEnd,
            durationMs + EXPAND_FALLBACK_SLACK_MS
        );
        this._pendingTransitionCleanups.set(panelId, onEnd);
        el.addEventListener('transitionend', onEnd);
    }

    /** Returns whether an animation was started. */
    private _collapseGroup(
        tg: ITabGroup,
        tabMap: ReadonlyMap<string, IValueDisposable<Tab>>,
        getDurationMs: () => number
    ): boolean {
        if (!tg.collapsed) {
            return false;
        }
        const toCollapse: TabTarget[] = [];
        for (const pid of tg.panelIds) {
            const te = tabMap.get(pid);
            if (te && !this._isCollapsing(te.value.element, pid)) {
                toCollapse.push({ el: te.value.element, pid });
            }
        }
        if (toCollapse.length === 0) {
            return false;
        }

        if (this._skipNextCollapseAnimation) {
            this._applyCollapsedInstantly(toCollapse);
            return false;
        }
        return this._animateTabCollapse(
            toCollapse,
            this._ctx.getDirection() === 'vertical',
            getDurationMs
        );
    }

    /**
     * Apply the resting class with its CSS transition suppressed, committed
     * by a single reflow.
     */
    private _applyCollapsedInstantly(tabs: readonly TabTarget[]): void {
        for (const { el, pid } of tabs) {
            this._cancelCollapseAnimation(pid);
            el.style.transition = 'none';
            el.classList.add('dv-tab--group-collapsed');
        }
        tabs[0].el.getBoundingClientRect(); // single reflow for the batch
        for (const { el } of tabs) {
            el.style.removeProperty('transition');
        }
    }

    /** Collapsed at rest, or playing a forward collapse. */
    private _isCollapsing(el: HTMLElement, panelId: string): boolean {
        if (el.classList.contains('dv-tab--group-collapsed')) {
            return true;
        }
        return this._inFlightCollapse(el, panelId)?.collapsing === true;
    }

    /**
     * The running collapse for `el`, if any. An entry left by a previous
     * element under the same panel id (tab re-created by a group move) is
     * stale and gets cancelled.
     */
    private _inFlightCollapse(
        el: HTMLElement,
        panelId: string
    ): CollapseAnimationEntry | undefined {
        const entry = this._collapseAnimations.get(panelId);
        if (!entry) {
            return undefined;
        }
        if (entry.el !== el) {
            this._cancelCollapseAnimation(panelId);
            return undefined;
        }
        return entry;
    }

    private _setCollapseDirection(
        entry: CollapseAnimationEntry,
        collapsing: boolean
    ): void {
        if (entry.collapsing !== collapsing) {
            entry.collapsing = collapsing;
            entry.animation.reverse();
        }
    }

    /**
     * `--dv-transition-duration` in ms, or the default when unset (as in every
     * shipped theme) or non-literal. Don't fall back to the element's own
     * `transition-duration`: a tab at rest declares none and reads `0s`.
     */
    private _transitionDurationMs(
        el: HTMLElement,
        computed:
            | CSSStyleDeclaration
            | undefined = el.ownerDocument.defaultView?.getComputedStyle(el)
    ): number {
        if (!computed) {
            return DEFAULT_TRANSITION_MS;
        }
        return parseCssTimeMs(
            computed.getPropertyValue('--dv-transition-duration'),
            DEFAULT_TRANSITION_MS
        );
    }

    /**
     * Animate the tabs of one group to the collapsed state with WAAPI.
     * Returns whether an animation is in flight (false on the instant paths).
     *
     * `.dv-tab--group-collapsed` is `!important`, which outranks animation
     * keyframes, so it is only applied once the animation settles; meanwhile
     * the tab wears `--group-collapsing` and the animation's `fill: 'both'`
     * holds the end frame across the swap.
     */
    private _animateTabCollapse(
        tabs: readonly TabTarget[],
        isVert: boolean,
        getDurationMs: () => number
    ): boolean {
        const first = tabs[0].el;
        const win = first.ownerDocument.defaultView;

        if (
            prefersReducedMotion(first.ownerDocument) ||
            typeof first.animate !== 'function'
        ) {
            for (const { pid } of tabs) {
                this._pendingTransitionCleanups.get(pid)?.();
            }
            this._applyCollapsedInstantly(tabs);
            return false;
        }

        const fresh: TabTarget[] = [];
        for (const tab of tabs) {
            const reversing = this._inFlightCollapse(tab.el, tab.pid);
            if (reversing) {
                this._setCollapseDirection(reversing, true);
            } else {
                fresh.push(tab);
            }
        }
        if (fresh.length === 0) {
            return true;
        }

        // Read everything before any write (one layout per group), including
        // before the expand cleanups below, so a tab still mid-expand is
        // measured at its current size.
        const frames = fresh.map(({ el }) => {
            const computed = win?.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
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
            if (isVert) {
                from.height = `${rect.height}px`;
                to.height = '0px';
            } else {
                from.width = `${rect.width}px`;
                to.width = '0px';
            }
            return { computed, from, to };
        });
        const duration = getDurationMs();

        for (const { pid } of fresh) {
            this._pendingTransitionCleanups.get(pid)?.();
        }
        fresh.forEach(({ el, pid }, i) => {
            // No inline `transition: none` needed: `--group-collapsing` has no
            // transition and the swap below changes no animated value.
            el.classList.add('dv-tab--group-collapsing');

            const animation = el.animate([frames[i].from, frames[i].to], {
                duration,
                easing: 'ease-out',
                fill: 'both',
            });
            const entry = { animation, el, collapsing: true };
            this._collapseAnimations.set(pid, entry);

            animation.onfinish = () => {
                if (this._collapseAnimations.get(pid) !== entry) {
                    return;
                }
                this._collapseAnimations.delete(pid);
                if (entry.collapsing) {
                    el.classList.add('dv-tab--group-collapsed');
                }
                el.classList.remove('dv-tab--group-collapsing');
                animation.cancel();
            };
        });
        return true;
    }

    /** Leaves the tab governed by its classes alone. */
    private _cancelCollapseAnimation(panelId: string): void {
        const entry = this._collapseAnimations.get(panelId);
        if (!entry) {
            return;
        }
        this._collapseAnimations.delete(panelId);
        entry.animation.onfinish = null;
        entry.animation.cancel();
        entry.el.classList.remove('dv-tab--group-collapsing');
    }
}
