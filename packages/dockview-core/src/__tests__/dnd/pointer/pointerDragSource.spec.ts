import { fireEvent } from '@testing-library/dom';
import { PointerDragSource } from '../../../dnd/pointer/pointerDragSource';
import { PointerDragController } from '../../../dnd/pointer/pointerDragController';
import { IDisposable } from '../../../lifecycle';

describe('PointerDragSource', () => {
    afterEach(() => {
        // Make sure no drag leaks across tests via the singleton.
        PointerDragController.getInstance().cancel();
        jest.useRealTimers();
    });

    function pointerEventInit(
        overrides: Partial<PointerEventInit> = {}
    ): PointerEventInit {
        return {
            pointerId: 1,
            pointerType: 'touch',
            clientX: 0,
            clientY: 0,
            bubbles: true,
            cancelable: true,
            ...overrides,
        };
    }

    test('a touch pointerdown promoted to drag after the long-press initiation', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const getData = jest.fn<IDisposable, []>(() => ({
            dispose: jest.fn(),
        }));
        const onDragStart = jest.fn();

        const source = new PointerDragSource(element, {
            getData,
            onDragStart,
        });

        fireEvent.pointerDown(element, pointerEventInit());
        // Hold past the 250ms initiation delay so the drag is armed.
        jest.advanceTimersByTime(300);
        // Movement past the threshold (5px) now starts the drag.
        fireEvent.pointerMove(window, pointerEventInit({ clientX: 10 }));
        expect(onDragStart).toHaveBeenCalledTimes(1);
        expect(getData).toHaveBeenCalledTimes(1);

        source.dispose();
    });

    test('a pre-arm flick past pressTolerance begins the drag (any direction)', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const onDragStart = jest.fn();
        const source = new PointerDragSource(element, {
            getData: () => ({ dispose: jest.fn() }),
            onDragStart,
        });

        fireEvent.pointerDown(element, pointerEventInit());
        // Flick past pressTolerance (default 8px) within the initiation
        // delay: drag intent in any direction arms the drag now.
        fireEvent.pointerMove(window, pointerEventInit({ clientX: 20 }));
        expect(onDragStart).toHaveBeenCalledTimes(1);

        source.dispose();
    });

    test('a pre-arm flick downward also begins the drag (no axis bias)', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const onDragStart = jest.fn();
        const source = new PointerDragSource(element, {
            getData: () => ({ dispose: jest.fn() }),
            onDragStart,
        });

        fireEvent.pointerDown(element, pointerEventInit());
        fireEvent.pointerMove(window, pointerEventInit({ clientY: 20 }));
        expect(onDragStart).toHaveBeenCalledTimes(1);

        source.dispose();
    });

    test('jitter under pressTolerance during the initiation delay does not arm the drag', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const onDragStart = jest.fn();
        const source = new PointerDragSource(element, {
            getData: () => ({ dispose: jest.fn() }),
            onDragStart,
        });

        fireEvent.pointerDown(element, pointerEventInit());
        // 4px finger jitter is under pressTolerance, so the drag does not arm yet.
        fireEvent.pointerMove(window, pointerEventInit({ clientX: 4 }));
        expect(onDragStart).not.toHaveBeenCalled();
        // After the initiation delay fires, subsequent motion past
        // `threshold` (5px) starts the drag.
        jest.advanceTimersByTime(300);
        fireEvent.pointerMove(window, pointerEventInit({ clientX: 10 }));
        expect(onDragStart).toHaveBeenCalledTimes(1);

        source.dispose();
    });

    test('cancelPending() dismisses an in-flight press (used by long-press context menu)', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const getData = jest.fn<IDisposable, []>(() => ({
            dispose: jest.fn(),
        }));
        const onDragStart = jest.fn();

        const source = new PointerDragSource(element, {
            getData,
            onDragStart,
        });

        fireEvent.pointerDown(element, pointerEventInit());
        jest.advanceTimersByTime(300);
        source.cancelPending();
        // After cancellation, even a qualifying move must not start a drag.
        fireEvent.pointerMove(window, pointerEventInit({ clientX: 50 }));

        expect(onDragStart).not.toHaveBeenCalled();

        source.dispose();
    });

    test('a mouse pointerdown is ignored by default (touchOnly)', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        const getData = jest.fn<IDisposable, []>(() => ({
            dispose: jest.fn(),
        }));
        const onDragStart = jest.fn();

        const source = new PointerDragSource(element, {
            getData,
            onDragStart,
        });

        fireEvent.pointerDown(
            element,
            pointerEventInit({ pointerType: 'mouse' })
        );
        fireEvent.pointerMove(
            window,
            pointerEventInit({ pointerType: 'mouse', clientX: 50 })
        );

        expect(onDragStart).not.toHaveBeenCalled();
        expect(getData).not.toHaveBeenCalled();

        source.dispose();
    });

    test('touchOnly: false also handles mouse with no initiation delay', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        const onDragStart = jest.fn();
        const source = new PointerDragSource(element, {
            getData: () => ({ dispose: jest.fn() }),
            onDragStart,
            touchOnly: false,
        });

        fireEvent.pointerDown(
            element,
            pointerEventInit({ pointerType: 'mouse' })
        );
        // Mouse arms immediately, so there's no need to advance timers.
        fireEvent.pointerMove(
            window,
            pointerEventInit({ pointerType: 'mouse', clientX: 10 })
        );

        expect(onDragStart).toHaveBeenCalledTimes(1);

        source.dispose();
    });

    test('shields text selection from pointerdown until the gesture ends', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);
        const root = document.documentElement;

        const source = new PointerDragSource(element, {
            getData: () => ({ dispose: jest.fn() }),
            touchOnly: false,
        });
        const mouse = (overrides: Partial<PointerEventInit> = {}) =>
            pointerEventInit({ pointerType: 'mouse', ...overrides });

        // The browser starts selecting from the pointerdown, well before the
        // drag threshold is cleared, so the shield must be up from here.
        fireEvent.pointerDown(element, mouse());
        expect(root.style.getPropertyValue('user-select')).toBe('none');

        // A press that never becomes a drag releases it on pointerup.
        fireEvent.pointerUp(window, mouse());
        expect(root.style.getPropertyValue('user-select')).toBe('');

        // Across the hand-over to the controller the shield stays up ...
        fireEvent.pointerDown(element, mouse());
        fireEvent.pointerMove(window, mouse({ clientX: 10 }));
        expect(PointerDragController.getInstance().active).toBeDefined();
        expect(root.style.getPropertyValue('user-select')).toBe('none');

        // ... and comes down with the drag.
        fireEvent.pointerUp(window, mouse({ clientX: 10 }));
        expect(PointerDragController.getInstance().active).toBeUndefined();
        expect(root.style.getPropertyValue('user-select')).toBe('');

        source.dispose();
        document.body.removeChild(element);
    });

    test('a pointerup before threshold cancels the pending gesture', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        const getData = jest.fn<IDisposable, []>(() => ({
            dispose: jest.fn(),
        }));
        const source = new PointerDragSource(element, { getData });

        fireEvent.pointerDown(element, pointerEventInit());
        fireEvent.pointerUp(window, pointerEventInit());
        expect(getData).not.toHaveBeenCalled();

        // After cancellation, subsequent moves must not promote.
        fireEvent.pointerMove(window, pointerEventInit({ clientX: 100 }));
        expect(getData).not.toHaveBeenCalled();

        source.dispose();
    });

    test('disabled source ignores pointerdown', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        const getData = jest.fn<IDisposable, []>(() => ({
            dispose: jest.fn(),
        }));
        const source = new PointerDragSource(element, { getData });
        source.setDisabled(true);

        fireEvent.pointerDown(element, pointerEventInit());
        fireEvent.pointerMove(window, pointerEventInit({ clientX: 10 }));

        expect(getData).not.toHaveBeenCalled();

        source.dispose();
    });

    test('isCancelled callback can suppress the drag at pointerdown time', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        const getData = jest.fn<IDisposable, []>(() => ({
            dispose: jest.fn(),
        }));
        const isCancelled = jest.fn(() => true);
        const source = new PointerDragSource(element, { getData, isCancelled });

        fireEvent.pointerDown(element, pointerEventInit());
        fireEvent.pointerMove(window, pointerEventInit({ clientX: 10 }));

        expect(isCancelled).toHaveBeenCalled();
        expect(getData).not.toHaveBeenCalled();

        source.dispose();
    });
});
