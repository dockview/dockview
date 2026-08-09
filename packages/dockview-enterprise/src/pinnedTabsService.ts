import {
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewMutableDisposable as MutableDisposable,
    DockviewGroupPanel,
    IDockviewPanel,
    createPinButton,
    defineModule,
    getPanelData,
    IPinnedTabsHost,
    IPinnedTabsService,
    LocalSelectionTransfer,
    PanelTransfer,
} from 'dockview';

/**
 * The pinned second row's window into its owner (the `PinnedTabsService`): the
 * component id a within-component drag payload carries, plus a way to flag a
 * drag as originating in the row so the pin-boundary resolver unpins a drag-out
 * regardless of the clamp/flip option.
 */
interface IPinnedRowDragHost {
    readonly viewId: string;
    beginRowDrag(panelId: string): void;
    endRowDrag(): void;
}

/**
 * The pinned second row (`mode: 'separate-row'`). Renders each pinned panel as
 * a lightweight tab in a strip mounted above the main tab bar via the core
 * `setPinnedRow` seam; the main strip hides its (still-present) pinned tabs via
 * CSS. Click a row tab to activate its panel; click its pin glyph to unpin
 * (which returns it to the main strip). The row collapses (unmounts) when the
 * group has no pinned panels.
 *
 * A row tab is draggable: dragging it left/right reorders the pinned block (the
 * within-row index is the strip index, since pinned tabs are the first N of the
 * strip). The row is also a drop target for the main strip's drag system:
 * dragging an unpinned tab of this group into the row pins it at the drop slot,
 * and dragging a row tab out into the main strip's unpinned region unpins it
 * (the row originates the same `PanelTransfer` the main tab does, so the main
 * strip's existing drop targets accept it). Cross-container pin/unpin reads the
 * shared drag payload via `getPanelData`, so it rides the HTML5 drag backend.
 * Custom tab renderers in the row are not yet supported; the row shows the
 * panel title only.
 */
class SecondRowController extends CompositeDisposable {
    private readonly _row: HTMLElement;
    private readonly _titleSubs = new MutableDisposable();
    /** panelId → its row tab element, for surgical active/title updates. */
    private readonly _tabEls = new Map<string, HTMLElement>();
    /** Signature of the currently-rendered pinned ids, in order. */
    private _renderedKey = '';
    private _mounted = false;
    /** Id of the row tab currently being dragged, or `undefined` when idle. */
    private _dragPanelId: string | undefined;
    /** A rebuild requested while a drag was in flight, replayed on dragend. */
    private _pendingRender = false;
    /** Row tab currently carrying a drop indicator, so it can be cleared. */
    private _indicatorEl: HTMLElement | undefined;

    constructor(
        private readonly group: DockviewGroupPanel,
        private readonly _dragHost: IPinnedRowDragHost
    ) {
        super();

        this._row = document.createElement('div');
        this._row.className = 'dv-pinned-row';

        const onClick = (event: MouseEvent) => {
            const tabEl = (event.target as HTMLElement).closest(
                '.dv-pinned-tab'
            ) as HTMLElement | null;
            if (!tabEl) {
                return;
            }
            const panel = this.group.model.panels.find(
                (p) => p.id === tabEl.dataset.panelId
            );
            if (!panel) {
                return;
            }
            if ((event.target as HTMLElement).closest('.dv-pinned-tab-unpin')) {
                panel.api.setPinned(false);
            } else {
                panel.api.setActive();
            }
        };
        this._row.addEventListener('click', onClick);

        const onDragStart = (event: DragEvent) => this._onDragStart(event);
        const onDragOver = (event: DragEvent) => this._onDragOver(event);
        const onDragLeave = (event: DragEvent) => this._onDragLeave(event);
        const onDrop = (event: DragEvent) => this._onDrop(event);
        const onDragEnd = () => this._endDrag();
        this._row.addEventListener('dragstart', onDragStart);
        this._row.addEventListener('dragover', onDragOver);
        this._row.addEventListener('dragleave', onDragLeave);
        this._row.addEventListener('drop', onDrop);
        this._row.addEventListener('dragend', onDragEnd);

        this.addDisposables(
            this._titleSubs,
            {
                dispose: () => {
                    this._row.removeEventListener('click', onClick);
                    this._row.removeEventListener('dragstart', onDragStart);
                    this._row.removeEventListener('dragover', onDragOver);
                    this._row.removeEventListener('dragleave', onDragLeave);
                    this._row.removeEventListener('drop', onDrop);
                    this._row.removeEventListener('dragend', onDragEnd);
                },
            },
            // A pinned panel can arrive by a cross-group move (no pin-change
            // event fires), so re-render on add as well as remove.
            this.group.model.onDidAddPanel(() => this.render()),
            this.group.model.onDidRemovePanel(() => this.render()),
            // Active changes are frequent (every tab click) but don't change the
            // pinned set, so flip the active class without rebuilding the row.
            this.group.model.onDidActivePanelChange(() => this._syncActive()),
            { dispose: () => this._unmount() }
        );

        this.render();
    }

