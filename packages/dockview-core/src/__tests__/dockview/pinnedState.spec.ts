import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { LocalSelectionTransfer, PanelTransfer } from '../../dnd/dataTransfer';

class TestContent implements IContentRenderer {
    readonly element = document.createElement('div');
    init(): void {
        // noop
    }
}

/** A component with pinning on: `pinnedTabs.enabled` and a stand-in for
 *  the PinnedTabs module, which core only checks for. */
function setup(): DockviewComponent {
    const dockview = new DockviewComponent(document.createElement('div'), {
        createComponent: () => new TestContent(),
        pinnedTabs: { enabled: true },
    });
    jest.spyOn(dockview, 'pinnedTabsService', 'get').mockReturnValue({} as any);
    dockview.layout(1000, 500);
    return dockview;
}

const order = (dockview: DockviewComponent, index = 0): string[] =>
    dockview.groups[index].model.panels.map((p) => p.id);

describe('pinned state', () => {
    test('a pin counts only while pinning is on, and comes back with it', () => {
        const dockview = setup();
        const a = dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });
        b.api.setPinned(true);
        const events: boolean[] = [];
        const componentEvents: string[] = [];
        b.api.onDidChangePinned((e) => events.push(e.isPinned));
        dockview.onDidPanelPinnedChange((e) =>
            componentEvents.push(`${e.panel.id}:${e.isPinned}`)
        );
        expect(order(dockview)).toEqual(['b', 'a']);

        dockview.updateOptions({ pinnedTabs: { enabled: false } });
        expect(b.api.isPinned).toBe(false);
        a.api.moveTo({ index: 0 });
        expect(order(dockview)).toEqual(['a', 'b']);

        dockview.updateOptions({ pinnedTabs: { enabled: true } });
        expect(b.api.isPinned).toBe(true);
        expect(order(dockview)).toEqual(['b', 'a']);
        expect(events).toEqual([false, true]);
        expect(componentEvents).toEqual(['b:false', 'b:true']);

        dockview.dispose();
    });

    test('the switch re-sorts each group once', () => {
        const dockview = setup();
        const panels = ['a', 'b', 'c'].map((id) =>
            dockview.addPanel({ id, component: 'default' })
        );
        panels[1].api.setPinned(true);
        panels[2].api.setPinned(true);
        const reconcile = jest.spyOn(
            panels[0].api.group.model,
            'reconcilePinnedOrder'
        );

        dockview.updateOptions({ pinnedTabs: { enabled: false } });

        expect(reconcile).toHaveBeenCalledTimes(1);

        dockview.dispose();
    });

    test('a flag set while pinning is off changes nothing until it is on', () => {
        const dockview = setup();
        dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });
        dockview.updateOptions({ pinnedTabs: { enabled: false } });
        const events: boolean[] = [];
        b.api.onDidChangePinned((e) => events.push(e.isPinned));

        b.setPinned(true);

        expect(b.api.isPinned).toBe(false);
        expect(events).toEqual([]);
        expect(order(dockview)).toEqual(['a', 'b']);

        dockview.dispose();
    });

    test('joining a tab group while pinning is off clears the flag', () => {
        const dockview = setup();
        dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });
        const x = dockview.addPanel({
            id: 'x',
            component: 'default',
            position: { direction: 'right' },
        });
        const c = dockview.addPanel({
            id: 'c',
            component: 'default',
            position: { referencePanel: 'a' },
        });
        b.api.setPinned(true);
        c.api.setPinned(true);
        dockview.updateOptions({ pinnedTabs: { enabled: false } });

        // within the group
        const here = dockview.api.createTabGroup({ groupId: b.api.group.id });
        dockview.api.addPanelToTabGroup({
            groupId: b.api.group.id,
            tabGroupId: here.id,
            panelId: 'b',
        });
        // from another group
        const there = dockview.api.createTabGroup({ groupId: x.api.group.id });
        dockview.api.addPanelToTabGroup({
            groupId: x.api.group.id,
            tabGroupId: there.id,
            panelId: 'x',
        });
        c.api.moveTo({ group: x.api.group, at: { tabGroup: there } });

        dockview.updateOptions({ pinnedTabs: { enabled: true } });

        expect(here.panelIds).toEqual(['b']);
        expect(there.panelIds).toEqual(['x', 'c']);
        expect(b.api.isPinned).toBe(false);
        expect(c.api.isPinned).toBe(false);

        dockview.dispose();
    });

    test('joining a tab group while pinning is on unpins', () => {
        const dockview = setup();
        dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });
        b.api.setPinned(true);
        const tabGroup = dockview.api.createTabGroup({
            groupId: b.api.group.id,
        });

        b.api.moveTo({ group: b.api.group, at: { tabGroup } });

        expect(b.api.isPinned).toBe(false);
        expect(tabGroup.panelIds).toEqual(['b']);

        dockview.dispose();
    });

    test('pinning a tab group member takes it out, dissolving the tab group it empties', () => {
        const dockview = setup();
        dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });
        const c = dockview.addPanel({ id: 'c', component: 'default' });
        const groupId = b.api.group.id;
        const pair = dockview.api.createTabGroup({ groupId });
        const lone = dockview.api.createTabGroup({ groupId });
        dockview.api.addPanelToTabGroup({
            groupId,
            tabGroupId: pair.id,
            panelId: 'a',
        });
        dockview.api.addPanelToTabGroup({
            groupId,
            tabGroupId: pair.id,
            panelId: 'b',
        });
        dockview.api.addPanelToTabGroup({
            groupId,
            tabGroupId: lone.id,
            panelId: 'c',
        });
        const removed: string[] = [];
        dockview.onDidRemovePanelFromTabGroup((e) => removed.push(e.panelId));

        b.api.setPinned(true);
        c.api.setPinned(true);

        expect(order(dockview)).toEqual(['b', 'c', 'a']);
        expect(pair.panelIds).toEqual(['a']);
        expect(removed).toEqual(['b', 'c']);
        expect(dockview.api.getTabGroups({ groupId })).toEqual([pair]);

        dockview.dispose();
    });

    describe('a header drop that flips a pin', () => {
        /** A header drop of `panelId` at `index`, its resolver asking to
         *  unpin it, dragged from `viewId`. */
        function drop(
            dockview: DockviewComponent,
            panelId: string,
            index: number,
            viewId: string = dockview.id
        ): void {
            const group = dockview.groups[0];
            const header = (group.model as any).tabsContainer;
            header.setDropIndexResolver((_id: string, i: number) => ({
                index: i,
                pinned: false,
            }));
            const transfer =
                LocalSelectionTransfer.getInstance<PanelTransfer>();
            transfer.setData(
                [new PanelTransfer(viewId, group.id, panelId)],
                PanelTransfer.prototype
            );
            header.tabs.fireDrop({
                event: new Event('drop'),
                index,
                targetTabGroupId: null,
            });
            transfer.clearData(PanelTransfer.prototype);
        }

        function threeWithPin(): DockviewComponent {
            const dockview = setup();
            for (const id of ['a', 'b', 'c']) {
                dockview.addPanel({ id, component: 'default' });
            }
            dockview.getGroupPanel('c')!.api.setPinned(true);
            return dockview;
        }

        test('applies the pin, then lands where dropped', () => {
            const dockview = threeWithPin();
            drop(dockview, 'c', 2);
            expect(dockview.getGroupPanel('c')!.api.isPinned).toBe(false);
            expect(order(dockview)).toEqual(['a', 'b', 'c']);
            dockview.dispose();
        });

        test('changes nothing when onWillDrop cancels it', () => {
            const dockview = threeWithPin();
            dockview.onWillDrop((event) => event.preventDefault());
            drop(dockview, 'c', 2);
            expect(dockview.getGroupPanel('c')!.api.isPinned).toBe(true);
            expect(order(dockview)).toEqual(['c', 'a', 'b']);
            dockview.dispose();
        });

        test('is never asked of a tab from another dockview', () => {
            const dockview = threeWithPin();
            drop(dockview, 'c', 2, 'another-dockview');
            expect(dockview.getGroupPanel('c')!.api.isPinned).toBe(true);
            expect(order(dockview)).toEqual(['c', 'a', 'b']);
            dockview.dispose();
        });
    });
});
