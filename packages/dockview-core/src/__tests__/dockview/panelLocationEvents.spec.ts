import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { DockviewPanel } from '../../dockview/dockviewPanel';
import { IDockviewPanel } from '../../dockview/dockviewPanel';
import { DockviewGroupLocation } from '../../dockview/dockviewGroupPanelModel';
import { IContentRenderer } from '../../dockview/types';
import { setupMockWindow } from '../__mocks__/mockWindow';

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

/**
 * `panel.api.onDidLocationChange` must report where the panel *is*, never an
 * intermediate location it passes through while a relocation is in flight.
 *
 * Relocating a panel touches its location twice - it is reparented into the
 * destination group, then that group is tagged with the location it ends up at
 * - so the event is coalesced to the end of the enclosing layout mutation.
 * That must not become a comparison against the previous location: several of
 * the moves below keep the location *type* and change only the window (or edge
 * position) the panel lives in, and the event is the only signal a consumer -
 * `OverlayRenderContainer` included - gets for those.
 */
describe('onDidLocationChange', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;

    beforeEach(() => {
        window.open = () => setupMockWindow();
        container = document.createElement('div');
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
        });
        dockview.layout(1000, 1000);
    });

    afterEach(() => dockview.dispose());

    function record(panel: IDockviewPanel): DockviewGroupLocation[] {
        const locations: DockviewGroupLocation[] = [];
        panel.api.onDidLocationChange((event) =>
            locations.push(event.location)
        );
        return locations;
    }

    test('extracting a panel into a floating window reports floating once', () => {
        dockview.addPanel({ id: 'panel1', component: 'default' });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const locations = record(panel2);

        dockview.addFloatingGroup(panel2 as DockviewPanel, {
            inDragMode: true,
        });

        // no phantom `grid`: the group the panel lands in is only reported once
        // it knows it lives in a floating window
        expect(locations.map((location) => location.type)).toEqual([
            'floating',
        ]);
    });

    test('the panel is in the layout when its location is reported', () => {
        dockview.addPanel({ id: 'panel1', component: 'default' });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        // mid-extraction the panel belongs to neither the source nor the
        // destination group, so an event fired then is missing from
        // `api.panels` and unusable for mirroring the layout
        const panels: string[][] = [];
        panel2.api.onDidLocationChange(() =>
            panels.push(dockview.panels.map((panel) => panel.id))
        );

        dockview.addFloatingGroup(panel2 as DockviewPanel, {
            inDragMode: true,
        });

        expect(panels).toEqual([['panel1', 'panel2']]);
    });

    test('extracting a panel into a popout window reports popout once', async () => {
        dockview.addPanel({ id: 'panel1', component: 'default' });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const locations = record(panel2);

        await dockview.addPopoutGroup(panel2 as DockviewPanel);

        expect(locations.map((location) => location.type)).toEqual(['popout']);
    });

    /**
     * The remaining extractions start somewhere other than the grid. Comparing
     * the destination group against a `grid` placeholder would suppress the
     * phantom only when the panel came from the grid; these cover the rest.
     */
    test('extracting a panel out of a floating group into a floating window reports floating once', () => {
        dockview.addPanel({ id: 'panel1', component: 'default' });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        const panel3 = dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });

        dockview.addFloatingGroup(panel2 as DockviewPanel);
        dockview.moveGroupOrPanel({
            from: { groupId: panel3.group.id, panelId: 'panel3' },
            to: { group: panel2.group, position: 'center' },
        });
        expect(panel3.api.location.type).toBe('floating');

        const locations = record(panel3);

        dockview.addFloatingGroup(panel3 as DockviewPanel, {
            inDragMode: true,
        });

        // the type is unchanged but the window is not, so the event still has
        // to fire - exactly once
        expect(locations.map((location) => location.type)).toEqual([
            'floating',
        ]);
    });

    test('extracting a panel out of a floating group into a popout window reports popout once', async () => {
        dockview.addPanel({ id: 'panel1', component: 'default' });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        const panel3 = dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });

        dockview.addFloatingGroup(panel2 as DockviewPanel);
        dockview.moveGroupOrPanel({
            from: { groupId: panel3.group.id, panelId: 'panel3' },
            to: { group: panel2.group, position: 'center' },
        });
        expect(panel3.api.location.type).toBe('floating');

        const locations = record(panel3);

        await dockview.addPopoutGroup(panel3 as DockviewPanel);

        expect(locations.map((location) => location.type)).toEqual(['popout']);
    });

    test('moving a panel between two popout windows reports popout once', async () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { direction: 'right' },
        });
        const panel3 = dockview.addPanel({
            id: 'panel3',
            component: 'default',
            position: { referencePanel: 'panel1' },
        });

        await dockview.addPopoutGroup(panel1.group);
        await dockview.addPopoutGroup(panel2.group);

        const windowB = panel2.api.getWindow();
        expect(panel3.api.getWindow()).not.toBe(windowB);

        const locations = record(panel3);

        dockview.moveGroupOrPanel({
            from: { groupId: panel3.group.id, panelId: 'panel3' },
            to: { group: panel2.group, position: 'center' },
        });

        // same location type, different window: a consumer tracking which
        // window renders the panel has nothing else to go on
        expect(locations.map((location) => location.type)).toEqual(['popout']);
        expect(panel3.api.getWindow()).toBe(windowB);
    });

    test('moving a panel between two edge groups reports the new edge position', () => {
        dockview.addEdgeGroup('left', { id: 'left-group' });
        dockview.addEdgeGroup('right', { id: 'right-group' });
        const leftGroup = dockview.groups.find((g) => g.id === 'left-group')!;
        const rightGroup = dockview.groups.find((g) => g.id === 'right-group')!;

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        panel1.api.moveTo({ group: leftGroup });
        expect(panel1.api.location.type).toBe('edge');

        const locations = record(panel1);

        panel1.api.moveTo({ group: rightGroup });

        expect(locations).toEqual([{ type: 'edge', position: 'right' }]);
    });

    test('floating a whole group reports floating once per panel', () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const first = record(panel1);
        const second = record(panel2);

        dockview.addFloatingGroup(panel1.group);

        expect(first.map((location) => location.type)).toEqual(['floating']);
        expect(second.map((location) => location.type)).toEqual(['floating']);
    });

    test('floating a popped-out group back into the host window reports floating once', async () => {
        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        dockview.addPanel({ id: 'panel2', component: 'default' });

        await dockview.addPopoutGroup(panel1.group);
        const popoutGroup = panel1.group;

        const locations = record(panel1);

        // the panels are rehomed into the reference group the popout left in
        // the grid, which is then floated - a `grid` group holding them for the
        // duration of the operation
        dockview.addFloatingGroup(popoutGroup);

        expect(locations.map((location) => location.type)).toEqual([
            'floating',
        ]);
    });

    /**
     * Regression guard for the reverted dedupe-by-value fix. Moving a group
     * from one floating window to another is `floating` -> `floating`, and
     * `OverlayRenderContainer.correctLayerPosition` resolves an `always`
     * rendered panel's z-index from the window that hosts its group. Suppress
     * the event and the panel keeps the *old* window's aria-level and renders
     * behind the new one.
     */
    test('a group moved between floating windows re-resolves its panels z-index', async () => {
        const local = new DockviewComponent(document.createElement('div'), {
            createComponent: () => new TestPanel(),
            defaultRenderer: 'always',
        });
        local.layout(1000, 1000);

        try {
            const panel1 = local.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = local.addPanel({
                id: 'panel2',
                component: 'default',
                position: { direction: 'right' },
            });
            const panel3 = local.addPanel({
                id: 'panel3',
                component: 'default',
                position: { direction: 'below' },
            });

            const anchorA: DockviewGroupPanel = panel1.group;
            const movedGroup: DockviewGroupPanel = panel2.group;
            const anchorB: DockviewGroupPanel = panel3.group;

            // window A hosts two groups so it survives the move below
            local.addFloatingGroup(anchorA);
            local.moveGroup({
                from: { group: movedGroup },
                to: { group: anchorA, position: 'right' },
            });
            local.addFloatingGroup(anchorB);

            const locations = record(panel2);

            local.moveGroup({
                from: { group: movedGroup },
                to: { group: anchorB, position: 'right' },
            });
            // correctLayerPosition defers to a microtask
            await Promise.resolve();

            expect(local.getFloatingWindowForGroup(anchorA)).toBeTruthy();
            expect(locations.map((location) => location.type)).toEqual([
                'floating',
            ]);

            const windowB = local.getFloatingWindowForGroup(anchorB)!;
            const level = Number(
                windowB.overlay.element.getAttribute('aria-level')
            );
            expect(level).toBeGreaterThan(0);

            const overlay = panel2.view.content.element.parentElement!;
            expect(overlay.style.zIndex).toBe(
                `calc(var(--dv-overlay-z-index, 999) + ${level * 2 + 1})`
            );
        } finally {
            local.dispose();
        }
    });
});
