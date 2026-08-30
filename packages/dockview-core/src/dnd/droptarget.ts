import { DockviewEvent, Emitter, Event } from '../events';
import { CompositeDisposable, IDisposable } from '../lifecycle';
import { DragAndDropObserver } from './dnd';
import { Direction } from '../gridview/baseComponentGridview';
import {
    createOverlayElements,
    renderAnchoredOverlay,
    renderInPlaceOverlay,
} from './dropOverlay';

export interface DroptargetEvent {
    readonly position: Position;
    /** Narrow with `instanceof DragEvent` before reading `dataTransfer`. */
    readonly nativeEvent: DragEvent | PointerEvent;
    /**
     * The resolved cell was marked `edge` by a {@link PositionResolver}: an
     * "outer" cell that should dock against the whole layout, not this target.
     * The target renders no overlay for it; the consumer routes the commit.
     */
    readonly edge?: boolean;
}

export class WillShowOverlayEvent
    extends DockviewEvent
    implements DroptargetEvent
{
    get nativeEvent(): DragEvent | PointerEvent {
        return this.options.nativeEvent;
    }

    get position(): Position {
        return this.options.position;
    }

    /** See {@link DroptargetEvent.edge}. */
    get edge(): boolean {
        return !!this.options.edge;
    }

    /** See {@link PositionResolverResult.edgeGroup}. A display hint; a consumer
     *  (e.g. the DnD compass) can bow out of this cell. */
    get edgeGroup(): boolean {
        return !!this.options.edgeGroup;
    }

    constructor(
        private readonly options: {
            nativeEvent: DragEvent | PointerEvent;
            position: Position;
            edge?: boolean;
            edgeGroup?: boolean;
        }
    ) {
        super();
    }
}

export function directionToPosition(direction: Direction): Position {
    switch (direction) {
        case 'above':
            return 'top';
        case 'below':
            return 'bottom';
        case 'left':
            return 'left';
        case 'right':
            return 'right';
        case 'within':
            return 'center';
        default:
            throw new Error(`invalid direction '${direction}'`);
    }
}

export function positionToDirection(position: Position): Direction {
    switch (position) {
        case 'top':
            return 'above';
        case 'bottom':
            return 'below';
        case 'left':
            return 'left';
        case 'right':
            return 'right';
        case 'center':
            return 'within';
        default:
            throw new Error(`invalid position '${position}'`);
    }
}

export type Position = 'top' | 'bottom' | 'left' | 'right' | 'center';

/** The pointer location within a drop target, handed to a {@link PositionResolver}. */
/** The pointer location within a drop target, handed to a {@link PositionResolver}. */
export interface PositionResolverArgs {
    /** Pointer X within the target element (px from its left edge). */
    readonly x: number;
    /** Pointer Y within the target element (px from its top edge). */
    readonly y: number;
    readonly width: number;
    readonly height: number;
    /** The drop zones this target currently accepts. */
    readonly zones: ReadonlySet<Position>;
    /** The originating drag event (HTML5 or pointer backend). */
    readonly event: DragEvent | PointerEvent;
}

export interface PositionResolverResult {
    readonly position: Position;
    /**
     * Marks an outer / whole-layout-edge cell. The built-in drop overlay only
     * reads `position`; consumers that route edge cells differently can read this.
     */
    readonly edge?: boolean;
    /**
     * Display hint: this cell docks as a dedicated edge group (not a grid-edge
     * split). Purely advisory. A co-installed resolver's UI (e.g. the DnD
     * compass) can suppress its own overlay for these cells so they don't
     * double-render with the edge-group affordance.
     */
    readonly edgeGroup?: boolean;
}

/**
 * Pluggable replacement for the built-in cursor-quadrant drop resolution.
 * Supplied via {@link DroptargetOptions.positionResolver}, it maps a pointer
 * location within a target to a drop {@link Position} (or `null` for no drop)
 * instead of the default threshold-band quadrant. Both DnD backends consult the
 * same resolver. When unset, the default quadrant behaviour applies unchanged.
 */
