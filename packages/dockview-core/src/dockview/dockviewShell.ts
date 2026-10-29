import { Emitter, Event } from '../events';
import { CompositeDisposable, IDisposable } from '../lifecycle';
import {
    IView,
    LayoutPriority,
    Orientation,
    Splitview,
} from '../splitview/splitview';
import { isInDocument, watchElementResize } from '../dom';
import { DockviewHeaderPosition } from './options';

export type EdgeGroupPosition = 'top' | 'bottom' | 'left' | 'right';

const EDGE_POSITIONS: readonly EdgeGroupPosition[] = [
    'left',
    'right',
    'top',
    'bottom',
];

export function isHorizontal(position: EdgeGroupPosition): boolean {
    return position === 'left' || position === 'right';
}

/** What an edge view reads live from the splitview it sits in. */
export interface IEdgeGroupAxis {
    /** The size each visible view gives up to the margins between them. */
    readonly marginShare: number;
    /** The splitview's extent along the axis; zero until it is laid out. */
    readonly size: number;
}

/** A view outside a shell: no gap, and every layout is real. */
const UNBOUNDED_AXIS: IEdgeGroupAxis = {
    marginShare: 0,
    size: Number.POSITIVE_INFINITY,
};

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

export interface SerializedEdgeGroups {
    top?: SerializedEdgeGroup;
    bottom?: SerializedEdgeGroup;
    left?: SerializedEdgeGroup;
    right?: SerializedEdgeGroup;
}

/**
 * Minimal interface for a edge group host.
 * Avoids circular imports by not referencing DockviewGroupPanel directly.
 */
export interface IEdgeGroupHost {
    readonly element: HTMLElement;
    readonly headerPosition: DockviewHeaderPosition;
    layout(width: number, height: number): void;
}

export class EdgeGroupView implements IView {
    private readonly _group: IEdgeGroupHost;
    private readonly _orientation: 'horizontal' | 'vertical';
    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();

    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;

    readonly snap = false;
    readonly priority = LayoutPriority.Low;

    private _isCollapsed = false;
    private _isVisible = true;
    private _lastExpandedSize: number;

    // Sizing is stored as pre-gap "base" values; the gap share is read live
    // from the owning splitview, so the effective sizes follow the theme gap,
    // the views visible on the axis and the measured tab-strip size.
    private _baseCollapsedSize: number;
    private _baseMinimumSize: number | undefined;
    private readonly _axis: IEdgeGroupAxis;
    private readonly _expandedMaximumSize: number;

    // The live cross-axis size of the group's tab strip. When defined it wins
    // over _baseCollapsedSize so a collapsed edge group tracks the tab height
    // even when it is changed dynamically via the
    // `--dv-tabs-and-actions-container-height` CSS variable (which the theme
    // machinery never sees).
    private _measuredTabSize: number | undefined;

    private readonly _tabSizeDisposables = new CompositeDisposable();

    /**
     * The effective (pre-gap) collapsed size: the measured tab-strip size when
     * available, otherwise the configured/theme base.
     */
    private get _effectiveBaseCollapsed(): number {
        return this._measuredTabSize ?? this._baseCollapsedSize;
    }

    get minimumSize(): number {
        // When collapsed, lock size to collapsedSize so sash can't drag it open
        if (this._isCollapsed) {
            return this.collapsedSize;
        }
        // If the caller explicitly provides a minimumSize, respect it.
        // Otherwise fall back to collapsedSize + 50 so the expanded state is
        // visually distinguishable from the collapsed state.
        return this._baseMinimumSize !== undefined
            ? this._baseMinimumSize + this._axis.marginShare
            : this._effectiveBaseCollapsed + 50 + this._axis.marginShare;
    }

    get maximumSize(): number {
        // When collapsed, lock size to collapsedSize so sash can't drag it open
        return this._isCollapsed
            ? this.collapsedSize
            : this._expandedMaximumSize;
    }

