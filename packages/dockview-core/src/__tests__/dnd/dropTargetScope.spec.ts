import { fireEvent } from '@testing-library/dom';
import {
    Droptarget,
    DroptargetEvent,
    DropTargetScopeArgs,
    DropTargetTargetModel,
    WillShowOverlayEvent,
} from '../../dnd/droptarget';
import { PointerDragController } from '../../dnd/pointer/pointerDragController';
import { PointerDropTarget } from '../../dnd/pointer/pointerDropTarget';
import { createOffsetDragOverEvent } from '../__test_utils__/utils';

function rect(left: number, top: number, width: number, height: number) {
    return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
    };
}

/** A 200x100 drop element at (100, 100). */
function createDropElement(): HTMLElement {
    const element = document.createElement('div');
    jest.spyOn(element, 'offsetWidth', 'get').mockReturnValue(200);
    jest.spyOn(element, 'offsetHeight', 'get').mockReturnValue(100);
    jest.spyOn(element, 'getBoundingClientRect').mockReturnValue(
        rect(100, 100, 200, 100)
    );
    return element;
}

/** An anchor container covering the page from (0, 0). */
function createAnchor(): {
    model: DropTargetTargetModel;
    overlay: HTMLElement;
} {
    const root = document.createElement('div');
    const overlay = document.createElement('div');
    jest.spyOn(root, 'getBoundingClientRect').mockReturnValue(
        rect(0, 0, 1000, 1000)
    );
    return {
        overlay,
        model: {
            getElements: () => ({ root, overlay, changed: false }),
            exists: () => true,
            clear: jest.fn(),
        },
    };
}

/** The scope of an edge drop within 10px of the right edge. */
function getScope(args: DropTargetScopeArgs) {
    if (args.position !== 'right' || args.width - args.x >= 10) {
        return undefined;
    }
    return { depth: 2, box: { left: 50, top: 20, width: 400, height: 300 } };
}

const ZONES = ['top', 'bottom', 'left', 'right', 'center'] as const;

describe('drop target scope', () => {
    describe('html5 backend', () => {
        function setup(withAnchor: boolean) {
            const element = createDropElement();
            const anchor = createAnchor();
            const scopeArgs: DropTargetScopeArgs[] = [];
            const target = new Droptarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: [...ZONES],
                getOverrideTarget: withAnchor ? () => anchor.model : undefined,
                getScope: (args) => {
                    scopeArgs.push(args);
                    return getScope(args);
                },
            });
            const shown: WillShowOverlayEvent[] = [];
            const drops: DroptargetEvent[] = [];
            target.onWillShowOverlay((e) => shown.push(e));
            target.onDrop((e) => drops.push(e));
            fireEvent.dragEnter(element);
            return { element, target, anchor, shown, drops, scopeArgs };
        }

        test('a scoped drop outlines the region and carries its depth', () => {
            const { element, anchor, shown, drops, scopeArgs } = setup(true);

            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 295, clientY: 150 })
            );

            expect(scopeArgs[0]).toEqual({
                position: 'right',
                x: 195,
                y: 50,
                width: 200,
                height: 100,
                zoneSize: 40,
                clientX: 295,
                clientY: 150,
            });
            expect(shown[0].depth).toBe(2);
            expect(anchor.overlay.style.left).toBe('250px');
            expect(anchor.overlay.style.top).toBe('20px');
            expect(anchor.overlay.style.width).toBe('200px');
            expect(anchor.overlay.style.height).toBe('300px');

            fireEvent.drop(element);
            expect(drops[0].position).toBe('right');
            expect(drops[0].depth).toBe(2);
        });

        test('an unscoped drop stays on the target', () => {
            const { element, anchor, shown, drops } = setup(true);

            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 280, clientY: 150 })
            );

            expect(shown[0].depth).toBe(0);
            expect(anchor.overlay.style.left).toBe('200px');
            expect(anchor.overlay.style.width).toBe('100px');

            fireEvent.drop(element);
            expect(drops[0].depth).toBe(0);
        });

        test('a live preview replaces the overlay but keeps the drop', () => {
            const element = createDropElement();
            const anchor = createAnchor();
            const previews: { position: string; depth: number }[] = [];
            const target = new Droptarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: [...ZONES],
                getOverrideTarget: () => anchor.model,
                getScope,
                livePreview: (preview) => {
                    previews.push(preview);
                    return true;
                },
            });
            const drops: DroptargetEvent[] = [];
            target.onDrop((e) => drops.push(e));
            fireEvent.dragEnter(element);

            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 295, clientY: 150 })
            );

            expect(previews).toEqual([{ position: 'right', depth: 2 }]);
            expect(anchor.overlay.style.width).toBe('');

            fireEvent.drop(element);
            expect(drops[0].position).toBe('right');
            expect(drops[0].depth).toBe(2);
        });

        test('a scope is never asked for without an anchor container', () => {
            const { element, shown, scopeArgs } = setup(false);

            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: 295, clientY: 150 })
            );

            expect(scopeArgs).toEqual([]);
            expect(shown[0].depth).toBe(0);
        });
    });

    describe('pointer backend', () => {
        afterEach(() => {
            PointerDragController.getInstance().cancel();
        });

        function dragOver(target: PointerDropTarget, clientX: number) {
            const pointerEvent = new PointerEvent('pointermove', {
                clientX,
                clientY: 150,
            });
            (target as any)._onDragOver({
                clientX,
                clientY: 150,
                pointerEvent,
            });
            return pointerEvent;
        }

        test('a scoped drop outlines the region and carries its depth', () => {
            const element = createDropElement();
            const anchor = createAnchor();
            const target = new PointerDropTarget(element, {
                canDisplayOverlay: () => true,
                acceptedTargetZones: [...ZONES],
                getOverrideTarget: () => anchor.model,
                getScope,
            });
            const shown: WillShowOverlayEvent[] = [];
            const drops: DroptargetEvent[] = [];
            target.onWillShowOverlay((e) => shown.push(e));
            target.onDrop((e) => drops.push(e));

            const pointerEvent = dragOver(target, 295);

            expect(shown[0].depth).toBe(2);
            expect(anchor.overlay.style.left).toBe('250px');
            expect(anchor.overlay.style.width).toBe('200px');
            expect(anchor.overlay.style.height).toBe('300px');

            (target as any)._onDropEvent({
                clientX: 295,
                clientY: 150,
                pointerEvent,
            });
            expect(drops[0].depth).toBe(2);

            target.dispose();
        });
    });
});
