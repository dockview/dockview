import { Emitter } from '../../events';
import { CompositeDisposable } from '../../lifecycle';
import {
    IView,
    LayoutPriority,
    Orientation,
    Sizing,
    Splitview,
} from '../../splitview/splitview';
import { fireEvent } from '@testing-library/dom';
class Testview implements IView {
    private _element: HTMLElement = document.createElement('div');
    private _size = 0;
    private _orthogonalSize = 0;
    private _priority: LayoutPriority | undefined;

    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange = this._onDidChange.event;

    private readonly _onLayoutCalled = new Emitter<void>();
    readonly onLayoutCalled = this._onLayoutCalled.event;

    private readonly _onRendered = new Emitter<void>();
    readonly onRenderered = this._onRendered.event;

    get minimumSize() {
        return this._minimumSize;
    }

    get maximumSize() {
        return this._maxiumSize;
    }

    get element() {
        this._onRendered.fire();
        return this._element;
    }

    get size() {
        return this._size;
    }

    get orthogonalSize() {
        return this._orthogonalSize;
    }

    get priority() {
        return this._priority;
    }

    constructor(
        private _minimumSize: number,
        private _maxiumSize: number,
        priority?: LayoutPriority
    ) {
        this._priority = priority;
    }

    layout(size: number, orthogonalSize: number) {
        this._size = size;
        this._orthogonalSize = orthogonalSize;
        this._onLayoutCalled.fire();
    }

    fireChangeEvent(value: { size?: number; orthogonalSize?: number }) {
        this._onDidChange.fire(value);
    }

    setVisible(isVisible: boolean) {
        //
    }

    dispose() {
        this._onDidChange.dispose();
    }
}