export interface PositionResolver {
    resolve(args: PositionResolverArgs): PositionResolverResult | null;
}

export type CanDisplayOverlay = (
    dragEvent: DragEvent | PointerEvent,
    state: Position
) => boolean;

export type MeasuredValue = { value: number; type: 'pixels' | 'percentage' };

export type DroptargetOverlayModel = {
    size?: MeasuredValue;
    activationSize?: MeasuredValue;
    /**
     * Override the width threshold (in pixels) below which the overlay switches
     * to a thin-border indicator instead of a half-width highlight. Set to 0 to
     * always show the half-width overlay regardless of element size.
     */
    smallWidthBoundary?: number;
    /**
     * Override the height threshold (in pixels) below which the overlay switches
     * to a thin-border indicator instead of a half-height highlight. Set to 0 to
     * always show the half-height overlay regardless of element size.
     */
    smallHeightBoundary?: number;
};

const DEFAULT_ACTIVATION_SIZE: MeasuredValue = {
    value: 20,
    type: 'percentage',
};

export interface DropTargetTargetModel {
    getElements(
        event?: DragEvent,
        outline?: HTMLElement
    ): {
        root: HTMLElement;
        overlay: HTMLElement;
        changed: boolean;
    };
    exists(): boolean;
    clear(): void;
    /**
     * Clear the overlay on the next tick unless a {@link getElements} call (a
     * target rendering into this container) cancels it first. Used by the HTML5
     * backend on `dragleave`: clearing immediately would kill the overlay's
     * slide between adjacent targets, but never clearing leaves the overlay
     * behind when the drag leaves to somewhere that doesn't re-render here.
     * Optional so lightweight/mocked target models need not implement it.
     */
    scheduleClear?(): void;
}

export interface DroptargetOptions {
    canDisplayOverlay: CanDisplayOverlay;
    acceptedTargetZones: Position[];
    overlayModel?: DroptargetOverlayModel;
    getOverrideTarget?: () => DropTargetTargetModel | undefined;
    className?: string;
    getOverlayOutline?: () => HTMLElement | null;
    /**
     * Supply a {@link PositionResolver} that overrides how a pointer location
     * resolves to a drop {@link Position}. A lazy getter (like
     * {@link getOverrideTarget}) so the source can change at runtime; returning
     * `undefined` (the default) uses the built-in cursor-quadrant logic.
     */
    getPositionResolver?: () => PositionResolver | undefined;
}

/**
 * Backend-agnostic drop target. Both the HTML5 `Droptarget` and the pointer
 * `PointerDropTarget` implement this shape so consumers can hold one field
 * regardless of which DnD backend produced it.
 */
export interface IDropTarget extends IDisposable {
    readonly onDrop: Event<DroptargetEvent>;
    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;
    readonly state: Position | undefined;
    disabled: boolean;
    setTargetZones(zones: Position[]): void;
    setOverlayModel(model: DroptargetOverlayModel): void;
}

export class Droptarget extends CompositeDisposable implements IDropTarget {
    private targetElement: HTMLElement | undefined;
    private overlayElement: HTMLElement | undefined;
    private _state: Position | undefined;
    /** The current state was resolved as an `edge` cell (see DroptargetEvent). */
    /** The current state was resolved as an `edge` cell (see DroptargetEvent). */
    private _edge = false;
    private _acceptedTargetZonesSet: Set<Position>;

    private readonly _onDrop = new Emitter<DroptargetEvent>();
    readonly onDrop: Event<DroptargetEvent> = this._onDrop.event;

    private readonly _onWillShowOverlay = new Emitter<WillShowOverlayEvent>();
    readonly onWillShowOverlay: Event<WillShowOverlayEvent> =
        this._onWillShowOverlay.event;

    readonly dnd: DragAndDropObserver;

    private static USED_EVENT_ID = '__dockview_droptarget_event_is_used__';

    private static ACTUAL_TARGET: Droptarget | undefined;

    private _disabled: boolean;

    get disabled(): boolean {
        return this._disabled;
    }

