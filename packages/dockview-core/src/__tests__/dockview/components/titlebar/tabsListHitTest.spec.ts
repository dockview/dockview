import { fromPartial } from '@total-typescript/shoehorn';
import { Tabs } from '../../../../dockview/components/titlebar/tabs';
import { TabAnimationState } from '../../../../dockview/components/titlebar/tabReorderController';
import { DockviewComponent } from '../../../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../../../dockview/dockviewGroupPanel';
import { IDockviewPanel } from '../../../../dockview/dockviewPanel';
import { IDockviewPanelModel } from '../../../../dockview/dockviewPanelModel';
import { ITabRenderer } from '../../../../dockview/types';
import {
    IRootDropTargetHost,
    RootDropTargetService,
} from '../../../../dockview/rootDropTargetService';
import { DockviewComponentOptions } from '../../../../dockview/options';
import { PointerDragController } from '../../../../dnd/pointer/pointerDragController';
import {
    LocalSelectionTransfer,
    PanelTransfer,
} from '../../../../dnd/dataTransfer';

const ACCESSOR_ID = 'test-accessor';

// Layout root geometry. The edge activation band is deliberately wide (100px)
// so the tab strip along the top of the layout falls inside it, which is the
// configuration the double-action bug needs. See `dndEdges` below.
const ROOT_WIDTH = 400;
const ROOT_HEIGHT = 300;
const EDGE_BAND = 100;

// A point in the tab strip's padding: past the last tab, still inside the
// strip, and within the root's top edge band.
const RELEASE_X = 150;
const RELEASE_Y = 5;

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
    const tab: ITabRenderer = {
        element: document.createElement('div'),
        init: jest.fn(),
        update: jest.fn(),
        dispose: jest.fn(),
    };

    return fromPartial<IDockviewPanel>({
        id,
        view: fromPartial<IDockviewPanelModel>({ tab }),
    });
}

