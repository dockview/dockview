import {
    DockviewScreen,
    DockviewScreenAdapter,
    DockviewScreensChangeEvent,
    ScreenManager,
    ScreenManagerWindow,
} from '../../dockview/screenManager';

interface FakeScreenDetailedInit {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    availLeft?: number;
    availTop?: number;
    availWidth?: number;
    availHeight?: number;
    isPrimary?: boolean;
    isInternal?: boolean;
    label?: string;
    devicePixelRatio?: number;
}

function fakeScreen(init: FakeScreenDetailedInit = {}): ScreenDetailed {
    const width = init.width ?? 1920;
    const height = init.height ?? 1080;
    return {
        left: init.left ?? 0,
        top: init.top ?? 0,
        width,
        height,
        availLeft: init.availLeft ?? init.left ?? 0,
        availTop: init.availTop ?? (init.top ?? 0) + 40,
        availWidth: init.availWidth ?? width,
        availHeight: init.availHeight ?? height - 40,
        isPrimary: init.isPrimary ?? false,
        isInternal: init.isInternal ?? false,
        label: init.label ?? '',
        devicePixelRatio: init.devicePixelRatio ?? 1,
    } as unknown as ScreenDetailed;
}

interface FakeDetails {
    details: ScreenDetails;
    setScreens(screens: ScreenDetailed[], currentIndex?: number): void;
    fire(type: 'screenschange' | 'currentscreenchange'): void;
}

function fakeDetails(
    screens: ScreenDetailed[],
    currentIndex = 0
): FakeDetails {
    const listeners = new Map<string, Set<() => void>>();
    let _screens = screens;
    let _currentIndex = currentIndex;
    const details = {
        get screens() {
            return _screens;
        },
        get currentScreen() {
            return _screens[_currentIndex];
        },
        addEventListener: (type: string, listener: () => void) => {
            if (!listeners.has(type)) {
                listeners.set(type, new Set());
            }
            listeners.get(type)!.add(listener);
        },
        removeEventListener: (type: string, listener: () => void) => {
            listeners.get(type)?.delete(listener);
        },
    } as unknown as ScreenDetails;
    return {
        details,
        setScreens: (next, index = 0) => {
            _screens = next;
            _currentIndex = index;
        },
        fire: (type) => {
            listeners.get(type)?.forEach((listener) => listener());
        },
    };
}

interface FakeWindowOptions {
    supported?: boolean;
    permission?: 'granted' | 'prompt' | 'denied';
    /** Older Chromium: 'window-management' throws TypeError. */
    legacyPermissionNameOnly?: boolean;
    noPermissionsApi?: boolean;
    rejectDetailsWith?: Error;
    details?: FakeDetails;
}

interface FakeWindow {
    window: ScreenManagerWindow;
    details: FakeDetails;
    getScreenDetails: jest.Mock;
    queried: string[];
    firePermissionChange(state: 'granted' | 'prompt' | 'denied'): void;
}

function fakeWindow(options: FakeWindowOptions = {}): FakeWindow {
    const details =
        options.details ??
        fakeDetails([
            fakeScreen({ isPrimary: true, label: 'Internal' }),
            fakeScreen({ left: 1920, label: 'DELL U2720Q' }),
        ]);

    let permissionState = options.permission ?? 'granted';
    const permissionListeners = new Set<() => void>();
    const queried: string[] = [];

    const getScreenDetails = jest.fn(async () => {
        if (options.rejectDetailsWith) {
            throw options.rejectDetailsWith;
        }
        return details.details;
    });

    const window = {
        devicePixelRatio: 2,
        screen: {
            width: 1440,
            height: 900,
            availWidth: 1440,
            availHeight: 860,
        },
        navigator: options.noPermissionsApi
            ? {}
            : {
                  permissions: {
                      query: async ({ name }: { name: string }) => {
                          queried.push(name);
                          if (
                              options.legacyPermissionNameOnly &&
                              name === 'window-management'
                          ) {
                              throw new TypeError(
                                  `'${name}' is not a valid enum value`
                              );
                          }
                          return {
                              get state() {
                                  return permissionState;
                              },
                              addEventListener: (
                                  _: 'change',
                                  listener: () => void
                              ) => {
                                  permissionListeners.add(listener);
                              },
                              removeEventListener: (
                                  _: 'change',
                                  listener: () => void
                              ) => {
                                  permissionListeners.delete(listener);
                              },
                          };
                      },
                  },
              },
        ...(options.supported === false ? {} : { getScreenDetails }),
    } as unknown as ScreenManagerWindow;

    return {
        window,
        details,
        getScreenDetails,
        queried,
        firePermissionChange: (state) => {
            permissionState = state;
            permissionListeners.forEach((listener) => listener());
        },
    };
}

