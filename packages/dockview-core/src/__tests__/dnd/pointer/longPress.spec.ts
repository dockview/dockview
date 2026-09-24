import { fireEvent } from '@testing-library/dom';
import { LongPressDetector } from '../../../dnd/pointer/longPress';

describe('LongPressDetector', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    function pointerInit(
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

    test('fires after the configured delay when the press is held still', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const onLongPress = jest.fn();
        const cut = new LongPressDetector(element, {
            onLongPress,
            delay: 500,
        });

        fireEvent.pointerDown(element, pointerInit());
        jest.advanceTimersByTime(499);
        expect(onLongPress).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onLongPress).toHaveBeenCalledTimes(1);

        cut.dispose();
        document.body.removeChild(element);
    });

    test('cancels when the pointer moves beyond tolerance', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const onLongPress = jest.fn();
        const cut = new LongPressDetector(element, {
            onLongPress,
            delay: 500,
            tolerance: 8,
        });

        fireEvent.pointerDown(element, pointerInit());
        // Within tolerance, so it must not cancel.
        fireEvent.pointerMove(window, pointerInit({ clientX: 5 }));
        jest.advanceTimersByTime(250);
        // Beyond tolerance, so it must cancel.
        fireEvent.pointerMove(window, pointerInit({ clientX: 20 }));
        jest.advanceTimersByTime(500);

        expect(onLongPress).not.toHaveBeenCalled();

        cut.dispose();
        document.body.removeChild(element);
    });

    test('cancels when the pointer is released before the delay elapses', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const onLongPress = jest.fn();
        const cut = new LongPressDetector(element, {
            onLongPress,
            delay: 500,
        });

        fireEvent.pointerDown(element, pointerInit());
        jest.advanceTimersByTime(200);
        fireEvent.pointerUp(window, pointerInit());
        jest.advanceTimersByTime(500);

        expect(onLongPress).not.toHaveBeenCalled();

        cut.dispose();
        document.body.removeChild(element);
    });

    test('ignores mouse pointers by default (touchOnly)', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const onLongPress = jest.fn();
        const cut = new LongPressDetector(element, {
            onLongPress,
            delay: 500,
        });

        fireEvent.pointerDown(element, pointerInit({ pointerType: 'mouse' }));
        jest.advanceTimersByTime(1000);

        expect(onLongPress).not.toHaveBeenCalled();

        cut.dispose();
        document.body.removeChild(element);
    });

    test('touchOnly: false also fires for mouse', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const onLongPress = jest.fn();
        const cut = new LongPressDetector(element, {
            onLongPress,
            delay: 100,
            touchOnly: false,
        });

        fireEvent.pointerDown(element, pointerInit({ pointerType: 'mouse' }));
        jest.advanceTimersByTime(100);

        expect(onLongPress).toHaveBeenCalledTimes(1);

        cut.dispose();
        document.body.removeChild(element);
    });

    test('suppresses the browser-synthesised contextmenu that follows long-press', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const cut = new LongPressDetector(element, {
            onLongPress: jest.fn(),
            delay: 500,
        });

        fireEvent.pointerDown(element, pointerInit());
        jest.advanceTimersByTime(500);

        // Chrome's touch-emulator fires `contextmenu` immediately after the
        // long-press window. The guard must call preventDefault on it.
        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        });
        element.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);

        cut.dispose();
        document.body.removeChild(element);
    });

    test('suppresses the synthesised click on the source after long-press', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const onClick = jest.fn();
        element.addEventListener('click', onClick);

        const cut = new LongPressDetector(element, {
            onLongPress: jest.fn(),
            delay: 500,
        });

        fireEvent.pointerDown(element, pointerInit());
        jest.advanceTimersByTime(500);

        // Touchend → click on the source. Must be suppressed so primary-
        // action click handlers (e.g. chip collapse-toggle, tab activate)
        // don't fire alongside the long-press menu.
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        });
        element.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(true);
        expect(onClick).not.toHaveBeenCalled();

        cut.dispose();
        document.body.removeChild(element);
    });

    test('click guard does not suppress clicks on unrelated elements', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        const other = document.createElement('div');
        document.body.appendChild(element);
        document.body.appendChild(other);

        const onOtherClick = jest.fn();
        other.addEventListener('click', onOtherClick);

        const cut = new LongPressDetector(element, {
            onLongPress: jest.fn(),
            delay: 500,
        });

        fireEvent.pointerDown(element, pointerInit());
        jest.advanceTimersByTime(500);

        // A click on a context menu item (separate subtree) must reach
        // its listener.
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        });
        other.dispatchEvent(click);
        expect(onOtherClick).toHaveBeenCalledTimes(1);

        cut.dispose();
        document.body.removeChild(element);
        document.body.removeChild(other);
    });

    test('suppresses the synthesised click when the source is inside a shadow root', () => {
        jest.useFakeTimers();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const element = document.createElement('div');
        host.attachShadow({ mode: 'open' }).appendChild(element);

        const onClick = jest.fn();
        element.addEventListener('click', onClick);

        const cut = new LongPressDetector(element, {
            onLongPress: jest.fn(),
            delay: 500,
        });

        fireEvent.pointerDown(element, pointerInit({ composed: true }));
        jest.advanceTimersByTime(500);

        // The window-level guard sees this click retargeted to the shadow
        // host; it must still recognise it as a click on the source.
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            composed: true,
        });
        element.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(true);
        expect(onClick).not.toHaveBeenCalled();

        cut.dispose();
        document.body.removeChild(host);
    });

    test('contextmenu guard self-disposes after the first event', () => {
        jest.useFakeTimers();
        const element = document.createElement('div');
        document.body.appendChild(element);

        const cut = new LongPressDetector(element, {
            onLongPress: jest.fn(),
            delay: 500,
        });

        fireEvent.pointerDown(element, pointerInit());
        jest.advanceTimersByTime(500);

        const first = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        });
        element.dispatchEvent(first);
        expect(first.defaultPrevented).toBe(true);

        // An unrelated, later right-click must not be suppressed.
        const second = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        });
        element.dispatchEvent(second);
        expect(second.defaultPrevented).toBe(false);

        cut.dispose();
        document.body.removeChild(element);
    });
});
