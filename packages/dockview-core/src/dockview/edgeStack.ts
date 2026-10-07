import { Emitter, Event } from '../events';
import { CompositeDisposable, IDisposable } from '../lifecycle';
import {
    IView,
    LayoutPriority,
    Orientation,
    Sizing,
    Splitview,
} from '../splitview/splitview';
import { watchElementResize } from '../dom';
import {
    EdgeGroupOptions,
    EdgeGroupPosition,
    IEdgeGroupHost,
} from './dockviewShell';

/** Where a member joins its edge's stack. */
export type EdgeStackMemberPlacement =
    | { index: number }
    | { relativeTo: EdgeGroupView; placement: 'before' | 'after' };

/** Along-axis sizing of a member joining a stack. */
export interface EdgeStackMemberSizing {
    size?: number;
    minimumSize?: number;
    maximumSize?: number;
}

/** Which strip measurements changed: across the edge, along it, or both. */
export interface EdgeStripChangeEvent {
    thickness: boolean;
    length: boolean;
}

/** Thickness (the edge axis) runs across the edge; length runs along it. */
function isThicknessWidth(position: EdgeGroupPosition): boolean {
    return position === 'left' || position === 'right';
}

/**
 * One group inside an edge's stack: the view the stack's inner splitview sizes
 * along the edge. It keeps the group's configured thickness constraints for
 * the stack to aggregate (and for serialization), its own collapse state, and
 * the live measurements of its tab strip on both axes.
 */
export class EdgeGroupView implements IView {
    private readonly _group: IEdgeGroupHost;
    private readonly _options: EdgeGroupOptions;
    private readonly _position: EdgeGroupPosition;
    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;

    readonly snap = false;

    private _isCollapsed = false;
    private _lastExpandedSize = 0;
    private _defaultCollapsedSize: number;
    private _alongMinimumSize: number | undefined;
    private _alongMaximumSize: number;
    private _hasSiblings = false;
    private _lockedToStrip = false;

    // The live cross-axis size of the tab strip: what a collapsed edge
    // occupies in thickness. It wins over the configured collapsed size so the
    // strip tracks a tab height changed at runtime via the
    // `--dv-tabs-and-actions-container-height` CSS variable.
    private _measuredStripThickness: number | undefined;
    // The strip's extent along the edge (its tabs and actions, excluding the
    // empty drag area): what a collapsed member of an expanded edge occupies.
    private _measuredStripLength: number | undefined;

    private readonly _onDidStripChange = new Emitter<EdgeStripChangeEvent>();
    /** Fires when a strip measurement changes, naming the axes that did. */
    readonly onDidStripChange: Event<EdgeStripChangeEvent> =
        this._onDidStripChange.event;

    private readonly _disposables = new CompositeDisposable();

    get element(): HTMLElement {
        return this._group.element;
    }

    get position(): EdgeGroupPosition {
        return this._position;
    }

    get isCollapsed(): boolean {
        return this._isCollapsed;
    }

    /** The along-axis size to expand this member back to. */
    get lastExpandedSize(): number {
        return this._lastExpandedSize;
    }

    /** The user-configured (pre-gap) thickness constraints, for the stack's
     *  aggregate and for serialization. */
    get configuredMinimumSize(): number | undefined {
        return this._options.minimumSize;
    }

    get configuredMaximumSize(): number {
        return this._options.maximumSize ?? Number.POSITIVE_INFINITY;
    }

    get configuredCollapsedSize(): number {
        return this._options.collapsedSize ?? this._defaultCollapsedSize;
    }

    get configuredInitialSize(): number | undefined {
        return this._options.initialSize;
    }

    /** The configured along-axis constraints, for serialization. */
    get alongMinimumSize(): number | undefined {
        return this._alongMinimumSize;
    }

    get alongMaximumSize(): number | undefined {
        return Number.isFinite(this._alongMaximumSize)
            ? this._alongMaximumSize
            : undefined;
    }