    get element(): HTMLElement {
        return this._group.element;
    }

    get isCollapsed(): boolean {
        return this._isCollapsed;
    }

    /** Includes the gap share, as expanding restores a slot size. */
    get lastExpandedSize(): number {
        return this._lastExpandedSize;
    }

    /** Without the gap share. */
    get lastExpandedContentSize(): number {
        return this._lastExpandedSize - this._axis.marginShare;
    }

    get collapsedSize(): number {
        return this._effectiveBaseCollapsed + this._axis.marginShare;
    }

    /** The user-configured (pre-gap) geometry constraints, for serialization.
     *  These are the raw values passed to `addEdgeGroup`, unlike the effective
     *  `minimumSize`/`maximumSize`/`collapsedSize` getters, which fold in the
     *  theme gap and collapse-locking. */
    get configuredMinimumSize(): number | undefined {
        return this._baseMinimumSize;
    }

    get configuredMaximumSize(): number {
        return this._expandedMaximumSize;
    }

    get configuredCollapsedSize(): number {
        return this._baseCollapsedSize;
    }

    constructor(
        options: EdgeGroupOptions,
        group: IEdgeGroupHost,
        orientation: 'horizontal' | 'vertical',
        axis: IEdgeGroupAxis = UNBOUNDED_AXIS
    ) {
        this._group = group;
        this._orientation = orientation;

        group.element.classList.add('dv-edge-group');
        group.element.dataset.testid = `dv-edge-group-${options.id}`;

        this._baseCollapsedSize = options.collapsedSize ?? 35;
        this._baseMinimumSize = options.minimumSize;
        this._axis = axis;
        this._expandedMaximumSize =
            options.maximumSize ?? Number.POSITIVE_INFINITY;

        this._lastExpandedSize = options.initialSize ?? 200;

        if (options.collapsed) {
            this._isCollapsed = true;
            group.element.classList.add('dv-edge-collapsed');
        }

        this._observeTabStrip();
    }

    /**
     * Watch the group's tab strip so the collapsed size follows the live tab
     * height. The strip's cross-axis size (height for top/bottom, width for
     * left/right) is exactly what a collapsed edge group should occupy; a
     * ResizeObserver keeps them in sync when the tab height changes at runtime.
     */
    private _observeTabStrip(): void {
        const strip = this._group.element.querySelector(
            '.dv-tabs-and-actions-container'
        ) as HTMLElement | null;
        if (!strip) {
            return;
        }
        this._tabSizeDisposables.addDisposables(
            watchElementResize(strip, () => {
                // a strip moved across the edge (e.g. a pinned group's bottom
                // tabs) spans the whole group, so its size is meaningless here
                const { headerPosition } = this._group;
                const stripIsVertical =
                    headerPosition === 'left' || headerPosition === 'right';
                if (stripIsVertical !== (this._orientation === 'horizontal')) {
                    return;
                }
                this._applyMeasuredTabSize(
                    this._orientation === 'vertical'
                        ? strip.offsetHeight
                        : strip.offsetWidth
                );
            })
        );
    }

    /**
     * Apply a freshly-measured tab-strip cross size. When the group is
     * collapsed this resizes it in the parent splitview so the collapsed strip
     * always shows the full tab height.
     */
    private _applyMeasuredTabSize(size: number): void {
        if (size <= 0 || size === this._measuredTabSize) {
            return;
        }
        this._measuredTabSize = size;
        if (this._isCollapsed) {
            this._onDidChange.fire({ size: this.collapsedSize });
        }
    }

    layout(size: number, orthogonalSize: number): void {
        // Track the expanded size through sash drags. `size` excludes the gap
        // share; the restored slot includes it. A hidden view is laid out at
        // zero, and one in a splitview with no extent yet at its minimum;
        // neither is a size to come back to.
        if (!this._isCollapsed && this._isVisible && this._axis.size > 0) {
            this._lastExpandedSize = size + this._axis.marginShare;
        }

        // horizontal (left/right): size=width, orthogonalSize=height → layout(width, height)
        // vertical (top/bottom): size=height, orthogonalSize=width → layout(width, height)
        if (this._orientation === 'horizontal') {
            this._group.layout(size, orthogonalSize);
        } else {
            this._group.layout(orthogonalSize, size);
        }
    }

