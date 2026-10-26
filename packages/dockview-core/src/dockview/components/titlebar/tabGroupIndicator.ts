import { IValueDisposable } from '../../../lifecycle';
import {
    DockviewHeaderDirection,
    DockviewHeaderPosition,
    OVERFLOW_WRAP_TABS_CLASS,
} from '../../options';
import { Tab } from '../tab/tab';
import { ITabGroup } from '../../tabGroup';
import {
    resolveTabGroupAccent,
    TabGroupColorPalette,
} from '../../tabGroupAccent';

/**
 * Class for the small accent pip drawn at the leading edge of each wrapped
 * row a tab group spans beyond its first. Echoes the group chip so a
 * multi-row group reads as one group on every row it occupies.
 */
export const TAB_GROUP_CHIP_CONTINUATION_CLASS =
    'dv-tab-group-chip-continuation';

/** Diameter (px) of a continuation pip; mirrors the CSS size. */
const CONTINUATION_PIP_SIZE = 8;

/**
 * A maximal run of a group's tabs on one wrapped line (a row for a horizontal
 * header, a column for a vertical header), in container-relative coordinates.
 */
interface WrappedRun {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface TabGroupIndicatorContext {
    readonly tabsList: HTMLElement;
    getTabGroups(): readonly ITabGroup[];
    getActivePanelId(): string | undefined;
    getTabMap(): Map<string, IValueDisposable<Tab>>;
    getChipElement(groupId: string): HTMLElement | undefined;
    getDirection(): DockviewHeaderDirection;
    getHeaderPosition(): DockviewHeaderPosition;
    getColorPalette(): TabGroupColorPalette | undefined;
}

export interface ITabGroupIndicator {
    readonly underlines: ReadonlyMap<string, HTMLElement>;
    positionUnderlines(): void;
    trackUnderlines(): void;
    syncUnderlineElements(activeGroupIds: Set<string>): void;
    getUnderline(groupId: string): HTMLElement | undefined;
    dispose(): void;
}

/**
 * Shared positioning logic for tab group indicators.
 * Subclasses implement `applyShape` to control the visual output.
 */
abstract class BaseTabGroupIndicator implements ITabGroupIndicator {
    protected readonly _underlines = new Map<string, HTMLElement>();
    /**
     * Per-group pool of continuation-marker pips (one per wrapped row the
     * group spans beyond its first). Absolutely positioned so they sit
     * outside the flex-wrap flow, exactly like the underline element.
     */
    private readonly _continuationMarkers = new Map<string, HTMLElement[]>();
    private _rafId: number | null = null;

    get underlines(): ReadonlyMap<string, HTMLElement> {
        return this._underlines;
    }

    constructor(protected readonly _ctx: TabGroupIndicatorContext) {}

    positionUnderlines(): void {
        requestAnimationFrame(() => {
            this._positionUnderlinesSync();
        });
    }

    /**
     * Continuously reposition underlines every frame for the duration
     * of a tab transition (~200ms), so the underline tracks tab sizes.
     */
    trackUnderlines(): void {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
        }

        const start = performance.now();
        const duration = 250; // slightly longer than transition to ensure we catch the end

        const tick = () => {
            this._positionUnderlinesSync();
            if (performance.now() - start < duration) {
                this._rafId = requestAnimationFrame(tick);
            } else {
                this._rafId = null;
            }
        };

        this._rafId = requestAnimationFrame(tick);
    }

    syncUnderlineElements(activeGroupIds: Set<string>): void {
        // Ensure underline elements exist for active groups
        for (const groupId of activeGroupIds) {
            if (!this._underlines.has(groupId)) {
                const underline = document.createElement('div');
                underline.className = 'dv-tab-group-underline';
                this._ctx.tabsList.appendChild(underline);
                this._underlines.set(groupId, underline);
            }
        }

        // Remove underlines (and any continuation markers) for dissolved groups
        for (const [groupId, el] of this._underlines) {
            if (!activeGroupIds.has(groupId)) {
                el.remove();
                this._underlines.delete(groupId);
                this._clearContinuationMarkers(groupId);
            }
        }
    }

