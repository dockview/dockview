import { fromPartial } from '@total-typescript/shoehorn';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { AllModules } from '../../dockview/allModules';
import { _resetMissingModuleWarnings } from '../../dockview/modules';
import {
    DockviewScreen,
    DockviewScreenAdapter,
    ScreenManagerModule,
} from '../../dockview/screenManager';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        // noop
    }
    layout(): void {
        // noop
    }
    dispose(): void {
        // noop
    }
}

/** Popout mock with stable geometry and moveTo/resizeTo capture. */
function placementMockWindow(init: { screenX?: number; screenY?: number } = {}) {
    const listeners: Record<string, (() => void)[]> = {};
    const calls = { moveTo: [] as number[][], resizeTo: [] as number[][] };
    const win = fromPartial<Window>({
        addEventListener: (type: string, listener: () => void) => {
            (listeners[type] ??= []).push(listener);
            if (type === 'load') {
                listener();
            }
        },
        removeEventListener: () => undefined,
        document: document,
        closed: false,
        close: () => {
            listeners['beforeunload']?.forEach((f) => f());
        },
        moveTo: (x: number, y: number) => {
            calls.moveTo.push([x, y]);
        },
        resizeTo: (w: number, h: number) => {
            calls.resizeTo.push([w, h]);
        },
        screenX: init.screenX ?? 0,
        screenY: init.screenY ?? 0,
        innerWidth: 500,
        innerHeight: 400,
    });
    return { win, calls };
}

const SCREEN_1: DockviewScreen = {
    id: 'native-1',
    label: 'Internal',
    isPrimary: true,
    isInternal: true,
    isCurrent: true,
    bounds: { left: 0, top: 0, width: 1920, height: 1080 },
    workArea: { left: 0, top: 40, width: 1920, height: 1040 },
    devicePixelRatio: 1,
};

const SCREEN_2: DockviewScreen = {
    id: 'native-2',
    label: 'DELL',
    isPrimary: false,
    isInternal: false,
    isCurrent: false,
    bounds: { left: 1920, top: 0, width: 1600, height: 1080 },
    workArea: { left: 1920, top: 0, width: 1600, height: 860 },
    devicePixelRatio: 1,
};

/** An adapter whose screen list can be re-pushed later (hotplug simulation). */
function pushableAdapter(initial: DockviewScreen[]) {
    let listener: ((screens: DockviewScreen[]) => void) | undefined;
    const adapter: DockviewScreenAdapter = {
        getScreens: () => initial,
        subscribe: (l) => {
            listener = l;
            return () => {
                listener = undefined;
            };
        },
    };
    return {
        adapter,
        push: (screens: DockviewScreen[]) => listener?.(screens),
        get subscribed() {
            return listener !== undefined;
        },
    };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('popout topology resilience (Phase 4)', () => {
    const originalOpen = window.open;
    let openSpy: jest.Mock;
    let lastPopout: ReturnType<typeof placementMockWindow>;

    function stubOpen(init: { screenX?: number; screenY?: number } = {}) {
        openSpy = jest.fn(() => {
            lastPopout = placementMockWindow(init);
            return lastPopout.win;
        });
        window.open = openSpy as typeof window.open;
    }

    function createComponent(adapter: DockviewScreenAdapter) {
        const container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            modules: [...AllModules, ScreenManagerModule],
            screenAdapter: adapter,
        } as never);
        dockview.layout(1000, 800);
        return dockview;
    }

    /** A component with one popout open on SCREEN_2 (centre 2250,300). */
    async function withPopoutOnScreen2(
        push: ReturnType<typeof pushableAdapter>
    ) {
        const dockview = createComponent(push.adapter);
        await flush(); // init() prime
        const panel = dockview.addPanel({ id: 'p1', component: 'default' });
        await dockview.addPopoutGroup(panel);
        return dockview;
    }

    beforeEach(() => {
        _resetMissingModuleWarnings();
        stubOpen({ screenX: 2000, screenY: 100 });
    });

    afterEach(() => {
        window.open = originalOpen;
        delete (document as { fullscreenElement?: unknown }).fullscreenElement;
    });

    test('screen removed: the popout is re-placed onto the current screen at its size', async () => {
        const source = pushableAdapter([SCREEN_1, SCREEN_2]);
        const dockview = await withPopoutOnScreen2(source);

        source.push([SCREEN_1]);

        // centred in native-1's work area at the window's 500x400
        expect(lastPopout.calls.moveTo).toEqual([[710, 360]]);
        expect(lastPopout.calls.resizeTo).toEqual([[500, 400]]);
        dockview.dispose();
    });

    test('screen resized: the popout is clamped into the new work area', async () => {
        const source = pushableAdapter([SCREEN_1, SCREEN_2]);
        const dockview = await withPopoutOnScreen2(source);

        // native-2's usable height collapses under the window (100+400 > 300)
        source.push([
            SCREEN_1,
            {
                ...SCREEN_2,
                workArea: { left: 1920, top: 0, width: 1600, height: 300 },
            },
        ]);

        expect(lastPopout.calls.moveTo).toEqual([[2000, 0]]);
        expect(lastPopout.calls.resizeTo).toEqual([[500, 300]]);
        dockview.dispose();
    });

    test('unrelated change (screen added elsewhere): the popout is not touched', async () => {
        const source = pushableAdapter([SCREEN_1, SCREEN_2]);
        const dockview = await withPopoutOnScreen2(source);

        source.push([
            SCREEN_1,
            SCREEN_2,
            {
                ...SCREEN_1,
                id: 'native-3',
                isPrimary: false,
                isCurrent: false,
                bounds: { left: 3520, top: 0, width: 1920, height: 1080 },
                workArea: { left: 3520, top: 40, width: 1920, height: 1040 },
            },
        ]);

        expect(lastPopout.calls.moveTo).toHaveLength(0);
        expect(lastPopout.calls.resizeTo).toHaveLength(0);
        dockview.dispose();
    });

    test('already within the resized work area: no redundant move', async () => {
        const source = pushableAdapter([SCREEN_1, SCREEN_2]);
        const dockview = await withPopoutOnScreen2(source);

        // shrink, but the window (2000,100 500x400) still fits
        source.push([
            SCREEN_1,
            {
                ...SCREEN_2,
                workArea: { left: 1920, top: 0, width: 1600, height: 600 },
            },
        ]);

        expect(lastPopout.calls.moveTo).toHaveLength(0);
        expect(lastPopout.calls.resizeTo).toHaveLength(0);
        dockview.dispose();
    });

    test('a fullscreen popout is left alone', async () => {
        const source = pushableAdapter([SCREEN_1, SCREEN_2]);
        const dockview = await withPopoutOnScreen2(source);

        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            get: () => document.documentElement,
        });
        source.push([SCREEN_1]);

        expect(lastPopout.calls.moveTo).toHaveLength(0);
        expect(lastPopout.calls.resizeTo).toHaveLength(0);
        dockview.dispose();
    });

    test('adapter pushes after dispose are inert', async () => {
        const source = pushableAdapter([SCREEN_1, SCREEN_2]);
        const dockview = await withPopoutOnScreen2(source);

        dockview.dispose();
        expect(source.subscribed).toBe(false);
        source.push([SCREEN_1]); // no listener; must not throw
        expect(lastPopout.calls.moveTo).toHaveLength(0);
    });
});
