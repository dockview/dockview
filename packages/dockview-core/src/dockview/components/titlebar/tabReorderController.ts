import { getPanelData, PanelTransfer } from '../../../dnd/dataTransfer';
import { toggleClass } from '../../../dom';
import { CompositeDisposable, IValueDisposable } from '../../../lifecycle';
import { DockviewComponent } from '../../dockviewComponent';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import {
    DockviewHeaderDirection,
    OVERFLOW_WRAP_TABS_CLASS,
} from '../../options';
import { Tab } from '../tab/tab';
import { TabDropIndexEvent } from './tabsContainer';
import { TabGroupManager } from './tabGroups';
import { ITabGroup } from '../../tabGroup';

export interface TabAnimationState {
    sourceTabId: string;
    sourceIndex: number;
    tabPositions: Map<string, DOMRect>;
    /** Group-chip widths keyed by group ID, captured before collapse */
    chipPositions: Map<string, number>;
    currentInsertionIndex: number | null;
    targetTabGroupId: string | null;
    /** When set, the drag source is a group chip (entire group drag) */
    sourceTabGroupId: string | null;
    /** Cached panel IDs of the source group (avoids repeated lookups during drag) */
    sourceGroupPanelIds: Set<string> | null;
    /** Width of the group chip, captured before collapse */
    sourceChipWidth: number;
    /** Distance from cursor to the left edge of the drag image */
    cursorOffsetFromDragLeft: number;
    /** Total width of the dragged content (chip + tabs for groups, tab width for singles) */
    sourceGapWidth: number;
    /** Left edge of the tabs container at drag start */
    containerLeft: number;
}

/**
 * Narrow view of {@link Tabs} required by {@link TabReorderController}. The
 * controller owns the tab drag-reorder + animation subsystem; everything it
 * needs to reach back into the owning `Tabs` instance is funnelled through
 * this interface so the boundary stays explicit.
 */
/** A wrapped drop candidate: a tab's list index and its live bounding rect. */
interface WrappedTabEntry {
    index: number;
    rect: DOMRect;
}

/** A run of wrapped tabs on one line (row or column), with its cross-axis span. */
interface WrappedLine {
    start: number;
    end: number;
    items: WrappedTabEntry[];
}

export interface ITabReorderHost {
    /** Live tab list (the `_tabs` array of the owning `Tabs`). */
    readonly tabItems: IValueDisposable<Tab>[];
    /** Panel-id → tab lookup (the `_tabMap` of the owning `Tabs`). */
    readonly tabMap: Map<string, IValueDisposable<Tab>>;
    /** The scrollable tab strip element (`.dv-tabs-container`). */
    readonly tabsList: HTMLElement;
    readonly direction: DockviewHeaderDirection;
    readonly groupPanel: DockviewGroupPanel;
    readonly component: DockviewComponent;
    readonly tabGroupManager: TabGroupManager;
    /** Fire the owning `Tabs`' drop event. */
    fireDrop(event: TabDropIndexEvent): void;
}

/**
 * Tab drag-reorder + FLIP animation subsystem extracted from `Tabs`. The DOM
 * event wiring remains in `Tabs` and delegates the reorder/animation logic to
 * this controller. All access back into `Tabs` goes through
 * {@link ITabReorderHost}.
 */
export class TabReorderController extends CompositeDisposable {
    private _animState: TabAnimationState | null = null;
    private readonly _pendingMarginCleanups = new Map<
        HTMLElement,
        () => void
    >();
    private _pendingCollapse = false;
    private _flipTransitionCleanup: (() => void) | null = null;
    private _voidContainer: HTMLElement | null = null;
    private _extendedDropZone: HTMLElement | null = null;
    private _pointerInsideTabsList = false;
    /** The tab element currently carrying a wrap-mode drop indicator, if any. */
    private _wrapIndicatorEl: HTMLElement | null = null;

    // Field-name mirrors so the extracted method bodies can stay verbatim.
    private get _tabs(): IValueDisposable<Tab>[] {
        return this.host.tabItems;
    }
    private get _tabMap(): Map<string, IValueDisposable<Tab>> {
        return this.host.tabMap;
    }
    private get _tabsList(): HTMLElement {
        return this.host.tabsList;
    }
    private get _direction(): DockviewHeaderDirection {
        return this.host.direction;
    }
    private get group(): DockviewGroupPanel {
        return this.host.groupPanel;
    }
    private get accessor(): DockviewComponent {
        return this.host.component;
    }
    private get _tabGroupManager(): TabGroupManager {
        return this.host.tabGroupManager;
    }

    /** Whether the tab strip is in multi-row wrap layout
     *  (`MultiRowTabsModule`, `overflow.mode: 'wrap'`). In wrap, the 1-D
     *  gap/FLIP animation is suppressed and reorder uses a 2-D hit-test. */
    private get _wrapMode(): boolean {
        return this._tabsList.classList.contains(OVERFLOW_WRAP_TABS_CLASS);
    }

    get animState(): TabAnimationState | null {
        return this._animState;
    }

    set animState(value: TabAnimationState | null) {
        this._animState = value;
    }

    get pendingCollapse(): boolean {
        return this._pendingCollapse;
    }

    set pendingCollapse(value: boolean) {
        this._pendingCollapse = value;
    }

    set voidContainerElement(el: HTMLElement | null) {
        this._voidContainer = el;
    }

    constructor(private readonly host: ITabReorderHost) {
        super();

        this.addDisposables({
            dispose: () => {
                this._flipTransitionCleanup?.();
            },
        });
    }

    setExtendedDropZone(el: HTMLElement): void {
        this._extendedDropZone = el;
    }

    /**
     * Allows external elements (e.g. void container, left actions) to push an
     * insertion index into the animation while the cursor is outside the tabs
     * list itself.  Pass `null` to clear the indicator.
     */
    setExternalInsertionIndex(index: number | null): void {
        if (!this._animState) {
            return;
        }
        if (index === this._animState.currentInsertionIndex) {
            return;
        }
        this._animState.currentInsertionIndex = index;
        this.applyDragOverTransforms();
    }

    /**
     * Called when the drag cursor leaves the entire header area (not just the
     * tabs list).  Clears animation state for cross-group drags, which never
     * receive a `dragend` event on this tab list.
     */
    clearExternalAnimState(): void {
        if (!this._animState) {
            return;
        }
        this.resetTabTransforms();
        if (this._animState.sourceIndex === -1) {
            this._animState = null;
        } else {
            this._animState.currentInsertionIndex = null;
        }
    }

    snapshotTabPositions(): Map<string, DOMRect> {
        const positions = new Map<string, DOMRect>();
        for (const tab of this._tabs) {
            positions.set(
                tab.value.panel.id,
                tab.value.element.getBoundingClientRect()
            );
        }
        return positions;
    }

