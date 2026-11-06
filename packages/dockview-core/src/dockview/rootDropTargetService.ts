import { Disposable, IDisposable } from '../lifecycle';
import { Event } from '../events';
import {
    calculateQuadrantAsPixels,
    DroptargetEvent,
    DroptargetOverlayModel,
    DropTargetTargetModel,
    EdgeThresholds,
    IDropTarget,
    Position,
    PositionResolver,
    WillShowOverlayEvent,
} from '../dnd/droptarget';
import { html5Backend, pointerBackend } from '../dnd/backend';
import { getPanelData } from '../dnd/dataTransfer';
import { getHitTestRoot } from '../dom';
import {
    DockviewComponentOptions,
    isAnyEdgeGroupEnabled,
    isEdgeGroupEnabled,
} from './options';
import { defineModule } from './modules';

type Edge = keyof EdgeThresholds;
const EDGES: readonly Edge[] = ['left', 'right', 'top', 'bottom'];

const DEFAULT_ACTIVATION = 10;
const AUTO_EDGE_ACTIVATION = 32;

const DEFAULT_ROOT_OVERLAY_MODEL: DroptargetOverlayModel = {
    activationSize: { type: 'pixels', value: DEFAULT_ACTIVATION },
    size: { type: 'pixels', value: 20 },
};

// The two-band drag-reveal affordance needs room for a distinct outer ("dock as
// edge group") and inner ("split the grid") sub-band, so the edge activation
// band widens when it is present. Only edges enabled in `dockToEdgeGroups` get
// the wider band (see `resolveRootEdgeThresholds`); `activationSize` here is
// the widest of them.
const AUTO_EDGE_ROOT_OVERLAY_MODEL: DroptargetOverlayModel = {
    activationSize: { type: 'pixels', value: AUTO_EDGE_ACTIVATION },
    size: { type: 'pixels', value: 20 },
};

function hasCustomBand(
    options: Pick<DockviewComponentOptions, 'dndEdges'>
): options is { dndEdges: DroptargetOverlayModel } {
    return typeof options.dndEdges === 'object' && options.dndEdges !== null;
}

/**
 * `hasEdgeDragReveal` gates the widened band, *not* the `dockToEdgeGroups`
 * option alone: without the affordance nothing consumes the outer sub-band, so
 * widening would only enlarge the plain grid-split trigger, a 3.2x bigger
 * target for the same behaviour the default band already gives.
 */
function isBandWidened(
    options: Pick<DockviewComponentOptions, 'dndEdges' | 'dockToEdgeGroups'>,
    hasEdgeDragReveal: boolean
): boolean {
    return (
        !hasCustomBand(options) &&
        hasEdgeDragReveal &&
        isAnyEdgeGroupEnabled(options.dockToEdgeGroups)
    );
}

function resolveRootOverlayModel(
    options: Pick<DockviewComponentOptions, 'dndEdges' | 'dockToEdgeGroups'>,
    hasEdgeDragReveal: boolean
): DroptargetOverlayModel {
    if (hasCustomBand(options)) {
        return options.dndEdges;
    }
    return isBandWidened(options, hasEdgeDragReveal)
        ? AUTO_EDGE_ROOT_OVERLAY_MODEL
        : DEFAULT_ROOT_OVERLAY_MODEL;
}

/**
 * Per-edge activation thresholds while the widened band is in effect, else
 * `undefined` (the overlay model's uniform `activationSize` applies). A
 * disabled edge keeps the default band: widened, it would cover the headers of
 * groups touching that edge for no edge-group behaviour.
 */
function resolveRootEdgeThresholds(
    options: Pick<DockviewComponentOptions, 'dndEdges' | 'dockToEdgeGroups'>,
    hasEdgeDragReveal: boolean
): EdgeThresholds | undefined {
    if (!isBandWidened(options, hasEdgeDragReveal)) {
        return undefined;
    }
    const band = (edge: Edge): number =>
        isEdgeGroupEnabled(options.dockToEdgeGroups, edge)
            ? AUTO_EDGE_ACTIVATION
            : DEFAULT_ACTIVATION;
    return {
        left: band('left'),
        right: band('right'),
        top: band('top'),
        bottom: band('bottom'),
    };
}

