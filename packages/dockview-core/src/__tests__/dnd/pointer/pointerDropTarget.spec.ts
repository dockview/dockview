import { PointerDragController } from '../../../dnd/pointer/pointerDragController';
import { PointerDropTarget } from '../../../dnd/pointer/pointerDropTarget';
import { PointerDragEvent } from '../../../dnd/pointer/types';

describe('PointerDropTarget', () => {
    afterEach(() => {
        PointerDragController.getInstance().cancel();
    });

    function makeDragEvent(clientX: number, clientY: number): PointerDragEvent {
        return {
            clientX,
            clientY,
            pointerEvent: new PointerEvent('pointermove', {
                clientX,
                clientY,
                pointerId: 1,
                pointerType: 'touch',
            }),
        };
    }

    test('renders an overlay on drag-over within an accepted zone', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        jest.spyOn(element, 'offsetWidth', 'get').mockReturnValue(100);
        jest.spyOn(element, 'offsetHeight', 'get').mockReturnValue(40);
        jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
            top: 0,
            left: 0,
            right: 100,
            bottom: 40,
            width: 100,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        const target = new PointerDropTarget(element, {
            acceptedTargetZones: ['left', 'right'],
            canDisplayOverlay: () => true,
        });

        // Simulate the controller routing a drag-over to us.
        (target as any)._onDragOver(makeDragEvent(10, 20));

        const dropzones = element.getElementsByClassName(
            'dv-drop-target-dropzone'
        );
        expect(dropzones).toHaveLength(1);
        expect(target.state).toBe('left');

        target.dispose();
        document.body.removeChild(element);
    });

    test('does not render an overlay when canDisplayOverlay returns false', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        jest.spyOn(element, 'offsetWidth', 'get').mockReturnValue(100);
        jest.spyOn(element, 'offsetHeight', 'get').mockReturnValue(40);
        jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
            top: 0,
            left: 0,
            right: 100,
            bottom: 40,
            width: 100,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        const target = new PointerDropTarget(element, {
            acceptedTargetZones: ['left', 'right'],
            canDisplayOverlay: () => false,
        });

        (target as any)._onDragOver(makeDragEvent(10, 20));

        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);

        target.dispose();
        document.body.removeChild(element);
    });

    test('drag-leave removes the overlay', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        jest.spyOn(element, 'offsetWidth', 'get').mockReturnValue(100);
        jest.spyOn(element, 'offsetHeight', 'get').mockReturnValue(40);
        jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
            top: 0,
            left: 0,
            right: 100,
            bottom: 40,
            width: 100,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        const target = new PointerDropTarget(element, {
            acceptedTargetZones: ['left', 'right'],
            canDisplayOverlay: () => true,
        });

        (target as any)._onDragOver(makeDragEvent(10, 20));
        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(1);

        (target as any)._removeOverlay();
        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);

        target.dispose();
        document.body.removeChild(element);
    });

    test('drop fires onDrop with the latched position and removes the overlay', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        jest.spyOn(element, 'offsetWidth', 'get').mockReturnValue(100);
        jest.spyOn(element, 'offsetHeight', 'get').mockReturnValue(40);
        jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
            top: 0,
            left: 0,
            right: 100,
            bottom: 40,
            width: 100,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        const target = new PointerDropTarget(element, {
            acceptedTargetZones: ['left', 'right'],
            canDisplayOverlay: () => true,
        });

        const onDrop = jest.fn();
        target.onDrop(onDrop);

        // Right-side drag-over.
        (target as any)._onDragOver(makeDragEvent(90, 20));
        expect(target.state).toBe('right');

        (target as any)._onDropEvent(makeDragEvent(90, 20));

        expect(onDrop).toHaveBeenCalledTimes(1);
        expect(onDrop).toHaveBeenCalledWith(
            expect.objectContaining({ position: 'right' })
        );
        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);

        target.dispose();
        document.body.removeChild(element);
    });

    test('disabling clears any active overlay and ignores subsequent drag-overs', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        jest.spyOn(element, 'offsetWidth', 'get').mockReturnValue(100);
        jest.spyOn(element, 'offsetHeight', 'get').mockReturnValue(40);
        jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
            top: 0,
            left: 0,
            right: 100,
            bottom: 40,
            width: 100,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        const target = new PointerDropTarget(element, {
            acceptedTargetZones: ['left', 'right'],
            canDisplayOverlay: () => true,
        });

        (target as any)._onDragOver(makeDragEvent(10, 20));
        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(1);

        target.disabled = true;
        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);

        (target as any)._onDragOver(makeDragEvent(10, 20));
        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);

        target.dispose();
        document.body.removeChild(element);
    });

    function mountedElement(): HTMLElement {
        const element = document.createElement('div');
        document.body.appendChild(element);
        jest.spyOn(element, 'offsetWidth', 'get').mockReturnValue(100);
        jest.spyOn(element, 'offsetHeight', 'get').mockReturnValue(40);
        jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
            top: 0,
            left: 0,
            right: 100,
            bottom: 40,
            width: 100,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });
        return element;
    }

    test('positionResolver overrides the default quadrant', () => {
        const element = mountedElement();
        const target = new PointerDropTarget(element, {
            acceptedTargetZones: ['left', 'right', 'center'],
            canDisplayOverlay: () => true,
            // 10,20 would be 'left' by default, but the resolver forces 'right'.
            getPositionResolver: () => ({
                resolve: () => ({ position: 'right' }),
            }),
        });

        (target as any)._onDragOver(makeDragEvent(10, 20));
        expect(target.state).toBe('right');

        target.dispose();
        document.body.removeChild(element);
    });

    test('a null positionResolver result shows no overlay', () => {
        const element = mountedElement();
        const target = new PointerDropTarget(element, {
            acceptedTargetZones: ['left', 'right', 'center'],
            canDisplayOverlay: () => true,
            getPositionResolver: () => ({ resolve: () => null }),
        });

        (target as any)._onDragOver(makeDragEvent(10, 20));
        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);
        expect(target.state).toBeUndefined();

        target.dispose();
        document.body.removeChild(element);
    });
});

