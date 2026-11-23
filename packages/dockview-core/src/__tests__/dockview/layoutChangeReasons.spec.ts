import { DockviewApi } from '../../api/component.api';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { LayoutChangeEvent, LayoutChangeReason } from '../../types';

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
 * `onDidLayoutChange` says why the layout changed. The event is coalesced per
 * microtask, so one ping carries the union of the reasons for everything that
 * happened in the task. Only `'geometry'` is a resize; the active panel, a
 * title and params are serialized too, so they ping, but with their own reason.
 */
describe('onDidLayoutChange reasons', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;
    let pings: LayoutChangeReason[][];

    const sorted = (e: LayoutChangeEvent): LayoutChangeReason[] =>
        [...e.reasons].sort();

    /** Flush the microtask queue so the coalesced ping dispatches. */
    const flush = (): Promise<void> => Promise.resolve();

    beforeEach(() => {
        container = document.createElement('div');
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });
        dockview.layout(1000, 1000);
        pings = [];
        dockview.onDidLayoutChange((e) => pings.push(sorted(e)));
    });

    afterEach(() => dockview.dispose());

    test('addPanel pings with structure (and the activation it causes)', async () => {
        dockview.addPanel({ id: 'p1', component: 'default' });
        await flush();

        expect(pings).toHaveLength(1);
        expect(pings[0]).toContain('structure');
        expect(pings[0]).toContain('activePanel');
        expect(pings[0]).not.toContain('geometry');
    });

    test('activating another panel pings with exactly activePanel', async () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({ id: 'p2', component: 'default' });
        await flush();
        pings.length = 0;

        p1.api.setActive();
        await flush();

        expect(pings).toEqual([['activePanel']]);
    });

    test('a tab switch pings with geometry only when the constraints differ', async () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        const p2 = dockview.addPanel({ id: 'p2', component: 'default' });
        const p3 = dockview.addPanel({
            id: 'p3',
            component: 'default',
            minimumHeight: 300,
        });
        await flush();
        pings.length = 0;

        // p3 (min 300) -> p1 (min 100): the group's constraints change, so
        // the switch relayouts the group as well
        p1.api.setActive();
        await flush();
        expect(pings).toEqual([['activePanel', 'geometry']]);
        pings.length = 0;

        // p1 -> p2: equal constraints, nothing to relayout
        p2.api.setActive();
        await flush();
        expect(pings).toEqual([['activePanel']]);
        pings.length = 0;

        // p2 (min 100) -> p3 (min 300): constraints change again
        p3.api.setActive();
        await flush();
        expect(pings).toEqual([['activePanel', 'geometry']]);
    });

    test('setTitle pings with exactly panelTitle', async () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        await flush();
        pings.length = 0;

        p1.api.setTitle('renamed');
        await flush();

        expect(pings).toEqual([['panelTitle']]);
    });

    test('updateParameters pings with exactly panelParameters', async () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        await flush();
        pings.length = 0;

        p1.api.updateParameters({ a: 1 });
        await flush();

        expect(pings).toEqual([['panelParameters']]);
    });

    test('resizing a group pings with geometry', async () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { direction: 'right' },
        });
        await flush();
        pings.length = 0;

        p1.group.api.setSize({ width: 300 });
        await flush();

        expect(pings).toHaveLength(1);
        expect(pings[0]).toContain('geometry');
        expect(pings[0]).not.toContain('structure');
        expect(pings[0]).not.toContain('activePanel');
    });

    test('toggling a group visibility pings with geometry', async () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { direction: 'right' },
        });
        await flush();
        pings.length = 0;

        dockview.setVisible(p1.group, false);
        await flush();

        expect(pings).toHaveLength(1);
        expect(pings[0]).toContain('geometry');
    });

    test('maximizing a group pings with geometry', async () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { direction: 'right' },
        });
        await flush();
        pings.length = 0;

        dockview.maximizeGroup(p1.group);
        await flush();

        expect(pings).toHaveLength(1);
        expect(pings[0]).toContain('geometry');
    });

    test('several changes in one task coalesce into one ping with the union', async () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({ id: 'p2', component: 'default' });
        await flush();
        pings.length = 0;

        p1.api.setTitle('renamed');
        p1.api.updateParameters({ a: 1 });
        p1.api.setActive();
        await flush();

        expect(pings).toEqual([
            ['activePanel', 'panelParameters', 'panelTitle'],
        ]);
    });

    test('the accumulated reasons reset between pings', async () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        await flush();
        pings.length = 0;

        p1.api.setTitle('renamed');
        await flush();
        p1.api.updateParameters({ a: 1 });
        await flush();

        expect(pings).toEqual([['panelTitle'], ['panelParameters']]);
    });

    test('the public api delivers the same reasoned event', async () => {
        const api = new DockviewApi(dockview);
        const apiPings: LayoutChangeReason[][] = [];
        api.onDidLayoutChange((e) => apiPings.push(sorted(e)));

        const p1 = api.addPanel({ id: 'p1', component: 'default' });
        await flush();
        p1.api.setTitle('renamed');
        await flush();

        expect(apiPings).toHaveLength(2);
        expect(apiPings[0]).toContain('structure');
        expect(apiPings[1]).toEqual(['panelTitle']);
        expect(apiPings).toEqual(pings);
    });

    test('a listener subscribed after a fire in the same task is not pinged for it', async () => {
        const late: LayoutChangeReason[][] = [];

        dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.onDidLayoutChange((e) => late.push(sorted(e)));
        await flush();

        expect(pings).toHaveLength(1);
        expect(late).toHaveLength(0);

        // but it is pinged for what happens afterwards
        dockview.addPanel({ id: 'p2', component: 'default' });
        await flush();

        expect(late).toHaveLength(1);
        expect(late[0]).toContain('structure');
    });
});