    getUnderline(groupId: string): HTMLElement | undefined {
        return this._underlines.get(groupId);
    }

    dispose(): void {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        for (const [, el] of this._underlines) {
            el.remove();
        }
        this._underlines.clear();
        this._clearContinuationMarkers();
    }

    /**
     * Grow/shrink a group's continuation-marker pool to `count` pips,
     * creating/removing DOM nodes as needed, and return the pool.
     */
    private _syncContinuationMarkers(
        groupId: string,
        count: number
    ): HTMLElement[] {
        let pool = this._continuationMarkers.get(groupId);
        if (!pool) {
            pool = [];
            this._continuationMarkers.set(groupId, pool);
        }
        while (pool.length < count) {
            const marker = document.createElement('div');
            marker.className = TAB_GROUP_CHIP_CONTINUATION_CLASS;
            this._ctx.tabsList.appendChild(marker);
            pool.push(marker);
        }
        while (pool.length > count) {
            const marker = pool.pop();
            marker?.remove();
        }
        return pool;
    }

    /**
     * Remove continuation markers for a single group, or (when `groupId`
     * is omitted) for every group. Used when a group dissolves, stops
     * wrapping, or the indicator is disposed.
     */
    private _clearContinuationMarkers(groupId?: string): void {
        if (groupId === undefined) {
            for (const [, pool] of this._continuationMarkers) {
                for (const marker of pool) {
                    marker.remove();
                }
            }
            this._continuationMarkers.clear();
            return;
        }
        const pool = this._continuationMarkers.get(groupId);
        if (pool) {
            for (const marker of pool) {
                marker.remove();
            }
            this._continuationMarkers.delete(groupId);
        }
    }

    /**
     * Apply the visual shape to the underline element.
     * Called once per tab group per frame with the computed geometry.
     */
    protected abstract applyShape(
        underline: HTMLElement,
        tg: ITabGroup,
        startEdge: number,
        span: number,
        containerCrossSize: number,
        activePanelId: string | undefined,
        containerRect: DOMRect,
        isVertical: boolean
    ): void;

