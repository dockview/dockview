import { Emitter, Event } from '../../events';
import { CompositeDisposable } from '../../lifecycle';
import {
    createOverlayElements,
    renderAnchoredOverlay,
    renderInPlaceOverlay,
} from '../dropOverlay';
import {
    calculateQuadrantAsPercentage,
    calculateQuadrantAsPixels,
    CanDisplayOverlay,
    DropTargetTargetModel,
    DroptargetEvent,
    DroptargetOverlayModel,
    IDropTarget,
    MeasuredValue,
    Position,
    PositionResolver,
    WillShowOverlayEvent,
} from '../droptarget';
import { PointerDragController } from './pointerDragController';
import { IPointerDropTargetHandle, PointerDragEvent } from './types';

const DEFAULT_ACTIVATION_SIZE: MeasuredValue = {
    value: 20,
    type: 'percentage',
};

export interface PointerDropTargetOptions {
    canDisplayOverlay: CanDisplayOverlay;
    acceptedTargetZones: Position[];
    overlayModel?: DroptargetOverlayModel;
    /** Render into an external anchor container (floating groups, layout root). */
    /** Render into an external anchor container (floating groups, layout root). */
    getOverrideTarget?: () => DropTargetTargetModel | undefined;
    /** Outline element for positioning; falls back to the drop element. */
    getOverlayOutline?: () => HTMLElement | null;
    className?: string;
    /**
     * Supply a {@link PositionResolver} that overrides how a pointer location
     * resolves to a drop {@link Position}. A lazy getter so the source can
     * change at runtime; `undefined` (default) uses the cursor-quadrant logic.
     */
    getPositionResolver?: () => PositionResolver | undefined;
}

