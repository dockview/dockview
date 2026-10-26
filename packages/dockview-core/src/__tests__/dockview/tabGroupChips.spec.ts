import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { CompositeDisposable } from '../../lifecycle';

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
 * Tab-group lifecycle events (onDidCreateTabGroup / onDidDestroyTabGroup /
 * onDidAddPanelToTabGroup / onDidRemovePanelFromTabGroup / onDidTabGroupChange)
 * are fired by TabGroupChipsModule's per-group forwarding. The underlying
 * createTabGroup/addPanelToTabGroup operations live in core, but the events
 * only propagate when the module is registered, hence these tests live here.
 */
describe('tab group events (TabGroupChipsModule)', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });
    });

    afterEach(() => {
        dockview.dispose();
        container.remove();
    });

    test('fromJSON with tab groups fires correct events', () => {
        dockview.layout(1000, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const groupId = panel1.group.id;
        const tg = dockview.api.createTabGroup({
            groupId,
            label: 'Events',
            color: 'green',
        });
        dockview.api.addPanelToTabGroup({
            groupId,
            tabGroupId: tg.id,
            panelId: 'panel1',
        });
        dockview.api.addPanelToTabGroup({
            groupId,
            tabGroupId: tg.id,
            panelId: 'panel2',
        });

        const state = dockview.toJSON();

        dockview.fromJSON(state);

        const restoredGroup = dockview.api.panels[0].group;

        const created: string[] = [];
        const destroyed: string[] = [];
        const panelsAdded: { tgId: string; panelId: string }[] = [];
        const panelsRemoved: { tgId: string; panelId: string }[] = [];
        const changes: string[] = [];

        const disposable = new CompositeDisposable(
            dockview.api.onDidCreateTabGroup((e) =>
                created.push(e.tabGroup.id)
            ),
            dockview.api.onDidDestroyTabGroup((e) =>
                destroyed.push(e.tabGroup.id)
            ),
            dockview.api.onDidAddPanelToTabGroup((e) =>
                panelsAdded.push({
                    tgId: e.tabGroup.id,
                    panelId: e.panelId,
                })
            ),
            dockview.api.onDidRemovePanelFromTabGroup((e) =>
                panelsRemoved.push({
                    tgId: e.tabGroup.id,
                    panelId: e.panelId,
                })
            ),
            dockview.api.onDidTabGroupChange((e) => changes.push(e.tabGroup.id))
        );

        const newTg = dockview.api.createTabGroup({
            groupId: restoredGroup.id,
            label: 'New',
            color: 'purple',
        });
        expect(created).toEqual([newTg.id]);

        // Add a panel to the new group (panel1 is already in the
        // restored tab group, so it will be removed from there first)
        dockview.api.addPanelToTabGroup({
            groupId: restoredGroup.id,
            tabGroupId: newTg.id,
            panelId: 'panel1',
        });
        // One removal from the restored group, one addition to newTg
        expect(panelsRemoved).toHaveLength(1);
        expect(panelsAdded).toHaveLength(1);
        expect(panelsAdded[0]).toEqual({
            tgId: newTg.id,
            panelId: 'panel1',
        });

        newTg.setLabel('Updated');
        expect(changes).toContain(newTg.id);

        panelsRemoved.length = 0;
        dockview.api.removePanelFromTabGroup({
            groupId: restoredGroup.id,
            panelId: 'panel1',
        });
        expect(panelsRemoved).toHaveLength(1);
        expect(panelsRemoved[0]).toEqual({
            tgId: newTg.id,
            panelId: 'panel1',
        });

        // Tab group should auto-destroy when empty
        expect(destroyed).toContain(newTg.id);

        disposable.dispose();
    });

    test('tab group events fire for all lifecycle operations', () => {
        dockview.layout(1000, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });

        const groupId = panel1.group.id;

        const created: string[] = [];
        const destroyed: string[] = [];
        const panelsAdded: { tgId: string; panelId: string }[] = [];
        const panelsRemoved: { tgId: string; panelId: string }[] = [];
        const changes: string[] = [];

        const disposable = new CompositeDisposable(
            dockview.api.onDidCreateTabGroup((e) =>
                created.push(e.tabGroup.id)
            ),
            dockview.api.onDidDestroyTabGroup((e) =>
                destroyed.push(e.tabGroup.id)
            ),
            dockview.api.onDidAddPanelToTabGroup((e) =>
                panelsAdded.push({
                    tgId: e.tabGroup.id,
                    panelId: e.panelId,
                })
            ),
            dockview.api.onDidRemovePanelFromTabGroup((e) =>
                panelsRemoved.push({
                    tgId: e.tabGroup.id,
                    panelId: e.panelId,
                })
            ),
            dockview.api.onDidTabGroupChange((e) => changes.push(e.tabGroup.id))
        );

        const tg = dockview.api.createTabGroup({
            groupId,
            label: 'Test',
            color: 'blue',
        });
        expect(created).toEqual([tg.id]);

        dockview.api.addPanelToTabGroup({
            groupId,
            tabGroupId: tg.id,
            panelId: 'panel1',
        });
        dockview.api.addPanelToTabGroup({
            groupId,
            tabGroupId: tg.id,
            panelId: 'panel2',
        });
        dockview.api.addPanelToTabGroup({
            groupId,
            tabGroupId: tg.id,
            panelId: 'panel3',
        });
        expect(panelsAdded).toEqual([
            { tgId: tg.id, panelId: 'panel1' },
            { tgId: tg.id, panelId: 'panel2' },
            { tgId: tg.id, panelId: 'panel3' },
        ]);

        changes.length = 0;
        tg.setLabel('Updated');
        tg.setColor('red');
        expect(changes).toHaveLength(2);

        tg.collapse();
        tg.expand();

        dockview.api.removePanelFromTabGroup({
            groupId,
            panelId: 'panel2',
        });
        expect(panelsRemoved).toEqual([{ tgId: tg.id, panelId: 'panel2' }]);

        // 6. Dissolve; should remove remaining panels and destroy
        panelsRemoved.length = 0;
        dockview.api.dissolveTabGroup({
            groupId,
            tabGroupId: tg.id,
        });

        expect(panelsRemoved).toEqual(
            expect.arrayContaining([
                { tgId: tg.id, panelId: 'panel1' },
                { tgId: tg.id, panelId: 'panel3' },
            ])
        );
        expect(destroyed).toEqual([tg.id]);

        disposable.dispose();
    });

    test('regression: tab-group events fire on a source group born during moveGroup-from-edge', () => {
        // moveGroup from an edge group to the grid creates a fresh `source`
        // group via this.createGroup() and adds it via gridview.addView(...),
        // bypassing doAddGroup, so BaseGrid._onDidAdd never fires for source.
        // TabGroupChipsModule attaches per-group event forwarding via
        // host.onDidAddGroup (driven by BaseGrid._onDidAdd through the
        // gated callback in DockviewComponent); since neither path fires,
        // attachToGroup never runs and subsequent api.createTabGroup on
        // the moved-source group doesn't propagate to dockview.api.onDidCreateTabGroup.
        const c = document.createElement('div');
        const dv = new DockviewComponent(c, {
            createComponent: () => new TestPanel(),
        });
        dv.addEdgeGroup('left', { id: 'left-group' });
        dv.layout(1000, 800);

        const edgeGroup = dv.groups.find(
            (g) => g.api.location.type === 'edge'
        )!;

        const target = dv.addPanel({ id: 'center', component: 'default' });
        dv.addPanel({
            id: 'edge-p1',
            component: 'default',
            position: { referenceGroup: edgeGroup.id },
        });

        // Move the edge group to the grid; internally creates a fresh
        // `source` group via createGroup + gridview.addView (the path that
        // bypasses doAddGroup / _onDidAddGroup).
        dv.moveGroup({
            from: { group: edgeGroup },
            to: { group: target.api.group, position: 'right' },
        });

        const movedPanel = dv.getGroupPanel('edge-p1')!;
        const movedGroup = movedPanel.group;

        // Subscribe after the move so we can prove the event propagates.
        const events: string[] = [];
        dv.api.onDidCreateTabGroup((e) => events.push(e.tabGroup.id));

        // Trigger a tab-group operation on the moved-source group.
        const tg = dv.api.createTabGroup({
            groupId: movedGroup.id,
            label: 'test',
        });

        // Should fire, but doesn't if attachToGroup never ran.
        expect(events).toEqual([tg.id]);

        dv.dispose();
    });

    test('onDidLayoutChange fires when tab groups are created, mutated, collapsed, or destroyed', () => {
        jest.useFakeTimers();
        dockview.layout(1000, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel_1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel_2',
            component: 'default',
            position: { referenceGroup: panel1.group },
        });
        jest.runAllTimers();

        const didLayoutChangeHandler = jest.fn();
        dockview.onDidLayoutChange(didLayoutChangeHandler);

        const tg = dockview.api.createTabGroup({
            groupId: panel1.group.id,
            label: 'My Group',
            color: 'red',
        });
        jest.runAllTimers();
        expect(didLayoutChangeHandler).toHaveBeenCalledTimes(1);

        dockview.api.addPanelToTabGroup({
            groupId: panel1.group.id,
            tabGroupId: tg.id,
            panelId: panel1.id,
        });
        jest.runAllTimers();
        expect(didLayoutChangeHandler).toHaveBeenCalledTimes(2);

        dockview.api.addPanelToTabGroup({
            groupId: panel1.group.id,
            tabGroupId: tg.id,
            panelId: panel2.id,
        });
        jest.runAllTimers();
        expect(didLayoutChangeHandler).toHaveBeenCalledTimes(3);

        tg.collapse();
        jest.runAllTimers();
        expect(didLayoutChangeHandler).toHaveBeenCalledTimes(4);

        // remove a panel from the tab group (group still has panel2 so
        // it is not auto-destroyed)
        dockview.api.removePanelFromTabGroup({
            groupId: panel1.group.id,
            panelId: panel1.id,
        });
        jest.runAllTimers();
        expect(didLayoutChangeHandler).toHaveBeenCalledTimes(5);

        dockview.api.dissolveTabGroup({
            groupId: panel1.group.id,
            tabGroupId: tg.id,
        });
        jest.runAllTimers();
        expect(didLayoutChangeHandler).toHaveBeenCalledTimes(6);

        jest.useRealTimers();
    });
});
