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
    defineModule,
    DockviewIDisposable as IDisposable,
    getPanelData,
    EdgeGroupModule,
    IAutoEdgeGroupHost,
    IAutoEdgeGroupService,
} from 'dockview';

/**
 * Distance (px) from the content-area edge within which a drop docks as an
 * **edge group** rather than splitting the group under the cursor.
 */
const OUTER_BAND = 16;

/** Threshold (%) for the inner "split this group" quadrants. Matches the core
 *  default activation size, so non-edge drops behave as usual. */
const QUADRANT_THRESHOLD = 20;

const EDGES: readonly EdgeGroupPosition[] = ['left', 'right', 'top', 'bottom'];

/**
 * Document events that end a drag, per backend. A native HTML5 drag fires
 * `pointercancel` as it starts, so pointer events must not end one.
 */
const HTML5_DRAG_END = ['drop', 'dragend'];
const POINTER_DRAG_END = ['pointerup', 'pointercancel'];

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

/**
 * Drag-revealed, zero-footprint edges: the two-band drag-reveal affordance. A
 * drag toward the layout edge splits into:
 *
 * - an **outer band** (within {@link OUTER_BAND} of the content-area edge) that
 *   docks the panel as a self-hiding, pinnable **edge group**, highlighted
 *   with its own overlay strip and committed via `host.revealEdgeGroupWithData`;
 * - an **inner band** that splits the group under the cursor as usual.
 *
 * Over a **populated** layout the outer band is reached via a
 * {@link PositionResolver} installed on the group content drop targets (the
 * same mechanism the DnD compass uses), so it works without the
 * compass. Over an empty grid it also handles the root edge target's
 * `kind: 'edge'` overlays directly. During a drag it mounts an edge drop strip
 * on each enabled edge, above the headers. It never `preventDefault`s the
 * overlay (that would clear the drop state), only draws its highlight on top
 * and preempts the commit at `onWillDrop`.
 */
