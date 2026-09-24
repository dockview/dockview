import { Resizable } from '../resizable';

class TestResizable extends Resizable {
    public readonly layoutCalls: Array<{ width: number; height: number }> = [];

    layout(width: number, height: number): void {
        this.layoutCalls.push({ width, height });
    }

    // `layoutFromElement` is protected: concrete components call it at the end
    // of their own constructor.
    public seedFromElement(): void {
        this.layoutFromElement();
    }
}

/** jsdom computes no layout, so the measured size has to be supplied. */
function setSize(el: HTMLElement, width: number, height: number): void {
    Object.defineProperty(el, 'clientWidth', {
        configurable: true,
        get: () => width,
    });
    Object.defineProperty(el, 'clientHeight', {
        configurable: true,
        get: () => height,
    });
}

describe('Resizable', () => {
    let observerCallbacks: Array<(entries: any[]) => void>;
    let rAFCallbacks: FrameRequestCallback[];
    let originalResizeObserver: typeof window.ResizeObserver;

    beforeEach(() => {
        observerCallbacks = [];
        rAFCallbacks = [];

        originalResizeObserver = window.ResizeObserver;
        (window as any).ResizeObserver = class {
            constructor(cb: (entries: any[]) => void) {
                observerCallbacks.push(cb);
            }
            observe(): void {
                /* noop */
            }
            unobserve(): void {
                /* noop */
            }
            disconnect(): void {
                /* noop */
            }
        };

        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rAFCallbacks.push(cb);
            return rAFCallbacks.length;
        });
    });

    afterEach(() => {
        window.ResizeObserver = originalResizeObserver;
        jest.restoreAllMocks();
    });

    function fireResize(width: number, height: number): void {
        for (const cb of observerCallbacks) {
            cb([{ contentRect: { width, height } }]);
        }
        const pending = [...rAFCallbacks];
        rAFCallbacks = [];
        for (const cb of pending) {
            cb(performance.now());
        }
    }

    function createElement(): HTMLElement {
        const el = document.createElement('div');
        document.body.appendChild(el);
        // jsdom does not compute offsetParent; force it truthy so the
        // visibility guard in Resizable doesn't short-circuit.
        Object.defineProperty(el, 'offsetParent', {
            configurable: true,
            get: () => document.body,
        });
        return el;
    }

    test('fires layout for the initial size', () => {
        const r = new TestResizable(createElement());
        fireResize(100, 200);
        expect(r.layoutCalls).toEqual([{ width: 100, height: 200 }]);
    });

    test('rounds fractional contentRect dimensions', () => {
        const r = new TestResizable(createElement());
        fireResize(100.4, 200.6);
        expect(r.layoutCalls).toEqual([{ width: 100, height: 201 }]);
    });

    test('skips layout when rounded size is unchanged', () => {
        // Reproduces issue #1219: sub-pixel jitter from fractional
        // devicePixelRatio (multi-monitor setups) produces contentRect
        // values that round to the same integer. Without the early-return
        // these would re-fire layout in a feedback loop.
        const r = new TestResizable(createElement());

        fireResize(100.1, 200.1);
        fireResize(100.4, 200.4);
        fireResize(99.9, 199.9);
        fireResize(100, 200);

        expect(r.layoutCalls).toEqual([{ width: 100, height: 200 }]);
    });

    test('fires layout again when rounded size changes', () => {
        const r = new TestResizable(createElement());

        fireResize(100, 200);
        fireResize(100.4, 200.4); // still rounds to 100, 200
        fireResize(101, 200); // width changes
        fireResize(101, 205); // height changes

        expect(r.layoutCalls).toEqual([
            { width: 100, height: 200 },
            { width: 101, height: 200 },
            { width: 101, height: 205 },
        ]);
    });

    describe('layoutFromElement', () => {
        test('lays out from the size the element currently reports', () => {
            const el = createElement();
            setSize(el, 800, 600);

            const r = new TestResizable(el);
            r.seedFromElement();

            expect(r.layoutCalls).toEqual([{ width: 800, height: 600 }]);
        });

        test('rounds fractional dimensions, as the observer does', () => {
            const el = createElement();
            setSize(el, 800.4, 600.6);

            const r = new TestResizable(el);
            r.seedFromElement();

            expect(r.layoutCalls).toEqual([{ width: 800, height: 601 }]);
        });

        test('leaves the observer free to deliver its own first layout', () => {
            const el = createElement();
            setSize(el, 800, 600);

            const r = new TestResizable(el);
            r.seedFromElement();
            fireResize(800, 600);

            // the seed does not record the size, so a listener attached after
            // construction still sees the observer's first layout
            expect(r.layoutCalls).toEqual([
                { width: 800, height: 600 },
                { width: 800, height: 600 },
            ]);
        });

        test('skips when resizing is disabled', () => {
            const el = createElement();
            setSize(el, 800, 600);

            const r = new TestResizable(el, true);
            r.seedFromElement();

            expect(r.layoutCalls).toEqual([]);
        });

        test('skips when the element is hidden', () => {
            const el = document.createElement('div');
            document.body.appendChild(el);
            Object.defineProperty(el, 'offsetParent', {
                configurable: true,
                get: () => null,
            });
            setSize(el, 800, 600);

            const r = new TestResizable(el);
            r.seedFromElement();

            expect(r.layoutCalls).toEqual([]);
        });

        test('skips when the element is not in the document', () => {
            const el = document.createElement('div');
            Object.defineProperty(el, 'offsetParent', {
                configurable: true,
                get: () => document.body,
            });
            setSize(el, 800, 600);

            const r = new TestResizable(el);
            r.seedFromElement();

            expect(r.layoutCalls).toEqual([]);
        });

        test.each([
            ['zero width', 0, 600],
            ['zero height', 800, 0],
        ])('skips a %s element', (_label, width, height) => {
            const el = createElement();
            setSize(el, width, height);

            const r = new TestResizable(el);
            r.seedFromElement();

            expect(r.layoutCalls).toEqual([]);
        });
    });

    test('does not fire layout when element is hidden', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        Object.defineProperty(el, 'offsetParent', {
            configurable: true,
            get: () => null,
        });

        const r = new TestResizable(el);
        fireResize(100, 200);
        expect(r.layoutCalls).toEqual([]);
    });

    test('does not fire layout when disposed before rAF flushes', () => {
        const r = new TestResizable(createElement());

        // Schedule a resize but dispose before the rAF runs.
        for (const cb of observerCallbacks) {
            cb([{ contentRect: { width: 100, height: 200 } }]);
        }
        r.dispose();

        const pending = [...rAFCallbacks];
        rAFCallbacks = [];
        for (const cb of pending) {
            cb(performance.now());
        }

        expect(r.layoutCalls).toEqual([]);
    });

    test('does not fire layout when disableResizing is true', () => {
        const r = new TestResizable(createElement(), true);
        fireResize(100, 200);
        expect(r.layoutCalls).toEqual([]);
    });
});