    set disabled(value: boolean) {
        this._disabled = value;
    }

    get state(): Position | undefined {
        return this._state;
    }

    constructor(
        private readonly element: HTMLElement,
        private readonly options: DroptargetOptions
    ) {
        super();

        this._disabled = false;

        // use a set to take advantage of #<set>.has
        this._acceptedTargetZonesSet = new Set(
            this.options.acceptedTargetZones
        );

        this.dnd = new DragAndDropObserver(this.element, {
            onDragEnter: () => {
                this.options.getOverrideTarget?.()?.getElements();
            },
            onDragOver: (e) => {
                if (this._disabled) {
                    this.clearOwnOverlay();
                    return;
                }

                Droptarget.ACTUAL_TARGET = this;

                const overrideTarget = this.options.getOverrideTarget?.();

                if (this._acceptedTargetZonesSet.size === 0) {
                    this.clearOwnOverlay();
                    return;
                }

                const target =
                    this.options.getOverlayOutline?.() ?? this.element;

                const width = target.offsetWidth;
                const height = target.offsetHeight;

                if (width === 0 || height === 0) {
                    return; // avoid div!0
                }

                // Measure the pointer against the same box `width`/`height`
                // describe. `e.currentTarget` is always the listener element,
                // so when `getOverlayOutline` widens the frame (themes with
                // `dndPanelOverlay: 'group'` outline the whole group, not just
                // the content) the two disagree by the header + spacing offset
                // and every resolved position is shifted by it. The pointer
                // backend already measures the outline; match it.
                const rect = target.getBoundingClientRect();
                const x = (e.clientX ?? 0) - rect.left;
                const y = (e.clientY ?? 0) - rect.top;

                const resolved = this.resolvePosition(x, y, width, height, e);

                /**
                 * If the event has already been used by another DropTarget instance
                 * then don't show a second drop target, only one target should be
                 * active at any one time. The anchored overlay belongs to whichever
                 * target claimed the event, so leave it alone here.
                 */
                if (this.isAlreadyUsed(e)) {
                    this.removeDropTarget();
                    return;
                }

                if (resolved === null) {
                    // The resolver declined this point: no drop target should be
                    // displayed.
                    this.clearOwnOverlay();
                    return;
                }

                const quadrant = resolved.position;

                if (!this.options.canDisplayOverlay(e, quadrant)) {
                    this.clearOwnOverlay();
                    return;
                }

                const willShowOverlayEvent = new WillShowOverlayEvent({
                    nativeEvent: e,
                    position: quadrant,
                    edge: resolved.edge,
                    edgeGroup: resolved.edgeGroup,
                });

                /**
                 * Provide an opportunity to prevent the overlay appearing and in turn
                 * any dnd behaviours
                 */
                this._onWillShowOverlay.fire(willShowOverlayEvent);

                if (willShowOverlayEvent.defaultPrevented) {
                    this.clearOwnOverlay();
                    return;
                }

                this.markAsUsed(e);

                // An `edge` cell reports its position but renders nothing. The
                // consumer (e.g. the layout-edge dock) owns the preview +
                // commit. The anchored overlay from the previous frame (the
                // inner cell crossed on the way out) has to go, or it double-
                // highlights alongside the consumer's own whole-layout-edge
                // preview.
                if (resolved.edge) {
                    this.clearOwnOverlay();
                    this._state = quadrant;
                    this._edge = true;
                    return;
                }
                this._edge = false;

                if (overrideTarget) {
                    //
                } else if (!this.targetElement) {
                    const els = createOverlayElements();
                    this.targetElement = els.dropzone;
                    this.overlayElement = els.selection;
                    this._state = 'center';

                    target.classList.add('dv-drop-target');
                    target.append(this.targetElement);
                }

                this.toggleClasses(quadrant, width, height);

                this._state = quadrant;
            },
            onDragLeave: () => {
                const target = this.options.getOverrideTarget?.();

                if (target) {
                    // Schedule a clear rather than clearing now: the overlay
                    // must slide to whichever target the cursor reaches next,
                    // and HTML5 fires `dragleave` when crossing between a
                    // target's own children. The next target rendering into
                    // this container cancels the clear, while a drag leaving to
                    // dead space does not, so the overlay doesn't linger.
                    //
                    // The latched state still goes now, or a drag released
                    // outside the layout drops at the last hovered position.
                    this._state = undefined;
                    this._edge = false;
                    target.scheduleClear?.();
                    return;
                }

                this.removeDropTarget();
            },
            onDragEnd: (e) => {
                const target = this.options.getOverrideTarget?.();

                if (target && Droptarget.ACTUAL_TARGET === this) {
                    if (this._state) {
                        // only stop the propagation of the event if we are dealing with it
                        // which is only when the target has state
                        e.stopPropagation();
                        this._onDrop.fire({
                            position: this._state,
                            nativeEvent: e,
                            edge: this._edge,
                        });
                    }
                }

                this.removeDropTarget();

                target?.clear();
            },
            onDrop: (e) => {
                e.preventDefault();

                const state = this._state;
                const edge = this._edge;

                this.removeDropTarget();

                this.options.getOverrideTarget?.()?.clear();

                if (state) {
                    // only stop the propagation of the event if we are dealing with it
                    // which is only when the target has state
                    e.stopPropagation();
                    this._onDrop.fire({
                        position: state,
                        nativeEvent: e,
                        edge,
                    });
                }
            },
        });

        this.addDisposables(this._onDrop, this._onWillShowOverlay, this.dnd);
    }

