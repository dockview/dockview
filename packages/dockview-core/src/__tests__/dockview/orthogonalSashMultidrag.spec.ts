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

describe('dockview disableOrthogonalSashMultidrag option', () => {
    function create(
        disableOrthogonalSashMultidrag?: boolean
    ): DockviewComponent {
        const container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            ...(disableOrthogonalSashMultidrag === undefined
                ? {}
                : { disableOrthogonalSashMultidrag }),
        });
        dockview.layout(1000, 500);
        return dockview;
    }

    function addFloatingSplit(dockview: DockviewComponent) {
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
        dockview.moveGroupOrPanel({
            from: { groupId: panel3.group.id },
            to: { group: panel2.group, position: 'right' },
        });
        return dockview.floatingGroups[0].gridview;
    }

    test('enabled by default, floating windows included', () => {
        const dockview = create();
        const floating = addFloatingSplit(dockview);

        expect(dockview.gridview.orthogonalSashMultidrag).toBe(true);
        expect(floating.orthogonalSashMultidrag).toBe(true);

        dockview.dispose();
    });

    test('a floating window follows the option at creation and at runtime', () => {
        const dockview = create(true);
        const floating = addFloatingSplit(dockview);

        expect(dockview.gridview.orthogonalSashMultidrag).toBe(false);
        expect(floating.orthogonalSashMultidrag).toBe(false);

        dockview.updateOptions({ disableOrthogonalSashMultidrag: false });

        expect(dockview.gridview.orthogonalSashMultidrag).toBe(true);
        expect(floating.orthogonalSashMultidrag).toBe(true);

        dockview.dispose();
    });

    test('a popout window follows the option at creation and at runtime', async () => {
        window.open = () => setupMockWindow();

        const dockview = create(true);
        dockview.addPanel({ id: 'panel_1', component: 'default' });
        const panel2 = dockview.addPanel({
            id: 'panel_2',
            component: 'default',
            position: { referencePanel: 'panel_1', direction: 'right' },
        });

        await dockview.addPopoutGroup(panel2);

        const popout = dockview.getGridviewForGroup(panel2.group);
        expect(popout).not.toBe(dockview.gridview);
        expect(popout.orthogonalSashMultidrag).toBe(false);

        dockview.updateOptions({ disableOrthogonalSashMultidrag: false });

        expect(popout.orthogonalSashMultidrag).toBe(true);

        dockview.dispose();
    });
});