/** The default cursor-quadrant logic, with a threshold per edge. */
function createEdgeBandResolver(thresholds: EdgeThresholds): PositionResolver {
    return {
        resolve: ({ x, y, width, height, zones }) => {
            const position = calculateQuadrantAsPixels(
                zones,
                x,
                y,
                width,
                height,
                thresholds
            );
            return position ? { position, edge: false } : null;
        },
    };
}

const GROUP_HEADER_SELECTOR = '.dv-tabs-and-actions-container';

/**
 * Whether the pointer is over a group header. An HTML5 drag event targets the
 * element under the pointer; a pointer-backend drag needs a hit-test.
 */
function isOverGroupHeader(
    event: DragEvent | PointerEvent,
    root: HTMLElement
): boolean {
    const element = event.type.startsWith('drag')
        ? event.target
        : getHitTestRoot(root).elementFromPoint?.(event.clientX, event.clientY);
    return (
        element instanceof Element &&
        element.closest(GROUP_HEADER_SELECTOR) !== null
    );
}

export interface IRootDropTargetHost {
    readonly id: string;
    readonly element: HTMLElement;
    readonly options: DockviewComponentOptions;
    /**
     * Whether the two-band edge drag-reveal affordance is registered.
     *
     * Read lazily, never at construction: module services are created in
     * registration order, and this one is built before any module that could
     * provide the affordance, so at construction the answer is always `false`,
     * even when the affordance is on its way. The module's `init` hook
     * re-applies the options once every service exists.
     */
    readonly hasEdgeDragReveal: boolean;
    isGridEmpty(): boolean;
    rootDropTargetOverrideTarget(): DropTargetTargetModel | undefined;
    /**
     * Build, fire, and return the verdict for an unhandled-drag-over event.
     * Implemented on the component side so the service stays free of
     * circular imports with the event class declared in dockviewComponent.
     */
    dispatchUnhandledDragOver(
        nativeEvent: DragEvent | PointerEvent,
        position: Position
    ): boolean;
}

export interface IRootDropTargetService extends IDisposable {
    /** Merged stream from both DnD backends. */
    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;
    /** Merged stream from both DnD backends. */
    readonly onDrop: Event<DroptargetEvent>;
    /** Apply changed options (dndEdges). */
    setOptions(options: Partial<DockviewComponentOptions>): void;
}

export class RootDropTargetService implements IRootDropTargetService {
    private readonly _html5Target: IDropTarget;
    private readonly _pointerTarget: IDropTarget;
    private readonly _host: IRootDropTargetHost;
    /** Per-edge band, kept in step with the overlay model by `setOptions`. */
    private _edgeBandResolver: PositionResolver | undefined;
    /** Edges given the widened band, where group headers win over it. */
    private _widenedEdges: ReadonlySet<Position> = new Set();

    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;
    readonly onDrop: Event<DroptargetEvent>;

