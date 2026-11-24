import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewComponentOptions } from '../../dockview/options';
import { IContentRenderer } from '../../dockview/types';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        // noop
    }
}

type Direction = 'right' | 'below';

describe('dockview remove sizing', () => {
    const instances: DockviewComponent[] = [];

    afterEach(() => {
        instances.splice(0).forEach((dockview) => dockview.dispose());
    });

    /**
     * One row (or column) of three groups sized 700 / 200 / 100 out of 1000.
     */
    function createDockview(
        direction: Direction,
        options: Partial<DockviewComponentOptions> = {}
    ): DockviewComponent {
        const dockview = new DockviewComponent(document.createElement('div'), {
            createComponent: () => new TestPanel(),
            ...options,
        });
        instances.push(dockview);
        dockview.layout(1000, 1000);
        dockview.addPanel({ id: 'a', component: 'default' });
        dockview.addPanel({
            id: 'b',
            component: 'default',
            position: { referencePanel: 'a', direction },
        });
        dockview.addPanel({
            id: 'c',
            component: 'default',
            position: { referencePanel: 'b', direction },
        });
        resize(dockview, direction, 'a', 700);
        resize(dockview, direction, 'c', 100);
        expect(sizes(dockview, direction)).toEqual([700, 200, 100]);
        return dockview;
    }

    function resize(
        dockview: DockviewComponent,
        direction: Direction,
        id: string,
        size: number
    ) {
        dockview.api
            .getPanel(id)!
            .group.api.setSize(
                direction === 'right' ? { width: size } : { height: size }
            );
    }

    function sizes(dockview: DockviewComponent, direction: Direction) {
        return ['a', 'b', 'c']
            .map((id) => dockview.api.getPanel(id))
            .filter((panel) => panel !== undefined)
            .map((panel) => {
                const api = panel!.group.api;
                return direction === 'right' ? api.width : api.height;
            });
    }

    function remove(dockview: DockviewComponent, id: string) {
        dockview.removePanel(dockview.api.getPanel(id)!);
    }

    describe.each(['right', 'below'] as const)('%s', (direction) => {
        test('the default shares the row or column evenly', () => {
            const dockview = createDockview(direction);
            remove(dockview, 'b');
            expect(sizes(dockview, direction)).toEqual([500, 500]);
        });

        test('distribute shares the row or column evenly', () => {
            const dockview = createDockview(direction, {
                removeSizing: 'distribute',
            });
            remove(dockview, 'b');
            expect(sizes(dockview, direction)).toEqual([500, 500]);
        });

        test('adjacent gives the space to the group before', () => {
            const dockview = createDockview(direction, {
                removeSizing: 'adjacent',
            });
            remove(dockview, 'b');
            expect(sizes(dockview, direction)).toEqual([900, 100]);
        });

        test('adjacent gives the space to the group after when the first is removed', () => {
            const dockview = createDockview(direction, {
                removeSizing: 'adjacent',
            });
            remove(dockview, 'a');
            expect(sizes(dockview, direction)).toEqual([900, 100]);
        });

        test('adjacent gives the space to the group before when the last is removed', () => {
            const dockview = createDockview(direction, {
                removeSizing: 'adjacent',
            });
            remove(dockview, 'c');
            expect(sizes(dockview, direction)).toEqual([700, 300]);
        });

        test('adjacent applies when a single-panel group is dropped on another group', () => {
            const dockview = createDockview(direction, {
                removeSizing: 'adjacent',
            });
            dockview.moveGroupOrPanel({
                from: {
                    groupId: dockview.api.getPanel('b')!.group.id,
                    panelId: 'b',
                },
                to: {
                    group: dockview.api.getPanel('a')!.group,
                    position: 'center',
                },
            });
            expect(sizes(dockview, direction)).toEqual([900, 900, 100]);
        });

        test('adjacent applies when a single-panel group is dropped on an edge', () => {
            const dockview = createDockview(direction, {
                removeSizing: 'adjacent',
            });
            dockview.moveGroupOrPanel({
                from: {
                    groupId: dockview.api.getPanel('b')!.group.id,
                    panelId: 'b',
                },
                to: {
                    group: dockview.api.getPanel('c')!.group,
                    position: direction === 'right' ? 'bottom' : 'right',
                },
            });
            // b now shares c's slot, split along the other axis
            expect(sizes(dockview, direction)).toEqual([900, 100, 100]);
        });

        test('adjacent respects the maximum size of the neighbour', () => {
            const dockview = createDockview(direction, {
                removeSizing: 'adjacent',
            });
            dockview.api
                .getPanel('a')!
                .group.api.setConstraints(
                    direction === 'right'
                        ? { maximumWidth: 750 }
                        : { maximumHeight: 750 }
                );
            remove(dockview, 'b');
            expect(sizes(dockview, direction)).toEqual([750, 250]);
        });

        test('adjacent skips a hidden neighbour', () => {
            const dockview = createDockview(direction, {
                removeSizing: 'adjacent',
            });
            dockview.api.getPanel('a')!.group.api.setVisible(false);
            const [, b, c] = sizes(dockview, direction);
            expect(b + c).toBe(1000);
            remove(dockview, 'b');
            expect(sizes(dockview, direction)).toEqual([0, 1000]);
        });
    });

    test.each([
        'adjacent',
        'distribute',
        undefined,
    ] as const)('updateOptions applies %s to the next removal', (removeSizing) => {
        const dockview = createDockview('right', {
            removeSizing:
                removeSizing === 'adjacent' ? 'distribute' : 'adjacent',
        });
        dockview.updateOptions({ removeSizing });
        remove(dockview, 'b');
        expect(sizes(dockview, 'right')).toEqual(
            removeSizing === 'adjacent' ? [900, 100] : [500, 500]
        );
    });
});