    private getAverageTabWidth(): number {
        if (this._tabs.length === 0) {
            return 0;
        }
        const isVertical = this._direction === 'vertical';
        let total = 0;
        for (const tab of this._tabs) {
            const rect = tab.value.element.getBoundingClientRect();
            total += isVertical ? rect.height : rect.width;
        }
        return total / this._tabs.length;
    }

    /**
     * Pointer-event entry point. The HTML5 path enters via the per-element
     * `dragover` listener; this one hit-tests the global pointer-drag
     * position against the tabs list and routes through the same shared
     * `processDragOver` / `processDragLeave` helpers.
     */
    handlePointerDragMove(clientX: number, clientY: number): void {
        const sourceDoc = this._tabsList.ownerDocument ?? document;
        const elAtPoint = sourceDoc.elementFromPoint(clientX, clientY);
        const inside =
            !!elAtPoint &&
            (this._tabsList.contains(elAtPoint) ||
                (!!this._extendedDropZone &&
                    this._extendedDropZone.contains(elAtPoint)));

        if (!inside) {
            if (this._pointerInsideTabsList) {
                this._pointerInsideTabsList = false;
                this.processDragLeave(elAtPoint);
            }
            return;
        }

        this._pointerInsideTabsList = true;
        this.processDragOver(clientX, clientY);
    }

    /**
     * Pointer-side cleanup hook: when any pointer drag ends, reset the
     * inside-strip flag and tear down any smooth-reorder anim state the
     * dragover bridge may have installed.
     */
    handlePointerDragEnd(e?: {
        clientX: number;
        clientY: number;
        pointerEvent: PointerEvent;
    }): void {
        // Smooth-mode intra-group reorder: the pointer-backend analog of the
        // HTML5 tabs-list `drop` commit. In smooth mode the per-tab pointer
        // drop target doesn't latch a drop state for the intra-group drag, so
        // its `onDrop` never fires; commit the reorder from the computed
        // insertion index when the drag ends over the strip. This covers both
        // single-row and multi-row wrap layouts (single-row previously had no
        // pointer commit path at all, so the tab snapped back on release). It
        // can't double-commit: `tab.onDrop` nulls `_animState` before this runs
        // (the backend calls `handleDrop` before `onDragEnd`), so if the per-tab
        // path *did* fire, `_animState` is already null and this is skipped; in
        // default (non-smooth) mode `_animState` is never set for an intra-group
        // drag, so this path is inert there too.
        if (
            e &&
            this._animState &&
            // intra-group single-tab reorder only: `sourceIndex === -1` is a
            // cross-group drag (handled by the cross-group machinery), and
            // `sourceTabGroupId` is a group-chip drag (handled by the chip drop
            // target, which does not null `_animState`, so committing here too
            // would double-commit).
            this._animState.sourceIndex !== -1 &&
            !this._animState.sourceTabGroupId &&
            this._animState.currentInsertionIndex !== null &&
            this.isPointInsideTabsList(e.clientX, e.clientY)
        ) {
            this.commitPointerReorder(e.pointerEvent);
        }
        this._pointerInsideTabsList = false;
        this.resetDragAnimation();
    }

    private isPointInsideTabsList(clientX: number, clientY: number): boolean {
        const doc = this._tabsList.ownerDocument ?? document;
        const el = doc.elementFromPoint(clientX, clientY);
        return !!el && this._tabsList.contains(el);
    }

    /** Commit a smooth-mode intra-group reorder from the current insertion
     *  index (adjusted for the source's own position), then clear drag state.
     *  Used by the pointer backend for both single-row and wrap layouts. */
    private commitPointerReorder(event: PointerEvent): void {
        const animState = this._animState;
        if (animState?.currentInsertionIndex == null) {
            return;
        }
        const insertionIndex = animState.currentInsertionIndex;
        const sourceIndex = animState.sourceIndex;
        const adjustedIndex =
            insertionIndex -
            (sourceIndex !== -1 && sourceIndex < insertionIndex ? 1 : 0);

        this._animState = null;
        this.clearWrapDropIndicator();
        this.uncollapseSourceTab(animState.sourceTabId);

        if (adjustedIndex === sourceIndex) {
            return;
        }
        this.host.fireDrop({
            event,
            index: adjustedIndex,
            targetTabGroupId: null,
        });
    }

    /**
     * Shared body of the dragover entry point. Refreshes stale anim state
     * for a changed drag identity, initializes anim state for incoming
     * cross-group drags, and dispatches to the gap-following math in
     * `handleDragOver`. Returns true when this tabs list has taken
     * ownership of the drag; HTML5 callers use this to gate
     * `event.preventDefault()`.
     */
    processDragOver(clientX: number, clientY?: number): boolean {
        if (this.accessor.options.disableDnd) {
            return false;
        }

        // Stale-state guard: if a previous drag's anim state is still here
        // but the current drag is a different identity, drop the stale one
        // so the new drag starts from a clean slate.
        this._dropStaleAnimState();

        if (!this._animState && !this._initAnimStateForExternalDrag()) {
            return false;
        }

        // For intra-group drag (sourceIndex >= 0) the gap animation is the
        // sole visual indicator, so clear any stale anchor overlay that may
        // have been set while the cursor was over the panel content area or
        // another zone. External drags (sourceIndex === -1) leave the
        // overlay to the individual tab Droptargets so cross-group
        // animation is not disrupted.
        if (this._animState!.sourceIndex !== -1) {
            this.group.model.dropTargetContainer?.model?.clear();
        }
        this.handleDragOver({ clientX, clientY });
        return true;
    }

    /**
     * If a previous drag's anim state lingers but the current drag is a
     * different cross-group chip identity, drop the stale state so the new drag
     * starts clean.
     */
    private _dropStaleAnimState(): void {
        if (!this._animState) {
            return;
        }
        const data = getPanelData();
        if (
            data?.tabGroupId &&
            data.groupId !== this.group.id &&
            this._animState.sourceTabGroupId !== data.tabGroupId
        ) {
            this._animState = null;
        }
    }

    /**
     * Create the anim state for an external (cross-group) tab or chip drag.
     * Returns `true` when state was created, `false` when this drag should not
     * be handled at the tabs-list level.
     */
    private _initAnimStateForExternalDrag(): boolean {
        const data = getPanelData();
        // In default animation mode, individual tab drops are handled by per-tab
        // Droptargets; only chip drags need tabs-list-level handling so drops on
        // void space still work.
        if (
            this.accessor.options.theme?.tabAnimation === 'default' &&
            !data?.tabGroupId
        ) {
            return false;
        }
        if (
            !data ||
            !(data.panelId || data.tabGroupId) ||
            data.groupId === this.group.id
        ) {
            return false;
        }
        const avgWidth = this.getAverageTabWidth();
        this._animState = data.tabGroupId
            ? this._makeGroupDragAnimState(data, avgWidth)
            : this._makeTabDragAnimState(data, avgWidth);
        return true;
    }

