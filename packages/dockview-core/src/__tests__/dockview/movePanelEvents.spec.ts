import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
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

type Recorded = {
    panel: string;
    from: string;
    to: string;
    location: string;
};

/**
 * `onDidMovePanel` is the single event a consumer can use to mirror panel
 * relocations into their own model. It must fire for every way a panel changes
 * group - including being extracted into a new floating or popout window - and
 * must report both ends of the move.
 */
describe('onDidMovePanel', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;
    let recorded: Recorded[];

    beforeEach(() => {
        window.open = () => setupMockWindow();
        container = document.createElement('div');
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });
        dockview.layout(1000, 1000);
    });

    afterEach(() => dockview.dispose());

    function record(): void {
        recorded = [];
        dockview.onDidMovePanel((event) =>
            recorded.push({
                panel: event.panel.id,
                from: event.from.id,
                to: event.to.id,
                location: event.panel.api.location.type,
            })
        );
    }

    test('fires when a panel is dropped into a new group in the grid', () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        const originalGroup = panel1.group;

        record();

        dockview.moveGroupOrPanel({
            from: { groupId: panel2.group.id, panelId: 'panel2' },
            to: { group: panel1.group, position: 'right' },
        });

        expect(recorded).toHaveLength(1);
        expect(recorded[0].panel).toBe('panel2');
        expect(recorded[0].from).toBe(originalGroup.id);
        expect(recorded[0].to).toBe(panel2.group.id);
        expect(recorded[0].to).not.toBe(recorded[0].from);
        expect(recorded[0].location).toBe('grid');
    });

    test('fires when a panel is extracted into a new floating group', () => {
        dockview.addPanel({ id: 'panel1', component: 'default' });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        const originalGroup = panel2.group;

        record();

        dockview.addFloatingGroup(panel2 as DockviewPanel, {
            inDragMode: true,
        });

        expect(recorded).toHaveLength(1);
        expect(recorded[0].panel).toBe('panel2');
        expect(recorded[0].from).toBe(originalGroup.id);
        expect(recorded[0].to).toBe(panel2.group.id);
        expect(recorded[0].to).not.toBe(recorded[0].from);
        // the event must not arrive mid-transition: by the time it fires the
        // panel already reports its final location
        expect(recorded[0].location).toBe('floating');
    });

    test('fires when a panel is dropped into an existing floating group', () => {
        dockview.addPanel({ id: 'panel1', component: 'default' });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        const panel3 = dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });
        const originalGroup = panel2.group;

        dockview.addFloatingGroup(panel3 as DockviewPanel);
        const floatingGroup = panel3.group;

        record();

        dockview.moveGroupOrPanel({
            from: { groupId: panel2.group.id, panelId: 'panel2' },
            to: { group: floatingGroup, position: 'center' },
        });

        expect(recorded).toEqual([
            {
                panel: 'panel2',
                from: originalGroup.id,
                to: floatingGroup.id,
                location: 'floating',
            },
        ]);
    });

    test('fires when a floating panel is docked back into the grid', () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        dockview.addFloatingGroup(panel2 as DockviewPanel);
        const floatingGroup = panel2.group;

        record();

        dockview.moveGroupOrPanel({
            from: { groupId: floatingGroup.id, panelId: 'panel2' },
            to: { group: panel1.group, position: 'center' },
        });

        expect(recorded).toEqual([
            {
                panel: 'panel2',
                from: floatingGroup.id,
                to: panel1.group.id,
                location: 'grid',
            },
        ]);
    });

    test('fires when a panel is extracted into a new popout group', async () => {
        dockview.addPanel({ id: 'panel1', component: 'default' });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        const originalGroup = panel2.group;

        record();

        await dockview.addPopoutGroup(panel2 as DockviewPanel);

        expect(recorded).toHaveLength(1);
        expect(recorded[0].panel).toBe('panel2');
        expect(recorded[0].from).toBe(originalGroup.id);
        expect(recorded[0].to).toBe(panel2.group.id);
        expect(recorded[0].to).not.toBe(recorded[0].from);
        expect(recorded[0].location).toBe('popout');
    });

    test('fires for every panel when a whole group is popped out', async () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        const originalGroup = panel1.group;

        record();

        await dockview.addPopoutGroup(originalGroup);

        // a popped-out group is rebuilt as a new group in the new window, so
        // both panels genuinely change group
        expect(recorded).toEqual([
            {
                panel: 'panel1',
                from: originalGroup.id,
                to: panel1.group.id,
                location: 'popout',
            },
            {
                panel: 'panel2',
                from: originalGroup.id,
                to: panel2.group.id,
                location: 'popout',
            },
        ]);
        expect(panel1.group.id).not.toBe(originalGroup.id);
    });

    test('fires for every panel when a whole group is floated', () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        const group = panel1.group;

        record();

        dockview.addFloatingGroup(group);

        // the group keeps its panels, so `to` equals `from`, matching how
        // `moveGroup` reports a group dragged to a new grid slot
        expect(recorded).toEqual([
            {
                panel: 'panel1',
                from: group.id,
                to: group.id,
                location: 'floating',
            },
            {
                panel: 'panel2',
                from: group.id,
                to: group.id,
                location: 'floating',
            },
        ]);
        expect(panel2.group.id).toBe(group.id);
    });

    test('fires when a popped-out group is floated back into the host window', async () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        const originalGroup = panel1.group;

        await dockview.addPopoutGroup(originalGroup);
        const popoutGroup = panel1.group;
        expect(popoutGroup.id).not.toBe(originalGroup.id);

        record();

        // floating a popped-out group rehomes its panels into the reference
        // group the popout left behind in the grid, so this is a real change
        // of group rather than a group keeping its panels
        dockview.addFloatingGroup(popoutGroup);

        expect(panel1.api.location.type).toBe('floating');
        expect(recorded).toEqual([
            {
                panel: 'panel1',
                from: popoutGroup.id,
                to: panel1.group.id,
                location: 'floating',
            },
            {
                panel: 'panel2',
                from: popoutGroup.id,
                to: panel2.group.id,
                location: 'floating',
            },
        ]);
        expect(panel1.group.id).not.toBe(popoutGroup.id);
    });

    /**
     * Closing a popout window rehomes every panel it held - back into the
     * reference group the popout left in the grid, or into a fresh grid slot
     * for the other members of a multi-group window. `movingLock` suppresses
     * onDidAddPanel / onDidRemovePanel on those paths, so `onDidMovePanel` is
     * the only event that can carry the change, and without it a consumer
     * mirroring group membership is left pointing at a disposed group.
     */
    test('fires for every panel when a popout window is closed', async () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        const originalGroup = panel1.group;

        await dockview.addPopoutGroup(originalGroup);
        const popoutGroup = panel1.group;
        expect(popoutGroup.id).not.toBe(originalGroup.id);

        record();

        dockview.getPopouts()[0].window.close();

        // the panels return to the group the popout left behind, so this is a
        // real change of group - the mirror image of popping out
        expect(recorded).toEqual([
            {
                panel: 'panel1',
                from: popoutGroup.id,
                to: originalGroup.id,
                location: 'grid',
            },
            {
                panel: 'panel2',
                from: popoutGroup.id,
                to: originalGroup.id,
                location: 'grid',
            },
        ]);
        expect(panel1.group.id).toBe(originalGroup.id);
    });

    test('fires for every member group when a multi-group popout window is closed', async () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { direction: 'right' },
        });
        const referenceGroup = panel1.group;
        const secondGroup: DockviewGroupPanel = panel2.group;

        await dockview.addPopoutGroup(referenceGroup);
        const popoutGroup = panel1.group;

        // drag the second group into the popout window alongside the anchor
        dockview.moveGroup({
            from: { group: secondGroup },
            to: { group: popoutGroup, position: 'right' },
        });
        expect(panel2.api.location.type).toBe('popout');

        record();

        dockview.getPopouts()[0].window.close();

        expect(recorded).toEqual([
            // the non-anchor member is relocated intact, keeping its panels
            {
                panel: 'panel2',
                from: secondGroup.id,
                to: secondGroup.id,
                location: 'grid',
            },
            // the anchor's panels are rehomed into its reference group
            {
                panel: 'panel1',
                from: popoutGroup.id,
                to: referenceGroup.id,
                location: 'grid',
            },
        ]);
    });

    test('fires once per panel when a popout window re-floats on close', async () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        const group = panel1.group;

        dockview.addFloatingGroup(group);
        await dockview.addPopoutGroup(group);
        expect(panel1.api.location.type).toBe('popout');

        record();

        dockview.getPopouts()[0].window.close();

        // a popout opened from a floating window is restored to one on close;
        // that path reports the moves itself and must not report them twice
        expect(panel1.api.location.type).toBe('floating');
        expect(recorded).toEqual([
            {
                panel: 'panel1',
                from: panel1.group.id,
                to: panel1.group.id,
                location: 'floating',
            },
            {
                panel: 'panel2',
                from: panel2.group.id,
                to: panel2.group.id,
                location: 'floating',
            },
        ]);
    });

    test('does not fire when a popout window is torn down by component disposal', async () => {
        // a dedicated component so the shared afterEach doesn't double-dispose
        const local = new DockviewComponent(document.createElement('div'), {
            createComponent: () => new TestPanel(),
        });
        local.layout(1000, 1000);
        const panel = local.addPanel({ id: 'panel1', component: 'default' });
        await local.addPopoutGroup(panel);

        const events: string[] = [];
        local.onDidMovePanel((event) => events.push(event.panel.id));

        local.dispose();

        expect(events).toEqual([]);
    });

    test('fires when a panel is dragged out of an edge group', () => {
        dockview.addEdgeGroup('left', { id: 'left-group' });
        const edgeGroup = dockview.groups.find((g) => g.id === 'left-group')!;

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        panel2.api.moveTo({ group: edgeGroup });
        expect(panel2.api.location.type).toBe('edge');

        record();

        // edge groups are structural and never move themselves, so the panel
        // is extracted into a new grid group even though it was the only one
        dockview.moveGroupOrPanel({
            from: { groupId: edgeGroup.id, panelId: 'panel2' },
            to: { group: panel1.group, position: 'right' },
        });

        expect(recorded).toEqual([
            {
                panel: 'panel2',
                from: edgeGroup.id,
                to: panel2.group.id,
                location: 'grid',
            },
        ]);
        expect(dockview.groups.some((g) => g.id === 'left-group')).toBe(true);
    });

    test('does not fire when floating groups are restored from JSON', () => {
        record();

        dockview.fromJSON({
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: 'group-1',
                                activeView: 'panel1',
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
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    title: 'panel2',
                },
            },
            floatingGroups: [
                {
                    data: {
                        views: ['panel2'],
                        id: 'group-2',
                        activeView: 'panel2',
                    },
                    position: { left: 10, top: 10, width: 200, height: 200 },
                },
            ],
        });

        expect(recorded).toEqual([]);
    });

    test('does not fire when a floating panel is added via addPanel', () => {
        record();

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
            floating: true,
        });

        expect(recorded).toEqual([]);
    });

    /**
     * Merging one group into another is the odd one out: every other
     * relocation moves the group, so its panels can be read off it once the
     * move has settled, but a merge empties the source into the destination
     * and leaves nothing behind to report from.
     */
    test('fires for every panel when a group is merged into another group', () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { direction: 'right' },
        });
        const panel3 = dockview.addPanel({
            id: 'panel3',
            component: 'default',
            position: { referencePanel: 'panel2' },
        });

        const group1: DockviewGroupPanel = panel1.group;
        const group2: DockviewGroupPanel = panel2.group;
        expect(group2.panels.length).toBe(2);

        record();

        dockview.moveGroup({
            from: { group: group2 },
            to: { group: group1, position: 'center' },
        });

        expect(recorded).toEqual([
            {
                panel: 'panel2',
                from: group2.id,
                to: group1.id,
                location: 'grid',
            },
            {
                panel: 'panel3',
                from: group2.id,
                to: group1.id,
                location: 'grid',
            },
        ]);
        expect(panel3.group.id).toBe(group1.id);
        expect(dockview.groups.some((g) => g.id === group2.id)).toBe(false);
    });

    test('fires when a whole group is dropped onto another group centre', () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { direction: 'right' },
        });

        const group1: DockviewGroupPanel = panel1.group;
        const group2: DockviewGroupPanel = panel2.group;

        record();

        // the drag-and-drop entry point: no panelId means the whole group
        dockview.moveGroupOrPanel({
            from: { groupId: group2.id },
            to: { group: group1, position: 'center' },
        });

        expect(recorded).toEqual([
            {
                panel: 'panel2',
                from: group2.id,
                to: group1.id,
                location: 'grid',
            },
        ]);
    });

    test('reports `to` equal to `from` when the group itself is relocated', () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { direction: 'right' },
        });

        const group1: DockviewGroupPanel = panel1.group;
        const group2: DockviewGroupPanel = panel2.group;

        record();

        dockview.moveGroup({
            from: { group: group2 },
            to: { group: group1, position: 'left' },
        });

        expect(recorded).toEqual([
            {
                panel: 'panel2',
                from: group2.id,
                to: group2.id,
                location: 'grid',
            },
        ]);
    });
});
