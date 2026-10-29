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

function createDockview(options: {
    closeEmptyGroups?: boolean;
    noPanelsOverlay?: 'emptyGroup' | 'watermark';
}): DockviewComponent {
    const container = document.createElement('div');
    const dockview = new DockviewComponent(container, {
        createComponent: () => new TestPanel(),
        ...options,
    });
    dockview.layout(1000, 600);
    return dockview;
}

/** Two grid groups side by side: g1 holds p1, g2 holds p2 and p3. */
function twoGroups(dockview: DockviewComponent) {
    const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
    const p2 = dockview.addPanel({
        id: 'p2',
        component: 'default',
        position: { referencePanel: 'p1', direction: 'right' },
    });
    const p3 = dockview.addPanel({
        id: 'p3',
        component: 'default',
        position: { referenceGroup: p2.group },
    });
    return { p1, p2, p3, g1: p1.group, g2: p2.group };
}

/** The groups that live in the grid itself (not edge, floating or popout). */
function gridGroups(dockview: DockviewComponent) {
    return dockview.groups.filter((g) => g.api.location.type === 'grid');
}

function panelIds(dockview: DockviewComponent, groupId: string): string[] {
    return dockview.getPanel(groupId)!.panels.map((p) => p.id);
}

/**
 * `closeEmptyGroups: false` keeps a group in the layout when its last panel
 * is closed or moved out, until the group itself is closed (#1687). The
 * default (`true`) removes the emptied group, as before.
 */
