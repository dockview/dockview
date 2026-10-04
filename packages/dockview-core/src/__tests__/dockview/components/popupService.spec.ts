import { PopupService } from '../../../dockview/components/popupService';

describe('PopupService', () => {
    let root: HTMLElement;
    let service: PopupService;

    beforeEach(() => {
        root = document.createElement('div');
        document.body.appendChild(root);
        service = new PopupService(root);
    });

    afterEach(() => {
        service.dispose();
        root.remove();
    });

    describe('constructor', () => {
        test('prepends anchor element to root', () => {
            const anchor = root.querySelector('.dv-popover-anchor');
            expect(anchor).not.toBeNull();
            expect(root.firstChild).toBe(anchor);
        });

        test('anchor has position: relative', () => {
            const anchor = root.querySelector(
                '.dv-popover-anchor'
            ) as HTMLElement;
            expect(anchor.style.position).toBe('relative');
        });
    });

    describe('onClose', () => {
        test('runs once when the popover closes', () => {
            const onClose = jest.fn();
            service.openPopover(
                document.createElement('div'),
                { x: 0, y: 0 },
                { onClose }
            );

            service.close();
            service.close();

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        test('runs for the replaced popover only', () => {
            const first = jest.fn();
            const second = jest.fn();
            service.openPopover(
                document.createElement('div'),
                { x: 0, y: 0 },
                { onClose: first }
            );
            service.openPopover(
                document.createElement('div'),
                { x: 0, y: 0 },
                { onClose: second }
            );

            expect(first).toHaveBeenCalledTimes(1);
            expect(second).not.toHaveBeenCalled();
        });

        test('runs when the service is disposed', () => {
            const onClose = jest.fn();
            service.openPopover(
                document.createElement('div'),
                { x: 0, y: 0 },
                { onClose }
            );

            service.dispose();

            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('openPopover', () => {
        test('appends wrapper containing the element into the anchor', () => {
            const el = document.createElement('div');
            el.className = 'my-popup';

            service.openPopover(el, { x: 0, y: 0 });

            const anchor = root.querySelector('.dv-popover-anchor')!;
            expect(anchor.querySelector('.my-popup')).not.toBeNull();
        });

        test('wrapper is position: absolute', () => {
            const el = document.createElement('div');
            service.openPopover(el, { x: 0, y: 0 });

            const anchor = root.querySelector('.dv-popover-anchor')!;
            const wrapper = anchor.firstChild as HTMLElement;
            expect(wrapper.style.position).toBe('absolute');
        });

        test('applies default zIndex when none provided', () => {
            const el = document.createElement('div');
            service.openPopover(el, { x: 0, y: 0 });

            const anchor = root.querySelector('.dv-popover-anchor')!;
            const wrapper = anchor.firstChild as HTMLElement;
            expect(wrapper.style.zIndex).toBe('var(--dv-overlay-z-index)');
        });

        test('applies custom zIndex when provided', () => {
            const el = document.createElement('div');
            service.openPopover(el, { x: 0, y: 0, zIndex: '999' });

            const anchor = root.querySelector('.dv-popover-anchor')!;
            const wrapper = anchor.firstChild as HTMLElement;
            expect(wrapper.style.zIndex).toBe('999');
        });

        test('positions wrapper relative to anchor bounding rect', () => {
            const anchor = root.querySelector(
                '.dv-popover-anchor'
            ) as HTMLElement;
            jest.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
                left: 100,
                top: 50,
                right: 100,
                bottom: 50,
                width: 0,
                height: 0,
                x: 100,
                y: 50,
                toJSON: () => {},
            });

            const el = document.createElement('div');
            service.openPopover(el, { x: 250, y: 180 });

            const wrapper = anchor.firstChild as HTMLElement;
            expect(wrapper.style.left).toBe('150px'); // 250 - 100
            expect(wrapper.style.top).toBe('130px'); // 180 - 50
        });

        test('opening a second popover closes the first', () => {
            const el1 = document.createElement('div');
            el1.className = 'popup-1';
            const el2 = document.createElement('div');
            el2.className = 'popup-2';

            service.openPopover(el1, { x: 0, y: 0 });
            service.openPopover(el2, { x: 0, y: 0 });

            const anchor = root.querySelector('.dv-popover-anchor')!;
            expect(anchor.querySelector('.popup-1')).toBeNull();
            expect(anchor.querySelector('.popup-2')).not.toBeNull();
        });
    });

    describe('close', () => {
        test('removes the active wrapper from the DOM', () => {
            const el = document.createElement('div');
            el.className = 'my-popup';
            service.openPopover(el, { x: 0, y: 0 });

            service.close();

            const anchor = root.querySelector('.dv-popover-anchor')!;
            expect(anchor.querySelector('.my-popup')).toBeNull();
        });

        test('is a no-op when nothing is open', () => {
            expect(() => service.close()).not.toThrow();
        });
    });

    describe('pointerdown outside popover', () => {
        test('closes the popover (after the open grace window)', () => {
            // Touch long-press callers fire pointerdown events tied to the
            // gesture that opened the popover. PopupService suppresses
            // outside-dismissal for a short grace window, so advance past it.
            const nowSpy = jest.spyOn(Date, 'now');
            nowSpy.mockReturnValue(0);

            const el = document.createElement('div');
            el.className = 'my-popup';
            service.openPopover(el, { x: 0, y: 0 });

            nowSpy.mockReturnValue(300);

            const outside = document.createElement('div');
            document.body.appendChild(outside);
            outside.dispatchEvent(
                new MouseEvent('pointerdown', { bubbles: true })
            );
            outside.remove();

            const anchor = root.querySelector('.dv-popover-anchor')!;
            expect(anchor.querySelector('.my-popup')).toBeNull();

            nowSpy.mockRestore();
        });

        test('ignores outside pointerdown within the open grace window', () => {
            const nowSpy = jest.spyOn(Date, 'now');
            nowSpy.mockReturnValue(0);

            const el = document.createElement('div');
            el.className = 'my-popup';
            service.openPopover(el, { x: 0, y: 0 });

            // Within the grace window, so it must not dismiss.
            nowSpy.mockReturnValue(50);

            const outside = document.createElement('div');
            document.body.appendChild(outside);
            outside.dispatchEvent(
                new MouseEvent('pointerdown', { bubbles: true })
            );
            outside.remove();

            const anchor = root.querySelector('.dv-popover-anchor')!;
            expect(anchor.querySelector('.my-popup')).not.toBeNull();

            nowSpy.mockRestore();
        });

        test('does not close when clicking inside the popover', () => {
            const nowSpy = jest.spyOn(Date, 'now');
            nowSpy.mockReturnValue(0);

            const el = document.createElement('div');
            el.className = 'my-popup';
            service.openPopover(el, { x: 0, y: 0 });

            nowSpy.mockReturnValue(300);

            el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

            const anchor = root.querySelector('.dv-popover-anchor')!;
            expect(anchor.querySelector('.my-popup')).not.toBeNull();

            nowSpy.mockRestore();
        });
    });

    describe('keyboard', () => {
        test('Escape closes the popover', () => {
            const el = document.createElement('div');
            el.className = 'my-popup';
            service.openPopover(el, { x: 0, y: 0 });

            window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
            );

            const anchor = root.querySelector('.dv-popover-anchor')!;
            expect(anchor.querySelector('.my-popup')).toBeNull();
        });

        test('Enter closes the popover', () => {
            const el = document.createElement('div');
            el.className = 'my-popup';
            service.openPopover(el, { x: 0, y: 0 });

            window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
            );

            const anchor = root.querySelector('.dv-popover-anchor')!;
            expect(anchor.querySelector('.my-popup')).toBeNull();
        });

        test('other keys do not close the popover', () => {
            const el = document.createElement('div');
            el.className = 'my-popup';
            service.openPopover(el, { x: 0, y: 0 });

            window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'a', bubbles: true })
            );

            const anchor = root.querySelector('.dv-popover-anchor')!;
            expect(anchor.querySelector('.my-popup')).not.toBeNull();
        });
    });

    describe('window resize', () => {
        test('closes the popover', () => {
            const el = document.createElement('div');
            el.className = 'my-popup';
            service.openPopover(el, { x: 0, y: 0 });

            window.dispatchEvent(new Event('resize'));

            const anchor = root.querySelector('.dv-popover-anchor')!;
            expect(anchor.querySelector('.my-popup')).toBeNull();
        });

        test('ignores resize on coarse-primary input (mobile keyboard)', () => {
            const originalMatchMedia = window.matchMedia;
            // Simulate a touch-primary device (e.g. phone): only `coarse`
            // pointer, no `fine` pointer. The on-screen keyboard fires
            // resize when it appears; the popover must not close.
            window.matchMedia = ((query: string) => ({
                matches: query === '(pointer: coarse)' ? true : false,
                media: query,
                addListener: () => undefined,
                removeListener: () => undefined,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
                dispatchEvent: () => false,
                onchange: null,
            })) as typeof window.matchMedia;

            try {
                const altService = new PopupService(root);
                const el = document.createElement('div');
                el.className = 'mobile-popup';
                altService.openPopover(el, { x: 0, y: 0 });

                window.dispatchEvent(new Event('resize'));

                expect(root.querySelector('.mobile-popup')).not.toBeNull();
                altService.dispose();
            } finally {
                window.matchMedia = originalMatchMedia;
            }
        });
    });

    describe('updateRoot', () => {
        test('moves anchor element into new root', () => {
            const newRoot = document.createElement('div');
            document.body.appendChild(newRoot);

            service.updateRoot(newRoot);

            expect(root.querySelector('.dv-popover-anchor')).toBeNull();
            expect(newRoot.querySelector('.dv-popover-anchor')).not.toBeNull();

            newRoot.remove();
        });

        test('new root is prepended with the anchor', () => {
            const newRoot = document.createElement('div');
            const existingChild = document.createElement('span');
            newRoot.appendChild(existingChild);
            document.body.appendChild(newRoot);

            service.updateRoot(newRoot);

            expect(newRoot.firstChild).toBe(
                newRoot.querySelector('.dv-popover-anchor')
            );

            newRoot.remove();
        });

        test('openPopover positions relative to new anchor location after updateRoot', () => {
            const newRoot = document.createElement('div');
            document.body.appendChild(newRoot);
            service.updateRoot(newRoot);

            const anchor = newRoot.querySelector(
                '.dv-popover-anchor'
            ) as HTMLElement;
            jest.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
                left: 300,
                top: 0,
                right: 300,
                bottom: 0,
                width: 0,
                height: 0,
                x: 300,
                y: 0,
                toJSON: () => {},
            });

            const el = document.createElement('div');
            service.openPopover(el, { x: 350, y: 20 });

            const wrapper = anchor.firstChild as HTMLElement;
            expect(wrapper.style.left).toBe('50px'); // 350 - 300
            expect(wrapper.style.top).toBe('20px'); // 20 - 0

            newRoot.remove();
        });
    });

    describe('dispose', () => {
        test('closes any active popover', () => {
            const el = document.createElement('div');
            el.className = 'my-popup';
            service.openPopover(el, { x: 0, y: 0 });

            service.dispose();

            const anchor = root.querySelector('.dv-popover-anchor')!;
            expect(anchor.querySelector('.my-popup')).toBeNull();
        });
    });

    describe('alternate window', () => {
        // Popout groups host their popovers in a different window. The service
        // must use that window's document for created elements and that
        // window for resize/pointerdown/keydown listeners; otherwise popovers
        // opened in a popout group render in the main window.
        test('uses the provided window for outside-pointerdown dismissal', () => {
            const altRoot = document.createElement('div');
            document.body.appendChild(altRoot);

            const altListeners: Record<string, Array<(e: any) => void>> = {};
            const altWindow = {
                document,
                requestAnimationFrame: (cb: FrameRequestCallback) =>
                    window.requestAnimationFrame(cb),
                addEventListener: (type: string, cb: (e: any) => void) => {
                    (altListeners[type] = altListeners[type] || []).push(cb);
                },
                removeEventListener: (type: string, cb: (e: any) => void) => {
                    altListeners[type] = (altListeners[type] || []).filter(
                        (l) => l !== cb
                    );
                },
            } as unknown as Window;

            const altService = new PopupService(altRoot, altWindow);
            const nowSpy = jest.spyOn(Date, 'now');
            nowSpy.mockReturnValue(0);
            try {
                const el = document.createElement('div');
                el.className = 'alt-popup';
                altService.openPopover(el, { x: 0, y: 0 });

                expect(altRoot.querySelector('.alt-popup')).not.toBeNull();
                expect(altListeners['pointerdown']?.length).toBe(1);
                expect(altListeners['keydown']?.length).toBe(1);
                expect(altListeners['resize']?.length).toBe(1);

                // Advance past the open grace window so outside-pointerdown
                // actually dismisses the popover.
                nowSpy.mockReturnValue(300);

                // pointerdown outside on the alternate window should close
                const outside = document.createElement('div');
                document.body.appendChild(outside);
                altListeners['pointerdown'][0]({ target: outside });
                expect(altRoot.querySelector('.alt-popup')).toBeNull();
                outside.remove();
            } finally {
                nowSpy.mockRestore();
                altService.dispose();
                altRoot.remove();
            }
        });
    });
});
