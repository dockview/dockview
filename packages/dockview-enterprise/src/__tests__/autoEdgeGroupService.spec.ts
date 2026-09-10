import { DockviewEmitter as Emitter } from 'dockview';
import type {
    DockviewWillDropEvent,
    DockviewWillShowOverlayLocationEvent,
    Position,
    PositionResolverArgs,
} from 'dockview';
import { AutoEdgeGroupService } from '../autoEdgeGroupService';

/**
 * AutoEdgeGroupService: the two-band drag-reveal affordance. Driven at the
 * service boundary with a mock host + synthetic overlay/drop events. The edge
 * band detection is pure geometry (depth from the drop-zone rect) and the
 * quadrant fallback is pure percentage math, so neither needs a real browser
 * layout.
 *
 * `autoEdgeGroups.spec.ts` already exercises the left-edge happy paths; this
 * suite fills the remaining branches: the right/top/bottom/center quadrant
 * fallback, the right/top/bottom highlight geometry, the disabled `resolveEdge`
 * guard, and the no-data drop guard.
 */
describe('auto edge group service (branch coverage)', () => {
    const ALL_ZONES: Position[] = ['left', 'right', 'top', 'bottom', 'center'];

    // A 1000x1000 content area anchored at the origin, so drop-zone px and the
    // synthetic clientX/clientY share one coordinate system.
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
        document.body.appendChild(overlayRoot);
        const emitter = new Emitter<DockviewWillShowOverlayLocationEvent>();
        const willDrop = new Emitter<DockviewWillDropEvent>();
        const reveal = jest.fn();
        // The real overlay event carries `suppressOverlay` (the seam the outer
        // band takes the drop target's own preview off with), so the synthetic
        // one has to as well; the spy is how the suppression is asserted.
        const suppressOverlay = jest.fn();
        const willShow = {
            fire: (e: unknown) =>
                emitter.fire({
                    suppressOverlay,
                    ...(e as object),
                } as DockviewWillShowOverlayLocationEvent),
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

    // resolver args whose edge-detection pointer sits dead-centre (far from every
    // edge band) so `resolveEdge` returns null and the quadrant fallback runs.
    // The quadrant is chosen purely by args.x / args.y against args.width/height.
    const quadrantArgs = (
        x: number,
        y: number,
        zones: Position[] = ALL_ZONES
    ): PositionResolverArgs => ({
        x,
        y,
        width: 1000,
        height: 1000,
        zones: new Set<Position>(zones),
        event: { clientX: 500, clientY: 500 } as any,
    });

    let created: AutoEdgeGroupService[];
    beforeEach(() => {
        created = [];
    });
    afterEach(() => {
        for (const s of created.splice(0)) {
            s.dispose();
        }
        document.body.innerHTML = '';
    });

    function host(dockToEdgeGroups: unknown = true) {
        const h = createHost(dockToEdgeGroups);
        created.push(h.service);
        return h;
    }

    // --- quadrant fallback (defaultQuadrant): right / top / bottom / center ---

    test('resolver falls back to each inner quadrant outside the edge band', () => {
        const { service } = host();
        const resolver = service.resolver!;

        // xp = 90 (> 80) → right split, not an edge (pointer is centred)
        expect(resolver.resolve(quadrantArgs(900, 500))).toEqual({
            position: 'right',
            edge: false,
        });
        // yp = 10 (< 20) → top split
        expect(resolver.resolve(quadrantArgs(500, 100))).toEqual({
            position: 'top',
            edge: false,
        });
        // yp = 90 (> 80) → bottom split
        expect(resolver.resolve(quadrantArgs(500, 900))).toEqual({
            position: 'bottom',
            edge: false,
        });
        // dead centre → center split
        expect(resolver.resolve(quadrantArgs(500, 500))).toEqual({
            position: 'center',
            edge: false,
        });
    });

    test('resolver yields null in the centre when the group rejects a tab-into (no center zone)', () => {
        const { service } = host();
        // centre pointer, but `center` is not an accepted zone → no split at all
        expect(
            service.resolver!.resolve(
                quadrantArgs(500, 500, ['left', 'right', 'top', 'bottom'])
            )
        ).toBeNull();
    });

    test('quadrant is gated by the accepted zones', () => {
        const { service } = host();
        // pointer is in the right quadrant, but `right` is not offered → falls
        // through to center (which is offered)
        expect(
            service.resolver!.resolve(quadrantArgs(900, 500, ['center']))
        ).toEqual({ position: 'center', edge: false });
    });

    // --- resolveEdge guard + edge detection on every edge ---

    test('resolveEdge returns null when the feature is disabled', () => {
        const { service } = host(false);
        // exercises the `!this._enabled` guard directly (resolver getter is
        // undefined when disabled, but resolveEdge is public for composition)
        expect(service.resolveEdge(quadrantArgs(5, 500))).toBeNull();
    });

    test('resolveEdge detects the outer band on right, top and bottom edges', () => {
        const { service } = host();
        const at = (
            clientX: number,
            clientY: number,
            zones: Position[] = ALL_ZONES
        ): PositionResolverArgs => ({
            x: clientX,
            y: clientY,
            width: 1000,
            height: 1000,
            zones: new Set<Position>(zones),
            event: { clientX, clientY } as any,
        });

        // 4px from the right edge (1000) → within the 24px band
        expect(service.resolveEdge(at(996, 500))).toEqual({
            position: 'right',
            edge: true,
            edgeGroup: true,
        });
        // 4px from the top edge
        expect(service.resolveEdge(at(500, 4))).toEqual({
            position: 'top',
            edge: true,
            edgeGroup: true,
        });
        // 4px from the bottom edge (1000)
        expect(service.resolveEdge(at(500, 996))).toEqual({
            position: 'bottom',
            edge: true,
            edgeGroup: true,
        });
        // exactly 24px in is still inside the band (<=)
        expect(service.resolveEdge(at(24, 500))).toEqual({
            position: 'left',
            edge: true,
            edgeGroup: true,
        });
        // 33px in is past the band, hysteresis included (24 + 8)
        expect(service.resolveEdge(at(33, 500))).toBeNull();
    });

    test('an event with no clientX/clientY treats the pointer as the origin', () => {
        const { service } = host();
        // clientX/clientY absent → edgeDepth falls back to 0, i.e. hard against
        // the top-left corner, so both the left and top bands register.
        const result = service.resolveEdge({
            x: 0,
            y: 0,
            width: 1000,
            height: 1000,
            zones: new Set<Position>(ALL_ZONES),
            event: {} as any,
        });
        expect(result).toEqual({
            position: 'left',
            edge: true,
            edgeGroup: true,
        });
    });

    test('resolveEdge only fires for edges present in the accepted zones', () => {
        const { service } = host();
        // pointer sits in the left band but `left` is not an accepted zone
        expect(
            service.resolveEdge({
                x: 4,
                y: 500,
                width: 1000,
                height: 1000,
                zones: new Set<Position>(['right', 'top', 'bottom', 'center']),
                event: { clientX: 4, clientY: 500 } as any,
            })
        ).toBeNull();
    });

    test('per-edge dockToEdgeGroups gates which edges become edge groups', () => {
        // only the left edge is enabled for edge-docking
        const { service } = host({ left: true });
        const at = (clientX: number): PositionResolverArgs => ({
            x: clientX,
            y: 500,
            width: 1000,
            height: 1000,
            zones: new Set<Position>(ALL_ZONES),
            event: { clientX, clientY: 500 } as any,
        });
        expect(service.resolveEdge(at(4))).toEqual({
            position: 'left',
            edge: true,
            edgeGroup: true,
        });
        // right band pointer: the edge is disabled per-edge → no edge cell
        expect(service.resolveEdge(at(996))).toBeNull();
    });

    // --- highlight geometry (_show) for right / top / bottom ---

    test('the highlight hugs the right edge with the right geometry', () => {
        const { service, overlayRoot, willShow } = host();
        willShow.fire({
            kind: 'edge',
            position: 'right',
            nativeEvent: { clientX: 996, clientY: 500 },
        } as any);
        const el = band(overlayRoot)!;
        expect(el).toBeTruthy();
        // left = dz.width - PREVIEW(36); a full-height vertical strip
        expect(el.style.left).toBe('964px');
        expect(el.style.top).toBe('0px');
        expect(el.style.width).toBe('36px');
        expect(el.style.height).toBe('1000px');
        expect(el.classList).toContain('dv-auto-edge-band-right');
        service.dispose();
    });

    test('the highlight hugs the top edge with the right geometry', () => {
        const { service, overlayRoot, willShow } = host();
        willShow.fire({
            kind: 'edge',
            position: 'top',
            nativeEvent: { clientX: 500, clientY: 4 },
        } as any);
        const el = band(overlayRoot)!;
        // a full-width horizontal strip at the top
        expect(el.style.left).toBe('0px');
        expect(el.style.top).toBe('0px');
        expect(el.style.width).toBe('1000px');
        expect(el.style.height).toBe('36px');
        expect(el.classList).toContain('dv-auto-edge-band-top');
        service.dispose();
    });

    test('the highlight hugs the bottom edge with the right geometry', () => {
        const { service, overlayRoot, willShow } = host();
        willShow.fire({
            kind: 'edge',
            position: 'bottom',
            nativeEvent: { clientX: 500, clientY: 996 },
        } as any);
        const el = band(overlayRoot)!;
        // a full-width horizontal strip at the bottom (top = height - PREVIEW)
        expect(el.style.left).toBe('0px');
        expect(el.style.top).toBe('964px');
        expect(el.style.width).toBe('1000px');
        expect(el.style.height).toBe('36px');
        expect(el.classList).toContain('dv-auto-edge-band-bottom');
        service.dispose();
    });

    test('the highlight element is reused across shows, not recreated', () => {
        const { service, overlayRoot, willShow } = host();
        willShow.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
        } as any);
        const first = band(overlayRoot)!;
        // move to the right band without an intervening hide (both are edges)
        willShow.fire({
            kind: 'edge',
            position: 'right',
            nativeEvent: { clientX: 996, clientY: 500 },
        } as any);
        expect(band(overlayRoot)).toBe(first);
        expect(overlayRoot.querySelectorAll('.dv-auto-edge-band')).toHaveLength(
            1
        );
        // it re-geometried to the right edge, and the per-edge modifier moved
        // with it so the accent rail is on the right-hand side
        expect(first.style.left).toBe('964px');
        expect(first.classList).toContain('dv-auto-edge-band-right');
        expect(first.classList).not.toContain('dv-auto-edge-band-left');
        service.dispose();
    });

    // --- onWillShowOverlay gating ---

    test('a center overlay hides the highlight (never an edge band)', () => {
        const { service, overlayRoot, willShow } = host();
        // show something first
        willShow.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
        } as any);
        expect(band(overlayRoot)).toBeTruthy();
        // a center position is never an edge band → hidden
        willShow.fire({
            kind: 'content',
            position: 'center',
            nativeEvent: { clientX: 500, clientY: 500 },
        } as any);
        expect(band(overlayRoot)).toBeNull();
        service.dispose();
    });

    // --- onWillDrop guards ---

    test('a drop with no drag data is a no-op (no reveal, no preventDefault)', () => {
        const { willDrop, reveal } = host();
        const preventDefault = jest.fn();
        willDrop.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
            getData: () => undefined,
            preventDefault,
        } as any);
        expect(reveal).not.toHaveBeenCalled();
        expect(preventDefault).not.toHaveBeenCalled();
    });

    test('a non-edge drop kind is left to core', () => {
        const { willDrop, reveal } = host();
        const preventDefault = jest.fn();
        willDrop.fire({
            kind: 'content',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
            getData: () => ({ groupId: 'g1', panelId: 'p1' }),
            preventDefault,
        } as any);
        expect(reveal).not.toHaveBeenCalled();
        expect(preventDefault).not.toHaveBeenCalled();
    });

    test('a center drop is left to core (center is never an edge group)', () => {
        const { willDrop, reveal } = host();
        const preventDefault = jest.fn();
        willDrop.fire({
            kind: 'edge',
            position: 'center',
            nativeEvent: { clientX: 500, clientY: 500 },
            getData: () => ({ groupId: 'g1', panelId: 'p1' }),
            preventDefault,
        } as any);
        expect(reveal).not.toHaveBeenCalled();
        expect(preventDefault).not.toHaveBeenCalled();
    });

    test('an outer-band drop reveals a right edge group and omits an absent panelId', () => {
        const { willDrop, reveal } = host();
        const preventDefault = jest.fn();
        willDrop.fire({
            kind: 'edge',
            position: 'right',
            nativeEvent: { clientX: 996, clientY: 500 },
            getData: () => ({ groupId: 'g1' }), // no panelId
            preventDefault,
        } as any);
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(reveal).toHaveBeenCalledWith(
            'right',
            { groupId: 'g1', panelId: undefined },
            { autoHide: true }
        );
    });

    // --- lifecycle / document-level cleanup ---

    test('a document drop event tears the highlight down', () => {
        const { overlayRoot, willShow } = host();
        willShow.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
        } as any);
        expect(band(overlayRoot)).toBeTruthy();

        document.dispatchEvent(new Event('drop', { bubbles: true }));
        expect(band(overlayRoot)).toBeNull();
    });

    test('a document dragend event tears the highlight down', () => {
        const { overlayRoot, willShow } = host();
        willShow.fire({
            kind: 'edge',
            position: 'top',
            nativeEvent: { clientX: 500, clientY: 4 },
        } as any);
        expect(band(overlayRoot)).toBeTruthy();

        document.dispatchEvent(new Event('dragend', { bubbles: true }));
        expect(band(overlayRoot)).toBeNull();
    });

    test('a document pointerup event tears the highlight down', () => {
        const { overlayRoot, willShow } = host();
        willShow.fire({
            kind: 'edge',
            position: 'bottom',
            nativeEvent: { clientX: 500, clientY: 996 },
        } as any);
        expect(band(overlayRoot)).toBeTruthy();

        document.dispatchEvent(new Event('pointerup', { bubbles: true }));
        expect(band(overlayRoot)).toBeNull();
    });

    test('dispose removes the highlight and detaches the document listeners', () => {
        const { service, overlayRoot, willShow } = host();
        willShow.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
        } as any);
        expect(band(overlayRoot)).toBeTruthy();

        service.dispose();
        expect(band(overlayRoot)).toBeNull();

        // after dispose the document listeners are gone: a later show still
        // works (emitter is detached too), and stray events do not throw
        expect(() =>
            document.dispatchEvent(new Event('pointerup', { bubbles: true }))
        ).not.toThrow();
    });

    test('the resolver getter is undefined when disabled and present when enabled', () => {
        expect(host(false).service.resolver).toBeUndefined();
        expect(host(true).service.resolver).toBeDefined();
    });
});
