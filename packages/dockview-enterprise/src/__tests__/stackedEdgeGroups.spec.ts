import {
    DockviewComponent,
    DockviewGroupPanelApi,
    DockviewLayoutMutationKind,
    EdgeGroupPosition,
    IContentRenderer,
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