    render(): void {
        // A rebuild mid-drag would destroy the element being dragged; defer it
        // and replay once the drag settles (see `_endDrag`).
        if (this._dragPanelId !== undefined) {
            this._pendingRender = true;
            return;
        }

        const pinned = this.group.model.panels.filter((p) => p.api.isPinned);
        // Join on the ASCII unit separator: a delimiter that cannot occur
        // in a panel id, so ids like 'a,b' can't collide with the
        // pair 'a','b' and silently skip a rebuild.
        const key = pinned.map((p) => p.id).join('\x1f');

        // Rebuild the DOM + title subscriptions only when the pinned set/order
        // actually changes; otherwise just re-sync the active class.
        if (key !== this._renderedKey) {
            this._renderedKey = key;
            this._tabEls.clear();
            this._row.replaceChildren(
                ...pinned.map((p) => {
                    const el = this._buildTab(p);
                    this._tabEls.set(p.id, el);
                    return el;
                })
            );
            this._titleSubs.value = new CompositeDisposable(
                ...pinned.map((p) =>
                    p.api.onDidTitleChange((e) =>
                        this._updateTitle(p.id, e.title)
                    )
                )
            );
        }

        this._syncActive();

        if (pinned.length > 0) {
            this._mount();
        } else {
            this._unmount();
        }
    }

    private _buildTab(panel: IDockviewPanel): HTMLElement {
        const el = document.createElement('div');
        el.className = 'dv-pinned-tab';
        el.draggable = true;
        el.dataset.panelId = panel.id;
        const title = panel.title ?? panel.id;
        el.title = title;

        const label = document.createElement('span');
        label.className = 'dv-pinned-tab-label';
        label.textContent = title;
        el.appendChild(label);

        const unpin = createPinButton();
        unpin.classList.add('dv-pinned-tab-unpin');
        el.appendChild(unpin);

        return el;
    }

    /** Flip the `--active` class to the group's active panel, no rebuild. */
    private _syncActive(): void {
        const activeId = this.group.model.activePanel?.id;
        for (const [id, el] of this._tabEls) {
            el.classList.toggle('dv-pinned-tab--active', id === activeId);
        }
    }

    /** Update one row tab's title in place, no rebuild. */
    private _updateTitle(panelId: string, title: string): void {
        const el = this._tabEls.get(panelId);
        if (!el) {
            return;
        }
        el.title = title;
        const label = el.querySelector('.dv-pinned-tab-label');
        if (label) {
            label.textContent = title;
        }
    }

    /** Row tab elements in their current (pinned) order. */
    private _rowTabs(): HTMLElement[] {
        return Array.from(
            this._row.querySelectorAll<HTMLElement>('.dv-pinned-tab')
        );
    }

    /** Horizontal midpoint (viewport x) of each row tab, in order. */
    private _tabMidpoints(tabs: HTMLElement[]): number[] {
        return tabs.map((el) => {
            const rect = el.getBoundingClientRect();
            return rect.left + rect.width / 2;
        });
    }

