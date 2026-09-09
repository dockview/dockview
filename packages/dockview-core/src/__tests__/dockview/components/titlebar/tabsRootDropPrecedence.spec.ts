import { fromPartial } from '@total-typescript/shoehorn';
import { fireEvent } from '@testing-library/dom';
import { Tabs } from '../../../../dockview/components/titlebar/tabs';
import { DockviewComponent } from '../../../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../../../dockview/dockviewGroupPanel';
import { IDockviewPanel } from '../../../../dockview/dockviewPanel';
import { IDockviewPanelModel } from '../../../../dockview/dockviewPanelModel';
import { ITabRenderer } from '../../../../dockview/types';
import {
    IRootDropTargetHost,
    RootDropTargetService,
} from '../../../../dockview/rootDropTargetService';
import { PointerDragController } from '../../../../dnd/pointer/pointerDragController';
import { IDropTarget } from '../../../../dnd/droptarget';
import * as dataTransfer from '../../../../dnd/dataTransfer';

// SWC compiles ESM named exports as getter-only, so `jest.spyOn` cannot
// redefine them. Mock the module instead so both `Tabs` and
// `RootDropTargetService` read the same stubbed transfer payload.
jest.mock('../../../../dnd/dataTransfer', () => ({
    ...jest.requireActual('../../../../dnd/dataTransfer'),
    getPanelData: jest.fn(),
}));

const ACCESSOR_ID = 'test-accessor';
const GROUP_ID = 'test-group';

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

function mockBox(
    element: HTMLElement,
    rect: { left: number; top: number; width: number; height: number }
): void {
    jest.spyOn(element, 'offsetWidth', 'get').mockReturnValue(rect.width);
    jest.spyOn(element, 'offsetHeight', 'get').mockReturnValue(rect.height);
    jest.spyOn(element, 'getBoundingClientRect').mockReturnValue(
        makeDOMRect(rect.left, rect.top, rect.width, rect.height)
    );
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
        view: fromPartial<IDockviewPanelModel>({ tab: tabRenderer }),
    });
}

function pointerEvent(
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    clientX = 0,
    clientY = 0
): PointerEvent {
    return new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'touch',
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
    });
}

/**
 * A tab strip inside a layout root that carries the root edge drop target.
 *
 * The release point used throughout - (2, 15) - sits in the strip's left
 * padding (the first tab starts at x=20) *and* inside the root's 10px edge
 * activation band: the overlap where a single release can reach both the
 * reorder and the root's edge dock.
 */
function createScene(): {
    tabs: Tabs;
    rootService: RootDropTargetService;
    tabsList: HTMLElement;
    tabElements: HTMLElement[];
    scrollbar: HTMLElement;
    dispose: () => void;
} {
    const accessor = fromPartial<DockviewComponent>({
        id: ACCESSOR_ID,
        options: {
            theme: { name: 't', className: 't', tabAnimation: 'smooth' },
        },
        onDidOptionsChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    });

    const group = fromPartial<DockviewGroupPanel>({
        id: GROUP_ID,
        locked: false,
        model: fromPartial({
            canDisplayOverlay: jest.fn().mockReturnValue(true),
            dropTargetContainer: undefined,
        }),
    });

    const tabs = new Tabs(group, accessor, { showTabsOverflowControl: false });
    tabs.openPanel(createMockPanel('panel-a'), 0);
    tabs.openPanel(createMockPanel('panel-b'), 1);

    const rootElement = document.createElement('div');
    document.body.appendChild(rootElement);
    rootElement.appendChild(tabs.element);
    mockBox(rootElement, { left: 0, top: 0, width: 500, height: 500 });

    const tabsList = tabs.tabsListElement;
    jest.spyOn(tabsList, 'getBoundingClientRect').mockReturnValue(
        makeDOMRect(0, 0, 300, 30)
    );

    const tabElements: HTMLElement[] = (tabs as any)._tabs.map(
        (t: { value: { element: HTMLElement } }) => t.value.element
    );
    jest.spyOn(tabElements[0], 'getBoundingClientRect').mockReturnValue(
        makeDOMRect(20, 0, 80, 30)
    );
    jest.spyOn(tabElements[1], 'getBoundingClientRect').mockReturnValue(
        makeDOMRect(100, 0, 80, 30)
    );

    const rootService = new RootDropTargetService(
        fromPartial<IRootDropTargetHost>({
            id: ACCESSOR_ID,
            element: rootElement,
            options: fromPartial({ dndEdges: undefined }),
            hasEdgeDragReveal: false,
            isGridEmpty: () => false,
            rootDropTargetOverrideTarget: () => undefined,
            dispatchUnhandledDragOver: () => true,
        })
    );

    // `elementsFromPoint` / `elementFromPoint` are unimplemented in jsdom;
    // resolve every point to the strip padding (the strip is the topmost
    // element, the layout root its ancestor).
    jest.spyOn(document, 'elementsFromPoint').mockReturnValue([
        tabsList,
        rootElement,
    ]);
    jest.spyOn(document, 'elementFromPoint').mockReturnValue(tabsList);

    const scrollbar = tabs.element.querySelector(
        '.dv-scrollbar'
    ) as HTMLElement;

    return {
        tabs,
        rootService,
        tabsList,
        tabElements,
        scrollbar,
        dispose: () => {
            rootService.dispose();
            tabs.dispose();
            rootElement.remove();
        },
    };
}

