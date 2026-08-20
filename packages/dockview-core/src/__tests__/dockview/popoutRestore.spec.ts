import { fromPartial } from '@total-typescript/shoehorn';
import {
    DockviewComponent,
    SerializedPopoutGroup,
} from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { AllModules } from '../../dockview/allModules';
import { _resetMissingModuleWarnings } from '../../dockview/modules';
import { Orientation } from '../../splitview/splitview';
import {
    DockviewScreen,
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

function parseFeatures(features: string): Record<string, string> {
    return Object.fromEntries(
        features.split(',').map((entry) => entry.split('=') as [string, string])
    );
}

function layoutWithPopout(popout: Partial<SerializedPopoutGroup>) {
    return {
        activeGroup: 'group-1',
        grid: {
            root: {
                type: 'branch' as const,
                data: [
                    {
                        type: 'leaf' as const,
                        data: {
                            views: ['panel1'],
                            id: 'group-1',
                            activeView: 'panel1',
                        },
                        size: 1000,
                    },
                ],
                size: 1000,
            },
            height: 1000,
            width: 1000,
            orientation: Orientation.VERTICAL,
        },
        popoutGroups: [
            {
                data: {
                    views: ['panel2'],
                    id: 'group-2',
                    activeView: 'panel2',
                },
                position: null,
                ...popout,
            },
        ],
        panels: {
            panel1: {
                id: 'panel1',
                contentComponent: 'default',
                title: 'panel1',
            },
            panel2: {
                id: 'panel2',
                contentComponent: 'default',
                title: 'panel2',
            },
        },
    };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('screen-aware popout serialization & restore (Phase 5)', () => {
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

    function withAdapter() {
        return createComponent({
            modules: [...AllModules, ScreenManagerModule],
            screenAdapter: {
                getScreens: () => [SCREEN_1, SCREEN_2],
                stableIds: true,
            },
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

    describe('serialization', () => {
        test('adapter source (stable ids): screenId is written', async () => {
            stubOpen({ screenX: 2000, screenY: 100 });
            const dockview = withAdapter();
            await flush(); // init() prime

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel);

            const popouts = dockview.toJSON().popoutGroups!;
            expect(popouts[0].screenId).toBe('native-2');
            dockview.dispose();
        });

        test('adapter without the stableIds opt-in: no screenId is written', async () => {
            stubOpen({ screenX: 2000, screenY: 100 });
            const dockview = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: { getScreens: () => [SCREEN_1, SCREEN_2] },
            });
            await flush();

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel);

            expect('screenId' in dockview.toJSON().popoutGroups![0]).toBe(
                false
            );
            dockview.dispose();
        });

        test('no module: no screenId key — byte-identical to before', async () => {
            const dockview = createComponent();
            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel);

            expect('screenId' in dockview.toJSON().popoutGroups![0]).toBe(
                false
            );
            dockview.dispose();
        });

        test('web source: ids are session-scoped, so no screenId is written', async () => {
            stubOpen({ screenX: 2000, screenY: 100 });
            (window as { getScreenDetails?: unknown }).getScreenDetails =
                async () => ({
                    screens: [
                        {
                            left: 0,
                            top: 0,
                            width: 1920,
                            height: 1080,
                            availLeft: 0,
                            availTop: 40,
                            availWidth: 1920,
                            availHeight: 1040,
                            isPrimary: true,
                            isInternal: true,
                            label: 'Internal',
                            devicePixelRatio: 1,
                        },
                    ],
                    get currentScreen() {
                        return this.screens[0];
                    },
                    addEventListener: () => undefined,
                    removeEventListener: () => undefined,
                });
            const dockview = createComponent({
                modules: [...AllModules, ScreenManagerModule],
            });
            await dockview.getScreens(); // resolve the web snapshot

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel);

            expect('screenId' in dockview.toJSON().popoutGroups![0]).toBe(
                false
            );
            dockview.dispose();
        });
    });

    describe('restore', () => {
        test('no module: saved position is used verbatim', async () => {
            const dockview = createComponent();
            dockview.fromJSON(
                layoutWithPopout({
                    position: { left: 5000, top: 2000, width: 500, height: 400 },
                }) as never
            );
            await flush();

            expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                left: '5000',
                top: '2000',
            });
            dockview.dispose();
        });

        test('position on a live screen: verbatim', async () => {
            const dockview = withAdapter();
            await flush();
            dockview.fromJSON(
                layoutWithPopout({
                    position: { left: 2000, top: 100, width: 500, height: 400 },
                }) as never
            );
            await flush();

            expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                left: '2000',
                top: '100',
            });
            dockview.dispose();
        });

        test('dead space, no id: rehomed to the current screen at the saved size', async () => {
            const dockview = withAdapter();
            await flush();
            dockview.fromJSON(
                layoutWithPopout({
                    position: { left: 5000, top: 2000, width: 500, height: 400 },
                }) as never
            );
            await flush();

            // centred in native-1's work area at 500x400
            expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                left: '710',
                top: '360',
                width: '500',
                height: '400',
            });
            dockview.dispose();
        });

        test('screenId follows a monitor the position no longer points at', async () => {
            const dockview = withAdapter();
            await flush();
            // saved on native-2, but the virtual arrangement changed and the
            // stale coordinates now land on native-1
            dockview.fromJSON(
                layoutWithPopout({
                    position: { left: 100, top: 100, width: 500, height: 400 },
                    screenId: 'native-2',
                }) as never
            );
            await flush();

            // centred in native-2's work area
            expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                left: '2470',
                top: '230',
                width: '500',
                height: '400',
            });
            dockview.dispose();
        });

        test('a box straddling onto its saved screen restores verbatim', async () => {
            const dockview = withAdapter();
            await flush();
            // centre on native-1 (1850), but the box overlaps native-2: the
            // saved id merely confirms an on-screen straddler — no re-place.
            dockview.fromJSON(
                layoutWithPopout({
                    position: { left: 1600, top: 100, width: 500, height: 400 },
                    screenId: 'native-2',
                }) as never
            );
            await flush();

            expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                left: '1600',
                top: '100',
            });
            dockview.dispose();
        });

        test('late snapshot: opens verbatim, then is rescued once screens resolve', async () => {
            let resolveScreens!: (screens: DockviewScreen[]) => void;
            const pending = new Promise<DockviewScreen[]>((resolve) => {
                resolveScreens = resolve;
            });
            const dockview = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: { getScreens: () => pending, stableIds: true },
            });

            // adapter has not answered yet: the 0ms restoration timer wins
            dockview.fromJSON(
                layoutWithPopout({
                    position: { left: 5000, top: 2000, width: 500, height: 400 },
                }) as never
            );
            await flush();

            // opened verbatim into (what will turn out to be) dead space
            expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                left: '5000',
                top: '2000',
            });

            resolveScreens([SCREEN_1, SCREEN_2]);
            await flush();
            await flush();

            // rescued: re-homed to the current screen at the saved size
            expect(lastPopout.calls.moveTo).toEqual([[710, 360]]);
            expect(lastPopout.calls.resizeTo).toEqual([[500, 400]]);
            dockview.dispose();
        });

        test('unknown screenId falls back to geometric containment', async () => {
            const dockview = withAdapter();
            await flush();
            dockview.fromJSON(
                layoutWithPopout({
                    position: { left: 100, top: 100, width: 500, height: 400 },
                    screenId: 'native-9',
                }) as never
            );
            await flush();

            expect(parseFeatures(openSpy.mock.calls[0][2])).toMatchObject({
                left: '100',
                top: '100',
            });
            dockview.dispose();
        });
    });
});
