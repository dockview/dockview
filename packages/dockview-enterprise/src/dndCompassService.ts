import {
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewIDisposable as IDisposable,
    DockviewGroupPanel,
    DockviewWillShowOverlayLocationEvent,
    Position,
    PositionResolver,
    PositionResolverArgs,
    PositionResolverResult,
    defineModule,
    IDndCompassHost,
    IDndCompassService,
    AdvancedDnDModule,
} from 'dockview';

/** Size (px) of each compass cell + the gap between them. */
const CELL = 38;
const GAP = 4;

/** The inner drop cells, in render order. */
const INNER_CELLS: Position[] = ['center', 'top', 'bottom', 'left', 'right'];
/** The four directional cells (the inner ring's arms + the outer ring). */
const DIRECTIONS: Exclude<Position, 'center'>[] = [
    'top',
    'bottom',
    'left',
    'right',
];

interface CompassCell {
    readonly position: Position;
    readonly left: number;
    readonly top: number;
    readonly size: number;
    /** An outer cell that docks against the whole layout, not this group. */
    readonly edge: boolean;
}

/** Half-of-the-layout band along each edge, keyed by the outer cell's direction. */
/** Half-of-the-layout band along each edge, keyed by the outer cell's direction. */
const EDGE_PREVIEW_INSETS: Record<Position, Partial<CSSStyleDeclaration>> = {
    center: {},
    top: { inset: '0 0 auto 0', width: '100%', height: '50%' },
    bottom: { inset: 'auto 0 0 0', width: '100%', height: '50%' },
    left: { inset: '0 auto 0 0', width: '50%', height: '100%' },
    right: { inset: '0 0 0 auto', width: '50%', height: '100%' },
};

const UNIT: Record<Position, { dx: number; dy: number }> = {
    center: { dx: 0, dy: 0 },
    top: { dx: 0, dy: -1 },
    bottom: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
};

/**
 * The cross of cells centred in a `width`×`height` target: the inner ring
 * (split/merge this group, restricted to `zones`) plus, when `includeEdges`, an
 * outer ring of directional cells that dock against the whole layout. The
 * resolver hit-tests these rects and the widget paints them from one geometry,
 * so you aim at exactly the cell you see.
 */
function compassCells(
    width: number,
    height: number,
    zones: ReadonlySet<Position>,
    includeEdges: boolean
): CompassCell[] {
    const half = CELL / 2;
    const step = CELL + GAP;
    const cx = width / 2 - half;
    const cy = height / 2 - half;
    const cell = (p: Position, ring: number, edge: boolean): CompassCell => ({
        position: p,
        left: cx + UNIT[p].dx * step * ring,
        top: cy + UNIT[p].dy * step * ring,
        size: CELL,
        edge,
    });
    const cells: CompassCell[] = [];
    for (const p of INNER_CELLS) {
        if (zones.has(p)) {
            cells.push(cell(p, p === 'center' ? 0 : 1, false));
        }
    }
    if (includeEdges) {
        for (const p of DIRECTIONS) {
            cells.push(cell(p, 2, true));
        }
    }
    return cells;
}

function intersect(
    a: ReadonlySet<Position>,
    b: ReadonlySet<Position>
): Set<Position> {
    return new Set([...a].filter((p) => b.has(p)));
}

/** Small disposable DOM listener helper (core's is not exported). */
function listen(
    target: EventTarget,
    type: string,
    handler: (e: Event) => void
): IDisposable {
    target.addEventListener(type, handler, true);
    return {
        dispose: () => target.removeEventListener(type, handler, true),
    };
}

/**
 * The {@link PositionResolver} the host installs at the drop-target seam in
 * place of the cursor-quadrant logic: hit-test the pointer against the compass
 * cells (centred cross), gated by the target's accepted zones intersected with
 * the configured `dndCompass.zones`. A miss (a dead corner) returns `null`. A
 * per-cell veto is enforced by the drop target itself (`canDisplayOverlay`).
 */
class CompassResolver implements PositionResolver {
    constructor(
        private readonly configuredZones: () =>
            | ReadonlySet<Position>
            | undefined,
        private readonly edgesEnabled: () => boolean
    ) {}

    resolve(args: PositionResolverArgs): PositionResolverResult | null {
        const configured = this.configuredZones();
        const zones = configured
            ? intersect(args.zones, configured)
            : args.zones;
        const cells = compassCells(
            args.width,
            args.height,
            zones,
            this.edgesEnabled()
        );

        return this._exactHit(cells, args) ?? this._gapFill(cells, args);
    }

