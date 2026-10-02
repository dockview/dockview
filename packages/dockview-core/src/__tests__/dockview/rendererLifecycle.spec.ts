import { fireEvent } from '@testing-library/dom';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewComponentOptions } from '../../dockview/options';
import { setupDeferredMockWindow } from '../__mocks__/mockWindow';
import { exhaustMicrotaskQueue } from '../__test_utils__/utils';
import {
    createRendererTracker,
    RendererTracker,
} from '../__test_utils__/rendererTracker';

/**
 * Every framework renderer dockview creates must be disposed by the time the
 * panel, group or component that owns it goes away. A renderer that is never
 * disposed is a leak: with a framework binding it is a component that stays
 * mounted, effects included, until the page reloads.
 *
 * Each test drives a public API sequence, then asserts on the live renderer
 * counts — while the layout is alive where the expected count is known, and
 * always zero after `dispose()`.
 */
describe('renderer lifecycle', () => {
    let tracker: RendererTracker;
    let dockview: DockviewComponent;

    function create(options?: Partial<DockviewComponentOptions>) {
        dockview = new DockviewComponent(document.createElement('div'), {
            ...tracker.options,
            ...options,
        });
        dockview.layout(1000, 800);
        return dockview;
    }

    function groupIds() {
        return dockview.groups.map((group) => group.id);
    }

    function expectNothingAliveAfterDispose() {
        dockview.dispose();
        expect(tracker.snapshot()).toEqual({
            content: 0,
            tab: 0,
            watermark: 0,
            headerAction: 0,
            contextMenuItem: 0,
        });
    }

    beforeEach(() => {
        tracker = createRendererTracker();
    });

    describe('baseline', () => {
        test('adding and removing panels and groups', () => {
            create();
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            const p2 = dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });
            dockview.addPanel({ id: 'p3', component: 'default' });

            expect(tracker.alive('content')).toBe(3);
            expect(tracker.alive('tab')).toBe(3);
            expect(tracker.alive('headerAction')).toBe(2);

            dockview.removePanel(p1);
            dockview.removeGroup(p2.group);

            expect(dockview.groups).toHaveLength(0);
            expect(tracker.alive('content')).toBe(0);
            expect(tracker.alive('tab')).toBe(0);
            expect(tracker.alive('headerAction')).toBe(0);
            // only the dockview-level watermark
            expect(tracker.alive('watermark')).toBe(1);

            expectNothingAliveAfterDispose();
        });

        test('moving panels between groups, floating and back', () => {
            create();
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            const p2 = dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });

            p2.api.moveTo({ group: p1.group, position: 'center' });
            expect(dockview.groups).toHaveLength(1);

            dockview.addFloatingGroup(p2);
            p2.api.moveTo({ group: p1.group, position: 'right' });

            expect(dockview.groups).toHaveLength(2);
            expect(tracker.alive('content')).toBe(2);
            expect(tracker.alive('tab')).toBe(2);
            expect(tracker.alive('headerAction')).toBe(2);
            expect(tracker.alive('watermark')).toBe(0);

            expectNothingAliveAfterDispose();
        });

        test('clear() and fromJSON()', () => {
            create();
            dockview.addPanel({ id: 'p1', component: 'default' });
            dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'below' },
            });
            const json = dockview.toJSON();

            dockview.clear();
            expect(tracker.alive('content')).toBe(0);
            expect(tracker.alive('headerAction')).toBe(0);

            dockview.fromJSON(json);
            dockview.fromJSON(json);
            expect(tracker.alive('content')).toBe(2);
            expect(tracker.alive('tab')).toBe(2);
            expect(tracker.alive('headerAction')).toBe(2);

            expectNothingAliveAfterDispose();
        });
    });

    describe('moving into the centre of the source group', () => {
        test('panel.api.moveTo({ index }) on the only panel keeps it', () => {
            create();
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });

            p1.api.moveTo({ index: 0 });

            expect(dockview.groups).toHaveLength(1);
            expect(dockview.panels.map((p) => p.id)).toEqual(['p1']);
            expect(p1.group.model.isDisposed).toBe(false);
            expect(groupIds()).toContain(p1.group.id);

            expectNothingAliveAfterDispose();
        });

        test('panel.api.moveTo its own group centre keeps it', () => {
            create();
            dockview.addPanel({ id: 'p1', component: 'default' });
            const p2 = dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });
            const group = p2.group;

            p2.api.moveTo({ group, position: 'center' });

            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels.map((p) => p.id).sort()).toEqual([
                'p1',
                'p2',
            ]);
            expect(p2.group.id).toBe(group.id);
            expect(group.model.isDisposed).toBe(false);

            expectNothingAliveAfterDispose();
        });

        test('group.api.moveTo its own centre keeps its panels', () => {
            create();
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            dockview.addPanel({ id: 'p2', component: 'default' });
            const group = p1.group;

            group.api.moveTo({ group, position: 'center' });

            expect(groupIds()).toEqual([group.id]);
            expect(group.model.isDisposed).toBe(false);
            expect(dockview.panels.map((p) => p.id)).toEqual(['p1', 'p2']);

            expectNothingAliveAfterDispose();
        });

        test('moveGroup into its own centre keeps its panels', () => {
            create();
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            const group = p1.group;

            dockview.moveGroup({
                from: { group },
                to: { group, position: 'center' },
            });

            expect(groupIds()).toEqual([group.id]);
            expect(group.model.isDisposed).toBe(false);
            expect(dockview.panels.map((p) => p.id)).toEqual(['p1']);

            expectNothingAliveAfterDispose();
        });
    });

    describe('removing the active group without re-activating', () => {
        function arrange() {
            create();
            const a = dockview.addPanel({ id: 'a', component: 'default' });
            const b = dockview.addPanel({
                id: 'b',
                component: 'default',
                position: { direction: 'right' },
            });
            a.api.setActive();
            expect(dockview.activeGroup?.id).toBe(a.group.id);
            return { a, b };
        }

        function expectNextPanelLandsInALiveGroup() {
            expect(dockview.activeGroup?.model.isDisposed ?? false).toBe(false);
            const c = dockview.addPanel({ id: 'c', component: 'default' });
            expect(c.group.model.isDisposed).toBe(false);
            expect(dockview.panels.map((p) => p.id)).toContain('c');
            expect(groupIds()).toContain(c.group.id);
        }

        test('moveTo with skipSetActive', () => {
            const { a, b } = arrange();
            const removed = a.group;

            a.api.moveTo({
                group: b.group,
                position: 'center',
                skipSetActive: true,
            });

            expect(removed.model.isDisposed).toBe(true);
            expect(dockview.activeGroup?.id).not.toBe(removed.id);
            expect(dockview.toJSON().activeGroup).not.toBe(removed.id);
            expectNextPanelLandsInALiveGroup();

            expectNothingAliveAfterDispose();
        });

        test('tab group move with skipSetActive', () => {
            const { a, b } = arrange();
            const removed = a.group;
            const tabGroup = removed.model.createTabGroup({ label: 'tg' });
            removed.model.addPanelToTabGroup(tabGroup.id, 'a');

            dockview.moveGroupOrPanel({
                from: { groupId: removed.id, tabGroupId: tabGroup.id },
                to: { group: b.group, position: 'center' },
                skipSetActive: true,
            });

            expect(removed.model.isDisposed).toBe(true);
            expect(dockview.activeGroup?.id).not.toBe(removed.id);
            expectNextPanelLandsInALiveGroup();

            expectNothingAliveAfterDispose();
        });

        test('removePanel with skipSetActiveGroup', () => {
            const { a } = arrange();
            const removed = a.group;

            dockview.removePanel(a, { skipSetActiveGroup: true });

            expect(removed.model.isDisposed).toBe(true);
            expect(dockview.activeGroup?.id).not.toBe(removed.id);
            expectNextPanelLandsInALiveGroup();

            expectNothingAliveAfterDispose();
        });

        test('removeEdgeGroup on the active edge group', () => {
            create();
            dockview.addPanel({ id: 'a', component: 'default' });
            dockview.addEdgeGroup('left', { id: 'edge-left' });
            const e = dockview.addPanel({
                id: 'e',
                component: 'default',
                position: { referenceGroup: 'edge-left' },
            });
            e.api.setActive();
            const removed = e.group;
            expect(dockview.activeGroup?.id).toBe(removed.id);

            dockview.removeEdgeGroup('left');

            expect(removed.model.isDisposed).toBe(true);
            expect(dockview.activeGroup?.id).not.toBe(removed.id);
            expectNextPanelLandsInALiveGroup();

            expectNothingAliveAfterDispose();
        });
    });
    describe('popover content', () => {
        test('overflow dropdown rows are disposed when it closes', () => {
            const container = document.createElement('div');
            document.body.appendChild(container);
            dockview = new DockviewComponent(container, tracker.options);
            dockview.layout(400, 300);
            const panels = ['a', 'b', 'c'].map((id) =>
                dockview.addPanel({ id, component: 'default' })
            );
            const header = (panels[0].group.model as any).header;
            header.setForcedOverflow((id: string) => id !== 'a');
            header.refreshOverflow();
            const root = container.querySelector<HTMLElement>(
                '.dv-tabs-overflow-dropdown-root'
            )!;
            const popup = dockview.getPopupServiceForGroup(panels[0].group);

            for (let i = 0; i < 3; i++) {
                fireEvent.click(root);
                // three header tabs plus the two overflow rows
                expect(tracker.alive('tab')).toBe(5);
                popup.close();
                expect(tracker.alive('tab')).toBe(3);
            }

            // reopening replaces the open dropdown's rows rather than adding
            fireEvent.click(root);
            fireEvent.click(root);
            expect(tracker.alive('tab')).toBe(5);

            expectNothingAliveAfterDispose();
            container.remove();
        });

        test('context menu component items are disposed when it closes', () => {
            const container = document.createElement('div');
            document.body.appendChild(container);
            dockview = new DockviewComponent(container, {
                ...tracker.options,
                getTabContextMenuItems: () => [{ component: 'item' }],
            });
            dockview.layout(400, 300);
            const panel = dockview.addPanel({ id: 'a', component: 'default' });
            const tab = container.querySelector<HTMLElement>('.dv-tab')!;
            const popup = dockview.getPopupServiceForGroup(panel.group);

            for (let i = 0; i < 3; i++) {
                fireEvent.contextMenu(tab);
                expect(tracker.alive('contextMenuItem')).toBe(1);
                popup.close();
                expect(tracker.alive('contextMenuItem')).toBe(0);
            }
            expect(tracker.created('contextMenuItem')).toBe(3);

            fireEvent.contextMenu(tab);
            expectNothingAliveAfterDispose();
            container.remove();
        });
    });

    describe('fromJSON', () => {
        test('reuseExistingPanels does not leak staging group header actions', () => {
            create();
            dockview.addPanel({ id: 'p1', component: 'default' });
            dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });
            dockview.addPanel({
                id: 'p3',
                component: 'default',
                position: { direction: 'below' },
            });
            const json = dockview.toJSON();

            for (let i = 0; i < 3; i++) {
                dockview.fromJSON(json, { reuseExistingPanels: true });
                expect(dockview.groups).toHaveLength(3);
                expect(tracker.alive('headerAction')).toBe(3);
                expect(tracker.alive('content')).toBe(3);
                expect(tracker.alive('tab')).toBe(3);
            }

            expectNothingAliveAfterDispose();
        });
    });
    describe('popout windows', () => {
        const originalOpen = window.open;

        afterEach(() => {
            window.open = originalOpen;
        });

        test('a popout that finishes opening after dispose() is abandoned', async () => {
            const deferred = setupDeferredMockWindow();
            const close = jest.spyOn(deferred.window, 'close');
            window.open = jest.fn(() => deferred.window);

            create();
            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });

            const opened = dockview.addPopoutGroup(p1);
            dockview.dispose();
            // the window is closed as part of teardown, not left loading
            expect(close).toHaveBeenCalled();

            deferred.load();
            await expect(opened).resolves.toBe(false);

            expect(p1.api.location.type).toBe('grid');
            expect(tracker.snapshot()).toEqual({
                content: 0,
                tab: 0,
                watermark: 0,
                headerAction: 0,
                contextMenuItem: 0,
            });
        });
    });
    describe('floating groups', () => {
        test('closing an always-rendered floating panel in the tick it was added leaves no observer behind', async () => {
            const RealMutationObserver = globalThis.MutationObserver;
            const live = new Set<MutationObserver>();
            globalThis.MutationObserver = class extends RealMutationObserver {
                observe(target: Node, options?: MutationObserverInit): void {
                    live.add(this);
                    super.observe(target, options);
                }
                disconnect(): void {
                    live.delete(this);
                    super.disconnect();
                }
            };

            try {
                create({ defaultRenderer: 'always' });
                const p1 = dockview.addPanel({
                    id: 'p1',
                    component: 'default',
                    floating: true,
                });
                await exhaustMicrotaskQueue();
                const baseline = live.size;

                const p2 = dockview.addPanel({
                    id: 'p2',
                    component: 'default',
                    position: { referenceGroup: p1.group },
                });
                p2.api.close();
                await exhaustMicrotaskQueue();

                expect(live.size).toBe(baseline);

                expectNothingAliveAfterDispose();
                expect(live.size).toBe(0);
            } finally {
                globalThis.MutationObserver = RealMutationObserver;
            }
        });
    });
});
