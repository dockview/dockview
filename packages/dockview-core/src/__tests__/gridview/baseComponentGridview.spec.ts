import { Emitter } from '../../events';
import {
    BaseGrid,
    IGridPanelView,
    BaseGridOptions,
    toTarget,
} from '../../gridview/baseComponentGridview';
import { IViewSize } from '../../gridview/gridview';
import { CompositeDisposable } from '../../lifecycle';
import {
    PanelInitParameters,
    PanelUpdateEvent,
    Parameters,
} from '../../panel/types';
import { LayoutPriority, Orientation } from '../../splitview/splitview';

class TestPanel implements IGridPanelView {
    _onDidChange = new Emitter<IViewSize | undefined>();
    readonly onDidChange = this._onDidChange.event;

    isVisible: boolean = true;
    isActive: boolean = true;
    params: Parameters = {};

    constructor(
        public readonly id: string,
        public readonly element: HTMLElement,
        public readonly minimumWidth: number,
        public readonly maximumWidth: number,
        public readonly minimumHeight: number,
        public readonly maximumHeight: number,
        public priority: LayoutPriority,
        public snap: boolean
    ) {}

    init(params: PanelInitParameters): void {
        //
    }

    setActive(isActive: boolean): void {
        //
    }

    toJSON(): object {
        return {};
    }

    layout(width: number, height: number): void {
        //
    }

    update(event: PanelUpdateEvent<Parameters>): void {
        //
    }

    focus(): void {
        //
    }

    fromJSON(json: object): void {
        //
    }

    dispose(): void {
        //
    }
}

class ClassUnderTest extends BaseGrid<TestPanel> {
    readonly gridview = this.gridview;

    constructor(parentElement: HTMLElement, options: BaseGridOptions) {
        super(parentElement, options);
    }

    doRemoveGroup(
        group: TestPanel,
        options?: { skipActive?: boolean; skipDispose?: boolean }
    ): TestPanel {
        return super.doRemoveGroup(group, options);
    }

    doAddGroup(group: TestPanel, location?: number[], size?: number): void {
        this._groups.set(group.id, {
            value: group,
            disposable: {
                dispose: () => {
                    //
                },
            },
        });
        super.doAddGroup(group, location, size);
    }

    public fromJSON(data: any): void {
        //
    }

    public toJSON(): object {
        return {};
    }

    public clear(): void {
        //
    }
}