function makePointerEvent(
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    clientX: number,
    clientY: number
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
 * A layout root containing a `Tabs` strip, wired to the same
 * `RootDropTargetService` the component uses, so a release resolves through the
 * real pointer hit-test.
 */
function createFixture(): {
    tabs: Tabs;
    rootService: RootDropTargetService;
    tabsList: HTMLElement;
    dispose: () => void;
} {
    const rootElement = document.createElement('div');
    document.body.appendChild(rootElement);

    Object.defineProperty(rootElement, 'offsetWidth', { value: ROOT_WIDTH });
    Object.defineProperty(rootElement, 'offsetHeight', { value: ROOT_HEIGHT });
    jest.spyOn(rootElement, 'getBoundingClientRect').mockReturnValue(
        makeDOMRect(0, 0, ROOT_WIDTH, ROOT_HEIGHT)
    );

    const rootService = new RootDropTargetService(
        fromPartial<IRootDropTargetHost>({
            id: ACCESSOR_ID,
            element: rootElement,
            options: {
                dndEdges: {
                    activationSize: { type: 'pixels', value: EDGE_BAND },
                    size: { type: 'pixels', value: 20 },
                },
            } as DockviewComponentOptions,
            isGridEmpty: () => false,
            rootDropTargetOverrideTarget: () => undefined,
            dispatchUnhandledDragOver: () => true,
        })
    );

    const accessor = fromPartial<DockviewComponent>({
        id: ACCESSOR_ID,
        options: {
            theme: {
                name: 'test',
                className: 'test',
                tabAnimation: 'smooth',
            },
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
    rootElement.appendChild(tabs.element);

    tabs.openPanel(createMockPanel('panel-a'), 0);
    tabs.openPanel(createMockPanel('panel-b'), 1);

    const tabsList: HTMLElement = (tabs as any)._tabsList;
    jest.spyOn(tabsList, 'getBoundingClientRect').mockReturnValue(
        makeDOMRect(0, 0, ROOT_WIDTH, 30)
    );

    return {
        tabs,
        rootService,
        tabsList,
        dispose: () => {
            tabs.dispose();
            rootService.dispose();
            rootElement.remove();
        },
    };
}

/** Anim state for a smooth-mode intra-group reorder of `panel-a` to the end. */
function reorderAnimState(): TabAnimationState {
    return {
        sourceTabId: 'panel-a',
        sourceIndex: 0,
        tabPositions: new Map([
            ['panel-a', makeDOMRect(0, 0, 80, 30)],
            ['panel-b', makeDOMRect(80, 0, 80, 30)],
        ]),
        chipPositions: new Map(),
        currentInsertionIndex: 2,
        targetTabGroupId: null,
        sourceTabGroupId: null,
        sourceGroupPanelIds: null,
        sourceChipWidth: 0,
        cursorOffsetFromDragLeft: 40,
        sourceGapWidth: 80,
        containerLeft: 0,
    };
}

describe('tabs - strip is a pointer hit-test stop', () => {
    let elementsFromPoint: jest.SpyInstance;
    let elementFromPoint: jest.SpyInstance;

    beforeEach(() => {
        elementsFromPoint = jest.spyOn(document, 'elementsFromPoint');
        elementFromPoint = jest.spyOn(document, 'elementFromPoint');
    });

    afterEach(() => {
        PointerDragController.getInstance().cancel();
        LocalSelectionTransfer.getInstance<PanelTransfer>().clearData(
            PanelTransfer.prototype
        );
        jest.restoreAllMocks();
    });

    function drag(
        fixture: ReturnType<typeof createFixture>,
        source: HTMLElement
    ): void {
        // Release lands on the strip's padding: `elementsFromPoint` reports the
        // tabs list, not a tab, so the ancestor walk would otherwise run up to
        // the layout root.
        elementsFromPoint.mockReturnValue([fixture.tabsList]);
        elementFromPoint.mockReturnValue(fixture.tabsList);

        PointerDragController.getInstance().beginDrag({
            pointerEvent: makePointerEvent('pointerdown', 0, 0),
            source,
            getData: () => ({ dispose: jest.fn() }),
        });

        window.dispatchEvent(
            makePointerEvent('pointermove', RELEASE_X, RELEASE_Y)
        );
    }

    test('an internal drag released on strip padding reorders only', () => {
        const fixture = createFixture();

        const onTabsDrop = jest.fn();
        const onRootDrop = jest.fn();
        fixture.tabs.onDrop(onTabsDrop);
        fixture.rootService.onDrop(onRootDrop);

        LocalSelectionTransfer.getInstance<PanelTransfer>().setData(
            [new PanelTransfer(ACCESSOR_ID, 'test-group', 'panel-a')],
            PanelTransfer.prototype
        );

        drag(fixture, (fixture.tabs as any)._tabs[0].value.element);

        // Pin the reorder state the smooth-mode drag has built up by the time
        // of the release; the release point itself is what is under test.
        (fixture.tabs as any)._animState = reorderAnimState();

        window.dispatchEvent(
            makePointerEvent('pointerup', RELEASE_X, RELEASE_Y)
        );

        expect(onRootDrop).not.toHaveBeenCalled();
        expect(onTabsDrop).toHaveBeenCalledTimes(1);
        expect(onTabsDrop.mock.calls[0][0]).toEqual(
            expect.objectContaining({ index: 1, targetTabGroupId: null })
        );

        fixture.dispose();
    });

    test('an external drag released on strip padding still docks at the edge', () => {
        const fixture = createFixture();

        const onTabsDrop = jest.fn();
        const onRootDrop = jest.fn();
        fixture.tabs.onDrop(onTabsDrop);
        fixture.rootService.onDrop(onRootDrop);

        // No panel data at all: a payload from outside dockview.
        drag(fixture, document.createElement('div'));

        window.dispatchEvent(
            makePointerEvent('pointerup', RELEASE_X, RELEASE_Y)
        );

        expect(onTabsDrop).not.toHaveBeenCalled();
        expect(onRootDrop).toHaveBeenCalledTimes(1);
        expect(onRootDrop.mock.calls[0][0]).toEqual(
            expect.objectContaining({ position: 'top' })
        );

        fixture.dispose();
    });
});
