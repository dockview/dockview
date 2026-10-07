import { Emitter, Event } from '../events';
import { CompositeDisposable, IDisposable } from '../lifecycle';
import {
    IView,
    LayoutPriority,
    Orientation,
    Splitview,
} from '../splitview/splitview';
import { isInDocument, watchElementResize } from '../dom';
import {
    EdgeGroupView,
    EdgeStackMemberPlacement,
    EdgeStackView,
} from './edgeStack';

export type EdgeGroupPosition = 'top' | 'bottom' | 'left' | 'right';

export interface EdgeGroupOptions {
    id: string;
    initialSize?: number;
    minimumSize?: number;
    maximumSize?: number;
    collapsedSize?: number;
    collapsed?: boolean;
}

/**
 * Options accepted by `api.addEdgeGroup`. Extends the shell's geometry options
 * with per-group presentation flags the component (not the shell) owns.
 */
export interface AddEdgeGroupOptions extends EdgeGroupOptions {
    /**
     * Opt this edge group in/out of auto-hide (pinnable tool-window) behaviour,
     * overriding the global `autoHideEdgeGroups` option. Requires the
     * auto-hide module to have any effect. Leave unset to inherit the global.
     */
    autoHide?: boolean;
    /**
     * When true, this edge group tears itself down to zero footprint once
     * emptied (instead of collapsing to a strip). This is the behaviour used
     * by drag-revealed edges.
     */
    autoReveal?: boolean;
    /**
     * Where this group joins the groups already stacked on its edge. Only
     * read when the edge is occupied; requires the stacked edge groups
     * feature with `stackedEdgeGroups` enabled for that edge. The thickness
     * options above (`initialSize`, `minimumSize`, `maximumSize`,
     * `collapsedSize`) describe the whole edge, so for a stacked group they
     * are folded into the edge's constraints and `initialSize` is ignored.
     */
    stack?: EdgeStackPlacement;
}

/**
 * Where a group joins the stack on its edge, and how it is sized along it:
 * height for `left`/`right`, width for `top`/`bottom`.
 */
export interface EdgeStackPlacement {
    /** Insert index in the edge's stack. Default: the end. */
    index?: number;
    /** Id of a group on the same edge to insert next to; wins over `index`. */
    relativeTo?: string;
    /** Which side of `relativeTo` to insert on. Default `'after'`. */
    placement?: 'before' | 'after';
    /** Size along the edge, in px. Default: half of `relativeTo`'s size,
     *  otherwise an even share of the edge. */
    size?: number;
    /** Minimum size along the edge. Default: the tab strip's length + 50. */
    minimumSize?: number;
    /** Maximum size along the edge. Default: unbounded. */
    maximumSize?: number;
}

export interface SerializedEdgeGroup {
    size: number;
    visible: boolean;
    collapsed?: boolean;
    group?: unknown;
    /** Per-group auto-hide override (drag-revealed / co-existence). Absent =
     *  inherit the global `autoHideEdgeGroups` option. */
    autoHide?: boolean;
    /** Per-group "tear down to zero footprint when emptied" flag. */
    autoReveal?: boolean;
    /** User-configured geometry constraints (as passed to `addEdgeGroup`), so
     *  they survive the auto-create fromJSON path. Absent = use the defaults. */
    minimumSize?: number;
    maximumSize?: number;
    collapsedSize?: number;
}

/** One group of a stacked edge. */
export interface SerializedEdgeStackGroup {
    /** Size along the edge. */
    size: number;
    collapsed?: boolean;
    group?: unknown;
    autoHide?: boolean;
    autoReveal?: boolean;
    /** Constraints along the edge, as passed in `stack`. */
    minimumSize?: number;
    maximumSize?: number;
}

/**
 * An edge holding more than one group. A superset of {@link SerializedEdgeGroup}:
 * the inherited fields describe the edge (thickness, visibility, whether every
 * group is collapsed) and its first group, so a reader of the single-group
 * shape still restores that group; `groups` carries the whole stack in order.
 */
export interface SerializedEdgeStack extends SerializedEdgeGroup {
    groups: SerializedEdgeStackGroup[];
}