    private _positionUnderlinesSync(): void {
        const containerRect = this._ctx.tabsList.getBoundingClientRect();
        const tabGroups = this._ctx.getTabGroups();
        const isVertical = this._ctx.getDirection() === 'vertical';
        // Multi-line wrap (`MultiRowTabsModule`): a group's tabs can span
        // multiple rows (horizontal header) or columns (vertical header), which
        // the single-bar model below can't represent. Draw a per-line segment
        // instead: rows bucketed by top, columns bucketed by left.
        const wrapped = this._ctx.tabsList.classList.contains(
            OVERFLOW_WRAP_TABS_CLASS
        );
        if (!wrapped) {
            // Continuation markers only exist while wrapping; a runtime
            // wrap→no-wrap toggle (or a switch to vertical) must not leave
            // orphaned pips behind.
            this._clearContinuationMarkers();
        }
        const containerCrossSize = isVertical
            ? containerRect.width
            : containerRect.height;
        const activePanelId = this._ctx.getActivePanelId();
        const tabMap = this._ctx.getTabMap();

        for (const tg of tabGroups) {
            const underline = this._underlines.get(tg.id);
            if (!underline) {
                continue;
            }

            const panelIds = tg.panelIds;
            if (panelIds.length === 0) {
                underline.style.display = 'none';
                continue;
            }

            underline.style.display = '';

            if (wrapped) {
                this._positionWrappedUnderline(
                    underline,
                    tg,
                    containerRect,
                    tabMap,
                    isVertical
                );
                continue;
            }

            const chipEl = this._ctx.getChipElement(tg.id);

            // In vertical mode, compute top/bottom edges; in horizontal, left/right.
            let startEdge: number;
            if (chipEl) {
                const chipRect = chipEl.getBoundingClientRect();
                const chipStyle = getComputedStyle(chipEl);
                const leadingMargin = isVertical
                    ? Number.parseFloat(chipStyle.marginTop) || 0
                    : Number.parseFloat(chipStyle.marginLeft) || 0;
                startEdge = isVertical
                    ? chipRect.top - containerRect.top - leadingMargin
                    : chipRect.left - containerRect.left - leadingMargin;
            } else {
                const firstPanelId = panelIds[0];
                const firstTabEntry = tabMap.get(firstPanelId);
                if (firstTabEntry) {
                    const firstRect =
                        firstTabEntry.value.element.getBoundingClientRect();
                    startEdge = isVertical
                        ? firstRect.top - containerRect.top
                        : firstRect.left - containerRect.left;
                } else {
                    startEdge = 0;
                }
            }

            // Measure the actual last tab position (follows CSS transitions in real-time)
            const lastPanelId = panelIds[panelIds.length - 1];
            const lastTabEntry = tabMap.get(lastPanelId);

            if (!lastTabEntry) {
                if (isVertical) {
                    underline.style.top = `${startEdge}px`;
                    underline.style.height = '0px';
                    underline.style.left = '';
                    underline.style.width = '';
                } else {
                    underline.style.left = `${startEdge}px`;
                    underline.style.width = '0px';
                    underline.style.top = '';
                    underline.style.height = '';
                }
                continue;
            }

            const lastTabRect =
                lastTabEntry.value.element.getBoundingClientRect();
            let endEdge = isVertical
                ? lastTabRect.bottom - containerRect.top
                : lastTabRect.right - containerRect.left;
            let span = endEdge - startEdge;

            // During collapse or expand: converge both edges toward chip center
            const isAnimating =
                tg.collapsed ||
                tg.panelIds.some((pid) => {
                    const te = tabMap.get(pid);
                    return te?.value.element.classList.contains(
                        'dv-tab--group-expanding'
                    );
                });

            if (isAnimating && chipEl) {
                const chipRect = chipEl.getBoundingClientRect();
                const chipCenter = isVertical
                    ? chipRect.top + chipRect.height / 2 - containerRect.top
                    : chipRect.left + chipRect.width / 2 - containerRect.left;

                // Sum of current visible tab sizes (shrinking or growing)
                let currentTabSize = 0;
                let fullTabSize = 0;
                for (const pid of tg.panelIds) {
                    const te = tabMap.get(pid);
                    if (!te) continue;
                    const el = te.value.element;
                    if (isVertical) {
                        currentTabSize += el.getBoundingClientRect().height;
                        fullTabSize += el.scrollHeight;
                    } else {
                        currentTabSize += el.getBoundingClientRect().width;
                        fullTabSize += el.scrollWidth;
                    }
                }

                // progress: 0 when tabs at 0 size, 1 when fully open
                const progress =
                    fullTabSize > 0
                        ? Math.min(1, currentTabSize / fullTabSize)
                        : 0;

                // Interpolate start and end edges toward chip center
                startEdge = chipCenter + (startEdge - chipCenter) * progress;
                endEdge = chipCenter + (endEdge - chipCenter) * progress;
                span = Math.max(0, endEdge - startEdge);
            }

            if (isVertical) {
                underline.style.top = `${startEdge}px`;
                underline.style.height = `${Math.max(0, span)}px`;
                // Clear horizontal properties (incl. any wrap-mode overrides)
                underline.style.left = '';
                underline.style.width = '';
                underline.style.bottom = '';
            } else {
                underline.style.left = `${startEdge}px`;
                underline.style.width = `${Math.max(0, span)}px`;
                // Clear vertical properties (incl. any wrap-mode overrides)
                underline.style.top = '';
                underline.style.height = '';
                underline.style.bottom = '';
            }

            this.applyShape(
                underline,
                tg,
                startEdge,
                span,
                containerCrossSize,
                activePanelId,
                containerRect,
                isVertical
            );
        }
    }

