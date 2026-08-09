import { addDisposableListener } from '../../events';
import { CompositeDisposable, IDisposable } from '../../lifecycle';

export interface LongPressOptions {
    /** Default 500ms. */
    delay?: number;
    /** Default 8px. */
    tolerance?: number;
    /** Default true: mouse users have right-click and don't need this. */
    touchOnly?: boolean;
    /** Receives the `pointerdown` event so consumers can read `clientX/Y`. */
    onLongPress: (event: PointerEvent) => void;
}

const DEFAULT_DELAY = 500;
const DEFAULT_TOLERANCE = 8;

/**
 * Doesn't consume the pointer; movement past `tolerance` cancels
 * silently so a sibling `PointerDragSource` can take over.
 */
export class LongPressDetector extends CompositeDisposable {
    private _pointerId: number | undefined;
    private _startX = 0;
    private _startY = 0;
    private _timer: ReturnType<typeof setTimeout> | undefined;
    private _moveListener: IDisposable | undefined;
    private _upListener: IDisposable | undefined;
    private _cancelListener: IDisposable | undefined;

    constructor(
        private readonly element: HTMLElement,
        private readonly options: LongPressOptions
    ) {
        super();
        this.addDisposables(
            addDisposableListener(this.element, 'pointerdown', (e) => {
                this._onPointerDown(e);
            })
        );
    }

    private _onPointerDown(event: PointerEvent): void {
        const touchOnly = this.options.touchOnly ?? true;
        if (
            touchOnly &&
            event.pointerType !== 'touch' &&
            event.pointerType !== 'pen'
        ) {
            return;
        }

        this._cancelPending();

        this._pointerId = event.pointerId;
        this._startX = event.clientX;
        this._startY = event.clientY;

        const delay = this.options.delay ?? DEFAULT_DELAY;
        const tolerance = this.options.tolerance ?? DEFAULT_TOLERANCE;

        // Source's owning window; popout drags fire on their own window.
        const targetWindow: Window =
            this.element.ownerDocument?.defaultView ?? globalThis.window;

        this._timer = setTimeout(() => {
            this._timer = undefined;
            this._cancelPending();
            // Touch browsers synthesize a compatibility `contextmenu` event
            // for long-press. preventDefault on the original pointerdown is
            // too late (already dispatched), so install a one-shot
            // capture-phase guard for the next contextmenu. Without this,
            // consumers that don't preventDefault inside their onLongPress
            // (or that early-return before doing so) leak the browser's
            // native menu on top of theirs.
            this._installContextMenuGuard(targetWindow);
            // Same idea for `click`: when the user releases their finger
            // after the long-press, touch browsers dispatch a `click` to
            // the element the touch ended on (the source). Consumers
            // typically wire click to a primary action (e.g. tab activate,
            // tab-group chip collapse-toggle). Without this guard, the
            // long-press immediately fires both the context menu and the
            // primary action, and the action's side effects (e.g. a chip
            // collapse animation) read as a screen wobble while the menu
            // is supposed to be open. Scoped to the source element so
            // clicks on menu items elsewhere remain effective.
            this._installClickGuard(targetWindow);
            this.options.onLongPress(event);
        }, delay);

        this._moveListener = addDisposableListener(
            targetWindow,
            'pointermove',
            (moveEvent) => {
                if (moveEvent.pointerId !== this._pointerId) {
                    return;
                }
                const dx = moveEvent.clientX - this._startX;
                const dy = moveEvent.clientY - this._startY;
                if (Math.hypot(dx, dy) > tolerance) {
                    this._cancelPending();
                }
            }
        );

        this._upListener = addDisposableListener(
            targetWindow,
            'pointerup',
            (upEvent) => {
                if (upEvent.pointerId !== this._pointerId) {
                    return;
                }
                this._cancelPending();
            }
        );

        this._cancelListener = addDisposableListener(
            targetWindow,
            'pointercancel',
            (cancelEvent) => {
                if (cancelEvent.pointerId !== this._pointerId) {
                    return;
                }
                this._cancelPending();
            }
        );
    }

    private _installContextMenuGuard(targetWindow: Window): void {
        let guard: IDisposable | undefined;
        const timeout = setTimeout(() => guard?.dispose(), 500);
        guard = addDisposableListener(
            targetWindow,
            'contextmenu',
            (event) => {
                event.preventDefault();
                clearTimeout(timeout);
                guard?.dispose();
            },
            { capture: true }
        );
    }

    private _installClickGuard(targetWindow: Window): void {
        let guard: IDisposable | undefined;
        const timeout = setTimeout(() => guard?.dispose(), 500);
        guard = addDisposableListener(
            targetWindow,
            'click',
            (event) => {
                // Only suppress clicks targeted at the long-pressed element
                // or its descendants. A user tap on a context menu item (or
                // anywhere else) still gets through unchanged.
                const target = event.target as Node | null;
                if (target && this.element.contains(target)) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                clearTimeout(timeout);
                guard?.dispose();
            },
            { capture: true }
        );
    }

    private _cancelPending(): void {
        if (this._timer !== undefined) {
            clearTimeout(this._timer);
            this._timer = undefined;
        }
        this._pointerId = undefined;
        this._moveListener?.dispose();
        this._upListener?.dispose();
        this._cancelListener?.dispose();
        this._moveListener = undefined;
        this._upListener = undefined;
        this._cancelListener = undefined;
    }

    dispose(): void {
        this._cancelPending();
        super.dispose();
    }
}