    /** Anim state for an external group-chip drag (gap sized to the group). */
    private _makeGroupDragAnimState(
        data: PanelTransfer,
        avgWidth: number
    ): TabAnimationState {
        // External group drag: look up the source group to size the gap.
        const sourceGroup = this.accessor.getPanel(data.groupId);
        const sourceTg = sourceGroup?.model
            .getTabGroups()
            .find((tg) => tg.id === data.tabGroupId);
        const panelCount = sourceTg?.panelIds.length ?? 1;
        const groupGapWidth = avgWidth * panelCount + avgWidth;
        return {
            sourceTabId: '',
            sourceIndex: -1,
            tabPositions: this.snapshotTabPositions(),
            chipPositions: this._tabGroupManager.snapshotChipWidths(),
            currentInsertionIndex: null,
            targetTabGroupId: null,
            sourceTabGroupId: data.tabGroupId!,
            sourceGroupPanelIds: sourceTg
                ? new Set(sourceTg.panelIds)
                : new Set<string>(),
            sourceChipWidth: avgWidth,
            cursorOffsetFromDragLeft: groupGapWidth / 2,
            sourceGapWidth: groupGapWidth,
            containerLeft: this._tabsList.getBoundingClientRect().left,
        };
    }

    /** Anim state for an external single-tab drag. */
    private _makeTabDragAnimState(
        data: PanelTransfer,
        avgWidth: number
    ): TabAnimationState {
        return {
            sourceTabId: data.panelId!,
            sourceIndex: -1,
            tabPositions: this.snapshotTabPositions(),
            chipPositions: this._tabGroupManager.snapshotChipWidths(),
            currentInsertionIndex: null,
            targetTabGroupId: null,
            sourceTabGroupId: null,
            sourceGroupPanelIds: null,
            sourceChipWidth: 0,
            cursorOffsetFromDragLeft: avgWidth / 2,
            sourceGapWidth: avgWidth,
            containerLeft: this._tabsList.getBoundingClientRect().left,
        };
    }

    /**
     * Shared body of the dragleave entry point. Preserves anim state when
     * the drag moves between tabs-list children, into the extended drop
     * zone, or into the void container; tears it down otherwise.
     */
    processDragLeave(related: Element | null): void {
        if (!this._animState) {
            return;
        }
        // Moves between children of the tabs list aren't real leaves.
        if (related && this._tabsList.contains(related)) {
            return;
        }
        // Moving into the broader drop zone (e.g. void container, left
        // actions): keep anim state alive so external listeners can
        // continue the gap animation.
        if (related && this._extendedDropZone?.contains(related)) {
            this.resetTabTransforms();
            this._animState.currentInsertionIndex = null;
            return;
        }
        // Leaving toward the void container (empty header space to the
        // right): keep anim state so a drop can still land at the end.
        const isVoid =
            this._voidContainer &&
            related &&
            (related === this._voidContainer ||
                this._voidContainer.contains(related));
        if (isVoid) {
            return;
        }
        this.resetTabTransforms();
        if (this._animState.sourceIndex === -1) {
            this.clearHeaderAnchorOverlay();
            this._animState = null;
        } else {
            this._animState.currentInsertionIndex = null;
        }
    }

    /**
     * Clear the anchored overlay only when this header is what rendered it.
     * The container is shared with the group's content drop target, which
     * renders into it on the same frame the cursor leaves the strip: the
     * pointer backend calls `handleDragOver` on the new target before the
     * global `onDragMove` that reaches us (#1612).
     */
    private clearHeaderAnchorOverlay(): void {
        const container = this.group.model.dropTargetContainer;
        const outline = container?.renderedOutline;

        if (
            outline &&
            ![this._tabsList, this._voidContainer, this._extendedDropZone].some(
                (scope) => scope?.contains(outline)
            )
        ) {
            return; // someone else's overlay
        }

        container?.model?.clear();
    }

    handleDragOver(event: { clientX: number; clientY?: number }): void {
        if (!this._animState) {
            return;
        }

        // Multi-row wrap: the 1-D x-accumulation below assumes a single row.
        // In wrap use a 2-D hit-test (row by y, slot by x within the row) and
        // a discrete drop indicator instead of the gap animation. Group-chip
        // drags are excluded because they carry group-move semantics ("can't
        // drop inside another group") the single-tab hit-test doesn't model, and
        // chips don't wrap in v1, so they keep the 1-D path (whose gap animation
        // no-ops in wrap anyway).
        if (this._wrapMode && !this._animState.sourceTabGroupId) {
            this.handleWrappedDragOver(event.clientX, event.clientY ?? 0);
            return;
        }

        const mouseX = event.clientX;
        const firstPanelToGroup = this._buildFirstPanelToGroupMap();

        // Accumulation approach: compute where the drag image's left edge
        // would be, then walk tabs left-to-right using their original widths.
        // A tab fits to the left of the gap if the cumulative width of all
        // preceding non-source tabs <= available space.
        let insertionIndex = this._computeDragOverInsertionIndex(
            mouseX,
            firstPanelToGroup
        );
        let targetTabGroupId: string | null = null;

        // Determine which tab group (if any) the insertion index falls within.
        //
        // We use snapshot-based positions to compute original chip boundaries.
        // This avoids reading getBoundingClientRect() on chips whose live
        // position is shifted by the drag gap margin, which caused oscillation
        // / visual jumps.
        if (
            insertionIndex !== null &&
            this._tabGroupManager.chipRenderers.size > 0
        ) {
            const resolved = this._resolveInsertionAgainstTabGroups(
                mouseX,
                insertionIndex,
                firstPanelToGroup
            );
            insertionIndex = resolved.insertionIndex;
            targetTabGroupId = resolved.targetTabGroupId;
        }

        if (
            insertionIndex === this._animState.currentInsertionIndex &&
            targetTabGroupId === this._animState.targetTabGroupId
        ) {
            return;
        }

        this._animState.currentInsertionIndex = insertionIndex;
        this._animState.targetTabGroupId = targetTabGroupId;

        if (this.accessor.options.theme?.tabAnimation === 'smooth') {
            this.applyDragOverTransforms();
        }
    }