    /**
     * Position a group's underline across a multi-line (wrapped) tab strip. The
     * single-bar model can't span lines, so the element is sized to cover the
     * group's line span and an SVG draws one straight segment per line-run of
     * the group's tabs: a horizontal segment per row (horizontal header) or a
     * vertical segment per column (vertical header). Tabs are bucketed into
     * runs by their cross-axis offset: `top` for rows, `left` for columns.
     * (The active-tab wrap-around bump is omitted in wrap; the per-line lines
     * still convey membership.)
     */
    private _positionWrappedUnderline(
        underline: HTMLElement,
        tg: ITabGroup,
        containerRect: DOMRect,
        tabMap: Map<string, IValueDisposable<Tab>>,
        isVertical: boolean
    ): void {
        const t = 2; // line thickness
        const color = resolveTabGroupAccent(
            tg.color,
            this._ctx.getColorPalette()
        );
        if (color === undefined) {
            underline.style.display = 'none';
            this._clearContinuationMarkers(tg.id);
            return;
        }

        const { runs, firstRun } = this._computeWrappedRuns(
            tg,
            containerRect,
            tabMap,
            isVertical
        );

        if (runs.length === 0) {
            underline.style.display = 'none';
            this._clearContinuationMarkers(tg.id);
            return;
        }

        this._positionContinuationMarkers(
            tg.id,
            runs,
            firstRun,
            color,
            isVertical
        );

        const minLeft = Math.min(...runs.map((r) => r.left));
        const maxRight = Math.max(...runs.map((r) => r.right));
        const minTop = Math.min(...runs.map((r) => r.top));
        const maxBottom = Math.max(...runs.map((r) => r.bottom));

        // Element covers the group's bounding box: the SVG inside draws the
        // per-line segments. Cross-axis origin is offset (top for rows, left
        // for columns); the main axis fills the container.
        const width = isVertical
            ? Math.max(0, maxRight - minLeft)
            : containerRect.width;
        const height = isVertical
            ? containerRect.height
            : Math.max(0, maxBottom - minTop);
        underline.style.left = isVertical ? `${minLeft}px` : '0px';
        underline.style.top = isVertical ? '0px' : `${minTop}px`;
        underline.style.bottom = 'auto';
        underline.style.width = `${width}px`;
        underline.style.height = `${height}px`;
        // The `none` indicator paints the underline element itself; clear any
        // background left over from a non-wrap render so it doesn't show as a
        // block behind the per-line SVG segments after a runtime wrap toggle.
        underline.style.backgroundColor = '';

        const { svg, path } = this.ensureSvgPath(underline);
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', String(t));

        // `inverted` puts the line on the header-facing edge for the flipped
        // positions: the top of each row for a bottom header, the right of each
        // column for a right header.
        const headerPosition = this._ctx.getHeaderPosition();
        const inverted = isVertical
            ? headerPosition === 'right'
            : headerPosition === 'bottom';

        path.setAttribute(
            'd',
            this._wrappedPathData(
                runs,
                isVertical,
                inverted,
                minLeft,
                minTop,
                t
            )
        );
    }

