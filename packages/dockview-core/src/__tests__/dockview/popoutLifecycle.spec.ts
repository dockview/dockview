import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { setupMockWindow } from '../__mocks__/mockWindow';

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
 * The popout lifecycle surface: `onDidAddPopoutGroup` (open) /
 * `onDidRemovePopoutGroup` (close or dock-back), `getPopouts()` (enumeration),
 * plus teardown and serialize/restore round-tripping.
 */
describe('popout lifecycle', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;

    beforeEach(() => {
        window.open = () => setupMockWindow();
        container = document.createElement('div');
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });
        dockview.layout(1000, 1000);
    });

    afterEach(() => dockview.dispose());

    test('onDidAddPopoutGroup fires with the group and window on open', async () => {
        const panel = dockview.addPanel({ id: 'p1', component: 'default' });
        const events: { id: string; hasGroup: boolean; hasWindow: boolean }[] =
            [];
        dockview.onDidAddPopoutGroup((e) =>
            events.push({
                id: e.id,
                hasGroup: !!e.group,
                hasWindow: !!e.window,
            })
        );

        await dockview.addPopoutGroup(panel);

        expect(events).toHaveLength(1);
        expect(events[0].hasGroup).toBe(true);
        expect(events[0].hasWindow).toBe(true);
        // the event id matches the now-enumerable popout
        expect(events[0].id).toBe(dockview.getPopouts()[0].id);
    });

    test('getPopouts enumerates the open popout windows', async () => {
        expect(dockview.getPopouts()).toEqual([]);

        const panel = dockview.addPanel({ id: 'p1', component: 'default' });
        await dockview.addPopoutGroup(panel);

        const popouts = dockview.getPopouts();
        expect(popouts).toHaveLength(1);
        expect(typeof popouts[0].id).toBe('string');
        expect(popouts[0].group).toBeDefined();
        expect(popouts[0].window).toBeDefined();
    });

    test('the DockviewApi surface delegates to the component', async () => {
        const fired: string[] = [];
        dockview.api.onDidAddPopoutGroup((e) => fired.push(e.id));

        const panel = dockview.addPanel({ id: 'p1', component: 'default' });
        await dockview.addPopoutGroup(panel);

        expect(fired).toHaveLength(1);
        expect(dockview.api.getPopouts().map((p) => p.id)).toEqual(fired);
    });

    test('closing the popout window returns the panel, fires onDidRemovePopoutGroup, and clears getPopouts', async () => {
        const panel = dockview.addPanel({ id: 'p1', component: 'default' });
        await dockview.addPopoutGroup(panel);
        expect(dockview.getPopouts()).toHaveLength(1);

        const popoutId = dockview.getPopouts()[0].id;
        const popoutWindow = dockview.getPopouts()[0].window;

        const removed: string[] = [];
        dockview.onDidRemovePopoutGroup((e) => removed.push(e.id));

        // a genuine user close fires `beforeunload`, which drives teardown
        expect(() => popoutWindow.close()).not.toThrow();

        expect(removed).toEqual([popoutId]);
        expect(dockview.getPopouts()).toEqual([]);
        expect(dockview.panels.find((p) => p.id === 'p1')).toBeDefined();
    });

    test('onDidRemovePopoutGroup does not fire on component disposal', async () => {
        // use a dedicated component so the shared afterEach doesn't double-dispose
        const localContainer = document.createElement('div');
        const local = new DockviewComponent(localContainer, {
            createComponent: () => new TestPanel(),
        });
        local.layout(1000, 1000);
        const panel = local.addPanel({ id: 'p1', component: 'default' });
        await local.addPopoutGroup(panel);

        const removed: string[] = [];
        local.onDidRemovePopoutGroup((e) => removed.push(e.id));

        expect(() => local.dispose()).not.toThrow();
        expect(removed).toEqual([]);
    });

    test('toJSON captures open popouts and fromJSON round-trips without throwing', async () => {
        const panel = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({ id: 'p2', component: 'default' });
        await dockview.addPopoutGroup(panel);

        const json = dockview.toJSON();
        expect(json.popoutGroups?.length).toBe(1);

        // a fresh component must restore the serialized layout (incl. the popout
        // descriptor) without throwing
        const container2 = document.createElement('div');
        const dockview2 = new DockviewComponent(container2, {
            createComponent: () => new TestPanel(),
        });
        dockview2.layout(1000, 1000);

        expect(() => dockview2.fromJSON(json)).not.toThrow();
        expect(dockview2.panels.map((p) => p.id).sort()).toEqual(['p1', 'p2']);

        dockview2.dispose();
    });
});

/**
 * Popout window placement in screen coordinates. A supplied / restored
 * `position` (from `PopoutWindow.dimensions()`, i.e. screenX/screenY) is
 * already absolute, whereas a fresh popout is placed from the source element's
 * viewport-relative rect and must be offset by the opener window's own screen
 * position. Regression guard for the multi-monitor double-offset where the
 * opener offset was added to an already-absolute restored position.
 */
