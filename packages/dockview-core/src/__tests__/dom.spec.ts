import {
    Classnames,
    addStyles,
    disableIframePointEvents,
    findRelativeZIndexParent,
    isChildEntirelyVisibleWithinParent,
    isInDocument,
    onDidWindowMoveEnd,
    parseCssTimeMs,
    prefersReducedMotion,
    quasiDefaultPrevented,
    quasiPreventDefault,
    resolveCssDurationMs,
    resolveOpaqueBackground,
} from '../dom';

function stubRect(
    el: HTMLElement,
    r: { left: number; top: number; width: number; height: number }
): void {
    el.getBoundingClientRect = () =>
        ({
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            right: r.left + r.width,
            bottom: r.top + r.height,
            x: r.left,
            y: r.top,
            toJSON: () => ({}),
        }) as DOMRect;
}

describe('dom', () => {
    test('quasiPreventDefault', () => {
        const event = new Event('myevent');
        expect((event as any)['dv-quasiPreventDefault']).toBeUndefined();
        quasiPreventDefault(event);
        expect((event as any)['dv-quasiPreventDefault']).toBe(true);
    });

    test('quasiDefaultPrevented', () => {
        const event = new Event('myevent');
        expect(quasiDefaultPrevented(event)).toBeFalsy();

        (event as any)['dv-quasiPreventDefault'] = false;
        expect(quasiDefaultPrevented(event)).toBeFalsy();

        (event as any)['dv-quasiPreventDefault'] = true;
        expect(quasiDefaultPrevented(event)).toBeTruthy();
    });

    test('isInDocument: DOM element', () => {
        const el = document.createElement('div');

        expect(isInDocument(el)).toBeFalsy();

        document.body.appendChild(el);
        expect(isInDocument(el)).toBeTruthy();
    });

    test('isInDocument: Shadow DOM element', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        const shadow = el.attachShadow({ mode: 'open' });

        const el2 = document.createElement('div');
        expect(isInDocument(el2)).toBeFalsy();

        shadow.appendChild(el2);

        expect(isInDocument(el2)).toBeTruthy();
    });

    test('disableIframePointEvents', () => {
        const el1 = document.createElement('iframe');
        const el2 = document.createElement('iframe');
        const el3 = document.createElement('webview');
        const el4 = document.createElement('webview');

        document.body.appendChild(el1);
        document.body.appendChild(el2);
        document.body.appendChild(el3);
        document.body.appendChild(el4);

        el1.style.pointerEvents = 'inherit';
        el3.style.pointerEvents = 'inherit';

        expect(el1.style.pointerEvents).toBe('inherit');
        expect(el2.style.pointerEvents).toBe('');
        expect(el3.style.pointerEvents).toBe('inherit');
        expect(el4.style.pointerEvents).toBe('');

        const f = disableIframePointEvents();

        expect(el1.style.pointerEvents).toBe('none');
        expect(el2.style.pointerEvents).toBe('none');
        expect(el3.style.pointerEvents).toBe('none');
        expect(el4.style.pointerEvents).toBe('none');

        f.release();

        expect(el1.style.pointerEvents).toBe('inherit');
        expect(el2.style.pointerEvents).toBe('');
        expect(el3.style.pointerEvents).toBe('inherit');
        expect(el4.style.pointerEvents).toBe('');
    });

    test('disableIframePointEvents respects the rootNode parameter', () => {
        // Iframes in a popout document must be shieldable independently of
        // the main document, which is what the rootNode parameter selects.
        const main = document.createElement('iframe');
        document.body.appendChild(main);

        // Simulate a popout window via a detached document.
        const popoutDoc = document.implementation.createHTMLDocument('popout');
        const popoutIframe = popoutDoc.createElement('iframe');
        popoutDoc.body.appendChild(popoutIframe);

        const f = disableIframePointEvents(popoutDoc);

        expect(popoutIframe.style.pointerEvents).toBe('none');
        // Main document's iframe must not have been shielded; the caller
        // asked to shield only the popout.
        expect(main.style.pointerEvents).toBe('');

        f.release();
        expect(popoutIframe.style.pointerEvents).toBe('');
    });

    describe('addStyles', () => {
        function makeTargetDocument() {
            return document.implementation.createHTMLDocument('target');
        }

        function makeStyleSheet(rules: string[], href?: string): CSSStyleSheet {
            return {
                href,
                type: 'text/css',
                cssRules: rules.map((cssText) => ({ cssText })),
            } as unknown as CSSStyleSheet;
        }

        function makeStyleSheetList(sheets: CSSStyleSheet[]): StyleSheetList {
            const list: any = {
                length: sheets.length,
                [Symbol.iterator]: function* () {
                    for (const s of sheets) yield s;
                },
            };
            sheets.forEach((s, i) => (list[i] = s));
            return list as StyleSheetList;
        }

        test('applies nonce to every created <style> element', () => {
            const targetDoc = makeTargetDocument();
            const sheets = makeStyleSheetList([
                makeStyleSheet(['.a { color: red; }', '.b { color: blue; }']),
            ]);

            addStyles(targetDoc, sheets, { nonce: 'abc123' });

            const styles = targetDoc.head.querySelectorAll('style');
            expect(styles).toHaveLength(2);
            expect(styles[0].getAttribute('nonce')).toBe('abc123');
            expect(styles[1].getAttribute('nonce')).toBe('abc123');
            expect(styles[0].textContent).toBe('.a { color: red; }');
            expect(styles[1].textContent).toBe('.b { color: blue; }');
        });

        test('omits nonce attribute when no nonce is supplied', () => {
            const targetDoc = makeTargetDocument();
            const sheets = makeStyleSheetList([
                makeStyleSheet(['.b { color: blue; }']),
            ]);

            addStyles(targetDoc, sheets);

            const style = targetDoc.head.querySelector('style')!;
            expect(style.hasAttribute('nonce')).toBe(false);
        });

        test('appends <link> for external stylesheet hrefs and does not duplicate rules inline', () => {
            const targetDoc = makeTargetDocument();
            const sheets = makeStyleSheetList([
                makeStyleSheet(
                    ['.c { color: green; }'],
                    'https://example.test/main.css'
                ),
            ]);

            addStyles(targetDoc, sheets, { nonce: 'xyz' });

            const link = targetDoc.head.querySelector('link');
            expect(link).not.toBeNull();
            expect(link?.getAttribute('rel')).toBe('stylesheet');
            expect(link?.getAttribute('href')).toBe(
                'https://example.test/main.css'
            );
            // The <link> already loads the sheet in the target document;
            // we must not also inject inline <style> for the same rules.
            expect(targetDoc.head.querySelectorAll('style')).toHaveLength(0);
        });

        test('preserves source order when mixing href-bearing and inline sheets', () => {
            const targetDoc = makeTargetDocument();
            const sheets = makeStyleSheetList([
                makeStyleSheet(['.first { color: red; }']),
                makeStyleSheet([], 'https://cdn.test/middle.css'),
                makeStyleSheet(['.third { color: green; }']),
            ]);

            addStyles(targetDoc, sheets, { nonce: 'n1' });

            const appended = Array.from(targetDoc.head.children).filter(
                (el) => el.tagName === 'STYLE' || el.tagName === 'LINK'
            );
            expect(appended).toHaveLength(3);
            expect(appended[0].tagName).toBe('STYLE');
            expect(appended[0].textContent).toBe('.first { color: red; }');
            expect(appended[1].tagName).toBe('LINK');
            expect((appended[1] as HTMLLinkElement).getAttribute('href')).toBe(
                'https://cdn.test/middle.css'
            );
            expect(appended[2].tagName).toBe('STYLE');
            expect(appended[2].textContent).toBe('.third { color: green; }');
        });

        test('warns and continues when cssRules access throws on an href-less sheet', () => {
            const targetDoc = makeTargetDocument();
            const unreadable: any = {
                type: 'text/css',
                get cssRules(): CSSRuleList {
                    throw new DOMException('SecurityError', 'SecurityError');
                },
            };
            const sheets = makeStyleSheetList([
                unreadable,
                makeStyleSheet(['.after { color: green; }']),
            ]);

            const warn = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => {});

            addStyles(targetDoc, sheets);

            expect(warn).toHaveBeenCalledTimes(1);
            const styles = targetDoc.head.querySelectorAll('style');
            expect(styles).toHaveLength(1);
            expect(styles[0].textContent).toBe('.after { color: green; }');

            warn.mockRestore();
        });

        test('nonce accepts a function that receives the target document', () => {
            const targetDoc = makeTargetDocument();
            const meta = targetDoc.createElement('meta');
            meta.setAttribute('name', 'csp-nonce');
            meta.setAttribute('content', 'from-popout');
            targetDoc.head.appendChild(meta);

            const sheets = makeStyleSheetList([
                makeStyleSheet(['.x { color: red; }']),
            ]);

            const nonceFn = jest.fn(
                (doc: Document) =>
                    doc
                        .querySelector<HTMLMetaElement>(
                            'meta[name="csp-nonce"]'
                        )
                        ?.getAttribute('content') ?? undefined
            );

            addStyles(targetDoc, sheets, { nonce: nonceFn });

            expect(nonceFn).toHaveBeenCalledTimes(1);
            expect(nonceFn).toHaveBeenCalledWith(targetDoc);
            const style = targetDoc.head.querySelector('style')!;
            expect(style.getAttribute('nonce')).toBe('from-popout');
        });
    });
});

