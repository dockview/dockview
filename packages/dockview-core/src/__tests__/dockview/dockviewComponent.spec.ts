import { DockviewComponent } from '../../dockview/dockviewComponent';
import { AllModules } from '../../dockview/allModules';
import { EdgeGroupModule } from '../../dockview/edgeGroupService';
import {
    GroupPanelPartInitParameters,
    IContentRenderer,
    ITabRenderer,
} from '../../dockview/types';
import { PanelUpdateEvent } from '../../panel/types';
import { Orientation } from '../../splitview/splitview';
import { CompositeDisposable } from '../../lifecycle';
import { Emitter } from '../../events';
import { DockviewPanel, IDockviewPanel } from '../../dockview/dockviewPanel';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { fireEvent, queryByTestId } from '@testing-library/dom';
import { getPanelData } from '../../dnd/dataTransfer';
import {
    GroupDragEvent,
    TabDragEvent,
} from '../../dockview/components/titlebar/tabsContainer';
import { fromPartial } from '@total-typescript/shoehorn';
import { DockviewApi } from '../../api/component.api';
import {
    DockviewDndOverlayEvent,
    IHeaderActionsRenderer,
} from '../../dockview/options';
import { SizeEvent } from '../../api/gridviewPanelApi';
import { setupMockWindow } from '../__mocks__/mockWindow';
import { EdgeGroupOptions } from '../../dockview/dockviewShell';
import {
    exhaustMicrotaskQueue,
    exhaustAnimationFrame,
} from '../__test_utils__/utils';

class PanelContentPartTest implements IContentRenderer {
    element: HTMLElement = document.createElement('div');

    readonly _onDidDispose = new Emitter<void>();
    readonly onDidDispose = this._onDidDispose.event;

    isDisposed: boolean = false;

    constructor(
        public readonly id: string,
        public readonly component: string
    ) {
        this.element.classList.add(`testpanel-${id}`);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        //noop
    }

    layout(width: number, height: number): void {
        //noop
    }

    update(event: PanelUpdateEvent): void {
        //noop
    }

    toJSON(): object {
        return { id: this.component };
    }

    focus(): void {
        //noop
    }

    dispose(): void {
        this.isDisposed = true;
        this._onDidDispose.fire();
        this._onDidDispose.dispose();
    }
}

class PanelTabPartTest implements ITabRenderer {
    element: HTMLElement = document.createElement('div');

    readonly _onDidDispose = new Emitter<void>();
    readonly onDidDispose = this._onDidDispose.event;

    isDisposed: boolean = false;

    constructor(
        public readonly id: string,
        component: string
    ) {
        this.element.className = `panel-tab-part-${id}`;
    }

    init(parameters: GroupPanelPartInitParameters): void {
        //noop
    }

    layout(width: number, height: number): void {
        //noop
    }

    update(event: PanelUpdateEvent): void {
        //noop
    }

    focus(): void {
        //noop
    }

    dispose(): void {
        this.isDisposed = true;
        this._onDidDispose.fire();
        this._onDidDispose.dispose();
    }
}

