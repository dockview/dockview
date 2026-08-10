import {
    FloatingGroupModule,
    FloatingGroupService,
} from '../../dockview/floatingGroupService';
import { Emitter } from '../../events';
import { DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE } from '../../constants';

/**
 * These tests exercise the FloatingGroupService in isolation. The service is
 * intentionally decoupled from DockviewComponent (it only depends on the
 * narrow `IFloatingGroupHost` surface), so it is driven here with lightweight
 * mock host / overlay / gridview / group objects wired up with real Emitters.
 *
 * The `add` method constructs a real `DockviewFloatingGroupPanel`, so the mock
 * overlay / gridview must satisfy the `IDisposable` contract it relies on.
 */

interface MockEmitters {
    activeChange: Emitter<{ isActive: boolean }>;
    activePanelChange: Emitter<void>;
    groupChange: Emitter<{ height?: number; width?: number } | undefined>;
    overlayChange: Emitter<void>;
    overlayChangeEnd: Emitter<void>;
}

function createMocks(options?: {
    activePanelTitle?: string | undefined;
    headerHeight?: number;
    serializeRoot?: any;
    gridWidth?: number;
    gridHeight?: number;
    toJSON?: any;
}) {
    const emitters: MockEmitters = {
        activeChange: new Emitter(),
        activePanelChange: new Emitter(),
        groupChange: new Emitter(),
        overlayChange: new Emitter(),
        overlayChangeEnd: new Emitter(),
    };

    const overlayElement = document.createElement('div');
    const gridviewElement = document.createElement('div');
    const groupElement = document.createElement('div');

    const overlay: any = {
        element: overlayElement,
        headerHeight: options?.headerHeight ?? 0,
        onDidChange: emitters.overlayChange.event,
        onDidChangeEnd: emitters.overlayChangeEnd.event,
        bringToFront: jest.fn(),
        setBounds: jest.fn(),
        measureBoxes: jest.fn(() => ({
            container: { left: 0, top: 0, width: 0, height: 0 } as DOMRect,
            overlay: { left: 0, top: 0, width: 0, height: 0 } as DOMRect,
        })),
        applyConstraint: jest.fn(),
        toJSON: jest.fn(
            () => options?.toJSON ?? { left: 0, top: 0, width: 0, height: 0 }
        ),
        minimumInViewportWidth: -1,
        minimumInViewportHeight: -1,
        dispose: jest.fn(),
    };

    const gridview: any = {
        element: gridviewElement,
        width: options?.gridWidth ?? 200,
        height: options?.gridHeight ?? 100,
        layout: jest.fn(),
        serialize: jest.fn(() => ({
            root: options?.serializeRoot ?? {
                type: 'branch',
                data: [{ type: 'leaf', data: { id: 'leaf-1' } }],
            },
            width: 200,
            height: 100,
            orientation: 'HORIZONTAL',
        })),
        dispose: jest.fn(),
    };

    const group: any = {
        element: groupElement,
        activePanel:
            options && 'activePanelTitle' in options
                ? { title: options.activePanelTitle }
                : { title: 'panel-title' },
        api: {
            onDidActiveChange: emitters.activeChange.event,
            onDidActivePanelChange: emitters.activePanelChange.event,
        },
        onDidChange: emitters.groupChange.event,
        model: { location: { type: 'floating' } },
    };

    const host = { fireLayoutChange: jest.fn() };

    return { emitters, overlay, gridview, group, host };
}

