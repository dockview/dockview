import { fireEvent } from '@testing-library/dom';
import { PopupService } from '../../dockview/components/popupService';

function makeService(): { service: PopupService; root: HTMLElement } {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const service = new PopupService(root);
    return { service, root };
}

function openMenu(service: PopupService): HTMLElement {
    const el = document.createElement('div');
    el.textContent = 'menu';
    service.openPopover(el, { x: 0, y: 0 });
    return el;
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('PopupService', () => {
    test('openPopover appends the element into the anchor', () => {
        const { service, root } = makeService();
        const el = openMenu(service);

        expect(root.contains(el)).toBe(true);
    });

    test('close() removes the element', () => {
        const { service, root } = makeService();
        const el = openMenu(service);

        service.close();

        expect(root.contains(el)).toBe(false);
    });

    test('Escape key closes the popup', () => {
        const { service, root } = makeService();
        const el = openMenu(service);

        expect(root.contains(el)).toBe(true);

        fireEvent.keyDown(window, { key: 'Escape' });

        expect(root.contains(el)).toBe(false);
    });

    test('Enter key closes the popup', () => {
        const { service, root } = makeService();
        const el = openMenu(service);

        expect(root.contains(el)).toBe(true);

        fireEvent.keyDown(window, { key: 'Enter' });

        expect(root.contains(el)).toBe(false);
    });

    test('other keys do not close the popup', () => {
        const { service, root } = makeService();
        const el = openMenu(service);

        fireEvent.keyDown(window, { key: 'ArrowDown' });

        expect(root.contains(el)).toBe(true);
    });

    test('resize closes the popup', () => {
        const { service, root } = makeService();
        const el = openMenu(service);

        fireEvent(window, new Event('resize'));

        expect(root.contains(el)).toBe(false);
    });

    test('pointerdown outside the popup closes it (after grace window)', () => {
        const nowSpy = jest.spyOn(Date, 'now');
        nowSpy.mockReturnValue(0);

        const { service, root } = makeService();
        const el = openMenu(service);
        const outside = document.createElement('div');
        document.body.appendChild(outside);

        // PopupService swallows outside-pointerdown for a brief grace window
        // after opening (touch long-press protection), so advance past it.
        nowSpy.mockReturnValue(300);

        fireEvent.pointerDown(outside);

        expect(root.contains(el)).toBe(false);

        nowSpy.mockRestore();
    });

    test('pointerdown inside the popup does not close it', () => {
        const { service, root } = makeService();
        const el = openMenu(service);

        fireEvent.pointerDown(el);

        expect(root.contains(el)).toBe(true);
    });

    test('opening a second popover closes the first', () => {
        const { service, root } = makeService();
        const el1 = openMenu(service);
        const el2 = openMenu(service);

        expect(root.contains(el1)).toBe(false);
        expect(root.contains(el2)).toBe(true);
    });

    test('Escape key listener is cleaned up after close', () => {
        const { service, root } = makeService();
        openMenu(service);
        service.close();

        // Open a second menu and close via Escape; only one close should fire
        const el2 = openMenu(service);
        fireEvent.keyDown(window, { key: 'Escape' });

        expect(root.contains(el2)).toBe(false);

        expect(() =>
            fireEvent.keyDown(window, { key: 'Escape' })
        ).not.toThrow();
    });
});