describe('closeEmptyGroups', () => {
    const originalOpen = window.open;

    afterEach(() => {
        window.open = originalOpen;
    });

    describe('default', () => {
        test('closing the last panel removes the group', () => {
            const dockview = createDockview({});
            const { p1, g1 } = twoGroups(dockview);

            p1.api.close();

            expect(dockview.groups).not.toContain(g1);
            expect(dockview.size).toBe(1);
        });

        test('api.removePanel(panel, { removeEmptyGroup: false }) keeps the group', () => {
            const dockview = createDockview({});
            const { p1, g1 } = twoGroups(dockview);

            dockview.api.removePanel(p1, { removeEmptyGroup: false });

            expect(dockview.groups).toContain(g1);
            expect(g1.panels).toHaveLength(0);
        });

        test('moving a lone panel to an edge relocates its group', () => {
            const dockview = createDockview({});
            const { g1, g2 } = twoGroups(dockview);

            dockview.moveGroupOrPanel({
                from: { groupId: g1.id, panelId: 'p1' },
                to: { group: g2, position: 'bottom' },
            });

            expect(dockview.size).toBe(2);
            expect(panelIds(dockview, g1.id)).toEqual(['p1']);
        });

        test("closeAllGroups() keeps the last group under noPanelsOverlay 'emptyGroup'", () => {
            const dockview = createDockview({ noPanelsOverlay: 'emptyGroup' });
            twoGroups(dockview);

            dockview.closeAllGroups();

            expect(dockview.size).toBe(1);
            expect(dockview.totalPanels).toBe(0);
        });

        test('closeAllGroups() keeps the last grid group when an edge group is present', () => {
            const dockview = createDockview({ noPanelsOverlay: 'emptyGroup' });
            const { g2 } = twoGroups(dockview);
            dockview.addEdgeGroup('left', { id: 'left-group' });
            dockview.addPanel({
                id: 'e1',
                component: 'default',
                position: { referenceGroup: 'left-group' },
            });

            dockview.closeAllGroups();

            expect(dockview.totalPanels).toBe(0);
            expect(gridGroups(dockview).map((g) => g.id)).toEqual([g2.id]);
            // the edge group is structural: it empties but is never removed
            expect(dockview.getEdgeGroupPanel('left')!.panels).toHaveLength(0);
        });

        test('closeAllGroups() does not count a floating group as the last group', () => {
            const dockview = createDockview({ noPanelsOverlay: 'emptyGroup' });
            const { p3, g1, g2 } = twoGroups(dockview);
            dockview.addFloatingGroup(p3);
            const floating = p3.group;
            expect(floating).not.toBe(g2);

            dockview.closeAllGroups();

            expect(dockview.totalPanels).toBe(0);
            expect(gridGroups(dockview).map((g) => g.id)).toEqual([g2.id]);
            expect(dockview.groups).not.toContain(g1);
            expect(dockview.groups).not.toContain(floating);
        });

        test("closing the only panel of an edge group never keeps it as the 'last group'", () => {
            const dockview = createDockview({ noPanelsOverlay: 'emptyGroup' });
            dockview.addEdgeGroup('left', { id: 'left-group' });
            const e1 = dockview.addPanel({
                id: 'e1',
                component: 'default',
                position: { referenceGroup: 'left-group' },
            });
            const spy = jest.spyOn(dockview, 'removePanel');

            e1.api.close();

            // the keep-last rule is for grid groups: an edge group's panel is
            // removed on the ordinary path, leaving the group to collapse
            expect(spy).toHaveBeenCalledWith(e1, undefined);
            expect(dockview.getEdgeGroupPanel('left')!.panels).toHaveLength(0);
        });

        test('popping out a lone panel takes its group along', async () => {
            window.open = () => setupMockWindow();
            const dockview = createDockview({});
            const { p1, g1 } = twoGroups(dockview);

            await dockview.addPopoutGroup(p1);

            expect(dockview.groups).toContain(g1);
            expect(g1.api.isVisible).toBe(false);
        });

        test("noPanelsOverlay 'emptyGroup' still keeps only the last group", () => {
            const dockview = createDockview({ noPanelsOverlay: 'emptyGroup' });
            const { p1, p2, p3, g1, g2 } = twoGroups(dockview);

            p1.api.close();
            expect(dockview.groups).not.toContain(g1);

            p2.api.close();
            p3.api.close();
            expect(dockview.groups).toContain(g2);
            expect(dockview.size).toBe(1);
        });
    });

    describe('closeEmptyGroups: false', () => {
        test('panel.api.close() keeps the group, showing its watermark', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            const { p1, g1 } = twoGroups(dockview);

            p1.api.close();

            expect(dockview.groups).toContain(g1);
            expect(g1.panels).toHaveLength(0);
            expect(g1.model.hasWatermark).toBe(true);
            expect(dockview.size).toBe(2);
        });

        test('api.removePanel() keeps the group unless told otherwise', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            const { p1, p2, p3, g1, g2 } = twoGroups(dockview);

            dockview.api.removePanel(p1);
            expect(dockview.groups).toContain(g1);

            dockview.api.removePanel(p2);
            dockview.api.removePanel(p3, { removeEmptyGroup: true });
            expect(dockview.groups).not.toContain(g2);
        });

        test('the emptied group stays active with no active panel', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            const { p1, g1 } = twoGroups(dockview);
            dockview.doSetGroupAndPanelActive(g1);

            p1.api.close();

            expect(dockview.activeGroup).toBe(g1);
            expect(dockview.activePanel).toBeUndefined();
        });

        test('the only group survives closing its last panel', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            const g1 = p1.group;

            p1.api.close();

            expect(dockview.groups).toEqual([g1]);
            expect(g1.model.hasWatermark).toBe(true);
        });

        test('moving the last panel into another group keeps the source', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            const { g1, g2 } = twoGroups(dockview);

            dockview.moveGroupOrPanel({
                from: { groupId: g1.id, panelId: 'p1' },
                to: { group: g2, position: 'center' },
            });

            expect(dockview.groups).toContain(g1);
            expect(g1.panels).toHaveLength(0);
            expect(panelIds(dockview, g2.id)).toEqual(['p2', 'p3', 'p1']);
        });

        test('moving a lone panel to an edge leaves its group in place', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            const { g1, g2 } = twoGroups(dockview);

            dockview.moveGroupOrPanel({
                from: { groupId: g1.id, panelId: 'p1' },
                to: { group: g2, position: 'bottom' },
            });

            expect(dockview.size).toBe(3);
            expect(dockview.groups).toContain(g1);
            expect(g1.panels).toHaveLength(0);
            expect(dockview.getGroupPanel('p1')!.group).not.toBe(g1);
        });

        test('moving a lone panel to the edge of its own group', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            const { g1 } = twoGroups(dockview);

            dockview.moveGroupOrPanel({
                from: { groupId: g1.id, panelId: 'p1' },
                to: { group: g1, position: 'bottom' },
            });

            expect(dockview.size).toBe(3);
            expect(g1.panels).toHaveLength(0);
            expect(dockview.getGroupPanel('p1')!.group).not.toBe(g1);
        });

        test('group.api.close() and api.removeGroup() still remove the group', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            const { g1, g2 } = twoGroups(dockview);

            g1.api.close();
            expect(dockview.groups).not.toContain(g1);

            dockview.api.removeGroup(g2);
            expect(dockview.groups).not.toContain(g2);
            expect(dockview.size).toBe(0);
        });

        test('closeAllGroups() removes the groups, not only their panels', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            twoGroups(dockview);

            dockview.closeAllGroups();

            expect(dockview.size).toBe(0);
            expect(dockview.totalPanels).toBe(0);
        });

        test("closeAllGroups() keeps one group under noPanelsOverlay 'emptyGroup'", () => {
            const dockview = createDockview({
                closeEmptyGroups: false,
                noPanelsOverlay: 'emptyGroup',
            });
            twoGroups(dockview);

            dockview.closeAllGroups();

            expect(dockview.size).toBe(1);
            expect(dockview.totalPanels).toBe(0);
        });

        test('closeAllGroups() keeps the last grid group when an edge group is present', () => {
            const dockview = createDockview({
                closeEmptyGroups: false,
                noPanelsOverlay: 'emptyGroup',
            });
            const { g2 } = twoGroups(dockview);
            dockview.addEdgeGroup('left', { id: 'left-group' });
            dockview.addPanel({
                id: 'e1',
                component: 'default',
                position: { referenceGroup: 'left-group' },
            });

            dockview.closeAllGroups();

            expect(dockview.totalPanels).toBe(0);
            expect(gridGroups(dockview).map((g) => g.id)).toEqual([g2.id]);
            expect(dockview.getEdgeGroupPanel('left')!.panels).toHaveLength(0);
        });

        test('clear() removes everything', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            twoGroups(dockview);

            dockview.clear();

            expect(dockview.size).toBe(0);
        });

        test('an empty grid group round-trips through toJSON/fromJSON', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            const { p1, g1 } = twoGroups(dockview);
            p1.api.close();

            const restored = createDockview({ closeEmptyGroups: false });
            restored.fromJSON(dockview.toJSON());

            expect(restored.size).toBe(2);
            const emptyGroup = restored.getPanel(g1.id)!;
            expect(emptyGroup.panels).toHaveLength(0);
            expect(emptyGroup.model.hasWatermark).toBe(true);
        });

        test('floating a lone panel keeps its grid group', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            const { p1, g1 } = twoGroups(dockview);

            dockview.addFloatingGroup(p1);

            expect(p1.group.api.location.type).toBe('floating');
            expect(dockview.groups).toContain(g1);
            expect(g1.panels).toHaveLength(0);
        });

        test('an emptied floating group stays open and round-trips', () => {
            const dockview = createDockview({ closeEmptyGroups: false });
            const { p1, g2 } = twoGroups(dockview);
            dockview.addFloatingGroup(p1);
            const floating = p1.group;

            dockview.moveGroupOrPanel({
                from: { groupId: floating.id, panelId: 'p1' },
                to: { group: g2, position: 'center' },
            });

            expect(dockview.floatingGroups).toHaveLength(1);
            expect(floating.panels).toHaveLength(0);

            const restored = createDockview({ closeEmptyGroups: false });
            restored.fromJSON(dockview.toJSON());
            expect(restored.floatingGroups).toHaveLength(1);
            expect(restored.floatingGroups[0].group.panels).toHaveLength(0);
        });

        describe('popout groups', () => {
            beforeEach(() => {
                window.open = () => setupMockWindow();
            });

            test('an emptied popout group stays open and round-trips', async () => {
                const dockview = createDockview({ closeEmptyGroups: false });
                const { p1, g2 } = twoGroups(dockview);
                await dockview.addPopoutGroup(p1);
                const popout = p1.group;

                dockview.moveGroupOrPanel({
                    from: { groupId: popout.id, panelId: 'p1' },
                    to: { group: g2, position: 'center' },
                });

                expect(dockview.getPopouts()).toHaveLength(1);
                expect(popout.panels).toHaveLength(0);

                const restored = createDockview({ closeEmptyGroups: false });
                restored.fromJSON(dockview.toJSON());
                for (
                    let i = 0;
                    i < 50 && restored.getPopouts().length === 0;
                    i++
                ) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
                expect(restored.getPopouts()).toHaveLength(1);
                expect(restored.getPopouts()[0].group.panels).toHaveLength(0);
            });

            test('popping out a lone panel leaves its group in the grid', async () => {
                const dockview = createDockview({ closeEmptyGroups: false });
                const { p1, g1 } = twoGroups(dockview);

                await dockview.addPopoutGroup(p1);

                expect(p1.group.api.location.type).toBe('popout');
                expect(p1.group).not.toBe(g1);
                expect(dockview.groups).toContain(g1);
                expect(g1.api.isVisible).toBe(true);
                expect(g1.panels).toHaveLength(0);
                expect(g1.model.hasWatermark).toBe(true);
            });

            test('closing the popout group of a lone panel keeps its empty grid group', async () => {
                const dockview = createDockview({ closeEmptyGroups: false });
                const { p1, g1 } = twoGroups(dockview);
                await dockview.addPopoutGroup(p1);

                p1.group.api.close();

                expect(dockview.getPopouts()).toHaveLength(0);
                expect(dockview.groups).toContain(g1);
                expect(g1.api.isVisible).toBe(true);
            });

            test('closing a whole-group popout still removes its hidden reference group', async () => {
                const dockview = createDockview({ closeEmptyGroups: false });
                const { g1 } = twoGroups(dockview);
                await dockview.addPopoutGroup(g1);
                const popout = dockview.getPopouts()[0].group;
                expect(g1.api.isVisible).toBe(false);

                popout.api.close();

                expect(dockview.groups).not.toContain(g1);
                expect(dockview.size).toBe(1);
            });

            test('closing the window of an emptied popout returns an empty group to the grid', async () => {
                const dockview = createDockview({ closeEmptyGroups: false });
                const { p1, g1, g2 } = twoGroups(dockview);
                await dockview.addPopoutGroup(p1);
                const popout = p1.group;

                dockview.moveGroupOrPanel({
                    from: { groupId: popout.id, panelId: 'p1' },
                    to: { group: g2, position: 'center' },
                });
                dockview.getPopouts()[0].window.close();

                expect(dockview.getPopouts()).toHaveLength(0);
                expect(dockview.groups).toContain(g1);
                expect(g1.api.isVisible).toBe(true);
                expect(g1.panels).toHaveLength(0);
            });

            test('moving a lone grid panel to the edge of a popout group keeps the grid group', async () => {
                const dockview = createDockview({ closeEmptyGroups: false });
                const { p1, p2, g1 } = twoGroups(dockview);
                await dockview.addPopoutGroup(p2);

                dockview.moveGroupOrPanel({
                    from: { groupId: g1.id, panelId: 'p1' },
                    to: { group: p2.group, position: 'right' },
                });

                expect(g1.api.location.type).toBe('grid');
                expect(g1.panels).toHaveLength(0);
                expect(p1.group.api.location.type).toBe('popout');
            });
        });
    });
});
