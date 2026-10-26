import { Overlay } from '../../overlay/overlay';
import { mockGetBoundingClientRect } from '../__test_utils__/utils';

describe('overlay', () => {
    test('toJSON, top left', () => {
        const container = document.createElement('div');
        const content = document.createElement('div');

        document.body.appendChild(container);
        container.appendChild(content);

        const cut = new Overlay({
            height: 200,
            width: 100,
            left: 10,
            top: 20,
            minimumInViewportWidth: 0,
            minimumInViewportHeight: 0,
            container,
            content,
        });

        jest.spyOn(
            container.childNodes.item(0) as HTMLElement,
            'getBoundingClientRect'
        ).mockImplementation(() => {
            return mockGetBoundingClientRect({
                left: 80,
                top: 100,
                width: 40,
                height: 50,
            });
        });
        jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
            () => {
                return mockGetBoundingClientRect({
                    left: 20,
                    top: 30,
                    width: 100,
                    height: 100,
                });
            }
        );

        cut.setBounds();

        expect(cut.toJSON()).toEqual({
            top: 70,
            left: 60,
            width: 40,
            height: 50,
        });

        cut.dispose();
    });

    test('toJSON, bottom right', () => {
        const container = document.createElement('div');
        const content = document.createElement('div');

        document.body.appendChild(container);
        container.appendChild(content);

        const cut = new Overlay({
            height: 200,
            width: 100,
            right: 10,
            bottom: 20,
            minimumInViewportWidth: 0,
            minimumInViewportHeight: 0,
            container,
            content,
        });

        jest.spyOn(
            container.childNodes.item(0) as HTMLElement,
            'getBoundingClientRect'
        ).mockImplementation(() => {
            return mockGetBoundingClientRect({
                left: 80,
                top: 100,
                width: 40,
                height: 50,
            });
        });
        jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
            () => {
                return mockGetBoundingClientRect({
                    left: 20,
                    top: 30,
                    width: 100,
                    height: 100,
                });
            }
        );

        cut.setBounds();

        expect(cut.toJSON()).toEqual({
            bottom: -20,
            right: 0,
            width: 40,
            height: 50,
        });

        cut.dispose();
    });

    test('that out-of-bounds dimensions are fixed, top left', () => {
        const container = document.createElement('div');
        const content = document.createElement('div');

        document.body.appendChild(container);
        container.appendChild(content);

        const cut = new Overlay({
            height: 200,
            width: 100,
            left: -1000,
            top: -1000,
            minimumInViewportWidth: 0,
            minimumInViewportHeight: 0,
            container,
            content,
        });

        jest.spyOn(
            container.childNodes.item(0) as HTMLElement,
            'getBoundingClientRect'
        ).mockImplementation(() => {
            return mockGetBoundingClientRect({
                left: 80,
                top: 100,
                width: 40,
                height: 50,
            });
        });
        jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
            () => {
                return mockGetBoundingClientRect({
                    left: 20,
                    top: 30,
                    width: 100,
                    height: 100,
                });
            }
        );

        cut.setBounds();

        expect(cut.toJSON()).toEqual({
            top: 70,
            left: 60,
            width: 40,
            height: 50,
        });

        cut.dispose();
    });

    test('that out-of-bounds dimensions are fixed, bottom right', () => {
        const container = document.createElement('div');
        const content = document.createElement('div');

        document.body.appendChild(container);
        container.appendChild(content);

        const cut = new Overlay({
            height: 200,
            width: 100,
            bottom: -1000,
            right: -1000,
            minimumInViewportWidth: 0,
            minimumInViewportHeight: 0,
            container,
            content,
        });

        jest.spyOn(
            container.childNodes.item(0) as HTMLElement,
            'getBoundingClientRect'
        ).mockImplementation(() => {
            return mockGetBoundingClientRect({
                left: 80,
                top: 100,
                width: 40,
                height: 50,
            });
        });
        jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
            () => {
                return mockGetBoundingClientRect({
                    left: 20,
                    top: 30,
                    width: 100,
                    height: 100,
                });
            }
        );

        cut.setBounds();

        expect(cut.toJSON()).toEqual({
            bottom: -20,
            right: 0,
            width: 40,
            height: 50,
        });

        cut.dispose();
    });

    test('setBounds, top left', () => {
        const container = document.createElement('div');
        const content = document.createElement('div');

        document.body.appendChild(container);
        container.appendChild(content);

        const cut = new Overlay({
            height: 1000,
            width: 1000,
            left: 0,
            top: 0,
            minimumInViewportWidth: 0,
            minimumInViewportHeight: 0,
            container,
            content,
        });

        const element: HTMLElement = container.querySelector(
            '.dv-resize-container'
        )!;
        expect(element).toBeTruthy();

        jest.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
            return mockGetBoundingClientRect({
                left: 300,
                top: 400,
                width: 200,
                height: 100,
            });
        });
        jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
            () => {
                return mockGetBoundingClientRect({
                    left: 0,
                    top: 0,
                    width: 1000,
                    height: 1000,
                });
            }
        );

        cut.setBounds({ height: 100, width: 200, left: 300, top: 400 });

        expect(element.style.height).toBe('100px');
        expect(element.style.width).toBe('200px');
        expect(element.style.left).toBe('300px');
        expect(element.style.top).toBe('400px');

        cut.dispose();
    });

    test('setBounds, bottom right', () => {
        const container = document.createElement('div');
        const content = document.createElement('div');

        document.body.appendChild(container);
        container.appendChild(content);

        const cut = new Overlay({
            height: 1000,
            width: 1000,
            right: 0,
            bottom: 0,
            minimumInViewportWidth: 0,
            minimumInViewportHeight: 0,
            container,
            content,
        });

        const element: HTMLElement = container.querySelector(
            '.dv-resize-container'
        )!;
        expect(element).toBeTruthy();

        jest.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
            return mockGetBoundingClientRect({
                left: 500,
                top: 500,
                width: 200,
                height: 100,
            });
        });
        jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
            () => {
                return mockGetBoundingClientRect({
                    left: 0,
                    top: 0,
                    width: 1000,
                    height: 1000,
                });
            }
        );

        cut.setBounds({ height: 100, width: 200, right: 300, bottom: 400 });

        expect(element.style.height).toBe('100px');
        expect(element.style.width).toBe('200px');
        expect(element.style.right).toBe('300px');
        expect(element.style.bottom).toBe('400px');

        cut.dispose();
    });

    test('that the resize handles are added', () => {
        const container = document.createElement('div');
        const content = document.createElement('div');

        const cut = new Overlay({
            height: 500,
            width: 500,
            left: 100,
            top: 200,
            minimumInViewportWidth: 0,
            minimumInViewportHeight: 0,
            container,
            content,
        });

        expect(container.querySelector('.dv-resize-handle-top')).toBeTruthy();
        expect(
            container.querySelector('.dv-resize-handle-bottom')
        ).toBeTruthy();
        expect(container.querySelector('.dv-resize-handle-left')).toBeTruthy();
        expect(container.querySelector('.dv-resize-handle-right')).toBeTruthy();
        expect(
            container.querySelector('.dv-resize-handle-topleft')
        ).toBeTruthy();
        expect(
            container.querySelector('.dv-resize-handle-topright')
        ).toBeTruthy();
        expect(
            container.querySelector('.dv-resize-handle-bottomleft')
        ).toBeTruthy();
        expect(
            container.querySelector('.dv-resize-handle-bottomright')
        ).toBeTruthy();

        cut.dispose();
    });

    test('aria-level attributes and corresponding z-index', () => {
        const container = document.createElement('div');
        const content = document.createElement('div');

        const createOverlay = () =>
            new Overlay({
                height: 500,
                width: 500,
                left: 100,
                top: 200,
                minimumInViewportWidth: 0,
                minimumInViewportHeight: 0,
                container,
                content,
            });

        const overlay1 = createOverlay();

        const zIndexValue = (delta: number) =>
            `calc(var(--dv-overlay-z-index, 999) + ${delta})`;

        expect(overlay1.element.getAttribute('aria-level')).toBe('0');
        expect(overlay1.element.style.zIndex).toBe(zIndexValue(0));

        const overlay2 = createOverlay();
        const overlay3 = createOverlay();

        expect(overlay1.element.getAttribute('aria-level')).toBe('0');
        expect(overlay2.element.getAttribute('aria-level')).toBe('1');
        expect(overlay3.element.getAttribute('aria-level')).toBe('2');
        expect(overlay1.element.style.zIndex).toBe(zIndexValue(0));
        expect(overlay2.element.style.zIndex).toBe(zIndexValue(2));
        expect(overlay3.element.style.zIndex).toBe(zIndexValue(4));

        overlay2.bringToFront();

        expect(overlay1.element.getAttribute('aria-level')).toBe('0');
        expect(overlay2.element.getAttribute('aria-level')).toBe('2');
        expect(overlay3.element.getAttribute('aria-level')).toBe('1');
        expect(overlay1.element.style.zIndex).toBe(zIndexValue(0));
        expect(overlay2.element.style.zIndex).toBe(zIndexValue(4));
        expect(overlay3.element.style.zIndex).toBe(zIndexValue(2));

        overlay1.bringToFront();

        expect(overlay1.element.getAttribute('aria-level')).toBe('2');
        expect(overlay2.element.getAttribute('aria-level')).toBe('1');
        expect(overlay3.element.getAttribute('aria-level')).toBe('0');
        expect(overlay1.element.style.zIndex).toBe(zIndexValue(4));
        expect(overlay2.element.style.zIndex).toBe(zIndexValue(2));
        expect(overlay3.element.style.zIndex).toBe(zIndexValue(0));

        overlay2.dispose();

        expect(overlay1.element.getAttribute('aria-level')).toBe('1');
        expect(overlay3.element.getAttribute('aria-level')).toBe('0');
        expect(overlay1.element.style.zIndex).toBe(zIndexValue(2));
        expect(overlay3.element.style.zIndex).toBe(zIndexValue(0));

        overlay1.dispose();

        expect(overlay3.element.getAttribute('aria-level')).toBe('0');
        expect(overlay3.element.style.zIndex).toBe(zIndexValue(0));
    });

    describe('resize edge cases (PR #1028)', () => {
        test('resizing from left after extending beyond right edge should not snap to full width', () => {
            const container = document.createElement('div');
            const content = document.createElement('div');

            document.body.appendChild(container);
            container.appendChild(content);

            const overlay = new Overlay({
                height: 100,
                width: 200,
                left: 50,
                top: 50,
                minimumInViewportWidth: 50,
                minimumInViewportHeight: 50,
                container,
                content,
            });

            const element = overlay.element;

            jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 0,
                        width: 400,
                        height: 400,
                    })
            );

            // Mock overlay bounds extending beyond right edge
            jest.spyOn(element, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 350,
                        top: 50,
                        width: 200,
                        height: 100,
                    })
            );

            const leftHandle = container.querySelector(
                '.dv-resize-handle-left'
            ) as HTMLElement;
            expect(leftHandle).toBeTruthy();

            const pointerDownEvent = new MouseEvent('pointerdown', {
                clientX: 350, // Start position at left edge of overlay
                clientY: 100,
                bubbles: true,
            }) as any;
            pointerDownEvent.pointerId = 1;
            leftHandle.dispatchEvent(pointerDownEvent);

            // Simulate dragging left handle inward (should resize width, not snap to container width)
            const pointerMoveEvent = new MouseEvent('pointermove', {
                clientX: 300, // Drag 50px to the right
                clientY: 100,
                bubbles: true,
            }) as any;
            pointerMoveEvent.pointerId = 1;
            window.dispatchEvent(pointerMoveEvent);

            // Check that overlay didn't snap to full container width (400px)
            const bounds = overlay.toJSON();
            expect(bounds.width).toBeLessThan(400);
            // left position must be constrained to >= 0 (not negative)
            expect('left' in bounds ? bounds.left : 0).toBeGreaterThanOrEqual(
                0
            );

            overlay.dispose();
        });

        test('resizing from top after extending beyond bottom edge should not snap to full height', () => {
            const container = document.createElement('div');
            const content = document.createElement('div');

            document.body.appendChild(container);
            container.appendChild(content);

            const overlay = new Overlay({
                height: 200,
                width: 100,
                left: 50,
                top: 50,
                minimumInViewportWidth: 50,
                minimumInViewportHeight: 50,
                container,
                content,
            });

            const element = overlay.element;

            jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 0,
                        width: 400,
                        height: 400,
                    })
            );

            // Mock overlay bounds extending beyond bottom edge
            jest.spyOn(element, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 50,
                        top: 350,
                        width: 100,
                        height: 200,
                    })
            );

            const topHandle = container.querySelector(
                '.dv-resize-handle-top'
            ) as HTMLElement;
            expect(topHandle).toBeTruthy();

            const pointerDownEvent = new MouseEvent('pointerdown', {
                clientX: 100,
                clientY: 350, // Start position at top edge of overlay
                bubbles: true,
            }) as any;
            pointerDownEvent.pointerId = 1;
            topHandle.dispatchEvent(pointerDownEvent);

            // Simulate dragging top handle downward (should resize height, not snap to container height)
            const pointerMoveEvent = new MouseEvent('pointermove', {
                clientX: 100,
                clientY: 300, // Drag 50px down
                bubbles: true,
            }) as any;
            pointerMoveEvent.pointerId = 1;
            window.dispatchEvent(pointerMoveEvent);

            // Check that overlay didn't snap to full container height (400px)
            const bounds = overlay.toJSON();
            expect(bounds.height).toBeLessThan(400);
            // top position must be constrained to >= 0 (not negative)
            expect('top' in bounds ? bounds.top : 0).toBeGreaterThanOrEqual(0);

            overlay.dispose();
        });

        test('resizing should respect container bounds and not allow negative positions', () => {
            const container = document.createElement('div');
            const content = document.createElement('div');

            document.body.appendChild(container);
            container.appendChild(content);

            const overlay = new Overlay({
                height: 100,
                width: 100,
                left: 20,
                top: 20,
                minimumInViewportWidth: 50,
                minimumInViewportHeight: 50,
                container,
                content,
            });

            const element = overlay.element;

            jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 0,
                        width: 200,
                        height: 200,
                    })
            );

            jest.spyOn(element, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 20,
                        top: 20,
                        width: 100,
                        height: 100,
                    })
            );

            const leftHandle = container.querySelector(
                '.dv-resize-handle-left'
            ) as HTMLElement;
            expect(leftHandle).toBeTruthy();

            const pointerDownEvent = new MouseEvent('pointerdown', {
                clientX: 20,
                clientY: 70,
                bubbles: true,
            }) as any;
            pointerDownEvent.pointerId = 1;
            leftHandle.dispatchEvent(pointerDownEvent);

            // Simulate dragging left handle way beyond left edge (should be constrained)
            const pointerMoveEvent = new MouseEvent('pointermove', {
                clientX: -100, // Try to drag beyond container
                clientY: 70,
                bubbles: true,
            }) as any;
            pointerMoveEvent.pointerId = 1;
            window.dispatchEvent(pointerMoveEvent);

            const bounds = overlay.toJSON();
            expect('left' in bounds ? bounds.left : 0).toBeGreaterThanOrEqual(
                0
            );

            overlay.dispose();
        });

        test('resizing should respect maximum dimensions when constrained by container size', () => {
            const container = document.createElement('div');
            const content = document.createElement('div');

            document.body.appendChild(container);
            container.appendChild(content);

            const overlay = new Overlay({
                height: 50,
                width: 50,
                left: 10,
                top: 10,
                minimumInViewportWidth: 25,
                minimumInViewportHeight: 25,
                container,
                content,
            });

            const element = overlay.element;

            jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 0,
                        width: 100,
                        height: 100,
                    })
            );

            jest.spyOn(element, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 10,
                        top: 10,
                        width: 50,
                        height: 50,
                    })
            );

            const rightHandle = container.querySelector(
                '.dv-resize-handle-right'
            ) as HTMLElement;
            expect(rightHandle).toBeTruthy();

            const pointerDownEvent = new MouseEvent('pointerdown', {
                clientX: 60,
                clientY: 35,
                bubbles: true,
            }) as any;
            pointerDownEvent.pointerId = 1;
            rightHandle.dispatchEvent(pointerDownEvent);

            // Simulate dragging right handle way beyond container (should be constrained)
            const pointerMoveEvent = new MouseEvent('pointermove', {
                clientX: 200, // Try to drag way beyond container width
                clientY: 35,
                bubbles: true,
            }) as any;
            pointerMoveEvent.pointerId = 1;
            window.dispatchEvent(pointerMoveEvent);

            const bounds = overlay.toJSON();
            expect(bounds.width).toBeLessThanOrEqual(90); // 100 - 10 (left position)

            overlay.dispose();
        });
    });

    describe('header', () => {
        test('inserts the header above the content and flags the container', () => {
            const container = document.createElement('div');
            const content = document.createElement('div');
            const header = document.createElement('div');
            header.className = 'dv-floating-titlebar';

            document.body.appendChild(container);

            const overlay = new Overlay({
                height: 200,
                width: 100,
                left: 10,
                top: 20,
                minimumInViewportWidth: 0,
                minimumInViewportHeight: 0,
                container,
                content,
                header,
            });

            expect(
                overlay.element.classList.contains(
                    'dv-resize-container-with-titlebar'
                )
            ).toBeTruthy();

            // header is rendered before the content
            const children = Array.from(overlay.element.children);
            expect(children.indexOf(header)).toBeLessThan(
                children.indexOf(content)
            );

            overlay.dispose();
        });

        test('headerHeight reflects the header element, 0 when absent', () => {
            const container = document.createElement('div');
            const content = document.createElement('div');
            const header = document.createElement('div');

            Object.defineProperty(header, 'offsetHeight', {
                configurable: true,
                value: 22,
            });

            document.body.appendChild(container);

            const withHeader = new Overlay({
                height: 200,
                width: 100,
                left: 10,
                top: 20,
                minimumInViewportWidth: 0,
                minimumInViewportHeight: 0,
                container,
                content,
                header,
            });
            expect(withHeader.headerHeight).toBe(22);
            withHeader.dispose();

            const withoutHeader = new Overlay({
                height: 200,
                width: 100,
                left: 10,
                top: 20,
                minimumInViewportWidth: 0,
                minimumInViewportHeight: 0,
                container,
                content: document.createElement('div'),
            });
            expect(withoutHeader.headerHeight).toBe(0);
            withoutHeader.dispose();
        });

        test('setupDrag on the header moves the overlay', () => {
            const container = document.createElement('div');
            const content = document.createElement('div');
            const header = document.createElement('div');

            document.body.appendChild(container);

            const overlay = new Overlay({
                height: 50,
                width: 50,
                left: 10,
                top: 10,
                minimumInViewportWidth: 0,
                minimumInViewportHeight: 0,
                container,
                content,
                header,
            });

            jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 0,
                        width: 100,
                        height: 100,
                    })
            );
            jest.spyOn(
                overlay.element,
                'getBoundingClientRect'
            ).mockImplementation(() =>
                mockGetBoundingClientRect({
                    left: 10,
                    top: 10,
                    width: 50,
                    height: 50,
                })
            );

            overlay.setupDrag(header);

            const down = new MouseEvent('pointerdown', {
                clientX: 20,
                clientY: 20,
                bubbles: true,
            }) as any;
            down.pointerId = 1;
            header.dispatchEvent(down);

            const move = new MouseEvent('pointermove', {
                clientX: 40,
                clientY: 40,
                bubbles: true,
            }) as any;
            move.pointerId = 1;
            window.dispatchEvent(move);

            expect(
                overlay.element.classList.contains(
                    'dv-resize-container-dragging'
                )
            ).toBeTruthy();

            const up = new MouseEvent('pointerup', { bubbles: true }) as any;
            up.pointerId = 1;
            window.dispatchEvent(up);

            overlay.dispose();
        });
    });

    describe('drag position transform', () => {
        function setupDraggableOverlay(options: {
            transformDragPosition?: Parameters<
                typeof Overlay
            >[0]['transformDragPosition'];
            getSiblingBoxes?: () => readonly {
                left: number;
                top: number;
                width: number;
                height: number;
            }[];
        }) {
            const container = document.createElement('div');
            const content = document.createElement('div');
            document.body.appendChild(container);
            container.appendChild(content);

            const overlay = new Overlay({
                height: 100,
                width: 100,
                left: 50,
                top: 50,
                minimumInViewportWidth: 0,
                minimumInViewportHeight: 0,
                container,
                content,
                ...options,
            });

            jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 0,
                        width: 400,
                        height: 400,
                    })
            );
            jest.spyOn(
                overlay.element,
                'getBoundingClientRect'
            ).mockImplementation(() =>
                mockGetBoundingClientRect({
                    left: 50,
                    top: 50,
                    width: 100,
                    height: 100,
                })
            );

            const dragTarget = document.createElement('div');
            container.appendChild(dragTarget);
            overlay.setupDrag(dragTarget);

            const drag = (clientX: number, clientY: number) => {
                const down = new MouseEvent('pointerdown', {
                    clientX: 60,
                    clientY: 60,
                    bubbles: true,
                }) as any;
                down.pointerId = 1;
                dragTarget.dispatchEvent(down);

                const move = new MouseEvent('pointermove', {
                    clientX,
                    clientY,
                    bubbles: true,
                }) as any;
                move.pointerId = 1;
                window.dispatchEvent(move);
            };

            return { overlay, drag };
        }

        test('receives the proposed box, container and sibling boxes', () => {
            const calls: any[] = [];
            const siblings = [{ left: 0, top: 0, width: 10, height: 10 }];
            const { overlay, drag } = setupDraggableOverlay({
                getSiblingBoxes: () => siblings,
                transformDragPosition: (ctx) => {
                    calls.push(ctx);
                },
            });

            drag(200, 200);

            expect(calls.length).toBeGreaterThan(0);
            expect(calls[0].proposed).toMatchObject({
                width: 100,
                height: 100,
            });
            expect(calls[0].container).toEqual({ width: 400, height: 400 });
            expect(calls[0].others).toEqual(siblings);

            overlay.dispose();
        });

        test('a returned position is applied (pin to top-left)', () => {
            const { overlay, drag } = setupDraggableOverlay({
                transformDragPosition: () => ({ top: 0, left: 0 }),
            });
            const spy = jest.spyOn(overlay, 'setBounds');

            drag(300, 300);

            // top <= bottom and left <= right at (0,0), so it anchors top-left.
            expect(spy).toHaveBeenLastCalledWith({ top: 0, left: 0 });

            overlay.dispose();
        });

        test('runs before the container clamp (out-of-bounds is still clamped in)', () => {
            const { overlay, drag } = setupDraggableOverlay({
                // Ask for a position far outside the 400x400 container.
                transformDragPosition: () => ({ top: 100000, left: 100000 }),
            });
            const spy = jest.spyOn(overlay, 'setBounds');

            drag(200, 200);

            // The raw 100000 must never reach setBounds; it's clamped to the
            // container range first (every applied offset stays near the
            // 400x400 container, nowhere near the requested 100000).
            const bounds = spy.mock.calls.at(-1)![0] as Record<string, number>;
            for (const value of Object.values(bounds)) {
                expect(Math.abs(value)).toBeLessThan(1000);
            }

            overlay.dispose();
        });

        test('no transform → sibling boxes are never gathered', () => {
            const getSiblingBoxes = jest.fn(() => []);
            const { overlay, drag } = setupDraggableOverlay({
                getSiblingBoxes,
            });

            drag(200, 200);

            expect(getSiblingBoxes).not.toHaveBeenCalled();

            overlay.dispose();
        });
    });

    describe('visibility', () => {
        test('setVisible toggles the dv-hidden class and isVisible flag', () => {
            const container = document.createElement('div');
            const content = document.createElement('div');
            document.body.appendChild(container);

            const overlay = new Overlay({
                height: 100,
                width: 100,
                left: 10,
                top: 10,
                minimumInViewportWidth: 0,
                minimumInViewportHeight: 0,
                container,
                content,
            });

            expect(overlay.isVisible).toBe(true);
            expect(overlay.element.classList.contains('dv-hidden')).toBe(false);

            overlay.setVisible(false);
            expect(overlay.isVisible).toBe(false);
            expect(overlay.element.classList.contains('dv-hidden')).toBe(true);

            overlay.setVisible(true);
            expect(overlay.isVisible).toBe(true);
            expect(overlay.element.classList.contains('dv-hidden')).toBe(false);

            overlay.dispose();
        });

        test('setVisible is a no-op when the value is unchanged', () => {
            const container = document.createElement('div');
            const content = document.createElement('div');
            document.body.appendChild(container);

            const overlay = new Overlay({
                height: 100,
                width: 100,
                left: 10,
                top: 10,
                minimumInViewportWidth: 0,
                minimumInViewportHeight: 0,
                container,
                content,
            });

            // already visible → no class change
            overlay.setVisible(true);
            expect(overlay.isVisible).toBe(true);
            expect(overlay.element.classList.contains('dv-hidden')).toBe(false);

            overlay.dispose();
        });
    });

    describe('minimum-in-viewport (no constraint configured)', () => {
        test('omitting the minimum options leaves clamping unconstrained', () => {
            const container = document.createElement('div');
            const content = document.createElement('div');
            document.body.appendChild(container);
            container.appendChild(content);

            // No minimumInViewportWidth/Height → getMinimumWidth/Height return 0
            const overlay = new Overlay({
                height: 200,
                width: 100,
                left: 10,
                top: 20,
                container,
                content,
            });

            jest.spyOn(
                overlay.element,
                'getBoundingClientRect'
            ).mockImplementation(() =>
                mockGetBoundingClientRect({
                    left: 80,
                    top: 100,
                    width: 40,
                    height: 50,
                })
            );
            jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 20,
                        top: 30,
                        width: 100,
                        height: 100,
                    })
            );

            // top: clamp(overlay.top(100) - container.top(30), 0, max(0, 100-50)) = 50
            // left: clamp(overlay.left(80) - container.left(20), 0, max(0, 100-40)) = 60
            expect(() => overlay.setBounds()).not.toThrow();
            expect(overlay.toJSON()).toEqual({
                top: 50,
                left: 60,
                width: 40,
                height: 50,
            });

            overlay.dispose();
        });

        test('the minimumInViewport setters feed the clamping offsets', () => {
            const container = document.createElement('div');
            const content = document.createElement('div');
            document.body.appendChild(container);
            container.appendChild(content);

            const overlay = new Overlay({
                height: 100,
                width: 100,
                left: 10,
                top: 10,
                container,
                content,
            });

            jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 0,
                        width: 100,
                        height: 100,
                    })
            );
            // overlay is wider/taller than the container and positioned well
            // beyond it, so it will be clamped to the maximum allowed offset.
            jest.spyOn(
                overlay.element,
                'getBoundingClientRect'
            ).mockImplementation(() =>
                mockGetBoundingClientRect({
                    left: 500,
                    top: 500,
                    width: 200,
                    height: 200,
                })
            );

            // Without a configured minimum the max offset is
            //   max(0, container(100) - overlay(200)) = 0.
            // Setting a 20px in-viewport minimum widens it to
            //   max(0, 100 - 200 + (200 - 20)) = 80,
            // so the clamped edge lands at 80 instead of 0.
            overlay.minimumInViewportWidth = 20;
            overlay.minimumInViewportHeight = 20;

            overlay.setBounds();

            const bounds = overlay.toJSON() as Record<string, number>;
            expect(bounds.top).toBe(80);
            expect(bounds.left).toBe(80);

            overlay.dispose();
        });
    });

    describe('cancelPendingDrag', () => {
        function setup() {
            const container = document.createElement('div');
            const content = document.createElement('div');
            document.body.appendChild(container);
            container.appendChild(content);

            const overlay = new Overlay({
                height: 50,
                width: 50,
                left: 10,
                top: 10,
                minimumInViewportWidth: 0,
                minimumInViewportHeight: 0,
                container,
                content,
            });

            jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 0,
                        width: 200,
                        height: 200,
                    })
            );
            jest.spyOn(
                overlay.element,
                'getBoundingClientRect'
            ).mockImplementation(() =>
                mockGetBoundingClientRect({
                    left: 10,
                    top: 10,
                    width: 50,
                    height: 50,
                })
            );

            const dragTarget = document.createElement('div');
            container.appendChild(dragTarget);
            overlay.setupDrag(dragTarget);

            return { overlay, dragTarget };
        }

        test('does nothing when no drag is in flight', () => {
            const { overlay } = setup();
            expect(() => overlay.cancelPendingDrag()).not.toThrow();
            expect(
                overlay.element.classList.contains(
                    'dv-resize-container-dragging'
                )
            ).toBe(false);
            overlay.dispose();
        });

        test('aborts an in-flight drag and clears the dragging class', () => {
            const { overlay, dragTarget } = setup();

            const down = new MouseEvent('pointerdown', {
                clientX: 20,
                clientY: 20,
                bubbles: true,
            }) as any;
            down.pointerId = 1;
            dragTarget.dispatchEvent(down);

            const move = new MouseEvent('pointermove', {
                clientX: 40,
                clientY: 40,
                bubbles: true,
            }) as any;
            move.pointerId = 1;
            window.dispatchEvent(move);

            expect(
                overlay.element.classList.contains(
                    'dv-resize-container-dragging'
                )
            ).toBe(true);

            overlay.cancelPendingDrag();

            expect(
                overlay.element.classList.contains(
                    'dv-resize-container-dragging'
                )
            ).toBe(false);

            overlay.dispose();
        });
    });

    describe('setupDrag guards and pointer capture', () => {
        function setup() {
            const container = document.createElement('div');
            const content = document.createElement('div');
            document.body.appendChild(container);
            container.appendChild(content);

            const overlay = new Overlay({
                height: 50,
                width: 50,
                left: 10,
                top: 10,
                minimumInViewportWidth: 0,
                minimumInViewportHeight: 0,
                container,
                content,
            });

            jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 0,
                        width: 200,
                        height: 200,
                    })
            );
            jest.spyOn(
                overlay.element,
                'getBoundingClientRect'
            ).mockImplementation(() =>
                mockGetBoundingClientRect({
                    left: 10,
                    top: 10,
                    width: 50,
                    height: 50,
                })
            );

            return { overlay, container, content };
        }

        test('captures and releases the pointer over a full drag', () => {
            const { overlay, container } = setup();

            const dragTarget = document.createElement('div');
            const setPointerCapture = jest.fn();
            const releasePointerCapture = jest.fn();
            (dragTarget as any).setPointerCapture = setPointerCapture;
            (dragTarget as any).releasePointerCapture = releasePointerCapture;
            container.appendChild(dragTarget);
            overlay.setupDrag(dragTarget);

            const down = new MouseEvent('pointerdown', {
                clientX: 20,
                clientY: 20,
                bubbles: true,
            }) as any;
            down.pointerId = 7;
            dragTarget.dispatchEvent(down);

            expect(setPointerCapture).toHaveBeenCalledWith(7);

            const move = new MouseEvent('pointermove', {
                clientX: 40,
                clientY: 40,
                bubbles: true,
            }) as any;
            move.pointerId = 7;
            window.dispatchEvent(move);

            const up = new MouseEvent('pointerup', { bubbles: true }) as any;
            up.pointerId = 7;
            window.dispatchEvent(up);

            expect(releasePointerCapture).toHaveBeenCalledWith(7);

            overlay.dispose();
        });

        test('ignores pointerdown when defaultPrevented', () => {
            const { overlay, container } = setup();
            const dragTarget = document.createElement('div');
            container.appendChild(dragTarget);
            overlay.setupDrag(dragTarget);

            const onDidStartMoving = jest.fn();
            overlay.onDidStartMoving(onDidStartMoving);

            const down = new MouseEvent('pointerdown', {
                clientX: 20,
                clientY: 20,
                bubbles: true,
                cancelable: true,
            }) as any;
            down.pointerId = 1;
            down.preventDefault();
            dragTarget.dispatchEvent(down);

            const move = new MouseEvent('pointermove', {
                clientX: 40,
                clientY: 40,
                bubbles: true,
            }) as any;
            move.pointerId = 1;
            window.dispatchEvent(move);

            // no drag was started
            expect(onDidStartMoving).not.toHaveBeenCalled();

            overlay.dispose();
        });

        test('shift+pointerdown on the content starts a drag', () => {
            const { overlay, content } = setup();
            overlay.setupDrag(document.createElement('div'));

            const onDidStartMoving = jest.fn();
            overlay.onDidStartMoving(onDidStartMoving);

            const down = new MouseEvent('pointerdown', {
                clientX: 20,
                clientY: 20,
                bubbles: true,
                shiftKey: true,
            }) as any;
            down.pointerId = 1;
            content.dispatchEvent(down);

            const move = new MouseEvent('pointermove', {
                clientX: 40,
                clientY: 40,
                bubbles: true,
            }) as any;
            move.pointerId = 1;
            window.dispatchEvent(move);

            expect(onDidStartMoving).toHaveBeenCalledTimes(1);

            overlay.dispose();
        });

        test('pointerdown on the content without shift does not drag', () => {
            const { overlay, content } = setup();
            overlay.setupDrag(document.createElement('div'));

            const onDidStartMoving = jest.fn();
            overlay.onDidStartMoving(onDidStartMoving);

            const down = new MouseEvent('pointerdown', {
                clientX: 20,
                clientY: 20,
                bubbles: true,
            }) as any;
            down.pointerId = 1;
            content.dispatchEvent(down);

            const move = new MouseEvent('pointermove', {
                clientX: 40,
                clientY: 40,
                bubbles: true,
            }) as any;
            move.pointerId = 1;
            window.dispatchEvent(move);

            expect(onDidStartMoving).not.toHaveBeenCalled();

            overlay.dispose();
        });

        test('inDragMode begins tracking immediately', () => {
            const { overlay } = setup();

            const dragTarget = document.createElement('div');
            overlay.setupDrag(dragTarget, { inDragMode: true });

            const onDidStartMoving = jest.fn();
            overlay.onDidStartMoving(onDidStartMoving);

            const move = new MouseEvent('pointermove', {
                clientX: 40,
                clientY: 40,
                bubbles: true,
            }) as any;
            move.pointerId = 1;
            window.dispatchEvent(move);

            expect(onDidStartMoving).toHaveBeenCalledTimes(1);
            expect(
                overlay.element.classList.contains(
                    'dv-resize-container-dragging'
                )
            ).toBe(true);

            overlay.dispose();
        });
    });

    describe('resize handles (additional directions)', () => {
        function setup() {
            const container = document.createElement('div');
            const content = document.createElement('div');
            document.body.appendChild(container);
            container.appendChild(content);

            const overlay = new Overlay({
                height: 100,
                width: 100,
                left: 50,
                top: 50,
                minimumInViewportWidth: 25,
                minimumInViewportHeight: 25,
                container,
                content,
            });

            jest.spyOn(container, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 0,
                        width: 400,
                        height: 400,
                    })
            );
            jest.spyOn(
                overlay.element,
                'getBoundingClientRect'
            ).mockImplementation(() =>
                mockGetBoundingClientRect({
                    left: 50,
                    top: 50,
                    width: 100,
                    height: 100,
                })
            );

            return { overlay, container };
        }

        function resizeVia(
            container: HTMLElement,
            direction: string,
            move: { clientX: number; clientY: number }
        ) {
            const handle = container.querySelector(
                `.dv-resize-handle-${direction}`
            ) as HTMLElement;
            expect(handle).toBeTruthy();

            const setPointerCapture = jest.fn();
            const releasePointerCapture = jest.fn();
            (handle as any).setPointerCapture = setPointerCapture;
            (handle as any).releasePointerCapture = releasePointerCapture;

            const down = new MouseEvent('pointerdown', {
                clientX: 150,
                clientY: 150,
                bubbles: true,
                cancelable: true,
            }) as any;
            down.pointerId = 3;
            handle.dispatchEvent(down);

            const pmove = new MouseEvent('pointermove', {
                clientX: move.clientX,
                clientY: move.clientY,
                bubbles: true,
            }) as any;
            pmove.pointerId = 3;
            window.dispatchEvent(pmove);

            const up = new MouseEvent('pointerup', { bubbles: true }) as any;
            up.pointerId = 3;
            window.dispatchEvent(up);

            return { setPointerCapture, releasePointerCapture };
        }

        test('bottom handle resizes height and captures/releases the pointer', () => {
            const { overlay, container } = setup();

            const { setPointerCapture, releasePointerCapture } = resizeVia(
                container,
                'bottom',
                { clientX: 150, clientY: 200 }
            );

            expect(setPointerCapture).toHaveBeenCalledWith(3);
            expect(releasePointerCapture).toHaveBeenCalledWith(3);

            const bounds = overlay.toJSON();
            expect(bounds.height).toBeGreaterThan(0);
            expect(bounds.height).toBeLessThanOrEqual(400);

            overlay.dispose();
        });

        test.each([
            ['bottomright', { clientX: 250, clientY: 250 }],
            ['topleft', { clientX: 80, clientY: 80 }],
            ['topright', { clientX: 250, clientY: 80 }],
            ['bottomleft', { clientX: 80, clientY: 250 }],
        ] as const)('%s corner resizes both dimensions', (corner, point) => {
            const { overlay, container } = setup();

            resizeVia(container, corner, point);

            const bounds = overlay.toJSON();
            expect(bounds.width).toBeGreaterThan(0);
            expect(bounds.height).toBeGreaterThan(0);

            overlay.dispose();
        });
    });
});