describe('Classnames', () => {
    test('applies, trims, and swaps class names against the element', () => {
        const el = document.createElement('div');
        const cn = new Classnames(el);

        cn.setClassNames('a b c');
        expect(el.classList.contains('a')).toBe(true);
        expect(el.classList.contains('b')).toBe(true);
        expect(el.classList.contains('c')).toBe(true);

        // A second call clears the previous set, keeps overlaps, adds new.
        cn.setClassNames('c d');
        expect(el.classList.contains('a')).toBe(false);
        expect(el.classList.contains('b')).toBe(false);
        expect(el.classList.contains('c')).toBe(true);
        expect(el.classList.contains('d')).toBe(true);

        // Extra whitespace / empty tokens are filtered out.
        cn.setClassNames('   x    y   ');
        expect(el.classList.contains('c')).toBe(false);
        expect(el.classList.contains('d')).toBe(false);
        expect([...el.classList].sort()).toEqual(['x', 'y']);
    });
});

describe('isChildEntirelyVisibleWithinParent', () => {
    const parent = document.createElement('div');
    stubRect(parent, { left: 0, top: 0, width: 100, height: 100 });

    test('true when the child sits fully inside the parent box', () => {
        const child = document.createElement('div');
        stubRect(child, { left: 10, top: 10, width: 20, height: 20 });
        expect(isChildEntirelyVisibleWithinParent(child, parent)).toBe(true);
    });

    test.each([
        ['left', { left: -1, top: 10, width: 20, height: 20 }],
        ['right', { left: 90, top: 10, width: 20, height: 20 }],
        ['top', { left: 10, top: -1, width: 20, height: 20 }],
        ['bottom', { left: 10, top: 90, width: 20, height: 20 }],
    ])('false when the child overflows the %s edge', (_side, rect) => {
        const child = document.createElement('div');
        stubRect(child, rect);
        expect(isChildEntirelyVisibleWithinParent(child, parent)).toBe(false);
    });
});

