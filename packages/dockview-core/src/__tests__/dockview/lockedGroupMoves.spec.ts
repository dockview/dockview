import { fireEvent } from '@testing-library/dom';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { DockviewGroupPanelLocked } from '../../dockview/dockviewGroupPanelModel';
import { IContentRenderer } from '../../dockview/types';
import {
    getPanelData,
    LocalSelectionTransfer,
    PanelTransfer,
} from '../../dnd/dataTransfer';
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

/**
 * A locked group's tabs can't be moved by the user at all: no drag of a tab,
 * chip or the group header, and no shift-drag to float. API calls still work.
 */
describe('locked group: no user-initiated tab moves', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;

    function create(dndStrategy: 'html5' | 'pointer'): DockviewGroupPanel {
        container = document.createElement('div');
        document.body.appendChild(container);
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            dndStrategy,
        });
        dockview.layout(1000, 500);
        dockview.addPanel({ id: 'a1', component: 'default' });
        dockview.addPanel({ id: 'a2', component: 'default' });
        dockview.addPanel({
            id: 'b1',
            component: 'default',
            position: { referencePanel: 'a1', direction: 'right' },
        });
        return dockview.getGroupPanel('a1')!.group;
    }

    afterEach(() => {
        PointerDragController.getInstance().cancel();
        LocalSelectionTransfer.getInstance<PanelTransfer>().clearData(
            PanelTransfer.prototype
        );
        dockview.dispose();
        container.remove();
    });

    const tab = (group: DockviewGroupPanel) =>
        group.element.querySelector('.dv-tab') as HTMLElement;
    const header = (group: DockviewGroupPanel) =>
        group.element.querySelector('.dv-void-container') as HTMLElement;

    async function chip(group: DockviewGroupPanel): Promise<HTMLElement> {
        const tg = dockview.api.createTabGroup({ groupId: group.id });
        dockview.api.addPanelToTabGroup({
            groupId: group.id,
            tabGroupId: tg.id,
            panelId: 'a1',
        });
        await Promise.resolve();
        return group.element.querySelector('.dv-tab-group-chip') as HTMLElement;
    }

    function pointerDrag(el: HTMLElement): void {
        const init = (clientX: number) => ({
            pointerId: 1,
            pointerType: 'mouse',
            button: 0,
            clientX,
            clientY: 10,
            bubbles: true,
            cancelable: true,
        });
        fireEvent.pointerDown(el, init(10));
        fireEvent.pointerMove(window, init(40));
        fireEvent.pointerMove(window, init(80));
    }

    const sources: {
        name: string;
        element: (group: DockviewGroupPanel) => Promise<HTMLElement>;
    }[] = [
        { name: 'a tab', element: async (g) => tab(g) },
        { name: 'a chip', element: chip },
        { name: 'the group header', element: async (g) => header(g) },
    ];

    describe.each(sources)('dragging $name', (source) => {
        test.each([
            false,
            true,
            'no-drop-target',
        ] as const)('html5, locked: %p', async (locked: DockviewGroupPanelLocked) => {
            const group = create('html5');
            const el = await source.element(group);
            group.locked = locked;

            const started = fireEvent.dragStart(el);

            // `fireEvent` returns false when the event was cancelled.
            expect(started).toBe(!locked);
            expect(getPanelData() !== undefined).toBe(!locked);
        });

        test.each([
            false,
            true,
            'no-drop-target',
        ] as const)('pointer, locked: %p', async (locked: DockviewGroupPanelLocked) => {
            const group = create('pointer');
            const el = await source.element(group);
            group.locked = locked;

            pointerDrag(el);

            expect(getPanelData() !== undefined).toBe(!locked);
        });
    });

    describe.each([
        { name: 'a tab', element: tab },
        { name: 'the group header', element: header },
    ])('shift-dragging $name to float', (source) => {
        test.each([
            false,
            true,
            'no-drop-target',
        ] as const)('locked: %p', (locked: DockviewGroupPanelLocked) => {
            const group = create('pointer');
            group.locked = locked;

            fireEvent.pointerDown(source.element(group), {
                button: 0,
                shiftKey: true,
                bubbles: true,
                cancelable: true,
            });

            expect(dockview.floatingGroups.length).toBe(locked ? 0 : 1);
        });
    });

    test('the API can still move a locked group panel', () => {
        const group = create('pointer');
        group.locked = true;

        dockview.getGroupPanel('a2')!.api.moveTo({ index: 0 });

        expect(group.panels.map((p) => p.id)).toEqual(['a2', 'a1']);
    });
});
