import {
    DockviewComponent,
    DockviewScreen,
    IContentRenderer,
} from 'dockview-core';

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

const SCREENS: DockviewScreen[] = [
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

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The ScreenManagement module is implemented in dockview-core and registered
 * by this package's `Modules` list (the DV-94 packaging decision). These
 * tests prove the registration is live: a *default* component — built the
 * way an enterprise consumer gets it, via the process-global registry — has
 * the screen API active with no missing-module diagnostics.
 */
describe('ScreenManagement enterprise registration', () => {
    let container: HTMLElement;
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
        container.remove();
    });

    test('a default component answers the screen API without diagnostics', async () => {
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });
        dockview.layout(1000, 800);

        // jsdom has no Window Management API: unsupported, but never a
        // missing-module error — the module is present and degrades itself.
        expect(dockview.hasWindowManagement).toBe(false);
        await expect(
            dockview.getWindowManagementPermission()
        ).resolves.toBe('unsupported');
        await expect(dockview.getScreens()).resolves.toBeInstanceOf(Array);
        expect(consoleError).not.toHaveBeenCalled();
        dockview.dispose();
    });

    test('screenAdapter feeds the snapshot eagerly, no permission machinery', async () => {
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            screenAdapter: { getScreens: () => SCREENS },
        });
        dockview.layout(1000, 800);
        await flush(); // module init() prime

        expect(dockview.screens.map((screen) => screen.id)).toEqual([
            'native-1',
            'native-2',
        ]);
        await expect(dockview.getScreens()).resolves.toHaveLength(2);
        expect(consoleError).not.toHaveBeenCalled();
        dockview.dispose();
    });
});
