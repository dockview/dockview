import { fireEvent } from '@testing-library/dom';
import {
    DockviewComponent,
    IContentRenderer,
    TabDragEvent,
    GroupDragEvent,
} from '../../index';
import { getPanelData } from '../../dnd/dataTransfer';
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
 * onWillDragPanel / onWillDragGroup are dispatched by AdvancedDnDModule when a
 * tab or the void container starts a drag.
 */
describe('advanced dnd: onWillDrag hooks', () => {
    test('that dragging a tab triggers onWillDragPanel', () => {
        const container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });

        dockview.layout(1000, 500);
        dockview.addPanel({ id: 'panel_1', component: 'default' });

        const tabDragEvents: TabDragEvent[] = [];
        const groupDragEvents: GroupDragEvent[] = [];

        dockview.onWillDragPanel((event) => {
            tabDragEvents.push(event);
        });
        dockview.onWillDragGroup((event) => {
            groupDragEvents.push(event);
        });

        const el = dockview.element.querySelector('.dv-tab')!;
        expect(el).toBeTruthy();

        fireEvent.dragStart(el);

        expect(tabDragEvents).toHaveLength(1);
        expect(groupDragEvents).toHaveLength(0);

        dockview.dispose();
    });

    test('that dragging a group triggers onWillDragGroup', () => {
        const container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });

        dockview.layout(1000, 500);
        dockview.addPanel({ id: 'panel_1', component: 'default' });

        const tabDragEvents: TabDragEvent[] = [];
        const groupDragEvents: GroupDragEvent[] = [];

        dockview.onWillDragPanel((event) => {
            tabDragEvents.push(event);
        });
        dockview.onWillDragGroup((event) => {
            groupDragEvents.push(event);
        });

        const el = dockview.element.querySelector('.dv-void-container')!;
        expect(el).toBeTruthy();

        fireEvent.dragStart(el);

        expect(tabDragEvents).toHaveLength(0);
        expect(groupDragEvents).toHaveLength(1);

        dockview.dispose();
    });
});

/**
 * Cancelling the drag from `onWillDragPanel` / `onWillDragGroup` with
 * `event.nativeEvent.preventDefault()` (the documented veto) must leave no
 * drag state behind. The browser fires no `dragend` after a cancelled
 * `dragstart`, so anything armed before the veto would never be torn down.
 */
