import { fromPartial } from '@total-typescript/shoehorn';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { AllModules } from '../../dockview/allModules';
import { _resetMissingModuleWarnings } from '../../dockview/modules';
import { OverlayRenderContainer } from '../../overlay/overlayRenderContainer';
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

describe('popout fullscreen (Phase 3)', () => {
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

    function createComponent(extra: Record<string, unknown> = {}) {
        const container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            ...extra,
        } as never);
        dockview.layout(1000, 800);
        return dockview;
    }

    function withModule(adapter?: Partial<DockviewScreenAdapter>) {
        return createComponent({
            modules: [...AllModules, ScreenManagerModule],
            screenAdapter: { getScreens: () => adapterScreens(), ...adapter },
        });
    }

    beforeEach(() => {
        _resetMissingModuleWarnings();
        stubOpen();
    });

    afterEach(() => {
        window.open = originalOpen;
        delete (window as { getScreenDetails?: unknown }).getScreenDetails;
    });

    describe('fullscreen option', () => {
        test('live snapshot: popup,fullscreen features + fill of the current screen', async () => {
            const dockview = withModule();
            await flush(); // init() prime

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel, { fullscreen: true });

            const features = parseFeatures(openSpy.mock.calls[0][2]);
            expect(features).toMatchObject({
                popup: '1',
                fullscreen: '1',
                // fill of native-1's work area (the current screen)
                left: '0',
                top: '40',
                width: '1920',
                height: '1040',
            });
            dockview.dispose();
        });

        test('composes with a screen target: fill of that screen', async () => {
            const dockview = withModule();
            await flush();

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel, {
                fullscreen: true,
                screen: 1,
            });

            expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                popup: '1',
                fullscreen: '1',
                left: '1920',
                top: '0',
                width: '1600',
                height: '860',
            });
            dockview.dispose();
        });

        test('an explicit placement wins over the fill fallback', async () => {
            const dockview = withModule();
            await flush();

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel, {
                fullscreen: true,
                screen: 1,
                placement: { type: 'center', width: 500, height: 400 },
            });

            expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                popup: '1',
                fullscreen: '1',
                left: '2470',
                top: '230',
                width: '500',
                height: '400',
            });
            dockview.dispose();
        });

        test('caller extraWindowFeatures spread last, overriding the emitted features', async () => {
            const dockview = withModule();
            await flush();

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel, {
                fullscreen: true,
                extraWindowFeatures: { fullscreen: false },
            });

            expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                popup: '1',
                fullscreen: '0',
            });
            dockview.dispose();
        });

        test('no Window Management API: fill of the synthetic fallback screen', async () => {
            // The documented graceful fallback for e.g. Firefox: module
            // present, no web API, no adapter. The fallback screen mirrors
            // window.screen, so give jsdom's zero-sized one real geometry.
            const originalScreen = Object.getOwnPropertyDescriptor(
                window,
                'screen'
            );
            Object.defineProperty(window, 'screen', {
                configurable: true,
                value: {
                    width: 1920,
                    height: 1080,
                    availWidth: 1900,
                    availHeight: 1000,
                },
            });
            try {
                const dockview = createComponent({
                    modules: [...AllModules, ScreenManagerModule],
                });
                const panel = dockview.addPanel({
                    id: 'p1',
                    component: 'default',
                });
                await dockview.addPopoutGroup(panel, { fullscreen: true });

                expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                    popup: '1',
                    fullscreen: '1',
                    left: '0',
                    top: '0',
                    width: '1900',
                    height: '1000',
                });
                dockview.dispose();
            } finally {
                if (originalScreen) {
                    Object.defineProperty(window, 'screen', originalScreen);
                }
            }
        });

        test('missing module: deduped diagnostic, no fullscreen features', async () => {
            const consoleError = jest
                .spyOn(console, 'error')
                .mockImplementation(() => undefined);
            const dockview = createComponent();

            await dockview.addPopoutGroup(
                dockview.addPanel({ id: 'p1', component: 'default' }),
                { fullscreen: true }
            );
            await dockview.addPopoutGroup(
                dockview.addPanel({ id: 'p2', component: 'default' }),
                { fullscreen: true }
            );

            const diagnostics = consoleError.mock.calls.filter((call) =>
                String(call[0]).includes('addPopoutGroup: fullscreen')
            );
            expect(diagnostics).toHaveLength(1);
            expect(openSpy).toHaveBeenCalledTimes(2);
            expect(parseFeatures(openSpy.mock.calls[0][2])).not.toHaveProperty(
                'fullscreen'
            );
            dockview.dispose();
            consoleError.mockRestore();
        });

        test('prompt path: opens at fallback, then fills the target once screens resolve', async () => {
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
            await dockview.addPopoutGroup(panel, {
                fullscreen: true,
                screen: 1,
            });
            await flush();
            await flush();

            // rehomed to fill native-2's work area
            expect(lastPopout.calls.moveTo).toEqual([[1920, 0]]);
            expect(lastPopout.calls.resizeTo).toEqual([[1600, 860]]);
            dockview.dispose();
        });
    });

    describe('group api', () => {
        test('setFullscreen routes popout windows through the adapter; grid groups refuse', async () => {
            const setFullscreen = jest.fn().mockResolvedValue(true);
            const dockview = withModule({ setFullscreen });
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
                popoutPanel.group.api.setFullscreen(true)
            ).resolves.toBe(true);
            expect(setFullscreen).toHaveBeenCalledWith(lastPopout.win, true);

            await expect(gridPanel.group.api.setFullscreen(true)).resolves.toBe(
                false
            );
            expect(setFullscreen).toHaveBeenCalledTimes(1);
            dockview.dispose();
        });

        test('setFullscreen without the module logs and resolves false', async () => {
            const consoleError = jest
                .spyOn(console, 'error')
                .mockImplementation(() => undefined);
            const dockview = createComponent();
            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel);

            await expect(panel.group.api.setFullscreen(true)).resolves.toBe(
                false
            );
            expect(
                consoleError.mock.calls.some((call) =>
                    String(call[0]).includes('api.setFullscreen')
                )
            ).toBe(true);
            dockview.dispose();
            consoleError.mockRestore();
        });

        test('isFullscreen reads DOM fullscreen state; false outside popouts', async () => {
            const dockview = withModule();
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

            expect(gridPanel.group.api.isFullscreen()).toBe(false);
            // jsdom: document.fullscreenElement is null
            expect(popoutPanel.group.api.isFullscreen()).toBe(false);

            // simulate the popout document being DOM-fullscreen
            Object.defineProperty(document, 'fullscreenElement', {
                configurable: true,
                get: () => document.documentElement,
            });
            expect(popoutPanel.group.api.isFullscreen()).toBe(true);
            expect(gridPanel.group.api.isFullscreen()).toBe(false);

            delete (document as { fullscreenElement?: unknown })
                .fullscreenElement;
            dockview.dispose();
        });
    });

    describe('fullscreenchange relayout hook', () => {
        test('a fullscreenchange in the popout realm repositions overlays; unhooked on close', async () => {
            const updateAllPositions = jest.spyOn(
                OverlayRenderContainer.prototype,
                'updateAllPositions'
            );
            const dockview = withModule();
            await flush();

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel);

            updateAllPositions.mockClear();
            document.dispatchEvent(new Event('fullscreenchange'));
            expect(updateAllPositions).toHaveBeenCalled();

            dockview.dispose();
            updateAllPositions.mockClear();
            document.dispatchEvent(new Event('fullscreenchange'));
            expect(updateAllPositions).not.toHaveBeenCalled();
            updateAllPositions.mockRestore();
        });
    });
});
