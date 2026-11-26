import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { IContentRenderer } from '../../dockview/types';
import { ITabGroup } from '../../dockview/tabGroup';
import { LocalSelectionTransfer, PanelTransfer } from '../../dnd/dataTransfer';

class TestContent implements IContentRenderer {
    readonly element = document.createElement('div');
    init(): void {
        // noop
    }
}

function setup(ids: string[] = ['a', 'b', 'c', 'd']): {
    dockview: DockviewComponent;
    group: DockviewGroupPanel;
} {
    const dockview = new DockviewComponent(document.createElement('div'), {
        createComponent: () => new TestContent(),
    });
    dockview.layout(1000, 500);
    for (const id of ids) {
        dockview.addPanel({ id, component: 'default' });
    }
    return { dockview, group: dockview.groups[0] };
}

function createTabGroup(
    dockview: DockviewComponent,
    group: DockviewGroupPanel,
    members: string[],
    label = 'X'
): ITabGroup {
    const tabGroup = dockview.api.createTabGroup({ groupId: group.id, label });
    for (const panelId of members) {
        dockview.api.addPanelToTabGroup({
            groupId: group.id,
            panelId,
            tabGroupId: tabGroup.id,
        });
    }
    return tabGroup;
}

const strip = (group: DockviewGroupPanel): string[] =>
    group.panels.map((p) => p.id);

const tabCount = (group: DockviewGroupPanel): number =>
    group.element.querySelectorAll('.dv-tab').length;

/** Drop `panelId` on `group`'s tab strip, as a resolved tab drag would. */
function dropOnStrip(
    dockview: DockviewComponent,
    group: DockviewGroupPanel,
    panelId: string,
    index: number,
    targetTabGroupId: string | null,
    viewId: string = dockview.id
): void {
    const transfer = LocalSelectionTransfer.getInstance<PanelTransfer>();
    transfer.setData(
        [new PanelTransfer(viewId, group.id, panelId)],
        PanelTransfer.prototype
    );
    (group.model as any).tabsContainer.tabs.fireDrop({
        event: new Event('drop'),
        index,
        targetTabGroupId,
    });
    transfer.clearData(PanelTransfer.prototype);
}