    setTargetZones(acceptedTargetZones: Position[]): void {
        this._acceptedTargetZonesSet = new Set(acceptedTargetZones);
    }

    setOverlayModel(model: DroptargetOverlayModel): void {
        this.options.overlayModel = model;
    }

    dispose(): void {
        this.removeDropTarget();
        super.dispose();
    }

    /**
     * Add a property to the event object for other potential listeners to check
     */
    private markAsUsed(event: DragEvent): void {
        (event as any)[Droptarget.USED_EVENT_ID] = true;
    }

    /**
     * Check is the event has already been used by another instance of DropTarget
     */
    private isAlreadyUsed(event: DragEvent): boolean {
        const value = (event as any)[Droptarget.USED_EVENT_ID];
        return typeof value === 'boolean' && value;
    }

    private toggleClasses(
        quadrant: Position,
        width: number,
        height: number
    ): void {
        const target = this.options.getOverrideTarget?.();

        if (target) {
            const outlineEl =
                this.options.getOverlayOutline?.() ?? this.element;
            renderAnchoredOverlay({
                outlineElement: outlineEl,
                targetModel: target,
                quadrant,
                width,
                height,
                overlayModel: this.options.overlayModel,
                className: this.options.className,
            });
            return;
        }

        if (!this.overlayElement) {
            return;
        }

        renderInPlaceOverlay(
            this.overlayElement,
            quadrant,
            width,
            height,
            this.options.overlayModel
        );
    }

