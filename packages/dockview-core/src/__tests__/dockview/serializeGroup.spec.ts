import { DockviewComponent } from '../../dockview/dockviewComponent';
import type { IContentRenderer } from '../../dockview/types';
import type { GroupPanelViewState } from '../../dockview/dockviewGroupPanelModel';
import { DockviewApi } from '../../api/component.api';
import type { IDockviewPanel } from '../../dockview/dockviewPanel';
import type { SerializedGridObject } from '../../gridview/gridview';

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

function createDockview(): DockviewComponent {
    const container = document.createElement('div');
    const dockview = new DockviewComponent(container, {
        createComponent: () => new TestPanel(),
        createTabComponent: () => new TestPanel(),
    });
    dockview.layout(1000, 600);
    return dockview;
}

/** One group holding `p1` and `p2` (active), with a title and params set. */
function seedGroup(dockview: DockviewComponent) {
    const p1 = dockview.addPanel({
        id: 'p1',
        component: 'default',
        title: 'First',
        params: { counter: 7 },
    });
    dockview.addPanel({
        id: 'p2',
        component: 'default',
        tabComponent: 'customTab',
        renderer: 'always',
        position: { referencePanel: p1 },
    });
    return p1.group;
}

/**
 * `serializeGroup` lifts one group and its panels out of a layout as a
 * self-contained envelope; `addGroupFromJSON` rebuilds it into a live layout
 * next to an existing group, without replacing anything else. Together they
 * are the unit of transfer for a group moving between layouts or instances.
 */
