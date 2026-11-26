import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { DockviewPanel } from '../../dockview/dockviewPanel';

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

function createDockview(
    options: Partial<ConstructorParameters<typeof DockviewComponent>[1]> = {}
): DockviewComponent {
    const container = document.createElement('div');
    const dockview = new DockviewComponent(container, {
        createComponent: () => new TestPanel(),
        ...options,
    });
    dockview.layout(1000, 600);
    return dockview;
}

/** One group holding p1, p2, p3 (p3 active, added last). */
function threePanels(dockview: DockviewComponent) {
    const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
    const p2 = dockview.addPanel({ id: 'p2', component: 'default' });
    const p3 = dockview.addPanel({ id: 'p3', component: 'default' });
    return { p1, p2, p3, group: p1.group };
}

/** Panel ids with a tab in the group's strip, in strip order. */
function tabIds(dockview: DockviewComponent, groupId: string): string[] {
    const group = dockview.getPanel(groupId)!;
    return Array.from(
        group.element.querySelectorAll<HTMLElement>('.dv-tab')
    ).map((el) => el.dataset.tabPanelId!);
}

function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * `panel.api.setHidden` parks a panel in its group: it keeps its slot, params
 * and membership but has no tab and can't be active, so it can be brought back
 * later without re-adding it (#1186).
 */
describe('hidden panels', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {
            // silence
        });
    });

    afterEach(() => {
        warn.mockRestore();
    });

    describe('state', () => {
        test('panels start shown and serialize without a hidden key', () => {
            const dockview = createDockview();
            const { p1 } = threePanels(dockview);

            expect(p1.api.isHidden).toBe(false);
            expect(p1.toJSON().hidden).toBeUndefined();
            expect('hidden' in JSON.parse(JSON.stringify(p1.toJSON()))).toBe(
                false
            );
        });

        test('setHidden flips isHidden and serializes hidden: true', () => {
            const dockview = createDockview();
            const { p1 } = threePanels(dockview);

            p1.api.setHidden(true);

            expect(p1.api.isHidden).toBe(true);
            expect(p1.toJSON().hidden).toBe(true);

            p1.api.setHidden(false);

            expect(p1.api.isHidden).toBe(false);
            expect(p1.toJSON().hidden).toBeUndefined();
        });

        test('a hidden panel stays listed in its group and the component', () => {
            const dockview = createDockview();
            const { p2, group } = threePanels(dockview);

            p2.api.setHidden(true);

            expect(group.panels).toContain(p2);
            expect(group.model.visiblePanels.map((p) => p.id)).toEqual([
                'p1',
                'p3',
            ]);
            expect(dockview.panels).toContain(p2);
            expect(dockview.getGroupPanel('p2')).toBe(p2);
            expect(p2.group).toBe(group);
        });
    });

    describe('events', () => {
        test('fires panel and component events once per transition', () => {
            const dockview = createDockview();
            const { p1 } = threePanels(dockview);

            const panelEvents: boolean[] = [];
            const componentEvents: { id: string; isHidden: boolean }[] = [];
            p1.api.onDidHiddenChange((e) => panelEvents.push(e.isHidden));
            dockview.onDidPanelHiddenChange((e) =>
                componentEvents.push({ id: e.panel.id, isHidden: e.isHidden })
            );

            p1.api.setHidden(true);
            p1.api.setHidden(true); // no-op
            p1.api.setHidden(false);
            p1.api.setHidden(false); // no-op

            expect(panelEvents).toEqual([true, false]);
            expect(componentEvents).toEqual([
                { id: 'p1', isHidden: true },
                { id: 'p1', isHidden: false },
            ]);
        });

        test('is exposed on DockviewApi', () => {
            const dockview = createDockview();
            const { p1 } = threePanels(dockview);

            const events: boolean[] = [];
            dockview.api.onDidPanelHiddenChange((e) => events.push(e.isHidden));

            p1.api.setHidden(true);

            expect(events).toEqual([true]);
        });

        test('hiding fires onDidLayoutChange so the layout can be saved', async () => {
            const dockview = createDockview();
            const { p1 } = threePanels(dockview);
            await flush();

            let count = 0;
            dockview.onDidLayoutChange(() => count++);

            p1.api.setHidden(true);
            await flush();

            expect(count).toBe(1);
        });

        test('hiding the active panel reports it no longer visible', () => {
            const dockview = createDockview();
            const { p3 } = threePanels(dockview);

            expect(p3.api.isVisible).toBe(true);

            const visibility: boolean[] = [];
            p3.api.onDidVisibilityChange((e) => visibility.push(e.isVisible));

            p3.api.setHidden(true);

            expect(visibility).toEqual([false]);
            expect(p3.api.isVisible).toBe(false);
            expect(p3.api.isActive).toBe(false);
        });
    });

    describe('tab strip', () => {
        test('hiding removes the tab and showing restores it in place', () => {
            const dockview = createDockview();
            const { p2, group } = threePanels(dockview);

            expect(tabIds(dockview, group.id)).toEqual(['p1', 'p2', 'p3']);

            p2.api.setHidden(true);
            expect(tabIds(dockview, group.id)).toEqual(['p1', 'p3']);

            p2.api.setHidden(false);
            expect(tabIds(dockview, group.id)).toEqual(['p1', 'p2', 'p3']);
        });

        test('showing the first panel puts its tab first', () => {
            const dockview = createDockview();
            const { p1, group } = threePanels(dockview);

            p1.api.setHidden(true);
            p1.api.setHidden(false);

            expect(tabIds(dockview, group.id)).toEqual(['p1', 'p2', 'p3']);
        });

        test('showing a panel after hidden neighbours skips them in the strip', () => {
            const dockview = createDockview();
            const { p1, p2, p3, group } = threePanels(dockview);

            p1.api.setHidden(true);
            p2.api.setHidden(true);
            p3.api.setHidden(true);
            expect(tabIds(dockview, group.id)).toEqual([]);

            p3.api.setHidden(false);
            expect(tabIds(dockview, group.id)).toEqual(['p3']);

            p2.api.setHidden(false);
            expect(tabIds(dockview, group.id)).toEqual(['p2', 'p3']);
        });

        test('a tab-group reorder does not resurrect a hidden tab or drop a visible one', () => {
            const dockview = createDockview();
            const { p2, group } = threePanels(dockview);

            p2.api.setHidden(true);

            // Grouping p3 with p1 rebuilds the whole strip from `_panels`.
            const tabGroup = group.model.createTabGroup({ label: 'tg' });
            tabGroup.addPanel('p3');
            tabGroup.addPanel('p1');

            expect(group.panels.map((p) => p.id)).toContain('p2');
            expect(tabIds(dockview, group.id).sort()).toEqual(['p1', 'p3']);
        });

        test('closing a hidden panel removes it without touching other tabs', () => {
            const dockview = createDockview();
            const { p2, group } = threePanels(dockview);

            p2.api.setHidden(true);
            p2.api.close();

            expect(group.panels.map((p) => p.id)).toEqual(['p1', 'p3']);
            expect(tabIds(dockview, group.id)).toEqual(['p1', 'p3']);
            expect(dockview.groups).toContain(group);
        });
    });

    describe('active panel', () => {
        test('hiding an inactive panel leaves the active panel alone', () => {
            const dockview = createDockview();
            const { p1, p3, group } = threePanels(dockview);

            p1.api.setHidden(true);

            expect(group.activePanel).toBe(p3);
        });

        test('hiding the active panel activates the most recently used visible panel', () => {
            const dockview = createDockview();
            const { p1, p2, p3, group } = threePanels(dockview);

            p1.api.setActive();
            p3.api.setActive();
            expect(group.activePanel).toBe(p3);

            p3.api.setHidden(true);

            expect(group.activePanel).toBe(p1);
            expect(p1.api.isActive).toBe(true);
            expect(p2.api.isActive).toBe(false);
        });

        test('the MRU fallback skips hidden panels', () => {
            const dockview = createDockview();
            const { p1, p2, p3, group } = threePanels(dockview);

            p1.api.setActive();
            p3.api.setActive();
            p1.api.setHidden(true);

            p3.api.setHidden(true);

            expect(group.activePanel).toBe(p2);
        });

        test('hiding the last visible panel shows the watermark and keeps the group', () => {
            const dockview = createDockview();
            const { p1, p2, p3, group } = threePanels(dockview);

            p1.api.setHidden(true);
            p2.api.setHidden(true);
            p3.api.setHidden(true);

            expect(group.activePanel).toBeUndefined();
            expect(group.model.hasWatermark).toBe(true);
            expect(dockview.groups).toContain(group);
            expect(dockview.totalPanels).toBe(3);
        });

        test('showing a panel into an empty-looking group activates it', () => {
            const dockview = createDockview();
            const { p1, p2, p3, group } = threePanels(dockview);

            p1.api.setHidden(true);
            p2.api.setHidden(true);
            p3.api.setHidden(true);

            p2.api.setHidden(false);

            expect(group.activePanel).toBe(p2);
            expect(p2.api.isVisible).toBe(true);
            expect(group.model.hasWatermark).toBe(false);
        });

        test('showing a panel next to an active one does not steal activation', () => {
            const dockview = createDockview();
            const { p1, p3, group } = threePanels(dockview);

            p1.api.setHidden(true);
            p1.api.setHidden(false);

            expect(group.activePanel).toBe(p3);
            expect(p1.api.isVisible).toBe(false);
        });

        test('setActive on a hidden panel is a no-op that warns', () => {
            const dockview = createDockview();
            const { p1, p3, group } = threePanels(dockview);

            p1.api.setHidden(true);
            p1.api.setActive();

            expect(group.activePanel).toBe(p3);
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining("cannot activate hidden panel 'p1'")
            );
        });

        test('component.setActivePanel on a hidden panel is a no-op', () => {
            const dockview = createDockview();
            const { p1, p3, group } = threePanels(dockview);

            p1.api.setHidden(true);
            dockview.setActivePanel(p1);

            expect(group.activePanel).toBe(p3);
        });

        test('hiding the active panel fires the component-level active panel change', () => {
            const dockview = createDockview();
            const { p1, p3 } = threePanels(dockview);

            p1.api.setActive();
            p3.api.setActive();

            const seen: (string | undefined)[] = [];
            dockview.onDidActivePanelChange((e) => seen.push(e.panel?.id));
            // the event replays its current value ('p3') on subscription
            seen.length = 0;

            p3.api.setHidden(true);

            expect(seen).toEqual(['p1']);
            expect(dockview.activePanel).toBe(p1);
        });

        test('closing the active panel when every sibling is hidden clears the active panel', () => {
            const dockview = createDockview();
            const { p1, p2, p3, group } = threePanels(dockview);

            p1.api.setHidden(true);
            p2.api.setHidden(true);

            p3.api.close();

            expect(group.panels.map((p) => p.id)).toEqual(['p1', 'p2']);
            expect(group.activePanel).toBeUndefined();
            expect(dockview.activePanel).toBeUndefined();
            expect(group.model.hasWatermark).toBe(true);
            expect(dockview.groups).toContain(group);
        });

        test('closing the active panel falls back to a visible sibling, not a hidden one', () => {
            const dockview = createDockview();
            const { p1, p2, p3, group } = threePanels(dockview);

            p2.api.setActive();
            p3.api.setActive();
            p2.api.setHidden(true);

            p3.api.close();

            expect(group.activePanel).toBe(p1);
        });
    });

    describe('navigation', () => {
        test('moveToNext and moveToPrevious step over hidden panels', () => {
            const dockview = createDockview();
            const { p1, p2, p3, group } = threePanels(dockview);

            p2.api.setHidden(true);
            p1.api.setActive();

            group.model.moveToNext();
            expect(group.activePanel).toBe(p3);

            group.model.moveToNext();
            expect(group.activePanel).toBe(p1);

            group.model.moveToPrevious();
            expect(group.activePanel).toBe(p3);
        });

        test('activateNext with includePanel treats the last visible panel as the edge', () => {
            const dockview = createDockview();
            const { p1, p2, p3, group } = threePanels(dockview);

            p3.api.setHidden(true);
            p1.api.setActive();

            dockview.activateNext({ includePanel: true });
            expect(group.activePanel).toBe(p2);

            // p2 is the last visible panel: no roll-over within the group
            dockview.activateNext({ includePanel: true });
            expect(group.activePanel).toBe(p2);
        });

        test('activatePrevious with includePanel treats the first visible panel as the edge', () => {
            const dockview = createDockview();
            const { p1, p2, p3, group } = threePanels(dockview);

            p1.api.setHidden(true);
            p3.api.setActive();

            dockview.activatePrevious({ includePanel: true });
            expect(group.activePanel).toBe(p2);

            dockview.activatePrevious({ includePanel: true });
            expect(group.activePanel).toBe(p2);
        });
    });

    describe('serialization', () => {
        test('round-trips the hidden flag and keeps the hidden panel out of the strip', () => {
            const source = createDockview();
            const { p2 } = threePanels(source);
            p2.api.setHidden(true);

            const state = JSON.parse(JSON.stringify(source.toJSON()));
            expect(state.panels.p2.hidden).toBe(true);
            expect('hidden' in state.panels.p1).toBe(false);

            const target = createDockview();
            target.fromJSON(state);

            const restored = target.getGroupPanel('p2')!;
            expect(restored.api.isHidden).toBe(true);
            expect(restored.group.panels.map((p) => p.id)).toEqual([
                'p1',
                'p2',
                'p3',
            ]);
            expect(tabIds(target, restored.group.id)).toEqual(['p1', 'p3']);
            expect(restored.group.activePanel?.id).toBe('p3');
        });

        test('restoring a group whose saved active panel is hidden activates a visible one', () => {
            const source = createDockview();
            const { p3 } = threePanels(source);
            p3.api.setHidden(true);

            const state = JSON.parse(JSON.stringify(source.toJSON()));
            // force a stale activeView, as a layout saved before hiding would have
            state.grid.root.data.activeView = 'p3';

            const target = createDockview();
            target.fromJSON(state);

            const group = target.getGroupPanel('p3')!.group;
            expect(group.activePanel?.id).toBe('p2');
            expect(group.activePanel?.api.isHidden).toBe(false);
        });

        test('a fully hidden group restores with the watermark and no active panel', () => {
            const source = createDockview();
            const { p1, p2, p3 } = threePanels(source);
            p1.api.setHidden(true);
            p2.api.setHidden(true);
            p3.api.setHidden(true);

            const target = createDockview();
            target.fromJSON(JSON.parse(JSON.stringify(source.toJSON())));

            const group = target.getGroupPanel('p1')!.group;
            expect(group.panels).toHaveLength(3);
            expect(group.activePanel).toBeUndefined();
            expect(group.model.hasWatermark).toBe(true);
        });

        test('fromJSON with reuseExistingPanels applies the saved hidden flag', () => {
            const dockview = createDockview();
            const { p2, group } = threePanels(dockview);

            const state = JSON.parse(JSON.stringify(dockview.toJSON()));
            state.panels.p2.hidden = true;

            dockview.fromJSON(state, { reuseExistingPanels: true });

            const restored = dockview.getGroupPanel('p2') as DockviewPanel;
            expect(restored).toBe(p2);
            expect(restored.api.isHidden).toBe(true);
            expect(tabIds(dockview, restored.group.id)).toEqual(['p1', 'p3']);
            expect(dockview.groups).not.toContain(group);
        });

        test('fromJSON with reuseExistingPanels can show a previously hidden panel', () => {
            const dockview = createDockview();
            const { p2 } = threePanels(dockview);
            p2.api.setHidden(true);

            const state = JSON.parse(JSON.stringify(dockview.toJSON()));
            delete state.panels.p2.hidden;

            dockview.fromJSON(state, { reuseExistingPanels: true });

            const restored = dockview.getGroupPanel('p2')!;
            expect(restored.api.isHidden).toBe(false);
            expect(tabIds(dockview, restored.group.id)).toEqual([
                'p1',
                'p2',
                'p3',
            ]);
        });
    });

    describe('moving', () => {
        test('a hidden panel moved to another group arrives hidden and without a tab', () => {
            const dockview = createDockview();
            const { p1, p2 } = threePanels(dockview);
            const p4 = dockview.addPanel({
                id: 'p4',
                component: 'default',
                position: { referencePanel: 'p1', direction: 'right' },
            });

            p2.api.setHidden(true);
            p2.api.moveTo({ group: p4.group });

            expect(p2.group).toBe(p4.group);
            expect(p2.api.isHidden).toBe(true);
            expect(tabIds(dockview, p4.group.id)).toEqual(['p4']);
            expect(p4.group.activePanel).toBe(p4);
            expect(p2.toJSON().hidden).toBe(true);
        });

        test('a hidden panel moved out of a group leaves the remaining tabs intact', () => {
            const dockview = createDockview();
            const { p1, p2, group } = threePanels(dockview);
            const p4 = dockview.addPanel({
                id: 'p4',
                component: 'default',
                position: { referencePanel: 'p1', direction: 'right' },
            });

            p2.api.setHidden(true);
            p2.api.moveTo({ group: p4.group });

            expect(tabIds(dockview, group.id)).toEqual(['p1', 'p3']);
            expect(group.panels.map((p) => p.id)).toEqual(['p1', 'p3']);
        });

        test('showing a panel after it moved groups puts its tab in that group', () => {
            const dockview = createDockview();
            const { p1, p2 } = threePanels(dockview);
            const p4 = dockview.addPanel({
                id: 'p4',
                component: 'default',
                position: { referencePanel: 'p1', direction: 'right' },
            });

            p2.api.setHidden(true);
            p2.api.moveTo({ group: p4.group, index: 0 });
            p2.api.setHidden(false);

            expect(tabIds(dockview, p4.group.id)).toEqual(['p2', 'p4']);
            expect(p4.group.activePanel).toBe(p4);
        });
    });
});
