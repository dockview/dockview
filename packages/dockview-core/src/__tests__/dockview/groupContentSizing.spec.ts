import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { GroupPanelPartInitParameters } from '../../dockview/types';
import { PanelUpdateEvent } from '../../panel/types';

class TestContentPart implements IContentRenderer {
    public element = document.createElement('div');

    constructor(public readonly id: string) {
        this.element.className = `content-part-${id}`;
    }

    init(_params: GroupPanelPartInitParameters): void {
        //
    }

    layout(_width: number, _height: number): void {
        //
    }

    update(_event: PanelUpdateEvent): void {
        //
    }

    dispose(): void {
        //
    }
}

/**
 * The group lays panels out with the *content-area* dimensions: the group box
 * minus the header along its axis. That way panels (and
 * `onDidDimensionsChange`) receive the real space they occupy, not the header-
 * inclusive group box.
 *
 * The header extent is measured once and cached (reading `offset*` on every
 * layout forced a synchronous reflow per group per frame); it is re-measured
 * when the header element's size actually changes, which the group observes via
 * a `ResizeObserver`. jsdom performs no layout, so these tests stub the header
 * element's `offsetHeight`/`offsetWidth` and then fire the observer to model the
 * browser detecting the new size: the same path production takes.
 */
describe('group content sizing (header-aware)', () => {
    interface FakeObserver {
        cb: (entries: any[]) => void;
        elements: Element[];
    }
    let observers: FakeObserver[];
    let rAFCallbacks: FrameRequestCallback[];
    let originalResizeObserver: typeof window.ResizeObserver;

    beforeEach(() => {
        observers = [];
        rAFCallbacks = [];

        originalResizeObserver = window.ResizeObserver;
        (window as any).ResizeObserver = class {
            private readonly self: FakeObserver;
            constructor(cb: (entries: any[]) => void) {
                this.self = { cb, elements: [] };
                observers.push(this.self);
            }
            observe(el: Element): void {
                this.self.elements.push(el);
            }
            unobserve(el: Element): void {
                this.self.elements = this.self.elements.filter((e) => e !== el);
            }
            disconnect(): void {
                this.self.elements = [];
            }
        };

        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rAFCallbacks.push(cb);
            return rAFCallbacks.length;
        });
    });

    afterEach(() => {
        window.ResizeObserver = originalResizeObserver;
        jest.restoreAllMocks();
    });

    /**
     * Model the browser detecting a size change on a specific element: fire only
     * the observers watching it (with a real `target`), then flush the rAF that
     * `watchElementResize` defers to.
     */
    function fireResizeFor(target: Element): void {
        for (const observer of observers) {
            if (observer.elements.includes(target)) {
                observer.cb([{ target, contentRect: { width: 0, height: 0 } }]);
            }
        }
        const pending = [...rAFCallbacks];
        rAFCallbacks = [];
        for (const cb of pending) {
            cb(performance.now());
        }
    }

    function createComponent() {
        return new DockviewComponent(document.createElement('div'), {
            createComponent(options) {
                switch (options.name) {
                    case 'component':
                        return new TestContentPart(options.id);
                    default:
                        throw new Error(`unsupported ${options.name}`);
                }
            },
        });
    }

    function stubOffset(
        element: HTMLElement,
        prop: 'offsetWidth' | 'offsetHeight',
        value: number
    ): void {
        Object.defineProperty(element, prop, {
            configurable: true,
            get: () => value,
        });
    }

    function getHeaderElement(group: { element: HTMLElement }): HTMLElement {
        const header = group.element.querySelector<HTMLElement>(
            '.dv-tabs-and-actions-container'
        );
        if (!header) {
            throw new Error('header element not found');
        }
        return header;
    }

    test('horizontal header (top): content height = group height - header height', () => {
        const cut = createComponent();
        const panel = cut.addPanel({ id: 'panel1', component: 'component' });
        const group = panel.group;

        // header measures 35px; the observer propagates that into the cache
        const header = getHeaderElement(group);
        stubOffset(header, 'offsetHeight', 35);
        fireResizeFor(header);

        const dimensions: { width: number; height: number }[] = [];
        const disposable = panel.api.onDidDimensionsChange((event) =>
            dimensions.push({ width: event.width, height: event.height })
        );

        group.layout(200, 100);

        expect(dimensions).toContainEqual({ width: 200, height: 65 });

        disposable.dispose();
        cut.dispose();
    });

    test('vertical header (left): content width = group width - header width', () => {
        const cut = createComponent();
        const panel = cut.addPanel({ id: 'panel1', component: 'component' });
        const group = panel.group;

        group.model.headerPosition = 'left';
        const header = getHeaderElement(group);
        stubOffset(header, 'offsetWidth', 40);
        fireResizeFor(header);

        const dimensions: { width: number; height: number }[] = [];
        const disposable = panel.api.onDidDimensionsChange((event) =>
            dimensions.push({ width: event.width, height: event.height })
        );

        group.layout(200, 100);

        expect(dimensions).toContainEqual({ width: 160, height: 100 });

        disposable.dispose();
        cut.dispose();
    });

    test('no measurable header (hidden / zero offset): content gets the full box', () => {
        const cut = createComponent();
        const panel = cut.addPanel({ id: 'panel1', component: 'component' });
        const group = panel.group;

        // header offset stays 0 (jsdom default ≈ display:none header)
        const dimensions: { width: number; height: number }[] = [];
        const disposable = panel.api.onDidDimensionsChange((event) =>
            dimensions.push({ width: event.width, height: event.height })
        );

        group.layout(200, 100);

        expect(dimensions).toContainEqual({ width: 200, height: 100 });

        disposable.dispose();
        cut.dispose();
    });

    test('subtraction is floored at 0 when the header is taller than the box', () => {
        const cut = createComponent();
        const panel = cut.addPanel({ id: 'panel1', component: 'component' });
        const group = panel.group;

        const header = getHeaderElement(group);
        stubOffset(header, 'offsetHeight', 150);
        fireResizeFor(header);

        const dimensions: { width: number; height: number }[] = [];
        const disposable = panel.api.onDidDimensionsChange((event) =>
            dimensions.push({ width: event.width, height: event.height })
        );

        group.layout(200, 100);

        expect(dimensions).toContainEqual({ width: 200, height: 0 });

        disposable.dispose();
        cut.dispose();
    });

    test('relayout() re-applies current dimensions with the latest header size', () => {
        const cut = createComponent();
        const panel = cut.addPanel({ id: 'panel1', component: 'component' });
        const group = panel.group;

        const header = getHeaderElement(group);
        stubOffset(header, 'offsetHeight', 30);
        fireResizeFor(header);
        group.layout(200, 100);

        const dimensions: { width: number; height: number }[] = [];
        const disposable = panel.api.onDidDimensionsChange((event) =>
            dimensions.push({ width: event.width, height: event.height })
        );

        // header grows (e.g. a second tab row) without the group box changing;
        // `relayout()` is the explicit signal to re-measure and re-propagate
        stubOffset(header, 'offsetHeight', 60);
        group.model.relayout();

        expect(dimensions).toContainEqual({ width: 200, height: 40 });

        disposable.dispose();
        cut.dispose();
    });

    test('header wrapping to a taller strip mid-resize shrinks the content (via observer)', () => {
        const cut = createComponent();
        const panel = cut.addPanel({ id: 'panel1', component: 'component' });
        const group = panel.group;
        const header = getHeaderElement(group);

        // single-row header at a comfortable width
        stubOffset(header, 'offsetHeight', 30);
        fireResizeFor(header);
        group.layout(400, 100);

        const dimensions: { width: number; height: number }[] = [];
        const disposable = panel.api.onDidDimensionsChange((event) =>
            dimensions.push({ width: event.width, height: event.height })
        );

        // the window narrows: tabs wrap to a second row, so the header grows.
        // the browser fires the ResizeObserver on the header element, which the
        // group uses to re-measure and re-lay-out the content: no explicit
        // relayout() call from the resize path itself.
        group.layout(200, 100);
        stubOffset(header, 'offsetHeight', 60);
        fireResizeFor(header);

        expect(dimensions).toContainEqual({ width: 200, height: 40 });

        disposable.dispose();
        cut.dispose();
    });
});