    private _onDragStart(event: DragEvent): void {
        const tabEl = (event.target as HTMLElement).closest(
            '.dv-pinned-tab'
        ) as HTMLElement | null;
        const panelId = tabEl?.dataset.panelId;
        if (!tabEl || panelId === undefined) {
            return;
        }
        this._dragPanelId = panelId;
        tabEl.classList.add('dv-pinned-tab--dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            // Some browsers (Firefox) require drag data for the drag to start.
            event.dataTransfer.setData('text/plain', panelId);
        }
        // Mirror the main tab's payload (same `viewId`/`groupId`/`panelId`) so
        // the main strip's drop targets accept a drag out of the row; a drop in
        // the unpinned region then unpins the panel via `resolveDropIndex`.
        LocalSelectionTransfer.getInstance<PanelTransfer>().setData(
            [new PanelTransfer(this._dragHost.viewId, this.group.id, panelId)],
            PanelTransfer.prototype
        );
        this._dragHost.beginRowDrag(panelId);
    }

    private _onDragOver(event: DragEvent): void {
        // A reorder originating in this row…
        if (this._dragPanelId !== undefined) {
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
            this._showIndicator(this._insertionSlot(event.clientX));
            return;
        }
        // …or a main-strip tab of this group dragged in to be pinned.
        if (this._incomingPinTarget()) {
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
            this._showIndicator(this._insertionSlot(event.clientX));
        }
    }

    private _onDragLeave(event: DragEvent): void {
        // Ignore moves between the row's own children.
        const related = event.relatedTarget as Node | null;
        if (related && this._row.contains(related)) {
            return;
        }
        // A within-row reorder keeps its state until drop/dragend; only clear
        // the transient indicator raised for an incoming (external) drag.
        if (this._dragPanelId === undefined) {
            this._clearIndicator();
        }
    }

    private _onDrop(event: DragEvent): void {
        // Within-row reorder.
        if (this._dragPanelId !== undefined) {
            event.preventDefault();
            const dragId = this._dragPanelId;
            const tabs = this._rowTabs();
            const fromIndex = tabs.findIndex(
                (el) => el.dataset.panelId === dragId
            );
            if (fromIndex !== -1) {
                const targetIndex = computePinnedRowDropIndex(
                    this._tabMidpoints(tabs),
                    event.clientX,
                    fromIndex
                );
                if (targetIndex !== fromIndex) {
                    const panel = this.group.model.panels.find(
                        (p) => p.id === dragId
                    );
                    // The within-row index is the strip index (pinned tabs are
                    // the first N of the strip); `skipSetActive` keeps a reorder
                    // from stealing activation. `enforceOrder` preserves this
                    // manual order, and `render()` reconciles the row on dragend.
                    panel?.api.moveTo({
                        index: targetIndex,
                        skipSetActive: true,
                    });
                }
            }
            this._endDrag();
            return;
        }

        // Pin-by-drag-in: a main-strip tab of this group dropped into the row.
        const incoming = this._incomingPinTarget();
        if (!incoming) {
            return;
        }
        event.preventDefault();
        // Slot in the pinned block the pointer landed on (0..pinnedCount),
        // computed against the pre-pin row before the block grows.
        const slot = this._insertionSlot(event.clientX);
        this._clearIndicator();
        // Pinning appends the panel to the pinned block (enforceOrder) and
        // re-renders the row; move it to the drop slot within the block.
        incoming.api.setPinned(true);
        const pinnedCount = this.group.model.panels.filter(
            (p) => p.api.isPinned
        ).length;
        incoming.api.moveTo({
            index: Math.min(slot, pinnedCount - 1),
            skipSetActive: true,
        });
    }

    /**
     * The panel a pin-by-drag-in drop would act on: the current drag payload,
     * when it names an unpinned panel that belongs to this group. `undefined`
     * for a row-internal drag, a cross-group drag, or an already-pinned panel.
     */
    private _incomingPinTarget(): IDockviewPanel | undefined {
        const data = getPanelData();
        if (data?.panelId == null || data.groupId !== this.group.id) {
            return undefined;
        }
        const panel = this.group.model.panels.find(
            (p) => p.id === data.panelId
        );
        if (!panel || panel.api.isPinned) {
            return undefined;
        }
        return panel;
    }

