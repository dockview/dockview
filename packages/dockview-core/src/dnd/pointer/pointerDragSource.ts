import { disableTextSelection } from '../../dom';
import { addDisposableListener } from '../../events';
import { CompositeDisposable, IDisposable } from '../../lifecycle';
import { PointerDragController } from './pointerDragController';
import { PointerGhost } from './pointerGhost';
import { PointerDragEvent } from './types';

export interface PointerDragSourceOptions {
    /** Populate transfer data; returned disposer clears it on drag end. */
    getData: (event: PointerEvent) => IDisposable;
    onDragStart?: (event: PointerEvent) => void;
    onDragMove?: (event: PointerDragEvent) => void;
    onDragEnd?: (event: PointerDragEvent, dropped: boolean) => void;
    /** Cancels the drag at pointerdown time. */
    isCancelled?: (event: PointerEvent) => boolean;
    /** Default 5px. Touch pointers also need `touchInitiationDelay` to elapse. */
    threshold?: number;
    /**
     * Touch-only long-press; movement past `pressTolerance` during the delay
     * still arms the drag (any flick is drag intent). Default 250ms. May be
     * a function so callers can vary it per gesture (e.g. require a longer
     * hold for floating-group redock vs docked-group rearrange).
     */
    touchInitiationDelay?: number | (() => number);
    /** Default 8px. May be a function; see `touchInitiationDelay`. */
    pressTolerance?: number | (() => number);
    /** Default true: mouse defers to HTML5; pointer path handles touch / pen only. */
    touchOnly?: boolean;
    /** Follow-finger ghost factory; if omitted the user only sees drop overlays. */
    createGhost?: (event: PointerEvent) => PointerGhost | undefined;
}

const DEFAULT_THRESHOLD = 5;
const DEFAULT_TOUCH_INITIATION_DELAY = 250;
const DEFAULT_PRESS_TOLERANCE = 8;

/**
 * Pointer-event drag source. Waits for movement past `threshold` (and
 * touch-only `touchInitiationDelay`) before promoting to a drag so taps
 * pass through unaffected.
 */
export class PointerDragSource extends CompositeDisposable {
    private _disabled = false;
    private _touchOnly: boolean;
    private _pendingPointerId: number | undefined;
    private _pendingMoveListener: IDisposable | undefined;
    private _pendingUpListener: IDisposable | undefined;
    private _pendingCancelListener: IDisposable | undefined;
    private _armTimer: ReturnType<typeof setTimeout> | undefined;
    private _selectionShield: { release: () => void } | undefined;
    private _armed = false;
    private _startX = 0;
    private _startY = 0;
    private _startEvent: PointerEvent | undefined;

    constructor(
        private readonly element: HTMLElement,
        private readonly options: PointerDragSourceOptions
    ) {
        super();

        this._touchOnly = options.touchOnly ?? true;

        this.addDisposables(
            addDisposableListener(this.element, 'pointerdown', (e) => {
                this._onPointerDown(e);
            })
        );
    }

    setDisabled(value: boolean): void {
        this._disabled = value;
        if (value) {
            this._cancelPending();
        }
    }

    /**
     * `false` lets the pointer source also handle mouse pointers; used when
     * `dndStrategy: 'pointer'` to drive every input type through this path.
     */
    setTouchOnly(value: boolean): void {
        if (this._touchOnly === value) {
            return;
        }
        this._touchOnly = value;
        // A pending mouse-tracked drag should be abandoned if we re-enable
        // the touch-only filter mid-flight.
        if (value) {
            this._cancelPending();
        }
    }

    private _shouldHandle(event: PointerEvent): boolean {
        if (this._disabled) {
            return false;
        }
        // Pointer-type filter runs before isCancelled, because consumer state
        // read by isCancelled may not be populated for events we'll never handle.
        if (
            this._touchOnly &&
            event.pointerType !== 'touch' &&
            event.pointerType !== 'pen'
        ) {
            return false;
        }
        if (this.options.isCancelled?.(event)) {
            return false;
        }
        return true;
    }

