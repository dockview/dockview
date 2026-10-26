import {
    calculateQuadrantAsPercentage,
    calculateQuadrantAsPixels,
    directionToPosition,
    Droptarget,
    Position,
    positionToDirection,
} from '../../dnd/droptarget';
import { fireEvent } from '@testing-library/dom';
import {
    createOffsetDragOverEvent,
    mockGetBoundingClientRect,
} from '../__test_utils__/utils';

describe('droptarget', () => {
    let element: HTMLElement;
    let droptarget: Droptarget;

    beforeEach(() => {
        element = document.createElement('div');

        jest.spyOn(element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(element, 'offsetWidth', 'get').mockImplementation(() => 200);
    });

    test('that dragover events are marked', () => {
        droptarget = new Droptarget(element, {
            canDisplayOverlay: () => true,
            acceptedTargetZones: ['center'],
        });

        fireEvent.dragEnter(element);
        const event = new Event('dragover');
        fireEvent(element, event);

        expect(
            (event as any)['__dockview_droptarget_event_is_used__']
        ).toBeTruthy();
    });

    test('that the drop target is removed when receiving a marked dragover event', () => {
        let position: Position | undefined = undefined;

        droptarget = new Droptarget(element, {
            canDisplayOverlay: () => true,
            acceptedTargetZones: ['center'],
        });

        droptarget.onDrop((event) => {
            position = event.position;
        });

        fireEvent.dragEnter(element);
        fireEvent.dragOver(element);

        const target = element.querySelector(
            '.dv-drop-target-dropzone'
        ) as HTMLElement;
        fireEvent.drop(target);
        expect(position).toBe('center');

        const event = new Event('dragover');
        (event as any)['__dockview_droptarget_event_is_used__'] = true;
        fireEvent(element, event);
        expect(element.querySelector('.dv-drop-target-dropzone')).toBeNull();
    });

    describe('positionResolver', () => {
        const ALL: Position[] = ['left', 'right', 'top', 'bottom', 'center'];

        test('overrides the default quadrant and receives the pointer args', () => {
            const calls: any[] = [];
            droptarget = new Droptarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: ALL,
                getPositionResolver: () => ({
                    resolve: (args) => {
                        calls.push(args);
                        return { position: 'right' };
                    },
                }),
            });

            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 100, clientY: 50 })
            );

            // 100,50 within 200x100 is the centre by default, but the resolver wins.
            expect(droptarget.state).toBe('right');
            expect(calls[0]).toMatchObject({
                x: 100,
                y: 50,
                width: 200,
                height: 100,
            });
            expect(calls[0].zones.has('center')).toBe(true);
        });

        test('an edge cell reports edge + renders no overlay', () => {
            let dropped: { position: Position; edge?: boolean } | undefined;
            droptarget = new Droptarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: ALL,
                getPositionResolver: () => ({
                    resolve: () => ({ position: 'top', edge: true }),
                }),
            });
            droptarget.onDrop((e) => {
                dropped = e;
            });

            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 100, clientY: 50 })
            );

            // no group overlay is drawn for an edge cell...
            expect(
                element.querySelector('.dv-drop-target-dropzone')
            ).toBeNull();
            // ...but the position is still reported on drop, flagged edge
            expect(droptarget.state).toBe('top');
            fireEvent.drop(element);
            expect(dropped).toEqual(
                expect.objectContaining({ position: 'top', edge: true })
            );
        });

        test('a null result shows no drop target', () => {
            droptarget = new Droptarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: ['center'],
                getPositionResolver: () => ({ resolve: () => null }),
            });

            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 100, clientY: 50 })
            );

            expect(
                element.querySelector('.dv-drop-target-dropzone')
            ).toBeNull();
            expect(droptarget.state).toBeUndefined();
        });

        test('a null result clears an anchored overlay', () => {
            // `dndOverlayMounting: 'absolute'` renders into a shared container
            // the drop target does not own, so a resolver that declines must
            // clear it explicitly or the previous frame's highlight lingers.
            let position: Position | null = 'center';
            const cleared: boolean[] = [];
            const overrideTarget = {
                getElements: () => ({
                    root: document.createElement('div'),
                    overlay: document.createElement('div'),
                    changed: false,
                }),
                exists: () => true,
                clear: () => cleared.push(true),
            };

            droptarget = new Droptarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: ALL,
                getOverrideTarget: () => overrideTarget,
                getPositionResolver: () => ({
                    resolve: () => (position ? { position } : null),
                }),
            });

            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 100, clientY: 50 })
            );
            expect(droptarget.state).toBe('center');
            expect(cleared).toEqual([]);

            // the cursor moves into a dead zone
            position = null;
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 100, clientY: 50 })
            );
            expect(droptarget.state).toBeUndefined();
            expect(cleared).toEqual([true]);
        });

        test('an edge cell clears an anchored overlay', () => {
            // Moving from an inner cell out to an outer (edge) cell: the target
            // renders nothing for an edge cell, so the anchored group overlay
            // from the previous frame must go — otherwise it double-highlights
            // alongside the consumer's whole-layout-edge preview.
            let resolved: { position: Position; edge: boolean } = {
                position: 'left',
                edge: false,
            };
            const cleared: boolean[] = [];
            const overrideTarget = {
                getElements: () => ({
                    root: document.createElement('div'),
                    overlay: document.createElement('div'),
                    changed: false,
                }),
                exists: () => true,
                clear: () => cleared.push(true),
            };

            droptarget = new Droptarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: ALL,
                getOverrideTarget: () => overrideTarget,
                getPositionResolver: () => ({ resolve: () => resolved }),
            });

            // over the inner left cell — the group overlay is anchored
            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 60, clientY: 50 })
            );
            expect(droptarget.state).toBe('left');
            expect(cleared).toEqual([]);

            // out onto the outer left cell
            resolved = { position: 'left', edge: true };
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 20, clientY: 50 })
            );
            expect(cleared).toEqual([true]);
            // the position is still latched for the consumer to commit
            expect(droptarget.state).toBe('left');
        });

        test('absent → the default quadrant is unchanged', () => {
            droptarget = new Droptarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: ['left', 'center'],
            });

            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 2, clientY: 50 })
            );
            // x=2 of width 200 is inside the 20% left band.
            expect(droptarget.state).toBe('left');
        });
    });

    describe('anchored overlay ownership', () => {
        // With `dndOverlayMounting: 'absolute'` every drop target in the
        // component shares one anchor container. A target that renders nothing
        // this frame must reset its own state — but must NOT clear the shared
        // container unless it owns what is in it. The root edge target declines
        // `center` on every frame in the middle of the layout purely so the
        // event falls through to the group beneath it.
        function anchor() {
            const cleared: number[] = [];
            let n = 0;
            return {
                cleared,
                model: {
                    getElements: () => ({
                        root: document.createElement('div'),
                        overlay: document.createElement('div'),
                        changed: false,
                    }),
                    exists: () => true,
                    clear: () => cleared.push(++n),
                },
            };
        }

        test('a rejected position does not latch a stale drop', () => {
            // Mirrors the root edge target: edges allowed, centre declined.
            const { model } = anchor();
            const drops: Position[] = [];

            droptarget = new Droptarget(element, {
                canDisplayOverlay: (_e, position) => position !== 'center',
                acceptedTargetZones: [
                    'left',
                    'right',
                    'top',
                    'bottom',
                    'center',
                ],
                getOverrideTarget: () => model,
            });
            droptarget.onDrop((e) => drops.push(e.position));

            // into the left edge band — the target renders and latches 'left'
            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 2, clientY: 50 })
            );
            expect(droptarget.state).toBe('left');

            // out into the middle, which this target declines
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 100, clientY: 50 })
            );
            expect(droptarget.state).toBeUndefined();

            // dropping in the middle must not commit the stale 'left'
            fireEvent.drop(element);
            expect(drops).toEqual([]);
        });

        test('a target that owns nothing does not clear the shared container', () => {
            const { cleared, model } = anchor();

            droptarget = new Droptarget(element, {
                canDisplayOverlay: (_e, position) => position !== 'center',
                acceptedTargetZones: [
                    'left',
                    'right',
                    'top',
                    'bottom',
                    'center',
                ],
                getOverrideTarget: () => model,
            });

            // never rendered, and declines the centre: the overlay in the shared
            // container belongs to a group beneath, so it must be left alone
            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 100, clientY: 50 })
            );
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 100, clientY: 50 })
            );

            expect(cleared).toEqual([]);
        });

        test('leaving the target unlatches it so dragend cannot commit', () => {
            // `onDragEnd` commits `_state` when this is the actual target — the
            // anchored path's normal commit route. A drag that leaves the
            // layout and is released outside must not drop at the last hovered
            // position.
            const { cleared, model } = anchor();
            const drops: Position[] = [];

            droptarget = new Droptarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: [
                    'left',
                    'right',
                    'top',
                    'bottom',
                    'center',
                ],
                getOverrideTarget: () => model,
            });
            droptarget.onDrop((e) => drops.push(e.position));

            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 2, clientY: 50 })
            );
            expect(droptarget.state).toBe('left');

            fireEvent.dragLeave(element);
            expect(droptarget.state).toBeUndefined();
            // the container is left alone — the overlay slides to whichever
            // target comes next, and dragend/drop tear it down
            expect(cleared).toEqual([]);

            fireEvent.dragEnd(element);
            expect(drops).toEqual([]);
        });

        test('`disabled` stops the target resolving', () => {
            const { model } = anchor();
            const drops: Position[] = [];

            droptarget = new Droptarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: [
                    'left',
                    'right',
                    'top',
                    'bottom',
                    'center',
                ],
                getOverrideTarget: () => model,
            });
            droptarget.onDrop((e) => drops.push(e.position));

            droptarget.disabled = true;

            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 2, clientY: 50 })
            );

            expect(droptarget.state).toBeUndefined();
            fireEvent.drop(element);
            expect(drops).toEqual([]);
        });
    });

    describe('getOverlayOutline', () => {
        // A theme with `dndPanelOverlay: 'group'` outlines the whole group while
        // the drop target listens on the content container, which sits below the
        // tab header. The pointer must be measured against the outline — the box
        // `width`/`height` describe — or every resolved position is shifted by
        // the header offset.
        test('the pointer is measured against the outline, not the listener element', () => {
            const outline = document.createElement('div');
            outline.appendChild(element);

            jest.spyOn(outline, 'offsetHeight', 'get').mockImplementation(
                () => 100
            );
            jest.spyOn(outline, 'offsetWidth', 'get').mockImplementation(
                () => 200
            );
            jest.spyOn(outline, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 0,
                        width: 200,
                        height: 100,
                    }) as DOMRect
            );
            // the content container: inset by a 35px tab header
            jest.spyOn(element, 'getBoundingClientRect').mockImplementation(
                () =>
                    mockGetBoundingClientRect({
                        left: 0,
                        top: 35,
                        width: 200,
                        height: 65,
                    }) as DOMRect
            );

            const calls: any[] = [];
            droptarget = new Droptarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: [
                    'left',
                    'right',
                    'top',
                    'bottom',
                    'center',
                ],
                getOverlayOutline: () => outline,
                getPositionResolver: () => ({
                    resolve: (args) => {
                        calls.push(args);
                        return { position: 'center' };
                    },
                }),
            });

            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 100, clientY: 50 })
            );

            // outline-relative (100, 50) — the centre of the 200x100 outline.
            // Measured against the content container it would be (100, 15).
            expect(calls[0]).toMatchObject({
                x: 100,
                y: 50,
                width: 200,
                height: 100,
            });
        });
    });

    test('directionToPosition', () => {
        expect(directionToPosition('above')).toBe('top');
        expect(directionToPosition('below')).toBe('bottom');
        expect(directionToPosition('left')).toBe('left');
        expect(directionToPosition('right')).toBe('right');
        expect(directionToPosition('within')).toBe('center');
        expect(() => directionToPosition('bad_input' as any)).toThrow(
            "invalid direction 'bad_input'"
        );
    });

    test('positionToDirection', () => {
        expect(positionToDirection('top')).toBe('above');
        expect(positionToDirection('bottom')).toBe('below');
        expect(positionToDirection('left')).toBe('left');
        expect(positionToDirection('right')).toBe('right');
        expect(positionToDirection('center')).toBe('within');
        expect(() => positionToDirection('bad_input' as any)).toThrow(
            "invalid position 'bad_input'"
        );
    });

    test('non-directional', () => {
        let position: Position | undefined = undefined;

        droptarget = new Droptarget(element, {
            canDisplayOverlay: () => true,
            acceptedTargetZones: ['center'],
        });

        droptarget.onDrop((event) => {
            position = event.position;
        });

        fireEvent.dragEnter(element);
        fireEvent.dragOver(element);

        const target = element.querySelector(
            '.dv-drop-target-dropzone'
        ) as HTMLElement;
        fireEvent.drop(target);
        expect(position).toBe('center');
    });

    test('drop', () => {
        let position: Position | undefined = undefined;

        droptarget = new Droptarget(element, {
            canDisplayOverlay: () => true,
            acceptedTargetZones: ['top', 'left', 'right', 'bottom', 'center'],
        });

        droptarget.onDrop((event) => {
            position = event.position;
        });

        fireEvent.dragEnter(element);
        fireEvent.dragOver(element);

        const target = element.querySelector(
            '.dv-drop-target-dropzone'
        ) as HTMLElement;

        jest.spyOn(target, 'clientHeight', 'get').mockImplementation(() => 100);
        jest.spyOn(target, 'clientWidth', 'get').mockImplementation(() => 200);

        fireEvent(
            target,
            createOffsetDragOverEvent({
                clientX: 19,
                clientY: 0,
            })
        );

        expect(position).toBeUndefined();
        fireEvent.drop(target);
        expect(position).toBe('left');
    });

    test('default', () => {
        droptarget = new Droptarget(element, {
            canDisplayOverlay: () => true,
            acceptedTargetZones: ['top', 'left', 'right', 'bottom', 'center'],
        });

        expect(droptarget.state).toBeUndefined();

        fireEvent.dragEnter(element);
        fireEvent.dragOver(element);

        let viewQuery = element.querySelectorAll(
            '.dv-drop-target > .dv-drop-target-dropzone > .dv-drop-target-selection'
        );
        expect(viewQuery).toHaveLength(1);

        const target = element.querySelector(
            '.dv-drop-target-dropzone'
        ) as HTMLElement;

        jest.spyOn(target, 'clientHeight', 'get').mockImplementation(() => 100);
        jest.spyOn(target, 'clientWidth', 'get').mockImplementation(() => 200);

        fireEvent(
            target,
            createOffsetDragOverEvent({ clientX: 19, clientY: 0 })
        );

        function check(
            element: HTMLElement,
            box: {
                left: string;
                top: string;
                width: string;
                height: string;
            }
        ) {
            expect(element.style.top).toBe(box.top);
            expect(element.style.left).toBe(box.left);
            expect(element.style.width).toBe(box.width);
            expect(element.style.height).toBe(box.height);
            // Ensure GPU layer is maintained
            expect(element.style.transform).toBe('translate3d(0, 0, 0)');
        }

        viewQuery = element.querySelectorAll(
            '.dv-drop-target > .dv-drop-target-dropzone > .dv-drop-target-selection'
        );
        expect(viewQuery).toHaveLength(1);
        expect(droptarget.state).toBe('left');
        check(
            element
                .getElementsByClassName('dv-drop-target-selection')
                .item(0) as HTMLDivElement,
            {
                top: '0px',
                left: '0px',
                width: '50%',
                height: '100%',
            }
        );

        fireEvent(
            target,
            createOffsetDragOverEvent({ clientX: 40, clientY: 19 })
        );

        viewQuery = element.querySelectorAll(
            '.dv-drop-target > .dv-drop-target-dropzone > .dv-drop-target-selection'
        );
        expect(viewQuery).toHaveLength(1);
        expect(droptarget.state).toBe('top');
        check(
            element
                .getElementsByClassName('dv-drop-target-selection')
                .item(0) as HTMLDivElement,
            {
                top: '0px',
                left: '0px',
                width: '100%',
                height: '50%',
            }
        );

        fireEvent(
            target,
            createOffsetDragOverEvent({ clientX: 160, clientY: 81 })
        );

        viewQuery = element.querySelectorAll(
            '.dv-drop-target > .dv-drop-target-dropzone > .dv-drop-target-selection'
        );
        expect(viewQuery).toHaveLength(1);
        expect(droptarget.state).toBe('bottom');
        check(
            element
                .getElementsByClassName('dv-drop-target-selection')
                .item(0) as HTMLDivElement,
            {
                top: '50%',
                left: '0px',
                width: '100%',
                height: '50%',
            }
        );

        fireEvent(
            target,
            createOffsetDragOverEvent({ clientX: 161, clientY: 0 })
        );

        viewQuery = element.querySelectorAll(
            '.dv-drop-target > .dv-drop-target-dropzone > .dv-drop-target-selection'
        );
        expect(viewQuery).toHaveLength(1);
        expect(droptarget.state).toBe('right');
        check(
            element
                .getElementsByClassName('dv-drop-target-selection')
                .item(0) as HTMLDivElement,
            {
                top: '0px',
                left: '50%',
                width: '50%',
                height: '100%',
            }
        );
        fireEvent(
            target,
            createOffsetDragOverEvent({ clientX: 100, clientY: 50 })
        );
        expect(droptarget.state).toBe('center');
        // With GPU optimizations, elements always have a base transform layer
        expect(
            (
                element
                    .getElementsByClassName('dv-drop-target-selection')
                    .item(0) as HTMLDivElement
            ).style.transform
        ).toBe('translate3d(0, 0, 0)');

        fireEvent.dragLeave(target);
        expect(droptarget.state).toBe('center');
        viewQuery = element.querySelectorAll('.dv-drop-target');
        expect(viewQuery).toHaveLength(0);
    });

    describe('calculateQuadrantAsPercentage', () => {
        test('variety of cases', () => {
            const inputs: Array<{
                directions: Position[];
                x: number;
                y: number;
                result: Position | null;
            }> = [
                { directions: ['left', 'right'], x: 19, y: 50, result: 'left' },
                {
                    directions: ['left', 'right'],
                    x: 81,
                    y: 50,
                    result: 'right',
                },
                {
                    directions: ['top', 'bottom'],
                    x: 50,
                    y: 19,
                    result: 'top',
                },
                {
                    directions: ['top', 'bottom'],
                    x: 50,
                    y: 81,
                    result: 'bottom',
                },
                {
                    directions: ['left', 'right', 'top', 'bottom', 'center'],
                    x: 50,
                    y: 50,
                    result: 'center',
                },
                {
                    directions: ['left', 'right', 'top', 'bottom'],
                    x: 50,
                    y: 50,
                    result: null,
                },
            ];

            for (const input of inputs) {
                expect(
                    calculateQuadrantAsPercentage(
                        new Set(input.directions),
                        input.x,
                        input.y,
                        100,
                        100,
                        20
                    )
                ).toBe(input.result);
            }
        });
    });

    describe('smallWidthBoundary', () => {
        test('element narrower than default threshold renders 4px line strip without smallWidthBoundary', () => {
            // 80px < SMALL_WIDTH_BOUNDARY (100) → isSmallX = true → 4px strip at edge
            const smallEl = document.createElement('div');
            jest.spyOn(smallEl, 'offsetHeight', 'get').mockReturnValue(30);
            jest.spyOn(smallEl, 'offsetWidth', 'get').mockReturnValue(80);

            const dt = new Droptarget(smallEl, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: ['left', 'right'],
                overlayModel: {
                    activationSize: { value: 50, type: 'percentage' },
                },
            });

            fireEvent.dragEnter(smallEl);
            // left half: clientX=20, x=20, xp=25 < 50 → 'left'
            fireEvent(
                smallEl,
                createOffsetDragOverEvent({ clientX: 20, clientY: 0 })
            );

            const selection = smallEl.querySelector(
                '.dv-drop-target-selection'
            ) as HTMLElement;
            expect(selection).not.toBeNull();
            // 4px strip at left edge
            expect(selection.style.width).toBe('4px');
            expect(
                selection.classList.contains('dv-drop-target-small-horizontal')
            ).toBeTruthy();
            expect(
                selection.classList.contains('dv-drop-target-selection-line')
            ).toBeTruthy();

            dt.dispose();
        });

        test('smallWidthBoundary: 0 renders half-width overlay regardless of element width', () => {
            // Same 80px element, but smallWidthBoundary: 0 → isSmallX = false → half-width overlay
            const smallEl = document.createElement('div');
            jest.spyOn(smallEl, 'offsetHeight', 'get').mockReturnValue(30);
            jest.spyOn(smallEl, 'offsetWidth', 'get').mockReturnValue(80);

            const dt = new Droptarget(smallEl, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: ['left', 'right'],
                overlayModel: {
                    activationSize: { value: 50, type: 'percentage' },
                    smallWidthBoundary: 0,
                },
            });

            fireEvent.dragEnter(smallEl);
            // left half
            fireEvent(
                smallEl,
                createOffsetDragOverEvent({ clientX: 20, clientY: 0 })
            );

            const selection = smallEl.querySelector(
                '.dv-drop-target-selection'
            ) as HTMLElement;
            expect(selection).not.toBeNull();
            expect(dt.state).toBe('left');
            expect(selection.style.width).toBe('50%');
            expect(selection.style.left).toBe('0px');
            expect(
                selection.classList.contains('dv-drop-target-small-horizontal')
            ).toBeFalsy();

            // right half
            fireEvent(
                smallEl,
                createOffsetDragOverEvent({ clientX: 60, clientY: 0 })
            );
            expect(dt.state).toBe('right');
            expect(selection.style.width).toBe('50%');
            expect(selection.style.left).toBe('50%');
            expect(
                selection.classList.contains('dv-drop-target-small-horizontal')
            ).toBeFalsy();

            dt.dispose();
        });
    });

    describe('calculateQuadrantAsPixels', () => {
        test('variety of cases', () => {
            const inputs: Array<{
                directions: Position[];
                x: number;
                y: number;
                result: Position | null;
            }> = [
                { directions: ['left', 'right'], x: 19, y: 50, result: 'left' },
                {
                    directions: ['left', 'right'],
                    x: 81,
                    y: 50,
                    result: 'right',
                },
                {
                    directions: ['top', 'bottom'],
                    x: 50,
                    y: 19,
                    result: 'top',
                },
                {
                    directions: ['top', 'bottom'],
                    x: 50,
                    y: 81,
                    result: 'bottom',
                },
                {
                    directions: ['left', 'right', 'top', 'bottom', 'center'],
                    x: 50,
                    y: 50,
                    result: 'center',
                },
                {
                    directions: ['left', 'right', 'top', 'bottom'],
                    x: 50,
                    y: 50,
                    result: null,
                },
            ];

            for (const input of inputs) {
                expect(
                    calculateQuadrantAsPixels(
                        new Set(input.directions),
                        input.x,
                        input.y,
                        100,
                        100,
                        20
                    )
                ).toBe(input.result);
            }
        });
    });
});
