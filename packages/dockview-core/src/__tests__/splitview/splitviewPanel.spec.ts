import { fromPartial } from '@total-typescript/shoehorn';
import type { IFrameworkPart } from '../../panel/types';
import { LayoutPriority, Orientation } from '../../splitview/splitview';
import type { PanelViewInitParameters } from '../../splitview/options';
import type { SplitviewComponent } from '../../splitview/splitviewComponent';
import { SplitviewPanel } from '../../splitview/splitviewPanel';

class TestPanel extends SplitviewPanel {
    readonly partUpdate = jest.fn();
    readonly partDispose = jest.fn();

    getComponent(): IFrameworkPart {
        return {
            update: this.partUpdate,
            dispose: this.partDispose,
        };
    }
}

function createInitParameters(
    accessor: SplitviewComponent,
    overrides: Partial<PanelViewInitParameters> = {}
): PanelViewInitParameters {
    return {
        params: {},
        accessor,
        ...overrides,
    };
}

describe('splitviewPanel', () => {
    let accessor: SplitviewComponent;
    let setVisibleSpy: jest.Mock;
    let setActiveSpy: jest.Mock;

    beforeEach(() => {
        setVisibleSpy = jest.fn();
        setActiveSpy = jest.fn();
        accessor = fromPartial<SplitviewComponent>({
            setVisible: setVisibleSpy,
            setActive: setActiveSpy,
        });
    });

    test('init stores priority and default constraints', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(
            createInitParameters(accessor, {
                priority: LayoutPriority.High,
            })
        );

        expect(panel.priority).toBe(LayoutPriority.High);
        expect(panel.minimumSize).toBe(0);
        expect(panel.maximumSize).toBe(Number.POSITIVE_INFINITY);
        expect(panel.snap).toBe(false);

        panel.dispose();
    });

    test('init applies minimumSize, maximumSize and snap', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(
            createInitParameters(accessor, {
                minimumSize: 50,
                maximumSize: 500,
                snap: true,
            })
        );

        expect(panel.minimumSize).toBe(50);
        expect(panel.maximumSize).toBe(500);
        expect(panel.snap).toBe(true);

        panel.dispose();
    });

    test('orientation getter/setter', () => {
        const panel = new TestPanel('id', 'component');
        panel.orientation = Orientation.VERTICAL;
        expect(panel.orientation).toBe(Orientation.VERTICAL);

        panel.orientation = Orientation.HORIZONTAL;
        expect(panel.orientation).toBe(Orientation.HORIZONTAL);

        panel.dispose();
    });

    test('layout maps size/orthogonalSize based on HORIZONTAL orientation', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor));
        panel.orientation = Orientation.HORIZONTAL;

        panel.layout(100, 200);

        // HORIZONTAL => [width, height] = [size, orthogonalSize]
        expect(panel.width).toBe(100);
        expect(panel.height).toBe(200);

        panel.dispose();
    });

    test('layout maps size/orthogonalSize based on VERTICAL orientation', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor));
        panel.orientation = Orientation.VERTICAL;

        panel.layout(100, 200);

        // VERTICAL => [width, height] = [orthogonalSize, size]
        expect(panel.width).toBe(200);
        expect(panel.height).toBe(100);

        panel.dispose();
    });

    test('minimumSize supports a function value', () => {
        const panel = new TestPanel('id', 'component');
        let value = 10;
        panel.init(
            createInitParameters(accessor, {
                minimumSize: (() => value) as unknown as number,
            })
        );

        expect(panel.minimumSize).toBe(10);
        value = 42;
        expect(panel.minimumSize).toBe(42);

        panel.dispose();
    });

    test('maximumSize supports a function value', () => {
        const panel = new TestPanel('id', 'component');
        let value = 1000;
        panel.init(
            createInitParameters(accessor, {
                maximumSize: (() => value) as unknown as number,
            })
        );

        expect(panel.maximumSize).toBe(1000);
        value = 750;
        expect(panel.maximumSize).toBe(750);

        panel.dispose();
    });

    test('reading minimumSize fires a constraints change when the evaluated value changes', () => {
        const panel = new TestPanel('id', 'component');
        let value = 10;
        panel.init(
            createInitParameters(accessor, {
                minimumSize: (() => value) as unknown as number,
            })
        );

        // prime the evaluated size so the first read below is a no-op
        expect(panel.minimumSize).toBe(10);

        const events: unknown[] = [];
        panel.api.onDidConstraintsChange((e) => events.push(e));
        events.length = 0;

        // no change -> no fire
        expect(panel.minimumSize).toBe(10);
        expect(events).toHaveLength(0);

        // change -> fire
        value = 99;
        expect(panel.minimumSize).toBe(99);
        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
            minimumSize: 99,
            maximumSize: Number.POSITIVE_INFINITY,
        });

        panel.dispose();
    });

    test('setConstraints via api updates minimum and maximum size', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor));

        panel.api.setConstraints({ minimumSize: 20, maximumSize: 80 });

        expect(panel.minimumSize).toBe(20);
        expect(panel.maximumSize).toBe(80);

        panel.dispose();
    });

    test('setConstraints updates only the provided dimension', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(
            createInitParameters(accessor, {
                minimumSize: 10,
                maximumSize: 90,
            })
        );

        panel.api.setConstraints({ maximumSize: 200 });
        expect(panel.minimumSize).toBe(10);
        expect(panel.maximumSize).toBe(200);

        panel.api.setConstraints({ minimumSize: 40 });
        expect(panel.minimumSize).toBe(40);
        expect(panel.maximumSize).toBe(200);

        panel.dispose();
    });

    test('setConstraints accepts function-valued constraints', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor));

        panel.api.setConstraints({
            minimumSize: () => 15,
            maximumSize: () => 150,
        });

        expect(panel.minimumSize).toBe(15);
        expect(panel.maximumSize).toBe(150);

        panel.dispose();
    });

    test('setSize via api fires onDidChange with the new size', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor));

        const events: { size?: number; orthogonalSize?: number }[] = [];
        panel.onDidChange((e) => events.push(e));

        panel.api.setSize({ size: 123 });

        expect(events).toEqual([{ size: 123 }]);

        panel.dispose();
    });

    test('api.setVisible delegates to accessor.setVisible', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor));

        // api.setVisible fires onWillVisibilityChange, which the panel wires
        // through to accessor.setVisible
        panel.api.setVisible(false);

        expect(setVisibleSpy).toHaveBeenCalledWith(panel, false);

        panel.dispose();
    });

    test('api.setActive delegates to accessor.setActive', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor));

        // api.setActive fires onActiveChange, which the panel wires through to
        // accessor.setActive
        panel.api.setActive();

        expect(setActiveSpy).toHaveBeenCalledWith(panel);

        panel.dispose();
    });

    test('setVisible fires the api onDidVisibilityChange event', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor));

        const events: boolean[] = [];
        panel.api.onDidVisibilityChange((e) => events.push(e.isVisible));

        panel.setVisible(false);
        panel.setVisible(true);

        expect(events).toEqual([false, true]);
        expect(panel.api.isVisible).toBe(true);

        panel.dispose();
    });

    test('setActive fires the api onDidActiveChange event', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor));

        const events: boolean[] = [];
        panel.api.onDidActiveChange((e) => events.push(e.isActive));

        panel.setActive(true);

        expect(events).toEqual([true]);
        expect(panel.api.isActive).toBe(true);

        panel.dispose();
    });

    test('update forwards merged params to the framework part', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor, { params: { a: 1 } }));

        panel.update({ params: { b: 2 } });

        expect(panel.params).toEqual({ a: 1, b: 2 });
        expect(panel.partUpdate).toHaveBeenLastCalledWith({
            params: { a: 1, b: 2 },
        });

        panel.dispose();
    });

    test('layout forwards params to the framework part in the same shape as update', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor, { params: { a: 1 } }));
        panel.partUpdate.mockClear();

        panel.layout(100, 200);

        // Never the bare params object: parts that spread their argument as
        // component props would otherwise merge `a` over `api`/`params`.
        expect(panel.partUpdate).toHaveBeenCalledTimes(1);
        expect(panel.partUpdate).toHaveBeenLastCalledWith({
            params: { a: 1 },
        });

        panel.dispose();
    });

    test('toJSON omits default (unbounded) constraints', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor));

        expect(panel.toJSON()).toEqual({
            id: 'id',
            component: 'component',
            params: undefined,
            minimumSize: undefined,
            maximumSize: undefined,
        });

        panel.dispose();
    });

    test('toJSON serializes explicit constraints', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(
            createInitParameters(accessor, {
                minimumSize: 30,
                maximumSize: 300,
            })
        );

        expect(panel.toJSON()).toEqual({
            id: 'id',
            component: 'component',
            params: undefined,
            minimumSize: 30,
            maximumSize: 300,
        });

        panel.dispose();
    });

    test('toJSON treats MAX_SAFE_INTEGER maximum as unbounded', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(
            createInitParameters(accessor, {
                maximumSize: Number.MAX_SAFE_INTEGER,
            })
        );

        expect(
            (panel.toJSON() as { maximumSize?: number }).maximumSize
        ).toBeUndefined();

        panel.dispose();
    });

    test('dispose disposes the framework part', () => {
        const panel = new TestPanel('id', 'component');
        panel.init(createInitParameters(accessor));

        panel.dispose();

        expect(panel.partDispose).toHaveBeenCalledTimes(1);
    });
});