describe('popout screen positioning', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;
    let restoreScreen: (() => void)[];

    function setOpenerScreenPosition(x: number, y: number): void {
        for (const [key, value] of [
            ['screenX', x],
            ['screenY', y],
        ] as const) {
            const original = Object.getOwnPropertyDescriptor(window, key);
            Object.defineProperty(window, key, {
                value,
                configurable: true,
            });
            restoreScreen.push(() => {
                if (original) {
                    Object.defineProperty(window, key, original);
                } else {
                    delete (window as unknown as Record<string, unknown>)[key];
                }
            });
        }
    }

    function captureOpenFeatures(): { current: string | undefined } {
        const ref: { current: string | undefined } = { current: undefined };
        window.open = ((
            _url?: string | URL,
            _target?: string,
            features?: string
        ) => {
            ref.current = features;
            return setupMockWindow();
        }) as typeof window.open;
        return ref;
    }

    function feature(features: string | undefined, key: string): number {
        const match = new RegExp(`(?:^|,)${key}=(-?\\d+)`).exec(features ?? '');
        return match ? Number(match[1]) : NaN;
    }

    beforeEach(() => {
        restoreScreen = [];
        container = document.createElement('div');
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });
        dockview.layout(1000, 1000);
    });

    afterEach(() => {
        dockview.dispose();
        restoreScreen.forEach((fn) => fn());
    });

    test('a fresh popout is offset by the opener window screen position', async () => {
        setOpenerScreenPosition(1600, 200);
        const features = captureOpenFeatures();

        const panel = dockview.addPanel({ id: 'p1', component: 'default' });
        await dockview.addPopoutGroup(panel);

        // jsdom performs no layout, so the source element's rect is at (0, 0);
        // the opener's screen offset must still be applied so the popout opens
        // over the source rather than at the primary monitor's origin.
        expect(feature(features.current, 'left')).toBe(1600);
        expect(feature(features.current, 'top')).toBe(200);
    });

    test('a supplied absolute position is not double-offset by the opener screen position', async () => {
        // Opener sits on a secondary monitor. This is the case that regressed:
        // a restored position is already absolute, so adding the opener offset
        // again previously produced left = 1600 + 2200 = 3800.
        setOpenerScreenPosition(1600, 200);
        const features = captureOpenFeatures();

        const panel = dockview.addPanel({ id: 'p1', component: 'default' });
        await dockview.addPopoutGroup(panel, {
            position: { left: 2200, top: 300, width: 400, height: 500 },
        });

        expect(feature(features.current, 'left')).toBe(2200);
        expect(feature(features.current, 'top')).toBe(300);
        expect(feature(features.current, 'width')).toBe(400);
        expect(feature(features.current, 'height')).toBe(500);
    });

    test('a serialized popout round-trips and restores at its saved screen position (no double-offset)', async () => {
        // 1. Serialize a popout whose window reports an absolute screen
        //    position, as a window dragged onto a secondary monitor would.
        const POPOUT_SCREEN_X = 2200;
        const POPOUT_SCREEN_Y = 300;
        window.open = (() => {
            const win = setupMockWindow();
            Object.defineProperty(win, 'screenX', {
                value: POPOUT_SCREEN_X,
                configurable: true,
            });
            Object.defineProperty(win, 'screenY', {
                value: POPOUT_SCREEN_Y,
                configurable: true,
            });
            return win;
        }) as typeof window.open;

        const panel = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({ id: 'p2', component: 'default' });
        await dockview.addPopoutGroup(panel);

        const json = dockview.toJSON();
        // the popout descriptor stores the window's absolute screen coordinates
        // (PopoutWindow.dimensions() -> screenX/screenY)
        expect(json.popoutGroups?.[0].position?.left).toBe(POPOUT_SCREEN_X);
        expect(json.popoutGroups?.[0].position?.top).toBe(POPOUT_SCREEN_Y);

        // 2. Restore into a fresh component whose opener sits on a secondary
        //    monitor. The saved position is already absolute, so restoration
        //    must not add the opener screen offset again (the DV-39 defect:
        //    left would become 1600 + 2200 = 3800). This exercises the real
        //    fromJSON -> deserializePopoutWindows -> addPopoutGroup path, not
        //    only the supplied-position branch.
        setOpenerScreenPosition(1600, 200);
        const features = captureOpenFeatures();

        const container2 = document.createElement('div');
        const dockview2 = new DockviewComponent(container2, {
            createComponent: () => new TestPanel(),
        });
        dockview2.layout(1000, 1000);
        dockview2.fromJSON(json);

        // popout restoration is queued on a timer; let it fire
        for (let i = 0; i < 50 && features.current === undefined; i++) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        expect(feature(features.current, 'left')).toBe(POPOUT_SCREEN_X);
        expect(feature(features.current, 'top')).toBe(POPOUT_SCREEN_Y);

        dockview2.dispose();
    });
});