describe('screenManager', () => {
    describe('feature detection and fallback', () => {
        test('unsupported window: single synthetic screen, no throw', async () => {
            const { window } = fakeWindow({ supported: false });
            const manager = new ScreenManager(window);

            expect(manager.isSupported).toBe(false);
            expect(await manager.permissionState()).toBe('unsupported');

            const screens = await manager.getScreens();
            expect(screens).toHaveLength(1);
            expect(screens[0]).toMatchObject({
                id: 'dv-screen-fallback',
                isPrimary: true,
                isCurrent: true,
                bounds: { left: 0, top: 0, width: 1440, height: 900 },
                workArea: { left: 0, top: 0, width: 1440, height: 860 },
                devicePixelRatio: 2,
            });
            expect(screens[0].native).toBeUndefined();
            manager.dispose();
        });

        test('snapshot starts as the fallback before any getScreens call', () => {
            const { window } = fakeWindow();
            const manager = new ScreenManager(window);
            expect(manager.screens).toHaveLength(1);
            expect(manager.screens[0].id).toBe('dv-screen-fallback');
            expect(manager.currentScreen?.id).toBe('dv-screen-fallback');
            manager.dispose();
        });

        test('denied prompt: falls back and remembers, no re-prompt', async () => {
            const error = new Error('denied');
            error.name = 'NotAllowedError';
            const { window, getScreenDetails } = fakeWindow({
                rejectDetailsWith: error,
            });
            const manager = new ScreenManager(window);

            const screens = await manager.getScreens();
            expect(screens[0].id).toBe('dv-screen-fallback');
            expect(getScreenDetails).toHaveBeenCalledTimes(1);

            await manager.getScreens();
            expect(getScreenDetails).toHaveBeenCalledTimes(1);
            manager.dispose();
        });
    });

    describe('permission probing', () => {
        test('reports the queried state', async () => {
            const { window } = fakeWindow({ permission: 'prompt' });
            const manager = new ScreenManager(window);
            expect(await manager.permissionState()).toBe('prompt');
            manager.dispose();
        });

        test('falls back to the legacy window-placement name on TypeError', async () => {
            const { window, queried } = fakeWindow({
                permission: 'granted',
                legacyPermissionNameOnly: true,
            });
            const manager = new ScreenManager(window);
            expect(await manager.permissionState()).toBe('granted');
            expect(queried).toEqual(['window-management', 'window-placement']);
            manager.dispose();
        });

        test('no Permissions API: reports prompt (unknowable without prompting)', async () => {
            const { window } = fakeWindow({ noPermissionsApi: true });
            const manager = new ScreenManager(window);
            expect(await manager.permissionState()).toBe('prompt');
            manager.dispose();
        });

        test('a later grant (permission change event) populates the snapshot', async () => {
            const fake = fakeWindow({ permission: 'prompt' });
            const manager = new ScreenManager(fake.window);

            await manager.prime();
            expect(fake.getScreenDetails).not.toHaveBeenCalled();

            fake.firePermissionChange('granted');
            await Promise.resolve();
            await Promise.resolve();
            expect(fake.getScreenDetails).toHaveBeenCalledTimes(1);
            expect(manager.screens).toHaveLength(2);
            manager.dispose();
        });

        test('revocation drops back to the fallback screen', async () => {
            const fake = fakeWindow({ permission: 'granted' });
            const manager = new ScreenManager(fake.window);
            await manager.prime();
            expect(manager.screens).toHaveLength(2);

            fake.firePermissionChange('denied');
            expect(manager.screens).toHaveLength(1);
            expect(manager.screens[0].id).toBe('dv-screen-fallback');
            manager.dispose();
        });
    });

    describe('screen mapping', () => {
        test('maps ScreenDetailed fields, current flag, and ids', async () => {
            const { window } = fakeWindow();
            const manager = new ScreenManager(window);
            const screens = await manager.getScreens();

            expect(screens).toHaveLength(2);
            expect(screens[0]).toMatchObject({
                id: 'Internal',
                label: 'Internal',
                isPrimary: true,
                isCurrent: true,
                bounds: { left: 0, top: 0, width: 1920, height: 1080 },
                workArea: { left: 0, top: 40, width: 1920, height: 1040 },
            });
            expect(screens[1]).toMatchObject({
                id: 'DELL U2720Q',
                isCurrent: false,
                bounds: { left: 1920, top: 0, width: 1920, height: 1080 },
            });
            expect(screens[0].native).toBeDefined();
            manager.dispose();
        });

        test('identical labels are disambiguated; empty labels are positional', async () => {
            const details = fakeDetails([
                fakeScreen({ label: 'DELL', isPrimary: true }),
                fakeScreen({ label: 'DELL', left: 1920 }),
                fakeScreen({ left: 3840 }),
            ]);
            const { window } = fakeWindow({ details });
            const manager = new ScreenManager(window);
            const screens = await manager.getScreens();
            expect(screens.map((screen) => screen.id)).toEqual([
                'DELL',
                'DELL#1',
                'screen-2',
            ]);
            manager.dispose();
        });

        test('prime populates eagerly when granted, not when prompt', async () => {
            const granted = fakeWindow({ permission: 'granted' });
            const grantedManager = new ScreenManager(granted.window);
            await grantedManager.prime();
            expect(granted.getScreenDetails).toHaveBeenCalledTimes(1);
            expect(grantedManager.screens).toHaveLength(2);
            grantedManager.dispose();

            const prompt = fakeWindow({ permission: 'prompt' });
            const promptManager = new ScreenManager(prompt.window);
            await promptManager.prime();
            expect(prompt.getScreenDetails).not.toHaveBeenCalled();
            expect(promptManager.screens[0].id).toBe('dv-screen-fallback');
            promptManager.dispose();
        });
    });

    describe('topology changes', () => {
        test('screenschange re-emits with added/removed diff', async () => {
            const fake = fakeWindow();
            const manager = new ScreenManager(fake.window);
            await manager.getScreens();

            const events: DockviewScreensChangeEvent[] = [];
            manager.onDidChangeScreens((event) => events.push(event));

            fake.details.setScreens([
                fakeScreen({ isPrimary: true, label: 'Internal' }),
            ]);
            fake.details.fire('screenschange');

            expect(events).toHaveLength(1);
            expect(events[0].screens).toHaveLength(1);
            expect(events[0].removed.map((screen) => screen.id)).toEqual([
                'DELL U2720Q',
            ]);
            expect(events[0].added).toHaveLength(0);
            expect(manager.screens).toHaveLength(1);
            manager.dispose();
        });

        test('currentscreenchange with identical topology fires only on real change', async () => {
            const fake = fakeWindow();
            const manager = new ScreenManager(fake.window);
            await manager.getScreens();

            const events: DockviewScreensChangeEvent[] = [];
            manager.onDidChangeScreens((event) => events.push(event));

            // Same screens, same current: no event.
            fake.details.fire('currentscreenchange');
            expect(events).toHaveLength(0);

            // Current moved to the second screen: geometry-level change.
            fake.details.setScreens(
                [
                    fakeScreen({ isPrimary: true, label: 'Internal' }),
                    fakeScreen({ left: 1920, label: 'DELL U2720Q' }),
                ],
                1
            );
            fake.details.fire('currentscreenchange');
            expect(events).toHaveLength(1);
            expect(manager.currentScreen?.id).toBe('DELL U2720Q');
            manager.dispose();
        });

        test('no events after dispose', async () => {
            const fake = fakeWindow();
            const manager = new ScreenManager(fake.window);
            await manager.getScreens();

            const events: DockviewScreensChangeEvent[] = [];
            manager.onDidChangeScreens((event) => events.push(event));

            manager.dispose();
            fake.details.setScreens([fakeScreen({ isPrimary: true })]);
            fake.details.fire('screenschange');
            expect(events).toHaveLength(0);
        });
    });

    describe('resolveTarget', () => {
        async function managerWithScreens(): Promise<{
            manager: ScreenManager;
            screens: readonly DockviewScreen[];
        }> {
            const { window } = fakeWindow();
            const manager = new ScreenManager(window);
            const screens = await manager.getScreens();
            return { manager, screens };
        }

        test("'primary', 'current', index, and identity", async () => {
            const { manager, screens } = await managerWithScreens();
            expect(manager.resolveTarget('primary')).toBe(screens[0]);
            expect(manager.resolveTarget('current')).toBe(screens[0]);
            expect(manager.resolveTarget(1)).toBe(screens[1]);
            expect(manager.resolveTarget(screens[1])).toBe(screens[1]);
            manager.dispose();
        });

        test('out-of-range index resolves to undefined', async () => {
            const { manager } = await managerWithScreens();
            expect(manager.resolveTarget(7)).toBeUndefined();
            manager.dispose();
        });

        test('stale screen object re-resolves by id', async () => {
            const { manager, screens } = await managerWithScreens();
            const stale: DockviewScreen = { ...screens[1] };
            expect(manager.resolveTarget(stale)).toBe(screens[1]);
            manager.dispose();
        });
    });

    describe('placementFor', () => {
        const screen: DockviewScreen = {
            id: 's',
            label: '',
            isPrimary: true,
            isInternal: false,
            isCurrent: true,
            bounds: { left: 1920, top: 0, width: 1920, height: 1080 },
            workArea: { left: 1920, top: 40, width: 1920, height: 1040 },
            devicePixelRatio: 1,
        };

        function manager(): ScreenManager {
            return new ScreenManager(fakeWindow().window);
        }

        test('fill covers the work area exactly', () => {
            const m = manager();
            expect(m.placementFor(screen, { type: 'fill' })).toEqual(
                screen.workArea
            );
            m.dispose();
        });

        test('center defaults to half the work area, centred', () => {
            const m = manager();
            expect(m.placementFor(screen)).toEqual({
                left: 1920 + 480,
                top: 40 + 260,
                width: 960,
                height: 520,
            });
            m.dispose();
        });

        test('center with explicit size', () => {
            const m = manager();
            expect(
                m.placementFor(screen, {
                    type: 'center',
                    width: 800,
                    height: 600,
                })
            ).toEqual({ left: 1920 + 560, top: 40 + 220, width: 800, height: 600 });
            m.dispose();
        });

        test('box is relative to the work-area origin', () => {
            const m = manager();
            expect(
                m.placementFor(screen, {
                    type: 'box',
                    box: { left: 10, top: 20, width: 300, height: 200 },
                })
            ).toEqual({ left: 1930, top: 60, width: 300, height: 200 });
            m.dispose();
        });

        test('oversized and off-area boxes are clamped into the work area', () => {
            const m = manager();
            expect(
                m.placementFor(screen, {
                    type: 'box',
                    box: { left: -500, top: -500, width: 5000, height: 5000 },
                })
            ).toEqual(screen.workArea);

            expect(
                m.placementFor(screen, {
                    type: 'box',
                    box: { left: 1900, top: 1030, width: 300, height: 200 },
                })
            ).toEqual({
                left: 1920 + 1920 - 300,
                top: 40 + 1040 - 200,
                width: 300,
                height: 200,
            });
            m.dispose();
        });
    });

    describe('screenAdapter precedence', () => {
        function adapterScreen(id: string, left = 0): DockviewScreen {
            return {
                id,
                label: id,
                isPrimary: left === 0,
                isInternal: false,
                isCurrent: left === 0,
                bounds: { left, top: 0, width: 1920, height: 1080 },
                workArea: { left, top: 0, width: 1920, height: 1040 },
                devicePixelRatio: 1,
            };
        }

        test('adapter replaces the web API entirely', async () => {
            const fake = fakeWindow(); // has a working getScreenDetails
            const adapter: DockviewScreenAdapter = {
                getScreens: () => [adapterScreen('a'), adapterScreen('b', 1920)],
            };
            const manager = new ScreenManager(fake.window, adapter);

            expect(manager.isSupported).toBe(true);
            expect(await manager.permissionState()).toBe('granted');
            const screens = await manager.getScreens();
            expect(screens.map((s) => s.id)).toEqual(['a', 'b']);
            // The web API must never have been consulted.
            expect(fake.getScreenDetails).not.toHaveBeenCalled();
            manager.dispose();
        });

        test('prime() populates eagerly through the adapter', async () => {
            const adapter: DockviewScreenAdapter = {
                getScreens: () => [adapterScreen('a')],
            };
            const manager = new ScreenManager(
                fakeWindow({ supported: false }).window,
                adapter
            );
            await manager.prime();
            expect(manager.screens.map((s) => s.id)).toEqual(['a']);
            manager.dispose();
        });

        test('subscribe feeds topology changes; unsubscribe on dispose', async () => {
            let listener: ((screens: DockviewScreen[]) => void) | null = null;
            let unsubscribed = false;
            const adapter: DockviewScreenAdapter = {
                getScreens: () => [adapterScreen('a'), adapterScreen('b', 1920)],
                subscribe: (cb) => {
                    listener = cb;
                    return () => {
                        unsubscribed = true;
                    };
                },
            };
            const manager = new ScreenManager(
                fakeWindow({ supported: false }).window,
                adapter
            );
            await manager.getScreens();

            const events: DockviewScreensChangeEvent[] = [];
            manager.onDidChangeScreens((event) => events.push(event));
            listener!([adapterScreen('a')]);
            expect(events).toHaveLength(1);
            expect(events[0].removed.map((s) => s.id)).toEqual(['b']);

            manager.dispose();
            expect(unsubscribed).toBe(true);
        });

        test('a throwing or empty adapter degrades to the fallback screen', async () => {
            const throwing = new ScreenManager(
                fakeWindow({ supported: false }).window,
                {
                    getScreens: () => {
                        throw new Error('ipc down');
                    },
                }
            );
            expect(
                (await throwing.getScreens()).map((s) => s.id)
            ).toEqual(['dv-screen-fallback']);
            throwing.dispose();

            const empty = new ScreenManager(
                fakeWindow({ supported: false }).window,
                { getScreens: () => [] }
            );
            expect((await empty.getScreens()).map((s) => s.id)).toEqual([
                'dv-screen-fallback',
            ]);
            empty.dispose();
        });
    });

    describe('hasResolvedScreens', () => {
        test('false on fallback, true after real details, false after revoke', async () => {
            const fake = fakeWindow({ permission: 'granted' });
            const manager = new ScreenManager(fake.window);
            expect(manager.hasResolvedScreens).toBe(false);

            // prime() rather than a bare getScreens(): it also queries the
            // permission, which is what attaches the revoke listener.
            await manager.prime();
            expect(manager.hasResolvedScreens).toBe(true);

            fake.firePermissionChange('denied');
            expect(manager.hasResolvedScreens).toBe(false);
            manager.dispose();
        });

        test('true after adapter resolution', async () => {
            const manager = new ScreenManager(
                fakeWindow({ supported: false }).window,
                {
                    getScreens: () => [
                        {
                            id: 'a',
                            label: '',
                            isPrimary: true,
                            isInternal: false,
                            isCurrent: true,
                            bounds: { left: 0, top: 0, width: 100, height: 100 },
                            workArea: {
                                left: 0,
                                top: 0,
                                width: 100,
                                height: 100,
                            },
                            devicePixelRatio: 1,
                        },
                    ],
                }
            );
            expect(manager.hasResolvedScreens).toBe(false);
            await manager.getScreens();
            expect(manager.hasResolvedScreens).toBe(true);
            manager.dispose();
        });
    });

    describe('moveWindowTo', () => {
        const box = { left: 100, top: 50, width: 800, height: 600 };

        test('uses win.moveTo/resizeTo without an adapter', async () => {
            const manager = new ScreenManager(fakeWindow().window);
            const moveTo = jest.fn();
            const resizeTo = jest.fn();
            const win = { moveTo, resizeTo } as unknown as Window;

            await expect(manager.moveWindowTo(win, box)).resolves.toBe(true);
            expect(moveTo).toHaveBeenCalledWith(100, 50);
            expect(resizeTo).toHaveBeenCalledWith(800, 600);
            manager.dispose();
        });

        test('prefers adapter.moveWindow; false results and throws propagate as false', async () => {
            const moveWindow = jest.fn().mockResolvedValue(true);
            const manager = new ScreenManager(fakeWindow().window, {
                getScreens: () => [],
                moveWindow,
            });
            const win = {
                moveTo: jest.fn(),
                resizeTo: jest.fn(),
            } as unknown as Window;

            await expect(manager.moveWindowTo(win, box)).resolves.toBe(true);
            expect(moveWindow).toHaveBeenCalledWith(win, box);
            expect((win as { moveTo: jest.Mock }).moveTo).not.toHaveBeenCalled();

            moveWindow.mockResolvedValue(false);
            await expect(manager.moveWindowTo(win, box)).resolves.toBe(false);

            moveWindow.mockRejectedValue(new Error('ipc down'));
            await expect(manager.moveWindowTo(win, box)).resolves.toBe(false);
            manager.dispose();
        });
    });

    describe('screenAtPoint', () => {
        test('geometric containment against full bounds', async () => {
            const { window } = fakeWindow();
            const manager = new ScreenManager(window);
            const screens = await manager.getScreens();

            expect(manager.screenAtPoint(100, 100)).toBe(screens[0]);
            expect(manager.screenAtPoint(2000, 100)).toBe(screens[1]);
            expect(manager.screenAtPoint(-10, 100)).toBeUndefined();
            expect(manager.screenAtPoint(5000, 100)).toBeUndefined();
            manager.dispose();
        });
    });
});