/** Pointer-driven counterpart to `Droptarget` with identical visual output. */
export class PointerDropTarget
    extends CompositeDisposable
    implements IDropTarget
{
    private _targetElement: HTMLElement | undefined;
    private _overlayElement: HTMLElement | undefined;
    private _state: Position | undefined;
    private _edge = false;
    private _acceptedTargetZonesSet: Set<Position>;

    private readonly _onDrop = new Emitter<DroptargetEvent>();
    readonly onDrop: Event<DroptargetEvent> = this._onDrop.event;

    private readonly _onWillShowOverlay = new Emitter<WillShowOverlayEvent>();
    readonly onWillShowOverlay: Event<WillShowOverlayEvent> =
        this._onWillShowOverlay.event;

    private _disabled = false;

    get disabled(): boolean {
        return this._disabled;
    }

    set disabled(value: boolean) {
        this._disabled = value;
        if (value) {
            this._removeOverlay();
        }
    }

    get state(): Position | undefined {
        return this._state;
    }

    constructor(
        private readonly element: HTMLElement,
        private readonly options: PointerDropTargetOptions
    ) {
        super();

        this._acceptedTargetZonesSet = new Set(options.acceptedTargetZones);

        const handle: IPointerDropTargetHandle = {
            element: this.element,
            handleDragOver: (e) => this._onDragOver(e),
            handleDragLeave: () => this._onDragLeave(),
            handleDrop: (e) => this._onDropEvent(e),
        };

        this.addDisposables(
            this._onDrop,
            this._onWillShowOverlay,
            PointerDragController.getInstance().registerTarget(handle)
        );
    }

    setTargetZones(zones: Position[]): void {
        this._acceptedTargetZonesSet = new Set(zones);
    }

    setOverlayModel(model: DroptargetOverlayModel): void {
        this.options.overlayModel = model;
    }

    dispose(): void {
        this._removeOverlay();
        super.dispose();
    }

    private _onDragOver(event: PointerDragEvent): void {
        if (this._disabled) {
            this._clearOwnOverlay();
            return;
        }

        const overrideTarget = this.options.getOverrideTarget?.();

        if (this._acceptedTargetZonesSet.size === 0) {
            this._clearOwnOverlay();
            return;
        }

        const outlineEl = this.options.getOverlayOutline?.() ?? this.element;
        const width = outlineEl.offsetWidth;
        const height = outlineEl.offsetHeight;

        if (width === 0 || height === 0) {
            return;
        }

        const rect = outlineEl.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const resolved = this._resolvePosition(
            x,
            y,
            width,
            height,
            event.pointerEvent
        );

        if (resolved === null) {
            // The resolver declined this point: render nothing.
            this._clearOwnOverlay();
            return;
        }

        const quadrant = resolved.position;

        if (!this.options.canDisplayOverlay(event.pointerEvent, quadrant)) {
            this._clearOwnOverlay();
            return;
        }

        const willShow = new WillShowOverlayEvent({
            nativeEvent: event.pointerEvent,
            position: quadrant,
            edge: resolved.edge,
        });
        this._onWillShowOverlay.fire(willShow);
        if (willShow.defaultPrevented) {
            this._clearOwnOverlay();
            return;
        }

        // An `edge` cell reports its position but renders nothing. The consumer
        // (e.g. the layout-edge dock) owns the preview + commit. The anchored
        // overlay from the previous frame (the inner cell crossed on the way
        // out) has to go, or it double-highlights alongside the consumer's own
        // whole-layout-edge preview.
        if (resolved.edge) {
            this._clearOwnOverlay();
            this._state = quadrant;
            this._edge = true;
            return;
        }
        this._edge = false;

        if (overrideTarget) {
            renderAnchoredOverlay({
                outlineElement: outlineEl,
                targetModel: overrideTarget,
                quadrant,
                width,
                height,
                overlayModel: this.options.overlayModel,
                className: this.options.className,
            });
            this._state = quadrant;
            return;
        }

        if (!this._targetElement) {
            const els = createOverlayElements();
            this._targetElement = els.dropzone;
            this._overlayElement = els.selection;
            this._state = 'center';
            this.element.classList.add('dv-drop-target');
            this.element.append(this._targetElement);
        }

        if (this._overlayElement) {
            renderInPlaceOverlay(
                this._overlayElement,
                quadrant,
                width,
                height,
                this.options.overlayModel
            );
        }
        this._state = quadrant;
    }

    private _onDragLeave(): void {
        const overrideTarget = this.options.getOverrideTarget?.();
        // Anchor target owns its own lifecycle; just clear our latched
        // state so a subsequent pointerup doesn't fire a stale drop.
        if (overrideTarget) {
            this._state = undefined;
            overrideTarget.clear();
            return;
        }
        this._removeOverlay();
    }

    private _onDropEvent(event: PointerDragEvent): void {
        const state = this._state;
        const edge = this._edge;
        const overrideTarget = this.options.getOverrideTarget?.();
        this._removeOverlay();
        overrideTarget?.clear();
        if (state) {
            this._onDrop.fire({
                position: state,
                nativeEvent: event.pointerEvent,
                edge,
            });
        }
    }

    /**
     * Resolve the drop {@link Position}: defer to an injected
     * {@link PositionResolver} when present, otherwise the built-in
     * cursor-quadrant logic (unchanged). Shares the resolver with the HTML5
     * backend.
     */
    private _resolvePosition(
        x: number,
        y: number,
        width: number,
        height: number,
        event: DragEvent | PointerEvent
    ): { position: Position; edge: boolean } | null {
        const resolver = this.options.getPositionResolver?.();
        if (resolver) {
            const result = resolver.resolve({
                x,
                y,
                width,
                height,
                zones: this._acceptedTargetZonesSet,
                event,
            });
            return result
                ? { position: result.position, edge: !!result.edge }
                : null;
        }
        const position = this._calculateQuadrant(x, y, width, height);
        return position ? { position, edge: false } : null;
    }

    private _calculateQuadrant(
        x: number,
        y: number,
        width: number,
        height: number
    ): Position | null {
        const activation =
            this.options.overlayModel?.activationSize ??
            DEFAULT_ACTIVATION_SIZE;

        if (activation.type === 'percentage') {
            return calculateQuadrantAsPercentage(
                this._acceptedTargetZonesSet,
                x,
                y,
                width,
                height,
                activation.value
            );
        }

        return calculateQuadrantAsPixels(
            this._acceptedTargetZonesSet,
            x,
            y,
            width,
            height,
            activation.value
        );
    }

    /**
     * Tear down whatever this target is showing, on any frame it resolves to
     * no overlay. The `DropTarget` equivalent documents the reasoning; in
     * short, the shared anchor container used by `dndOverlayMounting:
     * 'absolute'` needs clearing explicitly, but only when this target put
     * something there.
     */
    private _clearOwnOverlay(): void {
        const owned = this._state !== undefined;
        this._removeOverlay();
        if (owned) {
            this.options.getOverrideTarget?.()?.clear();
        }
    }

    private _removeOverlay(): void {
        this._edge = false;
        if (this._targetElement) {
            this._state = undefined;
            this._targetElement.parentElement?.classList.remove(
                'dv-drop-target'
            );
            this._targetElement.remove();
            this._targetElement = undefined;
            this._overlayElement = undefined;
        } else {
            this._state = undefined;
        }
    }
}
