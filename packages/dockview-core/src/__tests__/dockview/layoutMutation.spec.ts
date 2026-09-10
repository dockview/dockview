import {
    DockviewComponent,
    DockviewLayoutMutationKind,
} from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import {
    setupDeferredMockWindow,
    setupMockWindow,
} from '../__mocks__/mockWindow';

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
 * The onWillMutateLayout / onDidMutateLayout transaction boundary. Each
 * top-level structural mutation brackets once; compound operations (a move
 * that internally removes the source panel) bracket as a single transaction.
 */
describe('layout mutation events', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;
    let will: DockviewLayoutMutationKind[];
    let did: DockviewLayoutMutationKind[];

    beforeEach(() => {
        container = document.createElement('div');
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });
        dockview.layout(1000, 1000);
        will = [];
        did = [];
        dockview.onWillMutateLayout((e) => will.push(e.kind));
        dockview.onDidMutateLayout((e) => did.push(e.kind));
    });

    afterEach(() => dockview.dispose());

    test('addPanel brackets one "add" transaction', () => {
        dockview.addPanel({ id: 'p1', component: 'default' });
        expect(will).toEqual(['add']);
        expect(did).toEqual(['add']);
    });

    test('removePanel brackets one "remove" transaction', () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        will.length = 0;
        did.length = 0;

        dockview.removePanel(p1);
        expect(will).toEqual(['remove']);
        expect(did).toEqual(['remove']);
    });

    test('a compound move fires once: nested removePanel does not double-fire', () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        const p2 = dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { direction: 'right' },
        });
        will.length = 0;
        did.length = 0;

        dockview.moveGroupOrPanel({
            from: { groupId: p2.group.id, panelId: p2.id },
            to: { group: p1.group, position: 'center' },
        });

        // Exactly one 'move': the source-group teardown inside the move must
        // not leak its own transaction (depth counter).
        expect(will).toEqual(['move']);
        expect(did).toEqual(['move']);
    });

    test('removeGroup brackets one "remove" transaction', () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        will.length = 0;
        did.length = 0;

        dockview.removeGroup(p1.group);
        expect(will).toEqual(['remove']);
        expect(did).toEqual(['remove']);
    });

    test('addFloatingGroup brackets one "float" transaction', () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({ id: 'p2', component: 'default' });
        will.length = 0;
        did.length = 0;

        dockview.addFloatingGroup(p1);
        expect(will).toEqual(['float']);
        expect(did).toEqual(['float']);
    });

    /**
     * The popout window opens asynchronously and the panels are only rehomed
     * once it has. The bracket therefore has to stay open across the await,
     * otherwise a consumer using the transaction for autosave / undo sees the
     * popout's structural work land outside it - unlike the move and float
     * paths, whose work is entirely synchronous.
     */
    test('addPopoutGroup brackets the async work, not just its start', async () => {
        window.open = () => setupMockWindow();

        const sequence: string[] = [];
        dockview.onWillMutateLayout((e) => sequence.push(`will:${e.kind}`));
        dockview.onDidMutateLayout((e) => sequence.push(`did:${e.kind}`));
        dockview.onDidAddGroup(() => sequence.push('addGroup'));
        dockview.onDidMovePanel(() => sequence.push('movePanel'));

        dockview.addPanel({ id: 'p1', component: 'default' });
        const p2 = dockview.addPanel({ id: 'p2', component: 'default' });
        sequence.length = 0;
        will.length = 0;
        did.length = 0;

        await dockview.addPopoutGroup(p2);

        expect(sequence).toEqual([
            'will:popout',
            'addGroup',
            'movePanel',
            'did:popout',
        ]);
        expect(will).toEqual(['popout']);
        expect(did).toEqual(['popout']);
    });

    test('a nested mutation during the popout joins the popout transaction', async () => {
        window.open = () => setupMockWindow();

        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({ id: 'p2', component: 'default' });

        // popping a whole group out of a floating window removes the floating
        // group as part of the popout, a nested mutation that must fold in
        dockview.addFloatingGroup(p1.group);
        will.length = 0;
        did.length = 0;

        await dockview.addPopoutGroup(p1.group);

        expect(will).toEqual(['popout']);
        expect(did).toEqual(['popout']);
    });

    /**
     * Asynchronous transactions can *overlap* rather than nest, so the first to
     * open is not necessarily the last to close. Two popouts opening at once
     * whose windows load at different times is the ordinary case - `fromJSON`
     * staggers restored popouts deliberately. Keying the closing event off
     * which bracket opened first fires `didMutate` while the second popout is
     * still adding groups and moving panels, putting its work outside the
     * transaction - exactly what holding the bracket open across the async work
     * exists to prevent.
     */
    test('overlapping popouts report one transaction that closes after all the work', async () => {
        const first = setupDeferredMockWindow();
        const second = setupDeferredMockWindow();
        const windows = [first, second];
        window.open = () => windows.shift()!.window;

        const sequence: string[] = [];
        dockview.onWillMutateLayout((e) => sequence.push(`will:${e.kind}`));
        dockview.onDidMutateLayout((e) => sequence.push(`did:${e.kind}`));
        dockview.onDidMovePanel((e) => sequence.push(`move:${e.panel.id}`));

        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        const p2 = dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { direction: 'right' },
        });
        dockview.addPanel({ id: 'p3', component: 'default' });
        sequence.length = 0;
        will.length = 0;
        did.length = 0;

        // both in flight at once, neither awaited before the other starts
        const opened = Promise.all([
            dockview.addPopoutGroup(p1),
            dockview.addPopoutGroup(p2),
        ]);

        // the first window loads while the second is still opening
        first.load();
        await new Promise((resolve) => setTimeout(resolve, 0));
        second.load();
        await opened;

        expect(will).toEqual(['popout']);
        expect(did).toEqual(['popout']);
        expect(sequence).toEqual([
            'will:popout',
            'move:p1',
            'move:p2',
            'did:popout',
        ]);
    });

    /**
     * The async bracket holds the transaction open until the work settles, so a
     * popout that fails has to settle too - a promise that never does would
     * leave the depth counter above zero and silently swallow the will/did pair
     * of every mutation for the rest of the component's life. The trailing
     * `addPanel` is the real assertion: it only brackets on its own if the
     * failed popout put the counter back.
     */
    test('a blocked popout closes its transaction and leaves nothing open', async () => {
        const openSpy = jest.spyOn(window, 'open').mockReturnValue(null);
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
            // the blocked-popup fallback logs; keep the test output clean
        });

        try {
            dockview.addPanel({ id: 'p1', component: 'default' });
            const p2 = dockview.addPanel({ id: 'p2', component: 'default' });
            will.length = 0;
            did.length = 0;

            expect(await dockview.addPopoutGroup(p2)).toBe(false);

            expect(will).toEqual(['popout']);
            expect(did).toEqual(['popout']);

            dockview.addPanel({ id: 'p3', component: 'default' });

            expect(will).toEqual(['popout', 'add']);
            expect(did).toEqual(['popout', 'add']);
        } finally {
            errorSpy.mockRestore();
            openSpy.mockRestore();
        }
    });

    test('clear brackets one "clear" transaction', () => {
        dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({ id: 'p2', component: 'default' });
        will.length = 0;
        did.length = 0;

        dockview.clear();
        expect(will).toEqual(['clear']);
        expect(did).toEqual(['clear']);
    });

    test('fromJSON fires a single "load" transaction, not N nested adds', () => {
        dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({ id: 'p2', component: 'default' });
        dockview.addPanel({ id: 'p3', component: 'default' });
        const json = dockview.toJSON();
        will.length = 0;
        did.length = 0;

        dockview.fromJSON(json);
        expect(will).toEqual(['load']);
        expect(did).toEqual(['load']);
    });

    test('addGroup brackets one "add" transaction', () => {
        dockview.addGroup();
        expect(will).toEqual(['add']);
        expect(did).toEqual(['add']);
    });

    test('closeAllGroups brackets a single "remove" transaction', () => {
        dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { direction: 'right' },
        });
        will.length = 0;
        did.length = 0;

        // Multiple panels across multiple groups must collapse into one
        // transaction, not one-per-panel.
        dockview.closeAllGroups();
        expect(will).toEqual(['remove']);
        expect(did).toEqual(['remove']);
    });

    test('addEdgeGroup brackets one "add" transaction', () => {
        dockview.addEdgeGroup('left', { id: 'edge-left' });
        expect(will).toEqual(['add']);
        expect(did).toEqual(['add']);
    });

    test('removeEdgeGroup brackets a single "remove" transaction', () => {
        dockview.addEdgeGroup('left', { id: 'edge-left' });
        dockview.addPanel({
            id: 'p1',
            component: 'default',
            position: { referenceGroup: 'edge-left' },
        });
        dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { referenceGroup: 'edge-left' },
        });
        will.length = 0;
        did.length = 0;

        dockview.removeEdgeGroup('left');
        expect(will).toEqual(['remove']);
        expect(did).toEqual(['remove']);
    });

    test('maximizeGroup brackets one "maximize" transaction', () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { direction: 'right' },
        });
        will.length = 0;
        did.length = 0;

        dockview.maximizeGroup(p1.group);
        expect(will).toEqual(['maximize']);
        expect(did).toEqual(['maximize']);
    });

    test('exitMaximizedGroup brackets one "maximize" transaction', () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { direction: 'right' },
        });
        dockview.maximizeGroup(p1.group);
        will.length = 0;
        did.length = 0;

        dockview.exitMaximizedGroup();
        expect(will).toEqual(['maximize']);
        expect(did).toEqual(['maximize']);
    });

    test('maximize state survives a toJSON/fromJSON round-trip', () => {
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { direction: 'right' },
        });
        dockview.maximizeGroup(p1.group);
        expect(dockview.hasMaximizedGroup()).toBe(true);

        const json = dockview.toJSON();
        dockview.fromJSON(json);

        // Confirms the seam fires on a restorable state; undo/redo via
        // fromJSON can put the maximize back.
        expect(dockview.hasMaximizedGroup()).toBe(true);
    });

    describe('tab group mutations', () => {
        test('createTabGroup brackets one "tab-group" transaction', () => {
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            will.length = 0;
            did.length = 0;

            dockview.api.createTabGroup({ groupId: p1.group.id });
            expect(will).toEqual(['tab-group']);
            expect(did).toEqual(['tab-group']);
        });

        test('addPanelToTabGroup brackets one "tab-group" transaction', () => {
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            const tg = dockview.api.createTabGroup({ groupId: p1.group.id });
            will.length = 0;
            did.length = 0;

            dockview.api.addPanelToTabGroup({
                groupId: p1.group.id,
                tabGroupId: tg.id,
                panelId: 'p1',
            });
            expect(will).toEqual(['tab-group']);
            expect(did).toEqual(['tab-group']);
        });

        test('moving a panel between tab groups fires one "tab-group", not two', () => {
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            const tg1 = dockview.api.createTabGroup({ groupId: p1.group.id });
            const tg2 = dockview.api.createTabGroup({ groupId: p1.group.id });
            dockview.api.addPanelToTabGroup({
                groupId: p1.group.id,
                tabGroupId: tg1.id,
                panelId: 'p1',
            });
            will.length = 0;
            did.length = 0;

            // The destination add internally removes p1 from tg1 first; that
            // nested removePanelFromTabGroup must not open its own transaction.
            dockview.api.addPanelToTabGroup({
                groupId: p1.group.id,
                tabGroupId: tg2.id,
                panelId: 'p1',
            });
            expect(will).toEqual(['tab-group']);
            expect(did).toEqual(['tab-group']);
        });

        test('an "already in this group" no-op fires nothing', () => {
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            const tg = dockview.api.createTabGroup({ groupId: p1.group.id });
            dockview.api.addPanelToTabGroup({
                groupId: p1.group.id,
                tabGroupId: tg.id,
                panelId: 'p1',
            });
            will.length = 0;
            did.length = 0;

            dockview.api.addPanelToTabGroup({
                groupId: p1.group.id,
                tabGroupId: tg.id,
                panelId: 'p1',
            });
            expect(will).toEqual([]);
            expect(did).toEqual([]);
        });
    });

    test('onWillMutateLayout fires before onDidMutateLayout', () => {
        const order: string[] = [];
        dockview.onWillMutateLayout(() => order.push('will'));
        dockview.onDidMutateLayout(() => order.push('did'));

        dockview.addPanel({ id: 'p1', component: 'default' });
        expect(order).toEqual(['will', 'did']);
    });

    describe('mutation origin', () => {
        let origins: string[];

        beforeEach(() => {
            origins = [];
            dockview.onDidMutateLayout((e) => origins.push(e.origin));
        });

        test('a direct (component) mutation is tagged "user"', () => {
            // Driving the component directly models the DnD / tab-UI /
            // keyboard paths that never pass through the DockviewApi.
            dockview.addPanel({ id: 'p1', component: 'default' });
            expect(origins).toEqual(['user']);
        });

        test('a programmatic DockviewApi mutation is tagged "api"', () => {
            dockview.api.addPanel({ id: 'p1', component: 'default' });
            expect(origins).toEqual(['api']);
        });

        test('a programmatic api.addGroup() is tagged "api"', () => {
            dockview.api.addGroup();
            expect(origins).toEqual(['api']);
        });

        test('a programmatic api.maximizeGroup() / exitMaximizedGroup() is tagged "api"', () => {
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });
            origins.length = 0;

            dockview.api.maximizeGroup(p1);
            dockview.api.exitMaximizedGroup();
            expect(origins).toEqual(['api', 'api']);
        });

        test('a programmatic panel.api.moveTo() is tagged "api"', () => {
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            const p2 = dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });
            origins.length = 0;

            p1.api.moveTo({ group: p2.group, position: 'center' });
            expect(origins).toEqual(['api']);
        });

        test('a programmatic group.api.moveTo() into an explicit group is tagged "api"', () => {
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            const p2 = dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });
            origins.length = 0;

            p1.group.api.moveTo({ group: p2.group, position: 'center' });
            // Every mutation bracketed by the move (incl. teardown of the
            // now-empty source group) must report the api origin.
            expect(origins.every((o) => o === 'api')).toBe(true);
            expect(origins.length).toBeGreaterThan(0);
        });

        test('a programmatic group.api.moveTo() that creates the target group is tagged "api"', () => {
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });
            origins.length = 0;

            // No target group: exercises the `addGroup` fallback inside
            // `group.api.moveTo`, so the created group's `add` mutation must
            // also carry the api origin.
            p1.group.api.moveTo({ position: 'left' });
            expect(origins.every((o) => o === 'api')).toBe(true);
            expect(origins.length).toBeGreaterThan(0);
        });

        test('a programmatic tab-group mutation is tagged "api"', () => {
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            origins.length = 0;

            dockview.api.createTabGroup({ groupId: p1.group.id });
            expect(origins).toEqual(['api']);
        });

        test('a compound api mutation stays "api" through nested teardown', () => {
            const p1 = dockview.api.addPanel({
                id: 'p1',
                component: 'default',
            });
            dockview.api.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });
            origins.length = 0;

            // Floating p1 brackets one 'float' transaction whose body removes
            // the source group (a nested mutation). The outer api origin must
            // survive; a nested call must not reset it to 'user'.
            dockview.api.addFloatingGroup(p1);
            expect(origins).toEqual(['api']);
        });

        test('origin restores to "user" after an api call completes', () => {
            dockview.api.addPanel({ id: 'p1', component: 'default' });
            dockview.addPanel({ id: 'p2', component: 'default' });
            expect(origins).toEqual(['api', 'user']);
            expect(dockview.currentOrigin()).toBe('user');
        });
    });
});
