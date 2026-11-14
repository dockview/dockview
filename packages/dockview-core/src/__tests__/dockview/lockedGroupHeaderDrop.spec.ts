import { fireEvent } from '@testing-library/dom';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { DockviewGroupPanelLocked } from '../../dockview/dockviewGroupPanelModel';
import { IContentRenderer } from '../../dockview/types';
import { LocalSelectionTransfer, PanelTransfer } from '../../dnd/dataTransfer';

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

function rect(left: number, width: number): DOMRect {
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
 * A locked group takes no new panels from a user drop on its header. These
 * drive the HTML5 tabs-list `drop`, which commits a drop on the strip itself
 * (in smooth mode for tabs and chips, in every mode for chips).
 */
describe('locked group: HTML5 drop on the tab strip', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;

    function create(tabAnimation: 'smooth' | 'default'): void {
        container = document.createElement('div');
        document.body.appendChild(container);
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            dndStrategy: 'html5',
            theme: { name: 'test', className: 'test', tabAnimation },
        });
        dockview.layout(1000, 500);
    }

    afterEach(() => {
        LocalSelectionTransfer.getInstance<PanelTransfer>().clearData(
            PanelTransfer.prototype
        );
        dockview.dispose();
        container.remove();
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
        return {
            source: dockview.getGroupPanel('a1')!.group,
            target: dockview.getGroupPanel('b1')!.group,
        };
    }

    function list(group: DockviewGroupPanel): HTMLElement {
        return group.element.querySelector('.dv-tabs-container') as HTMLElement;
    }

    /** Drag `transfer` over `group`'s strip and drop it past the last tab. */
    function dropOnStrip(group: DockviewGroupPanel, transfer: PanelTransfer) {
        const strip = list(group);
        const tabs = Array.from(strip.querySelectorAll('.dv-tab'));
        tabs.forEach((tab, i) =>
            jest
                .spyOn(tab, 'getBoundingClientRect')
                .mockReturnValue(rect(i * TAB_WIDTH, TAB_WIDTH))
        );
        jest.spyOn(strip, 'getBoundingClientRect').mockReturnValue(
            rect(0, tabs.length * TAB_WIDTH + 100)
        );

        LocalSelectionTransfer.getInstance<PanelTransfer>().setData(
            [transfer],
            PanelTransfer.prototype
        );

        const at = { clientX: tabs.length * TAB_WIDTH + 50, clientY: 10 };
        fireEvent.dragEnter(strip, at);
        fireEvent.dragOver(strip, at);
        fireEvent.drop(strip, at);
    }

    const ids = (group: DockviewGroupPanel) =>
        group.model.panels.map((p) => p.id);

    async function groupA1(source: DockviewGroupPanel): Promise<string> {
        const tg = dockview.api.createTabGroup({ groupId: source.id });
        dockview.api.addPanelToTabGroup({
            groupId: source.id,
            tabGroupId: tg.id,
            panelId: 'a1',
        });
        await Promise.resolve();
        return tg.id;
    }

    const cases: {
        name: string;
        tabAnimation: 'smooth' | 'default';
        chip: boolean;
    }[] = [
        { name: 'a tab (smooth)', tabAnimation: 'smooth', chip: false },
        { name: 'a chip (smooth)', tabAnimation: 'smooth', chip: true },
        { name: 'a chip (default)', tabAnimation: 'default', chip: true },
    ];

    describe.each(cases)('$name from another group', (c) => {
        async function run(locked: DockviewGroupPanelLocked) {
            create(c.tabAnimation);
            const { source, target } = setup();
            target.locked = locked;
            const tabGroupId = c.chip ? await groupA1(source) : undefined;

            dropOnStrip(
                target,
                c.chip
                    ? new PanelTransfer(
                          dockview.id,
                          source.id,
                          null,
                          tabGroupId
                      )
                    : new PanelTransfer(dockview.id, source.id, 'a1')
            );
            await Promise.resolve();

            return { source, target };
        }

        test('moves into an unlocked group (control)', async () => {
            const { target } = await run(false);
            expect(ids(target)).toContain('a1');
        });

        test.each([
            true,
            'no-drop-target',
        ] as const)('is refused by a group locked with %p', async (locked) => {
            const { source, target } = await run(locked);
            expect(ids(source)).toEqual(['a1', 'a2']);
            expect(ids(target)).toEqual(['b1', 'b2']);
        });
    });

    // Second line of defence, below the strip: the commits a header drop
    // reaches refuse a locked target themselves.
    describe('commit guards', () => {
        beforeEach(() => create('smooth'));

        function stripOf(group: DockviewGroupPanel) {
            return (group.model as any).tabsContainer.tabs;
        }

        test('a header drop from another group is refused', () => {
            const { source, target } = setup();
            target.locked = true;
            LocalSelectionTransfer.getInstance<PanelTransfer>().setData(
                [new PanelTransfer(dockview.id, source.id, 'a1')],
                PanelTransfer.prototype
            );

            stripOf(target).fireDrop({
                event: new PointerEvent('pointerup'),
                index: 0,
                targetTabGroupId: null,
            });

            expect(ids(source)).toEqual(['a1', 'a2']);
            expect(ids(target)).toEqual(['b1', 'b2']);
        });

        test('a header drop from the same group still reorders', () => {
            const { target } = setup();
            target.locked = true;
            LocalSelectionTransfer.getInstance<PanelTransfer>().setData(
                [new PanelTransfer(dockview.id, target.id, 'b2')],
                PanelTransfer.prototype
            );

            stripOf(target).fireDrop({
                event: new PointerEvent('pointerup'),
                index: 0,
                targetTabGroupId: null,
            });

            expect(ids(target)).toEqual(['b2', 'b1']);
        });

        test('a tab group from another group is refused', async () => {
            const { source, target } = setup();
            const tabGroupId = await groupA1(source);
            target.locked = true;
            LocalSelectionTransfer.getInstance<PanelTransfer>().setData(
                [new PanelTransfer(dockview.id, source.id, null, tabGroupId)],
                PanelTransfer.prototype
            );

            stripOf(target)._reorder.commitGroupMove(tabGroupId, 0);
            await Promise.resolve();

            expect(ids(source)).toEqual(['a1', 'a2']);
            expect(ids(target)).toEqual(['b1', 'b2']);
        });
    });
});