describe('tabs - pointer drop precedence over the root edge target', () => {
    let rAFCallbacks: FrameRequestCallback[];

    beforeEach(() => {
        (dataTransfer.getPanelData as jest.Mock).mockReset();
        rAFCallbacks = [];
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rAFCallbacks.push(cb);
            return rAFCallbacks.length;
        });
    });

    afterEach(() => {
        PointerDragController.getInstance().cancel();
        jest.restoreAllMocks();
    });

    test('a release on strip padding reorders and does not also dock at the layout edge', () => {
        (dataTransfer.getPanelData as jest.Mock).mockReturnValue({
            viewId: ACCESSOR_ID,
            groupId: GROUP_ID,
            panelId: 'panel-b',
        });

        const scene = createScene();

        const rootDrops: unknown[] = [];
        const tabDrops: { index: number }[] = [];
        scene.rootService.onDrop((e) => rootDrops.push(e));
        scene.tabs.onDrop((e) => tabDrops.push(e));

        // Seed the smooth-reorder state for an intra-group drag of panel-b.
        fireEvent.dragStart(scene.tabElements[1]);

        const controller = PointerDragController.getInstance();
        controller.beginDrag({
            pointerEvent: pointerEvent('pointerdown', 140, 15),
            source: scene.tabElements[1],
            getData: () => ({ dispose: jest.fn() }),
        });

        window.dispatchEvent(pointerEvent('pointermove', 2, 15));
        window.dispatchEvent(pointerEvent('pointerup', 2, 15));

        // Exactly one action for the one release, and it is the reorder.
        expect(rootDrops).toHaveLength(0);
        expect(tabDrops).toHaveLength(1);
        expect(tabDrops[0].index).toBe(0);

        scene.dispose();
    });

    test('a release on the scrollbar thumb is unaffected', () => {
        // The thumb is a sibling of the strip inside `.dv-scrollable`, so
        // `isPointInsideTabsList` already excluded it: the reorder never
        // commits there and the root is the only thing that acts. Pinned so
        // widening the stop to cover the thumb does not silently turn an edge
        // dock into a no-op.
        (dataTransfer.getPanelData as jest.Mock).mockReturnValue({
            viewId: ACCESSOR_ID,
            groupId: GROUP_ID,
            panelId: 'panel-b',
        });

        const scene = createScene();
        const rootDrops: unknown[] = [];
        const tabDrops: unknown[] = [];
        scene.rootService.onDrop((e) => rootDrops.push(e));
        scene.tabs.onDrop((e) => tabDrops.push(e));

        (document.elementsFromPoint as jest.Mock).mockReturnValue([
            scene.scrollbar,
            scene.tabs.element,
            scene.tabsList.parentElement,
        ]);
        (document.elementFromPoint as jest.Mock).mockReturnValue(
            scene.scrollbar
        );

        fireEvent.dragStart(scene.tabElements[1]);

        const controller = PointerDragController.getInstance();
        controller.beginDrag({
            pointerEvent: pointerEvent('pointerdown', 140, 15),
            source: scene.tabElements[1],
            getData: () => ({ dispose: jest.fn() }),
        });
        window.dispatchEvent(pointerEvent('pointermove', 2, 28));
        window.dispatchEvent(pointerEvent('pointerup', 2, 28));

        expect(tabDrops).toHaveLength(0);
        expect(rootDrops).toHaveLength(1);

        scene.dispose();
    });

    test('a payload this view does not own still reaches the root', () => {
        // A paneview header drags on this backend carrying a `PaneTransfer`,
        // so `getPanelData()` is undefined: the strip must not claim it, or
        // `onUnhandledDragOverEvent` docking over the header stops working.
        (dataTransfer.getPanelData as jest.Mock).mockReturnValue(undefined);

        const scene = createScene();
        const rootDrops: { position: string }[] = [];
        scene.rootService.onDrop((e) => rootDrops.push(e as any));

        const controller = PointerDragController.getInstance();
        controller.beginDrag({
            pointerEvent: pointerEvent('pointerdown', 140, 15),
            source: scene.tabElements[1],
            getData: () => ({ dispose: jest.fn() }),
        });
        window.dispatchEvent(pointerEvent('pointermove', 2, 15));
        window.dispatchEvent(pointerEvent('pointerup', 2, 15));

        expect(rootDrops).toHaveLength(1);
        expect(rootDrops[0].position).toBe('left');

        scene.dispose();
    });
});
