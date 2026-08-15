import { fromPartial } from '@total-typescript/shoehorn';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { PopoutWindowOpenRequest } from '../../popoutWindow';

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
 * Minimal popout window mock: fires `load` on registration (the popout
 * pipeline resolves inside the load handler) and honours `close()` →
 * `beforeunload` so teardown mirrors a real window.
 */
function mockPopoutWindow(): Window {
    const listeners: Record<string, (() => void)[]> = {};
    return fromPartial<Window>({
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
        moveTo: () => undefined,
        resizeTo: () => undefined,
        screenX: 0,
        screenY: 0,
        innerWidth: 500,
        innerHeight: 400,
    });
}

function parseFeatures(features: string): Record<string, string> {
    return Object.fromEntries(
        features.split(',').map((entry) => entry.split('=') as [string, string])
    );
}

describe('popout window seams', () => {
    const originalOpen = window.open;
    let openSpy: jest.Mock;

    function createComponent(extra: Record<string, unknown> = {}) {
        const container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            ...extra,
        } as never);
        dockview.layout(1000, 800);
        return dockview;
    }

    beforeEach(() => {
        openSpy = jest.fn(() => mockPopoutWindow());
        window.open = openSpy as typeof window.open;
    });

    afterEach(() => {
        window.open = originalOpen;
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

        test('absent: the features string is unchanged', async () => {
            const dockview = createComponent();
            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel);

            expect(Object.keys(parseFeatures(openSpy.mock.calls[0][2]))).toEqual(
                ['top', 'left', 'width', 'height']
            );
            dockview.dispose();
        });
    });

    describe('popoutWindowFactory', () => {
        test('factory supplies the window; window.open is never called', async () => {
            const requests: PopoutWindowOpenRequest[] = [];
            const dockview = createComponent({
                popoutWindowFactory: (request: PopoutWindowOpenRequest) => {
                    requests.push(request);
                    return mockPopoutWindow();
                },
            });

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await expect(dockview.addPopoutGroup(panel)).resolves.toBe(true);

            expect(openSpy).not.toHaveBeenCalled();
            expect(panel.api.location.type).toBe('popout');
            expect(dockview.getPopouts()).toHaveLength(1);

            expect(requests).toHaveLength(1);
            const request = requests[0];
            expect(request.id).toContain(dockview.id);
            expect(request.url).toBe('/popout.html');
            // jsdom rects are 0x0 at 0,0 → the request box and features agree
            expect(request.box).toEqual({
                top: 0,
                left: 0,
                width: 0,
                height: 0,
            });
            expect(parseFeatures(request.features)).toMatchObject({
                top: '0',
                left: '0',
                width: '0',
                height: '0',
            });
            dockview.dispose();
        });

        test('async factory: the popout waits for the promised window', async () => {
            const dockview = createComponent({
                popoutWindowFactory: () =>
                    new Promise((resolve) =>
                        setTimeout(() => resolve(mockPopoutWindow()), 0)
                    ),
            });

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await expect(dockview.addPopoutGroup(panel)).resolves.toBe(true);
            expect(openSpy).not.toHaveBeenCalled();
            expect(panel.api.location.type).toBe('popout');
            dockview.dispose();
        });

        test('factory returning null runs the blocked-popout recovery', async () => {
            // the recovery path logs its usual popup-blocked diagnostic
            const consoleError = jest
                .spyOn(console, 'error')
                .mockImplementation(() => undefined);
            const dockview = createComponent({
                popoutWindowFactory: () => null,
            });
            const failures = jest.fn();
            dockview.onDidOpenPopoutWindowFail(failures);

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await expect(dockview.addPopoutGroup(panel)).resolves.toBe(false);

            expect(failures).toHaveBeenCalledTimes(1);
            expect(panel.api.location.type).toBe('grid');
            expect(dockview.getPopouts()).toHaveLength(0);
            dockview.dispose();
            consoleError.mockRestore();
        });

        test('honoured live: a factory set via updateOptions intercepts the next popout', async () => {
            const dockview = createComponent();
            const factory = jest.fn(() => mockPopoutWindow());
            dockview.updateOptions({ popoutWindowFactory: factory });

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await expect(dockview.addPopoutGroup(panel)).resolves.toBe(true);

            expect(factory).toHaveBeenCalledTimes(1);
            expect(openSpy).not.toHaveBeenCalled();
            dockview.dispose();
        });

        test('composes with extraWindowFeatures: entries reach the request features string', async () => {
            const requests: PopoutWindowOpenRequest[] = [];
            const dockview = createComponent({
                popoutWindowFactory: (request: PopoutWindowOpenRequest) => {
                    requests.push(request);
                    return mockPopoutWindow();
                },
            });

            const panel = dockview.addPanel({ id: 'p1', component: 'default' });
            await dockview.addPopoutGroup(panel, {
                extraWindowFeatures: { dockviewPopout: true },
            });

            expect(parseFeatures(requests[0].features)).toMatchObject({
                dockviewPopout: '1',
            });
            dockview.dispose();
        });
    });
});