    /** Insertion slot (0..count) for a pointer at `pointerX`, where the drop
     *  indicator is drawn. */
    private _insertionSlot(pointerX: number): number {
        const midpoints = this._tabMidpoints(this._rowTabs());
        let slot = 0;
        for (const midpoint of midpoints) {
            if (pointerX > midpoint) {
                slot++;
            }
        }
        return slot;
    }

    private _showIndicator(slot: number): void {
        this._clearIndicator();
        const tabs = this._rowTabs();
        if (tabs.length === 0) {
            return;
        }
        if (slot < tabs.length) {
            const el = tabs[slot];
            el.classList.add('dv-pinned-tab--drop-before');
            this._indicatorEl = el;
        } else {
            const el = tabs[tabs.length - 1];
            el.classList.add('dv-pinned-tab--drop-after');
            this._indicatorEl = el;
        }
    }

    private _clearIndicator(): void {
        this._indicatorEl?.classList.remove(
            'dv-pinned-tab--drop-before',
            'dv-pinned-tab--drop-after'
        );
        this._indicatorEl = undefined;
    }

    /** Tear down drag state (drop or cancel) and reconcile the row. */
    private _endDrag(): void {
        if (this._dragPanelId === undefined) {
            return;
        }
        this._clearIndicator();
        this._tabEls
            .get(this._dragPanelId)
            ?.classList.remove('dv-pinned-tab--dragging');
        // Release the shared payload + row-drag flag raised on dragstart. The
        // main strip's drop handler already read them synchronously during any
        // drop, and a deferred unpin captured its panel directly.
        LocalSelectionTransfer.getInstance<PanelTransfer>().clearData(
            PanelTransfer.prototype
        );
        this._dragHost.endRowDrag();
        this._dragPanelId = undefined;
        // A move issued on drop reorders the strip (which may have requested a
        // render mid-drag); rebuild now so the row mirrors the new order.
        this._pendingRender = false;
        this.render();
    }

    private _mount(): void {
        if (this._mounted) {
            return;
        }
        this.group.model.header.setPinnedRow(this._row);
        this._mounted = true;
        // The header grew by a row, so reflow content for the new height.
        this.group.model.relayout();
    }

    private _unmount(): void {
        if (!this._mounted) {
            return;
        }
        this.group.model.header.setPinnedRow(undefined);
        this._mounted = false;
        this.group.model.relayout();
    }
}

/**
 * Compute the strip index a dragged pinned tab should move to when reordered
 * within the pinned row.
 *
 * `tabMidpoints` are the horizontal midpoints of the row tabs in their current
 * order; the insertion slot is the number of midpoints the pointer has passed.
 * Because `moveTo` pulls the dragged tab out before re-inserting it, a slot to
 * the right of its current position shifts left by one. Pure (no DOM), so the
 * geometry-free index math is unit testable (jsdom has no layout).
 *
 * @param tabMidpoints midpoint x of each pinned row tab, in order
 * @param pointerX     the drop pointer's x
 * @param fromIndex    the dragged tab's current index in the row
 */
export function computePinnedRowDropIndex(
    tabMidpoints: number[],
    pointerX: number,
    fromIndex: number
): number {
    let slot = 0;
    for (const midpoint of tabMidpoints) {
        if (pointerX > midpoint) {
            slot++;
        }
    }
    const target = slot > fromIndex ? slot - 1 : slot;
    const lastIndex = Math.max(0, tabMidpoints.length - 1);
    return Math.min(Math.max(target, 0), lastIndex);
}

/**
 * Compute the pinned-first tab order for a group.
 *
 * The invariant is: `[ pinned tabs (in pinned order) ][ unpinned tabs (in
 * their current relative order) ]`. Pinned tabs are ordered by their position
 * in `pinnedOrder` (the order they were pinned); a pinned id missing from
 * `pinnedOrder` sorts after the known ones while preserving its relative
 * position. Pure (no DOM, no side effects), so the ordering math is unit
 * testable in isolation from a live component.
 *
 * @param currentOrder panel ids in their current strip order
 * @param isPinned     predicate: is this panel id pinned?
 * @param pinnedOrder  canonical order of pinned ids
 */
