import { DockviewComponent } from '../../dockview/dockviewComponent';
import type { IContentRenderer } from '../../dockview/types';

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
    const dockview = new DockviewComponent(document.createElement('div'), {
        createComponent: () => new TestPanel(),
    });
    dockview.layout(1000, 600);
    return dockview;
}

/**
 * A group's `locked` is `boolean | 'no-drop-target'`. `toJSON` writes the
 * value as is; `fromJSON` has to restore it as is too, or a group saved as
 * `'no-drop-target'` comes back as a plain `true` and accepts drops again.
 */
describe('group locked state round trip', () => {
    test.each([
        true,
        'no-drop-target',
    ] as const)('restores locked: %s through toJSON / fromJSON', (locked) => {
        const source = createDockview();
        const panel = source.addPanel({ id: 'p1', component: 'default' });
        panel.group.model.locked = locked;

        const target = createDockview();
        target.fromJSON(source.toJSON());

        expect(target.groups.map((g) => g.locked)).toEqual([locked]);

        source.dispose();
        target.dispose();
    });

    test('restores an unlocked group as unlocked', () => {
        const source = createDockview();
        source.addPanel({ id: 'p1', component: 'default' });

        const target = createDockview();
        target.fromJSON(source.toJSON());

        expect(target.groups.map((g) => g.locked)).toEqual([false]);

        source.dispose();
        target.dispose();
    });
});