    /**
     * Build a lookup from the first panel ID of each non-source group → group
     * ID, so the accumulation walk can add chip widths when it reaches a
     * group's first tab.
     */
    private _buildFirstPanelToGroupMap(): Map<string, string> {
        const firstPanelToGroup = new Map<string, string>();
        if (this._tabGroupManager.chipRenderers.size === 0) {
            return firstPanelToGroup;
        }
        for (const tg of this.group.model.getTabGroups()) {
            if (tg.id === this._animState!.sourceTabGroupId) {
                continue;
            }
            if (tg.panelIds.length > 0) {
                firstPanelToGroup.set(tg.panelIds[0], tg.id);
            }
        }
        return firstPanelToGroup;
    }

    /**
     * Walk the tabs left-to-right by their original widths and return the
     * insertion slot for the drag image's left edge (null if no slot fits).
     */
    private _computeDragOverInsertionIndex(
        mouseX: number,
        firstPanelToGroup: Map<string, string>
    ): number | null {
        const animState = this._animState!;
        const sourceGroupPanelIds = animState.sourceGroupPanelIds;
        const dragLeftEdge = mouseX - animState.cursorOffsetFromDragLeft;
        const availableSpace = dragLeftEdge - animState.containerLeft;
        let accWidth = 0;
        let insertionIndex: number | null = null;

        for (let i = 0; i < this._tabs.length; i++) {
            const tab = this._tabs[i].value;
            if (tab.panel.id === animState.sourceTabId) {
                continue;
            }
            if (sourceGroupPanelIds?.has(tab.panel.id)) {
                continue;
            }

            // If this tab is the first of a non-source group, include
            // the chip width (which sits before it in the DOM).
            const groupId = firstPanelToGroup.get(tab.panel.id);
            if (groupId) {
                const chipWidth = animState.chipPositions.get(groupId) ?? 0;
                if (accWidth + chipWidth > availableSpace) {
                    // Chip alone overflows, so the gap goes before this group
                    insertionIndex ??= i;
                    break;
                }
                accWidth += chipWidth;
            }

            // Use original width (before collapse/transforms)
            const origRect = animState.tabPositions.get(tab.panel.id);
            const tabWidth = origRect
                ? origRect.width
                : tab.element.getBoundingClientRect().width;

            // Shift at the midpoint: a tab moves left once the drag image
            // covers half of it (like Chrome's tab drag behavior).
            if (accWidth + tabWidth / 2 <= availableSpace) {
                accWidth += tabWidth;
                insertionIndex = i + 1;
            } else {
                insertionIndex ??= i;
                break;
            }
        }
        return insertionIndex;
    }

    /**
     * Rebuild the accumulated original width up to `insertionIndex`, walking the
     * tabs exactly the way the accumulation loop does, so callers know the
     * original right edge of the chip (if any) that precedes the insertion slot.
     */
    private _accumulatedWidthUpTo(
        insertionIndex: number,
        firstPanelToGroup: Map<string, string>
    ): number {
        const animState = this._animState!;
        const sourceGroupPanelIds = animState.sourceGroupPanelIds;
        let accUpTo = 0;
        for (let i = 0; i < this._tabs.length; i++) {
            const tab = this._tabs[i].value;
            if (tab.panel.id === animState.sourceTabId) {
                continue;
            }
            if (sourceGroupPanelIds?.has(tab.panel.id)) {
                continue;
            }
            if (i >= insertionIndex) {
                break;
            }
            const gid = firstPanelToGroup.get(tab.panel.id);
            if (gid) {
                accUpTo += animState.chipPositions.get(gid) ?? 0;
            }
            const origRect = animState.tabPositions.get(tab.panel.id);
            accUpTo += origRect
                ? origRect.width
                : tab.element.getBoundingClientRect().width;
        }
        return accUpTo;
    }

    /**
     * Given a raw insertion index, snap it out of / into any tab group it falls
     * within and resolve the target group (if the drop should merge into one).
     */
    private _resolveInsertionAgainstTabGroups(
        mouseX: number,
        insertionIndex: number,
        firstPanelToGroup: Map<string, string>
    ): { insertionIndex: number; targetTabGroupId: string | null } {
        const isGroupDrag = !!this._animState!.sourceTabGroupId;
        const accUpTo = this._accumulatedWidthUpTo(
            insertionIndex,
            firstPanelToGroup
        );

        for (const tg of this.group.model.getTabGroups()) {
            const resolved = this._evaluateTabGroupForInsertion(
                tg,
                mouseX,
                insertionIndex,
                accUpTo,
                isGroupDrag
            );
            if (resolved) {
                return resolved;
            }
        }
        return { insertionIndex, targetTabGroupId: null };
    }

    /**
     * Evaluate a single tab group against the proposed insertion index.
     * Returns the resolved `{ insertionIndex, targetTabGroupId }` when this
     * group governs the slot (the caller stops iterating), or `null` when the
     * group is irrelevant and the caller should keep looking.
     */
    private _evaluateTabGroupForInsertion(
        tg: ITabGroup,
        mouseX: number,
        insertionIndex: number,
        accUpTo: number,
        isGroupDrag: boolean
    ): { insertionIndex: number; targetTabGroupId: string | null } | null {
        const range = this._resolveGroupRange(tg);
        if (!range) {
            return null;
        }
        const { firstIdx, lastIdx } = range;

        const isInsideRange =
            insertionIndex >= firstIdx && insertionIndex <= lastIdx;
        const isJustBeforeGroup =
            !isInsideRange && insertionIndex === firstIdx - 1;

        if (!isInsideRange && !isJustBeforeGroup) {
            return null;
        }

        if (isGroupDrag) {
            return this._resolveGroupDragTarget(
                insertionIndex,
                firstIdx,
                lastIdx,
                isInsideRange
            );
        }
        return this._resolveTabDragTarget(
            tg,
            mouseX,
            insertionIndex,
            accUpTo,
            firstIdx,
            isJustBeforeGroup
        );
    }

    /**
     * The index range this group occupies in the live tab list, excluding the
     * source tab / source group tabs (so dragging a tab out of its own group
     * doesn't inflate the range). Null when the group has no effective tabs or
     * its bounds can't be located.
     */
    private _resolveGroupRange(
        tg: ITabGroup
    ): { firstIdx: number; lastIdx: number } | null {
        const animState = this._animState!;
        const sourceGroupPanelIds = animState.sourceGroupPanelIds;
        const effectivePanelIds = tg.panelIds.filter(
            (pid) =>
                pid !== animState.sourceTabId && !sourceGroupPanelIds?.has(pid)
        );
        if (effectivePanelIds.length === 0) {
            return null;
        }
        const firstIdx = this._tabs.findIndex(
            (t) => t.value.panel.id === effectivePanelIds[0]
        );
        const lastIdx = this._tabs.findIndex(
            (t) =>
                t.value.panel.id ===
                effectivePanelIds[effectivePanelIds.length - 1]
        );
        if (firstIdx === -1 || lastIdx === -1) {
            return null;
        }
        return { firstIdx, lastIdx };
    }

