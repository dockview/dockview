import { addStyles, CspNonceProvider } from './dom';
import { Emitter, addDisposableListener } from './events';
import { CompositeDisposable, Disposable, IDisposable } from './lifecycle';
import { Box } from './types';

export type PopoutWindowOptions = {
    url: string;
    onDidOpen?: (event: { id: string; window: Window }) => void;
    onWillClose?: (event: { id: string; window: Window }) => void;
    nonce?: CspNonceProvider;
} & Box;

/**
 * Reject popout URLs that aren't same-origin http(s). Blocks `javascript:`,
 * `data:`, `blob:`, `vbscript:`, and cross-origin URLs that would otherwise
 * execute in a context the browser still associates with the opener via
 * `window.opener`.
 */
export function assertSameOriginPopoutUrl(url: string): void {
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
}

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

        const url = `${this.options.url}`;
        assertSameOriginPopoutUrl(url);

        const features = Object.entries({
            top: this.options.top,
            left: this.options.left,
            width: this.options.width,
            height: this.options.height,
        })
            .map(([key, value]) => `${key}=${value}`)
            .join(',');

        /**
         * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/open
         */
        const externalWindow = window.open(url, this.target, features);

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
            externalWindow.addEventListener('unload', () => {
                // Deliberately not a settle signal. `unload` fires on the
                // window's initial `about:blank` document as it navigates to
                // `url`, which happens *before* `load` on a perfectly healthy
                // popout - resolving here would send every popout down the
                // blocked-popup path.
            });

            /**
             * `load` is the only event that resolves this promise with a
             * container, so a window that goes away first would leave the
             * caller awaiting a promise that never settles - and
             * `addPopoutGroup` holds its layout transaction open until it does.
             * Settle with `null` on close, the same signal a blocked popup
             * gives and one the caller already handles. `resolve` after the
             * fact is a no-op, so a `load` that arrived first still wins.
             */
            disposable.addDisposables(this.onWillClose(() => resolve(null)));

            externalWindow.addEventListener('load', () => {
                /**
                 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/load_event
                 */

                try {
                    const externalDocument = externalWindow.document;
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
                    // only except this is the DOM isn't setup. e.g. in a in correctly configured test
                    reject(err as Error);
                }
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
