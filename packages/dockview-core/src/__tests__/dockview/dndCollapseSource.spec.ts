import { fireEvent } from '@testing-library/dom';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { IContentRenderer } from '../../dockview/types';
import { getGridLocation } from '../../gridview/gridview';

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

describe('dndCollapseSource', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    /** Three groups side by side, 400px each: a | b | c. */
    function createDockview(dndCollapseSource?: boolean): {
        dockview: DockviewComponent;
        a: DockviewGroupPanel;
        b: DockviewGroupPanel;
        c: DockviewGroupPanel;
    } {
        const dockview = new DockviewComponent(document.createElement('div'), {
            createComponent: () => new TestPanel(),
            ...(dndCollapseSource === undefined ? {} : { dndCollapseSource }),
        });
        dockview.layout(1200, 600);

        const a = dockview.addPanel({ id: 'a', component: 'default' }).group;
        const b = dockview.addPanel({
            id: 'b',
            component: 'default',
            position: { referencePanel: 'a', direction: 'right' },
        }).group;
        const c = dockview.addPanel({
            id: 'c',
            component: 'default',
            position: { referencePanel: 'b', direction: 'right' },
        }).group;

        return { dockview, a, b, c };
    }

    function tabOf(group: DockviewGroupPanel): Element {
        const tab = group.element.querySelector('.dv-tab');
        expect(tab).toBeTruthy();
        return tab!;
    }

    /** Collapsed: out of the grid for the drag, or hidden in it. */
    function isHidden(
        dockview: DockviewComponent,
        group: DockviewGroupPanel
    ): boolean {
        if (!(dockview as any).gridview.element.contains(group.element)) {
            return true;
        }
        return !dockview.isVisible(group);
    }

    test('the source stays in place by default', () => {
        const { dockview, a, b } = createDockview();

        fireEvent.dragStart(tabOf(a));
        jest.runAllTimers();

        expect(isHidden(dockview, a)).toBe(false);
        expect(a.api.width).toBe(400);
        expect(b.api.width).toBe(400);

        dockview.dispose();
    });

    test('dragging the only tab of a group collapses the group', () => {
        const { dockview, a, b, c } = createDockview(true);

        fireEvent.dragStart(tabOf(a));
        expect(isHidden(dockview, a)).toBe(false);

        jest.runAllTimers();

        expect(isHidden(dockview, a)).toBe(true);
        expect(b.api.width + c.api.width).toBe(1200);

        dockview.dispose();
    });

    test('dragging a group by its header collapses the group', () => {
        const { dockview, a } = createDockview(true);

        fireEvent.dragStart(a.element.querySelector('.dv-void-container')!);
        jest.runAllTimers();

        expect(isHidden(dockview, a)).toBe(true);

        dockview.dispose();
    });

    test('dragging one tab of a multi-tab group keeps the group', () => {
        const { dockview, a } = createDockview(true);
        dockview.addPanel({
            id: 'a2',
            component: 'default',
            position: { referenceGroup: a },
        });

        fireEvent.dragStart(tabOf(a));
        jest.runAllTimers();

        expect(isHidden(dockview, a)).toBe(false);

        dockview.dispose();
    });

    test('the last grid group is never collapsed', () => {
        const dockview = new DockviewComponent(document.createElement('div'), {
            createComponent: () => new TestPanel(),
            dndCollapseSource: true,
        });
        dockview.layout(1200, 600);
        const a = dockview.addPanel({ id: 'a', component: 'default' }).group;

        fireEvent.dragStart(tabOf(a));
        jest.runAllTimers();

        expect(isHidden(dockview, a)).toBe(false);

        dockview.dispose();
    });

    describe('sharing the freed space', () => {
        /** Three groups stacked, 200px each: a / b / c. */
        function createColumn(): {
            dockview: DockviewComponent;
            groups: DockviewGroupPanel[];
        } {
            const dockview = new DockviewComponent(
                document.createElement('div'),
                {
                    createComponent: () => new TestPanel(),
                    dndCollapseSource: true,
                }
            );
            dockview.layout(1200, 600);
            const a = dockview.addPanel({
                id: 'a',
                component: 'default',
            }).group;
            const b = dockview.addPanel({
                id: 'b',
                component: 'default',
                position: { referencePanel: 'a', direction: 'below' },
            }).group;
            const c = dockview.addPanel({
                id: 'c',
                component: 'default',
                position: { referencePanel: 'b', direction: 'below' },
            }).group;
            return { dockview, groups: [a, b, c] };
        }

        test('equal neighbours split it evenly', () => {
            const { dockview, groups } = createColumn();
            const [a, b, c] = groups;

            fireEvent.dragStart(tabOf(b));
            jest.runAllTimers();

            expect(a.api.height).toBe(300);
            expect(c.api.height).toBe(300);

            dockview.dispose();
        });

        test('neighbours share it in proportion to their sizes', () => {
            const { dockview, groups } = createColumn();
            const [a, b, c] = groups;
            a.api.setSize({ height: 100 });
            b.api.setSize({ height: 200 });
            // a 100 / b 200 / c 300
            expect(c.api.height).toBe(300);

            fireEvent.dragStart(tabOf(b));
            jest.runAllTimers();

            expect(a.api.height).toBe(150);
            expect(c.api.height).toBe(450);

            dockview.dispose();
        });

        test('a cancelled drag puts every size back', () => {
            const { dockview, groups } = createColumn();
            const [a, b, c] = groups;
            a.api.setSize({ height: 100 });
            b.api.setSize({ height: 200 });
            const tab = tabOf(b);

            fireEvent.dragStart(tab);
            jest.runAllTimers();
            fireEvent.dragEnd(tab);

            expect([a, b, c].map((g) => g.api.height)).toEqual([100, 200, 300]);

            dockview.dispose();
        });

        test('it stays in the branch the source leaves', () => {
            const dockview = new DockviewComponent(
                document.createElement('div'),
                {
                    createComponent: () => new TestPanel(),
                    dndCollapseSource: true,
                }
            );
            dockview.layout(1200, 600);
            const a = dockview.addPanel({
                id: 'a',
                component: 'default',
            }).group;
            const b = dockview.addPanel({
                id: 'b',
                component: 'default',
                position: { referencePanel: 'a', direction: 'right' },
            }).group;
            dockview.addPanel({
                id: 'c',
                component: 'default',
                position: { referencePanel: 'b', direction: 'below' },
            });
            const d = dockview.addPanel({
                id: 'd',
                component: 'default',
                position: { referencePanel: 'a', direction: 'below' },
            }).group;
            // [a / d] | [b / c], each column 600px wide
            const tab = tabOf(a);

            fireEvent.dragStart(tab);
            jest.runAllTimers();

            expect(d.api.height).toBe(600);
            expect(b.api.width).toBe(600);

            fireEvent.dragEnd(tab);
            dockview.dispose();
        });
    });

    test('a cancelled drag restores the source', () => {
        const { dockview, a, b, c } = createDockview(true);
        const tab = tabOf(a);

        fireEvent.dragStart(tab);
        jest.runAllTimers();
        expect(isHidden(dockview, a)).toBe(true);

        fireEvent.dragEnd(tab);

        expect(isHidden(dockview, a)).toBe(false);
        expect(a.api.isVisible).toBe(true);
        expect(a.api.width + b.api.width + c.api.width).toBe(1200);
        expect(dockview.groups).toEqual([a, b, c]);

        dockview.dispose();
    });

    test('a cancelled drag brings the source back at its size', () => {
        const { dockview, a } = createDockview(true);
        a.api.setSize({ width: 200 });
        const tab = tabOf(a);

        fireEvent.dragStart(tab);
        jest.runAllTimers();
        fireEvent.dragEnd(tab);

        expect(a.api.width).toBe(200);

        dockview.dispose();
    });

    test('a drag that ends before the collapse runs leaves the layout alone', () => {
        const { dockview, a } = createDockview(true);
        const tab = tabOf(a);

        fireEvent.dragStart(tab);
        fireEvent.dragEnd(tab);
        jest.runAllTimers();

        expect(isHidden(dockview, a)).toBe(false);
        expect(a.api.width).toBe(400);

        dockview.dispose();
    });

    test.each([
        ['tab', false],
        ['group', true],
    ])('dropping a collapsed %s lands where the overlay previewed', (_kind, wholeGroup) => {
        const { dockview, a, b, c } = createDockview(true);
        const tab = tabOf(a);

        fireEvent.dragStart(tab);
        jest.runAllTimers();

        expect(b.api.width).toBe(600);
        expect(c.api.width).toBe(600);

        dockview.moveGroupOrPanel({
            from: {
                groupId: a.id,
                panelId: wholeGroup ? undefined : 'a',
            },
            to: { group: c, position: 'left' },
        });
        fireEvent.dragEnd(tab);

        const moved = dockview.getGroupPanel('a')!.group;
        expect(getGridLocation(b.element)).toEqual([0]);
        expect(getGridLocation(moved.element)).toEqual([1]);
        expect(getGridLocation(c.element)).toEqual([2]);

        expect(b.api.width).toBe(600);
        expect(moved.api.width).toBe(300);
        expect(c.api.width).toBe(300);

        expect(isHidden(dockview, moved)).toBe(false);
        expect(moved.api.isVisible).toBe(true);

        dockview.dispose();
    });

    test('merging a collapsed group into another group removes it', () => {
        const { dockview, a, c } = createDockview(true);
        const tab = tabOf(a);

        fireEvent.dragStart(tab);
        jest.runAllTimers();

        dockview.moveGroupOrPanel({
            from: { groupId: a.id, panelId: 'a' },
            to: { group: c, position: 'center' },
        });
        fireEvent.dragEnd(tab);

        expect(dockview.groups).toHaveLength(2);
        expect(c.panels.map((p) => p.id)).toEqual(['c', 'a']);

        dockview.dispose();
    });

    test('a collapsed group is not swapped at its hidden size', () => {
        const { dockview, a, b, c } = createDockview(true);
        a.api.setSize({ width: 200 });
        const tab = tabOf(a);

        fireEvent.dragStart(tab);
        jest.runAllTimers();

        const bWidth = b.api.width;
        const cWidth = c.api.width;

        dockview.moveGroupOrPanel({
            from: { groupId: a.id, panelId: 'a' },
            to: { group: c, position: 'right' },
        });
        fireEvent.dragEnd(tab);

        const moved = dockview.getGroupPanel('a')!.group;
        expect(getGridLocation(moved.element)).toEqual([2]);
        expect(b.api.width).toBe(bWidth);
        expect(c.api.width).toBe(cWidth / 2);
        expect(moved.api.width).toBe(cWidth / 2);

        dockview.dispose();
    });
});