describe('PointerDropTarget edgeGroup hint', () => {
    afterEach(() => {
        PointerDragController.getInstance().cancel();
    });

    function mountedElement(): HTMLElement {
        const element = document.createElement('div');
        document.body.appendChild(element);
        jest.spyOn(element, 'offsetWidth', 'get').mockReturnValue(100);
        jest.spyOn(element, 'offsetHeight', 'get').mockReturnValue(40);
        jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
            top: 0,
            left: 0,
            right: 100,
            bottom: 40,
            width: 100,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });
        return element;
    }

    function makeDragEvent(clientX: number, clientY: number): PointerDragEvent {
        return {
            clientX,
            clientY,
            pointerEvent: new PointerEvent('pointermove', {
                clientX,
                clientY,
                pointerId: 1,
                pointerType: 'touch',
            }),
        };
    }

    test('forwards the resolver edgeGroup hint on onWillShowOverlay', () => {
        const element = mountedElement();
        const target = new PointerDropTarget(element, {
            acceptedTargetZones: ['left', 'right', 'center'],
            canDisplayOverlay: () => true,
            getPositionResolver: () => ({
                resolve: () => ({ position: 'right', edgeGroup: true }),
            }),
        });

        const willShow = jest.fn();
        target.onWillShowOverlay(willShow);

        (target as any)._onDragOver(makeDragEvent(10, 20));

        expect(willShow).toHaveBeenCalledTimes(1);
        expect(willShow.mock.calls[0][0].edgeGroup).toBe(true);
        expect(willShow.mock.calls[0][0].edge).toBe(false);

        target.dispose();
        document.body.removeChild(element);
    });

    test('a resolver result without the hint and the built-in quadrant both report edgeGroup=false', () => {
        const element = mountedElement();
        const resolved = new PointerDropTarget(element, {
            acceptedTargetZones: ['left', 'right', 'center'],
            canDisplayOverlay: () => true,
            getPositionResolver: () => ({
                resolve: () => ({ position: 'right' }),
            }),
        });
        const builtIn = new PointerDropTarget(element, {
            acceptedTargetZones: ['left', 'right', 'center'],
            canDisplayOverlay: () => true,
        });

        const willShow = jest.fn();
        resolved.onWillShowOverlay(willShow);
        builtIn.onWillShowOverlay(willShow);

        (resolved as any)._onDragOver(makeDragEvent(10, 20));
        (builtIn as any)._onDragOver(makeDragEvent(10, 20));

        expect(willShow).toHaveBeenCalledTimes(2);
        expect(willShow.mock.calls[0][0].edgeGroup).toBe(false);
        expect(willShow.mock.calls[1][0].edgeGroup).toBe(false);

        resolved.dispose();
        builtIn.dispose();
        document.body.removeChild(element);
    });
});
