import { fireEvent } from '@testing-library/dom';
import { DockviewComponent } from '../../../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../../../dockview/dockviewGroupPanel';
import { IContentRenderer } from '../../../../dockview/types';
import { PointerDragController } from '../../../../dnd/pointer/pointerDragController';
import { TabDropIndexEvent } from '../../../../dockview/components/titlebar/tabsContainer';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        // noop
    }
    layout(): void {
        // noop
    }
    dispose(): void {
        // noop
    }
}

const TAB_WIDTH = 100;
const CHIP_WIDTH = 40;
const POINTER_Y = 10;

function makeDOMRect(left: number, width: number): DOMRect {
    return {
        x: left,
        y: 0,
        width,
        height: 30,
        top: 0,
        left,
        right: left + width,
        bottom: 30,
        toJSON: () => ({}),
    } as DOMRect;
}

/**
 * Pointer reorders in smooth mode commit from `handlePointerDragEnd`, not
 * from a drop target: tab targets refuse internal drags in smooth mode and
 * chip targets refuse single-tab drags. These tests drive the real
 * component with `dndStrategy: 'pointer'` and assert the tab-group
 * consequence of the commit (join / stay / eject), the same thing an HTML5
 * mouse drag of the same gesture produces.
 */
describe('tabs - pointer reorder with tab groups', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;

    beforeEach(() => {
        // Chip rendering is scheduled on a microtask; keep that real so the
        // strip the drag reads has its chips.
        jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
        container = document.createElement('div');
        document.body.appendChild(container);
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            dndStrategy: 'pointer',
            theme: {
                name: 'test',
                className: 'test',
                tabAnimation: 'smooth',
            },
        });
        dockview.layout(1000, 500);
    });

    afterEach(() => {
        PointerDragController.getInstance().cancel();
        dockview.dispose();
        container.remove();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    function addPanels(ids: string[]): DockviewGroupPanel {
        for (const id of ids) {
            dockview.addPanel({ id, component: 'default' });
        }
        return dockview.groups[0];
    }

    /** Create a tab group and wait for its chip to be rendered. */
    async function createTabGroup(
        group: DockviewGroupPanel,
        panelIds: string[]
    ) {
        const tg = dockview.api.createTabGroup({ groupId: group.id });
        for (const panelId of panelIds) {
            dockview.api.addPanelToTabGroup({
                groupId: group.id,
                tabGroupId: tg.id,
                panelId,
            });
        }
        await Promise.resolve();
        expect(
            tabsList(group).querySelector('.dv-tab-group-chip')
        ).not.toBeNull();
        return tg;
    }

    function tabsList(group: DockviewGroupPanel): HTMLElement {
        return group.element.querySelector('.dv-tabs-container') as HTMLElement;
    }

    /**
     * jsdom lays nothing out, so give the strip a horizontal layout in DOM
     * order: chips are `CHIP_WIDTH` wide, tabs `TAB_WIDTH`, starting at 0.
     * The reorder math reads these rects at drag start, and hit-testing is
     * answered by the strip itself (the release lands on its padding).
     */
    function layoutStrip(group: DockviewGroupPanel): void {
        const list = tabsList(group);
        let left = 0;
        for (const child of Array.from(list.children)) {
            let width = 0;
            if (child.classList.contains('dv-tab-group-chip')) {
                width = CHIP_WIDTH;
            } else if (child.classList.contains('dv-tab')) {
                width = TAB_WIDTH;
            }
            jest.spyOn(child, 'getBoundingClientRect').mockReturnValue(
                makeDOMRect(left, width)
            );
            left += width;
        }
        jest.spyOn(list, 'getBoundingClientRect').mockReturnValue(
            makeDOMRect(0, left)
        );
        jest.spyOn(document, 'elementFromPoint').mockReturnValue(list);
        jest.spyOn(document, 'elementsFromPoint').mockReturnValue([list]);
    }

    function tabElement(group: DockviewGroupPanel, panelId: string) {
        const tabs = Array.from(
            tabsList(group).querySelectorAll('.dv-tab')
        ) as HTMLElement[];
        const tab = tabs.find(
            (el) => group.model.getPanelForTab(el)?.id === panelId
        );
        if (!tab) {
            throw new Error(`no tab for ${panelId}`);
        }
        return tab;
    }

    function pointer(clientX: number): PointerEventInit {
        return {
            pointerId: 1,
            pointerType: 'mouse',
            clientX,
            clientY: POINTER_Y,
            bubbles: true,
            cancelable: true,
        };
    }

    /** A mouse drag of `tab` from `fromX` released at `toX`. */
    function pointerDrag(tab: HTMLElement, fromX: number, toX: number): void {
        fireEvent.pointerDown(tab, pointer(fromX));
        // Past the drag source's start threshold; begins the drag.
        fireEvent.pointerMove(window, pointer(fromX + 10));
        fireEvent.pointerMove(window, pointer(toX));
        fireEvent.pointerUp(window, pointer(toX));
        // The controller disposes the transfer data after the commit.
        jest.runAllTimers();
    }

    function panelIds(group: DockviewGroupPanel): string[] {
        return group.model.panels.map((p) => p.id);
    }

    test('reordering a grouped tab within its own group keeps it grouped', async () => {
        // Strip: [chip][p1][p2][p3], all three in one group.
        const group = addPanels(['p1', 'p2', 'p3']);
        const tg = await createTabGroup(group, ['p1', 'p2', 'p3']);
        layoutStrip(group);

        // p3's centre sits at 290; release over p2's centre, so the drag
        // image's leading edge is at p2's original leading edge: slot 1.
        pointerDrag(tabElement(group, 'p3'), 290, 190);

        expect(panelIds(group)).toEqual(['p1', 'p3', 'p2']);
        expect(tg.panelIds).toEqual(['p1', 'p3', 'p2']);
        expect(group.model.getTabGroupForPanel('p3')?.id).toBe(tg.id);
    });

    test('dragging an ungrouped tab into a group joins it at the dropped slot', async () => {
        // Strip: [p0][chip][p1][p2], p0 ungrouped.
        const group = addPanels(['p0', 'p1', 'p2']);
        const tg = await createTabGroup(group, ['p1', 'p2']);
        layoutStrip(group);

        // Release between p1 and p2.
        pointerDrag(tabElement(group, 'p0'), 50, 190);

        expect(panelIds(group)).toEqual(['p1', 'p0', 'p2']);
        expect(tg.panelIds).toEqual(['p1', 'p0', 'p2']);
        expect(group.model.getTabGroupForPanel('p0')?.id).toBe(tg.id);
    });

    test('an ungrouped tab released at its own slot but past the chip joins the group first', async () => {
        // Strip: [p0][chip][p1][p2]. Slot 0 is p0's own slot, yet the cursor
        // has crossed the chip: the HTML5 path commits this drop (the index
        // is unchanged but the membership is not), so the pointer path must.
        const group = addPanels(['p0', 'p1', 'p2']);
        const tg = await createTabGroup(group, ['p1', 'p2']);
        layoutStrip(group);

        pointerDrag(tabElement(group, 'p0'), 50, 100);

        expect(panelIds(group)).toEqual(['p0', 'p1', 'p2']);
        expect(tg.panelIds).toEqual(['p0', 'p1', 'p2']);
        expect(group.model.getTabGroupForPanel('p0')?.id).toBe(tg.id);
    });

    test('a group locked mid-drag does not reorder: the gap stays at the source', () => {
        const group = addPanels(['p1', 'p2', 'p3']);
        layoutStrip(group);

        const tab = tabElement(group, 'p1');
        fireEvent.pointerDown(tab, pointer(50));
        fireEvent.pointerMove(window, pointer(60));
        jest.runAllTimers();
        group.locked = true;
        fireEvent.pointerMove(window, pointer(190));
        fireEvent.pointerMove(window, pointer(250));

        // The source still collapses, as for a drag out of the group…
        expect(tab.classList.contains('dv-tab--dragging')).toBe(true);
        // …but the insertion point never leaves it.
        expect(
            (group.model as any).tabsContainer.tabs._animState
                .currentInsertionIndex
        ).toBe(0);

        fireEvent.pointerUp(window, pointer(190));
        jest.runAllTimers();

        expect(panelIds(group)).toEqual(['p1', 'p2', 'p3']);
    });

    test('a chip in a group locked mid-drag does not move', async () => {
        const group = addPanels(['p0', 'p1', 'p2']);
        const tg = await createTabGroup(group, ['p1']);
        layoutStrip(group);

        // Strip: [p0 0-100][chip 100-140][p1 140-240][p2 240-340]
        const chip = tabsList(group).querySelector(
            '.dv-tab-group-chip'
        ) as HTMLElement;
        fireEvent.pointerDown(chip, pointer(120));
        fireEvent.pointerMove(window, pointer(130));
        jest.runAllTimers();
        group.locked = true;
        fireEvent.pointerMove(window, pointer(330));
        fireEvent.pointerUp(window, pointer(330));
        jest.runAllTimers();

        expect(panelIds(group)).toEqual(['p0', 'p1', 'p2']);
        expect(tg.panelIds).toEqual(['p1']);
        expect(
            tabsList(group).querySelector(
                '.dv-tab-group-chip--dragging, .dv-tab--dragging'
            )
        ).toBeNull();
    });

    test('a reorder with no tab groups drops with a null target', () => {
        const group = addPanels(['p1', 'p2', 'p3']);
        layoutStrip(group);

        const drops: TabDropIndexEvent[] = [];
        (group.model as any).tabsContainer.onDrop((e: TabDropIndexEvent) =>
            drops.push(e)
        );

        // Release over p2's centre: slot 2, adjusted to 1 for the source.
        pointerDrag(tabElement(group, 'p1'), 50, 190);

        expect(drops).toHaveLength(1);
        expect(drops[0]).toEqual(
            expect.objectContaining({ index: 1, targetTabGroupId: null })
        );
        expect(panelIds(group)).toEqual(['p2', 'p1', 'p3']);
        expect(group.model.getTabGroupForPanel('p1')).toBeUndefined();
    });

    test('an ungrouped tab released at its own slot fires no drop', () => {
        // Strip: [p1][p2][p3], no groups. Releasing p2 where it started
        // neither moves it nor changes membership, so nothing commits.
        const group = addPanels(['p1', 'p2', 'p3']);
        layoutStrip(group);

        const drops: TabDropIndexEvent[] = [];
        (group.model as any).tabsContainer.onDrop((e: TabDropIndexEvent) =>
            drops.push(e)
        );

        pointerDrag(tabElement(group, 'p2'), 150, 150);

        expect(drops).toHaveLength(0);
        expect(panelIds(group)).toEqual(['p1', 'p2', 'p3']);
    });

    test('resolveTabDrop is null without an insertion index', () => {
        const group = addPanels(['p1', 'p2']);
        const reorder = (group.model as any).tabsContainer.tabs._reorder;

        expect(
            reorder.resolveTabDrop({
                sourceTabId: 'p1',
                sourceIndex: 0,
                currentInsertionIndex: null,
                targetTabGroupId: null,
            })
        ).toBeNull();
    });

    test('a grouped tab released at its own slot stays put', async () => {
        // Strip: [chip][p1][p2][p3]; p2 is released where it started, inside
        // the group: nothing moves and nothing is ejected.
        const group = addPanels(['p1', 'p2', 'p3']);
        const tg = await createTabGroup(group, ['p1', 'p2', 'p3']);
        layoutStrip(group);

        pointerDrag(tabElement(group, 'p2'), 190, 190);

        expect(panelIds(group)).toEqual(['p1', 'p2', 'p3']);
        expect(tg.panelIds).toEqual(['p1', 'p2', 'p3']);
        expect(group.model.getTabGroupForPanel('p2')?.id).toBe(tg.id);
    });

    test('the only tab of a group released at its own slot stays grouped', async () => {
        // Strip: [p0][chip][p1][p2]; p1 is its group's sole member. Released
        // where it started (past the chip), it must not be ejected.
        const group = addPanels(['p0', 'p1', 'p2']);
        const tg = await createTabGroup(group, ['p1']);
        layoutStrip(group);

        pointerDrag(tabElement(group, 'p1'), 190, 190);

        expect(panelIds(group)).toEqual(['p0', 'p1', 'p2']);
        expect(tg.panelIds).toEqual(['p1']);
        expect(group.model.getTabGroupForPanel('p1')?.id).toBe(tg.id);
    });

    test('the only tab of a leading group released at its own slot stays grouped', async () => {
        // Strip: [chip][p1][p2]
        const group = addPanels(['p1', 'p2']);
        const tg = await createTabGroup(group, ['p1']);
        layoutStrip(group);

        pointerDrag(tabElement(group, 'p1'), 90, 90);

        expect(panelIds(group)).toEqual(['p1', 'p2']);
        expect(tg.panelIds).toEqual(['p1']);
        expect(group.model.getTabGroupForPanel('p1')?.id).toBe(tg.id);
    });

    test('the last tab of a 3-member group released at its own slot stays grouped', async () => {
        // Strip: [chip][p1][p2][p3]
        const group = addPanels(['p1', 'p2', 'p3']);
        const tg = await createTabGroup(group, ['p1', 'p2', 'p3']);
        layoutStrip(group);

        pointerDrag(tabElement(group, 'p3'), 290, 290);

        expect(panelIds(group)).toEqual(['p1', 'p2', 'p3']);
        expect(tg.panelIds).toEqual(['p1', 'p2', 'p3']);
        expect(group.model.getTabGroupForPanel('p3')?.id).toBe(tg.id);
    });

    test('the first tab of a 3-member group released at its own slot stays grouped', async () => {
        const group = addPanels(['p1', 'p2', 'p3']);
        const tg = await createTabGroup(group, ['p1', 'p2', 'p3']);
        layoutStrip(group);

        pointerDrag(tabElement(group, 'p1'), 90, 90);

        expect(panelIds(group)).toEqual(['p1', 'p2', 'p3']);
        expect(tg.panelIds).toEqual(['p1', 'p2', 'p3']);
        expect(group.model.getTabGroupForPanel('p1')?.id).toBe(tg.id);
    });

    test('the last member released at its own slot short of the next chip stays grouped', async () => {
        // Strip: [chipA][p1][p2][chipB][p3]. p2 is the last member of A and
        // sits right before B's chip. Released at its own slot (slot 1) with
        // the cursor short of B's chip edge (180 once the source collapses),
        // B declines it and it must stay in A rather than be ejected.
        const group = addPanels(['p1', 'p2', 'p3']);
        const tgA = await createTabGroup(group, ['p1', 'p2']);
        const tgB = await createTabGroup(group, ['p3']);
        layoutStrip(group);

        pointerDrag(tabElement(group, 'p2'), 190, 160);

        expect(panelIds(group)).toEqual(['p1', 'p2', 'p3']);
        expect(tgA.panelIds).toEqual(['p1', 'p2']);
        expect(tgB.panelIds).toEqual(['p3']);
        expect(group.model.getTabGroupForPanel('p2')?.id).toBe(tgA.id);
    });

    test('resolveTabDrop is null when neither the slot nor the group changes', async () => {
        const group = addPanels(['p0', 'p1', 'p2']);
        const tg = await createTabGroup(group, ['p1']);
        const reorder = (group.model as any).tabsContainer.tabs._reorder;
        const state = (targetTabGroupId: string | null) => ({
            sourceTabId: 'p1',
            sourceIndex: 1,
            currentInsertionIndex: 1,
            targetTabGroupId,
        });

        expect(reorder.resolveTabDrop(state(tg.id))).toBeNull();
        // Same slot but leaving the group still commits.
        expect(reorder.resolveTabDrop(state(null))).toEqual({
            index: 1,
            targetTabGroupId: null,
        });
    });

    test('the only tab of a group released over its chip is ejected', async () => {
        // Strip: [p0][chip][p1][p2]; release with the cursor over the chip
        const group = addPanels(['p0', 'p1', 'p2']);
        const tg = await createTabGroup(group, ['p1']);
        layoutStrip(group);

        pointerDrag(tabElement(group, 'p1'), 190, 120);

        expect(panelIds(group)).toEqual(['p0', 'p1', 'p2']);
        expect(tg.panelIds).toEqual([]);
        expect(group.model.getTabGroupForPanel('p1')).toBeUndefined();
    });
});