export interface SerializedEdgeGroups {
    top?: SerializedEdgeGroup | SerializedEdgeStack;
    bottom?: SerializedEdgeGroup | SerializedEdgeStack;
    left?: SerializedEdgeGroup | SerializedEdgeStack;
    right?: SerializedEdgeGroup | SerializedEdgeStack;
}

/** Whether a serialized edge carries a stack of groups. */
export function isSerializedEdgeStack(
    entry: SerializedEdgeGroup | SerializedEdgeStack
): entry is SerializedEdgeStack {
    return Array.isArray((entry as SerializedEdgeStack).groups);
}

/**
 * Minimal interface for a edge group host.
 * Avoids circular imports by not referencing DockviewGroupPanel directly.
 */
export interface IEdgeGroupHost {
    readonly element: HTMLElement;
    layout(width: number, height: number): void;
}

class CenterView implements IView {
    readonly priority = LayoutPriority.High;
    readonly minimumSize = 100;
    readonly maximumSize = Number.POSITIVE_INFINITY;

    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;

    get element(): HTMLElement {
        return this._dockviewElement;
    }

    constructor(
        private readonly _dockviewElement: HTMLElement,
        private readonly _layoutDockview: (
            width: number,
            height: number
        ) => void
    ) {}

    layout(size: number, orthogonalSize: number): void {
        // Lives in a VERTICAL middle-column splitview:
        // size = height alloc, orthogonalSize = width
        this._layoutDockview(orthogonalSize, size);
    }

    setVisible(_visible: boolean): void {
        // center is always visible
    }

    dispose(): void {
        this._onDidChange.dispose();
    }
}

/**
 * The vertical centre column: top (optional) | center | bottom (optional).
 * This view sits between the left and right edge panels in the outer
 * horizontal splitview, so its primary axis is width (horizontal).
 */
class MiddleColumnView implements IView, IDisposable {
    private readonly _element: HTMLElement;
    private readonly _splitview: Splitview;
    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();

    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;
    readonly minimumSize = 100;
    readonly maximumSize = Number.POSITIVE_INFINITY;
    readonly priority = LayoutPriority.High;

    private _topIndex: number | undefined;
    private _centerIndex: number;
    private _bottomIndex: number | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(centerView: CenterView, gap = 0) {
        this._element = document.createElement('div');
        this._element.className = 'dv-shell-middle-column';
        this._element.style.height = '100%';
        this._element.style.width = '100%';

        this._splitview = new Splitview(this._element, {
            orientation: Orientation.VERTICAL,
            proportionalLayout: false,
            margin: gap,
        });

        this._centerIndex = 0;
        this._splitview.addView(centerView, { type: 'distribute' }, 0);
    }

    /** Fires when the sash between the centre and an edge is released. */
    get onDidSashEnd(): Event<void> {
        return this._splitview.onDidSashEnd;
    }

    addTopView(view: IView, initialSize: number): void {
        // Insert before center
        this._splitview.addView(view, initialSize, 0);
        this._topIndex = 0;
        this._centerIndex += 1;
        if (this._bottomIndex !== undefined) {
            this._bottomIndex += 1;
        }
    }

    addBottomView(view: IView, initialSize: number): void {
        // Append after center (and any existing bottom; shouldn't happen but safe)
        const newIndex = this._splitview.length;
        this._splitview.addView(view, initialSize, newIndex);
        this._bottomIndex = newIndex;
    }

    removeView(position: 'top' | 'bottom'): void {
        const index = position === 'top' ? this._topIndex : this._bottomIndex;
        if (index === undefined) {
            return;
        }
        this._splitview.removeView(index);
        if (position === 'top') {
            this._topIndex = undefined;
            // center (and bottom if present) shift down by one
            this._centerIndex -= 1;
            if (this._bottomIndex !== undefined) {
                this._bottomIndex -= 1;
            }
        } else {
            this._bottomIndex = undefined;
            // center and top are unaffected
        }
    }

    layout(size: number, orthogonalSize: number): void {
        // Outer horizontal splitview: size = width, orthogonalSize = height
        // Inner vertical splitview: layout(height, width)
        this._splitview.layout(orthogonalSize, size);
    }