describe('serializeGroup / addGroupFromJSON', () => {
    let source: DockviewComponent;
    let target: DockviewComponent;

    beforeEach(() => {
        source = createDockview();
        target = createDockview();
    });

    afterEach(() => {
        source.dispose();
        target.dispose();
    });

    describe('serializeGroup', () => {
        test('carries the group shape and the state of every panel', () => {
            const group = seedGroup(source);
            group.model.locked = true;

            const envelope = source.serializeGroup(group);

            expect(envelope.group).toEqual({
                id: group.id,
                views: ['p1', 'p2'],
                activeView: 'p2',
                locked: true,
            });
            expect(Object.keys(envelope.panels)).toEqual(['p1', 'p2']);
            expect(envelope.panels.p1).toEqual(
                expect.objectContaining({
                    id: 'p1',
                    contentComponent: 'default',
                    title: 'First',
                    params: { counter: 7 },
                })
            );
            expect(envelope.panels.p2).toEqual(
                expect.objectContaining({
                    id: 'p2',
                    tabComponent: 'customTab',
                    renderer: 'always',
                })
            );
        });

        test('survives a JSON round trip', () => {
            const group = seedGroup(source);
            const envelope = source.serializeGroup(group);

            expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope);
        });

        test('is reachable through the public api', () => {
            const group = seedGroup(source);
            const api = new DockviewApi(source);

            expect(api.serializeGroup(group)).toEqual(
                source.serializeGroup(group)
            );
        });
    });

    describe('addGroupFromJSON', () => {
        test('rebuilds the group in another instance with its panels intact', () => {
            const envelope = source.serializeGroup(seedGroup(source));

            const group = target.addGroupFromJSON(envelope);

            expect(group.id).toBe(envelope.group.id);
            expect(group.panels.map((p) => p.id)).toEqual(['p1', 'p2']);
            expect(group.activePanel?.id).toBe('p2');
            expect(target.activeGroup).toBe(group);
            expect(target.activePanel?.id).toBe('p2');

            const p1 = target.getGroupPanel('p1')!;
            expect(p1.title).toBe('First');
            expect(p1.params).toEqual({ counter: 7 });

            const p2 = target.getGroupPanel('p2')!;
            expect(p2.api.renderer).toBe('always');
            expect(p2.view.tabComponent).toBe('customTab');
        });

        test('round-trips through toJSON identically to the source layout', () => {
            const envelope = source.serializeGroup(seedGroup(source));

            target.addGroupFromJSON(envelope);

            expect(target.toJSON().panels).toEqual(source.toJSON().panels);
            expect(target.serializeGroup(target.groups[0])).toEqual(envelope);
        });

        test('leaves the existing layout in place and positions relative to it', () => {
            const envelope = source.serializeGroup(seedGroup(source));
            const local = target.addPanel({
                id: 'local',
                component: 'default',
            });

            const group = target.addGroupFromJSON(envelope, {
                referenceGroup: local.group,
                direction: 'right',
            });

            expect(target.groups).toHaveLength(2);
            expect(target.panels.map((p) => p.id)).toEqual([
                'local',
                'p1',
                'p2',
            ]);
            expect(target.getGroupPanel('local')!.group).toBe(local.group);
            expect(group.api.location.type).toBe('grid');

            const [left, right] = target.toJSON().grid.root
                .data as SerializedGridObject<GroupPanelViewState>[];
            expect(left.data.id).toBe(local.group.id);
            expect(right.data.id).toBe(group.id);
        });

        test('accepts a reference panel and an absolute direction', () => {
            const envelope = source.serializeGroup(seedGroup(source));
            target.addPanel({ id: 'local', component: 'default' });

            const byPanel = target.addGroupFromJSON(
                { ...envelope, group: { ...envelope.group, id: 'byPanel' } },
                { referencePanel: 'local', direction: 'below' }
            );
            expect(byPanel.id).toBe('byPanel');

            const absolute = target.addGroupFromJSON(
                {
                    group: {
                        id: 'absolute',
                        views: ['p3'],
                        activeView: 'p3',
                    },
                    panels: { p3: { id: 'p3', contentComponent: 'default' } },
                },
                { direction: 'left' }
            );
            expect(absolute.id).toBe('absolute');
            expect(target.groups).toHaveLength(3);
        });

        test('preserves locked, hidden header and header position', () => {
            const group = target.addGroupFromJSON({
                group: {
                    id: 'g',
                    views: ['p1'],
                    locked: 'no-drop-target',
                    hideHeader: true,
                    headerPosition: 'bottom',
                },
                panels: { p1: { id: 'p1', contentComponent: 'default' } },
            });

            expect(group.locked).toBe('no-drop-target');
            expect(group.model.header.hidden).toBe(true);
            expect(group.model.headerPosition).toBe('bottom');
        });

        test('falls back to the last panel when no active view is given', () => {
            const group = target.addGroupFromJSON({
                group: { id: 'g', views: ['a', 'b'] },
                panels: {
                    a: { id: 'a', contentComponent: 'default' },
                    b: { id: 'b', contentComponent: 'default' },
                },
            });

            expect(group.activePanel?.id).toBe('b');
        });

        test('skipSetActive leaves the active group alone', () => {
            const local = target.addPanel({
                id: 'local',
                component: 'default',
            });
            const envelope = source.serializeGroup(seedGroup(source));

            target.addGroupFromJSON(envelope, {
                referenceGroup: local.group,
                direction: 'right',
                skipSetActive: true,
            });

            expect(target.activeGroup).toBe(local.group);
            expect(target.activePanel?.id).toBe('local');
        });

        test('fires add events for the group and each panel', () => {
            const envelope = source.serializeGroup(seedGroup(source));
            const addedGroups: string[] = [];
            const addedPanels: string[] = [];
            target.onDidAddGroup((g) => addedGroups.push(g.id));
            target.onDidAddPanel((p) => addedPanels.push(p.id));

            const group = target.addGroupFromJSON(envelope);

            expect(addedGroups).toEqual([group.id]);
            expect(addedPanels).toEqual(['p1', 'p2']);
        });

        test('is one layout mutation', () => {
            const envelope = source.serializeGroup(seedGroup(source));
            const events: string[] = [];
            target.onWillMutateLayout((e) => events.push(`will:${e.kind}`));
            target.onDidMutateLayout((e) => events.push(`did:${e.kind}`));

            target.addGroupFromJSON(envelope);

            expect(events).toEqual(['will:add', 'did:add']);
        });

        test('throws on a live panel id before changing anything', () => {
            const envelope = source.serializeGroup(seedGroup(source));
            target.addPanel({ id: 'p2', component: 'default' });
            const events: string[] = [];
            target.onWillMutateLayout((e) => events.push(e.kind));
            target.onDidAddGroup(() => events.push('group'));

            expect(() => target.addGroupFromJSON(envelope)).toThrow(
                'dockview: panel with id p2 already exists'
            );

            expect(events).toEqual([]);
            expect(target.groups).toHaveLength(1);
            expect(target.panels.map((p) => p.id)).toEqual(['p2']);
        });

        test('throws on missing panel state', () => {
            expect(() =>
                target.addGroupFromJSON({
                    group: { id: 'g', views: ['a', 'b'] },
                    panels: { a: { id: 'a', contentComponent: 'default' } },
                })
            ).toThrow(
                'dockview: serialized group g is missing panel state for b'
            );
            expect(target.groups).toHaveLength(0);
        });

        test('throws on a malformed envelope', () => {
            expect(() =>
                target.addGroupFromJSON({
                    group: { views: ['a'] } as unknown as GroupPanelViewState,
                    panels: {},
                })
            ).toThrow('dockview: group id must be of type string');

            expect(() =>
                target.addGroupFromJSON({
                    group: { id: 'g' } as unknown as GroupPanelViewState,
                    panels: {},
                })
            ).toThrow('dockview: serialized group g has no views');
        });

        test('removes the group again when a panel cannot be created', () => {
            const container = document.createElement('div');
            const strict = new DockviewComponent(container, {
                createComponent: (options) => {
                    if (options.name === 'missing') {
                        throw new Error('no such component');
                    }
                    return new TestPanel();
                },
            });
            strict.layout(1000, 600);
            const local = strict.addPanel({
                id: 'local',
                component: 'default',
            });
            const removed: string[] = [];
            strict.onDidRemoveGroup((g) => removed.push(g.id));

            expect(() =>
                strict.addGroupFromJSON(
                    {
                        group: { id: 'g', views: ['ok', 'bad'] },
                        panels: {
                            ok: { id: 'ok', contentComponent: 'default' },
                            bad: { id: 'bad', contentComponent: 'missing' },
                        },
                    },
                    { referenceGroup: local.group, direction: 'right' }
                )
            ).toThrow('no such component');

            expect(strict.groups.map((g) => g.id)).toEqual([local.group.id]);
            expect(strict.panels.map((p) => p.id)).toEqual(['local']);
            expect(removed).toEqual(['g']);
            strict.dispose();
        });

        test('reassigns a live group id with a warning', () => {
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => {
                // silence
            });
            const envelope = source.serializeGroup(seedGroup(source));
            const local = target.addPanel({
                id: 'local',
                component: 'default',
            });
            expect(local.group.id).toBe(envelope.group.id);

            const group = target.addGroupFromJSON(envelope);

            expect(group.id).not.toBe(local.group.id);
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('Duplicate group id')
            );
            expect(group.panels.map((p) => p.id)).toEqual(['p1', 'p2']);
            warn.mockRestore();
        });

        test('moves a group between instances when paired with removeGroup', () => {
            const group = seedGroup(source);
            const envelope = source.serializeGroup(group);

            source.removeGroup(group);
            const moved = target.addGroupFromJSON(envelope);

            expect(source.panels).toHaveLength(0);
            expect(moved.panels.map((p: IDockviewPanel) => p.id)).toEqual([
                'p1',
                'p2',
            ]);
        });

        test('addPanelFromJSON places a panel from its toJSON state', () => {
            const p1 = seedGroup(source).panels[0];
            const state = p1.toJSON();
            const a = target.addPanel({ id: 'a', component: 'default' });

            const panel = new DockviewApi(target).addPanelFromJSON(state, {
                position: { referenceGroup: a.group, index: 0 },
                inactive: true,
            });

            expect(panel.id).toBe('p1');
            expect(panel.title).toBe('First');
            expect(panel.params).toEqual({ counter: 7 });
            expect(panel.toJSON()).toEqual(state);
            expect(a.group.panels.map((p) => p.id)).toEqual(['p1', 'a']);
            expect(a.group.activePanel?.id).toBe('a');

            const beside = target.addPanelFromJSON(
                { ...state, id: 'p1-copy' },
                { position: { referencePanel: 'a', direction: 'right' } }
            );
            expect(target.groups).toHaveLength(2);
            expect(beside.group).not.toBe(a.group);
            expect(target.activePanel).toBe(beside);
        });

        test('addPanelFromJSON refuses a live panel id and an unknown component', () => {
            const state = seedGroup(source).panels[0].toJSON();
            target.addPanel({ id: 'p1', component: 'default' });

            expect(() => target.addPanelFromJSON(state)).toThrow(
                'dockview: panel with id p1 already exists'
            );
            expect(() =>
                target.addPanelFromJSON({ id: 'x', title: 'x' })
            ).toThrow('dockview: serialized panel x has no contentComponent');
            expect(target.panels.map((p) => p.id)).toEqual(['p1']);
        });

        test('a reference with direction within merges into that group at an index', () => {
            const envelope = source.serializeGroup(seedGroup(source));
            const a = target.addPanel({ id: 'a', component: 'default' });
            target.addPanel({
                id: 'b',
                component: 'default',
                position: { referencePanel: a },
            });
            const addedGroups: string[] = [];
            const addedPanels: string[] = [];
            target.onDidAddGroup((g) => addedGroups.push(g.id));
            target.onDidAddPanel((p) => addedPanels.push(p.id));

            const group = target.addGroupFromJSON(envelope, {
                referenceGroup: a.group,
                direction: 'within',
                index: 1,
            });

            expect(group).toBe(a.group);
            expect(target.groups).toHaveLength(1);
            expect(group.panels.map((p) => p.id)).toEqual([
                'a',
                'p1',
                'p2',
                'b',
            ]);
            expect(group.activePanel?.id).toBe('p2');
            expect(target.activePanel?.id).toBe('p2');
            expect(addedGroups).toEqual([]);
            expect(addedPanels).toEqual(['p1', 'p2']);
            expect(target.getGroupPanel('p1')?.title).toBe('First');
        });

        test('a reference with no direction merges, as addPanel does', () => {
            const envelope = source.serializeGroup(seedGroup(source));
            const a = target.addPanel({ id: 'a', component: 'default' });

            const group = target.addGroupFromJSON(envelope, {
                referencePanel: 'a',
            });

            expect(group).toBe(a.group);
            expect(group.panels.map((p) => p.id)).toEqual(['a', 'p1', 'p2']);
        });

        test('merges into a floating group, which has no grid neighbours', () => {
            const envelope = source.serializeGroup(seedGroup(source));
            target.addPanel({ id: 'anchor', component: 'default' });
            const floating = target.addPanel({
                id: 'f',
                component: 'default',
                floating: true,
            });
            expect(floating.group.api.location.type).toBe('floating');

            const group = target.addGroupFromJSON(envelope, {
                referenceGroup: floating.group,
            });

            expect(group).toBe(floating.group);
            expect(group.panels.map((p) => p.id)).toEqual(['f', 'p1', 'p2']);
            expect(group.api.location.type).toBe('floating');
        });

        test('a merge is refused on a live panel id before changing anything', () => {
            const envelope = source.serializeGroup(seedGroup(source));
            const a = target.addPanel({ id: 'a', component: 'default' });
            target.addPanel({
                id: 'p2',
                component: 'default',
                position: { referencePanel: a },
            });

            expect(() =>
                target.addGroupFromJSON(envelope, { referenceGroup: a.group })
            ).toThrow('dockview: panel with id p2 already exists');

            expect(a.group.panels.map((p) => p.id)).toEqual(['a', 'p2']);
        });

        test('a merge with skipSetActive leaves the active group alone', () => {
            const envelope = source.serializeGroup(seedGroup(source));
            const a = target.addPanel({ id: 'a', component: 'default' });
            const other = target.addGroup({
                direction: 'right',
                skipSetActive: true,
            });
            expect(target.activeGroup).toBe(a.group);

            target.addGroupFromJSON(envelope, {
                referenceGroup: other,
                skipSetActive: true,
            });

            expect(target.activeGroup).toBe(a.group);
            expect(target.activePanel?.id).toBe('a');
            expect(other.panels.map((p) => p.id)).toEqual(['p1', 'p2']);
        });

        test('within with an unknown reference throws', () => {
            const envelope = source.serializeGroup(seedGroup(source));

            expect(() =>
                target.addGroupFromJSON(envelope, { referenceGroup: 'nope' })
            ).toThrow('dockview: reference group nope does not exist');
            expect(() =>
                target.addGroupFromJSON(envelope, { referencePanel: 'nope' })
            ).toThrow('dockview: reference panel nope does not exist');
        });

        test('is reachable through the public api with api origin', () => {
            const envelope = source.serializeGroup(seedGroup(source));
            const api = new DockviewApi(target);
            const origins: string[] = [];
            target.onDidMutateLayout((e) => origins.push(e.origin));

            const group = api.addGroupFromJSON(envelope, {
                direction: 'right',
            });

            expect(group.panels).toHaveLength(2);
            expect(origins).toEqual(['api']);
        });
    });
});
