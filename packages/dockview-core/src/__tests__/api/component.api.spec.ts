import {
    SplitviewApi,
    PaneviewApi,
    GridviewApi,
    DockviewApi,
} from '../../api/component.api';
import { GridviewComponent } from '../../gridview/gridviewComponent';
import { PaneviewComponent } from '../../paneview/paneviewComponent';
import { SplitviewComponent } from '../../splitview/splitviewComponent';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { Orientation } from '../../splitview/splitview';

describe('component.api', () => {
    describe('splitview', () => {
        test('splitviewapi', () => {
            const list: (keyof SplitviewComponent)[] = [
                'minimumSize',
                'maximumSize',
                'height',
                'width',
                'length',
                'orientation',
                'onDidLayoutChange',
                'onDidAddView',
                'onDidRemoveView',
                'panels',
                'focus',
                'toJSON',
            ];

            for (const _ of list) {
                const f = jest.fn();

                const component: Partial<SplitviewComponent> = {
                    [_]: f(),
                };

                const cut = new SplitviewApi(<SplitviewComponent>component);

                (cut as any)[_];

                expect(f).toHaveBeenCalledTimes(1);
            }
        });
    });

    describe('paneview', () => {
        test('panviewapi', () => {
            const list: (keyof PaneviewComponent)[] = [
                'minimumSize',
                'maximumSize',
                'height',
                'width',
                'onDidLayoutChange',
                'onDidAddView',
                'onDidRemoveView',
                'panels',
                'focus',
                'toJSON',
            ];

            for (const _ of list) {
                const f = jest.fn();

                const component: Partial<PaneviewComponent> = {
                    [_]: f(),
                };

                const cut = new PaneviewApi(<PaneviewComponent>component);

                (cut as any)[_];

                expect(f).toHaveBeenCalledTimes(1);
            }
        });
    });

    describe('gridview', () => {
        test('gridviewapi', () => {
            const list: (keyof GridviewComponent)[] = [
                'minimumHeight',
                'maximumHeight',
                'minimumWidth',
                'maximumWidth',
                'width',
                'height',
                'onDidLayoutChange',
                'orientation',
                'focus',
                'toJSON',
                'onDidActiveGroupChange',
                'onDidAddGroup',
                'onDidRemoveGroup',
                'onDidLayoutFromJSON',
            ];

            for (const _ of list) {
                const f = jest.fn();

                const component: Partial<GridviewComponent> = {
                    [_]: f(),
                };

                const cut = new GridviewApi(<GridviewComponent>component);

                (cut as any)[_];

                expect(f).toHaveBeenCalledTimes(1);
            }
        });
    });

    describe('dockview', () => {
        test('dockviewapi', () => {
            const list: (keyof DockviewComponent)[] = [
                'minimumHeight',
                'maximumHeight',
                'minimumWidth',
                'maximumWidth',
                'width',
                'height',
                'size',
                'totalPanels',
                'onDidLayoutChange',
                'panels',
                'groups',
                'activeGroup',
                'activePanel',
                'focus',
                'closeAllGroups',
                'toJSON',
                'onDidActiveGroupChange',
                'onDidAddGroup',
                'onDidRemoveGroup',
                'onDidActivePanelChange',
                'onDidAddPanel',
                'onDidRemovePanel',
                'onDidLayoutFromJSON',
            ];

            for (const _ of list) {
                const f = jest.fn();

                const component: Partial<DockviewComponent> = {
                    [_]: f(),
                };

                const cut = new DockviewApi(<DockviewComponent>component);

                (cut as any)[_];

                expect(f).toHaveBeenCalledTimes(1);
            }
        });

        test('activateNext / activatePrevious delegate to the component', () => {
            const activateNext = jest.fn();
            const activatePrevious = jest.fn();
            const component: Partial<DockviewComponent> = {
                activateNext,
                activatePrevious,
            };
            const cut = new DockviewApi(<DockviewComponent>component);

            cut.activateNext({ includePanel: true });
            expect(activateNext).toHaveBeenCalledWith({ includePanel: true });

            cut.activatePrevious();
            expect(activatePrevious).toHaveBeenCalledTimes(1);
        });

        test('deprecated moveToNext / moveToPrevious alias activateNext / activatePrevious', () => {
            const activateNext = jest.fn();
            const activatePrevious = jest.fn();
            const component: Partial<DockviewComponent> = {
                activateNext,
                activatePrevious,
            };
            const cut = new DockviewApi(<DockviewComponent>component);

            cut.moveToNext({ includePanel: true });
            expect(activateNext).toHaveBeenCalledWith({ includePanel: true });

            cut.moveToPrevious({ includePanel: false });
            expect(activatePrevious).toHaveBeenCalledWith({
                includePanel: false,
            });
        });
    });

    describe('splitview method delegation', () => {
        test('getters return the underlying component values', () => {
            const onDidLayoutFromJSON = jest.fn();
            const onDidAddView = jest.fn();
            const onDidRemoveView = jest.fn();
            const component: Partial<SplitviewComponent> = {
                minimumSize: 5,
                maximumSize: 500,
                width: 100,
                height: 200,
                length: 3,
                orientation: Orientation.HORIZONTAL,
                panels: ['a', 'b'] as any,
                onDidLayoutFromJSON: onDidLayoutFromJSON as any,
                onDidAddView: onDidAddView as any,
                onDidRemoveView: onDidRemoveView as any,
            };
            const cut = new SplitviewApi(<SplitviewComponent>component);

            expect(cut.minimumSize).toBe(5);
            expect(cut.maximumSize).toBe(500);
            expect(cut.width).toBe(100);
            expect(cut.height).toBe(200);
            expect(cut).toHaveLength(3);
            expect(cut.orientation).toBe(Orientation.HORIZONTAL);
            expect(cut.panels).toEqual(['a', 'b']);
            expect(cut.onDidLayoutFromJSON).toBe(onDidLayoutFromJSON);
            expect(cut.onDidAddView).toBe(onDidAddView);
            expect(cut.onDidRemoveView).toBe(onDidRemoveView);
        });

        test('methods delegate to the component', () => {
            const panel = { id: 'x' } as any;
            const getPanel = jest.fn().mockReturnValue(panel);
            const addPanel = jest.fn().mockReturnValue(panel);
            const toJSON = jest.fn().mockReturnValue({ some: 'data' });
            const component: Partial<SplitviewComponent> = {
                removePanel: jest.fn(),
                focus: jest.fn(),
                getPanel,
                layout: jest.fn(),
                addPanel,
                movePanel: jest.fn(),
                fromJSON: jest.fn(),
                toJSON,
                clear: jest.fn(),
                updateOptions: jest.fn(),
                dispose: jest.fn(),
            };
            const cut = new SplitviewApi(<SplitviewComponent>component);

            cut.removePanel(panel, 'auto' as any);
            expect(component.removePanel).toHaveBeenCalledWith(panel, 'auto');

            cut.focus();
            expect(component.focus).toHaveBeenCalledTimes(1);

            expect(cut.getPanel('x')).toBe(panel);
            expect(getPanel).toHaveBeenCalledWith('x');

            cut.layout(10, 20);
            expect(component.layout).toHaveBeenCalledWith(10, 20);

            const addOptions = { id: 'x', component: 'c' } as any;
            expect(cut.addPanel(addOptions)).toBe(panel);
            expect(addPanel).toHaveBeenCalledWith(addOptions);

            cut.movePanel(0, 1);
            expect(component.movePanel).toHaveBeenCalledWith(0, 1);

            const data = { foo: 1 } as any;
            cut.fromJSON(data);
            expect(component.fromJSON).toHaveBeenCalledWith(data);

            expect(cut.toJSON()).toEqual({ some: 'data' });

            cut.clear();
            expect(component.clear).toHaveBeenCalledTimes(1);

            const opts = { orientation: Orientation.VERTICAL } as any;
            cut.updateOptions(opts);
            expect(component.updateOptions).toHaveBeenCalledWith(opts);

            cut.dispose();
            expect(component.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('paneview method delegation', () => {
        test('getters return the underlying component values', () => {
            const onDidLayoutFromJSON = jest.fn();
            const onDidAddView = jest.fn();
            const onDidRemoveView = jest.fn();
            const onDidDrop = jest.fn();
            const onUnhandledDragOver = jest.fn();
            const component: Partial<PaneviewComponent> = {
                minimumSize: 1,
                maximumSize: 2,
                width: 3,
                height: 4,
                panels: ['p'] as any,
                onDidLayoutFromJSON: onDidLayoutFromJSON as any,
                onDidAddView: onDidAddView as any,
                onDidRemoveView: onDidRemoveView as any,
                onDidDrop: onDidDrop as any,
                onUnhandledDragOver: onUnhandledDragOver as any,
            };
            const cut = new PaneviewApi(<PaneviewComponent>component);

            expect(cut.minimumSize).toBe(1);
            expect(cut.maximumSize).toBe(2);
            expect(cut.width).toBe(3);
            expect(cut.height).toBe(4);
            expect(cut.panels).toEqual(['p']);
            expect(cut.onDidLayoutFromJSON).toBe(onDidLayoutFromJSON);
            expect(cut.onDidAddView).toBe(onDidAddView);
            expect(cut.onDidRemoveView).toBe(onDidRemoveView);
            expect(cut.onDidDrop).toBe(onDidDrop);
            expect(cut.onUnhandledDragOver).toBe(onUnhandledDragOver);
        });

        test('methods delegate to the component', () => {
            const panel = { id: 'p' } as any;
            const getPanel = jest.fn().mockReturnValue(panel);
            const addPanel = jest.fn().mockReturnValue(panel);
            const toJSON = jest.fn().mockReturnValue({ v: 1 });
            const component: Partial<PaneviewComponent> = {
                removePanel: jest.fn(),
                getPanel,
                movePanel: jest.fn(),
                focus: jest.fn(),
                layout: jest.fn(),
                addPanel,
                fromJSON: jest.fn(),
                toJSON,
                clear: jest.fn(),
                updateOptions: jest.fn(),
                dispose: jest.fn(),
            };
            const cut = new PaneviewApi(<PaneviewComponent>component);

            cut.removePanel(panel);
            expect(component.removePanel).toHaveBeenCalledWith(panel);

            expect(cut.getPanel('p')).toBe(panel);
            expect(getPanel).toHaveBeenCalledWith('p');

            cut.movePanel(2, 0);
            expect(component.movePanel).toHaveBeenCalledWith(2, 0);

            cut.focus();
            expect(component.focus).toHaveBeenCalledTimes(1);

            cut.layout(50, 60);
            expect(component.layout).toHaveBeenCalledWith(50, 60);

            const addOptions = { id: 'p', component: 'c' } as any;
            expect(cut.addPanel(addOptions)).toBe(panel);
            expect(addPanel).toHaveBeenCalledWith(addOptions);

            const data = { bar: 2 } as any;
            cut.fromJSON(data);
            expect(component.fromJSON).toHaveBeenCalledWith(data);

            expect(cut.toJSON()).toEqual({ v: 1 });

            cut.clear();
            expect(component.clear).toHaveBeenCalledTimes(1);

            const opts = { disableAutoResizing: true } as any;
            cut.updateOptions(opts);
            expect(component.updateOptions).toHaveBeenCalledWith(opts);

            cut.dispose();
            expect(component.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('gridview method delegation', () => {
        test('remapped event getters delegate to the group-oriented component events', () => {
            const onDidAddGroup = jest.fn();
            const onDidRemoveGroup = jest.fn();
            const onDidActiveGroupChange = jest.fn();
            const component: Partial<GridviewComponent> = {
                onDidAddGroup: onDidAddGroup as any,
                onDidRemoveGroup: onDidRemoveGroup as any,
                onDidActiveGroupChange: onDidActiveGroupChange as any,
                groups: ['g1', 'g2'] as any,
            };
            const cut = new GridviewApi(<GridviewComponent>component);

            expect(cut.onDidAddPanel).toBe(onDidAddGroup);
            expect(cut.onDidRemovePanel).toBe(onDidRemoveGroup);
            expect(cut.onDidActivePanelChange).toBe(onDidActiveGroupChange);
            expect(cut.panels).toEqual(['g1', 'g2']);
        });

        test('orientation setter routes through updateOptions', () => {
            const updateOptions = jest.fn();
            const component: Partial<GridviewComponent> = {
                orientation: Orientation.HORIZONTAL,
                updateOptions,
            };
            const cut = new GridviewApi(<GridviewComponent>component);

            cut.orientation = Orientation.VERTICAL;
            expect(updateOptions).toHaveBeenCalledWith({
                orientation: Orientation.VERTICAL,
            });
        });

        test('methods delegate to the component', () => {
            const panel = { id: 'g' } as any;
            const getPanel = jest.fn().mockReturnValue(panel);
            const addPanel = jest.fn().mockReturnValue(panel);
            const toJSON = jest.fn().mockReturnValue({ grid: true });
            const component: Partial<GridviewComponent> = {
                focus: jest.fn(),
                layout: jest.fn(),
                addPanel,
                removePanel: jest.fn(),
                movePanel: jest.fn(),
                getPanel,
                fromJSON: jest.fn(),
                toJSON,
                clear: jest.fn(),
                updateOptions: jest.fn(),
                dispose: jest.fn(),
            };
            const cut = new GridviewApi(<GridviewComponent>component);

            cut.focus();
            expect(component.focus).toHaveBeenCalledTimes(1);

            cut.layout(10, 20);
            expect(component.layout).toHaveBeenCalledWith(10, 20, false);

            cut.layout(10, 20, true);
            expect(component.layout).toHaveBeenLastCalledWith(10, 20, true);

            const addOptions = { id: 'g', component: 'c' } as any;
            expect(cut.addPanel(addOptions)).toBe(panel);
            expect(addPanel).toHaveBeenCalledWith(addOptions);

            cut.removePanel(panel, 'auto' as any);
            expect(component.removePanel).toHaveBeenCalledWith(panel, 'auto');

            const moveOptions = { direction: 'left', reference: 'ref' } as any;
            cut.movePanel(panel, moveOptions);
            expect(component.movePanel).toHaveBeenCalledWith(
                panel,
                moveOptions
            );

            expect(cut.getPanel('g')).toBe(panel);
            expect(getPanel).toHaveBeenCalledWith('g');

            const data = { baz: 3 } as any;
            cut.fromJSON(data);
            expect(component.fromJSON).toHaveBeenCalledWith(data);

            expect(cut.toJSON()).toEqual({ grid: true });

            cut.clear();
            expect(component.clear).toHaveBeenCalledTimes(1);

            const opts = { orientation: Orientation.VERTICAL } as any;
            cut.updateOptions(opts);
            expect(component.updateOptions).toHaveBeenCalledWith(opts);

            cut.dispose();
            expect(component.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('dockview method delegation', () => {
        function createComponent(
            overrides: Partial<DockviewComponent> = {}
        ): Partial<DockviewComponent> {
            return {
                withOrigin: jest.fn((_origin: any, func: any) => func()),
                ...overrides,
            };
        }

        test('id, tabGroupColors and messages getters', () => {
            const entries = jest.fn().mockReturnValue([{ label: 'red' }]);
            const component = createComponent({
                id: 'dock-1',
                tabGroupColorPalette: { entries } as any,
                options: { messages: undefined } as any,
            });
            const cut = new DockviewApi(<DockviewComponent>component);

            expect(cut.id).toBe('dock-1');
            expect(cut.tabGroupColors).toEqual([{ label: 'red' }]);
            expect(entries).toHaveBeenCalledTimes(1);
            // resolveMessages merges over English defaults; result is an object.
            expect(typeof cut.messages).toBe('object');
        });

        test('simple event getters delegate to the component', () => {
            const events: (keyof DockviewApi)[] = [
                'onDidPanelPinnedChange',
                'onDidMovePanel',
                'onDidDrop',
                'onWillDrop',
                'onWillMutateLayout',
                'onDidMutateLayout',
                'onWillShowOverlay',
                'onWillDragGroup',
                'onWillDragPanel',
                'onUnhandledDragOver',
                'onDidPopoutGroupSizeChange',
                'onDidPopoutGroupPositionChange',
                'onDidAddPopoutGroup',
                'onDidRemovePopoutGroup',
                'onDidOpenPopoutWindowFail',
                'onDidCreateTabGroup',
                'onDidDestroyTabGroup',
                'onDidAddPanelToTabGroup',
                'onDidRemovePanelFromTabGroup',
                'onDidTabGroupChange',
                'onDidTabGroupCollapsedChange',
                'onWillDrop',
                'onDidChangeHistory',
                'onDidSnapFloat',
                'onDidSnapTogether',
                'onDidMaximizedGroupChange',
            ];

            for (const name of events) {
                const sentinel = jest.fn();
                const component = createComponent({
                    [name]: sentinel as any,
                });
                const cut = new DockviewApi(<DockviewComponent>component);
                expect((cut as any)[name]).toBe(sentinel);
            }
        });

        test('scalar getters delegate to the component', () => {
            const promise = Promise.resolve();
            const component = createComponent({
                canUndo: true,
                canRedo: false,
                smartGuidesEnabled: true,
                popoutRestorationPromise: promise,
            });
            const cut = new DockviewApi(<DockviewComponent>component);

            expect(cut.canUndo).toBe(true);
            expect(cut.canRedo).toBe(false);
            expect(cut.smartGuidesEnabled).toBe(true);
            expect(cut.popoutRestorationPromise).toBe(promise);
        });

        test('getPanel delegates to getGroupPanel and getGroup to getPanel', () => {
            const panel = { id: 'p' } as any;
            const group = { id: 'g' } as any;
            const getGroupPanel = jest.fn().mockReturnValue(panel);
            const getPanel = jest.fn().mockReturnValue(group);
            const component = createComponent({ getGroupPanel, getPanel });
            const cut = new DockviewApi(<DockviewComponent>component);

            expect(cut.getPanel('p')).toBe(panel);
            expect(getGroupPanel).toHaveBeenCalledWith('p');

            expect(cut.getGroup('g')).toBe(group);
            expect(getPanel).toHaveBeenCalledWith('g');
        });

        test('focus and layout delegate to the component', () => {
            const component = createComponent({
                focus: jest.fn(),
                layout: jest.fn(),
            });
            const cut = new DockviewApi(<DockviewComponent>component);

            cut.focus();
            expect(component.focus).toHaveBeenCalledTimes(1);

            cut.layout(10, 20);
            expect(component.layout).toHaveBeenCalledWith(10, 20, false);

            cut.layout(10, 20, true);
            expect(component.layout).toHaveBeenLastCalledWith(10, 20, true);
        });

        test('mutating methods run inside withOrigin("api")', () => {
            const panel = { id: 'p' } as any;
            const group = { id: 'g' } as any;
            const addPanel = jest.fn().mockReturnValue(panel);
            const addGroup = jest.fn().mockReturnValue(group);
            const addPopoutGroup = jest.fn().mockResolvedValue(true);
            const component = createComponent({
                addPanel,
                addGroup,
                removePanel: jest.fn(),
                closeAllGroups: jest.fn(),
                removeGroup: jest.fn(),
                addFloatingGroup: jest.fn(),
                fromJSON: jest.fn(),
                clear: jest.fn(),
                addPopoutGroup,
                maximizeGroup: jest.fn(),
                exitMaximizedGroup: jest.fn(),
            });
            const cut = new DockviewApi(<DockviewComponent>component);

            const addOptions = { id: 'p', component: 'c' } as any;
            expect(cut.addPanel(addOptions)).toBe(panel);
            expect(addPanel).toHaveBeenCalledWith(addOptions);

            const addGroupOptions = { id: 'g' } as any;
            expect(cut.addGroup(addGroupOptions)).toBe(group);
            expect(addGroup).toHaveBeenCalledWith(addGroupOptions);

            cut.removePanel(panel);
            expect(component.removePanel).toHaveBeenCalledWith(panel);

            cut.closeAllGroups();
            expect(component.closeAllGroups).toHaveBeenCalledTimes(1);

            cut.removeGroup(group);
            expect(component.removeGroup).toHaveBeenCalledWith(group);

            const floatOptions = { position: {} } as any;
            cut.addFloatingGroup(panel, floatOptions);
            expect(component.addFloatingGroup).toHaveBeenCalledWith(
                panel,
                floatOptions
            );

            const data = { grid: {} } as any;
            cut.fromJSON(data, { reuseExistingPanels: true });
            expect(component.fromJSON).toHaveBeenCalledWith(data, {
                reuseExistingPanels: true,
            });

            cut.clear();
            expect(component.clear).toHaveBeenCalledTimes(1);

            const popoutOptions = { position: {} } as any;
            void cut.addPopoutGroup(panel, popoutOptions);
            expect(addPopoutGroup).toHaveBeenCalledWith(panel, popoutOptions);

            cut.maximizeGroup({ group } as any);
            expect(component.maximizeGroup).toHaveBeenCalledWith(group);

            cut.exitMaximizedGroup();
            expect(component.exitMaximizedGroup).toHaveBeenCalledTimes(1);

            // Every mutating call went through withOrigin('api', ...)
            expect(component.withOrigin).toHaveBeenCalled();
            for (const call of (component.withOrigin as jest.Mock).mock.calls) {
                expect(call[0]).toBe('api');
            }
        });

        test('addGroup runs inside withOrigin("api")', () => {
            const group = { id: 'g' } as any;
            const addGroup = jest.fn().mockReturnValue(group);
            const component = createComponent({ addGroup });
            const cut = new DockviewApi(<DockviewComponent>component);

            const options = { id: 'g' } as any;
            expect(cut.addGroup(options)).toBe(group);
            expect(addGroup).toHaveBeenCalledWith(options);
            expect(component.withOrigin).toHaveBeenCalledWith(
                'api',
                expect.any(Function)
            );
        });

        test('toJSON delegates to the component', () => {
            const toJSON = jest.fn().mockReturnValue({ dock: true });
            const component = createComponent({ toJSON });
            const cut = new DockviewApi(<DockviewComponent>component);

            expect(cut.toJSON()).toEqual({ dock: true });
        });

        test('history methods delegate to the component', () => {
            const component = createComponent({
                undo: jest.fn(),
                redo: jest.fn(),
                clearHistory: jest.fn(),
            });
            const cut = new DockviewApi(<DockviewComponent>component);

            cut.undo();
            expect(component.undo).toHaveBeenCalledTimes(1);

            cut.redo();
            expect(component.redo).toHaveBeenCalledTimes(1);

            cut.clearHistory();
            expect(component.clearHistory).toHaveBeenCalledTimes(1);
        });

        test('smart guides methods delegate to the component', () => {
            const component = createComponent({
                setSmartGuidesEnabled: jest.fn(),
                updateSmartGuidesOptions: jest.fn(),
            });
            const cut = new DockviewApi(<DockviewComponent>component);

            cut.setSmartGuidesEnabled(true);
            expect(component.setSmartGuidesEnabled).toHaveBeenCalledWith(true);

            const opts = { snapThreshold: 10 } as any;
            cut.updateSmartGuidesOptions(opts);
            expect(component.updateSmartGuidesOptions).toHaveBeenCalledWith(
                opts
            );
        });

        test('adjacentGroupInDirection delegates to the component', () => {
            const group = { id: 'g' } as any;
            const result = { id: 'other' } as any;
            const adjacentGroupInDirection = jest.fn().mockReturnValue(result);
            const component = createComponent({ adjacentGroupInDirection });
            const cut = new DockviewApi(<DockviewComponent>component);

            expect(cut.adjacentGroupInDirection(group, 'left')).toBe(result);
            expect(adjacentGroupInDirection).toHaveBeenCalledWith(
                group,
                'left'
            );
        });

        test('maximize group methods delegate to the component', () => {
            const group = { id: 'g' } as any;
            const panel = { group } as any;
            const hasMaximizedGroup = jest.fn().mockReturnValue(true);
            const component = createComponent({
                maximizeGroup: jest.fn(),
                hasMaximizedGroup,
                exitMaximizedGroup: jest.fn(),
            });
            const cut = new DockviewApi(<DockviewComponent>component);

            cut.maximizeGroup(panel);
            expect(component.maximizeGroup).toHaveBeenCalledWith(group);

            expect(cut.hasMaximizedGroup()).toBe(true);

            cut.exitMaximizedGroup();
            expect(component.exitMaximizedGroup).toHaveBeenCalledTimes(1);
        });

        test('getPopouts and updateOptions delegate to the component', () => {
            const popouts = [{ id: 'po' }] as any;
            const getPopouts = jest.fn().mockReturnValue(popouts);
            const component = createComponent({
                getPopouts,
                updateOptions: jest.fn(),
            });
            const cut = new DockviewApi(<DockviewComponent>component);

            expect(cut.getPopouts()).toBe(popouts);

            const opts = { disableFloatingGroups: true } as any;
            cut.updateOptions(opts);
            expect(component.updateOptions).toHaveBeenCalledWith(opts);
        });

        test('edge group methods delegate to the component', () => {
            const api = { id: 'edge' } as any;
            const addEdgeGroup = jest.fn().mockReturnValue(api);
            const getEdgeGroup = jest.fn().mockReturnValue(api);
            const isEdgeGroupVisible = jest.fn().mockReturnValue(true);
            const getEdgeGroups = jest.fn().mockReturnValue([api]);
            const isEdgeCollapsed = jest.fn().mockReturnValue(true);
            const component = createComponent({
                addEdgeGroup,
                revealEdgeGroupWithData: jest.fn(),
                getEdgeGroup,
                getEdgeGroups,
                moveEdgeGroup: jest.fn(),
                setEdgeGroupVisible: jest.fn(),
                isEdgeGroupVisible,
                isEdgeCollapsed,
                removeEdgeGroup: jest.fn(),
                pinEdgeGroup: jest.fn(),
                autoHideEdgeGroup: jest.fn(),
                peekEdgeGroup: jest.fn(),
                withOrigin: jest.fn((_origin, fn) => fn()),
            });
            const cut = new DockviewApi(<DockviewComponent>component);

            const addOptions = { component: 'c' } as any;
            expect(cut.addEdgeGroup('left', addOptions)).toBe(api);
            expect(addEdgeGroup).toHaveBeenCalledWith('left', addOptions);

            const data = { groupId: 'g', panelId: 'p' };
            cut.revealEdgeGroupWithData('right', data, { autoHide: true });
            expect(component.revealEdgeGroupWithData).toHaveBeenCalledWith(
                'right',
                data,
                { autoHide: true }
            );

            expect(cut.getEdgeGroup('top')).toBe(api);
            expect(getEdgeGroup).toHaveBeenCalledWith('top', undefined);
            expect(cut.getEdgeGroup('top', 'edge')).toBe(api);
            expect(getEdgeGroup).toHaveBeenCalledWith('top', 'edge');

            expect(cut.getEdgeGroups('top')).toEqual([api]);
            expect(getEdgeGroups).toHaveBeenCalledWith('top');

            cut.moveEdgeGroup('edge', { index: 1 });
            expect(component.moveEdgeGroup).toHaveBeenCalledWith('edge', {
                index: 1,
            });

            expect(cut.isEdgeCollapsed('top')).toBe(true);
            expect(isEdgeCollapsed).toHaveBeenCalledWith('top');

            cut.setEdgeGroupVisible('bottom', false);
            expect(component.setEdgeGroupVisible).toHaveBeenCalledWith(
                'bottom',
                false
            );

            expect(cut.isEdgeGroupVisible('left')).toBe(true);
            expect(isEdgeGroupVisible).toHaveBeenCalledWith('left');

            cut.removeEdgeGroup('left');
            expect(component.removeEdgeGroup).toHaveBeenCalledWith(
                'left',
                undefined
            );
            cut.removeEdgeGroup('left', 'edge');
            expect(component.removeEdgeGroup).toHaveBeenCalledWith(
                'left',
                'edge'
            );

            cut.pinEdgeGroup('left');
            expect(component.pinEdgeGroup).toHaveBeenCalledWith('left');

            cut.autoHideEdgeGroup('left');
            expect(component.autoHideEdgeGroup).toHaveBeenCalledWith('left');

            cut.peekEdgeGroup('left', true);
            expect(component.peekEdgeGroup).toHaveBeenCalledWith('left', true);
        });

        test('dispose delegates to the component', () => {
            const component = createComponent({ dispose: jest.fn() });
            const cut = new DockviewApi(<DockviewComponent>component);

            cut.dispose();
            expect(component.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('dockview tab group API', () => {
        function createModel(): any {
            return {
                createTabGroup: jest.fn().mockReturnValue({ id: 'tg' }),
                dissolveTabGroup: jest.fn(),
                addPanelToTabGroup: jest.fn(),
                removePanelFromTabGroup: jest.fn(),
                getTabGroups: jest.fn().mockReturnValue([{ id: 'tg' }]),
                getTabGroupForPanel: jest.fn().mockReturnValue({ id: 'tg' }),
                moveTabGroup: jest.fn(),
            };
        }

        function createComponent(model: any): Partial<DockviewComponent> {
            return {
                withOrigin: jest.fn((_origin: any, func: any) => func()),
                getPanel: jest.fn().mockReturnValue({ model }),
            };
        }

        test('createTabGroup resolves the group model and delegates', () => {
            const model = createModel();
            const component = createComponent(model);
            const cut = new DockviewApi(<DockviewComponent>component);

            const result = cut.createTabGroup({
                groupId: 'g1',
                label: 'L',
                color: 'blue',
                componentParams: { a: 1 },
            });
            expect(component.getPanel).toHaveBeenCalledWith('g1');
            expect(model.createTabGroup).toHaveBeenCalledWith({
                label: 'L',
                color: 'blue',
                componentParams: { a: 1 },
            });
            expect(result).toEqual({ id: 'tg' });
        });

        test('dissolveTabGroup delegates to the model', () => {
            const model = createModel();
            const cut = new DockviewApi(
                <DockviewComponent>createComponent(model)
            );

            cut.dissolveTabGroup({ groupId: 'g1', tabGroupId: 'tg1' });
            expect(model.dissolveTabGroup).toHaveBeenCalledWith('tg1');
        });

        test('addPanelToTabGroup delegates to the model', () => {
            const model = createModel();
            const cut = new DockviewApi(
                <DockviewComponent>createComponent(model)
            );

            cut.addPanelToTabGroup({
                groupId: 'g1',
                tabGroupId: 'tg1',
                panelId: 'p1',
                index: 2,
            });
            expect(model.addPanelToTabGroup).toHaveBeenCalledWith(
                'tg1',
                'p1',
                2
            );
        });

        test('removePanelFromTabGroup delegates to the model', () => {
            const model = createModel();
            const cut = new DockviewApi(
                <DockviewComponent>createComponent(model)
            );

            cut.removePanelFromTabGroup({ groupId: 'g1', panelId: 'p1' });
            expect(model.removePanelFromTabGroup).toHaveBeenCalledWith('p1');
        });

        test('getTabGroups delegates to the model', () => {
            const model = createModel();
            const cut = new DockviewApi(
                <DockviewComponent>createComponent(model)
            );

            expect(cut.getTabGroups({ groupId: 'g1' })).toEqual([{ id: 'tg' }]);
            expect(model.getTabGroups).toHaveBeenCalledTimes(1);
        });

        test('getTabGroupForPanel delegates to the model', () => {
            const model = createModel();
            const cut = new DockviewApi(
                <DockviewComponent>createComponent(model)
            );

            expect(
                cut.getTabGroupForPanel({ groupId: 'g1', panelId: 'p1' })
            ).toEqual({ id: 'tg' });
            expect(model.getTabGroupForPanel).toHaveBeenCalledWith('p1');
        });

        test('moveTabGroup delegates to the model', () => {
            const model = createModel();
            const cut = new DockviewApi(
                <DockviewComponent>createComponent(model)
            );

            cut.moveTabGroup({ groupId: 'g1', tabGroupId: 'tg1', index: 3 });
            expect(model.moveTabGroup).toHaveBeenCalledWith('tg1', 3);
        });

        test('tab group methods throw when the group is not found', () => {
            const component: Partial<DockviewComponent> = {
                withOrigin: jest.fn((_origin: any, func: any) => func()),
                getPanel: jest.fn().mockReturnValue(undefined),
            };
            const cut = new DockviewApi(<DockviewComponent>component);

            expect(() => cut.getTabGroups({ groupId: 'missing' })).toThrow(
                "dockview: group 'missing' not found"
            );
        });
    });
});