    /** The pre-gap thickness this member needs when collapsed: the measured
     *  strip when available, otherwise the configured collapsed size. */
    get collapsedThickness(): number {
        return this._measuredStripThickness ?? this.configuredCollapsedSize;
    }

    /** The pre-gap thickness this member needs when expanded. Without an
     *  explicit minimum, the collapsed size plus 50 keeps the expanded state
     *  visually distinct from the collapsed one. */
    get expandedMinimumThickness(): number {
        return this._options.minimumSize ?? this.collapsedThickness + 50;
    }

    /** The along-axis extent of the tab strip; the configured collapsed size
     *  stands in until the strip has been measured. */
    get stripLength(): number {
        return this._measuredStripLength ?? this.configuredCollapsedSize;
    }

    /** A collapsed member of an expanded edge is pinned to its strip so the
     *  sash cannot drag it open; a lone member fills its edge and has no sash
     *  to clamp against, so it carries no minimum of its own. */
    get minimumSize(): number {
        if (this._lockedToStrip) {
            return this.stripLength;
        }
        if (this._alongMinimumSize !== undefined) {
            return this._alongMinimumSize;
        }
        return this._hasSiblings ? this.stripLength + 50 : 0;
    }

    get maximumSize(): number {
        return this._lockedToStrip ? this.stripLength : this._alongMaximumSize;
    }

    constructor(
        options: EdgeGroupOptions,
        group: IEdgeGroupHost,
        position: EdgeGroupPosition,
        defaultCollapsedSize: number,
        sizing: EdgeStackMemberSizing = {}
    ) {
        this._group = group;
        this._options = options;
        this._position = position;
        this._defaultCollapsedSize = defaultCollapsedSize;
        this._alongMinimumSize = sizing.minimumSize;
        this._alongMaximumSize = sizing.maximumSize ?? Number.POSITIVE_INFINITY;

        group.element.classList.add('dv-edge-group');
        group.element.dataset.testid = `dv-edge-group-${options.id}`;

        if (options.collapsed) {
            this._isCollapsed = true;
            group.element.classList.add('dv-edge-collapsed');
        }

        this._observeStrip();
    }

    /**
     * Watch the group's tab strip so the collapsed sizes follow the live tab
     * dimensions: its cross-axis size is the thickness a collapsed edge
     * occupies, and its tabs-and-actions extent is the length a collapsed
     * member occupies within an expanded edge.
     */
    private _observeStrip(): void {
        const strip = this._group.element.querySelector<HTMLElement>(
            '.dv-tabs-and-actions-container'
        );
        if (!strip) {
            return;
        }
        this._disposables.addDisposables(
            watchElementResize(strip, () => {
                const thicknessIsWidth = isThicknessWidth(this._position);
                const thickness = thicknessIsWidth
                    ? strip.offsetWidth
                    : strip.offsetHeight;
                const extent = thicknessIsWidth
                    ? strip.offsetHeight
                    : strip.offsetWidth;
                const drag = strip.querySelector<HTMLElement>(
                    ':scope > .dv-void-container'
                );
                const dragExtent = drag
                    ? thicknessIsWidth
                        ? drag.offsetHeight
                        : drag.offsetWidth
                    : 0;
                this._applyStripSize(thickness, extent - dragExtent);
            })
        );
    }

    private _applyStripSize(thickness: number, length: number): void {
        const event: EdgeStripChangeEvent = {
            thickness:
                thickness > 0 && thickness !== this._measuredStripThickness,
            length: length > 0 && length !== this._measuredStripLength,
        };
        if (event.thickness) {
            this._measuredStripThickness = thickness;
        }
        if (event.length) {
            this._measuredStripLength = length;
        }
        if (event.thickness || event.length) {
            this._onDidStripChange.fire(event);
        }
    }

    layout(size: number, orthogonalSize: number): void {
        if (!this._lockedToStrip) {
            this._lastExpandedSize = size;
        }
        // The inner splitview runs along the edge: size is the member's
        // length and orthogonalSize the edge's thickness.
        if (isThicknessWidth(this._position)) {
            this._group.layout(orthogonalSize, size);
        } else {
            this._group.layout(size, orthogonalSize);
        }
    }