describe('tab group placement', () => {
    describe('an index never splits a tab group', () => {
        test('moveTo snaps an ungrouped panel to the nearer edge of the group', () => {
            const { dockview, group } = setup();
            createTabGroup(dockview, group, ['a', 'b', 'd']);
            expect(strip(group)).toEqual(['a', 'b', 'd', 'c']);

            dockview.getGroupPanel('c')!.api.moveTo({ group, index: 1 });
            expect(strip(group)).toEqual(['c', 'a', 'b', 'd']);

            dockview.getGroupPanel('c')!.api.moveTo({ group, index: 2 });
            expect(strip(group)).toEqual(['a', 'b', 'd', 'c']);
            expect(tabCount(group)).toBe(4);

            dockview.dispose();
        });

        test('a tie snaps after the group', () => {
            const { dockview, group } = setup(['a', 'b', 'c']);
            createTabGroup(dockview, group, ['a', 'b']);

            dockview.getGroupPanel('c')!.api.moveTo({ group, index: 1 });
            expect(strip(group)).toEqual(['a', 'b', 'c']);

            dockview.dispose();
        });

        test('an index at either edge of the group is kept', () => {
            const { dockview, group } = setup(['x', 'a', 'b', 'c']);
            const tabGroup = createTabGroup(dockview, group, ['a', 'b']);

            dockview.getGroupPanel('c')!.api.moveTo({ group, index: 1 });
            expect(strip(group)).toEqual(['x', 'c', 'a', 'b']);

            dockview.getGroupPanel('c')!.api.moveTo({ group, index: 3 });
            expect(strip(group)).toEqual(['x', 'a', 'b', 'c']);
            expect(tabGroup.panelIds).toEqual(['a', 'b']);

            dockview.dispose();
        });

        test('addPanel at an index inside a group snaps', () => {
            const { dockview, group } = setup(['a', 'b', 'c']);
            createTabGroup(dockview, group, ['a', 'b', 'c']);

            dockview.addPanel({
                id: 'e',
                component: 'default',
                position: { referenceGroup: group, index: 1 },
            });
            expect(strip(group)).toEqual(['e', 'a', 'b', 'c']);

            dockview.dispose();
        });

        test('a panel moved from another group snaps', () => {
            const { dockview, group } = setup(['a', 'b', 'c']);
            createTabGroup(dockview, group, ['a', 'b', 'c']);
            dockview.addPanel({
                id: 'e',
                component: 'default',
                position: { referenceGroup: group, direction: 'right' },
            });

            dockview.getGroupPanel('e')!.api.moveTo({ group, index: 2 });
            expect(strip(group)).toEqual(['a', 'b', 'c', 'e']);
            expect(tabCount(group)).toBe(4);

            dockview.dispose();
        });

        test('activating a panel already in the group does not move it', () => {
            const { dockview, group } = setup();
            createTabGroup(dockview, group, ['a', 'b', 'd']);
            dockview.getGroupPanel('a')!.api.setActive();
            dockview.getGroupPanel('b')!.api.setActive();

            expect(strip(group)).toEqual(['a', 'b', 'd', 'c']);

            dockview.dispose();
        });

        test.each([
            [1, ['p', 'q', 'a', 'b', 'c']],
            [2, ['a', 'b', 'c', 'p', 'q']],
        ])('merging a serialized group at index %i of a span keeps its panels together and in order', (index, expected) => {
            const { dockview, group } = setup(['a', 'b', 'c']);
            createTabGroup(dockview, group, ['a', 'b', 'c']);
            dockview.addPanel({
                id: 'p',
                component: 'default',
                position: { referenceGroup: group, direction: 'right' },
            });
            dockview.addPanel({
                id: 'q',
                component: 'default',
                position: { referencePanel: 'p', direction: 'within' },
            });
            const other = dockview.getGroupPanel('p')!.group;
            const data = dockview.serializeGroup(other);
            dockview.removeGroup(other);

            dockview.addGroupFromJSON(data, {
                referenceGroup: group,
                index,
            });
            expect(strip(group)).toEqual(expected);

            dockview.dispose();
        });

        test('moving a tab group into another group span keeps both groups contiguous and in order', () => {
            const { dockview, group } = setup(['a', 'b', 'c']);
            createTabGroup(dockview, group, ['a', 'b', 'c'], 'X');
            dockview.addPanel({
                id: 'p',
                component: 'default',
                position: { referenceGroup: group, direction: 'right' },
            });
            dockview.addPanel({
                id: 'q',
                component: 'default',
                position: { referencePanel: 'p', direction: 'within' },
            });
            const other = dockview.getGroupPanel('p')!.group;
            const y = createTabGroup(dockview, other, ['p', 'q'], 'Y');

            dockview.moveGroupOrPanel({
                from: { groupId: other.id, tabGroupId: y.id },
                to: { group, position: 'center', index: 2 },
            });

            expect(strip(group)).toEqual(['a', 'b', 'c', 'p', 'q']);
            const [x2, y2] = group.model.getTabGroups();
            expect(x2.panelIds).toEqual(['a', 'b', 'c']);
            expect(y2.panelIds).toEqual(['p', 'q']);

            dockview.dispose();
        });
        test('a pinned panel stays in the pinned block, so it never splits a tab group', () => {
            const { dockview, group } = setup();
            createTabGroup(dockview, group, ['a', 'b', 'd']);
            const c = dockview.getGroupPanel('c')!;
            jest.spyOn(c.api, 'isPinned', 'get').mockReturnValue(true);

            c.api.moveTo({ group, index: 1 });

            // no other tab is pinned, so the pinned block ends at index 0
            expect(strip(group)).toEqual(['c', 'a', 'b', 'd']);

            dockview.dispose();
        });
    });

    describe('explicit tab group placement', () => {
        test('moveTo joins a tab group at a position within it', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b', 'd']);

            dockview.getGroupPanel('c')!.api.moveTo({
                group,
                tabGroup: x.id,
                indexInTabGroup: 1,
            });

            expect(x.panelIds).toEqual(['a', 'c', 'b', 'd']);
            expect(strip(group)).toEqual(['a', 'c', 'b', 'd']);
            expect(tabCount(group)).toBe(4);

            dockview.dispose();
        });

        test('accepts the tab group object and defaults to the end of it', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b']);

            dockview.getGroupPanel('d')!.api.moveTo({ group, tabGroup: x });

            expect(x.panelIds).toEqual(['a', 'b', 'd']);
            expect(strip(group)).toEqual(['a', 'b', 'd', 'c']);

            dockview.dispose();
        });

        test('moveTo reorders a member within its own tab group', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b', 'd']);

            dockview.getGroupPanel('d')!.api.moveTo({
                group,
                tabGroup: x,
                indexInTabGroup: 0,
            });

            expect(x.panelIds).toEqual(['d', 'a', 'b']);
            expect(strip(group)).toEqual(['d', 'a', 'b', 'c']);
            expect(group.model.getTabGroups()).toHaveLength(1);

            dockview.dispose();
        });

        test('the only member of a tab group keeps it and its place', () => {
            const { dockview, group } = setup(['a', 'b', 'c']);
            const x = createTabGroup(dockview, group, ['b']);

            dockview.getGroupPanel('b')!.api.moveTo({
                group,
                tabGroup: x,
                indexInTabGroup: 0,
            });

            expect(group.model.getTabGroups()).toEqual([x]);
            expect(x.panelIds).toEqual(['b']);
            expect(strip(group)).toEqual(['a', 'b', 'c']);

            dockview.dispose();
        });

        test('tabGroup null leaves the tab group, snapped out of it', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b', 'd']);

            dockview.getGroupPanel('b')!.api.moveTo({
                group,
                index: 1,
                tabGroup: null,
            });

            expect(x.panelIds).toEqual(['a', 'd']);
            expect(
                dockview.api.getTabGroupForPanel({
                    groupId: group.id,
                    panelId: 'b',
                })
            ).toBeUndefined();
            expect(strip(group)).toEqual(['a', 'd', 'b', 'c']);

            dockview.dispose();
        });

        test('moving to another group joins a tab group there', () => {
            const { dockview, group } = setup(['a', 'b']);
            const x = createTabGroup(dockview, group, ['a', 'b']);
            dockview.addPanel({
                id: 'e',
                component: 'default',
                position: { referenceGroup: group, direction: 'right' },
            });

            dockview.getGroupPanel('e')!.api.moveTo({
                group,
                tabGroup: x,
                indexInTabGroup: 1,
            });

            expect(x.panelIds).toEqual(['a', 'e', 'b']);
            expect(strip(group)).toEqual(['a', 'e', 'b']);
            expect(dockview.groups).toHaveLength(1);

            dockview.dispose();
        });

        test('onDidMovePanel fires once, after the panel has joined', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b', 'd']);
            const events: {
                id: string;
                tabGroup?: string;
                members: string[];
            }[] = [];
            dockview.onDidMovePanel((e) =>
                events.push({
                    id: e.panel.id,
                    tabGroup: e.tabGroup?.id,
                    members: [...x.panelIds],
                })
            );

            dockview.getGroupPanel('c')!.api.moveTo({ group, tabGroup: x });

            expect(events).toEqual([
                { id: 'c', tabGroup: x.id, members: ['a', 'b', 'd', 'c'] },
            ]);

            dockview.dispose();
        });

        test('throws, without changing anything, for a tab group not in the destination', () => {
            const { dockview, group } = setup();
            createTabGroup(dockview, group, ['a', 'b']);
            dockview.addPanel({
                id: 'e',
                component: 'default',
                position: { referenceGroup: group, direction: 'right' },
            });
            const other = dockview.getGroupPanel('e')!.group;
            const y = createTabGroup(dockview, other, ['e'], 'Y');

            expect(() =>
                dockview.getGroupPanel('c')!.api.moveTo({ group, tabGroup: y })
            ).toThrow(/does not exist in group/);
            expect(() =>
                dockview.getGroupPanel('c')!.api.moveTo({
                    group,
                    tabGroup: 'missing',
                })
            ).toThrow(/does not exist in group/);

            expect(strip(group)).toEqual(['a', 'b', 'c', 'd']);
            expect(y.panelIds).toEqual(['e']);

            dockview.dispose();
        });

        test('throws, without changing anything, for contradictory placement fields', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b']);
            const c = dockview.getGroupPanel('c')!;

            expect(() =>
                c.api.moveTo({ group, tabGroup: x, index: 0 })
            ).toThrow(/index cannot be combined with tabGroup/);
            expect(() => c.api.moveTo({ group, indexInTabGroup: 0 })).toThrow(
                /indexInTabGroup requires a tabGroup/
            );
            expect(() =>
                dockview.addPanel({
                    id: 'e',
                    component: 'default',
                    position: { referenceGroup: group, tabGroup: x, index: 1 },
                })
            ).toThrow(/index cannot be combined with tabGroup/);

            expect(strip(group)).toEqual(['a', 'b', 'c', 'd']);
            expect(x.panelIds).toEqual(['a', 'b']);
            expect(dockview.getGroupPanel('e')).toBeUndefined();

            dockview.dispose();
        });

        test('a rejected placement fires no layout mutation events', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b']);
            const events: string[] = [];
            dockview.onWillMutateLayout((e) => events.push(`will:${e.kind}`));
            dockview.onDidMutateLayout((e) => events.push(`did:${e.kind}`));
            const c = dockview.getGroupPanel('c')!;

            expect(() =>
                c.api.moveTo({ group, tabGroup: 'missing' })
            ).toThrow();
            expect(() =>
                c.api.moveTo({ group, position: 'right', tabGroup: x })
            ).toThrow();
            expect(() =>
                dockview.addPanel({
                    id: 'e',
                    component: 'default',
                    position: { referenceGroup: group, tabGroup: 'missing' },
                })
            ).toThrow();
            expect(() =>
                dockview.addPanel({
                    id: 'e',
                    component: 'default',
                    position: { referenceGroup: group, tabGroup: x, index: 1 },
                })
            ).toThrow();
            expect(() =>
                dockview.addPanel({
                    id: 'e',
                    component: 'default',
                    position: {
                        referencePanel: 'a',
                        direction: 'below',
                        tabGroup: x,
                    },
                })
            ).toThrow();

            expect(events).toEqual([]);

            dockview.dispose();
        });

        test('throws for a tab group with an edge position', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b']);

            expect(() =>
                dockview.getGroupPanel('c')!.api.moveTo({
                    group,
                    position: 'right',
                    tabGroup: x,
                })
            ).toThrow(/only be given when placing a panel within a group/);
            expect(dockview.groups).toHaveLength(1);
            expect(strip(group)).toEqual(['a', 'b', 'c', 'd']);

            dockview.dispose();
        });

        test('addPanel joins a tab group', () => {
            const { dockview, group } = setup(['a', 'b', 'c']);
            const x = createTabGroup(dockview, group, ['b', 'c']);

            dockview.addPanel({
                id: 'e',
                component: 'default',
                position: {
                    referenceGroup: group,
                    tabGroup: x,
                    indexInTabGroup: 0,
                },
            });

            expect(x.panelIds).toEqual(['e', 'b', 'c']);
            expect(strip(group)).toEqual(['a', 'e', 'b', 'c']);

            dockview.dispose();
        });

        test('addPanel throws for a tab group with a split direction', () => {
            const { dockview, group } = setup(['a', 'b']);
            const x = createTabGroup(dockview, group, ['a', 'b']);

            expect(() =>
                dockview.addPanel({
                    id: 'e',
                    component: 'default',
                    position: {
                        referenceGroup: group,
                        direction: 'right',
                        tabGroup: x,
                    },
                })
            ).toThrow(/only be given when placing a panel within a group/);
            expect(dockview.getGroupPanel('e')).toBeUndefined();
            expect(dockview.groups).toHaveLength(1);

            dockview.dispose();
        });

        test('without a tabGroup, a member moved within its group still leaves its tab group', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b', 'd']);

            dockview.getGroupPanel('a')!.api.moveTo({ group, index: 3 });

            expect(x.panelIds).toEqual(['b', 'd']);
            expect(strip(group)).toEqual(['b', 'd', 'c', 'a']);

            dockview.dispose();
        });
    });

    describe('tab drops', () => {
        test('a drop between two members joins the tab group at that slot', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b', 'd']);

            dropOnStrip(dockview, group, 'c', 1, x.id);

            expect(x.panelIds).toEqual(['a', 'c', 'b', 'd']);
            expect(strip(group)).toEqual(['a', 'c', 'b', 'd']);

            dockview.dispose();
        });

        test('an ungrouped drop between two members snaps to the nearer edge', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b', 'd']);

            dropOnStrip(dockview, group, 'c', 1, null);

            expect(x.panelIds).toEqual(['a', 'b', 'd']);
            expect(strip(group)).toEqual(['c', 'a', 'b', 'd']);

            dockview.dispose();
        });

        test('a lone tab dropped at its own slot still leaves its tab group', () => {
            const { dockview, group } = setup(['a']);
            createTabGroup(dockview, group, ['a']);

            dropOnStrip(dockview, group, 'a', 0, null);

            expect(group.model.getTabGroups()).toEqual([]);
            expect(strip(group)).toEqual(['a']);

            dockview.dispose();
        });

        test('a tab from another dockview instance leaves a same-id panel alone', () => {
            const { dockview, group } = setup(['a', 'b', 'c']);
            const x = createTabGroup(dockview, group, ['a', 'b']);

            dropOnStrip(dockview, group, 'c', 1, x.id, 'another-instance');
            dropOnStrip(dockview, group, 'a', 0, null, 'another-instance');

            expect(x.panelIds).toEqual(['a', 'b']);
            expect(strip(group)).toEqual(['a', 'b', 'c']);

            dockview.dispose();
        });

        test('a cancelled drop still applies its tab group change in place', () => {
            const { dockview, group } = setup(['a', 'b', 'c']);
            const x = createTabGroup(dockview, group, ['a', 'b']);
            dockview.onWillDrop((event) => event.preventDefault());

            dropOnStrip(dockview, group, 'c', 2, x.id);

            expect(x.panelIds).toEqual(['a', 'b', 'c']);
            expect(strip(group)).toEqual(['a', 'b', 'c']);

            dockview.dispose();
        });
    });

    describe('one source of truth', () => {
        test('tabGroup.addPanel and removePanel keep the strip in order', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b']);
            const added: string[] = [];
            const removed: string[] = [];
            dockview.api.onDidAddPanelToTabGroup((e) => added.push(e.panelId));
            dockview.api.onDidRemovePanelFromTabGroup((e) =>
                removed.push(e.panelId)
            );

            x.addPanel('d', 1);
            expect(x.panelIds).toEqual(['a', 'd', 'b']);
            expect(strip(group)).toEqual(['a', 'd', 'b', 'c']);

            expect(x.removePanel('a')).toBe(true);
            expect(x.removePanel('c')).toBe(false);
            expect(strip(group)).toEqual(['a', 'd', 'b', 'c']);
            expect(x.panelIds).toEqual(['d', 'b']);

            expect(added).toEqual(['d']);
            expect(removed).toEqual(['a']);

            dockview.dispose();
        });

        test('moveTabGroup never lands inside another tab group', () => {
            const { dockview, group } = setup(['a', 'b', 'c', 'd', 'e']);
            const x = createTabGroup(dockview, group, ['a', 'b'], 'X');
            createTabGroup(dockview, group, ['c', 'd'], 'Y');

            // index 3 of the full strip is between c and d
            group.model.moveTabGroup(x.id, 3);

            expect(strip(group)).toEqual(['c', 'd', 'a', 'b', 'e']);
            expect(tabCount(group)).toBe(5);

            dockview.dispose();
        });

        test('disposing a tab group leaves its members in place', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['b', 'c']);

            x.dispose();
            dockview.getGroupPanel('d')!.api.moveTo({ group, index: 2 });

            expect(group.model.getTabGroups()).toEqual([]);
            expect(strip(group)).toEqual(['a', 'b', 'd', 'c']);

            dockview.dispose();
        });

        test('tabs keep their element when the order changes', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b']);
            const tabIds = (): Record<string, string | undefined> =>
                Object.fromEntries(
                    group.panels.map((p) => [
                        p.id,
                        group.model.header.getTabId(p.id),
                    ])
                );
            const before = tabIds();

            dockview.api.addPanelToTabGroup({
                groupId: group.id,
                panelId: 'c',
                tabGroupId: x.id,
            });
            dockview.getGroupPanel('d')!.api.moveTo({
                group,
                tabGroup: x,
                indexInTabGroup: 0,
            });
            group.model.moveTabGroup(x.id, 0);

            expect(strip(group)).toEqual(['d', 'a', 'b', 'c']);
            expect(tabIds()).toEqual(before);
            expect(
                Array.from(group.element.querySelectorAll('.dv-tab')).map(
                    (el) => (el as HTMLElement).dataset.tabPanelId
                )
            ).toEqual(['d', 'a', 'b', 'c']);

            dockview.dispose();
        });

        test('a moved tab keeps focus', () => {
            const container = document.createElement('div');
            document.body.appendChild(container);
            const dockview = new DockviewComponent(container, {
                createComponent: () => new TestContent(),
            });
            dockview.layout(1000, 500);
            for (const id of ['a', 'b', 'c']) {
                dockview.addPanel({ id, component: 'default' });
            }
            const group = dockview.groups[0];
            const tab = document.getElementById(
                group.model.header.getTabId('a')!
            )!;
            tab.focus();
            expect(document.activeElement).toBe(tab);

            dockview.getGroupPanel('a')!.api.moveTo({ group, index: 2 });

            expect(strip(group)).toEqual(['b', 'c', 'a']);
            expect(document.activeElement).toBe(tab);

            dockview.dispose();
            container.remove();
        });

        test('moving the only member into its own tab group keeps the panel', () => {
            const { dockview, group } = setup(['a', 'b']);
            const x = createTabGroup(dockview, group, ['a']);

            group.model.movePanelBetweenGroups('a', x.id, 0);

            expect(strip(group)).toEqual(['a', 'b']);
            expect(group.model.size).toBe(2);
            expect(tabCount(group)).toBe(2);

            dockview.dispose();
        });

        test('a disposed tab group no longer changes membership', () => {
            const { dockview, group } = setup(['a', 'b']);
            const old = group.model.createTabGroup({ id: 'g' });
            old.addPanel('a');
            old.removePanel('a'); // empties and disposes it
            const replacement = group.model.createTabGroup({ id: 'g' });

            old.addPanel('b');
            expect(old.removePanel('b')).toBe(false);

            expect(replacement.panelIds).toEqual([]);
            expect(
                dockview.api.getTabGroupForPanel({
                    groupId: group.id,
                    panelId: 'b',
                })
            ).toBeUndefined();

            dockview.dispose();
        });

        test('joining through moveTo within the group fires only the tab group events', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['a', 'b']);
            const events: string[] = [];
            group.model.onDidRemovePanel((e) =>
                events.push(`remove ${e.panel.id}`)
            );
            group.model.onDidAddPanel((e) => events.push(`add ${e.panel.id}`));
            x.onDidPanelChange((e) =>
                events.push(`member ${e.type} ${e.panelId}`)
            );
            dockview.api.onDidAddPanelToTabGroup((e) =>
                events.push(`join ${e.panelId}`)
            );

            dockview.getGroupPanel('d')!.api.moveTo({ group, tabGroup: x });

            // a reorder within the group: no remove or add
            expect(events).toEqual(['member add d', 'join d']);

            dockview.dispose();
        });

        test('a saved panel listed in two tab groups stays in the first', () => {
            const { dockview, group } = setup(['a', 'b', 'c']);
            const removed: string[] = [];
            group.model.restoreTabGroups([
                { id: 't1', collapsed: false, panelIds: ['a', 'b'] },
                { id: 't2', collapsed: false, panelIds: ['b', 'c'] },
            ]);
            const [t1, t2] = group.model.getTabGroups();
            t1.onDidPanelChange((e) => removed.push(e.panelId));

            expect(t1.panelIds).toEqual(['a', 'b']);
            expect(t2.panelIds).toEqual(['c']);
            expect(strip(group)).toEqual(['a', 'b', 'c']);
            expect(removed).toEqual([]);

            dockview.dispose();
        });
    });

    describe('moving within a group', () => {
        test('is a move: no remove or add, and the active panel never changes', () => {
            const { dockview, group } = setup();
            const b = dockview.getGroupPanel('b')!;
            b.api.setActive();
            const events: string[] = [];
            group.model.onDidRemovePanel((e) =>
                events.push(`remove ${e.panel.id}`)
            );
            group.model.onDidAddPanel((e) => events.push(`add ${e.panel.id}`));
            group.model.onDidActivePanelChange((e) =>
                events.push(`active ${e.panel?.id}`)
            );
            group.model.onDidChangeTabOrder(() => events.push('order'));
            dockview.onDidMovePanel((e) => events.push(`move ${e.panel.id}`));

            b.api.moveTo({ group, index: 3 });

            expect(strip(group)).toEqual(['a', 'c', 'd', 'b']);
            expect(events).toEqual(['order', 'move b']);
            expect(group.activePanel).toBe(b);

            dockview.dispose();
        });

        test('keeps an inactive panel inactive with skipSetActive', () => {
            const { dockview, group } = setup();
            const a = dockview.getGroupPanel('a')!;
            const d = dockview.getGroupPanel('d')!;
            a.api.setActive();

            d.api.moveTo({ group, index: 0, skipSetActive: true });

            expect(strip(group)).toEqual(['d', 'a', 'b', 'c']);
            expect(group.activePanel).toBe(a);

            dockview.dispose();
        });

        test('collapsing the active tab group with nothing else to show clears the highlight', () => {
            const { dockview, group } = setup(['a', 'b']);
            const x = createTabGroup(dockview, group, ['a', 'b']);
            dockview.getGroupPanel('b')!.api.setActive();

            x.collapse();

            expect(group.activePanel).toBeUndefined();
            expect(
                group.element.querySelectorAll('.dv-active-tab')
            ).toHaveLength(0);

            dockview.dispose();
        });

        test('getTabGroupsInTabOrder follows the strip, not creation order', () => {
            const { dockview, group } = setup();
            const x = createTabGroup(dockview, group, ['c', 'd'], 'X');
            const y = createTabGroup(dockview, group, ['a', 'b'], 'Y');

            expect(group.model.getTabGroups()).toEqual([x, y]);
            expect(group.model.getTabGroupsInTabOrder()).toEqual([y, x]);

            dockview.dispose();
        });

        test('restoring a tab group fires add only for panels that joined it', () => {
            const { dockview, group } = setup(['a', 'b']);
            const added: string[] = [];
            const original = group.model.createTabGroup.bind(group.model);
            jest.spyOn(group.model, 'createTabGroup').mockImplementation(
                (options) => {
                    const tabGroup = original(options);
                    tabGroup.onDidPanelChange((e) => added.push(e.panelId));
                    return tabGroup;
                }
            );

            group.model.restoreTabGroups([
                { id: 't1', collapsed: false, panelIds: ['a', 'missing', 'b'] },
            ]);

            expect(added).toEqual(['a', 'b']);

            dockview.dispose();
        });
    });
});
