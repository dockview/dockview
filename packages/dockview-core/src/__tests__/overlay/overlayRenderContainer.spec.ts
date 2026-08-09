import { Droptarget } from '../../dnd/droptarget';
import { IDockviewPanel } from '../../dockview/dockviewPanel';
import { Emitter } from '../../events';
import {
    IRenderable,
    OverlayRenderContainer,
} from '../../overlay/overlayRenderContainer';
import { fromPartial } from '@total-typescript/shoehorn';
import {
    Writable,
    exhaustMicrotaskQueue,
    exhaustAnimationFrame,
} from '../__test_utils__/utils';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';

describe('overlayRenderContainer', () => {
    let referenceContainer: IRenderable;
    let parentContainer: HTMLElement;

    beforeEach(() => {
        parentContainer = document.createElement('div');

        referenceContainer = {
            element: document.createElement('div'),
            dropTarget: fromPartial<Droptarget>({}),
        };
    });

    test('that attach(...) and detach(...) mutate the DOM as expected', () => {
        const cut = new OverlayRenderContainer(
            parentContainer,
            fromPartial<DockviewComponent>({})
        );

        const panelContentEl = document.createElement('div');

        const onDidVisibilityChange = new Emitter<any>();
        const onDidDimensionsChange = new Emitter<any>();
        const onDidLocationChange = new Emitter<any>();

        const panel = fromPartial<IDockviewPanel>({
            api: {
                id: 'test_panel_id',
                onDidVisibilityChange: onDidVisibilityChange.event,
                onDidDimensionsChange: onDidDimensionsChange.event,
                onDidLocationChange: onDidLocationChange.event,
                isVisible: true,
                location: { type: 'grid' },
            },
            view: {
                content: {
                    element: panelContentEl,
                },
            },
            group: {
                api: {
                    location: { type: 'grid' },
                },
            },
        });

        cut.attach({ panel, referenceContainer });

        expect(panelContentEl.parentElement?.parentElement).toBe(
            parentContainer
        );

        cut.detatch(panel);

        expect(panelContentEl.parentElement?.parentElement).toBeUndefined();
    });

    test('add a view that is not currently in the DOM', async () => {
        const cut = new OverlayRenderContainer(
            parentContainer,
            fromPartial<DockviewComponent>({})
        );

        const panelContentEl = document.createElement('div');

        const onDidVisibilityChange = new Emitter<any>();
        const onDidDimensionsChange = new Emitter<any>();
        const onDidLocationChange = new Emitter<any>();

        const panel = fromPartial<IDockviewPanel>({
            api: {
                id: 'test_panel_id',
                onDidVisibilityChange: onDidVisibilityChange.event,
                onDidDimensionsChange: onDidDimensionsChange.event,
                onDidLocationChange: onDidLocationChange.event,
                isVisible: true,
                location: { type: 'grid' },
            },
            view: {
                content: {
                    element: panelContentEl,
                },
            },
            group: {
                api: {
                    location: { type: 'grid' },
                },
            },
        });

        (parentContainer as jest.Mocked<HTMLDivElement>).getBoundingClientRect =
            jest
                .fn<DOMRect, []>()
                .mockReturnValueOnce(
                    fromPartial<DOMRect>({
                        left: 100,
                        top: 200,
                        width: 1000,
                        height: 500,
                    })
                )
                .mockReturnValueOnce(
                    fromPartial<DOMRect>({
                        left: 101,
                        top: 201,
                        width: 1000,
                        height: 500,
                    })
                )
                .mockReturnValueOnce(
                    fromPartial<DOMRect>({
                        left: 100,
                        top: 200,
                        width: 1000,
                        height: 500,
                    })
                );

        (
            referenceContainer.element as jest.Mocked<HTMLDivElement>
        ).getBoundingClientRect = jest
            .fn<DOMRect, []>()
            .mockReturnValueOnce(
                fromPartial<DOMRect>({
                    left: 150,
                    top: 300,
                    width: 100,
                    height: 200,
                })
            )
            .mockReturnValueOnce(
                fromPartial<DOMRect>({
                    left: 150,
                    top: 300,
                    width: 101,
                    height: 201,
                })
            )
            .mockReturnValueOnce(
                fromPartial<DOMRect>({
                    left: 150,
                    top: 300,
                    width: 100,
                    height: 200,
                })
            );

        const container = cut.attach({ panel, referenceContainer });

        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        expect(panelContentEl.parentElement).toBe(container);
        expect(container.parentElement).toBe(parentContainer);

        expect(container.style.visibility).toBe('');
        expect(container.style.pointerEvents).toBe('');

        expect(container.style.left).toBe('50px');
        expect(container.style.top).toBe('100px');
        expect(container.style.width).toBe('100px');
        expect(container.style.height).toBe('200px');
        expect(
            referenceContainer.element.getBoundingClientRect
        ).toHaveBeenCalledTimes(1);

        onDidDimensionsChange.fire({});
        await exhaustAnimationFrame();
        expect(container.style.visibility).toBe('');
        expect(container.style.pointerEvents).toBe('');

        expect(container.style.left).toBe('49px');
        expect(container.style.top).toBe('99px');
        expect(container.style.width).toBe('101px');
        expect(container.style.height).toBe('201px');
        expect(
            referenceContainer.element.getBoundingClientRect
        ).toHaveBeenCalledTimes(2);

        (panel as Writable<IDockviewPanel>).api.isVisible = false;
        onDidVisibilityChange.fire({});
        expect(container.style.visibility).toBe('hidden');
        expect(container.style.pointerEvents).toBe('none');
        expect(
            referenceContainer.element.getBoundingClientRect
        ).toHaveBeenCalledTimes(2);

        (panel as Writable<IDockviewPanel>).api.isVisible = true;
        onDidVisibilityChange.fire({});
        expect(container.style.pointerEvents).toBe('');
        await exhaustAnimationFrame();
        expect(container.style.visibility).toBe('');

        expect(container.style.left).toBe('50px');
        expect(container.style.top).toBe('100px');
        expect(container.style.width).toBe('100px');
        expect(container.style.height).toBe('200px');
        expect(
            referenceContainer.element.getBoundingClientRect
        ).toHaveBeenCalledTimes(3);
    });

    test('related z-index from `aria-level` set on floating panels', async () => {
        const group = fromPartial<DockviewGroupPanel>({});

        const element = document.createElement('div');
        element.setAttribute('aria-level', '2');
        const spy = jest.spyOn(element, 'getAttribute');

        const floatingGroup = {
            group,
            overlay: {
                element,
            },
        };
        const accessor = fromPartial<DockviewComponent>({
            floatingGroups: [floatingGroup],
            // The container resolves the floating window by membership (so it
            // finds nested, non-anchor members too), not by scanning
            // `floatingGroups` for an anchor match.
            getFloatingWindowForGroup: (candidate) =>
                candidate === group ? (floatingGroup as any) : undefined,
        });

        const cut = new OverlayRenderContainer(parentContainer, accessor);

        const panelContentEl = document.createElement('div');

        const onDidVisibilityChange = new Emitter<any>();
        const onDidDimensionsChange = new Emitter<any>();
        const onDidLocationChange = new Emitter<any>();

        const panel = fromPartial<IDockviewPanel>({
            api: {
                id: 'test_panel_id',
                onDidVisibilityChange: onDidVisibilityChange.event,
                onDidDimensionsChange: onDidDimensionsChange.event,
                onDidLocationChange: onDidLocationChange.event,
                isVisible: true,
                group,
                location: { type: 'floating' },
            },
            view: {
                content: {
                    element: panelContentEl,
                },
            },
            group: {
                api: {
                    location: { type: 'floating' },
                },
            },
        });

        cut.attach({ panel, referenceContainer });

        await exhaustMicrotaskQueue();

        expect(spy).toHaveBeenCalledWith('aria-level');
        expect(panelContentEl.parentElement!.style.zIndex).toBe(
            'calc(var(--dv-overlay-z-index, 999) + 5)'
        );
    });

    test('that frequent resize calls are batched to prevent shaking (issue #988)', async () => {
        const cut = new OverlayRenderContainer(
            parentContainer,
            fromPartial<DockviewComponent>({})
        );

        const panelContentEl = document.createElement('div');
        const onDidVisibilityChange = new Emitter<any>();
        const onDidDimensionsChange = new Emitter<any>();
        const onDidLocationChange = new Emitter<any>();

        const panel = fromPartial<IDockviewPanel>({
            api: {
                id: 'test_panel_id',
                onDidVisibilityChange: onDidVisibilityChange.event,
                onDidDimensionsChange: onDidDimensionsChange.event,
                onDidLocationChange: onDidLocationChange.event,
                isVisible: true,
                location: { type: 'grid' },
            },
            view: {
                content: {
                    element: panelContentEl,
                },
            },
            group: {
                api: {
                    location: {
                        type: 'grid',
                    },
                },
            },
        });

        jest.spyOn(
            referenceContainer.element,
            'getBoundingClientRect'
        ).mockReturnValue(
            fromPartial<DOMRect>({
                left: 100,
                top: 200,
                width: 150,
                height: 250,
            })
        );

        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({
                left: 50,
                top: 100,
                width: 200,
                height: 300,
            })
        );

        const container = cut.attach({ panel, referenceContainer });

        // Wait for initial positioning
        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        expect(container.style.left).toBe('50px');
        expect(container.style.top).toBe('100px');

        // Simulate rapid resize events that could cause shaking
        onDidDimensionsChange.fire({});
        onDidDimensionsChange.fire({});
        onDidDimensionsChange.fire({});
        onDidDimensionsChange.fire({});
        onDidDimensionsChange.fire({});

        // Even with multiple rapid events, only one RAF should be scheduled
        await exhaustAnimationFrame();

        expect(container.style.left).toBe('50px');
        expect(container.style.top).toBe('100px');
        expect(container.style.width).toBe('150px');
        expect(container.style.height).toBe('250px');

        // Verify that DOM measurements are cached within the same frame
        // Should be called initially and possibly one more time for visibility change
        expect(
            referenceContainer.element.getBoundingClientRect
        ).toHaveBeenCalledTimes(2);
        expect(parentContainer.getBoundingClientRect).toHaveBeenCalledTimes(2);
    });

    test('overlay element is hidden until first position is applied', async () => {
        const cut = new OverlayRenderContainer(
            parentContainer,
            fromPartial<DockviewComponent>({})
        );

        const panelContentEl = document.createElement('div');
        const onDidVisibilityChange = new Emitter<any>();
        const onDidDimensionsChange = new Emitter<any>();
        const onDidLocationChange = new Emitter<any>();

        const panel = fromPartial<IDockviewPanel>({
            api: {
                id: 'test_panel_id',
                onDidVisibilityChange: onDidVisibilityChange.event,
                onDidDimensionsChange: onDidDimensionsChange.event,
                onDidLocationChange: onDidLocationChange.event,
                isVisible: true,
                location: { type: 'grid' },
            },
            view: { content: { element: panelContentEl } },
            group: { api: { location: { type: 'grid' } } },
        });

        jest.spyOn(
            referenceContainer.element,
            'getBoundingClientRect'
        ).mockReturnValue(
            fromPartial<DOMRect>({
                left: 100,
                top: 200,
                width: 100,
                height: 200,
            })
        );
        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 1000, height: 1000 })
        );

        const container = cut.attach({ panel, referenceContainer });

        // Immediately after attach: hidden to prevent a one-frame flash at 0,0
        expect(container.style.visibility).toBe('hidden');

        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        // After first position is applied: visible
        expect(container.style.visibility).toBe('');
        expect(container.style.left).toBe('100px');
        expect(container.style.top).toBe('200px');
    });

    test('overlay element is hidden again on re-attach (e.g. after fromJSON)', async () => {
        const cut = new OverlayRenderContainer(
            parentContainer,
            fromPartial<DockviewComponent>({})
        );

        const panelContentEl = document.createElement('div');
        const onDidVisibilityChange = new Emitter<any>();
        const onDidDimensionsChange = new Emitter<any>();
        const onDidLocationChange = new Emitter<any>();

        const panel = fromPartial<IDockviewPanel>({
            api: {
                id: 'test_panel_id',
                onDidVisibilityChange: onDidVisibilityChange.event,
                onDidDimensionsChange: onDidDimensionsChange.event,
                onDidLocationChange: onDidLocationChange.event,
                isVisible: true,
                location: { type: 'grid' },
            },
            view: { content: { element: panelContentEl } },
            group: { api: { location: { type: 'grid' } } },
        });

        jest.spyOn(
            referenceContainer.element,
            'getBoundingClientRect'
        ).mockReturnValue(
            fromPartial<DOMRect>({
                left: 100,
                top: 200,
                width: 100,
                height: 200,
            })
        );
        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 1000, height: 1000 })
        );

        const container = cut.attach({ panel, referenceContainer });
        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        // Fully positioned and visible after first attach
        expect(container.style.visibility).toBe('');

        // Simulate what fromJSON does: detach then re-attach the panel
        cut.detatch(panel);
        const container2 = cut.attach({ panel, referenceContainer });

        // A fresh overlay element is created, so it must be hidden until positioned
        expect(container2.style.visibility).toBe('hidden');

        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        // Visible again after repositioning
        expect(container2.style.visibility).toBe('');
    });

    test('resize rAF that fires after a panel was hidden mid-flight keeps visibility hidden', async () => {
        // Regression test for a race where:
        //   1. visibilityChanged(visible=true) schedules a resize rAF and clears pointerEvents
        //   2. before the rAF fires, the panel becomes non-visible:
        //      visibilityChanged(visible=false) sets visibility:hidden + pointerEvents:none
        //   3. the rAF then ran `if (style.visibility === 'hidden') style.visibility = ''`,
        //      leaving the overlay computed-visible with pointer-events:none at a stale
        //      position. onDidDimensionsChange skips non-visible panels, so subsequent
        //      sash drags never repositioned the overlay, and its stale content leaked into
        //      neighbouring panel areas.
        const cut = new OverlayRenderContainer(
            parentContainer,
            fromPartial<DockviewComponent>({})
        );

        const panelContentEl = document.createElement('div');
        const onDidVisibilityChange = new Emitter<any>();
        const onDidDimensionsChange = new Emitter<any>();
        const onDidLocationChange = new Emitter<any>();

        const panel = fromPartial<IDockviewPanel>({
            api: {
                id: 'test_panel_id',
                onDidVisibilityChange: onDidVisibilityChange.event,
                onDidDimensionsChange: onDidDimensionsChange.event,
                onDidLocationChange: onDidLocationChange.event,
                isVisible: true,
                location: { type: 'grid' },
            },
            view: { content: { element: panelContentEl } },
            group: { api: { location: { type: 'grid' } } },
        });

        jest.spyOn(
            referenceContainer.element,
            'getBoundingClientRect'
        ).mockReturnValue(
            fromPartial<DOMRect>({
                left: 100,
                top: 200,
                width: 100,
                height: 200,
            })
        );
        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 1000, height: 1000 })
        );

        const container = cut.attach({ panel, referenceContainer });
        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        // Baseline: panel is visible and positioned.
        expect(container.style.visibility).toBe('');
        expect(container.style.pointerEvents).toBe('');

        // Flip the panel to non-visible so the queued post-resize rAF sees
        // `panel.api.isVisible === false`.
        (panel as Writable<IDockviewPanel>).api.isVisible = false;
        onDidVisibilityChange.fire({});
        expect(container.style.visibility).toBe('hidden');
        expect(container.style.pointerEvents).toBe('none');

        // Now simulate an in-flight resize completing after the visibility flip.
        // The rAF runs and must not clobber `visibility:hidden`.
        (panel as Writable<IDockviewPanel>).api.isVisible = true;
        onDidVisibilityChange.fire({}); // schedules a resize rAF
        (panel as Writable<IDockviewPanel>).api.isVisible = false;
        onDidVisibilityChange.fire({}); // hides again before rAF
        await exhaustAnimationFrame();

        expect(container.style.visibility).toBe('hidden');
        expect(container.style.pointerEvents).toBe('none');
    });

    test('updateAllPositions forces position recalculation for visible panels', async () => {
        const cut = new OverlayRenderContainer(
            parentContainer,
            fromPartial<DockviewComponent>({})
        );

        const panelContentEl1 = document.createElement('div');
        const panelContentEl2 = document.createElement('div');

        const onDidVisibilityChange1 = new Emitter<any>();
        const onDidDimensionsChange1 = new Emitter<any>();
        const onDidLocationChange1 = new Emitter<any>();

        const onDidVisibilityChange2 = new Emitter<any>();
        const onDidDimensionsChange2 = new Emitter<any>();
        const onDidLocationChange2 = new Emitter<any>();

        const panel1 = fromPartial<IDockviewPanel>({
            api: {
                id: 'panel1',
                onDidVisibilityChange: onDidVisibilityChange1.event,
                onDidDimensionsChange: onDidDimensionsChange1.event,
                onDidLocationChange: onDidLocationChange1.event,
                isVisible: true,
                location: { type: 'grid' },
            },
            view: {
                content: {
                    element: panelContentEl1,
                },
            },
            group: {
                api: {
                    location: { type: 'grid' },
                },
            },
        });

        const panel2 = fromPartial<IDockviewPanel>({
            api: {
                id: 'panel2',
                onDidVisibilityChange: onDidVisibilityChange2.event,
                onDidDimensionsChange: onDidDimensionsChange2.event,
                onDidLocationChange: onDidLocationChange2.event,
                isVisible: false,
                location: { type: 'grid' },
            },
            view: {
                content: {
                    element: panelContentEl2,
                },
            },
            group: {
                api: {
                    location: { type: 'grid' },
                },
            },
        });

        jest.spyOn(
            referenceContainer.element,
            'getBoundingClientRect'
        ).mockReturnValue(
            fromPartial<DOMRect>({
                left: 100,
                top: 200,
                width: 150,
                height: 250,
            })
        );

        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({
                left: 50,
                top: 100,
                width: 200,
                height: 300,
            })
        );

        const container1 = cut.attach({ panel: panel1, referenceContainer });
        const container2 = cut.attach({ panel: panel2, referenceContainer });

        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        jest.clearAllMocks();

        cut.updateAllPositions();

        // Should trigger resize for visible panels only
        await exhaustAnimationFrame();

        expect(container1.style.left).toBe('50px');
        expect(container1.style.top).toBe('100px');
        expect(container1.style.width).toBe('150px');
        expect(container1.style.height).toBe('250px');

        expect(
            referenceContainer.element.getBoundingClientRect
        ).toHaveBeenCalled();
        expect(parentContainer.getBoundingClientRect).toHaveBeenCalled();
    });

    test('disposes cleanly when the renderer element getter throws (#1220)', () => {
        // Reproduces the disposal-order failure from #1220: framework
        // adapters such as dockview-angular may tear down their renderer
        // before OverlayRenderContainer's destroy disposable runs, after
        // which their `element` getter throws. The container should hold
        // a direct reference captured at attach time and not re-query.
        const cut = new OverlayRenderContainer(
            parentContainer,
            fromPartial<DockviewComponent>({})
        );

        const panelContentEl = document.createElement('div');
        let rendererDisposed = false;

        const onDidVisibilityChange = new Emitter<any>();
        const onDidDimensionsChange = new Emitter<any>();
        const onDidLocationChange = new Emitter<any>();

        const content = {
            get element(): HTMLElement {
                if (rendererDisposed) {
                    throw new Error('Angular renderer not initialized');
                }
                return panelContentEl;
            },
        };

        const panel = fromPartial<IDockviewPanel>({
            api: {
                id: 'test_panel_id',
                onDidVisibilityChange: onDidVisibilityChange.event,
                onDidDimensionsChange: onDidDimensionsChange.event,
                onDidLocationChange: onDidLocationChange.event,
                isVisible: true,
                location: { type: 'grid' },
            },
            view: { content },
            group: {
                api: {
                    location: { type: 'grid' },
                },
            },
        });

        cut.attach({ panel, referenceContainer });
        expect(panelContentEl.parentElement?.parentElement).toBe(
            parentContainer
        );

        // Simulate the framework adapter tearing down its renderer first.
        rendererDisposed = true;

        expect(() => cut.detatch(panel)).not.toThrow();
        expect(panelContentEl.parentElement?.parentElement).toBeUndefined();
    });

    test('disposing the container while a renderer throws does not propagate (#1220)', () => {
        // Same root cause as the test above, but exercised through the
        // container's own dispose(), the failure path in the original bug
        // report's stack trace.
        const cut = new OverlayRenderContainer(
            parentContainer,
            fromPartial<DockviewComponent>({})
        );

        const panelContentEl = document.createElement('div');
        let rendererDisposed = false;

        const onDidVisibilityChange = new Emitter<any>();
        const onDidDimensionsChange = new Emitter<any>();
        const onDidLocationChange = new Emitter<any>();

        const content = {
            get element(): HTMLElement {
                if (rendererDisposed) {
                    throw new Error('Angular renderer not initialized');
                }
                return panelContentEl;
            },
        };

        const panel = fromPartial<IDockviewPanel>({
            api: {
                id: 'test_panel_id',
                onDidVisibilityChange: onDidVisibilityChange.event,
                onDidDimensionsChange: onDidDimensionsChange.event,
                onDidLocationChange: onDidLocationChange.event,
                isVisible: true,
                location: { type: 'grid' },
            },
            view: { content },
            group: {
                api: {
                    location: { type: 'grid' },
                },
            },
        });

        cut.attach({ panel, referenceContainer });

        rendererDisposed = true;

        expect(() => cut.dispose()).not.toThrow();
    });
});
