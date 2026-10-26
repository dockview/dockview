import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        // noop
    }
}

function createDockview(): DockviewComponent {
    const container = document.createElement('div');
    const dockview = new DockviewComponent(container, {
        createComponent: () => new TestPanel(),
    });
    dockview.layout(900, 600);
    return dockview;
}

/** A row of three panels with a fourth panel below it. */
function build(dockview: DockviewComponent): void {
    dockview.addPanel({ id: 'a', component: 'default' });
    dockview.addPanel({
        id: 'b',
        component: 'default',
        position: { referencePanel: 'a', direction: 'right' },
    });
    dockview.addPanel({
        id: 'c',
        component: 'default',
        position: { referencePanel: 'b', direction: 'right' },
    });
    dockview.addPanel({
        id: 't',
        component: 'default',
        position: { direction: 'below' },
    });
}

function rowWidths(dockview: DockviewComponent): number[] {
    return ['a', 'b', 'c'].map((id) => dockview.getGroupPanel(id)!.api.width);
}

/**
 * After `clear()` the root keeps the orientation it was left with, so the
 * rebuilt row ends up as the root's only child and `normalize()` clones it
 * into the root position. The clone used to come up without proportions,
 * so resizing the dock pushed the whole delta onto the row's last panel
 * (#1692).
 */
describe('proportions of a row rebuilt after clear()', () => {
    test('the row keeps its proportions when built once', () => {
        const dockview = createDockview();
        build(dockview);
        expect(rowWidths(dockview)).toEqual([300, 300, 300]);

        dockview.layout(600, 600);
        expect(rowWidths(dockview)).toEqual([200, 200, 200]);

        dockview.layout(900, 600);
        expect(rowWidths(dockview)).toEqual([300, 300, 300]);

        dockview.dispose();
    });

    test('the row keeps its proportions when rebuilt after clear() (#1692)', () => {
        const dockview = createDockview();
        build(dockview);
        dockview.clear();
        build(dockview);
        expect(rowWidths(dockview)).toEqual([300, 300, 300]);

        dockview.layout(600, 600);
        expect(rowWidths(dockview)).toEqual([200, 200, 200]);

        dockview.layout(900, 600);
        expect(rowWidths(dockview)).toEqual([300, 300, 300]);

        dockview.dispose();
    });
});