    setCollapsed(collapsed: boolean): void {
        if (this._isCollapsed === collapsed) {
            return;
        }
        this._isCollapsed = collapsed;
        this._group.element.classList.toggle('dv-edge-collapsed', collapsed);
    }

    /** Pin the member to its strip (a collapsed member of an expanded edge)
     *  or release it. The stack owns the rule; this only applies it. */
    setLockedToStrip(locked: boolean): void {
        this._lockedToStrip = locked;
    }

    setHasSiblings(value: boolean): void {
        this._hasSiblings = value;
    }

    /** Ask the stack's splitview for a new along-axis size. */
    requestSize(size: number): void {
        this._onDidChange.fire({ size });
    }

    setVisible(_visible: boolean): void {
        // visibility is managed by the parent splitview
    }

    /** Restore the along-axis expanded size from serialized state without
     *  triggering a layout. */
    restoreExpandedSize(size: number): void {
        this._lastExpandedSize = size;
    }

    updateDefaultCollapsedSize(size: number): void {
        this._defaultCollapsedSize = size;
    }

    dispose(): void {
        this._disposables.dispose();
        this._onDidStripChange.dispose();
        this._onDidChange.dispose();
    }
}

/**
 * An edge's stack of groups: the view the shell sizes across the edge (its
 * thickness), hosting an inner splitview that sizes the members along it.
 * Collapse is derived: the edge is collapsed, and shrinks to its strip, only
 * when every member is; a collapsed member of an expanded edge is pinned to
 * its strip while its siblings share the rest.
 */
export class EdgeStackView implements IView {
    private readonly _element: HTMLElement;
    private readonly _splitview: Splitview;
    private readonly _members: EdgeGroupView[] = [];
    private readonly _memberListeners = new Map<EdgeGroupView, IDisposable>();
    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;

    readonly snap = false;
    readonly priority = LayoutPriority.Low;
    readonly position: EdgeGroupPosition;

    /** Fires when a sash between two members is released. */
    readonly onDidSashEnd: Event<void>;

    private _lastExpandedSize: number;
    private _gapAdd: number;
    private _defaultCollapsedSize: number;
    // Along-axis sizes a member could not take when requested (no extent
    // yet), applied on the next layout.
    private readonly _pendingMemberSizes = new Map<EdgeGroupView, number>();

    get element(): HTMLElement {
        return this._element;
    }

    get members(): readonly EdgeGroupView[] {
        return this._members;
    }

    /** The edge is collapsed only when every member is. */
    get isCollapsed(): boolean {
        return (
            this._members.length > 0 &&
            this._members.every((member) => member.isCollapsed)
        );
    }

    /** The thickness the edge expands to. */
    get lastExpandedSize(): number {
        return this._lastExpandedSize;
    }

    /** The widest strip among the members, plus the gap contribution. */
    get collapsedSize(): number {
        return (
            this._maxOf((member) => member.collapsedThickness) + this._gapAdd
        );
    }

    get minimumSize(): number {
        // When collapsed, lock size to collapsedSize so sash can't drag it open
        if (this.isCollapsed) {
            return this.collapsedSize;
        }
        return (
            this._maxOf((member) => member.expandedMinimumThickness) +
            this._gapAdd
        );
    }

    get maximumSize(): number {
        if (this.isCollapsed) {
            return this.collapsedSize;
        }
        return this._members.reduce(
            (min, member) => Math.min(min, member.configuredMaximumSize),
            Number.POSITIVE_INFINITY
        );
    }

    /** The inner splitview's along-axis extent; zero until laid out. */
    get axisSize(): number {
        return this._splitview.size;
    }

