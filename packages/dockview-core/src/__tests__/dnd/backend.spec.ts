import { fireEvent } from '@testing-library/dom';
import { html5Backend } from '../../dnd/backend';

describe('Html5DragSource (html5Backend.createDragSource)', () => {
    const noopGetData = () => ({ dispose: () => undefined });

    test('adds dv-dragged class on dragstart, removes after timeout', () => {
        jest.useFakeTimers();

        const element = document.createElement('div');
        const source = html5Backend.createDragSource(element, {
            getData: noopGetData,
        });

        expect(element.classList.contains('dv-dragged')).toBeFalsy();

        fireEvent.dragStart(element);
        expect(element.classList.contains('dv-dragged')).toBeTruthy();

        jest.runAllTimers();
        expect(element.classList.contains('dv-dragged')).toBeFalsy();

        source.dispose();
    });

    test('iframes and webviews get pointer-events:none during an active drag', () => {
        jest.useFakeTimers();

        const element = document.createElement('div');
        const iframe = document.createElement('iframe');
        const webview = document.createElement('webview');
        const span = document.createElement('span');

        document.body.appendChild(element);
        document.body.appendChild(iframe);
        document.body.appendChild(webview);
        document.body.appendChild(span);

        const source = html5Backend.createDragSource(element, {
            getData: noopGetData,
        });

        expect(iframe.style.pointerEvents).toBeFalsy();
        expect(webview.style.pointerEvents).toBeFalsy();
        expect(span.style.pointerEvents).toBeFalsy();

        fireEvent.dragStart(element);
        expect(iframe.style.pointerEvents).toBe('none');
        expect(webview.style.pointerEvents).toBe('none');
        expect(span.style.pointerEvents).toBeFalsy();

        fireEvent.dragEnd(element);
        expect(iframe.style.pointerEvents).toBe('');
        expect(webview.style.pointerEvents).toBe('');
        expect(span.style.pointerEvents).toBeFalsy();

        source.dispose();
    });

    test('iframe pointer-events are restored on premature source disposal', () => {
        jest.useFakeTimers();

        const element = document.createElement('div');
        const iframe = document.createElement('iframe');
        document.body.appendChild(element);
        document.body.appendChild(iframe);

        const source = html5Backend.createDragSource(element, {
            getData: noopGetData,
        });

        fireEvent.dragStart(element);
        expect(iframe.style.pointerEvents).toBe('none');

        source.dispose();
        expect(iframe.style.pointerEvents).toBe('');
    });

    test('preventDefault is called when isCancelled returns true', () => {
        const element = document.createElement('div');
        const source = html5Backend.createDragSource(element, {
            getData: noopGetData,
            isCancelled: () => true,
        });

        const event = new Event('dragstart');
        const spy = jest.spyOn(event, 'preventDefault');
        fireEvent(element, event);
        expect(spy).toHaveBeenCalledTimes(1);

        source.dispose();
    });

    test('preventDefault is not called when isCancelled returns false', () => {
        const element = document.createElement('div');
        const source = html5Backend.createDragSource(element, {
            getData: noopGetData,
            isCancelled: () => false,
        });

        const event = new Event('dragstart');
        const spy = jest.spyOn(event, 'preventDefault');
        fireEvent(element, event);
        expect(spy).toHaveBeenCalledTimes(0);

        source.dispose();
    });

    test('initial `disabled: true` cancels dragstart via preventDefault', () => {
        const element = document.createElement('div');
        const source = html5Backend.createDragSource(element, {
            getData: noopGetData,
            disabled: true,
        });

        const event = new Event('dragstart');
        const spy = jest.spyOn(event, 'preventDefault');
        fireEvent(element, event);
        expect(spy).toHaveBeenCalledTimes(1);

        source.dispose();
    });

    test('initial `disabled: false` lets dragstart through', () => {
        const element = document.createElement('div');
        const source = html5Backend.createDragSource(element, {
            getData: noopGetData,
            disabled: false,
        });

        const event = new Event('dragstart');
        const spy = jest.spyOn(event, 'preventDefault');
        fireEvent(element, event);
        expect(spy).toHaveBeenCalledTimes(0);

        source.dispose();
    });

    test('setDisabled toggles cancellation', () => {
        const element = document.createElement('div');
        const source = html5Backend.createDragSource(element, {
            getData: noopGetData,
        });

        let event = new Event('dragstart');
        let spy = jest.spyOn(event, 'preventDefault');
        fireEvent(element, event);
        expect(spy).toHaveBeenCalledTimes(0);

        source.setDisabled(true);
        event = new Event('dragstart');
        spy = jest.spyOn(event, 'preventDefault');
        fireEvent(element, event);
        expect(spy).toHaveBeenCalledTimes(1);

        source.setDisabled(false);
        event = new Event('dragstart');
        spy = jest.spyOn(event, 'preventDefault');
        fireEvent(element, event);
        expect(spy).toHaveBeenCalledTimes(0);

        source.dispose();
    });

    test('onDragStart callback is not fired when disabled', () => {
        const element = document.createElement('div');
        const onDragStart = jest.fn();
        const source = html5Backend.createDragSource(element, {
            getData: noopGetData,
            disabled: true,
            onDragStart,
        });

        fireEvent.dragStart(element);
        expect(onDragStart).toHaveBeenCalledTimes(0);

        source.dispose();
    });

    test('setTouchOnly / cancelPending are no-ops on the HTML5 backend', () => {
        const element = document.createElement('div');
        const source = html5Backend.createDragSource(element, {
            getData: noopGetData,
        });

        expect(() => source.setTouchOnly(true)).not.toThrow();
        expect(() => source.setTouchOnly(false)).not.toThrow();
        expect(() => source.cancelPending()).not.toThrow();

        source.dispose();
    });
});