    /**
     * Resolve the drop {@link Position} for a pointer location: defer to an
     * injected {@link PositionResolver} when present, otherwise the built-in
     * cursor-quadrant logic (unchanged).
     */
    private resolvePosition(
        x: number,
        y: number,
        width: number,
        height: number,
        event: DragEvent | PointerEvent
    ): { position: Position; edge: boolean; edgeGroup: boolean } | null {
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
                ? {
                      position: result.position,
                      edge: !!result.edge,
                      edgeGroup: !!result.edgeGroup,
                  }
                : null;
        }
        const position = this.calculateQuadrant(
            this._acceptedTargetZonesSet,
            x,
            y,
            width,
            height
        );
        return position ? { position, edge: false, edgeGroup: false } : null;
    }

    private calculateQuadrant(
        overlayType: Set<Position>,
        x: number,
        y: number,
        width: number,
        height: number
    ): Position | null {
        const activationSizeOptions =
            this.options.overlayModel?.activationSize ??
            DEFAULT_ACTIVATION_SIZE;

        const isPercentage = activationSizeOptions.type === 'percentage';

        if (isPercentage) {
            return calculateQuadrantAsPercentage(
                overlayType,
                x,
                y,
                width,
                height,
                activationSizeOptions.value
            );
        }

        return calculateQuadrantAsPixels(
            overlayType,
            x,
            y,
            width,
            height,
            activationSizeOptions.value
        );
    }

    /**
     * Tear down whatever this target is showing, on any frame it resolves to
     * no overlay. Beyond `removeDropTarget`: with `dndOverlayMounting:
     * 'absolute'` the overlay lives in an anchor container shared by every drop
     * target, so the container needs clearing explicitly, but only when this
     * target put something there. The root edge target declines `center` on
     * each frame over the middle of the layout so the event falls through, and
     * clearing from there would rebuild the group's overlay every frame and
     * kill its move transition.
     *
     * `_state` resets unconditionally so a target resolving to nothing cannot
     * stay latched and commit a position the cursor has left.
     */
    private clearOwnOverlay(): void {
        const owned = this._state !== undefined;
        this.removeDropTarget();
        if (owned) {
            this.options.getOverrideTarget?.()?.clear();
        }
    }

    private removeDropTarget(): void {
        // Always clear state, since an `edge` cell sets state with no overlay element.
        this._state = undefined;
        this._edge = false;
        if (this.targetElement) {
            this.targetElement.parentElement?.classList.remove(
                'dv-drop-target'
            );
            this.targetElement.remove();
            this.targetElement = undefined;
            this.overlayElement = undefined;
        }
    }

    /**
     * Render the drop overlay at `position` without a live drag, so keyboard
     * docking shows the exact same preview as a mouse drag. Mirrors the
     * `onDragOver` render path (in-place or anchored). Pair with `clearOverlay`.
     */
    showOverlay(position: Position): void {
        const overrideTarget = this.options.getOverrideTarget?.();
        const target = this.options.getOverlayOutline?.() ?? this.element;
        const width = target.offsetWidth;
        const height = target.offsetHeight;

        if (!overrideTarget && !this.targetElement) {
            const els = createOverlayElements();
            this.targetElement = els.dropzone;
            this.overlayElement = els.selection;
            target.classList.add('dv-drop-target');
            target.append(this.targetElement);
        }

        this.toggleClasses(position, width, height);
        this._state = position;
    }

    /** Clear an overlay shown via {@link showOverlay} (in-place or anchored). */
    /** Clear an overlay shown via {@link showOverlay} (in-place or anchored). */
    clearOverlay(): void {
        this.removeDropTarget();
        this.options.getOverrideTarget?.()?.clear();
        this._state = undefined;
    }
}

export function calculateQuadrantAsPercentage(
    overlayType: Set<Position>,
    x: number,
    y: number,
    width: number,
    height: number,
    threshold: number
): Position | null {
    const xp = (100 * x) / width;
    const yp = (100 * y) / height;

    if (overlayType.has('left') && xp < threshold) {
        return 'left';
    }
    if (overlayType.has('right') && xp > 100 - threshold) {
        return 'right';
    }
    if (overlayType.has('top') && yp < threshold) {
        return 'top';
    }
    if (overlayType.has('bottom') && yp > 100 - threshold) {
        return 'bottom';
    }

    if (!overlayType.has('center')) {
        return null;
    }

    return 'center';
}

export function calculateQuadrantAsPixels(
    overlayType: Set<Position>,
    x: number,
    y: number,
    width: number,
    height: number,
    threshold: number
): Position | null {
    if (overlayType.has('left') && x < threshold) {
        return 'left';
    }
    if (overlayType.has('right') && x > width - threshold) {
        return 'right';
    }
    if (overlayType.has('top') && y < threshold) {
        return 'top';
    }
    if (overlayType.has('bottom') && y > height - threshold) {
        return 'bottom';
    }

    if (!overlayType.has('center')) {
        return null;
    }

    return 'center';
}