    /** Insertion target for a group-chip drag: a group can't be dropped inside
     *  another group, so snap out of the range; a just-before slot is kept. */
    private _resolveGroupDragTarget(
        insertionIndex: number,
        firstIdx: number,
        lastIdx: number,
        isInsideRange: boolean
    ): { insertionIndex: number; targetTabGroupId: string | null } {
        if (isInsideRange) {
            // Snap to just before or just after this group based on cursor
            // position relative to the group's midpoint. For `isJustBeforeGroup`
            // the index is already outside (immediately left of the group) and
            // is a valid drop position, so leave it untouched (issue #1264).
            const groupMid = (firstIdx + lastIdx + 1) / 2;
            return {
                insertionIndex:
                    insertionIndex < groupMid ? firstIdx : lastIdx + 1,
                targetTabGroupId: null,
            };
        }
        // Just before the group: accept the index as-is. Groups can be dropped
        // at the slot immediately left of another group's first tab.
        return { insertionIndex, targetTabGroupId: null };
    }

    /** Insertion target for a single-tab drag against a group: decide whether
     *  the drop merges into the group based on the cursor vs the chip edge. */
    private _resolveTabDragTarget(
        tg: ITabGroup,
        mouseX: number,
        insertionIndex: number,
        accUpTo: number,
        firstIdx: number,
        isJustBeforeGroup: boolean
    ): { insertionIndex: number; targetTabGroupId: string | null } | null {
        const animState = this._animState!;
        const chipWidth = animState.chipPositions.get(tg.id) ?? 0;

        if (isJustBeforeGroup) {
            // Only allow dropping into position 0 when just the source tab (or
            // source group tabs) sits between insertionIndex and firstIdx: the
            // source is being dragged away from that slot, so we are
            // effectively "just before" the group.
            if (!this._onlySourceBetween(insertionIndex, firstIdx)) {
                return null;
            }
            const threshold = tg.collapsed
                ? animState.containerLeft + accUpTo + chipWidth / 2
                : animState.containerLeft + accUpTo + chipWidth;
            if (mouseX >= threshold) {
                return { insertionIndex: firstIdx, targetTabGroupId: tg.id };
            }
            return { insertionIndex, targetTabGroupId: null };
        }

        // isInsideRange, single-tab drag.
        const chipOriginalRight = animState.containerLeft + accUpTo + chipWidth;
        if (insertionIndex === firstIdx) {
            return {
                insertionIndex,
                targetTabGroupId: mouseX >= chipOriginalRight ? tg.id : null,
            };
        }
        return { insertionIndex, targetTabGroupId: tg.id };
    }

    /**
     * Whether every tab in the half-open range `[from, to)` is the source tab
     * or one of the source group's tabs.
     */
    private _onlySourceBetween(from: number, to: number): boolean {
        const animState = this._animState!;
        for (let j = from; j < to; j++) {
            const pid = this._tabs[j].value.panel.id;
            if (
                pid !== animState.sourceTabId &&
                !animState.sourceGroupPanelIds?.has(pid)
            ) {
                return false;
            }
        }
        return true;
    }

    /**
     * Multi-row wrap drag-over: resolve the 2-D insertion slot and show a
     * discrete drop indicator. No gap/FLIP animation (that's 1-D and fights the
     * flow layout, so `applyDragOverTransforms`/`runFlipAnimation` no-op in wrap).
     */
    private handleWrappedDragOver(clientX: number, clientY: number): void {
        if (!this._animState) {
            return;
        }
        const index = this.computeWrappedInsertionIndex(clientX, clientY);
        // targetTabGroupId stays null: wrap reorder is single-tab within the
        // group; group-chip drops keep the 1-D path (chips don't wrap in v1).
        if (
            index === this._animState.currentInsertionIndex &&
            this._animState.targetTabGroupId === null
        ) {
            return;
        }
        this._animState.currentInsertionIndex = index;
        this._animState.targetTabGroupId = null;
        this.updateWrapDropIndicator(index);
    }

    /**
     * The insertion slot (index into the full tab list) for a pointer at
     * `(clientX, clientY)` over a wrapped strip. Two axes:
     *  - horizontal header (rows): pick the row whose vertical span contains
     *    `clientY`, then the slot within it by x-midpoint;
     *  - vertical header (columns): pick the column whose horizontal span
     *    contains `clientX`, then the slot within it by y-midpoint.
     * The pointer's cross-axis coordinate selects the line (nearest line if it
     * falls in an inter-line gap); its main-axis coordinate selects the slot.
     * Excludes the drag source so its own position doesn't bias the result; the
     * drop path adjusts for the source offset.
     */
    private computeWrappedInsertionIndex(
        clientX: number,
        clientY: number
    ): number {
        const isVertical = this._direction === 'vertical';

        const entries = this._wrappedDragEntries();
        if (entries.length === 0) {
            return this._tabs.length;
        }

        // Cross-axis pointer coordinate + per-tab accessors, swapped by axis:
        // rows bucket by `top`/`bottom` (cross = y), columns by `left`/`right`
        // (cross = x). `crossPointer` selects the line; `mainPointer` the slot.
        const crossPointer = isVertical ? clientX : clientY;
        const mainPointer = isVertical ? clientY : clientX;
        const crossStart = (r: DOMRect): number =>
            isVertical ? r.left : r.top;
        const crossEnd = (r: DOMRect): number =>
            isVertical ? r.right : r.bottom;
        const mainStart = (r: DOMRect): number => (isVertical ? r.top : r.left);
        const mainSize = (r: DOMRect): number =>
            isVertical ? r.height : r.width;

        const lines = this._bucketWrappedLines(entries, crossStart, crossEnd);

        // Pick the line whose cross span contains the pointer; if the pointer is
        // in an inter-line gap (or before/after all lines), pick the nearest
        // line, not a blanket clamp to the last line.
        const line =
            lines.find(
                (l) => crossPointer >= l.start && crossPointer <= l.end
            ) ?? this._nearestWrappedLine(lines, crossPointer);

        // Within the line, insert before the first tab whose main-axis midpoint
        // is past the pointer; past all of them → after the line's last tab.
        const items = [...line.items].sort(
            (a, b) => mainStart(a.rect) - mainStart(b.rect)
        );
        for (const item of items) {
            const midpoint = mainStart(item.rect) + mainSize(item.rect) / 2;
            if (mainPointer < midpoint) {
                return item.index;
            }
        }
        return items[items.length - 1].index + 1;
    }

