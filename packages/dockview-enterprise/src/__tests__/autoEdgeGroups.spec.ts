import { DockviewComponent, DockviewEmitter as Emitter } from 'dockview';
import { IContentRenderer, Position } from 'dockview';
import { AutoEdgeGroupService } from '../autoEdgeGroupService';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        // noop
    }
    layout(): void {
        // noop
    }
    dispose(): void {
        // noop
    }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r));

/**
 * Drag-revealed, zero-footprint edges via a two-band drag-reveal affordance. A drag
 * toward a layout edge splits the widened root band into an outer "dock as edge
 * group" band (reveals a self-hiding edge group) and an inner "split the grid"
 * band (falls through to core's grid split).
 */
describe('auto edge groups (two-band drag reveal)', () => {
    const rect = {
        left: 0,
        top: 0,
        right: 1000,
        bottom: 1000,
        width: 1000,
        height: 1000,
    } as DOMRect;

    function createHost(dockToEdgeGroups: unknown = true) {
        const overlayRoot = document.createElement('div');
        const emitter = new Emitter<any>();
        const willDrop = new Emitter<any>();
        const reveal = jest.fn();
        // The real overlay event carries `suppressOverlay`; the spy stands in
        // for the drop target dropping its own preview for this frame.
        const suppressOverlay = jest.fn();
        const willShow = {
            fire: (e: any) => emitter.fire({ suppressOverlay, ...e }),
        };
        const host = {
            options: { dockToEdgeGroups },
            overlayRoot,
            getDropZoneRect: () => rect,
            onWillShowOverlay: emitter.event,
            onWillDrop: willDrop.event,
            revealEdgeGroupWithData: reveal,
        };
        const service = new AutoEdgeGroupService(host as any);
        return {
            service,
            overlayRoot,
            willShow,
            willDrop,
            reveal,
            suppressOverlay,
        };
    }

    const band = (root: HTMLElement): HTMLElement | null =>
        root.querySelector('.dv-auto-edge-band');

    test('outer band shows the edge-group highlight; inner band hides it', () => {
        const { service, overlayRoot, willShow } = createHost();

        // clientX = 5 → within the 24px outer band on the left edge
        willShow.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 5, clientY: 500 },
        });
        expect(band(overlayRoot)).toBeTruthy();

        // clientX = 40 → clear of the band and its hysteresis, so this is the
        // inner "split the grid" band; highlight removed
        willShow.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 40, clientY: 500 },
        });
        expect(band(overlayRoot)).toBeNull();

        service.dispose();
    });

    test('the outer band takes the drop target preview off, without cancelling the drop', () => {
        const { service, willShow, suppressOverlay } = createHost();

        // Outer band: this frame is the affordance's to draw, so the root edge
        // target must not also paint its "split the grid" overlay underneath.
        willShow.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 5, clientY: 500 },
        });
        expect(suppressOverlay).toHaveBeenCalledTimes(1);

        // Inner band: core's overlay is the right one, so it is left alone.
        willShow.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 40, clientY: 500 },
        });
        expect(suppressOverlay).toHaveBeenCalledTimes(1);

        service.dispose();
    });

    test('the band latches, so a wobble across the boundary does not flip the drop', () => {
        const { service, overlayRoot, willShow, willDrop, reveal } =
            createHost();
        const preventDefault = jest.fn();
        const over = (clientX: number): void =>
            willShow.fire({
                kind: 'edge',
                position: 'left',
                nativeEvent: { clientX, clientY: 500 },
            });

        over(5); // in the outer band
        expect(band(overlayRoot)).toBeTruthy();

        // Past the raw 24px boundary but inside the 8px hysteresis: still the
        // edge-group band, so the indicator holds instead of strobing.
        over(30);
        expect(band(overlayRoot)).toBeTruthy();

        // ...and a drop there commits the band that was being previewed.
        willDrop.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 30, clientY: 500 },
            getData: () => ({ groupId: 'g1', panelId: 'p1' }),
            preventDefault,
        });
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(reveal).toHaveBeenCalledTimes(1);

        service.dispose();
    });

    test('leaving the band releases the latch, so re-entry needs the full band again', () => {
        const { service, overlayRoot, willShow } = createHost();
        const over = (clientX: number): void =>
            willShow.fire({
                kind: 'edge',
                position: 'left',
                nativeEvent: { clientX, clientY: 500 },
            });

        over(5);
        over(40); // clear of band + hysteresis → latch released
        expect(band(overlayRoot)).toBeNull();

        // 30px would have held the latch, but it cannot re-arm it: coming back
        // in is judged against the plain 24px band.
        over(30);
        expect(band(overlayRoot)).toBeNull();

        over(20);
        expect(band(overlayRoot)).toBeTruthy();

        service.dispose();
    });

    test('outer-band drop reveals an edge group and preempts core', () => {
        const { service, willDrop, reveal } = createHost();
        const preventDefault = jest.fn();

        willDrop.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
            getData: () => ({ groupId: 'g1', panelId: 'p1' }),
            preventDefault,
        });

        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(reveal).toHaveBeenCalledWith(
            'left',
            { groupId: 'g1', panelId: 'p1' },
            { autoHide: true }
        );
        service.dispose();
    });

    test('inner-band drop is left to core (no reveal, no preventDefault)', () => {
        const { service, willDrop, reveal } = createHost();
        const preventDefault = jest.fn();

        willDrop.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 40, clientY: 500 },
            getData: () => ({ groupId: 'g1', panelId: 'p1' }),
            preventDefault,
        });

        expect(preventDefault).not.toHaveBeenCalled();
        expect(reveal).not.toHaveBeenCalled();
        service.dispose();
    });

    test('resolver marks the outer band as an edge cell, inner band as a split', () => {
        const { service } = createHost();
        const resolver = service.resolver!;
        expect(resolver).toBeDefined();

        // pointer 5px from the left content edge → edge cell (dock as edge group)
        expect(
            resolver.resolve({
                x: 5,
                y: 500,
                width: 1000,
                height: 1000,
                zones: new Set<Position>([
                    'left',
                    'right',
                    'top',
                    'bottom',
                    'center',
                ]),
                event: { clientX: 5, clientY: 500 } as any,
            })
        ).toEqual({ position: 'left', edge: true, edgeGroup: true });

        // pointer near the left but past the outer band → normal group split
        expect(
            resolver.resolve({
                x: 40,
                y: 500,
                width: 1000,
                height: 1000,
                zones: new Set<Position>([
                    'left',
                    'right',
                    'top',
                    'bottom',
                    'center',
                ]),
                event: { clientX: 40, clientY: 500 } as any,
            })
        ).toEqual({ position: 'left', edge: false });

        service.dispose();
    });

    test('resolver is undefined when dockToEdgeGroups is off', () => {
        const { service } = createHost(false);
        expect(service.resolver).toBeUndefined();
        service.dispose();
    });

    test('resolveEdge returns an edge cell only in the outer band (for composition)', () => {
        const { service } = createHost();
        const args = (clientX: number) => ({
            x: clientX,
            y: 500,
            width: 1000,
            height: 1000,
            zones: new Set<Position>(['left', 'right', 'top', 'bottom']),
            event: { clientX, clientY: 500 } as any,
        });
        // outer band → edge cell; inner → null so a composed resolver (compass)
        // handles it
        expect(service.resolveEdge(args(5))).toEqual({
            position: 'left',
            edge: true,
            edgeGroup: true,
        });
        expect(service.resolveEdge(args(40))).toBeNull();
        service.dispose();
    });

    test('a resolver-marked edge overlay (kind content) shows the highlight', () => {
        const { service, overlayRoot, willShow } = createHost();
        willShow.fire({
            kind: 'content',
            position: 'left',
            edge: true,
            nativeEvent: { clientX: 5, clientY: 500 },
        });
        expect(band(overlayRoot)).toBeTruthy();
        service.dispose();
    });

    test('a per-edge set gates the root drop path, not just the resolver', () => {
        // `dockToEdgeGroups: { left: true }` means the right edge is a plain
        // grid split. The root edge target activates on all four edges alike,
        // so the gate has to be applied where the drop is classified, not only
        // in the resolver the content targets use.
        const { service, overlayRoot, willShow, willDrop, reveal } = createHost(
            {
                left: true,
            } as never
        );
        const preventDefault = jest.fn();

        willShow.fire({
            kind: 'edge',
            position: 'right',
            nativeEvent: { clientX: 996, clientY: 500 },
        });
        expect(band(overlayRoot)).toBeNull();

        willDrop.fire({
            kind: 'edge',
            position: 'right',
            nativeEvent: { clientX: 996, clientY: 500 },
            getData: () => ({ groupId: 'g1', panelId: 'p1' }),
            preventDefault,
        });
        expect(reveal).not.toHaveBeenCalled();
        expect(preventDefault).not.toHaveBeenCalled();

        // ...while the enabled edge still docks
        willShow.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
        });
        expect(band(overlayRoot)).toBeTruthy();

        service.dispose();
    });

    test('does nothing when dockToEdgeGroups is off', () => {
        const { service, overlayRoot, willShow, willDrop, reveal } =
            createHost(false);
        const preventDefault = jest.fn();

        willShow.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
        });
        expect(band(overlayRoot)).toBeNull();

        willDrop.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
            getData: () => ({ groupId: 'g1', panelId: 'p1' }),
            preventDefault,
        });
        expect(reveal).not.toHaveBeenCalled();
        expect(preventDefault).not.toHaveBeenCalled();
        service.dispose();
    });
});

