import {
    DockviewComponent,
    DockviewGroupPanel,
    DockviewGroupPanelApi,
    DockviewLayoutMutationKind,
    EdgeGroupPosition,
    IContentRenderer,
    LocalSelectionTransfer,
    PanelTransfer,
    Position,
    SerializedEdgeStack,
} from 'dockview-core';

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

const flush = (): Promise<void> => new Promise((r) => setTimeout(r));

/**
 * Stacked edge groups: more than one group on an edge, laid out along it. The
 * harness registers every enterprise module, so the StackedEdgeGroup gate is
 * present; `stackedEdgeGroups` opts each edge in.
 */
describe('stacked edge groups', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;

    const make = (
        extra: Partial<DockviewComponent['options']> = {}
    ): DockviewComponent => {
        container = document.createElement('div');
        document.body.appendChild(container);
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            stackedEdgeGroups: true,
            ...extra,
        });
        dockview.layout(1000, 800);
        return dockview;
    };

    /** An edge group holding one panel named after it. */
    const addEdge = (
        position: EdgeGroupPosition,
        id: string,
        options: Partial<Parameters<DockviewComponent['addEdgeGroup']>[1]> = {}
    ): DockviewGroupPanelApi => {
        const api = dockview.addEdgeGroup(position, { id, ...options });
        dockview.addPanel({
            id: `${id}-panel`,
            component: 'default',
            title: id,
            position: { referenceGroup: id },
        });
        return api;
    };

    const ids = (position: EdgeGroupPosition): string[] =>
        dockview.getEdgeGroups(position).map((g) => g.id);

    /** Each group's size along the edge, as serialized. */
    const memberSizes = (position: EdgeGroupPosition): number[] =>
        (
            dockview.toJSON().edgeGroups![position] as SerializedEdgeStack
        ).groups.map((g) => g.size);

    afterEach(() => {
        dockview.dispose();
        container.remove();
    });

    test('a second group joins the edge in order', () => {
        make();
        const a = addEdge('left', 'a');
        const b = addEdge('left', 'b');

        expect(ids('left')).toEqual(['a', 'b']);
        expect(dockview.getEdgeGroup('left')).toBe(a);
        expect(dockview.getEdgeGroup('left', 'b')).toBe(b);
        expect(b.location).toEqual({ type: 'edge', position: 'left' });
        // both share the edge's width and split its height
        expect(memberSizes('left')).toEqual([400, 400]);
        expect(dockview.getEdgeGroupPanel('left')!.width).toBe(200);
        expect(dockview.getEdgeGroupPanel('left')!.height).toBe(400);
    });

    test('stack placement: relativeTo, placement and index', () => {
        make();
        addEdge('left', 'a');
        addEdge('left', 'b', {
            stack: { relativeTo: 'a', placement: 'before' },
        });
        addEdge('left', 'c', {
            stack: { relativeTo: 'a', placement: 'after' },
        });
        addEdge('left', 'd', { stack: { index: 1 } });

        expect(ids('left')).toEqual(['b', 'd', 'a', 'c']);
    });

    test('a group placed next to a sibling takes half of it; an explicit size wins', () => {
        make();
        addEdge('left', 'a');
        addEdge('left', 'b', { stack: { relativeTo: 'a' } });
        expect(memberSizes('left')).toEqual([400, 400]);

        addEdge('left', 'c', { stack: { relativeTo: 'b', size: 100 } });
        expect(memberSizes('left')).toEqual([400, 300, 100]);
    });

    test('an edge not opted in still throws, with a hint', () => {
        make({ stackedEdgeGroups: { left: true } });
        addEdge('right', 'a');

        expect(() => addEdge('right', 'b')).toThrow(
            /already exists at position 'right' \(set stackedEdgeGroups to stack\)/
        );
        expect(ids('right')).toEqual(['a']);
    });

    test('moveEdgeGroup reorders by index or relative to a sibling, as one move mutation', () => {
        make();
        addEdge('left', 'a');
        addEdge('left', 'b');
        addEdge('left', 'c');
        const kinds: DockviewLayoutMutationKind[] = [];
        dockview.onWillMutateLayout((e) => kinds.push(e.kind));
        dockview.onDidMutateLayout((e) => kinds.push(e.kind));

        dockview.moveEdgeGroup('c', { index: 0 });
        expect(ids('left')).toEqual(['c', 'a', 'b']);
        expect(kinds).toEqual(['move', 'move']);

        dockview.moveEdgeGroup('c', { relativeTo: 'b', placement: 'after' });
        expect(ids('left')).toEqual(['a', 'b', 'c']);
        dockview.moveEdgeGroup('a', { relativeTo: 'c', placement: 'before' });
        expect(ids('left')).toEqual(['b', 'a', 'c']);

        // DOM order follows
        const order = Array.from(
            container.querySelectorAll('[data-testid^="dv-edge-group-"]')
        ).map((el) => (el as HTMLElement).dataset.testid);
        expect(order).toEqual([
            'dv-edge-group-b',
            'dv-edge-group-a',
            'dv-edge-group-c',
        ]);
    });

    test('removeEdgeGroup with a group id keeps the edge; without it removes every group', () => {
        make();
        addEdge('left', 'a');
        addEdge('left', 'b');
        const removed: string[] = [];
        dockview.onDidRemoveGroup((g) => removed.push(g.id));

        dockview.removeEdgeGroup('left', 'a');
        expect(ids('left')).toEqual(['b']);
        expect(removed).toEqual(['a']);
        expect(dockview.getGroupPanel('a-panel')).toBeUndefined();
        expect(dockview.getEdgeGroupPanel('left')!.height).toBe(800);

        expect(() => dockview.removeEdgeGroup('left', 'a')).toThrow(
            /no edge group 'a' exists/
        );

        addEdge('left', 'c');
        dockview.removeEdgeGroup('left');
        expect(ids('left')).toEqual([]);
        expect(removed).toEqual(['a', 'b', 'c']);
        expect(dockview.isEdgeGroupVisible('left')).toBe(false);
    });

    test('collapsing one group hands its room to its sibling; the edge stays expanded', () => {
        make();
        const a = addEdge('left', 'a');
        addEdge('left', 'b');
        const changes: boolean[] = [];
        a.onDidCollapsedChange((e) => changes.push(e.isCollapsed));

        a.collapse();

        expect(a.isCollapsed()).toBe(true);
        expect(dockview.getEdgeGroup('left', 'b')!.isCollapsed()).toBe(false);
        expect(dockview.isEdgeCollapsed('left')).toBe(false);
        expect(changes).toEqual([true]);
        // pinned to its (unmeasured, so default) strip; b takes the rest
        expect(memberSizes('left')).toEqual([35, 765]);
        expect(dockview.getEdgeGroupPanel('left')!.width).toBe(200);

        a.expand();
        expect(memberSizes('left')).toEqual([400, 400]);
    });

    test('collapsing every group collapses the edge to its strip', () => {
        make();
        const a = addEdge('left', 'a');
        const b = addEdge('left', 'b');

        a.collapse();
        b.collapse();

        expect(dockview.isEdgeCollapsed('left')).toBe(true);
        expect(dockview.getEdgeGroupPanel('left')!.width).toBe(35);
        expect(dockview.toJSON().edgeGroups!.left!.collapsed).toBe(true);

        b.expand();
        expect(dockview.isEdgeCollapsed('left')).toBe(false);
        expect(dockview.getEdgeGroupPanel('left')!.width).toBe(200);
        expect(memberSizes('left')).toEqual([35, 765]);
    });

    test('setSize sizes the edge on its own axis and the group along it', () => {
        make();
        const a = addEdge('left', 'a');
        addEdge('left', 'b');

        a.setSize({ height: 300 });
        expect(memberSizes('left')).toEqual([300, 500]);

        a.setSize({ width: 320 });
        expect(dockview.getEdgeGroupPanel('left')!.width).toBe(320);
        expect(dockview.getEdgeGroupPanel('left')!.height).toBe(300);
        expect(dockview.toJSON().edgeGroups!.left!.size).toBe(320);
    });

    test('a top edge stacks horizontally', () => {
        make();
        const a = addEdge('top', 'a');
        addEdge('top', 'b');

        expect(memberSizes('top')).toEqual([500, 500]);
        a.setSize({ width: 300 });
        expect(memberSizes('top')).toEqual([300, 700]);
        expect(dockview.getEdgeGroupPanel('top')!.height).toBe(200);
    });

    test('a three-group stack round-trips with ids, order, sizes, collapse and panels', () => {
        make();
        addEdge('left', 'a', { initialSize: 240 });
        addEdge('left', 'b', { stack: { minimumSize: 120 } });
        const c = addEdge('left', 'c', { autoHide: false });
        dockview.addPanel({ id: 'main', component: 'default' });
        dockview.getEdgeGroup('left', 'b')!.setSize({ height: 200 });
        c.collapse();
        const state = dockview.toJSON();
        const left = state.edgeGroups!.left as SerializedEdgeStack;
        expect(left.size).toBe(240);
        expect(left.collapsed).toBeUndefined();
        expect(left.groups.map((g) => g.collapsed)).toEqual([
            undefined,
            undefined,
            true,
        ]);
        expect(left.groups[1].minimumSize).toBe(120);
        expect(left.groups[2].autoHide).toBe(false);

        const json = JSON.parse(JSON.stringify(state));
        dockview.clear();
        dockview.fromJSON(json);

        expect(ids('left')).toEqual(['a', 'b', 'c']);
        expect(memberSizes('left')).toEqual(left.groups.map((g) => g.size));
        expect(dockview.getEdgeGroup('left', 'c')!.isCollapsed()).toBe(true);
        expect(dockview.getEdgeGroup('left', 'c')!.isAutoHide()).toBe(false);
        expect(
            dockview
                .getEdgeGroups('left')
                .map((g) => dockview.getGroupPanel(`${g.id}-panel`)?.group.id)
        ).toEqual(['a', 'b', 'c']);
        expect(dockview.getEdgeGroupPanel('left')!.width).toBe(240);
        expect(
            JSON.parse(JSON.stringify(dockview.toJSON().edgeGroups))
        ).toEqual(json.edgeGroups);
    });

    test('a saved stack restores onto a fresh component', () => {
        make();
        addEdge('bottom', 'a');
        addEdge('bottom', 'b');
        const json = JSON.parse(JSON.stringify(dockview.toJSON()));
        dockview.dispose();

        make({ stackedEdgeGroups: false });
        dockview.fromJSON(json);

        expect(ids('bottom')).toEqual(['a', 'b']);
        expect(dockview.getGroupPanel('b-panel')!.group.id).toBe('b');
    });

    test('the single-group shape still loads as one group', () => {
        make();
        addEdge('left', 'a');
        const json = JSON.parse(JSON.stringify(dockview.toJSON()));
        expect('groups' in json.edgeGroups.left).toBe(false);

        dockview.clear();
        dockview.fromJSON(json);

        expect(ids('left')).toEqual(['a']);
        expect(dockview.getGroupPanel('a-panel')!.group.id).toBe('a');
    });

    test('an emptied group with siblings is removed; the last one collapses', async () => {
        make();
        const a = addEdge('left', 'a');
        addEdge('left', 'b');

        dockview.getGroupPanel('b-panel')!.api.close();
        await flush();

        expect(ids('left')).toEqual(['a']);
        expect(a.isCollapsed()).toBe(false);
        expect(dockview.getEdgeGroupPanel('left')!.height).toBe(800);

        dockview.getGroupPanel('a-panel')!.api.close();
        await flush();

        expect(ids('left')).toEqual(['a']);
        expect(a.isCollapsed()).toBe(true);
    });

    test('an emptied auto-reveal group tears the edge down with the last member', async () => {
        make();
        addEdge('left', 'a', { autoReveal: true });
        addEdge('left', 'b', { autoReveal: true });

        dockview.getGroupPanel('a-panel')!.api.close();
        await flush();
        expect(ids('left')).toEqual(['b']);

        dockview.getGroupPanel('b-panel')!.api.close();
        await flush();
        expect(ids('left')).toEqual([]);
        expect(dockview.getEdgeGroup('left')).toBeUndefined();
    });
});