    constructor(host: IRootDropTargetHost) {
        this._host = host;
        const canDisplayOverlay = (
            event: DragEvent | PointerEvent,
            position: Position
        ): boolean => {
            // A header on a widened edge is a drop target in its own right.
            // The pointer backend reaches it first (innermost target wins); the
            // HTML5 backend runs this capture listener first, so step aside.
            if (
                this._widenedEdges.has(position) &&
                isOverGroupHeader(event, host.element)
            ) {
                return false;
            }

            const data = getPanelData();

            if (data) {
                if (data.viewId !== host.id) {
                    return false;
                }
                if (position === 'center') {
                    // center drop target only allowed if no panels in primary
                    // grid; floating panels are allowed
                    return host.isGridEmpty();
                }
                return true;
            }

            if (position === 'center' && !host.isGridEmpty()) {
                // for external events only show the four-corner drag overlays,
                // disable center so external drag events can fall through to
                // the group and panel drop target handlers
                return false;
            }

            return host.dispatchUnhandledDragOver(event, position);
        };

        // `false`, not `host.hasEdgeDragReveal`: this runs during module
        // initialisation, where the affordance's service may not exist yet (see
        // `hasEdgeDragReveal`'s contract). The band resolved here is provisional;
        // the `init` hook below re-resolves it for real.
        const overlayModel = resolveRootOverlayModel(host.options, false);

        // A `dropPositionResolver` takes precedence, as it does over the
        // uniform band.
        const getPositionResolver = (): PositionResolver | undefined =>
            host.options.dropPositionResolver ?? this._edgeBandResolver;

        this._html5Target = html5Backend.createDropTarget(host.element, {
            className: 'dv-drop-target-edge',
            canDisplayOverlay,
            acceptedTargetZones: ['top', 'bottom', 'left', 'right', 'center'],
            overlayModel,
            getOverrideTarget: () => host.rootDropTargetOverrideTarget(),
            getPositionResolver,
        });

        this._pointerTarget = pointerBackend.createDropTarget(host.element, {
            className: 'dv-drop-target-edge',
            canDisplayOverlay,
            acceptedTargetZones: ['top', 'bottom', 'left', 'right', 'center'],
            overlayModel,
            getOverrideTarget: () => host.rootDropTargetOverrideTarget(),
            getPositionResolver,
        });

        this.onWillShowOverlay = Event.any(
            this._html5Target.onWillShowOverlay,
            this._pointerTarget.onWillShowOverlay
        );
        this.onDrop = Event.any(
            this._html5Target.onDrop,
            this._pointerTarget.onDrop
        );

        // Apply initial-state options now that the targets exist; setOptions
        // handles dndEdges (disable + overlay model) and late changes.
        this.setOptions(host.options);
    }

    setOptions(options: Partial<DockviewComponentOptions>): void {
        if ('dndEdges' in options) {
            const disabled =
                typeof options.dndEdges === 'boolean' &&
                options.dndEdges === false;
            this._html5Target.disabled = disabled;
            this._pointerTarget.disabled = disabled;
        }

        // Recompute the overlay band when either the edge overlay model or the
        // dockToEdgeGroups set (which widens the band for the two sub-bands)
        // changes. Prefer the incoming partial for a changed key, falling back
        // to the current host options for the other.
        if ('dndEdges' in options || 'dockToEdgeGroups' in options) {
            const merged = {
                dndEdges:
                    'dndEdges' in options
                        ? options.dndEdges
                        : this._host.options.dndEdges,
                dockToEdgeGroups:
                    'dockToEdgeGroups' in options
                        ? options.dockToEdgeGroups
                        : this._host.options.dockToEdgeGroups,
            };
            const model = resolveRootOverlayModel(
                merged,
                this._host.hasEdgeDragReveal
            );
            this._html5Target.setOverlayModel(model);
            this._pointerTarget.setOverlayModel(model);

            const thresholds = resolveRootEdgeThresholds(
                merged,
                this._host.hasEdgeDragReveal
            );
            this._edgeBandResolver = thresholds
                ? createEdgeBandResolver(thresholds)
                : undefined;
            this._widenedEdges = new Set(
                EDGES.filter(
                    (edge) => thresholds?.[edge] === AUTO_EDGE_ACTIVATION
                )
            );
        }
    }

    dispose(): void {
        this._html5Target.dispose();
        this._pointerTarget.dispose();
    }
}

export const RootDropTargetModule = defineModule<
    'rootDropTargetService',
    IRootDropTargetHost
>({
    name: 'RootDropTarget',
    serviceKey: 'rootDropTargetService',
    create: (host) => new RootDropTargetService(host),
    init: (host, service) => {
        // Re-apply the options now that every module's service exists.
        // `create` above ran during module initialisation, when
        // `hasEdgeDragReveal` could not yet be true however the component was
        // configured, so the band it resolved may be too narrow. Every key of
        // DockviewOptions is present on the merged object, so this recomputes
        // unconditionally. Nothing can drag between the two phases.
        service.setOptions(host.options);
        return Disposable.NONE;
    },
});