    /** Exact hit-test, the fast path. */
    private _exactHit(
        cells: readonly CompassCell[],
        args: PositionResolverArgs
    ): PositionResolverResult | null {
        for (const cell of cells) {
            if (
                args.x >= cell.left &&
                args.x <= cell.left + cell.size &&
                args.y >= cell.top &&
                args.y <= cell.top + cell.size
            ) {
                return { position: cell.position, edge: cell.edge };
            }
        }
        return null;
    }

    /**
     * The cells form a plus/cross: a vertical column (all share the central
     * cell's x) and a horizontal row (all share its y), separated by a GAP-wide
     * space. Exact hit-testing returns null in those gaps, so the drop overlay
     * blinks out as the cursor crosses from one cell to its neighbour. Snap a
     * pointer sitting in an on-axis gap to its nearest collinear cell (within
     * one GAP) so the overlay stays put. A pointer off both axes (a corner) is a
     * genuine dead zone → null.
     */
    private _gapFill(
        cells: readonly CompassCell[],
        args: PositionResolverArgs
    ): PositionResolverResult | null {
        const half = CELL / 2;
        const cx = args.width / 2 - half; // the central cell's left
        const cy = args.height / 2 - half; // the central cell's top
        const inColumn = args.x >= cx && args.x <= cx + CELL;
        const inRow = args.y >= cy && args.y <= cy + CELL;

        let best: CompassCell | undefined;
        let bestDist = Infinity;
        for (const cell of cells) {
            let dist: number;
            if (inColumn && cell.left === cx) {
                // a vertical neighbour: gap distance along y
                dist = Math.max(
                    cell.top - args.y,
                    args.y - (cell.top + cell.size),
                    0
                );
            } else if (inRow && cell.top === cy) {
                // a horizontal neighbour: gap distance along x
                dist = Math.max(
                    cell.left - args.x,
                    args.x - (cell.left + cell.size),
                    0
                );
            } else {
                continue;
            }
            if (dist <= GAP && dist < bestDist) {
                bestDist = dist;
                best = cell;
            }
        }
        return best ? { position: best.position, edge: best.edge } : null;
    }
}

/** The cross of cells painted over the hovered group's content area. */
class CompassWidget {
    private readonly _element: HTMLElement;
    private readonly _container: HTMLElement;
    private readonly _priorPosition: string;
    private _cells: { position: Position; edge: boolean; el: HTMLElement }[] =
        [];

    constructor(container: HTMLElement) {
        this._container = container;
        // Pin a stable containing block. The drop target sets `position:
        // relative` on this element only while an inner-cell overlay shows (the
        // `.dv-drop-target` class), and removes it for edge cells. Without this,
        // the absolutely-positioned compass re-anchors to a higher ancestor on
        // an outer cell and visibly jumps. Restored on dispose.
        this._priorPosition = container.style.position;
        container.style.position = 'relative';

        const doc = container.ownerDocument;
        const el = doc.createElement('div');
        el.className = 'dv-dnd-compass';
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.top = '0';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.pointerEvents = 'none';
        el.style.overflow = 'hidden';
        container.appendChild(el);
        this._element = el;
    }

    /**
     * Paint the cells `gate` accepts (so only legal drops show), centred on
     * `outline` (the frame the drop target measures). The service mounts this
     * widget on `outline`, so the translation below is normally zero; it is kept
     * so the cells still line up with where a drop resolves should the two boxes
     * ever diverge.
     */
    render(
        outline: HTMLElement,
        zones: ReadonlySet<Position>,
        includeEdges: boolean,
        gate: (cell: { position: Position; edge: boolean }) => boolean
    ): void {
        const doc = this._element.ownerDocument;
        const elRect = this._element.getBoundingClientRect();
        const oRect = outline.getBoundingClientRect();
        const dx = oRect.left - elRect.left;
        const dy = oRect.top - elRect.top;
        const cells = compassCells(
            oRect.width,
            oRect.height,
            zones,
            includeEdges
        ).filter(gate);
        this._element.replaceChildren();
        this._cells = [];
        for (const cell of cells) {
            const el = doc.createElement('div');
            el.className =
                `dv-dnd-compass-cell dv-dnd-compass-cell-${cell.position}` +
                (cell.edge ? ' dv-dnd-compass-cell-edge' : '');
            el.style.position = 'absolute';
            el.style.left = `${cell.left + dx}px`;
            el.style.top = `${cell.top + dy}px`;
            el.style.width = `${cell.size}px`;
            el.style.height = `${cell.size}px`;
            this._element.appendChild(el);
            this._cells.push({ position: cell.position, edge: cell.edge, el });
        }
    }

    /**
     * Highlight the cell the cursor is aiming at. This is the only hover
     * feedback an outer (edge) cell gets, since the drop target draws no overlay
     * for it. `edge` disambiguates the inner vs outer cell that share a direction.
     */
    setActive(position: Position, edge: boolean): void {
        for (const c of this._cells) {
            c.el.classList.toggle(
                'dv-dnd-compass-cell-active',
                c.position === position && c.edge === edge
            );
        }
    }

