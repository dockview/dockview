import { fireEvent } from '@testing-library/dom';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { IContentRenderer } from '../../dockview/types';
import { getGridLocation } from '../../gridview/gridview';
import { PointerDragController } from '../../dnd/pointer/pointerDragController';

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

describe('dndLivePreview', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    /** a / b / c stacked, 200px each, in a 1200x600 layout. */
    function createColumn(options: Record<string, boolean> = {}) {
        const dockview = new DockviewComponent(document.createElement('div'), {
            createComponent: () => new TestPanel(),
            dndCollapseSource: true,
            dndLivePreview: true,
            ...options,
        });
        dockview.layout(1200, 600);
        const a = dockview.addPanel({ id: 'a', component: 'default' }).group;
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
        return { dockview, a, b, c };
    }

    function tabOf(group: DockviewGroupPanel): Element {
        return group.element.querySelector('.dv-tab')!;
    }

    function placeholder(dockview: DockviewComponent): Element | null {
        return dockview.element.querySelector('.dv-drop-placeholder');
    }

    /** Start dragging b's only tab and let it collapse. */
    function dragB(b: DockviewGroupPanel): Element {
        const tab = tabOf(b);
        fireEvent.dragStart(tab);
        jest.runAllTimers();
        return tab;
    }

    test('opens room for the drop instead of drawing the overlay', () => {
        const { dockview, a, b, c } = createColumn();
        const tab = dragB(b);
        expect([a.api.height, c.api.height]).toEqual([300, 300]);

        expect(
            dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 })
        ).toBe(true);

        expect(placeholder(dockview)).not.toBeNull();
        expect([a.api.width, a.api.height]).toEqual([600, 300]);

        fireEvent.dragEnd(tab);
        dockview.dispose();
    });

    test('releasing over the room drops the group into it', () => {
        const { dockview, a, b } = createColumn();
        const tab = dragB(b);
        dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });

        fireEvent.drop(placeholder(dockview)!);
        fireEvent.dragEnd(tab);

        expect(placeholder(dockview)).toBeNull();
        expect(getGridLocation(b.element)).toEqual([
            ...getGridLocation(a.element).slice(0, -1),
            1,
        ]);
        expect([b.api.width, b.api.height]).toEqual([600, 300]);
        expect([a.api.width, a.api.height]).toEqual([600, 300]);
        expect(b.api.isVisible).toBe(true);

        dockview.dispose();
    });

    test('a release is committed once, not again by the target below', () => {
        const { dockview, a, b } = createColumn();
        const tab = dragB(b);
        dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });
        const dropTarget = (a.model as any).contentContainer.dropTarget;
        dropTarget._state = 'right';

        const moves: string[] = [];
        dockview.onDidMovePanel((e) => moves.push(e.panel.id));
        fireEvent.drop(a.element.querySelector('.dv-content-container')!);
        fireEvent.dragEnd(tab);

        expect(moves).toEqual(['b']);
        expect([b.api.width, b.api.height]).toEqual([600, 300]);

        dockview.dispose();
    });

    test('a drop on the previewed target takes the room it opened', () => {
        const { dockview, a, b } = createColumn();
        const tab = dragB(b);
        dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });

        dockview.moveGroupOrPanel({
            from: { groupId: b.id, panelId: 'b' },
            to: { group: a, position: 'right' },
        });
        fireEvent.dragEnd(tab);

        expect(placeholder(dockview)).toBeNull();
        expect([b.api.width, b.api.height]).toEqual([600, 300]);

        dockview.dispose();
    });

    test('a drop elsewhere closes the room first', () => {
        const { dockview, a, b, c } = createColumn();
        const tab = dragB(b);
        dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });

        dockview.moveGroupOrPanel({
            from: { groupId: b.id, panelId: 'b' },
            to: { group: c, position: 'bottom' },
        });
        fireEvent.dragEnd(tab);

        expect(placeholder(dockview)).toBeNull();
        expect(a.api.width).toBe(1200);
        expect([c.api.height, b.api.height]).toEqual([150, 150]);

        dockview.dispose();
    });

    test('a drop next to the room closes it before landing', () => {
        const { dockview, a, b, c } = createColumn();
        const tab = dragB(b);
        // Room under c, in the same column as the drop below.
        dockview.showLiveDropPreview(c.id, { position: 'bottom', depth: 0 });

        dockview.moveGroupOrPanel({
            from: { groupId: b.id, panelId: 'b' },
            to: { group: c, position: 'top' },
        });
        fireEvent.dragEnd(tab);

        expect(placeholder(dockview)).toBeNull();
        expect([a.api.height, b.api.height, c.api.height]).toEqual([
            300, 150, 150,
        ]);

        dockview.dispose();
    });

    test('previewing another drop moves the room, restoring the sizes', () => {
        const { dockview, a, b, c } = createColumn();
        const tab = dragB(b);

        dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });
        dockview.showLiveDropPreview(c.id, { position: 'bottom', depth: 0 });

        expect(
            dockview.element.querySelectorAll('.dv-drop-placeholder')
        ).toHaveLength(1);
        expect(a.api.width).toBe(1200);
        expect([a.api.height, c.api.height]).toEqual([200, 200]);

        fireEvent.dragEnd(tab);
        dockview.dispose();
    });

    test('a cancelled drag puts the layout back as it was', () => {
        const { dockview, a, b, c } = createColumn();
        const tab = dragB(b);
        dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });

        fireEvent.dragEnd(tab);

        expect(placeholder(dockview)).toBeNull();
        expect([a, b, c].map((g) => [g.api.width, g.api.height])).toEqual([
            [1200, 200],
            [1200, 200],
            [1200, 200],
        ]);

        dockview.dispose();
    });

    test('a drop first ends the transition in flight', () => {
        const { dockview, a, b } = createColumn();
        const tab = dragB(b);
        dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });
        const finish = jest.spyOn(
            (dockview as any)._layoutTransition,
            'finish'
        );

        dockview.moveGroupOrPanel({
            from: { groupId: b.id, panelId: 'b' },
            to: { group: a, position: 'right' },
        });

        expect(finish).toHaveBeenCalled();

        fireEvent.dragEnd(tab);
        dockview.dispose();
    });

    test('a group dropped into a row takes an equal share of it', () => {
        // a | b | c, 400px each: dragging c leaves a and b at 600px each.
        const dockview = new DockviewComponent(document.createElement('div'), {
            createComponent: () => new TestPanel(),
            dndCollapseSource: true,
            dndLivePreview: true,
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
        const tab = tabOf(c);
        fireEvent.dragStart(tab);
        jest.runAllTimers();
        expect([a.api.width, b.api.width]).toEqual([600, 600]);

        dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });
        expect([a.api.width, b.api.width]).toEqual([400, 400]);

        fireEvent.drop(placeholder(dockview)!);
        fireEvent.dragEnd(tab);

        expect([a, c, b].map((g) => getGridLocation(g.element))).toEqual([
            [0],
            [1],
            [2],
        ]);
        expect([a.api.width, c.api.width, b.api.width]).toEqual([
            400, 400, 400,
        ]);

        dockview.dispose();
    });

    describe('with the source out of the grid', () => {
        /** a | [b / c], each column 600px wide. */
        function createSplit() {
            const dockview = new DockviewComponent(
                document.createElement('div'),
                {
                    createComponent: () => new TestPanel(),
                    dndCollapseSource: true,
                    dndLivePreview: true,
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
            const c = dockview.addPanel({
                id: 'c',
                component: 'default',
                position: { referencePanel: 'b', direction: 'below' },
            }).group;
            return { dockview, a, b, c };
        }

        test('shares are counted among the groups left once it is gone', () => {
            const { dockview, a, b, c } = createSplit();
            const tab = dragB(b);
            // b gone, its column is c alone: a | c, side by side.
            expect([a.api.width, c.api.width, c.api.height]).toEqual([
                600, 600, 600,
            ]);

            dockview.showLiveDropPreview(c.id, {
                position: 'right',
                depth: 0,
            });
            fireEvent.drop(placeholder(dockview)!);
            fireEvent.dragEnd(tab);

            expect([a, c, b].map((g) => getGridLocation(g.element))).toEqual([
                [0],
                [1],
                [2],
            ]);
            expect([a.api.width, c.api.width, b.api.width]).toEqual([
                400, 400, 400,
            ]);

            dockview.dispose();
        });

        test('a cancelled drag rebuilds the grid as it was', () => {
            const { dockview, a, b, c } = createSplit();
            const before = JSON.stringify(dockview.toJSON().grid);
            const tab = dragB(b);
            dockview.showLiveDropPreview(a.id, { position: 'left', depth: 0 });

            fireEvent.dragEnd(tab);

            expect(JSON.stringify(dockview.toJSON().grid)).toBe(before);
            expect(getGridLocation(b.element)).toEqual([1, 0]);
            expect(b.api.isVisible).toBe(true);
            expect([a.api.width, b.api.height, c.api.height]).toEqual([
                600, 300, 300,
            ]);

            dockview.dispose();
        });

        test('a grid changed meanwhile still gets the source back', () => {
            const { dockview, b } = createSplit();
            const tab = dragB(b);
            dockview.addPanel({
                id: 'd',
                component: 'default',
                position: { direction: 'below' },
            });
            expect(dockview.groups).toHaveLength(4);

            fireEvent.dragEnd(tab);

            const grid = (dockview as any).gridview.element as HTMLElement;
            expect(grid.contains(b.element)).toBe(true);
            expect(
                grid.contains(dockview.getGroupPanel('d')!.group.element)
            ).toBe(true);
            expect(b.api.isVisible).toBe(true);

            dockview.dispose();
        });
    });

    test('layout changes during the drag wait for it to end', async () => {
        jest.useRealTimers();
        const { dockview, b } = createColumn();
        let changes = 0;
        dockview.onDidLayoutChange(() => changes++);

        const tab = tabOf(b);
        fireEvent.dragStart(tab);
        dockview.addPanel({
            id: 'd',
            component: 'default',
            position: { direction: 'right' },
        });
        await Promise.resolve();
        expect(changes).toBe(0);

        fireEvent.dragEnd(tab);
        await Promise.resolve();
        expect(changes).toBe(1);

        dockview.dispose();
    });

    describe('review fixes', () => {
        function pointerEnd(dropped: boolean) {
            (PointerDragController.getInstance() as any)._onDragEnd.fire({
                clientX: 0,
                clientY: 0,
                pointerEvent: new Event('pointerup'),
                dropped,
            });
        }

        test('a cancelled pointer drag does not drop into the room', () => {
            const { dockview, a, b } = createColumn();
            const tab = dragB(b);
            dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });
            const moves: string[] = [];
            dockview.onDidMovePanel((e) => moves.push(e.panel.id));

            pointerEnd(false);

            expect(moves).toEqual([]);
            expect(placeholder(dockview)).toBeNull();
            fireEvent.dragEnd(tab);
            dockview.dispose();
        });

        test('toJSON during the drag reports the grid it started with', () => {
            const { dockview, a, b } = createColumn();
            const before = JSON.stringify(dockview.toJSON());
            const tab = dragB(b);
            dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });

            expect(JSON.stringify(dockview.toJSON())).toBe(before);

            fireEvent.dragEnd(tab);
            dockview.dispose();
        });

        test('closing the dragged panel mid-drag does not throw', () => {
            const { dockview, a, b } = createColumn();
            const tab = dragB(b);
            dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });

            expect(() =>
                dockview.removePanel(dockview.getGroupPanel('b')!)
            ).not.toThrow();
            fireEvent.dragEnd(tab);

            expect(dockview.groups).toHaveLength(2);
            dockview.dispose();
        });

        test('layout history records the grid from before the drag', () => {
            const { dockview, a, b } = createColumn();
            const before = JSON.stringify(dockview.toJSON().grid);
            const recorded: string[] = [];
            dockview.onWillMutateLayout(() =>
                recorded.push(JSON.stringify(dockview.toJSON().grid))
            );
            const tab = dragB(b);
            dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });

            fireEvent.drop(placeholder(dockview)!);
            fireEvent.dragEnd(tab);

            expect(recorded[0]).toBe(before);
            dockview.dispose();
        });

        test('a room across the whole layout leaves no trace once closed', () => {
            // a | b side by side, c dragged from under b.
            const dockview = new DockviewComponent(
                document.createElement('div'),
                {
                    createComponent: () => new TestPanel(),
                    dndCollapseSource: true,
                    dndLivePreview: true,
                    dndBranchDrops: true,
                }
            );
            dockview.layout(1200, 600);
            const a = dockview.addPanel({
                id: 'a',
                component: 'default',
            }).group;
            dockview.addPanel({
                id: 'b',
                component: 'default',
                position: { referencePanel: 'a', direction: 'right' },
            });
            const c = dockview.addPanel({
                id: 'c',
                component: 'default',
                position: { referencePanel: 'b', direction: 'below' },
            }).group;
            const tab = tabOf(c);
            fireEvent.dragStart(tab);
            jest.runAllTimers();
            const before = JSON.stringify(
                (dockview as any).gridview.serialize()
            );
            const targets = (dockview as any).gridview.getBranchDropTargets(
                a,
                'bottom'
            );
            expect(targets.at(-1).location).toEqual([]);

            dockview.showLiveDropPreview(a.id, {
                position: 'bottom',
                depth: targets.length,
            });
            expect(placeholder(dockview)).not.toBeNull();
            (dockview as any).closeLiveDropPreview();
            jest.runAllTimers();

            expect(JSON.stringify((dockview as any).gridview.serialize())).toBe(
                before
            );
            fireEvent.dragEnd(tab);
            dockview.dispose();
        });

        test('moving onto a floating group closes the room', () => {
            const { dockview, a, b, c } = createColumn();
            const tab = dragB(b);
            dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });
            dockview.addFloatingGroup(c);

            expect(
                dockview.showLiveDropPreview(c.id, {
                    position: 'right',
                    depth: 0,
                })
            ).toBe(false);
            expect(placeholder(dockview)).toBeNull();

            fireEvent.dragEnd(tab);
            dockview.dispose();
        });

        test('Safari: a dragleave with no relatedTarget keeps the room while inside', () => {
            const { dockview, a, b } = createColumn();
            const tab = dragB(b);
            dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 });
            const shell = (dockview as any).rootElement as HTMLElement;
            jest.spyOn(shell, 'getBoundingClientRect').mockReturnValue({
                left: 0,
                top: 0,
                right: 1200,
                bottom: 600,
                width: 1200,
                height: 600,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            });

            const dragLeave = (target: Element, clientX: number) => {
                const event = new Event('dragleave', { bubbles: true });
                Object.defineProperty(event, 'clientX', { value: clientX });
                Object.defineProperty(event, 'clientY', { value: 300 });
                Object.defineProperty(event, 'relatedTarget', { value: null });
                fireEvent(target, event);
            };

            dragLeave(a.element, 300);
            expect(placeholder(dockview)).not.toBeNull();

            dragLeave(shell, 1500);
            jest.runAllTimers();
            expect(placeholder(dockview)).toBeNull();

            fireEvent.dragEnd(tab);
            dockview.dispose();
        });

        test('a drag from a popout window starts no drag session', () => {
            const { dockview, b } = createColumn();
            jest.spyOn(b.api, 'location', 'get').mockReturnValue({
                type: 'popout',
            } as any);

            fireEvent.dragStart(tabOf(b));

            expect((dockview as any)._dragging).toBe(false);
            expect((dockview as any)._layoutChangeHold).toBeUndefined();
            dockview.dispose();
        });
    });

    test('is off by default', () => {
        const { dockview, a, b } = createColumn({ dndLivePreview: false });
        const tab = dragB(b);

        expect(
            dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 })
        ).toBe(false);
        expect(placeholder(dockview)).toBeNull();

        fireEvent.dragEnd(tab);
        dockview.dispose();
    });

    test('only previews while one of its groups is being dragged', () => {
        const { dockview, a } = createColumn();

        expect(
            dockview.showLiveDropPreview(a.id, { position: 'right', depth: 0 })
        ).toBe(false);

        dockview.dispose();
    });

    test('never previews a stacking drop', () => {
        const { dockview, a, b } = createColumn();
        const tab = dragB(b);

        expect(
            dockview.showLiveDropPreview(a.id, { position: 'center', depth: 0 })
        ).toBe(false);

        fireEvent.dragEnd(tab);
        dockview.dispose();
    });
});
