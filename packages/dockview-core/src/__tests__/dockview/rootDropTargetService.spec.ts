import { fromPartial } from '@total-typescript/shoehorn';
import {
    IRootDropTargetHost,
    RootDropTargetService,
} from '../../dockview/rootDropTargetService';
import { fireEvent } from '@testing-library/dom';
import { DroptargetOverlayModel, Position } from '../../dnd/droptarget';
import { DockviewComponentOptions } from '../../dockview/options';
import { createOffsetDragOverEvent } from '../__test_utils__/utils';

function createHost(
    options: Partial<DockviewComponentOptions>
): IRootDropTargetHost {
    return fromPartial<IRootDropTargetHost>({
        id: 'test',
        element: document.createElement('div'),
        options: options as DockviewComponentOptions,
        isGridEmpty: () => true,
        rootDropTargetOverrideTarget: () => undefined,
        dispatchUnhandledDragOver: () => false,
    });
}

// Reach the (private) backend drop targets to assert the applied overlay model.
function overlayModels(
    service: RootDropTargetService
): (DroptargetOverlayModel | undefined)[] {
    const s = service as any;
    return [
        s._html5Target.options.overlayModel,
        s._pointerTarget.options.overlayModel,
    ];
}

function disabledFlags(service: RootDropTargetService): boolean[] {
    const s = service as any;
    return [s._html5Target.disabled, s._pointerTarget.disabled];
}

