import {
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewWillDropEvent,
    DockviewWillShowOverlayLocationEvent,
    EdgeGroupPosition,
    isAnyEdgeGroupEnabled,
    isEdgeGroupEnabled,
    Position,
    PositionResolver,
    PositionResolverArgs,
    PositionResolverResult,
    EDGE_GROUP_DOCK_BAND,
    defineModule,
    EdgeGroupModule,
    IAutoEdgeGroupHost,
    IAutoEdgeGroupService,
} from 'dockview';

/**
 * Distance (px) from the content-area edge within which a drop docks as an
 * **edge group** rather than splitting the group under the cursor.
 *
 * Shared with core, which reserves twice this depth as the root drop target's
 * activation band so the inner "split the grid" band is exactly as deep as this
 * one. Sizing the two independently is what made the inner band a sliver you
 * had to thread a cursor into.
 */
const OUTER_BAND = EDGE_GROUP_DOCK_BAND;

/**
 * Extra depth (px) the pointer must travel back out before the outer band lets
 * go of it.
 *
 * The two bands meet at a hard boundary, and a drag is never a steady hand: at
 * the seam a pixel of jitter flips the drop between "dock as an edge group" and
 * "split the grid at this edge", flickering the indicator and committing
 * whichever one happened to be current on release. Latching the band the
 * pointer entered and requiring a deliberate move out of it makes the choice
 * stick.
 */
const BAND_HYSTERESIS = 8;

/**
 * Cross-axis thickness (px) of the outer band's drop preview: roughly the
 * collapsed strip a drag-revealed edge group docks as, so the preview reads as
 * the thing it is about to create.
 */
const PREVIEW_SIZE = 36;

/** The preview never eats more than this fraction of a small content area. */
const PREVIEW_MAX_RATIO = 0.25;

/** Threshold (%) for the inner "split this group" quadrants. Matches the core
 *  default activation size, so non-edge drops behave as usual. */
const QUADRANT_THRESHOLD = 20;

/** The four true edges (center is never an edge-group band). */
function isEdge(position: Position): position is EdgeGroupPosition {
    return position !== 'center';
}

/** Perpendicular depth (px) of a pointer from the given edge of `rect`. */
function edgeDepth(
    position: EdgeGroupPosition,
    event: DragEvent | PointerEvent,
    rect: DOMRect
): number {
    const x = event.clientX ?? 0;
    const y = event.clientY ?? 0;
    switch (position) {
        case 'left':
            return x - rect.left;
        case 'right':
            return rect.right - x;
        case 'top':
            return y - rect.top;
        case 'bottom':
            return rect.bottom - y;
    }
}

/** The default cursor-quadrant (mirrors core `calculateQuadrantAsPercentage`),
 *  used for the inner band so normal group splitting is preserved. */
function defaultQuadrant(
    zones: ReadonlySet<Position>,
    x: number,
    y: number,
    width: number,
    height: number
): Position | null {
    const xp = (100 * x) / width;
    const yp = (100 * y) / height;
    if (zones.has('left') && xp < QUADRANT_THRESHOLD) {
        return 'left';
    }
    if (zones.has('right') && xp > 100 - QUADRANT_THRESHOLD) {
        return 'right';
    }
    if (zones.has('top') && yp < QUADRANT_THRESHOLD) {
        return 'top';
    }
    if (zones.has('bottom') && yp > 100 - QUADRANT_THRESHOLD) {
        return 'bottom';
    }
    if (!zones.has('center')) {
        return null;
    }
    return 'center';
}

/** Preview thickness for a content area `extent` px across the same axis. */
function previewSize(extent: number): number {
    return Math.max(
        1,
        Math.min(PREVIEW_SIZE, Math.round(extent * PREVIEW_MAX_RATIO))
    );
}

/**
 * Drag-revealed, zero-footprint edges: the two-band drag-reveal affordance. A
 * drag toward the layout edge splits into:
 *
 * - an **outer band** (within {@link OUTER_BAND} of the content-area edge) that
 *   docks the panel as a self-hiding, pinnable **edge group**, previewed with
 *   its own overlay strip and committed via `host.revealEdgeGroupWithData`;
 * - an **inner band** (the same depth again) that splits the group under the
 *   cursor as usual.
 *
 * Exactly one of the two is ever advertised. The bands abut, and the root edge
 * drop target activates across both, so the outer band takes the preview off it
 * (`suppressOverlay`) for the frames it owns; and the boundary latches
 * ({@link BAND_HYSTERESIS}) so a hand that wobbles across it does not flip the
 * drop. Every path - overlay, resolver, commit - classifies through the one
 * {@link AutoEdgeGroupService._isEdgeGroupBand} call, so they agree by
 * construction.
 *
 * Over a **populated** layout the outer band is reached via a
 * {@link PositionResolver} installed on the group content drop targets (the
 * same mechanism the DnD compass uses), so it works without the
 * compass. Over an empty grid it also handles the root edge target's
 * `kind: 'edge'` overlays directly. It never `preventDefault`s the overlay
 * (that would clear the drop state), only takes over the drawing and preempts
 * the commit at `onWillDrop`.
 */
