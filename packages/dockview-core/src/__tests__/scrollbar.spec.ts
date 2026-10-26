import { Scrollbar } from '../scrollbar';

describe('Scrollbar', () => {
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

    function flushFrames(): void {
        const entries = [...rafCallbacks.values()];
        rafCallbacks.clear();
        for (const cb of entries) {
            cb(0);
        }
    }

    function create(): { scrollbar: Scrollbar; bar: HTMLElement } {
        const scrollable = document.createElement('div');
        const scrollbar = new Scrollbar(scrollable);
        const bar =
            scrollbar.element.querySelector<HTMLElement>('.dv-scrollbar')!;
        return { scrollbar, bar };
    }

    test('a burst of wheel events restyles once, on the next frame', () => {
        const { scrollbar, bar } = create();

        // several wheel events within the same frame
        for (let i = 0; i < 5; i++) {
            scrollbar.element.dispatchEvent(
                new WheelEvent('wheel', { deltaY: 10 })
            );
        }

        // all coalesced into a single scheduled frame; nothing written yet
        expect(rafCallbacks.size).toBe(1);
        expect(bar.style.width).toBe('');

        // the frame runs the (single) restyle. jsdom reports 0 sizes, so the
        // no-scrollbar branch sets an explicit 0px width — proof it ran.
        flushFrames();
        expect(bar.style.width).toBe('0px');

        scrollbar.dispose();
    });

    test('dispose cancels a pending restyle frame', () => {
        const { scrollbar } = create();

        scrollbar.element.dispatchEvent(
            new WheelEvent('wheel', { deltaY: 10 })
        );
        expect(rafCallbacks.size).toBe(1);

        scrollbar.dispose();

        expect(cancelled.length).toBeGreaterThan(0);
        expect(rafCallbacks.size).toBe(0);
    });
});
