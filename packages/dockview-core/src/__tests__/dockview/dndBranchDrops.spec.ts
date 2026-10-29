import { fireEvent } from '@testing-library/dom';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { IContentRenderer } from '../../dockview/types';
import { getGridLocation } from '../../gridview/gridview';
import { DropTargetScopeArgs, nearestEdgeResolver } from '../../dnd/droptarget';

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

describe('dndBranchDrops', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    function createDockview(
        options: {
            dndBranchDrops?: boolean;
            dndCollapseSource?: boolean;
            dndNearestEdge?: boolean;
            dropSizing?: 'split' | 'distribute';
        } = {}
    ): DockviewComponent {
        const dockview = new DockviewComponent(document.createElement('div'), {
            createComponent: () => new TestPanel(),
            ...options,
        });
        dockview.layout(1200, 600);
        return dockview;
    }

    function add(
        dockview: DockviewComponent,
        id: string,
        referencePanel?: string,
        direction?: 'right' | 'below'
    ): DockviewGroupPanel {
        return dockview.addPanel({
            id,
            component: 'default',
            position: referencePanel
                ? { referencePanel, direction: direction! }
                : undefined,
        }).group;
    }

    /** A pointer `distance` px inside a 300x300 target's right edge. */
    function rightEdge(distance: number): DropTargetScopeArgs {
        return {
            position: 'right',
            x: 300 - distance,
            y: 150,
            width: 300,
            height: 300,
            zoneSize: 60,
        };
    }

    function groupOf(dockview: DockviewComponent, id: string) {
        return dockview.getGroupPanel(id)!.group;
    }

    function locationOf(dockview: DockviewComponent, id: string): number[] {
        return getGridLocation(groupOf(dockview, id).element);
    }

    /** a | d side by side, then b and c stacked under a: [ [a, b, c], d ]. */
    function createColumnLayout(options = {}) {
        const dockview = createDockview(options);
        add(dockview, 'a');
        add(dockview, 'd', 'a', 'right');
        add(dockview, 'b', 'a', 'below');
        add(dockview, 'c', 'b', 'below');
        return dockview;
    }

    describe('moving with a depth', () => {
        test('drops beside the column the target sits in', () => {
            const dockview = createColumnLayout();
            const a = groupOf(dockview, 'a');

            dockview.moveGroupOrPanel({
                from: { groupId: groupOf(dockview, 'c').id, panelId: 'c' },
                to: { group: a, position: 'right', depth: 1 },
            });

            // [ [a, b], c, d ]: c takes half of the column, at full height.
            expect(locationOf(dockview, 'a')).toEqual([0, 0]);
            expect(locationOf(dockview, 'b')).toEqual([0, 1]);
            expect(locationOf(dockview, 'c')).toEqual([1]);
            expect(locationOf(dockview, 'd')).toEqual([2]);

            const c = groupOf(dockview, 'c');
            expect(c.api.height).toBe(600);
            expect(c.api.width).toBe(300);
            expect(a.api.width).toBe(300);
            expect(groupOf(dockview, 'd').api.width).toBe(600);

            dockview.dispose();
        });

        test("shares the row equally with dropSizing 'distribute'", () => {
            const dockview = createColumnLayout({ dropSizing: 'distribute' });

            dockview.moveGroupOrPanel({
                from: { groupId: groupOf(dockview, 'c').id, panelId: 'c' },
                to: {
                    group: groupOf(dockview, 'a'),
                    position: 'right',
                    depth: 1,
                },
            });

            expect(locationOf(dockview, 'c')).toEqual([1]);
            expect(groupOf(dockview, 'a').api.width).toBe(400);
            expect(groupOf(dockview, 'c').api.width).toBe(400);
            expect(groupOf(dockview, 'd').api.width).toBe(400);

            dockview.dispose();
        });

        test('without a depth the target group is split, as before', () => {
            const dockview = createColumnLayout();

            dockview.moveGroupOrPanel({
                from: { groupId: groupOf(dockview, 'c').id, panelId: 'c' },
                to: { group: groupOf(dockview, 'a'), position: 'right' },
            });

            expect(locationOf(dockview, 'a')).toEqual([0, 0, 0]);
            expect(locationOf(dockview, 'c')).toEqual([0, 0, 1]);

            dockview.dispose();
        });

        test('drops beside the whole layout laid out across the drop axis', () => {
            // [a, b, c] stacked: once c leaves, the column is the layout.
            const dockview = createDockview();
            add(dockview, 'a');
            add(dockview, 'b', 'a', 'below');
            add(dockview, 'c', 'b', 'below');
            (dockview as any).gridview.normalize();
            expect(locationOf(dockview, 'a')).toEqual([0]);

            dockview.moveGroupOrPanel({
                from: { groupId: groupOf(dockview, 'c').id, panelId: 'c' },
                to: {
                    group: groupOf(dockview, 'a'),
                    position: 'right',
                    depth: 1,
                },
            });

            expect(locationOf(dockview, 'a')).toEqual([0, 0]);
            expect(locationOf(dockview, 'b')).toEqual([0, 1]);
            expect(locationOf(dockview, 'c')).toEqual([1]);

            const c = groupOf(dockview, 'c');
            expect(c.api.height).toBe(600);
            expect(c.api.width).toBe(600);

            dockview.dispose();
        });

        test('a depth is not mistaken for a swap between siblings', () => {
            // [ [a, b], c ] with a row on top: b dropped left of a would
            // otherwise just trade places with it.
            const dockview = createDockview();
            add(dockview, 'a');
            add(dockview, 'c', 'a', 'below');
            add(dockview, 'b', 'a', 'right');

            dockview.moveGroupOrPanel({
                from: { groupId: groupOf(dockview, 'b').id, panelId: 'b' },
                to: {
                    group: groupOf(dockview, 'a'),
                    position: 'left',
                    depth: 1,
                },
            });

            expect(locationOf(dockview, 'b')).toEqual([0]);
            expect(locationOf(dockview, 'a')).toEqual([1, 0]);
            expect(locationOf(dockview, 'c')).toEqual([1, 1]);

            dockview.dispose();
        });

        test('a depth beyond the largest region is clamped to it', () => {
            const dockview = createColumnLayout();

            dockview.moveGroupOrPanel({
                from: { groupId: groupOf(dockview, 'c').id, panelId: 'c' },
                to: {
                    group: groupOf(dockview, 'a'),
                    position: 'right',
                    depth: 9,
                },
            });

            expect(locationOf(dockview, 'c')).toEqual([1]);

            dockview.dispose();
        });

        test('moving a whole group honours the depth', () => {
            const dockview = createColumnLayout();

            dockview.moveGroupOrPanel({
                from: { groupId: groupOf(dockview, 'c').id },
                to: {
                    group: groupOf(dockview, 'a'),
                    position: 'left',
                    depth: 1,
                },
            });

            expect(locationOf(dockview, 'c')).toEqual([0]);
            expect(locationOf(dockview, 'a')).toEqual([1, 0]);
            expect(groupOf(dockview, 'c').api.height).toBe(600);

            dockview.dispose();
        });

        test('moving one panel out of a group honours the depth', () => {
            const dockview = createColumnLayout();
            dockview.addPanel({
                id: 'c2',
                component: 'default',
                position: { referencePanel: 'c' },
            });

            dockview.moveGroupOrPanel({
                from: { groupId: groupOf(dockview, 'c2').id, panelId: 'c2' },
                to: {
                    group: groupOf(dockview, 'a'),
                    position: 'right',
                    depth: 1,
                },
            });

            expect(locationOf(dockview, 'c2')).toEqual([1]);
            expect(groupOf(dockview, 'c2').api.height).toBe(600);
            expect(groupOf(dockview, 'c').panels.map((p) => p.id)).toEqual([
                'c',
            ]);

            dockview.dispose();
        });

        test('a drop on a group forwards its depth to the move', () => {
            const dockview = createColumnLayout();
            const a = groupOf(dockview, 'a');

            (a.model as any)._onMove.fire({
                target: 'right',
                groupId: groupOf(dockview, 'c').id,
                itemId: 'c',
                depth: 1,
            });

            expect(locationOf(dockview, 'c')).toEqual([1]);

            dockview.dispose();
        });
    });

    describe('resolving the drop', () => {
        test('is off by default', () => {
            const dockview = createColumnLayout();

            expect(
                dockview.resolveBranchDropScope(
                    groupOf(dockview, 'a').id,
                    rightEdge(1)
                )
            ).toBeUndefined();

            dockview.dispose();
        });

        test('splits the edge zone into one band per region', () => {
            const dockview = createColumnLayout({ dndBranchDrops: true });
            const a = groupOf(dockview, 'a').id;

            // One region (the column): a band of at most 24px along the edge.
            expect(
                dockview.resolveBranchDropScope(a, rightEdge(1))?.depth
            ).toBe(1);
            expect(
                dockview.resolveBranchDropScope(a, rightEdge(23))?.depth
            ).toBe(1);
            expect(
                dockview.resolveBranchDropScope(a, rightEdge(25))
            ).toBeUndefined();

            dockview.dispose();
        });

        test('has nothing to offer where the group is not on the edge', () => {
            const dockview = createColumnLayout({ dndBranchDrops: true });

            expect(
                dockview.resolveBranchDropScope(groupOf(dockview, 'a').id, {
                    ...rightEdge(1),
                    position: 'bottom',
                    y: 299,
                })
            ).toBeUndefined();

            dockview.dispose();
        });

        test('is resolved against the layout without a collapsed source', () => {
            jest.useFakeTimers();
            // [ [a, b], [c, d] ]: dragging d away leaves c alone on the right,
            // so the [c, d] column is no longer a region of its own.
            const dockview = createDockview({
                dndBranchDrops: true,
                dndCollapseSource: true,
            });
            add(dockview, 'a');
            add(dockview, 'c', 'a', 'right');
            add(dockview, 'b', 'a', 'below');
            add(dockview, 'd', 'c', 'below');
            const c = groupOf(dockview, 'c');

            expect(
                dockview.resolveBranchDropScope(c.id, {
                    ...rightEdge(1),
                    position: 'left',
                    x: 1,
                })?.depth
            ).toBe(1);

            const tab = groupOf(dockview, 'd').element.querySelector(
                '.dv-tab'
            )!;
            fireEvent.dragStart(tab);
            jest.runAllTimers();

            expect(
                dockview.resolveBranchDropScope(c.id, {
                    ...rightEdge(1),
                    position: 'left',
                    x: 1,
                })
            ).toBeUndefined();

            fireEvent.dragEnd(tab);
            dockview.dispose();
        });
    });

    describe('with dndNearestEdge', () => {
        test('content targets resolve to the nearest side', () => {
            const dockview = createColumnLayout({ dndNearestEdge: true });
            expect(dockview.getDropPositionResolver()).toBe(
                nearestEdgeResolver
            );
            dockview.dispose();
        });

        test('keeps the side it is on until another is clearly nearer', () => {
            const dockview = createColumnLayout({ dndNearestEdge: true });
            const a = groupOf(dockview, 'a').id;
            const resolver = dockview.getDropPositionResolver(a)!;
            const at = (x: number, y: number) =>
                resolver.resolve({
                    x,
                    y,
                    width: 100,
                    height: 100,
                    zones: new Set([
                        'top',
                        'bottom',
                        'left',
                        'right',
                        'center',
                    ]),
                    event: new Event('dragover') as DragEvent,
                })?.position;

            expect(at(10, 40)).toBe('left');
            // Just past the diagonal, left is kept; clearly nearer the top, it switches.
            expect(at(30, 25)).toBe('left');
            expect(at(45, 10)).toBe('top');

            dockview.dispose();
        });

        test('forgets the side once the drag is over', () => {
            const dockview = createColumnLayout({ dndNearestEdge: true });
            const a = groupOf(dockview, 'a');
            const resolver = dockview.getDropPositionResolver(a.id)!;
            const at = (x: number, y: number) =>
                resolver.resolve({
                    x,
                    y,
                    width: 100,
                    height: 100,
                    zones: new Set([
                        'top',
                        'bottom',
                        'left',
                        'right',
                        'center',
                    ]),
                    event: new Event('dragover') as DragEvent,
                })?.position;
            const tab = groupOf(dockview, 'd').element.querySelector(
                '.dv-tab'
            )!;

            fireEvent.dragStart(tab);
            expect(at(10, 40)).toBe('left');
            fireEvent.dragEnd(tab);

            expect(at(30, 25)).toBe('top');

            dockview.dispose();
        });

        test("an app's own resolver still comes first", () => {
            const resolver = { resolve: () => null };
            const dockview = createDockview({ dndNearestEdge: true });
            dockview.updateOptions({ dropPositionResolver: resolver });
            expect(dockview.getDropPositionResolver()).toBe(resolver);
            dockview.dispose();
        });

        test('regions keep to a thin band along the edge', () => {
            const dockview = createColumnLayout({
                dndBranchDrops: true,
                dndNearestEdge: true,
            });
            const a = groupOf(dockview, 'a').id;

            // 300px wide: the right half is 150px, the column's band 24px.
            expect(
                dockview.resolveBranchDropScope(a, rightEdge(23))?.depth
            ).toBe(1);
            expect(
                dockview.resolveBranchDropScope(a, rightEdge(25))
            ).toBeUndefined();

            dockview.dispose();
        });
    });

    describe('along the layout border', () => {
        type Box = [number, number, number, number];
        function mockRect(element: Element, [left, top, width, height]: Box) {
            jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
                left,
                top,
                width,
                height,
                right: left + width,
                bottom: top + height,
                x: left,
                y: top,
                toJSON: () => ({}),
            });
        }

        /** [ [a, b, c], d ] on screen: the column 600px wide, d beside it. */
        function createScreenLayout(options = {}) {
            const dockview = createColumnLayout({
                dndBranchDrops: true,
                dndNearestEdge: true,
                ...options,
            });
            mockRect((dockview as any).gridview.element, [0, 0, 1200, 600]);
            mockRect(groupOf(dockview, 'a').element, [0, 0, 600, 200]);
            mockRect(groupOf(dockview, 'b').element, [0, 200, 600, 200]);
            mockRect(groupOf(dockview, 'c').element, [0, 400, 600, 200]);
            mockRect(groupOf(dockview, 'd').element, [600, 0, 600, 600]);
            return dockview;
        }

        /** The pointer `fromBottom` px above c's bottom edge, which is the layout's. */
        function bottomOfC(fromBottom: number): DropTargetScopeArgs {
            return {
                position: 'bottom',
                x: 300,
                y: 200 - fromBottom,
                width: 600,
                height: 200,
                zoneSize: 40,
                clientX: 300,
                clientY: 600 - fromBottom,
            };
        }

        test('a wide band drops across the whole layout', () => {
            const dockview = createScreenLayout();
            const c = groupOf(dockview, 'c').id;

            // Past the 24px band of the regions, but within 48px of the border.
            const scope = dockview.resolveBranchDropScope(c, bottomOfC(40));
            expect(scope?.depth).toBe(1);
            expect(scope?.box).toEqual({
                left: 0,
                top: 0,
                width: 1200,
                height: 600,
            });
            expect(
                dockview.resolveBranchDropScope(c, bottomOfC(60))
            ).toBeUndefined();

            dockview.dispose();
        });

        test('the layout edge target opens room instead of its overlay', () => {
            jest.useFakeTimers();
            const dockview = createScreenLayout({
                dndCollapseSource: true,
                dndLivePreview: true,
            });
            const tab = groupOf(dockview, 'a').element.querySelector(
                '.dv-tab'
            )!;
            fireEvent.dragStart(tab);
            jest.runAllTimers();

            (dockview as any).showLayoutEdgeDropPreview('bottom', {
                clientX: 300,
                clientY: 595,
            });

            expect((dockview as any)._liveDropPreview.target).toEqual({
                groupId: groupOf(dockview, 'c').id,
                position: 'bottom',
                depth: 1,
            });

            fireEvent.dragEnd(tab);
            dockview.dispose();
        });
    });

    test('regions are counted without the group being dragged', () => {
        // a | [s / b]: once s leaves, b is alone beside a and no column is left.
        const dockview = createDockview({ dndBranchDrops: true });
        add(dockview, 'a');
        add(dockview, 'b', 'a', 'right');
        dockview.addPanel({
            id: 's',
            component: 'default',
            position: { referencePanel: 'b', direction: 'above' },
        });
        const b = groupOf(dockview, 'b').id;

        expect(dockview.resolveBranchDropScope(b, rightEdge(1))?.depth).toBe(1);

        const tab = groupOf(dockview, 's').element.querySelector('.dv-tab')!;
        fireEvent.dragStart(tab);
        expect(
            dockview.resolveBranchDropScope(b, rightEdge(1))
        ).toBeUndefined();
        fireEvent.dragEnd(tab);

        dockview.dispose();
    });

    test('a tab group moved with a depth lands beside the region', () => {
        const dockview = createColumnLayout();
        const d = groupOf(dockview, 'd');
        dockview.addPanel({
            id: 'd2',
            component: 'default',
            position: { referenceGroup: d },
        });
        const tabGroup = d.model.createTabGroup({ label: 'tg' });
        d.model.addPanelToTabGroup(tabGroup.id, 'd2');

        dockview.moveGroupOrPanel({
            from: { groupId: d.id, tabGroupId: tabGroup.id },
            to: { group: groupOf(dockview, 'a'), position: 'right', depth: 1 },
        });

        expect(locationOf(dockview, 'd2')).toEqual([1]);
        expect(groupOf(dockview, 'd2').api.height).toBe(600);

        dockview.dispose();
    });

    test('anchors grid overlays so they can outline a whole region', () => {
        const dockview = createColumnLayout();
        expect(dockview.rootDropTargetContainer.disabled).toBe(true);

        dockview.updateOptions({ dndBranchDrops: true });
        expect(dockview.rootDropTargetContainer.disabled).toBe(false);

        dockview.updateOptions({ dndBranchDrops: false });
        expect(dockview.rootDropTargetContainer.disabled).toBe(true);

        dockview.dispose();
    });
});
