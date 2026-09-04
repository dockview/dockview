import { fromPartial } from '@total-typescript/shoehorn';
import {
    TabGroupManager,
    TabGroupManagerCallbacks,
    TabGroupManagerContext,
} from '../../../../dockview/components/titlebar/tabGroups';
import { TabGroup } from '../../../../dockview/tabGroup';
import { DockviewComponent } from '../../../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../../../dockview/dockviewGroupPanel';
import { DockviewGroupPanelModel } from '../../../../dockview/dockviewGroupPanelModel';
import { Tab } from '../../../../dockview/components/tab/tab';
import { IDockviewPanel } from '../../../../dockview/dockviewPanel';
import { IValueDisposable } from '../../../../lifecycle';
import {
    DEFAULT_TAB_GROUP_COLORS,
    TabGroupColorPalette,
} from '../../../../dockview/tabGroupAccent';
import { ITabGroupChipRenderer } from '../../../../dockview/framework';
import { DockviewHeaderDirection } from '../../../../dockview/options';
import {
    LocalSelectionTransfer,
    PanelTransfer,
} from '../../../../dnd/dataTransfer';
import { PointerDragController } from '../../../../dnd/pointer/pointerDragController';

function createTab(id: string): IValueDisposable<Tab> {
    const element = document.createElement('div');
    element.className = 'dv-tab';
    const value = fromPartial<Tab>({
        element,
        panel: fromPartial<IDockviewPanel>({ id }),
    });
    return { value, disposable: { dispose: jest.fn() } };
}

interface Harness {
    manager: TabGroupManager;
    ctx: TabGroupManagerContext;
    callbacks: {
        onChipContextMenu: jest.Mock;
        onChipDragStart: jest.Mock;
        onChipDragEnd: jest.Mock;
        onChipDrop: jest.Mock;
    };
    tabsList: HTMLElement;
    tabMap: Map<string, IValueDisposable<Tab>>;
    group: DockviewGroupPanel;
    accessor: DockviewComponent;
    options: Record<string, any>;
    state: { direction: DockviewHeaderDirection };
    tabGroups: TabGroup[];
}

const managersToDispose: TabGroupManager[] = [];

function createManager(
    opts: {
        tabs?: IValueDisposable<Tab>[];
        tabGroups?: TabGroup[];
        options?: Record<string, any>;
        direction?: DockviewHeaderDirection;
        activePanelId?: string;
        createChip?: (tabGroup: any) => ITabGroupChipRenderer;
    } = {}
): Harness {
    const tabs = opts.tabs ?? [];
    const tabsList = document.createElement('div');
    const tabMap = new Map<string, IValueDisposable<Tab>>();
    for (const t of tabs) {
        tabMap.set(t.value.panel.id, t);
        tabsList.appendChild(t.value.element);
    }

    const tabGroups = opts.tabGroups ?? [];
    const options: Record<string, any> = opts.options ?? {};
    if (opts.createChip) {
        options.createTabGroupChipComponent = opts.createChip;
    }
    const state = { direction: opts.direction ?? 'horizontal' };

    const model = fromPartial<DockviewGroupPanelModel>({
        getTabGroups: () => tabGroups,
        canDisplayOverlay: jest.fn().mockReturnValue(false),
        headerPosition: 'top',
    });

    const group = fromPartial<DockviewGroupPanel>({
        id: 'group-1',
        model,
        locked: false,
        activePanel: opts.activePanelId
            ? fromPartial<IDockviewPanel>({ id: opts.activePanelId })
            : undefined,
    });

    const accessor = fromPartial<DockviewComponent>({
        id: 'accessor-1',
        options,
        api: fromPartial<DockviewComponent['api']>({}),
        element: document.createElement('div'),
        tabGroupColorPalette: new TabGroupColorPalette(
            DEFAULT_TAB_GROUP_COLORS,
            true
        ),
    });

    const callbacks = {
        onChipContextMenu: jest.fn(),
        onChipDragStart: jest.fn(),
        onChipDragEnd: jest.fn(),
        onChipDrop: jest.fn(),
    };

    const ctx: TabGroupManagerContext = {
        group,
        accessor,
        tabsList,
        getTabs: () => tabs,
        getTabMap: () => tabMap,
        getDirection: () => state.direction,
    };

    const manager = new TabGroupManager(
        ctx,
        callbacks as unknown as TabGroupManagerCallbacks
    );
    managersToDispose.push(manager);

    return {
        manager,
        ctx,
        callbacks,
        tabsList,
        tabMap,
        group,
        accessor,
        options,
        state,
        tabGroups,
    };
}