    setCollapsed(collapsed: boolean): void {
        if (this._isCollapsed === collapsed) {
            return;
        }
        this._isCollapsed = collapsed;
        this._group.element.classList.toggle('dv-edge-collapsed', collapsed);
        // ShellManager calls resizeView directly after this; no _onDidChange needed
    }

    setVisible(visible: boolean): void {
        // the parent splitview manages visibility; only the flag is kept
        this._isVisible = visible;
    }

    /**
     * Set the expanded size without triggering a layout: from serialized
     * state (before setCollapsed(true) during fromJSON, so that expanding
     * restores the right size) or from an explicit resize.
     */
    restoreExpandedSize(size: number): void {
        this._lastExpandedSize = size;
    }

    /**
     * Apply a new base (pre-gap) collapsed size and base minimum size after a
     * theme change. Base values come from the original config. A live measured
     * tab size (if any) continues to win over the base collapsed size.
     */
    updateSizing(
        baseCollapsedSize: number,
        baseMinimumSize: number | undefined
    ): void {
        this._baseCollapsedSize = baseCollapsedSize;
        this._baseMinimumSize = baseMinimumSize;
    }

    dispose(): void {
        this._tabSizeDisposables.dispose();
        this._onDidChange.dispose();
    }
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

    addTopView(view: EdgeGroupView, initialSize: number): void {
        // Insert before center
        this._splitview.addView(view, initialSize, 0);
        this._topIndex = 0;
        this._centerIndex += 1;
        if (this._bottomIndex !== undefined) {
            this._bottomIndex += 1;
        }
    }

    addBottomView(view: EdgeGroupView, initialSize: number): void {
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

    /** The inner splitview, as the axis its edge views read. */
    get axis(): IEdgeGroupAxis {
        return this._splitview;
    }

    updateMargin(gap: number): void {
        this._splitview.margin = gap;
    }

    /** Disables the sashes of the top/bottom edge groups. */
    get disabled(): boolean {
        return this._splitview.disabled;
    }

    set disabled(value: boolean) {
        this._splitview.disabled = value;
    }

    dispose(): void {
        this._onDidChange.dispose();
        this._splitview.dispose();
    }
}

export class ShellManager implements IDisposable {
    private readonly _outerSplitview: Splitview;
    private readonly _middleColumn: MiddleColumnView;
    private readonly _shellElement: HTMLElement;

    private _topView: EdgeGroupView | undefined;
    private _bottomView: EdgeGroupView | undefined;
    private _leftView: EdgeGroupView | undefined;
    private _rightView: EdgeGroupView | undefined;

    // Indices in the outer HORIZONTAL splitview
    private _leftIndex: number | undefined;
    private _middleIndex: number;
    private _rightIndex: number | undefined;

    private readonly _disposables = new CompositeDisposable();