    private _onPointerDown(event: PointerEvent): void {
        if (!this._shouldHandle(event)) {
            return;
        }

        // A fresh pointerdown supersedes any in-flight tracking.
        this._cancelPending();

        // The browser begins selecting text from this pointerdown, well before
        // the drag clears `threshold`. Shielding only once the drag begins is
        // too late: the selection is already in flight and keeps extending.
        // Released by `_cancelPending`, which also runs when the drag starts -
        // the controller shields the drag itself from there.
        this._selectionShield = disableTextSelection(
            this.element.ownerDocument ?? document
        );

        this._pendingPointerId = event.pointerId;
        this._startX = event.clientX;
        this._startY = event.clientY;
        this._startEvent = event;

        const isTouch =
            event.pointerType === 'touch' || event.pointerType === 'pen';

        // Touch waits a short window so a still finger can press-and-hold
        // before drifting; once the timer fires, any motion past `threshold`
        // begins the drag.
        const initiationDelayOpt = this.options.touchInitiationDelay;
        const initiationDelay =
            (typeof initiationDelayOpt === 'function'
                ? initiationDelayOpt()
                : initiationDelayOpt) ?? DEFAULT_TOUCH_INITIATION_DELAY;
        this._armed = !isTouch || initiationDelay <= 0;
        if (
            isTouch &&
            initiationDelay > 0 &&
            Number.isFinite(initiationDelay)
        ) {
            this._armTimer = setTimeout(() => {
                this._armTimer = undefined;
                this._armed = true;
            }, initiationDelay);
        }

        const threshold = this.options.threshold ?? DEFAULT_THRESHOLD;
        const pressToleranceOpt = this.options.pressTolerance;
        const pressTolerance =
            (typeof pressToleranceOpt === 'function'
                ? pressToleranceOpt()
                : pressToleranceOpt) ?? DEFAULT_PRESS_TOLERANCE;

        // Source's owning window; popout drags fire on their own window.
        const targetWindow: Window =
            this.element.ownerDocument?.defaultView ?? globalThis.window;

        this._pendingMoveListener = addDisposableListener(
            targetWindow,
            'pointermove',
            (moveEvent) => {
                if (moveEvent.pointerId !== this._pendingPointerId) {
                    return;
                }

                const dx = moveEvent.clientX - this._startX;
                const dy = moveEvent.clientY - this._startY;
                const distance = Math.hypot(dx, dy);

                if (this._armed) {
                    if (distance >= threshold) {
                        this._beginDrag(moveEvent);
                    }
                    return;
                }

                // Pre-arm phase: a flick past `pressTolerance` in any
                // direction is treated as drag intent. The element opts out
                // of native scroll via `touch-action: none`; container-level
                // scrolling lives on the surrounding strip's empty space.
                if (distance > pressTolerance) {
                    this._beginDrag(moveEvent);
                }
            }
        );

        this._pendingUpListener = addDisposableListener(
            targetWindow,
            'pointerup',
            (upEvent) => {
                if (upEvent.pointerId !== this._pendingPointerId) {
                    return;
                }
                this._cancelPending();
            }
        );

        this._pendingCancelListener = addDisposableListener(
            targetWindow,
            'pointercancel',
            (cancelEvent) => {
                if (cancelEvent.pointerId !== this._pendingPointerId) {
                    return;
                }
                this._cancelPending();
            }
        );
    }

    /** For sibling gesture detectors (e.g. LongPressDetector) to dismiss a pending drag. */
    cancelPending(): void {
        this._cancelPending();
    }

    private _cancelPending(): void {
        this._selectionShield?.release();
        this._selectionShield = undefined;
        this._pendingPointerId = undefined;
        if (this._armTimer !== undefined) {
            clearTimeout(this._armTimer);
            this._armTimer = undefined;
        }
        this._armed = false;
        this._pendingMoveListener?.dispose();
        this._pendingUpListener?.dispose();
        this._pendingCancelListener?.dispose();
        this._pendingMoveListener = undefined;
        this._pendingUpListener = undefined;
        this._pendingCancelListener = undefined;
        this._startEvent = undefined;
    }

    private _beginDrag(triggerEvent: PointerEvent): void {
        const startEvent = this._startEvent ?? triggerEvent;
        this._cancelPending();

        this.options.onDragStart?.(startEvent);

        const ghost = this.options.createGhost?.(startEvent);

        PointerDragController.getInstance().beginDrag({
            pointerEvent: triggerEvent,
            source: this.element,
            getData: () => this.options.getData(startEvent),
            ghost,
            onDragMove: this.options.onDragMove,
            onDragEnd: this.options.onDragEnd,
        });
    }

    dispose(): void {
        this._cancelPending();
        super.dispose();
    }
}