    /**
     * The wrapped drop candidates: each non-source tab's list index + live
     * rect. The drag source (and any grouped tabs moving with it) are excluded
     * so their own positions don't bias the hit-test.
     */
    private _wrappedDragEntries(): WrappedTabEntry[] {
        const sourceId = this._animState?.sourceTabId;
        const sourceGroupIds = this._animState?.sourceGroupPanelIds;
        const entries: WrappedTabEntry[] = [];
        for (let i = 0; i < this._tabs.length; i++) {
            const tab = this._tabs[i].value;
            if (tab.panel.id === sourceId) {
                continue;
            }
            if (sourceGroupIds?.has(tab.panel.id)) {
                continue;
            }
            entries.push({
                index: i,
                rect: tab.element.getBoundingClientRect(),
            });
        }
        return entries;
    }

    /**
     * Bucket entries into lines by cross-axis start (2px tolerance for sub-pixel
     * rounding), sorted along the cross axis.
     */
    private _bucketWrappedLines(
        entries: WrappedTabEntry[],
        crossStart: (r: DOMRect) => number,
        crossEnd: (r: DOMRect) => number
    ): WrappedLine[] {
        const lines: WrappedLine[] = [];
        for (const entry of entries) {
            const s = crossStart(entry.rect);
            const line = lines.find((l) => Math.abs(l.start - s) <= 2);
            if (line) {
                line.items.push(entry);
                line.end = Math.max(line.end, crossEnd(entry.rect));
            } else {
                lines.push({
                    start: s,
                    end: crossEnd(entry.rect),
                    items: [entry],
                });
            }
        }
        lines.sort((a, b) => a.start - b.start);
        return lines;
    }

    /** The line nearest `crossPointer` by cross-axis distance (gap fallback). */
    private _nearestWrappedLine(
        lines: WrappedLine[],
        crossPointer: number
    ): WrappedLine {
        const distance = (l: WrappedLine): number =>
            crossPointer < l.start
                ? l.start - crossPointer
                : crossPointer - l.end;
        return lines.reduce(
            (nearest, l) => (distance(l) < distance(nearest) ? l : nearest),
            lines[0]
        );
    }

    private updateWrapDropIndicator(index: number): void {
        this.clearWrapDropIndicator();
        const count = this._tabs.length;
        if (count === 0) {
            return;
        }
        const sourceId = this._animState?.sourceTabId;
        if (index < count) {
            const el = this._tabs[index].value.element;
            // The slot at the source's own position is a no-op drop; don't draw
            // the indicator on the dragged tab itself.
            if (this._tabs[index].value.panel.id === sourceId) {
                return;
            }
            el.classList.add('dv-tab--reorder-before');
            this._wrapIndicatorEl = el;
        } else {
            const el = this._tabs[count - 1].value.element;
            el.classList.add('dv-tab--reorder-after');
            this._wrapIndicatorEl = el;
        }
    }

    private clearWrapDropIndicator(): void {
        this._wrapIndicatorEl?.classList.remove(
            'dv-tab--reorder-before',
            'dv-tab--reorder-after'
        );
        this._wrapIndicatorEl = null;
    }

    /**
     * Batch-remove a CSS class from multiple elements instantly,
     * forcing only a single reflow for the entire batch.
     */
    private _removeClassInstantlyBatch(
        elements: HTMLElement[],
        cls: string
    ): void {
        const affected: HTMLElement[] = [];
        for (const el of elements) {
            if (el.classList.contains(cls)) {
                el.style.transition = 'none';
                toggleClass(el, cls, false);
                affected.push(el);
            }
        }
        if (affected.length > 0) {
            affected[0].getBoundingClientRect(); // single reflow for entire batch
            for (const el of affected) {
                el.style.removeProperty('transition');
            }
        }
    }

    /**
     * Remove `dv-tab--dragging` from the source tab instantly so it
     * regains its real width before FLIP snapshots.
     */
    uncollapseSourceTab(sourceTabId: string): void {
        const entry = this._tabMap.get(sourceTabId);
        if (entry) {
            this._removeClassInstantlyBatch(
                [entry.value.element],
                'dv-tab--dragging'
            );
        }
    }

    applyDragOverTransforms(skipTransition = false): void {
        // The gap animation is 1-D (single-row margin shifting) and fights the
        // wrap flow layout, so wrap uses a discrete drop indicator instead.
        if (this._wrapMode) {
            return;
        }
        if (this._animState?.currentInsertionIndex == null) {
            this.resetTabTransforms();
            return;
        }

        // Don't apply transforms until the source tab has been collapsed
        // in the rAF callback; otherwise the gap and the still-visible source
        // produce a jump.
        if (this._pendingCollapse) {
            return;
        }

        const insertionIndex = this._animState.currentInsertionIndex;
        const gapWidth = this._computeGapWidth();
        const chipToShift = this._computeChipToShift(insertionIndex);
        this._applyGapMargins(
            insertionIndex,
            gapWidth,
            chipToShift,
            skipTransition
        );
    }

    /** Gap width for the current drag: the whole group's span for a group
     *  drag, otherwise the source tab's own width. */
    private _computeGapWidth(): number {
        const animState = this._animState!;
        if (animState.sourceTabGroupId && animState.sourceGroupPanelIds) {
            return animState.sourceGapWidth;
        }
        const sourceRect = animState.tabPositions.get(animState.sourceTabId);
        return sourceRect ? sourceRect.width : this.getAverageTabWidth();
    }

    /**
     * When the insertion lands at or before a group's first tab, the chip is
     * shifted so the gap appears before the entire group. Returns that chip
     * element, or null when no chip should shift.
     *
     * A chip shifts when dropping outside the group (targetTabGroupId null), or
     * when dropping inside a collapsed group (whose tabs are invisible, so
     * putting the gap on them has no visual effect).
     */
    private _computeChipToShift(insertionIndex: number): HTMLElement | null {
        if (this._tabGroupManager.chipRenderers.size === 0) {
            return null;
        }
        for (const tg of this.group.model.getTabGroups()) {
            const result = this._chipToShiftForGroup(tg, insertionIndex);
            // `undefined` means "keep looking"; a defined result (element or
            // null) is the final answer for the group governing this slot.
            if (result !== undefined) {
                return result;
            }
        }
        return null;
    }

