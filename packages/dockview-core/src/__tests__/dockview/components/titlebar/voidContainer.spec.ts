import { VoidContainer } from '../../../../dockview/components/titlebar/voidContainer';
import { fromPartial } from '@total-typescript/shoehorn';
import { DockviewComponent } from '../../../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../../../dockview/dockviewGroupPanel';
import { DockviewGroupPanelModel } from '../../../../dockview/dockviewGroupPanelModel';
import {
    LocalSelectionTransfer,
    PanelTransfer,
} from '../../../../dnd/dataTransfer';
import { IGroupDragGhostRenderer } from '../../../../dockview/framework';
import { fireEvent } from '@testing-library/dom';
import { PointerDragController } from '../../../../dnd/pointer/pointerDragController';

describe('voidContainer', () => {
    test('that `pointerDown` triggers activation', () => {
        const accessor = fromPartial<DockviewComponent>({
            doSetGroupActive: jest.fn(),
            options: {},
        });
        const group = fromPartial<DockviewGroupPanel>({});
        const cut = new VoidContainer(accessor, group);

        expect(accessor.doSetGroupActive).not.toHaveBeenCalled();

        fireEvent.pointerDown(cut.element);
        expect(accessor.doSetGroupActive).toHaveBeenCalledWith(group);
    });

    describe('disableDnd option', () => {
        test('that void container is draggable by default (disableDnd not set)', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: {},
            });
            const group = fromPartial<DockviewGroupPanel>({});
            const cut = new VoidContainer(accessor, group);

            expect(cut.element.draggable).toBe(true);
        });

        test('that void container is draggable when disableDnd is false', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: { disableDnd: false },
            });
            const group = fromPartial<DockviewGroupPanel>({});
            const cut = new VoidContainer(accessor, group);

            expect(cut.element.draggable).toBe(true);
        });

        test('that void container is not draggable when disableDnd is true', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: { disableDnd: true },
            });
            const group = fromPartial<DockviewGroupPanel>({});
            const cut = new VoidContainer(accessor, group);

            expect(cut.element.draggable).toBe(false);
        });

        test('that updateDragAndDropState updates draggable attribute based on disableDnd option', () => {
            const options = { disableDnd: false };
            const accessor = fromPartial<DockviewComponent>({
                options,
            });
            const group = fromPartial<DockviewGroupPanel>({});
            const cut = new VoidContainer(accessor, group);

            expect(cut.element.draggable).toBe(true);

            options.disableDnd = true;
            cut.updateDragAndDropState();
            expect(cut.element.draggable).toBe(false);

            options.disableDnd = false;
            cut.updateDragAndDropState();
            expect(cut.element.draggable).toBe(true);
        });

        test('that void container has dv-draggable class when draggable', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: { disableDnd: false },
            });
            const group = fromPartial<DockviewGroupPanel>({});
            const cut = new VoidContainer(accessor, group);

            expect(cut.element.classList.contains('dv-draggable')).toBe(true);
        });

        test('that void container does not have dv-draggable class when not draggable', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: { disableDnd: true },
            });
            const group = fromPartial<DockviewGroupPanel>({});
            const cut = new VoidContainer(accessor, group);

            expect(cut.element.classList.contains('dv-draggable')).toBe(false);
        });

        test('that updateDragAndDropState updates dv-draggable class based on disableDnd option', () => {
            const options = { disableDnd: false };
            const accessor = fromPartial<DockviewComponent>({
                options,
            });
            const group = fromPartial<DockviewGroupPanel>({});
            const cut = new VoidContainer(accessor, group);

            expect(cut.element.classList.contains('dv-draggable')).toBe(true);

            options.disableDnd = true;
            cut.updateDragAndDropState();
            expect(cut.element.classList.contains('dv-draggable')).toBe(false);

            options.disableDnd = false;
            cut.updateDragAndDropState();
            expect(cut.element.classList.contains('dv-draggable')).toBe(true);
        });

        test('that dragstart is prevented when disableDnd is true', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: { disableDnd: true },
            });
            const group = fromPartial<DockviewGroupPanel>({
                api: {
                    location: { type: 'grid' },
                },
            });
            const cut = new VoidContainer(accessor, group);

            const event = new Event('dragstart');
            const spy = jest.spyOn(event, 'preventDefault');
            fireEvent(cut.element, event);
            expect(spy).toHaveBeenCalledTimes(1);

            cut.dispose();
        });

        test('that dragstart is not prevented when disableDnd is false', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: { disableDnd: false },
            });
            const group = fromPartial<DockviewGroupPanel>({
                api: {
                    location: { type: 'grid' },
                },
            });
            const cut = new VoidContainer(accessor, group);

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
            });
            const group = fromPartial<DockviewGroupPanel>({
                api: {
                    location: { type: 'grid' },
                },
            });
            const cut = new VoidContainer(accessor, group);

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

        test('that onDragStart is not fired when disableDnd is true', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: { disableDnd: true },
            });
            const group = fromPartial<DockviewGroupPanel>({
                api: {
                    location: { type: 'grid' },
                },
            });
            const cut = new VoidContainer(accessor, group);

            const spy = jest.fn();
            cut.onDragStart(spy);

            fireEvent.dragStart(cut.element);
            expect(spy).toHaveBeenCalledTimes(0);

            cut.dispose();
        });
    });

    describe('HTML5 drag cancellation predicate', () => {
        // These predicates used to live in `GroupDragHandler.isCancelled`;
        // they're now inlined into `voidContainer.ts` as the html5 backend
        // drag source's `isCancelled` callback. Behavior is preserved.

        test('floating group: dragstart is prevented when shiftKey is not held', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: {},
            });
            const group = fromPartial<DockviewGroupPanel>({
                api: { location: { type: 'floating' } },
            });
            const cut = new VoidContainer(accessor, group);

            const event = new Event('dragstart') as DragEvent;
            // jsdom's DragEvent constructor doesn't preserve shiftKey,
            // so the default-false matches the unshifted case.
            const spy = jest.spyOn(event, 'preventDefault');
            fireEvent(cut.element, event);
            expect(spy).toHaveBeenCalledTimes(1);

            cut.dispose();
        });

        test('floating group with a title bar: void dragstart is NOT prevented (drags like a grid group)', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: {},
            });
            const group = fromPartial<DockviewGroupPanel>({
                api: { location: { type: 'floating' } },
            });
            const cut = new VoidContainer(accessor, group);

            // a title-bar floating window's overlay carries this class; the
            // void container is then no longer the move handle, so a plain
            // drag should redock rather than being gated behind shift.
            const overlay = document.createElement('div');
            overlay.className =
                'dv-resize-container dv-resize-container-with-titlebar';
            overlay.appendChild(cut.element);

            const event = new Event('dragstart') as DragEvent;
            const spy = jest.spyOn(event, 'preventDefault');
            fireEvent(cut.element, event);
            expect(spy).toHaveBeenCalledTimes(0);

            cut.dispose();
        });

        test('edge group with zero panels: dragstart is prevented', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: {},
            });
            const group = fromPartial<DockviewGroupPanel>({
                api: { location: { type: 'edge', position: 'left' } },
                size: 0,
            });
            const cut = new VoidContainer(accessor, group);

            const event = new Event('dragstart');
            const spy = jest.spyOn(event, 'preventDefault');
            fireEvent(cut.element, event);
            expect(spy).toHaveBeenCalledTimes(1);

            cut.dispose();
        });

        test('edge group with panels: dragstart is allowed', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: {},
            });
            const group = fromPartial<DockviewGroupPanel>({
                api: { location: { type: 'edge', position: 'left' } },
                size: 1,
            });
            const cut = new VoidContainer(accessor, group);

            const event = new Event('dragstart');
            const spy = jest.spyOn(event, 'preventDefault');
            fireEvent(cut.element, event);
            expect(spy).toHaveBeenCalledTimes(0);

            cut.dispose();
        });

        test('grid group: dragstart is allowed regardless of shiftKey', () => {
            const accessor = fromPartial<DockviewComponent>({
                options: {},
            });
            const group = fromPartial<DockviewGroupPanel>({
                api: { location: { type: 'grid' } },
            });
            const cut = new VoidContainer(accessor, group);

            const event = new Event('dragstart');
            const spy = jest.spyOn(event, 'preventDefault');
            fireEvent(cut.element, event);
            expect(spy).toHaveBeenCalledTimes(0);

            cut.dispose();
        });
    });

    describe('pointer (touch) drag', () => {
        afterEach(() => {
            PointerDragController.getInstance().cancel();
            LocalSelectionTransfer.getInstance().clearData(
                PanelTransfer.prototype
            );
        });

        test('a touch press held past the initiation delay sets up a group PanelTransfer (panelId=null)', () => {
            jest.useFakeTimers();
            const accessor = fromPartial<DockviewComponent>({
                doSetGroupActive: jest.fn(),
                id: 'componentId',
                options: {},
            });
            const group = fromPartial<DockviewGroupPanel>({
                id: 'groupId',
                api: { location: { type: 'grid' } },
                size: 1,
            });
            const cut = new VoidContainer(accessor, group);

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
            // null panelId is the marker for a whole-group drag
            expect(data[0].panelId).toBeNull();

            cut.dispose();
            jest.useRealTimers();
        });

        test('a floating group can be touch-dragged (long-press substitutes for the HTML5 shift modifier)', () => {
            jest.useFakeTimers();
            const accessor = fromPartial<DockviewComponent>({
                doSetGroupActive: jest.fn(),
                id: 'componentId',
                options: {},
            });
            const group = fromPartial<DockviewGroupPanel>({
                id: 'groupId',
                api: { location: { type: 'floating' } },
                size: 1,
            });
            const cut = new VoidContainer(accessor, group);

            const onDragStart = jest.fn();
            cut.onDragStart(onDragStart);

            fireEvent.pointerDown(cut.element, {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 0,
                clientY: 0,
            });
            // Floating groups require a longer hold (500ms) than the
            // default 250ms so the move-the-float gesture and the redock
            // gesture don't both fire on a short drag.
            jest.advanceTimersByTime(550);
            fireEvent.pointerMove(window, {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 50,
                clientY: 0,
            });

            expect(onDragStart).toHaveBeenCalledTimes(1);
            expect(
                LocalSelectionTransfer.getInstance().hasData(
                    PanelTransfer.prototype
                )
            ).toBe(true);

            cut.dispose();
            jest.useRealTimers();
        });

        test('a short drag on a floating group does NOT trigger redock (pressTolerance: Infinity)', () => {
            jest.useFakeTimers();
            const accessor = fromPartial<DockviewComponent>({
                doSetGroupActive: jest.fn(),
                id: 'componentId',
                options: {},
            });
            const group = fromPartial<DockviewGroupPanel>({
                id: 'groupId',
                api: { location: { type: 'floating' } },
                size: 1,
            });
            const cut = new VoidContainer(accessor, group);

            const onDragStart = jest.fn();
            cut.onDragStart(onDragStart);

            fireEvent.pointerDown(cut.element, {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 0,
                clientY: 0,
            });
            // Move within the pre-arm window. For a floating group this
            // must not promote to a redock (the overlay's move-the-float
            // drag owns this gesture).
            jest.advanceTimersByTime(100);
            fireEvent.pointerMove(window, {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 200,
                clientY: 0,
            });

            expect(onDragStart).not.toHaveBeenCalled();

            cut.dispose();
            jest.useRealTimers();
        });

        test('disableDnd suppresses the touch drag', () => {
            const accessor = fromPartial<DockviewComponent>({
                doSetGroupActive: jest.fn(),
                id: 'componentId',
                options: { disableDnd: true },
            });
            const group = fromPartial<DockviewGroupPanel>({
                id: 'groupId',
                api: { location: { type: 'grid' } },
                size: 1,
            });
            const cut = new VoidContainer(accessor, group);

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

            cut.dispose();
        });
    });

    describe('locked group (regression #990)', () => {
        function setup(lockedValue: boolean | 'no-drop-target') {
            const accessor = fromPartial<DockviewComponent>({
                id: 'testcomponentid',
                options: {},
                doSetGroupActive: jest.fn(),
            });

            const groupView = fromPartial<DockviewGroupPanelModel>({
                canDisplayOverlay: jest.fn().mockReturnValue(true),
                dropTargetContainer: undefined,
            });

            const group = fromPartial<DockviewGroupPanel>({
                id: 'testgroupid',
                model: groupView,
                api: fromPartial<DockviewGroupPanel['api']>({
                    locked: lockedValue,
                }),
            });

            const cut = new VoidContainer(accessor, group);

            jest.spyOn(cut.element, 'offsetHeight', 'get').mockImplementation(
                () => 100
            );
            jest.spyOn(cut.element, 'offsetWidth', 'get').mockImplementation(
                () => 100
            );

            return { cut, groupView };
        }

        afterEach(() => {
            LocalSelectionTransfer.getInstance().clearData(
                PanelTransfer.prototype
            );
        });

        test.each([
            true,
            'no-drop-target' as const,
        ])('does not display a drop overlay when locked=%p, even for same-accessor drags', (lockedValue) => {
            const { cut, groupView } = setup(lockedValue);

            LocalSelectionTransfer.getInstance().setData(
                [
                    new PanelTransfer(
                        'testcomponentid',
                        'anothergroupid',
                        'panel1'
                    ),
                ],
                PanelTransfer.prototype
            );

            fireEvent.dragEnter(cut.element);
            fireEvent.dragOver(cut.element);

            expect(
                cut.element.parentElement?.getElementsByClassName(
                    'dv-drop-target-dropzone'
                ).length ?? 0
            ).toBe(0);
            // short-circuited before consulting the group model
            expect(groupView.canDisplayOverlay).not.toHaveBeenCalled();

            cut.dispose();
        });

        test('still displays a drop overlay for same-accessor drags when not locked', () => {
            const { cut } = setup(false);

            LocalSelectionTransfer.getInstance().setData(
                [
                    new PanelTransfer(
                        'testcomponentid',
                        'anothergroupid',
                        'panel1'
                    ),
                ],
                PanelTransfer.prototype
            );

            fireEvent.dragEnter(cut.element);
            fireEvent.dragOver(cut.element);

            expect(
                cut.element.getElementsByClassName('dv-drop-target-dropzone')
            ).toHaveLength(1);

            cut.dispose();
        });
    });

    describe('custom group drag ghost (createGroupDragGhostComponent)', () => {
        afterEach(() => {
            LocalSelectionTransfer.getInstance().clearData(
                PanelTransfer.prototype
            );
        });

        test('factory is invoked, init is called, and dispose runs after drag start', () => {
            jest.useFakeTimers();

            const ghostElement = document.createElement('div');
            ghostElement.textContent = 'custom-ghost';

            const init = jest.fn();
            const dispose = jest.fn();
            const renderer: IGroupDragGhostRenderer = {
                element: ghostElement,
                init,
                dispose,
            };
            const factory = jest.fn(() => renderer);

            const fakeApi = { id: 'api-id' };
            const accessor = fromPartial<DockviewComponent>({
                id: 'accessor_id',
                api: fakeApi as any,
                options: { createGroupDragGhostComponent: factory },
                doSetGroupActive: jest.fn(),
                // The custom-ghost resolution lives in the AdvancedDnD module
                // (covered by its own tests). Here we stub the host's ghost
                // builder (exactly what DockviewComponent provides to
                // VoidContainer) to verify VoidContainer drives the lifecycle.
                buildGroupDragGhost: (g: any) => {
                    const r = factory(g);
                    r.init({ group: g, api: fakeApi });
                    return { element: r.element, dispose: () => r.dispose() };
                },
            });
            const group = fromPartial<DockviewGroupPanel>({
                id: 'g1',
                api: { location: { type: 'grid' } },
                size: 3,
            });

            const cut = new VoidContainer(accessor, group);

            const setDragImage = jest.fn();
            const event = new Event('dragstart');
            Object.defineProperty(event, 'dataTransfer', {
                value: {
                    setDragImage,
                    setData: jest.fn(),
                    items: [],
                } as unknown as DataTransfer,
            });
            fireEvent(cut.element, event);

            expect(factory).toHaveBeenCalledWith(group);
            expect(init).toHaveBeenCalledWith({ group, api: fakeApi });
            expect(dispose).not.toHaveBeenCalled();

            jest.runAllTimers();
            expect(dispose).toHaveBeenCalledTimes(1);

            cut.dispose();
            jest.useRealTimers();
        });

        test('default "Multiple Panels" ghost is used when no factory is provided', () => {
            jest.useFakeTimers();

            const accessor = fromPartial<DockviewComponent>({
                id: 'accessor_id',
                options: {},
                doSetGroupActive: jest.fn(),
            });
            const group = fromPartial<DockviewGroupPanel>({
                id: 'g1',
                api: { location: { type: 'grid' } },
                size: 4,
            });

            const cut = new VoidContainer(accessor, group);

            const setDragImage = jest.fn();
            const event = new Event('dragstart');
            Object.defineProperty(event, 'dataTransfer', {
                value: {
                    setDragImage,
                    setData: jest.fn(),
                    items: [],
                } as unknown as DataTransfer,
            });
            fireEvent(cut.element, event);

            expect(setDragImage).toHaveBeenCalledTimes(1);
            const ghost = setDragImage.mock.calls[0][0] as HTMLElement;
            expect(ghost.textContent).toBe('Multiple Panels (4)');
            // Regression: a plain block-level div appended to body stretches
            // to viewport width and renders as a horizontal bar.
            expect(ghost.style.display).toBe('inline-block');

            jest.runAllTimers();

            cut.dispose();
            jest.useRealTimers();
        });
    });
});