/**
 * Per-group auto-hide (Feature A): a static edge group and an auto-hiding one
 * co-exist. Only the group opted into auto-hide gets the tool-window chrome.
 */
describe('per-group auto-hide co-existence', () => {
    let container: HTMLElement;

    afterEach(() => {
        container?.remove();
    });

    test('only the autoHide edge group docks as a tool window', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            autoHideEdgeGroups: false, // global off
        });
        dockview.layout(1000, 1000);

        dockview.addEdgeGroup('left', {
            id: 'edge-left',
            initialSize: 200,
            autoHide: true,
        });
        dockview.addPanel({
            id: 'l1',
            component: 'default',
            position: { referenceGroup: 'edge-left' },
        });

        dockview.addEdgeGroup('right', { id: 'edge-right', initialSize: 200 });
        dockview.addPanel({
            id: 'r1',
            component: 'default',
            position: { referenceGroup: 'edge-right' },
        });

        await flush(); // docked chrome is set up in a microtask

        const leftEl = dockview.getEdgeGroupPanel('left')!.element;
        const rightEl = dockview.getEdgeGroupPanel('right')!.element;

        expect(leftEl.querySelector('.dv-edge-peek-header')).toBeTruthy();
        expect(rightEl.querySelector('.dv-edge-peek-header')).toBeNull();

        dockview.dispose();
    });

    test('setAutoHide(true) at runtime docks a previously static edge group', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            autoHideEdgeGroups: false,
        });
        dockview.layout(1000, 1000);

        dockview.addEdgeGroup('left', { id: 'edge-left', initialSize: 200 });
        dockview.addPanel({
            id: 'l1',
            component: 'default',
            position: { referenceGroup: 'edge-left' },
        });
        await flush();

        const el = dockview.getEdgeGroupPanel('left')!.element;
        expect(el.querySelector('.dv-edge-peek-header')).toBeNull();

        dockview.getEdgeGroup('left')!.setAutoHide(true);
        await flush();
        expect(el.querySelector('.dv-edge-peek-header')).toBeTruthy();

        dockview.dispose();
    });
});