    setVisible(_visible: boolean): void {
        // middle column is always visible
    }

    setViewVisible(position: 'top' | 'bottom', visible: boolean): void {
        const index = position === 'top' ? this._topIndex : this._bottomIndex;
        if (index !== undefined) {
            this._splitview.setViewVisible(index, visible);
        }
    }

    isViewVisible(position: 'top' | 'bottom'): boolean {
        const index = position === 'top' ? this._topIndex : this._bottomIndex;
        if (index !== undefined) {
            return this._splitview.isViewVisible(index);
        }
        return false;
    }

    getViewSize(position: 'top' | 'bottom'): number {
        const index = position === 'top' ? this._topIndex : this._bottomIndex;
        if (index !== undefined) {
            return this._splitview.getViewSize(index);
        }
        return 0;
    }

    getViewCachedVisibleSize(position: 'top' | 'bottom'): number | undefined {
        const index = position === 'top' ? this._topIndex : this._bottomIndex;
        if (index !== undefined) {
            return this._splitview.getViewCachedVisibleSize(index);
        }
        return undefined;
    }

    resizeView(position: 'top' | 'bottom', size: number): void {
        const index = position === 'top' ? this._topIndex : this._bottomIndex;
        if (index !== undefined) {
            this._splitview.resizeView(index, size);
        }
    }

    /** The inner splitview's primary-axis (height) extent; zero until laid out. */
    get axisSize(): number {
        return this._splitview.size;
    }

    updateMargin(gap: number): void {
        this._splitview.margin = gap;
    }

    dispose(): void {
        this._onDidChange.dispose();
        this._splitview.dispose();
    }
}

/** How a new member joins the stack at its edge, resolved to live views. */
export interface ShellStackPlacement {
    index?: number;
    relativeTo?: IEdgeGroupHost;
    placement?: 'before' | 'after';
    size?: number;
    minimumSize?: number;
    maximumSize?: number;
}

const EDGE_POSITIONS: readonly EdgeGroupPosition[] = [
    'left',
    'right',
    'top',
    'bottom',
];

export class ShellManager implements IDisposable {
    private readonly _outerSplitview: Splitview;
    private readonly _middleColumn: MiddleColumnView;
    private readonly _shellElement: HTMLElement;

    // One stack per occupied edge, and each group's member view within it.
    private readonly _stacks = new Map<EdgeGroupPosition, EdgeStackView>();
    private readonly _stackDisposables = new Map<
        EdgeGroupPosition,
        CompositeDisposable
    >();
    private readonly _members = new Map<IEdgeGroupHost, EdgeGroupView>();

    // Indices in the outer HORIZONTAL splitview
    private _leftIndex: number | undefined;
    private _middleIndex: number;
    private _rightIndex: number | undefined;

    private readonly _disposables = new CompositeDisposable();

    // Thicknesses an edge could not take when they were requested (hidden, or
    // no extent yet), applied as soon as it can.
    private readonly _pendingSizes = new Map<EdgeGroupPosition, number>();
    private _currentWidth = 0;
    private _currentHeight = 0;
    private _gap: number;
    private _defaultCollapsedSize: number;

    private readonly _onDidSashEnd = new Emitter<void>();
    /** Fires when any shell sash (around an edge, or between two groups
     *  stacked on one) is released. */
    readonly onDidSashEnd: Event<void> = this._onDidSashEnd.event;

    constructor(
        container: HTMLElement,
        dockviewElement: HTMLElement,
        layoutGrid: (width: number, height: number) => void,
        gap = 0,
        defaultCollapsedSize = 35
    ) {
        this._gap = gap;
        this._defaultCollapsedSize = defaultCollapsedSize;

        this._shellElement = document.createElement('div');
        this._shellElement.className = 'dv-shell';
        this._shellElement.style.height = '100%';
        this._shellElement.style.width = '100%';
        this._shellElement.style.position = 'relative';
        container.appendChild(this._shellElement);

        const centerView = new CenterView(dockviewElement, layoutGrid);

        this._middleColumn = new MiddleColumnView(centerView, gap);

        this._outerSplitview = new Splitview(this._shellElement, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
            margin: gap,
        });

