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

describe('popping out a single panel with renderer "always"', () => {
    const originalOpen = window.open;

    afterEach(() => {
        window.open = originalOpen;
    });

    test('does not leave its overlay behind in the source group', async () => {
        window.open = () => setupMockWindow();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            defaultRenderer: 'always',
        });
        dockview.layout(800, 400);
        dockview.addPanel({ id: 'a', component: 'default' });
        const b = dockview.addPanel({ id: 'b', component: 'default' });

        expect(container.querySelectorAll('.dv-render-overlay')).toHaveLength(
            2
        );

        await dockview.addPopoutGroup(b);

        expect(b.group.api.location.type).toBe('popout');
        expect(container.querySelectorAll('.dv-render-overlay')).toHaveLength(
            1
        );

        dockview.dispose();
        container.remove();
    });
});
