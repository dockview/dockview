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

function screen(partial: Partial<DockviewScreen> & { id: string }): DockviewScreen {
    return {
        label: '',
        isPrimary: false,
        isInternal: false,
        isCurrent: false,
        bounds: { left: 0, top: 0, width: 1920, height: 1080 },
        workArea: { left: 0, top: 0, width: 1920, height: 1040 },
        devicePixelRatio: 1,
        ...partial,
    };
}

function createComponent(extraOptions: Record<string, unknown> = {}): {
    dockview: DockviewComponent;
    container: HTMLElement;
} {
    const container = document.createElement('div');
    const dockview = new DockviewComponent(container, {
        createComponent: () => new TestPanel(),
        ...extraOptions,
    } as never);
    return { dockview, container };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The screen-discovery API surface (design doc §4.5). The ScreenManagement
 * module is not registered in AllModules while the packaging decision is
 * pending, so the "module present" cases use the internal `modules`
 * construction seam.
 */
describe('screen discovery api', () => {
    beforeEach(() => {
        _resetMissingModuleWarnings();
    });

    describe('module absent (default build)', () => {
        test('queries degrade silently', async () => {
            const consoleError = jest
                .spyOn(console, 'error')
                .mockImplementation(() => undefined);
            const { dockview } = createComponent();

            expect(dockview.hasWindowManagement).toBe(false);
            expect(dockview.screens).toEqual([]);
            await expect(dockview.getWindowManagementPermission()).resolves.toBe(
                'unsupported'
            );
            // subscribable never-firing event
            const disposable = dockview.onDidChangeScreens(() => {
                throw new Error('must not fire');
            });
            disposable.dispose();

            expect(consoleError).not.toHaveBeenCalled();
            dockview.dispose();
            consoleError.mockRestore();
        });

        test('getScreens is a command: logs the missing module once, resolves empty', async () => {
            const consoleError = jest
                .spyOn(console, 'error')
                .mockImplementation(() => undefined);
            const { dockview } = createComponent();

            await expect(dockview.getScreens()).resolves.toEqual([]);
            await expect(dockview.getScreens()).resolves.toEqual([]);

            expect(consoleError).toHaveBeenCalledTimes(1);
            expect(String(consoleError.mock.calls[0][0])).toContain(
                'ScreenManagement'
            );
            expect(String(consoleError.mock.calls[0][0])).toContain(
                'api.getScreens'
            );
            dockview.dispose();
            consoleError.mockRestore();
        });
    });

    describe('module present (modules seam), no adapter, jsdom', () => {
        test('falls back to a single synthetic screen', async () => {
            const { dockview } = createComponent({
                modules: [...AllModules, ScreenManagerModule],
            });

            // jsdom has no getScreenDetails and no adapter was supplied.
            expect(dockview.hasWindowManagement).toBe(false);
            await expect(dockview.getWindowManagementPermission()).resolves.toBe(
                'unsupported'
            );

            const screens = await dockview.getScreens();
            expect(screens).toHaveLength(1);
            expect(screens[0].id).toBe('dv-screen-fallback');
            expect(dockview.screens).toHaveLength(1);
            dockview.dispose();
        });
    });

    describe('module present with a screenAdapter', () => {
        function createAdapter(): {
            adapter: DockviewScreenAdapter;
            emit: (screens: DockviewScreen[]) => void;
            unsubscribed: () => boolean;
        } {
            let listener: ((screens: DockviewScreen[]) => void) | null = null;
            let unsubscribed = false;
            const adapter: DockviewScreenAdapter = {
                getScreens: () => [
                    screen({ id: 'native-1', isPrimary: true, isCurrent: true }),
                    screen({
                        id: 'native-2',
                        bounds: { left: 1920, top: 0, width: 1600, height: 900 },
                        workArea: { left: 1920, top: 0, width: 1600, height: 860 },
                    }),
                ],
                subscribe: (cb) => {
                    listener = cb;
                    return () => {
                        unsubscribed = true;
                    };
                },
            };
            return {
                adapter,
                emit: (screens) => listener?.(screens),
                unsubscribed: () => unsubscribed,
            };
        }

        test('adapter takes precedence: no permission machinery, eager snapshot', async () => {
            const { adapter } = createAdapter();
            const { dockview } = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: adapter,
            });

            expect(dockview.hasWindowManagement).toBe(true);
            await expect(dockview.getWindowManagementPermission()).resolves.toBe(
                'granted'
            );

            // init() primes eagerly — the snapshot fills without any
            // consumer call or gesture.
            await flush();
            expect(dockview.screens.map((s) => s.id)).toEqual([
                'native-1',
                'native-2',
            ]);
            dockview.dispose();
        });

        test('adapter subscription feeds onDidChangeScreens with diffs', async () => {
            const { adapter, emit } = createAdapter();
            const { dockview } = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: adapter,
            });
            await flush();

            const events: { added: string[]; removed: string[] }[] = [];
            dockview.onDidChangeScreens((event) =>
                events.push({
                    added: event.added.map((s) => s.id),
                    removed: event.removed.map((s) => s.id),
                })
            );

            emit([screen({ id: 'native-1', isPrimary: true, isCurrent: true })]);

            expect(events).toEqual([{ added: [], removed: ['native-2'] }]);
            expect(dockview.screens).toHaveLength(1);
            dockview.dispose();
        });

        test('adapter unsubscribe runs on component dispose', async () => {
            const { adapter, unsubscribed } = createAdapter();
            const { dockview } = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: adapter,
            });
            await flush();

            expect(unsubscribed()).toBe(false);
            dockview.dispose();
            expect(unsubscribed()).toBe(true);
        });

        test('the DockviewApi wrapper mirrors the surface', async () => {
            const { adapter } = createAdapter();
            const { dockview } = createComponent({
                modules: [...AllModules, ScreenManagerModule],
                screenAdapter: adapter,
            });
            await flush();
            const api = dockview.api;

            expect(api.hasWindowManagement).toBe(true);
            expect(api.screens.map((s) => s.id)).toEqual([
                'native-1',
                'native-2',
            ]);
            await expect(api.getWindowManagementPermission()).resolves.toBe(
                'granted'
            );
            const screens = await api.getScreens();
            expect(screens.map((s) => s.id)).toEqual(['native-1', 'native-2']);
            const disposable = api.onDidChangeScreens(() => undefined);
            disposable.dispose();
            dockview.dispose();
        });
    });
});
