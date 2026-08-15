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

/**
 * Popout mock with STABLE geometry (unlike the shared setupMockWindow, whose
 * inner sizes increment per read) plus moveTo/resizeTo capture, for
 * screen-placement assertions.
 */
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

function adapterScreens(): DockviewScreen[] {
    return [
        {
            id: 'native-1',
            label: 'Internal',
            isPrimary: true,
            isInternal: true,
            isCurrent: true,
            bounds: { left: 0, top: 0, width: 1920, height: 1080 },
            workArea: { left: 0, top: 40, width: 1920, height: 1040 },
            devicePixelRatio: 1,
        },
        {
            id: 'native-2',
            label: 'DELL',
            isPrimary: false,
            isInternal: false,
            isCurrent: false,
            bounds: { left: 1920, top: 0, width: 1600, height: 1080 },
            workArea: { left: 1920, top: 0, width: 1600, height: 860 },
            devicePixelRatio: 1,
        },
    ];
}

function parseFeatures(features: string): Record<string, string> {
    return Object.fromEntries(
        features.split(',').map((entry) => entry.split('=') as [string, string])
    );
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('popout screen placement (Phase 2)', () => {
    const originalOpen = window.open;
    let openSpy: jest.Mock;
    let lastPopout: ReturnType<typeof placementMockWindow>;
    let container: HTMLElement;

    function stubOpen(init: { screenX?: number; screenY?: number } = {}) {
        openSpy = jest.fn(() => {
            lastPopout = placementMockWindow(init);
            return lastPopout.win;
        });
        window.open = openSpy as typeof window.open;
    }

    function createComponent(extra: Record<string, unknown> = {}) {
        container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            ...extra,
        } as never);
        dockview.layout(1000, 800);
        return dockview;
    }

    beforeEach(() => {
        _resetMissingModuleWarnings();
        stubOpen();
    });

    afterEach(() => {
        window.open = originalOpen;
        delete (window as { getScreenDetails?: unknown }).getScreenDetails;
    });

    describe('screen option resolution', () => {
        test('live snapshot: window.open features target the screen work area', async () => {
            const adapter: DockviewScreenAdapter = {
                getScreens: () => adapterScreens(),
            };
            const dockview = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: adapter,
            });
            await flush(); // init() prime

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel, { screen: 1 });

            const features = parseFeatures(openSpy.mock.calls[0][2]);
            // jsdom rects are 0x0, so the default center placement falls back
            // to half the work area: 800x430 centred in 1920..3520 x 0..860.
            expect(features).toMatchObject({
                left: '2320',
                top: '215',
                width: '800',
                height: '430',
            });
            dockview.dispose();
        });

        test('explicit placement fill covers the target work area', async () => {
            const dockview = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: { getScreens: () => adapterScreens() },
            });
            await flush();

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel, {
                screen: 'primary',
                placement: { type: 'fill' },
            });

            expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                left: '0',
                top: '40',
                width: '1920',
                height: '1040',
            });
            dockview.dispose();
        });

        test('missing module: deduped diagnostic, normal placement', async () => {
            const consoleError = jest
                .spyOn(console, 'error')
                .mockImplementation(() => undefined);
            const dockview = createComponent();

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel, { screen: 1 });
            await dockview.addPopoutGroup(
                dockview.addPanel({ id: 'p2', component: 'default' }),
                { screen: 1 }
            );

            const screenErrors = consoleError.mock.calls.filter((call) =>
                String(call[0]).includes('ScreenManagement')
            );
            expect(screenErrors).toHaveLength(1);
            expect(String(screenErrors[0][0])).toContain(
                'addPopoutGroup: screen'
            );
            // both popouts still opened
            expect(openSpy).toHaveBeenCalledTimes(2);
            dockview.dispose();
            consoleError.mockRestore();
        });

        test('unresolvable target on a live snapshot warns and falls back', async () => {
            const consoleWarn = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => undefined);
            const dockview = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: { getScreens: () => adapterScreens() },
            });
            await flush();

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel, { screen: 7 });

            expect(
                consoleWarn.mock.calls.some((call) =>
                    String(call[0]).includes('screen target')
                )
            ).toBe(true);
            expect(openSpy).toHaveBeenCalledTimes(1);
            dockview.dispose();
            consoleWarn.mockRestore();
        });
    });

    describe('prompt-path rehoming', () => {
        test('opens at fallback, then moves once the screen list resolves', async () => {
            // Window Management API present on the (jsdom) main window, but no
            // permission pre-granted and no adapter: the snapshot is not live
            // at open time.
            const details = {
                screens: adapterScreens().map((screen) => ({
                    left: screen.bounds.left,
                    top: screen.bounds.top,
                    width: screen.bounds.width,
                    height: screen.bounds.height,
                    availLeft: screen.workArea.left,
                    availTop: screen.workArea.top,
                    availWidth: screen.workArea.width,
                    availHeight: screen.workArea.height,
                    isPrimary: screen.isPrimary,
                    isInternal: screen.isInternal,
                    label: screen.label,
                    devicePixelRatio: 1,
                })),
                get currentScreen() {
                    return this.screens[0];
                },
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            };
            (window as { getScreenDetails?: unknown }).getScreenDetails =
                async () => details;

            const dockview = createComponent({
                modules: [...AllModules, ScreenManagerModule],
            });

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel, { screen: 1 });
            await flush();
            await flush();

            // rehomed onto screen 2: centred at the mock's 500x400 size
            expect(lastPopout.calls.moveTo).toEqual([[2470, 230]]);
            expect(lastPopout.calls.resizeTo).toEqual([[500, 400]]);
            dockview.dispose();
        });
    });

    describe('group api', () => {
        test('getScreen resolves popout and grid groups geometrically', async () => {
            stubOpen({ screenX: 2000, screenY: 100 });
            const dockview = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: { getScreens: () => adapterScreens() },
            });
            await flush();

            const gridPanel = dockview.addPanel({
                id: 'p1',
                component: 'default',
            });
            const popoutPanel = dockview.addPanel({
                id: 'p2',
                component: 'default',
            });
            await dockview.addPopoutGroup(popoutPanel);

            // popout window centre: 2000+250, 100+200 → screen 'native-2'
            expect(popoutPanel.group.api.getScreen()?.id).toBe('native-2');
            // grid group resolves via the main (jsdom) window at ~0,0
            expect(gridPanel.group.api.getScreen()?.id).toBe('native-1');
            dockview.dispose();
        });

        test('moveToScreen moves popout windows and refuses grid groups', async () => {
            const dockview = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: { getScreens: () => adapterScreens() },
            });
            await flush();

            const gridPanel = dockview.addPanel({
                id: 'p1',
                component: 'default',
            });
            const popoutPanel = dockview.addPanel({
                id: 'p2',
                component: 'default',
            });
            await dockview.addPopoutGroup(popoutPanel);

            await expect(
                popoutPanel.group.api.moveToScreen(1)
            ).resolves.toBe(true);
            expect(lastPopout.calls.moveTo).toEqual([[2470, 230]]);
            expect(lastPopout.calls.resizeTo).toEqual([[500, 400]]);

            await expect(gridPanel.group.api.moveToScreen(1)).resolves.toBe(
                false
            );
            dockview.dispose();
        });

        test('moveToScreen without the module logs and resolves false', async () => {
            const consoleError = jest
                .spyOn(console, 'error')
                .mockImplementation(() => undefined);
            const dockview = createComponent();
            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel);

            await expect(panel.group.api.moveToScreen(0)).resolves.toBe(false);
            expect(
                consoleError.mock.calls.some((call) =>
                    String(call[0]).includes('api.moveToScreen')
                )
            ).toBe(true);
            dockview.dispose();
            consoleError.mockRestore();
        });
    });

    describe('screen enrichment', () => {
        test('getPopouts carries the resolved screen', async () => {
            stubOpen({ screenX: 2000, screenY: 100 });
            const dockview = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: { getScreens: () => adapterScreens() },
            });
            await flush();

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel);

            expect(dockview.getPopouts()[0].screen?.id).toBe('native-2');
            dockview.dispose();
        });

        test('getPopouts screen is undefined without a live snapshot', async () => {
            const dockview = createComponent();
            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel);
            expect(dockview.getPopouts()[0].screen).toBeUndefined();
            dockview.dispose();
        });
    });

    describe('extraWindowFeatures', () => {
        test('appends entries to the features string; booleans as 1/0', async () => {
            const dockview = createComponent();
            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel, {
                extraWindowFeatures: {
                    dockviewPopout: true,
                    frame: false,
                    tag: 'main',
                },
            });

            const features = parseFeatures(openSpy.mock.calls[0][2]);
            expect(features).toMatchObject({
                dockviewPopout: '1',
                frame: '0',
                tag: 'main',
            });
            dockview.dispose();
        });
    });
});
