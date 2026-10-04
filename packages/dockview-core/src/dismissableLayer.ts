import { isEventWithin, retargetInto, shadowRootsOf } from './dom';
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

export interface DismissableLayerOptions {
    /** Window to listen on. Pass the popout window for popout-hosted layers.
     *  Defaults to the global `window`. */
    readonly window?: Window;
    /** Invoked when any enabled dismiss signal fires. */
    readonly onDismiss: () => void;
    /** A pointerdown landed *inside* the layer (not a dismissal). Use it to
     *  mark interaction (e.g. make a transient layer sticky). */
    readonly onInsidePointerDown?: (event: PointerEvent) => void;
    /** Whether a pointer event is inside the layer. Defaults to checking the
     *  event's composed path against {@link DismissableLayerOptions.elements}.
     *  Provide this for geometry-based hit testing (e.g. when the visible
     *  content is a sibling overlay stacked on top of the layer). */
    readonly isInside?: (event: PointerEvent) => boolean;
    /** Elements treated as "inside" by the default contains check. */
    readonly elements?: () => HTMLElement[];
    /** An element the layer is anchored to, used only to locate the shadow
     *  roots it lives in for {@link focusOut}. `elements` already provides
     *  that, so pass this when the layer has none — a layer that decides
     *  inside/outside purely by geometry ({@link isInside} /
     *  {@link isFocusInside}) would otherwise never see a focus move *within*
     *  a shadow root, since such a move never reaches the window. */
    readonly anchor?: () => Node | null | undefined;
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
     *  {@link focusOut}). Receives the target as seen from the layer's own
     *  tree — the one holding {@link anchor}, else the first of
     *  {@link elements} — so a predicate can always be written against the
     *  elements it was given: focus inside a *nested* web component arrives as
     *  that component's host, while focus in the layer's own shadow root
     *  arrives as the real element. Defaults to checking the event's composed
     *  path against {@link elements}. Provide this for geometry-based testing
     *  when the content is a sibling overlay stacked on top of the layer. */
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
 * decided by an `isInside` predicate (geometry) or by checking the event's
 * composed path against `elements`. Dispose to detach every listener.
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
        return isEventWithin(event, options.elements?.() ?? []);
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
        // `focusin` bubbles to the window; capture so it's seen regardless of
        // content handlers. A focus move *within* a shadow root never reaches
        // the window (the event is retargeted to the host and its path cut
        // there), so also listen on the shadow roots the layer lives in.
        //
        // An event entering the layer's tree from outside reaches both the
        // window and those roots. A `WeakSet` (not a single slot) dedupes it,
        // so an `onDismiss` that moves focus — dispatching a nested `focusin`
        // while this one is still on the stack — can't make the outer event
        // look unseen and dismiss twice.
        /** A node in the layer's own tree, to scope retargeting and to locate
         *  the shadow roots to listen on. */
        const layerScope = (): Node | undefined =>
            options.anchor?.() ?? options.elements?.()[0];

        const seen = new WeakSet<FocusEvent>();
        const onFocusIn = (event: FocusEvent): void => {
            if (seen.has(event)) {
                return;
            }
            seen.add(event);
            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }
            // Retarget into the layer's own tree so a custom predicate sees
            // the same element whichever listener caught the event — and, for
            // a layer inside a shadow root, an element it can actually tell
            // apart rather than the one host everything collapses onto. The
            // default path reads the composed path, which retargeting doesn't
            // affect.
            const inside = options.isFocusInside
                ? options.isFocusInside(retargetInto(target, layerScope()))
                : isEventWithin(event, options.elements?.() ?? []);
            if (!inside) {
                options.onDismiss();
            }
        };

        // `elements()` is resolved per event elsewhere, so the roots can't be
        // read once at construction: a layer built before its surface is
        // attached, or moved into a shadow root later, would keep the bug.
        // Focus *entering* the tree always reaches the window, so re-sync
        // there, before any intra-root move can happen.
        const bound = new Map<ShadowRoot, IDisposable>();
        const syncShadowRoots = (): void => {
            const wanted = new Set<ShadowRoot>();
            const anchor = options.anchor?.();
            const sources: Node[] = [
                ...(options.elements?.() ?? []),
                ...(anchor ? [anchor] : []),
            ];
            for (const node of sources) {
                for (const root of shadowRootsOf(node)) {
                    wanted.add(root);
                }
            }
            for (const [root, listener] of bound) {
                if (!wanted.has(root)) {
                    listener.dispose();
                    bound.delete(root);
                }
            }
            for (const root of wanted) {
                if (bound.has(root)) {
                    continue;
                }
                bound.set(
                    root,
                    addDisposableListener(
                        root as unknown as HTMLElement,
                        'focusin',
                        onFocusIn,
                        capture
                    )
                );
            }
        };

        disposables.addDisposables(
            addDisposableListener(
                win,
                'focusin',
                (event) => {
                    syncShadowRoots();
                    onFocusIn(event);
                },
                capture
            ),
            {
                dispose: () => {
                    for (const [, listener] of bound) {
                        listener.dispose();
                    }
                    bound.clear();
                },
            }
        );
        syncShadowRoots();
    }

    return disposables;
}