describe('baseComponentGridview', () => {
    test('that the container is not removed when grid is disposed', () => {
        const root = document.createElement('div');
        const container = document.createElement('div');
        root.appendChild(container);

        const cut = new ClassUnderTest(container, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: true,
        });

        cut.dispose();

        expect(container.parentElement).toBe(root);
    });

    test('that .layout(...) force flag works', () => {
        const cut = new ClassUnderTest(document.createElement('div'), {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: true,
        });

        const spy = jest.spyOn(cut.gridview, 'layout');

        cut.layout(100, 100);
        expect(spy).toHaveBeenCalledTimes(1);

        cut.layout(100, 100, false);
        expect(spy).toHaveBeenCalledTimes(1);

        cut.layout(100, 100, true);
        expect(spy).toHaveBeenCalledTimes(2);

        cut.layout(150, 150, false);
        expect(spy).toHaveBeenCalledTimes(3);

        cut.layout(150, 150, true);
        expect(spy).toHaveBeenCalledTimes(4);
    });

    test('can add group', () => {
        const cut = new ClassUnderTest(document.createElement('div'), {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: true,
        });

        const events: { type: string; panel: TestPanel | undefined }[] = [];

        const disposable = new CompositeDisposable(
            cut.onDidAdd((event) => {
                events.push({ type: 'add', panel: event });
            }),
            cut.onDidRemove((event) => {
                events.push({ type: 'remove', panel: event });
            }),
            cut.onDidActiveChange((event) => {
                events.push({ type: 'active', panel: event });
            })
        );

        const panel1 = new TestPanel(
            'id',
            document.createElement('div'),
            0,
            100,
            0,
            100,
            LayoutPriority.Normal,
            false
        );

        cut.doAddGroup(panel1);

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({ type: 'add', panel: panel1 });

        const panel2 = new TestPanel(
            'id',
            document.createElement('div'),
            0,
            100,
            0,
            100,
            LayoutPriority.Normal,
            false
        );

        cut.doAddGroup(panel2);

        expect(events).toHaveLength(2);
        expect(events[1]).toEqual({ type: 'add', panel: panel2 });

        cut.doRemoveGroup(panel1);
        expect(events).toHaveLength(3);
        expect(events[2]).toEqual({ type: 'remove', panel: panel1 });

        disposable.dispose();
        cut.dispose();
    });

    function createPanel(id: string): TestPanel {
        return new TestPanel(
            id,
            document.createElement('div'),
            0,
            100,
            0,
            100,
            LayoutPriority.Normal,
            false
        );
    }

    function createCut(options?: Partial<BaseGridOptions>): ClassUnderTest {
        return new ClassUnderTest(document.createElement('div'), {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: true,
            ...options,
        });
    }

    describe('toTarget', () => {
        test('maps directions to positions', () => {
            expect(toTarget('left')).toBe('left');
            expect(toTarget('right')).toBe('right');
            expect(toTarget('above')).toBe('top');
            expect(toTarget('below')).toBe('bottom');
            expect(toTarget('within')).toBe('center');
        });
    });

    test('id is a non-empty string and stable', () => {
        const cut = createCut();
        expect(typeof cut.id).toBe('string');
        expect(cut.id.length).toBeGreaterThan(0);
        expect(cut.id).toBe(cut.id);
        cut.dispose();
    });

    test('size and groups reflect added groups', () => {
        const cut = createCut();

        expect(cut.size).toBe(0);
        expect(cut.groups).toEqual([]);

        const panel1 = createPanel('id1');
        const panel2 = createPanel('id2');

        cut.doAddGroup(panel1);
        cut.doAddGroup(panel2, [1]);

        expect(cut.size).toBe(2);
        expect(cut.groups).toEqual([panel1, panel2]);

        cut.dispose();
    });

    test('getPanel returns the group by id or undefined', () => {
        const cut = createCut();

        const panel1 = createPanel('id1');
        cut.doAddGroup(panel1);

        expect(cut.getPanel('id1')).toBe(panel1);
        expect(cut.getPanel('does-not-exist')).toBeUndefined();

        cut.dispose();
    });

    test('dimension getters delegate to the gridview', () => {
        const cut = createCut();

        expect(cut.width).toBe(cut.gridview.width);
        expect(cut.height).toBe(cut.gridview.height);
        expect(cut.minimumHeight).toBe(cut.gridview.minimumHeight);
        expect(cut.maximumHeight).toBe(cut.gridview.maximumHeight);
        expect(cut.minimumWidth).toBe(cut.gridview.minimumWidth);
        expect(cut.maximumWidth).toBe(cut.gridview.maximumWidth);

        cut.dispose();
    });

    test('locked getter/setter delegate to the gridview', () => {
        const cut = createCut();

        expect(cut.locked).toBe(false);

        cut.locked = true;
        expect(cut.locked).toBe(true);
        expect(cut.gridview.locked).toBe(true);

        cut.locked = false;
        expect(cut.locked).toBe(false);
        expect(cut.gridview.locked).toBe(false);

        cut.dispose();
    });

    test('locked option is applied in the constructor', () => {
        const cut = createCut({ locked: true });
        expect(cut.locked).toBe(true);
        expect(cut.gridview.locked).toBe(true);
        cut.dispose();
    });

    test('className option is applied in the constructor', () => {
        const cut = createCut({ className: 'foo bar' });
        expect(cut.element.classList.contains('foo')).toBe(true);
        expect(cut.element.classList.contains('bar')).toBe(true);
        cut.dispose();
    });

    describe('doSetGroupActive', () => {
        test('activates a group, deactivates the previous and fires event', () => {
            const cut = createCut();

            const panel1 = createPanel('id1');
            const panel2 = createPanel('id2');
            cut.doAddGroup(panel1);
            cut.doAddGroup(panel2, [1]);

            const spy1 = jest.spyOn(panel1, 'setActive');
            const spy2 = jest.spyOn(panel2, 'setActive');

            const activeEvents: (TestPanel | undefined)[] = [];
            const disposable = cut.onDidActiveChange((event) => {
                activeEvents.push(event);
            });

            cut.doSetGroupActive(panel1);
            expect(cut.activeGroup).toBe(panel1);
            expect(spy1).toHaveBeenLastCalledWith(true);
            expect(activeEvents).toEqual([panel1]);

            cut.doSetGroupActive(panel2);
            expect(cut.activeGroup).toBe(panel2);
            expect(spy1).toHaveBeenLastCalledWith(false);
            expect(spy2).toHaveBeenLastCalledWith(true);
            expect(activeEvents).toEqual([panel1, panel2]);

            disposable.dispose();
            cut.dispose();
        });

        test('is a no-op when the group is already active', () => {
            const cut = createCut();

            const panel1 = createPanel('id1');
            cut.doAddGroup(panel1);

            cut.doSetGroupActive(panel1);

            const spy = jest.spyOn(panel1, 'setActive');
            let fired = false;
            const disposable = cut.onDidActiveChange(() => {
                fired = true;
            });

            cut.doSetGroupActive(panel1);

            expect(spy).not.toHaveBeenCalled();
            expect(fired).toBe(false);

            disposable.dispose();
            cut.dispose();
        });

        test('can clear the active group with undefined', () => {
            const cut = createCut();

            const panel1 = createPanel('id1');
            cut.doAddGroup(panel1);
            cut.doSetGroupActive(panel1);
            expect(cut.activeGroup).toBe(panel1);

            const spy = jest.spyOn(panel1, 'setActive');
            cut.doSetGroupActive(undefined);

            expect(cut.activeGroup).toBeUndefined();
            expect(spy).toHaveBeenLastCalledWith(false);

            cut.dispose();
        });
    });

    describe('doRemoveGroup', () => {
        test('reassigns active group to the first remaining group', () => {
            const cut = createCut();

            const panel1 = createPanel('id1');
            const panel2 = createPanel('id2');
            cut.doAddGroup(panel1);
            cut.doAddGroup(panel2, [1]);

            cut.doSetGroupActive(panel2);
            expect(cut.activeGroup).toBe(panel2);

            cut.doRemoveGroup(panel2);

            expect(cut.activeGroup).toBe(panel1);

            cut.dispose();
        });

        test('active group becomes undefined when the last group is removed', () => {
            const cut = createCut();

            const panel1 = createPanel('id1');
            cut.doAddGroup(panel1);
            cut.doSetGroupActive(panel1);

            cut.doRemoveGroup(panel1);

            expect(cut.activeGroup).toBeUndefined();

            cut.dispose();
        });

        test('throws for a group that is not part of the grid', () => {
            const cut = createCut();
            const stranger = createPanel('stranger');

            expect(() => cut.doRemoveGroup(stranger)).toThrow(
                'invalid operation'
            );

            cut.dispose();
        });

        test('removeGroup delegates to doRemoveGroup', () => {
            const cut = createCut();

            const panel1 = createPanel('id1');
            cut.doAddGroup(panel1);

            const removeEvents: TestPanel[] = [];
            const disposable = cut.onDidRemove((event) => {
                removeEvents.push(event);
            });

            cut.removeGroup(panel1);

            expect(removeEvents).toEqual([panel1]);
            expect(cut.size).toBe(0);

            disposable.dispose();
            cut.dispose();
        });
    });

    describe('activateNext / activatePrevious', () => {
        test('return early when there is no group to move from', () => {
            const cut = createCut();

            expect(cut.activeGroup).toBeUndefined();
            cut.activateNext();
            cut.activatePrevious();
            expect(cut.activeGroup).toBeUndefined();

            cut.dispose();
        });

        test('move the active group forwards and backwards', () => {
            const cut = createCut();

            const panel1 = createPanel('id1');
            const panel2 = createPanel('id2');
            cut.doAddGroup(panel1);
            cut.doAddGroup(panel2, [1]);

            cut.doSetGroupActive(panel1);

            cut.activateNext();
            expect(cut.activeGroup).toBe(panel2);

            cut.activatePrevious();
            expect(cut.activeGroup).toBe(panel1);

            cut.dispose();
        });

        test('accept an explicit group via options', () => {
            const cut = createCut();

            const panel1 = createPanel('id1');
            const panel2 = createPanel('id2');
            cut.doAddGroup(panel1);
            cut.doAddGroup(panel2, [1]);

            cut.activateNext({ group: panel1 });
            expect(cut.activeGroup).toBe(panel2);

            cut.activatePrevious({ group: panel2 });
            expect(cut.activeGroup).toBe(panel1);

            cut.dispose();
        });
    });

    describe('maximized group', () => {
        test('maximize/exit updates state, activates and fires events', () => {
            const cut = createCut();

            const panel1 = createPanel('id1');
            const panel2 = createPanel('id2');
            cut.doAddGroup(panel1);
            cut.doAddGroup(panel2, [1]);

            const events: boolean[] = [];
            const disposable = cut.onDidMaximizedChange((event) => {
                expect(event.panel).toBe(panel1);
                events.push(event.isMaximized);
            });

            expect(cut.hasMaximizedGroup()).toBe(false);
            expect(cut.isMaximizedGroup(panel1)).toBe(false);

            cut.maximizeGroup(panel1);

            expect(cut.hasMaximizedGroup()).toBe(true);
            expect(cut.isMaximizedGroup(panel1)).toBe(true);
            expect(cut.isMaximizedGroup(panel2)).toBe(false);
            expect(cut.activeGroup).toBe(panel1);
            expect(events).toEqual([true]);

            cut.exitMaximizedGroup();

            expect(cut.hasMaximizedGroup()).toBe(false);
            expect(cut.isMaximizedGroup(panel1)).toBe(false);
            expect(events).toEqual([true, false]);

            disposable.dispose();
            cut.dispose();
        });
    });

    describe('setVisible / isVisible', () => {
        test('toggle visibility of a group', () => {
            const cut = createCut();

            const panel1 = createPanel('id1');
            const panel2 = createPanel('id2');
            cut.doAddGroup(panel1);
            cut.doAddGroup(panel2, [1]);

            expect(cut.isVisible(panel1)).toBe(true);

            cut.setVisible(panel1, false);
            expect(cut.isVisible(panel1)).toBe(false);

            cut.setVisible(panel1, true);
            expect(cut.isVisible(panel1)).toBe(true);

            cut.dispose();
        });

        test('visibility change triggers a relayout via the microtask queue', async () => {
            const cut = createCut();

            const panel1 = createPanel('id1');
            const panel2 = createPanel('id2');
            cut.doAddGroup(panel1);
            cut.doAddGroup(panel2, [1]);

            cut.layout(100, 100, true);

            const spy = jest.spyOn(cut, 'layout');
            cut.gridview.setViewVisible([0], false);

            await new Promise<void>((resolve) => queueMicrotask(resolve));
            await new Promise<void>((resolve) => queueMicrotask(resolve));

            expect(spy).toHaveBeenCalled();

            cut.dispose();
        });
    });

    describe('updateOptions', () => {
        test('updates orientation', () => {
            const cut = createCut();

            cut.updateOptions({ orientation: Orientation.VERTICAL });
            expect(cut.gridview.orientation).toBe(Orientation.VERTICAL);

            cut.dispose();
        });

        test('updates margin', () => {
            const cut = createCut();

            cut.updateOptions({ margin: 12 });
            expect(cut.gridview.margin).toBe(12);

            cut.updateOptions({ margin: undefined });
            expect(cut.gridview.margin).toBe(0);

            cut.dispose();
        });

        test('updates locked', () => {
            const cut = createCut();

            cut.updateOptions({ locked: true });
            expect(cut.locked).toBe(true);

            cut.updateOptions({ locked: undefined });
            expect(cut.locked).toBe(false);

            cut.dispose();
        });

        test('updates className', () => {
            const cut = createCut({ className: 'initial' });
            expect(cut.element.classList.contains('initial')).toBe(true);

            cut.updateOptions({ className: 'updated' });
            expect(cut.element.classList.contains('initial')).toBe(false);
            expect(cut.element.classList.contains('updated')).toBe(true);

            cut.updateOptions({ className: undefined });
            expect(cut.element.classList.contains('updated')).toBe(false);

            cut.dispose();
        });

        test('updates disableResizing when disableAutoResizing is provided', () => {
            const cut = createCut();
            expect(cut.disableResizing).toBe(false);

            // The real option key is `disableAutoResizing`; providing it must
            // update `disableResizing` (regression guard: the guard previously
            // checked a non-existent `disableResizing` key and never fired).
            cut.updateOptions({ disableAutoResizing: true });
            expect(cut.disableResizing).toBe(true);

            cut.updateOptions({ disableAutoResizing: false });
            expect(cut.disableResizing).toBe(false);

            cut.dispose();
        });

        test('leaves disableResizing unchanged when the option is omitted', () => {
            const cut = createCut();
            cut.updateOptions({ disableAutoResizing: true });
            expect(cut.disableResizing).toBe(true);

            // An unrelated update must not reset it.
            cut.updateOptions({ orientation: cut.orientation });
            expect(cut.disableResizing).toBe(true);

            cut.dispose();
        });

        test('toggles proportionalLayout and ignores the unsupported styles option', () => {
            const cut = createCut();

            expect(cut.gridview.proportionalLayout).toBe(true);

            cut.updateOptions({
                proportionalLayout: false,
                styles: undefined,
            });

            expect(cut.gridview.proportionalLayout).toBe(false);

            cut.updateOptions({ proportionalLayout: true });

            expect(cut.gridview.proportionalLayout).toBe(true);

            cut.dispose();
        });
    });

    test('dispose disposes all remaining groups', () => {
        const cut = createCut();

        const panel1 = createPanel('id1');
        const panel2 = createPanel('id2');
        cut.doAddGroup(panel1);
        cut.doAddGroup(panel2, [1]);

        const spy1 = jest.spyOn(panel1, 'dispose');
        const spy2 = jest.spyOn(panel2, 'dispose');

        cut.dispose();

        expect(spy1).toHaveBeenCalled();
        expect(spy2).toHaveBeenCalled();
    });
});
