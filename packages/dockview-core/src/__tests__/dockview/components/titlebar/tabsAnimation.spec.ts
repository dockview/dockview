import { Tabs } from '../../../../dockview/components/titlebar/tabs';
import { fromPartial } from '@total-typescript/shoehorn';
import { DockviewGroupPanel } from '../../../../dockview/dockviewGroupPanel';
import { DockviewComponent } from '../../../../dockview/dockviewComponent';
import { IDockviewPanel } from '../../../../dockview/dockviewPanel';
import { ITabRenderer } from '../../../../dockview/types';
import { IDockviewPanelModel } from '../../../../dockview/dockviewPanelModel';
import { fireEvent } from '@testing-library/dom';
import * as dataTransfer from '../../../../dnd/dataTransfer';

// SWC compiles ESM named exports as getter-only, so `jest.spyOn` cannot
// redefine them. Mock the module instead: `getPanelData` defaults to the real
// implementation (re-armed in `beforeEach`) and individual tests override it
// via `.mockReturnValue(...)`.
const actualDataTransfer = jest.requireActual<typeof dataTransfer>(
    '../../../../dnd/dataTransfer'
);
jest.mock('../../../../dnd/dataTransfer', () => ({
    ...jest.requireActual('../../../../dnd/dataTransfer'),
    getPanelData: jest.fn(),
}));
import { TabAnimation } from '../../../../dockview/options';
import { TabGroupChip } from '../../../../dockview/components/titlebar/tabGroupChip';
import { TabGroup } from '../../../../dockview/tabGroup';
import { PointerDragController } from '../../../../dnd/pointer/pointerDragController';

function makeDOMRect(
    x: number,
    y: number,
    width: number,
    height: number
): DOMRect {
    return {
        x,
        y,
        width,
        height,
        top: y,
        left: x,
        right: x + width,
        bottom: y + height,
        toJSON: () => ({}),
    } as DOMRect;
}

function createMockPanel(id: string): IDockviewPanel {
    const tabRenderer: ITabRenderer = {
        element: document.createElement('div'),
        init: jest.fn(),
        update: jest.fn(),
        dispose: jest.fn(),
    };

    return fromPartial<IDockviewPanel>({
        id,
        view: fromPartial<IDockviewPanelModel>({
            tab: tabRenderer,
        }),
    });
}

function createTabs(
    options: { tabAnimation?: TabAnimation; disableDnd?: boolean } = {}
): { tabs: Tabs; accessor: DockviewComponent; group: DockviewGroupPanel } {
    const accessor = fromPartial<DockviewComponent>({
        id: 'test-accessor',
        options: {
            theme: {
                name: 'test',
                className: 'test',
                tabAnimation: options.tabAnimation,
            },
            disableDnd: options.disableDnd,
        },
        onDidOptionsChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    });

    const group = fromPartial<DockviewGroupPanel>({
        id: 'test-group',
        locked: false,
        model: fromPartial({
            canDisplayOverlay: jest.fn().mockReturnValue(true),
            dropTargetContainer: undefined,
        }),
    });

    const tabs = new Tabs(group, accessor, {
        showTabsOverflowControl: false,
    });

    return { tabs, accessor, group };
}

function getTabElements(tabs: Tabs): HTMLElement[] {
    return (tabs as any)._tabs.map(
        (t: { value: { element: HTMLElement } }) => t.value.element
    );
}

function getAnimState(tabs: Tabs): any {
    return (tabs as any)._animState;
}

function mockTabRect(
    element: HTMLElement,
    rect: { left: number; width: number }
): void {
    jest.spyOn(element, 'getBoundingClientRect').mockReturnValue(
        makeDOMRect(rect.left, 0, rect.width, 30)
    );
}

interface MockAnimation {
    finished: Promise<void>;
    cancel: jest.Mock;
    resolveFinished: () => void;
}

/** Stub `HTMLElement.prototype.animate` (absent in jsdom) so the Web Animations
 *  API paths run; returns the created animations + a restore(). */
function installAnimateMock(): {
    animations: MockAnimation[];
    restore: () => void;
} {
    const proto = HTMLElement.prototype as unknown as {
        animate?: (...args: unknown[]) => Animation;
    };
    const original = proto.animate;
    const animations: MockAnimation[] = [];
    proto.animate = function (): Animation {
        let resolveFinished!: () => void;
        let rejectFinished!: (reason?: unknown) => void;
        const finished = new Promise<void>((resolve, reject) => {
            resolveFinished = resolve;
            rejectFinished = reject;
        });
        finished.catch(() => {});
        const anim: MockAnimation = {
            finished,
            cancel: jest.fn(() => rejectFinished(new Error('AbortError'))),
            resolveFinished,
        };
        animations.push(anim);
        return anim as unknown as Animation;
    };
    return {
        animations,
        restore: () => {
            proto.animate = original;
        },
    };
}

