import { DockviewEmitter as Emitter } from 'dockview-core';
import {
    DockviewGroupPanel,
    DockviewWillShowOverlayLocationEvent,
    Position,
    PositionResolverArgs,
} from 'dockview-core';
import { DndCompassService } from '../dndCompassService';

/**
 * DnD compass. The cell hit-test is pure geometry (container-relative
 * px) so it's driven directly; the widget + edge-preview + gating lifecycle is
 * driven via a mock `onWillShowOverlay` host signal.
 */
describe('DnD compass', () => {
    let overlayEmitter: Emitter<DockviewWillShowOverlayLocationEvent>;
    let service: DndCompassService;
    let canDrop: (position: Position) => boolean;
    let dropOverlayEl: (group: DockviewGroupPanel) => HTMLElement | undefined;
    let layoutEl: HTMLElement;
    let gateCalls: Position[];

    const make = (
        dndCompass:
            | { zones?: Position[]; edges?: boolean }
            | boolean
            | undefined
    ): void => {
        overlayEmitter = new Emitter<DockviewWillShowOverlayLocationEvent>();
        layoutEl = document.createElement('div');
        document.body.appendChild(layoutEl);
        canDrop = () => true;
        gateCalls = [];
        // the drop target measures the content container by default
        dropOverlayEl = (group) =>
            group.element.querySelector<HTMLElement>('.dv-content-container') ??
            undefined;
        service = new DndCompassService({
            options: { dndCompass } as any,
            onWillShowOverlay: overlayEmitter.event,
            canDropOnGroup: (_group, position) => {
                gateCalls.push(position);
                return canDrop(position);
            },
            getDropOverlayElement: (group: DockviewGroupPanel) =>
                dropOverlayEl(group),
            getLayoutElement: () => layoutEl,
        });
    };

    const args = (
        x: number,
        y: number,
        zones: Position[] = ['top', 'bottom', 'left', 'right', 'center'],
        width = 200,
        height = 100
    ): PositionResolverArgs => ({
        x,
        y,
        width,
        height,
        zones: new Set(zones),
        event: {} as any,
    });

    afterEach(() => service?.dispose());

    // 200x100 target: centre cell ≈ x[81,119] y[31,69]; left ≈ x[39,77];
    // right ≈ x[123,161]; top ≈ y[-11,27]; bottom ≈ y[73,111] (all x[81,119]).
    test('hit-tests the pointer against the inner compass cells', () => {
        make(true);
        const r = service.resolver!;
        expect(r.resolve(args(100, 50))).toEqual({
            position: 'center',
            edge: false,
        });
        expect(r.resolve(args(58, 50))).toEqual({
            position: 'left',
            edge: false,
        });
        expect(r.resolve(args(140, 50))).toEqual({
            position: 'right',
            edge: false,
        });
        expect(r.resolve(args(100, 10))).toEqual({
            position: 'top',
            edge: false,
        });
        expect(r.resolve(args(100, 90))).toEqual({
            position: 'bottom',
            edge: false,
        });
    });

    // 400x400 target: outer top cell ≈ x[181,219] y[97,135] (one ring beyond
    // the inner top), flagged `edge` to dock against the whole layout.
    test('outer cells resolve with the edge flag', () => {
        make(true);
        expect(
            service.resolver!.resolve(args(200, 110, undefined, 400, 400))
        ).toEqual({ position: 'top', edge: true });
    });

    test('`edges: false` hides the outer cells', () => {
        make({ edges: false });
        // the outer-top point is no longer a cell
        expect(
            service.resolver!.resolve(args(200, 110, undefined, 400, 400))
        ).toBeNull();
        // ...but the inner ring still resolves
        expect(
            service.resolver!.resolve(args(200, 200, undefined, 400, 400))
        ).toEqual({ position: 'center', edge: false });
    });

    test('a dead corner (no cell) resolves to null', () => {
        make(true);
        expect(service.resolver!.resolve(args(10, 10))).toBeNull();
    });

    test('fills the gaps between cells so the overlay does not blink out mid-traverse', () => {
        make(true);
        const r = service.resolver!;
        // 200x100: the top cell ends at y=27 and the centre starts at y=31, a
        // 4px gap. A pointer in the gap snaps to whichever cell is nearer, so the
        // overlay stays on as the cursor crosses between cells.
        expect(r.resolve(args(100, 28))).toEqual({
            position: 'top',
            edge: false,
        });
        expect(r.resolve(args(100, 30))).toEqual({
            position: 'center',
            edge: false,
        });
        // the horizontal gap between left (ends x=77) and centre (starts x=81)
        expect(r.resolve(args(78, 50))).toEqual({
            position: 'left',
            edge: false,
        });
        // a corner (off both axes) is still a genuine dead zone
        expect(r.resolve(args(10, 10))).toBeNull();
    });

    test('does not snap a pointer more than a gap beyond the outermost cell', () => {
        make({ edges: false });
        // the right cell ends at x=161; a pointer well past it stays null
        expect(service.resolver!.resolve(args(180, 50))).toBeNull();
    });

    test("honours the target's accepted zones", () => {
        make(true);
        // left cell is not offered when the target only accepts center
        expect(service.resolver!.resolve(args(58, 50, ['center']))).toBeNull();
        expect(service.resolver!.resolve(args(100, 50, ['center']))).toEqual({
            position: 'center',
            edge: false,
        });
    });

    test('`dndCompass.zones` restricts which inner cells the compass offers', () => {
        make({ zones: ['center'] });
        // left is in the target's zones but excluded by the option
        expect(service.resolver!.resolve(args(58, 50))).toBeNull();
        expect(service.resolver!.resolve(args(100, 50))).toEqual({
            position: 'center',
            edge: false,
        });
    });

    test('the resolver is absent when `dndCompass` is unset (default quadrant)', () => {
        make(undefined);
        expect(service.resolver).toBeUndefined();
    });

    // --- widget lifecycle ---

    const groupWithContent = (): {
        group: DockviewGroupPanel;
        content: HTMLElement;
    } => {
        const content = document.createElement('div');
        content.className = 'dv-content-container';
        const element = document.createElement('div');
        element.appendChild(content);
        document.body.appendChild(element);
        return { group: { element } as DockviewGroupPanel, content };
    };

    test('paints the compass over the hovered group, torn down on drop', () => {
        make(true);
        const { group, content } = groupWithContent();

        overlayEmitter.fire({
            kind: 'content',
            group,
        } as DockviewWillShowOverlayLocationEvent);

        const compass = content.querySelector('.dv-dnd-compass');
        expect(compass).toBeTruthy();
        // 5 inner cells + 4 outer (edge) cells
        expect(content.querySelectorAll('.dv-dnd-compass-cell')).toHaveLength(
            9
        );
        expect(
            content.querySelectorAll('.dv-dnd-compass-cell-edge')
        ).toHaveLength(4);

        // the drag ending tears the widget down
        window.dispatchEvent(new Event('pointerup'));
        expect(content.querySelector('.dv-dnd-compass')).toBeNull();
    });

    describe('teardown on leaving the content area', () => {
        // The compass aims one group's content drop target, and that target
        // only gets events while the cursor is over its element. Nothing else
        // reports leaving: `onWillShowOverlay` simply stops firing, so without
        // this the widget sits on the group for the rest of the drag.
        const CONTENT_RECT = {
            left: 100,
            top: 100,
            right: 300,
            bottom: 200,
            width: 200,
            height: 100,
            x: 100,
            y: 100,
            toJSON: () => ({}),
        } as DOMRect;

        function mounted(): {
            group: DockviewGroupPanel;
            content: HTMLElement;
        } {
            const { group, content } = groupWithContent();
            jest.spyOn(content, 'getBoundingClientRect').mockReturnValue(
                CONTENT_RECT
            );
            overlayEmitter.fire({
                kind: 'content',
                group,
            } as DockviewWillShowOverlayLocationEvent);
            expect(content.querySelector('.dv-dnd-compass')).toBeTruthy();
            return { group, content };
        }

        function move(clientX: number, clientY: number): void {
            const ev = new Event('dragover') as any;
            Object.defineProperty(ev, 'clientX', { get: () => clientX });
            Object.defineProperty(ev, 'clientY', { get: () => clientY });
            window.dispatchEvent(ev);
        }

        test('stays while the cursor is inside', () => {
            make(true);
            const { content } = mounted();

            move(200, 150);
            expect(content.querySelector('.dv-dnd-compass')).toBeTruthy();
        });

        test('clears when the cursor moves up into the tab strip', () => {
            make(true);
            const { content } = mounted();

            // just above the content container — the tab strip
            move(200, 90);
            expect(content.querySelector('.dv-dnd-compass')).toBeNull();
        });

        test('clears when the cursor leaves the group sideways', () => {
            make(true);
            const { content } = mounted();

            move(400, 150);
            expect(content.querySelector('.dv-dnd-compass')).toBeNull();
        });
    });

    test('mounts in the drop-target outline frame, not the content container', () => {
        make(true);
        const { group, content } = groupWithContent();
        // `dndPanelOverlay: 'group'`: the drop target measures the whole group,
        // a bigger box than the content container. The widget clips to its own
        // box, so mounting in the content would cut the top of the cross off
        // against the tab header while leaving it hit-testable.
        const outline = group.element;
        const rect = {
            left: 10,
            top: 40,
            width: 200,
            height: 100,
            right: 210,
            bottom: 140,
            x: 10,
            y: 40,
            toJSON: () => ({}),
        } as DOMRect;
        const spy = jest
            .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
            .mockReturnValue(rect);
        dropOverlayEl = () => outline;

        overlayEmitter.fire({
            kind: 'content',
            group,
        } as DockviewWillShowOverlayLocationEvent);

        expect(outline.querySelector('.dv-dnd-compass')?.parentElement).toBe(
            outline
        );
        expect(content.querySelector('.dv-dnd-compass')).toBeNull();

        // measured frame == mount frame, so the cells need no translation:
        // centre cell at (200/2 - 19), (100/2 - 19)
        const center = outline.querySelector<HTMLElement>(
            '.dv-dnd-compass-cell-center'
        )!;
        expect(center.style.left).toBe('81px');
        expect(center.style.top).toBe('31px');

        spy.mockRestore();
    });

    test('highlights the aimed cell (the only feedback for an outer cell)', () => {
        make(true);
        const { group, content } = groupWithContent();
        const over = (edge: boolean, position: Position) =>
            overlayEmitter.fire({
                kind: 'content',
                group,
                edge,
                position,
            } as DockviewWillShowOverlayLocationEvent);

        over(true, 'right'); // outer-right cell
        expect(
            content.querySelector(
                '.dv-dnd-compass-cell-right.dv-dnd-compass-cell-edge.dv-dnd-compass-cell-active'
            )
        ).toBeTruthy();
        expect(
            content.querySelectorAll('.dv-dnd-compass-cell-active')
        ).toHaveLength(1);

        over(false, 'center'); // moves to the inner centre; only it is active
        const active = content.querySelectorAll('.dv-dnd-compass-cell-active');
        expect(active).toHaveLength(1);
        expect(active[0].classList).toContain('dv-dnd-compass-cell-center');
    });

    test('no orphan edge preview when the group has no content container', () => {
        make(true);
        const element = document.createElement('div'); // no .dv-content-container
        document.body.appendChild(element);
        overlayEmitter.fire({
            kind: 'content',
            group: { element } as DockviewGroupPanel,
            edge: true,
            position: 'right',
        } as DockviewWillShowOverlayLocationEvent);
        // the compass never mounted, so nothing should be drawn anywhere
        expect(
            layoutEl.querySelector('.dv-dnd-compass-edge-preview')
        ).toBeNull();
    });

    test('an outer cell previews the layout-edge landing region', () => {
        make(true);
        const { group } = groupWithContent();
        const over = (edge: boolean, position: Position) =>
            overlayEmitter.fire({
                kind: 'content',
                group,
                edge,
                position,
            } as DockviewWillShowOverlayLocationEvent);

        over(true, 'right'); // outer-right → the layout's right-half region
        const band = layoutEl.querySelector<HTMLElement>(
            '.dv-dnd-compass-edge-preview'
        );
        expect(band).toBeTruthy();
        expect(band!.style.width).toBe('50%');
        expect(band!.style.height).toBe('100%');

        over(false, 'center'); // inner cell → preview cleared
        expect(
            layoutEl.querySelector('.dv-dnd-compass-edge-preview')
        ).toBeNull();

        over(true, 'top'); // re-show, then end the drag → cleared
        window.dispatchEvent(new Event('pointerup'));
        expect(
            layoutEl.querySelector('.dv-dnd-compass-edge-preview')
        ).toBeNull();
    });

    test('queries the drop veto at most once per direction (no per-cell fan-out)', () => {
        make(true);
        const { group } = groupWithContent();
        overlayEmitter.fire({
            kind: 'content',
            group,
        } as DockviewWillShowOverlayLocationEvent);

        // 9 cells but inner+outer of a direction share a position, so the veto
        // (which can fire onUnhandledDragOver) must run at most once per position.
        expect(gateCalls).toHaveLength(new Set(gateCalls).size);
        expect(gateCalls.length).toBeLessThanOrEqual(5);
    });

    test('per-cell gating hides cells the drop would reject', () => {
        make(true);
        const { group, content } = groupWithContent();
        canDrop = (p) => p !== 'center'; // the group rejects a tab-into

        overlayEmitter.fire({
            kind: 'content',
            group,
        } as DockviewWillShowOverlayLocationEvent);

        // centre inner cell hidden → 4 inner + 4 outer; edge cells are unaffected
        expect(content.querySelectorAll('.dv-dnd-compass-cell')).toHaveLength(
            8
        );
        expect(content.querySelector('.dv-dnd-compass-cell-center')).toBeNull();
    });

    test('does not paint a non-content overlay or when disabled', () => {
        make(true);
        const { group, content } = groupWithContent();
        // a tab/header overlay is not the compass target
        overlayEmitter.fire({
            kind: 'tab',
            group,
        } as DockviewWillShowOverlayLocationEvent);
        expect(content.querySelector('.dv-dnd-compass')).toBeNull();

        make(undefined);
        const off = groupWithContent();
        overlayEmitter.fire({
            kind: 'content',
            group: off.group,
        } as DockviewWillShowOverlayLocationEvent);
        expect(off.content.querySelector('.dv-dnd-compass')).toBeNull();
    });
});
