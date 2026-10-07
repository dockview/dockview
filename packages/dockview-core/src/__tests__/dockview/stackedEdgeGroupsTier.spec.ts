import { DockviewComponent } from '../../dockview/dockviewComponent';
import { AllModules } from '../../dockview/allModules';
import { IContentRenderer } from '../../dockview/types';
import { DockviewComponentOptions } from '../../dockview/options';
import { _resetMissingModuleWarnings } from '../../dockview/modules';
import { SerializedEdgeStack } from '../../dockview/dockviewShell';

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
 * More than one group on an edge is a StackedEdgeGroup (enterprise) feature.
 * These tests pin the tier boundary: without the module a second group can't
 * be added, a saved stack restores its first group only, and a drop onto an
 * edge group can only merge.
 *
 * `AllModules` is core-only, so this file always runs as a free build.
 */
describe('stacked edge groups are enterprise-only', () => {
    const built: DockviewComponent[] = [];

    function freeDockview(
        options: Partial<DockviewComponentOptions> = {}
    ): DockviewComponent {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const dv = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            modules: AllModules,
            ...options,
        } as never);
        dv.layout(1000, 800);
        built.push(dv);
        return dv;
    }

    const errors = (): string[] =>
        (console.error as jest.Mock).mock.calls.map((c) => c[0] as string);

    beforeEach(() => {
        _resetMissingModuleWarnings();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        for (const dv of built.splice(0)) {
            dv.dispose();
        }
        jest.restoreAllMocks();
    });

    test('a second addEdgeGroup on an occupied edge names the module', () => {
        const dockview = freeDockview();
        dockview.addEdgeGroup('left', { id: 'a' });

        expect(() => dockview.addEdgeGroup('left', { id: 'b' })).toThrow(
            /"StackedEdgeGroup" module.*dockview-enterprise/s
        );
        expect(dockview.getEdgeGroups('left').map((g) => g.id)).toEqual(['a']);
    });

    test('setting the option reports the missing module', () => {
        freeDockview({ stackedEdgeGroups: true });
        expect(errors().some((m) => m.includes('StackedEdgeGroup'))).toBe(true);
    });

    test('moveEdgeGroup reports the missing module and does nothing', () => {
        const dockview = freeDockview();
        dockview.addEdgeGroup('left', { id: 'a' });

        dockview.moveEdgeGroup('a', { index: 0 });

        expect(errors().some((m) => m.includes('api.moveEdgeGroup'))).toBe(
            true
        );
    });

    test('fromJSON of a stack restores the first group only, logging once', () => {
        const source = freeDockview();
        source.addEdgeGroup('left', { id: 'a', initialSize: 240 });
        source.addPanel({
            id: 'p1',
            component: 'default',
            position: { referenceGroup: 'a' },
        });
        source.addPanel({ id: 'main', component: 'default' });
        const state = source.toJSON();

        // widen the saved edge into a two-group stack by hand
        const left = state.edgeGroups!.left as SerializedEdgeStack;
        state.panels.p2 = { ...state.panels.p1, id: 'p2' };
        left.groups = [
            { size: 400, group: left.group },
            {
                size: 400,
                group: { id: 'b', views: ['p2'], activeView: 'p2' },
            },
        ];

        const dockview = freeDockview();
        dockview.fromJSON(state);
        dockview.fromJSON(state);

        expect(dockview.getEdgeGroups('left').map((g) => g.id)).toEqual(['a']);
        expect(dockview.panels.map((p) => p.id).sort()).toEqual(['main', 'p1']);
        expect(
            errors().filter((m) =>
                m.includes('fromJSON edge stack restoration')
            )
        ).toHaveLength(1);
        // the edge keeps its single-group shape when saved again
        expect('groups' in dockview.toJSON().edgeGroups!.left!).toBe(false);
    });
});