/**
 * A single tab dragged by pointer onto another group's strip in smooth mode.
 * The target strip's tabs decline the drag, so the strip commits it on
 * release, as the HTML5 tabs-list `drop` listener does.
 */
describe('tabs - pointer drop of a tab onto another group (smooth)', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;

    // Source strip at x 0-200, target strip at x 500-700.
    const TARGET_LEFT = 500;

    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
        container = document.createElement('div');
        document.body.appendChild(container);
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            dndStrategy: 'pointer',
            theme: {
                name: 'test',
                className: 'test',
                tabAnimation: 'smooth',
            },
        });
        dockview.layout(1000, 500);
    });

    afterEach(() => {
        PointerDragController.getInstance().cancel();
        dockview.dispose();
        container.remove();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    function setup(): {
        source: DockviewGroupPanel;
        target: DockviewGroupPanel;
    } {
        dockview.addPanel({ id: 'a1', component: 'default' });
        dockview.addPanel({ id: 'a2', component: 'default' });
        dockview.addPanel({
            id: 'b1',
            component: 'default',
            position: { referencePanel: 'a1', direction: 'right' },
        });
        dockview.addPanel({
            id: 'b2',
            component: 'default',
            position: { referencePanel: 'b1' },
        });
        const source = dockview.getGroupPanel('a1')!.group;
        const target = dockview.getGroupPanel('b1')!.group;
        layout(source, 0);
        layout(target, TARGET_LEFT);
        return { source, target };
    }

    function list(group: DockviewGroupPanel): HTMLElement {
        return group.element.querySelector('.dv-tabs-container') as HTMLElement;
    }

    function tabs(group: DockviewGroupPanel): HTMLElement[] {
        return Array.from(list(group).querySelectorAll('.dv-tab'));
    }

    /** Tabs and tab-group chips, in strip order. */
    function items(group: DockviewGroupPanel): HTMLElement[] {
        return Array.from(
            list(group).querySelectorAll('.dv-tab, .dv-tab-group-chip')
        );
    }

    function layout(group: DockviewGroupPanel, start: number): void {
        let left = start;
        for (const item of items(group)) {
            const width = item.classList.contains('dv-tab-group-chip')
                ? CHIP_WIDTH
                : TAB_WIDTH;
            jest.spyOn(item, 'getBoundingClientRect').mockReturnValue(
                makeDOMRect(left, width)
            );
            left += width;
        }
        jest.spyOn(list(group), 'getBoundingClientRect').mockReturnValue(
            makeDOMRect(start, left - start)
        );
    }

    /** Hit-test the tab or chip under `x`, falling back to its strip. */
    function hitTest(groups: DockviewGroupPanel[]): void {
        const at = (x: number): Element | null => {
            for (const group of groups) {
                const rect = list(group).getBoundingClientRect();
                if (x >= rect.left && x < rect.right) {
                    const tab = items(group).find((el) => {
                        const r = el.getBoundingClientRect();
                        return x >= r.left && x < r.right;
                    });
                    return tab ?? list(group);
                }
            }
            return null;
        };
        jest.spyOn(document, 'elementFromPoint').mockImplementation((x) =>
            at(x)
        );
        jest.spyOn(document, 'elementsFromPoint').mockImplementation((x) => {
            const el = at(x);
            return el ? [el] : [];
        });
    }

    function pointer(clientX: number): PointerEventInit {
        return {
            pointerId: 1,
            pointerType: 'mouse',
            clientX,
            clientY: POINTER_Y,
            bubbles: true,
            cancelable: true,
        };
    }

    /** Group `panelIds` of `group` into a tab group and lay its chip out. */
    async function createTabGroup(
        group: DockviewGroupPanel,
        panelIds: string[],
        start: number
    ) {
        const tg = dockview.api.createTabGroup({ groupId: group.id });
        for (const panelId of panelIds) {
            dockview.api.addPanelToTabGroup({
                groupId: group.id,
                tabGroupId: tg.id,
                panelId,
            });
        }
        await Promise.resolve();
        layout(group, start);
        return tg;
    }

    function chip(group: DockviewGroupPanel): HTMLElement {
        return list(group).querySelector('.dv-tab-group-chip') as HTMLElement;
    }

    function startDrag(tab: HTMLElement, fromX: number, toX: number): void {
        fireEvent.pointerDown(tab, pointer(fromX));
        // Past the drag source's start threshold; begins the drag.
        fireEvent.pointerMove(window, pointer(fromX + 10));
        fireEvent.pointerMove(window, pointer(toX));
        fireEvent.pointerMove(window, pointer(toX + 1));
    }

    const ids = (group: DockviewGroupPanel) =>
        group.model.panels.map((p) => p.id);

    test('a tab released over a tab of another group moves into that group', () => {
        const { source, target } = setup();
        hitTest([source, target]);

        // Release over b2 (600-700).
        startDrag(tabs(source)[0], 50, 650);
        fireEvent.pointerUp(window, pointer(651));
        jest.runAllTimers();

        expect(ids(source)).toEqual(['a2']);
        expect(ids(target)).toContain('a1');
        expect(ids(target)).toHaveLength(3);
        expect(dockview.groups).toHaveLength(2);
    });

    test('the target strip is left without gap margins after the move', () => {
        const { source, target } = setup();
        hitTest([source, target]);

        startDrag(tabs(source)[0], 50, 650);
        fireEvent.pointerUp(window, pointer(651));
        jest.runAllTimers();

        for (const tab of tabs(target)) {
            expect(tab.style.marginLeft).toBe('');
        }
    });

    test('a cancelled drag over another group moves nothing', () => {
        const { source, target } = setup();
        hitTest([source, target]);

        startDrag(tabs(source)[0], 50, 650);
        fireEvent.pointerCancel(window, pointer(651));
        jest.runAllTimers();

        expect(ids(source)).toEqual(['a1', 'a2']);
        expect(ids(target)).toEqual(['b1', 'b2']);
    });

    test('a strip in another document does not commit the release', () => {
        const { source, target } = setup();
        hitTest([source, target]);

        // Stand the target strip in for a popout's: its own document answers
        // the hit-test at the release point, but the drag is not its.
        const popoutDoc = document.implementation.createHTMLDocument('popout');
        const targetList = list(target);
        Object.defineProperty(targetList, 'ownerDocument', {
            value: popoutDoc,
        });
        (popoutDoc as any).elementFromPoint = () => targetList;
        (popoutDoc as any).elementsFromPoint = () => [targetList];

        startDrag(tabs(source)[0], 50, 650);
        fireEvent.pointerUp(window, pointer(651));
        jest.runAllTimers();

        expect(ids(target)).toEqual(['b1', 'b2']);
    });

    test('a chip released over a tab of another group moves its tab group there', async () => {
        const { source, target } = setup();
        // Source strip: [chip 0-40][a1 40-140][a2 140-240]
        await createTabGroup(source, ['a1'], 0);
        hitTest([source, target]);

        // Release over b2 (600-700).
        startDrag(chip(source), 20, 650);
        fireEvent.pointerUp(window, pointer(651));
        jest.runAllTimers();
        await Promise.resolve();

        expect(ids(source)).toEqual(['a2']);
        expect(ids(target)).toContain('a1');
        expect(target.model.getTabGroupForPanel('a1')).toBeDefined();
        expect(dockview.groups).toHaveLength(2);
        for (const tab of tabs(target)) {
            expect(tab.style.marginLeft).toBe('');
        }
    });

    test('a cancelled chip drag over another group moves nothing', async () => {
        const { source, target } = setup();
        await createTabGroup(source, ['a1'], 0);
        hitTest([source, target]);

        startDrag(chip(source), 20, 650);
        fireEvent.pointerCancel(window, pointer(651));
        jest.runAllTimers();
        await Promise.resolve();

        expect(ids(source)).toEqual(['a1', 'a2']);
        expect(ids(target)).toEqual(['b1', 'b2']);
    });
});