    /**
     * The chip to shift for a single group, or `undefined` to keep scanning the
     * remaining groups. A defined result (the chip element, or null when the
     * governing group has no shiftable chip) stops the scan.
     */
    private _chipToShiftForGroup(
        tg: ITabGroup,
        insertionIndex: number
    ): HTMLElement | null | undefined {
        const animState = this._animState!;
        if (tg.id === animState.sourceTabGroupId) return undefined;
        // Skip the group that the dragged tab belongs to: the gap should
        // appear after the chip (where the tab was), not before it.
        if (tg.panelIds.includes(animState.sourceTabId)) return undefined;
        const effectivePids = tg.panelIds.filter(
            (pid) =>
                pid !== animState.sourceTabId &&
                !animState.sourceGroupPanelIds?.has(pid)
        );
        if (effectivePids.length === 0) return undefined;
        const firstIdx = this._tabs.findIndex(
            (t) => t.value.panel.id === effectivePids[0]
        );

        const shouldShiftChip =
            !animState.targetTabGroupId ||
            (animState.targetTabGroupId === tg.id && tg.collapsed);
        if (!shouldShiftChip) return undefined;
        if (firstIdx < insertionIndex) return undefined;

        // firstIdx >= insertionIndex: this group governs the slot. Only shift
        // when just the source tab(s) sit between the insertion slot and the
        // group's first tab.
        if (this._onlySourceBetween(insertionIndex, firstIdx)) {
            const chipEntry = this._tabGroupManager.chipRenderers.get(tg.id);
            if (chipEntry) {
                return chipEntry.chip.element;
            }
        }
        return null;
    }

    /** Reset non-source chip margins, then apply the gap margin to the chip or
     *  the first tab at/after the insertion index. */
    private _applyGapMargins(
        insertionIndex: number,
        gapWidth: number,
        chipToShift: HTMLElement | null,
        skipTransition: boolean
    ): void {
        const animState = this._animState!;
        const sourceGroupPanelIds = animState.sourceGroupPanelIds;
        let gapApplied = false;

        // Reset all non-source chip margins first
        for (const [groupId, entry] of this._tabGroupManager.chipRenderers) {
            if (groupId === animState.sourceTabGroupId) continue;
            this._clearMargin(entry.chip.element, skipTransition);
        }

        // Apply gap to chip if insertion is before a group
        if (chipToShift) {
            this._setMargin(chipToShift, `${gapWidth}px`, skipTransition);
            gapApplied = true;
        }

        for (let i = 0; i < this._tabs.length; i++) {
            const tab = this._tabs[i].value;
            if (tab.panel.id === animState.sourceTabId) {
                continue;
            }
            if (sourceGroupPanelIds?.has(tab.panel.id)) {
                continue;
            }

            if (!gapApplied && i >= insertionIndex) {
                this._setMargin(tab.element, `${gapWidth}px`, skipTransition);
                gapApplied = true;
            } else {
                this._clearMargin(tab.element, skipTransition);
            }
        }

        // Reposition underlines to follow shifted chips/tabs
        this._tabGroupManager.trackUnderlines();
    }

    /** Pick the correct shifting class for tabs vs chips. */
    private _shiftingClass(el: HTMLElement): string {
        return el.classList.contains('dv-tab-group-chip')
            ? 'dv-tab-group-chip--shifting'
            : 'dv-tab--shifting';
    }

    /** Apply a margin-left value to an element, optionally bypassing CSS
     *  transitions for instant positioning. */
    private _setMargin(
        el: HTMLElement,
        value: string,
        skipTransition: boolean
    ): void {
        if (skipTransition) {
            el.style.transition = 'none';
            el.style.marginLeft = value;
            el.getBoundingClientRect(); // force reflow before re-enabling
            el.style.removeProperty('transition');
        } else {
            el.style.marginLeft = value;
        }
        toggleClass(el, this._shiftingClass(el), true);
    }

    /** Clear an element's gap margin, animating it back to zero unless
     *  transitions are skipped. */
    private _clearMargin(el: HTMLElement, skipTransition: boolean): void {
        const cls = this._shiftingClass(el);

        // Remove any previous pending listener for this element
        const prev = this._pendingMarginCleanups.get(el);
        if (prev) {
            prev();
        }

        if (skipTransition || !el.style.marginLeft) {
            el.style.removeProperty('margin-left');
            toggleClass(el, cls, false);
        } else {
            el.style.marginLeft = '0px';
            toggleClass(el, cls, true);
            const onEnd = () => {
                el.style.removeProperty('margin-left');
                toggleClass(el, cls, false);
                el.removeEventListener('transitionend', onEnd);
                clearTimeout(fallbackTimer);
                this._pendingMarginCleanups.delete(el);
            };
            // Fallback in case transitionend never fires
            // (e.g. element removed from DOM mid-transition)
            const fallbackTimer = setTimeout(onEnd, 300);
            this._pendingMarginCleanups.set(el, onEnd);
            el.addEventListener('transitionend', onEnd);
        }
    }

    resetTabTransforms(): void {
        this.clearWrapDropIndicator();

        // Cancel any pending margin transitionend listeners
        for (const [, cleanup] of this._pendingMarginCleanups) {
            cleanup();
        }
        this._pendingMarginCleanups.clear();

        for (const tab of this._tabs) {
            tab.value.element.style.removeProperty('margin-left');
            tab.value.element.style.removeProperty('margin-right');
            tab.value.element.style.removeProperty('margin-top');
            tab.value.element.style.removeProperty('margin-bottom');
            tab.value.element.style.removeProperty('transform');
            toggleClass(tab.value.element, 'dv-tab--shifting', false);
        }
        for (const [, entry] of this._tabGroupManager.chipRenderers) {
            entry.chip.element.style.removeProperty('margin-left');
            toggleClass(
                entry.chip.element,
                'dv-tab-group-chip--shifting',
                false
            );
        }
        this._tabGroupManager.positionUnderlines();
    }

    /**
     * Commit a group-drag drop: clear drag classes, move the group
     * in the model, and run a FLIP animation.
     */
    commitGroupMove(sourceTabGroupId: string, insertionIndex: number): void {
        // Read transfer data first.
        const data = getPanelData();

        // Synchronously dispose the source chip's drag sources, which
        // clears the panelTransfer payload + iframe shield. Cross-group
        // moves dissolve the source chip on a microtask, which is too
        // late: a synchronous `getPanelData()` after this method (or any
        // sibling dragover handler firing in the same tick) would
        // otherwise see stale data still referencing the old tabGroupId.
        this._tabGroupManager.disposeChipDrag(sourceTabGroupId);

        // Check if the tab group exists in this group (within-group reorder)
        // or in another group (cross-group move).
        const isLocal = this.group.model
            .getTabGroups()
            .some((tg) => tg.id === sourceTabGroupId);

        if (isLocal) {
            if (this.accessor.options.theme?.tabAnimation === 'smooth') {
                this._clearGroupDragClasses(sourceTabGroupId);
                const firstPositions = this.snapshotTabPositions();
                this.resetTabTransforms();
                this.group.model.moveTabGroup(sourceTabGroupId, insertionIndex);
                this.runFlipAnimation(firstPositions, '', false);
            } else {
                this._tabGroupManager.skipNextCollapseAnimation = true;
                this.group.model.moveTabGroup(sourceTabGroupId, insertionIndex);
            }
        } else if (data) {
            // Cross-group: delegate to the component-level move which
            // handles panel transfer and tab group recreation.
            // Use the REAL tab group ID from transfer data, not the
            // potentially stale one from _animState.
            //
            // Clear any inline gap margin / shifting class applied to
            // destination tabs during dragover. Cross-group moves don't
            // run the FLIP path, and `moveGroupOrPanel` only inserts new
            // panels; it doesn't recreate existing destination tabs, so
            // their inline `margin-left` would otherwise persist as a
            // visible gap (issue #1243).
            this.resetTabTransforms();
            this.accessor.moveGroupOrPanel({
                from: {
                    groupId: data.groupId,
                    tabGroupId: data.tabGroupId ?? sourceTabGroupId,
                },
                to: {
                    group: this.group,
                    position: 'center',
                    index: insertionIndex,
                },
            });
        }
    }

