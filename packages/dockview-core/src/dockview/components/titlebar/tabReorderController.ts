import { getPanelData, PanelTransfer } from '../../../dnd/dataTransfer';
import { getEventDocument, getHitTestRoot, toggleClass } from '../../../dom';
import { PointerDragEndEvent } from '../../../dnd/pointer/types';
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
import { nearerEdge } from '../../tabStrip';

export interface TabAnimationState {
    sourceTabId: string;
    sourceIndex: number;
    tabPositions: Map<string, DOMRect>;
    /** Group-chip main-axis sizes keyed by group ID, captured before collapse */
    chipSizes: Map<string, number>;
    currentInsertionIndex: number | null;
    targetTabGroupId: string | null;
    /** When set, the drag source is a group chip (entire group drag) */
    sourceTabGroupId: string | null;
    /** Cached panel IDs of the source group (avoids repeated lookups during drag) */
    sourceGroupPanelIds: Set<string> | null;
    /** Main-axis size of the group chip, captured before collapse */
    sourceChipSize: number;
    /** Distance from the cursor to the leading edge of the drag image */
    cursorOffsetFromDragStart: number;
    /** Total main-axis size of the dragged content (chip + tabs for groups,
     *  the tab's own size for singles) */
    sourceGapSize: number;
    /** Leading edge of the tabs container at drag start */
    containerStart: number;
}

/**
 * Main-axis extent of a rect. Tabs flow along x in a horizontal header
 * (top/bottom) and along y in a vertical one (the left/right edge groups),
 * so the reorder math reads every size through this.
 */
export function mainAxisSize(
    rect: { width: number; height: number },
    direction: DockviewHeaderDirection
): number {
    return direction === 'vertical' ? rect.height : rect.width;
}

/** Leading edge of a rect along the main axis. */
export function mainAxisStart(
    rect: { left: number; top: number },
    direction: DockviewHeaderDirection
): number {
    return direction === 'vertical' ? rect.top : rect.left;
}