    // Retained for updateTheme() recalculations.
    private readonly _viewConfigs = new Map<
        EdgeGroupPosition,
        EdgeGroupOptions
    >();
    // Sizes a group could not take when they were requested (hidden, or no
    // extent yet), applied as soon as it can.
    private readonly _pendingSizes = new Map<EdgeGroupPosition, number>();
    private _currentWidth = 0;
    private _currentHeight = 0;
    private _gap: number;
    private _defaultCollapsedSize: number;

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
                this.layout(width, height);
            }),
            this._outerSplitview,
            this._middleColumn,
            centerView
        );
    }

    get element(): HTMLElement {
        return this._shellElement;
    }

    /**
     * The dock's `locked` option. The edge groups are resized with the sashes
     * of the shell's own splitviews (left/right in the outer one, top/bottom
     * in the middle column), so locking disables both.
     */
    get locked(): boolean {
        return this._outerSplitview.disabled;
    }

    set locked(value: boolean) {
        this._outerSplitview.disabled = value;
        this._middleColumn.disabled = value;
    }

    /**
     * Add an edge group view at the given position. The view wraps the
     * provided group element inside the shell's splitview layout.
     * Throws if a group at this position is already registered.
     */
    addEdgeView(
        position: EdgeGroupPosition,
        options: EdgeGroupOptions,
        group: IEdgeGroupHost
    ): EdgeGroupView {
        if (this.hasEdgeGroup(position)) {
            throw new Error(
                `dockview: edge group already registered at position '${position}'`
            );
        }

        this._viewConfigs.set(position, options);

        const view = new EdgeGroupView(
            {
                ...options,
                collapsedSize:
                    options.collapsedSize ?? this._defaultCollapsedSize,
            },
            group,
            isHorizontal(position) ? 'horizontal' : 'vertical',
            this._axisFor(position)
        );

        // A collapsed view's strip is its locked min and max, which read the
        // axis share once it is in, so the add clamps it to the right strip.
        const initialSize = view.isCollapsed
            ? view.collapsedSize
            : view.lastExpandedSize;

        switch (position) {
            case 'left':
                // Insert before the middle column
                this._outerSplitview.addView(view, initialSize, 0);
                this._leftIndex = 0;
                this._middleIndex += 1;
                if (this._rightIndex !== undefined) {
                    this._rightIndex += 1;
                }
                this._leftView = view;
                break;
            case 'right':
                // Append after the middle column
                {
                    const idx = this._outerSplitview.length;
                    this._outerSplitview.addView(view, initialSize, idx);
                    this._rightIndex = idx;
                    this._rightView = view;
                }
                break;
            case 'top':
                this._middleColumn.addTopView(view, initialSize);
                this._topView = view;
                break;
            case 'bottom':
                this._middleColumn.addBottomView(view, initialSize);
                this._bottomView = view;
                break;
        }

        this._disposables.addDisposables(view);

        // With no extent yet, splitview clamps the add down to the minimum
        // size, so hold the requested size for the first layout.
        if (!view.isCollapsed && !this._canResize(position)) {
            this._pendingSizes.set(position, initialSize);
        }

        // The axis has one more visible view, so its other collapsed strips
        // move with the gap share.
        this._relayout();

        return view;
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
        this._currentWidth = width;
        this._currentHeight = height;
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

        // Update splitview margins.
        this._outerSplitview.margin = gap;
        this._middleColumn.updateMargin(gap);

        this._applyThemeSizing();
        this._relayout();
    }

    /** Whether the other edge of `position`'s axis holds a view. */
    private _hasSiblingOn(position: EdgeGroupPosition): boolean {
        return isHorizontal(position)
            ? this._leftView !== undefined && this._rightView !== undefined
            : this._topView !== undefined && this._bottomView !== undefined;
    }

    /** The splitview `position`'s view sits in, as its edge axis. */
    private _axisFor(position: EdgeGroupPosition): IEdgeGroupAxis {
        return isHorizontal(position)
            ? this._outerSplitview
            : this._middleColumn.axis;
    }

    /** Re-derive every edge view's base sizing from its original config and
     *  the current defaults. */
    private _applyThemeSizing(): void {
        for (const position of EDGE_POSITIONS) {
            const view = this._getView(position);
            const baseCfg = this._viewConfigs.get(position);
            if (view && baseCfg) {
                view.updateSizing(
                    baseCfg.collapsedSize ?? this._defaultCollapsedSize,
                    baseCfg.minimumSize
                );
            }
        }
    }

    /**
     * Lay the shell out again at its current size, once it has one. The
     * splitviews clamp every view to its current constraints, which is how a
     * collapsed strip or a group at its minimum follows a moved gap share.
     */
    private _relayout(): void {
        if (this._currentWidth > 0 && this._currentHeight > 0) {
            this.layout(this._currentWidth, this._currentHeight);
        }
    }

    /** The view's slot in its splitview: its laid-out size plus the gap share. */
    private _slotSize(position: EdgeGroupPosition): number {
        switch (position) {
            case 'left':
                return this._leftIndex === undefined
                    ? 0
                    : this._outerSplitview.getViewSize(this._leftIndex);
            case 'right':
                return this._rightIndex === undefined
                    ? 0
                    : this._outerSplitview.getViewSize(this._rightIndex);
            case 'top':
            case 'bottom':
                return this._middleColumn.getViewSize(position);
        }
    }

    removeEdgeView(position: EdgeGroupPosition): void {
        const view = this._getView(position);
        if (!view) {
            return;
        }

        switch (position) {
            case 'left':
                this._outerSplitview.removeView(this._leftIndex!);
                this._leftIndex = undefined;
                this._leftView = undefined;
                // middle and right shift left by one
                this._middleIndex -= 1;
                if (this._rightIndex !== undefined) {
                    this._rightIndex -= 1;
                }
                break;
            case 'right':
                this._outerSplitview.removeView(this._rightIndex!);
                this._rightIndex = undefined;
                this._rightView = undefined;
                break;
            case 'top':
                this._middleColumn.removeView('top');
                this._topView = undefined;
                break;
            case 'bottom':
                this._middleColumn.removeView('bottom');
                this._bottomView = undefined;
                break;
        }

        // Deregister before disposing to avoid double-dispose when ShellManager
        // itself is eventually disposed.
        this._disposables.removeDisposable(view);
        view.dispose();

        this._viewConfigs.delete(position);
        this._pendingSizes.delete(position);

        // The axis has one fewer visible view, so its collapsed strips move
        // with the gap share.
        this._relayout();
    }

    hasEdgeGroup(position: EdgeGroupPosition): boolean {
        switch (position) {
            case 'top':
                return this._topView !== undefined;
            case 'bottom':
                return this._bottomView !== undefined;
            case 'left':
                return this._leftView !== undefined;
            case 'right':
                return this._rightView !== undefined;
        }
    }

    setEdgeGroupVisible(position: EdgeGroupPosition, visible: boolean): void {
        const changes =
            this._getView(position) !== undefined &&
            visible !== this.isEdgeGroupVisible(position);

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

        if (changes && this._gap > 0 && this._hasSiblingOn(position)) {
            // The visible count on the axis moved, and the gap share with it.
            // The toggle clamped only the view itself; a sibling at its
            // collapsed or minimum size has to follow.
            this._relayout();
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

    setEdgeGroupCollapsed(
        position: EdgeGroupPosition,
        collapsed: boolean
    ): void {
        const view = this._getView(position);
        if (!view) {
            return;
        }
        view.setCollapsed(collapsed);
        if (collapsed) {
            // the strip size wins; a later expand uses the recorded expanded size
            this._pendingSizes.delete(position);
            this._resizeView(position, view.collapsedSize);
        } else {
            this.resizeEdgeGroup(position, view.lastExpandedSize);
        }
    }

    /**
     * Resize the edge group at `position` along its primary axis (width for
     * `left`/`right`, height for `top`/`bottom`), clamped by the group's
     * constraints and the space available. Where `groupApi.setSize` lands.
     *
     * The size becomes the group's expanded size, so a collapsed group keeps
     * its strip and takes it on expand, and it survives a `toJSON` round-trip.
     */
    resizeEdgeGroup(position: EdgeGroupPosition, size: number): void {
        const view = this._getView(position);
        if (!view || !Number.isFinite(size)) {
            return;
        }

        const target = Math.round(size);
        if (target <= 0) {
            return;
        }

        view.restoreExpandedSize(target);

        if (view.isCollapsed) {
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

    /** A resize lands only on a visible view (a hidden one is pinned to zero)
     *  whose splitview has extent to distribute. */
    private _canResize(position: EdgeGroupPosition): boolean {
        return (
            this.isEdgeGroupVisible(position) &&
            this._axisFor(position).size > 0
        );
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
            const view = this._getView(position);
            if (!view || view.isCollapsed || !this._canResize(position)) {
                continue;
            }
            this._pendingSizes.delete(position);
            this._resizeView(position, size);
        }
    }

    isEdgeGroupCollapsed(position: EdgeGroupPosition): boolean {
        return this._getView(position)?.isCollapsed ?? false;
    }

    /** The size an edge group expands to (its pre-collapse size), used to size
     *  the auto-hide peek overlay. */
    getEdgeGroupExpandedSize(position: EdgeGroupPosition): number {
        return this._getView(position)?.lastExpandedContentSize ?? 0;
    }

    private _getView(position: EdgeGroupPosition): EdgeGroupView | undefined {
        switch (position) {
            case 'top':
                return this._topView;
            case 'bottom':
                return this._bottomView;
            case 'left':
                return this._leftView;
            case 'right':
                return this._rightView;
        }
    }

    toJSON(): SerializedEdgeGroups {
        const edgeGroups: SerializedEdgeGroups = {};
        for (const position of EDGE_POSITIONS) {
            const view = this._getView(position);
            if (!view) {
                continue;
            }
            const visible = this.isEdgeGroupVisible(position);
            edgeGroups[position] = {
                size: this._expandedSize(view, position, visible),
                visible,
                collapsed: view.isCollapsed || undefined,
                // The user-configured constraints, so the auto-create fromJSON
                // path restores them. Infinity isn't JSON-representable, so an
                // unconfigured maximum is omitted and falls back to the default.
                minimumSize: view.configuredMinimumSize,
                maximumSize: Number.isFinite(view.configuredMaximumSize)
                    ? view.configuredMaximumSize
                    : undefined,
                collapsedSize: view.configuredCollapsedSize,
            };
        }
        return edgeGroups;
    }

    /** The size to restore the group to. An expanded-but-hidden group has a
     *  slot of 0, so fall back to its cached visible size (then
     *  lastExpandedSize); otherwise re-showing snaps to minimumSize. */
    private _expandedSize(
        view: EdgeGroupView,
        position: EdgeGroupPosition,
        visible: boolean
    ): number {
        if (view.isCollapsed) {
            return view.lastExpandedSize;
        }
        // a held size is the size the group will take, so persist that
        // rather than the size it is stranded at
        const pending = this._pendingSizes.get(position);
        if (pending !== undefined) {
            return pending;
        }
        if (!visible) {
            return this._cachedVisibleSize(position) ?? view.lastExpandedSize;
        }
        return this._slotSize(position);
    }

    /** The slot a hidden view had when it was last visible. */
    private _cachedVisibleSize(
        position: EdgeGroupPosition
    ): number | undefined {
        switch (position) {
            case 'left':
                return this._leftIndex === undefined
                    ? undefined
                    : this._outerSplitview.getViewCachedVisibleSize(
                          this._leftIndex
                      );
            case 'right':
                return this._rightIndex === undefined
                    ? undefined
                    : this._outerSplitview.getViewCachedVisibleSize(
                          this._rightIndex
                      );
            case 'top':
            case 'bottom':
                return this._middleColumn.getViewCachedVisibleSize(position);
        }
    }

    fromJSON(data: SerializedEdgeGroups): void {
        for (const position of EDGE_POSITIONS) {
            const state = data[position];
            const view = this._getView(position);
            if (!state || !view) {
                continue;
            }

            // Always restore the expanded size first. toJSON always records the
            // expanded size (even when collapsed), so it must be applied before
            // setCollapsed locks min/max to collapsedSize.
            view.restoreExpandedSize(state.size);
            view.setCollapsed(state.collapsed ?? false);

            if (state.collapsed) {
                this._pendingSizes.delete(position);
                this._resizeView(position, view.collapsedSize);
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