    /**
     * Bucket a group's visible tabs into line-runs by their cross-axis offset
     * (rows by `top`, columns by `left`), with a 2px sub-pixel tolerance.
     * `firstRun` is the run holding the group's first tab (the chip's line),
     * tracked by reference so it is correct regardless of axis or header side (a
     * `vertical-rl` first column is right-most, not left-most).
     */
    private _computeWrappedRuns(
        tg: ITabGroup,
        containerRect: DOMRect,
        tabMap: Map<string, IValueDisposable<Tab>>,
        isVertical: boolean
    ): { runs: WrappedRun[]; firstRun: WrappedRun | undefined } {
        const runs: WrappedRun[] = [];
        let firstRun: WrappedRun | undefined;
        for (const pid of tg.panelIds) {
            const te = tabMap.get(pid);
            if (!te) {
                continue;
            }
            const r = te.value.element.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) {
                continue; // hidden / collapsed
            }
            const top = r.top - containerRect.top;
            const bottom = r.bottom - containerRect.top;
            const left = r.left - containerRect.left;
            const right = r.right - containerRect.left;
            const key = isVertical ? left : top;
            let run = runs.find(
                (x) => Math.abs((isVertical ? x.left : x.top) - key) <= 2
            );
            if (run) {
                run.top = Math.min(run.top, top);
                run.bottom = Math.max(run.bottom, bottom);
                run.left = Math.min(run.left, left);
                run.right = Math.max(run.right, right);
            } else {
                run = { top, bottom, left, right };
                runs.push(run);
            }
            firstRun ??= run;
        }
        return { runs, firstRun };
    }

    /**
     * Build the SVG `path` data for a group's per-line underline segments: a
     * horizontal segment along each row's edge (`svg-y` offset by `minTop`) or a
     * vertical segment down each column's leading edge (`svg-x` offset by
     * `minLeft`). `inverted` moves the line to the header-facing edge.
     */
    private _wrappedPathData(
        runs: readonly WrappedRun[],
        isVertical: boolean,
        inverted: boolean,
        minLeft: number,
        minTop: number,
        t: number
    ): string {
        let d = '';
        for (const run of runs) {
            if (isVertical) {
                const x = inverted
                    ? run.right - minLeft - t / 2
                    : run.left - minLeft + t / 2;
                d += `M ${x},${run.top} L ${x},${run.bottom} `;
            } else {
                const y = inverted
                    ? run.top - minTop + t / 2
                    : run.bottom - minTop - t / 2;
                d += `M ${run.left},${y} L ${run.right},${y} `;
            }
        }
        return d.trim();
    }

    /**
     * Draw a small accent pip at the leading edge of every wrapped line-run a
     * group spans beyond its first. The group's real chip already marks the
     * first run; these lightweight markers echo it on the continuation runs so
     * a group that wraps onto rows/columns 2–3 reads as one group on each line
     * instead of losing its colour after the first.
     *
     * `runs` are the group's line-runs (container-relative geometry) as
     * bucketed by {@link _positionWrappedUnderline}; `firstRun` is the run that
     * holds the chip and is skipped. The pip sits at each continuation run's
     * main-axis start (top of a column, left of a row), centred on the cross
     * axis.
     */
    private _positionContinuationMarkers(
        groupId: string,
        runs: readonly WrappedRun[],
        firstRun: WrappedRun | undefined,
        color: string,
        isVertical: boolean
    ): void {
        const continuationRuns = runs.filter((run) => run !== firstRun);
        const markers = this._syncContinuationMarkers(
            groupId,
            continuationRuns.length
        );

        continuationRuns.forEach((run, i) => {
            const marker = markers[i];
            marker.style.backgroundColor = color;
            if (isVertical) {
                // Column: pip at the top, centred horizontally on the column.
                const center = (run.left + run.right) / 2;
                marker.style.left = `${center - CONTINUATION_PIP_SIZE / 2}px`;
                marker.style.top = `${run.top}px`;
            } else {
                // Row: pip at the left, centred vertically on the row.
                const center = (run.top + run.bottom) / 2;
                marker.style.left = `${run.left}px`;
                marker.style.top = `${center - CONTINUATION_PIP_SIZE / 2}px`;
            }
        });
    }

    /**
     * Ensure the underline element holds a single reusable `<svg><path/></svg>`
     * (created once, reused across frames) and return them.
     */
    protected ensureSvgPath(underline: HTMLElement): {
        svg: SVGSVGElement;
        path: SVGPathElement;
    } {
        const existing = underline.firstElementChild as SVGSVGElement | null;
        if (existing?.tagName === 'svg') {
            return {
                svg: existing,
                path: existing.firstElementChild as SVGPathElement,
            };
        }
        underline.replaceChildren();
        const svg = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg'
        );
        svg.style.display = 'block';
        const path = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path'
        );
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
        underline.appendChild(svg);
        return { svg, path };
    }
}