describe('stacked edge groups: splitting and merging', () => {
    const transfer = LocalSelectionTransfer.getInstance<PanelTransfer>();
    let container: HTMLElement;
    let dockview: DockviewComponent;
    let announced: string[];

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        announced = [];
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            stackedEdgeGroups: true,
            announcer: (e) => announced.push(e.message),
        });
        dockview.layout(1000, 800);
        dockview.addPanel({ id: 'main', component: 'default', title: 'Main' });
        dockview.addEdgeGroup('left', { id: 'a' });
        dockview.addPanel({
            id: 'a-panel',
            component: 'default',
            title: 'A',
            position: { referenceGroup: 'a' },
        });
    });

    afterEach(() => {
        transfer.clearData(PanelTransfer.prototype);
        dockview.dispose();
        container.remove();
    });

    const ids = (position: EdgeGroupPosition): string[] =>
        dockview.getEdgeGroups(position).map((g) => g.id);
    const edge = (id: string): DockviewGroupPanel =>
        dockview.getPanel(id) as DockviewGroupPanel;
    const groupOf = (panelId: string): string =>
        dockview.getGroupPanel(panelId)!.group.id;
    const zonesOf = (group: DockviewGroupPanel): string[] => [
        ...(
            group.model as never as {
                contentContainer: {
                    dropTarget: { _acceptedTargetZonesSet: Set<string> };
                };
            }
        ).contentContainer.dropTarget._acceptedTargetZonesSet,
    ];
    /** A user drop of `panelId` (or of its whole group) on `target`'s content. */
    const drop = (
        panelId: string | null,
        sourceGroupId: string,
        target: DockviewGroupPanel,
        position: Position
    ): void => {
        transfer.setData(
            [new PanelTransfer(dockview.id, sourceGroupId, panelId)],
            PanelTransfer.prototype
        );
        (
            target.model as never as {
                handleDropEvent(
                    type: string,
                    event: Event,
                    position: Position
                ): void;
            }
        ).handleDropEvent('content', new MouseEvent('drop'), position);
    };

    test('an edge group offers split zones along its edge while its edge can stack', () => {
        expect(zonesOf(edge('a'))).toEqual(['center', 'top', 'bottom']);
        expect(dockview.getEdgeGroupDropZones('top')).toEqual([
            'center',
            'left',
            'right',
        ]);

        dockview.updateOptions({ stackedEdgeGroups: { left: false } });
        expect(zonesOf(edge('a'))).toEqual(['center']);

        dockview.updateOptions({ stackedEdgeGroups: true });
        expect(zonesOf(edge('a'))).toEqual(['center', 'top', 'bottom']);
    });

    test('addPanel below an edge group opens it in a new sibling', () => {
        const panel = dockview.addPanel({
            id: 'p',
            component: 'default',
            position: { referenceGroup: 'a', direction: 'below' },
        });

        expect(ids('left')).toHaveLength(2);
        expect(ids('left')[0]).toBe('a');
        expect(panel.group.id).toBe(ids('left')[1]);
        expect(panel.group.api.location).toEqual({
            type: 'edge',
            position: 'left',
        });
        expect(dockview.activePanel).toBe(panel);

        // a direction across the edge still opens within the group
        const within = dockview.addPanel({
            id: 'q',
            component: 'default',
            position: { referenceGroup: 'a', direction: 'left' },
        });
        expect(within.group.id).toBe('a');
        expect(ids('left')).toHaveLength(2);
    });

    test('moving a panel to the bottom half splits; to the centre merges', async () => {
        const moves: { panel: string; from: string; to: string }[] = [];
        dockview.onDidMovePanel((e) =>
            moves.push({ panel: e.panel.id, from: e.from.id, to: e.to.id })
        );
        const mainGroup = groupOf('main');

        dockview.moveGroupOrPanel({
            from: { groupId: mainGroup, panelId: 'main' },
            to: { group: edge('a'), position: 'bottom' },
        });

        const [, sibling] = ids('left');
        expect(ids('left')).toHaveLength(2);
        expect(groupOf('main')).toBe(sibling);
        expect(moves).toEqual([
            { panel: 'main', from: mainGroup, to: sibling },
        ]);
        // the emptied grid group is gone
        expect(dockview.getPanel(mainGroup)).toBeUndefined();

        dockview.moveGroupOrPanel({
            from: { groupId: sibling, panelId: 'main' },
            to: { group: edge('a'), position: 'center' },
        });
        expect(groupOf('main')).toBe('a');
        await flush();
        // the emptied sibling leaves the edge
        expect(ids('left')).toEqual(['a']);
    });

    test('moving a whole group to the top half splits before', () => {
        dockview.addPanel({
            id: 'second',
            component: 'default',
            position: { referencePanel: 'main', direction: 'within' },
        });
        const mainGroup = groupOf('main');
        const moved: string[] = [];
        dockview.onDidMovePanel((e) => moved.push(e.panel.id));

        dockview.moveGroup({
            from: { group: edge(mainGroup) },
            to: { group: edge('a'), position: 'top' },
        });

        const [sibling, a] = ids('left');
        expect(a).toBe('a');
        expect(groupOf('main')).toBe(sibling);
        expect(groupOf('second')).toBe(sibling);
        expect(moved.sort()).toEqual(['main', 'second']);
        expect(dockview.getPanel(mainGroup)).toBeUndefined();
    });

    test("dropping a group's only panel onto its own split half leaves it to the empty rule", async () => {
        dockview.moveGroupOrPanel({
            from: { groupId: 'a', panelId: 'a-panel' },
            to: { group: edge('a'), position: 'bottom' },
        });

        expect(ids('left')).toHaveLength(2);
        expect(groupOf('a-panel')).toBe(ids('left')[1]);
        await flush();
        expect(ids('left')).toEqual([groupOf('a-panel')]);
    });

    test('a tab group dropped on a split half moves as one', () => {
        dockview.addPanel({
            id: 'second',
            component: 'default',
            position: { referencePanel: 'main', direction: 'within' },
        });
        const mainGroup = groupOf('main');
        const tabGroup = dockview.api.createTabGroup({
            groupId: mainGroup,
            label: 'Pair',
        });
        dockview.api.addPanelToTabGroup({
            groupId: mainGroup,
            tabGroupId: tabGroup.id,
            panelId: 'main',
        });
        dockview.api.addPanelToTabGroup({
            groupId: mainGroup,
            tabGroupId: tabGroup.id,
            panelId: 'second',
        });

        dockview.moveGroupOrPanel({
            from: { groupId: mainGroup, tabGroupId: tabGroup.id },
            to: { group: edge('a'), position: 'bottom' },
        });

        const [, sibling] = ids('left');
        expect(groupOf('main')).toBe(sibling);
        expect(groupOf('second')).toBe(sibling);
        expect(
            edge(sibling)
                .model.getTabGroups()
                .map((tg) => tg.label)
        ).toEqual(['Pair']);
    });

    test('a user drop on a split half is announced; a merge is not', () => {
        drop('main', groupOf('main'), edge('a'), 'bottom');
        expect(ids('left')).toHaveLength(2);
        expect(groupOf('main')).toBe(ids('left')[1]);
        expect(announced).toContain('Main docked in a new left group');

        announced.length = 0;
        drop('main', groupOf('main'), edge('a'), 'center');
        expect(groupOf('main')).toBe('a');
        expect(announced.some((m) => m.includes('docked in a new'))).toBe(
            false
        );
    });

    test('a group drop on a split half announces its active panel', () => {
        const mainGroup = groupOf('main');
        drop(null, mainGroup, edge('a'), 'top');
        expect(ids('left')).toHaveLength(2);
        expect(groupOf('main')).toBe(ids('left')[0]);
        expect(announced).toContain('Main docked in a new left group');
    });
});
