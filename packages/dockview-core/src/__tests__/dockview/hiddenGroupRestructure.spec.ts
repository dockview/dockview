import { DockviewComponent } from '../../dockview/dockviewComponent';
import type { IContentRenderer } from '../../dockview/types';
import type {
    ISerializedLeafNode,
    ISerializedNode,
} from '../../gridview/gridview';

/**
 * A group hidden with `group.api.setVisible(false)` must stay hidden when the
 * gridview restructures the branch that holds it. Before the fix the group
 * came back as a visible view with a non-zero size while `api.isVisible` still
 * reported `false`, and the two most common triggers are docking a panel to a
 * layout edge (which goes through `normalize()`) and closing a group whose
 * sibling branch is then merged into its grandparent.
 */
class TestPanel implements IContentRenderer {
    readonly element = document.createElement('div');
    init(): void {
        /* noop */
    }
    layout(): void {
        /* noop */
    }
    dispose(): void {
        /* noop */
    }
}

function createDockview(): DockviewComponent {
    const container = document.createElement('div');
    const dockview = new DockviewComponent(container, {
        createComponent: () => new TestPanel(),
    });
    dockview.layout(1000, 600);
    return dockview;
}

function findLeaf(
    node: ISerializedNode,
    viewId: string
): ISerializedLeafNode | undefined {
    if (node.type === 'leaf') {
        return node.data.views.includes(viewId) ? node : undefined;
    }
    for (const child of node.data) {
        const found = findLeaf(child, viewId);
        if (found) {
            return found;
        }
    }
    return undefined;
}

describe('hidden groups survive gridview restructuring', () => {
    test('a hidden group stays hidden after docking a panel to a layout edge', () => {
        const dockview = createDockview();
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        const p2 = dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { referenceGroup: p1.group, direction: 'below' },
        });

        p2.group.api.setVisible(false);
        expect(p2.group.api.isVisible).toBe(false);
        expect(p2.group.api.height).toBe(0);

        // the root now holds a single branch, so edge docking runs normalize()
        dockview.addPanel({
            id: 'p3',
            component: 'default',
            position: { direction: 'left' },
        });

        const leaf = findLeaf(dockview.toJSON().grid.root, 'p2');
        expect(leaf?.visible).toBe(false);
        expect(p2.group.api.isVisible).toBe(false);
        expect(p2.group.api.height).toBe(0);

        p2.group.api.setVisible(true);
        expect(p2.group.api.isVisible).toBe(true);
        expect(p2.group.api.height).toBeGreaterThan(0);
        expect(
            findLeaf(dockview.toJSON().grid.root, 'p2')?.visible
        ).toBeUndefined();

        dockview.dispose();
    });

    test('a hidden group stays hidden after closing a group that collapses its parent branch', () => {
        const dockview = createDockview();
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        const p2 = dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { referenceGroup: p1.group, direction: 'right' },
        });
        const p3 = dockview.addPanel({
            id: 'p3',
            component: 'default',
            position: { referenceGroup: p2.group, direction: 'below' },
        });
        dockview.addPanel({
            id: 'p4',
            component: 'default',
            position: { referenceGroup: p3.group, direction: 'right' },
        });
        // root(H) -> [p1, (V) -> [p2, (H) -> [p3, p4]]]

        p3.group.api.setVisible(false);
        expect(p3.group.api.width).toBe(0);

        // removing p2 leaves its parent with a single branch child, which is
        // merged into the root
        dockview.removeGroup(p2.group);

        const leaf = findLeaf(dockview.toJSON().grid.root, 'p3');
        expect(leaf?.visible).toBe(false);
        expect(p3.group.api.isVisible).toBe(false);
        expect(p3.group.api.width).toBe(0);

        p3.group.api.setVisible(true);
        expect(p3.group.api.isVisible).toBe(true);
        expect(p3.group.api.width).toBeGreaterThan(0);

        dockview.dispose();
    });

    test('a hidden group stays hidden after adding a group at a layout edge', () => {
        const dockview = createDockview();
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        const p2 = dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { referenceGroup: p1.group, direction: 'below' },
        });

        p2.group.api.setVisible(false);

        // addGroup with a bare direction is the third caller of orthogonalize()
        dockview.addGroup({ direction: 'left' });

        expect(findLeaf(dockview.toJSON().grid.root, 'p2')?.visible).toBe(
            false
        );
        expect(p2.group.api.height).toBe(0);

        p2.group.api.setVisible(true);
        expect(p2.group.api.height).toBeGreaterThan(0);

        dockview.dispose();
    });

    test('a layout saved after the restructure restores the hidden group with its size', () => {
        const dockview = createDockview();
        const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
        const p2 = dockview.addPanel({
            id: 'p2',
            component: 'default',
            position: { referenceGroup: p1.group, direction: 'below' },
        });
        p2.group.api.setVisible(false);
        dockview.addPanel({
            id: 'p3',
            component: 'default',
            position: { direction: 'left' },
        });

        const saved = dockview.toJSON();
        const leaf = findLeaf(saved.grid.root, 'p2');
        expect(leaf?.visible).toBe(false);
        expect(leaf?.size).toBeGreaterThan(0);
        dockview.dispose();

        const restored = createDockview();
        restored.fromJSON(saved);

        const group = restored.getGroupPanel('p2')?.group;
        if (!group) {
            throw new Error('p2 was not restored');
        }
        expect(group.api.isVisible).toBe(false);
        expect(group.api.height).toBe(0);

        group.api.setVisible(true);
        expect(group.api.isVisible).toBe(true);
        expect(group.api.height).toBeGreaterThan(0);

        restored.dispose();
    });
});