describe('findRelativeZIndexParent', () => {
    test('walks up past auto / empty z-index to the first positioned ancestor', () => {
        const grandparent = document.createElement('div');
        const parent = document.createElement('div');
        const child = document.createElement('div');
        grandparent.appendChild(parent);
        parent.appendChild(child);
        grandparent.style.zIndex = '5';
        parent.style.zIndex = 'auto';

        expect(findRelativeZIndexParent(child)).toBe(grandparent);
    });

    test('returns the element itself when it already sets a z-index', () => {
        const el = document.createElement('div');
        el.style.zIndex = '3';
        expect(findRelativeZIndexParent(el)).toBe(el);
    });

    test('returns null when no ancestor sets a z-index', () => {
        const el = document.createElement('div');
        el.style.zIndex = 'auto';
        expect(findRelativeZIndexParent(el)).toBeNull();
    });
});

describe('prefersReducedMotion', () => {
    const win = document.defaultView as Window & {
        matchMedia?: (q: string) => MediaQueryList;
    };
    const original = win.matchMedia;

    afterEach(() => {
        win.matchMedia = original;
    });

    test('reflects the media query match result', () => {
        win.matchMedia = ((query: string) =>
            ({ matches: true, media: query }) as MediaQueryList) as any;
        expect(prefersReducedMotion(document)).toBe(true);

        win.matchMedia = ((query: string) =>
            ({ matches: false, media: query }) as MediaQueryList) as any;
        expect(prefersReducedMotion(document)).toBe(false);
    });

    test('false when matchMedia is unavailable', () => {
        delete (win as { matchMedia?: unknown }).matchMedia;
        expect(prefersReducedMotion(document)).toBe(false);
    });
});