    /** Clear the aimed-cell highlight (cursor is over no cell). */
    clearActive(): void {
        for (const c of this._cells) {
            c.el.classList.remove('dv-dnd-compass-cell-active');
        }
    }

    dispose(): void {
        this._element.remove();
        this._container.style.position = this._priorPosition;
    }
}

/**
 * DnD compass: a VS Code-style aim-at-a-cell drop overlay for group
 * docking. While a panel/group is dragged over a group, a cross of cells is
 * painted over it and the dragged item snaps to whichever cell the cursor is
 * over (instead of the cursor-quadrant of the target). Drop resolution + commit
 * stay in core: the service installs a {@link CompassResolver} at the drop-target
 * seam and paints the widget. Opt-in via `dndCompass` (default off → unchanged).
 *
 * Inner cells split/merge the hovered group; the outer ring (`edge` cells) docks
 * against the whole layout (core routes `edge`-flagged drops to the layout edge).
 * Cells the drop would reject are hidden (per-cell gating).
 */
export class DndCompassService
    extends CompositeDisposable
    implements IDndCompassService
{
    private readonly _resolver: CompassResolver;
    private _mounted:
        | {
              group: DockviewGroupPanel;
              widget: CompassWidget;
              outline: HTMLElement;
              /** The element the content drop target listens on. */
              content: HTMLElement;
          }
        | undefined;
    private _endListeners: CompositeDisposable | undefined;
    private _edgePreview: HTMLElement | undefined;

    constructor(private readonly host: IDndCompassHost) {
        super();

        this._resolver = new CompassResolver(
            () => this._configuredZones(),
            () => this._edgesEnabled()
        );

        this.addDisposables(
            this.host.onWillShowOverlay((e) => this._onWillShowOverlay(e)),
            { dispose: () => this._unmount() }
        );
    }

    /** Installed by the host only while the compass is enabled. */
    get resolver(): PositionResolver | undefined {
        return this._enabled ? this._resolver : undefined;
    }

    private get _enabled(): boolean {
        return !!this.host.options.dndCompass;
    }

    /** Cells the option restricts the compass to, or `undefined` for all. */
    private _configuredZones(): ReadonlySet<Position> | undefined {
        const compass = this.host.options.dndCompass;
        if (compass && typeof compass === 'object' && compass.zones) {
            return new Set(compass.zones);
        }
        return undefined;
    }

    /** Whether the outer whole-layout-edge cells are shown (default true). */
    private _edgesEnabled(): boolean {
        const compass = this.host.options.dndCompass;
        if (compass && typeof compass === 'object') {
            return compass.edges !== false;
        }
        return !!compass;
    }

    private _onWillShowOverlay(e: DockviewWillShowOverlayLocationEvent): void {
        // The compass covers the group content target.
        if (!this._enabled || e.kind !== 'content' || !e.group) {
            return;
        }
        // An edge-group cell (the true outer edge, when auto edge groups compose
        // with the compass) is owned by the edge-group affordance; bow out so
        // the two don't double-render.
        if (e.edgeGroup) {
            this._unmount();
            return;
        }
        this._mount(e.group, e.nativeEvent);
        if (!this._mounted) {
            return; // no compass mounted (e.g. no content container), nothing to drive
        }
        // Fires per drag-over frame while over a cell: light up the cell being
        // aimed at, and for an outer cell preview the layout-edge region. A move
        // off the cells is handled by `_clearFeedbackIfOffCells` (this event
        // doesn't fire in a dead zone).
        this._mounted.widget.setActive(e.position, e.edge);
        if (e.edge) {
            this._showEdgePreview(e.position);
        } else {
            this._clearEdgePreview();
        }
    }

    /**
     * Drive the compass off raw pointer movement, which reports where the cursor
     * actually is: `onWillShowOverlay` only fires while it is over a cell of a
     * group that accepts the drop, so on its own the widget would sit there for
     * the rest of the drag.
     *
     * The compass is the aiming UI for one group's content drop target, and that
     * target only receives events while the cursor is over its element. So the
     * widget lives exactly as long as the cursor is over that element: move onto
     * the tab strip, a sash, another group, or out of the window and it goes.
     */
    private _onMove(event: DragEvent | PointerEvent): void {
        if (!this._mounted) {
            return;
        }
        const r = this._mounted.content.getBoundingClientRect();
        const inside =
            event.clientX >= r.left &&
            event.clientX <= r.right &&
            event.clientY >= r.top &&
            event.clientY <= r.bottom;
        if (!inside) {
            this._unmount();
            return;
        }
        this._clearFeedbackIfOffCells(event);
    }

    /**
     * Clear the feedback when the cursor is over no cell (a dead zone between
     * cells, or off the group). `onWillShowOverlay` only fires on a cell, so
     * without this the highlight + edge preview would linger. It only ever
     * clears (setting stays with `onWillShowOverlay`), so the two never conflict.
     */
    private _clearFeedbackIfOffCells(event: DragEvent | PointerEvent): void {
        if (!this._mounted) {
            return;
        }
        const rect = this._mounted.outline.getBoundingClientRect();
        const onCell = this._resolver.resolve({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            width: rect.width,
            height: rect.height,
            zones: new Set(INNER_CELLS),
            event,
        });
        if (!onCell) {
            this._mounted.widget.clearActive();
            this._clearEdgePreview();
        }
    }

    /**
     * Preview the whole-layout-edge region an outer cell docks into (the half
     * the panel will occupy), styled with the same theme variables as a real
     * drop overlay so it reads identically. Drawn over the layout root (a
     * positioned element), beneath the compass.
     */
    private _showEdgePreview(position: Position): void {
        const layout = this.host.getLayoutElement();
        if (!this._edgePreview) {
            const el = layout.ownerDocument.createElement('div');
            el.className = 'dv-dnd-compass-edge-preview';
            el.style.position = 'absolute';
            el.style.pointerEvents = 'none';
            layout.appendChild(el);
            this._edgePreview = el;
        }
        Object.assign(this._edgePreview.style, EDGE_PREVIEW_INSETS[position]);
    }

    private _clearEdgePreview(): void {
        this._edgePreview?.remove();
        this._edgePreview = undefined;
    }

    private _mount(
        group: DockviewGroupPanel,
        event: DragEvent | PointerEvent
    ): void {
        if (this._mounted?.group === group) {
            return; // already showing on this group
        }
        this._unmount();

        const content = group.element.querySelector<HTMLElement>(
            '.dv-content-container'
        );
        if (!content) {
            return;
        }

        // The frame the drop target measures (the whole group or only the
        // content, per `dndPanelOverlay`); fall back to the content container.
        const outline = this.host.getDropOverlayElement(group) ?? content;
        // Mount in that same frame. The widget clips to its own box, so
        // mounting anywhere else means cells computed in the outline's
        // coordinates get cut off by a smaller clip box while staying
        // hit-testable, with `dndPanelOverlay: 'group'` the cross is centred
        // on the group but clipped to the content, losing the top of the ring
        // to the tab header. Same element ⟹ clip box, paint box and hit-test
        // box are one.
        const widget = new CompassWidget(outline);
        const all = new Set(INNER_CELLS);
        const configured = this._configuredZones();
        // Cache the veto per direction: the inner and outer cell of a direction
        // share a position, and `canDropOnGroup` can fire `onUnhandledDragOver`
        // for a cross-component drag, so resolve each position at most once.
        const allowed = new Map<Position, boolean>();
        widget.render(
            outline,
            configured ? intersect(all, configured) : all,
            this._edgesEnabled(),
            // Hide cells the drop would reject. Outer (edge) cells are gated the
            // same way they commit: the drop target routes an edge drop to the
            // layout edge only after the group's own content veto passes, so the
            // compass must apply that veto here too or it would paint a cell that
            // does nothing on drop.
            (cell) => {
                let ok = allowed.get(cell.position);
                if (ok === undefined) {
                    ok = this.host.canDropOnGroup(group, cell.position, event);
                    allowed.set(cell.position, ok);
                }
                return ok;
            }
        );
        this._mounted = { group, widget, outline, content };

        // The drag has no "left everything" event. Tear the widget down when the
        // drag ends (drop / dragend / pointerup / cancel); drive the rest off
        // every move, which is the only signal that reports leaving the group.
        const win = group.element.ownerDocument.defaultView ?? window;
        const end = (): void => this._unmount();
        const move = (ev: Event): void =>
            this._onMove(ev as DragEvent | PointerEvent);
        this._endListeners = new CompositeDisposable(
            listen(win, 'drop', end),
            listen(win, 'dragend', end),
            listen(win, 'pointerup', end),
            listen(win, 'pointercancel', end),
            listen(win, 'pointermove', move),
            listen(win, 'dragover', move)
        );
    }

    private _unmount(): void {
        this._endListeners?.dispose();
        this._endListeners = undefined;
        this._mounted?.widget.dispose();
        this._mounted = undefined;
        this._clearEdgePreview();
    }
}

export const DndCompassModule = defineModule<
    'dndCompassService',
    IDndCompassHost
>({
    name: 'DndCompass',
    options: ['dndCompass'],
    serviceKey: 'dndCompassService',
    dependsOn: [AdvancedDnDModule],
    create: (host) => new DndCompassService(host),
});
