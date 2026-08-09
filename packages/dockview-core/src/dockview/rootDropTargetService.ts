import { Disposable, IDisposable } from '../lifecycle';
import { Event } from '../events';
import {
    DroptargetEvent,
    DroptargetOverlayModel,
    DropTargetTargetModel,
    IDropTarget,
    Position,
    WillShowOverlayEvent,
} from '../dnd/droptarget';
import { html5Backend, pointerBackend } from '../dnd/backend';
import { getPanelData } from '../dnd/dataTransfer';
import { DockviewComponentOptions, isAnyEdgeGroupEnabled } from './options';
import { defineModule } from './modules';

const DEFAULT_ROOT_OVERLAY_MODEL: DroptargetOverlayModel = {
    activationSize: { type: 'pixels', value: 10 },
    size: { type: 'pixels', value: 20 },
};

// The two-band drag-reveal affordance needs room for a distinct outer ("dock as
// edge group") and inner ("split the grid") sub-band, so the edge activation
// band widens when it is present. The band is uniform across edges; per-edge
// gating of the actual dock happens in the affordance's own edge resolver.
const AUTO_EDGE_ROOT_OVERLAY_MODEL: DroptargetOverlayModel = {
    activationSize: { type: 'pixels', value: 32 },
    size: { type: 'pixels', value: 20 },
};

/**
 * `hasEdgeDragReveal` gates the widened band, *not* the `dockToEdgeGroups`
 * option alone: without the affordance nothing consumes the outer sub-band, so
 * widening would only enlarge the plain grid-split trigger, a 3.2x bigger
 * target for the same behaviour the default band already gives.
 */
function resolveRootOverlayModel(
    options: Pick<DockviewComponentOptions, 'dndEdges' | 'dockToEdgeGroups'>,
    hasEdgeDragReveal: boolean
): DroptargetOverlayModel {
    if (typeof options.dndEdges === 'object' && options.dndEdges !== null) {
        return options.dndEdges;
    }
    return hasEdgeDragReveal && isAnyEdgeGroupEnabled(options.dockToEdgeGroups)
        ? AUTO_EDGE_ROOT_OVERLAY_MODEL
        : DEFAULT_ROOT_OVERLAY_MODEL;
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

    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;
    readonly onDrop: Event<DroptargetEvent>;

    constructor(host: IRootDropTargetHost) {
        this._host = host;
        const canDisplayOverlay = (
            event: DragEvent | PointerEvent,
            position: Position
        ): boolean => {
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

        this._html5Target = html5Backend.createDropTarget(host.element, {
            className: 'dv-drop-target-edge',
            canDisplayOverlay,
            acceptedTargetZones: ['top', 'bottom', 'left', 'right', 'center'],
            overlayModel,
            getOverrideTarget: () => host.rootDropTargetOverrideTarget(),
            getPositionResolver: () => host.options.dropPositionResolver,
        });

        this._pointerTarget = pointerBackend.createDropTarget(host.element, {
            className: 'dv-drop-target-edge',
            canDisplayOverlay,
            acceptedTargetZones: ['top', 'bottom', 'left', 'right', 'center'],
            overlayModel,
            getOverrideTarget: () => host.rootDropTargetOverrideTarget(),
            getPositionResolver: () => host.options.dropPositionResolver,
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
            const model = resolveRootOverlayModel(
                {
                    dndEdges:
                        'dndEdges' in options
                            ? options.dndEdges
                            : this._host.options.dndEdges,
                    dockToEdgeGroups:
                        'dockToEdgeGroups' in options
                            ? options.dockToEdgeGroups
                            : this._host.options.dockToEdgeGroups,
                },
                this._host.hasEdgeDragReveal
            );
            this._html5Target.setOverlayModel(model);
            this._pointerTarget.setOverlayModel(model);
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