/** A cursor position projected onto the main axis. */
export function mainAxisCursor(
    event: { clientX: number; clientY: number },
    direction: DockviewHeaderDirection
): number {
    return direction === 'vertical' ? event.clientY : event.clientX;
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

/** A tab the drag moves past, at its original main-axis offset from the
 *  start of the strip. */
interface StripStop {
    /** Index in the live tab list. */
    index: number;
    start: number;
    /** Size of the chip drawn before the tab, 0 unless it leads a tab group. */
    chip: number;
    size: number;
}

/** The live tab list indexes of a tab group's first and last stops. */
interface TabGroupSpan {
    tabGroup: ITabGroup;
    first: number;
    last: number;
}

interface DragOverTarget {
    insertionIndex: number | null;
    targetTabGroupId: string | null;
}

interface StripLayout {
    stops: StripStop[];
    spans: TabGroupSpan[];
    /** The offset after the last stop. */
    end: number;
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

    /** Main-axis extent of a rect for this header's orientation. */
    private _mainAxisSize(rect: { width: number; height: number }): number {
        return mainAxisSize(rect, this._direction);
    }

    /** Main-axis leading edge of a rect for this header's orientation. */
    private _mainAxisStart(rect: { left: number; top: number }): number {
        return mainAxisStart(rect, this._direction);
    }

    /** The cursor coordinate along the main axis. */
    private _mainAxisCoord(clientX: number, clientY: number): number {
        return mainAxisCursor({ clientX, clientY }, this._direction);
    }

    /** The margin that opens the insertion gap. It must run along the main
     *  axis, so a vertical header pushes tabs down rather than sideways. */
    private get _gapMarginProperty(): 'margin-left' | 'margin-top' {
        return this._direction === 'vertical' ? 'margin-top' : 'margin-left';
    }

    private getAverageTabSize(): number {
        if (this._tabs.length === 0) {
            return 0;
        }
        let total = 0;
        for (const tab of this._tabs) {
            total += this._mainAxisSize(
                tab.value.element.getBoundingClientRect()
            );
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
        const elAtPoint = getHitTestRoot(this._tabsList).elementFromPoint(
            clientX,
            clientY
        );
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
    handlePointerDragEnd(e?: PointerDragEndEvent): void {
        // The pointer-backend analog of the HTML5 tabs-list `drop` commit: in
        // smooth mode the per-element drop targets don't latch a state for an
        // internal drag, so nothing else commits a release over the strip.
        // The strip's own targets null `_animState` before this runs and the
        // void container is outside the strip, so neither double-commits.
        // The layout-edge target (`dndEdges`) never sees a release committed
        // here: the strip stops the hit-test for it (`pointerReleaseOwner`).
        if (
            e &&
            this._animState?.currentInsertionIndex != null &&
            this.shouldCommitPointerRelease(e)
        ) {
            const sourceTabGroupId = this._animState.sourceTabGroupId;

            if (sourceTabGroupId) {
                const insertionIndex = this._animState.currentInsertionIndex;
                this._animState = null;
                this.commitGroupMove(sourceTabGroupId, insertionIndex);
            } else {
                this.commitPointerReorder(e.pointerEvent);
            }
        }
        this._pointerInsideTabsList = false;
        this.resetDragAnimation();
    }

    /**
     * Whose a pointer release over this strip is: `'own'` for a drag that
     * started here and left drag state to commit (a smooth-mode tab, or a
     * chip), `'external'` for a tab or chip from another group that the strip
     * takes over in smooth mode, and `null` for anything it leaves to the
     * targets behind it. The strip's hit-test stop and `handlePointerDragEnd`
     * both read this, so blocking a release and committing it agree.
     */
    pointerReleaseOwner(): 'own' | 'external' | null {
        if ((this._animState?.sourceIndex ?? -1) !== -1) {
            return 'own';
        }

        const data = getPanelData();

        if (
            data?.viewId === this.accessor.id &&
            data.groupId !== this.group.id &&
            this.takesOverExternalDrag(data)
        ) {
            return 'external';
        }

        return null;
    }

    /**
     * A tab or chip from another group in smooth mode, which the target's tabs
     * decline, so only the strip can commit it (as the HTML5 `drop` does).
     */
    private takesOverExternalDrag(data: PanelTransfer): boolean {
        return (
            this.accessor.options.theme?.tabAnimation === 'smooth' &&
            // A locked group takes no new panels from its header.
            !this.group.locked &&
            (data.panelId !== null || !!data.tabGroupId)
        );
    }

    private shouldCommitPointerRelease(e: PointerDragEndEvent): boolean {
        const owner = this.pointerReleaseOwner();

        if (owner === null) {
            return false;
        }

        // A release taken over from another strip must be a real drop in this
        // strip's window: a cancel also ends the drag, and a popout's strip
        // hit-tests its own document at the source window's coordinates.
        if (
            owner === 'external' &&
            !(
                e.dropped &&
                getEventDocument(e.pointerEvent) ===
                    this._tabsList.ownerDocument
            )
        ) {
            return false;
        }

        return this.isPointInsideTabsList(e.clientX, e.clientY);
    }

    private isPointInsideTabsList(clientX: number, clientY: number): boolean {
        const el = getHitTestRoot(this._tabsList).elementFromPoint(
            clientX,
            clientY
        );
        return !!el && this._tabsList.contains(el);
    }

    /**
     * Resolve a single-tab drop from its anim state: the list index adjusted
     * for the source's own slot, and the tab group that slot falls in. Null
     * when the drop changes neither position nor group membership; a drop at
     * the source's own slot still commits when it joins or leaves a group.
     */
    resolveTabDrop(
        animState: TabAnimationState
    ): { index: number; targetTabGroupId: string | null } | null {
        const insertionIndex = animState.currentInsertionIndex;
        if (insertionIndex === null) {
            return null;
        }
        const { sourceIndex, targetTabGroupId } = animState;
        const index =
            insertionIndex -
            (sourceIndex !== -1 && sourceIndex < insertionIndex ? 1 : 0);

        // Same slot, same group (or none): the move would remove and re-add
        // the tab, which also dissolves a group it is the only member of.
        if (
            index === sourceIndex &&
            targetTabGroupId ===
                (this.group.model.getTabGroupForPanel(animState.sourceTabId)
                    ?.id ?? null)
        ) {
            return null;
        }
        return { index, targetTabGroupId };
    }

    /** Commit a smooth-mode single-tab drop from the current insertion index
     *  (adjusted for the source's own position), then clear drag state.
     *  Used by the pointer backend for both single-row and wrap layouts. */
    private commitPointerReorder(event: PointerEvent): void {
        const animState = this._animState;
        if (animState?.currentInsertionIndex == null) {
            return;
        }
        // Same resolution as the HTML5 `drop` handler in `Tabs`: the model
        // re-attaches a moved panel to the group named here, so a null target
        // ejects a grouped tab and never joins an ungrouped one.
        const drop = this.resolveTabDrop(animState);

        this._animState = null;
        this.clearWrapDropIndicator();
        this.uncollapseSourceTab(animState.sourceTabId);

        if (!drop) {
            return;
        }
        // A tab from another group joins without re-rendering this strip's
        // tabs, so their gap margins have to be cleared here.
        this.resetTabTransforms();
        this.host.fireDrop({ event, ...drop });
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
        // Outside smooth mode, individual tab drops are handled by per-tab
        // Droptargets; only chip drags need tabs-list-level handling so drops on
        // void space still work.
        if (
            this.accessor.options.theme?.tabAnimation !== 'smooth' &&
            !data?.tabGroupId
        ) {
            return false;
        }
        if (
            !data ||
            !(data.panelId || data.tabGroupId) ||
            data.groupId === this.group.id ||
            // A locked group takes no new panels from its header.
            this.group.locked
        ) {
            return false;
        }
        const avgSize = this.getAverageTabSize();
        this._animState = data.tabGroupId
            ? this._makeGroupDragAnimState(data, avgSize)
            : this._makeTabDragAnimState(data, avgSize);
        return true;
    }

    /** Anim state for an external group-chip drag (gap sized to the group). */
    private _makeGroupDragAnimState(
        data: PanelTransfer,
        avgSize: number
    ): TabAnimationState {
        // External group drag: look up the source group to size the gap.
        const sourceGroup = this.accessor.getPanel(data.groupId);
        const sourceTg = sourceGroup?.model
            .getTabGroups()
            .find((tg) => tg.id === data.tabGroupId);
        const panelCount = sourceTg?.panelIds.length ?? 1;
        const groupGapSize = avgSize * panelCount + avgSize;
        return {
            sourceTabId: '',
            sourceIndex: -1,
            tabPositions: this.snapshotTabPositions(),
            chipSizes: this._tabGroupManager.snapshotChipSizes(),
            currentInsertionIndex: null,
            targetTabGroupId: null,
            sourceTabGroupId: data.tabGroupId!,
            sourceGroupPanelIds: sourceTg
                ? new Set(sourceTg.panelIds)
                : new Set<string>(),
            sourceChipSize: avgSize,
            cursorOffsetFromDragStart: groupGapSize / 2,
            sourceGapSize: groupGapSize,
            containerStart: this._mainAxisStart(
                this._tabsList.getBoundingClientRect()
            ),
        };
    }

    /** Anim state for an external single-tab drag. */
    private _makeTabDragAnimState(
        data: PanelTransfer,
        avgSize: number
    ): TabAnimationState {
        return {
            sourceTabId: data.panelId!,
            sourceIndex: -1,
            tabPositions: this.snapshotTabPositions(),
            chipSizes: this._tabGroupManager.snapshotChipSizes(),
            currentInsertionIndex: null,
            targetTabGroupId: null,
            sourceTabGroupId: null,
            sourceGroupPanelIds: null,
            sourceChipSize: 0,
            cursorOffsetFromDragStart: avgSize / 2,
            sourceGapSize: avgSize,
            containerStart: this._mainAxisStart(
                this._tabsList.getBoundingClientRect()
            ),
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

        // Multi-row wrap: the 1-D walk below assumes a single row. In wrap use
        // a 2-D hit-test (row by y, slot by x within the row) and a discrete
        // drop indicator instead of the gap animation. Group-chip drags are
        // excluded because they carry group-move semantics ("can't drop
        // inside another group") the single-tab hit-test doesn't model, and
        // chips don't wrap in v1, so they keep the 1-D path (whose gap
        // animation no-ops in wrap anyway).
        if (this._wrapMode && !this._animState.sourceTabGroupId) {
            this.handleWrappedDragOver(event.clientX, event.clientY ?? 0);
            return;
        }

        // Tabs flow along x in a horizontal header and along y in a vertical
        // one, so the walk follows whichever coordinate is the main axis.
        const mousePos = this._mainAxisCoord(event.clientX, event.clientY ?? 0);
        const layout = this._walkStrip();
        const { insertionIndex, targetTabGroupId } = this._resolveDragOver(
            mousePos,
            layout
        );

        if (
            insertionIndex === this._animState.currentInsertionIndex &&
            targetTabGroupId === this._animState.targetTabGroupId
        ) {
            return;
        }

        this._animState.currentInsertionIndex = insertionIndex;
        this._animState.targetTabGroupId = targetTabGroupId;

        if (this.accessor.options.theme?.tabAnimation === 'smooth') {
            this.applyDragOverTransforms(false, layout);
        }
    }

    /**
     * Lay the strip out as the drag sees it: every tab but the dragged
     * one(s), in tab order, at its original (snapshot) main-axis offset, plus
     * the span of each tab group among them. Snapshot sizes keep the walk
     * independent of the gap margins it causes. A tab group's chip sits
     * before its first member; it takes space only while that member stays.
     */
    private _walkStrip(): StripLayout {
        const animState = this._animState!;
        const stops: StripStop[] = [];
        const spans: TabGroupSpan[] = [];
        let offset = 0;
        for (let i = 0; i < this._tabs.length; i++) {
            const tab = this._tabs[i].value;
            const id = tab.panel.id;
            if (
                id === animState.sourceTabId ||
                animState.sourceGroupPanelIds?.has(id)
            ) {
                continue;
            }
            const tabGroup = this._tabGroupAt(i);
            const chip =
                tabGroup?.panelIds[0] === id
                    ? (animState.chipSizes.get(tabGroup.id) ?? 0)
                    : 0;
            const size = this._mainAxisSize(
                animState.tabPositions.get(id) ??
                    tab.element.getBoundingClientRect()
            );
            stops.push({ index: i, start: offset, chip, size });
            offset += chip + size;

            const span = spans[spans.length - 1];
            if (tabGroup && span?.tabGroup === tabGroup) {
                span.last = i;
            } else if (tabGroup) {
                spans.push({ tabGroup, first: i, last: i });
            }
        }
        return { stops, spans, end: offset };
    }

    /**
     * The insertion slot (an index into the live tab list, counting the
     * dragged tab) and the tab group a drop there joins, for the drag image
     * at `mousePos`.
     */
    private _resolveDragOver(
        mousePos: number,
        layout: StripLayout
    ): DragOverTarget {
        const animState = this._animState!;
        const ins = this._insertionIndex(mousePos, layout);
        if (ins === null) {
            return { insertionIndex: null, targetTabGroupId: null };
        }
        if (animState.sourceTabGroupId) {
            // a tab group never lands inside another: snap to the nearer edge
            const span = layout.spans.find(
                ({ first, last }) => ins >= first && ins <= last
            );
            return {
                insertionIndex: span
                    ? nearerEdge(ins, span.first, span.last + 1)
                    : ins,
                targetTabGroupId: null,
            };
        }

        const slotStart =
            animState.containerStart + this._offsetAt(layout, ins);
        const { prev, next } = this._slotNeighbours(ins, animState.sourceTabId);
        // the chip before `next` when the dragged tab sits between them: a
        // collapsed tab group's chip is its whole extent, so half is enough
        const pastChip = (tabGroup: ITabGroup, tabIndex: number): boolean => {
            const fraction =
                tabGroup.collapsed && tabIndex === next && next !== ins
                    ? 0.5
                    : 1;
            const chip = animState.chipSizes.get(tabGroup.id) ?? 0;
            return mousePos >= slotStart + chip * fraction;
        };
        const targetTabGroupId = this.tabGroupAtSlot(
            ins,
            { id: animState.sourceTabId, index: animState.sourceIndex },
            pastChip
        );

        // The dragged tab right before a tab group it joins: the gap goes
        // past the chip, in front of the first member.
        const after = this._tabGroupAt(next);
        const joinsFromBefore =
            next !== ins &&
            after !== undefined &&
            after.id === targetTabGroupId &&
            this._tabGroupAt(prev) !== after;
        return {
            insertionIndex: joinsFromBefore ? next : ins,
            targetTabGroupId,
        };
    }

    /**
     * The slot the drag image's leading edge reaches: a tab moves back once
     * the image covers its chip and half of it (like Chrome's tab drag).
     * Null when no tab but the dragged one is in the strip.
     */
    private _insertionIndex(
        mousePos: number,
        layout: StripLayout
    ): number | null {
        const animState = this._animState!;
        const space =
            mousePos -
            animState.cursorOffsetFromDragStart -
            animState.containerStart;
        let insertionIndex: number | null = null;
        for (const stop of layout.stops) {
            if (stop.start + stop.chip + stop.size / 2 <= space) {
                insertionIndex = stop.index + 1;
                continue;
            }
            insertionIndex ??= stop.index;
            break;
        }
        return insertionIndex;
    }

    /** The original main-axis offset of insertion slot `index`, before the
     *  chip of the tab that follows it. */
    private _offsetAt(layout: StripLayout, index: number): number {
        return (
            layout.stops.find((stop) => stop.index >= index)?.start ??
            layout.end
        );
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
        const targetTabGroupId = this._wrappedTargetTabGroup(
            index,
            clientX,
            clientY
        );
        if (
            index === this._animState.currentInsertionIndex &&
            targetTabGroupId === this._animState.targetTabGroupId
        ) {
            return;
        }
        this._animState.currentInsertionIndex = index;
        this._animState.targetTabGroupId = targetTabGroupId;
        this.updateWrapDropIndicator(index);
    }

    private _wrappedTargetTabGroup(
        index: number,
        clientX: number,
        clientY: number
    ): string | null {
        const { sourceTabId, sourceIndex } = this._animState!;
        return this.tabGroupAtSlot(
            index,
            { id: sourceTabId, index: sourceIndex },
            (tabGroup, tabIndex) =>
                this._pastChip(tabGroup, tabIndex, clientX, clientY)
        );
    }

    /**
     * The tab group a tab dropped at slot `index` (an index into the live
     * tab list) joins: a slot between two members joins their tab group, as
     * does the slot before the first member when `pastChip` says the pointer
     * is past the chip, and a member released at its own slot stays.
     * `pastChip` gets the tab group and the index of the tab after its chip.
     */
    tabGroupAtSlot(
        index: number,
        source: { id: string | null; index: number },
        pastChip: (tabGroup: ITabGroup, tabIndex: number) => boolean
    ): string | null {
        if (this._tabGroupManager.chipRenderers.size === 0) {
            return null;
        }
        const { prev, next } = this._slotNeighbours(index, source.id);
        const after = this._tabGroupAt(next);
        if (
            after &&
            (after === this._tabGroupAt(prev) || pastChip(after, next))
        ) {
            return after.id;
        }

        const own = this._tabGroupAt(source.index);
        if (!own || (index !== source.index && index !== source.index + 1)) {
            return null;
        }
        return own.panelIds[0] !== source.id || pastChip(own, source.index)
            ? own.id
            : null;
    }

    /** The nearest tabs before and after slot `index`, skipping the dragged
     *  tab; -1 or the tab count when there is none. */
    private _slotNeighbours(
        index: number,
        sourceId: string | null
    ): { prev: number; next: number } {
        const isSource = (i: number): boolean =>
            this._tabs[i].value.panel.id === sourceId;
        let prev = index - 1;
        while (prev >= 0 && isSource(prev)) {
            prev--;
        }
        let next = index;
        while (next < this._tabs.length && isSource(next)) {
            next++;
        }
        return { prev, next };
    }

    /** The tab group of the tab at `index`, if there is a tab there. Tab
     *  groups only count while they have chips. */
    private _tabGroupAt(index: number): ITabGroup | undefined {
        if (
            index < 0 ||
            index >= this._tabs.length ||
            this._tabGroupManager.chipRenderers.size === 0
        ) {
            return undefined;
        }
        return this.group.model.getTabGroupForPanel(
            this._tabs[index].value.panel.id
        );
    }

    /** Whether the pointer is on the line of the tab at `tabIndex` (the
     *  first tab after `tabGroup`'s chip) and past the chip. */
    private _pastChip(
        tabGroup: ITabGroup,
        tabIndex: number,
        clientX: number,
        clientY: number
    ): boolean {
        const isVertical = this._direction === 'vertical';
        const cross = isVertical ? clientX : clientY;
        const main = isVertical ? clientY : clientX;
        const tab = this._tabs[tabIndex].value.element.getBoundingClientRect();
        const lineStart = isVertical ? tab.left : tab.top;
        const lineEnd = isVertical ? tab.right : tab.bottom;
        if (cross < lineStart || cross > lineEnd) {
            return false;
        }
        const chip = this._tabGroupManager.chipRenderers
            .get(tabGroup.id)
            ?.chip.element.getBoundingClientRect();
        if (!chip) {
            return true;
        }
        const [chipStart, chipEnd] = isVertical
            ? [chip.left, chip.right]
            : [chip.top, chip.bottom];
        if (chipEnd <= lineStart || chipStart >= lineEnd) {
            return true; // the chip ends the line before
        }
        return main >= (isVertical ? chip.bottom : chip.right);
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

    applyDragOverTransforms(
        skipTransition = false,
        layout?: StripLayout
    ): void {
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
        const gapSize = this._computeGapSize();
        const chipToShift = this._computeChipToShift(
            insertionIndex,
            layout ?? this._walkStrip()
        );
        this._applyGapMargins(
            insertionIndex,
            gapSize,
            chipToShift,
            skipTransition
        );
    }

    /** Gap size for the current drag: the whole group's span for a group
     *  drag, otherwise the source tab's own main-axis size. */
    private _computeGapSize(): number {
        const animState = this._animState!;
        if (animState.sourceTabGroupId && animState.sourceGroupPanelIds) {
            return animState.sourceGapSize;
        }
        const sourceRect = animState.tabPositions.get(animState.sourceTabId);
        return sourceRect
            ? this._mainAxisSize(sourceRect)
            : this.getAverageTabSize();
    }

    /**
     * The chip that takes the gap margin, so the gap shows before the whole
     * tab group: the chip of the tab group whose first member is the first
     * tab at or after the insertion slot, unless the drop joins that tab
     * group (its open tabs show the gap instead) or the dragged tab is one
     * of its members (the gap belongs after the chip, where the tab was). A
     * collapsed tab group's tabs are hidden, so its chip shifts even when
     * the drop joins it.
     */
    private _computeChipToShift(
        insertionIndex: number,
        { stops, spans }: StripLayout
    ): HTMLElement | null {
        const animState = this._animState!;
        const next = stops.find((stop) => stop.index >= insertionIndex);
        const tg = spans.find((span) => span.first === next?.index)?.tabGroup;
        if (
            !tg ||
            tg.panelIds.includes(animState.sourceTabId) ||
            (animState.targetTabGroupId !== null &&
                !(animState.targetTabGroupId === tg.id && tg.collapsed))
        ) {
            return null;
        }
        return (
            this._tabGroupManager.chipRenderers.get(tg.id)?.chip.element ?? null
        );
    }

    /** Reset non-source chip margins, then apply the gap margin to the chip or
     *  the first tab at/after the insertion index. */
    private _applyGapMargins(
        insertionIndex: number,
        gapSize: number,
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
            this._setMargin(chipToShift, `${gapSize}px`, skipTransition);
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
                this._setMargin(tab.element, `${gapSize}px`, skipTransition);
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

    /** Apply the main-axis gap margin to an element, optionally bypassing CSS
     *  transitions for instant positioning. */
    private _setMargin(
        el: HTMLElement,
        value: string,
        skipTransition: boolean
    ): void {
        const property = this._gapMarginProperty;
        if (skipTransition) {
            el.style.transition = 'none';
            el.style.setProperty(property, value);
            el.getBoundingClientRect(); // force reflow before re-enabling
            el.style.removeProperty('transition');
        } else {
            el.style.setProperty(property, value);
        }
        toggleClass(el, this._shiftingClass(el), true);
    }

    /** Clear an element's gap margin, animating it back to zero unless
     *  transitions are skipped. */
    private _clearMargin(el: HTMLElement, skipTransition: boolean): void {
        const cls = this._shiftingClass(el);
        const property = this._gapMarginProperty;

        // Remove any previous pending listener for this element
        const prev = this._pendingMarginCleanups.get(el);
        if (prev) {
            prev();
        }

        if (skipTransition || !el.style.getPropertyValue(property)) {
            el.style.removeProperty(property);
            toggleClass(el, cls, false);
        } else {
            el.style.setProperty(property, '0px');
            toggleClass(el, cls, true);
            const onEnd = () => {
                el.style.removeProperty(property);
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
            entry.chip.element.style.removeProperty('margin-top');
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
        this._tabGroupManager.clearChipDropOverlays();

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
            // A locked group takes no new panels from its header.
            if (this.group.locked) {
                return;
            }
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
        // A move to another group rebuilds the tab group there; when it is
        // collapsed, its new tabs must not run the collapse animation.
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
