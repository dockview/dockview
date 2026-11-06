import { fireEvent } from '@testing-library/dom';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { AllModules } from '../../dockview/allModules';
import { IContentRenderer } from '../../dockview/types';
import { LocalSelectionTransfer, PanelTransfer } from '../../dnd/dataTransfer';
import { createOffsetDragOverEvent } from '../__test_utils__/utils';

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

/** `createEdgeDropTarget` routes like the root edge band: a `kind: 'edge'`
 *  overlay event, committed through `dockToLayoutEdge`. */
describe('createEdgeDropTarget', () => {
    const transfer = LocalSelectionTransfer.getInstance<PanelTransfer>();
    let dockview: DockviewComponent;
    let strip: HTMLElement;

    beforeEach(() => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            modules: AllModules,
        } as never);
        dockview.layout(1000, 800);
        dockview.addPanel({ id: 'a', component: 'default' });
        dockview.addPanel({ id: 'b', component: 'default' });

        strip = document.createElement('div');
        jest.spyOn(strip, 'offsetWidth', 'get').mockReturnValue(1000);
        jest.spyOn(strip, 'offsetHeight', 'get').mockReturnValue(8);
        document.body.appendChild(strip);
    });

    afterEach(() => {
        transfer.clearData(PanelTransfer.prototype);
        dockview.dispose();
        document.body.innerHTML = '';
        jest.restoreAllMocks();
    });

    function dragOverAndDrop(): void {
        fireEvent.dragEnter(strip);
        fireEvent(
            strip,
            createOffsetDragOverEvent({ clientX: 500, clientY: 4 })
        );
        fireEvent.drop(strip);
    }

    test('a drag of this dock over it raises an edge overlay and drops at the layout edge', () => {
        const dock = jest.spyOn(dockview, 'dockToLayoutEdge');
        const overlays: { kind: string; position: string }[] = [];
        dockview.onWillShowOverlay((e) =>
            overlays.push({ kind: e.kind, position: e.position })
        );
        dockview.createEdgeDropTarget(strip, 'top');

        transfer.setData(
            [new PanelTransfer(dockview.id, dockview.groups[0].id, 'a')],
            PanelTransfer.prototype
        );
        dragOverAndDrop();

        expect(overlays).toEqual([{ kind: 'edge', position: 'top' }]);
        expect(dock).toHaveBeenCalledTimes(1);
        expect(dock.mock.calls[0][1]).toBe('top');
        // The built-in overlay is not rendered: the strip owns its highlight.
        expect(strip.querySelector('.dv-drop-target-dropzone')).toBeNull();
    });

    test("another dock's drag is ignored", () => {
        const dock = jest.spyOn(dockview, 'dockToLayoutEdge');
        dockview.createEdgeDropTarget(strip, 'left');

        transfer.setData(
            [new PanelTransfer('another-dock', 'g', 'p')],
            PanelTransfer.prototype
        );
        dragOverAndDrop();

        expect(dock).not.toHaveBeenCalled();
    });

    test('an external drag (no panel data) is ignored', () => {
        const dock = jest.spyOn(dockview, 'dockToLayoutEdge');
        dockview.createEdgeDropTarget(strip, 'left');
        dragOverAndDrop();
        expect(dock).not.toHaveBeenCalled();
    });

    test('dispose detaches it', () => {
        const dock = jest.spyOn(dockview, 'dockToLayoutEdge');
        dockview.createEdgeDropTarget(strip, 'bottom').dispose();

        transfer.setData(
            [new PanelTransfer(dockview.id, dockview.groups[0].id, 'a')],
            PanelTransfer.prototype
        );
        dragOverAndDrop();

        expect(dock).not.toHaveBeenCalled();
    });
});
