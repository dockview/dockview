import { DockviewEmitter as Emitter } from 'dockview-core';
import {
    Box,
    DockviewGroupPanel,
    DragModifiers,
    FloatingGroupDragContext,
    ISmartGuidesHost,
    SmartGuidesOptions,
    SmartGuidesSnapPosition,
    SmartGuidesSnapTogetherEvent,
} from 'dockview-core';
import { SmartGuidesService } from '../smartGuidesService';

const NO_MODIFIERS: DragModifiers = {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
};

/**
 * Smart Guides: independent X/Y edge + center snapping against other floats and
 * the container, with engage/release hysteresis.
 *
 * Driven at the service boundary with a mock host + synthetic drag contexts:
 * the snap math is pure geometry (container-relative px), so it doesn't need a
 * real browser layout. The component-side composition (and byte-identical
 * pass-through when the module is absent) is covered by `moduleRemovability`.
 */
describe('smart guides', () => {
    let container: HTMLElement;
    let startEmitter: Emitter<DockviewGroupPanel>;
    let endEmitter: Emitter<DockviewGroupPanel>;
    let service: SmartGuidesService;
    // Mutable so a test can simulate an app-level option update (new reference).
    let hostOptions: { smartGuides: SmartGuidesOptions | undefined };
    let snapshots: { group: DockviewGroupPanel; box: Box }[];
    let splitterRects: Box[];
    let mergeCalls: {
        dragged: DockviewGroupPanel;
        target: DockviewGroupPanel;
        position: SmartGuidesSnapPosition;
    }[];
    // Distinct identity per drag; the service keys per-drag state by group.
    const group = {} as DockviewGroupPanel;

    const make = (
        smartGuides: SmartGuidesOptions | undefined,
        floats: { group: DockviewGroupPanel; box: Box }[] = []
    ): void => {
        container = document.createElement('div');
        document.body.appendChild(container);
        startEmitter = new Emitter<DockviewGroupPanel>();
        endEmitter = new Emitter<DockviewGroupPanel>();
        snapshots = floats;
        splitterRects = [];
        mergeCalls = [];
        hostOptions = { smartGuides };
        const host: ISmartGuidesHost = {
            options: hostOptions as any,
            getFloatingContainer: () => container,
            onDidStartFloatingGroupDrag: startEmitter.event,
            onDidEndFloatingGroupDrag: endEmitter.event,
            getFloatingGroupSnapshots: () => snapshots,
            getGridSplitterRects: () => splitterRects,
            mergeFloatInto: (dragged, target, position) => {
                mergeCalls.push({ dragged, target, position });
            },
        };
        service = new SmartGuidesService(host);
    };

    const ctx = (
        proposed: Box,
        others: Box[],
        modifiers: DragModifiers = NO_MODIFIERS
    ): FloatingGroupDragContext => ({
        group,
        proposed,
        container: { width: 1000, height: 1000 },
        others,
        modifiers,
    });

    // Lines the layer is currently painting (pooled hidden ones excluded).
    const visibleLines = (): HTMLElement[] =>
        Array.from(
            container.querySelectorAll<HTMLElement>('.dv-smart-guide')
        ).filter((l) => l.style.display === 'block');

    // Float-only options: isolate from the container edges that are on by default.
    const floatsOnly = (
        extra: SmartGuidesOptions = {}
    ): SmartGuidesOptions => ({
        snapTargets: { container: false },
        ...extra,
    });

    afterEach(() => {
        service?.dispose();
        container?.remove();
    });

    test('snaps a float left edge to another float left edge within snapDistance', () => {
        make({});
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        // dragged left edge at 106, 6px from the other float's left edge (100).
        const result = service.transformFloatingGroupDrag(
            ctx({ left: 106, top: 400, width: 50, height: 50 }, [other])
        );

        expect(result).toEqual({ top: 400, left: 100 });
        const lines = visibleLines();
        expect(lines).toHaveLength(1);
        expect(lines[0].style.left).toBe('100px');
        expect(lines[0].style.width).toBe('1px');
    });

    test('snaps the top edge (Y axis) and draws a horizontal guide', () => {
        make(floatsOnly());
        const other: Box = { left: 100, top: 200, width: 200, height: 150 };
        // top edge at 195, 5px from the other float's top (200); far on X.
        const result = service.transformFloatingGroupDrag(
            ctx({ left: 600, top: 195, width: 50, height: 50 }, [other])
        );

        expect(result).toEqual({ top: 200, left: 600 });
        const lines = visibleLines();
        expect(lines).toHaveLength(1);
        expect(lines[0].style.top).toBe('200px');
        expect(lines[0].style.height).toBe('1px');
    });

    test('resolves X and Y independently: two simultaneous guides', () => {
        make(floatsOnly());
        // One neighbour: align the dragged float's left edge AND top edge to it.
        const other: Box = { left: 100, top: 100, width: 200, height: 150 };
        const result = service.transformFloatingGroupDrag(
            ctx({ left: 105, top: 104, width: 50, height: 50 }, [other])
        );

        expect(result).toEqual({ top: 100, left: 100 });
        const lines = visibleLines();
        expect(lines).toHaveLength(2);
        // a vertical guide at x=100 and a horizontal guide at y=100
        expect(
            lines.some(
                (l) => l.style.width === '1px' && l.style.left === '100px'
            )
        ).toBe(true);
        expect(
            lines.some(
                (l) => l.style.height === '1px' && l.style.top === '100px'
            )
        ).toBe(true);
    });

    test('snaps to the container edge', () => {
        make({});
        // near the right container edge (1000); no floats in play.
        const result = service.transformFloatingGroupDrag(
            ctx({ left: 945, top: 400, width: 50, height: 50 }, [])
        );
        // right edge 995 → snaps to 1000, so left becomes 950.
        expect(result).toEqual({ top: 400, left: 950 });
        const lines = visibleLines();
        expect(lines).toHaveLength(1);
        expect(lines[0].style.left).toBe('1000px');
    });

    test('snaps centers together', () => {
        make(floatsOnly());
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        // dragged center 202 vs the other float centre 200; only the centres
        // line up (no edge is in range).
        const result = service.transformFloatingGroupDrag(
            ctx({ left: 172, top: 400, width: 60, height: 50 }, [other])
        );
        expect(result).toEqual({ top: 400, left: 170 });
        expect(visibleLines()[0].style.left).toBe('200px');
    });

    test('container inset adds margin guide lines', () => {
        make({ snapTargets: { floats: false, containerInset: 20 } });
        // left edge at 24 → snaps to the 20px inset line.
        const result = service.transformFloatingGroupDrag(
            ctx({ left: 24, top: 400, width: 50, height: 50 }, [])
        );
        expect(result).toEqual({ top: 400, left: 20 });
        expect(visibleLines()[0].style.left).toBe('20px');
    });

    test('hysteresis: stays engaged within release, frees past it (no oscillation)', () => {
        make(floatsOnly());
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        const at = (left: number) =>
            service.transformFloatingGroupDrag(
                ctx({ left, top: 400, width: 50, height: 50 }, [other])
            );

        // engage exactly on the edge
        expect(at(100)).toEqual({ top: 400, left: 100 });
        // 10px away (> snapDistance 8, < snapDistance+release 12): stays snapped
        expect(at(110)).toEqual({ top: 400, left: 100 });
        // 13px away (> 12): releases, and is now out of the 8px engage range
        expect(at(113)).toBeUndefined();
    });

    test('engages at the snap distance, not beyond', () => {
        make(floatsOnly());
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        // fresh drag, exactly 8px away → engages
        expect(
            service.transformFloatingGroupDrag(
                ctx({ left: 108, top: 400, width: 50, height: 50 }, [other])
            )
        ).toEqual({ top: 400, left: 100 });

        // fresh drag, 9px away → no snap
        make(floatsOnly());
        expect(
            service.transformFloatingGroupDrag(
                ctx({ left: 109, top: 400, width: 50, height: 50 }, [other])
            )
        ).toBeUndefined();
    });

    test('no snap outside snapDistance: pass-through, no guides', () => {
        make({});
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        const result = service.transformFloatingGroupDrag(
            ctx({ left: 130, top: 400, width: 50, height: 50 }, [other])
        );
        expect(result).toBeUndefined();
        expect(visibleLines()).toHaveLength(0);
    });

    test('a guide reappears after the snap is lost and re-acquired', () => {
        // Guards the per-frame write dedup: a re-acquired alignment must redraw
        // rather than being skipped as "unchanged".
        make(floatsOnly());
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        const at = (left: number) =>
            service.transformFloatingGroupDrag(
                ctx({ left, top: 400, width: 50, height: 50 }, [other])
            );

        at(106); // engage x=100
        expect(visibleLines()).toHaveLength(1);
        at(500); // well clear of every edge → guide hidden
        expect(visibleLines()).toHaveLength(0);
        at(106); // re-acquire the same edge → guide shown again
        expect(visibleLines()).toHaveLength(1);
        expect(visibleLines()[0].style.left).toBe('100px');
    });

    test('inert when `smartGuides` is unset: no overlay, no adjustment', () => {
        make(undefined);
        const result = service.transformFloatingGroupDrag(
            ctx({ left: 106, top: 400, width: 50, height: 50 }, [
                { left: 100, top: 50, width: 200, height: 150 },
            ])
        );
        expect(result).toBeUndefined();
        expect(container.querySelector('.dv-smart-guides')).toBeNull();
    });

    test('`enabled: false` snaps nothing', () => {
        make({ enabled: false });
        const result = service.transformFloatingGroupDrag(
            ctx({ left: 106, top: 400, width: 50, height: 50 }, [
                { left: 100, top: 50, width: 200, height: 150 },
            ])
        );
        expect(result).toBeUndefined();
        expect(container.querySelector('.dv-smart-guides')).toBeNull();
    });

    test('`showGuides: false` still snaps but draws no visible guide', () => {
        make(floatsOnly({ showGuides: false }));
        const result = service.transformFloatingGroupDrag(
            ctx({ left: 106, top: 400, width: 50, height: 50 }, [
                { left: 100, top: 50, width: 200, height: 150 },
            ])
        );
        expect(result).toEqual({ top: 400, left: 100 });
        expect(visibleLines()).toHaveLength(0);
    });

    test('drag end tears the guide overlay down', () => {
        make({});
        service.transformFloatingGroupDrag(
            ctx({ left: 106, top: 400, width: 50, height: 50 }, [
                { left: 100, top: 50, width: 200, height: 150 },
            ])
        );
        expect(container.querySelector('.dv-smart-guides')).toBeTruthy();

        endEmitter.fire(group);
        expect(container.querySelector('.dv-smart-guides')).toBeNull();
    });

    test('candidates are built once per drag, not per frame', () => {
        make(floatsOnly());
        const others: Box[] = [{ left: 100, top: 50, width: 200, height: 150 }];
        service.transformFloatingGroupDrag(
            ctx({ left: 106, top: 400, width: 50, height: 50 }, others)
        );

        // A later frame whose `others` snapshot has drifted must not rebuild the
        // candidate set; the float at x=100 is still the snap target.
        const result = service.transformFloatingGroupDrag(
            ctx({ left: 104, top: 400, width: 50, height: 50 }, [
                { left: 500, top: 50, width: 200, height: 150 },
            ])
        );
        expect(result).toEqual({ top: 400, left: 100 });
    });

    // --- snap-together ---

    /** A float to snap to, locked as given (unlocked by default). */
    const floatGroup = (
        id: string,
        locked: boolean | 'no-drop-target' = false
    ): DockviewGroupPanel =>
        ({
            id,
            model: {
                acceptsUserDrop: (position: string) =>
                    locked === false ||
                    (locked === true && position !== 'center'),
            },
        }) as unknown as DockviewGroupPanel;
    const targetGroup = floatGroup('target');
    const preview = (): HTMLElement | null =>
        container.querySelector('.dv-smart-guide-preview');
    // Disable alignment (no float/container candidates) so the snapped box is
    // the raw proposed box, so the snap-together geometry is then exact. Merge
    // is opt-in (Smart Guides is alignment-only by default), so enable it here;
    // callers can still override via `extra` (see the `snapTogether: false` test).
    const noAlign = (extra: SmartGuidesOptions = {}): SmartGuidesOptions => ({
        snapTargets: { floats: false, container: false },
        snapTogether: true,
        ...extra,
    });

    test('edge-adjacency suggests docking beside the target and commits on drop', () => {
        const t: Box = { left: 300, top: 100, width: 200, height: 200 };
        make(noAlign(), [{ group: targetGroup, box: t }]);

        // dragged right edge (150+150=300) meets the target's left edge (300),
        // with full vertical overlap → dock on the target's left.
        service.transformFloatingGroupDrag(
            ctx({ left: 150, top: 100, width: 150, height: 200 }, [])
        );

        const p = preview();
        expect(p).toBeTruthy();
        expect(p!.style.display).toBe('block');
        // preview is the left half of the target
        expect(p!.style.left).toBe('300px');
        expect(p!.style.width).toBe('100px');
        expect(p!.style.height).toBe('200px');
        expect(mergeCalls).toHaveLength(0);

        endEmitter.fire(group);
        expect(mergeCalls).toEqual([
            { dragged: group, target: targetGroup, position: 'left' },
        ]);
    });

    test('overlapping tab strips suggest a center (tabset) merge', () => {
        const t: Box = { left: 100, top: 100, width: 200, height: 200 };
        make(noAlign(), [{ group: targetGroup, box: t }]);

        // tops flush (100) and the boxes stacked (90% horizontal overlap).
        service.transformFloatingGroupDrag(
            ctx({ left: 120, top: 100, width: 200, height: 200 }, [])
        );

        const p = preview()!;
        expect(p.style.display).toBe('block');
        // the whole target is previewed for a tabset merge
        expect(p.style.left).toBe('100px');
        expect(p.style.width).toBe('200px');

        endEmitter.fire(group);
        expect(mergeCalls).toEqual([
            { dragged: group, target: targetGroup, position: 'center' },
        ]);
    });

    test.each([
        true,
        'no-drop-target',
    ] as const)('a locked float takes no centre merge (locked: %p)', (locked) => {
        const t: Box = { left: 100, top: 100, width: 200, height: 200 };
        make(noAlign(), [{ group: floatGroup('target', locked), box: t }]);

        service.transformFloatingGroupDrag(
            ctx({ left: 120, top: 100, width: 200, height: 200 }, [])
        );
        endEmitter.fire(group);

        expect(mergeCalls).toEqual([]);
    });

    test('a float locked with true still takes a dock beside it', () => {
        const locked = floatGroup('target', true);
        const t: Box = { left: 300, top: 100, width: 200, height: 200 };
        make(noAlign(), [{ group: locked, box: t }]);

        service.transformFloatingGroupDrag(
            ctx({ left: 150, top: 100, width: 150, height: 200 }, [])
        );
        endEmitter.fire(group);

        expect(mergeCalls).toEqual([
            { dragged: group, target: locked, position: 'left' },
        ]);
    });

    test("a 'no-drop-target' float takes no dock beside it either", () => {
        const t: Box = { left: 300, top: 100, width: 200, height: 200 };
        make(noAlign(), [
            { group: floatGroup('target', 'no-drop-target'), box: t },
        ]);

        service.transformFloatingGroupDrag(
            ctx({ left: 150, top: 100, width: 150, height: 200 }, [])
        );
        endEmitter.fire(group);

        expect(mergeCalls).toEqual([]);
    });

    test('`snapTogether: false` never suggests or commits a merge', () => {
        const t: Box = { left: 300, top: 100, width: 200, height: 200 };
        make(noAlign({ snapTogether: false }), [
            { group: targetGroup, box: t },
        ]);

        service.transformFloatingGroupDrag(
            ctx({ left: 150, top: 100, width: 150, height: 200 }, [])
        );
        expect(preview()?.style.display ?? 'none').toBe('none');

        endEmitter.fire(group);
        expect(mergeCalls).toHaveLength(0);
    });

    test('does not merge by default: alignment-only unless snapTogether is opted into', () => {
        // Smart Guides is an alignment tool by default; merging floating groups
        // is opt-in. With `snapTogether` unset, an edge flush against a target
        // suggests nothing and commits nothing on drop.
        const t: Box = { left: 300, top: 100, width: 200, height: 200 };
        make({ snapTargets: { floats: false, container: false } }, [
            { group: targetGroup, box: t },
        ]);

        service.transformFloatingGroupDrag(
            ctx({ left: 150, top: 100, width: 150, height: 200 }, [])
        );
        expect(preview()?.style.display ?? 'none').toBe('none');

        endEmitter.fire(group);
        expect(mergeCalls).toHaveLength(0);
    });

    test('moving away from a target clears the pending merge before drop', () => {
        const t: Box = { left: 300, top: 100, width: 200, height: 200 };
        make(noAlign(), [{ group: targetGroup, box: t }]);

        // engage adjacency...
        service.transformFloatingGroupDrag(
            ctx({ left: 150, top: 100, width: 150, height: 200 }, [])
        );
        // ...then drag well clear of it
        service.transformFloatingGroupDrag(
            ctx({ left: 10, top: 600, width: 150, height: 200 }, [])
        );
        expect(preview()!.style.display).toBe('none');

        endEmitter.fire(group);
        expect(mergeCalls).toHaveLength(0);
    });

    test('an edge that barely overlaps the target is not an adjacency', () => {
        // dragged right edge meets target left edge, but only 40% vertical
        // overlap (< 50%) → no dock suggestion.
        const t: Box = { left: 300, top: 100, width: 200, height: 200 };
        make(noAlign(), [{ group: targetGroup, box: t }]);

        service.transformFloatingGroupDrag(
            ctx({ left: 150, top: 280, width: 150, height: 50 }, [])
        );
        expect(preview()?.style.display ?? 'none').toBe('none');

        endEmitter.fire(group);
        expect(mergeCalls).toHaveLength(0);
    });

    // --- modifier gate ---

    const alt: DragModifiers = { ...NO_MODIFIERS, altKey: true };

    test('holding the disable modifier (default Alt) suspends snapping', () => {
        make(floatsOnly());
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        const box: Box = { left: 106, top: 400, width: 50, height: 50 };

        // Alt held → no snap, no guides
        expect(
            service.transformFloatingGroupDrag(ctx(box, [other], alt))
        ).toBeUndefined();
        expect(visibleLines()).toHaveLength(0);

        // released → snaps again on the next frame
        expect(service.transformFloatingGroupDrag(ctx(box, [other]))).toEqual({
            top: 400,
            left: 100,
        });
    });

    test('the disable modifier is configurable', () => {
        make(floatsOnly({ disableSnapModifier: 'shift' }));
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        const box: Box = { left: 106, top: 400, width: 50, height: 50 };

        // Alt is no longer the gate → still snaps with Alt held
        expect(
            service.transformFloatingGroupDrag(ctx(box, [other], alt))
        ).toEqual({ top: 400, left: 100 });
        // Shift held → suspended
        expect(
            service.transformFloatingGroupDrag(
                ctx(box, [other], { ...NO_MODIFIERS, shiftKey: true })
            )
        ).toBeUndefined();
    });

    test('`disableSnapModifier: false` ignores modifiers', () => {
        make(floatsOnly({ disableSnapModifier: false }));
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        expect(
            service.transformFloatingGroupDrag(
                ctx(
                    { left: 106, top: 400, width: 50, height: 50 },
                    [other],
                    alt
                )
            )
        ).toEqual({ top: 400, left: 100 });
    });

    // --- splitter targets ---

    test('snaps to a grid splitter when `snapTargets.splitters` is on', () => {
        make({
            snapTargets: { floats: false, container: false, splitters: true },
        });
        // a 4px-wide vertical sash spanning 300..304 → candidate at centre 302
        splitterRects = [{ left: 300, top: 0, width: 4, height: 1000 }];

        const result = service.transformFloatingGroupDrag(
            ctx({ left: 305, top: 400, width: 50, height: 50 }, [])
        );
        expect(result).toEqual({ top: 400, left: 302 });
        expect(visibleLines()[0].style.left).toBe('302px');
    });

    test('a hidden (zero-area) sash is not a snap candidate', () => {
        make({
            snapTargets: { floats: false, container: false, splitters: true },
        });
        // a collapsed sash measures 0×0, so it must not become a phantom line at x=0
        splitterRects = [{ left: 0, top: 0, width: 0, height: 0 }];
        expect(
            service.transformFloatingGroupDrag(
                ctx({ left: 3, top: 400, width: 50, height: 50 }, [])
            )
        ).toBeUndefined();
        expect(visibleLines()).toHaveLength(0);
    });

    test('splitters are off by default', () => {
        make({ snapTargets: { floats: false, container: false } });
        splitterRects = [{ left: 300, top: 0, width: 4, height: 1000 }];
        expect(
            service.transformFloatingGroupDrag(
                ctx({ left: 305, top: 400, width: 50, height: 50 }, [])
            )
        ).toBeUndefined();
    });

    // --- runtime options ---

    test('setEnabled toggles snapping at runtime', () => {
        make(floatsOnly());
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        const box: Box = { left: 106, top: 400, width: 50, height: 50 };

        service.setEnabled(false);
        expect(service.enabled).toBe(false);
        expect(
            service.transformFloatingGroupDrag(ctx(box, [other]))
        ).toBeUndefined();

        service.setEnabled(true);
        expect(service.enabled).toBe(true);
        expect(service.transformFloatingGroupDrag(ctx(box, [other]))).toEqual({
            top: 400,
            left: 100,
        });
    });

    test('updateOptions merges an override at runtime', () => {
        make(floatsOnly());
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        // 25px away: outside the default 8px, inside an overridden 30px.
        service.updateOptions({ snapDistance: 30 });
        expect(
            service.transformFloatingGroupDrag(
                ctx({ left: 125, top: 400, width: 50, height: 50 }, [other])
            )
        ).toEqual({ top: 400, left: 100 });
    });

    test('setEnabled(true) activates even when `smartGuides` was unset', () => {
        make(undefined);
        service.setEnabled(true);
        expect(
            service.transformFloatingGroupDrag(
                ctx({ left: 106, top: 400, width: 50, height: 50 }, [
                    { left: 100, top: 50, width: 200, height: 150 },
                ])
            )
        ).toEqual({ top: 400, left: 100 });
    });

    // --- events ---

    test('onDidSnapFloat fires on drop with the snapped axes', () => {
        make(floatsOnly());
        const events: { axes: ('x' | 'y')[] }[] = [];
        service.onDidSnapFloat((e) => events.push({ axes: e.axes }));

        service.transformFloatingGroupDrag(
            ctx({ left: 106, top: 400, width: 50, height: 50 }, [
                { left: 100, top: 50, width: 200, height: 150 },
            ])
        );
        endEmitter.fire(group);
        expect(events).toEqual([{ axes: ['x'] }]);
    });

    test('onDidSnapTogether fires on a merge drop (and not onDidSnapFloat)', () => {
        const t: Box = { left: 300, top: 100, width: 200, height: 200 };
        make(noAlign(), [{ group: targetGroup, box: t }]);
        const together: SmartGuidesSnapTogetherEvent[] = [];
        const aligned: unknown[] = [];
        service.onDidSnapTogether((e) => together.push(e));
        service.onDidSnapFloat((e) => aligned.push(e));

        service.transformFloatingGroupDrag(
            ctx({ left: 150, top: 100, width: 150, height: 200 }, [])
        );
        endEmitter.fire(group);

        expect(together).toEqual([
            { dragged: group, target: targetGroup, position: 'left' },
        ]);
        expect(aligned).toHaveLength(0);
    });

    // --- review regressions ---

    test('a drag that aborts without an end leaves no stale guide for the next drag', () => {
        // A redock long-press aborts via cancelPendingDrag (no end event); the
        // next drag's start signal must discard the leftover session + layer.
        make(floatsOnly());
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        service.transformFloatingGroupDrag(
            ctx({ left: 106, top: 400, width: 50, height: 50 }, [other])
        );
        expect(container.querySelector('.dv-smart-guides')).toBeTruthy();

        // ...no end fires (aborted). Start of the next drag tears it down.
        startEmitter.fire(group);
        expect(container.querySelector('.dv-smart-guides')).toBeNull();
    });

    test('top-aligning a float off to the side of a target is not a merge', () => {
        // Wide float, tops flush, ≥50% horizontal overlap of the narrow target,
        // but its centre is past the target's edge, so it is an alignment, not a
        // tabset stack. Must not suggest or commit a merge.
        const t: Box = { left: 100, top: 100, width: 100, height: 200 };
        make(noAlign(), [{ group: targetGroup, box: t }]);

        service.transformFloatingGroupDrag(
            ctx({ left: 120, top: 100, width: 300, height: 200 }, [])
        );
        expect(preview()?.style.display ?? 'none').toBe('none');

        endEmitter.fire(group);
        expect(mergeCalls).toHaveLength(0);
    });

    test('`showGuides: false` still previews + commits a pending merge', () => {
        // showGuides hides alignment lines only. A merge that will commit on
        // drop must never be silent.
        const t: Box = { left: 300, top: 100, width: 200, height: 200 };
        make(noAlign({ showGuides: false }), [{ group: targetGroup, box: t }]);

        service.transformFloatingGroupDrag(
            ctx({ left: 150, top: 100, width: 150, height: 200 }, [])
        );
        expect(visibleLines()).toHaveLength(0); // no alignment lines
        expect(preview()!.style.display).toBe('block'); // but the merge preview shows

        endEmitter.fire(group);
        expect(mergeCalls).toEqual([
            { dragged: group, target: targetGroup, position: 'left' },
        ]);
    });

    test('an engaged edge stays glued on a small float (no probe switch)', () => {
        // A 20px-wide float: as it moves, its centre probe can get nearer to the
        // engaged line than the latched edge. It must keep gluing the edge, not
        // silently re-snap its centre (which would jump the box).
        make(floatsOnly());
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        // engage the left edge on x=100
        expect(
            service.transformFloatingGroupDrag(
                ctx({ left: 100, top: 400, width: 20, height: 50 }, [other])
            )
        ).toEqual({ top: 400, left: 100 });
        // move to left=92: centre (102) is now nearer 100 than the edge (92),
        // but the edge stays glued (within release) → left snaps back to 100.
        expect(
            service.transformFloatingGroupDrag(
                ctx({ left: 92, top: 400, width: 20, height: 50 }, [other])
            )
        ).toEqual({ top: 400, left: 100 });
    });

    test('snap-together docks into the nearest target, not the first', () => {
        const near = floatGroup('near');
        const far = floatGroup('far');
        // `far` is first in iteration order but its right edge (96) is further
        // from the dragged left edge (102) than `near`'s (100).
        make(noAlign(), [
            { group: far, box: { left: 0, top: 100, width: 96, height: 200 } },
            {
                group: near,
                box: { left: 0, top: 100, width: 100, height: 200 },
            },
        ]);

        service.transformFloatingGroupDrag(
            ctx({ left: 102, top: 100, width: 100, height: 200 }, [])
        );
        endEmitter.fire(group);
        expect(mergeCalls).toEqual([
            { dragged: group, target: near, position: 'right' },
        ]);
    });

    test('a fresh app-level option update overrides earlier runtime options', () => {
        make({ snapDistance: 8 });
        const other: Box = { left: 100, top: 50, width: 200, height: 150 };
        const at = (left: number) =>
            service.transformFloatingGroupDrag(
                ctx({ left, top: 400, width: 50, height: 50 }, [other])
            );

        // runtime override widens the snap distance...
        service.updateOptions({ snapDistance: 30 });
        expect(at(125)).toEqual({ top: 400, left: 100 }); // 25px away → snaps
        endEmitter.fire(group);

        // ...then the app sets `smartGuides` afresh (new reference) → the runtime
        // override is dropped and the new option wins.
        hostOptions.smartGuides = { snapDistance: 8 };
        expect(at(125)).toBeUndefined(); // 25px > 8 → no snap
    });
});
