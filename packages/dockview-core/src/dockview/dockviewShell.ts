import { Emitter, Event } from '../events';
import { CompositeDisposable, IDisposable } from '../lifecycle';
import {
    IView,
    LayoutPriority,
    Orientation,
    Splitview,
} from '../splitview/splitview';
import { isInDocument, watchElementResize } from '../dom';

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
    private _lastExpandedSize: number;

    // Sizing is stored as pre-gap "base" values plus the current gap
    // contribution (_gapAdd) so the effective collapsed size can be recomputed
    // whenever either the theme gap OR the measured tab-strip size changes.
    private _baseCollapsedSize: number;
    private _baseMinimumSize: number | undefined;
    private _gapAdd: number;
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
            ? this._baseMinimumSize + this._gapAdd
            : this._effectiveBaseCollapsed + 50 + this._gapAdd;
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

    get lastExpandedSize(): number {
        return this._lastExpandedSize;
    }

    get collapsedSize(): number {
        return this._effectiveBaseCollapsed + this._gapAdd;
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
        gapAdd = 0
    ) {
        this._group = group;
        this._orientation = orientation;

        group.element.classList.add('dv-edge-group');
        group.element.dataset.testid = `dv-edge-group-${options.id}`;

        this._baseCollapsedSize = options.collapsedSize ?? 35;
        this._baseMinimumSize = options.minimumSize;
        this._gapAdd = gapAdd;
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
        // Track the last expanded size so we can restore it after collapsing
        if (!this._isCollapsed) {
            this._lastExpandedSize = size;
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

    setVisible(_visible: boolean): void {
        // visibility is managed by the parent splitview
    }

    /**
     * Restore the last-expanded size from serialized state without triggering
     * a layout. Must be called before setCollapsed(true) during fromJSON so
     * that expanding after deserialization restores the correct size.
     */
    restoreExpandedSize(size: number): void {
        this._lastExpandedSize = size;
    }

    /**
     * Apply a new base (pre-gap) collapsed size, base minimum size and gap
     * contribution after a theme or gap change. Base values come from the
     * original config; the ShellManager owns the gap arithmetic. A live
     * measured tab size (if any) continues to win over the base collapsed size.
     */
    updateSizing(
        baseCollapsedSize: number,
        baseMinimumSize: number | undefined,
        gapAdd: number
    ): void {
        this._baseCollapsedSize = baseCollapsedSize;
        this._baseMinimumSize = baseMinimumSize;
        this._gapAdd = gapAdd;
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

    /** The center view's top offset within this column (its inset below any top
     *  edge group + gap), read from splitview state — no DOM measurement. */
    getCenterOffset(): number {
        return this._splitview.getViewOffset(this._centerIndex);
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

    updateMargin(gap: number): void {
        this._splitview.margin = gap;
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
                // layout() records the size and short-circuits its own repeat
                // calls; don't pre-write _current here or that early-out would
                // wrongly skip this real resize.
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

        // Recompute gap adjustments now that _viewConfigs has grown.
        const outerN =
            1 +
            (this._viewConfigs.has('left') ? 1 : 0) +
            (this._viewConfigs.has('right') ? 1 : 0);
        const innerN =
            1 +
            (this._viewConfigs.has('top') ? 1 : 0) +
            (this._viewConfigs.has('bottom') ? 1 : 0);
        const outerGapAdd =
            outerN > 1 ? (this._gap * (outerN - 1)) / outerN : 0;
        const innerGapAdd =
            innerN > 1 ? (this._gap * (innerN - 1)) / innerN : 0;

        const isHorizontal = position === 'left' || position === 'right';
        const gapAdd = isHorizontal ? outerGapAdd : innerGapAdd;
        const orientation = isHorizontal ? 'horizontal' : 'vertical';

        const view = new EdgeGroupView(
            { collapsedSize: this._defaultCollapsedSize, ...options },
            group,
            orientation,
            gapAdd
        );

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

        // Recalculate gap adjustments for all views now that n has changed.
        // updateTheme already guards the layout() call by _currentWidth/_currentHeight.
        this.updateTheme(this._gap, this._defaultCollapsedSize);

        return view;
    }

    /**
     * Lay the shell out at the given size. Returns whether a layout actually
     * ran.
     *
     * A repeat call at the same rounded size is a no-op (returns false) unless
     * `forceResize` is set — the same "dimensions unchanged -> skip" contract
     * the base gridview has always had (`BaseGrid.layout`), which the shell
     * wrapper otherwise bypasses. So a redundant resize — an app driving
     * layout() itself, the shell's own ResizeObserver re-reporting the same
     * box, or any duplicate caller — costs nothing by construction instead of
     * re-running the whole recursive layout. Structural re-flows that keep the
     * outer size go through forceRelayout()/updateTheme(), which force.
     * Rounding matches the observer's rounded comparison. (#1585)
     */
    layout(width: number, height: number, forceResize = false): boolean {
        const w = Math.round(width);
        const h = Math.round(height);
        if (
            !forceResize &&
            w === this._currentWidth &&
            h === this._currentHeight
        ) {
            return false;
        }
        this._currentWidth = w;
        this._currentHeight = h;
        // Outer splitview is HORIZONTAL: layout(size=width, orthogonalSize=height)
        this._outerSplitview.layout(width, height);
        return true;
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
            (this._viewConfigs.has('left') ? 1 : 0) +
            (this._viewConfigs.has('right') ? 1 : 0);
        const innerN =
            1 +
            (this._viewConfigs.has('top') ? 1 : 0) +
            (this._viewConfigs.has('bottom') ? 1 : 0);
        const outerGapAdd = outerN > 1 ? (gap * (outerN - 1)) / outerN : 0;
        const innerGapAdd = innerN > 1 ? (gap * (innerN - 1)) / innerN : 0;

        // Update splitview margins.
        this._outerSplitview.margin = gap;
        this._middleColumn.updateMargin(gap);

        // Recompute effective collapsed sizes from the original config values.
        const updateView = (
            view: EdgeGroupView,
            baseCfg: EdgeGroupOptions,
            gapAdd: number
        ) => {
            const baseCS = baseCfg.collapsedSize ?? defaultCollapsedSize;
            view.updateSizing(baseCS, baseCfg.minimumSize, gapAdd);
        };

        const topCfg = this._viewConfigs.get('top');
        if (this._topView && topCfg) {
            updateView(this._topView, topCfg, innerGapAdd);
        }
        const bottomCfg = this._viewConfigs.get('bottom');
        if (this._bottomView && bottomCfg) {
            updateView(this._bottomView, bottomCfg, innerGapAdd);
        }
        const leftCfg = this._viewConfigs.get('left');
        if (this._leftView && leftCfg) {
            updateView(this._leftView, leftCfg, outerGapAdd);
        }
        const rightCfg = this._viewConfigs.get('right');
        if (this._rightView && rightCfg) {
            updateView(this._rightView, rightCfg, outerGapAdd);
        }

        // Resize currently-collapsed groups to their new collapsed size so
        // they immediately match the new theme's tab-strip dimensions.
        if (this._leftView?.isCollapsed && this._leftIndex !== undefined) {
            this._outerSplitview.resizeView(
                this._leftIndex,
                this._leftView.collapsedSize
            );
        }
        if (this._rightView?.isCollapsed && this._rightIndex !== undefined) {
            this._outerSplitview.resizeView(
                this._rightIndex,
                this._rightView.collapsedSize
            );
        }
        if (this._topView?.isCollapsed) {
            this._middleColumn.resizeView('top', this._topView.collapsedSize);
        }
        if (this._bottomView?.isCollapsed) {
            this._middleColumn.resizeView(
                'bottom',
                this._bottomView.collapsedSize
            );
        }

        // Re-run layout with the current shell dimensions. Force it: the outer
        // size is unchanged (so layout() would otherwise no-op), but edge
        // margins/sizes just changed and must be re-applied.
        if (this._currentWidth > 0 && this._currentHeight > 0) {
            this.layout(this._currentWidth, this._currentHeight, true);
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

        // Recalculate gap adjustments for remaining views.
        this.updateTheme(this._gap, this._defaultCollapsedSize);
    }

    /** True when any edge group exists in any position. Lets the host skip a
     *  getBoundingClientRect pair on the common no-edge-group layout. */
    hasAnyEdgeGroup(): boolean {
        return (
            this._topView !== undefined ||
            this._bottomView !== undefined ||
            this._leftView !== undefined ||
            this._rightView !== undefined
        );
    }

    /**
     * The center (dockview grid) slot's offset within the shell, i.e. how far
     * edge groups inset it: `left` from the outer splitview's position for the
     * middle column, `top` from the middle column's position for the center.
     * Both come from splitview state (the same offsets it wrote to the DOM), so
     * the floating-overlay host can mirror the grid box without a
     * getBoundingClientRect. (#1585)
     */
    getGridOffset(): { left: number; top: number } {
        return {
            left: this._outerSplitview.getViewOffset(this._middleIndex),
            top: this._middleColumn.getCenterOffset(),
        };
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
        const targetSize = collapsed
            ? view.collapsedSize
            : view.lastExpandedSize;
        switch (position) {
            case 'left':
                if (this._leftIndex !== undefined) {
                    this._outerSplitview.resizeView(
                        this._leftIndex,
                        targetSize
                    );
                }
                break;
            case 'right':
                if (this._rightIndex !== undefined) {
                    this._outerSplitview.resizeView(
                        this._rightIndex,
                        targetSize
                    );
                }
                break;
            case 'top':
            case 'bottom':
                this._middleColumn.resizeView(position, targetSize);
                break;
        }
    }

    isEdgeGroupCollapsed(position: EdgeGroupPosition): boolean {
        return this._getView(position)?.isCollapsed ?? false;
    }

    /** The size an edge group expands to (its pre-collapse size), used to size
     *  the auto-hide peek overlay. */
    getEdgeGroupExpandedSize(position: EdgeGroupPosition): number {
        return this._getView(position)?.lastExpandedSize ?? 0;
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

        // Persist the user-configured constraints so the auto-create fromJSON
        // path restores them. Omit unconfigured/Infinity values (Infinity isn't
        // JSON-representable) so they fall back to defaults on restore.
        const constraints = (
            view: EdgeGroupView
        ): Pick<
            SerializedEdgeGroup,
            'minimumSize' | 'maximumSize' | 'collapsedSize'
        > => ({
            minimumSize: view.configuredMinimumSize,
            maximumSize: Number.isFinite(view.configuredMaximumSize)
                ? view.configuredMaximumSize
                : undefined,
            collapsedSize: view.configuredCollapsedSize,
        });

        // Record the size to restore the group to. An expanded-but-hidden
        // group reports getViewSize 0, so fall back to its cached visible size
        // (then lastExpandedSize); otherwise re-showing snaps to minimumSize.
        const expandedSize = (
            view: EdgeGroupView,
            isVisible: boolean,
            liveSize: number,
            cachedVisibleSize: number | undefined
        ): number => {
            if (view.isCollapsed) {
                return view.lastExpandedSize;
            }
            if (!isVisible) {
                return cachedVisibleSize ?? view.lastExpandedSize;
            }
            return liveSize;
        };

        if (this._leftView && this._leftIndex !== undefined) {
            const visible = this._outerSplitview.isViewVisible(this._leftIndex);
            edgeGroups.left = {
                size: expandedSize(
                    this._leftView,
                    visible,
                    this._outerSplitview.getViewSize(this._leftIndex),
                    this._outerSplitview.getViewCachedVisibleSize(
                        this._leftIndex
                    )
                ),
                visible,
                collapsed: this._leftView.isCollapsed || undefined,
                ...constraints(this._leftView),
            };
        }
        if (this._rightView && this._rightIndex !== undefined) {
            const visible = this._outerSplitview.isViewVisible(
                this._rightIndex
            );
            edgeGroups.right = {
                size: expandedSize(
                    this._rightView,
                    visible,
                    this._outerSplitview.getViewSize(this._rightIndex),
                    this._outerSplitview.getViewCachedVisibleSize(
                        this._rightIndex
                    )
                ),
                visible,
                collapsed: this._rightView.isCollapsed || undefined,
                ...constraints(this._rightView),
            };
        }
        if (this._topView) {
            const visible = this._middleColumn.isViewVisible('top');
            edgeGroups.top = {
                size: expandedSize(
                    this._topView,
                    visible,
                    this._middleColumn.getViewSize('top'),
                    this._middleColumn.getViewCachedVisibleSize('top')
                ),
                visible,
                collapsed: this._topView.isCollapsed || undefined,
                ...constraints(this._topView),
            };
        }
        if (this._bottomView) {
            const visible = this._middleColumn.isViewVisible('bottom');
            edgeGroups.bottom = {
                size: expandedSize(
                    this._bottomView,
                    visible,
                    this._middleColumn.getViewSize('bottom'),
                    this._middleColumn.getViewCachedVisibleSize('bottom')
                ),
                visible,
                collapsed: this._bottomView.isCollapsed || undefined,
                ...constraints(this._bottomView),
            };
        }

        return edgeGroups;
    }

    fromJSON(data: SerializedEdgeGroups): void {
        if (data.left && this._leftIndex !== undefined) {
            // Always restore the expanded size first. toJSON always records the
            // expanded size (even when collapsed), so restoredExpandedSize must
            // be applied before setCollapsed locks min/max to collapsedSize.
            this._leftView?.restoreExpandedSize(data.left.size);
            this._leftView?.setCollapsed(data.left.collapsed ?? false);
            this._outerSplitview.resizeView(
                this._leftIndex,
                data.left.collapsed
                    ? (this._leftView?.collapsedSize ?? data.left.size)
                    : data.left.size
            );
            if (!data.left.visible) {
                this._outerSplitview.setViewVisible(this._leftIndex, false);
            }
        }
        if (data.right && this._rightIndex !== undefined) {
            this._rightView?.restoreExpandedSize(data.right.size);
            this._rightView?.setCollapsed(data.right.collapsed ?? false);
            this._outerSplitview.resizeView(
                this._rightIndex,
                data.right.collapsed
                    ? (this._rightView?.collapsedSize ?? data.right.size)
                    : data.right.size
            );
            if (!data.right.visible) {
                this._outerSplitview.setViewVisible(this._rightIndex, false);
            }
        }
        if (data.top) {
            this._topView?.restoreExpandedSize(data.top.size);
            this._topView?.setCollapsed(data.top.collapsed ?? false);
            this._middleColumn.resizeView(
                'top',
                data.top.collapsed
                    ? (this._topView?.collapsedSize ?? data.top.size)
                    : data.top.size
            );
            if (!data.top.visible) {
                this._middleColumn.setViewVisible('top', false);
            }
        }
        if (data.bottom) {
            this._bottomView?.restoreExpandedSize(data.bottom.size);
            this._bottomView?.setCollapsed(data.bottom.collapsed ?? false);
            this._middleColumn.resizeView(
                'bottom',
                data.bottom.collapsed
                    ? (this._bottomView?.collapsedSize ?? data.bottom.size)
                    : data.bottom.size
            );
            if (!data.bottom.visible) {
                this._middleColumn.setViewVisible('bottom', false);
            }
        }
    }

    dispose(): void {
        this._disposables.dispose();
        this._shellElement.remove();
    }
}
