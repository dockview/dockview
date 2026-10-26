import { addGhostImage } from '../../dnd/ghost';

describe('ghost', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllTimers();
    });

    test('that a custom class is added, the element is added to the document and all is removed afterwards', () => {
        const dataTransferMock = jest.fn<Partial<DataTransfer>, []>(() => {
            return {
                setDragImage: jest.fn(),
            };
        });

        const element = document.createElement('div');
        const dataTransfer = <DataTransfer>new dataTransferMock();

        addGhostImage(dataTransfer, element);

        expect(element.className).toBe('dv-dragged');
        expect(element.parentElement).toBe(document.body);
        expect(dataTransfer.setDragImage).toHaveBeenCalledTimes(1);
        expect(dataTransfer.setDragImage).toHaveBeenCalledWith(element, 0, 0);

        jest.runAllTimers();

        expect(element.className).toBe('');
        expect(element.parentElement).toBeNull();
    });

    test('that the ghost is appended to the provided owner document', () => {
        const dataTransferMock = jest.fn<Partial<DataTransfer>, []>(() => {
            return {
                setDragImage: jest.fn(),
            };
        });

        // a distinct document, standing in for a popout window
        const popoutDocument =
            document.implementation.createHTMLDocument('popout');

        const element = document.createElement('div');
        const dataTransfer = <DataTransfer>new dataTransferMock();

        addGhostImage(dataTransfer, element, {
            ownerDocument: popoutDocument,
        });

        // must be appended to the popout document, not the main one, or the
        // browser ignores the cross-document setDragImage element
        expect(element.parentElement).toBe(popoutDocument.body);
        expect(document.body.contains(element)).toBe(false);
        expect(dataTransfer.setDragImage).toHaveBeenCalledWith(element, 0, 0);

        jest.runAllTimers();

        expect(element.parentElement).toBeNull();
    });

    test('that the ghost is appended to the owner’s shadow root when it lives in one', () => {
        const dataTransfer = <DataTransfer>(<unknown>{
            setDragImage: jest.fn(),
        });

        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const owner = document.createElement('div');
        shadowRoot.appendChild(owner);

        const element = document.createElement('div');
        addGhostImage(dataTransfer, element, {
            ownerDocument: owner.ownerDocument,
            owner,
        });

        expect(element.parentNode).toBe(shadowRoot);

        jest.runAllTimers();
        expect(element.parentNode).toBeNull();
        host.remove();
    });
    test('positions the ghost out of flow so it cannot shift the dock', () => {
        const dataTransfer = <DataTransfer>(<unknown>{
            setDragImage: jest.fn(),
        });

        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const owner = document.createElement('div');
        shadowRoot.appendChild(owner);

        // Appended inside the dock's own subtree, an in-flow ghost would take
        // up space for the frame before the timeout removes it; `top` only
        // bites once it is positioned.
        const element = document.createElement('div');
        addGhostImage(dataTransfer, element, {
            ownerDocument: owner.ownerDocument,
            owner,
        });

        expect(element.style.position).toBe('absolute');
        expect(element.style.top).toBe('-9999px');

        jest.runAllTimers();
        host.remove();
    });
});