    constructor(
        position: EdgeGroupPosition,
        options: {
            initialSize: number;
            defaultCollapsedSize: number;
            gapAdd: number;
            gap: number;
        }
    ) {
        this.position = position;
        this._lastExpandedSize = options.initialSize;
        this._defaultCollapsedSize = options.defaultCollapsedSize;
        this._gapAdd = options.gapAdd;

        this._element = document.createElement('div');
        this._element.className = 'dv-edge-stack';
        this._element.dataset.position = position;
        this._element.dataset.testid = `dv-edge-stack-${position}`;

        this._splitview = new Splitview(this._element, {
            orientation: isThicknessWidth(position)
                ? Orientation.VERTICAL
                : Orientation.HORIZONTAL,
            proportionalLayout: true,
            margin: options.gap,
        });
        this.onDidSashEnd = this._splitview.onDidSashEnd;
    }

    private _maxOf(select: (member: EdgeGroupView) => number): number {
        return this._members.reduce(
            (max, member) => Math.max(max, select(member)),
            0
        );
    }

    indexOf(member: EdgeGroupView): number {
        return this._members.indexOf(member);
    }

    /**
     * Add a member at `placement` (default: the end). Without an explicit
     * size a member placed next to a sibling takes half of that sibling's
     * length; otherwise the length is distributed.
     */
    addMember(
        member: EdgeGroupView,
        placement?: EdgeStackMemberPlacement,
        size?: number
    ): void {
        let index = this._members.length;
        let sizing: number | Sizing = Sizing.Distribute;
        if (placement && 'relativeTo' in placement) {
            const anchor = this._members.indexOf(placement.relativeTo);
            index = placement.placement === 'before' ? anchor : anchor + 1;
            sizing = Sizing.Split(anchor);
        } else if (placement) {
            index = placement.index;
        }
        if (size !== undefined) {
            sizing = size;
        }

        this._members.splice(index, 0, member);
        this._splitview.addView(member, sizing, index);
        this._memberListeners.set(
            member,
            member.onDidStripChange((event) => this._onMemberStripChange(event))
        );
        this._syncMembers();
    }

    removeMember(member: EdgeGroupView): void {
        const index = this._members.indexOf(member);
        if (index < 0) {
            return;
        }
        this._members.splice(index, 1);
        this._pendingMemberSizes.delete(member);
        this._memberListeners.get(member)?.dispose();
        this._memberListeners.delete(member);
        this._splitview.removeView(index, Sizing.Distribute);
        member.dispose();
        this._syncMembers();
    }

    /** Reorder a member within the stack, keeping its size. */
    moveMember(member: EdgeGroupView, index: number): void {
        const from = this._members.indexOf(member);
        if (from < 0 || from === index) {
            return;
        }
        this._members.splice(from, 1);
        this._members.splice(index, 0, member);
        this._splitview.moveView(from, index);
        this._syncMembers();
    }

    /**
     * Collapse or expand one member. Within an expanded edge the member's
     * length changes hands with its siblings; when the whole edge collapses
     * or expands the shell resizes the edge's thickness instead.
     */
    setMemberCollapsed(member: EdgeGroupView, collapsed: boolean): void {
        member.setCollapsed(collapsed);
        this._syncMembers();
        if (this.isCollapsed || this._members.length < 2) {
            // a lone member always fills its edge; a collapsed edge keeps
            // every member's length for when it expands
            return;
        }
        for (const other of this._members) {
            if (other !== member && other.isCollapsed) {
                other.requestSize(other.stripLength);
            }
        }
        member.requestSize(
            collapsed ? member.stripLength : member.lastExpandedSize
        );
    }

    /** Resize a member along the edge. The size becomes the member's expanded
     *  size; a collapsed member takes it on expand, and a stack with no extent
     *  yet takes it on its first layout. */
    resizeMember(member: EdgeGroupView, size: number): void {
        const target = Math.round(size);
        if (
            !Number.isFinite(target) ||
            target <= 0 ||
            this._members.length < 2
        ) {
            // a lone member always fills its edge
            return;
        }
        member.restoreExpandedSize(target);
        if (member.isCollapsed && !this.isCollapsed) {
            this._pendingMemberSizes.delete(member);
            return;
        }
        if (this._splitview.size > 0) {
            this._pendingMemberSizes.delete(member);
            this._splitview.resizeView(this._members.indexOf(member), target);
        } else {
            this._pendingMemberSizes.set(member, target);
        }
    }