describe('advanced dnd: onWillDrag veto', () => {
    let container: HTMLElement;
    let iframe: HTMLIFrameElement;
    let dockview: DockviewComponent;

    function create(options: { dndStrategy?: 'pointer' | 'html5' } = {}) {
        container = document.createElement('div');
        iframe = document.createElement('iframe');
        document.body.appendChild(container);
        document.body.appendChild(iframe);
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            ...options,
        });
        dockview.layout(1000, 500);
        dockview.addPanel({ id: 'panel_1', component: 'default' });
    }

    afterEach(() => {
        PointerDragController.getInstance().cancel();
        dockview.dispose();
        container.remove();
        iframe.remove();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('html5: a vetoed onWillDragPanel publishes no PanelTransfer and releases the iframe shield', () => {
        jest.useFakeTimers();
        create();

        const veto = dockview.onWillDragPanel((event) => {
            event.nativeEvent.preventDefault();
        });

        const tab = dockview.element.querySelector('.dv-tab') as HTMLElement;
        fireEvent.dragStart(tab);

        expect(getPanelData()).toBeUndefined();
        expect(iframe.style.pointerEvents).toBe('');

        // The next, allowed drag of the same tab publishes its payload and
        // keeps it live until the drag ends (a stale disposer from the vetoed
        // attempt must not wipe it).
        veto.dispose();
        fireEvent.dragStart(tab);

        expect(getPanelData()?.panelId).toBe('panel_1');
        expect(iframe.style.pointerEvents).toBe('none');

        fireEvent.dragEnd(tab);
        jest.runAllTimers();
        expect(getPanelData()).toBeUndefined();
        expect(iframe.style.pointerEvents).toBe('');
    });

    test('html5: a vetoed onWillDragGroup publishes no PanelTransfer and releases the iframe shield', () => {
        jest.useFakeTimers();
        create();

        const veto = dockview.onWillDragGroup((event) => {
            event.nativeEvent.preventDefault();
        });

        const handle = dockview.element.querySelector(
            '.dv-void-container'
        ) as HTMLElement;
        fireEvent.dragStart(handle);

        expect(getPanelData()).toBeUndefined();
        expect(iframe.style.pointerEvents).toBe('');

        veto.dispose();
        fireEvent.dragStart(handle);

        expect(getPanelData()?.groupId).toBe(dockview.groups[0].id);
        expect(getPanelData()?.panelId).toBeNull();
        expect(iframe.style.pointerEvents).toBe('none');

        fireEvent.dragEnd(handle);
        jest.runAllTimers();
        expect(getPanelData()).toBeUndefined();
        expect(iframe.style.pointerEvents).toBe('');
    });

    function mouse(
        overrides: Partial<PointerEventInit> = {}
    ): PointerEventInit {
        return {
            pointerId: 1,
            pointerType: 'mouse',
            clientX: 0,
            clientY: 0,
            bubbles: true,
            cancelable: true,
            ...overrides,
        };
    }

    test('pointer: onWillDragPanel fires and an un-vetoed gesture starts a drag session (fixture control)', () => {
        jest.useFakeTimers();
        create({ dndStrategy: 'pointer' });

        const events: TabDragEvent[] = [];
        dockview.onWillDragPanel((event) => {
            events.push(event);
        });

        const tab = dockview.element.querySelector('.dv-tab') as HTMLElement;
        fireEvent.pointerDown(tab, mouse());
        fireEvent.pointerMove(window, mouse({ clientX: 20 }));

        expect(events).toHaveLength(1);
        expect(PointerDragController.getInstance().active).toBeDefined();
        expect(getPanelData()?.panelId).toBe('panel_1');

        fireEvent.pointerUp(window, mouse({ clientX: 20 }));
        // The controller defers the transfer disposal past the drop handlers.
        jest.runAllTimers();
        expect(getPanelData()).toBeUndefined();
    });

    test('pointer: a vetoed onWillDragPanel starts no drag session', () => {
        create({ dndStrategy: 'pointer' });

        const controller = PointerDragController.getInstance();
        const beginDrag = jest.spyOn(controller, 'beginDrag');
        const dragEnds: unknown[] = [];
        const endSub = controller.onDragEnd((e) => dragEnds.push(e));

        const events: TabDragEvent[] = [];
        dockview.onWillDragPanel((event) => {
            events.push(event);
            event.nativeEvent.preventDefault();
        });

        const tab = dockview.element.querySelector('.dv-tab') as HTMLElement;
        fireEvent.pointerDown(tab, mouse());
        fireEvent.pointerMove(window, mouse({ clientX: 20 }));

        expect(events).toHaveLength(1);
        expect(beginDrag).not.toHaveBeenCalled();
        expect(controller.active).toBeUndefined();
        expect(getPanelData()).toBeUndefined();
        expect(iframe.style.pointerEvents).toBe('');

        // The gesture is dismissed: dragging on and releasing neither starts
        // a session later nor produces a drag-end for a drag that never began.
        fireEvent.pointerMove(window, mouse({ clientX: 60 }));
        fireEvent.pointerUp(window, mouse({ clientX: 60 }));
        expect(beginDrag).not.toHaveBeenCalled();
        expect(controller.active).toBeUndefined();
        expect(getPanelData()).toBeUndefined();
        expect(dragEnds).toHaveLength(0);

        endSub.dispose();
    });

    test('pointer: a vetoed onWillDragGroup starts no drag session', () => {
        create({ dndStrategy: 'pointer' });

        const controller = PointerDragController.getInstance();
        const beginDrag = jest.spyOn(controller, 'beginDrag');

        const events: GroupDragEvent[] = [];
        dockview.onWillDragGroup((event) => {
            events.push(event);
            event.nativeEvent.preventDefault();
        });

        const handle = dockview.element.querySelector(
            '.dv-void-container'
        ) as HTMLElement;
        fireEvent.pointerDown(handle, mouse());
        fireEvent.pointerMove(window, mouse({ clientX: 20 }));

        expect(events).toHaveLength(1);
        expect(beginDrag).not.toHaveBeenCalled();
        expect(controller.active).toBeUndefined();
        expect(getPanelData()).toBeUndefined();

        fireEvent.pointerUp(window, mouse({ clientX: 20 }));
    });
});
