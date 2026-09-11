import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';

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
 * `proportionalLayout` decides how a container resize is shared out between the
 * groups of a row/column: proportionally (each group keeps its share of the
 * layout) or by handing the whole delta to the last group, which is what
 * VS Code does - every splitter but the last one stays put.
 */
describe('dockview proportionalLayout option', () => {
    function createDockview(
        proportionalLayout: boolean | undefined
    ): DockviewComponent {
        const container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            ...(proportionalLayout === undefined ? {} : { proportionalLayout }),
        });

        dockview.layout(900, 300);

        dockview.addPanel({ id: 'panel_1', component: 'default' });
        dockview.addPanel({
            id: 'panel_2',
            component: 'default',
            position: { referencePanel: 'panel_1', direction: 'right' },
        });
        dockview.addPanel({
            id: 'panel_3',
            component: 'default',
            position: { referencePanel: 'panel_2', direction: 'right' },
        });

        return dockview;
    }

    function widths(dockview: DockviewComponent): number[] {
        return dockview.groups.map((group) => group.api.width);
    }

    test('defaults to a proportional layout', () => {
        const dockview = createDockview(undefined);

        expect(widths(dockview)).toEqual([300, 300, 300]);

        dockview.layout(1200, 300);

        expect(widths(dockview)).toEqual([400, 400, 400]);

        dockview.dispose();
    });

    test('proportionalLayout: false gives the whole delta to the last group', () => {
        const dockview = createDockview(false);

        expect(widths(dockview)).toEqual([300, 300, 300]);

        dockview.layout(1200, 300);

        // the two leading splitters stay exactly where they were
        expect(widths(dockview)).toEqual([300, 300, 600]);

        dockview.layout(900, 300);

        expect(widths(dockview)).toEqual([300, 300, 300]);

        dockview.dispose();
    });

    test('applies to nested rows and columns, not just the root', () => {
        const container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            proportionalLayout: false,
        });

        dockview.layout(600, 900);

        dockview.addPanel({ id: 'panel_1', component: 'default' });
        dockview.addPanel({
            id: 'panel_2',
            component: 'default',
            position: { referencePanel: 'panel_1', direction: 'below' },
        });
        dockview.addPanel({
            id: 'panel_3',
            component: 'default',
            position: { referencePanel: 'panel_2', direction: 'below' },
        });

        expect(dockview.groups.map((group) => group.api.height)).toEqual([
            300, 300, 300,
        ]);

        dockview.layout(600, 1200);

        expect(dockview.groups.map((group) => group.api.height)).toEqual([
            300, 300, 600,
        ]);

        dockview.dispose();
    });

    test('updateOptions toggles the behaviour at runtime', () => {
        const dockview = createDockview(true);

        dockview.updateOptions({ proportionalLayout: false });

        dockview.layout(1200, 300);
        expect(widths(dockview)).toEqual([300, 300, 600]);

        dockview.updateOptions({ proportionalLayout: true });

        // the sizes in place when it was re-enabled become the proportions
        dockview.layout(2400, 300);
        expect(widths(dockview)).toEqual([600, 600, 1200]);

        dockview.dispose();
    });

    test('updateOptions reaches nested branches, not just the root row', () => {
        const container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });

        dockview.layout(900, 600);

        // panel_1 | (panel_2 above panel_3) - the root row holds a leaf and a
        // nested column, so the toggle has to recurse to reach the column.
        dockview.addPanel({ id: 'panel_1', component: 'default' });
        dockview.addPanel({
            id: 'panel_2',
            component: 'default',
            position: { referencePanel: 'panel_1', direction: 'right' },
        });
        dockview.addPanel({
            id: 'panel_3',
            component: 'default',
            position: { referencePanel: 'panel_2', direction: 'below' },
        });

        const nested = () =>
            ['panel_2', 'panel_3'].map(
                (id) => dockview.getGroupPanel(id)!.group.api.height
            );

        expect(nested()).toEqual([300, 300]);

        dockview.updateOptions({ proportionalLayout: false });

        dockview.layout(900, 900);

        // proportional would give [450, 450]; the nested column only splits
        // this way if the new value propagated past the root branch
        expect(nested()).toEqual([300, 600]);

        dockview.dispose();
    });

    test('an unrelated updateOptions leaves the behaviour untouched', () => {
        const dockview = createDockview(false);

        dockview.updateOptions({ hideBorders: true });

        dockview.layout(1200, 300);
        expect(widths(dockview)).toEqual([300, 300, 600]);

        dockview.dispose();
    });
});
