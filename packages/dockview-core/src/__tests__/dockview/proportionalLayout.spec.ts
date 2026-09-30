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

    test('branches created after a runtime toggle pick up the new value', () => {
        const dockview = createDockview(true);

        dockview.updateOptions({ proportionalLayout: false });

        // splitting panel_3 downwards builds a new column after the toggle
        dockview.addPanel({
            id: 'panel_4',
            component: 'default',
            position: { referencePanel: 'panel_3', direction: 'below' },
        });

        const column = () =>
            ['panel_3', 'panel_4'].map(
                (id) => dockview.getGroupPanel(id)!.group.api.height
            );

        expect(column()).toEqual([150, 150]);

        dockview.layout(900, 600);

        expect(column()).toEqual([150, 450]);

        dockview.dispose();
    });

    test('a new root created after a runtime toggle picks up the new value', () => {
        const dockview = createDockview(true);

        dockview.updateOptions({ proportionalLayout: false });

        // docking below the whole grid wraps the root row in a new column root
        dockview.addPanel({
            id: 'panel_4',
            component: 'default',
            position: { direction: 'below' },
        });

        const rows = () =>
            ['panel_1', 'panel_4'].map(
                (id) => dockview.getGroupPanel(id)!.group.api.height
            );

        expect(rows()).toEqual([150, 150]);

        dockview.layout(900, 600);

        expect(rows()).toEqual([150, 450]);

        dockview.dispose();
    });

    test('a layout loaded with fromJSON after a runtime toggle keeps the new value', () => {
        const dockview = createDockview(true);
        const json = dockview.toJSON();

        dockview.updateOptions({ proportionalLayout: false });

        // fromJSON replaces the whole tree, root included
        dockview.fromJSON(json);

        expect(widths(dockview)).toEqual([300, 300, 300]);

        dockview.layout(1200, 300);

        expect(widths(dockview)).toEqual([300, 300, 600]);

        dockview.dispose();
    });

    test('proportionalLayout: false keeps a user-moved splitter in place on resize', () => {
        const dockview = createDockview(false);

        dockview.getGroupPanel('panel_1')!.api.setSize({ width: 200 });

        const moved = widths(dockview);
        expect(moved[0]).toBe(200);

        dockview.layout(1200, 300);

        // only the last group absorbs the container growth
        expect(widths(dockview)).toEqual([moved[0], moved[1], moved[2] + 300]);

        dockview.dispose();
    });

    test('an unrelated updateOptions leaves the behaviour untouched', () => {
        const dockview = createDockview(false);

        dockview.updateOptions({ hideBorders: true });

        dockview.layout(1200, 300);
        expect(widths(dockview)).toEqual([300, 300, 600]);

        dockview.dispose();
    });

    describe('floating and popout windows', () => {
        function createFloatingSplit(
            proportionalLayout: boolean | undefined
        ): DockviewComponent {
            const container = document.createElement('div');
            const dockview = new DockviewComponent(container, {
                createComponent: () => new TestPanel(),
                ...(proportionalLayout === undefined
                    ? {}
                    : { proportionalLayout }),
            });

            dockview.layout(1000, 500);

            dockview.addPanel({ id: 'panel_1', component: 'default' });
            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });
            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { referencePanel: 'panel_1', direction: 'right' },
            });

            // split panel_3's group into the floating window beside panel_2
            dockview.moveGroupOrPanel({
                from: { groupId: panel3.group.id },
                to: { group: panel2.group, position: 'right' },
            });

            return dockview;
        }

        function floatingWidths(dockview: DockviewComponent): number[] {
            return ['panel_2', 'panel_3'].map(
                (id) => dockview.getGroupPanel(id)!.group.api.width
            );
        }

        function floatingGridview(dockview: DockviewComponent) {
            return dockview.getGridviewForGroup(
                dockview.getGroupPanel('panel_2')!.group
            );
        }

        test('a floating window follows proportionalLayout: false', () => {
            const dockview = createFloatingSplit(false);

            const gridview = floatingGridview(dockview);
            expect(gridview).toBe(dockview.floatingGroups[0].gridview);

            gridview.layout(400, 300);
            const before = floatingWidths(dockview);

            gridview.layout(600, 300);

            // only the last group in the window absorbs the growth
            expect(floatingWidths(dockview)).toEqual([
                before[0],
                before[1] + 200,
            ]);

            dockview.dispose();
        });

        test('a floating window stays proportional by default', () => {
            const dockview = createFloatingSplit(undefined);

            const gridview = floatingGridview(dockview);

            gridview.layout(400, 300);
            expect(floatingWidths(dockview)).toEqual([200, 200]);

            gridview.layout(600, 300);
            expect(floatingWidths(dockview)).toEqual([300, 300]);

            dockview.dispose();
        });

        test('updateOptions reaches an open floating window', () => {
            const dockview = createFloatingSplit(true);

            const gridview = floatingGridview(dockview);
            gridview.layout(400, 300);

            dockview.updateOptions({ proportionalLayout: false });

            expect(gridview.proportionalLayout).toBe(false);

            gridview.layout(600, 300);
            expect(floatingWidths(dockview)).toEqual([200, 400]);

            dockview.dispose();
        });

        test('popout windows follow the option, at creation and at runtime', async () => {
            window.open = () => setupMockWindow();

            const container = document.createElement('div');
            const dockview = new DockviewComponent(container, {
                createComponent: () => new TestPanel(),
                proportionalLayout: false,
            });

            dockview.layout(1000, 500);

            dockview.addPanel({ id: 'panel_1', component: 'default' });
            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { referencePanel: 'panel_1', direction: 'right' },
            });

            await dockview.addPopoutGroup(panel2);

            const gridview = dockview.getGridviewForGroup(panel2.group);
            expect(gridview).not.toBe(
                dockview.getGridviewForGroup(
                    dockview.getGroupPanel('panel_1')!.group
                )
            );
            expect(gridview.proportionalLayout).toBe(false);

            dockview.updateOptions({ proportionalLayout: true });

            expect(gridview.proportionalLayout).toBe(true);

            dockview.dispose();
        });
    });
});
