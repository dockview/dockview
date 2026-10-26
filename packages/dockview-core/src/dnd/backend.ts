import { addDisposableListener } from '../events';
import {
    CompositeDisposable,
    IDisposable,
    MutableDisposable,
} from '../lifecycle';
import { Droptarget, DroptargetOptions, IDropTarget } from './droptarget';
import { addGhostImage } from './ghost';
import { PointerDropTarget } from './pointer/pointerDropTarget';
import { PointerDragSource } from './pointer/pointerDragSource';
import { PointerGhost } from './pointer/pointerGhost';
import { disableIframePointEvents } from '../dom';

/**
 * Backend factory surface. Each implementation hides one concrete DnD
 * mechanism (HTML5 native events, pointer events) behind a uniform set of
 * `createX` methods.
 *
 * The backends are stateless. `html5Backend` and `pointerBackend` below
 * are exported as module-level singletons, so they need no construction
 * or wiring through the component tree.
 */
export interface IDragBackend {
    /** Stable identifier, mostly for debugging / tests. */
    readonly kind: 'html5' | 'pointer';
    createDropTarget(
        element: HTMLElement,
        options: DroptargetOptions
    ): IDropTarget;
    createDragSource(
        element: HTMLElement,
        options: DragSourceOptions
    ): IDragSource;
}

/**
 * Visual specification handed to the backend. HTML5 calls `setDragImage`
 * with `(element, offsetX, offsetY)` and discards the element after a
 * microtask. Pointer wraps the element in a `PointerGhost` that follows
 * the cursor for the duration of the drag.
 */
export interface IDragGhostSpec {
    element: HTMLElement;
    /** Pixels from cursor to ghost's top-left. Default 0. */
    offsetX?: number;
    offsetY?: number;
    /**
     * Called when the backend is done with the ghost. HTML5 fires it after
     * the drag-image snapshot is captured (next tick); pointer fires it
     * when the follow-cursor ghost is removed at drag end. Use for custom
     * framework renderers that need teardown.
     */
    dispose?: () => void;
}

export interface DragSourceOptions {
    /** Populate transfer; returned disposer clears it on drag end. */
    getData: (event: DragEvent | PointerEvent) => IDisposable;
    /** Veto a drag at start time. */
    isCancelled?: (event: DragEvent | PointerEvent) => boolean;
    createGhost?: (
        event: DragEvent | PointerEvent
    ) => IDragGhostSpec | undefined;
    onDragStart?: (event: DragEvent | PointerEvent) => void;
    onDragEnd?: (event: DragEvent | PointerEvent) => void;
    /** Initial disabled state; toggle later via `setDisabled`. */
    disabled?: boolean;
    /**
     * Pointer-only. When true (default), the pointer backend ignores mouse
     * pointers and lets the HTML5 path handle them. HTML5 backend ignores.
     */
    touchOnly?: boolean;
    /**
     * Pointer-only long-press delay in ms. May be a function so the value
     * can vary per gesture (e.g. floating-group redock vs docked rearrange).
     */
    touchInitiationDelay?: number | (() => number);
    /** Pointer-only pre-arm movement tolerance in px. May also be a function. */
    pressTolerance?: number | (() => number);
    /** Pointer-only movement threshold to promote pointerdown → drag. */
    threshold?: number;
}

export interface IDragSource extends IDisposable {
    setDisabled(value: boolean): void;
    /** Pointer-only knob; no-op on HTML5 backend. */
    setTouchOnly(value: boolean): void;
    /** Pointer-only; no-op on HTML5 backend. */
    cancelPending(): void;
}

/**
 * HTML5 drag source. Listens for the native `dragstart` event, calls
 * `getData` to populate transfer, optionally renders the ghost via
 * `setDragImage`, fires `onDragStart` / `onDragEnd`, and tears down the
 * transfer disposer after `dragend`.
 */
class Html5DragSource extends CompositeDisposable implements IDragSource {
    private _disabled: boolean;
    private readonly _dataDisposable = new MutableDisposable();
    private readonly _pointerEventsDisposable = new MutableDisposable();

