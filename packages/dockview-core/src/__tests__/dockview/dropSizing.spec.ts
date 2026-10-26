import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewComponentOptions } from '../../dockview/options';
import { IContentRenderer } from '../../dockview/types';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        // noop
    }
}

describe('dockview drop sizing', () => {
    const instances: DockviewComponent[] = [];

    afterEach(() => {
        instances.splice(0).forEach((dockview) => dockview.dispose());
    });

    function createDockview(
        direction: 'right' | 'below',
        options: Partial<DockviewComponentOptions> = {}
    ): DockviewComponent {
        const dockview = new DockviewComponent(document.createElement('div'), {
            createComponent: () => new TestPanel(),
            ...options,
        });
        instances.push(dockview);
        dockview.layout(900, 900);
        dockview.addPanel({ id: 'source', component: 'default' });
        dockview.addPanel({
            id: 'moving',
            component: 'default',
            position: { referencePanel: 'source' },
        });
        dockview.addPanel({
            id: 'neighbour',
            component: 'default',
            position: { referencePanel: 'source', direction },
        });
        dockview.addPanel({
            id: 'target',
            component: 'default',
            position: { referencePanel: 'neighbour', direction },
        });
        return dockview;
    }

    function drop(dockview: DockviewComponent, direction: 'right' | 'below') {
        dockview.moveGroupOrPanel({
            from: {
                groupId: dockview.api.getPanel('moving')!.group.id,
                panelId: 'moving',
            },
            to: {
                group: dockview.api.getPanel('target')!.group,
                position: direction === 'right' ? 'right' : 'bottom',
            },
        });
    }

    function sizes(dockview: DockviewComponent, direction: 'right' | 'below') {
        return ['source', 'neighbour', 'target', 'moving'].map((id) => {
            const api = dockview.api.getPanel(id)!.group.api;
            return direction === 'right' ? api.width : api.height;
        });
    }

    test.each([
        'right',
        'below',
    ] as const)('the default %s drop only halves the target group', (direction) => {
        const dockview = createDockview(direction);
        drop(dockview, direction);
        expect(sizes(dockview, direction)).toEqual([300, 300, 150, 150]);
    });

    test.each([
        'right',
        'below',
    ] as const)('a distribute %s drop shares the row or column evenly', (direction) => {
        const dockview = createDockview(direction, {
            dropSizing: 'distribute',
        });
        drop(dockview, direction);
        expect(sizes(dockview, direction)).toEqual([225, 225, 225, 225]);
    });

    test.each([
        'split',
        'distribute',
        undefined,
    ] as const)('updateOptions applies %s to the next drop', (dropSizing) => {
        const dockview = createDockview('right', {
            dropSizing: dropSizing === 'distribute' ? 'split' : 'distribute',
        });
        dockview.updateOptions({ dropSizing });
        drop(dockview, 'right');
        expect(sizes(dockview, 'right')).toEqual(
            dropSizing === 'distribute'
                ? [225, 225, 225, 225]
                : [300, 300, 150, 150]
        );
    });

    describe.each([
        'right',
        'below',
    ] as const)('%s group drops', (direction) => {
        test.each([
            'split',
            'distribute',
        ] as const)('%s sizing when moving a group from another branch', (dropSizing) => {
            const dockview = createDockview(direction, { dropSizing });
            dockview.addPanel({
                id: 'remaining',
                component: 'default',
                position: {
                    referencePanel: 'source',
                    direction: direction === 'right' ? 'below' : 'right',
                },
            });
            dockview.moveGroupOrPanel({
                from: { groupId: dockview.api.getPanel('source')!.group.id },
                to: {
                    group: dockview.api.getPanel('target')!.group,
                    position: direction === 'right' ? 'right' : 'bottom',
                },
            });
            const actual = ['remaining', 'neighbour', 'target', 'source'].map(
                (id) => {
                    const api = dockview.api.getPanel(id)!.group.api;
                    return direction === 'right' ? api.width : api.height;
                }
            );
            expect(actual).toEqual(
                dropSizing === 'distribute'
                    ? [225, 225, 225, 225]
                    : [300, 300, 150, 150]
            );
        });

        describe.each(['header', 'tab'] as const)('dragging a %s', (drag) => {
            test.each([
                'split',
                'distribute',
            ] as const)('%s sizing when reordering unequal sibling groups', (dropSizing) => {
                const dockview = createDockview(direction, { dropSizing });
                const target = dockview.api.getPanel('target')!;
                target.api.setSize(
                    direction === 'right' ? { width: 450 } : { height: 450 }
                );
                expect(sizes(dockview, direction)).toEqual([
                    300, 150, 450, 300,
                ]);
                dockview.moveGroupOrPanel({
                    from: {
                        groupId: target.group.id,
                        panelId: drag === 'tab' ? target.id : undefined,
                    },
                    to: {
                        group: dockview.api.getPanel('source')!.group,
                        position: direction === 'right' ? 'right' : 'bottom',
                    },
                });
                expect(sizes(dockview, direction)).toEqual(
                    dropSizing === 'distribute'
                        ? [300, 300, 300, 300]
                        : [300, 150, 450, 300]
                );
            });
        });
    });
});