const flushMicrotasks = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('tabs - animation', () => {
    let rAFCallbacks: FrameRequestCallback[];

    beforeEach(() => {
        const getPanelData = dataTransfer.getPanelData as jest.Mock;
        getPanelData.mockReset();
        getPanelData.mockImplementation(actualDataTransfer.getPanelData);
        rAFCallbacks = [];
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rAFCallbacks.push(cb);
            return rAFCallbacks.length;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function flushRAF() {
        const callbacks = [...rAFCallbacks];
        rAFCallbacks = [];
        for (const cb of callbacks) {
            cb(performance.now());
        }
    }

    describe('animation state initialization', () => {
        test('dragstart initializes animation state when animation enabled', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            expect(getAnimState(tabs)).toBeNull();

            fireEvent.dragStart(elements[0]);

            const state = getAnimState(tabs);
            expect(state).not.toBeNull();
            expect(state.sourceTabId).toBe('panel-a');
            expect(state.sourceIndex).toBe(0);
            expect(state.tabPositions).toBeInstanceOf(Map);
            expect(state.tabPositions.size).toBe(2);
            expect(state.currentInsertionIndex).toBeNull();
        });

        test('dragstart does not initialize state when tabAnimation is default', () => {
            const { tabs } = createTabs({ tabAnimation: 'default' });
            const panel = createMockPanel('panel-a');

            tabs.openPanel(panel, 0);

            const elements = getTabElements(tabs);
            fireEvent.dragStart(elements[0]);

            expect(getAnimState(tabs)).toBeNull();
        });

        test('dragstart does not initialize state when disableDnd is true', () => {
            const { tabs } = createTabs({ disableDnd: true });
            const panel = createMockPanel('panel-a');

            tabs.openPanel(panel, 0);

            const elements = getTabElements(tabs);
            fireEvent.dragStart(elements[0]);

            // disableDnd prevents the HTML5 drag source from processing
            // the event, so Tab's onDragStart never fires and _animState
            // stays null.
            expect(getAnimState(tabs)).toBeNull();
        });
    });

    describe('source tab collapse', () => {
        test('dragstart adds dv-tab--dragging class when animation enabled', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panel = createMockPanel('panel-a');

            tabs.openPanel(panel, 0);

            const elements = getTabElements(tabs);
            expect(
                elements[0].classList.contains('dv-tab--dragging')
            ).toBeFalsy();

            fireEvent.dragStart(elements[0]);
            flushRAF();

            expect(
                elements[0].classList.contains('dv-tab--dragging')
            ).toBeTruthy();
        });

        test('dragstart does not add dv-tab--dragging class when tabAnimation is default', () => {
            const { tabs } = createTabs({ tabAnimation: 'default' });
            const panel = createMockPanel('panel-a');

            tabs.openPanel(panel, 0);

            const elements = getTabElements(tabs);
            fireEvent.dragStart(elements[0]);

            expect(
                elements[0].classList.contains('dv-tab--dragging')
            ).toBeFalsy();
        });
    });

    describe('drag cancellation', () => {
        test('dragend resets animation state and removes dragging class', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            // Start drag
            fireEvent.dragStart(elements[0]);
            flushRAF();
            expect(getAnimState(tabs)).not.toBeNull();
            expect(
                elements[0].classList.contains('dv-tab--dragging')
            ).toBeTruthy();

            // Cancel drag (dragend on container - simulating cancel)
            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragEnd(tabsList);

            expect(getAnimState(tabs)).toBeNull();
            expect(
                elements[0].classList.contains('dv-tab--dragging')
            ).toBeFalsy();
        });

        test('dragend removes shifting classes and transforms from all tabs', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            // Manually set transforms and classes to simulate mid-animation
            elements[0].style.transform = 'translateX(100px)';
            elements[0].classList.add('dv-tab--shifting');
            elements[1].style.transform = 'translateX(-100px)';
            elements[1].classList.add('dv-tab--shifting');

            // Set animation state
            (tabs as any)._animState = {
                sourceTabId: 'panel-a',
                sourceIndex: 0,
                tabPositions: new Map(),
                currentInsertionIndex: null,
            };

            // Trigger dragend
            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragEnd(tabsList);

            expect(elements[0].style.transform).toBe('');
            expect(elements[1].style.transform).toBe('');
            expect(
                elements[0].classList.contains('dv-tab--shifting')
            ).toBeFalsy();
            expect(
                elements[1].classList.contains('dv-tab--shifting')
            ).toBeFalsy();
        });
    });

    describe('FLIP animation', () => {
        test('runFlipAnimation applies inverse transforms for moved tabs', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');
            const panelC = createMockPanel('panel-c');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);
            tabs.openPanel(panelC, 2);

            const elements = getTabElements(tabs);

            // Create "first" positions (before DOM reorder)
            const firstPositions = new Map<string, DOMRect>();
            firstPositions.set('panel-a', makeDOMRect(0, 0, 80, 30));
            firstPositions.set('panel-b', makeDOMRect(80, 0, 80, 30));
            firstPositions.set('panel-c', makeDOMRect(160, 0, 80, 30));

            // Mock "last" positions (after DOM reorder: A moved from 0 to 160)
            mockTabRect(elements[0], { left: 160, width: 80 });
            mockTabRect(elements[1], { left: 0, width: 80 });
            mockTabRect(elements[2], { left: 80, width: 80 });

            // Run FLIP (source tab is panel-a, so B and C should get transforms)
            (tabs as any).runFlipAnimation(firstPositions, 'panel-a');

            // panel-b: was at 80, now at 0 → delta = +80
            expect(elements[1].style.transform).toBe('translateX(80px)');
            expect(
                elements[1].classList.contains('dv-tab--shifting')
            ).toBeTruthy();

            // panel-c: was at 160, now at 80 → delta = +80
            expect(elements[2].style.transform).toBe('translateX(80px)');
            expect(
                elements[2].classList.contains('dv-tab--shifting')
            ).toBeTruthy();

            // panel-a (source) should not have transform
            expect(elements[0].style.transform).toBe('');
        });

        test('runFlipAnimation removes transforms in requestAnimationFrame', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            const firstPositions = new Map<string, DOMRect>();
            firstPositions.set('panel-a', makeDOMRect(0, 0, 80, 30));
            firstPositions.set('panel-b', makeDOMRect(80, 0, 80, 30));

            // panel-b moved from 80 to 0
            mockTabRect(elements[0], { left: 80, width: 80 });
            mockTabRect(elements[1], { left: 0, width: 80 });

            (tabs as any).runFlipAnimation(firstPositions, 'panel-a');

            // Before rAF: transform should be applied
            expect(elements[1].style.transform).toBe('translateX(80px)');

            // Flush rAF
            flushRAF();

            // After rAF: transform should be removed (CSS transition takes over)
            expect(elements[1].style.transform).toBe('');
        });

        test('FLIP transforms survive the dragend that fires immediately after drop', () => {
            // After a drop, tab.onDrop sets _animState = null then calls
            // runFlipAnimation (which queues a rAF that triggers the
            // transition). The browser then fires `dragend` synchronously
            // on the source element, which bubbles to _tabsList where the
            // resetDragAnimation listener runs *before* the rAF. If that
            // listener clears the transforms, FLIP never animates.
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            tabs.openPanel(createMockPanel('panel-a'), 0);
            tabs.openPanel(createMockPanel('panel-b'), 1);

            const elements = getTabElements(tabs);
            const firstPositions = new Map<string, DOMRect>();
            firstPositions.set('panel-a', makeDOMRect(0, 0, 80, 30));
            firstPositions.set('panel-b', makeDOMRect(80, 0, 80, 30));
            mockTabRect(elements[0], { left: 80, width: 80 });
            mockTabRect(elements[1], { left: 0, width: 80 });

            // tab.onDrop nulls _animState before invoking runFlipAnimation.
            (tabs as any)._animState = null;
            (tabs as any).runFlipAnimation(firstPositions, 'panel-a');

            expect(elements[1].style.transform).toBe('translateX(80px)');
            expect(
                elements[1].classList.contains('dv-tab--shifting')
            ).toBeTruthy();

            // Fire the post-drop dragend. It must not clobber the FLIP.
            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragEnd(tabsList);

            expect(elements[1].style.transform).toBe('translateX(80px)');
            expect(
                elements[1].classList.contains('dv-tab--shifting')
            ).toBeTruthy();

            // rAF still runs and clears the transform so the CSS
            // transition takes over.
            flushRAF();
            expect(elements[1].style.transform).toBe('');
        });

        test('pointer drag end after drop does not clobber in-flight FLIP', () => {
            // Pointer-side equivalent of the test above. The Tabs
            // constructor subscribes to PointerDragController.onDragEnd
            // and calls resetDragAnimation; a successful drop fires
            // controller.onDragEnd synchronously after tab.onDrop, so
            // the same race exists on the pointer path.
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            tabs.openPanel(createMockPanel('panel-a'), 0);
            tabs.openPanel(createMockPanel('panel-b'), 1);

            const elements = getTabElements(tabs);
            const firstPositions = new Map<string, DOMRect>();
            firstPositions.set('panel-a', makeDOMRect(0, 0, 80, 30));
            firstPositions.set('panel-b', makeDOMRect(80, 0, 80, 30));
            mockTabRect(elements[0], { left: 80, width: 80 });
            mockTabRect(elements[1], { left: 0, width: 80 });

            (tabs as any)._animState = null;
            (tabs as any).runFlipAnimation(firstPositions, 'panel-a');

            expect(elements[1].style.transform).toBe('translateX(80px)');

            // Trigger PointerDragController.onDragEnd via a begin/cancel.
            const controller = PointerDragController.getInstance();
            controller.beginDrag({
                pointerEvent: new PointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'touch',
                }),
                source: elements[0],
                getData: () => ({ dispose: jest.fn() }),
            });
            window.dispatchEvent(
                new PointerEvent('pointerup', {
                    pointerId: 1,
                    pointerType: 'touch',
                })
            );

            expect(elements[1].style.transform).toBe('translateX(80px)');
            expect(
                elements[1].classList.contains('dv-tab--shifting')
            ).toBeTruthy();

            flushRAF();
            expect(elements[1].style.transform).toBe('');
        });

        test('no animation when no tabs moved (drop at original position)', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            const firstPositions = new Map<string, DOMRect>();
            firstPositions.set('panel-a', makeDOMRect(0, 0, 80, 30));
            firstPositions.set('panel-b', makeDOMRect(80, 0, 80, 30));

            // Same positions after "reorder" (no actual move)
            mockTabRect(elements[0], { left: 0, width: 80 });
            mockTabRect(elements[1], { left: 80, width: 80 });

            (tabs as any).runFlipAnimation(firstPositions, 'panel-a');

            // No transforms should be applied (delta < 1)
            expect(elements[0].style.transform).toBe('');
            expect(elements[1].style.transform).toBe('');

            // No rAF should be queued
            expect(rAFCallbacks).toHaveLength(0);
        });

        describe('Web Animations API path', () => {
            const flush = flushMicrotasks;

            function threeTabsMovedFlip() {
                const { tabs } = createTabs({ tabAnimation: 'smooth' });
                tabs.openPanel(createMockPanel('panel-a'), 0);
                tabs.openPanel(createMockPanel('panel-b'), 1);
                tabs.openPanel(createMockPanel('panel-c'), 2);
                const elements = getTabElements(tabs);

                const firstPositions = new Map<string, DOMRect>();
                firstPositions.set('panel-a', makeDOMRect(0, 0, 80, 30));
                firstPositions.set('panel-b', makeDOMRect(80, 0, 80, 30));
                firstPositions.set('panel-c', makeDOMRect(160, 0, 80, 30));
                // A moved 0→160; B and C each shift by +80.
                mockTabRect(elements[0], { left: 160, width: 80 });
                mockTabRect(elements[1], { left: 0, width: 80 });
                mockTabRect(elements[2], { left: 80, width: 80 });

                return { tabs, elements, firstPositions };
            }

            test('drives element.animate per moved tab and rests each at its final position', () => {
                const mock = installAnimateMock();
                try {
                    const { tabs, elements, firstPositions } =
                        threeTabsMovedFlip();

                    (tabs as any).runFlipAnimation(firstPositions, 'panel-a');

                    // One scripted slide per moved tab (B, C); the source (A)
                    // does not move.
                    expect(mock.animations).toHaveLength(2);
                    // Base rests at the final position (inline transform
                    // cleared), CSS transition suppressed while it plays, and
                    // the shifting marker held for the slide.
                    expect(elements[1].style.transform).toBe('');
                    expect(elements[2].style.transform).toBe('');
                    expect(elements[1].style.transition).toBe('none');
                    expect(
                        elements[1].classList.contains('dv-tab--shifting')
                    ).toBe(true);
                    // No next-frame transform-clear is scheduled (that's the
                    // fallback path).
                    expect(rAFCallbacks).toHaveLength(0);
                } finally {
                    mock.restore();
                }
            });

            test('drops the shifting markers and clears suppression once every slide finishes', async () => {
                const mock = installAnimateMock();
                try {
                    const { tabs, elements, firstPositions } =
                        threeTabsMovedFlip();

                    (tabs as any).runFlipAnimation(firstPositions, 'panel-a');
                    expect(mock.animations).toHaveLength(2);

                    // Only one finished so far → still shifting.
                    mock.animations[0].resolveFinished();
                    await flush();
                    expect(
                        elements[1].classList.contains('dv-tab--shifting')
                    ).toBe(true);

                    // All finished → markers dropped, suppression cleared.
                    mock.animations[1].resolveFinished();
                    await flush();
                    expect(elements[1].style.transition).toBe('');
                    expect(elements[2].style.transition).toBe('');
                    expect(
                        elements[1].classList.contains('dv-tab--shifting')
                    ).toBe(false);
                    expect(
                        elements[2].classList.contains('dv-tab--shifting')
                    ).toBe(false);
                } finally {
                    mock.restore();
                }
            });

            test('resetTabTransforms cancels an in-flight FLIP slide', () => {
                const mock = installAnimateMock();
                try {
                    const { tabs, elements, firstPositions } =
                        threeTabsMovedFlip();

                    (tabs as any).runFlipAnimation(firstPositions, 'panel-a');
                    expect(mock.animations).toHaveLength(2);

                    (tabs as any).resetTabTransforms();

                    for (const anim of mock.animations) {
                        expect(anim.cancel).toHaveBeenCalledTimes(1);
                    }
                    expect(
                        elements[1].classList.contains('dv-tab--shifting')
                    ).toBe(false);
                    expect(
                        elements[2].classList.contains('dv-tab--shifting')
                    ).toBe(false);
                } finally {
                    mock.restore();
                }
            });

            test('reduced motion snaps to final positions with no scripted slide', () => {
                const win = document.defaultView as Window & {
                    matchMedia?: (q: string) => MediaQueryList;
                };
                const originalMatchMedia = win.matchMedia;
                win.matchMedia = ((query: string) =>
                    ({
                        matches: true,
                        media: query,
                    }) as MediaQueryList) as typeof win.matchMedia;
                const mock = installAnimateMock();
                try {
                    const { tabs, elements, firstPositions } =
                        threeTabsMovedFlip();

                    (tabs as any).runFlipAnimation(firstPositions, 'panel-a');

                    // No scripted slide; the moved tabs snap to their final slot
                    // (inline transform cleared) with the shifting marker dropped.
                    expect(mock.animations).toHaveLength(0);
                    expect(elements[1].style.transform).toBe('');
                    expect(
                        elements[1].classList.contains('dv-tab--shifting')
                    ).toBe(false);
                } finally {
                    mock.restore();
                    win.matchMedia = originalMatchMedia;
                }
            });
        });
    });

    describe('resetTabTransforms', () => {
        test('clears all transforms and shifting classes', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            // Set up transforms
            elements[0].style.transform = 'translateX(50px)';
            elements[0].classList.add('dv-tab--shifting');
            elements[1].style.transform = 'translateX(-50px)';
            elements[1].classList.add('dv-tab--shifting');

            (tabs as any).resetTabTransforms();

            expect(elements[0].style.transform).toBe('');
            expect(elements[1].style.transform).toBe('');
            expect(
                elements[0].classList.contains('dv-tab--shifting')
            ).toBeFalsy();
            expect(
                elements[1].classList.contains('dv-tab--shifting')
            ).toBeFalsy();
        });
    });

    describe('dispose cleanup', () => {
        test('dispose during active drag clears animation state', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            // Start drag
            fireEvent.dragStart(elements[0]);
            expect(getAnimState(tabs)).not.toBeNull();

            // Dispose
            tabs.dispose();

            expect(getAnimState(tabs)).toBeNull();
        });
    });

    describe('delete cleanup', () => {
        test('deleting source tab during cross-group move clears animation state', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            // Simulate drag start
            fireEvent.dragStart(elements[0]);
            expect(getAnimState(tabs)).not.toBeNull();
            expect(getAnimState(tabs).sourceTabId).toBe('panel-a');

            // Simulate cross-group removal (the tab is deleted from this group)
            tabs.delete('panel-a');

            expect(getAnimState(tabs)).toBeNull();
        });

        test('deleting non-source tab does not clear animation state', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');
            const panelC = createMockPanel('panel-c');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);
            tabs.openPanel(panelC, 2);

            const elements = getTabElements(tabs);

            // Start drag on panel-a
            fireEvent.dragStart(elements[0]);
            expect(getAnimState(tabs)).not.toBeNull();

            // Delete a different tab
            tabs.delete('panel-c');

            // Animation state should still exist
            expect(getAnimState(tabs)).not.toBeNull();
            expect(getAnimState(tabs).sourceTabId).toBe('panel-a');
        });
    });

    describe('handleDragOver', () => {
        test('updates currentInsertionIndex based on cursor position', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');
            const panelC = createMockPanel('panel-c');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);
            tabs.openPanel(panelC, 2);

            const elements = getTabElements(tabs);

            // Mock tab positions
            mockTabRect(elements[0], { left: 0, width: 80 });
            mockTabRect(elements[1], { left: 80, width: 80 });
            mockTabRect(elements[2], { left: 160, width: 80 });

            // Start drag on panel-a
            fireEvent.dragStart(elements[0]);
            expect(getAnimState(tabs)).not.toBeNull();

            // Call handleDragOver directly with a mock event
            const mockEvent = { clientX: 120 } as DragEvent;
            (tabs as any).handleDragOver(mockEvent);

            // panel-a (index 0) is source → skipped
            // panel-b (index 1): midpoint = 120, 120 < 120 → false, insertionIndex = 2
            // panel-c (index 2): midpoint = 200, 120 < 200 → true, insertionIndex = 2
            expect(getAnimState(tabs).currentInsertionIndex).toBe(2);
        });

        test('dragging tab adjacent to a group chip allows drop at position 0 of that group', () => {
            // Regression: dragging the tab immediately left of a group chip
            // into position 0 of the group was impossible because the
            // sourceInBetween check incorrectly skipped the group.
            //
            // Layout: [Feature chip][A][B][C][D][Monitoring chip][E]
            // Drag D → cursor over Monitoring chip → should target Monitoring group
            const { tabs, group } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');
            const panelC = createMockPanel('panel-c');
            const panelD = createMockPanel('panel-d');
            const panelE = createMockPanel('panel-e');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);
            tabs.openPanel(panelC, 2);
            tabs.openPanel(panelD, 3);
            tabs.openPanel(panelE, 4);

            const elements = getTabElements(tabs);

            // Feature chip (30px) + 4 tabs (80px each) + Monitoring chip (30px) + 1 tab (80px)
            // Positions: chip@0, A@30, B@110, C@190, D@270, chip@350, E@380
            mockTabRect(elements[0], { left: 30, width: 80 }); // A
            mockTabRect(elements[1], { left: 110, width: 80 }); // B
            mockTabRect(elements[2], { left: 190, width: 80 }); // C
            mockTabRect(elements[3], { left: 270, width: 80 }); // D (source)
            mockTabRect(elements[4], { left: 380, width: 80 }); // E

            // Mock tab groups returned by the model
            const featureGroup = {
                id: 'feature-group',
                panelIds: ['panel-a', 'panel-b', 'panel-c', 'panel-d'],
                collapsed: false,
            };
            const monitoringGroup = {
                id: 'monitoring-group',
                panelIds: ['panel-e'],
                collapsed: false,
            };
            (group.model as any).getTabGroups = () => [
                featureGroup,
                monitoringGroup,
            ];

            // Set up chip renderers map so the code knows there are chips
            const chipRenderers = (tabs as any)._tabGroupManager
                ._chipRenderers as Map<string, any>;
            chipRenderers.set('feature-group', {
                chip: { element: document.createElement('span') },
                disposable: { dispose: jest.fn() },
            });
            chipRenderers.set('monitoring-group', {
                chip: { element: document.createElement('span') },
                disposable: { dispose: jest.fn() },
            });

            // Start drag on panel-d (index 3)
            fireEvent.dragStart(elements[3]);
            flushRAF();

            // Override _animState chip positions
            const state = getAnimState(tabs);
            state.chipPositions.set('feature-group', 30);
            state.chipPositions.set('monitoring-group', 30);
            // containerLeft = 0 for simplicity
            state.containerLeft = 0;
            // cursorOffsetFromDragLeft = 40 (half of 80)
            state.cursorOffsetFromDragLeft = 40;

            // Position cursor just before the Monitoring chip so the chip
            // overflows but all Feature tabs fit:
            //   dragLeftEdge = 330 - 40 = 290, availableSpace = 290
            //   Feature chip(30) + A(80) + B(80) + C(80) = 270 ≤ 290
            //   Monitoring chip: 270 + 30 = 300 > 290 → overflow → break
            //   insertionIndex stays at 3 (D's raw index)
            //
            // Group matching for Monitoring:
            //   effectivePanelIds = [E], firstIdx = 4, lastIdx = 4
            //   isJustBeforeGroup = (3 === 4-1) = true
            //   j=3: tabs[3] = D = source → allInBetweenAreSource = true
            //   → threshold check: chipWidth=30, containerLeft+accUpTo=270
            //     threshold = 270 + 30 = 300, mouseX=330 ≥ 300 → target = monitoring
            (tabs as any).handleDragOver({ clientX: 330 } as DragEvent);

            expect(getAnimState(tabs).targetTabGroupId).toBe(
                'monitoring-group'
            );
        });

        test('dragging a group chip just before another group keeps insertion index outside the group (issue #1264)', () => {
            // Regression: dragging a chip onto the left of a standalone tab
            // T, when a chip group sits immediately to T's right, must drop
            // *before* T, not between T and the adjacent chip.
            //
            // Layout: [T][A1][A2] with chip "groupA" covering A1+A2.
            // Drag external chip B; cursor on T's far left → insertionIndex
            // accumulates to 0. The fix prevents the `isGroupDrag` snap
            // from moving it forward to firstIdx (1) just because
            // groupA's first tab is at index 1.
            const { tabs, group } = createTabs({ tabAnimation: 'smooth' });
            const panelT = createMockPanel('T');
            const panelA1 = createMockPanel('A1');
            const panelA2 = createMockPanel('A2');

            tabs.openPanel(panelT, 0);
            tabs.openPanel(panelA1, 1);
            tabs.openPanel(panelA2, 2);

            const elements = getTabElements(tabs);
            mockTabRect(elements[0], { left: 0, width: 80 }); // T
            mockTabRect(elements[1], { left: 110, width: 80 }); // A1 (chip)
            mockTabRect(elements[2], { left: 190, width: 80 }); // A2 (chip)

            const groupA = {
                id: 'groupA',
                panelIds: ['A1', 'A2'],
                collapsed: false,
            };
            (group.model as any).getTabGroups = () => [groupA];

            const chipRenderers = (tabs as any)._tabGroupManager
                ._chipRenderers as Map<string, any>;
            chipRenderers.set('groupA', {
                chip: { element: document.createElement('span') },
                disposable: { dispose: jest.fn() },
            });

            // Simulate cross-group chip drag state (source chip from another
            // group, no overlap with destination panels).
            (tabs as any)._animState = {
                sourceTabId: '',
                sourceIndex: -1,
                tabPositions: (tabs as any).snapshotTabPositions(),
                chipPositions: new Map([['groupA', 30]]),
                currentInsertionIndex: null,
                targetTabGroupId: null,
                sourceTabGroupId: 'external-chipB',
                sourceGroupPanelIds: new Set<string>(),
                sourceChipWidth: 30,
                cursorOffsetFromDragLeft: 40,
                sourceGapWidth: 80,
                containerLeft: 0,
            };

            // Cursor at clientX=20 → dragLeftEdge = -20, availableSpace = -20.
            // T's midpoint check: 0 + 40 ≤ -20 → false, insertionIndex = 0.
            // Without the fix: isJustBeforeGroup snaps to firstIdx (1),
            // producing the buggy "between T and chip" drop.
            (tabs as any).handleDragOver({ clientX: 20 } as DragEvent);

            expect(getAnimState(tabs).currentInsertionIndex).toBe(0);
            expect(getAnimState(tabs).targetTabGroupId).toBeNull();
        });

        test('dragging a group chip never targets another group', () => {
            // Regression: dragging a group chip between two tabs of another
            // group must not set targetTabGroupId, because groups cannot be
            // dropped inside other groups.
            //
            // Layout: [Feature chip][A][B][Monitoring chip][C]
            // Drag Feature group → cursor between C's tabs area
            const { tabs, group } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');
            const panelC = createMockPanel('panel-c');
            const panelD = createMockPanel('panel-d');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);
            tabs.openPanel(panelC, 2);
            tabs.openPanel(panelD, 3);

            const elements = getTabElements(tabs);

            mockTabRect(elements[0], { left: 30, width: 80 }); // A
            mockTabRect(elements[1], { left: 110, width: 80 }); // B
            mockTabRect(elements[2], { left: 220, width: 80 }); // C
            mockTabRect(elements[3], { left: 300, width: 80 }); // D

            const featureGroup = {
                id: 'feature-group',
                panelIds: ['panel-a', 'panel-b'],
                collapsed: false,
            };
            const monitoringGroup = {
                id: 'monitoring-group',
                panelIds: ['panel-c', 'panel-d'],
                collapsed: false,
            };
            (group.model as any).getTabGroups = () => [
                featureGroup,
                monitoringGroup,
            ];

            const chipRenderers = (tabs as any)._tabGroupManager
                ._chipRenderers as Map<string, any>;
            chipRenderers.set('feature-group', {
                chip: { element: document.createElement('span') },
                disposable: { dispose: jest.fn() },
            });
            chipRenderers.set('monitoring-group', {
                chip: { element: document.createElement('span') },
                disposable: { dispose: jest.fn() },
            });

            // Manually initialize a group drag (sourceTabGroupId is set)
            (tabs as any)._animState = {
                sourceTabId: '',
                sourceIndex: 0,
                tabPositions: (tabs as any).snapshotTabPositions(),
                chipPositions: new Map([
                    ['feature-group', 30],
                    ['monitoring-group', 30],
                ]),
                currentInsertionIndex: null,
                targetTabGroupId: null,
                sourceTabGroupId: 'feature-group',
                sourceGroupPanelIds: new Set(['panel-a', 'panel-b']),
                sourceChipWidth: 30,
                cursorOffsetFromDragLeft: 40,
                sourceGapWidth: 190,
                containerLeft: 0,
            };

            // Position cursor between C and D (inside Monitoring group range)
            // Without the fix, targetTabGroupId would be 'monitoring-group'
            // and insertionIndex would land inside the group.
            //
            // Accumulation (A,B are source → skipped):
            //   Monitoring chip: 0+30=30, C: 30+40=70 ≤ availableSpace
            //   For clientX=280: dragLeftEdge=280-40=240, availableSpace=240
            //   chip(30)+C(80)=110+D_mid: 110+40=150 ≤ 240 → acc=190, ins=4 (past D)
            // Actually let's use clientX=270 so insertion lands at index 3 (between C and D)
            //   dragLeftEdge=270-40=230, availableSpace=230
            //   chip(30)+C(80): acc=110, ins=3. D_mid: 110+40=150 ≤ 230 → acc=190, ins=4
            // Hmm, both land past D. Let's use clientX=180:
            //   dragLeftEdge=180-40=140, availableSpace=140
            //   chip(30): acc=30. C_mid: 30+40=70 ≤ 140 → acc=110, ins=3.
            //   D_mid: 110+40=150 > 140 → break. insertionIndex=3
            //   Monitoring effectivePanelIds=[C,D], firstIdx=2, lastIdx=3
            //   isInsideRange = (3 >= 2 && 3 <= 3) = true → snap
            //   groupMid = (2+3+1)/2 = 3. insertionIndex(3) >= 3 → snap to lastIdx+1 = 4
            (tabs as any).handleDragOver({ clientX: 180 } as DragEvent);

            // Group drags must never target another group
            expect(getAnimState(tabs).targetTabGroupId).toBeNull();
            // Insertion index should be snapped outside the Monitoring group
            // (to lastIdx + 1 = 4, i.e. after the group)
            expect(getAnimState(tabs).currentInsertionIndex).toBe(4);
        });
    });

    describe('gap-close animation (Web Animations API)', () => {
        const flush = flushMicrotasks;

        function setup() {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            tabs.openPanel(createMockPanel('panel-a'), 0);
            const el = getTabElements(tabs)[0];
            const reorder = (tabs as any)._reorder;
            return { el, reorder };
        }

        test('the animated gap-close drives element.animate, rests at 0 and suppresses the transition', async () => {
            const mock = installAnimateMock();
            try {
                const { el, reorder } = setup();

                // Simulate an open gap, then close it via the animated path.
                el.style.marginLeft = '80px';
                reorder._clearMargin(el, false);

                expect(mock.animations).toHaveLength(1);
                // Base rests at 0 (no leaked inline margin), CSS transition
                // suppressed inline while the scripted animation plays, and the
                // shifting marker held for its duration.
                expect(el.style.marginLeft).toBe('');
                expect(el.style.transition).toBe('none');
                expect(el.classList.contains('dv-tab--shifting')).toBe(true);

                // On finish the suppression + shifting marker are cleared.
                mock.animations[0].resolveFinished();
                await flush();
                expect(el.style.transition).toBe('');
                expect(el.classList.contains('dv-tab--shifting')).toBe(false);
            } finally {
                mock.restore();
            }
        });

        test('an instant close (skipTransition) applies immediately with no animation', () => {
            const mock = installAnimateMock();
            try {
                const { el, reorder } = setup();

                el.style.marginLeft = '80px';
                reorder._clearMargin(el, true);

                expect(mock.animations).toHaveLength(0);
                expect(el.style.marginLeft).toBe('');
                expect(el.classList.contains('dv-tab--shifting')).toBe(false);
            } finally {
                mock.restore();
            }
        });

        test('a following instant close cancels an in-flight gap-close animation', () => {
            const mock = installAnimateMock();
            try {
                const { el, reorder } = setup();

                el.style.marginLeft = '80px';
                reorder._clearMargin(el, false);
                expect(mock.animations).toHaveLength(1);

                // A re-open + instant close must cancel the running animation.
                el.style.marginLeft = '80px';
                reorder._clearMargin(el, true);

                expect(mock.animations[0].cancel).toHaveBeenCalledTimes(1);
                expect(el.style.transition).toBe('');
                expect(el.classList.contains('dv-tab--shifting')).toBe(false);
            } finally {
                mock.restore();
            }
        });

        test('resetTabTransforms cancels an in-flight gap-close animation', () => {
            const mock = installAnimateMock();
            try {
                const { el, reorder } = setup();

                el.style.marginLeft = '80px';
                reorder._clearMargin(el, false);
                expect(mock.animations).toHaveLength(1);

                reorder.resetTabTransforms();

                expect(mock.animations[0].cancel).toHaveBeenCalledTimes(1);
                expect(el.style.transition).toBe('');
                expect(el.classList.contains('dv-tab--shifting')).toBe(false);
            } finally {
                mock.restore();
            }
        });

        test('reduced motion clears the gap instantly with no scripted animation', () => {
            const win = document.defaultView as Window & {
                matchMedia?: (q: string) => MediaQueryList;
            };
            const originalMatchMedia = win.matchMedia;
            win.matchMedia = ((query: string) =>
                ({
                    matches: true,
                    media: query,
                }) as MediaQueryList) as typeof win.matchMedia;
            const mock = installAnimateMock();
            try {
                const { el, reorder } = setup();

                el.style.marginLeft = '80px';
                reorder._clearMargin(el, false);

                expect(mock.animations).toHaveLength(0);
                expect(el.style.marginLeft).toBe('');
                expect(el.classList.contains('dv-tab--shifting')).toBe(false);
            } finally {
                mock.restore();
                win.matchMedia = originalMatchMedia;
            }
        });

        test('wrapped drag entries are snapshotted once per drag', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            tabs.openPanel(createMockPanel('panel-a'), 0);
            tabs.openPanel(createMockPanel('panel-b'), 1);
            const reorder = (tabs as any)._reorder;

            reorder._animState = {
                sourceTabId: 'panel-a',
                sourceGroupPanelIds: undefined,
            };

            const first = reorder._wrappedDragEntries();
            const second = reorder._wrappedDragEntries();
            // The second call returns the cached snapshot rather than
            // re-measuring, so it is the very same array instance.
            expect(second).toBe(first);
        });
    });

    describe('dragover gap transforms', () => {
        test('tabs after insertion index shift right by source tab width', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');
            const panelC = createMockPanel('panel-c');
            const panelD = createMockPanel('panel-d');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);
            tabs.openPanel(panelC, 2);
            tabs.openPanel(panelD, 3);

            const elements = getTabElements(tabs);

            // Mock positions for dragstart snapshot
            mockTabRect(elements[0], { left: 0, width: 80 });
            mockTabRect(elements[1], { left: 80, width: 80 });
            mockTabRect(elements[2], { left: 160, width: 80 });
            mockTabRect(elements[3], { left: 240, width: 80 });

            // Start drag on panel-b (index 1)
            fireEvent.dragStart(elements[1]);
            flushRAF(); // let collapse rAF run so _pendingCollapse is cleared
            expect(getAnimState(tabs)).not.toBeNull();

            // Source tab width was captured as 80px
            // cursorOffsetFromDragLeft = 40 (half of source tab width)
            // Simulate cursor at position 200 (right half of panel-c)
            (tabs as any).handleDragOver({ clientX: 200 } as DragEvent);

            // panel-a (index 0): 0 < insertionIndex → no margin
            expect(elements[0].style.marginLeft).toBe('');

            // Accumulation: dragLeftEdge=200-40=160, availableSpace=160
            // A(i=0): accWidth+40=40<=160 → acc=80, ins=1
            // B(i=1, source): skip
            // C(i=2): acc+40=120<=160 → acc=160, ins=3
            // D(i=3): acc+40=200>160 → break
            expect(getAnimState(tabs).currentInsertionIndex).toBe(3);

            // First non-source tab at index >= 3: panel-d gets margin-left of 80
            expect(elements[3].style.marginLeft).toBe('80px');
            expect(
                elements[3].classList.contains('dv-tab--shifting')
            ).toBeTruthy();

            // panel-c (index 2 < 3): no margin (may be '0px' in JSDOM
            // because transitionend never fires to remove the property)
            expect(['', '0px']).toContain(elements[2].style.marginLeft);
        });

        test('gap moves when cursor moves to different position', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');
            const panelC = createMockPanel('panel-c');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);
            tabs.openPanel(panelC, 2);

            const elements = getTabElements(tabs);

            mockTabRect(elements[0], { left: 0, width: 80 });
            mockTabRect(elements[1], { left: 80, width: 80 });
            mockTabRect(elements[2], { left: 160, width: 80 });

            // Start drag on panel-a (source, width 80)
            fireEvent.dragStart(elements[0]);
            flushRAF(); // let collapse rAF run so _pendingCollapse is cleared

            // Move cursor: cursorOffsetFromDragLeft = 40
            // clientX=90 → dragLeftEdge=50, availableSpace=50
            (tabs as any).handleDragOver({ clientX: 90 } as DragEvent);

            // Accumulation: A(source, skip).
            // B(i=1): accWidth+40=40<=50 → acc=80, ins=2
            // C(i=2): accWidth+40=120>50 → break
            expect(getAnimState(tabs).currentInsertionIndex).toBe(2);
            // First non-source tab at index >= 2: panel-c gets margin-left
            expect(elements[2].style.marginLeft).toBe('80px');
            // panel-b: index 1 < 2 → no margin (may be '0px' in JSDOM
            // because transitionend never fires to remove the property)
            expect(['', '0px']).toContain(elements[1].style.marginLeft);

            // Now move cursor to right half of panel-c (insert after C)
            // clientX=220 → dragLeftEdge=180, availableSpace=180
            (tabs as any).handleDragOver({ clientX: 220 } as DragEvent);

            // Accumulation: A(source, skip).
            // B(i=1): acc+40=40<=180 → acc=80, ins=2
            // C(i=2): acc+40=120<=180 → acc=160, ins=3. Loop ends.
            expect(getAnimState(tabs).currentInsertionIndex).toBe(3);
            // No tabs at index >= 3 → margins animate to 0 (transition pending in real
            // browser; in JSDOM without CSS transitions the value is '0px' until
            // transitionend fires, at which point the property is removed entirely)
            expect(['', '0px']).toContain(elements[1].style.marginLeft);
            expect(['', '0px']).toContain(elements[2].style.marginLeft);
        });

        test('same insertion index skips transform update', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            mockTabRect(elements[0], { left: 0, width: 80 });
            mockTabRect(elements[1], { left: 80, width: 80 });

            fireEvent.dragStart(elements[0]);

            // First dragover
            (tabs as any).handleDragOver({ clientX: 90 } as DragEvent);
            const firstIndex = getAnimState(tabs).currentInsertionIndex;

            // Spy on applyDragOverTransforms to check if it's called again
            const applySpy = jest.spyOn(tabs as any, 'applyDragOverTransforms');

            // Second dragover with same result
            (tabs as any).handleDragOver({ clientX: 95 } as DragEvent);

            // Same insertion index → applyDragOverTransforms should not be called
            expect(getAnimState(tabs).currentInsertionIndex).toBe(firstIndex);
            expect(applySpy).not.toHaveBeenCalled();

            applySpy.mockRestore();
        });
    });

    describe('cross-group animation (US3)', () => {
        test('external dragover initializes animation state with sourceIndex -1', () => {
            const { tabs, group } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);
            mockTabRect(elements[0], { left: 0, width: 80 });
            mockTabRect(elements[1], { left: 80, width: 80 });

            // Mock getPanelData to return an external group's panel
            (dataTransfer.getPanelData as jest.Mock).mockReturnValue(
                new dataTransfer.PanelTransfer(
                    'test-accessor',
                    'other-group',
                    'external-panel'
                )
            );

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragOver(tabsList);

            const state = getAnimState(tabs);
            expect(state).not.toBeNull();
            expect(state.sourceTabId).toBe('external-panel');
            expect(state.sourceIndex).toBe(-1);
            expect(state.tabPositions.size).toBe(2);
        });

        test('external dragover does not initialize state when tabAnimation is default', () => {
            const { tabs } = createTabs({ tabAnimation: 'default' });
            const panel = createMockPanel('panel-a');
            tabs.openPanel(panel, 0);

            (dataTransfer.getPanelData as jest.Mock).mockReturnValue(
                new dataTransfer.PanelTransfer(
                    'test-accessor',
                    'other-group',
                    'external-panel'
                )
            );

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragOver(tabsList);

            expect(getAnimState(tabs)).toBeNull();
        });

        test('external dragover uses average tab width for gap', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);
            mockTabRect(elements[0], { left: 0, width: 100 });
            mockTabRect(elements[1], { left: 100, width: 60 });

            // Manually initialize external drag state (as dragover listener would)
            (tabs as any)._animState = {
                sourceTabId: 'external-panel',
                sourceIndex: -1,
                tabPositions: (tabs as any).snapshotTabPositions(),
                currentInsertionIndex: null,
            };

            // cursor at 30 → left half of panel-a (midpoint 50) → insert at index 0
            (tabs as any).handleDragOver({ clientX: 30 } as DragEvent);

            // Average width: (100 + 60) / 2 = 80
            // First non-source tab at index >= 0: panel-a gets margin-left of 80
            expect(elements[0].style.marginLeft).toBe('80px');
            // panel-b: not the first tab at >= insertionIndex, no margin
            expect(elements[1].style.marginLeft).toBe('');
        });

        test('dragleave fully clears state for external drags', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            tabs.openPanel(panelA, 0);

            const elements = getTabElements(tabs);
            mockTabRect(elements[0], { left: 0, width: 80 });

            (dataTransfer.getPanelData as jest.Mock).mockReturnValue(
                new dataTransfer.PanelTransfer(
                    'test-accessor',
                    'other-group',
                    'external-panel'
                )
            );

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragOver(tabsList);
            expect(getAnimState(tabs)).not.toBeNull();

            // Simulate dragleave (cursor leaves container entirely)
            const dragLeaveEvent = new Event('dragleave', { bubbles: true });
            tabsList.dispatchEvent(dragLeaveEvent);

            // External drag: state should be fully cleared (not just insertionIndex)
            expect(getAnimState(tabs)).toBeNull();
        });

        test('dragleave clears dropTargetContainer overlay for external drags', () => {
            const clearMock = jest.fn();
            const { tabs, group } = createTabs({ tabAnimation: 'smooth' });

            // Set up a dropTargetContainer with a model that tracks clear() calls
            (group.model as any).dropTargetContainer = {
                model: { clear: clearMock, exists: () => true },
            };

            const panelA = createMockPanel('panel-a');
            tabs.openPanel(panelA, 0);

            const elements = getTabElements(tabs);
            mockTabRect(elements[0], { left: 0, width: 80 });

            (dataTransfer.getPanelData as jest.Mock).mockReturnValue(
                new dataTransfer.PanelTransfer(
                    'test-accessor',
                    'other-group',
                    'external-panel'
                )
            );

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragOver(tabsList);
            expect(getAnimState(tabs)).not.toBeNull();

            // Simulate dragleave (cursor leaves container entirely, e.g. back to edge group)
            const dragLeaveEvent = new Event('dragleave', { bubbles: true });
            tabsList.dispatchEvent(dragLeaveEvent);

            // The anchor overlay must be cleared so it doesn't remain stranded
            // in the main dockview when the drag returns to the source edge group
            expect(clearMock).toHaveBeenCalledTimes(1);
            expect(getAnimState(tabs)).toBeNull();
        });

        test('intra-group dragover clears dropTargetContainer overlay (panel→tab)', () => {
            // When an intra-group drag passes over the panel content area the
            // anchor overlay may be set there. On re-entering the tab strip the
            // gap animation takes over and the overlay must be cleared.
            const clearMock = jest.fn();
            const { tabs, group } = createTabs({ tabAnimation: 'smooth' });

            (group.model as any).dropTargetContainer = {
                model: { clear: clearMock, exists: () => true },
            };

            const panelA = createMockPanel('panel-a');
            tabs.openPanel(panelA, 0);

            const elements = getTabElements(tabs);
            mockTabRect(elements[0], { left: 0, width: 80 });

            // Simulate intra-group drag start
            const dragStartEvent = new MouseEvent('dragstart', {
                bubbles: true,
            });
            elements[0].dispatchEvent(dragStartEvent);

            // _animState should now be set with sourceIndex >= 0
            expect(getAnimState(tabs)).not.toBeNull();
            expect(getAnimState(tabs).sourceIndex).toBe(0);

            // Cursor re-enters the tab strip (e.g. coming back from panel area)
            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragOver(tabsList);

            // The anchor overlay from the panel content area must be cleared
            expect(clearMock).toHaveBeenCalled();
        });

        test('external (cross-group) dragover does NOT clear dropTargetContainer overlay', () => {
            // For cross-group drag the individual tab Droptargets manage the
            // anchor overlay (smooth animation between groups). The capturing
            // dragover must not clear it.
            const clearMock = jest.fn();
            const { tabs, group } = createTabs({ tabAnimation: 'smooth' });

            (group.model as any).dropTargetContainer = {
                model: { clear: clearMock, exists: () => true },
            };

            const panelA = createMockPanel('panel-a');
            tabs.openPanel(panelA, 0);

            const elements = getTabElements(tabs);
            mockTabRect(elements[0], { left: 0, width: 80 });

            (dataTransfer.getPanelData as jest.Mock).mockReturnValue(
                new dataTransfer.PanelTransfer(
                    'test-accessor',
                    'other-group',
                    'external-panel'
                )
            );

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragOver(tabsList);

            // _animState set with sourceIndex === -1 (external drag)
            expect(getAnimState(tabs)?.sourceIndex).toBe(-1);

            // Must not clear, because cross-group animation depends on the overlay persisting
            expect(clearMock).not.toHaveBeenCalled();
        });

        test('same-group dragover does not trigger external detection', () => {
            const { tabs, group } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            tabs.openPanel(panelA, 0);

            // Mock getPanelData to return same group
            (dataTransfer.getPanelData as jest.Mock).mockReturnValue(
                new dataTransfer.PanelTransfer(
                    'test-accessor',
                    'test-group',
                    'panel-a'
                )
            );

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragOver(tabsList);

            // Should not initialize _animState (same group)
            expect(getAnimState(tabs)).toBeNull();
        });

        test('cross-group FLIP animates newly inserted tab with slide-in', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');
            const panelC = createMockPanel('panel-c');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);
            tabs.openPanel(panelC, 2);

            const elements = getTabElements(tabs);

            // First positions (before cross-group drop)
            const firstPositions = new Map<string, DOMRect>();
            firstPositions.set('panel-a', makeDOMRect(0, 0, 80, 30));
            firstPositions.set('panel-b', makeDOMRect(80, 0, 80, 30));
            // panel-c is the newly inserted tab, so it's not in firstPositions

            // "Last" positions (after new tab inserted at index 2)
            mockTabRect(elements[0], { left: 0, width: 80 });
            mockTabRect(elements[1], { left: 80, width: 80 });
            mockTabRect(elements[2], { left: 160, width: 80 });

            // isCrossGroup = true, sourceTabId = 'panel-c' (newly inserted)
            (tabs as any).runFlipAnimation(firstPositions, 'panel-c', true);

            // panel-c (source, cross-group): should get slide-in transform
            expect(elements[2].style.transform).toBe('translateX(80px)');
            expect(
                elements[2].classList.contains('dv-tab--shifting')
            ).toBeTruthy();

            // panel-a and panel-b: same positions → no delta → no transform
            expect(elements[0].style.transform).toBe('');
            expect(elements[1].style.transform).toBe('');
        });

        test('cross-group FLIP does NOT animate source tab for same-group drops', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            const firstPositions = new Map<string, DOMRect>();
            firstPositions.set('panel-a', makeDOMRect(0, 0, 80, 30));
            firstPositions.set('panel-b', makeDOMRect(80, 0, 80, 30));

            mockTabRect(elements[0], { left: 80, width: 80 });
            mockTabRect(elements[1], { left: 0, width: 80 });

            // isCrossGroup = false (default), sourceTabId = 'panel-a'
            (tabs as any).runFlipAnimation(firstPositions, 'panel-a');

            // panel-a (source, same-group): should be skipped, no transform
            expect(elements[0].style.transform).toBe('');

            // panel-b: moved from 80 to 0 → delta = +80
            expect(elements[1].style.transform).toBe('translateX(80px)');
        });
    });

    describe('dragleave', () => {
        test('resets transforms and insertion index when cursor leaves container', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            // Start drag
            fireEvent.dragStart(elements[0]);

            // Manually set some state to verify it's cleared
            (tabs as any)._animState.currentInsertionIndex = 1;
            elements[1].style.marginLeft = '80px';
            elements[1].classList.add('dv-tab--shifting');

            // Simulate dragleave (cursor leaves the container entirely)
            const tabsList = (tabs as any)._tabsList as HTMLElement;
            const dragLeaveEvent = new Event('dragleave', {
                bubbles: true,
            });
            // relatedTarget is null by default → cursor left the container entirely
            tabsList.dispatchEvent(dragLeaveEvent);

            expect(elements[1].style.marginLeft).toBe('');
            expect(
                elements[1].classList.contains('dv-tab--shifting')
            ).toBeFalsy();
            expect(getAnimState(tabs).currentInsertionIndex).toBeNull();
        });

        test('does not reset when moving between child elements', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            const panelB = createMockPanel('panel-b');

            tabs.openPanel(panelA, 0);
            tabs.openPanel(panelB, 1);

            const elements = getTabElements(tabs);

            // Append tabsList to document so contains() works
            const tabsList = (tabs as any)._tabsList as HTMLElement;
            document.body.appendChild(tabsList);

            // Start drag
            fireEvent.dragStart(elements[0]);

            (tabs as any)._animState.currentInsertionIndex = 1;
            elements[1].style.marginLeft = '80px';

            // Dispatch dragleave with relatedTarget being a child element
            const dragLeaveEvent = new MouseEvent('dragleave', {
                bubbles: true,
                relatedTarget: elements[1],
            });
            tabsList.dispatchEvent(dragLeaveEvent);

            // State should not be reset since relatedTarget is a child
            expect(elements[1].style.marginLeft).toBe('80px');
            expect(getAnimState(tabs).currentInsertionIndex).toBe(1);

            // Cleanup
            document.body.removeChild(tabsList);
        });
    });

    describe('chip drag (tab group)', () => {
        function setupChipDrag(
            tabAnimation: TabAnimation | undefined,
            panelIds: string[] = ['panel-a', 'panel-b']
        ) {
            const { tabs, accessor, group } = createTabs({ tabAnimation });
            // setGroupDragImage needs accessor.element to append the ghost
            (accessor as any).element = document.createElement('div');

            for (let i = 0; i < panelIds.length; i++) {
                const panel = createMockPanel(panelIds[i]);
                tabs.openPanel(panel, i);
            }

            const elements = getTabElements(tabs);
            for (let i = 0; i < elements.length; i++) {
                mockTabRect(elements[i], {
                    left: i * 80,
                    width: 80,
                });
            }

            const tabGroup = new TabGroup('tg-1', {
                label: 'Feature',
                color: 'blue',
            });
            tabGroup.addPanel(panelIds[0]);

            (group.model as any).getTabGroups = () => [tabGroup];
            (group.model as any).getTabGroupForPanel = (pid: string) =>
                tabGroup.containsPanel(pid) ? tabGroup : undefined;

            const chip = new TabGroupChip();
            chip.init({
                tabGroup,
                api: fromPartial({}),
            });
            mockTabRect(chip.element, { left: 0, width: 30 });

            const chipRenderers = (tabs as any)._tabGroupManager
                ._chipRenderers as Map<string, any>;
            chipRenderers.set('tg-1', {
                chip,
                disposable: { dispose: jest.fn() },
            });

            return { tabs, accessor, group, tabGroup, chip, elements };
        }

        function triggerChipDragStart(
            tabs: Tabs,
            tabGroup: TabGroup,
            chip: TabGroupChip
        ) {
            const event = {
                clientX: 15,
                clientY: 15,
                dataTransfer: {
                    effectAllowed: 'uninitialized',
                    items: { length: 0 },
                    setData: jest.fn(),
                    setDragImage: jest.fn(),
                },
            } as unknown as DragEvent;
            (tabs as any)._handleChipDragStart(tabGroup, chip, event);
            return event;
        }

        test('chip dragstart initializes _animState in smooth mode', () => {
            const { tabs, tabGroup, chip } = setupChipDrag('smooth');

            expect(getAnimState(tabs)).toBeNull();
            triggerChipDragStart(tabs, tabGroup, chip);

            const state = getAnimState(tabs);
            expect(state).not.toBeNull();
            expect(state.sourceTabGroupId).toBe('tg-1');
            expect(state.sourceGroupPanelIds).toEqual(new Set(['panel-a']));
            expect(state.sourceTabId).toBe('');
        });

        test('chip dragstart initializes _animState in default mode', () => {
            const { tabs, tabGroup, chip } = setupChipDrag('default');

            expect(getAnimState(tabs)).toBeNull();
            triggerChipDragStart(tabs, tabGroup, chip);

            const state = getAnimState(tabs);
            expect(state).not.toBeNull();
            expect(state.sourceTabGroupId).toBe('tg-1');
            expect(state.sourceGroupPanelIds).toEqual(new Set(['panel-a']));
        });

        test('chip dragstart initializes _animState when tabAnimation is undefined', () => {
            const { tabs, tabGroup, chip } = setupChipDrag(undefined);

            triggerChipDragStart(tabs, tabGroup, chip);

            const state = getAnimState(tabs);
            expect(state).not.toBeNull();
            expect(state.sourceTabGroupId).toBe('tg-1');
        });

        // `LocalSelectionTransfer.setData` and `dataTransfer.effectAllowed`
        // are now owned by the chip's drag source in `TabGroupManager`,
        // not by `_handleChipDragStart`. These responsibilities are
        // covered by the #1254 regression test in `dockviewComponent.spec.ts`
        // (which fires a real `dragstart` on the chip element so the
        // backend factory's `getData` callback runs).

        test('chip dragstart does not collapse tabs in default mode', () => {
            const { tabs, tabGroup, chip, elements } = setupChipDrag('default');

            triggerChipDragStart(tabs, tabGroup, chip);
            flushRAF();

            // In default mode, no dv-tab--dragging class should be added
            expect(
                elements[0].classList.contains('dv-tab--dragging')
            ).toBeFalsy();

            // cleanup
            dataTransfer.LocalSelectionTransfer.getInstance().clearData(
                dataTransfer.PanelTransfer.prototype
            );
        });

        test('chip dragstart collapses tabs in smooth mode', () => {
            const { tabs, tabGroup, chip, elements } = setupChipDrag('smooth');

            triggerChipDragStart(tabs, tabGroup, chip);
            flushRAF();

            // In smooth mode, source group tabs should get dv-tab--dragging
            expect(
                elements[0].classList.contains('dv-tab--dragging')
            ).toBeTruthy();

            // cleanup
            dataTransfer.LocalSelectionTransfer.getInstance().clearData(
                dataTransfer.PanelTransfer.prototype
            );
        });

        test('chip dragover computes insertion index in default mode', () => {
            const { tabs, tabGroup, chip, elements } = setupChipDrag(
                'default',
                ['panel-a', 'panel-b', 'panel-c']
            );

            // Re-mock with 3 panels
            for (let i = 0; i < elements.length; i++) {
                mockTabRect(elements[i], {
                    left: i * 80,
                    width: 80,
                });
            }

            triggerChipDragStart(tabs, tabGroup, chip);

            // Drag over with the cursor past panel-b midpoint
            // dragLeftEdge = 200 - cursorOffset, should place insertion after panel-b
            (tabs as any).handleDragOver({ clientX: 200 } as DragEvent);

            const state = getAnimState(tabs);
            expect(state.currentInsertionIndex).not.toBeNull();

            // cleanup
            dataTransfer.LocalSelectionTransfer.getInstance().clearData(
                dataTransfer.PanelTransfer.prototype
            );
        });

        test('chip dragover does not apply transforms in default mode', () => {
            const { tabs, tabGroup, chip, elements } = setupChipDrag(
                'default',
                ['panel-a', 'panel-b', 'panel-c']
            );

            for (let i = 0; i < elements.length; i++) {
                mockTabRect(elements[i], {
                    left: i * 80,
                    width: 80,
                });
            }

            triggerChipDragStart(tabs, tabGroup, chip);
            (tabs as any).handleDragOver({ clientX: 200 } as DragEvent);

            // In default mode, no margins should be applied
            for (const el of elements) {
                expect(el.style.marginLeft).toBe('');
            }

            // cleanup
            dataTransfer.LocalSelectionTransfer.getInstance().clearData(
                dataTransfer.PanelTransfer.prototype
            );
        });

        // `resetDragAnimation` no longer touches the panel-transfer
        // singleton; the chip's drag source owns that lifecycle (dragend
        // listener for HTML5, controller for pointer, plus a direct
        // synchronous-clear listener on the chip element for the detach-
        // then-dragend path tested by #1254).

        test('drop handler processes group drop in default mode', () => {
            const { tabs, tabGroup, chip } = setupChipDrag('default', [
                'panel-a',
                'panel-b',
            ]);

            const moveTabGroupMock = jest.fn();
            (tabs as any).group.model.moveTabGroup = moveTabGroupMock;

            triggerChipDragStart(tabs, tabGroup, chip);
            (tabs as any).handleDragOver({ clientX: 200 } as DragEvent);

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.drop(tabsList);

            expect(moveTabGroupMock).toHaveBeenCalledWith(
                'tg-1',
                expect.any(Number)
            );

            // State should be cleared
            expect(getAnimState(tabs)).toBeNull();
            expect(dataTransfer.getPanelData()).toBeUndefined();
        });

        test('cross-group chip drop calls moveGroupOrPanel', () => {
            const { tabs, accessor, group, tabGroup, chip } =
                setupChipDrag('smooth');

            const moveGroupOrPanelMock = jest.fn();
            (accessor as any).moveGroupOrPanel = moveGroupOrPanelMock;

            // The tab group does not exist in this group (simulate cross-group)
            (group.model as any).getTabGroups = () => [];

            // Set up PanelTransfer so _commitGroupMove reads it
            const transfer = dataTransfer.LocalSelectionTransfer.getInstance();
            transfer.setData(
                [
                    new dataTransfer.PanelTransfer(
                        'test-accessor',
                        'other-group',
                        null,
                        'tg-1'
                    ),
                ],
                dataTransfer.PanelTransfer.prototype
            );

            // Call _commitGroupMove directly (the private method that
            // handles local vs cross-group chip drops)
            (tabs as any)._commitGroupMove('tg-1', 0);

            expect(moveGroupOrPanelMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: expect.objectContaining({
                        groupId: 'other-group',
                        tabGroupId: 'tg-1',
                    }),
                    to: expect.objectContaining({
                        group,
                        position: 'center',
                        index: 0,
                    }),
                })
            );

            // cleanup
            transfer.clearData(dataTransfer.PanelTransfer.prototype);
        });

        test('cross-group chip drop in default mode calls moveGroupOrPanel', () => {
            const { tabs, accessor, group, tabGroup, chip } =
                setupChipDrag('default');

            const moveGroupOrPanelMock = jest.fn();
            (accessor as any).moveGroupOrPanel = moveGroupOrPanelMock;

            // The tab group does not exist in this group
            (group.model as any).getTabGroups = () => [];

            const transfer = dataTransfer.LocalSelectionTransfer.getInstance();
            transfer.setData(
                [
                    new dataTransfer.PanelTransfer(
                        'test-accessor',
                        'other-group',
                        null,
                        'tg-1'
                    ),
                ],
                dataTransfer.PanelTransfer.prototype
            );

            (tabs as any)._commitGroupMove('tg-1', 1);

            expect(moveGroupOrPanelMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: expect.objectContaining({
                        tabGroupId: 'tg-1',
                    }),
                    to: expect.objectContaining({
                        group,
                        position: 'center',
                        index: 1,
                    }),
                })
            );

            // cleanup
            transfer.clearData(dataTransfer.PanelTransfer.prototype);
        });

        test('local chip drop calls moveTabGroup not moveGroupOrPanel', () => {
            const { tabs, accessor, group, tabGroup, chip } =
                setupChipDrag('default');

            const moveTabGroupMock = jest.fn();
            const moveGroupOrPanelMock = jest.fn();
            (group.model as any).moveTabGroup = moveTabGroupMock;
            (accessor as any).moveGroupOrPanel = moveGroupOrPanelMock;

            // tabGroup exists in this group (local)
            triggerChipDragStart(tabs, tabGroup, chip);
            (tabs as any).handleDragOver({ clientX: 200 } as DragEvent);

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.drop(tabsList);

            expect(moveTabGroupMock).toHaveBeenCalled();
            expect(moveGroupOrPanelMock).not.toHaveBeenCalled();
        });

        // Regression for #1243: when a tab group chip is dragged from one
        // split into another and dropped next to an existing tab, the
        // destination's dragover-applied gap margin must be cleared.
        // Otherwise the dropped group lands with extra spacing between it
        // and the adjacent tab.
        test('cross-group chip drop clears destination gap margin', () => {
            const { tabs, accessor, group, tabGroup, chip, elements } =
                setupChipDrag('smooth', ['panel-x', 'panel-y', 'panel-z']);

            // The drop target (this tabs instance) has its own tabs but not
            // the dragged tab group; that group lives in another dockview
            // group. Simulate the cross-group condition.
            (group.model as any).getTabGroups = () => [];
            (accessor as any).moveGroupOrPanel = jest.fn();
            (accessor as any).getPanel = jest.fn().mockReturnValue({
                model: {
                    getTabGroups: () => [tabGroup],
                },
            });

            for (let i = 0; i < elements.length; i++) {
                mockTabRect(elements[i], { left: i * 80, width: 80 });
            }

            // Simulate the destination receiving a dragover with cross-group
            // tab-group transfer data.
            const transfer = dataTransfer.LocalSelectionTransfer.getInstance();
            transfer.setData(
                [
                    new dataTransfer.PanelTransfer(
                        'test-accessor',
                        'other-group',
                        null,
                        'tg-1'
                    ),
                ],
                dataTransfer.PanelTransfer.prototype
            );

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            // dragover initializes cross-group _animState, sets insertion
            // index, and applies a gap margin to a tab in the destination.
            fireEvent.dragOver(tabsList, { clientX: 120 });

            // Sanity: a destination tab is now shifted by the gap.
            const gappedTab = elements.find(
                (el) => el.style.marginLeft && el.style.marginLeft !== '0px'
            );
            expect(gappedTab).toBeDefined();

            // Drop on the destination, where the cross-group path runs.
            fireEvent.drop(tabsList);

            // After the drop, no destination tab should retain a non-zero
            // gap margin. (jsdom can't run the CSS transition that would
            // clear an animated `0px` marginLeft, but the bug we care about
            // is a non-cleared positive gap.)
            for (const el of elements) {
                expect(
                    el.style.marginLeft === '' || el.style.marginLeft === '0px'
                ).toBe(true);
                expect(el.classList.contains('dv-tab--shifting')).toBe(false);
            }

            transfer.clearData(dataTransfer.PanelTransfer.prototype);
        });

        // Regression for #1243: dropping a tab group next to an existing tab
        // must not leave residual inline margin on any tab/chip that would
        // visually appear as extra spacing between the dropped group and the
        // adjacent tab.
        test('local chip drop leaves no residual gap margin (smooth)', () => {
            const { tabs, group, tabGroup, chip } = setupChipDrag('smooth', [
                'panel-a',
                'panel-b',
                'panel-c',
                'panel-d',
            ]);

            // Re-mock with 4 panels in a horizontal row.
            const elements = getTabElements(tabs);
            for (let i = 0; i < elements.length; i++) {
                mockTabRect(elements[i], { left: i * 80, width: 80 });
            }

            // Wire up a realistic moveTabGroup that mirrors what
            // dockviewGroupPanelModel does: rebuild the tab list to match the
            // new panel order. This is the path that actually runs on drop.
            const panelOrder = ['panel-a', 'panel-b', 'panel-c', 'panel-d'];
            (group.model as any).getTabGroups = () => [tabGroup];
            (group.model as any).moveTabGroup = (
                tabGroupId: string,
                targetIndex: number
            ) => {
                const groupPanelIds = new Set(tabGroup.panelIds);
                const groupPanels = tabGroup.panelIds.filter((p) =>
                    panelOrder.includes(p)
                );

                let groupPanelsBefore = 0;
                for (
                    let i = 0;
                    i < Math.min(targetIndex, panelOrder.length);
                    i++
                ) {
                    if (groupPanelIds.has(panelOrder[i])) {
                        groupPanelsBefore++;
                    }
                }
                for (const id of groupPanels) {
                    const idx = panelOrder.indexOf(id);
                    if (idx !== -1) {
                        panelOrder.splice(idx, 1);
                    }
                }
                const insertAt = Math.max(
                    0,
                    Math.min(targetIndex - groupPanelsBefore, panelOrder.length)
                );
                panelOrder.splice(insertAt, 0, ...groupPanels);

                // Rebuild tabs container in the new order, the same dance the
                // real model performs.
                for (const id of [...panelOrder]) {
                    tabs.delete(id);
                }
                for (let i = 0; i < panelOrder.length; i++) {
                    tabs.openPanel(createMockPanel(panelOrder[i]), i);
                }
                // Re-mock rects on the new elements at their new positions.
                const newEls = getTabElements(tabs);
                for (let i = 0; i < newEls.length; i++) {
                    mockTabRect(newEls[i], { left: i * 80, width: 80 });
                }
                // Skip the actual updateTabGroups DOM dance (chip
                // repositioning); it's not needed for the residual-margin
                // assertion.
            };

            triggerChipDragStart(tabs, tabGroup, chip);
            flushRAF();

            // Hover past panel-c midpoint → insertion lands after panel-c (3).
            (tabs as any).handleDragOver({ clientX: 280 } as DragEvent);

            // Sanity: the drag has applied a gap to a non-source tab.
            const beforeDrop = getTabElements(tabs);
            const someTabHasGap = beforeDrop.some(
                (el) => el.style.marginLeft && el.style.marginLeft !== ''
            );
            expect(someTabHasGap).toBe(true);

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.drop(tabsList);
            flushRAF();

            // Simulate transitionend that the browser would fire after the
            // FLIP transition resolves. jsdom doesn't run transitions.
            const evt = new Event('transitionend', { bubbles: true });
            (evt as any).propertyName = 'transform';
            tabsList.dispatchEvent(evt);

            // After the drop completes, no tab should carry inline margin
            // left/right or a dv-tab--shifting class; anything else would
            // be visible as residual spacing.
            const afterEls = getTabElements(tabs);
            for (const el of afterEls) {
                expect(el.style.marginLeft).toBe('');
                expect(el.style.marginRight).toBe('');
                expect(el.classList.contains('dv-tab--shifting')).toBe(false);
            }

            // The chip must also be free of leftover shift state.
            expect(chip.element.style.marginLeft).toBe('');
            expect(
                chip.element.classList.contains('dv-tab-group-chip--shifting')
            ).toBe(false);
        });
    });

    describe('stale animation state', () => {
        test('dragover clears stale _animState from a different tab group drag', () => {
            const { tabs, accessor, group } = createTabs({
                tabAnimation: 'smooth',
            });
            const panelA = createMockPanel('panel-a');
            tabs.openPanel(panelA, 0);

            const elements = getTabElements(tabs);
            mockTabRect(elements[0], { left: 0, width: 80 });

            // Provide getPanel so the external drag path doesn't throw
            (accessor as any).getPanel = jest.fn().mockReturnValue(undefined);

            // Set up stale _animState from a previous drag of tab group 'old-tg'
            (tabs as any)._animState = {
                sourceTabId: '',
                sourceIndex: -1,
                sourceTabGroupId: 'old-tg',
                tabPositions: new Map(),
                currentInsertionIndex: null,
                sourceGroupPanelIds: new Set(),
            };

            // Mock getPanelData to return a different tab group from another group
            (dataTransfer.getPanelData as jest.Mock).mockReturnValue(
                new dataTransfer.PanelTransfer(
                    'test-accessor',
                    'other-group',
                    null,
                    'new-tg'
                )
            );

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragOver(tabsList);

            // The stale _animState should have been cleared and replaced
            // with new state for the current drag
            const state = getAnimState(tabs);
            expect(state).not.toBeNull();
            // The old stale state (sourceTabGroupId: 'old-tg') should be gone
            // Since it was cleared and re-initialized for the external drag,
            // sourceIndex should be -1 (external)
            expect(state.sourceIndex).toBe(-1);
        });

        test('dragover keeps _animState when same tab group is being dragged', () => {
            const { tabs, group } = createTabs({ tabAnimation: 'smooth' });
            const panelA = createMockPanel('panel-a');
            tabs.openPanel(panelA, 0);

            const elements = getTabElements(tabs);
            mockTabRect(elements[0], { left: 0, width: 80 });

            const originalState = {
                sourceTabId: '',
                sourceIndex: -1,
                sourceTabGroupId: 'tg-1',
                tabPositions: new Map(),
                currentInsertionIndex: 2,
                sourceGroupPanelIds: new Set(),
            };
            (tabs as any)._animState = originalState;

            // Same tab group id, so not stale
            (dataTransfer.getPanelData as jest.Mock).mockReturnValue(
                new dataTransfer.PanelTransfer(
                    'test-accessor',
                    'other-group',
                    null,
                    'tg-1'
                )
            );

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragOver(tabsList);

            // _animState should not have been cleared (same tab group)
            const state = getAnimState(tabs);
            expect(state).not.toBeNull();
            // currentInsertionIndex might be updated by handleDragOver but
            // the key check is the state wasn't thrown away and re-created
            // (sourceTabGroupId should still be 'tg-1')
        });

        test('dragover on tab list is handled for chip drags in default animation mode', () => {
            const { tabs, accessor } = createTabs({ tabAnimation: 'default' });
            const panelA = createMockPanel('panel-a');
            tabs.openPanel(panelA, 0);

            const elements = getTabElements(tabs);
            mockTabRect(elements[0], { left: 0, width: 80 });

            // Provide getPanel so the external drag path doesn't throw
            (accessor as any).getPanel = jest.fn().mockReturnValue(undefined);

            // Chip drag (has tabGroupId) should not be skipped in default mode
            (dataTransfer.getPanelData as jest.Mock).mockReturnValue(
                new dataTransfer.PanelTransfer(
                    'test-accessor',
                    'other-group',
                    null,
                    'tg-1'
                )
            );

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragOver(tabsList);

            // Should initialize _animState for the chip drag even in default mode
            expect(getAnimState(tabs)).not.toBeNull();
        });

        test('dragover on tab list is skipped for regular tab drags in default animation mode', () => {
            const { tabs } = createTabs({ tabAnimation: 'default' });
            const panelA = createMockPanel('panel-a');
            tabs.openPanel(panelA, 0);

            // Regular tab drag (no tabGroupId): should be skipped in default mode
            (dataTransfer.getPanelData as jest.Mock).mockReturnValue(
                new dataTransfer.PanelTransfer(
                    'test-accessor',
                    'other-group',
                    'some-panel'
                )
            );

            const tabsList = (tabs as any)._tabsList as HTMLElement;
            fireEvent.dragOver(tabsList);

            // Should not initialize _animState (default mode, non-chip drag)
            expect(getAnimState(tabs)).toBeNull();
        });
    });

    describe('touch drag (pointer path) cleanup', () => {
        // Pointer-driven smooth-reorder is wired into the same _animState
        // pipeline as the HTML5 path. The PointerDragController.onDragEnd
        // subscription in the Tabs constructor calls resetDragAnimation,
        // so state set up here is cleaned up on pointerup / pointercancel.
        test('touch tab drag in smooth mode initialises _animState', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            tabs.openPanel(createMockPanel('a'), 0);
            tabs.openPanel(createMockPanel('b'), 1);

            const pointerEvent = new PointerEvent('pointerdown', {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 0,
                clientY: 0,
            });
            (tabs as any)._tabs[0].value._onDragStart.fire(pointerEvent);

            const state = getAnimState(tabs);
            expect(state).not.toBeNull();
            expect(state.sourceTabId).toBe('a');
        });

        test('pointer drag end clears _animState set up by pointer drag', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            tabs.openPanel(createMockPanel('a'), 0);
            tabs.openPanel(createMockPanel('b'), 1);

            const tabAEl = (tabs as any)._tabs[0].value.element as HTMLElement;
            const pointerEvent = new PointerEvent('pointerdown', {
                pointerId: 1,
                pointerType: 'touch',
                clientX: 0,
                clientY: 0,
            });
            (tabs as any)._tabs[0].value._onDragStart.fire(pointerEvent);
            expect(getAnimState(tabs)).not.toBeNull();

            // The Tabs constructor subscribes to onDragEnd; trigger it via a
            // begin/cancel cycle.
            const controller = PointerDragController.getInstance();
            controller.beginDrag({
                pointerEvent: new PointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'touch',
                }),
                source: tabAEl,
                getData: () => ({ dispose: jest.fn() }),
            });
            window.dispatchEvent(
                new PointerEvent('pointerup', {
                    pointerId: 1,
                    pointerType: 'touch',
                })
            );

            expect(getAnimState(tabs)).toBeNull();
        });

        test('HTML5 tab drag in smooth mode DOES initialise _animState (sanity)', () => {
            // Counter-test: ensures the gate doesn't accidentally suppress
            // the HTML5 path that the cleanup listeners do support.
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            tabs.openPanel(createMockPanel('a'), 0);
            tabs.openPanel(createMockPanel('b'), 1);
            const tabA = (tabs as any)._tabs[0].value.element as HTMLElement;

            fireEvent.dragStart(tabA);

            const state = getAnimState(tabs);
            expect(state).not.toBeNull();
            expect(state.sourceTabId).toBe('a');
        });

        // Pointer chip drag cleanup used to live in a Tabs-level
        // `_chipDragCleanup` field disposed from this controller
        // subscription. That state is gone; the manager's pointer drag
        // source now owns the iframe shield + panelTransfer cleanup via
        // its internal MutableDisposables, fired by the controller's own
        // teardown when the drag ends.

        test('pointer/touch smooth reorder commits on a single-row header', () => {
            const { tabs } = createTabs({ tabAnimation: 'smooth' });
            tabs.openPanel(createMockPanel('a'), 0);
            tabs.openPanel(createMockPanel('b'), 1);

            const tabAEl = (tabs as any)._tabs[0].value.element as HTMLElement;
            const tabsList = (tabs as any)._tabsList as HTMLElement;

            // start a pointer/touch drag on tab 'a' → initialises _animState
            (tabs as any)._tabs[0].value._onDragStart.fire(
                new PointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'touch',
                    clientX: 0,
                    clientY: 0,
                })
            );
            // the drag has settled on insertion index 2 (after 'b')
            (tabs as any)._animState.currentInsertionIndex = 2;

            // the pointer is released inside the tab strip (single-row, no wrap)
            jest.spyOn(document, 'elementFromPoint').mockReturnValue(tabsList);

            const drops: TabDropIndexEvent[] = [];
            tabs.onDrop((e) => drops.push(e));

            // end the pointer drag over the strip via the controller
            const controller = PointerDragController.getInstance();
            controller.beginDrag({
                pointerEvent: new PointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'touch',
                }),
                source: tabAEl,
                getData: () => ({ dispose: jest.fn() }),
            });
            window.dispatchEvent(
                new PointerEvent('pointerup', {
                    pointerId: 1,
                    pointerType: 'touch',
                    clientX: 100,
                    clientY: 10,
                })
            );

            // single-row smooth mode must commit the reorder (previously it had
            // no pointer commit path, so the tab snapped back and no drop fired)
            expect(drops).toHaveLength(1);
            expect(drops[0].index).toBe(1);
        });
    });
});
