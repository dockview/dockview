import {
    DockviewComponent,
    DockviewLayoutMutationKind,
} from '../../dockview/dockviewComponent';
import { DockviewGroupLocation } from '../../dockview/dockviewGroupPanelModel';
import { DockviewPanel } from '../../dockview/dockviewPanel';
import { IContentRenderer } from '../../dockview/types';
import { Orientation } from '../../splitview/splitview';
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
 * One row per way a panel can be relocated, and what each way reports. The
 * individual specs - `movePanelEvents.spec.ts` for payloads,
 * `panelLocationEvents.spec.ts` for locations - cover each path in depth; this
 * is the matrix laid out side by side, so a path that reports *nothing* is
 * visible as an empty row rather than as a spec nobody wrote. Both defects
 * fixed alongside it (a popout window closing, and a group merged onto
 * another's centre) were silent paths of exactly that kind.
 *
 * It doubles as the source for the relocation table in `docs/core/events.mdx`;
 * the two are meant to agree row for row.
 */
describe('relocation event matrix', () => {
    type Move = { panel: string; sameGroup: boolean };

    type RelocationPath = {
        /** matches the description in the docs table */
        name: string;
        arrange: (dockview: DockviewComponent) => Promise<void> | void;
        relocate: (dockview: DockviewComponent) => Promise<void> | void;
        /**
         * The `onDidMovePanel` events, in order. `sameGroup` is `to === from`:
         * true when the group itself moved and kept its panels, false when the
         * panels were rehomed into a different group.
         */
        moves: Move[];
        /** where the moved panels report they are once it has settled */
        location?: DockviewGroupLocation['type'];
        /** the transactions bracketing the whole operation */
        brackets: DockviewLayoutMutationKind[];
    };

    const paths: RelocationPath[] = [
        {
            name: 'panel dropped into another grid group',
            arrange: (dockview) => {
                dockview.addPanel({ id: 'p1', component: 'default' });
                dockview.addPanel({ id: 'p2', component: 'default' });
            },
            relocate: (dockview) => {
                dockview.moveGroupOrPanel({
                    from: {
                        groupId: dockview.getGroupPanel('p2')!.group.id,
                        panelId: 'p2',
                    },
                    to: {
                        group: dockview.getGroupPanel('p1')!.group,
                        position: 'right',
                    },
                });
            },
            moves: [{ panel: 'p2', sameGroup: false }],
            location: 'grid',
            brackets: ['move'],
        },
        {
            name: 'panel extracted into a floating window',
            arrange: (dockview) => {
                dockview.addPanel({ id: 'p1', component: 'default' });
                dockview.addPanel({ id: 'p2', component: 'default' });
            },
            relocate: (dockview) =>
                dockview.addFloatingGroup(
                    dockview.getGroupPanel('p2') as DockviewPanel
                ),
            moves: [{ panel: 'p2', sameGroup: false }],
            location: 'floating',
            brackets: ['float'],
        },
        {
            name: 'panel extracted into a popout window',
            arrange: (dockview) => {
                dockview.addPanel({ id: 'p1', component: 'default' });
                dockview.addPanel({ id: 'p2', component: 'default' });
            },
            relocate: async (dockview) => {
                await dockview.addPopoutGroup(
                    dockview.getGroupPanel('p2') as DockviewPanel
                );
            },
            moves: [{ panel: 'p2', sameGroup: false }],
            location: 'popout',
            brackets: ['popout'],
        },
        {
            name: 'whole group floated',
            arrange: (dockview) => {
                dockview.addPanel({ id: 'p1', component: 'default' });
                dockview.addPanel({ id: 'p2', component: 'default' });
            },
            relocate: (dockview) =>
                dockview.addFloatingGroup(dockview.getGroupPanel('p1')!.group),
            // the group is relocated intact, so its panels keep it
            moves: [
                { panel: 'p1', sameGroup: true },
                { panel: 'p2', sameGroup: true },
            ],
            location: 'floating',
            brackets: ['float'],
        },
        {
            name: 'whole group popped out',
            arrange: (dockview) => {
                dockview.addPanel({ id: 'p1', component: 'default' });
                dockview.addPanel({ id: 'p2', component: 'default' });
            },
            relocate: async (dockview) => {
                await dockview.addPopoutGroup(
                    dockview.getGroupPanel('p1')!.group
                );
            },
            // unlike floating, the group is rebuilt in the new window
            moves: [
                { panel: 'p1', sameGroup: false },
                { panel: 'p2', sameGroup: false },
            ],
            location: 'popout',
            brackets: ['popout'],
        },
        {
            name: 'group relocated within the grid',
            arrange: (dockview) => {
                dockview.addPanel({ id: 'p1', component: 'default' });
                dockview.addPanel({
                    id: 'p2',
                    component: 'default',
                    position: { direction: 'right' },
                });
            },
            relocate: (dockview) =>
                dockview.moveGroup({
                    from: { group: dockview.getGroupPanel('p2')!.group },
                    to: {
                        group: dockview.getGroupPanel('p1')!.group,
                        position: 'left',
                    },
                }),
            moves: [{ panel: 'p2', sameGroup: true }],
            location: 'grid',
            brackets: ['move'],
        },
        {
            name: 'group merged onto another group centre',
            arrange: (dockview) => {
                dockview.addPanel({ id: 'p1', component: 'default' });
                dockview.addPanel({
                    id: 'p2',
                    component: 'default',
                    position: { direction: 'right' },
                });
                dockview.addPanel({
                    id: 'p3',
                    component: 'default',
                    position: { referencePanel: 'p2' },
                });
            },
            relocate: (dockview) =>
                dockview.moveGroup({
                    from: { group: dockview.getGroupPanel('p2')!.group },
                    to: {
                        group: dockview.getGroupPanel('p1')!.group,
                        position: 'center',
                    },
                }),
            // the source group is emptied into the destination and discarded
            moves: [
                { panel: 'p2', sameGroup: false },
                { panel: 'p3', sameGroup: false },
            ],
            location: 'grid',
            brackets: ['move'],
        },
        {
            name: 'panel dragged out of an edge group',
            arrange: (dockview) => {
                dockview.addEdgeGroup('left', { id: 'edge' });
                dockview.addPanel({ id: 'p1', component: 'default' });
                dockview.addPanel({ id: 'p2', component: 'default' });
                dockview.getGroupPanel('p2')!.api.moveTo({
                    group: dockview.groups.find((g) => g.id === 'edge')!,
                });
            },
            relocate: (dockview) => {
                dockview.moveGroupOrPanel({
                    from: { groupId: 'edge', panelId: 'p2' },
                    to: {
                        group: dockview.getGroupPanel('p1')!.group,
                        position: 'right',
                    },
                });
            },
            moves: [{ panel: 'p2', sameGroup: false }],
            location: 'grid',
            brackets: ['move'],
        },
        {
            name: 'popout window closed',
            arrange: async (dockview) => {
                dockview.addPanel({ id: 'p1', component: 'default' });
                dockview.addPanel({ id: 'p2', component: 'default' });
                await dockview.addPopoutGroup(
                    dockview.getGroupPanel('p1')!.group
                );
            },
            relocate: (dockview) => dockview.getPopouts()[0].window.close(),
            // the panels return to the group the popout left behind
            moves: [
                { panel: 'p1', sameGroup: false },
                { panel: 'p2', sameGroup: false },
            ],
            location: 'grid',
            /**
             * The one path that reports moves without a transaction around
             * them. A window closing is driven by the browser rather than by a
             * call into the component, so nothing opens a bracket. Recorded
             * here as current behaviour, deliberately, so the asymmetry is
             * visible rather than merely absent - it is not a guarantee.
             */
            brackets: [],
        },
        {
            name: 'popout window closed, re-floating its group',
            arrange: async (dockview) => {
                dockview.addPanel({ id: 'p1', component: 'default' });
                dockview.addPanel({ id: 'p2', component: 'default' });
                dockview.addFloatingGroup(dockview.getGroupPanel('p1')!.group);
                await dockview.addPopoutGroup(
                    dockview.getGroupPanel('p1')!.group
                );
            },
            relocate: (dockview) => dockview.getPopouts()[0].window.close(),
            moves: [
                { panel: 'p1', sameGroup: true },
                { panel: 'p2', sameGroup: true },
            ],
            location: 'floating',
            // the re-float runs through `addFloatingGroup`, which brackets
            brackets: ['float'],
        },
        {
            name: 'floating groups restored from JSON',
            arrange: () => {
                // noop
            },
            relocate: (dockview) =>
                dockview.fromJSON({
                    grid: {
                        root: {
                            type: 'branch',
                            data: [
                                {
                                    type: 'leaf',
                                    data: {
                                        views: ['p1'],
                                        id: 'g1',
                                        activeView: 'p1',
                                    },
                                    size: 1000,
                                },
                            ],
                            size: 1000,
                        },
                        height: 1000,
                        width: 1000,
                        orientation: Orientation.HORIZONTAL,
                    },
                    panels: {
                        p1: {
                            id: 'p1',
                            contentComponent: 'default',
                            title: 'p1',
                        },
                        p2: {
                            id: 'p2',
                            contentComponent: 'default',
                            title: 'p2',
                        },
                    },
                    floatingGroups: [
                        {
                            data: {
                                views: ['p2'],
                                id: 'g2',
                                activeView: 'p2',
                            },
                            position: {
                                left: 10,
                                top: 10,
                                width: 200,
                                height: 200,
                            },
                        },
                    ],
                }),
            // building a layout is not relocating within one
            moves: [],
            brackets: ['load'],
        },
        {
            name: 'panel added directly into a floating window',
            arrange: () => {
                // noop
            },
            relocate: (dockview) => {
                dockview.addPanel({
                    id: 'p1',
                    component: 'default',
                    floating: true,
                });
            },
            moves: [],
            brackets: ['add'],
        },
    ];

    test.each(
        paths.map((path) => [path.name, path] as const)
    )('%s', async (_name, path) => {
        window.open = () => setupMockWindow();
        const dockview = new DockviewComponent(document.createElement('div'), {
            createComponent: () => new TestPanel(),
        });
        dockview.layout(1000, 1000);

        await path.arrange(dockview);

        const moves: Move[] = [];
        const locations: string[] = [];
        const brackets: DockviewLayoutMutationKind[] = [];
        const locationEvents: Record<string, number> = {};

        dockview.onDidMovePanel((event) => {
            moves.push({
                panel: event.panel.id,
                sameGroup: event.to.id === event.from.id,
            });
            locations.push(event.panel.api.location.type);

            // invariants every path owes the caller: the move is reported
            // once it has settled, so `to` is the panel's group by then and
            // the panel is back in the layout - never mid-transition
            expect(event.to.id).toBe(event.panel.group.id);
            expect(
                dockview.panels.some((panel) => panel.id === event.panel.id)
            ).toBe(true);
        });
        dockview.onDidMutateLayout((event) => brackets.push(event.kind));
        for (const panel of dockview.panels) {
            panel.api.onDidLocationChange(() => {
                locationEvents[panel.id] = (locationEvents[panel.id] ?? 0) + 1;
            });
        }

        await path.relocate(dockview);

        expect(moves).toEqual(path.moves);
        expect(brackets).toEqual(path.brackets);

        if (path.location) {
            expect(locations).toEqual(path.moves.map(() => path.location));
        }

        // a relocated panel reports its location exactly once, never once
        // per internal step of the move
        expect(locationEvents).toEqual(
            Object.fromEntries(path.moves.map((move) => [move.panel, 1]))
        );

        dockview.dispose();
    });
});