    /** A member's current along-axis size. */
    getMemberSize(member: EdgeGroupView): number {
        const pending = this._pendingMemberSizes.get(member);
        if (pending !== undefined) {
            return pending;
        }
        const index = this._members.indexOf(member);
        return index < 0 ? 0 : this._splitview.getViewSize(index);
    }

    layout(size: number, orthogonalSize: number): void {
        // Track the last expanded size so we can restore it after collapsing
        if (!this.isCollapsed) {
            this._lastExpandedSize = size;
        }
        // The outer axis is the edge's thickness; the inner splitview runs
        // along the edge.
        this._splitview.layout(orthogonalSize, size);
        this._flushPendingMemberSizes();
    }

    private _flushPendingMemberSizes(): void {
        if (this._pendingMemberSizes.size === 0 || this._splitview.size <= 0) {
            return;
        }
        for (const [member, size] of this._pendingMemberSizes) {
            this._pendingMemberSizes.delete(member);
            this._splitview.resizeView(this._members.indexOf(member), size);
        }
    }

    setVisible(_visible: boolean): void {
        // visibility is managed by the parent splitview
    }

    /**
     * Restore the last-expanded thickness from serialized state without
     * triggering a layout. Must be applied before the members are collapsed
     * during fromJSON so that expanding afterwards restores the correct size.
     */
    restoreExpandedSize(size: number): void {
        this._lastExpandedSize = size;
    }

    /** Apply a new default collapsed size and gap contribution after a theme
     *  or gap change; the ShellManager owns the gap arithmetic. */
    updateSizing(defaultCollapsedSize: number, gapAdd: number): void {
        this._defaultCollapsedSize = defaultCollapsedSize;
        this._gapAdd = gapAdd;
        for (const member of this._members) {
            member.updateDefaultCollapsedSize(defaultCollapsedSize);
        }
    }

    updateMargin(gap: number): void {
        this._splitview.margin = gap;
    }

    /** The sashes between members, in stack order. */
    get sashElements(): HTMLElement[] {
        return Array.from(
            this._element.querySelectorAll<HTMLElement>(
                ':scope > .dv-split-view-container > .dv-sash-container > .dv-sash'
            )
        );
    }

    /** A collapsed edge shows only strips, so its inner sashes are inert; in
     *  an expanded edge each collapsed member is pinned to its strip. */
    private _syncMembers(): void {
        const edgeCollapsed = this.isCollapsed;
        const hasSiblings = this._members.length > 1;
        for (const member of this._members) {
            member.setHasSiblings(hasSiblings);
            member.setLockedToStrip(member.isCollapsed && !edgeCollapsed);
        }
        this._splitview.disabled = edgeCollapsed;
    }

    /** A strip measurement changed: a collapsed edge follows the widest strip
     *  (the shell's splitview resizes it), a pinned member follows its own
     *  strip's length. */
    private _onMemberStripChange(event: EdgeStripChangeEvent): void {
        if (this.isCollapsed) {
            if (event.thickness) {
                this._onDidChange.fire({ size: this.collapsedSize });
            }
            return;
        }
        if (!event.length || this._members.length < 2) {
            return;
        }
        for (const member of this._members) {
            if (member.isCollapsed) {
                member.requestSize(member.stripLength);
            }
        }
    }

    dispose(): void {
        for (const listener of this._memberListeners.values()) {
            listener.dispose();
        }
        this._memberListeners.clear();
        for (const member of this._members) {
            member.dispose();
        }
        this._members.length = 0;
        this._splitview.dispose();
        this._onDidChange.dispose();
        this._element.remove();
    }
}