describe('RootDropTargetService', () => {
    test('a `dndEdges` object is applied to both backends at construction', () => {
        const model: DroptargetOverlayModel = {
            activationSize: { type: 'pixels', value: 30 },
            size: { type: 'pixels', value: 40 },
        };

        const service = new RootDropTargetService(
            createHost({ dndEdges: model })
        );

        expect(overlayModels(service)).toEqual([model, model]);

        service.dispose();
    });

    test('omitting `dndEdges` falls back to the default overlay model', () => {
        const service = new RootDropTargetService(createHost({}));

        const [html5, pointer] = overlayModels(service);
        expect(html5).toEqual({
            activationSize: { type: 'pixels', value: 10 },
            size: { type: 'pixels', value: 20 },
        });
        expect(pointer).toEqual(html5);

        service.dispose();
    });

    test('setOptions applies a new `dndEdges` overlay model to both backends', () => {
        const service = new RootDropTargetService(createHost({}));

        const model: DroptargetOverlayModel = {
            activationSize: { type: 'percentage', value: 25 },
            size: { type: 'percentage', value: 50 },
        };
        service.setOptions({ dndEdges: model });

        expect(overlayModels(service)).toEqual([model, model]);

        service.dispose();
    });

    // Propagation only — that the flag actually stops a target resolving is
    // covered per-backend in `dnd/droptarget.spec.ts`. This assertion passed
    // for the whole time `Droptarget` ignored the flag it was handed.
    test('`dndEdges: false` sets the disabled flag on both backends', () => {
        const service = new RootDropTargetService(createHost({}));
        expect(disabledFlags(service)).toEqual([false, false]);

        service.setOptions({ dndEdges: false });
        expect(disabledFlags(service)).toEqual([true, true]);

        service.dispose();
    });

    /** With the drag-reveal affordance, only enabled edges get the widened
     *  band; disabled edges keep the default 10px. */
    describe('edge activation band with the drag-reveal affordance', () => {
        const WIDTH = 1000;
        const HEIGHT = 600;

        function resolveAt(
            options: Partial<DockviewComponentOptions>,
            clientX: number,
            clientY: number,
            over: 'layout' | 'header' | 'content' = 'layout'
        ): Position | undefined {
            const host = fromPartial<IRootDropTargetHost>({
                ...createHost(options),
                hasEdgeDragReveal: true,
                isGridEmpty: () => false,
                dispatchUnhandledDragOver: () => true,
            });
            jest.spyOn(host.element, 'offsetWidth', 'get').mockReturnValue(
                WIDTH
            );
            jest.spyOn(host.element, 'offsetHeight', 'get').mockReturnValue(
                HEIGHT
            );
            const service = new RootDropTargetService(host);
            // The module's `init` hook, once the affordance is registered.
            service.setOptions(host.options);

            let position: Position | undefined;
            service.onWillShowOverlay((e) => {
                position = e.position;
            });

            // The element under the pointer.
            let target = host.element;
            if (over !== 'layout') {
                const container = document.createElement('div');
                container.className =
                    over === 'header'
                        ? 'dv-tabs-and-actions-container'
                        : 'dv-content-container';
                target = document.createElement('div');
                container.appendChild(target);
                host.element.appendChild(container);
            }

            fireEvent.dragEnter(target);
            fireEvent(target, createOffsetDragOverEvent({ clientX, clientY }));

            service.dispose();
            return position;
        }

        const PER_EDGE: Partial<DockviewComponentOptions> = {
            dockToEdgeGroups: { left: true, right: true, bottom: true },
        };

        test('a disabled edge keeps the default band', () => {
            // 20px in from the top: inside the widened band, outside the default.
            expect(resolveAt(PER_EDGE, WIDTH / 2, 20)).toBeUndefined();
            expect(resolveAt(PER_EDGE, WIDTH / 2, 5)).toBe('top');
        });

        test('an enabled edge gets the widened band', () => {
            expect(resolveAt(PER_EDGE, 20, HEIGHT / 2)).toBe('left');
            expect(resolveAt(PER_EDGE, WIDTH - 20, HEIGHT / 2)).toBe('right');
            expect(resolveAt(PER_EDGE, WIDTH / 2, HEIGHT - 20)).toBe('bottom');
        });

        test('`dockToEdgeGroups: true` widens every edge', () => {
            const all = { dockToEdgeGroups: true };
            expect(resolveAt(all, WIDTH / 2, 20)).toBe('top');
            expect(resolveAt(all, 20, HEIGHT / 2)).toBe('left');
        });

        test('a disabled edge declines in the corner it shares with an enabled one', () => {
            // 20px from both top and left: the enabled left edge claims it.
            expect(resolveAt(PER_EDGE, 20, 20)).toBe('left');
        });

        test('a `dropPositionResolver` still takes precedence', () => {
            const resolve = jest.fn(() => ({ position: 'top' as Position }));
            expect(
                resolveAt(
                    { ...PER_EDGE, dropPositionResolver: { resolve } },
                    WIDTH / 2,
                    HEIGHT / 2
                )
            ).toBe('top');
            expect(resolve).toHaveBeenCalled();
        });

        /** Headers win over the band on enabled edges, matching the pointer
         *  backend's innermost-target-first. */
        describe('group headers on an enabled edge', () => {
            const TOP = { dockToEdgeGroups: { top: true } };

            test('the root declines over a header, in both sub-bands', () => {
                expect(resolveAt(TOP, WIDTH / 2, 4, 'header')).toBeUndefined();
                expect(resolveAt(TOP, WIDTH / 2, 20, 'header')).toBeUndefined();
            });

            test('the root still claims the band over panel content', () => {
                expect(resolveAt(TOP, WIDTH / 2, 4, 'content')).toBe('top');
                expect(resolveAt(TOP, WIDTH / 2, 20, 'content')).toBe('top');
            });

            test('a disabled edge keeps its default band over a header', () => {
                expect(resolveAt(PER_EDGE, WIDTH / 2, 5, 'header')).toBe('top');
            });

            test('a custom `dndEdges` band is left alone', () => {
                const custom: Partial<DockviewComponentOptions> = {
                    ...TOP,
                    dndEdges: {
                        activationSize: { type: 'pixels', value: 32 },
                        size: { type: 'pixels', value: 20 },
                    },
                };
                expect(resolveAt(custom, WIDTH / 2, 20, 'header')).toBe('top');
            });
        });
    });
});