/**
 * Chrome-style wrap-around indicator using SVG paths.
 */
export class WrapTabGroupIndicator extends BaseTabGroupIndicator {
    private _applyStraightLine(
        svg: SVGSVGElement,
        path: SVGPathElement,
        underline: HTMLElement,
        mainSize: number,
        crossSize: number,
        near: number,
        isVertical: boolean
    ): void {
        // Match the curved path's full cross-size SVG and inset `near` edge so
        // the fallback bar is drawn inside the container clip box too (see the
        // clip note in `applyShape`), never flush against it.
        const svgW = isVertical ? crossSize : mainSize;
        const svgH = isVertical ? mainSize : crossSize;
        svg.setAttribute('width', String(svgW));
        svg.setAttribute('height', String(svgH));
        underline.style.width = `${svgW}px`;
        underline.style.height = `${svgH}px`;
        path.setAttribute(
            'd',
            isVertical
                ? `M ${near},0 L ${near},${mainSize}`
                : `M 0,${near} L ${mainSize},${near}`
        );
    }

    /**
     * Chrome-style wrap-around underline: a stroked SVG path that runs
     * along the bottom (or left edge in vertical mode), curving up and
     * over the active tab with rounded corners.
     *
     * The SVG and path elements are created once per underline and reused;
     * only the `d`, `stroke`, and viewport attributes are updated each frame.
     */
    protected applyShape(
        underline: HTMLElement,
        tg: ITabGroup,
        groupStart: number,
        groupSpan: number,
        containerCrossSize: number,
        activePanelId: string | undefined,
        containerRect: DOMRect,
        isVertical: boolean
    ): void {
        const t = 2; // line thickness in px
        const crossSize = containerCrossSize;
        const mainSize = groupSpan;
        const color = resolveTabGroupAccent(
            tg.color,
            this._ctx.getColorPalette()
        );

        if (mainSize <= 0 || crossSize <= 0 || color === undefined) {
            underline.style.display = 'none';
            return;
        }
        underline.style.display = '';

        // Find the active tab within this group
        let activeTabEntry: IValueDisposable<Tab> | undefined;
        if (activePanelId && tg.panelIds.includes(activePanelId)) {
            activeTabEntry = this._ctx.getTabMap().get(activePanelId);
        }

        // Ensure SVG + path child exists (created once, reused)
        const { svg, path } = this.ensureSvgPath(underline);

        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', String(t));

        // The tab strip (`.dv-tabs-container`) clips its children with
        // `overflow: auto`, and that clip box lines up with this SVG's viewport
        // (the underline element always spans the full container cross-axis).
        // A stroke whose centre is only `half` (t/2) from an edge has its outer
        // rim sitting exactly on the boundary, so the browser shaves it - the
        // accent looks clipped along the tab's outer edge (most visible where
        // the line arches over the active tab). Offset the anchored edges one
        // full stroke-width in so the whole rim clears the clip by `half`, for
        // every header position (top/bottom/left/right).
        const inset = t;
        const headerPosition = this._ctx.getHeaderPosition();
        const isBottomHeader = !isVertical && headerPosition === 'bottom';
        const isRightHeader = isVertical && headerPosition === 'right';

        // `near`: the group's long-run edge (the strip edge adjacent to the
        // content); `far`: the wrap-around edge that arches over the active tab.
        // Both are cross-axis coordinates in the SVG, inset from the clip box.
        let near: number;
        let far: number;
        if (isVertical) {
            near = isRightHeader ? crossSize - inset : inset;
            far = isRightHeader ? inset : crossSize - inset;
        } else {
            near = isBottomHeader ? inset : crossSize - inset;
            far = isBottomHeader ? crossSize - inset : inset;
        }

        if (!activeTabEntry) {
            this._applyStraightLine(
                svg,
                path,
                underline,
                mainSize,
                crossSize,
                near,
                isVertical
            );
            return;
        }

        const activeRect = activeTabEntry.value.element.getBoundingClientRect();

        // Compute active tab start/end relative to the group start
        let aStart: number;
        let aEnd: number;
        if (isVertical) {
            aStart = Math.max(
                0,
                activeRect.top - containerRect.top - groupStart
            );
            aEnd = Math.min(
                mainSize,
                activeRect.bottom - containerRect.top - groupStart
            );
        } else {
            aStart = Math.max(
                0,
                activeRect.left - containerRect.left - groupStart
            );
            aEnd = Math.min(
                mainSize,
                activeRect.right - containerRect.left - groupStart
            );
        }

        if (aEnd <= aStart) {
            this._applyStraightLine(
                svg,
                path,
                underline,
                mainSize,
                crossSize,
                near,
                isVertical
            );
            return;
        }

        const r = 6; // corner radius
        // Curve direction: the sign that steps from the near edge toward the
        // far edge (over the active tab); positive when `far` is the larger.
        const cd = far > near ? 1 : -1;

        if (isVertical) {
            const svgW = crossSize;
            const svgH = mainSize;
            svg.setAttribute('width', String(svgW));
            svg.setAttribute('height', String(svgH));
            underline.style.width = `${svgW}px`;
            underline.style.height = `${svgH}px`;

            const d = [
                `M ${near},0`,
                `L ${near},${aStart - r}`,
                `Q ${near},${aStart} ${near + cd * r},${aStart}`,
                `L ${far - cd * r},${aStart}`,
                `Q ${far},${aStart} ${far},${aStart + r}`,
                `L ${far},${aEnd - r}`,
                `Q ${far},${aEnd} ${far - cd * r},${aEnd}`,
                `L ${near + cd * r},${aEnd}`,
                `Q ${near},${aEnd} ${near},${aEnd + r}`,
                `L ${near},${svgH}`,
            ].join(' ');

            path.setAttribute('d', d);
        } else {
            const svgW = mainSize;
            const svgH = crossSize;
            svg.setAttribute('width', String(svgW));
            svg.setAttribute('height', String(svgH));
            underline.style.width = `${svgW}px`;
            underline.style.height = `${svgH}px`;

            const d = [
                `M 0,${near}`,
                `L ${aStart - r},${near}`,
                `Q ${aStart},${near} ${aStart},${near + cd * r}`,
                `L ${aStart},${far - cd * r}`,
                `Q ${aStart},${far} ${aStart + r},${far}`,
                `L ${aEnd - r},${far}`,
                `Q ${aEnd},${far} ${aEnd},${far - cd * r}`,
                `L ${aEnd},${near + cd * r}`,
                `Q ${aEnd},${near} ${aEnd + r},${near}`,
                `L ${svgW},${near}`,
            ].join(' ');

            path.setAttribute('d', d);
        }
    }
}

/**
 * Flat continuous bar indicator: a plain colored line spanning the full tab
 * group width, with no wrap-around.
 */
export class NoneTabGroupIndicator extends BaseTabGroupIndicator {
    protected applyShape(
        underline: HTMLElement,
        tg: ITabGroup,
        _startEdge: number,
        span: number,
        _containerCrossSize: number,
        _activePanelId: string | undefined,
        _containerRect: DOMRect,
        isVertical: boolean
    ): void {
        const t = 2; // line thickness in px
        const color = resolveTabGroupAccent(
            tg.color,
            this._ctx.getColorPalette()
        );

        if (span <= 0 || color === undefined) {
            underline.style.display = 'none';
            return;
        }
        underline.style.display = '';

        // Clear any SVG content left over from a mode switch
        if (underline.firstElementChild) {
            underline.replaceChildren();
        }

        underline.style.backgroundColor = color;

        if (isVertical) {
            underline.style.width = `${t}px`;
            underline.style.height = `${span}px`;
        } else {
            underline.style.width = `${span}px`;
            underline.style.height = `${t}px`;
        }
    }
}
