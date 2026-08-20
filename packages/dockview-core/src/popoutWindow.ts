import { addStyles, CspNonceProvider } from './dom';
import { Emitter, addDisposableListener } from './events';
import { CompositeDisposable, Disposable, IDisposable } from './lifecycle';
import { Box } from './types';

/**
 * Everything dockview would pass to `window.open`, handed to a
 * `popoutWindowFactory` so a host can open the window itself.
 */
export interface PopoutWindowOpenRequest {
    /** The window name dockview would pass to `window.open`. */
    readonly id: string;
    /** The resolved same-origin popout url. */
    readonly url: string;
    /** The window bounds dockview would request, in screen coordinates. */
    readonly box: Box;
    /** The features string dockview would pass to `window.open`. */
    readonly features: string;
}

/**
 * Supply the popout `Window` yourself instead of dockview calling
 * `window.open`. Return `null` to signal "blocked"; dockview then runs its
 * existing blocked-popout recovery. The returned `Window` must be
 * same-process and same-origin: dockview drives its normal pipeline against
 * it (load → move DOM container → clone styles).
 */
export type PopoutWindowFactory = (
    request: PopoutWindowOpenRequest
) => Window | null | Promise<Window | null>;

export type PopoutWindowOptions = {
    url: string;
    onDidOpen?: (event: { id: string; window: Window }) => void;
    onWillClose?: (event: { id: string; window: Window }) => void;
    nonce?: CspNonceProvider;
    windowFactory?: PopoutWindowFactory;
    /**
     * Extra window.open feature entries appended to the features string —
     * e.g. a marker for an Electron `setWindowOpenHandler` to match on, or
     * nonstandard features a host honours. Booleans serialize as 1/0 (the
     * form window features expect).
     */
    extraFeatures?: Record<string, string | number | boolean>;
} & Box;

/**
 * Reject popout URLs that aren't same-origin http(s). Blocks `javascript:`,
 * `data:`, `blob:`, `vbscript:`, and cross-origin URLs that would otherwise
 * execute in a context the browser still associates with the opener via
 * `window.opener`. Returns the resolved absolute URL, so consumers (e.g. a
 * `popoutWindowFactory` forwarding the request to another process) receive a
 * string that is meaningful outside this document's base-URL context.
 */
export function assertSameOriginPopoutUrl(url: string): string {
    let resolved: URL;
    try {
        resolved = new URL(url, globalThis.location.href);
    } catch {
        throw new Error(`dockview: invalid popout URL: ${url}`);
    }

    const protocolOk =
        resolved.protocol === 'http:' || resolved.protocol === 'https:';
    if (!protocolOk || resolved.origin !== globalThis.location.origin) {
        throw new Error(
            `dockview: popout URL must be same-origin http(s); got: ${url}`
        );
    }
    return resolved.href;
}

/** Feature keys derived from the placement box; not overridable. */
const GEOMETRY_FEATURE_KEYS: ReadonlySet<string> = new Set([
    'top',
    'left',
    'width',
    'height',
]);

export class PopoutWindow extends CompositeDisposable {
    private readonly _onWillClose = new Emitter<void>();
    readonly onWillClose = this._onWillClose.event;

    private readonly _onDidClose = new Emitter<void>();
    readonly onDidClose = this._onDidClose.event;

    private _window: { value: Window; disposable: IDisposable } | null = null;

    get window(): Window | null {
        return this._window?.value ?? null;
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
        if (this._window) {
            this._onWillClose.fire();

            this.options.onWillClose?.({
                id: this.target,
                window: this._window.value,
            });

            this._window.disposable.dispose();
            this._window = null;

            this._onDidClose.fire();
        }
    }

    async open(): Promise<HTMLElement | null> {
        if (this._window) {
            throw new Error('instance of popout window is already open');
        }

        const url = assertSameOriginPopoutUrl(`${this.options.url}`);

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
                    url,
                    box: {
                        top: this.options.top,
                        left: this.options.left,
                        width: this.options.width,
                        height: this.options.height,
                    },
                    features,
                });
            } catch (err) {
                // A throwing factory follows the same recovery as returning
                // null: the blocked-popout path fires
                // onDidOpenPopoutWindowFail and re-docks the group, instead
                // of a silent failure that would orphan a restored group.
                console.error(
                    'dockview: popoutWindowFactory threw; treating the popout as blocked',
                    err
                );
                externalWindow = null;
            }
        } else {
            externalWindow = window.open(url, this.target, features);
        }

        if (!externalWindow) {
            /**
             * Popup blocked
             */
            return null;
        }

        const disposable = new CompositeDisposable();

        this._window = { value: externalWindow, disposable };

        disposable.addDisposables(
            Disposable.from(() => {
                externalWindow.close();
            }),
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

        return new Promise<HTMLElement | null>((resolve, reject) => {
            const attach = () => {
                try {
                    const externalDocument = externalWindow!.document;
                    externalDocument.title = document.title;

                    externalDocument.body.appendChild(container);

                    addStyles(
                        externalDocument,
                        globalThis.document.styleSheets,
                        {
                            nonce: this.options.nonce,
                        }
                    );

                    /**
                     * beforeunload must be registered after load for reasons I could not determine
                     * otherwise the beforeunload event will not fire when the window is closed
                     */
                    addDisposableListener(
                        externalWindow!,
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
                    // only except this is the DOM isn't setup. e.g. in a in correctly configured test
                    reject(err as Error);
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
                } catch {
                    // fall through to the load listener
                }
            }

            externalWindow.addEventListener('unload', (e) => {
                // if page fails to load before unloading
                // this.close();
            });

            externalWindow.addEventListener('load', () => {
                /**
                 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/load_event
                 */
                attach();
            });
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
