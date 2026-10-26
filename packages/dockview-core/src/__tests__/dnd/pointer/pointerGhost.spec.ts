import { PointerGhost } from '../../../dnd/pointer/pointerGhost';

describe('PointerGhost', () => {
    test('attaches the element to body with fixed positioning at the initial pointer', () => {
        const ghostEl = document.createElement('div');
        ghostEl.textContent = 'ghost';

        const ghost = new PointerGhost({
            element: ghostEl,
            initialX: 100,
            initialY: 50,
        });

        expect(ghostEl.parentElement).toBe(document.body);
        expect(ghostEl.style.position).toBe('fixed');
        expect(ghostEl.style.pointerEvents).toBe('none');
        // Position is animated via `transform` so the browser can composite
        // updates on the GPU without re-running layout per pointermove.
        expect(ghostEl.style.transform).toBe('translate3d(100px, 50px, 0)');

        ghost.dispose();
    });

    test('update() repositions to the new pointer location', () => {
        const ghostEl = document.createElement('div');
        const ghost = new PointerGhost({
            element: ghostEl,
            initialX: 0,
            initialY: 0,
        });

        ghost.update(200, 75);
        expect(ghostEl.style.transform).toBe('translate3d(200px, 75px, 0)');

        ghost.dispose();
    });

    test('honours the offset so the pointer sits inside the ghost', () => {
        const ghostEl = document.createElement('div');
        const ghost = new PointerGhost({
            element: ghostEl,
            initialX: 100,
            initialY: 100,
            offsetX: 30,
            offsetY: -10,
        });

        // The pointer at (100, 100) with a 30/-10 offset means the ghost's
        // top-left should be (70, 110): pointer is 30px in from left, 10px
        // below the top.
        expect(ghostEl.style.transform).toBe('translate3d(70px, 110px, 0)');

        ghost.update(150, 150);
        expect(ghostEl.style.transform).toBe('translate3d(120px, 160px, 0)');

        ghost.dispose();
    });

    test('attaches into the owner element’s document body when `owner` is provided', () => {
        // Build a detached document so the test doesn't rely on iframes.
        const otherDoc = document.implementation.createHTMLDocument('popout');
        const owner = otherDoc.createElement('div');
        otherDoc.body.appendChild(owner);

        const ghostEl = document.createElement('div');
        const ghost = new PointerGhost({
            element: ghostEl,
            initialX: 0,
            initialY: 0,
            owner,
        });

        // Ghost lands in the OTHER document, not the main one.
        expect(ghostEl.parentElement).toBe(otherDoc.body);
        expect(ghostEl.parentElement).not.toBe(document.body);

        ghost.dispose();
    });

    test('attaches into the owner’s shadow root when the owner lives in one', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const owner = document.createElement('div');
        shadowRoot.appendChild(owner);

        const ghostEl = document.createElement('div');
        const ghost = new PointerGhost({
            element: ghostEl,
            initialX: 0,
            initialY: 0,
            owner,
        });

        expect(ghostEl.parentNode).toBe(shadowRoot);

        ghost.dispose();
        host.remove();
    });

    test('lifts a shadow-root ghost into the top layer so host ancestors cannot offset or clip it', () => {
        // jsdom has no Popover API; browsers do.
        const showPopover = jest.fn();
        HTMLElement.prototype.showPopover = showPopover;
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const owner = document.createElement('div');
        shadowRoot.appendChild(owner);

        try {
            const ghostEl = document.createElement('div');
            const ghost = new PointerGhost({
                element: ghostEl,
                initialX: 10,
                initialY: 20,
                owner,
            });

            const wrapper = ghostEl.parentElement as HTMLElement;
            expect(wrapper.parentNode).toBe(shadowRoot);
            expect(wrapper.popover).toBe('manual');
            expect(showPopover).toHaveBeenCalledTimes(1);
            expect(wrapper.style.position).toBe('fixed');
            expect(wrapper.style.transform).toBe('translate3d(10px, 20px, 0)');
            // The ghost itself keeps its own styles.
            expect(ghostEl.style.position).toBe('');

            ghost.update(30, 40);
            expect(wrapper.style.transform).toBe('translate3d(30px, 40px, 0)');

            ghost.dispose();
            expect(ghostEl.isConnected).toBe(false);
            expect(wrapper.isConnected).toBe(false);
        } finally {
            delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
            host.remove();
        }
    });

    test('neutralises the clone\u2019s own pointer-events and transform when wrapped', () => {
        const showPopover = jest.fn();
        HTMLElement.prototype.showPopover = showPopover;
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const owner = document.createElement('div');
        shadowRoot.appendChild(owner);

        try {
            // Dockview's ghosts are clones with every computed property copied
            // inline, so the element's own declarations beat the wrapper's.
            const ghostEl = document.createElement('div');
            ghostEl.style.pointerEvents = 'auto';
            ghostEl.style.transform = 'translateX(40px)';

            const ghost = new PointerGhost({
                element: ghostEl,
                initialX: 10,
                initialY: 20,
                owner,
            });

            const wrapper = ghostEl.parentElement as HTMLElement;
            expect(wrapper.style.transform).toBe('translate3d(10px, 20px, 0)');
            // Otherwise the ghost is hit-testable and sits 40px off the pointer.
            expect(ghostEl.style.pointerEvents).toBe('none');
            expect(ghostEl.style.transform).toBe('none');

            ghost.dispose();
        } finally {
            delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
            host.remove();
        }
    });

    test('dispose() removes the element and is idempotent', () => {
        const ghostEl = document.createElement('div');
        const ghost = new PointerGhost({
            element: ghostEl,
            initialX: 0,
            initialY: 0,
        });

        expect(ghostEl.parentElement).toBe(document.body);

        ghost.dispose();
        expect(ghostEl.parentElement).toBeNull();

        // Second dispose must be a no-op (no throw).
        expect(() => ghost.dispose()).not.toThrow();
    });

    test('update() after dispose is a no-op', () => {
        const ghostEl = document.createElement('div');
        const ghost = new PointerGhost({
            element: ghostEl,
            initialX: 0,
            initialY: 0,
        });

        const initialTransform = ghostEl.style.transform;
        ghost.dispose();
        ghost.update(500, 500);
        // Transform must not change after dispose.
        expect(ghostEl.style.transform).toBe(initialTransform);
    });
});