    private _clearGroupDragClasses(sourceTabGroupId: string): void {
        const chipEntry =
            this._tabGroupManager.chipRenderers.get(sourceTabGroupId);
        if (chipEntry) {
            this._removeClassInstantlyBatch(
                [chipEntry.chip.element],
                'dv-tab-group-chip--dragging'
            );
        }
        this._removeClassInstantlyBatch(
            this._tabs.map((t) => t.value.element),
            'dv-tab--dragging'
        );
        // Restore underline
        const underline =
            this._tabGroupManager.groupUnderlines.get(sourceTabGroupId);
        if (underline) {
            underline.style.removeProperty('display');
        }
        // The subsequent moveTabGroup will re-create tabs and call
        // updateTabGroups → _updateTabGroupClasses. For collapsed groups
        // the new tabs don't have dv-tab--group-collapsed yet, which
        // would trigger the collapse animation. Skip it.
        this._tabGroupManager.skipNextCollapseAnimation = true;
    }

    resetDragAnimation(): void {
        this._pendingCollapse = false;

        // After a drop, `tab.onDrop` consumes _animState (sets it to null)
        // and immediately calls `runFlipAnimation`, which sets transforms
        // and queues an rAF to trigger the CSS transition. dragend fires
        // synchronously on the source element before that rAF runs; if
        // we cleared transforms here we'd clobber the in-flight FLIP, so
        // gate the cleanup on _animState still being set (i.e. drag was
        // cancelled rather than dropped).
        if (this._animState) {
            this.resetTabTransforms();
            if (this._animState.sourceTabGroupId) {
                this._clearGroupDragClasses(this._animState.sourceTabGroupId);
            } else {
                this._removeClassInstantlyBatch(
                    this._tabs.map((t) => t.value.element),
                    'dv-tab--dragging'
                );
            }
            this._animState = null;
            // Restore any hidden underlines from group drags.
            for (const [, el] of this._tabGroupManager.groupUnderlines) {
                el.style.removeProperty('display');
            }
        }
    }

    runFlipAnimation(
        firstPositions: Map<string, DOMRect>,
        sourceTabId: string,
        isCrossGroup: boolean = false,
        animRange?: { from: number; to: number }
    ): void {
        // The FLIP is a 1-D (single-axis) slide; across wrapped rows it would
        // animate wrong deltas, so wrap does a discrete reorder (no FLIP).
        if (this._wrapMode) {
            return;
        }

        let hasAnimation = false;
        for (let i = 0; i < this._tabs.length; i++) {
            if (
                this._applyFlipTransform(
                    this._tabs[i],
                    i,
                    sourceTabId,
                    isCrossGroup,
                    firstPositions,
                    animRange
                )
            ) {
                hasAnimation = true;
            }
        }

        if (!hasAnimation) {
            return;
        }

        this._scheduleFlipReset();
    }

    /**
     * Set a single tab's FLIP transform: the source tab slides in from the end
     * on a cross-group insert; other in-range tabs slide from their first
     * position to their last. Returns true if the tab will animate.
     */
    private _applyFlipTransform(
        tab: IValueDisposable<Tab>,
        index: number,
        sourceTabId: string,
        isCrossGroup: boolean,
        firstPositions: Map<string, DOMRect>,
        animRange?: { from: number; to: number }
    ): boolean {
        const isVertical = this._direction === 'vertical';
        const panelId = tab.value.panel.id;

        if (panelId === sourceTabId) {
            if (!isCrossGroup) {
                return false;
            }
            // Newly inserted tab: slide in from the end
            const rect = tab.value.element.getBoundingClientRect();
            tab.value.element.style.transform = isVertical
                ? `translateY(${rect.height}px)`
                : `translateX(${rect.width}px)`;
            toggleClass(tab.value.element, 'dv-tab--shifting', true);
            return true;
        }

        // Skip tabs outside the affected range (they don't logically move)
        if (
            animRange !== undefined &&
            (index < animRange.from || index > animRange.to)
        ) {
            return false;
        }

        const firstRect = firstPositions.get(panelId);
        if (!firstRect) {
            return false;
        }

        const lastRect = tab.value.element.getBoundingClientRect();
        const delta = isVertical
            ? firstRect.top - lastRect.top
            : firstRect.left - lastRect.left;

        if (Math.abs(delta) < 1) {
            return false;
        }

        tab.value.element.style.transform = isVertical
            ? `translateY(${delta}px)`
            : `translateX(${delta}px)`;
        toggleClass(tab.value.element, 'dv-tab--shifting', true);
        return true;
    }

    /**
     * Next frame, clear the transforms (triggering the CSS transition), track
     * underlines through the slide, and drop the shifting classes once the
     * transform transition ends.
     */
    private _scheduleFlipReset(): void {
        requestAnimationFrame(() => {
            for (const tab of this._tabs) {
                if (tab.value.element.style.transform) {
                    tab.value.element.style.transform = '';
                }
            }

            // Track underlines during the FLIP transition so they
            // follow tabs as they slide to their final positions.
            this._tabGroupManager.trackUnderlines();

            // Clean up any previous flip transition listener
            this._flipTransitionCleanup?.();

            const onTransitionEnd = (event: TransitionEvent) => {
                if (event.propertyName === 'transform') {
                    cleanup();
                    for (const tab of this._tabs) {
                        toggleClass(
                            tab.value.element,
                            'dv-tab--shifting',
                            false
                        );
                    }
                    // Final reposition after animation settles
                    this._tabGroupManager.positionUnderlines();
                }
            };

            const cleanup = () => {
                this._tabsList.removeEventListener(
                    'transitionend',
                    onTransitionEnd
                );
                this._flipTransitionCleanup = null;
            };

            this._flipTransitionCleanup = cleanup;
            this._tabsList.addEventListener('transitionend', onTransitionEnd);
        });
    }
}
