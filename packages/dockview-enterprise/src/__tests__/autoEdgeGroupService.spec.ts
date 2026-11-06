import {
    DockviewEmitter as Emitter,
    LocalSelectionTransfer,
    PanelTransfer,
} from 'dockview';
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
        const willShow = new Emitter<DockviewWillShowOverlayLocationEvent>();
        const willDrop = new Emitter<DockviewWillDropEvent>();
        const willDragPanel = new Emitter<any>();
        const willDragGroup = new Emitter<any>();
        const reveal = jest.fn();
        const dropTargets: { position: string; dispose: jest.Mock }[] = [];
        const createEdgeDropTarget = jest.fn(
            (_element: HTMLElement, position: string) => {
                const target = { position, dispose: jest.fn() };
                dropTargets.push(target);
                return target;
            }
        );
        const host = {
            options: { dockToEdgeGroups },
            overlayRoot,
            getDropZoneRect: () => rect,
            onWillShowOverlay: willShow.event,
            onWillDrop: willDrop.event,
            onWillDragPanel: willDragPanel.event,
            onWillDragGroup: willDragGroup.event,
            createEdgeDropTarget,
            revealEdgeGroupWithData: reveal,
        };
        const service = new AutoEdgeGroupService(host as any);
        return {
            service,
            overlayRoot,
            willShow,
            willDrop,
            willDragPanel,
            willDragGroup,
            reveal,
            createEdgeDropTarget,
            dropTargets,
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

        // 4px from the right edge (1000) → within the 16px band
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
        // exactly 16px in is still inside the band (<=)
        expect(service.resolveEdge(at(16, 500))).toEqual({
            position: 'left',
            edge: true,
            edgeGroup: true,
        });
        // 17px in is past the band
        expect(service.resolveEdge(at(17, 500))).toBeNull();
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

    // A root edge overlay/drop on a disabled edge is an ordinary grid split,
    // even within the outer band.
    test('a disabled edge shows no highlight and is not docked as an edge group', () => {
        const { overlayRoot, willShow, willDrop, reveal } = host({
            left: true,
            right: true,
            bottom: true,
        });
        willShow.fire({
            kind: 'edge',
            position: 'top',
            nativeEvent: { clientX: 500, clientY: 4 },
        } as any);
        expect(band(overlayRoot)).toBeNull();

        const preventDefault = jest.fn();
        willDrop.fire({
            kind: 'edge',
            position: 'top',
            nativeEvent: { clientX: 500, clientY: 4 },
            getData: () => ({ groupId: 'g1', panelId: 'p1' }),
            preventDefault,
        } as any);
        expect(preventDefault).not.toHaveBeenCalled();
        expect(reveal).not.toHaveBeenCalled();

        // The enabled edges still dock.
        willShow.fire({
            kind: 'edge',
            position: 'left',
            nativeEvent: { clientX: 4, clientY: 500 },
        } as any);
        expect(band(overlayRoot)).toBeTruthy();
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
        // left = dz.width - LINE(3); a full-height vertical line
        expect(el.style.left).toBe('997px');
        expect(el.style.top).toBe('0px');
        expect(el.style.width).toBe('3px');
        expect(el.style.height).toBe('1000px');
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
        // a full-width horizontal line at the top
        expect(el.style.left).toBe('0px');
        expect(el.style.top).toBe('0px');
        expect(el.style.width).toBe('1000px');
        expect(el.style.height).toBe('3px');
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
        // a full-width horizontal line at the bottom (top = height - LINE)
        expect(el.style.left).toBe('0px');
        expect(el.style.top).toBe('997px');
        expect(el.style.width).toBe('1000px');
        expect(el.style.height).toBe('3px');
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
        // it re-geometried to the right edge
        expect(first.style.left).toBe('997px');
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

    // --- drag-time edge drop strips ---

    describe('edge drop strips', () => {
        const transfer = LocalSelectionTransfer.getInstance<PanelTransfer>();

        beforeEach(() => {
            jest.useFakeTimers();
            // A drag of this dock is under way.
            transfer.setData(
                [new PanelTransfer('dock', 'g1', 'p1')],
                PanelTransfer.prototype
            );
        });
        afterEach(() => {
            transfer.clearData(PanelTransfer.prototype);
            jest.useRealTimers();
        });

        const strips = (root: HTMLElement): HTMLElement[] =>
            Array.from(root.querySelectorAll('.dv-edge-drop-strip'));
        const drag = { nativeEvent: new Event('dragstart') };

        test('a panel drag mounts a strip on each enabled edge, after the drag starts', () => {
            const { overlayRoot, willDragPanel, dropTargets } = host({
                top: true,
                left: true,
            });
            willDragPanel.fire(drag);
            // Deferred: mutating the DOM inside `dragstart` can abort an
            // HTML5 drag.
            expect(strips(overlayRoot)).toEqual([]);

            jest.runAllTimers();
            expect(
                strips(overlayRoot).map((el) => el.dataset.position)
            ).toEqual(['left', 'top']);
            expect(dropTargets.map((t) => t.position)).toEqual(['left', 'top']);
        });

        test('a group drag mounts them too', () => {
            const { overlayRoot, willDragGroup } = host(true);
            willDragGroup.fire(drag);
            jest.runAllTimers();
            expect(strips(overlayRoot)).toHaveLength(4);
        });

        test('strips hug the drop-zone rect', () => {
            const { overlayRoot, willDragPanel } = host({ right: true });
            willDragPanel.fire(drag);
            jest.runAllTimers();
            const [right] = strips(overlayRoot);
            expect(right.classList).toContain('dv-edge-drop-strip--right');
            expect(right.style.left).toBe('1000px');
            expect(right.style.top).toBe('0px');
            expect(right.style.height).toBe('1000px');
        });

        test('no strips when the feature is off', () => {
            const { overlayRoot, willDragPanel } = host(false);
            willDragPanel.fire(drag);
            jest.runAllTimers();
            expect(strips(overlayRoot)).toEqual([]);
        });

        test('no strips when the drag was vetoed (no drag data)', () => {
            transfer.clearData(PanelTransfer.prototype);
            const { overlayRoot, willDragPanel } = host(true);
            willDragPanel.fire(drag);
            jest.runAllTimers();
            expect(strips(overlayRoot)).toEqual([]);
        });

        test('no strips when the app supplies a dropPositionResolver', () => {
            const h = host(true);
            (h.service as any).host.options.dropPositionResolver = {
                resolve: () => null,
            };
            h.willDragPanel.fire(drag);
            jest.runAllTimers();
            expect(strips(h.overlayRoot)).toEqual([]);
        });

        test.each([
            ['dragstart', 'drop'],
            ['dragstart', 'dragend'],
            ['pointerdown', 'pointerup'],
            ['pointerdown', 'pointercancel'],
        ])('a %s drag is ended by a document %s, once the drop has been handled', (start, end) => {
            const { overlayRoot, willDragPanel, dropTargets } = host(true);
            willDragPanel.fire({ nativeEvent: new Event(start) });
            jest.runAllTimers();
            expect(strips(overlayRoot)).toHaveLength(4);

            document.dispatchEvent(new Event(end, { bubbles: true }));
            // Still there while the drop that ended the drag is handled.
            expect(strips(overlayRoot)).toHaveLength(4);

            jest.runAllTimers();
            expect(strips(overlayRoot)).toEqual([]);
            for (const t of dropTargets) {
                expect(t.dispose).toHaveBeenCalledTimes(1);
            }
        });

        test('the pointercancel a native drag fires as it starts does not end it', () => {
            const { overlayRoot, willDragPanel } = host(true);
            willDragPanel.fire(drag);
            jest.runAllTimers();

            document.dispatchEvent(
                new Event('pointercancel', { bubbles: true })
            );
            jest.runAllTimers();
            expect(strips(overlayRoot)).toHaveLength(4);
        });

        test('only the dragging pointer ends a pointer drag', () => {
            const { overlayRoot, willDragPanel } = host(true);
            const start = new Event('pointerdown');
            Object.defineProperty(start, 'pointerId', { value: 1 });
            willDragPanel.fire({ nativeEvent: start });
            jest.runAllTimers();

            const other = new Event('pointerup', { bubbles: true });
            Object.defineProperty(other, 'pointerId', { value: 2 });
            document.dispatchEvent(other);
            jest.runAllTimers();
            expect(strips(overlayRoot)).toHaveLength(4);

            const own = new Event('pointerup', { bubbles: true });
            Object.defineProperty(own, 'pointerId', { value: 1 });
            document.dispatchEvent(own);
            jest.runAllTimers();
            expect(strips(overlayRoot)).toEqual([]);
        });

        test("a drag from a popout is ended by the popout's document", () => {
            const { overlayRoot, willDragPanel } = host(true);
            const popout = document.implementation.createHTMLDocument('popout');
            const tab = popout.createElement('div');
            popout.body.appendChild(tab);
            const start = new Event('dragstart');
            Object.defineProperty(start, 'target', { value: tab });
            willDragPanel.fire({ nativeEvent: start });
            jest.runAllTimers();
            expect(strips(overlayRoot)).toHaveLength(4);

            popout.dispatchEvent(new Event('dragend', { bubbles: true }));
            jest.runAllTimers();
            expect(strips(overlayRoot)).toEqual([]);
        });

        test('a second drag start does not stack strips', () => {
            const { overlayRoot, willDragPanel } = host({ top: true });
            willDragPanel.fire(drag);
            willDragPanel.fire(drag);
            jest.runAllTimers();
            expect(strips(overlayRoot)).toHaveLength(1);
        });

        test('dispose removes mounted strips and cancels a pending mount', () => {
            const a = host(true);
            a.willDragPanel.fire(drag);
            jest.runAllTimers();
            a.service.dispose();
            expect(strips(a.overlayRoot)).toEqual([]);

            const b = host(true);
            b.willDragPanel.fire(drag);
            b.service.dispose();
            jest.runAllTimers();
            expect(strips(b.overlayRoot)).toEqual([]);
        });
    });
});
