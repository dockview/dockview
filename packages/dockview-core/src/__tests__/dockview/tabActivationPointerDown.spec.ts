import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewOptions } from '../../dockview/options';
import { IContentRenderer } from '../../dockview/types';
import { Emitter } from '../../events';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    readonly _onDidDispose = new Emitter<void>();
    readonly onDidDispose = this._onDidDispose.event;
    constructor(
        public readonly id: string,
        public readonly component: string
    ) {}
    init(): void {}
    layout(): void {}
    update(): void {}
    dispose(): void {}
}

/**
 * DV-37 / #932, with the HTML5 drag backend a tab is natively `draggable`, and
 * Firefox aborts a pending native drag if the same pointerdown that could start
 * it also moves focus / relayouts the tab strip synchronously. Activating an
 * inactive tab on pointerdown does exactly that, so a drag begun on an inactive
 * tab never starts. The fix defers the pointerdown activation past the frame
 * (so `dragstart` arms first) while keeping the pointer backend synchronous.
 *
 * jsdom cannot drive a real native drag, so these assert the observable
 * *contract* of that fix: activation is deferred one frame under html5 and
 * still lands, and stays synchronous under the pointer backend. Real Firefox
 * drag behaviour is verified manually.
 */
describe('DV-37: pointerdown tab activation timing', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;

    const make = (options?: Partial<DockviewOptions>): void => {
        container = document.createElement('div');
        document.body.appendChild(container);
        dockview = new DockviewComponent(container, {
            createComponent: (o) => new TestPanel(o.id, o.name),
            ...options,
        });
        dockview.layout(600, 400);
    };

    const tabElements = (): HTMLElement[] =>
        Array.from(container.querySelectorAll('.dv-tab')) as HTMLElement[];

    const pointerDown = (el: HTMLElement): void => {
        el.dispatchEvent(
            new MouseEvent('pointerdown', { bubbles: true, button: 0 })
        );
    };

    const nextFrame = (): Promise<void> =>
        new Promise((resolve) => requestAnimationFrame(() => resolve()));

    afterEach(() => {
        dockview.dispose();
        container.remove();
    });

    test('html5 backend: activation is deferred a frame, then applied', async () => {
        make({ dndStrategy: 'html5' });
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        const p2 = dockview.addPanel({ id: 'p2', component: 'default' });
        expect(dockview.activePanel?.id).toBe('p2'); // last added is active

        // pointerdown on the inactive tab must NOT synchronously activate it,
        // otherwise the focus/relayout would pre-empt a native drag in Firefox.
        pointerDown(tabElements()[0]); // p1's tab
        expect(dockview.activePanel?.id).toBe('p2');

        // but activation still happens on the next frame (imperceptible click).
        await nextFrame();
        expect(dockview.activePanel?.id).toBe('p1');
        void p1;
        void p2;
    });

    test('pointer backend: activation is synchronous (unchanged)', () => {
        make({ dndStrategy: 'pointer' });
        dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({ id: 'p2', component: 'default' });
        expect(dockview.activePanel?.id).toBe('p2');

        // no native drag to pre-empt → activate immediately as before.
        pointerDown(tabElements()[0]);
        expect(dockview.activePanel?.id).toBe('p1');
    });

    test('html5 backend: a pending deferred activation is cancelled on dispose', async () => {
        make({ dndStrategy: 'html5' });
        dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({ id: 'p2', component: 'default' });

        pointerDown(tabElements()[0]);
        // tear down before the frame fires: the queued activation must not run
        // against a disposed group.
        expect(() => {
            dockview.dispose();
        }).not.toThrow();
        await nextFrame();
        // (nothing to assert on a disposed component beyond "no throw")
    });
});
