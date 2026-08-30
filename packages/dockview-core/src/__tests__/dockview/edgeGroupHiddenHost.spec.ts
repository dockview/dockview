import { DockviewComponent } from '../../dockview/dockviewComponent';

/**
 * Integration coverage for #1495 through the real DockviewComponent + shell
 * wiring (the unit-level guard is exercised directly in dockviewShell.spec.ts).
 *
 * Reproduces the reported scenario at the component seam: a dockview with an
 * edge group whose host shell becomes hidden (as happens when a nested
 * dockview's `onlyWhenVisible` outer panel is deactivated and its content is
 * detached). The shell's own ResizeObserver then fires a 0x0 measurement; the
 * guard must skip it so the edge group keeps its size instead of being clamped
 * to the minimum.
 *
 * jsdom neither fires ResizeObserver nor computes offsetParent, so both are
 * driven explicitly here: the same technique used in resizable.spec.ts.
 */
class TestPanel {
    readonly element = document.createElement('div');
    init(): void {
        /* noop */
    }
    layout(): void {
        /* noop */
    }
    dispose(): void {
        /* noop */
    }
}

describe('edge group size preservation when the host shell is hidden (#1495)', () => {
    let container: HTMLElement;
    let observers: Array<{ el: Element; cb: (entries: any[]) => void }>;
    let rAFCallbacks: FrameRequestCallback[];
    let originalResizeObserver: typeof window.ResizeObserver;

    beforeEach(() => {
        observers = [];
        rAFCallbacks = [];

        originalResizeObserver = window.ResizeObserver;
        (window as any).ResizeObserver = class {
            private readonly _cb: (entries: any[]) => void;
            constructor(cb: (entries: any[]) => void) {
                this._cb = cb;
            }
            observe(el: Element): void {
                observers.push({ el, cb: this._cb });
            }
            unobserve(): void {
                /* noop */
            }
            disconnect(): void {
                /* noop */
            }
        };

        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rAFCallbacks.push(cb);
            return rAFCallbacks.length;
        });

        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        window.ResizeObserver = originalResizeObserver;
        jest.restoreAllMocks();
        container.remove();
    });

    function flushRAF(): void {
        const pending = [...rAFCallbacks];
        rAFCallbacks = [];
        for (const cb of pending) {
            cb(performance.now());
        }
    }

    // Fire a resize only for the observer watching `el` (the shell installs its
    // own observer on the shell element; other observers must not be triggered).
    function fireResizeFor(el: Element, width: number, height: number): void {
        for (const entry of observers) {
            if (entry.el === el) {
                entry.cb([{ contentRect: { width, height }, target: el }]);
            }
        }
        flushRAF();
    }

    function setOffsetParent(el: HTMLElement, value: Element | null): void {
        // jsdom always reports null; drive it so the guard sees the shell as
        // visible (an element) or hidden by an ancestor's display:none (null).
        Object.defineProperty(el, 'offsetParent', {
            configurable: true,
            get: () => value,
        });
    }

    test('keeps its size when the shell is hidden then reshown', () => {
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });

        dockview.layout(1000, 800);
        dockview.addPanel({ id: 'main', component: 'default' });

        // A right edge group, expanded and visible, sized to 300: well above
        // its ~85 expanded minimum, so a clamp would be plainly visible. Adding
        // it into the already-laid-out 1000px shell leaves it at exactly 300.
        dockview.addEdgeGroup('right', { id: 'edge', initialSize: 300 });
        dockview.addPanel({
            id: 'edgePanel',
            component: 'default',
            position: { referenceGroup: 'edge', direction: 'within' },
        });

        // An expanded, visible edge group serializes its live splitview size, so
        // toJSON reflects any clamp the 0x0 layout would cause.
        const sizeBefore = dockview.toJSON().edgeGroups?.right?.size;
        expect(sizeBefore).toBe(300);

        // Prime the shell observer with a real measurement while visible, so its
        // cached width/height are non-zero, otherwise the later 0x0 event is
        // absorbed by the unchanged-size early-return before reaching the guard.
        const shell = dockview.rootElement;
        setOffsetParent(shell, document.body);
        fireResizeFor(shell, 1000, 800);
        expect(dockview.toJSON().edgeGroups?.right?.size).toBe(300);

        // Host deactivates: the shell loses its offsetParent (ancestor hidden)
        // and its ResizeObserver reports 0x0.
        setOffsetParent(shell, null);
        fireResizeFor(shell, 0, 0);

        expect(dockview.toJSON().edgeGroups?.right?.size).toBe(300);

        // Reactivating lays the shell back out at its real size: still 300.
        setOffsetParent(shell, document.body);
        fireResizeFor(shell, 1000, 800);
        expect(dockview.toJSON().edgeGroups?.right?.size).toBe(300);

        dockview.dispose();
    });
});
