import { addDisposableListener } from './events';
import { CompositeDisposable, IDisposable } from './lifecycle';

/** Touch-primary input (coarse pointer, no fine pointer). On these devices a
 *  window resize is usually an on-screen-keyboard pop / orientation change /
 *  address-bar collapse, none of which mean "dismiss". */
function isCoarsePrimaryInput(win: Window): boolean {
    if (!win.matchMedia) {
        return false;
    }
    const coarse = win.matchMedia('(pointer: coarse)').matches;
    const fine = win.matchMedia('(pointer: fine)').matches;
    return coarse && !fine;
}

/** The event's originating target. A window listener sees events from inside
 *  a shadow root retargeted to the shadow host, so read the composed path. */
function originalTarget(event: Event): EventTarget | null {
    return event.composedPath?.()[0] ?? event.target;
}

export interface DismissableLayerOptions {
    /** Window to listen on. Pass the popout window for popout-hosted layers.
     *  Defaults to the global `window`. */
    readonly window?: Window;
    /** Invoked when any enabled dismiss signal fires. */
    readonly onDismiss: () => void;
    /** A pointerdown landed *inside* the layer (not a dismissal). Use it to
     *  mark interaction (e.g. make a transient layer sticky). */
    readonly onInsidePointerDown?: (event: PointerEvent) => void;
    /** Whether a pointer event is inside the layer. Defaults to a DOM
     *  `contains` check against {@link DismissableLayerOptions.elements}.
     *  Provide this for geometry-based hit testing (e.g. when the visible
     *  content is a sibling overlay stacked on top of the layer). */
    readonly isInside?: (event: PointerEvent) => boolean;
    /** Elements treated as "inside" by the default contains check. */
    readonly elements?: () => HTMLElement[];
    /** Dismiss on `Escape` (default `true`). */
    readonly escape?: boolean;
    /** Extra keys that also dismiss (e.g. `'Enter'`). */
    readonly keys?: readonly string[];
    /** Dismiss on a pointerdown outside the layer (default `true`). */
    readonly outsidePointerDown?: boolean;
    /** Ignore outside-pointerdowns for this many ms after opening. Covers the
     *  gesture that opened the layer (e.g. a touch long-press) dispatching a
     *  follow-up pointerdown just outside it. */
    readonly pointerDownGraceMs?: number;
    /** Dismiss on window resize, skipping touch-driven resizes (default
     *  `false`). */
    readonly resize?: boolean;
    /** Dismiss when focus moves to an element *outside* the layer (default
     *  `false`): the "slide back on focus loss" behaviour. */
    readonly focusOut?: boolean;
    /** Whether a newly-focused element is inside the layer (for
     *  {@link focusOut}). Defaults to a `contains` check against
     *  {@link elements}. Provide this for geometry-based testing when the
     *  content is a sibling overlay stacked on top of the layer. */
    readonly isFocusInside?: (focused: Element) => boolean;
    /** Listen in the capture phase (default `false`). Use capture when the
     *  layer must see the event before content handlers stop its propagation. */
    readonly capture?: boolean;
    /** Clock source for the grace window. Defaults to `Date.now`. */
    readonly now?: () => number;
}

/**
 * The shared dismissal lifecycle behind transient surfaces (popovers, menus,
 * peeks): while it lives it watches a configurable set of dismiss signals
 * (Escape / extra keys, outside-pointerdown with an optional grace window,
 * window resize, focus moving outside) and calls `onDismiss`. Inside/outside is
 * decided by an `isInside` predicate (geometry) or a `contains` check against
 * `elements`. Dispose to detach every listener.
 *
 * It owns only the *signals*, not the surface element, its position, or any
 * hover/keep-open policy, so callers keep their own element lifecycle and
 * layer this underneath.
 */
export function createDismissableLayer(
    options: DismissableLayerOptions
): IDisposable {
    const win = options.window ?? window;
    const capture = options.capture ?? false;
    const escape = options.escape ?? true;
    const keys = options.keys ?? [];
    const outside = options.outsidePointerDown ?? true;
    const grace = options.pointerDownGraceMs ?? 0;
    const now = options.now ?? Date.now;
    const openedAt = now();

    const disposables = new CompositeDisposable();

    const isInside = (event: PointerEvent): boolean => {
        if (options.isInside) {
            return options.isInside(event);
        }
        const target = originalTarget(event);
        if (!(target instanceof Node)) {
            return false;
        }
        return (options.elements?.() ?? []).some((el) => el.contains(target));
    };

    if (escape || keys.length > 0) {
        disposables.addDisposables(
            addDisposableListener(
                win,
                'keydown',
                (event) => {
                    if (
                        (escape && event.key === 'Escape') ||
                        keys.includes(event.key)
                    ) {
                        options.onDismiss();
                    }
                },
                capture
            )
        );
    }

    if (outside || options.onInsidePointerDown) {
        disposables.addDisposables(
            addDisposableListener(
                win,
                'pointerdown',
                (event) => {
                    if (isInside(event)) {
                        options.onInsidePointerDown?.(event);
                        return;
                    }
                    if (!outside || now() - openedAt < grace) {
                        return;
                    }
                    options.onDismiss();
                },
                capture
            )
        );
    }

    if (options.resize) {
        disposables.addDisposables(
            addDisposableListener(win, 'resize', () => {
                if (isCoarsePrimaryInput(win)) {
                    return;
                }
                options.onDismiss();
            })
        );
    }

    if (options.focusOut) {
        const isFocusInside = (focused: Element): boolean => {
            if (options.isFocusInside) {
                return options.isFocusInside(focused);
            }
            return (options.elements?.() ?? []).some((el) =>
                el.contains(focused)
            );
        };
        // `focusin` bubbles to the window; capture so it's seen regardless of
        // content handlers.
        const onFocusIn = (event: FocusEvent): void => {
            const target = originalTarget(event);
            if (target instanceof Element && !isFocusInside(target)) {
                options.onDismiss();
            }
        };
        win.addEventListener('focusin', onFocusIn, capture);
        disposables.addDisposables({
            dispose: () =>
                win.removeEventListener('focusin', onFocusIn, capture),
        });
    }

    return disposables;
}