describe('parseCssTimeMs', () => {
    test.each([
        ['200ms', 200],
        ['0.2s', 200],
        ['1s', 1000],
        ['0', 0],
        ['  150ms  ', 150],
        ['.5s', 500],
    ])('parses %p as %p ms', (value, expected) => {
        expect(parseCssTimeMs(value, 999)).toBe(expected);
    });

    test.each([
        '',
        '   ',
        'abc',
        '10',
        '10px',
        'fast',
    ])('falls back for the unparseable value %p', (value) => {
        expect(parseCssTimeMs(value, 42)).toBe(42);
    });
});

describe('resolveCssDurationMs', () => {
    test('reads a CSS time custom property from computed style', () => {
        const el = document.createElement('div');
        el.style.setProperty('--dv-transition-duration', '0.3s');
        document.body.appendChild(el);
        expect(resolveCssDurationMs(el, '--dv-transition-duration', 200)).toBe(
            300
        );
        el.remove();
    });

    test('falls back when the property is absent', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        expect(resolveCssDurationMs(el, '--dv-transition-duration', 175)).toBe(
            175
        );
        el.remove();
    });
});

describe('resolveOpaqueBackground', () => {
    test('returns the first opaque background walking up the ancestors', () => {
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);
        parent.style.backgroundColor = 'rgb(1, 2, 3)';

        const expected =
            document.defaultView!.getComputedStyle(parent).backgroundColor;
        expect(expected).toBeTruthy();
        // child has no background of its own, so it inherits the parent's.
        expect(resolveOpaqueBackground(child)).toBe(expected);

        // an opaque background on the element itself wins.
        child.style.backgroundColor = 'rgb(9, 9, 9)';
        expect(resolveOpaqueBackground(child)).toBe(
            document.defaultView!.getComputedStyle(child).backgroundColor
        );

        document.body.removeChild(parent);
    });

    test('skips fully-transparent colours and returns "" when none is opaque', () => {
        const el = document.createElement('div');
        el.style.backgroundColor = 'rgba(255, 255, 255, 0)';
        expect(resolveOpaqueBackground(el)).toBe('');
    });
});

describe('onDidWindowMoveEnd', () => {
    let rafCallbacks: Map<number, FrameRequestCallback>;
    let nextHandle: number;
    let cancelled: number[];
    let origRaf: typeof requestAnimationFrame;
    let origCancel: typeof cancelAnimationFrame;

    beforeEach(() => {
        rafCallbacks = new Map();
        nextHandle = 1;
        cancelled = [];
        origRaf = global.requestAnimationFrame;
        origCancel = global.cancelAnimationFrame;
        global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
            const handle = nextHandle++;
            rafCallbacks.set(handle, cb);
            return handle;
        }) as typeof requestAnimationFrame;
        global.cancelAnimationFrame = ((handle: number) => {
            cancelled.push(handle);
            rafCallbacks.delete(handle);
        }) as typeof cancelAnimationFrame;
    });

    afterEach(() => {
        global.requestAnimationFrame = origRaf;
        global.cancelAnimationFrame = origCancel;
    });

    function makeWindow(): Window {
        return { screenX: 0, screenY: 0, closed: false } as unknown as Window;
    }

    test('polls each frame while alive', () => {
        const emitter = onDidWindowMoveEnd(makeWindow());

        // the synchronous first tick scheduled one frame
        expect(rafCallbacks.size).toBe(1);

        // running the frame reschedules the next one (the poll keeps going)
        const [[, cb]] = [...rafCallbacks.entries()];
        rafCallbacks.clear();
        cb(0);
        expect(rafCallbacks.size).toBe(1);

        emitter.dispose();
    });

    test('disposing the emitter cancels the frame loop and it does not reschedule', () => {
        const emitter = onDidWindowMoveEnd(makeWindow());

        // capture the pending frame callback before disposing
        const [[, pending]] = [...rafCallbacks.entries()];

        emitter.dispose();
        expect(cancelled.length).toBeGreaterThan(0);

        // a straggler frame that still fires after dispose must be a no-op
        rafCallbacks.clear();
        pending(0);
        expect(rafCallbacks.size).toBe(0);
    });
});
