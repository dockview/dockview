import { addStyles, CspNonceProvider, isShadowRoot } from './dom';
import { Emitter, addDisposableListener } from './events';
import { CompositeDisposable, Disposable, IDisposable } from './lifecycle';
import { Box } from './types';

/**
 * A popout window at a lifecycle boundary. `id` is the target name dockview
 * passed to `window.open`; `window` is the live handle.
 */
export interface PopoutWindowEvent {
    readonly id: string;
    readonly window: Window;
}

/**
 * Why a popout window could not be used:
 *
 * - `url-refused`: the URL failed {@link getPopoutUrlError}.
 * - `blocked`: `window.open` returned nothing, the browser's popup blocker
 *   being the usual reason.
 * - `unscriptable`: a window opened, but the opener cannot reach its document,
 *   so panel DOM cannot be moved into it. Hosts that answer `window.open`
 *   themselves can do this.
 * - `closed`: the window went away before it finished loading.
 */
export type PopoutWindowFailureReason =
    | 'url-refused'
    | 'blocked'
    | 'unscriptable'
    | 'closed';

export interface PopoutWindowFailure {
    readonly reason: PopoutWindowFailureReason;
    /** The refusal itself, where there was one. */
    readonly error?: Error;
}

/**
 * Everything dockview would pass to `window.open`, handed to a
 * `popoutWindowFactory` so a host can open the window itself.
 */
export interface PopoutWindowOpenRequest {
    /** The window name dockview would pass to `window.open`. */
    readonly id: string;
    /** The popout url, resolved to an absolute same-origin URL. */
    readonly url: string;
    /** The window bounds dockview would request, in screen coordinates. */
    readonly box: Box;
    /** The features string dockview would pass to `window.open`. */
    readonly features: string;
}

/**
 * Supply the popout `Window` yourself instead of dockview calling
 * `window.open`. Return `null` (or throw) to signal "blocked"; dockview then
 * runs its existing blocked-popout recovery. The returned `Window` must be
 * same-process and same-origin: dockview drives its normal pipeline against
 * it (load → move DOM container → clone styles). A window that has already
 * finished loading is attached to immediately.
 */
export type PopoutWindowFactory = (
    request: PopoutWindowOpenRequest
) => Window | null | Promise<Window | null>;

/** Feature keys derived from the placement box; not overridable. */
const GEOMETRY_FEATURE_KEYS: ReadonlySet<string> = new Set([
    'top',
    'left',
    'width',
    'height',
]);

export type PopoutWindowOptions = {
    url: string;
    onDidOpen?: (event: PopoutWindowEvent) => void;
    onWillClose?: (event: PopoutWindowEvent) => void;
    nonce?: CspNonceProvider;
    /** The root node dockview is mounted in, read when the popout loads.
     *  When it is a shadow root its stylesheets are copied too, since they are
     *  not in `document.styleSheets`. Rules that target the shadow host
     *  (`:host`, `::slotted`) match nothing in the popout. */
    styleRoot?: () => Node;
    windowFactory?: PopoutWindowFactory;
    /**
     * Extra window.open feature entries appended to the features string —
     * e.g. a marker for an Electron `setWindowOpenHandler` to match on, or
     * nonstandard features a host honours. Booleans serialize as 1/0 (the
     * form window features expect). Geometry keys and entries containing
     * ',' or '=' are ignored with a warning.
     */
    extraFeatures?: Record<string, string | number | boolean>;
} & Box;

/**
 * Throwing form of {@link getPopoutUrlError}, for callers with no way to
 * recover from a refused URL.
 */
export function assertSameOriginPopoutUrl(url: string): void {
    const error = getPopoutUrlError(url);

    if (error) {
        throw error;
    }
}

/**
 * Schemes a popout must never open: each runs script in a context the browser
 * still associates with the opener, or (for `file:`) has no origin to check.
 */
const UNSAFE_POPOUT_PROTOCOLS = new Set([
    'javascript:',
    'data:',
    'blob:',
    'vbscript:',
    'file:',
]);

/** How often an open popout window's `closed` flag is checked. */
const CLOSED_POLL_INTERVAL_MS = 250;

/**
 * The reason `url` is unusable as a popout target, or `undefined` if it is
 * allowed. Rejects anything that isn't same-origin with the page (scheme and
 * host, so a packaged webview's own scheme such as `tauri://` qualifies), and
 * the `javascript:`, `data:`, `blob:`, `vbscript:` and `file:` schemes that
 * would otherwise execute in a context the browser still associates with the
 * opener via `window.opener`.
 *
 * Callers that can recover from a refusal use this rather than catching, so it
 * can be handled without a rejected promise. `page` is what the URL resolves
 * against, and defaults to this page.
 */
