import { DockviewComponent, type IContentRenderer } from 'dockview-core';

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
 * LayoutHistory undo/redo over the `closeEmptyGroups: false` paths: a group
 * kept empty is part of the recorded layout, so undoing the mutation that
 * emptied it puts the panel back into that same group.
 */
describe('LayoutHistory with closeEmptyGroups: false', () => {
    let container: HTMLElement;

    const make = (): DockviewComponent => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            layoutHistory: { enabled: true },
            closeEmptyGroups: false,
        });
        dockview.layout(800, 600);
        return dockview;
    };

    /** Two grid groups side by side: g1 holds p1, g2 holds p2 and p3. */
    const twoGroups = (d: DockviewComponent) => {
        const p1 = d.addPanel({ id: 'p1', component: 'default' });
        const p2 = d.addPanel({
            id: 'p2',
            component: 'default',
            position: { referencePanel: 'p1', direction: 'right' },
        });
        d.addPanel({
            id: 'p3',
            component: 'default',
            position: { referenceGroup: p2.group },
        });
        return { p1, g1: p1.group, g2: p2.group };
    };

    const layout = (d: DockviewComponent): Record<string, string[]> =>
        Object.fromEntries(
            d.groups.map((g) => [g.id, g.panels.map((p) => p.id)])
        );

    afterEach(() => {
        container.remove();
    });

    test('undo of closing the last panel restores it into the kept group', () => {
        const d = make();
        const { p1, g1 } = twoGroups(d);
        const before = layout(d);

        p1.api.close();
        expect(layout(d)).toEqual({ ...before, [g1.id]: [] });

        d.undo();
        expect(layout(d)).toEqual(before);

        d.redo();
        expect(layout(d)).toEqual({ ...before, [g1.id]: [] });
        expect(d.size).toBe(2);

        d.dispose();
    });

    test('undo of a move out of a kept group puts the panel back', () => {
        const d = make();
        const { g1, g2 } = twoGroups(d);
        const before = layout(d);

        d.moveGroupOrPanel({
            from: { groupId: g1.id, panelId: 'p1' },
            to: { group: g2, position: 'center' },
        });
        expect(layout(d)).toEqual({ [g1.id]: [], [g2.id]: ['p2', 'p3', 'p1'] });

        d.undo();
        expect(layout(d)).toEqual(before);

        d.dispose();
    });

    test('undo of a lone-panel edge move removes the new group and refills the kept one', () => {
        const d = make();
        const { g1, g2 } = twoGroups(d);
        const before = layout(d);

        d.moveGroupOrPanel({
            from: { groupId: g1.id, panelId: 'p1' },
            to: { group: g2, position: 'bottom' },
        });
        expect(d.size).toBe(3);
        expect(g1.panels).toHaveLength(0);

        d.undo();
        expect(layout(d)).toEqual(before);
        expect(d.size).toBe(2);

        d.dispose();
    });

    test('undo of closeAllGroups restores the groups and their panels', () => {
        const d = make();
        twoGroups(d);
        const before = layout(d);

        d.closeAllGroups();
        expect(d.size).toBe(0);

        d.undo();
        expect(layout(d)).toEqual(before);

        d.dispose();
    });

    test('undo of floating a lone panel returns it to the kept grid group', () => {
        const d = make();
        const { p1, g1 } = twoGroups(d);
        const before = layout(d);

        d.addFloatingGroup(p1);
        expect(d.floatingGroups).toHaveLength(1);
        expect(g1.panels).toHaveLength(0);

        d.undo();
        expect(d.floatingGroups).toHaveLength(0);
        expect(layout(d)).toEqual(before);

        d.dispose();
    });
});