function makeGroup(id: string, panelIds: string[], opts?: any): TabGroup {
    const tg = new TabGroup(id, opts);
    for (const pid of panelIds) {
        tg.addPanel(pid);
    }
    return tg;
}

function mockChipRenderer(): ITabGroupChipRenderer & {
    init: jest.Mock;
    update: jest.Mock;
    dispose: jest.Mock;
} {
    const element = document.createElement('div');
    element.className = 'dv-tab-group-chip';
    return {
        element,
        init: jest.fn(),
        update: jest.fn(),
        dispose: jest.fn(),
    };
}

describe('TabGroupManager', () => {
    afterEach(() => {
        while (managersToDispose.length > 0) {
            managersToDispose.pop()?.disposeAll();
        }
    });

    describe('chip creation & group membership', () => {
        test('update creates a chip per tab group and positions it before the first tab', () => {
            const tabs = [createTab('p1'), createTab('p2'), createTab('p3')];
            const tg = makeGroup('g1', ['p1', 'p2'], { color: 'blue' });
            const { manager, tabsList } = createManager({
                tabs,
                tabGroups: [tg],
            });

            manager.update();

            expect(manager.chipRenderers.has('g1')).toBe(true);
            const chipEl = manager.chipRenderers.get('g1')!.chip.element;
            // chip inserted immediately before p1's tab element
            expect(chipEl.nextSibling).toBe(tabs[0].value.element);
            expect(tabsList.firstChild).toBe(chipEl);
        });

        test('update applies membership CSS classes (grouped/first/last) and accent', () => {
            const tabs = [createTab('p1'), createTab('p2'), createTab('p3')];
            const tg = makeGroup('g1', ['p1', 'p2'], { color: 'blue' });
            const { manager } = createManager({ tabs, tabGroups: [tg] });

            manager.update();

            expect(
                tabs[0].value.element.classList.contains('dv-tab--grouped')
            ).toBe(true);
            expect(
                tabs[0].value.element.classList.contains('dv-tab--group-first')
            ).toBe(true);
            expect(
                tabs[0].value.element.classList.contains('dv-tab--group-last')
            ).toBe(false);

            expect(
                tabs[1].value.element.classList.contains('dv-tab--group-last')
            ).toBe(true);
            expect(
                tabs[1].value.element.classList.contains('dv-tab--group-first')
            ).toBe(false);

            // ungrouped tab
            expect(
                tabs[2].value.element.classList.contains('dv-tab--grouped')
            ).toBe(false);

            // accent custom property resolved from palette
            expect(
                tabs[0].value.element.style.getPropertyValue(
                    '--dv-tab-group-color'
                )
            ).toBe('var(--dv-tab-group-color-blue)');
            // ungrouped tab has no accent property
            expect(
                tabs[2].value.element.style.getPropertyValue(
                    '--dv-tab-group-color'
                )
            ).toBe('');
        });

        test('membership classes are cleared when a tab leaves its group', () => {
            const tabs = [createTab('p1'), createTab('p2')];
            const tg = makeGroup('g1', ['p1', 'p2'], { color: 'red' });
            const { manager } = createManager({ tabs, tabGroups: [tg] });

            manager.update();
            expect(
                tabs[1].value.element.classList.contains('dv-tab--grouped')
            ).toBe(true);

            tg.removePanel('p2');
            manager.update();

            expect(
                tabs[1].value.element.classList.contains('dv-tab--grouped')
            ).toBe(false);
            expect(
                tabs[1].value.element.style.getPropertyValue(
                    '--dv-tab-group-color'
                )
            ).toBe('');
        });

        test('a dissolved group has its chip removed and disposed', () => {
            const tabs = [createTab('p1'), createTab('p2')];
            const tg = makeGroup('g1', ['p1', 'p2']);
            const harness = createManager({ tabs, tabGroups: [tg] });

            harness.manager.update();
            const chipEl =
                harness.manager.chipRenderers.get('g1')!.chip.element;
            expect(harness.tabsList.contains(chipEl)).toBe(true);

            // dissolve the group
            harness.tabGroups.length = 0;
            harness.manager.update();

            expect(harness.manager.chipRenderers.has('g1')).toBe(false);
            expect(harness.tabsList.contains(chipEl)).toBe(false);
        });

        test('chip is removed from the DOM when the group has no panels', () => {
            const tg = makeGroup('g1', []);
            const { manager, tabsList } = createManager({
                tabs: [],
                tabGroups: [tg],
            });

            manager.update();

            expect(manager.chipRenderers.has('g1')).toBe(true);
            const chipEl = manager.chipRenderers.get('g1')!.chip.element;
            expect(tabsList.contains(chipEl)).toBe(false);
        });

        test('chip is removed when the first panel has no rendered tab', () => {
            const tg = makeGroup('g1', ['ghost']);
            const { manager, tabsList } = createManager({
                tabs: [],
                tabGroups: [tg],
            });

            manager.update();

            const chipEl = manager.chipRenderers.get('g1')!.chip.element;
            expect(tabsList.contains(chipEl)).toBe(false);
        });
    });

    describe('custom chip renderer', () => {
        test('uses createTabGroupChipComponent and calls init', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const chip = mockChipRenderer();
            const createChip = jest.fn().mockReturnValue(chip);

            const { manager } = createManager({
                tabs,
                tabGroups: [tg],
                createChip,
            });

            manager.update();

            expect(createChip).toHaveBeenCalledWith(tg);
            expect(chip.init).toHaveBeenCalledTimes(1);
            expect(manager.chipRenderers.get('g1')!.chip).toBe(chip);
        });

        test('refreshAccents calls chip.update for each group', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const chip = mockChipRenderer();

            const { manager } = createManager({
                tabs,
                tabGroups: [tg],
                createChip: () => chip,
            });

            manager.update();
            chip.update.mockClear();

            manager.refreshAccents();

            expect(chip.update).toHaveBeenCalledWith({ tabGroup: tg });
        });

        test('a tab group onDidChange refreshes the chip', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const chip = mockChipRenderer();

            const { manager } = createManager({
                tabs,
                tabGroups: [tg],
                createChip: () => chip,
            });

            manager.update();
            chip.update.mockClear();

            tg.setLabel('renamed');

            expect(chip.update).toHaveBeenCalledWith({ tabGroup: tg });
        });

        test('a custom chip forwards contextmenu events to the callback', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const chip = mockChipRenderer();

            const { manager, callbacks } = createManager({
                tabs,
                tabGroups: [tg],
                createChip: () => chip,
            });

            manager.update();

            const event = new MouseEvent('contextmenu');
            chip.element.dispatchEvent(event);

            expect(callbacks.onChipContextMenu).toHaveBeenCalledWith(tg, event);
        });
    });

    describe('built-in chip interactions', () => {
        test('right-clicking the built-in chip forwards to onChipContextMenu', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const { manager, callbacks } = createManager({
                tabs,
                tabGroups: [tg],
            });

            manager.update();
            const chipEl = manager.chipRenderers.get('g1')!.chip.element;

            const event = new MouseEvent('contextmenu');
            chipEl.dispatchEvent(event);

            expect(callbacks.onChipContextMenu).toHaveBeenCalledTimes(1);
            expect(callbacks.onChipContextMenu.mock.calls[0][0]).toBe(tg);
        });
    });

    describe('collapse / expand', () => {
        test('a group born collapsed applies the collapsed class instantly', () => {
            const tabs = [createTab('p1'), createTab('p2')];
            const tg = makeGroup('g1', ['p1', 'p2'], { collapsed: true });
            const { manager } = createManager({ tabs, tabGroups: [tg] });

            manager.update();

            expect(
                tabs[0].value.element.classList.contains(
                    'dv-tab--group-collapsed'
                )
            ).toBe(true);
            expect(
                tabs[1].value.element.classList.contains(
                    'dv-tab--group-collapsed'
                )
            ).toBe(true);
            // the one-shot skip flag is reset after the update
            expect(manager.skipNextCollapseAnimation).toBe(false);
        });

        test('collapse animation in vertical orientation adds the collapsed class', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const { manager } = createManager({
                tabs,
                tabGroups: [tg],
                direction: 'vertical',
            });

            manager.update();
            tg.collapse();
            manager.update();

            expect(
                tabs[0].value.element.classList.contains(
                    'dv-tab--group-collapsed'
                )
            ).toBe(true);
        });

        test('collapsing an existing group animates the collapsed class on', () => {
            const tabs = [createTab('p1'), createTab('p2')];
            const tg = makeGroup('g1', ['p1', 'p2']);
            const { manager } = createManager({ tabs, tabGroups: [tg] });

            manager.update();
            expect(
                tabs[0].value.element.classList.contains(
                    'dv-tab--group-collapsed'
                )
            ).toBe(false);

            tg.collapse();
            manager.update();

            expect(
                tabs[0].value.element.classList.contains(
                    'dv-tab--group-collapsed'
                )
            ).toBe(true);
        });

        test('expanding a collapsed tab adds the expanding class and cleanupTransition clears it', () => {
            const tabs = [createTab('p1')];
            tabs[0].value.element.classList.add('dv-tab--group-collapsed');
            const tg = makeGroup('g1', ['p1']);
            const { manager } = createManager({ tabs, tabGroups: [tg] });

            manager.update();

            expect(
                tabs[0].value.element.classList.contains(
                    'dv-tab--group-expanding'
                )
            ).toBe(true);
            expect(
                tabs[0].value.element.classList.contains(
                    'dv-tab--group-collapsed'
                )
            ).toBe(false);

            manager.cleanupTransition('p1');

            expect(
                tabs[0].value.element.classList.contains(
                    'dv-tab--group-expanding'
                )
            ).toBe(false);
        });

        test('cleanupTransition is a no-op for an unknown panel', () => {
            const { manager } = createManager();
            expect(() => manager.cleanupTransition('nope')).not.toThrow();
        });

        test('skipNextCollapseAnimation getter/setter round-trips', () => {
            const { manager } = createManager();
            expect(manager.skipNextCollapseAnimation).toBe(false);
            manager.skipNextCollapseAnimation = true;
            expect(manager.skipNextCollapseAnimation).toBe(true);
        });
    });

    describe('underline / indicator', () => {
        test('groupUnderlines is empty before any update', () => {
            const { manager } = createManager();
            expect(manager.groupUnderlines.size).toBe(0);
        });

        test('update creates an underline element per active group', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1'], { color: 'blue' });
            const { manager, tabsList } = createManager({
                tabs,
                tabGroups: [tg],
            });

            manager.update();

            expect(manager.groupUnderlines.has('g1')).toBe(true);
            const underline = manager.groupUnderlines.get('g1')!;
            expect(underline.classList.contains('dv-tab-group-underline')).toBe(
                true
            );
            expect(tabsList.contains(underline)).toBe(true);
        });

        test('the "none" indicator strategy still tracks underlines', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1'], { color: 'blue' });
            const { manager } = createManager({
                tabs,
                tabGroups: [tg],
                options: { theme: { tabGroupIndicator: 'none' } },
            });

            manager.update();

            expect(manager.groupUnderlines.has('g1')).toBe(true);
        });

        test('positionUnderlines / trackUnderlines do not throw', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1'], { color: 'blue' });
            const { manager } = createManager({ tabs, tabGroups: [tg] });

            manager.update();

            expect(() => manager.positionUnderlines()).not.toThrow();
            expect(() => manager.trackUnderlines()).not.toThrow();
        });

        test('positionUnderlines synchronously reads the indicator context', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1'], { color: 'blue' });
            const { manager } = createManager({
                tabs,
                tabGroups: [tg],
                activePanelId: 'p1',
            });

            manager.update();

            const raf = jest
                .spyOn(global, 'requestAnimationFrame')
                .mockImplementation((cb: FrameRequestCallback) => {
                    cb(0);
                    return 0;
                });
            try {
                expect(() => manager.positionUnderlines()).not.toThrow();
            } finally {
                raf.mockRestore();
            }
        });

        test('switching the indicator strategy at runtime recreates the indicator', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1'], { color: 'blue' });
            const { manager, options } = createManager({
                tabs,
                tabGroups: [tg],
                options: { theme: { tabGroupIndicator: 'wrap' } },
            });

            manager.update();
            expect(manager.groupUnderlines.has('g1')).toBe(true);

            options.theme.tabGroupIndicator = 'none';
            expect(() => manager.update()).not.toThrow();
            expect(manager.groupUnderlines.has('g1')).toBe(true);
        });
    });

    describe('chip positioning helpers', () => {
        test('positionAllChips returns early when there are no chips', () => {
            const { manager } = createManager();
            expect(() => manager.positionAllChips()).not.toThrow();
        });

        test('positionAllChips re-inserts chips before their first tab', () => {
            const tabs = [createTab('p1'), createTab('p2')];
            const tg = makeGroup('g1', ['p1', 'p2']);
            const { manager, tabsList } = createManager({
                tabs,
                tabGroups: [tg],
            });

            manager.update();
            const chipEl = manager.chipRenderers.get('g1')!.chip.element;

            // move the chip elsewhere then re-position
            tabsList.appendChild(chipEl);
            expect(tabsList.firstChild).not.toBe(chipEl);

            manager.positionAllChips();
            expect(tabsList.firstChild).toBe(chipEl);
        });

        test('snapshotChipWidths returns a width per chip', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const { manager } = createManager({ tabs, tabGroups: [tg] });

            manager.update();
            const widths = manager.snapshotChipWidths();

            expect(widths.has('g1')).toBe(true);
            expect(typeof widths.get('g1')).toBe('number');
        });
    });

    describe('direction & drag-and-drop state', () => {
        test('updateDirection sets drop-target zones per orientation', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const { manager, state } = createManager({
                tabs,
                tabGroups: [tg],
            });

            manager.update();
            const dropTarget = manager.chipRenderers.get('g1')!.dropTarget;
            const spy = jest.spyOn(dropTarget, 'setTargetZones');

            manager.updateDirection();
            expect(spy).toHaveBeenLastCalledWith(['left']);

            state.direction = 'vertical';
            manager.updateDirection();
            expect(spy).toHaveBeenLastCalledWith(['top']);
        });

        test('updateDragAndDropState reflects disableDnd on the chip element', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const { manager, options } = createManager({
                tabs,
                tabGroups: [tg],
                options: { dndStrategy: 'html5' },
            });

            manager.update();
            const chipEl = manager.chipRenderers.get('g1')!.chip.element;
            expect(chipEl.draggable).toBe(true);

            options.disableDnd = true;
            manager.updateDragAndDropState();
            expect(chipEl.draggable).toBe(false);
        });
    });

    describe('chip drop target', () => {
        // The chip covers the "insert before this group" slot. Smooth-reorder
        // owns the in-flight visual for a single tab, so the chip's overlay
        // stays suppressed there; a dragged group has no other affordance for
        // that slot, so it keeps one.
        const setTransfer = (viewId: string, tabGroupId?: string) => {
            LocalSelectionTransfer.getInstance<PanelTransfer>().setData(
                [
                    new PanelTransfer(
                        viewId,
                        'group-1',
                        tabGroupId ? null : 'p9',
                        tabGroupId
                    ),
                ],
                PanelTransfer.prototype
            );
        };

        afterEach(() => {
            LocalSelectionTransfer.getInstance<PanelTransfer>().clearData(
                PanelTransfer.prototype
            );
        });

        const canDisplayOverlay = (manager: TabGroupManager): boolean => {
            const dropTarget = manager.chipRenderers.get('g1')!
                .dropTarget as any;
            return dropTarget.options.canDisplayOverlay(
                new Event('dragover'),
                'left'
            );
        };

        test('a chip drag keeps the chip overlay in smooth mode', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const { manager } = createManager({
                tabs,
                tabGroups: [tg],
                options: { theme: { tabAnimation: 'smooth' } },
            });
            manager.update();

            setTransfer('accessor-1', 'g2');
            expect(canDisplayOverlay(manager)).toBe(true);
        });

        test('a single-tab drag has no chip overlay in smooth mode', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const { manager } = createManager({
                tabs,
                tabGroups: [tg],
                options: { theme: { tabAnimation: 'smooth' } },
            });
            manager.update();

            setTransfer('accessor-1');
            expect(canDisplayOverlay(manager)).toBe(false);
        });

        test('both drags keep the chip overlay outside smooth mode', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const { manager } = createManager({ tabs, tabGroups: [tg] });
            manager.update();

            setTransfer('accessor-1');
            expect(canDisplayOverlay(manager)).toBe(true);

            setTransfer('accessor-1', 'g2');
            expect(canDisplayOverlay(manager)).toBe(true);
        });
    });

    describe('pointer drag wiring', () => {
        // The chip covers the "insert before this group" slot. Tabs build a
        // drop target per backend; the chip must too, or the slot is a dead
        // zone whenever the pointer backend owns the gesture
        // (`dndStrategy: 'pointer'`, and touch under `auto`).
        test('a pointer drop released over the chip fires onChipDrop', () => {
            const tabs = [createTab('p1'), createTab('p2')];
            const tg = makeGroup('g1', ['p1']);
            const { manager, callbacks } = createManager({
                tabs,
                tabGroups: [tg],
                options: { dndStrategy: 'pointer' },
            });

            manager.update();
            const chipEl = manager.chipRenderers.get('g1')!.chip.element;
            document.body.appendChild(chipEl);
            jest.spyOn(chipEl, 'offsetWidth', 'get').mockReturnValue(60);
            jest.spyOn(chipEl, 'offsetHeight', 'get').mockReturnValue(30);
            jest.spyOn(chipEl, 'getBoundingClientRect').mockReturnValue({
                top: 0,
                left: 0,
                right: 60,
                bottom: 30,
                width: 60,
                height: 30,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            } as DOMRect);
            const elementsFromPoint = jest
                .spyOn(document, 'elementsFromPoint')
                .mockReturnValue([chipEl]);

            LocalSelectionTransfer.getInstance<PanelTransfer>().setData(
                [new PanelTransfer('accessor-1', 'group-1', 'p2')],
                PanelTransfer.prototype
            );

            const controller = PointerDragController.getInstance();
            controller.beginDrag({
                pointerEvent: new PointerEvent('pointerdown', {
                    pointerId: 1,
                    pointerType: 'touch',
                }),
                source: tabs[1].value.element,
                getData: () => ({ dispose: jest.fn() }),
            });
            window.dispatchEvent(
                new PointerEvent('pointermove', {
                    pointerId: 1,
                    pointerType: 'touch',
                    clientX: 10,
                    clientY: 15,
                })
            );
            window.dispatchEvent(
                new PointerEvent('pointerup', {
                    pointerId: 1,
                    pointerType: 'touch',
                    clientX: 10,
                    clientY: 15,
                })
            );

            expect(callbacks.onChipDrop).toHaveBeenCalledTimes(1);

            controller.cancel();
            LocalSelectionTransfer.getInstance<PanelTransfer>().clearData(
                PanelTransfer.prototype
            );
            elementsFromPoint.mockRestore();
            chipEl.remove();
        });
    });

    describe('native html5 drag wiring', () => {
        test('a native dragstart/dragend on the chip drives the callbacks', () => {
            const tabs = [createTab('p1'), createTab('p2')];
            const tg = makeGroup('g1', ['p1', 'p2']);
            const { manager, callbacks } = createManager({
                tabs,
                tabGroups: [tg],
                options: { dndStrategy: 'html5' },
            });

            manager.update();
            const chipEl = manager.chipRenderers.get('g1')!.chip.element;

            const startEvent = new Event('dragstart', { bubbles: true });
            Object.defineProperty(startEvent, 'dataTransfer', {
                value: {
                    setData: jest.fn(),
                    setDragImage: jest.fn(),
                    items: { length: 0 },
                    effectAllowed: '',
                },
            });
            chipEl.dispatchEvent(startEvent);

            expect(callbacks.onChipDragStart).toHaveBeenCalledTimes(1);
            expect(callbacks.onChipDragStart.mock.calls[0][0]).toBe(tg);

            const endEvent = new Event('dragend', { bubbles: true });
            chipEl.dispatchEvent(endEvent);

            expect(callbacks.onChipDragEnd).toHaveBeenCalledTimes(1);
        });
    });

    describe('chip drag source lifecycle (#1410)', () => {
        test('disposeChipDrag clears the drag sources and update re-arms them', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const { manager } = createManager({ tabs, tabGroups: [tg] });

            manager.update();
            const entry = manager.chipRenderers.get('g1')!;
            expect(entry.html5DragSource).toBeDefined();
            expect(entry.pointerDragSource).toBeDefined();

            manager.disposeChipDrag('g1');
            expect(entry.html5DragSource).toBeUndefined();
            expect(entry.pointerDragSource).toBeUndefined();

            // a subsequent update re-arms the sources on the same chip element
            manager.update();
            expect(entry.html5DragSource).toBeDefined();
            expect(entry.pointerDragSource).toBeDefined();
        });

        test('disposeChipDrag is a no-op for an unknown group', () => {
            const { manager } = createManager();
            expect(() => manager.disposeChipDrag('nope')).not.toThrow();
        });
    });

    describe('setGroupDragImage', () => {
        test('returns early without a dataTransfer', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const { manager } = createManager({ tabs, tabGroups: [tg] });
            manager.update();
            const chipEl = manager.chipRenderers.get('g1')!.chip.element;

            expect(() =>
                manager.setGroupDragImage(
                    { dataTransfer: null } as any,
                    tg,
                    chipEl
                )
            ).not.toThrow();
        });

        test('sets the drag image using the cloned chip (horizontal)', () => {
            const tabs = [createTab('p1'), createTab('p2')];
            const tg = makeGroup('g1', ['p1', 'p2']);
            const { manager, accessor } = createManager({
                tabs,
                tabGroups: [tg],
            });
            manager.update();
            const chipEl = manager.chipRenderers.get('g1')!.chip.element;

            const setDragImage = jest.fn();
            const event = {
                dataTransfer: { setDragImage },
                clientX: 5,
                clientY: 7,
            } as any;

            manager.setGroupDragImage(event, tg, chipEl);

            expect(setDragImage).toHaveBeenCalledTimes(1);
            // the wrapper is appended to the dockview root during the call
            expect(setDragImage.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
            // wrapper is mounted inside the accessor element
            expect(
                accessor.element.querySelector('.dv-groupview')
            ).toBeTruthy();
        });

        test('falls back to the cursor offset when the clone has no chip', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            // custom chip WITHOUT the .dv-tab-group-chip class, so the cloned
            // tabs list contains no `.dv-tab-group-chip` to anchor against.
            const chip = mockChipRenderer();
            chip.element.className = 'custom-chip';

            const { manager } = createManager({
                tabs,
                tabGroups: [tg],
                createChip: () => chip,
            });
            manager.update();

            const setDragImage = jest.fn();
            const event = {
                dataTransfer: { setDragImage },
                clientX: 3,
                clientY: 4,
            } as any;

            manager.setGroupDragImage(event, tg, chip.element);
            expect(setDragImage).toHaveBeenCalledTimes(1);
        });

        test('sets the drag image in vertical orientation', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const { manager } = createManager({
                tabs,
                tabGroups: [tg],
                direction: 'vertical',
            });
            manager.update();
            const chipEl = manager.chipRenderers.get('g1')!.chip.element;

            const setDragImage = jest.fn();
            const event = {
                dataTransfer: { setDragImage },
                clientX: 1,
                clientY: 2,
            } as any;

            manager.setGroupDragImage(event, tg, chipEl);
            expect(setDragImage).toHaveBeenCalledTimes(1);
        });
    });

    describe('disposeAll', () => {
        test('disposes chips, indicator and clears the chip map', () => {
            const tabs = [createTab('p1')];
            const tg = makeGroup('g1', ['p1']);
            const chip = mockChipRenderer();
            const { manager } = createManager({
                tabs,
                tabGroups: [tg],
                createChip: () => chip,
            });

            manager.update();
            expect(manager.chipRenderers.size).toBe(1);

            manager.disposeAll();

            expect(chip.dispose).toHaveBeenCalledTimes(1);
            expect(manager.chipRenderers.size).toBe(0);
            expect(manager.groupUnderlines.size).toBe(0);
        });

        test('disposeAll flushes a pending expand transition cleanup', () => {
            const tabs = [createTab('p1')];
            tabs[0].value.element.classList.add('dv-tab--group-collapsed');
            const tg = makeGroup('g1', ['p1']);
            const { manager } = createManager({ tabs, tabGroups: [tg] });

            manager.update();
            // an expand animation is now pending
            expect(
                tabs[0].value.element.classList.contains(
                    'dv-tab--group-expanding'
                )
            ).toBe(true);

            expect(() => manager.disposeAll()).not.toThrow();
            expect(manager.chipRenderers.size).toBe(0);
        });
    });
});