describe('splitview', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        container.className = 'container';

        jest.clearAllMocks();
    });

    test('vertical splitview', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        expect(splitview.orientation).toBe(Orientation.HORIZONTAL);

        const viewQuery = container.querySelectorAll(
            '.dv-split-view-container dv-horizontal'
        );
        expect(viewQuery).toBeTruthy();

        splitview.dispose();
    });

    test('horiziontal splitview', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.VERTICAL,
        });

        expect(splitview.orientation).toBe(Orientation.VERTICAL);

        const viewQuery = container.querySelectorAll(
            '.dv-split-view-container dv-vertical'
        );
        expect(viewQuery).toBeTruthy();

        splitview.dispose();
    });

    test('Sizing.Split halves the view it splits, not the branch (#1612)', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });
        splitview.layout(600, 100);

        splitview.addView(new Testview(0, 1000), 400);
        splitview.addView(new Testview(0, 1000), 200);

        // Split the first view, inserting after it: the newcomer takes half
        // of that view and the second view keeps its size.
        splitview.addView(new Testview(0, 1000), Sizing.Split(0), 1);

        expect(splitview.getViewSize(0)).toBe(200);
        expect(splitview.getViewSize(1)).toBe(200);
        expect(splitview.getViewSize(2)).toBe(200);

        splitview.dispose();
    });

    test('has views and sashes', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        splitview.addView(new Testview(50, 50));
        splitview.addView(new Testview(50, 50));
        splitview.addView(new Testview(50, 50));

        let viewQuery = container.querySelectorAll(
            '.dv-split-view-container > .dv-view-container > .dv-view'
        );
        expect(viewQuery).toHaveLength(3);

        let sashQuery = container.querySelectorAll(
            '.dv-split-view-container > .dv-sash-container > .dv-sash'
        );
        expect(sashQuery).toHaveLength(2);

        splitview.removeView(2);

        viewQuery = container.querySelectorAll(
            '.dv-split-view-container > .dv-view-container > .dv-view'
        );
        expect(viewQuery).toHaveLength(2);

        sashQuery = container.querySelectorAll(
            '.dv-split-view-container > .dv-sash-container > .dv-sash'
        );
        expect(sashQuery).toHaveLength(1);

        splitview.removeView(0);

        viewQuery = container.querySelectorAll(
            '.dv-split-view-container > .dv-view-container > .dv-view'
        );
        expect(viewQuery).toHaveLength(1);

        sashQuery = container.querySelectorAll(
            '.dv-split-view-container > .dv-sash-container > .dv-sash'
        );
        expect(sashQuery).toHaveLength(0);

        splitview.removeView(0);

        viewQuery = container.querySelectorAll(
            '.dv-split-view-container > .dv-view-container > .dv-view'
        );
        expect(viewQuery).toHaveLength(0);

        sashQuery = container.querySelectorAll(
            '.dv-split-view-container > .dv-sash-container > .dv-sash'
        );
        expect(sashQuery).toHaveLength(0);

        splitview.dispose();
    });

    test('visiblity classnames', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        const view1 = new Testview(50, 50);
        const view2 = new Testview(50, 50);

        splitview.addView(view1);
        splitview.addView(view2);

        let viewQuery = container.querySelectorAll(
            '.dv-split-view-container > .dv-view-container > .dv-view.visible'
        );
        expect(viewQuery).toHaveLength(2);

        splitview.setViewVisible(1, false);

        viewQuery = container.querySelectorAll(
            '.dv-split-view-container > .dv-view-container > .dv-view.visible'
        );
        expect(viewQuery).toHaveLength(1);

        splitview.dispose();
    });

    test('calls lifecycle methods on view', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        splitview.layout(200, 500);

        let rendered = false;
        let layout = false;

        const view = new Testview(50, Number.POSITIVE_INFINITY);
        const layoutDisposable = view.onLayoutCalled(() => {
            layout = true;
        });
        const renderDisposable = view.onRenderered(() => {
            rendered = true;
        });

        splitview.addView(view);

        splitview.layout(100, 100);

        expect(rendered).toBeTruthy();
        expect(layout).toBeTruthy();

        layoutDisposable.dispose();
        renderDisposable.dispose();
        splitview.dispose();
    });

    test('add view at specified index', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        splitview.layout(200, 500);

        const view1 = new Testview(50, 200);
        const view2 = new Testview(50, 200);
        const view3 = new Testview(50, 200);

        splitview.addView(view1);
        splitview.addView(view2, Sizing.Distribute, 0);
        splitview.addView(view3, Sizing.Distribute, 1);

        expect(splitview.getViews()).toEqual([view2, view3, view1]);
    });

    test('streches to viewport', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        splitview.layout(200, 500);

        const view = new Testview(50, Number.POSITIVE_INFINITY);

        splitview.addView(view);
        expect(view.size).toBe(200);

        splitview.layout(100, 500);
        expect(view.size).toBe(100);

        splitview.layout(50, 500);
        expect(view.size).toBe(50);

        splitview.layout(30, 500);
        expect(view.size).toBe(50);

        splitview.layout(100, 500);
        expect(view.size).toBe(100);

        splitview.dispose();
    });

    test('can resize views 1', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        splitview.layout(200, 500);

        const view1 = new Testview(50, 200);
        const view2 = new Testview(50, 200);

        splitview.addView(view1);
        splitview.addView(view2);

        expect(view1.size).toBe(100);
        expect(view2.size).toBe(100);

        view1.fireChangeEvent({ size: 65 });

        expect(view1.size).toBe(65);
        expect(view2.size).toBe(135);

        view2.fireChangeEvent({ size: 75 });

        expect(view1.size).toBe(125);
        expect(view2.size).toBe(75);

        view2.fireChangeEvent({});

        expect(view1.size).toBe(125);
        expect(view2.size).toBe(75);

        splitview.dispose();
    });

    test('can resize views 2', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        splitview.layout(200, 500);

        const view1 = new Testview(50, 200);
        const view2 = new Testview(50, 200);
        const view3 = new Testview(50, 200);

        splitview.addView(view1);
        splitview.addView(view2);
        splitview.addView(view3);

        expect([view1.size, view2.size, view3.size]).toEqual([66, 66, 68]);

        splitview.resizeView(1, 100);
        expect([view1.size, view2.size, view3.size]).toEqual([50, 100, 50]);

        splitview.resizeView(2, 60);
        expect([view1.size, view2.size, view3.size]).toEqual([50, 90, 60]);

        expect([
            splitview.getViewSize(0),
            splitview.getViewSize(1),
            splitview.getViewSize(2),
            splitview.getViewSize(3),
        ]).toEqual([50, 90, 60, -1]);

        splitview.dispose();
    });

    test('move view', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        splitview.layout(200, 500);

        const view1 = new Testview(50, 200);
        const view2 = new Testview(50, 200);
        const view3 = new Testview(50, 200);

        splitview.addView(view1);
        splitview.addView(view2);
        splitview.addView(view3);

        expect([view1.size, view2.size, view3.size]).toEqual([66, 66, 68]);

        splitview.moveView(2, 0);
        expect(splitview.getViews()).toEqual([view3, view1, view2]);
        expect([view1.size, view2.size, view3.size]).toEqual([66, 66, 68]);

        splitview.moveView(0, 2);
        expect(splitview.getViews()).toEqual([view1, view2, view3]);
        expect([view1.size, view2.size, view3.size]).toEqual([66, 66, 68]);

        splitview.dispose();
    });

    test('layout called after views added', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        const view1 = new Testview(50, 200);
        const view2 = new Testview(50, 200);
        const view3 = new Testview(50, 200);

        splitview.addView(view1);
        splitview.addView(view2);
        splitview.addView(view3);

        splitview.layout(200, 500);

        expect([view1.size, view2.size, view3.size]).toEqual([67, 67, 66]);

        splitview.dispose();
    });

    test('proportional layout', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        splitview.layout(200, 500);

        const view1 = new Testview(20, Number.POSITIVE_INFINITY);
        const view2 = new Testview(20, Number.POSITIVE_INFINITY);

        splitview.addView(view1);
        splitview.addView(view2);

        expect([view1.size, view2.size]).toEqual([100, 100]);

        splitview.layout(100, 500);

        expect([view1.size, view2.size]).toEqual([50, 50]);

        splitview.dispose();
    });

    test('disable proportional layout', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
        });

        splitview.layout(200, 500);

        const view1 = new Testview(20, Number.POSITIVE_INFINITY);
        const view2 = new Testview(20, Number.POSITIVE_INFINITY);

        splitview.addView(view1);
        splitview.addView(view2);

        expect([view1.size, view2.size]).toEqual([100, 100]);

        splitview.layout(100, 500);

        expect([view1.size, view2.size]).toEqual([80, 20]);

        splitview.dispose();
    });

    test('setting proportionalLayout to its current value keeps the saved proportions', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });

        splitview.layout(200, 500);

        const view1 = new Testview(20, Number.POSITIVE_INFINITY);
        const view2 = new Testview(20, Number.POSITIVE_INFINITY);

        splitview.addView(view1);
        splitview.addView(view2);
        splitview.resizeView(0, 150);

        const proportions = splitview.proportions;
        expect(proportions).toEqual([0.75, 0.25]);

        // shrinking clamps view2 to its minimum, so the sizes no longer
        // match the saved proportions
        splitview.layout(50, 500);
        expect([view1.size, view2.size]).toEqual([30, 20]);
        expect(splitview.proportions).toEqual(proportions);

        // a no-op assignment must not re-capture proportions from the
        // current (clamped) sizes
        splitview.proportionalLayout = true;
        expect(splitview.proportionalLayout).toBe(true);
        expect(splitview.proportions).toEqual(proportions);

        splitview.layout(200, 500);
        expect([view1.size, view2.size]).toEqual([150, 50]);

        splitview.dispose();
    });

    test('high priority', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
        });

        splitview.layout(300, 500);

        const view1 = new Testview(50, Number.POSITIVE_INFINITY);
        const view2 = new Testview(
            50,
            Number.POSITIVE_INFINITY,
            LayoutPriority.High
        );
        const view3 = new Testview(50, Number.POSITIVE_INFINITY);

        splitview.addView(view1);
        splitview.addView(view2);
        splitview.addView(view3);

        expect([view1.size, view2.size, view3.size]).toEqual([100, 100, 100]);

        splitview.layout(400, 500);

        expect([view1.size, view2.size, view3.size]).toEqual([100, 200, 100]);

        splitview.dispose();
    });

    test('low priority', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
        });

        splitview.layout(300, 500);

        const view1 = new Testview(
            50,
            Number.POSITIVE_INFINITY,
            LayoutPriority.Low
        );
        const view2 = new Testview(50, Number.POSITIVE_INFINITY);
        const view3 = new Testview(50, Number.POSITIVE_INFINITY);

        splitview.addView(view1);
        splitview.addView(view2);
        splitview.addView(view3);

        expect([view1.size, view2.size, view3.size]).toEqual([100, 100, 100]);

        splitview.layout(400, 500);

        expect([view1.size, view2.size, view3.size]).toEqual([100, 100, 200]);

        splitview.dispose();
    });

    test('from descriptor', () => {
        const descriptor = {
            size: 300,
            views: [
                {
                    size: 80,
                    view: new Testview(0, Number.POSITIVE_INFINITY),
                },
                {
                    size: 100,
                    view: new Testview(0, Number.POSITIVE_INFINITY),
                },
                {
                    size: 120,
                    view: new Testview(0, Number.POSITIVE_INFINITY),
                },
            ],
        };

        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
            descriptor,
        });

        expect([
            descriptor.views[0].size,
            descriptor.views[1].size,
            descriptor.views[2].size,
        ]).toEqual([80, 100, 120]);
        expect(splitview.size).toBe(300);
    });

    test('onDidAddView and onDidRemoveView events', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
        });

        const added: IView[] = [];
        const removed: IView[] = [];

        const disposable = new CompositeDisposable(
            splitview.onDidAddView((view) => added.push(view)),
            splitview.onDidRemoveView((view) => removed.push(view))
        );

        const view1 = new Testview(0, 100);
        const view2 = new Testview(0, 100);

        expect(added).toHaveLength(0);
        expect(removed).toHaveLength(0);

        splitview.addView(view1);
        expect(added).toHaveLength(1);
        expect(removed).toHaveLength(0);
        expect(added[0]).toBe(view1);

        splitview.addView(view2);
        expect(added).toHaveLength(2);
        expect(removed).toHaveLength(0);
        expect(added[1]).toBe(view2);

        splitview.removeView(0);
        expect(added).toHaveLength(2);
        expect(removed).toHaveLength(1);
        expect(removed[0]).toBe(view1);

        splitview.removeView(0);
        expect(added).toHaveLength(2);
        expect(removed).toHaveLength(2);
        expect(removed[1]).toBe(view2);

        disposable.dispose();
    });

    test('dispose of splitview', () => {
        expect(container.childNodes).toHaveLength(0);

        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
        });

        const view1 = new Testview(0, 100);
        const view2 = new Testview(0, 100);

        splitview.addView(view1);
        splitview.addView(view2);

        expect(container.childNodes.length).toBeGreaterThan(0);

        let anyEvents = false;
        const listener = splitview.onDidRemoveView((e) => {
            anyEvents = true; // disposing of the splitview shouldn't fire onDidRemoveView events
        });

        splitview.dispose();
        listener.dispose();

        expect(anyEvents).toBeFalsy();
        expect(container.childNodes).toHaveLength(0);
    });

    test('dnd: pointer events to move sash', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
        });
        splitview.layout(400, 500);

        const view1 = new Testview(0, 1000);
        const view2 = new Testview(0, 1000);

        splitview.addView(view1);
        splitview.addView(view2);

        const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
        const removeEventListenerSpy = jest.spyOn(
            document,
            'removeEventListener'
        );

        const sashElement = container
            .getElementsByClassName('dv-sash')
            .item(0) as HTMLElement;

        expect([view1.size, view2.size]).toEqual([200, 200]);
        expect(sashElement).toBeTruthy();
        expect(view1.element.parentElement!.style.pointerEvents).toBe('');
        expect(view2.element.parentElement!.style.pointerEvents).toBe('');

        fireEvent(
            sashElement,
            new MouseEvent('pointerdown', { clientX: 50, clientY: 100 })
        );

        expect(addEventListenerSpy).toHaveBeenCalledTimes(4);

        // during a sash drag the views should have pointer-events disabled
        expect(view1.element.parentElement!.style.pointerEvents).toBe('none');
        expect(view2.element.parentElement!.style.pointerEvents).toBe('none');

        // expect a delta move of 70 - 50 = 20
        fireEvent(
            document,
            new MouseEvent('pointermove', { clientX: 70, clientY: 110 })
        );
        expect([view1.size, view2.size]).toEqual([220, 180]);

        // expect a delta move of 75 - 70 = 5
        fireEvent(
            document,
            new MouseEvent('pointermove', { clientX: 75, clientY: 110 })
        );
        expect([view1.size, view2.size]).toEqual([225, 175]);

        fireEvent(
            document,
            new MouseEvent('pointerup', { clientX: 70, clientY: 110 })
        );

        expect(removeEventListenerSpy).toHaveBeenCalledTimes(4);

        // expect pointer-eventes on views to be restored
        expect(view1.element.parentElement!.style.pointerEvents).toBe('');
        expect(view2.element.parentElement!.style.pointerEvents).toBe('');

        fireEvent(
            document,
            new MouseEvent('pointermove', { clientX: 100, clientY: 100 })
        );
        // expect no additional resizes
        expect([view1.size, view2.size]).toEqual([225, 175]);
        // expect no additional document listeners
        expect(addEventListenerSpy).toHaveBeenCalledTimes(4);
        expect(removeEventListenerSpy).toHaveBeenCalledTimes(4);
    });

    test("dnd: sash drag follows pointer events in the element's own document", () => {
        // A popout window (api.addPopoutGroup) has its own document, and the
        // group's element is moved into it. The sash's pointer events are then
        // dispatched into THAT document — so listeners bound to the global
        // document never fire and the sash cannot be dragged.
        const otherDocument = document.implementation.createHTMLDocument();
        const otherContainer = otherDocument.createElement('div');
        otherDocument.body.appendChild(otherContainer);

        const splitview = new Splitview(otherContainer, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
        });
        splitview.layout(400, 500);

        const view1 = new Testview(0, 1000);
        const view2 = new Testview(0, 1000);

        splitview.addView(view1);
        splitview.addView(view2);

        const sashElement = otherContainer
            .getElementsByClassName('dv-sash')
            .item(0) as HTMLElement;

        expect(sashElement).toBeTruthy();
        expect([view1.size, view2.size]).toEqual([200, 200]);

        fireEvent(
            sashElement,
            new MouseEvent('pointerdown', { clientX: 50, clientY: 100 })
        );

        // expect a delta move of 70 - 50 = 20, driven from the owning document
        fireEvent(
            otherDocument,
            new MouseEvent('pointermove', { clientX: 70, clientY: 110 })
        );
        expect([view1.size, view2.size]).toEqual([220, 180]);

        fireEvent(
            otherDocument,
            new MouseEvent('pointerup', { clientX: 70, clientY: 110 })
        );

        // the drag has ended, so further moves must not resize
        fireEvent(
            otherDocument,
            new MouseEvent('pointermove', { clientX: 100, clientY: 110 })
        );
        expect([view1.size, view2.size]).toEqual([220, 180]);

        splitview.dispose();
    });

    test('should restore iframe pointer events on contextmenu during sash drag', () => {
        const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
        const removeEventListenerSpy = jest.spyOn(
            document,
            'removeEventListener'
        );

        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
        });
        splitview.layout(400, 500);

        const view1 = new Testview(0, 1000);
        const view2 = new Testview(0, 1000);

        splitview.addView(view1, Sizing.Distribute);
        splitview.addView(view2, Sizing.Distribute);

        const sashElement = container
            .getElementsByClassName('dv-sash')
            .item(0) as HTMLElement;

        expect([view1.size, view2.size]).toEqual([200, 200]);
        expect(view1.element.parentElement!.style.pointerEvents).toBe('');
        expect(view2.element.parentElement!.style.pointerEvents).toBe('');

        fireEvent(
            sashElement,
            new MouseEvent('pointerdown', { clientX: 50, clientY: 100 })
        );

        // during a sash drag the views should have pointer-events disabled
        expect(view1.element.parentElement!.style.pointerEvents).toBe('none');
        expect(view2.element.parentElement!.style.pointerEvents).toBe('none');

        // simulate contextmenu event (e.g., right-click during drag)
        fireEvent(
            document,
            new MouseEvent('contextmenu', { clientX: 60, clientY: 105 })
        );

        // expect pointer-events on views to be restored after contextmenu
        expect(view1.element.parentElement!.style.pointerEvents).toBe('');
        expect(view2.element.parentElement!.style.pointerEvents).toBe('');

        addEventListenerSpy.mockRestore();
        removeEventListenerSpy.mockRestore();
    });

    test('setViewVisible', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
        });
        splitview.layout(900, 500);

        const view1 = new Testview(0, 1000);
        const view2 = new Testview(0, 1000);
        const view3 = new Testview(0, 1000);

        splitview.addView(view1);
        splitview.addView(view2);
        splitview.addView(view3);

        expect([view1.size, view2.size, view3.size]).toEqual([300, 300, 300]);

        splitview.setViewVisible(0, false);
        expect([view1.size, view2.size, view3.size]).toEqual([0, 300, 600]);

        splitview.setViewVisible(0, true);
        expect([view1.size, view2.size, view3.size]).toEqual([300, 300, 300]);
    });

    test('setViewVisible with one view having high layout priority', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
        });
        splitview.layout(900, 500);

        const view1 = new Testview(0, 1000);
        const view2 = new Testview(0, 1000, LayoutPriority.High);
        const view3 = new Testview(0, 1000);

        splitview.addView(view1);
        splitview.addView(view2);
        splitview.addView(view3);

        expect([view1.size, view2.size, view3.size]).toEqual([300, 300, 300]);

        splitview.setViewVisible(0, false);
        expect([view1.size, view2.size, view3.size]).toEqual([0, 600, 300]);

        splitview.setViewVisible(0, true);
        expect([view1.size, view2.size, view3.size]).toEqual([300, 300, 300]);
    });

    test('set view size', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
        });
        splitview.layout(900, 500);

        const view1 = new Testview(0, 1000);
        const view2 = new Testview(0, 1000);
        const view3 = new Testview(0, 1000);

        splitview.addView(view1);
        splitview.addView(view2);
        splitview.addView(view3);

        expect([view1.size, view2.size, view3.size]).toEqual([300, 300, 300]);

        view1.fireChangeEvent({ size: 0 });
        expect([view1.size, view2.size, view3.size]).toEqual([0, 300, 600]);

        view1.fireChangeEvent({ size: 300 });
        expect([view1.size, view2.size, view3.size]).toEqual([300, 300, 300]);
    });

    test('set view size with one view having high layout priority', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
        });
        splitview.layout(900, 500);

        const view1 = new Testview(0, 1000);
        const view2 = new Testview(0, 1000, LayoutPriority.High);
        const view3 = new Testview(0, 1000);

        splitview.addView(view1);
        splitview.addView(view2);
        splitview.addView(view3);

        expect([view1.size, view2.size, view3.size]).toEqual([300, 300, 300]);

        view1.fireChangeEvent({ size: 0 });
        expect([view1.size, view2.size, view3.size]).toEqual([0, 600, 300]);

        view1.fireChangeEvent({ size: 300 });
        expect([view1.size, view2.size, view3.size]).toEqual([300, 300, 300]);
    });

    test('that margins are applied to view sizing', () => {
        const splitview = new Splitview(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
            margin: 24,
        });
        splitview.layout(924, 500);

        const view1 = new Testview(0, 1000);
        const view2 = new Testview(0, 1000);
        const view3 = new Testview(0, 1000);
        const view4 = new Testview(0, 1000);

        splitview.addView(view1);
        expect([view1.size]).toEqual([924]);

        splitview.addView(view2);
        expect([view1.size, view2.size]).toEqual([450, 450]); // 450 + 24 + 450  = 924

        splitview.addView(view3);
        expect([view1.size, view2.size, view3.size]).toEqual([292, 292, 292]); // 292 + 24 + 292 + 24 + 292 = 924

        splitview.addView(view4);
        expect([view1.size, view2.size, view3.size, view4.size]).toEqual([
            213, 213, 213, 213,
        ]); // 213 + 24 + 213 + 24 + 213 + 24 + 213 = 924

        let viewQuery = Array.from(
            container
                .querySelectorAll(
                    '.dv-split-view-container > .dv-view-container > .dv-view'
                )
                .entries()
        )
            .map(([i, e]) => e as HTMLElement)
            .map((e) => ({
                left: e.style.left,
                top: e.style.top,
                height: e.style.height,
                width: e.style.width,
            }));

        let sashQuery = Array.from(
            container
                .querySelectorAll(
                    '.dv-split-view-container > .dv-sash-container > .dv-sash'
                )
                .entries()
        )
            .map(([i, e]) => e as HTMLElement)
            .map((e) => ({
                left: e.style.left,
                top: e.style.top,
            }));

        // check HTMLElement positions since these are the ones that really matter

        expect(viewQuery).toEqual([
            { left: '0px', top: '', width: '213px', height: '' },
            // 213 + 24 = 237
            { left: '237px', top: '', width: '213px', height: '' },
            // 237 + 213 + 24 = 474
            { left: '474px', top: '', width: '213px', height: '' },
            // 474 + 213 + 24 = 474
            { left: '711px', top: '', width: '213px', height: '' },
            // 711 + 213 = 924
        ]);

        // 924 / 4 = 231 view size
        // 231 - (24*3/4) = 213 margin adjusted view size
        // 213 - 4/2 + 24/2 = 223
        expect(sashQuery).toEqual([
            // 213 - 4/2 + 24/2 = 223
            { left: '223px', top: '0px' },
            // 213 + 24 + 213 = 450
            // 450 - 4/2 + 24/2 = 460
            { left: '460px', top: '0px' },
            // 213 + 24 + 213 + 24 + 213 = 687
            // 687 - 4/2 + 24/2 = 697
            { left: '697px', top: '0px' },
        ]);

        splitview.setViewVisible(0, false);

        viewQuery = Array.from(
            container
                .querySelectorAll(
                    '.dv-split-view-container > .dv-view-container > .dv-view'
                )
                .entries()
        )
            .map(([i, e]) => e as HTMLElement)
            .map((e) => ({
                left: e.style.left,
                top: e.style.top,
                height: e.style.height,
                width: e.style.width,
            }));

        sashQuery = Array.from(
            container
                .querySelectorAll(
                    '.dv-split-view-container > .dv-sash-container > .dv-sash'
                )
                .entries()
        )
            .map(([i, e]) => e as HTMLElement)
            .map((e) => ({
                left: e.style.left,
                top: e.style.top,
            }));

        expect(viewQuery).toEqual([
            { left: '0px', top: '', width: '0px', height: '' },
            { left: '0px', top: '', width: '215px', height: '' },
            { left: '239px', top: '', width: '215px', height: '' },
            { left: '478px', top: '', width: '446px', height: '' },
        ]);

        expect(sashQuery).toEqual([
            { left: '0px', top: '0px' },
            { left: '225px', top: '0px' },
            { left: '464px', top: '0px' },
        ]);
    });

    describe('corner resize', () => {
        // A view hosting a vertical splitview, nested in a horizontal one -
        // the shape of a grid branch - so the inner sashes end on the outer
        // sash between this view and its sibling.
        class NestedView implements IView {
            readonly element = document.createElement('div');
            readonly inner = new Splitview(this.element, {
                orientation: Orientation.VERTICAL,
            });
            readonly minimumSize = 0;
            readonly maximumSize = Number.POSITIVE_INFINITY;
            private readonly _onDidChange = new Emitter<{
                size?: number;
                orthogonalSize?: number;
            }>();
            readonly onDidChange = this._onDidChange.event;

            layout(size: number, orthogonalSize: number) {
                this.inner.layout(orthogonalSize, size);
            }
            setVisible() {
                //
            }
            dispose() {
                this.inner.dispose();
                this._onDidChange.dispose();
            }
        }

        // jsdom has no layout; give a sash the rect it would have on screen
        const setRect = (
            element: HTMLElement,
            left: number,
            top: number,
            width: number,
            height: number
        ) => {
            jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
                left,
                top,
                width,
                height,
                right: left + width,
                bottom: top + height,
                x: left,
                y: top,
                toJSON: () => ({}),
            } as DOMRect);
        };

        // a 400x300 outer splitview split at x=200, its left view split at
        // y=150; `gap` mimics a margin, pulling the inner sash short of the
        // outer one
        const setup = (gap = 0) => {
            const outer = new Splitview(document.createElement('div'), {
                orientation: Orientation.HORIZONTAL,
                proportionalLayout: true,
            });
            outer.layout(400, 300);

            const nested = new NestedView();
            const sibling = new Testview(0, 1000);
            outer.addView(nested, Sizing.Distribute);
            outer.addView(sibling, Sizing.Distribute);

            const top = new Testview(0, 1000);
            const bottom = new Testview(0, 1000);
            nested.inner.addView(top, Sizing.Distribute);
            nested.inner.addView(bottom, Sizing.Distribute);

            const scope = {};
            outer.cornerResizeScope = () => scope;
            nested.inner.cornerResizeScope = () => scope;
            outer.margin = gap;
            nested.inner.margin = gap;

            const outerSash = (outer as any).element.querySelector(
                ':scope > .dv-sash-container > .dv-sash'
            ) as HTMLElement;
            const innerSash = (nested.inner as any).element.querySelector(
                ':scope > .dv-sash-container > .dv-sash'
            ) as HTMLElement;
            setRect(outerSash, 198, 0, 4, 300);
            setRect(innerSash, 0, 148, 200 - gap / 2, 4);

            return {
                outer,
                nested,
                sibling,
                top,
                bottom,
                outerSash,
                innerSash,
            };
        };

        const hover = (sash: HTMLElement, clientX = 200, clientY = 150) =>
            fireEvent(
                sash,
                new MouseEvent('pointermove', {
                    clientX,
                    clientY,
                    buttons: 0,
                })
            );

        const isCorner = (sash: HTMLElement) =>
            sash.classList.contains('dv-sash-corner');

        test('hovering where an inner sash meets an outer sash marks both', () => {
            const { outerSash, innerSash } = setup();

            hover(innerSash, 197, 150);

            expect(isCorner(innerSash)).toBe(true);
            expect(isCorner(outerSash)).toBe(true);

            fireEvent(innerSash, new MouseEvent('pointerleave'));

            expect(isCorner(innerSash)).toBe(false);
            expect(isCorner(outerSash)).toBe(false);
        });

        test('hovering the outer sash at the junction marks both', () => {
            const { outerSash, innerSash } = setup();

            hover(outerSash, 200, 152);

            expect(isCorner(outerSash)).toBe(true);
            expect(isCorner(innerSash)).toBe(true);
        });

        test('away from the junction it is a plain sash', () => {
            const { outerSash, innerSash } = setup();

            hover(innerSash, 100, 150);
            expect(isCorner(innerSash)).toBe(false);

            hover(outerSash, 200, 50);
            expect(isCorner(outerSash)).toBe(false);
        });

        test('a margin gap between the sashes still forms a corner', () => {
            const { outerSash, innerSash } = setup(10);

            // on the outer sash, where the inner one stops 5px short of it
            hover(outerSash, 200, 150);
            expect(isCorner(outerSash)).toBe(true);
            expect(isCorner(innerSash)).toBe(true);
        });

        test('dragging the corner resizes both splitviews', () => {
            const {
                outer,
                nested,
                sibling,
                top,
                bottom,
                outerSash,
                innerSash,
            } = setup();

            const outerSashEnd = jest.fn();
            const innerSashEnd = jest.fn();
            outer.onDidSashEnd(outerSashEnd);
            nested.inner.onDidSashEnd(innerSashEnd);

            expect([outer.getViewSize(0), sibling.size]).toEqual([200, 200]);
            expect([top.size, bottom.size]).toEqual([150, 150]);

            // grabbed from the inner sash: the outer (proportional) splitview
            // re-lays-out the inner one on every move, which must not undo
            // the inner drag
            fireEvent(
                innerSash,
                new MouseEvent('pointerdown', { clientX: 200, clientY: 150 })
            );
            fireEvent(
                document,
                new MouseEvent('pointermove', { clientX: 230, clientY: 190 })
            );

            expect([outer.getViewSize(0), sibling.size]).toEqual([230, 170]);
            expect([top.size, bottom.size]).toEqual([190, 110]);

            fireEvent(
                document,
                new MouseEvent('pointerup', { clientX: 230, clientY: 190 })
            );

            expect(outerSashEnd).toHaveBeenCalledTimes(1);
            expect(innerSashEnd).toHaveBeenCalledTimes(1);
            expect(isCorner(innerSash)).toBe(false);
            expect(isCorner(outerSash)).toBe(false);

            // the drag has ended
            fireEvent(
                document,
                new MouseEvent('pointermove', { clientX: 300, clientY: 250 })
            );
            expect([outer.getViewSize(0), top.size]).toEqual([230, 190]);
        });

        test('dragging the corner from the outer sash resizes both', () => {
            const { outer, top, outerSash } = setup();

            fireEvent(
                outerSash,
                new MouseEvent('pointerdown', { clientX: 200, clientY: 150 })
            );
            fireEvent(
                document,
                new MouseEvent('pointermove', { clientX: 180, clientY: 130 })
            );
            fireEvent(document, new MouseEvent('pointerup'));

            expect(outer.getViewSize(0)).toBe(180);
            expect(top.size).toBe(130);
        });

        test.each([
            [
                'the scopes differ',
                (ctx: ReturnType<typeof setup>) => {
                    ctx.nested.inner.cornerResizeScope = () => ({});
                },
            ],
            [
                'corner resize is disabled for the scope',
                (ctx: ReturnType<typeof setup>) => {
                    ctx.outer.cornerResizeScope = () => undefined;
                },
            ],
            [
                'the other sash is disabled',
                (ctx: ReturnType<typeof setup>) => {
                    ctx.outerSash.classList.add('dv-disabled');
                },
            ],
        ])('no corner when %s', (_, configure) => {
            const ctx = setup();
            configure(ctx);

            hover(ctx.innerSash);
            expect(isCorner(ctx.innerSash)).toBe(false);

            fireEvent(
                ctx.innerSash,
                new MouseEvent('pointerdown', { clientX: 200, clientY: 150 })
            );
            fireEvent(
                document,
                new MouseEvent('pointermove', { clientX: 230, clientY: 190 })
            );
            fireEvent(document, new MouseEvent('pointerup'));

            // only the inner sash moved
            expect(ctx.outer.getViewSize(0)).toBe(200);
            expect(ctx.top.size).toBe(190);
        });

        test('no corner between orthogonal splitviews that are not nested', () => {
            // side by side rather than nested, with sashes that touch and a
            // shared scope, so only the nesting rule can reject the corner
            const scope = {};
            const create = (orientation: Orientation) => {
                const splitview = new Splitview(document.createElement('div'), {
                    orientation,
                });
                splitview.layout(400, 300);
                splitview.addView(new Testview(0, 1000), Sizing.Distribute);
                splitview.addView(new Testview(0, 1000), Sizing.Distribute);
                splitview.cornerResizeScope = () => scope;
                return (splitview as any).element.querySelector(
                    '.dv-sash'
                ) as HTMLElement;
            };
            const columnSash = create(Orientation.HORIZONTAL);
            const rowSash = create(Orientation.VERTICAL);
            setRect(columnSash, 198, 0, 4, 300);
            setRect(rowSash, 0, 148, 200, 4);

            hover(rowSash);

            expect(isCorner(rowSash)).toBe(false);
        });
    });
});