export function getPopoutUrlError(
    url: string,
    page: Pick<Location, 'href' | 'protocol' | 'host'> = globalThis.location
): Error | undefined {
    let resolved: URL;
    try {
        resolved = new URL(url, page.href);
    } catch {
        return new Error(`dockview: invalid popout URL: ${url}`);
    }

    if (UNSAFE_POPOUT_PROTOCOLS.has(resolved.protocol)) {
        return new Error(
            `dockview: popout URL must not use the "${resolved.protocol}" protocol, which would run in the opener's context; got: ${url}`
        );
    }

    // Scheme + host rather than `origin`, which the URL spec makes opaque for a
    // custom scheme (`tauri://`, `app://`) and so reads "null" on both sides.
    // For http(s) the two agree, since `host` carries the port.
    const sameOrigin =
        resolved.protocol === page.protocol && resolved.host === page.host;

    if (!sameOrigin) {
        return new Error(
            `dockview: popout URL must be same-origin with the page (${page.protocol}//${page.host}); got: ${url}`
        );
    }

    return undefined;
}

export class PopoutWindow extends CompositeDisposable {
    private readonly _onWillClose = new Emitter<void>();
    readonly onWillClose = this._onWillClose.event;

    private readonly _onDidClose = new Emitter<void>();
    readonly onDidClose = this._onDidClose.event;

    private _window: { value: Window; disposable: IDisposable } | null = null;
    private _failure: PopoutWindowFailure | undefined;

    get window(): Window | null {
        return this._window?.value ?? null;
    }

    /** Set when {@link open} resolved `null`, saying which way it failed. */
    get failure(): PopoutWindowFailure | undefined {
        return this._failure;
    }

    constructor(
        private readonly target: string,
        private readonly className: string,
        private readonly options: PopoutWindowOptions
    ) {
        super();

        this.addDisposables(this._onWillClose, this._onDidClose, {
            dispose: () => {
                this.close();
            },
        });
    }

    dimensions(): Box | null {
        if (!this._window) {
            return null;
        }

        const left = this._window.value.screenX;
        const top = this._window.value.screenY;
        const width = this._window.value.innerWidth;
        const height = this._window.value.innerHeight;

        return { top, left, width, height };
    }

    close(): void {
        const current = this._window;

        if (!current) {
            return;
        }

        // Cleared before the teardown that closes the window: a host running the
        // document's unload handlers there re-enters through `beforeunload`.
        this._window = null;

        this._onWillClose.fire();

        this.options.onWillClose?.({
            id: this.target,
            window: current.value,
        });

        current.disposable.dispose();

        this._onDidClose.fire();
    }