    constructor(
        private readonly el: HTMLElement,
        private readonly opts: DragSourceOptions
    ) {
        super();
        this._disabled = !!opts.disabled;

        this.addDisposables(
            this._dataDisposable,
            this._pointerEventsDisposable,
            addDisposableListener(this.el, 'dragstart', (event) => {
                if (
                    event.defaultPrevented ||
                    this._disabled ||
                    this.opts.isCancelled?.(event)
                ) {
                    event.preventDefault();
                    return;
                }

                // Iframes capture pointermove once the cursor enters them,
                // which freezes drag tracking from the parent window's
                // POV. Shield the source's owning document so popout-window
                // drags shield the popout, not the main window.
                const iframes = disableIframePointEvents(
                    this.el.ownerDocument ?? document
                );
                this._pointerEventsDisposable.value = {
                    dispose: () => iframes.release(),
                };

                this.el.classList.add('dv-dragged');
                setTimeout(() => this.el.classList.remove('dv-dragged'), 0);

                this._dataDisposable.value = this.opts.getData(event);

                const ghost = this.opts.createGhost?.(event);
                if (ghost && event.dataTransfer) {
                    addGhostImage(event.dataTransfer, ghost.element, {
                        x: ghost.offsetX ?? 0,
                        y: ghost.offsetY ?? 0,
                        ownerDocument: this.el.ownerDocument ?? undefined,
                        owner: this.el,
                    });
                    if (ghost.dispose) {
                        // addGhostImage removes the element from the DOM on
                        // the next tick; dispose the framework renderer on
                        // the same schedule.
                        const disposeGhost = ghost.dispose;
                        setTimeout(() => disposeGhost(), 0);
                    }
                }

                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    // Some third-party DnD libs (e.g. react-dnd) cancel the
                    // dragstart when `dataTransfer.types` is empty.
                    if (event.dataTransfer.items.length === 0) {
                        event.dataTransfer.setData('text/plain', '');
                    }
                }

                this.opts.onDragStart?.(event);
            }),
            addDisposableListener(this.el, 'dragend', (event) => {
                this._pointerEventsDisposable.dispose();
                // Defer disposal so drop handlers can still read the
                // transfer payload before it clears.
                setTimeout(() => this._dataDisposable.dispose(), 0);
                this.opts.onDragEnd?.(event);
            })
        );
    }

    setDisabled(value: boolean): void {
        this._disabled = value;
    }
    setTouchOnly(_: boolean): void {
        // No-op: the HTML5 path can't filter by pointer type.
    }
    cancelPending(): void {
        // No-op: HTML5 has no pre-arm phase to cancel.
    }
}

class Html5DragBackend implements IDragBackend {
    readonly kind = 'html5' as const;
    createDropTarget(
        element: HTMLElement,
        options: DroptargetOptions
    ): IDropTarget {
        return new Droptarget(element, options);
    }
    createDragSource(
        element: HTMLElement,
        options: DragSourceOptions
    ): IDragSource {
        return new Html5DragSource(element, options);
    }
}

class PointerDragBackend implements IDragBackend {
    readonly kind = 'pointer' as const;
    createDropTarget(
        element: HTMLElement,
        options: DroptargetOptions
    ): IDropTarget {
        return new PointerDropTarget(element, options);
    }
    createDragSource(
        element: HTMLElement,
        options: DragSourceOptions
    ): IDragSource {
        const pointerCreateGhost = options.createGhost
            ? (event: PointerEvent) => {
                  const spec = options.createGhost!(event);
                  if (!spec) {
                      return undefined;
                  }
                  const ghost = new PointerGhost({
                      element: spec.element,
                      initialX: event.clientX,
                      initialY: event.clientY,
                      offsetX: spec.offsetX,
                      offsetY: spec.offsetY,
                      owner: element,
                  });
                  if (spec.dispose) {
                      const baseDispose = ghost.dispose.bind(ghost);
                      const disposeSpec = spec.dispose;
                      ghost.dispose = () => {
                          baseDispose();
                          disposeSpec();
                      };
                  }
                  return ghost;
              }
            : undefined;

        const source = new PointerDragSource(element, {
            getData: options.getData,
            isCancelled: options.isCancelled,
            onDragStart: options.onDragStart,
            onDragEnd: options.onDragEnd
                ? (event) => options.onDragEnd!(event.pointerEvent)
                : undefined,
            createGhost: pointerCreateGhost,
            touchOnly: options.touchOnly,
            touchInitiationDelay: options.touchInitiationDelay,
            pressTolerance: options.pressTolerance,
            threshold: options.threshold,
        });

        if (options.disabled) {
            source.setDisabled(true);
        }
        return source;
    }
}

export const html5Backend: IDragBackend = new Html5DragBackend();
export const pointerBackend: IDragBackend = new PointerDragBackend();