describe('FloatingGroupService', () => {
    test('FloatingGroupModule wires the service to its host', () => {
        const host = { fireLayoutChange: jest.fn() };
        expect(FloatingGroupModule.moduleName).toBe('FloatingGroup');

        const factory = (FloatingGroupModule.services as any)
            .floatingGroupService as (h: typeof host) => FloatingGroupService;
        const service = factory(host);

        expect(service).toBeInstanceOf(FloatingGroupService);
        expect(service.floatingGroups).toEqual([]);
    });

    test('starts with no floating groups', () => {
        const { host } = createMocks();
        const service = new FloatingGroupService(host);
        expect(service.floatingGroups).toEqual([]);
    });

    test('add registers a floating group and returns the panel', () => {
        const { host, overlay, gridview, group } = createMocks();
        const service = new FloatingGroupService(host);

        const panel = service.add(group, overlay, gridview);

        expect(service.floatingGroups).toHaveLength(1);
        expect(service.floatingGroups[0]).toBe(panel);
        expect(panel.group).toBe(group);
        expect(panel.overlay).toBe(overlay);
        expect(panel.gridview).toBe(gridview);
    });

    test('add sets an aria-label from the active panel title', () => {
        const { host, overlay, gridview, group } = createMocks({
            activePanelTitle: 'My Panel',
        });
        const service = new FloatingGroupService(host);

        service.add(group, overlay, gridview);

        expect(overlay.element.getAttribute('aria-label')).toBe('My Panel');
    });

    test('add leaves the dialog unnamed when the active panel has no title', () => {
        const { host, overlay, gridview, group } = createMocks({
            activePanelTitle: undefined,
        });
        const service = new FloatingGroupService(host);

        service.add(group, overlay, gridview);

        expect(overlay.element.hasAttribute('aria-label')).toBe(false);
    });

    test('the aria-label refreshes when the active panel changes', () => {
        const { host, overlay, gridview, group, emitters } = createMocks({
            activePanelTitle: 'first',
        });
        const service = new FloatingGroupService(host);
        service.add(group, overlay, gridview);
        expect(overlay.element.getAttribute('aria-label')).toBe('first');

        group.activePanel = { title: 'second' };
        emitters.activePanelChange.fire();
        expect(overlay.element.getAttribute('aria-label')).toBe('second');

        // an untitled active panel removes the label again
        group.activePanel = { title: undefined };
        emitters.activePanelChange.fire();
        expect(overlay.element.hasAttribute('aria-label')).toBe(false);
    });

    test('activating the group brings its overlay to front', () => {
        const { host, overlay, gridview, group, emitters } = createMocks();
        const service = new FloatingGroupService(host);
        service.add(group, overlay, gridview);

        emitters.activeChange.fire({ isActive: false });
        expect(overlay.bringToFront).not.toHaveBeenCalled();

        emitters.activeChange.fire({ isActive: true });
        expect(overlay.bringToFront).toHaveBeenCalledTimes(1);
    });

    test('overlay onDidChange re-layouts the nested gridview at its current size', () => {
        const { host, overlay, gridview, group, emitters } = createMocks({
            gridWidth: 321,
            gridHeight: 234,
        });
        const service = new FloatingGroupService(host);
        service.add(group, overlay, gridview);

        emitters.overlayChange.fire();
        expect(gridview.layout).toHaveBeenLastCalledWith(321, 234);
    });

    test('overlay onDidChangeEnd notifies the host of a layout change', () => {
        const { host, overlay, gridview, group, emitters } = createMocks();
        const service = new FloatingGroupService(host);
        service.add(group, overlay, gridview);

        expect(host.fireLayoutChange).not.toHaveBeenCalled();
        emitters.overlayChangeEnd.fire();
        expect(host.fireLayoutChange).toHaveBeenCalledTimes(1);
    });

    test('group onDidChange with a numeric height adds the header height back to the overlay bounds', () => {
        const { host, overlay, gridview, group, emitters } = createMocks({
            headerHeight: 30,
        });
        const service = new FloatingGroupService(host);
        service.add(group, overlay, gridview);

        emitters.groupChange.fire({ height: 100, width: 250 });
        expect(overlay.setBounds).toHaveBeenLastCalledWith({
            height: 130,
            width: 250,
        });
    });

    test('group onDidChange without a numeric height passes the value through unchanged', () => {
        const { host, overlay, gridview, group, emitters } = createMocks({
            headerHeight: 30,
        });
        const service = new FloatingGroupService(host);
        service.add(group, overlay, gridview);

        emitters.groupChange.fire({ width: 250 });
        expect(overlay.setBounds).toHaveBeenLastCalledWith({
            height: undefined,
            width: 250,
        });
    });

    test('group onDidChange tolerates an undefined event', () => {
        const { host, overlay, gridview, group, emitters } = createMocks();
        const service = new FloatingGroupService(host);
        service.add(group, overlay, gridview);

        expect(() => emitters.groupChange.fire(undefined)).not.toThrow();
        expect(overlay.setBounds).toHaveBeenLastCalledWith({
            height: undefined,
            width: undefined,
        });
    });

    describe('findByGroup', () => {
        test('finds a floating group by its anchor group', () => {
            const { host, overlay, gridview, group } = createMocks();
            const service = new FloatingGroupService(host);
            const panel = service.add(group, overlay, gridview);

            expect(service.findByGroup(group)).toBe(panel);
        });

        test('finds a floating group when the queried group lives inside its gridview', () => {
            const { host, overlay, gridview, group } = createMocks();
            const service = new FloatingGroupService(host);
            const panel = service.add(group, overlay, gridview);

            const nested: any = { element: document.createElement('div') };
            gridview.element.appendChild(nested.element);

            expect(service.findByGroup(nested)).toBe(panel);
        });

        test('returns undefined for an unrelated group', () => {
            const { host, overlay, gridview, group } = createMocks();
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);

            const other: any = { element: document.createElement('div') };
            expect(service.findByGroup(other)).toBeUndefined();
        });
    });

    describe('serialize', () => {
        test('emits the legacy single-group `data` shape for a single-leaf window', () => {
            const { host, overlay, gridview, group } = createMocks({
                serializeRoot: {
                    type: 'branch',
                    data: [{ type: 'leaf', data: { id: 'the-leaf' } }],
                },
                toJSON: { left: 5, top: 6, width: 7, height: 8 },
            });
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);

            const result = service.serialize();
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                data: { id: 'the-leaf' },
                position: { left: 5, top: 6, width: 7, height: 8 },
            });
            expect((result[0] as any).grid).toBeUndefined();
        });

        test('emits the nested `grid` shape for a multi-group window', () => {
            const root = {
                type: 'branch',
                data: [
                    { type: 'leaf', data: { id: 'a' } },
                    { type: 'leaf', data: { id: 'b' } },
                ],
            };
            const { host, overlay, gridview, group } = createMocks({
                serializeRoot: root,
                toJSON: { left: 1, top: 2, width: 3, height: 4 },
            });
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);

            const result = service.serialize();
            expect(result).toHaveLength(1);
            expect((result[0] as any).data).toBeUndefined();
            expect((result[0] as any).grid.root).toBe(root);
            expect(result[0].position).toEqual({
                left: 1,
                top: 2,
                width: 3,
                height: 4,
            });
        });

        test('emits the nested `grid` shape when the single child is not a leaf', () => {
            const root = {
                type: 'branch',
                data: [{ type: 'branch', data: [] }],
            };
            const { host, overlay, gridview, group } = createMocks({
                serializeRoot: root,
            });
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);

            const result = service.serialize();
            expect((result[0] as any).data).toBeUndefined();
            expect((result[0] as any).grid.root).toBe(root);
        });
    });

    describe('constrainBounds', () => {
        test('re-applies bounds on every floating overlay', () => {
            const { host, overlay, gridview, group } = createMocks();
            const second = createMocks();
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);
            service.add(second.group, second.overlay, second.gridview);

            const order: string[] = [];
            for (const o of [overlay, second.overlay]) {
                o.measureBoxes.mockClear();
                o.applyConstraint.mockClear();
                o.measureBoxes.mockImplementation(() => {
                    order.push('measure');
                    return {
                        container: { left: 0, top: 0, width: 0, height: 0 },
                        overlay: { left: 0, top: 0, width: 0, height: 0 },
                    };
                });
                o.applyConstraint.mockImplementation(() => order.push('apply'));
            }

            service.constrainBounds();

            // Each overlay is measured once and constrained once...
            expect(overlay.measureBoxes).toHaveBeenCalledTimes(1);
            expect(overlay.applyConstraint).toHaveBeenCalledTimes(1);
            expect(second.overlay.measureBoxes).toHaveBeenCalledTimes(1);
            expect(second.overlay.applyConstraint).toHaveBeenCalledTimes(1);
            // ...and — the point of the two-pass — every measure (read) happens
            // before every apply (write), so the batch costs one reflow, not N.
            expect(order).toEqual(['measure', 'measure', 'apply', 'apply']);
        });
    });

    describe('updateBounds', () => {
        test('is a no-op when the options do not mention floatingGroupBounds', () => {
            const { host, overlay, gridview, group } = createMocks();
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);
            overlay.setBounds.mockClear();

            service.updateBounds({});

            expect(overlay.setBounds).not.toHaveBeenCalled();
        });

        test('boundedWithinViewport clears the minimum in-viewport sizes', () => {
            const { host, overlay, gridview, group } = createMocks();
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);
            overlay.setBounds.mockClear();

            service.updateBounds({
                floatingGroupBounds: 'boundedWithinViewport',
            });

            expect(overlay.minimumInViewportHeight).toBeUndefined();
            expect(overlay.minimumInViewportWidth).toBeUndefined();
            expect(overlay.setBounds).toHaveBeenCalledTimes(1);
        });

        test('an undefined bound restores the default overflow size', () => {
            const { host, overlay, gridview, group } = createMocks();
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);
            overlay.setBounds.mockClear();

            service.updateBounds({ floatingGroupBounds: undefined });

            expect(overlay.minimumInViewportHeight).toBe(
                DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE
            );
            expect(overlay.minimumInViewportWidth).toBe(
                DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE
            );
            expect(overlay.setBounds).toHaveBeenCalledTimes(1);
        });

        test('an explicit bound object applies the requested minimum sizes', () => {
            const { host, overlay, gridview, group } = createMocks();
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);
            overlay.setBounds.mockClear();

            service.updateBounds({
                floatingGroupBounds: {
                    minimumHeightWithinViewport: 42,
                    minimumWidthWithinViewport: 84,
                },
            });

            expect(overlay.minimumInViewportHeight).toBe(42);
            expect(overlay.minimumInViewportWidth).toBe(84);
            expect(overlay.setBounds).toHaveBeenCalledTimes(1);
        });
    });

    describe('disposal', () => {
        test('disposing a floating panel removes it and resets the group to the grid', () => {
            const { host, overlay, gridview, group } = createMocks();
            const service = new FloatingGroupService(host);
            const panel = service.add(group, overlay, gridview);

            panel.dispose();

            expect(service.floatingGroups).toHaveLength(0);
            expect(group.model.location).toEqual({ type: 'grid' });
            expect(overlay.dispose).toHaveBeenCalled();
            expect(gridview.dispose).toHaveBeenCalled();
        });

        test('disposeAll tears down every floating group', () => {
            const { host, overlay, gridview, group } = createMocks();
            const second = createMocks();
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);
            service.add(second.group, second.overlay, second.gridview);
            expect(service.floatingGroups).toHaveLength(2);

            service.disposeAll();

            expect(service.floatingGroups).toHaveLength(0);
            expect(overlay.dispose).toHaveBeenCalled();
            expect(second.overlay.dispose).toHaveBeenCalled();
        });

        test('dispose() delegates to disposeAll', () => {
            const { host, overlay, gridview, group } = createMocks();
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);

            service.dispose();

            expect(service.floatingGroups).toHaveLength(0);
            expect(overlay.dispose).toHaveBeenCalled();
        });

        test('after disposal, group events no longer drive the overlay', () => {
            const { host, overlay, gridview, group, emitters } = createMocks();
            const service = new FloatingGroupService(host);
            const panel = service.add(group, overlay, gridview);

            panel.dispose();
            overlay.bringToFront.mockClear();
            host.fireLayoutChange.mockClear();

            emitters.activeChange.fire({ isActive: true });
            emitters.overlayChangeEnd.fire();

            expect(overlay.bringToFront).not.toHaveBeenCalled();
            expect(host.fireLayoutChange).not.toHaveBeenCalled();
        });
    });

    describe('nested gridview resize wiring', () => {
        let OriginalResizeObserver: typeof window.ResizeObserver;
        let capturedCallback:
            | ((entries: Array<{ contentRect: DOMRectReadOnly }>) => void)
            | undefined;

        let rafSpy: jest.SpyInstance;

        beforeEach(() => {
            // watchElementResize defers the callback to requestAnimationFrame;
            // run it synchronously so the resize handling is deterministic.
            rafSpy = jest
                .spyOn(window, 'requestAnimationFrame')
                .mockImplementation((cb: FrameRequestCallback): number => {
                    cb(0);
                    return 0;
                });
            OriginalResizeObserver = window.ResizeObserver;
            capturedCallback = undefined;
            (window as any).ResizeObserver = class {
                constructor(
                    cb: (
                        entries: Array<{ contentRect: DOMRectReadOnly }>
                    ) => void
                ) {
                    capturedCallback = cb;
                }
                observe(): void {
                    /* noop */
                }
                unobserve(): void {
                    /* noop */
                }
                disconnect(): void {
                    /* noop */
                }
            };
        });

        afterEach(() => {
            window.ResizeObserver = OriginalResizeObserver;
            rafSpy.mockRestore();
        });

        test('a resize lays out the gridview at the measured content box, skipping unchanged sizes', () => {
            const { host, overlay, gridview, group } = createMocks();
            const service = new FloatingGroupService(host);
            service.add(group, overlay, gridview);

            expect(capturedCallback).toBeDefined();

            capturedCallback!([
                {
                    contentRect: {
                        width: 150.4,
                        height: 80.6,
                    } as DOMRectReadOnly,
                },
            ]);
            expect(gridview.layout).toHaveBeenLastCalledWith(150, 81);

            const callsAfterFirst = gridview.layout.mock.calls.length;

            // firing again with the same rounded size is ignored
            capturedCallback!([
                {
                    contentRect: {
                        width: 150.1,
                        height: 81.2,
                    } as DOMRectReadOnly,
                },
            ]);
            expect(gridview.layout.mock.calls).toHaveLength(callsAfterFirst);

            // a genuinely different size lays out again
            capturedCallback!([
                { contentRect: { width: 200, height: 120 } as DOMRectReadOnly },
            ]);
            expect(gridview.layout).toHaveBeenLastCalledWith(200, 120);
        });
    });
});