export function computePinnedFirstOrder(
    currentOrder: string[],
    isPinned: (panelId: string) => boolean,
    pinnedOrder: string[]
): string[] {
    const rank = (id: string): number => {
        const i = pinnedOrder.indexOf(id);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };

    const pinned = currentOrder
        .filter((id) => isPinned(id))
        // stable sort by pinned rank; ties (both unknown) keep current order
        .map((id, index) => ({ id, index }))
        .sort((a, b) => rank(a.id) - rank(b.id) || a.index - b.index)
        .map((entry) => entry.id);

    const unpinned = currentOrder.filter((id) => !isPinned(id));

    return [...pinned, ...unpinned];
}

/**
 * Enforces the pinned-first invariant on each group's tab strip. Pinned state
 * itself lives on the panel (`panel.api.isPinned`, mutated through the gated
 * `DockviewComponent.setPanelPinned`); this service only reacts to
 * pinned-state changes and reorders the strip; it never mutates pinned state
 * (except the deliberate cross-boundary-drag flip) or re-implements the tab
 * list.
 *
 * Owns: pinned-first ordering, overflow exclusion, the reorder guard, and (in
 * `separate-row` mode) the pinned second row. Compact rendering + serialization
 * live in core, keyed off the panel's pinned state.
 */
export class PinnedTabsService
    implements IPinnedTabsService, IPinnedRowDragHost
{
    private readonly _host: IPinnedTabsHost;
    private readonly _disposable: CompositeDisposable;

    /** Panel id of an in-flight drag that originated in a pinned second row, so
     *  the pin-boundary resolver treats a drop-out as an unpin (see
     *  `resolveDropIndex`). `undefined` when no row drag is active. */
    private _rowDragPanelId: string | undefined;

    /** Flat set of pinned panel ids: the overflow-exclusion lookup. Panel ids
     *  are unique component-wide, so a single set serves every group. */
    private readonly _pinnedIds = new Set<string>();

    /** Live groups, tracked so a `fromJSON` restore can seed every strip. */
    private readonly _groups = new Set<DockviewGroupPanel>();

    /** Per-group pinned second row (only in `separate-row` mode). */
    private readonly _secondRows = new Map<
        DockviewGroupPanel,
        SecondRowController
    >();

    /** Re-entrancy guard: reordering moves panels, which must not re-trigger. */
    private _enforcing = false;

    private get _separateRow(): boolean {
        return (
            !!this._host.options.pinnedTabs?.enabled &&
            this._host.options.pinnedTabs?.mode === 'separate-row'
        );
    }

    /**
     * Sticky-on-scroll is an inline-mode enhancement (the pinned second row is
     * always visible, so it needs no sticky). On by default; opt out with
     * `pinnedTabs.stickyScroll: false`.
     */
    private get _inlineSticky(): boolean {
        const pinnedTabs = this._host.options.pinnedTabs;
        return (
            !!pinnedTabs?.enabled &&
            pinnedTabs.mode !== 'separate-row' &&
            pinnedTabs.stickyScroll !== false
        );
    }

    /** The owning component's id: the `viewId` a row-originated `PanelTransfer`
     *  carries so the main strip's drop targets accept a drag out of the row. */
    get viewId(): string {
        return this._host.id;
    }

    beginRowDrag(panelId: string): void {
        this._rowDragPanelId = panelId;
    }

    endRowDrag(): void {
        this._rowDragPanelId = undefined;
    }

    constructor(host: IPinnedTabsHost) {
        this._host = host;

        this._disposable = new CompositeDisposable(
            this._host.onDidPanelPinnedChange((event) => {
                const group = event.panel.api.group;

                if (event.isPinned) {
                    this._pinnedIds.add(event.panel.id);
                } else {
                    this._pinnedIds.delete(event.panel.id);
                }

                this.enforceOrder(group);
                // Refresh the dropdown so the pin takes effect immediately
                // rather than waiting for the next resize/observer fire.
                group.model.header.refreshOverflow();
                // Move the tab in/out of the pinned second row.
                this._secondRows.get(group)?.render();
            }),
            // Every group's tab strip consults the pinned predicate (overflow)
            // and the pin-boundary resolver (reorder guard).
            this._host.onDidAddGroup((group) => {
                this._groups.add(group);
                group.model.header.setOverflowExclude(
                    this.isExcludedFromOverflow
                );
                group.model.header.setDropIndexResolver((panelId, index) =>
                    this.resolveDropIndex(group, panelId, index)
                );
                if (this._separateRow) {
                    this._secondRows.set(
                        group,
                        new SecondRowController(group, this)
                    );
                } else if (this._inlineSticky) {
                    group.model.header.setPinnedSticky(true);
                }
            }),
            // Drop bookkeeping for groups that go away.
            this._host.onDidRemoveGroup((group) => {
                this._groups.delete(group);
                this._secondRows.get(group)?.dispose();
                this._secondRows.delete(group);
            }),
            // Drop a removed panel from the pinned set so its id can't leak
            // into the overflow-exclusion lookup (a close is not an unpin).
            this._host.onDidRemovePanel((panel) => {
                this._pinnedIds.delete(panel.id);
            }),
            // A restore populates panels' `isPinned` directly (not via the
            // gated setter), so seed the store from them and re-assert the
            // invariant once the layout is fully built.
            this._host.onDidLayoutFromJSON(() => {
                for (const group of this._groups) {
                    this._seedFromRestore(group);
                }
            }),
            // A runtime `updateOptions` can flip the mode (inline <-> separate
            // row) or toggle sticky. `onDidAddGroup` only reads the mode for
            // groups added afterwards, so retrofit the existing ones here.
            this._host.onDidOptionsChange(() => {
                for (const group of this._groups) {
                    this._reapplyMode(group);
                }
            })
        );
    }

    /** Re-apply the current pinned-tabs mode to an already-tracked group after
     *  a runtime option change: create or tear down its separate row and set
     *  inline sticky, then re-assert the pinned-first order and overflow so the
     *  main strip stays consistent. Idempotent, so a no-op change costs nothing
     *  visible. */
    private _reapplyMode(group: DockviewGroupPanel): void {
        if (this._separateRow) {
            let row = this._secondRows.get(group);
            if (!row) {
                row = new SecondRowController(group, this);
                this._secondRows.set(group, row);
            }
            group.model.header.setPinnedSticky(false);
            row.render();
        } else {
            const row = this._secondRows.get(group);
            if (row) {
                row.dispose();
                this._secondRows.delete(group);
            }
            group.model.header.setPinnedSticky(this._inlineSticky);
        }
        this.enforceOrder(group);
        group.model.header.refreshOverflow();
    }

    /** Seed the pinned set from a restored group's panels (already in
     *  pinned-first strip order) and re-assert the invariant + overflow. */
    private _seedFromRestore(group: DockviewGroupPanel): void {
        for (const panel of group.model.panels) {
            if (panel.api.isPinned) {
                this._pinnedIds.add(panel.id);
            }
        }
        this.enforceOrder(group);
        group.model.header.refreshOverflow();
        this._secondRows.get(group)?.render();
    }

    /**
     * Keep a panel's tab out of the overflow dropdown when it is pinned. A pure
     * `Set.has` lookup (no DOM reads) so it is safe to call from the overflow
     * filter, which re-fires on every resize. Returns `false` while the feature
     * is dormant.
     */
    readonly isExcludedFromOverflow = (panelId: string): boolean => {
        if (!this._host.options.pinnedTabs?.enabled) {
            return false;
        }
        return this._pinnedIds.has(panelId);
    };

    /**
     * Keep a header drop on the correct side of the pin boundary. By default a
     * cross-boundary drop is **clamped** back (Chrome-style). Opt in to
     * flipping the dragged panel's pinned state with
     * `togglePinOnCrossBoundaryDrag: true` (VS-Code-style). The flip is
     * deferred to a microtask so it runs after the in-progress move settles,
     * then the pinned-change handler re-orders the strip.
     *
     * The boundary is the pinned count *excluding the dragged panel* (it is
     * removed and re-inserted during the move, so the index is post-removal).
     */
    resolveDropIndex(
        group: DockviewGroupPanel,
        panelId: string,
        index: number
    ): number {
        if (!this._host.options.pinnedTabs?.enabled) {
            return index;
        }

        const dragged = group.model.panels.find((p) => p.id === panelId);
        if (!dragged) {
            // Cross-group drop: the boundary is enforced within a group only.
            return index;
        }

        let boundary = 0;
        for (const panel of group.model.panels) {
            if (panel.id !== panelId && panel.api.isPinned) {
                boundary++;
            }
        }

        // Default: clamp (Chrome-style, dragging across the boundary is
        // refused). Opt in to flipping the pinned state with
        // `togglePinOnCrossBoundaryDrag: true` (VS-Code-style). A drag that
        // originated in the pinned second row always flips: the row is the only
        // handle on a pinned tab in `separate-row` mode (its main-strip copy is
        // hidden), so dragging it out is a deliberate unpin regardless of the
        // clamp option.
        const flip =
            this._host.options.pinnedTabs?.togglePinOnCrossBoundaryDrag ===
                true || panelId === this._rowDragPanelId;

        if (dragged.api.isPinned) {
            // A pinned tab may land anywhere in [0, boundary].
            if (index <= boundary) {
                return index;
            }
            if (flip) {
                queueMicrotask(() => dragged.api.setPinned(false));
                return index;
            }
            return boundary;
        }

        // An unpinned tab may land anywhere in [boundary, end].
        if (index >= boundary) {
            return index;
        }
        if (flip) {
            queueMicrotask(() => dragged.api.setPinned(true));
            return index;
        }
        return boundary;
    }

    /**
     * Re-assert the pinned-first invariant on `group`'s tab strip by moving
     * panels into the computed order. A no-op while the feature is dormant
     * (`pinnedTabs.enabled` unset) or while a reorder is already in flight.
     */
    enforceOrder(group: DockviewGroupPanel): void {
        if (!this._host.options.pinnedTabs?.enabled || this._enforcing) {
            return;
        }

        const panels = group.model.panels;
        const currentOrder = panels.map((panel) => panel.id);
        const byId = new Map(panels.map((panel) => [panel.id, panel]));

        // Pinned order follows the current strip order (empty canonical order),
        // so a manual drag-reorder within the pinned block is preserved and a
        // newly-pinned tab appends to the block; only the pinned-first partition
        // is enforced.
        const target = computePinnedFirstOrder(
            currentOrder,
            (id) => byId.get(id)?.api.isPinned ?? false,
            []
        );

        // Already correct, so avoid a needless move storm (and active flicker).
        if (target.every((id, index) => currentOrder[index] === id)) {
            return;
        }

        this._enforcing = true;
        try {
            // Preserve the active panel: an in-strip move removes + re-opens
            // the panel, which reassigns active when the moved panel was the
            // active one.
            const active = group.model.activePanel;

            // Track the live order in a local array (updated to mirror each
            // move) so we can skip in-place panels without re-scanning the
            // shifting model, which keeps the loop O(n) rather than O(n^2).
            const live = [...currentOrder];
            for (let index = 0; index < target.length; index++) {
                const id = target[index];
                if (live[index] === id) {
                    continue;
                }
                const from = live.indexOf(id, index);
                if (from === -1) {
                    continue;
                }
                live.splice(from, 1);
                live.splice(index, 0, id);
                byId.get(id)?.api.moveTo({ index, skipSetActive: true });
            }

            if (active && group.model.activePanel !== active) {
                active.api.setActive();
            }
        } finally {
            this._enforcing = false;
        }
    }

    dispose(): void {
        this._disposable.dispose();
        for (const controller of this._secondRows.values()) {
            controller.dispose();
        }
        this._secondRows.clear();
        this._pinnedIds.clear();
        this._groups.clear();
    }
}

export const PinnedTabsModule = defineModule<
    'pinnedTabsService',
    IPinnedTabsHost
>({
    name: 'PinnedTabs',
    options: ['pinnedTabs'],
    serviceKey: 'pinnedTabsService',
    // ContextMenuModule is an optional enhancer (it adds the Pin/Unpin menu
    // item only when present), not a hard dependency, so it is intentionally
    // not listed here.
    dependsOn: [],
    create: (host) => new PinnedTabsService(host),
});