describe('dockviewComponent', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;

    beforeEach(() => {
        container = document.createElement('div');

        dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });
    });

    test('update className', () => {
        dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            className: 'test-a test-b',
        });
        expect(dockview.element.className).toBe(
            'test-a test-b dv-tab-group-indicator-none'
        );

        dockview.updateOptions({ className: 'test-b test-c' });

        expect(dockview.element.className).toBe(
            'dv-tab-group-indicator-none test-b test-c'
        );
    });

    describe('disableDnd option integration', () => {
        test('that updateOptions with disableDnd updates all tabs and void containers', () => {
            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
                disableDnd: false,
            });

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            const tabElements = Array.from(
                dockview.element.querySelectorAll('.dv-tab')
            ) as HTMLElement[];
            const voidContainers = Array.from(
                dockview.element.querySelectorAll('.dv-void-container')
            ) as HTMLElement[];

            tabElements.forEach((tab) => {
                expect(tab.draggable).toBe(true);
            });
            voidContainers.forEach((container) => {
                expect(container.draggable).toBe(true);
            });

            dockview.updateOptions({ disableDnd: true });

            tabElements.forEach((tab) => {
                expect(tab.draggable).toBe(false);
            });
            voidContainers.forEach((container) => {
                expect(container.draggable).toBe(false);
            });

            dockview.updateOptions({ disableDnd: false });

            tabElements.forEach((tab) => {
                expect(tab.draggable).toBe(true);
            });
            voidContainers.forEach((container) => {
                expect(container.draggable).toBe(true);
            });
        });

        test('dndStrategy switches `draggable` on existing tabs / void containers', () => {
            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
                // Implicit default: dndStrategy = 'auto'
            });

            dockview.addPanel({ id: 'panel1', component: 'default' });
            dockview.addPanel({ id: 'panel2', component: 'default' });

            const tabs = () =>
                Array.from(
                    dockview.element.querySelectorAll('.dv-tab')
                ) as HTMLElement[];
            const voids = () =>
                Array.from(
                    dockview.element.querySelectorAll('.dv-void-container')
                ) as HTMLElement[];

            // auto: HTML5 active → draggable=true everywhere
            tabs().forEach((t) => expect(t.draggable).toBe(true));
            voids().forEach((v) => expect(v.draggable).toBe(true));

            // 'pointer': HTML5 off → draggable=false
            dockview.updateOptions({ dndStrategy: 'pointer' });
            tabs().forEach((t) => expect(t.draggable).toBe(false));
            voids().forEach((v) => expect(v.draggable).toBe(false));

            // 'html5': HTML5 back on
            dockview.updateOptions({ dndStrategy: 'html5' });
            tabs().forEach((t) => expect(t.draggable).toBe(true));
            voids().forEach((v) => expect(v.draggable).toBe(true));

            // back to 'auto' for completeness
            dockview.updateOptions({ dndStrategy: 'auto' });
            tabs().forEach((t) => expect(t.draggable).toBe(true));
            voids().forEach((v) => expect(v.draggable).toBe(true));
        });

        test('dndStrategy applies to tabs added after the option change', () => {
            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.updateOptions({ dndStrategy: 'pointer' });

            dockview.addPanel({ id: 'panel1', component: 'default' });

            const tab = dockview.element.querySelector(
                '.dv-tab'
            ) as HTMLElement;
            const voidContainer = dockview.element.querySelector(
                '.dv-void-container'
            ) as HTMLElement;

            // 'pointer' strategy disables HTML5 path: draggable should be false
            // even though disableDnd is not set.
            expect(tab.draggable).toBe(false);
            expect(voidContainer.draggable).toBe(false);
        });

        test('group.model.getPanelForTab maps a tab element to its panel', () => {
            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    return new PanelContentPartTest(options.id, options.name);
                },
            });
            dockview.layout(500, 500);
            const p1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            dockview.addPanel({ id: 'panel2', component: 'default' });
            const group = p1.group;

            const tabEls = Array.from(
                group.element.querySelectorAll('.dv-tab')
            ) as HTMLElement[];
            expect(tabEls).toHaveLength(2);

            // each tab element resolves to a distinct panel
            const r1 = group.model.getPanelForTab(tabEls[0]);
            const r2 = group.model.getPanelForTab(tabEls[1]);
            expect(new Set([r1?.id, r2?.id])).toEqual(
                new Set(['panel1', 'panel2'])
            );

            // a descendant of a tab resolves to the same panel as the tab
            const inner = (tabEls[0].querySelector('*') ??
                tabEls[0]) as HTMLElement;
            expect(group.model.getPanelForTab(inner)?.id).toBe(r1?.id);

            // a non-tab element (the void container) resolves to undefined
            const voidEl = group.element.querySelector(
                '.dv-void-container'
            ) as HTMLElement;
            expect(group.model.getPanelForTab(voidEl)).toBeUndefined();
        });

        test('disableDnd overrides dndStrategy', () => {
            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
                dndStrategy: 'html5',
                disableDnd: true,
            });

            dockview.addPanel({ id: 'panel1', component: 'default' });

            const tab = dockview.element.querySelector(
                '.dv-tab'
            ) as HTMLElement;
            expect(tab.draggable).toBe(false);
        });

        test('that new tabs respect current disableDnd option when added after option change', () => {
            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
                disableDnd: false,
            });

            dockview.updateOptions({ disableDnd: true });

            const panel = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            const tabElement = dockview.element.querySelector(
                '.dv-tab'
            ) as HTMLElement;
            const voidContainer = dockview.element.querySelector(
                '.dv-void-container'
            ) as HTMLElement;

            expect(tabElement.draggable).toBe(false);
            expect(voidContainer.draggable).toBe(false);
        });
    });

    describe('memory leakage', () => {
        beforeEach(() => {
            window.open = () => setupMockWindow();
        });

        test('event leakage', async () => {
            Emitter.setLeakageMonitorEnabled(true);

            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
                className: 'test-a test-b',
            });

            dockview.layout(500, 1000);

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            dockview.removePanel(panel2);

            const panel3 = dockview.addPanel({
                id: 'panel3',
                component: 'default',
                position: {
                    direction: 'right',
                    referencePanel: 'panel1',
                },
            });

            const panel4 = dockview.addPanel({
                id: 'panel4',
                component: 'default',
                position: {
                    direction: 'above',
                },
            });

            panel4.api.group.api.moveTo({
                group: panel3.api.group,
                position: 'center',
            });

            dockview.addPanel({
                id: 'panel5',
                component: 'default',
                floating: true,
            });

            const panel6 = dockview.addPanel({
                id: 'panel6',
                component: 'default',
                position: {
                    referencePanel: 'panel5',
                    direction: 'within',
                },
            });

            dockview.addFloatingGroup(panel4.api.group);

            await dockview.addPopoutGroup(panel2);

            panel1.api.group.api.moveTo({
                group: panel6.api.group,
                position: 'center',
            });

            panel4.api.group.api.moveTo({
                group: panel6.api.group,
                position: 'center',
            });

            const targetGroup = panel6.api.group;
            const tg1 = dockview.api.createTabGroup({
                groupId: targetGroup.id,
                label: 'Leak Test',
                color: 'red',
            });
            const tg2 = dockview.api.createTabGroup({
                groupId: targetGroup.id,
                label: 'Leak Test 2',
                color: 'blue',
            });

            dockview.api.addPanelToTabGroup({
                groupId: targetGroup.id,
                tabGroupId: tg1.id,
                panelId: panel1.id,
            });
            dockview.api.addPanelToTabGroup({
                groupId: targetGroup.id,
                tabGroupId: tg1.id,
                panelId: panel4.id,
            });
            dockview.api.addPanelToTabGroup({
                groupId: targetGroup.id,
                tabGroupId: tg2.id,
                panelId: panel3.id,
            });

            tg1.collapse();

            dockview.api.removePanelFromTabGroup({
                groupId: targetGroup.id,
                panelId: panel4.id,
            });

            dockview.api.dissolveTabGroup({
                groupId: targetGroup.id,
                tabGroupId: tg2.id,
            });

            dockview.addEdgeGroup('left', {
                id: 'edge-left',
                initialSize: 200,
            });
            dockview.addEdgeGroup('bottom', {
                id: 'edge-bottom',
                initialSize: 150,
                collapsed: true,
            });

            const edgePanel1 = dockview.addPanel({
                id: 'edgePanel1',
                component: 'default',
                position: {
                    referenceGroup: 'edge-left',
                    direction: 'within',
                },
            });

            dockview.addPanel({
                id: 'edgePanel2',
                component: 'default',
                position: {
                    referenceGroup: 'edge-left',
                    direction: 'within',
                },
            });

            dockview.setEdgeGroupVisible('left', false);
            dockview.setEdgeGroupVisible('left', true);

            dockview.removePanel(edgePanel1);

            dockview.removeEdgeGroup('bottom');

            dockview.dispose();

            if (Emitter.MEMORY_LEAK_WATCHER.size > 0) {
                console.warn(
                    `${Emitter.MEMORY_LEAK_WATCHER.size} undisposed resources`
                );

                for (const entry of Array.from(
                    Emitter.MEMORY_LEAK_WATCHER.events
                )) {
                    console.log('disposal', entry[1]);
                }
                throw new Error(
                    `${Emitter.MEMORY_LEAK_WATCHER.size} undisposed resources`
                );
            }

            Emitter.setLeakageMonitorEnabled(false);
        });
    });

    test('duplicate panel', () => {
        dockview.layout(500, 1000);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        expect(() => {
            dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
        }).toThrow('panel with id panel1 already exists');

        dockview.dispose();
    });

    describe('move group', () => {
        test('that moving a popup group into the grid manages view disposals correctly', async () => {
            window.open = () => setupMockWindow();

            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(600, 1000);

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
                position: { direction: 'right' },
            });

            await dockview.addPopoutGroup(panel1.api.group);

            expect(panel1.api.location.type).toBe('popout');
            expect(dockview.groups).toHaveLength(4);
            expect(dockview.panels).toHaveLength(3);

            panel1.api.group.api.moveTo({
                group: panel2.api.group,
                position: 'left',
            });

            expect(panel1.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(3);
            expect(dockview.panels).toHaveLength(3);

            const query = dockview.element.querySelectorAll('.dv-view');
            expect(query).toHaveLength(3);
        });

        test('that moving a popout group to specific position works correctly', async () => {
            window.open = () => setupMockWindow();

            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(600, 1000);

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
                position: { direction: 'right' },
            });

            await dockview.addPopoutGroup(panel1.api.group);
            expect(panel1.api.location.type).toBe('popout');
            expect(dockview.groups).toHaveLength(3); // panel2 + hidden reference + popout

            panel1.api.group.api.moveTo({
                group: panel2.api.group,
                position: 'left',
            });

            expect(panel1.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);

            expect(panel1.api.isVisible).toBe(true);
            expect(panel2.api.isVisible).toBe(true);
        });

        test('that moving a popout group to different positions works', async () => {
            window.open = () => setupMockWindow();

            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(600, 1000);

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
                position: { direction: 'right' },
            });

            await dockview.addPopoutGroup(panel1.api.group);
            expect(panel1.api.location.type).toBe('popout');

            ['top', 'bottom', 'left', 'right'].forEach((position) => {
                panel1.api.group.api.moveTo({
                    group: panel2.api.group,
                    position: position as any,
                });

                expect(panel1.api.location.type).toBe('grid');
                expect(panel1.api.isVisible).toBe(true);
                expect(panel2.api.isVisible).toBe(true);
                expect(dockview.groups.length).toBeGreaterThanOrEqual(2);
                expect(dockview.panels).toHaveLength(2);
            });
        });

        test('that reference group cleanup works when moving popout to new position', async () => {
            window.open = () => setupMockWindow();

            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(600, 1000);

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
                position: { direction: 'right' },
            });

            const originalGroupId = panel1.group.id;

            await dockview.addPopoutGroup(panel1.api.group);
            expect(panel1.api.location.type).toBe('popout');
            expect(dockview.groups).toHaveLength(3); // panel2 + hidden reference + popout

            panel1.api.group.api.moveTo({
                group: panel2.api.group,
                position: 'right',
            });

            expect(panel1.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(2); // Just panel2 + panel1 in new position

            const referenceGroupStillExists = dockview.groups.some(
                (g) => g.id === originalGroupId
            );
            expect(referenceGroupStillExists).toBe(false);
        });

        test('horizontal', () => {
            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(600, 1000);

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
                position: { direction: 'right' },
            });

            expect(panel1.api.width).toBe(200);
            expect(panel2.api.width).toBe(200);
            expect(panel3.api.width).toBe(200);

            panel3.api.setSize({ width: 300 });

            expect(panel1.api.width).toBe(200);
            expect(panel2.api.width).toBe(100);
            expect(panel3.api.width).toBe(300);

            dockview.moveGroup({
                from: { group: panel3.api.group },
                to: { group: panel1.api.group, position: 'right' },
            });

            expect(panel1.api.width).toBe(200);
            expect(panel2.api.width).toBe(100);
            expect(panel3.api.width).toBe(300);
        });

        test('vertical', () => {
            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 600);

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
                position: { direction: 'below' },
            });
            const panel3 = dockview.addPanel({
                id: 'panel3',
                component: 'default',
                position: { direction: 'below' },
            });

            expect(panel1.api.height).toBe(200);
            expect(panel2.api.height).toBe(200);
            expect(panel3.api.height).toBe(200);

            panel3.api.setSize({ height: 300 });

            expect(panel1.api.height).toBe(200);
            expect(panel2.api.height).toBe(100);
            expect(panel3.api.height).toBe(300);

            dockview.moveGroup({
                from: { group: panel3.api.group },
                to: { group: panel1.api.group, position: 'bottom' },
            });

            expect(panel1.api.height).toBe(200);
            expect(panel2.api.height).toBe(100);
            expect(panel3.api.height).toBe(300);
        });
    });

    test('set active panel', () => {
        dockview.layout(500, 1000);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel4',
            component: 'default',
        });

        const panel1 = dockview.getGroupPanel('panel1');
        const panel2 = dockview.getGroupPanel('panel2');
        const panel3 = dockview.getGroupPanel('panel3');
        const panel4 = dockview.getGroupPanel('panel4');

        const group1 = panel1!.group;

        dockview.moveGroupOrPanel({
            from: { groupId: group1.id, panelId: 'panel1' },
            to: { group: group1, position: 'right' },
        });
        const group2 = panel1!.group;

        dockview.moveGroupOrPanel({
            from: { groupId: group1.id, panelId: 'panel3' },
            to: { group: group2, position: 'center' },
        });

        expect(dockview.activeGroup).toBe(group2);
        expect(dockview.activeGroup!.model.activePanel).toBe(panel3);
        expect(dockview.activeGroup!.model.indexOf(panel3!)).toBe(1);

        dockview.activatePrevious({ includePanel: true });
        expect(dockview.activeGroup).toBe(group2);
        expect(dockview.activeGroup!.model.activePanel).toBe(panel1);

        dockview.activateNext({ includePanel: true });
        expect(dockview.activeGroup).toBe(group2);
        expect(dockview.activeGroup!.model.activePanel).toBe(panel3);

        dockview.activatePrevious({ includePanel: false });
        expect(dockview.activeGroup).toBe(group1);
        expect(dockview.activeGroup!.model.activePanel).toBe(panel4);

        dockview.activatePrevious({ includePanel: true });
        expect(dockview.activeGroup).toBe(group1);
        expect(dockview.activeGroup!.model.activePanel).toBe(panel2);

        dockview.activateNext({ includePanel: false });
        expect(dockview.activeGroup).toBe(group2);
        expect(dockview.activeGroup!.model.activePanel).toBe(panel3);
    });

    test('moveGroupOrPanel with skipSetActive should not activate group/panel', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });

        dockview.addPanel({
            id: 'panel4',
            component: 'default',
        });

        const panel1 = dockview.getGroupPanel('panel1');
        const panel2 = dockview.getGroupPanel('panel2');
        const panel3 = dockview.getGroupPanel('panel3');
        const panel4 = dockview.getGroupPanel('panel4');

        const group1 = panel1!.group;

        // Move panel1 to create a new group
        dockview.moveGroupOrPanel({
            from: { groupId: group1.id, panelId: 'panel1' },
            to: { group: group1, position: 'right' },
        });
        const group2 = panel1!.group;

        expect(dockview.activeGroup).toBe(group2);
        expect(dockview.activePanel).toBe(panel1);

        dockview.doSetGroupActive(group1);
        group1.model.openPanel(panel2!);
        expect(dockview.activeGroup).toBe(group1);
        expect(dockview.activePanel?.id).toBe(panel2?.id);

        dockview.moveGroupOrPanel({
            from: { groupId: group1.id, panelId: 'panel3' },
            to: { group: group2, position: 'center' },
            skipSetActive: true,
        });

        expect(dockview.activeGroup).toBe(group1);
        expect(dockview.activePanel?.id).toBe(panel2?.id);
        expect(panel3!.group).toBe(group2);

        dockview.dispose();
    });

    test('moveGroupOrPanel group move with skipSetActive should not activate group', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });

        const panel1 = dockview.getGroupPanel('panel1')!;
        const panel2 = dockview.getGroupPanel('panel2')!;
        const panel3 = dockview.getGroupPanel('panel3')!;

        panel2.api.moveTo({ position: 'right' });
        panel3.api.moveTo({ group: panel2.group, position: 'center' });

        dockview.doSetGroupActive(panel1.group);
        panel1.group.model.openPanel(panel1);
        expect(dockview.activeGroup).toBe(panel1.group);
        expect(dockview.activePanel?.id).toBe(panel1.id);

        dockview.moveGroupOrPanel({
            from: { groupId: panel2.group.id },
            to: { group: panel1.group, position: 'center' },
            skipSetActive: true,
        });

        expect(dockview.activeGroup).toBe(panel1.group);
        expect(dockview.activePanel).toBeTruthy();
        expect(panel2.group).toBe(panel1.group);
        expect(panel3.group).toBe(panel1.group);

        dockview.dispose();
    });

    test('moveGroupOrPanel with tabGroupId moves only tab group panels to center', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                return new PanelContentPartTest(options.id, options.name);
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({ id: 'panel1', component: 'default' });
        dockview.addPanel({ id: 'panel2', component: 'default' });
        dockview.addPanel({ id: 'panel3', component: 'default' });

        const panel1 = dockview.getGroupPanel('panel1')!;
        const panel2 = dockview.getGroupPanel('panel2')!;
        const panel3 = dockview.getGroupPanel('panel3')!;
        const sourceGroup = panel1.group;

        const tabGroup = sourceGroup.model.createTabGroup({
            label: 'Feature',
            color: 'blue',
        });
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel1');
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel2');

        dockview.moveGroupOrPanel({
            from: { groupId: sourceGroup.id, panelId: 'panel3' },
            to: { group: sourceGroup, position: 'right' },
        });
        const destGroup = panel3.group;
        expect(destGroup).not.toBe(sourceGroup);

        dockview.moveGroupOrPanel({
            from: {
                groupId: sourceGroup.id,
                tabGroupId: tabGroup.id,
            },
            to: { group: destGroup, position: 'center' },
        });

        // panel3 should remain, plus the two moved panels
        expect(destGroup.model.size).toBe(3);
        expect(panel1.group).toBe(destGroup);
        expect(panel2.group).toBe(destGroup);

        // Source group should be removed (was empty after move)
        expect(dockview.groups).toHaveLength(1);

        // Tab group should be recreated in destination
        const destTabGroups = destGroup.model.getTabGroups();
        expect(destTabGroups).toHaveLength(1);
        expect(destTabGroups[0].label).toBe('Feature');
        expect(destTabGroups[0].color).toBe('blue');
        expect(destTabGroups[0].panelIds).toContain('panel1');
        expect(destTabGroups[0].panelIds).toContain('panel2');
        expect(destTabGroups[0].panelIds).not.toContain('panel3');

        dockview.dispose();
    });

    test('moveGroupOrPanel with tabGroupId preserves collapsed state', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                return new PanelContentPartTest(options.id, options.name);
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({ id: 'panel1', component: 'default' });
        dockview.addPanel({ id: 'panel2', component: 'default' });

        const panel1 = dockview.getGroupPanel('panel1')!;
        const sourceGroup = panel1.group;

        const tabGroup = sourceGroup.model.createTabGroup({
            label: 'Collapsed Group',
            color: 'red',
        });
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel1');
        tabGroup.collapse();

        dockview.moveGroupOrPanel({
            from: { groupId: sourceGroup.id, panelId: 'panel2' },
            to: { group: sourceGroup, position: 'right' },
        });
        const panel2 = dockview.getGroupPanel('panel2')!;
        const destGroup = panel2.group;
        expect(destGroup).not.toBe(sourceGroup);

        dockview.moveGroupOrPanel({
            from: {
                groupId: sourceGroup.id,
                tabGroupId: tabGroup.id,
            },
            to: { group: destGroup, position: 'center' },
        });

        const destTabGroups = destGroup.model.getTabGroups();
        expect(destTabGroups).toHaveLength(1);
        expect(destTabGroups[0].collapsed).toBe(true);
        expect(destTabGroups[0].color).toBe('red');

        dockview.dispose();
    });

    test('moveGroupOrPanel with collapsed tabGroupId does not transition through expanded state on destination', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                return new PanelContentPartTest(options.id, options.name);
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({ id: 'panel1', component: 'default' });
        dockview.addPanel({ id: 'panel2', component: 'default' });

        const panel1 = dockview.getGroupPanel('panel1')!;
        const sourceGroup = panel1.group;

        const tabGroup = sourceGroup.model.createTabGroup({
            label: 'Born collapsed',
            color: 'red',
        });
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel1');
        tabGroup.collapse();

        dockview.moveGroupOrPanel({
            from: { groupId: sourceGroup.id, panelId: 'panel2' },
            to: { group: sourceGroup, position: 'right' },
        });
        const panel2 = dockview.getGroupPanel('panel2')!;
        const destGroup = panel2.group;

        // Track collapse-change events fired on destination during the move
        const destCollapseEvents: any[] = [];
        destGroup.model.onDidTabGroupCollapsedChange((e) =>
            destCollapseEvents.push(e)
        );

        dockview.moveGroupOrPanel({
            from: {
                groupId: sourceGroup.id,
                tabGroupId: tabGroup.id,
            },
            to: { group: destGroup, position: 'center' },
        });

        // Regression: previously the destination group was created uncollapsed
        // and then `.collapse()` was called, firing a transition event that
        // animated the chip/tabs from expanded → collapsed. The new tab group
        // should be born collapsed, so no transition event fires.
        expect(destCollapseEvents).toHaveLength(0);

        const destTabGroups = destGroup.model.getTabGroups();
        expect(destTabGroups).toHaveLength(1);
        expect(destTabGroups[0].collapsed).toBe(true);

        // Force synchronous chip rendering (updateTabGroups is normally
        // batched via queueMicrotask).
        (destGroup.model as any).tabsContainer.tabs.updateTabGroups();

        // Tabs of the moved group should land in the collapsed state instantly
        // (no animation). The animation path sets an inline width/height to
        // measure-then-collapse; the instant path leaves both unset.
        const movedTabs =
            destGroup.element.querySelectorAll('.dv-tab--grouped');
        expect(movedTabs.length).toBeGreaterThan(0);
        for (const tabEl of Array.from(movedTabs) as HTMLElement[]) {
            expect(tabEl.classList.contains('dv-tab--group-collapsed')).toBe(
                true
            );
            expect(tabEl.style.width).toBe('');
            expect(tabEl.style.height).toBe('');
        }

        dockview.dispose();
    });

    test('moveGroupOrPanel with tabGroupId to extremity creates new group', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                return new PanelContentPartTest(options.id, options.name);
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({ id: 'panel1', component: 'default' });
        dockview.addPanel({ id: 'panel2', component: 'default' });
        dockview.addPanel({ id: 'panel3', component: 'default' });

        const panel1 = dockview.getGroupPanel('panel1')!;
        const panel2 = dockview.getGroupPanel('panel2')!;
        const panel3 = dockview.getGroupPanel('panel3')!;
        const sourceGroup = panel1.group;

        const tabGroup = sourceGroup.model.createTabGroup({
            label: 'Split',
            color: 'green',
        });
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel1');
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel2');

        dockview.moveGroupOrPanel({
            from: {
                groupId: sourceGroup.id,
                tabGroupId: tabGroup.id,
            },
            to: { group: sourceGroup, position: 'right' },
        });

        expect(dockview.groups).toHaveLength(2);

        // panel3 stays in source
        expect(panel3.group).toBe(sourceGroup);
        expect(sourceGroup.model.size).toBe(1);

        // panel1 and panel2 are in the new group with tab group preserved
        const newGroup = panel1.group;
        expect(newGroup).not.toBe(sourceGroup);
        expect(panel2.group).toBe(newGroup);
        expect(newGroup.model.size).toBe(2);

        const newTabGroups = newGroup.model.getTabGroups();
        expect(newTabGroups).toHaveLength(1);
        expect(newTabGroups[0].label).toBe('Split');
        expect(newTabGroups[0].color).toBe('green');

        dockview.dispose();
    });

    test('moveGroupOrPanel with tabGroupId leaves other panels in source', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                return new PanelContentPartTest(options.id, options.name);
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({ id: 'panel1', component: 'default' });
        dockview.addPanel({ id: 'panel2', component: 'default' });
        dockview.addPanel({ id: 'panel3', component: 'default' });
        dockview.addPanel({ id: 'panel4', component: 'default' });

        const panel1 = dockview.getGroupPanel('panel1')!;
        const panel3 = dockview.getGroupPanel('panel3')!;
        const panel4 = dockview.getGroupPanel('panel4')!;
        const sourceGroup = panel1.group;

        const tabGroup = sourceGroup.model.createTabGroup({
            label: 'Partial',
            color: 'purple',
        });
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel1');
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel2');

        dockview.moveGroupOrPanel({
            from: { groupId: sourceGroup.id, panelId: 'panel4' },
            to: { group: sourceGroup, position: 'right' },
        });
        const destGroup = panel4.group;
        expect(destGroup).not.toBe(sourceGroup);

        dockview.moveGroupOrPanel({
            from: {
                groupId: sourceGroup.id,
                tabGroupId: tabGroup.id,
            },
            to: { group: destGroup, position: 'center' },
        });

        // Source group should still exist with panel3
        expect(sourceGroup.model.size).toBe(1);
        expect(panel3.group).toBe(sourceGroup);

        // Destination should have panel1, panel2, and panel4
        expect(destGroup.model.size).toBe(3);
        expect(panel1.group).toBe(destGroup);

        dockview.dispose();
    });

    // Regression test for #1244: dragging a group via its header onto
    // another group's center must preserve the source's tab groups
    // (label, color, collapsed, componentParams, panelIds).
    test('moveGroup to center preserves tab groups from the source', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                return new PanelContentPartTest(options.id, options.name);
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({ id: 'panel1', component: 'default' });
        dockview.addPanel({ id: 'panel2', component: 'default' });

        const panel1 = dockview.getGroupPanel('panel1')!;
        const panel2 = dockview.getGroupPanel('panel2')!;
        const sourceGroup = panel1.group;

        const tabGroup = sourceGroup.model.createTabGroup({
            label: 'Feature',
            color: 'blue',
            collapsed: true,
            componentParams: { foo: 'bar' },
        });
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel1');
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel2');

        // Spin off a destination group so the merge has somewhere to go.
        dockview.addPanel({
            id: 'panel3',
            component: 'default',
            position: { direction: 'right' },
        });
        const panel3 = dockview.getGroupPanel('panel3')!;
        const destGroup = panel3.group;
        expect(destGroup).not.toBe(sourceGroup);

        // Drag the source group onto destGroup's center (this is what
        // the void-container header drag fires).
        dockview.moveGroupOrPanel({
            from: { groupId: sourceGroup.id },
            to: { group: destGroup, position: 'center' },
        });

        // All three panels should now live in destGroup.
        expect(destGroup.model.size).toBe(3);
        expect(panel1.group).toBe(destGroup);
        expect(panel2.group).toBe(destGroup);

        // Tab group should have come along with its panels and metadata.
        const movedTabGroups = destGroup.model.getTabGroups();
        expect(movedTabGroups).toHaveLength(1);
        const moved = movedTabGroups[0];
        expect(moved.label).toBe('Feature');
        expect(moved.color).toBe('blue');
        expect(moved.collapsed).toBe(true);
        expect(moved.componentParams).toEqual({ foo: 'bar' });
        expect([...moved.panelIds]).toEqual(['panel1', 'panel2']);

        dockview.dispose();
    });

    // Companion to the above: confirm the active panel stays correct
    // when the source contains a collapsed tab group + an ungrouped
    // panel that is the active one.
    test('moveGroup to center preserves active panel across collapsed tab group merge', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                return new PanelContentPartTest(options.id, options.name);
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({ id: 'panel1', component: 'default' });
        dockview.addPanel({ id: 'panel2', component: 'default' });
        dockview.addPanel({ id: 'panel3', component: 'default' });

        const panel3 = dockview.getGroupPanel('panel3')!;
        const sourceGroup = panel3.group;

        // Collapsed tab group on panel1 + panel2; panel3 is ungrouped
        // and is the active panel (since the only other panels are
        // inside a collapsed group).
        const tabGroup = sourceGroup.model.createTabGroup({
            label: 'Hidden',
            color: 'red',
        });
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel1');
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel2');
        tabGroup.collapse();

        // panel3 is the active panel; collapsing the group above
        // redirects active away from the collapsed-group panels.
        expect(sourceGroup.model.activePanel?.id).toBe('panel3');

        // Spin off destination group.
        dockview.addPanel({
            id: 'panel4',
            component: 'default',
            position: { direction: 'right' },
        });
        const panel4 = dockview.getGroupPanel('panel4')!;
        const destGroup = panel4.group;

        // Drag entire source onto destGroup's center.
        dockview.moveGroupOrPanel({
            from: { groupId: sourceGroup.id },
            to: { group: destGroup, position: 'center' },
        });

        // Active panel should still be panel3.
        expect(destGroup.model.activePanel?.id).toBe('panel3');

        // Tab group recreated and still collapsed.
        const tgs = destGroup.model.getTabGroups();
        expect(tgs).toHaveLength(1);
        expect(tgs[0].collapsed).toBe(true);
        expect([...tgs[0].panelIds]).toEqual(['panel1', 'panel2']);

        dockview.dispose();
    });

    // Regression test for #1242: dropping a tab group at the edge of its
    // own (and only) source group when the tab group contains all of the
    // source group's panels must split the layout and leave no orphan
    // empty group behind.
    test('moveGroupOrPanel with tabGroupId to extremity of own group when tabgroup contains all panels removes empty source', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                return new PanelContentPartTest(options.id, options.name);
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({ id: 'panel1', component: 'default' });
        dockview.addPanel({ id: 'panel2', component: 'default' });

        const panel1 = dockview.getGroupPanel('panel1')!;
        const panel2 = dockview.getGroupPanel('panel2')!;
        const sourceGroup = panel1.group;

        // Tab group spans every panel in the source group.
        const tabGroup = sourceGroup.model.createTabGroup({
            label: 'All',
            color: 'red',
        });
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel1');
        sourceGroup.model.addPanelToTabGroup(tabGroup.id, 'panel2');

        dockview.moveGroupOrPanel({
            from: {
                groupId: sourceGroup.id,
                tabGroupId: tabGroup.id,
            },
            to: { group: sourceGroup, position: 'right' },
        });

        // Source group should be removed (it became empty); only the new
        // group at the right contains the panels.
        expect(dockview.groups).toHaveLength(1);
        const newGroup = panel1.group;
        expect(newGroup).not.toBe(sourceGroup);
        expect(panel2.group).toBe(newGroup);
        expect(newGroup.model.size).toBe(2);

        const newTabGroups = newGroup.model.getTabGroups();
        expect(newTabGroups).toHaveLength(1);
        expect(newTabGroups[0].label).toBe('All');
        expect(newTabGroups[0].color).toBe('red');

        dockview.dispose();
    });

    // Regression test for #1254. After a cross-group tab-group chip
    // drag, the chip element is detached from the DOM (the source tab
    // group becomes empty, so `_positionChipForGroup` removes it).
    // `dragend` therefore can't bubble to `_tabsList`, which historically
    // left the `panelTransfer` singleton populated with the chip drag's
    // payload (including `tabGroupId`).
    //
    // In the current architecture this is also our smoke test for the
    // manager-owned chip-drag wiring: the `TabGroupManager`'s
    // `html5Backend.createDragSource(chip.element, ...)` `getData`
    // callback is what sets `panelTransfer` on chip dragstart, and the
    // synchronous-clear `dragend` listener attached directly to the chip
    // element (`tabGroups.ts:syncClearOnDragEnd`) is what clears it for
    // the detach-then-dragend path exercised below.
    test('cross-group chip drag clears panelTransfer when the chip detaches (#1254)', async () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                return new PanelContentPartTest(options.id, options.name);
            },
        });
        dockview.layout(1000, 1000);

        for (let i = 1; i <= 4; i++) {
            dockview.addPanel({ id: `panel${i}`, component: 'default' });
        }

        const sourceGroup = dockview.getGroupPanel('panel1')!.group;
        // panel4 ungrouped so source survives the move; panels 1-3 are
        // the tab group that will move out cross-group.
        const monitoring = sourceGroup.model.createTabGroup({
            label: 'Monitoring',
            color: 'purple',
        });
        sourceGroup.model.addPanelToTabGroup(monitoring.id, 'panel1');
        sourceGroup.model.addPanelToTabGroup(monitoring.id, 'panel2');
        sourceGroup.model.addPanelToTabGroup(monitoring.id, 'panel3');

        dockview.addPanel({
            id: 'sibling',
            component: 'default',
            position: { direction: 'right' },
        });
        const siblingGroup = dockview.getGroupPanel('sibling')!.group;

        // Chip is rendered on a microtask via _scheduleTabGroupUpdate.
        await Promise.resolve();

        const chip = sourceGroup.element.querySelector(
            '.dv-tab-group-chip'
        ) as HTMLElement;
        expect(chip).toBeTruthy();

        // Real chip drag: dragstart populates panelTransfer with the
        // chip payload (tabGroupId set).
        fireEvent.dragStart(chip);
        expect(getPanelData()?.tabGroupId).toBe(monitoring.id);

        // The drop resolves via moveGroupOrPanel, the same path the
        // real drag flow ends up calling. This detaches the chip from
        // the DOM (source tab group becomes empty).
        dockview.moveGroupOrPanel({
            from: { groupId: sourceGroup.id, tabGroupId: monitoring.id },
            to: { group: siblingGroup, position: 'right' },
        });
        expect(chip.isConnected).toBe(false);

        // dragend fires on the (now-detached) chip element.
        fireEvent.dragEnd(chip);

        // Without the fix, panelTransfer keeps the chip-drag payload
        // (with tabGroupId) and any subsequent dragover/canDisplayOverlay
        // call that reads it before the next dragstart's setData runs
        // would see stale data, including a stale tabGroupId pointing
        // at a tab group that has just been recreated under a new id.
        expect(getPanelData()).toBeUndefined();

        dockview.dispose();
    });

    // Regression tests for #1410. A within-group tab-group move disposes the
    // dragged chip's drag sources (`disposeChipDrag`) so the transfer
    // singleton is cleared synchronously — but, unlike a cross-group move,
    // the chip element itself survives the reorder. If the sources aren't
    // re-armed by the following `updateTabGroups()`, the chip keeps
    // `draggable=true` and fires a native `dragstart`, but no longer sets a
    // transfer payload — leaving the group undraggable after its first move.
    //
    // `setupTwoTabGroups` builds one group holding two tab groups (Feature +
    // Monitoring), so relocating one is a within-group reorder, and returns
    // the handles the tests drive the real commit path with.
    async function setupTwoTabGroups(tabAnimation?: 'smooth' | 'default') {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                return new PanelContentPartTest(options.id, options.name);
            },
            ...(tabAnimation
                ? {
                      theme: {
                          name: 'test',
                          className: 'test',
                          tabAnimation,
                      } as any,
                  }
                : {}),
        });
        dockview.layout(1000, 1000);

        for (let i = 1; i <= 4; i++) {
            dockview.addPanel({ id: `panel${i}`, component: 'default' });
        }

        const group = dockview.getGroupPanel('panel1')!.group;
        const feature = group.model.createTabGroup({
            label: 'Feature',
            color: 'blue',
        });
        group.model.addPanelToTabGroup(feature.id, 'panel1');
        group.model.addPanelToTabGroup(feature.id, 'panel2');
        const monitoring = group.model.createTabGroup({
            label: 'Monitoring',
            color: 'purple',
        });
        group.model.addPanelToTabGroup(monitoring.id, 'panel3');
        group.model.addPanelToTabGroup(monitoring.id, 'panel4');

        // Chips are rendered on a microtask via _scheduleTabGroupUpdate.
        await Promise.resolve();

        const tabs = (group.model.header as any).tabs;
        const manager = tabs._tabGroupManager;
        const featureChip = group.element.querySelector(
            '.dv-tab-group-chip'
        ) as HTMLElement;
        expect(featureChip).toBeTruthy();

        return {
            dockview,
            group,
            feature,
            monitoring,
            tabs,
            manager,
            featureChip,
        };
    }

    test('within-group chip stays draggable across repeated moves (#1410)', async () => {
        const { dockview, group, feature, tabs, manager, featureChip } =
            await setupTwoTabGroups();

        // A committed group move disposes the chip's drag sources, so its
        // entry is left without live sources until `update()` re-arms them.
        const dragSourcesArmed = () => {
            const entry = manager._chipRenderers.get(feature.id);
            return !!entry?.html5DragSource && !!entry?.pointerDragSource;
        };

        // Two consecutive within-group moves, driving the real production
        // commit path (`Tabs._commitGroupMove` → `disposeChipDrag` +
        // `moveTabGroup` → `updateTabGroups()`), asserting the chip remains
        // draggable each time. Before the fix only the first move worked.
        for (let move = 0; move < 2; move++) {
            fireEvent.dragStart(featureChip);
            expect(getPanelData()?.tabGroupId).toBe(feature.id);
            fireEvent.dragEnd(featureChip);

            tabs._commitGroupMove(feature.id, group.model.panels.length);

            // The same chip element survives (repositioned, not recreated)
            // and both backends are re-armed.
            expect(group.element.contains(featureChip)).toBe(true);
            expect(dragSourcesArmed()).toBe(true);
        }

        // Final drag still works after the repeated moves.
        fireEvent.dragStart(featureChip);
        expect(getPanelData()?.tabGroupId).toBe(feature.id);
        fireEvent.dragEnd(featureChip);

        dockview.dispose();
    });

    test('within-group chip stays draggable after a move in smooth mode (#1410)', async () => {
        // Matches the reported example config (tabAnimation: 'smooth'), which
        // takes the FLIP branch of `_commitGroupMove`.
        const { dockview, group, feature, tabs, featureChip } =
            await setupTwoTabGroups('smooth');

        fireEvent.dragStart(featureChip);
        expect(getPanelData()?.tabGroupId).toBe(feature.id);
        fireEvent.dragEnd(featureChip);

        tabs._commitGroupMove(feature.id, group.model.panels.length);

        expect(group.element.contains(featureChip)).toBe(true);

        // Second drag must still populate the transfer payload.
        fireEvent.dragStart(featureChip);
        expect(getPanelData()?.tabGroupId).toBe(feature.id);
        fireEvent.dragEnd(featureChip);

        dockview.dispose();
    });

    test('remove group', () => {
        dockview.layout(500, 1000);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel4',
            component: 'default',
        });

        const panel1 = dockview.getGroupPanel('panel1')!;
        const panel2 = dockview.getGroupPanel('panel2')!;
        const group1 = panel1.group;

        dockview.moveGroupOrPanel({
            from: { groupId: group1.id, panelId: 'panel1' },
            to: { group: group1, position: 'right' },
        });
        const group2 = panel1.group;
        dockview.moveGroupOrPanel({
            from: { groupId: group1.id, panelId: 'panel3' },
            to: { group: group2, position: 'center' },
        });

        expect(dockview.size).toBe(2);
        expect(dockview.totalPanels).toBe(4);
        expect(panel1.group.model.size).toBe(2);
        expect(panel2.group.model.size).toBe(2);

        dockview.removeGroup(panel1.group);

        expect(dockview.size).toBe(1);
        expect(dockview.totalPanels).toBe(2);

        dockview.removeGroup(panel2.group);

        expect(dockview.size).toBe(0);
        expect(dockview.totalPanels).toBe(0);
    });

    test('active panel', () => {
        dockview.layout(500, 1000);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel4',
            component: 'default',
        });

        const panel1 = dockview.getGroupPanel('panel1')!;
        const panel2 = dockview.getGroupPanel('panel2')!;
        const panel3 = dockview.getGroupPanel('panel3')!;
        const panel4 = dockview.getGroupPanel('panel4')!;

        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeFalsy();
        expect(panel3.api.isActive).toBeFalsy();
        expect(panel4.api.isActive).toBeTruthy();

        panel1.api.setActive();

        expect(panel1.api.isActive).toBeTruthy();
        expect(panel2.api.isActive).toBeFalsy();
        expect(panel3.api.isActive).toBeFalsy();
        expect(panel4.api.isActive).toBeFalsy();

        panel2.api.setActive();

        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeTruthy();
        expect(panel3.api.isActive).toBeFalsy();
        expect(panel4.api.isActive).toBeFalsy();

        const group1 = panel1.group;

        dockview.moveGroupOrPanel({
            from: { groupId: group1.id, panelId: 'panel1' },
            to: { group: group1, position: 'right' },
        });
        const group2 = panel1.group;
        dockview.moveGroupOrPanel({
            from: { groupId: group1.id, panelId: 'panel3' },
            to: { group: group2, position: 'center' },
        });

        expect(dockview.size).toBe(2);
        expect(panel1.group).toBe(panel3.group);
        expect(panel2.group).toBe(panel4.group);
        expect(panel1.group).not.toBe(panel2.group);

        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeFalsy();
        expect(panel3.api.isActive).toBeTruthy();
        expect(panel4.api.isActive).toBeFalsy();

        panel1.api.setActive();
        expect(panel1.api.isActive).toBeTruthy();
        expect(panel2.api.isActive).toBeFalsy();
        expect(panel3.api.isActive).toBeFalsy();
        expect(panel4.api.isActive).toBeFalsy();

        panel2.api.setActive();
        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeTruthy();
        expect(panel3.api.isActive).toBeFalsy();
        expect(panel4.api.isActive).toBeFalsy();

        panel3.api.setActive();
        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeFalsy();
        expect(panel3.api.isActive).toBeTruthy();
        expect(panel4.api.isActive).toBeFalsy();

        panel4.api.setActive();
        expect(panel1.api.isActive).toBeFalsy();
        expect(panel2.api.isActive).toBeFalsy();
        expect(panel3.api.isActive).toBeFalsy();
        expect(panel4.api.isActive).toBeTruthy();
    });

    test('add a panel and move to a new group', async () => {
        dockview.layout(500, 1000);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        expect(dockview.size).toBe(1);
        expect(dockview.totalPanels).toBe(2);

        const panel1 = dockview.getGroupPanel('panel1')!;
        const panel2 = dockview.getGroupPanel('panel2')!;
        expect(panel1.group).toBe(panel2.group);

        const group = panel1.group;

        expect(group.model.size).toBe(2);
        expect(group.model.containsPanel(panel1)).toBeTruthy();
        expect(group.model.containsPanel(panel2)).toBeTruthy();
        expect(group.model.activePanel).toBe(panel2);

        expect(group.model.indexOf(panel1)).toBe(0);
        expect(group.model.indexOf(panel2)).toBe(1);

        dockview.moveGroupOrPanel({
            from: { groupId: group.id, panelId: 'panel1' },
            to: { group, position: 'right' },
        });

        expect(dockview.size).toBe(2);
        expect(dockview.totalPanels).toBe(2);

        expect(panel1.group).not.toBe(panel2.group);
        expect(panel1.group.model.size).toBe(1);
        expect(panel2.group.model.size).toBe(1);
        expect(panel1.group.model.containsPanel(panel1)).toBeTruthy();
        expect(panel2.group.model.containsPanel(panel2)).toBeTruthy();
        expect(panel1.group.model.activePanel).toBe(panel1);
        expect(panel2.group.model.activePanel).toBe(panel2);

        await panel1.api.close();

        expect(dockview.size).toBe(1);
        expect(dockview.totalPanels).toBe(1);

        await panel2.api.close();

        expect(dockview.size).toBe(0);
        expect(dockview.totalPanels).toBe(0);
    });

    test('panel content added to content-container css check', () => {
        dockview.layout(500, 1000);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        let viewQuery = container.querySelectorAll(
            '.dv-branch-node > .dv-split-view-container > .dv-view-container > .dv-view'
        );

        expect(viewQuery).toHaveLength(1);

        viewQuery = container.querySelectorAll(
            '.dv-branch-node > .dv-split-view-container > .dv-view-container > .dv-view:nth-child(1) >.dv-groupview > .dv-content-container > .testpanel-panel2'
        );

        expect(viewQuery).toHaveLength(1);

        const group = dockview.getGroupPanel('panel1')!.group;
        dockview.moveGroupOrPanel({
            from: { groupId: group.id, panelId: 'panel1' },
            to: { group, position: 'right' },
        });

        viewQuery = container.querySelectorAll(
            '.dv-branch-node > .dv-split-view-container > .dv-view-container > .dv-view'
        );

        expect(viewQuery).toHaveLength(2);

        viewQuery = container.querySelectorAll(
            '.dv-branch-node > .dv-split-view-container > .dv-view-container > .dv-view:nth-child(1) >.dv-groupview > .dv-content-container > .testpanel-panel2'
        );

        expect(viewQuery).toHaveLength(1);

        viewQuery = container.querySelectorAll(
            '.dv-branch-node > .dv-split-view-container > .dv-view-container > .dv-view:nth-child(2) >.dv-groupview > .dv-content-container > .testpanel-panel1'
        );

        expect(viewQuery).toHaveLength(1);
    });

    describe('serialization', () => {
        test('reuseExistingPanels replaces panel params rather than merging', () => {
            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 1000);

            dockview.addPanel({
                id: 'panel1',
                component: 'default',
                params: { a: 1, b: 2 },
            });

            const state = dockview.toJSON();
            // the saved state drops `b`, keeping only `a`
            (state.panels['panel1'] as any).params = { a: 9 };

            dockview.fromJSON(state, { reuseExistingPanels: true });

            // reuse must restore exactly the saved params (no stale `b: 2`),
            // matching the non-reuse deserialization path
            expect(dockview.getGroupPanel('panel1')!.params).toEqual({ a: 9 });

            dockview.dispose();
        });

        test('reuseExistingPanels true', () => {
            const parts: PanelContentPartTest[] = [];

            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            const part = new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                            parts.push(part);
                            return part;
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 1000);

            dockview.addPanel({ id: 'panel1', component: 'default' });
            dockview.addPanel({ id: 'panel2', component: 'default' });
            dockview.addPanel({ id: 'panel7', component: 'default' });

            expect(parts).toHaveLength(3);

            expect(parts.map((part) => part.isDisposed)).toEqual([
                false,
                false,
                false,
            ]);

            dockview.fromJSON(
                {
                    activeGroup: 'group-1',
                    grid: {
                        root: {
                            type: 'branch',
                            data: [
                                {
                                    type: 'leaf',
                                    data: {
                                        views: ['panel1'],
                                        id: 'group-1',
                                        activeView: 'panel1',
                                    },
                                    size: 500,
                                },
                                {
                                    type: 'branch',
                                    data: [
                                        {
                                            type: 'leaf',
                                            data: {
                                                views: ['panel2', 'panel3'],
                                                id: 'group-2',
                                            },
                                            size: 500,
                                        },
                                        {
                                            type: 'leaf',
                                            data: {
                                                views: ['panel4'],
                                                id: 'group-3',
                                            },
                                            size: 500,
                                        },
                                    ],
                                    size: 500,
                                },
                            ],
                            size: 1000,
                        },
                        height: 1000,
                        width: 1000,
                        orientation: Orientation.VERTICAL,
                    },
                    panels: {
                        panel1: {
                            id: 'panel1',
                            contentComponent: 'default',
                            tabComponent: 'tab-default',
                            title: 'panel1',
                        },
                        panel2: {
                            id: 'panel2',
                            contentComponent: 'default',
                            title: 'panel2',
                        },
                        panel3: {
                            id: 'panel3',
                            contentComponent: 'default',
                            title: 'panel3',
                            renderer: 'onlyWhenVisible',
                        },
                        panel4: {
                            id: 'panel4',
                            contentComponent: 'default',
                            title: 'panel4',
                            renderer: 'always',
                        },
                    },
                },
                { reuseExistingPanels: true }
            );

            expect(parts.map((part) => part.isDisposed)).toEqual([
                false,
                false,
                true,
                false,
                false,
            ]);
        });

        test('reuseExistingPanels false', () => {
            const parts: PanelContentPartTest[] = [];

            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            const part = new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                            parts.push(part);
                            return part;
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 1000);

            dockview.addPanel({ id: 'panel1', component: 'default' });
            dockview.addPanel({ id: 'panel2', component: 'default' });
            dockview.addPanel({ id: 'panel7', component: 'default' });

            expect(parts).toHaveLength(3);

            expect(parts.map((part) => part.isDisposed)).toEqual([
                false,
                false,
                false,
            ]);

            dockview.fromJSON({
                activeGroup: 'group-1',
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panel1'],
                                    id: 'group-1',
                                    activeView: 'panel1',
                                },
                                size: 500,
                            },
                            {
                                type: 'branch',
                                data: [
                                    {
                                        type: 'leaf',
                                        data: {
                                            views: ['panel2', 'panel3'],
                                            id: 'group-2',
                                        },
                                        size: 500,
                                    },
                                    {
                                        type: 'leaf',
                                        data: {
                                            views: ['panel4'],
                                            id: 'group-3',
                                        },
                                        size: 500,
                                    },
                                ],
                                size: 500,
                            },
                        ],
                        size: 1000,
                    },
                    height: 1000,
                    width: 1000,
                    orientation: Orientation.VERTICAL,
                },
                panels: {
                    panel1: {
                        id: 'panel1',
                        contentComponent: 'default',
                        tabComponent: 'tab-default',
                        title: 'panel1',
                    },
                    panel2: {
                        id: 'panel2',
                        contentComponent: 'default',
                        title: 'panel2',
                    },
                    panel3: {
                        id: 'panel3',
                        contentComponent: 'default',
                        title: 'panel3',
                        renderer: 'onlyWhenVisible',
                    },
                    panel4: {
                        id: 'panel4',
                        contentComponent: 'default',
                        title: 'panel4',
                        renderer: 'always',
                    },
                },
            });

            expect(parts.map((part) => part.isDisposed)).toEqual([
                true,
                true,
                true,
                false,
                false,
                false,
                false,
            ]);
        });

        test('basic', () => {
            dockview.layout(1000, 1000);

            dockview.fromJSON({
                activeGroup: 'group-1',
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panel1'],
                                    id: 'group-1',
                                    activeView: 'panel1',
                                },
                                size: 500,
                            },
                            {
                                type: 'branch',
                                data: [
                                    {
                                        type: 'leaf',
                                        data: {
                                            views: ['panel2', 'panel3'],
                                            id: 'group-2',
                                        },
                                        size: 500,
                                    },
                                    {
                                        type: 'leaf',
                                        data: {
                                            views: ['panel4'],
                                            id: 'group-3',
                                        },
                                        size: 500,
                                    },
                                ],
                                size: 250,
                            },
                            {
                                type: 'leaf',
                                data: { views: ['panel5'], id: 'group-4' },
                                size: 250,
                            },
                        ],
                        size: 1000,
                    },
                    height: 1000,
                    width: 1000,
                    orientation: Orientation.VERTICAL,
                },
                panels: {
                    panel1: {
                        id: 'panel1',
                        contentComponent: 'default',
                        tabComponent: 'tab-default',
                        title: 'panel1',
                    },
                    panel2: {
                        id: 'panel2',
                        contentComponent: 'default',
                        title: 'panel2',
                    },
                    panel3: {
                        id: 'panel3',
                        contentComponent: 'default',
                        title: 'panel3',
                        renderer: 'onlyWhenVisible',
                    },
                    panel4: {
                        id: 'panel4',
                        contentComponent: 'default',
                        title: 'panel4',
                        renderer: 'always',
                    },
                    panel5: {
                        id: 'panel5',
                        contentComponent: 'default',
                        title: 'panel5',
                        minimumHeight: 100,
                        maximumHeight: 1000,
                        minimumWidth: 200,
                        maximumWidth: 2000,
                    },
                },
            });

            expect(JSON.parse(JSON.stringify(dockview.toJSON()))).toEqual({
                activeGroup: 'group-1',
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panel1'],
                                    id: 'group-1',
                                    activeView: 'panel1',
                                },
                                size: 500,
                            },
                            {
                                type: 'branch',
                                data: [
                                    {
                                        type: 'leaf',
                                        data: {
                                            views: ['panel2', 'panel3'],
                                            id: 'group-2',
                                            activeView: 'panel3',
                                        },
                                        size: 500,
                                    },
                                    {
                                        type: 'leaf',
                                        data: {
                                            views: ['panel4'],
                                            id: 'group-3',
                                            activeView: 'panel4',
                                        },
                                        size: 500,
                                    },
                                ],
                                size: 250,
                            },
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panel5'],
                                    id: 'group-4',
                                    activeView: 'panel5',
                                },
                                size: 250,
                            },
                        ],
                        size: 1000,
                    },
                    height: 1000,
                    width: 1000,
                    orientation: Orientation.VERTICAL,
                },
                panels: {
                    panel1: {
                        id: 'panel1',
                        contentComponent: 'default',
                        tabComponent: 'tab-default',
                        title: 'panel1',
                    },
                    panel2: {
                        id: 'panel2',
                        contentComponent: 'default',
                        title: 'panel2',
                    },
                    panel3: {
                        id: 'panel3',
                        contentComponent: 'default',
                        title: 'panel3',
                        renderer: 'onlyWhenVisible',
                    },
                    panel4: {
                        id: 'panel4',
                        contentComponent: 'default',
                        title: 'panel4',
                        renderer: 'always',
                    },
                    panel5: {
                        id: 'panel5',
                        contentComponent: 'default',
                        title: 'panel5',
                        minimumHeight: 100,
                        maximumHeight: 1000,
                        minimumWidth: 200,
                        maximumWidth: 2000,
                    },
                },
            });
        });

        test('serialized layout with maximized node', () => {
            const api = new DockviewApi(dockview);

            api.layout(500, 1000);

            api.addPanel({
                id: 'panel1',
                component: 'default',
            });

            api.addPanel({
                id: 'panel2',
                component: 'default',
                position: { direction: 'right' },
            });

            api.addPanel({
                id: 'panel3',
                component: 'default',
                position: { direction: 'below' },
            });

            const panel4 = api.addPanel({
                id: 'panel4',
                component: 'default',
            });

            panel4.api.maximize();
            expect(panel4.api.isMaximized()).toBeTruthy();

            const state = api.toJSON();
            expect(api.hasMaximizedGroup()).toBeTruthy();
            expect(panel4.api.isMaximized()).toBeTruthy();

            api.clear();
            expect(api.groups).toHaveLength(0);
            expect(api.panels).toHaveLength(0);

            api.fromJSON(state);
            const newPanel4 = api.getPanel('panel4')!;
            expect(api.hasMaximizedGroup()).toBeTruthy();
            expect(newPanel4.api.isMaximized()).toBeTruthy();

            expect(state).toEqual(api.toJSON());
        });

        test('always visible renderer positioning after fromJSON', async () => {
            dockview.layout(1000, 1000);

            // Create a layout with both onlyWhenVisible and always visible panels
            dockview.fromJSON({
                activeGroup: 'group-1',
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panel1', 'panel2'],
                                    id: 'group-1',
                                    activeView: 'panel1',
                                },
                                size: 500,
                            },
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panel3'],
                                    id: 'group-2',
                                    activeView: 'panel3',
                                },
                                size: 500,
                            },
                        ],
                        size: 1000,
                    },
                    height: 1000,
                    width: 1000,
                    orientation: Orientation.HORIZONTAL,
                },
                panels: {
                    panel1: {
                        id: 'panel1',
                        contentComponent: 'default',
                        title: 'panel1',
                        renderer: 'onlyWhenVisible',
                    },
                    panel2: {
                        id: 'panel2',
                        contentComponent: 'default',
                        title: 'panel2',
                        renderer: 'always',
                    },
                    panel3: {
                        id: 'panel3',
                        contentComponent: 'default',
                        title: 'panel3',
                        renderer: 'always',
                    },
                },
            });

            // Wait for next animation frame to ensure positioning is complete
            await new Promise((resolve) => requestAnimationFrame(resolve));

            const panel2 = dockview.getGroupPanel('panel2')!;
            const panel3 = dockview.getGroupPanel('panel3')!;

            const overlayContainer = dockview.overlayRenderContainer;

            expect(panel2.api.renderer).toBe('always');
            expect(panel3.api.renderer).toBe('always');

            const panel2Overlay = overlayContainer.element.querySelector(
                '[data-panel-id]'
            ) as HTMLElement;
            const panel3Overlay = overlayContainer.element.querySelector(
                '[data-panel-id]:not(:first-child)'
            ) as HTMLElement;

            if (panel2Overlay) {
                const style = getComputedStyle(panel2Overlay);
                expect(style.position).toBe('absolute');
                expect(style.left).not.toBe('0px');
                expect(style.top).not.toBe('0px');
                expect(style.width).not.toBe('0px');
                expect(style.height).not.toBe('0px');
            }

            const updateSpy = jest.spyOn(
                overlayContainer,
                'updateAllPositions'
            );

            dockview.fromJSON(dockview.toJSON());

            await new Promise((resolve) => requestAnimationFrame(resolve));

            expect(updateSpy).toHaveBeenCalled();

            updateSpy.mockRestore();
        });

        test('serialization round-trip preserves headerPosition', () => {
            dockview.layout(1000, 1000);

            dockview.fromJSON({
                activeGroup: 'group-1',
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panel1'],
                                    id: 'group-1',
                                    activeView: 'panel1',
                                    headerPosition: 'left',
                                },
                                size: 500,
                            },
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panel2'],
                                    id: 'group-2',
                                    activeView: 'panel2',
                                },
                                size: 500,
                            },
                        ],
                        size: 1000,
                    },
                    height: 1000,
                    width: 1000,
                    orientation: Orientation.VERTICAL,
                },
                panels: {
                    panel1: {
                        id: 'panel1',
                        contentComponent: 'default',
                        title: 'panel1',
                    },
                    panel2: {
                        id: 'panel2',
                        contentComponent: 'default',
                        title: 'panel2',
                    },
                },
            });

            const group1 = dockview.groups.find((g) => g.api.id === 'group-1')!;
            expect(group1.api.getHeaderPosition()).toBe('left');

            const group2 = dockview.groups.find((g) => g.api.id === 'group-2')!;
            expect(group2.api.getHeaderPosition()).toBe('top');

            const result = dockview.toJSON();
            const group1Data = (result.grid.root as any).data.find(
                (d: any) => d.data?.id === 'group-1'
            );
            expect(group1Data.data.headerPosition).toBe('left');

            const group2Data = (result.grid.root as any).data.find(
                (d: any) => d.data?.id === 'group-2'
            );
            expect(group2Data.data.headerPosition).toBeUndefined();
        });

        test('defaultHeaderPosition applies to new groups', () => {
            const dv = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error('unsupported');
                    }
                },
                defaultHeaderPosition: 'bottom',
            });
            dv.layout(1000, 1000);

            dv.addPanel({ id: 'panel1', component: 'default' });
            expect(dv.groups[0].api.getHeaderPosition()).toBe('bottom');

            dv.dispose();
        });

        test('explicit headerPosition overrides defaultHeaderPosition via api', () => {
            const dv = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error('unsupported');
                    }
                },
                defaultHeaderPosition: 'bottom',
            });
            dv.layout(1000, 1000);

            dv.addPanel({ id: 'panel1', component: 'default' });
            expect(dv.groups[0].api.getHeaderPosition()).toBe('bottom');

            dv.groups[0].api.setHeaderPosition('left');
            expect(dv.groups[0].api.getHeaderPosition()).toBe('left');

            dv.dispose();
        });
    });

    test('add panel', () => {
        dockview.layout(500, 1000);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        const panel1 = dockview.getGroupPanel('panel1');

        expect(panel1!.api.id).toBe('panel1');
        expect(panel1!.api.isVisible).toBeTruthy();
        expect(panel1!.api.isActive).toBeTruthy();
        // expect(panel1?.api.isFocused).toBeTruthy();
        expect(panel1!.api.height).toBe(1000);
        expect(panel1!.api.width).toBe(500);
        expect(panel1!.api.group).toBe(panel1?.group);
        expect(panel1!.api.group.isActive).toBeTruthy();
        expect(panel1!.api.isGroupActive).toBeTruthy();

        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        expect(panel1?.api.isActive).toBeFalsy();
        // expect(panel1?.api.isFocused).toBeFalsy();
        expect(panel1?.api.isVisible).toBeFalsy();
        expect(panel1!.api.isGroupActive).toBeTruthy();
        expect(panel1!.api.group.isActive).toBeTruthy();

        const panel2 = dockview.getGroupPanel('panel2');

        expect(panel2!.api.id).toBe('panel2');
        expect(panel2!.api.isVisible).toBeTruthy();
        expect(panel2!.api.isActive).toBeTruthy();
        // expect(panel2?.api.isFocused).toBeTruthy();
        expect(panel2!.api.height).toBe(1000);
        expect(panel2!.api.width).toBe(500);
        expect(panel2!.api.group).toBe(panel2?.group);
        expect(panel2!.api.isGroupActive).toBeTruthy();
        expect(panel2!.api.group.isActive).toBeTruthy();

        dockview.addPanel({
            id: 'panel3',
            component: 'default',
            position: { referencePanel: 'panel1', direction: 'right' },
        });

        expect(panel1!.api.isActive).toBeFalsy();
        expect(panel1!.api.isVisible).toBeFalsy();
        expect(panel1!.api.isGroupActive).toBeFalsy();
        expect(panel1!.api.group.isActive).toBeFalsy();
        expect(panel2!.api.isActive).toBeFalsy();
        expect(panel2!.api.isVisible).toBeTruthy();
        expect(panel2!.api.isGroupActive).toBeFalsy();
        expect(panel2!.api.group.isActive).toBeFalsy();

        const panel3 = dockview.getGroupPanel('panel3');

        expect(panel3!.api.isActive).toBeTruthy();
        expect(panel3!.api.isGroupActive).toBeTruthy();
        expect(panel3!.api.group.isActive).toBeTruthy();

        dockview.setActivePanel(panel1!);

        expect(panel1!.api.isActive).toBeTruthy();
        expect(panel1!.api.isVisible).toBeTruthy();
        expect(panel1!.api.isGroupActive).toBeTruthy();
        expect(panel1!.api.group.isActive).toBeTruthy();
        expect(panel2!.api.isActive).toBeFalsy();
        expect(panel2!.api.isVisible).toBeFalsy();
        expect(panel2!.api.isGroupActive).toBeTruthy();
        expect(panel2!.api.group.isActive).toBeTruthy();
        expect(panel3!.api.isActive).toBeFalsy();
        expect(panel3!.api.isVisible).toBeTruthy();
        expect(panel3!.api.isGroupActive).toBeFalsy();
        expect(panel3!.api.group.isActive).toBeFalsy();
    });

    test('toJSON shouldnt fire any layout events', () => {
        dockview.layout(1000, 1000);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel4',
            component: 'default',
        });

        const disposable = dockview.onDidLayoutChange(() => {
            fail('onDidLayoutChange shouldnt have been called');
        });

        const result = dockview.toJSON();
        expect(result).toBeTruthy();

        disposable.dispose();
    });

    test('totalPanels is updated before panel event fires', () => {
        dockview.layout(1000, 1000);

        let counter = 0;

        const disposable = new CompositeDisposable(
            dockview.onDidAddPanel(() => {
                counter++;
                expect(counter).toBe(dockview.totalPanels);
            }),
            dockview.onDidRemovePanel(() => {
                counter--;
                expect(counter).toBe(dockview.totalPanels);
            })
        );

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { referencePanel: 'panel1', direction: 'within' },
        });

        const panel3 = dockview.addPanel({
            id: 'panel3',
            component: 'default',
            position: { referencePanel: 'panel1', direction: 'right' },
        });

        dockview.removePanel(panel1);
        dockview.removePanel(panel3);
        dockview.removePanel(panel2);

        disposable.dispose();
    });

    test('size is updated before group event fires', () => {
        dockview.layout(1000, 1000);

        let counter = 0;

        const disposable = new CompositeDisposable(
            dockview.onDidAddGroup(() => {
                counter++;
                expect(counter).toBe(dockview.size);
            }),
            dockview.onDidRemoveGroup(() => {
                counter--;
                expect(counter).toBe(dockview.size);
            })
        );

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { referencePanel: 'panel1', direction: 'within' },
        });

        const panel3 = dockview.addPanel({
            id: 'panel3',
            component: 'default',
            position: { referencePanel: 'panel1', direction: 'right' },
        });

        dockview.removePanel(panel1);
        dockview.removePanel(panel3);
        dockview.removePanel(panel2);

        disposable.dispose();
    });

    test('events flow', async () => {
        window.open = () => setupMockWindow();

        dockview.layout(1000, 1000);

        let events: {
            panel?: IDockviewPanel;
            group?: DockviewGroupPanel | undefined;
            type: string;
        }[] = [];

        const disposable = new CompositeDisposable(
            dockview.onDidAddGroup((group) => {
                events.push({ type: 'ADD_GROUP', group });
            }),
            dockview.onDidActiveGroupChange((group) => {
                events.push({ type: 'ACTIVE_GROUP', group });
            }),
            dockview.onDidRemoveGroup((group) => {
                events.push({ type: 'REMOVE_GROUP', group });
            }),
            dockview.onDidAddPanel((panel) => {
                events.push({ type: 'ADD_PANEL', panel });
            }),
            dockview.onDidRemovePanel((panel) => {
                events.push({ type: 'REMOVE_PANEL', panel });
            }),
            dockview.onDidActivePanelChange(({ panel }) => {
                events.push({ type: 'ACTIVE_PANEL', panel });
            }),
            dockview.onDidMovePanel(({ panel }) => {
                events.push({ type: 'MOVE_PANEL', panel });
            })
        );

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        expect(panel1.group).toBeTruthy();

        expect(events).toEqual([
            { type: 'ADD_GROUP', group: panel1.group },
            { type: 'ADD_PANEL', panel: panel1 },
            { type: 'ACTIVE_GROUP', group: panel1.group },
            { type: 'ACTIVE_PANEL', panel: panel1 },
        ]);

        events = [];
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        expect(events).toEqual([
            { type: 'ADD_PANEL', panel: panel2 },
            { type: 'ACTIVE_PANEL', panel: panel2 },
        ]);

        events = [];
        const panel3 = dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });
        expect(events).toEqual([
            { type: 'ADD_PANEL', panel: panel3 },
            { type: 'ACTIVE_PANEL', panel: panel3 },
        ]);

        events = [];
        dockview.removePanel(panel1);
        expect(events).toEqual([{ type: 'REMOVE_PANEL', panel: panel1 }]);

        events = [];
        dockview.removePanel(panel3);
        expect(events).toEqual([
            { type: 'REMOVE_PANEL', panel: panel3 },
            { type: 'ACTIVE_PANEL', panel: panel2 },
        ]);

        events = [];
        const panel4 = dockview.addPanel({
            id: 'panel4',
            component: 'default',
            position: { referencePanel: panel2.id, direction: 'right' },
        });

        expect(panel4.group).toBeTruthy();
        expect(panel4.group).not.toBe(panel1.group);

        expect(events).toEqual([
            { type: 'ADD_GROUP', group: panel4.group },
            { type: 'ADD_PANEL', panel: panel4 },
            { type: 'ACTIVE_GROUP', group: panel4.group },
            { type: 'ACTIVE_PANEL', panel: panel4 },
        ]);

        events = [];
        const panel5 = dockview.addPanel({
            id: 'panel5',
            component: 'default',
            position: { referencePanel: panel4.id, direction: 'within' },
        });
        expect(events).toEqual([
            { type: 'ADD_PANEL', panel: panel5 },
            { type: 'ACTIVE_PANEL', panel: panel5 },
        ]);

        events = [];
        dockview.moveGroupOrPanel({
            from: { groupId: panel5.group.id, panelId: panel5.id },
            to: { group: panel2.group, position: 'center' },
        });

        expect(events).toEqual([
            { type: 'ACTIVE_GROUP', group: panel2.group },
            { type: 'MOVE_PANEL', panel: panel5 },
        ]);

        events = [];

        const groupReferenceBeforeMove = panel4.group;

        dockview.moveGroupOrPanel({
            from: { groupId: panel4.group.id, panelId: panel4.id },
            to: { group: panel2.group, position: 'center' },
        });

        expect(events).toEqual([
            { type: 'REMOVE_GROUP', group: groupReferenceBeforeMove },
            { type: 'ACTIVE_PANEL', panel: panel4 },
            { type: 'MOVE_PANEL', panel: panel4 },
        ]);

        for (const panel of dockview.panels) {
            panel.api.close();
        }

        events = [];

        const panel6 = dockview.addPanel({
            id: 'panel6',
            component: 'default',
            floating: true,
        });
        const panel6Group = panel6.group;

        expect(events).toEqual([
            { type: 'ADD_GROUP', group: panel6.group },
            { type: 'ADD_PANEL', panel: panel6 },
            { type: 'ACTIVE_GROUP', group: panel6.group },
            { type: 'ACTIVE_PANEL', panel: panel6 },
        ]);

        events = [];

        const panel7 = dockview.addPanel({
            id: 'panel7',
            component: 'default',
            floating: true,
        });
        const panel7Group = panel7.group;

        expect(events).toEqual([
            { type: 'ADD_GROUP', group: panel7.group },
            { type: 'ADD_PANEL', panel: panel7 },
            { type: 'ACTIVE_GROUP', group: panel7.group },
            { type: 'ACTIVE_PANEL', panel: panel7 },
        ]);

        expect(dockview.activePanel === panel7).toBeTruthy();

        events = [];
        panel7.api.close();

        expect(events).toEqual([
            { type: 'REMOVE_PANEL', panel: panel7 },
            { type: 'REMOVE_GROUP', group: panel7Group },
            { type: 'ACTIVE_GROUP', group: panel6.group },
            { type: 'ACTIVE_PANEL', panel: panel6 },
        ]);

        events = [];
        panel6.api.close();

        expect(events).toEqual([
            { type: 'REMOVE_PANEL', panel: panel6 },
            { type: 'REMOVE_GROUP', group: panel6Group },
            { type: 'ACTIVE_GROUP', group: undefined },
            { type: 'ACTIVE_PANEL', group: undefined },
        ]);

        expect(dockview.size).toBe(0);
        expect(dockview.totalPanels).toBe(0);

        events = [];

        const panel8 = dockview.addPanel({
            id: 'panel8',
            component: 'default',
        });
        const panel9 = dockview.addPanel({
            id: 'panel9',
            component: 'default',
            floating: true,
        });
        const panel10 = dockview.addPanel({
            id: 'panel10',
            component: 'default',
        });

        expect(await dockview.addPopoutGroup(panel10)).toBeTruthy();

        expect(events).toEqual([
            { type: 'ADD_GROUP', group: panel8.group },
            { type: 'ADD_PANEL', panel: panel8 },
            { type: 'ACTIVE_GROUP', group: panel8.group },
            { type: 'ACTIVE_PANEL', panel: panel8 },
            { type: 'ADD_GROUP', group: panel9.group },
            { type: 'ADD_PANEL', panel: panel9 },
            { type: 'ACTIVE_GROUP', group: panel9.group },
            { type: 'ACTIVE_PANEL', panel: panel9 },
            { type: 'ADD_PANEL', panel: panel10 },
            { type: 'ACTIVE_PANEL', panel: panel10 },
            { type: 'ADD_GROUP', group: panel10.group },
        ]);

        events = [];
        disposable.dispose();

        expect(events).toHaveLength(0);
    });

    test('that removing a panel from a group reflects in the dockviewcomponent when searching for a panel', () => {
        dockview.layout(500, 500);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        expect(dockview.getGroupPanel('panel1')).toEqual(panel1);
        expect(dockview.getGroupPanel('panel2')).toEqual(panel2);

        panel1.group.model.removePanel(panel1);

        expect(dockview.getGroupPanel('panel1')).toBeUndefined();
        expect(dockview.getGroupPanel('panel2')).toEqual(panel2);

        dockview.removePanel(panel2);

        expect(dockview.getGroupPanel('panel1')).toBeUndefined();
        expect(dockview.getGroupPanel('panel2')).toBeUndefined();
    });

    test('#1', () => {
        dockview.layout(500, 500);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        const panel3 = dockview.addPanel({
            id: 'panel3',
            component: 'default',
            position: { referencePanel: 'panel2', direction: 'below' },
        });

        const removedGroups: DockviewGroupPanel[] = [];
        const removedPanels: IDockviewPanel[] = [];

        const disposable = new CompositeDisposable(
            dockview.onDidRemoveGroup((group) => {
                removedGroups.push(group);
            }),
            dockview.onDidRemovePanel((panel) => {
                removedPanels.push(panel);
            })
        );

        dockview.fromJSON({
            grid: {
                height: 500,
                width: 500,
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['view_1', 'view_2'],
                                id: 'group_1',
                            },
                        },
                        {
                            type: 'leaf',
                            data: { views: ['view_3'], id: 'group_2' },
                        },
                    ],
                },
            },
            panels: {
                view_1: {
                    id: 'view_1',
                    contentComponent: 'default',
                    title: 'view_1_title',
                },
                view_2: {
                    id: 'view_2',
                    contentComponent: 'default',
                    title: 'view_2_title',
                },
                view_3: {
                    id: 'view_3',
                    contentComponent: 'default',
                    title: 'view_3_title',
                },
            },
        });

        expect(removedGroups).toHaveLength(2);
        expect(removedPanels).toHaveLength(3);

        disposable.dispose();
    });

    test('dispose of dockviewComponent', () => {
        dockview.layout(500, 1000);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });
        dockview.addPanel({
            id: 'panel4',
            component: 'default',
        });

        expect(container.childNodes).toHaveLength(1);

        dockview.dispose();

        expect(container.childNodes).toHaveLength(0);
    });

    test('panel is disposed of when closed', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(500, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
            tabComponent: 'default',
        });

        const panel1Spy = jest.spyOn(panel1, 'dispose');

        expect(panel1Spy).not.toHaveBeenCalled();

        panel1.api.close();

        expect(panel1Spy).toHaveBeenCalledTimes(1);
    });

    test('can add panel of same id if already removed', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(500, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
            tabComponent: 'default',
        });

        expect(dockview.totalPanels).toBe(1);

        panel1.api.close();

        expect(dockview.totalPanels).toBe(0);

        const panel1Again = dockview.addPanel({
            id: 'panel1',
            component: 'default',
            tabComponent: 'default',
        });

        expect(dockview.totalPanels).toBe(1);

        panel1Again.api.close();

        expect(dockview.totalPanels).toBe(0);
    });

    test('panel is disposed of when removed', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(500, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
            tabComponent: 'default',
        });

        const panel1Spy = jest.spyOn(panel1, 'dispose');

        expect(panel1Spy).not.toHaveBeenCalled();

        dockview.removePanel(panel1);

        expect(panel1Spy).toHaveBeenCalledTimes(1);
    });

    test('panel is not disposed of when moved to a new group', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(500, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
            tabComponent: 'default',
        });

        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            tabComponent: 'default',
            position: {
                referencePanel: 'panel1',
                direction: 'right',
            },
        });

        const panel1Spy = jest.spyOn(panel1, 'dispose');
        const panel2Spy = jest.spyOn(panel2, 'dispose');

        dockview.moveGroupOrPanel({
            from: { groupId: panel2.group.id, panelId: 'panel2' },
            to: { group: panel1.group, position: 'left' },
        });

        expect(panel1Spy).not.toHaveBeenCalled();
        expect(panel2Spy).not.toHaveBeenCalled();
    });

    test('panel is not disposed of when moved within another group', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(500, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
            tabComponent: 'default',
        });

        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            tabComponent: 'default',
            position: {
                referencePanel: 'panel1',
                direction: 'right',
            },
        });

        const panel1Spy = jest.spyOn(panel1, 'dispose');
        const panel2Spy = jest.spyOn(panel2, 'dispose');

        dockview.moveGroupOrPanel({
            from: { groupId: panel2.group.id, panelId: 'panel2' },
            to: { group: panel1.group, position: 'center' },
        });

        expect(panel1Spy).not.toHaveBeenCalled();
        expect(panel2Spy).not.toHaveBeenCalled();
    });

    test('panel is not disposed of when moved within another group', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(500, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
            tabComponent: 'default',
        });

        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            tabComponent: 'default',
        });

        expect(panel1.group).toEqual(panel2.group);

        const panel1Spy = jest.spyOn(panel1, 'dispose');
        const panel2Spy = jest.spyOn(panel2, 'dispose');

        dockview.moveGroupOrPanel({
            from: { groupId: panel1.group.id, panelId: 'panel1' },
            to: { group: panel1.group, position: 'center', index: 0 },
        });

        expect(panel1Spy).not.toHaveBeenCalled();
        expect(panel2Spy).not.toHaveBeenCalled();
    });

    test('panel is disposed of when group is disposed', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(500, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
            tabComponent: 'default',
        });

        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            tabComponent: 'default',
        });

        expect(panel1.group).toEqual(panel2.group);

        const panel1Spy = jest.spyOn(panel1, 'dispose');
        const panel2Spy = jest.spyOn(panel2, 'dispose');

        dockview.removeGroup(panel1.group);

        expect(panel1Spy).toHaveBeenCalledTimes(1);
        expect(panel2Spy).toHaveBeenCalledTimes(1);
    });

    test('panel is disposed of when component is disposed', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(500, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
            tabComponent: 'default',
        });

        // const panel2 = dockview.addPanel({
        //     id: 'panel2',
        //     component: 'default',
        //     tabComponent: 'default',
        // });

        // expect(panel1.group).toEqual(panel2.group);

        const panel1Spy = jest.spyOn(panel1, 'dispose');
        // const panel2Spy = jest.spyOn(panel2, 'dispose');

        dockview.dispose();

        expect(panel1Spy).toHaveBeenCalledTimes(1);
        // expect(panel2Spy).toHaveBeenCalledTimes(1);
    });

    test('panel is disposed of when from JSON is called', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(500, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
            tabComponent: 'default',
        });

        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            tabComponent: 'default',
        });

        expect(panel1.group).toEqual(panel2.group);

        const groupSpy = jest.spyOn(panel1.group, 'dispose');
        const panel1Spy = jest.spyOn(panel1, 'dispose');
        const panel2Spy = jest.spyOn(panel2, 'dispose');

        dockview.fromJSON({
            grid: {
                height: 0,
                width: 0,
                root: { type: 'branch', data: [] },
                orientation: Orientation.HORIZONTAL,
            },
            panels: {},
        });

        expect(groupSpy).toHaveBeenCalledTimes(1);
        expect(panel1Spy).toHaveBeenCalledTimes(1);
        expect(panel2Spy).toHaveBeenCalledTimes(1);
    });

    test('move entire group into another group', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(500, 1000);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
            tabComponent: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            tabComponent: 'default',
            position: {
                referencePanel: panel1,
            },
        });
        const panel3 = dockview.addPanel({
            id: 'panel3',
            component: 'default',
            tabComponent: 'default',
            position: {
                referencePanel: panel1,
                direction: 'right',
            },
        });

        const panel1Spy = jest.spyOn(panel1.group, 'dispose');

        expect(dockview.groups).toHaveLength(2);

        dockview.moveGroupOrPanel({
            from: { groupId: panel1.group.id },
            to: { group: panel3.group, position: 'center' },
        });

        expect(dockview.groups).toHaveLength(1);
        expect(panel1Spy).toHaveBeenCalledTimes(1);
    });

    test('fromJSON events should still fire', () => {
        jest.useFakeTimers();

        dockview.layout(1000, 1000);

        let addGroup: DockviewGroupPanel[] = [];
        let removeGroup: DockviewGroupPanel[] = [];
        let activeGroup: (DockviewGroupPanel | undefined)[] = [];
        let addPanel: IDockviewPanel[] = [];
        let removePanel: IDockviewPanel[] = [];
        let activePanel: (IDockviewPanel | undefined)[] = [];
        let movedPanels: IDockviewPanel[] = [];
        let layoutChange = 0;
        let layoutChangeFromJson = 0;

        const disposable = new CompositeDisposable(
            dockview.onDidAddGroup((panel) => {
                addGroup.push(panel);
            }),
            dockview.onDidRemoveGroup((panel) => {
                removeGroup.push(panel);
            }),
            dockview.onDidActiveGroupChange((event) => {
                activeGroup.push(event);
            }),
            dockview.onDidAddPanel((panel) => {
                addPanel.push(panel);
            }),
            dockview.onDidRemovePanel((panel) => {
                removePanel.push(panel);
            }),
            dockview.onDidActivePanelChange((event) => {
                activePanel.push(event.panel);
            }),
            dockview.onDidMovePanel((event) => {
                movedPanels.push(event.panel);
            }),
            dockview.onDidLayoutChange(() => {
                layoutChange++;
            }),
            dockview.onDidLayoutFromJSON(() => {
                layoutChangeFromJson++;
            })
        );

        dockview.fromJSON({
            activeGroup: 'group-1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: 'group-1',
                                activeView: 'panel1',
                            },
                            size: 500,
                        },
                        {
                            type: 'branch',
                            data: [
                                {
                                    type: 'leaf',
                                    data: {
                                        views: ['panel2', 'panel3'],
                                        id: 'group-2',
                                    },
                                    size: 500,
                                },
                                {
                                    type: 'leaf',
                                    data: { views: ['panel4'], id: 'group-3' },
                                    size: 500,
                                },
                            ],
                            size: 250,
                        },
                        {
                            type: 'leaf',
                            data: { views: ['panel5'], id: 'group-4' },
                            size: 250,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.VERTICAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    title: 'panel2',
                },
                panel3: {
                    id: 'panel3',
                    contentComponent: 'default',
                    title: 'panel3',
                },
                panel4: {
                    id: 'panel4',
                    contentComponent: 'default',
                    title: 'panel4',
                },
                panel5: {
                    id: 'panel5',
                    contentComponent: 'default',
                    title: 'panel5',
                },
            },
        });

        jest.runAllTimers();

        expect(addGroup).toHaveLength(4);
        expect(removeGroup).toHaveLength(0);
        expect(activeGroup).toHaveLength(1);
        expect(addPanel).toHaveLength(5);
        expect(removePanel).toHaveLength(0);
        expect(activePanel).toHaveLength(1);
        expect(movedPanels).toHaveLength(0);
        expect(layoutChange).toBe(1);
        expect(layoutChangeFromJson).toBe(1);

        addGroup = [];
        removeGroup = [];
        activeGroup = [];
        addPanel = [];
        removePanel = [];
        activePanel = [];
        layoutChange = 0;
        layoutChangeFromJson = 0;

        dockview.fromJSON({
            grid: {
                root: {
                    type: 'branch',
                    data: [],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.VERTICAL,
            },
            panels: {},
        });

        jest.runAllTimers();

        expect(addGroup).toHaveLength(0);
        expect(removeGroup).toHaveLength(4);
        expect(activeGroup).toHaveLength(1);
        expect(addPanel).toHaveLength(0);
        expect(removePanel).toHaveLength(5);
        expect(activePanel).toHaveLength(1);
        expect(movedPanels).toHaveLength(0);
        expect(layoutChange).toBe(1);
        expect(layoutChangeFromJson).toBe(1);

        return disposable.dispose();
    });

    test('load a layout with a non-existant tab id', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });
        dockview.fromJSON({
            activeGroup: 'group-1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: 'group-1',
                                activeView: 'panel1',
                            },
                            size: 500,
                        },
                        {
                            type: 'branch',
                            data: [
                                {
                                    type: 'leaf',
                                    data: {
                                        views: ['panel2', 'panel3'],
                                        id: 'group-2',
                                    },
                                    size: 500,
                                },
                                {
                                    type: 'leaf',
                                    data: { views: ['panel4'], id: 'group-3' },
                                    size: 500,
                                },
                            ],
                            size: 250,
                        },
                        {
                            type: 'leaf',
                            data: { views: ['panel5'], id: 'group-4' },
                            size: 250,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.VERTICAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    tabComponent: '__non__existant_tab__',
                    title: 'panel2',
                },
                panel3: {
                    id: 'panel3',
                    contentComponent: 'default',
                    title: 'panel3',
                },
                panel4: {
                    id: 'panel4',
                    contentComponent: 'default',
                    title: 'panel4',
                },
                panel5: {
                    id: 'panel5',
                    contentComponent: 'default',
                    title: 'panel5',
                },
            },
        });
    });

    test('load and persist layout with custom tab header', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 1000);

        dockview.fromJSON({
            activeGroup: 'group-1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: 'group-1',
                                activeView: 'panel1',
                            },
                            size: 500,
                        },
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel2'],
                                id: 'group-2',
                                activeView: 'panel2',
                            },

                            size: 500,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.VERTICAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',

                    title: 'panel1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    tabComponent: 'default',
                    title: 'panel2',
                },
            },
        });

        expect(JSON.parse(JSON.stringify(dockview.toJSON()))).toEqual({
            activeGroup: 'group-1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: 'group-1',
                                activeView: 'panel1',
                            },
                            size: 500,
                        },
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel2'],
                                id: 'group-2',
                                activeView: 'panel2',
                            },
                            size: 500,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.VERTICAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    tabComponent: 'default',
                    title: 'panel2',
                },
            },
        });
    });

    test('#2', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createTabComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelTabPartTest(options.id, options.name);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });
        dockview.fromJSON({
            activeGroup: 'group-1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: 'group-1',
                                activeView: 'panel1',
                            },
                            size: 500,
                        },
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel2', 'panel3'],
                                id: 'group-2',
                                activeView: 'panel2',
                            },

                            size: 500,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.VERTICAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    tabComponent: 'default',
                    title: 'panel2',
                },
                panel3: {
                    id: 'panel3',
                    contentComponent: 'default',
                    title: 'panel3',
                },
            },
        });

        const group = dockview.getGroupPanel('panel2')!.api.group;

        const viewQuery = group.element.querySelectorAll(
            '.dv-groupview > .dv-tabs-and-actions-container > .dv-scrollable > .dv-tabs-container > .dv-tab'
        );
        expect(viewQuery).toHaveLength(2);

        const viewQuery2 = group.element.querySelectorAll(
            '.dv-groupview > .dv-tabs-and-actions-container > .dv-scrollable > .dv-tabs-container > .dv-tab > .dv-default-tab'
        );
        expect(viewQuery2).toHaveLength(1);

        const viewQuery3 = group.element.querySelectorAll(
            '.dv-groupview > .dv-tabs-and-actions-container > .dv-scrollable > .dv-tabs-container > .dv-tab > .panel-tab-part-panel2'
        );
        expect(viewQuery3).toHaveLength(1);
    });

    // load a layout with a default tab identifier when react default is present

    // load a layout with invialid panel identifier

    test('orthogonal realigment #1', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 1000);

        expect(dockview.orientation).toBe(Orientation.HORIZONTAL);

        dockview.fromJSON({
            activeGroup: 'group-1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: 'group-1',
                                activeView: 'panel1',
                            },
                            size: 500,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.VERTICAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
            },
        });

        expect(dockview.orientation).toBe(Orientation.VERTICAL);

        dockview.addPanel({
            id: 'panel2',
            component: 'default',
            position: {
                direction: 'left',
            },
        });

        expect(dockview.orientation).toBe(Orientation.HORIZONTAL);

        expect(JSON.parse(JSON.stringify(dockview.toJSON()))).toEqual({
            activeGroup: '1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel2'],
                                id: '1',
                                activeView: 'panel2',
                            },
                            size: 500,
                        },
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: 'group-1',
                                activeView: 'panel1',
                            },
                            size: 500,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.HORIZONTAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    title: 'panel2',
                },
            },
        });
    });

    test('orthogonal realigment #2', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 1000);

        expect(dockview.orientation).toBe(Orientation.HORIZONTAL);

        dockview.fromJSON({
            activeGroup: 'group-1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: 'group-1',
                                activeView: 'panel1',
                            },
                            size: 500,
                        },
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel2'],
                                id: 'group-2',
                                activeView: 'panel2',
                            },
                            size: 500,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.VERTICAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    title: 'panel2',
                },
            },
        });

        expect(dockview.orientation).toBe(Orientation.VERTICAL);

        dockview.addPanel({
            id: 'panel3',
            component: 'default',
            position: {
                direction: 'left',
            },
        });

        expect(dockview.orientation).toBe(Orientation.HORIZONTAL);

        expect(JSON.parse(JSON.stringify(dockview.toJSON()))).toEqual({
            activeGroup: '1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel3'],
                                id: '1',
                                activeView: 'panel3',
                            },
                            size: 500,
                        },
                        {
                            type: 'branch',
                            data: [
                                {
                                    type: 'leaf',
                                    data: {
                                        views: ['panel1'],
                                        id: 'group-1',
                                        activeView: 'panel1',
                                    },
                                    size: 500,
                                },
                                {
                                    type: 'leaf',
                                    data: {
                                        views: ['panel2'],
                                        id: 'group-2',
                                        activeView: 'panel2',
                                    },
                                    size: 500,
                                },
                            ],
                            size: 500,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.HORIZONTAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },

                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    title: 'panel2',
                },
                panel3: {
                    id: 'panel3',
                    contentComponent: 'default',
                    title: 'panel3',
                },
            },
        });
    });

    test('orthogonal realigment #3', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 1000);

        expect(dockview.orientation).toBe(Orientation.HORIZONTAL);

        dockview.fromJSON({
            activeGroup: 'group-1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: 'group-1',
                                activeView: 'panel1',
                            },
                            size: 500,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.VERTICAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
            },
        });

        expect(dockview.orientation).toBe(Orientation.VERTICAL);

        dockview.addPanel({
            id: 'panel2',
            component: 'default',
            position: {
                direction: 'above',
            },
        });

        dockview.addPanel({
            id: 'panel3',
            component: 'default',
            position: {
                direction: 'below',
            },
        });

        expect(dockview.orientation).toBe(Orientation.VERTICAL);

        expect(JSON.parse(JSON.stringify(dockview.toJSON()))).toEqual({
            activeGroup: '2',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel2'],
                                id: '1',
                                activeView: 'panel2',
                            },
                            size: 333,
                        },
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: 'group-1',
                                activeView: 'panel1',
                            },
                            size: 333,
                        },
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel3'],
                                id: '2',
                                activeView: 'panel3',
                            },
                            size: 334,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.VERTICAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    title: 'panel2',
                },
                panel3: {
                    id: 'panel3',
                    contentComponent: 'default',
                    title: 'panel3',
                },
            },
        });
    });

    test('orthogonal realigment #4', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 1000);

        expect(dockview.orientation).toBe(Orientation.HORIZONTAL);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
            position: {
                direction: 'above',
            },
        });

        expect(dockview.orientation).toBe(Orientation.VERTICAL);

        expect(JSON.parse(JSON.stringify(dockview.toJSON()))).toEqual({
            activeGroup: '1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                id: '1',
                                activeView: 'panel1',
                            },
                            size: 1000,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 1000,
                orientation: Orientation.VERTICAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
            },
        });
    });

    test('that a empty component has no groups', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        expect(dockview.groups).toHaveLength(0);
    });

    test('updateOptions({ createWatermarkComponent }) swaps live watermarks', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        // No groups → dockview-level watermark mounted with the default renderer.
        expect(
            dockview.element.querySelectorAll('.dv-watermark-container')
        ).toHaveLength(1);
        expect(
            dockview.element.querySelectorAll(
                '.dv-watermark-container .dv-watermark-custom'
            )
        ).toHaveLength(0);

        const customRenderers: HTMLElement[] = [];

        dockview.updateOptions({
            createWatermarkComponent: () => {
                const el = document.createElement('div');
                el.className = 'dv-watermark-custom';
                customRenderers.push(el);
                return {
                    element: el,
                    init: () => {
                        /* noop */
                    },
                };
            },
        });

        // Same dockview-level container, but now wrapping the custom element.
        expect(
            dockview.element.querySelectorAll('.dv-watermark-container')
        ).toHaveLength(1);
        expect(
            dockview.element.querySelectorAll(
                '.dv-watermark-container .dv-watermark-custom'
            )
        ).toHaveLength(1);
        expect(customRenderers).toHaveLength(1);

        // Toggling back to the default factory disposes the custom one and
        // re-creates the default watermark in place.
        dockview.updateOptions({ createWatermarkComponent: undefined });

        expect(
            dockview.element.querySelectorAll('.dv-watermark-container')
        ).toHaveLength(1);
        expect(
            dockview.element.querySelectorAll(
                '.dv-watermark-container .dv-watermark-custom'
            )
        ).toHaveLength(0);
    });

    test('that deserializing an empty layout has zero groups and a watermark', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        expect(dockview.groups).toHaveLength(0);

        expect(
            dockview.element.querySelectorAll('.dv-watermark-container')
        ).toHaveLength(1);

        dockview.fromJSON({
            grid: {
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    data: [],
                },
                height: 100,
                width: 100,
            },
            panels: {},
        });

        expect(dockview.groups).toHaveLength(0);

        expect(
            dockview.element.querySelectorAll('.dv-watermark-container')
        ).toHaveLength(1);
    });

    test('that deserializing a populated layout removes the watermark', () => {
        // Regression: fromJSON rebuilds the grid via gridview.deserialize(),
        // which does not fire the BaseGrid add events the watermark module
        // reacts to. The watermark mounted while the dockview was empty must
        // still be removed once the restored layout has visible grid groups,
        // otherwise it overlays (and blocks interaction with) the whole layout.
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        // No groups yet → watermark mounted.
        expect(
            dockview.element.querySelectorAll('.dv-watermark-container')
        ).toHaveLength(1);

        dockview.fromJSON({
            grid: {
                orientation: Orientation.HORIZONTAL,
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1'],
                                activeView: 'panel1',
                                id: '1',
                            },
                            size: 100,
                        },
                    ],
                },
                height: 100,
                width: 100,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
            },
        });

        expect(dockview.groups).toHaveLength(1);

        // Restored layout has a visible grid group → watermark removed.
        expect(
            dockview.element.querySelectorAll('.dv-watermark-container')
        ).toHaveLength(0);
    });

    test('empty', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 800);

        expect(JSON.parse(JSON.stringify(dockview.toJSON()))).toEqual({
            grid: {
                height: 800,
                width: 1000,
                orientation: Orientation.HORIZONTAL,
                root: {
                    data: [],
                    type: 'branch',
                    size: 800,
                },
            },
            panels: {},
        });
    });

    test('that title and params.title do not conflict', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(100, 100);

        dockview.addPanel({
            id: 'panel1',
            component: 'default',
            title: 'Panel 1',
            params: {
                title: 'Panel 1',
            },
        });

        dockview.addPanel({
            id: 'panel2',
            component: 'default',
            title: 'Panel 2',
        });

        dockview.addPanel({
            id: 'panel3',
            component: 'default',
            params: {
                title: 'Panel 3',
            },
        });

        expect(JSON.parse(JSON.stringify(dockview.toJSON()))).toEqual({
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1', 'panel2', 'panel3'],
                                activeView: 'panel3',
                                id: '1',
                            },
                            size: 100,
                        },
                    ],
                    size: 100,
                },
                width: 100,
                height: 100,
                orientation: 'HORIZONTAL',
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    params: {
                        title: 'Panel 1',
                    },
                    title: 'Panel 1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    title: 'Panel 2',
                },
                panel3: {
                    id: 'panel3',
                    contentComponent: 'default',
                    params: {
                        title: 'Panel 3',
                    },
                    title: 'panel3',
                },
            },
            activeGroup: '1',
        });
    });

    test('check dockview component is rendering to the DOM as expected', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(100, 100);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });

        expect(dockview.element.querySelectorAll('.dv-view')).toHaveLength(1);

        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
        });

        expect(dockview.element.querySelectorAll('.dv-view')).toHaveLength(1);

        const panel3 = dockview.addPanel({
            id: 'panel3',
            component: 'default',
        });

        expect(dockview.element.querySelectorAll('.dv-view')).toHaveLength(1);

        dockview.moveGroupOrPanel({
            from: { groupId: panel3.group.id, panelId: panel3.id },
            to: { group: panel3.group, position: 'right' },
        });

        expect(dockview.groups).toHaveLength(2);
        expect(dockview.element.querySelectorAll('.dv-view')).toHaveLength(2);

        dockview.moveGroupOrPanel({
            from: { groupId: panel2.group.id, panelId: panel2.id },
            to: { group: panel3.group, position: 'bottom' },
        });

        expect(dockview.groups).toHaveLength(3);
        expect(dockview.element.querySelectorAll('.dv-view')).toHaveLength(4);

        dockview.moveGroupOrPanel({
            from: { groupId: panel1.group.id, panelId: panel1.id },
            to: { group: panel2.group, position: 'center' },
        });

        expect(dockview.groups).toHaveLength(2);

        expect(dockview.element.querySelectorAll('.dv-view')).toHaveLength(2);
    });

    test('that fromJSON layouts are resized to the current dimensions', async () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        expect(dockview.orientation).toBe(Orientation.HORIZONTAL);

        dockview.layout(1000, 500);

        dockview.fromJSON({
            activeGroup: 'group-1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1', 'panel2'],
                                id: 'group-1',
                                activeView: 'panel2',
                            },
                            size: 2000,
                        },
                    ],
                    size: 1000,
                },
                height: 1000,
                width: 2000,
                orientation: Orientation.HORIZONTAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    title: 'panel2',
                },
            },
        });

        expect(JSON.parse(JSON.stringify(dockview.toJSON()))).toEqual({
            activeGroup: 'group-1',
            grid: {
                root: {
                    type: 'branch',
                    data: [
                        {
                            type: 'leaf',
                            data: {
                                views: ['panel1', 'panel2'],
                                id: 'group-1',
                                activeView: 'panel2',
                            },
                            size: 1000,
                        },
                    ],
                    size: 500,
                },
                height: 500,
                width: 1000,
                orientation: Orientation.HORIZONTAL,
            },
            panels: {
                panel1: {
                    id: 'panel1',
                    contentComponent: 'default',
                    title: 'panel1',
                },
                panel2: {
                    id: 'panel2',
                    contentComponent: 'default',
                    title: 'panel2',
                },
            },
        });
    });

    test('that moving the last panel to be floating should leave an empty gridview', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 500);

        const panel1 = dockview.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        expect(
            dockview.element.querySelectorAll('.dv-view-container > .dv-view')
        ).toHaveLength(1);

        dockview.addFloatingGroup(panel1);

        expect(
            dockview.element.querySelectorAll('.dv-view-container > .dv-view')
        ).toHaveLength(0);
    });

    test('that api.setSize applies to the overlay for floating panels', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 500);

        const panel1 = dockview.addPanel({
            id: 'panel_1',
            component: 'default',
            floating: true,
        });

        panel1.api.setSize({ height: 123, width: 256 });

        const items = container.querySelectorAll('.dv-resize-container');
        expect(items).toHaveLength(1);

        const el = items[0] as HTMLElement;

        expect(el.style.height).toBe('123px');
        expect(el.style.width).toBe('256px');
    });

    test('floating overlays share a stacking context with render overlays (issue: positions blocks other floating tabs)', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 500);

        dockview.addPanel({
            id: 'panel_1',
            component: 'default',
            floating: true,
        });

        const overlay = container.querySelector(
            '.dv-resize-container'
        ) as HTMLElement;
        expect(overlay).toBeTruthy();

        const host = overlay.parentElement!;
        expect(host.classList.contains('dv-floating-overlay-host')).toBe(true);

        // Host must share a parent with the OverlayRenderContainer (the shell)
        // so floating overlay z-indexes and `dv-render-overlay` z-indexes
        // resolve in the same stacking context.
        expect(host.parentElement).toBe(
            dockview.overlayRenderContainer.element
        );

        // Host must not live inside `.dv-dockview`, which has
        // `contain: layout` and forms a stacking context that would trap
        // floating z-indexes below shell-level render overlays.
        expect(dockview.element.contains(overlay)).toBe(false);
    });

    test('that external dnd events do not trigger the top-level center dnd target unless empty', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        let events: DockviewDndOverlayEvent[] = [];

        dockview.onUnhandledDragOver((e) => {
            events.push(e);
            e.accept();
        });

        dockview.layout(1000, 500);

        const panel1 = dockview.addPanel({
            id: 'panel_1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel_2',
            component: 'default',
            position: { direction: 'right' },
        });

        Object.defineProperty(dockview.element, 'offsetWidth', {
            get: () => 100,
        });
        Object.defineProperty(dockview.element, 'offsetHeight', {
            get: () => 100,
        });

        jest.spyOn(dockview.element, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 100,
            height: 100,
        } as any);

        // left

        const eventLeft = new KeyboardEvent('dragover');
        Object.defineProperty(eventLeft, 'clientX', {
            get: () => 0,
        });
        Object.defineProperty(eventLeft, 'clientY', {
            get: () => 0,
        });
        fireEvent(dockview.element, eventLeft);

        expect(events[0].nativeEvent).toBe(eventLeft);
        expect(events[0].position).toBe('left');
        expect(events[0].target).toBe('edge');
        expect(events[0].getData).toBe(getPanelData);
        expect(events).toHaveLength(1);

        // right

        const eventRight = new KeyboardEvent('dragover');
        Object.defineProperty(eventRight, 'clientX', {
            get: () => 100,
        });
        Object.defineProperty(eventRight, 'clientY', {
            get: () => 100,
        });
        fireEvent(dockview.element, eventRight);

        expect(events[1].nativeEvent).toBe(eventRight);
        expect(events[1].position).toBe('right');
        expect(events[1].target).toBe('edge');
        expect(events[1].getData).toBe(getPanelData);
        expect(events).toHaveLength(2);

        // top

        const eventTop = new KeyboardEvent('dragover');
        Object.defineProperty(eventTop, 'clientX', {
            get: () => 50,
        });
        Object.defineProperty(eventTop, 'clientY', {
            get: () => 0,
        });
        fireEvent(dockview.element, eventTop);

        expect(events[2].nativeEvent).toBe(eventTop);
        expect(events[2].position).toBe('top');
        expect(events[2].target).toBe('edge');
        expect(events[2].getData).toBe(getPanelData);
        expect(events).toHaveLength(3);

        // top

        const eventBottom = new KeyboardEvent('dragover');
        Object.defineProperty(eventBottom, 'clientX', {
            get: () => 50,
        });
        Object.defineProperty(eventBottom, 'clientY', {
            get: () => 100,
        });
        fireEvent(dockview.element, eventBottom);

        expect(events[3].nativeEvent).toBe(eventBottom);
        expect(events[3].position).toBe('bottom');
        expect(events[3].target).toBe('edge');
        expect(events[3].getData).toBe(getPanelData);
        expect(events).toHaveLength(4);

        // center

        const eventCenter = new KeyboardEvent('dragover');
        Object.defineProperty(eventCenter, 'clientX', {
            get: () => 50,
        });
        Object.defineProperty(eventCenter, 'clientY', {
            get: () => 50,
        });
        fireEvent(dockview.element, eventCenter);

        // expect not to be called for center
        expect(events).toHaveLength(4);

        dockview.removePanel(panel1);
        dockview.removePanel(panel2);

        // center, but empty

        const eventCenter2 = new KeyboardEvent('dragover');
        Object.defineProperty(eventCenter2, 'clientX', {
            get: () => 50,
        });
        Object.defineProperty(eventCenter2, 'clientY', {
            get: () => 50,
        });
        fireEvent(dockview.element, eventCenter2);

        expect(events[4].nativeEvent).toBe(eventCenter2);
        expect(events[4].position).toBe('center');
        expect(events[4].target).toBe('edge');
        expect(events[4].getData).toBe(getPanelData);
        expect(events).toHaveLength(5);
    });

    test('corrupt layout: bad inline view', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'panelA':
                    case 'panelB':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported panel '${options.name}'`);
                }
            },
        });

        dockview.layout(1000, 500);

        let el = dockview.element.querySelector('.dv-view-container');
        expect(el).toBeTruthy();
        expect(el!.childNodes).toHaveLength(0);

        dockview.addPanel({
            id: 'panel_1',
            component: 'panelA',
        });

        expect(dockview.groups).toHaveLength(1);
        expect(dockview.panels).toHaveLength(1);

        el = dockview.element.querySelector('.dv-view-container');
        expect(el).toBeTruthy();
        expect(el!.childNodes.length).toBeGreaterThan(0);

        expect(() => {
            dockview.fromJSON({
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panelA'],
                                    activeView: 'panelA',
                                    id: '1',
                                },
                                size: 841,
                            },
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panelB'],
                                    activeView: 'panelB',
                                    id: '2',
                                },
                                size: 842,
                            },
                        ],
                        size: 530,
                    },
                    width: 1683,
                    height: 530,
                    orientation: Orientation.HORIZONTAL,
                },
                panels: {
                    panelA: {
                        id: 'panelA',
                        contentComponent: 'panelA',
                        title: 'Panel A',
                    },
                    panelB: {
                        id: 'panelB',
                        contentComponent: 'somethingBad',
                        title: 'Panel B',
                    },
                },
                activeGroup: '1',
            });
        }).toThrow("unsupported panel 'somethingBad'");

        expect(dockview.groups).toHaveLength(0);
        expect(dockview.panels).toHaveLength(0);

        el = dockview.element.querySelector('.dv-view-container');
        expect(el).toBeTruthy();
        expect(el!.childNodes).toHaveLength(0);
    });

    test('corrupt layout: bad floating view', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'panelA':
                    case 'panelB':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported panel '${options.name}'`);
                }
            },
        });

        dockview.layout(1000, 500);

        let el = dockview.element.querySelector('.dv-view-container');
        expect(el).toBeTruthy();
        expect(el!.childNodes).toHaveLength(0);

        dockview.addPanel({
            id: 'panel_1',
            component: 'panelA',
        });

        dockview.addPanel({
            id: 'panel_2',
            component: 'panelA',
            floating: true,
        });

        expect(dockview.groups).toHaveLength(2);
        expect(dockview.panels).toHaveLength(2);

        el = container.querySelector('.dv-resize-container');
        expect(el).toBeTruthy();

        el = dockview.element.querySelector('.dv-view-container');
        expect(el).toBeTruthy();
        expect(el!.childNodes.length).toBeGreaterThan(0);

        expect(() => {
            dockview.fromJSON({
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panelA'],
                                    activeView: 'panelA',
                                    id: '1',
                                },
                                size: 841,
                            },
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panelB'],
                                    activeView: 'panelB',
                                    id: '2',
                                },
                                size: 842,
                            },
                        ],
                        size: 530,
                    },
                    width: 1683,
                    height: 530,
                    orientation: Orientation.HORIZONTAL,
                },
                floatingGroups: [
                    {
                        data: {
                            views: ['panelC'],
                            activeView: 'panelC',
                            id: '3',
                        },
                        position: { left: 0, top: 0, height: 100, width: 100 },
                    },
                    {
                        data: {
                            views: ['panelD'],
                            activeView: 'panelD',
                            id: '4',
                        },
                        position: { left: 0, top: 0, height: 100, width: 100 },
                    },
                ],
                panels: {
                    panelA: {
                        id: 'panelA',
                        contentComponent: 'panelA',
                        title: 'Panel A',
                    },
                    panelB: {
                        id: 'panelB',
                        contentComponent: 'panelB',
                        title: 'Panel B',
                    },
                    panelC: {
                        id: 'panelC',
                        contentComponent: 'panelC',
                        title: 'Panel C',
                    },
                },
                activeGroup: '1',
            });
        }).toThrow("unsupported panel 'panelC'");

        expect(dockview.groups).toHaveLength(0);
        expect(dockview.panels).toHaveLength(0);

        el = container.querySelector('.dv-resize-container');
        expect(el).toBeFalsy();

        el = dockview.element.querySelector('.dv-view-container');
        expect(el).toBeTruthy();
        expect(el!.childNodes).toHaveLength(0);
    });

    test('that disableResizing is always true because the shell manages resizing', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'panelA':
                    case 'panelB':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        // The shell is always active and drives layout via watchElementResize,
        // so disableResizing is always true on DockviewComponent.
        expect(dockview.disableResizing).toBeTruthy();
    });

    test('that disableAutoResizing can be enabled', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'panelA':
                    case 'panelB':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            disableAutoResizing: true,
        });

        expect(dockview.disableResizing).toBeTruthy();
    });

    describe('floating groups', () => {
        test('that a floating group can be removed', async () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            expect(dockview.groups).toHaveLength(0);
            const panel = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
                floating: true,
            });
            expect(dockview.groups).toHaveLength(1);

            dockview.removePanel(panel);
            expect(dockview.groups).toHaveLength(0);
        });

        const createDockview = () =>
            new DockviewComponent(document.createElement('div'), {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

        test('renders a dedicated title bar by default', () => {
            const dockview = createDockview();
            dockview.layout(1000, 500);

            dockview.addPanel({
                id: 'panel_1',
                component: 'default',
                floating: true,
            });

            const overlay = dockview.floatingGroups[0].overlay.element;
            expect(overlay.querySelector('.dv-floating-titlebar')).toBeTruthy();

            // the overlay stacks the handle above the group via flex column
            expect(
                overlay.classList.contains('dv-resize-container-with-titlebar')
            ).toBeTruthy();

            dockview.dispose();
        });

        test('floatingGroupDragHandle: "tabbar" omits the title bar', () => {
            const dockview = new DockviewComponent(
                document.createElement('div'),
                {
                    createComponent(options) {
                        switch (options.name) {
                            case 'default':
                                return new PanelContentPartTest(
                                    options.id,
                                    options.name
                                );
                            default:
                                throw new Error(`unsupported`);
                        }
                    },
                    floatingGroupDragHandle: 'tabbar',
                }
            );
            dockview.layout(1000, 500);

            dockview.addPanel({
                id: 'panel_1',
                component: 'default',
                floating: true,
            });

            const overlay = dockview.floatingGroups[0].overlay.element;
            expect(overlay.querySelector('.dv-floating-titlebar')).toBeNull();
            expect(
                overlay.classList.contains('dv-resize-container-with-titlebar')
            ).toBeFalsy();

            dockview.dispose();
        });

        test('per-group dragHandle override beats the component option', () => {
            const dockview = createDockview();
            dockview.layout(1000, 500);

            const panel = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            // component default is 'titlebar'; override to 'tabbar' for this group
            dockview.addFloatingGroup(panel.api.group, {
                dragHandle: 'tabbar',
            });

            const overlay = dockview.floatingGroups[0].overlay.element;
            expect(overlay.querySelector('.dv-floating-titlebar')).toBeNull();

            dockview.dispose();
        });

        test('move a floating group of one tab to a new fixed group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);

            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id },
                to: { group: panel1.group, position: 'right' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);
        });

        test('move a floating group of one tab to an existing fixed group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);

            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id },
                to: { group: panel1.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(1);
            expect(dockview.panels).toHaveLength(2);
        });

        test('move a floating group of one tab to an existing floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(3);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel3.group.id },
                to: { group: panel2.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);
        });

        describe('nested floating layout (multi-root)', () => {
            const make = () =>
                new DockviewComponent(document.createElement('div'), {
                    createComponent(options) {
                        switch (options.name) {
                            case 'default':
                                return new PanelContentPartTest(
                                    options.id,
                                    options.name
                                );
                            default:
                                throw new Error(`unsupported`);
                        }
                    },
                });

            test('whole-group move splits a floating window rather than spawning a new one', () => {
                const dockview = make();
                dockview.layout(1000, 500);

                const panel1 = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    floating: true,
                });

                expect(dockview.floatingGroups).toHaveLength(1);

                // drag the whole grid group to the right of the floating group
                dockview.moveGroupOrPanel({
                    from: { groupId: panel1.group.id },
                    to: { group: panel2.group, position: 'right' },
                });

                // still a single floating window, now hosting both groups
                expect(dockview.floatingGroups).toHaveLength(1);
                expect(panel1.group.api.location.type).toBe('floating');
                expect(panel2.group.api.location.type).toBe('floating');
                expect(dockview.getGridviewForGroup(panel1.group)).toBe(
                    dockview.getGridviewForGroup(panel2.group)
                );
                expect(dockview.getGridviewForGroup(panel1.group)).not.toBe(
                    (dockview as any).gridview
                );
            });

            test('panel split into a floating window creates a new group inside it', () => {
                const dockview = make();
                dockview.layout(1000, 500);

                const panel1a = dockview.addPanel({
                    id: 'panel_1a',
                    component: 'default',
                });
                dockview.addPanel({
                    id: 'panel_1b',
                    component: 'default',
                    position: { referencePanel: 'panel_1a' },
                });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    floating: true,
                });

                // split one panel out of the 2-panel grid group into the float
                dockview.moveGroupOrPanel({
                    from: {
                        groupId: panel1a.group.id,
                        panelId: 'panel_1b',
                    },
                    to: { group: panel2.group, position: 'bottom' },
                });

                const movedPanel = dockview.panels.find(
                    (p) => p.id === 'panel_1b'
                )!;
                expect(movedPanel.group.api.location.type).toBe('floating');
                expect(dockview.getGridviewForGroup(movedPanel.group)).toBe(
                    dockview.getGridviewForGroup(panel2.group)
                );
                expect(dockview.floatingGroups).toHaveLength(1);
            });

            test('moving a group out of a multi-group window keeps the window alive', () => {
                const dockview = make();
                dockview.layout(1000, 500);

                const panel1 = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    floating: true,
                });
                const panel3 = dockview.addPanel({
                    id: 'panel_3',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });

                // build a 2-group floating window: split panel3's group in
                dockview.moveGroupOrPanel({
                    from: { groupId: panel3.group.id },
                    to: { group: panel2.group, position: 'right' },
                });
                expect(dockview.floatingGroups).toHaveLength(1);
                expect(dockview.getGridviewForGroup(panel3.group)).toBe(
                    dockview.getGridviewForGroup(panel2.group)
                );

                // now move panel3's group back to the main grid (beside panel1)
                dockview.moveGroupOrPanel({
                    from: { groupId: panel3.group.id },
                    to: { group: panel1.group, position: 'right' },
                });

                expect(panel3.group.api.location.type).toBe('grid');
                expect(panel2.group.api.location.type).toBe('floating');
                // the window survived because panel2's group still lives in it
                expect(dockview.floatingGroups).toHaveLength(1);
            });

            test('floating-to-floating move merges windows (source window closes)', () => {
                const dockview = make();
                dockview.layout(1000, 500);

                dockview.addPanel({ id: 'panel_1', component: 'default' });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    floating: true,
                });
                const panel3 = dockview.addPanel({
                    id: 'panel_3',
                    component: 'default',
                    floating: true,
                });

                expect(dockview.floatingGroups).toHaveLength(2);

                dockview.moveGroupOrPanel({
                    from: { groupId: panel3.group.id },
                    to: { group: panel2.group, position: 'bottom' },
                });

                // panel3's single-group window closed; both groups now share
                // panel2's window
                expect(dockview.floatingGroups).toHaveLength(1);
                expect(panel2.group.api.location.type).toBe('floating');
                expect(panel3.group.api.location.type).toBe('floating');
                expect(dockview.getGridviewForGroup(panel3.group)).toBe(
                    dockview.getGridviewForGroup(panel2.group)
                );
            });

            test('single-group floating window serializes in the legacy shape', () => {
                const dockview = make();
                dockview.layout(1000, 500);

                dockview.addPanel({ id: 'panel_1', component: 'default' });
                dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    floating: true,
                });

                const json = dockview.toJSON();
                expect(json.floatingGroups?.length).toBe(1);
                expect(json.floatingGroups![0].data).toBeDefined();
                expect(json.floatingGroups![0].grid).toBeUndefined();
            });

            test('a group can be split into a popout window', async () => {
                window.open = () => setupMockWindow();
                const dockview = make();
                dockview.layout(1000, 500);

                const panel1 = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });

                await dockview.addPopoutGroup(panel1.api.group);
                expect(panel1.api.location.type).toBe('popout');

                // drag panel2's group onto the right edge of the popout group
                dockview.moveGroupOrPanel({
                    from: { groupId: panel2.group.id },
                    to: { group: panel1.group, position: 'right' },
                });

                expect(panel2.api.location.type).toBe('popout');
                expect(dockview.getGridviewForGroup(panel1.group)).toBe(
                    dockview.getGridviewForGroup(panel2.group)
                );
                expect(dockview.getGridviewForGroup(panel1.group)).not.toBe(
                    (dockview as any).gridview
                );

                dockview.dispose();
            });

            test('a multi-group popout window serializes with a nested grid', async () => {
                window.open = () => setupMockWindow();
                const dockview = make();
                dockview.layout(1000, 500);

                const panel1 = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });

                await dockview.addPopoutGroup(panel1.api.group);
                dockview.moveGroupOrPanel({
                    from: { groupId: panel2.group.id },
                    to: { group: panel1.group, position: 'right' },
                });

                const json = dockview.toJSON();
                expect(json.popoutGroups![0].grid).toBeDefined();
                expect(json.popoutGroups![0].data).toBeUndefined();

                dockview.dispose();
            });

            test('closing a popout window after its anchor was moved out relocates the remaining members (no orphan)', async () => {
                const mockWindow = setupMockWindow();
                window.open = () => mockWindow;

                const dockview = make();
                dockview.layout(1000, 500);

                const panel1 = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });
                const panel3 = dockview.addPanel({
                    id: 'panel_3',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });

                // pop out panel1's group, then drag panel2's group into the
                // popout window -> 2-group popout, anchor = panel1's group
                await dockview.addPopoutGroup(panel1.api.group);
                dockview.moveGroupOrPanel({
                    from: { groupId: panel2.group.id },
                    to: { group: panel1.group, position: 'right' },
                });
                expect(panel1.api.location.type).toBe('popout');
                expect(panel2.api.location.type).toBe('popout');

                // move the ORIGINAL anchor (panel1's group) back to the grid;
                // the window survives and promotes panel2's group as anchor
                dockview.moveGroupOrPanel({
                    from: { groupId: panel1.group.id },
                    to: { group: panel3.group, position: 'right' },
                });
                expect(panel1.api.location.type).toBe('grid');
                expect(panel2.api.location.type).toBe('popout');

                // close the OS window. Before the fix, the teardown keyed off the
                // (departed) original anchor and left panel2's group orphaned in
                // the disposed nested gridview.
                mockWindow.close();

                expect(panel2.api.location.type).toBe('grid');
                expect(dockview.panels).toHaveLength(3);

                // an orphaned group would trip clear() with 'Invalid grid element'
                expect(() => dockview.clear()).not.toThrow();
                expect(dockview.groups).toHaveLength(0);

                dockview.dispose();
            });

            test('DV-43: a non-anchor group in a multi-group popout resolves the popout window popup service, not the main one', async () => {
                window.open = () => setupMockWindow();
                const dockview = make();
                dockview.layout(1000, 500);

                const panel1 = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });

                await dockview.addPopoutGroup(panel1.api.group);
                // drag panel2's group into the popout → 2-group popout, anchor
                // is panel1's group
                dockview.moveGroupOrPanel({
                    from: { groupId: panel2.group.id },
                    to: { group: panel1.group, position: 'right' },
                });

                const mainPopupService = (dockview as any).popupService;
                const anchorService = dockview.getPopupServiceForGroup(
                    panel1.group
                );
                const memberService = dockview.getPopupServiceForGroup(
                    panel2.group
                );

                // the anchor resolves to the popout window's own popup service
                expect(anchorService).not.toBe(mainPopupService);
                // and the non-anchor member shares that same service rather than
                // falling back to the main window's (the DV-43 bug)
                expect(memberService).toBe(anchorService);
                expect(memberService).not.toBe(mainPopupService);

                dockview.dispose();
            });

            test('DV-47: promoting a new anchor re-keys per-window popup-service resolution to the survivor', async () => {
                const mockWindow = setupMockWindow();
                window.open = () => mockWindow;

                const dockview = make();
                dockview.layout(1000, 500);

                const panel1 = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });
                const panel3 = dockview.addPanel({
                    id: 'panel_3',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });

                await dockview.addPopoutGroup(panel1.api.group);
                dockview.moveGroupOrPanel({
                    from: { groupId: panel2.group.id },
                    to: { group: panel1.group, position: 'right' },
                });

                const mainPopupService = (dockview as any).popupService;
                const popoutService = dockview.getPopupServiceForGroup(
                    panel1.group
                );
                expect(popoutService).not.toBe(mainPopupService);

                // move the ORIGINAL anchor back to the grid → panel2 is promoted
                dockview.moveGroupOrPanel({
                    from: { groupId: panel1.group.id },
                    to: { group: panel3.group, position: 'right' },
                });
                expect(panel1.api.location.type).toBe('grid');
                expect(panel2.api.location.type).toBe('popout');

                // the departed group no longer resolves to the popout
                // service; it uses the main window again
                expect(dockview.getPopupServiceForGroup(panel1.group)).toBe(
                    mainPopupService
                );
                // the promoted anchor still resolves to the same popout service
                expect(dockview.getPopupServiceForGroup(panel2.group)).toBe(
                    popoutService
                );

                // the entry's anchor was reassigned to the survivor
                const entry = (
                    dockview as any
                )._popoutWindowService.findByGroup(panel2.group);
                expect(entry.popoutGroup).toBe(panel2.group);

                dockview.dispose();
            });

            test('closing a multi-group popout whose anchor came from a floating group docks all members to the grid (no split)', async () => {
                const mockWindow = setupMockWindow();
                window.open = () => mockWindow;

                const dockview = make();
                dockview.layout(1000, 500);

                const panel1 = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    floating: true,
                });
                // panel3 must be placed explicitly in the grid; a position-less
                // add would land in the active (floating) group.
                const panel3 = dockview.addPanel({
                    id: 'panel_3',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });

                // pop the floating group out (captures a floatingBox), then drag
                // panel3's grid group into the popout window -> 2-group popout
                await dockview.addPopoutGroup(panel2.api.group);
                const popoutGroup = dockview.groups.find(
                    (g) => g.api.location.type === 'popout'
                )!;
                dockview.moveGroupOrPanel({
                    from: { groupId: panel3.group.id },
                    to: { group: popoutGroup, position: 'right' },
                });
                expect(panel2.api.location.type).toBe('popout');
                expect(panel3.api.location.type).toBe('popout');

                mockWindow.close();

                // Before the fix the anchor re-floated while the other member
                // docked to the grid, splitting the window across two roots.
                expect(panel2.api.location.type).toBe('grid');
                expect(panel3.api.location.type).toBe('grid');
                expect(dockview.floatingGroups).toHaveLength(0);
                expect(panel1.api.location.type).toBe('grid');

                dockview.dispose();
            });

            test('a globally-configured popoutUrl is recorded on the group and survives serialization', async () => {
                const mockWindow = setupMockWindow();
                window.open = () => mockWindow;

                const dockview = new DockviewComponent(
                    document.createElement('div'),
                    {
                        popoutUrl: '/custom-popout.html',
                        createComponent(options) {
                            switch (options.name) {
                                case 'default':
                                    return new PanelContentPartTest(
                                        options.id,
                                        options.name
                                    );
                                default:
                                    throw new Error(`unsupported`);
                            }
                        },
                    }
                );
                dockview.layout(1000, 500);

                const panel1 = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });

                // no per-call popoutUrl -> falls back to the global option
                await dockview.addPopoutGroup(panel1.api.group);

                expect(
                    (panel1.api.location as { popoutUrl?: string }).popoutUrl
                ).toBe('/custom-popout.html');

                const json = dockview.toJSON();
                expect(json.popoutGroups![0].url).toBe('/custom-popout.html');

                dockview.dispose();
            });

            test('backward compatibility: a legacy single-group floating + popout layout (data shape, no grid) restores', async () => {
                jest.useFakeTimers();
                window.open = () => setupMockWindow();

                const dockview = make();
                dockview.layout(1000, 500);

                // A frozen layout in the shape dockview emitted before nested
                // multi-group windows existed: floating/popout groups use the
                // legacy `data` field and no `grid`. Hand-authored (not produced
                // by the current serializer) so it guards old -> new read
                // compatibility against future format changes.
                const legacyLayout = {
                    activeGroup: 'grid-group',
                    grid: {
                        root: {
                            type: 'branch',
                            data: [
                                {
                                    type: 'leaf',
                                    data: {
                                        views: ['p1'],
                                        id: 'grid-group',
                                        activeView: 'p1',
                                    },
                                    size: 1000,
                                },
                            ],
                            size: 500,
                        },
                        height: 500,
                        width: 1000,
                        orientation: Orientation.HORIZONTAL,
                    },
                    panels: {
                        p1: {
                            id: 'p1',
                            contentComponent: 'default',
                            title: 'p1',
                        },
                        p2: {
                            id: 'p2',
                            contentComponent: 'default',
                            title: 'p2',
                        },
                        p3: {
                            id: 'p3',
                            contentComponent: 'default',
                            title: 'p3',
                        },
                    },
                    floatingGroups: [
                        {
                            data: {
                                views: ['p2'],
                                id: 'float-group',
                                activeView: 'p2',
                            },
                            position: {
                                top: 10,
                                left: 10,
                                width: 300,
                                height: 200,
                            },
                        },
                    ],
                    popoutGroups: [
                        {
                            data: {
                                views: ['p3'],
                                id: 'popout-group',
                                activeView: 'p3',
                            },
                            position: {
                                left: 0,
                                top: 0,
                                width: 400,
                                height: 300,
                            },
                        },
                    ],
                } as Parameters<typeof dockview.fromJSON>[0];

                dockview.fromJSON(legacyLayout);

                // popout restoration is queued on a timer
                jest.advanceTimersByTime(200);
                await dockview.popoutRestorationPromise;

                expect(dockview.panels.map((p) => p.id).sort()).toEqual([
                    'p1',
                    'p2',
                    'p3',
                ]);

                const loc = (id: string) =>
                    dockview.panels.find((p) => p.id === id)!.api.location.type;
                expect(loc('p1')).toBe('grid');
                expect(loc('p2')).toBe('floating');
                expect(loc('p3')).toBe('popout');
                expect(dockview.floatingGroups).toHaveLength(1);

                jest.useRealTimers();
                dockview.dispose();
            });

            test('multi-group floating window round-trips through toJSON/fromJSON', () => {
                const dockview = make();
                dockview.layout(1000, 500);

                dockview.addPanel({ id: 'panel_1', component: 'default' });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    floating: true,
                });
                const panel3 = dockview.addPanel({
                    id: 'panel_3',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });

                // split panel3's group into the floating window
                dockview.moveGroupOrPanel({
                    from: { groupId: panel3.group.id },
                    to: { group: panel2.group, position: 'right' },
                });
                expect(dockview.floatingGroups).toHaveLength(1);

                const json = dockview.toJSON();
                // a multi-group window serializes as a nested grid
                expect(json.floatingGroups![0].grid).toBeDefined();
                expect(json.floatingGroups![0].data).toBeUndefined();

                const restored = make();
                restored.layout(1000, 500);
                restored.fromJSON(json);

                expect(restored.panels).toHaveLength(3);
                expect(restored.floatingGroups).toHaveLength(1);
                const floatingGroups = restored.groups.filter(
                    (g) => g.api.location.type === 'floating'
                );
                expect(floatingGroups).toHaveLength(2);
                expect(restored.getGridviewForGroup(floatingGroups[0])).toBe(
                    restored.getGridviewForGroup(floatingGroups[1])
                );
                expect(
                    restored.getGridviewForGroup(floatingGroups[0])
                ).not.toBe((restored as any).gridview);
            });

            test('the floating title bar retargets when its anchor group leaves the window', () => {
                const dockview = make(); // default dragHandle is 'titlebar'
                dockview.layout(1000, 500);

                const panel1 = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    floating: true,
                });
                const panel3 = dockview.addPanel({
                    id: 'panel_3',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });

                // build a 2-group floating window; panel2's group is the anchor
                dockview.moveGroupOrPanel({
                    from: { groupId: panel3.group.id },
                    to: { group: panel2.group, position: 'right' },
                });

                const fg = dockview.floatingGroups[0];
                expect(fg.group).toBe(panel2.group);

                const titlebar = fg.overlay.element.querySelector(
                    '.dv-floating-titlebar'
                ) as HTMLElement;
                expect(titlebar).toBeTruthy();

                // move the original anchor back to the grid; the window survives
                // and promotes panel3's group as the new anchor
                dockview.moveGroupOrPanel({
                    from: { groupId: panel2.group.id },
                    to: { group: panel1.group, position: 'right' },
                });
                expect(dockview.floatingGroups).toHaveLength(1);
                expect(fg.group).toBe(panel3.group);

                // dragging the title bar now targets the promoted anchor, not
                // the departed original group
                const groupDragEvents: GroupDragEvent[] = [];
                dockview.onWillDragGroup((event) =>
                    groupDragEvents.push(event)
                );

                // shift+drag is the title bar's redock gesture; jsdom's
                // DragEvent ctor drops shiftKey, so set it explicitly
                const event = new Event('dragstart') as DragEvent;
                Object.defineProperty(event, 'shiftKey', { value: true });
                fireEvent(titlebar, event);

                expect(groupDragEvents).toHaveLength(1);
                expect(groupDragEvents[0].group).toBe(panel3.group);

                dockview.dispose();
            });

            test('restoring a blocked multi-group popout docks every member into the grid', async () => {
                jest.useFakeTimers();
                window.open = () => setupMockWindow();
                const dockview = make();
                dockview.layout(1000, 500);

                const panel1 = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });
                const panel2 = dockview.addPanel({
                    id: 'panel_2',
                    component: 'default',
                    position: { referencePanel: 'panel_1', direction: 'right' },
                });

                await dockview.addPopoutGroup(panel1.api.group);
                // split panel2's group into the popout -> 2-group popout window
                dockview.moveGroupOrPanel({
                    from: { groupId: panel2.group.id },
                    to: { group: panel1.group, position: 'right' },
                });

                const state = dockview.toJSON();
                expect(state.popoutGroups![0].grid).toBeDefined();

                // the browser blocks the popout when the layout is restored
                (window as any).open = () => null;

                dockview.clear();
                dockview.fromJSON(state);
                jest.advanceTimersByTime(500);
                await dockview.popoutRestorationPromise;

                // both groups fell back into the grid; nothing is lost or
                // orphaned
                expect(dockview.panels.map((p) => p.id).sort()).toEqual([
                    'panel_1',
                    'panel_2',
                ]);
                expect(
                    dockview.groups.filter(
                        (g) => g.api.location.type === 'popout'
                    )
                ).toHaveLength(0);
                // both members landed in the main grid (a hidden reference
                // ghost group may also linger, as with single-group restore)
                expect(
                    dockview.groups.filter(
                        (g) => g.api.location.type === 'grid'
                    ).length
                ).toBeGreaterThanOrEqual(2);

                expect(() => dockview.clear()).not.toThrow();
                expect(dockview.groups).toHaveLength(0);

                jest.useRealTimers();
            });
        });

        test('move a floating group of many tabs to a new fixed group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { referencePanel: panel2 },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id },
                to: { group: panel1.group, position: 'right' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);
        });

        test('move a floating group of many tabs to an existing fixed group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { referencePanel: panel2 },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id },
                to: { group: panel1.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(1);
            expect(dockview.panels).toHaveLength(3);
        });

        test('move a floating group of many tabs to an existing floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { referencePanel: panel2 },
            });

            const panel4 = dockview.addPanel({
                id: 'panel_4',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(panel4.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(3);
            expect(dockview.panels).toHaveLength(4);

            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id },
                to: { group: panel4.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(panel4.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(4);
        });

        test('move a floating tab of one tab to a new fixed group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);

            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id, panelId: panel2.id },
                to: { group: panel1.group, position: 'right' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);
        });

        test('move a floating tab of one tab to an existing fixed group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);

            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id, panelId: panel2.id },
                to: { group: panel1.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(1);
            expect(dockview.panels).toHaveLength(2);
        });

        test('move a floating tab of one tab to an existing floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(3);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel3.group.id, panelId: panel3.id },
                to: { group: panel2.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);
        });

        test('move a floating tab of many tabs to a new fixed group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { referencePanel: panel2 },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id, panelId: panel2.id },
                to: { group: panel1.group, position: 'right' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(3);
            expect(dockview.panels).toHaveLength(3);
        });

        test('move a floating tab of many tabs to an existing fixed group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { referencePanel: panel2 },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id, panelId: panel2.id },
                to: { group: panel1.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);
        });

        test('move a floating tab of many tabs to an existing floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { referencePanel: panel2 },
            });

            const panel4 = dockview.addPanel({
                id: 'panel_4',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(panel4.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(3);
            expect(dockview.panels).toHaveLength(4);

            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id, panelId: panel2.id },
                to: { group: panel4.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(panel4.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(3);
            expect(dockview.panels).toHaveLength(4);
        });

        test('move a fixed tab of one tab to an existing floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'right' },
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(3);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel1.group.id, panelId: panel1.id },
                to: { group: panel3.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('floating');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);
        });

        test('move a fixed tab of many tabs to an existing floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel1.group.id, panelId: panel1.id },
                to: { group: panel3.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('floating');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);
        });

        test('move a fixed group of one tab to an existing floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'right' },
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(3);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel1.group.id },
                to: { group: panel3.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('floating');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);
        });

        test('move a fixed group of many tabs to an existing floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                floating: true,
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel1.group.id },
                to: { group: panel3.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('floating');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(1);
            expect(dockview.panels).toHaveLength(3);
        });

        test('move a fixed tab of one tab to a new floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'right' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);

            dockview.addFloatingGroup(panel2);

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);
        });

        test('move a fixed tab of many tabs to a new floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(1);
            expect(dockview.panels).toHaveLength(2);

            dockview.addFloatingGroup(panel2);

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);
        });

        test('move a fixed group of one tab to a new floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'right' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);

            dockview.addFloatingGroup(panel2.group);

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);
        });

        test('move a fixed group of many tabs to a new floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(1);
            expect(dockview.panels).toHaveLength(2);

            dockview.addFloatingGroup(panel2.group);

            expect(panel1.group.api.location.type).toBe('floating');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(dockview.groups).toHaveLength(1);
            expect(dockview.panels).toHaveLength(2);
        });

        test('component should remain visible when moving from floating back to new grid group (GitHub issue #996)', () => {
            const container = document.createElement('div');
            container.style.width = '800px';
            container.style.height = '600px';
            document.body.appendChild(container);

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    const element = document.createElement('div');
                    element.innerHTML = `<div class="test-content-${options.id}">Test Content: ${options.id}</div>`;
                    element.style.background = 'lightblue';
                    element.style.padding = '10px';
                    return new PanelContentPartTest(options.id, options.name);
                },
            });

            dockview.layout(800, 600);

            try {
                const panel = dockview.addPanel({
                    id: 'test-panel',
                    component: 'default',
                });

                expect(panel.api.location.type).toBe('grid');

                dockview.addFloatingGroup(panel, {
                    position: {
                        bottom: 50,
                        right: 50,
                    },
                    width: 400,
                    height: 300,
                });

                expect(panel.api.location.type).toBe('floating');

                // Move back to grid using addGroup + moveTo pattern (reproducing user's exact issue)
                const addGroup = dockview.addGroup();
                panel.api.moveTo({ group: addGroup });

                expect(panel.api.location.type).toBe('grid');

                const panel2 = dockview.addPanel({
                    id: 'panel-2',
                    component: 'default',
                    floating: true,
                });

                const group2 = dockview.addGroup();
                panel2.api.moveTo({ group: group2 });

                expect(panel2.api.location.type).toBe('grid');
            } finally {
                dockview.dispose();
                if (container.parentElement) {
                    container.parentElement.removeChild(container);
                }
            }
        });
    });

    describe('popout group', () => {
        beforeEach(() => {
            jest.spyOn(window, 'open').mockReturnValue(
                fromPartial<Window>({
                    document: fromPartial<Document>({
                        body: document.createElement('body'),
                        createElement: (tag: string) =>
                            document.createElement(tag),
                    }),
                    focus: jest.fn(),
                    requestAnimationFrame: (cb: FrameRequestCallback) =>
                        window.requestAnimationFrame(cb),
                    addEventListener: jest
                        .fn()
                        .mockImplementation((name, cb) => {
                            if (name === 'load') {
                                cb();
                            }
                        }),
                    removeEventListener: jest.fn(),
                    close: jest.fn(),
                })
            );
        });

        test('deserailize popout with no reference group', async () => {
            jest.useRealTimers();

            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 1000);

            dockview.fromJSON({
                activeGroup: 'group-1',
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panel1'],
                                    id: 'group-1',
                                    activeView: 'panel1',
                                },
                                size: 1000,
                            },
                        ],
                        size: 1000,
                    },
                    height: 1000,
                    width: 1000,
                    orientation: Orientation.VERTICAL,
                },
                popoutGroups: [
                    {
                        data: {
                            views: ['panel2'],
                            id: 'group-2',
                            activeView: 'panel2',
                        },
                        position: null,
                    },
                ],
                panels: {
                    panel1: {
                        id: 'panel1',
                        contentComponent: 'default',
                        title: 'panel1',
                    },
                    panel2: {
                        id: 'panel2',
                        contentComponent: 'default',
                        title: 'panel2',
                    },
                },
            });

            await new Promise((resolve) => setTimeout(resolve, 0));

            const panel2 = dockview.api.getPanel('panel2');

            const windowObject =
                panel2?.api.location.type === 'popout'
                    ? panel2?.api.location.getWindow()
                    : undefined;

            expect(windowObject).toBeTruthy();

            windowObject!.close();
        });

        test('issue #851: fromJSON popout restoration is cancelled on dispose', async () => {
            jest.useFakeTimers();
            try {
                const container = document.createElement('div');

                const openSpy = jest.fn().mockImplementation(() => {
                    return setupMockWindow();
                });
                window.open = openSpy;

                const dockview = new DockviewComponent(container, {
                    createComponent(options) {
                        switch (options.name) {
                            case 'default':
                                return new PanelContentPartTest(
                                    options.id,
                                    options.name
                                );
                            default:
                                throw new Error(`unsupported`);
                        }
                    },
                });

                dockview.layout(1000, 1000);

                dockview.fromJSON({
                    activeGroup: 'group-1',
                    grid: {
                        root: {
                            type: 'branch',
                            data: [
                                {
                                    type: 'leaf',
                                    data: {
                                        views: ['panel1'],
                                        id: 'group-1',
                                        activeView: 'panel1',
                                    },
                                    size: 1000,
                                },
                            ],
                            size: 1000,
                        },
                        height: 1000,
                        width: 1000,
                        orientation: Orientation.VERTICAL,
                    },
                    popoutGroups: [
                        {
                            data: {
                                views: ['panel2'],
                                id: 'group-2',
                                activeView: 'panel2',
                            },
                            position: null,
                        },
                    ],
                    panels: {
                        panel1: {
                            id: 'panel1',
                            contentComponent: 'default',
                            title: 'panel1',
                        },
                        panel2: {
                            id: 'panel2',
                            contentComponent: 'default',
                            title: 'panel2',
                        },
                    },
                });

                // Dispose before the popout-restoration timer has had a chance
                // to fire. This simulates the React StrictMode mount -> dispose
                // -> remount sequence that triggers issue #851.
                expect(openSpy).not.toHaveBeenCalled();
                dockview.dispose();

                // Advance any timers and microtasks. With the fix in place the
                // queued popout restoration is cancelled in dispose() and the
                // guard inside the timeout body short-circuits any survivors,
                // so window.open must not be called.
                jest.runAllTimers();
                await Promise.resolve();
                jest.runAllTimers();

                expect(openSpy).not.toHaveBeenCalled();

                // The restoration promise should still resolve cleanly so
                // callers awaiting it don't hang.
                await dockview.popoutRestorationPromise;
            } finally {
                jest.useRealTimers();
            }
        });

        test('grid -> floating -> popout -> popout closed', async () => {
            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { direction: 'right' },
            });

            expect(panel1.api.location.type).toBe('grid');
            expect(panel2.api.location.type).toBe('grid');
            expect(panel3.api.location.type).toBe('grid');

            dockview.addFloatingGroup(panel2);

            expect(panel1.api.location.type).toBe('grid');
            expect(panel2.api.location.type).toBe('floating');
            expect(panel3.api.location.type).toBe('grid');

            await dockview.addPopoutGroup(panel2);

            expect(panel1.api.location.type).toBe('grid');
            expect(panel2.api.location.type).toBe('popout');
            expect(panel3.api.location.type).toBe('grid');

            const windowObject =
                panel2.api.location.type === 'popout'
                    ? panel2.api.location.getWindow()
                    : undefined;
            expect(windowObject).toBeTruthy();

            windowObject!.close();

            expect(panel1.api.location.type).toBe('grid');
            expect(panel2.api.location.type).toBe('floating');
            expect(panel3.api.location.type).toBe('grid');
        });

        test('grid -> floating -> popout -> floating', async () => {
            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { direction: 'right' },
            });

            expect(panel1.api.location.type).toBe('grid');
            expect(panel2.api.location.type).toBe('grid');
            expect(panel3.api.location.type).toBe('grid');

            dockview.addFloatingGroup(panel2.group);

            expect(panel1.api.location.type).toBe('floating');
            expect(panel2.api.location.type).toBe('floating');
            expect(panel3.api.location.type).toBe('grid');

            await dockview.addPopoutGroup(panel2.group);

            expect(panel1.api.location.type).toBe('popout');
            expect(panel2.api.location.type).toBe('popout');
            expect(panel3.api.location.type).toBe('grid');

            dockview.addFloatingGroup(panel2.group);

            expect(panel1.api.location.type).toBe('floating');
            expect(panel2.api.location.type).toBe('floating');
            expect(panel3.api.location.type).toBe('grid');

            await dockview.addPopoutGroup(panel2.group);

            expect(panel1.api.location.type).toBe('popout');
            expect(panel2.api.location.type).toBe('popout');
            expect(panel3.api.location.type).toBe('grid');

            panel2.group.api.moveTo({ group: panel3.group });

            expect(panel1.api.location.type).toBe('grid');
            expect(panel2.api.location.type).toBe('grid');
            expect(panel3.api.location.type).toBe('grid');
        });

        test('that panel is rendered when moving from popout to new group', async () => {
            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                renderer: 'always',
            });

            await dockview.addPopoutGroup(panel2);
            panel2.api.moveTo({ group: panel1.api.group, position: 'right' });

            expect(
                panel2.group.element.querySelectorAll(
                    '.dv-content-container > .testpanel-panel_2'
                )
            ).toHaveLength(1);

            await dockview.addPopoutGroup(panel3);
            panel3.api.moveTo({ group: panel1.api.group, position: 'right' });

            // Query from `container` because the overlay render container is
            // anchored to the shell element (parent of dockview.element).
            expect(
                container.querySelectorAll(
                    '.dv-render-overlay > .testpanel-panel_3'
                )
            ).toHaveLength(1);
            expect(
                panel2.group.element.querySelectorAll(
                    '.dv-content-container > .testpanel-panel_3'
                )
            ).toHaveLength(0);
        });

        test('move popout group of 1 panel inside grid', async () => {
            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { direction: 'right' },
            });

            await dockview.addPopoutGroup(panel2);

            panel2.api.moveTo({ position: 'top', group: panel3.group });

            expect(dockview.panels).toHaveLength(3);
            expect(dockview.groups).toHaveLength(3);
        });

        // Regression test for issue #1004: when a single-panel popout group is
        // dragged back into the dock as a panel (not as the whole group), the
        // empty reference group it left in the grid gets cascade-removed by
        // doRemoveGroup. The popout branch of moveGroupOrPanel used to compute
        // the target grid location before that cascade-removal, which left a
        // stale index that either misplaced the panel or threw "Invalid index"
        // at the far edge.
        const collectGridPanelOrder = (gridRoot: any): string[] => {
            const result: string[] = [];
            const walk = (node: any): void => {
                if (node.type === 'leaf') {
                    for (const view of node.data.views) {
                        result.push(view);
                    }
                } else if (node.type === 'branch') {
                    for (const child of node.data) {
                        walk(child);
                    }
                }
            };
            walk(gridRoot);
            return result;
        };

        test('issue #1004: panel from single-panel popout lands at correct index past original slot', async () => {
            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'right' },
            });
            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { direction: 'right' },
            });
            dockview.addPanel({
                id: 'panel_4',
                component: 'default',
                position: { direction: 'right' },
            });

            // Pop out panel_2 (sole panel in its group, so the whole group is
            // popped out and the original slot becomes an empty invisible
            // reference group in the main grid).
            await dockview.addPopoutGroup(panel2);
            expect(panel2.api.location.type).toBe('popout');

            // Drop the panel back onto the right edge of panel_3's group,
            // a neighbor following the original slot. Pre-fix this placed the
            // new group after panel_4 instead of between panel_3 and panel_4.
            panel2.api.moveTo({
                group: panel3.api.group,
                position: 'right',
            });

            expect(panel2.api.location.type).toBe('grid');
            expect(dockview.panels).toHaveLength(4);
            // The empty popout reference group should have been cleaned up.
            expect(dockview.groups).toHaveLength(4);

            const gridOrder = collectGridPanelOrder(
                JSON.parse(JSON.stringify(dockview.toJSON())).grid.root
            );
            expect(gridOrder).toEqual([
                'panel_1',
                'panel_3',
                'panel_2',
                'panel_4',
            ]);
        });

        test('issue #1004: panel from single-panel popout dropped past far edge does not throw', async () => {
            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'right' },
            });
            dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { direction: 'right' },
            });
            const panel4 = dockview.addPanel({
                id: 'panel_4',
                component: 'default',
                position: { direction: 'right' },
            });

            await dockview.addPopoutGroup(panel2);
            expect(panel2.api.location.type).toBe('popout');

            // Drop on the far right edge. Pre-fix this threw "Invalid index"
            // because the stale target index pointed past the end of the grid
            // after the empty reference group was cascade-removed.
            expect(() =>
                panel2.api.moveTo({
                    group: panel4.api.group,
                    position: 'right',
                })
            ).not.toThrow();

            expect(panel2.api.location.type).toBe('grid');
            expect(dockview.panels).toHaveLength(4);
            expect(dockview.groups).toHaveLength(4);

            const gridOrder = collectGridPanelOrder(
                JSON.parse(JSON.stringify(dockview.toJSON())).grid.root
            );
            expect(gridOrder).toEqual([
                'panel_1',
                'panel_3',
                'panel_4',
                'panel_2',
            ]);
        });

        test('add a popout group', async () => {
            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(1);
            expect(dockview.panels).toHaveLength(2);

            const events: SizeEvent[] = [];

            panel2.api.onDidDimensionsChange((event) => {
                events.push(event);
            });

            const originalGroup = panel2.group;

            expect(await dockview.addPopoutGroup(panel2.group)).toBeTruthy();

            expect(events).toEqual([{ height: 2000, width: 1000 }]);

            expect(originalGroup.api.location.type).toBe('grid');
            expect(originalGroup.api.isVisible).toBeFalsy();

            expect(panel1.group.api.location.type).toBe('popout');
            expect(panel2.group.api.location.type).toBe('popout');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(2);

            if (panel2.api.location.type !== 'popout') {
                fail('unexpected');
            }
            const alternativeWindow = panel2.api.location.getWindow();
            alternativeWindow.dispatchEvent(new Event('resize'));

            expect(events).toEqual([
                { height: 2000, width: 1000 },
                { height: 2001, width: 1001 },
            ]);
        });

        test('popout / floating layouts', async () => {
            jest.useRealTimers();
            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            let panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            let panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            let panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
            });

            let panel4 = dockview.addPanel({
                id: 'panel_4',
                component: 'default',
            });

            expect(panel1.api.location.type).toBe('grid');
            expect(panel2.api.location.type).toBe('grid');
            expect(panel3.api.location.type).toBe('grid');
            expect(panel4.api.location.type).toBe('grid');

            dockview.addFloatingGroup(panel2);
            dockview.addFloatingGroup(panel3);

            expect(panel1.api.location.type).toBe('grid');
            expect(panel2.api.location.type).toBe('floating');
            expect(panel3.api.location.type).toBe('floating');
            expect(panel4.api.location.type).toBe('grid');

            await dockview.addPopoutGroup(panel2);
            await dockview.addPopoutGroup(panel4);

            expect(panel1.api.location.type).toBe('grid');
            expect(panel2.api.location.type).toBe('popout');
            expect(panel3.api.location.type).toBe('floating');
            expect(panel4.api.location.type).toBe('popout');

            const state = dockview.toJSON();
            dockview.fromJSON(state);

            /**
             * Wait for delayed popout group creation to complete
             */
            await dockview.popoutRestorationPromise;

            expect(dockview.panels).toHaveLength(4);

            panel1 = dockview.api.getPanel('panel_1') as DockviewPanel;
            panel2 = dockview.api.getPanel('panel_2') as DockviewPanel;
            panel3 = dockview.api.getPanel('panel_3') as DockviewPanel;
            panel4 = dockview.api.getPanel('panel_4') as DockviewPanel;

            expect(panel1.api.location.type).toBe('grid');
            expect(panel2.api.location.type).toBe('popout');
            expect(panel3.api.location.type).toBe('floating');
            expect(panel4.api.location.type).toBe('popout');

            dockview.clear();
            expect(dockview.groups).toHaveLength(0);
            expect(dockview.panels).toHaveLength(0);
        });

        test('close popout window object', async () => {
            const container = document.createElement('div');

            const mockWindow = setupMockWindow();
            window.open = () => mockWindow;

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            let panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            let panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { referencePanel: panel1, direction: 'within' },
            });

            let panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
            });

            dockview.addFloatingGroup(panel2);
            await dockview.addPopoutGroup(panel2);

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('popout');
            expect(panel3.group.api.location.type).toBe('grid');

            mockWindow.close();

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('floating');
            expect(panel3.group.api.location.type).toBe('grid');

            dockview.clear();
            expect(dockview.groups).toHaveLength(0);
            expect(dockview.panels).toHaveLength(0);
        });

        test('remove all panels from popout group', async () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'right' },
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { referencePanel: panel2 },
            });

            expect(await dockview.addPopoutGroup(panel2.group)).toBeTruthy();

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('popout');
            expect(panel3.group.api.location.type).toBe('popout');

            expect(dockview.panels).toHaveLength(3);
            expect(dockview.groups).toHaveLength(3); // includes one hidden group

            panel2.api.moveTo({ group: panel1.group, position: 'left' });
            expect(dockview.panels).toHaveLength(3);
            expect(dockview.groups).toHaveLength(4);

            panel3.api.moveTo({ group: panel1.group, position: 'left' });
            expect(dockview.panels).toHaveLength(3);
            expect(dockview.groups).toHaveLength(3);
        });

        test('that can remove a popout group', async () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            expect(await dockview.addPopoutGroup(panel1)).toBeTruthy();

            expect(dockview.panels).toHaveLength(1);
            expect(dockview.groups).toHaveLength(2);
            expect(panel1.api.group.api.location.type).toBe('popout');

            dockview.removePanel(panel1);

            expect(dockview.panels).toHaveLength(0);
            expect(dockview.groups).toHaveLength(0);
        });

        test('getPopupServiceForGroup returns a per-popout service rooted in the popout window', async () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });
            const dockedGroup = panel1.api.group;

            // Before popout, the group shares the main popupService
            expect(dockview.getPopupServiceForGroup(dockedGroup)).toBe(
                dockview.popupService
            );

            expect(await dockview.addPopoutGroup(panel1)).toBeTruthy();

            // addPopoutGroup creates a new group for the popout window, so
            // panel1's group reference now points at it
            const popoutGroup = panel1.api.group;
            expect(popoutGroup).not.toBe(dockedGroup);

            // The popout group has a dedicated popupService, required so
            // its context menus render in the popout window, not the main one
            const popoutService = dockview.getPopupServiceForGroup(popoutGroup);
            expect(popoutService).not.toBe(dockview.popupService);

            // Closing the popout removes its popupService from the registry
            dockview.removePanel(panel1);
            expect(dockview.getPopupServiceForGroup(popoutGroup)).toBe(
                dockview.popupService
            );
        });

        test('popout single panel -> save layout -> load layout', async () => {
            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
            });

            const panel4 = dockview.addPanel({
                id: 'panel_4',
                component: 'default',
                position: { direction: 'right' },
            });

            expect(dockview.panels).toHaveLength(4);
            expect(dockview.groups).toHaveLength(2);

            expect(await dockview.addPopoutGroup(panel1)).toBeTruthy();

            expect(dockview.panels).toHaveLength(4);
            expect(dockview.groups).toHaveLength(3);

            expect(panel1.api.location.type).toBe('popout');

            dockview.fromJSON(dockview.toJSON());

            await new Promise((resolve) => setTimeout(resolve, 0)); // popout views are completed as a promise so must complete microtask-queue

            expect(dockview.panels).toHaveLength(4);
            expect(dockview.groups).toHaveLength(3);
            expect(dockview.groups.every((g) => g.api.isVisible)).toBeTruthy();
        });

        test('move from fixed to popout group and back', async () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: {
                    direction: 'right',
                },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);

            expect(await dockview.addPopoutGroup(panel2.group)).toBeTruthy();

            expect(panel1.group.api.location.type).toBe('popout');
            expect(panel2.group.api.location.type).toBe('popout');
            expect(panel3.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(3);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id, panelId: panel2.id },
                to: { group: panel3.group, position: 'right' },
            });

            expect(panel1.group.api.location.type).toBe('popout');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(4);
            expect(dockview.panels).toHaveLength(3);

            dockview.moveGroupOrPanel({
                from: { groupId: panel1.group.id, panelId: panel1.id },
                to: { group: panel3.group, position: 'center' },
            });

            expect(panel1.group.api.location.type).toBe('grid');
            expect(panel2.group.api.location.type).toBe('grid');
            expect(panel3.group.api.location.type).toBe('grid');
            expect(dockview.groups).toHaveLength(2);
            expect(dockview.panels).toHaveLength(3);
        });

        test('persistance with custom url', async () => {
            jest.useFakeTimers();
            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'right' },
            });

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                position: { direction: 'right' },
            });

            expect(await dockview.addPopoutGroup(panel2.group)).toBeTruthy();
            expect(
                await dockview.addPopoutGroup(panel3.group, {
                    popoutUrl: '/custom.html',
                })
            ).toBeTruthy();

            const state = dockview.toJSON();

            expect(state.popoutGroups).toEqual([
                {
                    data: {
                        activeView: 'panel_2',
                        id: '4',
                        views: ['panel_2'],
                    },
                    gridReferenceGroup: '2',
                    position: {
                        height: 2001,
                        left: undefined,
                        top: undefined,
                        width: 1001,
                    },
                    url: undefined,
                },
                {
                    data: {
                        activeView: 'panel_3',
                        id: '5',
                        views: ['panel_3'],
                    },
                    gridReferenceGroup: '3',
                    position: {
                        height: 2001,
                        left: undefined,
                        top: undefined,
                        width: 1001,
                    },
                    url: '/custom.html',
                },
            ]);

            dockview.clear();
            expect(dockview.groups).toHaveLength(0);

            dockview.fromJSON(state);

            // Advance timers to trigger delayed popout creation (0ms, 100ms delays)
            jest.advanceTimersByTime(200);

            // Wait for the popout restoration to complete
            await dockview.popoutRestorationPromise;

            expect(dockview.toJSON().popoutGroups).toEqual([
                {
                    data: {
                        activeView: 'panel_2',
                        id: '4',
                        views: ['panel_2'],
                    },
                    gridReferenceGroup: '2',
                    position: {
                        height: 2001,
                        left: undefined,
                        top: undefined,
                        width: 1001,
                    },
                    url: undefined,
                },
                {
                    data: {
                        activeView: 'panel_3',
                        id: '5',
                        views: ['panel_3'],
                    },
                    gridReferenceGroup: '3',
                    position: {
                        height: 2001,
                        left: undefined,
                        top: undefined,
                        width: 1001,
                    },
                    url: '/custom.html',
                },
            ]);

            jest.useRealTimers();
        });

        test('restoring popouts while the browser blocks popups falls back to the grid and clears cleanly', async () => {
            jest.useFakeTimers();
            window.open = () => setupMockWindow();
            const container = document.createElement('div');
            const dockview = new DockviewComponent(container, {
                createComponent(o) {
                    return new PanelContentPartTest(o.id, o.name);
                },
            });
            dockview.layout(1000, 500);
            dockview.addPanel({ id: 'p1', component: 'default' });
            const p2 = dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });
            const p3 = dockview.addPanel({
                id: 'p3',
                component: 'default',
                position: { direction: 'right' },
            });
            await dockview.addPopoutGroup(p2.group);
            await dockview.addPopoutGroup(p3.group);
            const state = dockview.toJSON();

            // the browser blocks the popouts when the layout is restored
            (window as any).open = () => null;

            dockview.clear();
            dockview.fromJSON(state);
            jest.advanceTimersByTime(500);
            await dockview.popoutRestorationPromise;

            // blocked popout content is not lost; it falls back into the grid
            expect(dockview.panels.map((p) => p.id).sort()).toEqual([
                'p1',
                'p2',
                'p3',
            ]);
            expect(
                dockview.groups.filter((g) => g.api.location.type === 'popout')
            ).toHaveLength(0);

            // and clearing the restored layout doesn't throw on orphaned groups
            expect(() => dockview.clear()).not.toThrow();
            expect(dockview.groups).toHaveLength(0);

            jest.useRealTimers();
        });

        describe('when browsers block popups', () => {
            let container: HTMLDivElement;
            let dockview: DockviewComponent;
            let panel: DockviewPanel;

            beforeEach(() => {
                jest.spyOn(window, 'open').mockReturnValue(null);

                container = document.createElement('div');

                dockview = new DockviewComponent(container, {
                    createComponent(options) {
                        switch (options.name) {
                            case 'default':
                                return new PanelContentPartTest(
                                    options.id,
                                    options.name
                                );
                            default:
                                throw new Error(`unsupported`);
                        }
                    },
                });

                dockview.layout(1000, 500);

                panel = dockview.addPanel({
                    id: 'panel_1',
                    component: 'default',
                });
            });

            test('onDidOpenPoputWindowFail event is emitted', async () => {
                const onDidBlockPopoutHandler = jest.fn();
                dockview.onDidOpenPopoutWindowFail(onDidBlockPopoutHandler);

                await dockview.addPopoutGroup(panel.group);

                expect(onDidBlockPopoutHandler).toHaveBeenCalledTimes(1);
            });

            test('popout group is restored to its original position', async () => {
                await dockview.addPopoutGroup(panel.group);

                expect(panel.group.api.location.type).toBe('grid');
            });
        });

        test('issue #1304: re-entrant fromJSON cancels pending popout restorations', async () => {
            jest.useFakeTimers();
            try {
                const container = document.createElement('div');

                const openSpy = jest.fn().mockImplementation(setupMockWindow);
                window.open = openSpy;

                const dockview = new DockviewComponent(container, {
                    createComponent(options) {
                        switch (options.name) {
                            case 'default':
                                return new PanelContentPartTest(
                                    options.id,
                                    options.name
                                );
                            default:
                                throw new Error(`unsupported`);
                        }
                    },
                });

                dockview.layout(1000, 1000);

                const popoutLayout = {
                    grid: {
                        root: {
                            type: 'branch' as const,
                            data: [
                                {
                                    type: 'leaf' as const,
                                    data: {
                                        views: [],
                                        id: '1',
                                        activeView: undefined as any,
                                    },
                                    visible: false,
                                },
                            ],
                        },
                        orientation: Orientation.VERTICAL,
                        width: 1000,
                        height: 1000,
                    },
                    panels: {
                        id_0: {
                            id: 'id_0',
                            contentComponent: 'default',
                        },
                    },
                    activeGroup: '2',
                    popoutGroups: [
                        {
                            data: {
                                views: ['id_0'],
                                activeView: 'id_0',
                                id: '2',
                            },
                            gridReferenceGroup: '1',
                            position: {
                                top: 500,
                                left: 500,
                                width: 100,
                                height: 100,
                            },
                        },
                    ],
                };

                const emptyLayout = {
                    grid: {
                        root: { type: 'branch' as const, data: [] },
                        orientation: Orientation.VERTICAL,
                        width: 1000,
                        height: 1000,
                    },
                    panels: {},
                };

                expect(() => {
                    dockview.fromJSON(popoutLayout as any);
                    dockview.fromJSON(popoutLayout as any);
                    dockview.fromJSON(emptyLayout as any);
                }).not.toThrow();

                // Drain any timers. None should still be in flight, but if
                // any survive they must not call window.open or throw.
                jest.runAllTimers();
                await dockview.popoutRestorationPromise;

                // Final layout is empty, no popouts should have opened.
                expect(openSpy).not.toHaveBeenCalled();
                expect(dockview.groups).toHaveLength(0);
                expect(dockview.panels).toHaveLength(0);

                // The component should still be usable: loading a fresh
                // layout after the sequence must succeed.
                expect(() => {
                    dockview.fromJSON(popoutLayout as any);
                }).not.toThrow();

                jest.runAllTimers();
                await dockview.popoutRestorationPromise;

                dockview.dispose();
            } finally {
                jest.useRealTimers();
            }
        });

        test('rapid repeated fromJSON with popouts does not throw on orphaned groups', async () => {
            jest.useFakeTimers();
            window.open = () => setupMockWindow();
            const container = document.createElement('div');
            const dockview = new DockviewComponent(container, {
                createComponent: (o) => new PanelContentPartTest(o.id, o.name),
            });
            dockview.layout(1000, 500);
            dockview.addPanel({ id: 'p1', component: 'default' });
            const p2 = dockview.addPanel({
                id: 'p2',
                component: 'default',
                position: { direction: 'right' },
            });
            const p3 = dockview.addPanel({
                id: 'p3',
                component: 'default',
                position: { direction: 'right' },
            });
            await dockview.addPopoutGroup(p2.group);
            await dockview.addPopoutGroup(p3.group);
            const state = JSON.parse(JSON.stringify(dockview.toJSON()));

            for (let i = 0; i < 6; i++) {
                expect(() => dockview.fromJSON(state)).not.toThrow();
                jest.advanceTimersByTime(60); // let some popout timers fire
            }
            dockview.dispose();
            jest.useRealTimers();
        });

        test('dispose of dockview instance when popup is open', async () => {
            const container = document.createElement('div');

            window.open = () => setupMockWindow();

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
            });

            expect(await dockview.addPopoutGroup(panel2.group)).toBeTruthy();

            dockview.dispose();
        });
    });

    describe('maximized group', () => {
        test('that a maximzied group is set to active', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 500);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'right' },
            });

            expect(panel1.api.isActive).toBeFalsy();
            expect(panel1.group.api.isActive).toBeFalsy();
            expect(panel2.api.isActive).toBeTruthy();
            expect(panel2.group.api.isActive).toBeTruthy();

            panel1.api.maximize();

            expect(panel1.api.isActive).toBeTruthy();
            expect(panel1.group.api.isActive).toBeTruthy();
            expect(panel2.api.isActive).toBeFalsy();
            expect(panel2.group.api.isActive).toBeFalsy();
        });
    });

    describe('that emits onDidLayoutChange', () => {
        let dockview: DockviewComponent;

        beforeEach(() => {
            jest.useFakeTimers();

            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
        });

        afterEach(() => {
            jest.runAllTimers();
            jest.useRealTimers();
        });

        test('when panels or groups change', () => {
            const didLayoutChangeHandler = jest.fn();
            dockview.onDidLayoutChange(didLayoutChangeHandler);

            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { referenceGroup: panel1.group },
            });
            jest.runAllTimers();
            expect(didLayoutChangeHandler).toHaveBeenCalledTimes(1);

            const group = dockview.addGroup();
            jest.runAllTimers();
            expect(didLayoutChangeHandler).toHaveBeenCalledTimes(2);

            group.api.close();
            jest.runAllTimers();
            expect(didLayoutChangeHandler).toHaveBeenCalledTimes(3);

            panel1.api.setActive();
            jest.runAllTimers();
            expect(didLayoutChangeHandler).toHaveBeenCalledTimes(4);

            dockview.moveGroupOrPanel({
                from: {
                    groupId: panel1.group.api.id,
                    panelId: panel1.api.id,
                },
                to: {
                    group: panel1.group,
                    position: 'center',
                    index: 1,
                },
            });

            panel2.api.close();
            jest.runAllTimers();
            expect(didLayoutChangeHandler).toHaveBeenCalledTimes(5);
        });

        test('that emits onDidPanelTitleChange and onDidLayoutChange when the panel set a title', () => {
            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const didLayoutChangeHandler = jest.fn();
            const { dispose: disposeDidLayoutChangeHandler } =
                dockview.onDidLayoutChange(didLayoutChangeHandler);

            panel1.setTitle('new title');

            jest.runAllTimers();

            expect(didLayoutChangeHandler).toHaveBeenCalledTimes(1);

            disposeDidLayoutChangeHandler();
        });

        test('that emits onDidPanelParametersChange and onDidLayoutChange when the panel updates parameters', () => {
            const panel1 = dockview.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const didLayoutChangeHandler = jest.fn();
            const { dispose: disposeDidLayoutChangeHandler } =
                dockview.onDidLayoutChange(didLayoutChangeHandler);

            panel1.api.updateParameters({ keyA: 'valueA' });

            jest.runAllTimers();

            expect(didLayoutChangeHandler).toHaveBeenCalledTimes(1);

            disposeDidLayoutChangeHandler();
        });

        test('when edge groups are added or removed (including empty)', () => {
            const didLayoutChangeHandler = jest.fn();
            dockview.onDidLayoutChange(didLayoutChangeHandler);

            dockview.addEdgeGroup('left', { id: 'edge-left' });
            jest.runAllTimers();
            expect(didLayoutChangeHandler).toHaveBeenCalledTimes(1);

            // remove an empty edge group: fires only _onDidRemoveGroup (no
            // panel events). Without _onDidRemoveGroup in the composition
            // this would not fire.
            dockview.removeEdgeGroup('left');
            jest.runAllTimers();
            expect(didLayoutChangeHandler).toHaveBeenCalledTimes(2);
        });
    });

    describe('panel visibility', () => {
        test('that setVisible toggles visiblity', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = api.addPanel({
                id: 'panel2',
                component: 'default',
                position: { referencePanel: panel1, direction: 'within' },
            });

            const panel3 = api.addPanel({
                id: 'panel3',
                component: 'default',
                position: { referencePanel: panel1, direction: 'right' },
            });

            const panel4 = api.addPanel({
                id: 'panel4',
                component: 'default',
                position: { referencePanel: panel3, direction: 'within' },
            });

            expect(api.groups).toHaveLength(2);
            expect(panel1.group).toBe(panel2.group);
            expect(panel3.group).toBe(panel4.group);

            expect(panel1.group.api.isVisible).toBeTruthy();
            expect(panel2.group.api.isVisible).toBeTruthy();
            expect(panel3.group.api.isVisible).toBeTruthy();
            expect(panel4.group.api.isVisible).toBeTruthy();

            expect(panel1.api.isVisible).toBeFalsy();
            expect(panel2.api.isVisible).toBeTruthy();
            expect(panel3.api.isVisible).toBeFalsy();
            expect(panel4.api.isVisible).toBeTruthy();

            // case #1
            panel1.group.api.setVisible(false);

            expect(panel1.group.api.isVisible).toBeFalsy();
            expect(panel2.group.api.isVisible).toBeFalsy();
            expect(panel3.group.api.isVisible).toBeTruthy();
            expect(panel4.group.api.isVisible).toBeTruthy();

            expect(panel1.api.isVisible).toBeFalsy();
            expect(panel2.api.isVisible).toBeFalsy();
            expect(panel3.api.isVisible).toBeFalsy();
            expect(panel4.api.isVisible).toBeTruthy();

            // case #2

            panel3.group.api.setVisible(false);

            expect(panel1.group.api.isVisible).toBeFalsy();
            expect(panel2.group.api.isVisible).toBeFalsy();
            expect(panel3.group.api.isVisible).toBeFalsy();
            expect(panel4.group.api.isVisible).toBeFalsy();

            expect(panel1.api.isVisible).toBeFalsy();
            expect(panel2.api.isVisible).toBeFalsy();
            expect(panel3.api.isVisible).toBeFalsy();
            expect(panel4.api.isVisible).toBeFalsy();

            // case #2

            panel3.group.api.setVisible(true);

            expect(panel1.group.api.isVisible).toBeFalsy();
            expect(panel2.group.api.isVisible).toBeFalsy();
            expect(panel3.group.api.isVisible).toBeTruthy();
            expect(panel4.group.api.isVisible).toBeTruthy();

            expect(panel1.api.isVisible).toBeFalsy();
            expect(panel2.api.isVisible).toBeFalsy();
            expect(panel3.api.isVisible).toBeFalsy();
            expect(panel4.api.isVisible).toBeTruthy();

            // case #2

            panel1.group.api.setVisible(true);

            expect(panel1.group.api.isVisible).toBeTruthy();
            expect(panel2.group.api.isVisible).toBeTruthy();
            expect(panel3.group.api.isVisible).toBeTruthy();
            expect(panel4.group.api.isVisible).toBeTruthy();

            expect(panel1.api.isVisible).toBeFalsy();
            expect(panel2.api.isVisible).toBeTruthy();
            expect(panel3.api.isVisible).toBeFalsy();
            expect(panel4.api.isVisible).toBeTruthy();
        });

        test('setVisible #1', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = api.addPanel({
                id: 'panel2',
                component: 'default',
                position: { referencePanel: panel1, direction: 'below' },
            });

            const panel3 = api.addPanel({
                id: 'panel3',
                component: 'default',
                position: { referencePanel: panel1, direction: 'below' },
            });

            expect(api.groups).toHaveLength(3);

            panel1.group.api.setVisible(false);
            panel2.group.api.setVisible(false);
            panel3.group.api.setVisible(false);

            expect(panel1.group.api.isVisible).toBeFalsy();
            expect(panel2.group.api.isVisible).toBeFalsy();
            expect(panel3.group.api.isVisible).toBeFalsy();

            panel1.group.api.setVisible(true);

            expect(panel1.group.api.isVisible).toBeTruthy();
            expect(panel2.group.api.isVisible).toBeFalsy();
            expect(panel3.group.api.isVisible).toBeFalsy();
        });

        test('that watermark appears when all views are not visible', () => {
            jest.useFakeTimers();
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel_1',
                component: 'default',
            });
            const panel2 = api.addPanel({
                id: 'panel_2',
                component: 'default',
                position: {
                    direction: 'right',
                },
            });

            let query = queryByTestId(container, 'watermark-component');
            expect(query).toBeFalsy();

            panel1.group.api.setVisible(false);
            jest.runAllTicks(); // visibility events check fires on microtask-queue
            query = queryByTestId(container, 'watermark-component');
            expect(query).toBeFalsy();

            panel2.group.api.setVisible(false);
            jest.runAllTicks(); // visibility events check fires on microtask-queue
            query = queryByTestId(container, 'watermark-component');
            expect(query).toBeTruthy();

            panel1.group.api.setVisible(true);
            jest.runAllTicks(); // visibility events check fires on microtask-queue
            query = queryByTestId(container, 'watermark-component');
            expect(query).toBeFalsy();
        });

        test('setVisible on floating group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = api.addPanel({
                id: 'panel2',
                component: 'default',
                position: { referencePanel: panel1, direction: 'below' },
            });

            const panel3 = api.addPanel({
                id: 'panel3',
                component: 'default',
                position: { referencePanel: panel1, direction: 'below' },
            });

            api.addFloatingGroup(panel2);
            expect(panel2.api.location.type).toBe('floating');

            panel2.api.group.setVisible(false);
            expect(panel2.api.isVisible).toBeFalsy();
            expect(panel2.api.group.api.isVisible).toBeFalsy();

            panel2.api.group.setVisible(true);
            expect(panel2.api.isVisible).toBeTruthy();
            expect(panel2.api.group.api.isVisible).toBeTruthy();

            panel2.api.group.setVisible(false);
            expect(panel2.api.isVisible).toBeFalsy();
            expect(panel2.api.group.api.isVisible).toBeFalsy();

            panel2.api.group.api.moveTo({
                group: panel1.group,
                position: 'left',
            });
            expect(api.groups).toHaveLength(3);
            expect(panel2.api.isVisible).toBeFalsy();
            expect(panel2.api.group.api.isVisible).toBeFalsy();

            panel2.api.group.setVisible(true);
            expect(panel2.api.isVisible).toBeTruthy();
            expect(panel2.api.group.api.isVisible).toBeTruthy();
        });

        test('setVisible on popout group should have no effect', async () => {
            window.open = () => setupMockWindow();

            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = api.addPanel({
                id: 'panel2',
                component: 'default',
                position: { referencePanel: panel1, direction: 'below' },
            });

            const panel3 = api.addPanel({
                id: 'panel3',
                component: 'default',
                position: { referencePanel: panel1, direction: 'below' },
            });

            await api.addPopoutGroup(panel2);
            expect(panel2.api.location.type).toBe('popout');

            expect(panel2.api.group.api.isVisible).toBeTruthy();
            panel2.api.group.api.setVisible(false);
            expect(panel2.api.group.api.isVisible).toBeTruthy();
        });

        test('opening a popout group from a group that is non visible should automatically make it visible', async () => {
            window.open = () => setupMockWindow();

            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = api.addPanel({
                id: 'panel2',
                component: 'default',
                position: { referencePanel: panel1, direction: 'below' },
            });

            const panel3 = api.addPanel({
                id: 'panel3',
                component: 'default',
                position: { referencePanel: panel1, direction: 'below' },
            });

            panel2.api.group.api.setVisible(false);

            await api.addPopoutGroup(panel2);
            expect(panel2.api.location.type).toBe('popout');
            expect(panel2.api.group.api.isVisible).toBeTruthy();
        });
    });

    describe('addPanel', () => {
        test('that can add panel to index with referencePanel', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = api.addPanel({
                id: 'panel_2',
                component: 'default',
                position: {
                    referencePanel: panel1,
                },
            });

            const panel3 = api.addPanel({
                id: 'panel_3',
                component: 'default',
                position: {
                    referencePanel: panel1,
                    index: 1,
                },
            });

            expect(panel1.api.group.panels).toEqual([panel1, panel3, panel2]);
        });

        test('that can add panel to index with referenceGroup', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel_1',
                component: 'default',
            });

            const panel2 = api.addPanel({
                id: 'panel_2',
                component: 'default',
                position: {
                    referencePanel: panel1,
                    index: 1,
                },
            });

            const panel3 = api.addPanel({
                id: 'panel_3',
                component: 'default',
                position: {
                    referenceGroup: panel1.api.group,
                    index: 1,
                },
            });

            expect(panel1.api.group.panels).toEqual([panel1, panel3, panel2]);

            panel1.api.moveTo({ index: 1 });

            expect(panel1.api.group.panels).toEqual([panel3, panel1, panel2]);
        });

        test('panel moveTo with skipSetActive should not activate group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 1000);

            dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            const panel1 = dockview.getGroupPanel('panel1')!;
            const panel2 = dockview.getGroupPanel('panel2')!;

            // Move panel2 to a new group to the right
            panel2.api.moveTo({ position: 'right' });

            // panel2's group should be active
            expect(dockview.activeGroup).toBe(panel2.group);
            expect(dockview.activePanel?.id).toBe(panel2.id);

            // Now move panel1 to panel2's group without setting it active
            panel1.api.moveTo({
                group: panel2.group,
                position: 'center',
                skipSetActive: true,
            });

            // panel2's group should still be active, but panel2 should still be the active panel
            expect(dockview.activeGroup).toBe(panel2.group);
            expect(dockview.activePanel?.id).toBe(panel2.id);
            expect(panel1.group).toBe(panel2.group);
        });

        test('group moveTo with skipSetActive should not activate group', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 1000);

            dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            dockview.addPanel({
                id: 'panel3',
                component: 'default',
            });

            const panel1 = dockview.getGroupPanel('panel1')!;
            const panel2 = dockview.getGroupPanel('panel2')!;
            const panel3 = dockview.getGroupPanel('panel3')!;

            panel2.api.moveTo({ position: 'right' });

            panel3.api.moveTo({ group: panel2.group, position: 'center' });

            expect(dockview.activeGroup).toBe(panel2.group);

            dockview.doSetGroupActive(panel1.group);
            expect(dockview.activeGroup).toBe(panel1.group);

            panel2.group.api.moveTo({
                group: panel1.group,
                position: 'center',
                skipSetActive: true,
            });

            expect(dockview.activeGroup).toBe(panel1.group);
            expect(dockview.activePanel).toBeTruthy();
            expect(panel2.group).toBe(panel1.group);
            expect(panel3.group).toBe(panel1.group);
        });

        test('panel moveTo without skipSetActive should activate group (default behavior)', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(1000, 1000);

            dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            const panel1 = dockview.getGroupPanel('panel1')!;
            const panel2 = dockview.getGroupPanel('panel2')!;

            panel2.api.moveTo({ position: 'right' });

            dockview.doSetGroupActive(panel1.group);
            expect(dockview.activeGroup).toBe(panel1.group);

            panel1.api.moveTo({
                group: panel2.group,
                position: 'center',
            });

            expect(dockview.activeGroup).toBe(panel2.group);
            expect(dockview.activePanel?.id).toBe(panel1.id);
            expect(panel1.group).toBe(panel2.group);
        });

        test('that can add panel', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel_1',
                component: 'default',
            });
            expect(api.activePanel).toBe(panel1);

            api.addPanel({
                id: 'panel_2',
                component: 'default',
                inactive: true,
            });
            expect(api.activePanel).toBe(panel1);
        });

        test('that can add panel with absolute direction', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel_1',
                component: 'default',
                position: { direction: 'right' },
            });
            expect(api.activePanel).toBe(panel1);

            api.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'right' },
                inactive: true,
            });
            expect(api.activePanel).toBe(panel1);
        });

        test('that can add floating panel', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel_1',
                component: 'default',
                floating: true,
            });
            expect(api.activePanel).toBe(panel1);

            api.addPanel({
                id: 'panel_2',
                component: 'default',
                floating: true,
                inactive: true,
            });
            expect(api.activePanel).toBe(panel1);
        });

        test('that can add panel positional to another (within)', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel_1',
                component: 'default',
            });
            expect(api.activePanel).toBe(panel1);

            api.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'within', referencePanel: panel1 },
                inactive: true,
            });
            expect(api.activePanel).toBe(panel1);
        });

        test('that can add panel positional to another (not within)', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            const panel1 = api.addPanel({
                id: 'panel_1',
                component: 'default',
            });
            expect(api.activePanel).toBe(panel1);

            api.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { direction: 'right', referencePanel: panel1 },
                inactive: true,
            });
            expect(api.activePanel).toBe(panel1);
        });
    });

    describe('events flow', () => {
        test('that floating a panel should not call an additional addPanel event', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);

            let addPanelCount = 0;
            let addGroupCount = 0;

            api.onDidAddPanel((event) => {
                addPanelCount++;
            });
            api.onDidAddGroup((event) => {
                addGroupCount++;
            });

            api.addPanel({
                id: 'panel_1',
                component: 'default',
            });
            const panel2 = api.addPanel({
                id: 'panel_2',
                component: 'default',
                position: { referencePanel: 'panel_1' },
            });

            expect(addPanelCount).toBe(2);
            expect(addGroupCount).toBe(1);

            api.addFloatingGroup(panel2);

            expect(addPanelCount).toBe(2);
            expect(addGroupCount).toBe(2);
        });
    });

    test('that `onDidLayoutChange` only subscribes to events after initial subscription time', () => {
        jest.useFakeTimers();

        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });
        const api = new DockviewApi(dockview);

        dockview.layout(1000, 1000);

        let a = 0;

        api.onDidLayoutChange((e) => {
            a++;
        });

        api.addPanel({
            id: 'panel_1',
            component: 'default',
        });
        api.addPanel({
            id: 'panel_2',
            component: 'default',
        });
        api.addPanel({
            id: 'panel_3',
            component: 'default',
        });

        let b = 0;

        api.onDidLayoutChange((e) => {
            b++;
        });

        jest.runAllTicks();

        expect(a).toBe(1);
        expect(b).toBe(0);
    });

    test('addGroup with absolute position', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });
        const api = new DockviewApi(dockview);

        dockview.layout(1000, 1000);

        api.addPanel({
            id: 'panel_1',
            component: 'default',
        });
        api.addPanel({
            id: 'panel_2',
            component: 'default',
        });
        const panel3 = api.addPanel({
            id: 'panel_3',
            component: 'default',
            position: { direction: 'right' },
        });

        expect(api.panels).toHaveLength(3);
        expect(api.groups).toHaveLength(2);

        api.addGroup({ direction: 'left' });

        expect(api.panels).toHaveLength(3);
        expect(api.groups).toHaveLength(3);
    });

    test('addGroup calls normalize method on gridview', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });
        const api = new DockviewApi(dockview);

        dockview.layout(1000, 1000);

        // Add initial panel
        api.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        // Access gridview through the (any) cast to bypass protected access
        const gridview = (dockview as any).gridview;

        // Mock the normalize method to verify it's called
        const normalizeSpy = jest.spyOn(gridview, 'normalize');

        // Adding a group should trigger normalization
        api.addGroup({ direction: 'left' });

        // Verify normalize was called during addGroup
        expect(normalizeSpy).toHaveBeenCalled();

        // Should have the new empty group plus the existing group with panels
        expect(api.panels).toHaveLength(1);
        expect(api.groups).toHaveLength(2);

        normalizeSpy.mockRestore();
    });

    test('add group with custom group is', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });
        const api = new DockviewApi(dockview);

        dockview.layout(1000, 1000);

        const panel1 = api.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        const group1 = api.addGroup({
            id: 'group_1',
            direction: 'left',
        });

        const group2 = api.addGroup({
            id: 'group_2',
            direction: 'left',
            referencePanel: panel1,
        });

        const group3 = api.addGroup({
            id: 'group_3',
            direction: 'left',
            referenceGroup: panel1.api.group,
        });

        expect(group1.api.id).toBe('group_1');
        expect(group2.api.id).toBe('group_2');
        expect(group3.api.id).toBe('group_3');
    });

    describe('dndEdges', () => {
        test('that can init dndEdges property', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
                dndEdges: {
                    size: { value: 100, type: 'pixels' },
                    activationSize: { value: 5, type: 'percentage' },
                },
            });
            const api = new DockviewApi(dockview);

            dockview.layout(1000, 1000);
        });
    });

    describe('GitHub Issue #991 - Group remains active after tab header space drag', () => {
        let container: HTMLElement;

        beforeEach(() => {
            container = document.createElement('div');
        });

        test('single panel group remains active after move to edge', () => {
            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            dockview.layout(1000, 1000);

            dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            const panel1 = dockview.getGroupPanel('panel1')!;
            const originalGroup = panel1.group;

            dockview.doSetGroupActive(originalGroup);
            expect(dockview.activeGroup).toBe(originalGroup);
            expect(dockview.activePanel?.id).toBe('panel1');

            panel1.api.moveTo({ position: 'right' });

            expect(dockview.activeGroup).toBeTruthy();
            expect(dockview.activePanel).toBeTruthy();
            expect(dockview.activePanel?.id).toBe('panel1');

            // When moving a single panel to an edge, the existing group gets repositioned
            // rather than creating a new group (since there would be no panels left in the original group)
            expect(panel1.group).toBe(originalGroup);
            expect(dockview.activeGroup).toBe(panel1.group);
        });

        test('merged group becomes active after center position group move', () => {
            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            dockview.layout(1000, 1000);

            dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            dockview.addPanel({
                id: 'panel2',
                component: 'default',
                position: { direction: 'right' },
            });

            const panel1 = dockview.getGroupPanel('panel1')!;
            const panel2 = dockview.getGroupPanel('panel2')!;
            const group1 = panel1.group;
            const group2 = panel2.group;

            dockview.doSetGroupActive(group1);
            expect(dockview.activeGroup).toBe(group1);
            expect(dockview.activePanel?.id).toBe('panel1');

            dockview.moveGroupOrPanel({
                from: { groupId: group2.id },
                to: { group: group1, position: 'center' },
            });

            expect(dockview.activeGroup).toBeTruthy();
            expect(dockview.activePanel).toBeTruthy();
            expect(panel1.group).toBe(panel2.group);
        });

        test('panel content remains visible after group move', () => {
            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            dockview.layout(1000, 1000);

            dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            const panel1 = dockview.getGroupPanel('panel1')!;

            expect(panel1.view.content.element.parentElement).toBeTruthy();

            panel1.api.moveTo({ position: 'left' });

            expect(panel1.view.content.element.parentElement).toBeTruthy();
            expect(dockview.activePanel?.id).toBe('panel1');

            expect(panel1.api.isVisible).toBe(true);
            expect(panel1.api.isActive).toBe(true);
        });

        test('first panel in group does not get skipSetActive when moved', () => {
            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            dockview.layout(1000, 1000);

            dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            const panel1 = dockview.getGroupPanel('panel1')!;
            const group = panel1.group;

            expect(dockview.activeGroup).toBe(group);
            expect(dockview.activePanel?.id).toBe('panel1');
            expect(panel1.view.content.element.parentElement).toBeTruthy();

            panel1.api.moveTo({ position: 'right' });

            expect(panel1.view.content.element.parentElement).toBeTruthy();
            expect(dockview.activePanel?.id).toBe('panel1');
            expect(panel1.api.isActive).toBe(true);
        });

        test('skipSetActive option prevents automatic group activation', () => {
            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            dockview.layout(1000, 1000);

            dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            dockview.addPanel({
                id: 'panel2',
                component: 'default',
                position: { direction: 'right' },
            });

            const panel1 = dockview.getGroupPanel('panel1')!;
            const panel2 = dockview.getGroupPanel('panel2')!;
            const group1 = panel1.group;
            const group2 = panel2.group;

            dockview.doSetGroupActive(group2);
            expect(dockview.activeGroup).toBe(group2);

            dockview.moveGroupOrPanel({
                from: { groupId: group2.id },
                to: { group: group1, position: 'center' },
                skipSetActive: true,
            });

            expect(dockview.activeGroup).toBeTruthy();
            expect(dockview.activePanel).toBeTruthy();
        });
    });

    describe('issue reproduction', () => {
        test('issue 1050: setSize followed immediately by setVisible(false) should preserve size', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(800, 600);

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
                position: { direction: 'right' },
            });

            expect(panel1.group.api.width).toBe(400);
            expect(panel2.group.api.width).toBe(400);

            panel1.group.api.setSize({ width: 350 });
            expect(panel1.group.api.width).toBe(350);

            panel1.group.api.setVisible(false);

            expect(panel1.group.api.isVisible).toBe(false);

            panel1.group.api.setVisible(true);

            // The width should be preserved as 350px, not reverted to initial/minimal size
            expect(panel1.group.api.width).toBe(350);
        });

        test('issue 1050 variant: test that fix works with multiple size changes', () => {
            const container = document.createElement('div');

            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });

            dockview.layout(800, 600);

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
                position: { direction: 'right' },
            });

            panel1.group.api.setSize({ width: 350 });
            expect(panel1.group.api.width).toBe(350);

            panel1.group.api.setSize({ width: 400 });
            expect(panel1.group.api.width).toBe(400);

            panel1.group.api.setVisible(false);
            expect(panel1.group.api.isVisible).toBe(false);

            panel1.group.api.setVisible(true);

            // The most recent size (400px) should be preserved
            expect(panel1.group.api.width).toBe(400);
        });

        test('issue 1020: addGroup + moveTo with defaultRenderer="always" repositions panel overlay', async () => {
            // Reproduces https://github.com/dockview/dockview/issues/1020
            // The user split a group by creating a new adjacent group and
            // moving the active panel into it. With defaultRenderer="always"
            // the panel's content overlay stayed at the old grid coordinates
            // until a resize fired. The fix wires _onDidMovePanel to
            // debouncedUpdateAllPositions on the dockview component so every
            // programmatic move re-runs the overlay positioning pass.

            // An earlier test in this file enables fake timers without
            // restoring them, which makes the requestAnimationFrame await
            // below hang and time out. Force real timers here so the
            // animation-frame callback actually fires.
            jest.useRealTimers();

            const c = document.createElement('div');
            const dv = new DockviewComponent(c, {
                createComponent(options) {
                    return new PanelContentPartTest(options.id, options.name);
                },
                defaultRenderer: 'always',
            });
            dv.layout(1000, 1000);

            const panel1 = dv.addPanel({
                id: 'panel1',
                component: 'default',
            });

            expect(panel1.api.renderer).toBe('always');
            const sourceGroup = panel1.api.group;

            const updateSpy = jest.spyOn(
                dv.overlayRenderContainer,
                'updateAllPositions'
            );

            // Mirror the user's exact onClick pattern.
            const newGroup = dv.api.addGroup({
                direction: 'right',
                referenceGroup: sourceGroup,
            });
            panel1.api.moveTo({
                group: newGroup,
                skipSetActive: false,
            });

            expect(panel1.group).toBe(newGroup);
            expect(newGroup.activePanel?.id).toBe('panel1');
            expect(dv.groups).not.toContain(sourceGroup);

            // The fix schedules updateAllPositions on the next animation
            // frame via debouncedUpdateAllPositions(). Without the
            // _onDidMovePanel listener this assertion fails; the overlay
            // would only reposition on the next external resize.
            await new Promise((resolve) => requestAnimationFrame(resolve));
            expect(updateSpy).toHaveBeenCalled();

            expect(panel1.view.content.element.parentElement).toBeTruthy();

            updateSpy.mockRestore();
            dv.dispose();
        });
    });

    describe('renderer: always with fromJSON', () => {
        test('inactive panel with defaultRenderer="always" is attached to DOM after fromJSON', () => {
            dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
                defaultRenderer: 'always',
            });
            dockview.layout(1000, 1000);

            dockview.fromJSON({
                activeGroup: 'group-1',
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panel1', 'panel2'],
                                    id: 'group-1',
                                    activeView: 'panel1',
                                },
                                size: 1000,
                            },
                        ],
                        size: 1000,
                    },
                    height: 1000,
                    width: 1000,
                    orientation: Orientation.HORIZONTAL,
                },
                panels: {
                    panel1: {
                        id: 'panel1',
                        contentComponent: 'default',
                        title: 'panel1',
                    },
                    panel2: {
                        id: 'panel2',
                        contentComponent: 'default',
                        title: 'panel2',
                    },
                },
            });

            const panel1 = dockview.getGroupPanel('panel1')!;
            const panel2 = dockview.getGroupPanel('panel2')!;

            expect(panel1.api.isActive).toBe(true);
            expect(panel2.api.isActive).toBe(false);

            // Both panels should use "always" renderer via defaultRenderer
            expect(panel1.api.renderer).toBe('always');
            expect(panel2.api.renderer).toBe('always');

            // The inactive panel's content should be attached to the DOM
            // (via the overlay render container)
            expect(panel2.view.content.element.parentElement).toBeTruthy();
        });

        test('inactive panel with per-panel renderer="always" is attached to DOM after fromJSON', () => {
            dockview.layout(1000, 1000);

            dockview.fromJSON({
                activeGroup: 'group-1',
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: ['panel1', 'panel2'],
                                    id: 'group-1',
                                    activeView: 'panel1',
                                },
                                size: 1000,
                            },
                        ],
                        size: 1000,
                    },
                    height: 1000,
                    width: 1000,
                    orientation: Orientation.HORIZONTAL,
                },
                panels: {
                    panel1: {
                        id: 'panel1',
                        contentComponent: 'default',
                        title: 'panel1',
                        renderer: 'onlyWhenVisible',
                    },
                    panel2: {
                        id: 'panel2',
                        contentComponent: 'default',
                        title: 'panel2',
                        renderer: 'always',
                    },
                },
            });

            const panel1 = dockview.getGroupPanel('panel1')!;
            const panel2 = dockview.getGroupPanel('panel2')!;

            expect(panel1.api.isActive).toBe(true);
            expect(panel2.api.isActive).toBe(false);

            expect(panel1.api.renderer).toBe('onlyWhenVisible');
            expect(panel2.api.renderer).toBe('always');

            // The inactive "always" panel's content should be attached to the DOM
            expect(panel2.view.content.element.parentElement).toBeTruthy();
        });
    });

    describe('tab groups edge cases', () => {
        test('tab moved to another group panel leaves its tab group', () => {
            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });
            const panel3 = dockview.addPanel({
                id: 'panel3',
                component: 'default',
                position: {
                    direction: 'right',
                    referencePanel: 'panel1',
                },
            });

            const groupId = panel1.group.id;
            const tabGroup = dockview.api.createTabGroup({
                groupId,
                label: 'Test',
                color: 'blue',
            });

            dockview.api.addPanelToTabGroup({
                groupId,
                tabGroupId: tabGroup.id,
                panelId: 'panel1',
            });
            dockview.api.addPanelToTabGroup({
                groupId,
                tabGroupId: tabGroup.id,
                panelId: 'panel2',
            });

            expect(tabGroup.panelIds).toEqual(['panel1', 'panel2']);

            dockview.moveGroupOrPanel({
                from: { groupId: groupId, panelId: 'panel2' },
                to: { group: panel3.group, position: 'center' },
            });

            expect(tabGroup.containsPanel('panel2')).toBe(false);
            expect(tabGroup.panelIds).toEqual(['panel1']);
        });

        test('collapsed group with single tab auto-destroys when tab is closed', () => {
            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            const groupId = panel1.group.id;
            const tabGroup = dockview.api.createTabGroup({
                groupId,
                label: 'Solo',
                color: 'red',
            });

            dockview.api.addPanelToTabGroup({
                groupId,
                tabGroupId: tabGroup.id,
                panelId: 'panel1',
            });

            tabGroup.collapse();
            expect(tabGroup.collapsed).toBe(true);

            dockview.removePanel(panel1);

            // Tab group should have been auto-destroyed (isEmpty triggers dispose)
            expect(
                dockview.api.getTabGroups({ groupId: panel2.group.id })
            ).toHaveLength(0);
        });

        test('no-label group chip renders with empty label class', () => {
            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            const groupId = panel1.group.id;
            const tabGroup = dockview.api.createTabGroup({
                groupId,
                color: 'green',
            });

            dockview.api.addPanelToTabGroup({
                groupId,
                tabGroupId: tabGroup.id,
                panelId: 'panel1',
            });

            // Force synchronous chip rendering (updateTabGroups is
            // normally batched via queueMicrotask)
            (panel1.group.model as any).tabsContainer.tabs.updateTabGroups();

            expect(tabGroup.label).toBe('');

            const chips =
                panel1.group.element.querySelectorAll('.dv-tab-group-chip');
            expect(chips.length).toBeGreaterThan(0);

            const labelEl = chips[0].querySelector('.dv-tab-group-chip-label');
            expect(labelEl).toBeTruthy();
            expect(labelEl!.textContent).toBe('');
            expect(
                labelEl!.classList.contains('dv-tab-group-chip-label--empty')
            ).toBe(true);
        });

        test('toJSON/fromJSON round-trip preserves tab groups', () => {
            dockview.layout(1000, 1000);

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });
            const panel3 = dockview.addPanel({
                id: 'panel3',
                component: 'default',
            });

            const groupId = panel1.group.id;

            const tg1 = dockview.api.createTabGroup({
                groupId,
                label: 'Alpha',
                color: 'blue',
            });
            dockview.api.addPanelToTabGroup({
                groupId,
                tabGroupId: tg1.id,
                panelId: 'panel1',
            });
            dockview.api.addPanelToTabGroup({
                groupId,
                tabGroupId: tg1.id,
                panelId: 'panel2',
            });
            tg1.collapse();

            const tg2 = dockview.api.createTabGroup({
                groupId,
                label: 'Beta',
                color: 'red',
            });
            dockview.api.addPanelToTabGroup({
                groupId,
                tabGroupId: tg2.id,
                panelId: 'panel3',
            });

            const state = dockview.toJSON();
            dockview.fromJSON(state);

            const restoredGroup = dockview.api.panels[0].group;
            const restored = dockview.api.getTabGroups({
                groupId: restoredGroup.id,
            });
            expect(restored).toHaveLength(2);

            const r1 = restored.find((tg) => tg.label === 'Alpha')!;
            expect(r1).toBeDefined();
            expect(r1.color).toBe('blue');
            expect(r1.collapsed).toBe(true);
            expect(r1.panelIds).toEqual(['panel1', 'panel2']);

            const r2 = restored.find((tg) => tg.label === 'Beta')!;
            expect(r2).toBeDefined();
            expect(r2.color).toBe('red');
            expect(r2.collapsed).toBe(false);
            expect(r2.panelIds).toEqual(['panel3']);

            // Second round-trip to ensure stability
            expect(JSON.parse(JSON.stringify(dockview.toJSON()))).toEqual(
                JSON.parse(JSON.stringify(state))
            );
        });

        test('fromJSON with collapsed tab groups does not activate collapsed panels', () => {
            dockview.layout(1000, 1000);

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });
            const panel3 = dockview.addPanel({
                id: 'panel3',
                component: 'default',
            });

            const groupId = panel1.group.id;

            const tg1 = dockview.api.createTabGroup({
                groupId,
                label: 'Collapsed',
                color: 'blue',
            });
            dockview.api.addPanelToTabGroup({
                groupId,
                tabGroupId: tg1.id,
                panelId: 'panel1',
            });
            dockview.api.addPanelToTabGroup({
                groupId,
                tabGroupId: tg1.id,
                panelId: 'panel2',
            });
            tg1.collapse();

            // panel3 is ungrouped and should be the active panel
            expect(panel1.group.activePanel?.id).toBe('panel3');

            const state = dockview.toJSON();
            dockview.fromJSON(state);

            // After restore, the active panel should not be in the collapsed group
            const restoredGroup = dockview.api.panels[0].group;
            const activeId = restoredGroup.activePanel?.id;

            expect(activeId).toBe('panel3');

            const restored = dockview.api.getTabGroups({
                groupId: restoredGroup.id,
            });
            const collapsedGroup = restored.find(
                (tg) => tg.label === 'Collapsed'
            );
            expect(collapsedGroup).toBeDefined();
            expect(collapsedGroup!.collapsed).toBe(true);
        });

        test('fromJSON with all panels in collapsed groups shows watermark', () => {
            dockview.layout(1000, 1000);

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            const groupId = panel1.group.id;

            const tg = dockview.api.createTabGroup({
                groupId,
                label: 'AllCollapsed',
                color: 'red',
            });
            dockview.api.addPanelToTabGroup({
                groupId,
                tabGroupId: tg.id,
                panelId: 'panel1',
            });
            dockview.api.addPanelToTabGroup({
                groupId,
                tabGroupId: tg.id,
                panelId: 'panel2',
            });
            tg.collapse();

            const state = dockview.toJSON();
            dockview.fromJSON(state);

            // All panels are in collapsed groups, so no active panel and the
            // watermark should be shown
            const restoredGroup = dockview.api.panels[0].group;
            const restored = dockview.api.getTabGroups({
                groupId: restoredGroup.id,
            });
            expect(restored[0].collapsed).toBe(true);
        });
    });

    describe('edge panels', () => {
        function createFixedDockview(
            c: HTMLElement,
            positions: ('left' | 'right' | 'top' | 'bottom')[],
            overrideOptions?: Partial<
                Record<'left' | 'right' | 'top' | 'bottom', EdgeGroupOptions>
            >
        ) {
            const dv = new DockviewComponent(c, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            for (const pos of positions) {
                dv.addEdgeGroup(pos, {
                    id: `${pos}-group`,
                    ...overrideOptions?.[pos],
                });
            }
            return dv;
        }

        test('getEdgeGroup returns DockviewGroupPanelApi for configured positions', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left', 'right']);
            expect(dv.getEdgeGroup('left')).toBeDefined();
            expect(dv.getEdgeGroup('right')).toBeDefined();
            dv.dispose();
        });

        test('getEdgeGroup returns undefined for unconfigured positions', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);
            expect(dv.getEdgeGroup('right')).toBeUndefined();
            expect(dv.getEdgeGroup('top')).toBeUndefined();
            expect(dv.getEdgeGroup('bottom')).toBeUndefined();
            dv.dispose();
        });

        test('getEdgeGroup returns undefined when addEdgeGroup has not been called', () => {
            const c = document.createElement('div');
            const dv = new DockviewComponent(c, {
                createComponent(options) {
                    return new PanelContentPartTest(options.id, options.name);
                },
            });
            expect(dv.getEdgeGroup('left')).toBeUndefined();
            dv.dispose();
        });

        test('addEdgeGroup returns DockviewGroupPanelApi', () => {
            const c = document.createElement('div');
            const dv = new DockviewComponent(c, {
                createComponent(options) {
                    return new PanelContentPartTest(options.id, options.name);
                },
            });
            const api = dv.addEdgeGroup('left', { id: 'left-group' });
            expect(api).toBeDefined();
            expect(api.location.type).toBe('edge');
            dv.dispose();
        });

        test('addEdgeGroup throws when position already registered', () => {
            const c = document.createElement('div');
            const dv = new DockviewComponent(c, {
                createComponent(options) {
                    return new PanelContentPartTest(options.id, options.name);
                },
            });
            dv.addEdgeGroup('left', { id: 'left-group' });
            expect(() =>
                dv.addEdgeGroup('left', { id: 'left-group-2' })
            ).toThrow();
            dv.dispose();
        });

        test('edge group has location.type === edge with correct position', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left', 'top']);

            const leftApi = dv.getEdgeGroup('left')!;
            expect(leftApi.location.type).toBe('edge');
            expect(
                (leftApi.location as { type: 'edge'; position: string })
                    .position
            ).toBe('left');

            const topApi = dv.getEdgeGroup('top')!;
            expect(topApi.location.type).toBe('edge');
            expect(
                (topApi.location as { type: 'edge'; position: string }).position
            ).toBe('top');

            dv.dispose();
        });

        test('setEdgeGroupVisible / isEdgeGroupVisible delegates correctly for left', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);
            expect(dv.isEdgeGroupVisible('left')).toBe(true);
            dv.setEdgeGroupVisible('left', false);
            expect(dv.isEdgeGroupVisible('left')).toBe(false);
            dv.setEdgeGroupVisible('left', true);
            expect(dv.isEdgeGroupVisible('left')).toBe(true);
            dv.dispose();
        });

        test('setEdgeGroupVisible / isEdgeGroupVisible delegates correctly for right', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['right']);
            dv.setEdgeGroupVisible('right', false);
            expect(dv.isEdgeGroupVisible('right')).toBe(false);
            dv.dispose();
        });

        test('setEdgeGroupVisible / isEdgeGroupVisible delegates correctly for top', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['top']);
            dv.setEdgeGroupVisible('top', false);
            expect(dv.isEdgeGroupVisible('top')).toBe(false);
            dv.dispose();
        });

        test('setEdgeGroupVisible / isEdgeGroupVisible delegates correctly for bottom', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['bottom']);
            dv.setEdgeGroupVisible('bottom', false);
            expect(dv.isEdgeGroupVisible('bottom')).toBe(false);
            dv.dispose();
        });

        test('isEdgeGroupVisible returns false for unconfigured positions', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);
            expect(dv.isEdgeGroupVisible('right')).toBe(false);
            dv.dispose();
        });

        test('group.api.collapse() and group.api.expand() toggle collapsed state', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);

            const leftApi = dv.getEdgeGroup('left')!;
            expect(leftApi.isCollapsed()).toBe(false);

            leftApi.collapse();
            expect(leftApi.isCollapsed()).toBe(true);

            leftApi.expand();
            expect(leftApi.isCollapsed()).toBe(false);

            dv.dispose();
        });

        test('setEdgeGroupCollapsed / isEdgeGroupCollapsed work end-to-end via component', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['right']);

            const rightApi = dv.getEdgeGroup('right')!;
            expect(rightApi.isCollapsed()).toBe(false);

            rightApi.collapse();
            expect(rightApi.isCollapsed()).toBe(true);

            rightApi.expand();
            expect(rightApi.isCollapsed()).toBe(false);

            dv.dispose();
        });

        test('onDidCollapsedChange fires once per actual state change, not on redundant calls (#1241)', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['right']);
            dv.layout(1000, 800);

            const rightApi = dv.getEdgeGroup('right')!;
            const events: boolean[] = [];
            rightApi.onDidCollapsedChange((e) => events.push(e.isCollapsed));

            rightApi.collapse();
            rightApi.collapse(); // redundant
            rightApi.expand();
            rightApi.expand(); // redundant

            expect(events).toEqual([true, false]);

            dv.dispose();
        });

        test('repeated expand() does not drift the expanded size (#1241)', () => {
            const c = document.createElement('div');
            const dv = new DockviewComponent(c, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
                // Non-zero gap is what surfaces splitview rounding drift
                theme: { name: 'test', className: 'test', gap: 10 },
            });
            dv.addEdgeGroup('right', {
                id: 'right-group',
                initialSize: 220,
                minimumSize: 100,
            });
            dv.layout(1000, 800);
            dv.addPanel({
                id: 'right-p1',
                component: 'default',
                position: { referenceGroup: 'right-group' },
            });

            const initialSize = (
                dv as any
            )._shellManager._outerSplitview.getViewSize(
                (dv as any)._shellManager._rightIndex
            );

            const rightApi = dv.getEdgeGroup('right')!;
            for (let i = 0; i < 10; i++) {
                rightApi.expand();
            }

            const finalSize = (
                dv as any
            )._shellManager._outerSplitview.getViewSize(
                (dv as any)._shellManager._rightIndex
            );

            expect(finalSize).toBe(initialSize);

            dv.dispose();
        });

        test('edge group size constraints survive a toJSON/fromJSON round-trip on a fresh component', () => {
            const c1 = document.createElement('div');
            const dv = new DockviewComponent(c1, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            dv.layout(1000, 800);
            dv.addEdgeGroup('right', {
                id: 'right-group',
                minimumSize: 150,
                maximumSize: 400,
            });

            const state = dv.toJSON();
            dv.dispose();

            // a fresh component that has not called addEdgeGroup; fromJSON must
            // auto-create the edge group with the serialized constraints
            const c2 = document.createElement('div');
            const fresh = new DockviewComponent(c2, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            fresh.layout(1000, 800);
            fresh.fromJSON(state);

            const view = (fresh as any)._shellManager._rightView;
            expect(view).toBeDefined();
            expect(view.configuredMaximumSize).toBe(400);
            expect(view.configuredMinimumSize).toBe(150);

            fresh.dispose();
        });

        test('an expanded-but-hidden edge group serializes its cached size, not 0', () => {
            const c = document.createElement('div');
            const dv = new DockviewComponent(c, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            });
            dv.layout(1000, 800);
            dv.addEdgeGroup('right', {
                id: 'right-group',
                initialSize: 250,
                minimumSize: 100,
            });
            dv.addPanel({
                id: 'right-p1',
                component: 'default',
                position: { referenceGroup: 'right-group' },
            });
            dv.getEdgeGroup('right')!.expand();

            // hide the expanded edge group; getViewSize now reports 0
            dv.setEdgeGroupVisible('right', false);

            const json = dv.toJSON();
            expect(json.edgeGroups!.right!.visible).toBe(false);
            // the fix: serialize the cached visible size rather than 0, so
            // re-showing restores the prior width instead of snapping to min
            expect(json.edgeGroups!.right!.size).toBeGreaterThan(100);

            dv.dispose();
        });

        test('toJSON includes edgeGroups field for configured positions', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left', 'top']);
            dv.layout(1000, 800);

            const json = dv.toJSON();
            expect(json.edgeGroups).toBeDefined();
            expect(json.edgeGroups!.left).toBeDefined();
            expect(json.edgeGroups!.top).toBeDefined();
            expect(json.edgeGroups!.right).toBeUndefined();
            expect(json.edgeGroups!.bottom).toBeUndefined();
            dv.dispose();
        });

        test('toJSON edgeGroups entries have visible and size fields', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);
            dv.layout(1000, 800);

            const json = dv.toJSON();
            expect(typeof json.edgeGroups!.left!.visible).toBe('boolean');
            expect(typeof json.edgeGroups!.left!.size).toBe('number');
            dv.dispose();
        });

        test('toJSON edgeGroups includes collapsed: true after collapsing', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);
            dv.layout(1000, 800);

            dv.getEdgeGroup('left')!.collapse();
            const json = dv.toJSON();
            expect(json.edgeGroups!.left!.collapsed).toBe(true);
            dv.dispose();
        });

        test('fromJSON restores edge panel visibility state', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);
            dv.layout(1000, 800);

            dv.fromJSON({
                activeGroup: 'center-group',
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: [],
                                    id: 'center-group',
                                },
                                size: 500,
                            },
                        ],
                        size: 1000,
                    },
                    height: 800,
                    width: 1000,
                    orientation: Orientation.HORIZONTAL,
                },
                panels: {},
                edgeGroups: {
                    left: {
                        size: 200,
                        visible: false,
                    },
                },
            });

            expect(dv.isEdgeGroupVisible('left')).toBe(false);
            dv.dispose();
        });

        test('fromJSON restores edge panel panels via group state', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);
            dv.layout(1000, 800);

            dv.fromJSON({
                activeGroup: 'center-group',
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: {
                                    views: [],
                                    id: 'center-group',
                                },
                                size: 500,
                            },
                        ],
                        size: 1000,
                    },
                    height: 800,
                    width: 1000,
                    orientation: Orientation.HORIZONTAL,
                },
                panels: {
                    'edge-group-panel-1': {
                        id: 'edge-group-panel-1',
                        contentComponent: 'default',
                        title: 'Edge Panel 1',
                    },
                },
                edgeGroups: {
                    left: {
                        size: 200,
                        visible: true,
                        group: {
                            id: 'left-group',
                            views: ['edge-group-panel-1'],
                            activeView: 'edge-group-panel-1',
                        },
                    },
                },
            });

            // The fixed group should now contain the deserialized panel
            const leftGroup = dv.getEdgeGroup('left')!;
            // group is accessible; verify the panel is in the dockview panels list
            expect(
                dv.panels.find((p) => p.id === 'edge-group-panel-1')
            ).toBeDefined();
            dv.dispose();
        });

        test('shell element is always present in the DOM after construction', () => {
            const c = document.createElement('div');
            const dv = new DockviewComponent(c, {
                createComponent(options) {
                    return new PanelContentPartTest(options.id, options.name);
                },
            });
            // Shell is always created even with no edge panels
            expect(c.childNodes.length).toBeGreaterThan(0);
            dv.dispose();
            expect(c.childNodes).toHaveLength(0);
        });

        test('removeEdgeGroup removes the group and disposes its panels', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left', 'right']);

            // Add a panel into the left edge group
            dv.addPanel({
                id: 'panel-1',
                component: 'default',
                title: 'Panel 1',
                position: { referenceGroup: 'left-group' },
            });
            expect(dv.panels.find((p) => p.id === 'panel-1')).toBeDefined();
            expect(dv.getEdgeGroup('left')).toBeDefined();

            const removedGroupEvents: string[] = [];
            dv.onDidRemoveGroup((g) => removedGroupEvents.push(g.id));

            dv.removeEdgeGroup('left');

            // Group is gone
            expect(dv.getEdgeGroup('left')).toBeUndefined();
            // Panel was disposed
            expect(dv.panels.find((p) => p.id === 'panel-1')).toBeUndefined();
            // onDidRemoveGroup fired
            expect(removedGroupEvents).toContain('left-group');
            // Other edge groups are unaffected
            expect(dv.getEdgeGroup('right')).toBeDefined();

            dv.dispose();
        });

        test('removeEdgeGroup throws when position has no group', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);

            expect(() => dv.removeEdgeGroup('right')).toThrow();

            dv.dispose();
        });

        test('addEdgeGroup can re-add a position after removeEdgeGroup', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);

            dv.removeEdgeGroup('left');
            expect(dv.getEdgeGroup('left')).toBeUndefined();

            const api = dv.addEdgeGroup('left', { id: 'left-group-new' });
            expect(api).toBeDefined();
            expect(dv.getEdgeGroup('left')).toBeDefined();

            dv.dispose();
        });

        test('panel content is rendered after moving from grid group to edge group', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);
            dv.layout(1000, 1000);

            dv.addPanel({
                id: 'explorer',
                component: 'default',
                title: 'Explorer',
                position: { referenceGroup: 'left-group' },
            });

            const panel1 = dv.addPanel({
                id: 'panel1',
                component: 'default',
                title: 'Panel 1',
            });

            const contentEl = panel1.view.content.element;
            expect(contentEl.parentElement).toBeTruthy();

            const edgeGroup = dv.groups.find(
                (g) => g.api.location.type === 'edge'
            )!;

            panel1.api.moveTo({ group: edgeGroup });

            expect(panel1.group).toBe(edgeGroup);
            expect(panel1.group.api.location.type).toBe('edge');
            expect(contentEl.parentElement).toBeTruthy();
            expect(edgeGroup.activePanel?.id).toBe('panel1');

            dv.dispose();
        });

        test('panel content is rendered with always renderer after moving to edge group', () => {
            const c = document.createElement('div');
            const dv = new DockviewComponent(c, {
                createComponent(options) {
                    return new PanelContentPartTest(options.id, options.name);
                },
                defaultRenderer: 'always',
            });
            dv.addEdgeGroup('left', { id: 'left-group', initialSize: 200 });
            dv.layout(1000, 1000);

            dv.addPanel({
                id: 'explorer',
                component: 'default',
                title: 'Explorer',
                position: { referenceGroup: 'left-group' },
            });

            const panel1 = dv.addPanel({
                id: 'panel1',
                component: 'default',
                title: 'Panel 1',
            });

            expect(panel1.api.renderer).toBe('always');

            const contentEl = panel1.view.content.element;
            expect(contentEl.parentElement).toBeTruthy();

            const edgeGroup = dv.groups.find(
                (g) => g.api.location.type === 'edge'
            )!;

            panel1.api.moveTo({ group: edgeGroup });

            expect(panel1.group).toBe(edgeGroup);
            expect(contentEl.parentElement).toBeTruthy();
            expect(edgeGroup.activePanel?.id).toBe('panel1');

            // The overlay render container should be anchored to the shell
            // element (not the gridview) so edge group panels are not clipped
            const shellEl = (dv as any)._shellManager.element;
            expect(dv.overlayRenderContainer.element).toBe(shellEl);

            dv.dispose();
        });

        test('panel content is rendered after moving to empty collapsed edge group', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['right'], {
                right: {
                    id: 'right-group',
                    collapsed: true,
                    initialSize: 200,
                },
            });
            dv.layout(1000, 1000);

            const panel1 = dv.addPanel({
                id: 'panel1',
                component: 'default',
                title: 'Panel 1',
            });

            const contentEl = panel1.view.content.element;
            const edgeGroup = dv.groups.find(
                (g) => g.api.location.type === 'edge'
            )!;

            panel1.api.moveTo({ group: edgeGroup });

            expect(panel1.group).toBe(edgeGroup);
            expect(contentEl.parentElement).toBeTruthy();

            edgeGroup.api.expand();
            expect(contentEl.parentElement).toBeTruthy();
            expect(edgeGroup.activePanel?.id).toBe('panel1');

            dv.dispose();
        });

        test('edge group cannot be floated via addFloatingGroup', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);

            const edgeGroupApi = dv.getEdgeGroup('left')!;
            const edgeGroup = dv.groups.find((g) => g.id === 'left-group')!;

            expect(edgeGroupApi.location.type).toBe('edge');

            // attempt to float the edge group; should be a no-op
            dv.addFloatingGroup(edgeGroup);

            // group should still be an edge group, not floating
            expect(edgeGroupApi.location.type).toBe('edge');
            expect(dv.groups.length).toBeGreaterThanOrEqual(1);

            dv.dispose();
        });

        test('edge group cannot be popped out via addPopoutGroup', async () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);

            const edgeGroupApi = dv.getEdgeGroup('left')!;
            const edgeGroup = dv.groups.find((g) => g.id === 'left-group')!;

            expect(edgeGroupApi.location.type).toBe('edge');

            // attempt to popout the edge group; should return false
            const result = await dv.addPopoutGroup(edgeGroup);

            expect(result).toBe(false);
            expect(edgeGroupApi.location.type).toBe('edge');

            dv.dispose();
        });

        test('moveGroup from edge to grid leaves edge group empty and collapsed (#1235)', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['left']);
            dv.layout(1000, 800);

            const edgeGroup = dv.groups.find(
                (g) => g.api.location.type === 'edge'
            )!;

            const target = dv.addPanel({ id: 'center', component: 'default' });
            const edgeP1 = dv.addPanel({
                id: 'edge-p1',
                component: 'default',
                position: { referenceGroup: edgeGroup.id },
            });
            dv.addPanel({
                id: 'edge-p2',
                component: 'default',
                position: { referenceGroup: edgeGroup.id },
            });
            edgeP1.api.setActive();

            expect(edgeGroup.panels).toHaveLength(2);
            expect(edgeGroup.activePanel?.id).toBe('edge-p1');

            dv.moveGroup({
                from: { group: edgeGroup },
                to: { group: target.api.group, position: 'right' },
            });

            // Edge group still exists at its position, now empty
            expect(dv.getEdgeGroup('left')).toBeDefined();
            expect(edgeGroup.api.location.type).toBe('edge');
            expect(edgeGroup.panels).toHaveLength(0);
            // ...and auto-collapsed via the addEdgeGroup listener
            expect((dv as any)._shellManager.isEdgeGroupCollapsed('left')).toBe(
                true
            );

            // Panels moved into a new grid group at the target
            const movedPanel = dv.getGroupPanel('edge-p1')!;
            expect(movedPanel.group.api.location.type).toBe('grid');
            expect(movedPanel.group).not.toBe(edgeGroup);
            expect(movedPanel.group.panels.map((p) => p.id).sort()).toEqual([
                'edge-p1',
                'edge-p2',
            ]);

            // The originally-active panel remains active in the new group
            expect(movedPanel.group.activePanel?.id).toBe(edgeP1.id);

            dv.dispose();
        });

        test('moveGroup from edge to grid does not destroy the edge group', () => {
            const c = document.createElement('div');
            const dv = createFixedDockview(c, ['right']);
            dv.layout(1000, 800);

            const edgeGroup = dv.groups.find(
                (g) => g.api.location.type === 'edge'
            )!;

            const target = dv.addPanel({ id: 'center', component: 'default' });
            dv.addPanel({
                id: 'edge-p1',
                component: 'default',
                position: { referenceGroup: edgeGroup.id },
            });

            const removed: string[] = [];
            dv.onDidRemoveGroup((g) => removed.push(g.id));

            dv.moveGroup({
                from: { group: edgeGroup },
                to: { group: target.api.group, position: 'left' },
            });

            // The edge group must not be removed
            expect(removed).not.toContain(edgeGroup.id);
            expect(dv.getEdgeGroup('right')).toBeDefined();
            expect(dv.groups).toContain(edgeGroup);

            dv.dispose();
        });

        test('fromJSON auto-creates edge groups from serialized state', () => {
            const c = document.createElement('div');
            // No addEdgeGroup called before fromJSON
            const dv = new DockviewComponent(c, {
                createComponent(options) {
                    return new PanelContentPartTest(options.id, options.name);
                },
            });
            dv.layout(1000, 800);

            dv.fromJSON({
                activeGroup: 'center-group',
                grid: {
                    root: {
                        type: 'branch',
                        data: [
                            {
                                type: 'leaf',
                                data: { views: [], id: 'center-group' },
                                size: 500,
                            },
                        ],
                        size: 1000,
                    },
                    height: 800,
                    width: 1000,
                    orientation: Orientation.HORIZONTAL,
                },
                panels: {},
                edgeGroups: {
                    left: { size: 220, visible: true },
                },
            });

            expect(dv.getEdgeGroup('left')).toBeDefined();
            dv.dispose();
        });

        describe('per-group auto-hide (Feature A)', () => {
            test('isEdgeGroupAutoHide resolves the global option by default', () => {
                const c = document.createElement('div');
                const dv = new DockviewComponent(c, {
                    createComponent(options) {
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    },
                    autoHideEdgeGroups: true,
                });
                const group = dv.addEdgeGroup('left', { id: 'left-group' });
                const panel = dv.getEdgeGroupPanel('left')!;
                expect(dv.isEdgeGroupAutoHide(panel)).toBe(true);
                void group;
                dv.dispose();
            });

            test('per-group autoHide flag overrides the global option', () => {
                const c = document.createElement('div');
                const dv = new DockviewComponent(c, {
                    createComponent(options) {
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    },
                    autoHideEdgeGroups: false,
                });
                dv.addEdgeGroup('left', { id: 'left-group', autoHide: true });
                dv.addEdgeGroup('right', { id: 'right-group' });

                const left = dv.getEdgeGroupPanel('left')!;
                const right = dv.getEdgeGroupPanel('right')!;
                // static + auto-hiding co-exist in one layout
                expect(dv.isEdgeGroupAutoHide(left)).toBe(true);
                expect(dv.isEdgeGroupAutoHide(right)).toBe(false);
                dv.dispose();
            });

            test('setEdgeGroupAutoHide fires onDidEdgeGroupAutoHideChange', () => {
                const c = document.createElement('div');
                const dv = createFixedDockview(c, ['left']);
                const panel = dv.getEdgeGroupPanel('left')!;

                const fired: string[] = [];
                dv.onDidEdgeGroupAutoHideChange((g) => fired.push(g.id));

                panel.api.setAutoHide(true);
                expect(dv.isEdgeGroupAutoHide(panel)).toBe(true);
                expect(fired).toEqual(['left-group']);

                panel.api.setAutoHide(undefined); // clear → inherit global (off)
                expect(dv.isEdgeGroupAutoHide(panel)).toBe(false);
                dv.dispose();
            });
        });

        describe('drag-revealed zero-footprint edges (Feature B)', () => {
            function flush(): Promise<void> {
                return new Promise((r) => setTimeout(r));
            }

            test('revealEdgeGroupWithData creates an auto-reveal edge and moves the panel in', () => {
                const c = document.createElement('div');
                const dv = new DockviewComponent(c, {
                    createComponent(options) {
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    },
                });
                dv.layout(1000, 1000);

                const panel = dv.addPanel({ id: 'p1', component: 'default' });
                const fromGroupId = panel.group.id;

                expect(dv.getEdgeGroup('left')).toBeUndefined();
                dv.revealEdgeGroupWithData('left', {
                    groupId: fromGroupId,
                    panelId: 'p1',
                });

                const edge = dv.getEdgeGroup('left');
                expect(edge).toBeDefined();
                expect(edge!.location.type).toBe('edge');
                // a newly revealed edge group is created collapsed (the drop
                // adds a tab to its strip rather than popping it open)
                expect(edge!.isCollapsed()).toBe(true);
                const edgePanel = dv.getEdgeGroupPanel('left')!;
                expect(edgePanel.panels.map((p) => p.id)).toContain('p1');
                dv.dispose();
            });

            test('an emptied auto-reveal edge tears down to zero footprint', async () => {
                const c = document.createElement('div');
                const dv = new DockviewComponent(c, {
                    createComponent(options) {
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    },
                });
                dv.layout(1000, 1000);

                const panel = dv.addPanel({ id: 'p1', component: 'default' });
                dv.revealEdgeGroupWithData('left', {
                    groupId: panel.group.id,
                    panelId: 'p1',
                });
                expect(dv.getEdgeGroup('left')).toBeDefined();

                // close the only panel → deferred teardown
                dv.getEdgeGroupPanel('left')!.panels[0].api.close();
                await flush();

                expect(dv.getEdgeGroup('left')).toBeUndefined();
                dv.dispose();
            });

            test('an emptied static edge collapses to a strip (not torn down)', async () => {
                const c = document.createElement('div');
                const dv = createFixedDockview(c, ['left']);
                dv.layout(1000, 1000);

                dv.addPanel({
                    id: 'p1',
                    component: 'default',
                    position: { referenceGroup: 'left-group' },
                });
                dv.getEdgeGroupPanel('left')!.panels[0].api.close();
                await flush();

                const edge = dv.getEdgeGroup('left');
                expect(edge).toBeDefined();
                expect(edge!.isCollapsed()).toBe(true);
                dv.dispose();
            });

            test('revealing into an existing edge fills it without changing its toggled state', () => {
                const c = document.createElement('div');
                const dv = createFixedDockview(c, ['left'], {
                    left: { id: 'left-group', collapsed: true },
                });
                dv.layout(1000, 1000);

                const panel = dv.addPanel({ id: 'p1', component: 'default' });
                dv.revealEdgeGroupWithData('left', {
                    groupId: panel.group.id,
                    panelId: 'p1',
                });

                const edge = dv.getEdgeGroup('left')!;
                // collapsed state is left as-is (still collapsed), the panel is
                // just added to the strip's tabs
                expect(edge.isCollapsed()).toBe(true);
                expect(
                    dv.getEdgeGroupPanel('left')!.panels.map((p) => p.id)
                ).toContain('p1');
                dv.dispose();
            });

            test('revealing into an expanded edge leaves it expanded', () => {
                const c = document.createElement('div');
                const dv = createFixedDockview(c, ['left'], {
                    left: { id: 'left-group' },
                });
                dv.layout(1000, 1000);
                // seed a panel so the edge is non-empty and expanded
                dv.addPanel({
                    id: 'seed',
                    component: 'default',
                    position: { referenceGroup: 'left-group' },
                });
                expect(dv.getEdgeGroup('left')!.isCollapsed()).toBe(false);

                const panel = dv.addPanel({ id: 'p1', component: 'default' });
                dv.revealEdgeGroupWithData('left', {
                    groupId: panel.group.id,
                    panelId: 'p1',
                });

                const edge = dv.getEdgeGroup('left')!;
                expect(edge.isCollapsed()).toBe(false);
                expect(
                    dv.getEdgeGroupPanel('left')!.panels.map((p) => p.id)
                ).toContain('p1');
                dv.dispose();
            });

            test('toJSON records the autoReveal/autoHide flags and they round-trip', async () => {
                const c = document.createElement('div');
                const dv = new DockviewComponent(c, {
                    createComponent(options) {
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    },
                });
                dv.layout(1000, 1000);

                const panel = dv.addPanel({ id: 'p1', component: 'default' });
                dv.revealEdgeGroupWithData(
                    'left',
                    { groupId: panel.group.id, panelId: 'p1' },
                    { autoHide: true }
                );

                const json = dv.toJSON();
                expect(json.edgeGroups?.left?.autoReveal).toBe(true);
                expect(json.edgeGroups?.left?.autoHide).toBe(true);

                // Round-trip into a fresh component; the restored edge must
                // still tear down (autoReveal) when emptied.
                const c2 = document.createElement('div');
                const dv2 = new DockviewComponent(c2, {
                    createComponent(options) {
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    },
                });
                dv2.layout(1000, 1000);
                dv2.fromJSON(json);

                const restored = dv2.getEdgeGroupPanel('left')!;
                expect(dv2.isEdgeGroupAutoHide(restored)).toBe(true);
                restored.panels[0].api.close();
                await flush();
                expect(dv2.getEdgeGroup('left')).toBeUndefined();

                dv.dispose();
                dv2.dispose();
            });

            test('revealing into an existing static edge leaves its auto-hide state untouched', () => {
                const c = document.createElement('div');
                const dv = createFixedDockview(c, ['left'], {
                    left: { id: 'left-group' },
                });
                dv.layout(1000, 1000);
                dv.addPanel({
                    id: 'seed',
                    component: 'default',
                    position: { referenceGroup: 'left-group' },
                });

                const fired: string[] = [];
                dv.onDidEdgeGroupAutoHideChange((g) => fired.push(g.id));

                const panel = dv.addPanel({ id: 'p1', component: 'default' });
                dv.revealEdgeGroupWithData(
                    'left',
                    { groupId: panel.group.id, panelId: 'p1' },
                    { autoHide: true }
                );

                // The reuse path adds the panel but must NOT change the existing
                // group's auto-hide: a drag-reveal (which always passes
                // autoHide:true) can't be allowed to silently convert a static
                // edge group into an auto-hiding one. Programmatic callers use
                // `getEdgeGroup(position).setAutoHide(...)` for that. So no
                // change event fires and the group stays static.
                expect(
                    dv.getEdgeGroupPanel('left')!.panels.map((p) => p.id)
                ).toContain('p1');
                expect(fired).toEqual([]);
                expect(
                    dv.isEdgeGroupAutoHide(dv.getEdgeGroupPanel('left')!)
                ).toBe(false);
                dv.dispose();
            });

            test('an emptied auto-reveal edge is not serialized before its teardown microtask', () => {
                const c = document.createElement('div');
                const dv = new DockviewComponent(c, {
                    createComponent(options) {
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    },
                });
                dv.layout(1000, 1000);

                const panel = dv.addPanel({ id: 'p1', component: 'default' });
                dv.revealEdgeGroupWithData('left', {
                    groupId: panel.group.id,
                    panelId: 'p1',
                });
                // empty it, then serialize synchronously (before the deferred
                // teardown runs). The transient empty auto-reveal edge must not
                // be persisted, or it would restore as an edge that never tears
                // itself down.
                dv.getEdgeGroupPanel('left')!.panels[0].api.close();
                const json = dv.toJSON();
                expect(json.edgeGroups?.left).toBeUndefined();
                dv.dispose();
            });

            test('revealEdgeGroupWithData is a no-op without the EdgeGroup module', () => {
                const c = document.createElement('div');
                const dv = new DockviewComponent(c, {
                    createComponent(options) {
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    },
                    // internal seam: register a subset (see moduleRemovability.spec)
                    modules: AllModules.filter((m) => m !== EdgeGroupModule),
                } as never);
                dv.layout(1000, 1000);
                const panel = dv.addPanel({ id: 'p1', component: 'default' });
                expect(() =>
                    dv.revealEdgeGroupWithData('left', {
                        groupId: panel.group.id,
                        panelId: 'p1',
                    })
                ).not.toThrow();
                expect(dv.getEdgeGroup('left')).toBeUndefined();
                dv.dispose();
            });
        });
    });

    test('regression: HeaderActions renderer disposed when group removed during a move (movingLock leak)', () => {
        // After the module extraction, HeaderActionsModule cleans up
        // per-group renderer state via host.onDidRemoveGroup. But that
        // event is gated by `!this._moving` in DockviewComponent, so a
        // group emptied inside movingLock (e.g. moveGroupOrPanel emptying
        // a source group via removePanel(removeEmptyGroup:true)) never
        // fires onDidRemoveGroup, and the user-supplied IHeaderActionsRenderer
        // instances leak. Master held the disposables directly in the
        // group model's addDisposables() chain, which fired regardless.
        type Key = string;
        const disposed: Key[] = [];

        const factory =
            (slot: 'left' | 'right' | 'prefix') =>
            (group: DockviewGroupPanel): IHeaderActionsRenderer => {
                const key: Key = `${group.id}:${slot}`;
                return {
                    element: document.createElement('div'),
                    init() {},
                    dispose() {
                        disposed.push(key);
                    },
                };
            };

        const container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
            createLeftHeaderActionComponent: factory('left'),
            createRightHeaderActionComponent: factory('right'),
            createPrefixHeaderActionComponent: factory('prefix'),
        });

        dockview.layout(1000, 500);

        const panel1 = dockview.addPanel({
            id: 'panel1',
            component: 'default',
        });
        const panel2 = dockview.addPanel({
            id: 'panel2',
            component: 'default',
            position: { referencePanel: 'panel1', direction: 'right' },
        });

        const group1Id = panel1.api.group.id;

        // Move panel1 into panel2's group; group1 becomes empty and is
        // removed via removePanel(removeEmptyGroup:true) inside movingLock.
        dockview.moveGroupOrPanel({
            from: { groupId: group1Id, panelId: 'panel1' },
            to: { group: panel2.api.group, position: 'center' },
        });

        // The 3 renderers attached to the removed group1 should have been
        // disposed. They are not, because HeaderActionsModule's cleanup
        // never fired.
        expect(disposed).toEqual(
            expect.arrayContaining([
                `${group1Id}:left`,
                `${group1Id}:right`,
                `${group1Id}:prefix`,
            ])
        );
    });

    test('issue #914: api.setTitle reflected by createTabRenderer output', () => {
        // Regression test for #914: the header overflow dropdown lazily
        // builds a fresh tab renderer via panel.view.createTabRenderer(...)
        // each time it opens. Prior to the fix that renderer was initialised
        // with a snapshot of the panel's init params, so a title updated via
        // api.setTitle (which only updated DockviewPanel._title and fired
        // onDidTitleChange) was not reflected in the dropdown entry.
        const panel = dockview.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'original',
        });

        panel.api.setTitle('renamed');

        const overflowTab = panel.view.createTabRenderer('headerOverflow');

        // DefaultTab renders the title into a child div with textContent.
        expect(overflowTab.element.textContent).toContain('renamed');
        expect(overflowTab.element.textContent).not.toContain('original');
    });
});

