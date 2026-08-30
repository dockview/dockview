import { fromPartial } from '@total-typescript/shoehorn';
import {
    IRootDropTargetHost,
    RootDropTargetService,
} from '../../dockview/rootDropTargetService';
import { DroptargetOverlayModel } from '../../dnd/droptarget';
import { DockviewComponentOptions } from '../../dockview/options';

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

    // Propagation only: that the flag actually stops a target resolving is
    // covered per-backend in `dnd/droptarget.spec.ts`. This assertion passed
    // for the whole time `Droptarget` ignored the flag it was handed.
    test('`dndEdges: false` sets the disabled flag on both backends', () => {
        const service = new RootDropTargetService(createHost({}));
        expect(disabledFlags(service)).toEqual([false, false]);

        service.setOptions({ dndEdges: false });
        expect(disabledFlags(service)).toEqual([true, true]);

        service.dispose();
    });
});