    async open(): Promise<HTMLElement | null> {
        if (this._window) {
            throw new Error('instance of popout window is already open');
        }

        const url = `${this.options.url}`;
        assertSameOriginPopoutUrl(url);
        // Absolute, so a factory forwarding the request to another process
        // (an Electron main process, say) receives a usable URL.
        const resolvedUrl = new URL(url, globalThis.location.href).href;

        const featureEntries = [
            `top=${this.options.top}`,
            `left=${this.options.left}`,
            `width=${this.options.width}`,
            `height=${this.options.height}`,
        ];
        for (const [key, value] of Object.entries(
            this.options.extraFeatures ?? {}
        )) {
            // The geometry keys come from the placement box; an override here
            // would make the features string disagree with the box a factory
            // receives. ','/'=' are the features-string delimiters; a value
            // containing them would corrupt or inject entries.
            if (GEOMETRY_FEATURE_KEYS.has(key)) {
                console.warn(
                    `dockview: ignoring extra window feature '${key}': geometry keys come from the placement box`
                );
                continue;
            }
            if (/[,=]/.test(key) || /[,=]/.test(String(value))) {
                console.warn(
                    `dockview: ignoring extra window feature '${key}': ',' and '=' cannot appear in a feature`
                );
                continue;
            }
            featureEntries.push(
                typeof value === 'boolean'
                    ? `${key}=${value ? 1 : 0}`
                    : `${key}=${value}`
            );
        }
        const features = featureEntries.join(',');

        /**
         * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/open
         */
        let externalWindow: Window | null;
        if (this.options.windowFactory) {
            try {
                externalWindow = await this.options.windowFactory({
                    id: this.target,
                    url: resolvedUrl,
                    box: {
                        top: this.options.top,
                        left: this.options.left,
                        width: this.options.width,
                        height: this.options.height,
                    },
                    features,
                });
            } catch (err) {
                // A throwing factory settles like a blocked popup: the
                // recovery re-docks the group and reports the failure, rather
                // than a silent rejection that would orphan a restored group.
                this._failure = {
                    reason: 'blocked',
                    error: err instanceof Error ? err : new Error(String(err)),
                };
                return null;
            }
        } else {
            externalWindow = window.open(url, this.target, features);
        }

        if (!externalWindow) {
            this._failure = { reason: 'blocked' };
            return null;
        }

        const disposable = new CompositeDisposable();

        this._window = { value: externalWindow, disposable };

        disposable.addDisposables(
            Disposable.from(() => {
                externalWindow.close();
            }),
            this.watchForClose(externalWindow),
            addDisposableListener(globalThis.window, 'beforeunload', () => {
                /**
                 * before the main window closes we should close this popup too
                 * to be good citizens
                 *
                 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
                 */
                this.close();
            })
        );

        const container = this.createPopoutWindowContainer();

        if (this.className) {
            container.classList.add(this.className);
        }

        this.options.onDidOpen?.({
            id: this.target,
            window: externalWindow,
        });

        return new Promise<HTMLElement | null>((resolve) => {
            /**
             * A host can answer `window.open` with a window in its own
             * JavaScript context, which throws on first touch and cannot be
             * filled with panel DOM. Settle as a blocked popup does, so the
             * caller's fallback returns the group to the grid.
             */
            const abandon = (err: unknown): void => {
                this._failure = {
                    reason: 'unscriptable',
                    error: err instanceof Error ? err : new Error(String(err)),
                };
                this.close();
                resolve(null);
            };

            const attach = (): void => {
                try {
                    const externalDocument = externalWindow.document;
                    externalDocument.title = document.title;

                    externalDocument.body.appendChild(container);

                    // Constructed sheets (`adoptedStyleSheets`) are not in
                    // `styleSheets`, and a build that ships its CSS that way
                    // would otherwise pop out unstyled.
                    addStyles(
                        externalDocument,
                        [
                            ...Array.from(globalThis.document.styleSheets),
                            ...(globalThis.document.adoptedStyleSheets ?? []),
                        ],
                        {
                            nonce: this.options.nonce,
                        }
                    );

                    // Walk out through every host: a dock inside a component
                    // nested in another component is styled by each root it
                    // sits under, not just the innermost.
                    const sheets: CSSStyleSheet[] = [];
                    for (
                        let root = this.options.styleRoot?.();
                        isShadowRoot(root);
                        root = root.host.getRootNode()
                    ) {
                        sheets.push(
                            ...Array.from(root.styleSheets ?? []),
                            ...(root.adoptedStyleSheets ?? [])
                        );
                    }
                    if (sheets.length > 0) {
                        addStyles(externalDocument, sheets, {
                            nonce: this.options.nonce,
                        });
                    }

                    /**
                     * beforeunload must be registered after load for reasons I could not determine
                     * otherwise the beforeunload event will not fire when the window is closed
                     */
                    addDisposableListener(
                        externalWindow,
                        'beforeunload',
                        () => {
                            /**
                             * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
                             */
                            this.close();
                        }
                    );

                    resolve(container);
                } catch (err) {
                    // opened, but its document cannot be reached
                    abandon(err);
                }
            };

            // A factory may hand over a window that has ALREADY loaded
            // (pre-opened / reused windows are an advertised use); 'load'
            // never re-fires there, so waiting would hang forever. Attach
            // immediately — but only when the document is the real
            // same-origin one, not a fresh window's initial about:blank
            // (which also reports readyState 'complete' while its navigation
            // is still in flight; that is why the window.open path always
            // waits for 'load').
            if (this.options.windowFactory) {
                try {
                    const doc = externalWindow.document;
                    if (
                        doc?.readyState === 'complete' &&
                        doc.location?.href !== 'about:blank'
                    ) {
                        attach();
                        return;
                    }
                } catch (err) {
                    abandon(err);
                    return;
                }
            }

            try {
                externalWindow.addEventListener('unload', () => {
                    // Deliberately not a settle signal. `unload` fires on the
                    // window's initial `about:blank` document as it navigates to
                    // `url`, which happens *before* `load` on a perfectly healthy
                    // popout - resolving here would send every popout down the
                    // blocked-popup path.
                });
            } catch (err) {
                abandon(err);
                return;
            }

            /**
             * `load` is the only event that resolves this promise with a
             * container, so a window that goes away first would leave the
             * caller awaiting a promise that never settles - and
             * `addPopoutGroup` holds its layout transaction open until it does.
             * Settle with `null` on close, the same signal a blocked popup
             * gives and one the caller already handles. `resolve` after the
             * fact is a no-op, so a `load` that arrived first still wins.
             */
            disposable.addDisposables(
                this.onWillClose(() => {
                    this._failure ??= { reason: 'closed' };
                    resolve(null);
                })
            );

            externalWindow.addEventListener('load', () => {
                /**
                 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/load_event
                 */
                attach();
            });
        });
    }

    /**
     * Backstop for the `beforeunload` signal, which a window torn down without
     * running its unload handlers never sends: a native shell destroying the
     * webview, or a browser discarding the page. `closed` is readable on any
     * handle, cross-origin included. Whichever signal arrives first wins.
     */
    private watchForClose(externalWindow: Window): IDisposable {
        if (typeof externalWindow.closed !== 'boolean') {
            // nothing to observe, so no timer that can never fire
            return Disposable.NONE;
        }

        const handle = setInterval(() => {
            if (externalWindow.closed) {
                this.close();
            }
        }, CLOSED_POLL_INTERVAL_MS);

        return Disposable.from(() => {
            clearInterval(handle);
        });
    }

    private createPopoutWindowContainer(): HTMLElement {
        const el = document.createElement('div');
        el.classList.add('dv-popout-window');
        el.id = 'dv-popout-window';
        el.style.position = 'absolute';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.top = '0px';
        el.style.left = '0px';

        return el;
    }
}