describe('group header direction change signal (DV-14 unblocker)', () => {
    function createDockview(): DockviewComponent {
        const dv = new DockviewComponent(document.createElement('div'), {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error('unsupported');
                }
            },
        });
        dv.layout(1000, 1000);
        dv.addPanel({ id: 'panel1', component: 'default' });
        return dv;
    }

    test('fires on a horizontal→vertical flip (top→left)', () => {
        const dv = createDockview();
        const events: unknown[] = [];
        dv.groups[0].api.onDidHeaderDirectionChange((e) => events.push(e));

        dv.groups[0].api.setHeaderPosition('left');

        expect(events).toEqual([{ direction: 'vertical', position: 'left' }]);

        dv.dispose();
    });

    test('fires on a vertical→horizontal flip (left→top)', () => {
        const dv = createDockview();
        dv.groups[0].api.setHeaderPosition('left');

        const events: unknown[] = [];
        dv.groups[0].api.onDidHeaderDirectionChange((e) => events.push(e));

        dv.groups[0].api.setHeaderPosition('top');

        expect(events).toEqual([{ direction: 'horizontal', position: 'top' }]);

        dv.dispose();
    });

    test('does not fire on a same-axis move (top→bottom)', () => {
        const dv = createDockview();
        const events: unknown[] = [];
        dv.groups[0].api.onDidHeaderDirectionChange((e) => events.push(e));

        dv.groups[0].api.setHeaderPosition('bottom');

        expect(events).toEqual([]);

        dv.dispose();
    });

    test('does not fire on a same-axis vertical move (left→right)', () => {
        const dv = createDockview();
        dv.groups[0].api.setHeaderPosition('left');

        const events: unknown[] = [];
        dv.groups[0].api.onDidHeaderDirectionChange((e) => events.push(e));

        dv.groups[0].api.setHeaderPosition('right');

        expect(events).toEqual([]);

        dv.dispose();
    });

    test('does not fire on a redundant set (left→left)', () => {
        const dv = createDockview();
        dv.groups[0].api.setHeaderPosition('left');

        const events: unknown[] = [];
        dv.groups[0].api.onDidHeaderDirectionChange((e) => events.push(e));

        dv.groups[0].api.setHeaderPosition('left');

        expect(events).toEqual([]);

        dv.dispose();
    });

    test('fires once per flip across a top→left→top cycle', () => {
        const dv = createDockview();
        const events: unknown[] = [];
        dv.groups[0].api.onDidHeaderDirectionChange((e) => events.push(e));

        dv.groups[0].api.setHeaderPosition('left'); // horizontal→vertical
        dv.groups[0].api.setHeaderPosition('right'); // vertical→vertical (no fire)
        dv.groups[0].api.setHeaderPosition('top'); // vertical→horizontal

        expect(events).toEqual([
            { direction: 'vertical', position: 'left' },
            { direction: 'horizontal', position: 'top' },
        ]);

        dv.dispose();
    });

    test('fromJSON with malformed input does not destroy the existing layout', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({ id: 'panel1', component: 'default' });
        dockview.addPanel({ id: 'panel2', component: 'default' });

        expect(dockview.panels).toHaveLength(2);

        // an object with no `grid` is malformed; fromJSON must reject it
        // *before* clearing the live layout
        expect(() => dockview.fromJSON({} as any)).toThrow();

        // the pre-existing layout must survive the failed load
        expect(dockview.panels).toHaveLength(2);
        expect(dockview.getGroupPanel('panel1')).toBeTruthy();
        expect(dockview.getGroupPanel('panel2')).toBeTruthy();

        dockview.dispose();
    });

    test('fromJSON degrades gracefully when a group references a missing panel id', () => {
        const container = document.createElement('div');

        const dockview = new DockviewComponent(container, {
            createComponent(options) {
                switch (options.name) {
                    case 'default':
                        return new PanelContentPartTest(
                            options.id,
                            options.name
                        );
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        dockview.layout(1000, 1000);

        dockview.addPanel({ id: 'panel1', component: 'default' });
        dockview.addPanel({ id: 'panel2', component: 'default' });

        const serialized = dockview.toJSON();

        // corrupt the state: the group still references 'panel2' in its views
        // but its panel state is absent from the panels map
        delete (serialized.panels as any)['panel2'];

        // must not throw on the missing panel; the valid panel still loads
        expect(() => dockview.fromJSON(serialized)).not.toThrow();

        expect(dockview.getGroupPanel('panel1')).toBeTruthy();
        expect(dockview.getGroupPanel('panel2')).toBeFalsy();

        dockview.dispose();
    });

    describe('floating group drop overlays', () => {
        function createComponent(
            mounting: 'relative' | 'absolute'
        ): DockviewComponent {
            const container = document.createElement('div');
            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
                theme: {
                    name: 'test',
                    className: 'test',
                    dndOverlayMounting: mounting,
                },
            });
            dockview.layout(1000, 1000);
            return dockview;
        }

        test('relative mounting: a floating group anchors its drop overlay at the shell level', () => {
            const dockview = createComponent('relative');

            // The root container is disabled by 'relative' mounting so grid
            // groups render their drop overlays in-place.
            expect(dockview.rootDropTargetContainer.disabled).toBe(true);

            dockview.addPanel({ id: 'panel1', component: 'default' });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            dockview.addFloatingGroup(panel2);

            const floatingGroup = panel2.group;
            expect(floatingGroup.model.location.type).toBe('floating');

            // A floating group must NOT fall back to an in-place overlay: its
            // container is the always-enabled, shell-level floating container so
            // the overlay renders above the floating panel's render overlay.
            expect(floatingGroup.model.dropTargetContainer).toBe(
                dockview.floatingDropTargetContainer
            );
            expect(dockview.floatingDropTargetContainer.disabled).toBe(false);
            expect(
                floatingGroup.model.dropTargetContainer?.model
            ).toBeDefined();

            dockview.dispose();
        });

        test('grid groups still use the (disabled) root container under relative mounting', () => {
            const dockview = createComponent('relative');

            const panel1 = dockview.addPanel({
                id: 'panel1',
                component: 'default',
            });

            expect(panel1.group.model.location.type).toBe('grid');
            expect(panel1.group.model.dropTargetContainer).toBe(
                dockview.rootDropTargetContainer
            );
            // disabled -> the group renders an in-place ('relative') overlay
            expect(
                panel1.group.model.dropTargetContainer?.model
            ).toBeUndefined();

            dockview.dispose();
        });

        test('absolute mounting: a floating group shares the (enabled) root container', () => {
            const dockview = createComponent('absolute');

            // Absolute mounting keeps the root container enabled, so grid and
            // floating groups share it and the anchored overlay can slide
            // between them without a stale copy being left behind.
            expect(dockview.rootDropTargetContainer.disabled).toBe(false);

            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            dockview.addFloatingGroup(panel2);

            expect(panel2.group.model.location.type).toBe('floating');
            expect(panel2.group.model.dropTargetContainer).toBe(
                dockview.rootDropTargetContainer
            );
            expect(panel2.group.model.dropTargetContainer?.model).toBeDefined();

            dockview.dispose();
        });

        test('relative mounting: a group split into a floating window (non-anchor member) also uses the floating container', () => {
            const dockview = createComponent('relative');

            dockview.addPanel({ id: 'panel1', component: 'default' });
            dockview.addPanel({ id: 'panel2', component: 'default' });
            const panel3 = dockview.addPanel({
                id: 'panel3',
                component: 'default',
            });

            dockview.addFloatingGroup(panel3);
            const anchorGroup = panel3.group;

            // Split panel1 into the left of the floating group -> creates a new,
            // non-anchor member group inside the floating window.
            dockview.moveGroupOrPanel({
                from: { groupId: panel1Group(dockview).id, panelId: 'panel1' },
                to: { group: anchorGroup, position: 'left' },
            });

            const memberGroup = dockview.getGroupPanel('panel1')!.group;
            expect(memberGroup).not.toBe(anchorGroup);
            expect(memberGroup.model.location.type).toBe('floating');
            // The non-anchor member must route through the same always-enabled
            // floating container so its drop overlay is visible.
            expect(memberGroup.model.dropTargetContainer).toBe(
                dockview.floatingDropTargetContainer
            );
            expect(memberGroup.model.dropTargetContainer?.model).toBeDefined();

            dockview.dispose();
        });

        test('relative mounting: a floating group moved back to the grid reverts to the (disabled) root container', () => {
            const dockview = createComponent('relative');

            dockview.addPanel({ id: 'panel1', component: 'default' });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            dockview.addFloatingGroup(panel2);
            expect(panel2.group.model.dropTargetContainer).toBe(
                dockview.floatingDropTargetContainer
            );

            // Dock the floating group back into the main grid.
            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id, panelId: 'panel2' },
                to: {
                    group: dockview.getGroupPanel('panel1')!.group,
                    position: 'right',
                },
            });

            const group = dockview.getGroupPanel('panel2')!.group;
            expect(group.model.location.type).toBe('grid');
            // Back in the grid it must use the root container again (in-place
            // under relative mounting).
            expect(group.model.dropTargetContainer).toBe(
                dockview.rootDropTargetContainer
            );
            expect(group.model.dropTargetContainer?.model).toBeUndefined();

            dockview.dispose();
        });

        test('the floating container stays enabled across runtime mounting-mode changes', () => {
            const dockview = createComponent('relative');

            expect(dockview.floatingDropTargetContainer.disabled).toBe(false);

            dockview.updateOptions({
                theme: {
                    name: 'test',
                    className: 'test',
                    dndOverlayMounting: 'absolute',
                },
            });
            expect(dockview.floatingDropTargetContainer.disabled).toBe(false);
            expect(dockview.rootDropTargetContainer.disabled).toBe(false);

            dockview.updateOptions({
                theme: {
                    name: 'test',
                    className: 'test',
                    dndOverlayMounting: 'relative',
                },
            });
            expect(dockview.floatingDropTargetContainer.disabled).toBe(false);
            expect(dockview.rootDropTargetContainer.disabled).toBe(true);

            dockview.dispose();
        });

        function panel1Group(dockview: DockviewComponent) {
            return dockview.getGroupPanel('panel1')!.group;
        }
    });

    describe('floating group always-renderer overlay z-index', () => {
        function createComponent(): DockviewComponent {
            const container = document.createElement('div');
            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    switch (options.name) {
                        case 'default':
                            return new PanelContentPartTest(
                                options.id,
                                options.name
                            );
                        default:
                            throw new Error(`unsupported`);
                    }
                },
                defaultRenderer: 'always',
            });
            dockview.layout(1000, 1000);
            return dockview;
        }

        function overlayZIndexFor(
            dockview: DockviewComponent,
            panelId: string
        ): string | undefined {
            const content =
                dockview.overlayRenderContainer.element.querySelector(
                    `.testpanel-${panelId}`
                );
            return (content?.parentElement as HTMLElement | undefined)?.style
                .zIndex;
        }

        test('getFloatingWindowForGroup resolves a non-anchor member of a floating window', () => {
            const dockview = createComponent();

            dockview.addPanel({ id: 'panel1', component: 'default' });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            dockview.addFloatingGroup(panel2);
            const anchorGroup = panel2.group;

            dockview.moveGroupOrPanel({
                from: {
                    groupId: dockview.getGroupPanel('panel1')!.group.id,
                    panelId: 'panel1',
                },
                to: { group: anchorGroup, position: 'left' },
            });

            const memberGroup = dockview.getGroupPanel('panel1')!.group;
            expect(memberGroup).not.toBe(anchorGroup);

            // Anchor identity lookup would miss the member; membership lookup
            // must find the same floating window for both.
            const anchorWindow =
                dockview.getFloatingWindowForGroup(anchorGroup);
            const memberWindow =
                dockview.getFloatingWindowForGroup(memberGroup);
            expect(anchorWindow).toBeDefined();
            expect(memberWindow).toBe(anchorWindow);

            dockview.dispose();
        });

        test("a panel split into a floating group has its 'always' overlay lifted above the window (not left behind it)", async () => {
            const dockview = createComponent();

            dockview.addPanel({ id: 'panel1', component: 'default' });
            const panel2 = dockview.addPanel({
                id: 'panel2',
                component: 'default',
            });

            dockview.addFloatingGroup(panel2);

            await exhaustMicrotaskQueue();
            await exhaustAnimationFrame();

            dockview.moveGroupOrPanel({
                from: {
                    groupId: dockview.getGroupPanel('panel1')!.group.id,
                    panelId: 'panel1',
                },
                to: { group: panel2.group, position: 'left' },
            });

            await exhaustMicrotaskQueue();
            await exhaustAnimationFrame();
            await exhaustMicrotaskQueue();

            const memberZ = overlayZIndexFor(dockview, 'panel1');
            const anchorZ = overlayZIndexFor(dockview, 'panel2');

            // The lifted overlay z-index is `--dv-overlay-z-index + level*2+1`,
            // which paints above the floating window (`+ level*2`). Before the
            // fix the member overlay had no inline z-index and fell back to the
            // CSS `dv-render-overlay-float` value (one *below* the window), so
            // its content rendered behind the window.
            expect(memberZ).toMatch(/--dv-overlay-z-index/);
            expect(memberZ).toEqual(anchorZ);

            dockview.dispose();
        });
    });

    describe('stale drop overlay cleanup on dragend', () => {
        function createComponent(
            mounting: 'relative' | 'absolute'
        ): DockviewComponent {
            const container = document.createElement('div');
            const dockview = new DockviewComponent(container, {
                createComponent(options) {
                    return new PanelContentPartTest(options.id, options.name);
                },
                theme: {
                    name: 'test',
                    className: 'test',
                    dndOverlayMounting: mounting,
                },
            });
            dockview.layout(1000, 1000);
            return dockview;
        }

        // Simulate an anchored overlay left behind in a container (as an HTML5
        // drag would after showing a drop target), then assert `dragend` clears
        // it. HTML5 `dragend` fires only on the drag source, and each drop
        // target clears only its own container, so an overlay shown in a
        // different container than the source's would otherwise linger.
        test('a dragend clears a lingering overlay in the floating container (relative mounting)', () => {
            const dockview = createComponent('relative');
            const shell = (dockview as any)._shellManager
                .element as HTMLElement;

            // Materialize an overlay in the floating container.
            dockview.floatingDropTargetContainer.model!.getElements();
            expect(dockview.floatingDropTargetContainer.model!.exists()).toBe(
                true
            );

            fireEvent.dragEnd(shell);

            expect(dockview.floatingDropTargetContainer.model!.exists()).toBe(
                false
            );

            dockview.dispose();
        });

        test('a dragend clears a lingering overlay in the root container (absolute mounting)', () => {
            const dockview = createComponent('absolute');
            const shell = (dockview as any)._shellManager
                .element as HTMLElement;

            dockview.rootDropTargetContainer.model!.getElements();
            expect(dockview.rootDropTargetContainer.model!.exists()).toBe(true);

            fireEvent.dragEnd(shell);

            expect(dockview.rootDropTargetContainer.model!.exists()).toBe(
                false
            );

            dockview.dispose();
        });

        test('a dragend clears both shell containers at once', () => {
            const dockview = createComponent('absolute');
            const shell = (dockview as any)._shellManager
                .element as HTMLElement;

            dockview.rootDropTargetContainer.model!.getElements();
            dockview.floatingDropTargetContainer.model!.getElements();
            expect(dockview.rootDropTargetContainer.model!.exists()).toBe(true);
            expect(dockview.floatingDropTargetContainer.model!.exists()).toBe(
                true
            );

            fireEvent.dragEnd(shell);

            expect(dockview.rootDropTargetContainer.model!.exists()).toBe(
                false
            );
            expect(dockview.floatingDropTargetContainer.model!.exists()).toBe(
                false
            );

            dockview.dispose();
        });
    });
});