export class AutoEdgeGroupService
    extends CompositeDisposable
    implements IAutoEdgeGroupService
{
    private _highlight: HTMLElement | undefined;
    private _strips: IDisposable | undefined;
    private _mountTimer: ReturnType<typeof setTimeout> | undefined;
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
            this.host.onWillDragPanel((e) =>
                this._scheduleStrips(e.nativeEvent)
            ),
            this.host.onWillDragGroup((e) =>
                this._scheduleStrips(e.nativeEvent)
            ),
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
            {
                dispose: () => {
                    this._hide();
                    clearTimeout(this._mountTimer);
                    this._removeStrips();
                },
            }
        );
    }

    /** Deferred a tick: mutating the DOM in `dragstart` can abort an HTML5
     *  drag. */
    private _scheduleStrips(nativeEvent: DragEvent | PointerEvent): void {
        clearTimeout(this._mountTimer);
        this._mountTimer = setTimeout(() => {
            this._mountTimer = undefined;
            // No drag data a tick later: the drag was vetoed (or never began).
            if (getPanelData()) {
                this._mountStrips(nativeEvent);
            }
        });
    }

    private _mountStrips(dragStart: DragEvent | PointerEvent): void {
        this._removeStrips();
        // An app-supplied `dropPositionResolver` owns drop positions.
        if (!this._enabled || this.host.options.dropPositionResolver) {
            return;
        }

        const elements: HTMLElement[] = [];
        const targets: IDisposable[] = [];
        for (const position of EDGES) {
            if (this._isEdgeEnabled(position)) {
                const element = this._createStrip(position);
                this.host.overlayRoot.appendChild(element);
                elements.push(element);
                targets.push(this.host.createEdgeDropTarget(element, position));
            }
        }

        // Removed a tick after the drag ends so the final drop still lands.
        // A popout drag ends in the popout's document.
        const isHtml5 = dragStart.type.startsWith('drag');
        const endEvents = isHtml5 ? HTML5_DRAG_END : POINTER_DRAG_END;
        const pointerId = isHtml5
            ? undefined
            : (dragStart as PointerEvent).pointerId;
        const docs = new Set<Document>([this.host.overlayRoot.ownerDocument]);
        const sourceDoc = (dragStart.target as Node | null)?.ownerDocument;
        if (sourceDoc) {
            docs.add(sourceDoc);
        }
        const end = (event: Event): void => {
            // Only the dragging pointer ends a pointer drag.
            if (
                pointerId !== undefined &&
                (event as PointerEvent).pointerId !== pointerId
            ) {
                return;
            }
            setTimeout(() => this._removeStrips());
        };
        for (const doc of docs) {
            for (const type of endEvents) {
                doc.addEventListener(type, end, true);
            }
        }

        this._strips = {
            dispose: () => {
                for (const doc of docs) {
                    for (const type of endEvents) {
                        doc.removeEventListener(type, end, true);
                    }
                }
                for (const target of targets) {
                    target.dispose();
                }
                for (const element of elements) {
                    element.remove();
                }
            },
        };
    }

    private _removeStrips(): void {
        this._strips?.dispose();
        this._strips = undefined;
    }

    private _createStrip(position: EdgeGroupPosition): HTMLElement {
        const element =
            this.host.overlayRoot.ownerDocument.createElement('div');
        element.className = `dv-edge-drop-strip dv-edge-drop-strip--${position}`;
        element.dataset.position = position;

        // Thickness and the bottom / right offset come from the stylesheet.
        const { left, top, width, height } = this._contentArea();
        element.style.left = `${position === 'right' ? left + width : left}px`;
        element.style.top = `${position === 'bottom' ? top + height : top}px`;
        if (position === 'top' || position === 'bottom') {
            element.style.width = `${width}px`;
        } else {
            element.style.height = `${height}px`;
        }
        return element;
    }

    /** The content area in overlayRoot-local coordinates. */
    private _contentArea(): {
        left: number;
        top: number;
        width: number;
        height: number;
    } {
        const dz = this.host.getDropZoneRect();
        const root = this.host.overlayRoot.getBoundingClientRect();
        return {
            left: dz.left - root.left,
            top: dz.top - root.top,
            width: dz.width,
            height: dz.height,
        };
    }

    /** Installed on the group content drop targets only while enabled. */
    get resolver(): PositionResolver | undefined {
        return this._enabled ? this._resolver : undefined;
    }

    private get _enabled(): boolean {
        return isAnyEdgeGroupEnabled(this.host.options.dockToEdgeGroups);
    }

    /** Whether `position` is an edge enabled in `dockToEdgeGroups`. */
    private _isEdgeEnabled(position: Position): position is EdgeGroupPosition {
        return (
            isEdge(position) &&
            isEdgeGroupEnabled(this.host.options.dockToEdgeGroups, position)
        );
    }

    /** Edge-band detection only: an `edge` cell in the outer band, else null.
     *  Composed with another resolver (the compass) by the host. */
    resolveEdge(args: PositionResolverArgs): PositionResolverResult | null {
        if (!this._enabled) {
            return null;
        }
        const rect = this.host.getDropZoneRect();
        for (const pos of EDGES) {
            if (
                args.zones.has(pos) &&
                this._isEdgeEnabled(pos) &&
                edgeDepth(pos, args.event, rect) <= OUTER_BAND
            ) {
                return { position: pos, edge: true, edgeGroup: true };
            }
        }
        return null;
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
        // Show the edge-group indicator line iff the pointer is in the true
        // outer band, purely by depth, so it never lights up for a compass
        // outer-ring cell (grid-edge dock, further in) or a normal group split.
        if (!this._isEdgeEnabled(e.position)) {
            this._hide();
            return;
        }
        const rect = this.host.getDropZoneRect();
        if (edgeDepth(e.position, e.nativeEvent, rect) <= OUTER_BAND) {
            this._show(e.position);
        } else {
            this._hide();
        }
    }

    private _onWillDrop(e: DockviewWillDropEvent): void {
        this._hide();
        if (e.kind !== 'edge' || !this._isEdgeEnabled(e.position)) {
            return;
        }
        const data = e.getData();
        if (!data) {
            return;
        }
        const rect = this.host.getDropZoneRect();
        if (edgeDepth(e.position, e.nativeEvent, rect) > OUTER_BAND) {
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
            // A thin accent line hugging the content-area edge in the direction
            // the new edge group would appear. Styled by `.dv-auto-edge-band`
            // in core (theme drag-over colour); the module only sets geometry.
            el.className = 'dv-auto-edge-band';
            this._highlight = el;
            this.host.overlayRoot.appendChild(el);
        }

        // Position the line at the content-area edge.
        const dz = this._contentArea();
        const { left, top } = dz;
        const LINE = 3; // px thickness of the indicator line

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
                el.style.width = `${LINE}px`;
                el.style.height = `${dz.height}px`;
                break;
            case 'right':
                el.style.left = `${left + dz.width - LINE}px`;
                el.style.top = `${top}px`;
                el.style.width = `${LINE}px`;
                el.style.height = `${dz.height}px`;
                break;
            case 'top':
                el.style.left = `${left}px`;
                el.style.top = `${top}px`;
                el.style.width = `${dz.width}px`;
                el.style.height = `${LINE}px`;
                break;
            case 'bottom':
                el.style.left = `${left}px`;
                el.style.top = `${top + dz.height - LINE}px`;
                el.style.width = `${dz.width}px`;
                el.style.height = `${LINE}px`;
                break;
        }
    }

    private _hide(): void {
        this._highlight?.remove();
        this._highlight = undefined;
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
