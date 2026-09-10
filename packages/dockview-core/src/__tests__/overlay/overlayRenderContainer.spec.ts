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
        expect(container.style.visibility).toBe('hidden');
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

    test('re-attached overlay keeps its last geometry until the new container is laid out', async () => {
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
                width: 300,
                height: 400,
            })
        );
        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 1000, height: 1000 })
        );

        const overlay = cut.attach({ panel, referenceContainer });
        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        expect(overlay.style.left).toBe('100px');
        expect(overlay.style.top).toBe('200px');
        expect(overlay.style.width).toBe('300px');
        expect(overlay.style.height).toBe('400px');

        const replacementContainer: IRenderable = {
            element: document.createElement('div'),
            dropTarget: fromPartial<Droptarget>({}),
        };
        const replacementRect = jest
            .spyOn(replacementContainer.element, 'getBoundingClientRect')
            .mockReturnValue(
                fromPartial<DOMRect>({
                    left: 0,
                    top: 0,
                    width: 0,
                    height: 0,
                })
            );

        expect(
            cut.attach({ panel, referenceContainer: replacementContainer })
        ).toBe(overlay);
        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        expect(overlay.style.left).toBe('100px');
        expect(overlay.style.top).toBe('200px');
        expect(overlay.style.width).toBe('300px');
        expect(overlay.style.height).toBe('400px');

        replacementRect.mockReturnValue(
            fromPartial<DOMRect>({
                left: 150,
                top: 250,
                width: 350,
                height: 450,
            })
        );
        cut.updateAllPositions();
        await exhaustAnimationFrame();

        expect(overlay.style.left).toBe('150px');
        expect(overlay.style.top).toBe('250px');
        expect(overlay.style.width).toBe('350px');
        expect(overlay.style.height).toBe('450px');
    });

    test('overlay re-attached before it was ever positioned is not shown with unset geometry', async () => {
        // `retainPreviousGeometry` must mean "has geometry worth keeping", not
        // merely "was re-attached". An overlay attached twice before the first
        // positioning frame runs (e.g. `addPanel({ renderer: 'always' })` then
        // `fromJSON(..., { reuseExistingPanels: true })` in the same tick) has
        // no left/top/width/height; un-hiding it would let the
        // `.dv-render-overlay` 100%/100% default cover the whole dock.
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

        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 1000, height: 1000 })
        );

        const replacementContainer: IRenderable = {
            element: document.createElement('div'),
            dropTarget: fromPartial<Droptarget>({}),
        };
        // Both containers measure 0x0 — nothing has been laid out yet.
        jest.spyOn(
            replacementContainer.element,
            'getBoundingClientRect'
        ).mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 0, height: 0 })
        );

        const overlay = cut.attach({ panel, referenceContainer });
        // Re-attach in the same tick, before any positioning frame has run.
        cut.attach({ panel, referenceContainer: replacementContainer });

        await exhaustMicrotaskQueue();

        // Nothing has been positioned, so the overlay must still be hidden.
        expect(overlay.style.visibility).toBe('hidden');

        await exhaustAnimationFrame();

        // Once the frame runs the geometry is written explicitly rather than
        // being left unset for the 100%/100% CSS default to fill in.
        expect(overlay.style.width).toBe('0px');
        expect(overlay.style.height).toBe('0px');
        expect(overlay.style.left).toBe('0px');
        expect(overlay.style.top).toBe('0px');
    });

    test('reposition against a new reference container is not swallowed by the superseded attach', async () => {
        // `pendingUpdates` is keyed by panel id only, so a frame queued by an
        // earlier `attach` (during `fromJSON` that is a detached staging group
        // measuring 0x0) used to block every later `resize` until it fired —
        // pushing the first correct paint out to `debouncedUpdateAllPositions`.
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

        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 1000, height: 1000 })
        );
        jest.spyOn(
            referenceContainer.element,
            'getBoundingClientRect'
        ).mockReturnValue(
            fromPartial<DOMRect>({
                left: 100,
                top: 200,
                width: 300,
                height: 400,
            })
        );

        const overlay = cut.attach({ panel, referenceContainer });
        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();
        expect(overlay.style.left).toBe('100px');

        // Stand in for the staging move: a dimensions change queues a frame
        // bound to the *old* reference container...
        onDidDimensionsChange.fire({});

        // ...and the panel is then re-attached over its real container.
        const replacementContainer: IRenderable = {
            element: document.createElement('div'),
            dropTarget: fromPartial<Droptarget>({}),
        };
        jest.spyOn(
            replacementContainer.element,
            'getBoundingClientRect'
        ).mockReturnValue(
            fromPartial<DOMRect>({
                left: 150,
                top: 250,
                width: 350,
                height: 450,
            })
        );
        cut.attach({ panel, referenceContainer: replacementContainer });

        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        // The very next frame reflects the new container, without waiting for
        // an external `updateAllPositions()`.
        expect(overlay.style.left).toBe('150px');
        expect(overlay.style.top).toBe('250px');
        expect(overlay.style.width).toBe('350px');
        expect(overlay.style.height).toBe('450px');
        expect(overlay.style.visibility).toBe('');
    });

    test('a detatch between two attaches does not let the superseded resize win', async () => {
        // `detatch` deletes the map entry, so a generation counter stored on the
        // entry restarts at 0 and the *superseded* attach can end up holding the
        // same generation as the live one. Its `resize` then passes the guard,
        // paints the removed element against the old container and occupies
        // `pendingUpdates`, so the live overlay is never positioned at all.
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

        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 1000, height: 1000 })
        );
        jest.spyOn(
            referenceContainer.element,
            'getBoundingClientRect'
        ).mockReturnValue(
            fromPartial<DOMRect>({
                left: 100,
                top: 200,
                width: 300,
                height: 400,
            })
        );

        const replacementContainer: IRenderable = {
            element: document.createElement('div'),
            dropTarget: fromPartial<Droptarget>({}),
        };
        jest.spyOn(
            replacementContainer.element,
            'getBoundingClientRect'
        ).mockReturnValue(
            fromPartial<DOMRect>({
                left: 150,
                top: 250,
                width: 350,
                height: 450,
            })
        );

        // attach -> detatch -> attach, all before any frame runs.
        cut.attach({ panel, referenceContainer });
        cut.detatch(panel);
        const overlay = cut.attach({
            panel,
            referenceContainer: replacementContainer,
        });

        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        // The live overlay is the one that gets positioned and revealed.
        expect(overlay.style.left).toBe('150px');
        expect(overlay.style.top).toBe('250px');
        expect(overlay.style.width).toBe('350px');
        expect(overlay.style.height).toBe('450px');
        expect(overlay.style.visibility).toBe('');
    });

    test('a detatch between two attaches over the SAME container does not let the superseded resize win', async () => {
        // Supersession cannot be judged by reference-container identity alone:
        // after a detatch the map entry is re-created, and if the panel is
        // re-attached to the same container the stale closure's container still
        // matches. It would then claim the update slot, position the removed
        // element, and mark the live entry as positioned — leaving the real
        // overlay unpositioned and, on the next attach, revealed at 100%/100%.
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

        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 1000, height: 1000 })
        );
        const rect = jest
            .spyOn(referenceContainer.element, 'getBoundingClientRect')
            .mockReturnValue(
                fromPartial<DOMRect>({
                    left: 100,
                    top: 200,
                    width: 300,
                    height: 400,
                })
            );

        cut.attach({ panel, referenceContainer });
        cut.detatch(panel);
        const overlay = cut.attach({ panel, referenceContainer });

        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        expect(overlay.style.left).toBe('100px');
        expect(overlay.style.top).toBe('200px');
        expect(overlay.style.width).toBe('300px');
        expect(overlay.style.height).toBe('400px');
        expect(overlay.style.visibility).toBe('');
    });

    test('a container that collapses to zero resets the overlay geometry', async () => {
        // `retainPreviousGeometry` means "a replacement reference container is
        // awaiting layout", so it must only be armed when the container
        // actually changes. Arming it on every re-attach makes the 0x0
        // early-return keep the last non-zero box forever, so an overlay whose
        // container genuinely collapses stays painted at its old size.
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

        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 1000, height: 1000 })
        );
        const rect = jest
            .spyOn(referenceContainer.element, 'getBoundingClientRect')
            .mockReturnValue(
                fromPartial<DOMRect>({
                    left: 100,
                    top: 200,
                    width: 300,
                    height: 400,
                })
            );

        const overlay = cut.attach({ panel, referenceContainer });
        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();
        expect(overlay.style.width).toBe('300px');

        // Re-attach over the same container (re-open / active panel change),
        // and let the container collapse before the next frame runs — so the
        // flag is still armed when the 0x0 box is measured.
        cut.attach({ panel, referenceContainer });
        rect.mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 0, height: 0 })
        );

        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        expect(overlay.style.width).toBe('0px');
        expect(overlay.style.height).toBe('0px');

        // ...and it does not stay stuck on later resizes either.
        onDidDimensionsChange.fire({});
        await exhaustAnimationFrame();
        expect(overlay.style.width).toBe('0px');
    });

    test('keeps repositioning when requestAnimationFrame runs its callback synchronously', async () => {
        // Several suites in this repo shim rAF to run inline, and non-browser
        // hosts commonly polyfill it the same way. Recording the frame handle
        // *after* scheduling then writes it back over the slot the callback
        // just cleared, so the overlay looks permanently "already scheduled"
        // and never repositions again.
        const originalRaf = global.requestAnimationFrame;
        global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        }) as typeof requestAnimationFrame;

        try {
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
                parentContainer,
                'getBoundingClientRect'
            ).mockReturnValue(
                fromPartial<DOMRect>({
                    left: 0,
                    top: 0,
                    width: 1000,
                    height: 1000,
                })
            );
            const rect = jest
                .spyOn(referenceContainer.element, 'getBoundingClientRect')
                .mockReturnValue(
                    fromPartial<DOMRect>({
                        left: 100,
                        top: 200,
                        width: 300,
                        height: 400,
                    })
                );

            const overlay = cut.attach({ panel, referenceContainer });
            await exhaustMicrotaskQueue();

            expect(overlay.style.left).toBe('100px');

            // Move the reference container and ask for a reposition.
            rect.mockReturnValue(
                fromPartial<DOMRect>({
                    left: 150,
                    top: 250,
                    width: 350,
                    height: 450,
                })
            );
            cut.updateAllPositions();

            expect(overlay.style.left).toBe('150px');
            expect(overlay.style.top).toBe('250px');
        } finally {
            global.requestAnimationFrame = originalRaf;
        }
    });

    test('re-attaching over the same container keeps a pending peek reposition', async () => {
        // `repositionPanelOverlay` schedules a frame carrying the sticky
        // `forceVisible`/`clip` peek state, and `attach` does not re-apply it —
        // a peeked panel's `api.isVisible` is false, so `visibilityChanged`
        // hides the overlay and only that frame brings it back. Cancelling
        // scheduled work on a same-container re-attach therefore blanks the
        // peeked panel.
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

        jest.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue(
            fromPartial<DOMRect>({ left: 0, top: 0, width: 1000, height: 1000 })
        );
        jest.spyOn(
            referenceContainer.element,
            'getBoundingClientRect'
        ).mockReturnValue(
            fromPartial<DOMRect>({
                left: 100,
                top: 200,
                width: 300,
                height: 400,
            })
        );

        const overlay = cut.attach({ panel, referenceContainer });
        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();
        expect(overlay.style.visibility).toBe('');

        // The peek collapses the group (so the panel is no longer "visible")
        // and force-shows the overlay, scheduling a frame.
        (panel as Writable<IDockviewPanel>).api.isVisible = false;
        cut.repositionPanelOverlay('test_panel_id', true);

        // A re-attach over the same container lands before that frame runs.
        cut.attach({ panel, referenceContainer });

        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        // The peek survives: still painted, and lifted over the peek backdrop.
        expect(overlay.style.visibility).toBe('');
        expect(overlay.style.zIndex).toBe('1000');
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

    test('detatch(...) leaves no strong reference to the measured reference element (#1596)', async () => {
        // The position cache measures the reference container's element during
        // attach. A strong Map entry outlives detatch()/fromJSON and pins the
        // detached panel/group DOM (and, through parent pointers, the whole
        // previous layout tree) for the lifetime of the component. Walk every
        // strongly-held property reachable from the container and assert the
        // element is gone once the panel is detatched. (A WeakMap is invisible
        // to this walk precisely because it cannot retain its keys.)
        const reachableFrom = (root: unknown, needle: unknown): boolean => {
            const seen = new Set<object>();
            const queue: unknown[] = [root];
            while (queue.length > 0) {
                const value = queue.pop();
                if (!value || typeof value !== 'object') {
                    continue;
                }
                if (value === needle) {
                    return true;
                }
                if (seen.has(value)) {
                    continue;
                }
                seen.add(value);
                if (value instanceof Map) {
                    for (const [key, entry] of value) {
                        queue.push(key, entry);
                    }
                } else if (value instanceof Set) {
                    for (const entry of value) {
                        queue.push(entry);
                    }
                }
                for (const key of Object.getOwnPropertyNames(value)) {
                    try {
                        queue.push((value as Record<string, unknown>)[key]);
                    } catch {
                        // Accessor threw; irrelevant for retention.
                    }
                }
            }
            return false;
        };

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

        cut.attach({ panel, referenceContainer });

        // Let the scheduled positioning run so the reference element is measured
        // (and therefore enters the position cache).
        await exhaustMicrotaskQueue();
        await exhaustAnimationFrame();

        // Sanity-check the walker against an element the container legitimately
        // holds for its lifetime.
        expect(reachableFrom(cut, parentContainer)).toBe(true);

        cut.detatch(panel);

        expect(reachableFrom(cut, referenceContainer.element)).toBe(false);
    });
});