export class AutoEdgeGroupService
    extends CompositeDisposable
    implements IAutoEdgeGroupService
{
    private _highlight: HTMLElement | undefined;
    /** The edge whose outer band currently holds the pointer, if any. See
     *  {@link AutoEdgeGroupService._isEdgeGroupBand}. */
    private _latchedEdge: EdgeGroupPosition | undefined;
    private readonly _resolver: PositionResolver = {
        resolve: (args) => this._resolve(args),
    };

    constructor(private readonly host: IAutoEdgeGroupHost) {
        super();

        const doc = this.host.overlayRoot.ownerDocument;
        const hide = (): void => this._hide();

        this.addDisposables(
            this.host.onWillShowOverlay((e) => this._onWillShowOverlay(e)),
            this.host.onWillDrop((e) => this._onWillDrop(e)),
            // Belt-and-braces cleanup: `onWillShowOverlay` stops firing once the
            // pointer leaves the edge band, so hide the highlight when any drag
            // ends anywhere.
            (() => {
                doc.addEventListener('drop', hide, true);
                doc.addEventListener('dragend', hide, true);
                doc.addEventListener('pointerup', hide, true);
                return {
                    dispose: () => {
                        doc.removeEventListener('drop', hide, true);
                        doc.removeEventListener('dragend', hide, true);
                        doc.removeEventListener('pointerup', hide, true);
                    },
                };
            })(),
            { dispose: () => this._hide() }
        );
    }

    /** Installed on the group content drop targets only while enabled. */
    get resolver(): PositionResolver | undefined {
        return this._enabled ? this._resolver : undefined;
    }

    private get _enabled(): boolean {
        return isAnyEdgeGroupEnabled(this.host.options.dockToEdgeGroups);
    }

    /** Edge-band detection only: an `edge` cell in the outer band, else null.
     *  Composed with another resolver (the compass) by the host. */
    resolveEdge(args: PositionResolverArgs): PositionResolverResult | null {
        if (!this._enabled) {
            return null;
        }
        const rect = this.host.getDropZoneRect();
        for (const pos of [
            'left',
            'right',
            'top',
            'bottom',
        ] as EdgeGroupPosition[]) {
            if (
                args.zones.has(pos) &&
                this._isEdgeGroupBand(pos, args.event, rect)
            ) {
                return { position: pos, edge: true, edgeGroup: true };
            }
        }
        return null;
    }

    /**
     * The single classifier every path asks: is this pointer in `position`'s
     * outer "dock as an edge group" band?
     *
     * Overlay drawing, position resolution and the drop commit all route
     * through here so they cannot disagree - a preview that says "edge group"
     * and a drop that splits the grid is the worst version of this feature.
     *
     * The band latches (see {@link BAND_HYSTERESIS}): once the pointer is
     * inside, it stays inside until it moves a further `BAND_HYSTERESIS` back
     * out, so the boundary is sticky rather than a coin toss. Only the latched
     * edge's own test can release the latch, so probing the other three edges
     * (as `resolveEdge` does on every frame) never clears it.
     */
    private _isEdgeGroupBand(
        position: EdgeGroupPosition,
        event: DragEvent | PointerEvent,
        rect: DOMRect
    ): boolean {
        if (!isEdgeGroupEnabled(this.host.options.dockToEdgeGroups, position)) {
            return false;
        }
        const latched = this._latchedEdge === position;
        const depth = edgeDepth(position, event, rect);
        const inBand =
            depth <= (latched ? OUTER_BAND + BAND_HYSTERESIS : OUTER_BAND);

        if (inBand) {
            this._latchedEdge = position;
        } else if (latched) {
            this._latchedEdge = undefined;
        }
        return inBand;
    }

    private _resolve(
        args: PositionResolverArgs
    ): PositionResolverResult | null {
        const edge = this.resolveEdge(args);
        if (edge) {
            return edge;
        }
        const quadrant = defaultQuadrant(
            args.zones,
            args.x,
            args.y,
            args.width,
            args.height
        );
        return quadrant ? { position: quadrant, edge: false } : null;
    }

    private _onWillShowOverlay(e: DockviewWillShowOverlayLocationEvent): void {
        // Show the edge-group preview iff the pointer is in the true outer
        // band, purely by depth, so it never lights up for a compass outer-ring
        // cell (grid-edge dock, further in) or a normal group split.
        if (!this._enabled || !isEdge(e.position)) {
            this._hide();
            return;
        }
        const rect = this.host.getDropZoneRect();
        if (!this._isEdgeGroupBand(e.position, e.nativeEvent, rect)) {
            this._hide();
            return;
        }

        // Take the preview off the drop target for this frame. The root edge
        // target activates over both bands and would otherwise paint its
        // "split the grid at this edge" overlay underneath this one: two
        // indicators for one pointer position, advertising two different drops,
        // only one of which is the one about to happen.
        //
        // `suppressOverlay`, not `preventDefault`: the latter would drop the
        // target's latched state and with it the drop this is previewing.
        e.suppressOverlay();
        this._show(e.position);
    }

    private _onWillDrop(e: DockviewWillDropEvent): void {
        if (!this._enabled || e.kind !== 'edge' || !isEdge(e.position)) {
            this._hide();
            return;
        }
        const data = e.getData();
        if (!data) {
            this._hide();
            return;
        }
        // Classify before hiding: `_hide` drops the latch, and the drop has to
        // land on whichever band the preview was showing when the pointer was
        // released, not on a re-classification without it.
        const rect = this.host.getDropZoneRect();
        const outer = this._isEdgeGroupBand(e.position, e.nativeEvent, rect);
        this._hide();
        if (!outer) {
            // Inner band (root path) → let core split the grid.
            return;
        }
        // Outer band → we own it. Preempt the core commit and reveal the edge
        // group. Revealed edges come in as pinnable tool windows (auto-hide).
        e.preventDefault();
        this.host.revealEdgeGroupWithData(
            e.position,
            { groupId: data.groupId, panelId: data.panelId ?? undefined },
            { autoHide: true }
        );
    }

    private _show(position: EdgeGroupPosition): void {
        const doc = this.host.overlayRoot.ownerDocument;
        let el = this._highlight;
        if (!el) {
            el = doc.createElement('div');
            this._highlight = el;
            this.host.overlayRoot.appendChild(el);
        }

        // A strip hugging the content-area edge, the footprint the new edge
        // group would take, with an accent rail on the outer side. Styled by
        // `.dv-auto-edge-band` (+ the per-edge modifier that places the rail) in
        // core; the module only sets geometry. Since this is now the *only*
        // indicator drawn for the outer band, it has to say what it does: a
        // strip that reads as a docked panel, not a hairline that reads as a
        // seam.
        el.className = `dv-auto-edge-band dv-auto-edge-band-${position}`;

        // Position the strip at the content-area edge, in overlayRoot-local
        // coordinates (the content area is inset when edge groups are present).
        const dz = this.host.getDropZoneRect();
        const root = this.host.overlayRoot.getBoundingClientRect();
        const left = dz.left - root.left;
        const top = dz.top - root.top;
        const vertical = position === 'left' || position === 'right';
        const size = previewSize(vertical ? dz.width : dz.height);

        el.style.top = '';
        el.style.right = '';
        el.style.bottom = '';
        el.style.left = '';
        el.style.width = '';
        el.style.height = '';
        switch (position) {
            case 'left':
                el.style.left = `${left}px`;
                el.style.top = `${top}px`;
                el.style.width = `${size}px`;
                el.style.height = `${dz.height}px`;
                break;
            case 'right':
                el.style.left = `${left + dz.width - size}px`;
                el.style.top = `${top}px`;
                el.style.width = `${size}px`;
                el.style.height = `${dz.height}px`;
                break;
            case 'top':
                el.style.left = `${left}px`;
                el.style.top = `${top}px`;
                el.style.width = `${dz.width}px`;
                el.style.height = `${size}px`;
                break;
            case 'bottom':
                el.style.left = `${left}px`;
                el.style.top = `${top + dz.height - size}px`;
                el.style.width = `${dz.width}px`;
                el.style.height = `${size}px`;
                break;
        }
    }

    private _hide(): void {
        this._highlight?.remove();
        this._highlight = undefined;
        this._latchedEdge = undefined;
    }
}

export const AutoEdgeGroupModule = defineModule<
    'autoEdgeGroupService',
    IAutoEdgeGroupHost
>({
    name: 'AutoEdgeGroup',
    options: ['dockToEdgeGroups'],
    serviceKey: 'autoEdgeGroupService',
    dependsOn: [EdgeGroupModule],
    create: (host) => new AutoEdgeGroupService(host),
});