        this._middleIndex = 0;
        this._outerSplitview.addView(
            this._middleColumn,
            { type: 'distribute' },
            0
        );

        this._disposables.addDisposables(
            watchElementResize(this._shellElement, (entry) => {
                /**
                 * When the shell (or an ancestor) becomes hidden — e.g. a
                 * nested dockview whose `onlyWhenVisible` host panel is
                 * deactivated — the element collapses to (0, 0) or is detached
                 * from the DOM. Propagating that zero size would relayout the
                 * edge-group splitview at 0, clamping the low-priority edge
                 * groups down to their minimum size and destroying the user's
                 * sizing. Skip these cases so sizes are preserved while hidden;
                 * mirrors the guard in the `Resizable` base class. See #1495.
                 *
                 * offsetParent === null is equivalent to display: none on the
                 * element or one of its ancestors.
                 * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetParent
                 */
                if (!this._shellElement.offsetParent) {
                    return;
                }

                if (!isInDocument(this._shellElement)) {
                    return;
                }

                const width = Math.round(entry.contentRect.width);
                const height = Math.round(entry.contentRect.height);
                if (
                    width === this._currentWidth &&
                    height === this._currentHeight
                ) {
                    return;
                }
                this._currentWidth = width;
                this._currentHeight = height;
                this.layout(width, height);
            }),
            Event.any(
                this._outerSplitview.onDidSashEnd,
                this._middleColumn.onDidSashEnd
            )(() => this._onDidSashEnd.fire()),
            this._onDidSashEnd,
            this._outerSplitview,
            this._middleColumn,
            centerView
        );
    }

    get element(): HTMLElement {
        return this._shellElement;
    }

    /**
     * Add a group to the edge at `position`: the first group creates the
     * edge's stack and inserts it into the shell's splitview layout; later
     * ones join that stack at `stack`'s placement (default: the end).
     * Returns the group's member view.
     */
    addEdgeView(
        position: EdgeGroupPosition,
        options: EdgeGroupOptions,
        group: IEdgeGroupHost,
        stack: ShellStackPlacement = {}
    ): EdgeGroupView {
        const existing = this._stacks.get(position);
        const stackView =
            existing ?? this._createStack(position, options.initialSize ?? 200);

        const member = new EdgeGroupView(
            options,
            group,
            position,
            this._defaultCollapsedSize,
            stack
        );
        this._members.set(group, member);

        const wasCollapsed = stackView.isCollapsed;
        stackView.addMember(member, this._resolvePlacement(stack), stack.size);

        if (!existing) {
            this._insertStack(position, stackView);
        } else if (wasCollapsed && !stackView.isCollapsed) {
            // an expanded member joining a collapsed edge expands it
            this._applyEdgeCollapsed(position, stackView);
        }

        // Recalculate gap adjustments for all views now that n has changed.
        // updateTheme already guards the layout() call by _currentWidth/_currentHeight.
        this.updateTheme(this._gap, this._defaultCollapsedSize);

        return member;
    }

    private _resolvePlacement(
        stack: ShellStackPlacement
    ): EdgeStackMemberPlacement | undefined {
        const anchor = stack.relativeTo && this._members.get(stack.relativeTo);
        if (anchor) {
            return {
                relativeTo: anchor,
                placement: stack.placement ?? 'after',
            };
        }
        return stack.index === undefined ? undefined : { index: stack.index };
    }

    private _createStack(
        position: EdgeGroupPosition,
        initialSize: number
    ): EdgeStackView {
        const stack = new EdgeStackView(position, {
            initialSize,
            defaultCollapsedSize: this._defaultCollapsedSize,
            gapAdd: 0,
            gap: this._gap,
        });
        this._stacks.set(position, stack);
        const disposables = new CompositeDisposable(
            stack.onDidSashEnd(() => this._onDidSashEnd.fire()),
            stack
        );
        this._stackDisposables.set(position, disposables);
        this._disposables.addDisposables(disposables);
        return stack;
    }

    private _insertStack(
        position: EdgeGroupPosition,
        stack: EdgeStackView
    ): void {
        const initialSize = stack.isCollapsed
            ? stack.collapsedSize
            : stack.lastExpandedSize;

        switch (position) {
            case 'left':
                // Insert before the middle column
                this._outerSplitview.addView(stack, initialSize, 0);
                this._leftIndex = 0;
                this._middleIndex += 1;
                if (this._rightIndex !== undefined) {
                    this._rightIndex += 1;
                }
                break;
            case 'right':
                // Append after the middle column
                {
                    const idx = this._outerSplitview.length;
                    this._outerSplitview.addView(stack, initialSize, idx);
                    this._rightIndex = idx;
                }
                break;
            case 'top':
                this._middleColumn.addTopView(stack, initialSize);
                break;
            case 'bottom':
                this._middleColumn.addBottomView(stack, initialSize);
                break;
        }

        // With no extent yet, splitview clamps the add down to the minimum
        // size, so hold the requested size for the first layout.
        if (!stack.isCollapsed && !this._canResize(position)) {
            this._pendingSizes.set(position, initialSize);
        }
    }

    /**
     * Lay out from the shell's current size.
     *
     * The ResizeObserver above only reports asynchronously, so between
     * construction and its first callback the shell believes it has no size -
     * and any layout built in that window (panels added straight after
     * `createDockview`, say) resolves its sizes against zero and collapses to
     * minimums, permanently. Seeding the size synchronously gives that work
     * the real dimensions. Same guards as the observer: a detached or hidden
     * shell has no size worth propagating.
     */
    layoutFromElement(): void {
        if (
            !this._shellElement.offsetParent ||
            !isInDocument(this._shellElement)
        ) {
            return;
        }

        const width = Math.round(this._shellElement.clientWidth);
        const height = Math.round(this._shellElement.clientHeight);

        if (width === 0 || height === 0) {
            return;
        }

        this.layout(width, height);
    }

    layout(width: number, height: number): void {
        // Outer splitview is HORIZONTAL: layout(size=width, orthogonalSize=height)
        this._outerSplitview.layout(width, height);
        this._flushPendingSizes();
    }

    /**
     * Called when the active theme changes. Updates splitview margins and
     * edge-group collapsed sizes so the layout matches the new theme's gap
     * and tab-strip dimensions.
     */
    updateTheme(gap: number, defaultCollapsedSize: number): void {
        this._gap = gap;
        this._defaultCollapsedSize = defaultCollapsedSize;

        const outerN =
            1 +
            (this._stacks.has('left') ? 1 : 0) +
            (this._stacks.has('right') ? 1 : 0);
        const innerN =
            1 +
            (this._stacks.has('top') ? 1 : 0) +
            (this._stacks.has('bottom') ? 1 : 0);
        const outerGapAdd = outerN > 1 ? (gap * (outerN - 1)) / outerN : 0;
        const innerGapAdd = innerN > 1 ? (gap * (innerN - 1)) / innerN : 0;

        // Update splitview margins.
        this._outerSplitview.margin = gap;
        this._middleColumn.updateMargin(gap);

        // Recompute effective collapsed sizes from the original config values.
        for (const [position, stack] of this._stacks) {
            stack.updateSizing(
                defaultCollapsedSize,
                position === 'left' || position === 'right'
                    ? outerGapAdd
                    : innerGapAdd
            );
            stack.updateMargin(gap);
        }

        // Resize currently-collapsed edges to their new collapsed size so
        // they immediately match the new theme's tab-strip dimensions.
        for (const position of EDGE_POSITIONS) {
            const stack = this._stacks.get(position);
            if (stack?.isCollapsed) {
                this._resizeView(position, stack.collapsedSize);
            }
        }

        // Re-run layout with the current shell dimensions.
        if (this._currentWidth > 0 && this._currentHeight > 0) {
            this.layout(this._currentWidth, this._currentHeight);
        }
    }

    /**
     * Remove a group from its edge. The edge's stack, and its slot in the
     * shell's splitview layout, go with the last member.
     */
    removeEdgeView(group: IEdgeGroupHost): void {
        const member = this._members.get(group);
        if (!member) {
            return;
        }
        const position = member.position;
        const stack = this._stacks.get(position)!;
        this._members.delete(group);

        if (stack.members.length > 1) {
            const wasCollapsed = stack.isCollapsed;
            stack.removeMember(member);
            if (!wasCollapsed && stack.isCollapsed) {
                // the only expanded member left: the edge shrinks to a strip
                this._applyEdgeCollapsed(position, stack);
            }
            return;
        }

        switch (position) {
            case 'left':
                this._outerSplitview.removeView(this._leftIndex!);
                this._leftIndex = undefined;
                // middle and right shift left by one
                this._middleIndex -= 1;
                if (this._rightIndex !== undefined) {
                    this._rightIndex -= 1;
                }
                break;
            case 'right':
                this._outerSplitview.removeView(this._rightIndex!);
                this._rightIndex = undefined;
                break;
            case 'top':
            case 'bottom':
                this._middleColumn.removeView(position);
                break;
        }

        // Deregister before disposing to avoid double-dispose when ShellManager
        // itself is eventually disposed.
        const disposables = this._stackDisposables.get(position)!;
        this._stackDisposables.delete(position);
        this._disposables.removeDisposable(disposables);
        disposables.dispose();

        this._stacks.delete(position);
        this._pendingSizes.delete(position);

        // Recalculate gap adjustments for remaining views.
        this.updateTheme(this._gap, this._defaultCollapsedSize);
    }

    /** Reorder a group within its edge's stack. */
    moveEdgeView(group: IEdgeGroupHost, index: number): void {
        const member = this._members.get(group);
        if (member) {
            this._stacks.get(member.position)!.moveMember(member, index);
        }
    }

    hasEdgeGroup(position: EdgeGroupPosition): boolean {
        return this._stacks.has(position);
    }

    /** The element wrapping every group stacked on an edge. */
    getEdgeStackElement(position: EdgeGroupPosition): HTMLElement | undefined {
        return this._stacks.get(position)?.element;
    }

    setEdgeGroupVisible(position: EdgeGroupPosition, visible: boolean): void {
        switch (position) {
            case 'left':
                if (this._leftIndex !== undefined) {
                    this._outerSplitview.setViewVisible(
                        this._leftIndex,
                        visible
                    );
                }
                break;
            case 'right':
                if (this._rightIndex !== undefined) {
                    this._outerSplitview.setViewVisible(
                        this._rightIndex,
                        visible
                    );
                }
                break;
            case 'top':
            case 'bottom':
                this._middleColumn.setViewVisible(position, visible);
                break;
        }

        if (visible) {
            // a hidden view is pinned to zero, so any held size waits for this
            this._flushPendingSizes();
        }
    }

    isEdgeGroupVisible(position: EdgeGroupPosition): boolean {
        switch (position) {
            case 'left':
                if (this._leftIndex !== undefined) {
                    return this._outerSplitview.isViewVisible(this._leftIndex);
                }
                return false;
            case 'right':
                if (this._rightIndex !== undefined) {
                    return this._outerSplitview.isViewVisible(this._rightIndex);
                }
                return false;
            case 'top':
            case 'bottom':
                return this._middleColumn.isViewVisible(position);
        }
    }

    /**
     * Collapse or expand one group. The edge itself collapses to its strip
     * only once every group stacked on it is collapsed, and expands as soon
     * as one of them does.
     */
    setEdgeGroupCollapsed(group: IEdgeGroupHost, collapsed: boolean): void {
        const member = this._members.get(group);
        if (!member) {
            return;
        }
        const stack = this._stacks.get(member.position)!;
        const wasCollapsed = stack.isCollapsed;
        stack.setMemberCollapsed(member, collapsed);
        if (stack.isCollapsed !== wasCollapsed) {
            this._applyEdgeCollapsed(member.position, stack);
        }
    }

    private _applyEdgeCollapsed(
        position: EdgeGroupPosition,
        stack: EdgeStackView
    ): void {
        if (stack.isCollapsed) {
            // the strip size wins; a later expand uses the recorded expanded size
            this._pendingSizes.delete(position);
            this._resizeView(position, stack.collapsedSize);
        } else {
            this.resizeEdgeGroup(position, stack.lastExpandedSize);
        }
    }

    /**
     * Resize the edge at `position` along its primary axis (width for
     * `left`/`right`, height for `top`/`bottom`), clamped by the groups'
     * constraints and the space available. Where `groupApi.setSize` lands
     * for that axis.
     *
     * The size becomes the edge's expanded size, so a collapsed edge keeps
     * its strip and takes it on expand, and it survives a `toJSON` round-trip.
     */
    resizeEdgeGroup(position: EdgeGroupPosition, size: number): void {
        const stack = this._stacks.get(position);
        if (!stack || !Number.isFinite(size)) {
            return;
        }

        const target = Math.round(size);
        if (target <= 0) {
            return;
        }

        stack.restoreExpandedSize(target);

        if (stack.isCollapsed) {
            this._pendingSizes.delete(position);
            return;
        }

        if (this._canResize(position)) {
            this._pendingSizes.delete(position);
            this._resizeView(position, target);
        } else {
            this._pendingSizes.set(position, target);
        }
    }

    /** Resize one group along its edge (height for `left`/`right`, width for
     *  `top`/`bottom`); its siblings in the stack give or take the room. */
    resizeStackMember(group: IEdgeGroupHost, size: number): void {
        const member = this._members.get(group);
        if (member) {
            this._stacks.get(member.position)!.resizeMember(member, size);
        }
    }

    /** A group's current size along its edge. */
    getStackMemberSize(group: IEdgeGroupHost): number {
        const member = this._members.get(group);
        return member
            ? this._stacks.get(member.position)!.getMemberSize(member)
            : 0;
    }

    /** A resize lands only on a visible view (a hidden one is pinned to zero)
     *  whose splitview has extent to distribute. */
    private _canResize(position: EdgeGroupPosition): boolean {
        if (!this.isEdgeGroupVisible(position)) {
            return false;
        }
        const axisSize =
            position === 'left' || position === 'right'
                ? this._outerSplitview.size
                : this._middleColumn.axisSize;
        return axisSize > 0;
    }

    private _resizeView(position: EdgeGroupPosition, size: number): void {
        switch (position) {
            case 'left':
                if (this._leftIndex !== undefined) {
                    this._outerSplitview.resizeView(this._leftIndex, size);
                }
                break;
            case 'right':
                if (this._rightIndex !== undefined) {
                    this._outerSplitview.resizeView(this._rightIndex, size);
                }
                break;
            case 'top':
            case 'bottom':
                this._middleColumn.resizeView(position, size);
                break;
        }
    }

    private _flushPendingSizes(): void {
        if (this._pendingSizes.size === 0) {
            return;
        }
        for (const [position, size] of this._pendingSizes) {
            const stack = this._stacks.get(position);
            if (!stack || stack.isCollapsed || !this._canResize(position)) {
                continue;
            }
            this._pendingSizes.delete(position);
            this._resizeView(position, size);
        }
    }

    /** Whether this group is collapsed within its edge. */
    isEdgeGroupCollapsed(group: IEdgeGroupHost): boolean {
        return this._members.get(group)?.isCollapsed ?? false;
    }

    /** Whether the edge is collapsed to a strip: every group on it is. */
    isEdgeCollapsed(position: EdgeGroupPosition): boolean {
        return this._stacks.get(position)?.isCollapsed ?? false;
    }

    /** The size an edge expands to (its pre-collapse size), used to size the
     *  auto-hide peek overlay. */
    getEdgeGroupExpandedSize(position: EdgeGroupPosition): number {
        return this._stacks.get(position)?.lastExpandedSize ?? 0;
    }

    private _getViewSize(position: EdgeGroupPosition): number {
        switch (position) {
            case 'left':
                return this._outerSplitview.getViewSize(this._leftIndex!);
            case 'right':
                return this._outerSplitview.getViewSize(this._rightIndex!);
            case 'top':
            case 'bottom':
                return this._middleColumn.getViewSize(position);
        }
    }

    private _getViewCachedVisibleSize(
        position: EdgeGroupPosition
    ): number | undefined {
        switch (position) {
            case 'left':
                return this._outerSplitview.getViewCachedVisibleSize(
                    this._leftIndex!
                );
            case 'right':
                return this._outerSplitview.getViewCachedVisibleSize(
                    this._rightIndex!
                );
            case 'top':
            case 'bottom':
                return this._middleColumn.getViewCachedVisibleSize(position);
        }
    }

    /** The thickness to restore an edge to. An expanded-but-hidden edge
     *  reports a live size of 0, so fall back to its cached visible size
     *  (then its expanded size); otherwise re-showing snaps to minimumSize. */
    private _serializedSize(
        position: EdgeGroupPosition,
        stack: EdgeStackView,
        visible: boolean
    ): number {
        if (stack.isCollapsed) {
            return stack.lastExpandedSize;
        }
        // a held size is the size the edge will take, so persist that
        // rather than the size it is stranded at
        const pending = this._pendingSizes.get(position);
        if (pending !== undefined) {
            return pending;
        }
        if (!visible) {
            return (
                this._getViewCachedVisibleSize(position) ??
                stack.lastExpandedSize
            );
        }
        return this._getViewSize(position);
    }

    toJSON(): SerializedEdgeGroups {
        const edgeGroups: SerializedEdgeGroups = {};

        for (const position of EDGE_POSITIONS) {
            const stack = this._stacks.get(position);
            if (!stack) {
                continue;
            }
            const visible = this.isEdgeGroupVisible(position);
            // The first group's user-configured constraints, so the
            // auto-create fromJSON path restores them. Omit
            // unconfigured/Infinity values (Infinity isn't JSON-representable)
            // so they fall back to defaults on restore.
            const first = stack.members[0];
            const entry: SerializedEdgeGroup = {
                size: this._serializedSize(position, stack, visible),
                visible,
                collapsed: stack.isCollapsed || undefined,
                minimumSize: first.configuredMinimumSize,
                maximumSize: Number.isFinite(first.configuredMaximumSize)
                    ? first.configuredMaximumSize
                    : undefined,
                collapsedSize: first.configuredCollapsedSize,
            };
            // A lone group keeps the single-group shape; a stack adds every
            // member's along-axis state.
            edgeGroups[position] =
                stack.members.length > 1
                    ? {
                          ...entry,
                          groups: stack.members.map((member) => ({
                              size: stack.getMemberSize(member),
                              collapsed: member.isCollapsed || undefined,
                              minimumSize: member.alongMinimumSize,
                              maximumSize: member.alongMaximumSize,
                          })),
                      }
                    : entry;
        }

        return edgeGroups;
    }

    /** Restore each member's along-axis state; a member the stack does not
     *  hold (a stack restored without the feature) is skipped. */
    private _restoreMembers(
        stack: EdgeStackView,
        groups: SerializedEdgeStackGroup[]
    ): void {
        groups.forEach((state, index) => {
            const member = stack.members[index];
            if (!member) {
                return;
            }
            member.restoreExpandedSize(state.size);
            stack.setMemberCollapsed(member, state.collapsed ?? false);
            stack.resizeMember(member, state.size);
        });
    }

    fromJSON(data: SerializedEdgeGroups): void {
        for (const position of EDGE_POSITIONS) {
            const state = data[position];
            const stack = this._stacks.get(position);
            if (!state || !stack) {
                continue;
            }

            // Always restore the expanded size first. toJSON always records the
            // expanded size (even when collapsed), so it must be applied before
            // the collapse locks min/max to collapsedSize.
            stack.restoreExpandedSize(state.size);
            if (isSerializedEdgeStack(state)) {
                this._restoreMembers(stack, state.groups);
            } else {
                stack.setMemberCollapsed(
                    stack.members[0],
                    state.collapsed ?? false
                );
            }

            if (stack.isCollapsed) {
                this._pendingSizes.delete(position);
                this._resizeView(position, stack.collapsedSize);
            } else {
                // via resizeEdgeGroup so a restore onto a shell with no extent
                // yet is held for the first layout rather than clamped away
                this.resizeEdgeGroup(position, state.size);
            }

            // both ways: showing also flushes the size restored above
            this.setEdgeGroupVisible(position, !!state.visible);
        }
    }

    dispose(): void {
        this._disposables.dispose();
        this._shellElement.remove();
    }
}
