import { fireEvent } from '@testing-library/dom';
import {
    LocalSelectionTransfer,
    PanelTransfer,
} from '../../../dnd/dataTransfer';
import { DockviewComponent } from '../../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../../dockview/dockviewGroupPanel';
import { DockviewGroupPanelModel } from '../../../dockview/dockviewGroupPanelModel';
import { Tab } from '../../../dockview/components/tab/tab';
import { IDockviewPanel } from '../../../dockview/dockviewPanel';
import { PointerDragController } from '../../../dnd/pointer/pointerDragController';
import { fromPartial } from '@total-typescript/shoehorn';

describe('tab', () => {
    test('that empty tab has inactive-tab class', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
            options: {},
        });
        const groupMock = jest.fn();

        const cut = new Tab(
            { id: 'panelId' } as IDockviewPanel,
            accessor,
            new groupMock()
        );

        expect(cut.element.className).toBe('dv-tab dv-inactive-tab');
    });

    test('sets an explicit aria-label from the panel title so the name is not computed from contents (which would swallow the close button label)', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
            options: {},
        });
        const groupMock = jest.fn();

        const cut = new Tab(
            { id: 'panelId', title: 'My Panel' } as IDockviewPanel,
            accessor,
            new groupMock()
        );

        expect(cut.element.getAttribute('aria-label')).toBe('My Panel');
    });

    test('aria-label falls back to the panel id when there is no title', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
            options: {},
        });
        const groupMock = jest.fn();

        const cut = new Tab(
            { id: 'panelId' } as IDockviewPanel,
            accessor,
            new groupMock()
        );

        expect(cut.element.getAttribute('aria-label')).toBe('panelId');
    });

    test('aria-label follows onDidTitleChange', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
            options: {},
        });
        const groupMock = jest.fn();

        let titleListener: ((e: { title: string }) => void) | undefined;
        const cut = new Tab(
            fromPartial<IDockviewPanel>({
                id: 'panelId',
                title: 'Initial',
                api: fromPartial({
                    onDidTitleChange: (fn: (e: { title: string }) => void) => {
                        titleListener = fn;
                        return { dispose: jest.fn() };
                    },
                }),
            }),
            accessor,
            new groupMock()
        );

        expect(cut.element.getAttribute('aria-label')).toBe('Initial');
        titleListener?.({ title: 'Renamed' });
        expect(cut.element.getAttribute('aria-label')).toBe('Renamed');
    });

    test('that active tab has active-tab class', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
            options: {},
        });
        const groupMock = jest.fn();

        const cut = new Tab(
            { id: 'panelId' } as IDockviewPanel,
            accessor,
            new groupMock()
        );

        cut.setActive(true);
        expect(cut.element.className).toBe('dv-tab dv-active-tab');

        cut.setActive(false);
        expect(cut.element.className).toBe('dv-tab dv-inactive-tab');
    });

    test('that an external event does not render a drop target and calls through to the group model', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
            id: 'testcomponentid',
            options: {},
        });

        const groupView = fromPartial<DockviewGroupPanelModel>({
            canDisplayOverlay: jest.fn(),
        });

        const groupPanel = fromPartial<DockviewGroupPanel>({
            id: 'testgroupid',
            model: groupView,
        });

        const cut = new Tab(
            { id: 'panelId' } as IDockviewPanel,
            accessor,
            groupPanel
        );

        jest.spyOn(cut.element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(cut.element, 'offsetWidth', 'get').mockImplementation(
            () => 100
        );

        fireEvent.dragEnter(cut.element);
        fireEvent.dragOver(cut.element);

        expect(groupView.canDisplayOverlay).toHaveBeenCalled();

        expect(
            cut.element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);
    });

    test('that if you drag over yourself a drop target is shown', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
            id: 'testcomponentid',
            options: {},
        });

        const groupView = fromPartial<DockviewGroupPanelModel>({
            canDisplayOverlay: jest.fn(),
        });

        const groupPanel = fromPartial<DockviewGroupPanel>({
            id: 'testgroupid',
            model: groupView,
        });

        const cut = new Tab(
            { id: 'panel1' } as IDockviewPanel,
            accessor,
            groupPanel
        );

        jest.spyOn(cut.element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(cut.element, 'offsetWidth', 'get').mockImplementation(
            () => 100
        );

        LocalSelectionTransfer.getInstance().setData(
            [new PanelTransfer('testcomponentid', 'anothergroupid', 'panel1')],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(cut.element);
        fireEvent.dragOver(cut.element);

        expect(groupView.canDisplayOverlay).toHaveBeenCalledTimes(0);

        expect(
            cut.element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(1);
    });

    test('that if you drag over another tab a drop target is shown', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
            id: 'testcomponentid',
            options: {},
        });

        const groupView = fromPartial<DockviewGroupPanelModel>({
            canDisplayOverlay: jest.fn(),
        });

        const groupPanel = fromPartial<DockviewGroupPanel>({
            id: 'testgroupid',
            model: groupView,
        });

        const cut = new Tab(
            { id: 'panel1' } as IDockviewPanel,
            accessor,
            groupPanel
        );

        jest.spyOn(cut.element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(cut.element, 'offsetWidth', 'get').mockImplementation(
            () => 100
        );

        LocalSelectionTransfer.getInstance().setData(
            [new PanelTransfer('testcomponentid', 'anothergroupid', 'panel2')],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(cut.element);
        fireEvent.dragOver(cut.element);

        expect(groupView.canDisplayOverlay).toHaveBeenCalledTimes(0);

        expect(
            cut.element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(1);
    });

    test('that dropping on a tab with the same id but from a different component should not render a drop over and call through to the group model', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
            id: 'testcomponentid',
            options: {},
        });

        const groupView = fromPartial<DockviewGroupPanelModel>({
            canDisplayOverlay: jest.fn(),
        });

        const groupPanel = fromPartial<DockviewGroupPanel>({
            id: 'testgroupid',
            model: groupView,
        });

        const cut = new Tab(
            { id: 'panel1' } as IDockviewPanel,
            accessor,
            groupPanel
        );

        jest.spyOn(cut.element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(cut.element, 'offsetWidth', 'get').mockImplementation(
            () => 100
        );

        LocalSelectionTransfer.getInstance().setData(
            [
                new PanelTransfer(
                    'anothercomponentid',
                    'anothergroupid',
                    'panel1'
                ),
            ],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(cut.element);
        fireEvent.dragOver(cut.element);

        expect(groupView.canDisplayOverlay).toHaveBeenCalledTimes(1);

        expect(
            cut.element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);
    });

    test('that dropping on a tab from a different component should not render a drop over and call through to the group model', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
            id: 'testcomponentid',
            options: {},
        });

        const groupView = fromPartial<DockviewGroupPanelModel>({
            canDisplayOverlay: jest.fn(),
        });

        const groupPanel = fromPartial<DockviewGroupPanel>({
            id: 'testgroupid',
            model: groupView,
        });

        const cut = new Tab(
            { id: 'panel1' } as IDockviewPanel,
            accessor,
            groupPanel
        );

        jest.spyOn(cut.element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(cut.element, 'offsetWidth', 'get').mockImplementation(
            () => 100
        );

        LocalSelectionTransfer.getInstance().setData(
            [
                new PanelTransfer(
                    'anothercomponentid',
                    'anothergroupid',
                    'panel2'
                ),
            ],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(cut.element);
        fireEvent.dragOver(cut.element);

        expect(groupView.canDisplayOverlay).toHaveBeenCalledTimes(1);

        expect(
            cut.element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);
    });

    describe('pointer (touch) drag', () => {
        afterEach(() => {
            PointerDragController.getInstance().cancel();
            // Clear any panel transfer data between tests so tests don't
            // poison each other through the LocalSelectionTransfer singleton.
            LocalSelectionTransfer.getInstance().clearData(
                PanelTransfer.prototype
            );
        });

        test('a touch press held past the initiation delay then moved sets up a PanelTransfer and fires onDragStart', () => {
            jest.useFakeTimers();
            const accessor = fromPartial<DockviewComponent>({
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                id: 'componentId',
                options: {},
            });
            const groupPanel = fromPartial<DockviewGroupPanel>({
                id: 'groupId',
            });

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                groupPanel
            );

            const onDragStart = jest.fn();
            cut.onDragStart(onDragStart);

            fireEvent.pointerDown(cut.element, {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 0,
                clientY: 0,
            });
            jest.advanceTimersByTime(300);
            fireEvent.pointerMove(window, {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 50,
                clientY: 0,
            });

            expect(onDragStart).toHaveBeenCalledTimes(1);
            const transfer =
                LocalSelectionTransfer.getInstance<PanelTransfer>();
            expect(transfer.hasData(PanelTransfer.prototype)).toBe(true);
            const data = transfer.getData(PanelTransfer.prototype)!;
            expect(data[0].viewId).toBe('componentId');
            expect(data[0].groupId).toBe('groupId');
            expect(data[0].panelId).toBe('panelId');

            cut.dispose();
            jest.useRealTimers();
        });

        test('a quick swipe in any direction begins the drag (tabs always grab on flick)', () => {
            jest.useFakeTimers();
            const accessor = fromPartial<DockviewComponent>({
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                id: 'componentId',
                options: {},
            });
            const groupPanel = fromPartial<DockviewGroupPanel>({
                id: 'groupId',
            });

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                groupPanel
            );

            const onDragStart = jest.fn();
            cut.onDragStart(onDragStart);

            fireEvent.pointerDown(cut.element, {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 0,
                clientY: 0,
            });
            // A downward flick past pressTolerance, before the initiation
            // delay fires. Drag intent in any direction begins the drag
            // (strip-scrolling lives on the empty container space, not on
            // tabs themselves).
            fireEvent.pointerMove(window, {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 0,
                clientY: 50,
            });

            expect(onDragStart).toHaveBeenCalledTimes(1);

            cut.dispose();
            jest.useRealTimers();
        });

        test('a mouse pointerdown does not engage the pointer flow (HTML5 path stays in charge)', () => {
            const accessor = fromPartial<DockviewComponent>({
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                id: 'componentId',
                options: {},
            });
            const groupPanel = fromPartial<DockviewGroupPanel>({
                id: 'groupId',
            });

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                groupPanel
            );

            const onDragStart = jest.fn();
            cut.onDragStart(onDragStart);

            fireEvent.pointerDown(cut.element, {
                pointerId: 1,
                pointerType: 'mouse',
                clientX: 0,
                clientY: 0,
            });
            fireEvent.pointerMove(window, {
                pointerId: 1,
                pointerType: 'mouse',
                clientX: 50,
                clientY: 0,
            });

            expect(onDragStart).not.toHaveBeenCalled();
            expect(
                LocalSelectionTransfer.getInstance().hasData(
                    PanelTransfer.prototype
                )
            ).toBe(false);

            cut.dispose();
        });
    });

    describe('contextmenu event', () => {
        test('right-clicking a tab calls contextMenuService.show with the panel and group', () => {
            const showMock = jest.fn();
            const accessor = fromPartial<DockviewComponent>({
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                options: {},
                contextMenuService: { show: showMock },
            });

            const panel = fromPartial<IDockviewPanel>({ id: 'panelId' });
            const group = fromPartial<DockviewGroupPanel>({ id: 'groupId' });

            const cut = new Tab(panel, accessor, group);

            const event = new MouseEvent('contextmenu', { cancelable: true });
            fireEvent(cut.element, event);

            expect(showMock).toHaveBeenCalledWith(panel, group, event);
        });
    });

    describe('disableDnd option', () => {
        test('that tab is draggable by default (disableDnd not set)', () => {
            const accessor = fromPartial<DockviewComponent>({
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                options: {},
            });
            const groupMock = jest.fn();

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                new groupMock()
            );

            expect(cut.element.draggable).toBe(true);
        });

        test('that tab is draggable when disableDnd is false', () => {
            const accessor = fromPartial<DockviewComponent>({
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                options: { disableDnd: false },
            });
            const groupMock = jest.fn();

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                new groupMock()
            );

            expect(cut.element.draggable).toBe(true);
        });

        test('that tab is not draggable when disableDnd is true', () => {
            const accessor = fromPartial<DockviewComponent>({
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                options: { disableDnd: true },
            });
            const groupMock = jest.fn();

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                new groupMock()
            );

            expect(cut.element.draggable).toBe(false);
        });

        test('that updateDragAndDropState updates draggable attribute based on disableDnd option', () => {
            const options = { disableDnd: false };
            const accessor = fromPartial<DockviewComponent>({
                options,
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
            });
            const groupMock = jest.fn();

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                new groupMock()
            );

            expect(cut.element.draggable).toBe(true);

            options.disableDnd = true;
            cut.updateDragAndDropState();
            expect(cut.element.draggable).toBe(false);

            options.disableDnd = false;
            cut.updateDragAndDropState();
            expect(cut.element.draggable).toBe(true);
        });

        test('that dragstart is prevented when disableDnd is true', () => {
            const accessor = fromPartial<DockviewComponent>({
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                options: { disableDnd: true },
            });
            const groupMock = jest.fn();

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                new groupMock()
            );

            const event = new Event('dragstart');
            const spy = jest.spyOn(event, 'preventDefault');
            fireEvent(cut.element, event);
            expect(spy).toHaveBeenCalledTimes(1);

            cut.dispose();
        });

        test('that dragstart is not prevented when disableDnd is false', () => {
            const accessor = fromPartial<DockviewComponent>({
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                options: { disableDnd: false },
            });
            const groupMock = jest.fn();

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                new groupMock()
            );

            const event = new Event('dragstart');
            const spy = jest.spyOn(event, 'preventDefault');
            fireEvent(cut.element, event);
            expect(spy).toHaveBeenCalledTimes(0);

            cut.dispose();
        });

        test('that updateDragAndDropState updates drag handler disabled state', () => {
            const options = { disableDnd: false };
            const accessor = fromPartial<DockviewComponent>({
                options,
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
            });
            const groupMock = jest.fn();

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                new groupMock()
            );

            let event = new Event('dragstart');
            let spy = jest.spyOn(event, 'preventDefault');
            fireEvent(cut.element, event);
            expect(spy).toHaveBeenCalledTimes(0);

            options.disableDnd = true;
            cut.updateDragAndDropState();
            event = new Event('dragstart');
            spy = jest.spyOn(event, 'preventDefault');
            fireEvent(cut.element, event);
            expect(spy).toHaveBeenCalledTimes(1);

            options.disableDnd = false;
            cut.updateDragAndDropState();
            event = new Event('dragstart');
            spy = jest.spyOn(event, 'preventDefault');
            fireEvent(cut.element, event);
            expect(spy).toHaveBeenCalledTimes(0);

            cut.dispose();
        });

        test('that touch pointerdown does NOT promote to a drag when disableDnd is true', () => {
            const accessor = fromPartial<DockviewComponent>({
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                id: 'componentId',
                options: { disableDnd: true },
            });
            const groupPanel = fromPartial<DockviewGroupPanel>({
                id: 'groupId',
            });

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                groupPanel
            );

            const onDragStart = jest.fn();
            cut.onDragStart(onDragStart);

            fireEvent.pointerDown(cut.element, {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 0,
                clientY: 0,
            });
            fireEvent.pointerMove(window, {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 50,
                clientY: 0,
            });

            expect(onDragStart).not.toHaveBeenCalled();
            expect(
                LocalSelectionTransfer.getInstance().hasData(
                    PanelTransfer.prototype
                )
            ).toBe(false);

            cut.dispose();
            PointerDragController.getInstance().cancel();
        });

        test('that onDragStart is not fired when disableDnd is true', () => {
            const accessor = fromPartial<DockviewComponent>({
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                options: { disableDnd: true },
            });
            const groupMock = jest.fn();

            const cut = new Tab(
                { id: 'panelId' } as IDockviewPanel,
                accessor,
                new groupMock()
            );

            const spy = jest.fn();
            cut.onDragStart(spy);

            fireEvent.dragStart(cut.element);
            expect(spy).toHaveBeenCalledTimes(0);

            cut.dispose();
        });
    });
});
