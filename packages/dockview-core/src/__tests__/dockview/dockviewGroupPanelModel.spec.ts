import { DockviewComponent } from '../../dockview/dockviewComponent';
import {
    GroupviewPanelState,
    IGroupPanelInitParameters,
    GroupPanelPartInitParameters,
    IContentRenderer,
    ITabRenderer,
    IWatermarkRenderer,
} from '../../dockview/types';
import { PanelUpdateEvent, Parameters } from '../../panel/types';
import {
    DockviewGroupPanelModel,
    GroupOptions,
} from '../../dockview/dockviewGroupPanelModel';
import { fireEvent } from '@testing-library/dom';
import { LocalSelectionTransfer, PanelTransfer } from '../../dnd/dataTransfer';
import { CompositeDisposable } from '../../lifecycle';
import { DockviewPanelApi } from '../../api/dockviewPanelApi';
import { IDockviewPanel } from '../../dockview/dockviewPanel';
import { IDockviewPanelModel } from '../../dockview/dockviewPanelModel';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { WatermarkRendererInitParameters } from '../../dockview/types';
import { createOffsetDragOverEvent } from '../__test_utils__/utils';
import { OverlayRenderContainer } from '../../overlay/overlayRenderContainer';
import { Emitter } from '../../events';
import { fromPartial } from '@total-typescript/shoehorn';
import { TabLocation } from '../../dockview/framework';

enum GroupChangeKind2 {
    ADD_PANEL,
    REMOVE_PANEL,
    PANEL_ACTIVE,
}

class TestModel implements IDockviewPanelModel {
    readonly content: IContentRenderer;
    readonly contentComponent: string;
    readonly tab: ITabRenderer;

    constructor(readonly id: string) {
        this.content = new TestHeaderPart(id);
        this.contentComponent = id;
        this.tab = new TestContentPart(id);
    }

    createTabRenderer(tabLocation: TabLocation): ITabRenderer {
        return new TestHeaderPart(this.id);
    }

    update(event: PanelUpdateEvent): void {
        //
    }

    setTitle(title: string): void {
        //
    }

    layout(width: number, height: number): void {
        //
    }

    init(params: GroupPanelPartInitParameters): void {
        //
    }

    updateParentGroup(
        group: DockviewGroupPanel,
        isPanelVisible: boolean
    ): void {
        //
    }

    dispose(): void {
        //
    }
}

class Watermark implements IWatermarkRenderer {
    public readonly element = document.createElement('div');

    constructor() {
        this.element.className = `watermark-test-container`;
    }

    get id() {
        return 'watermark-id';
    }

    init(params: WatermarkRendererInitParameters) {
        //
    }

    layout(width: number, height: number) {
        // noop
    }

    update(event: PanelUpdateEvent) {
        // noop
    }

    focus() {
        // noop
    }

    toJSON() {
        return {};
    }

    dispose() {
        //
    }
}

class TestContentPart implements IContentRenderer {
    public element = document.createElement('div');

    constructor(public readonly id: string) {
        this.element.className = `content-part-${id}`;
    }

    init(params: GroupPanelPartInitParameters) {
        //noop
    }

    layout(width: number, height: number) {
        //noop
    }

    update(event: PanelUpdateEvent) {
        //void
    }

    focus() {
        //noop
    }

    dispose() {
        //noop
    }

    toJSON() {
        return {};
    }
}
class TestHeaderPart implements ITabRenderer {
    public element = document.createElement('div');

    constructor(public readonly id: string) {
        this.element.className = `header-part-${id}`;
    }

    init(params: GroupPanelPartInitParameters) {
        //noop
    }

    layout(width: number, height: number) {
        //noop
    }

    update(event: PanelUpdateEvent) {
        //void
    }

    focus() {
        //noop
    }

    dispose() {
        //noop
    }

    toJSON() {
        return {};
    }
}

export class TestPanel implements IDockviewPanel {
    private _group: DockviewGroupPanel | undefined;
    private _params: IGroupPanelInitParameters | undefined;
    readonly view: IDockviewPanelModel;

    get title() {
        return '';
    }

    get group() {
        return this._group!;
    }

    get params(): Parameters {
        return {};
    }

    constructor(
        public readonly id: string,
        public api: DockviewPanelApi
    ) {
        this.view = new TestModel(id);
        this.init({
            title: `${id}`,
            params: {},
        });
    }

    updateFromStateModel(state: GroupviewPanelState): void {
        //
    }

    init(params: IGroupPanelInitParameters) {
        this._params = params;
    }

    updateParentGroup(group: DockviewGroupPanel): void {
        //
    }

    runEvents(): void {
        //
    }

    layout(width: number, height: number) {
        //noop
    }

    setTitle(title: string): void {
        //
    }

    update(event: PanelUpdateEvent) {
        //noop
    }

    focus() {
        //noop
    }

    toJSON(): GroupviewPanelState {
        return {
            id: this.id,
            title: this._params?.title,
        };
    }

    dispose() {
        //noop
    }
}

describe('dockviewGroupPanelModel', () => {
    let groupview: DockviewGroupPanel;
    let dockview: DockviewComponent;
    let options: GroupOptions;

    let removePanelMock: jest.Mock;
    let removeGroupMock: jest.Mock;

    let panelApi: DockviewPanelApi;

    beforeEach(() => {
        removePanelMock = jest.fn();
        removeGroupMock = jest.fn();

        options = {};

        panelApi = fromPartial<DockviewPanelApi>({
            renderer: 'onlyWhenVisible',
            onDidTitleChange: new Emitter().event,
            onDidParametersChange: new Emitter().event,
        });

        dockview = fromPartial<DockviewComponent>({
            options: {},
            createWatermarkComponent: () => new Watermark(),
            doSetGroupActive: jest.fn(),
            id: 'dockview-1',
            removePanel: removePanelMock,
            removeGroup: removeGroupMock,
            onDidAddPanel: () => ({ dispose: jest.fn() }),
            onDidRemovePanel: () => ({ dispose: jest.fn() }),
            overlayRenderContainer: new OverlayRenderContainer(
                document.createElement('div'),
                fromPartial<DockviewComponent>({})
            ),
            onDidOptionsChange: () => ({ dispose: jest.fn() }),
        });

        groupview = new DockviewGroupPanel(dockview, 'groupview-1', options);
        groupview.initialize();
    });

    test('panel events are captured during de-serialization', () => {
        const panel1 = new TestPanel('panel1', panelApi);
        const panel2 = new TestPanel('panel2', panelApi);
        const panel3 = new TestPanel('panel3', panelApi);

        const groupview2 = new DockviewGroupPanel(dockview, 'groupview-2', {
            panels: [panel1, panel2, panel3],
            activePanel: panel2,
        });

        const events: Array<{
            kind: GroupChangeKind2;
            panel?: IDockviewPanel;
        }> = [];

        const disposable = new CompositeDisposable(
            groupview2.model.onDidAddPanel((e) => {
                events.push({
                    kind: GroupChangeKind2.ADD_PANEL,
                    panel: e.panel,
                });
            }),
            groupview2.model.onDidRemovePanel((e) => {
                events.push({
                    kind: GroupChangeKind2.REMOVE_PANEL,
                    panel: e.panel,
                });
            }),
            groupview2.model.onDidActivePanelChange((e) => {
                events.push({
                    kind: GroupChangeKind2.PANEL_ACTIVE,
                    panel: e.panel,
                });
            })
        );

        groupview2.initialize();

        expect(events).toEqual([
            {
                kind: GroupChangeKind2.ADD_PANEL,
                panel: panel1,
            },
            {
                kind: GroupChangeKind2.ADD_PANEL,
                panel: panel2,
            },
            {
                kind: GroupChangeKind2.ADD_PANEL,
                panel: panel3,
            },
            {
                kind: GroupChangeKind2.PANEL_ACTIVE,
                panel: panel2,
            },
        ]);

        disposable.dispose();
    });

    test('panel events flow', () => {
        let events: Array<{
            kind: GroupChangeKind2;
            panel?: IDockviewPanel;
        }> = [];

        const disposable = new CompositeDisposable(
            groupview.model.onDidAddPanel((e) => {
                events.push({
                    kind: GroupChangeKind2.ADD_PANEL,
                    panel: e.panel,
                });
            }),
            groupview.model.onDidRemovePanel((e) => {
                events.push({
                    kind: GroupChangeKind2.REMOVE_PANEL,
                    panel: e.panel,
                });
            }),
            groupview.model.onDidActivePanelChange((e) => {
                events.push({
                    kind: GroupChangeKind2.PANEL_ACTIVE,
                    panel: e.panel,
                });
            })
        );

        const panel1 = new TestPanel('panel1', panelApi);
        const panel2 = new TestPanel('panel2', panelApi);
        const panel3 = new TestPanel('panel3', panelApi);

        expect(events).toHaveLength(0);

        groupview.model.openPanel(panel1);
        expect(events).toEqual([
            {
                kind: GroupChangeKind2.ADD_PANEL,
                panel: panel1,
            },
            {
                kind: GroupChangeKind2.PANEL_ACTIVE,
                panel: panel1,
            },
        ]);
        events = [];

        groupview.model.openPanel(panel2);
        expect(events).toEqual([
            {
                kind: GroupChangeKind2.ADD_PANEL,
                panel: panel2,
            },
            {
                kind: GroupChangeKind2.PANEL_ACTIVE,
                panel: panel2,
            },
        ]);
        events = [];

        groupview.model.openPanel(panel3);
        expect(events).toEqual([
            {
                kind: GroupChangeKind2.ADD_PANEL,
                panel: panel3,
            },
            {
                kind: GroupChangeKind2.PANEL_ACTIVE,
                panel: panel3,
            },
        ]);
        events = [];

        groupview.model.removePanel(panel3);
        expect(events).toEqual([
            {
                kind: GroupChangeKind2.REMOVE_PANEL,
                panel: panel3,
            },
            {
                kind: GroupChangeKind2.PANEL_ACTIVE,
                panel: panel2,
            },
        ]);
        events = [];

        groupview.model.removePanel(panel1);
        expect(events).toEqual([
            {
                kind: GroupChangeKind2.REMOVE_PANEL,
                panel: panel1,
            },
        ]);
        events = [];

        groupview.model.removePanel(panel2);
        expect(events).toEqual([
            {
                kind: GroupChangeKind2.REMOVE_PANEL,
                panel: panel2,
            },
        ]);
        events = [];

        disposable.dispose();
    });

    test('moveToPrevious and moveToNext', () => {
        const panel1 = new TestPanel('panel1', panelApi);
        const panel2 = new TestPanel('panel2', panelApi);
        const panel3 = new TestPanel('panel3', panelApi);

        groupview.model.openPanel(panel1);
        groupview.model.openPanel(panel2);
        groupview.model.openPanel(panel3);

        groupview.model.openPanel(panel2); // set active

        groupview.model.moveToPrevious();
        expect(groupview.model.activePanel).toBe(panel1);

        groupview.model.moveToPrevious({ suppressRoll: true });
        expect(groupview.model.activePanel).toBe(panel1);

        groupview.model.moveToPrevious();
        expect(groupview.model.activePanel).toBe(panel3);

        groupview.model.moveToNext({ suppressRoll: true });
        expect(groupview.model.activePanel).toBe(panel3);

        groupview.model.moveToNext({ suppressRoll: false });
        expect(groupview.model.activePanel).toBe(panel1);

        groupview.model.moveToPrevious({ suppressRoll: false });
        expect(groupview.model.activePanel).toBe(panel3);

        groupview.model.moveToNext();
        groupview.model.moveToNext();
        expect(groupview.model.activePanel).toBe(panel2);
    });

    test('default', () => {
        let viewQuery = groupview.element.querySelectorAll(
            '.dv-groupview > .dv-tabs-and-actions-container'
        );
        expect(viewQuery).toBeTruthy();

        viewQuery = groupview.element.querySelectorAll(
            '.dv-groupview > .dv-content-container'
        );
        expect(viewQuery).toBeTruthy();
    });

    test('closeAllPanels with panels', () => {
        const panel1 = new TestPanel('panel1', panelApi);
        const panel2 = new TestPanel('panel2', panelApi);
        const panel3 = new TestPanel('panel3', panelApi);

        groupview.model.openPanel(panel1);
        groupview.model.openPanel(panel2);
        groupview.model.openPanel(panel3);

        groupview.model.closeAllPanels();

        expect(removePanelMock).toHaveBeenCalledWith(panel1, undefined);
        expect(removePanelMock).toHaveBeenCalledWith(panel2, undefined);
        expect(removePanelMock).toHaveBeenCalledWith(panel3, undefined);
    });

    test('closeAllPanels with no panels', () => {
        groupview.model.closeAllPanels();
        expect(removeGroupMock).toHaveBeenCalledWith(groupview);
    });

    test('that group is set on panel during onDidAddPanel event', () => {
        const cut = new DockviewComponent(document.createElement('div'), {
            createComponent(options) {
                switch (options.name) {
                    case 'component':
                        return new TestContentPart(options.id);
                    default:
                        throw new Error(`unsupported`);
                }
            },
        });

        const disposable = cut.onDidAddPanel((panel) => {
            expect(panel.group).toBeTruthy();
        });

        const panel = cut.addPanel({ id: 'id', component: 'component' });
        disposable.dispose();
    });

    test('toJSON() default', () => {
        const dockviewComponent = new DockviewComponent(
            document.createElement('div'),
            {
                createComponent(options) {
                    switch (options.name) {
                        case 'component':
                            return new TestContentPart(options.id);
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            }
        );

        const cut = new DockviewGroupPanelModel(
            document.createElement('div'),
            dockviewComponent,
            'id',
            {},
            null as any
        );

        expect(cut.toJSON()).toEqual({
            views: [],
            activeView: undefined,
            id: 'id',
        });
    });

    test('toJSON() locked and hideHeader', () => {
        const dockviewComponent = new DockviewComponent(
            document.createElement('div'),
            {
                createComponent(options) {
                    switch (options.name) {
                        case 'component':
                            return new TestContentPart(options.id);
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            }
        );

        const cut = new DockviewGroupPanelModel(
            document.createElement('div'),
            dockviewComponent,
            'id',
            {},
            null as any
        );

        cut.locked = true;
        cut.header.hidden = true;

        expect(cut.toJSON()).toEqual({
            views: [],
            activeView: undefined,
            id: 'id',
            locked: true,
            hideHeader: true,
        });
    });

    test('headerPosition defaults to top', () => {
        const dockviewComponent = new DockviewComponent(
            document.createElement('div'),
            {
                createComponent(options) {
                    switch (options.name) {
                        case 'component':
                            return new TestContentPart(options.id);
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            }
        );

        const cut = new DockviewGroupPanelModel(
            document.createElement('div'),
            dockviewComponent,
            'id',
            {},
            null as any
        );

        expect(cut.headerPosition).toBe('top');
    });

    test('headerPosition setter applies correct CSS class', () => {
        const dockviewComponent = new DockviewComponent(
            document.createElement('div'),
            {
                createComponent(options) {
                    switch (options.name) {
                        case 'component':
                            return new TestContentPart(options.id);
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            }
        );

        const container = document.createElement('div');
        const cut = new DockviewGroupPanelModel(
            container,
            dockviewComponent,
            'id',
            {},
            null as any
        );

        expect(
            container.classList.contains('dv-groupview-header-top')
        ).toBeTruthy();

        cut.headerPosition = 'left';
        expect(
            container.classList.contains('dv-groupview-header-left')
        ).toBeTruthy();
        expect(
            container.classList.contains('dv-groupview-header-top')
        ).toBeFalsy();

        cut.headerPosition = 'bottom';
        expect(
            container.classList.contains('dv-groupview-header-bottom')
        ).toBeTruthy();
        expect(
            container.classList.contains('dv-groupview-header-left')
        ).toBeFalsy();

        cut.headerPosition = 'right';
        expect(
            container.classList.contains('dv-groupview-header-right')
        ).toBeTruthy();
        expect(
            container.classList.contains('dv-groupview-header-bottom')
        ).toBeFalsy();

        cut.headerPosition = 'top';
        expect(
            container.classList.contains('dv-groupview-header-top')
        ).toBeTruthy();
        expect(
            container.classList.contains('dv-groupview-header-right')
        ).toBeFalsy();
    });

    test('headerPosition setter sets correct direction on tabsContainer', () => {
        const dockviewComponent = new DockviewComponent(
            document.createElement('div'),
            {
                createComponent(options) {
                    switch (options.name) {
                        case 'component':
                            return new TestContentPart(options.id);
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            }
        );

        const cut = new DockviewGroupPanelModel(
            document.createElement('div'),
            dockviewComponent,
            'id',
            {},
            null as any
        );

        cut.headerPosition = 'top';
        expect(cut.tabsContainer.direction).toBe('horizontal');

        cut.headerPosition = 'bottom';
        expect(cut.tabsContainer.direction).toBe('horizontal');

        cut.headerPosition = 'left';
        expect(cut.tabsContainer.direction).toBe('vertical');

        cut.headerPosition = 'right';
        expect(cut.tabsContainer.direction).toBe('vertical');
    });

    test('toJSON() includes headerPosition when non-default', () => {
        const dockviewComponent = new DockviewComponent(
            document.createElement('div'),
            {
                createComponent(options) {
                    switch (options.name) {
                        case 'component':
                            return new TestContentPart(options.id);
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            }
        );

        const cut = new DockviewGroupPanelModel(
            document.createElement('div'),
            dockviewComponent,
            'id',
            {},
            null as any
        );

        // default 'top' should not be included
        expect(cut.toJSON()).toEqual({
            views: [],
            activeView: undefined,
            id: 'id',
        });

        cut.headerPosition = 'left';
        expect(cut.toJSON()).toEqual({
            views: [],
            activeView: undefined,
            id: 'id',
            headerPosition: 'left',
        });
    });

    test('headerPosition from constructor options', () => {
        const dockviewComponent = new DockviewComponent(
            document.createElement('div'),
            {
                createComponent(options) {
                    switch (options.name) {
                        case 'component':
                            return new TestContentPart(options.id);
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            }
        );

        const container = document.createElement('div');
        const cut = new DockviewGroupPanelModel(
            container,
            dockviewComponent,
            'id',
            { headerPosition: 'right' },
            null as any
        );

        expect(cut.headerPosition).toBe('right');
        expect(
            container.classList.contains('dv-groupview-header-right')
        ).toBeTruthy();
    });

    test("that openPanel with skipSetActive doesn't set panel to active", () => {
        const dockviewComponent = new DockviewComponent(
            document.createElement('div'),
            {
                createComponent(options) {
                    switch (options.name) {
                        case 'component':
                            return new TestContentPart(options.id);
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            }
        );

        const groupviewContainer = document.createElement('div');
        const cut = new DockviewGroupPanelModel(
            groupviewContainer,
            dockviewComponent,
            'id',
            {},
            null as any
        );
        const contentContainer = groupviewContainer
            .getElementsByClassName('dv-content-container')
            .item(0)!.childNodes;

        const panel1 = new TestPanel('id_1', panelApi);

        cut.openPanel(panel1);
        expect(contentContainer).toHaveLength(1);
        expect(contentContainer.item(0)).toBe(panel1.view.content.element);

        const panel2 = new TestPanel('id_2', panelApi);

        cut.openPanel(panel2);
        expect(contentContainer).toHaveLength(1);
        expect(contentContainer.item(0)).toBe(panel2.view.content.element);

        const panel3 = new TestPanel('id_2', panelApi);

        cut.openPanel(panel3, { skipSetActive: true });
        expect(contentContainer).toHaveLength(1);
        expect(contentContainer.item(0)).toBe(panel2.view.content.element);

        cut.openPanel(panel3);
        expect(contentContainer).toHaveLength(1);
        expect(contentContainer.item(0)).toBe(panel3.view.content.element);
    });

    test('swapping renderContainer keeps the active panel content mounted', () => {
        // Regression: swapping the render container on an already-populated
        // group (e.g. restoring a popout group from JSON, where the popout
        // window gets its own OverlayRenderContainer) used to leave the active
        // onlyWhenVisible panel's content detached, so nothing rendered.
        const dockviewComponent = new DockviewComponent(
            document.createElement('div'),
            {
                createComponent(options) {
                    switch (options.name) {
                        case 'component':
                            return new TestContentPart(options.id);
                        default:
                            throw new Error(`unsupported`);
                    }
                },
            }
        );

        const groupviewContainer = document.createElement('div');
        const cut = new DockviewGroupPanelModel(
            groupviewContainer,
            dockviewComponent,
            'id',
            {},
            null as any
        );
        const contentContainer = groupviewContainer
            .getElementsByClassName('dv-content-container')
            .item(0)!.childNodes;

        const panel1 = new TestPanel('id_1', panelApi);
        const panel2 = new TestPanel('id_2', panelApi);
        cut.openPanel(panel1);
        cut.openPanel(panel2); // panel2 active, its content mounted

        expect(contentContainer).toHaveLength(1);
        expect(contentContainer.item(0)).toBe(panel2.view.content.element);

        // Swap to a fresh render container (as the popout-restore path does).
        cut.renderContainer = new OverlayRenderContainer(
            document.createElement('div'),
            dockviewComponent
        );

        // The active panel's content is still mounted, not left detached.
        expect(contentContainer).toHaveLength(1);
        expect(contentContainer.item(0)).toBe(panel2.view.content.element);
    });

    test('that should not show drop target is external event', () => {
        const accessor = fromPartial<DockviewComponent>({
            id: 'testcomponentid',
            options: {},
            getPanel: jest.fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            onDidOptionsChange: jest.fn(),
        });

        const groupviewMock = jest.fn<Partial<DockviewGroupPanelModel>, []>(
            () => {
                return {
                    canDisplayOverlay: jest.fn(),
                };
            }
        );

        const groupView = new groupviewMock() as DockviewGroupPanelModel;

        const groupPanelMock = jest.fn<Partial<DockviewGroupPanelModel>, []>(
            () => {
                return {
                    id: 'testgroupid',
                    model: groupView,
                };
            }
        );

        const container = document.createElement('div');
        const cut = new DockviewGroupPanelModel(
            container,
            accessor,
            'groupviewid',
            {},
            new groupPanelMock() as DockviewGroupPanel
        );

        let counter = 0;

        cut.onUnhandledDragOver(() => {
            counter++;
        });

        const element = container
            .getElementsByClassName('dv-content-container')
            .item(0)! as HTMLElement;

        jest.spyOn(element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(element, 'offsetWidth', 'get').mockImplementation(() => 100);

        fireEvent.dragEnter(element);
        fireEvent.dragOver(element);

        expect(counter).toBe(1);

        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);
    });

    test('that the .locked behaviour is as', () => {
        const accessor = fromPartial<DockviewComponent>({
            id: 'testcomponentid',
            options: {},
            getPanel: jest.fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            onDidOptionsChange: jest.fn(),
        });

        const groupviewMock = jest.fn<Partial<DockviewGroupPanelModel>, []>(
            () => {
                return {
                    canDisplayOverlay: jest.fn(),
                };
            }
        );

        const groupView = new groupviewMock() as DockviewGroupPanelModel;

        const groupPanelMock = jest.fn<Partial<DockviewGroupPanelModel>, []>(
            () => {
                return {
                    id: 'testgroupid',
                    model: groupView,
                };
            }
        );

        const container = document.createElement('div');
        const cut = new DockviewGroupPanelModel(
            container,
            accessor,
            'groupviewid',
            {},
            new groupPanelMock() as DockviewGroupPanel
        );

        cut.onUnhandledDragOver((e) => {
            e.accept();
        });

        const element = container
            .getElementsByClassName('dv-content-container')
            .item(0)! as HTMLElement;

        jest.spyOn(element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(element, 'offsetWidth', 'get').mockImplementation(() => 100);

        function run(value: number) {
            fireEvent.dragEnter(element);
            fireEvent(
                element,
                createOffsetDragOverEvent({ clientX: value, clientY: value })
            );
        }

        // base case - not locked
        cut.locked = false;
        run(10);
        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(1);
        fireEvent.dragEnd(element);

        // special case - locked with no possible target
        cut.locked = 'no-drop-target';
        run(10);
        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);
        fireEvent.dragEnd(element);

        // standard locked - only show if not center target
        cut.locked = true;
        run(10);
        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(1);
        fireEvent.dragEnd(element);

        // standard locked but for center target - expect not shown
        cut.locked = true;
        run(25);
        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);
        fireEvent.dragEnd(element);
    });

    test('that should show drop target if dropping on self', () => {
        const accessor = fromPartial<DockviewComponent>({
            id: 'testcomponentid',
            options: {},
            getPanel: jest.fn(),
            doSetGroupActive: jest.fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            overlayRenderContainer: new OverlayRenderContainer(
                document.createElement('div'),
                fromPartial<DockviewComponent>({})
            ),
            onDidOptionsChange: jest.fn(),
        });

        const groupView = fromPartial<DockviewGroupPanelModel>({
            canDisplayOverlay: jest.fn(),
        });

        const groupPanelMock = jest.fn<Partial<DockviewGroupPanel>, []>(() => {
            return {
                id: 'testgroupid',
                model: groupView,
            };
        });

        const container = document.createElement('div');
        const cut = new DockviewGroupPanelModel(
            container,
            accessor,
            'groupviewid',
            {},
            new groupPanelMock() as DockviewGroupPanel
        );

        let counter = 0;

        cut.onUnhandledDragOver(() => {
            counter++;
        });

        cut.openPanel(new TestPanel('panel1', panelApi));

        const element = container
            .getElementsByClassName('dv-content-container')
            .item(0)! as HTMLElement;

        jest.spyOn(element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(element, 'offsetWidth', 'get').mockImplementation(() => 100);

        LocalSelectionTransfer.getInstance().setData(
            [new PanelTransfer('testcomponentid', 'groupviewid', 'panel1')],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(element);
        fireEvent.dragOver(element);

        expect(counter).toBe(0);

        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(1);
    });

    test('that should allow drop when dropping on self for same component id', () => {
        const accessor = fromPartial<DockviewComponent>({
            id: 'testcomponentid',
            options: {},
            getPanel: jest.fn(),
            doSetGroupActive: jest.fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            overlayRenderContainer: new OverlayRenderContainer(
                document.createElement('div'),
                fromPartial<DockviewComponent>({})
            ),
            onDidOptionsChange: jest.fn(),
        });

        const groupviewMock = jest.fn<Partial<DockviewGroupPanelModel>, []>(
            () => {
                return {
                    canDisplayOverlay: jest.fn(),
                };
            }
        );

        const groupView = new groupviewMock() as DockviewGroupPanelModel;

        const groupPanelMock = jest.fn<Partial<DockviewGroupPanel>, []>(() => {
            return {
                id: 'testgroupid',
                model: groupView,
            };
        });

        const container = document.createElement('div');
        const cut = new DockviewGroupPanelModel(
            container,
            accessor,
            'groupviewid',
            {},
            new groupPanelMock() as DockviewGroupPanel
        );

        let counter = 0;

        cut.onUnhandledDragOver(() => {
            counter++;
        });

        cut.openPanel(new TestPanel('panel1', panelApi));
        cut.openPanel(new TestPanel('panel2', panelApi));

        const element = container
            .getElementsByClassName('dv-content-container')
            .item(0) as HTMLElement;

        jest.spyOn(element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(element, 'offsetWidth', 'get').mockImplementation(() => 100);

        LocalSelectionTransfer.getInstance().setData(
            [new PanelTransfer('testcomponentid', 'groupviewid', 'panel1')],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(element);
        fireEvent.dragOver(element);

        expect(counter).toBe(0);

        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(1);
    });

    // Regression test for #1242: dropping a tab-group chip on the edge of
    // its own group must fire onMove (so the layout splits). Previously
    // the handler short-circuited any panelId === null drop on self,
    // which silently swallowed tab-group chip drops on the same group.
    test('that tab group chip drop on self at edge fires onMove with tabGroupId', () => {
        const accessor = fromPartial<DockviewComponent>({
            id: 'testcomponentid',
            options: {},
            getPanel: jest.fn(),
            doSetGroupActive: jest.fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            overlayRenderContainer: new OverlayRenderContainer(
                document.createElement('div'),
                fromPartial<DockviewComponent>({})
            ),
            onDidOptionsChange: jest.fn(),
        });

        const groupviewMock = jest.fn<Partial<DockviewGroupPanelModel>, []>(
            () => {
                return {
                    canDisplayOverlay: jest.fn(),
                };
            }
        );

        const groupView = new groupviewMock() as DockviewGroupPanelModel;

        const groupPanelMock = jest.fn<Partial<DockviewGroupPanel>, []>(() => {
            return {
                id: 'testgroupid',
                model: groupView,
            };
        });

        const container = document.createElement('div');
        const cut = new DockviewGroupPanelModel(
            container,
            accessor,
            'groupviewid',
            {},
            new groupPanelMock() as DockviewGroupPanel
        );

        cut.openPanel(new TestPanel('panel1', panelApi));

        const element = container
            .getElementsByClassName('dv-content-container')
            .item(0) as HTMLElement;

        jest.spyOn(element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(element, 'offsetWidth', 'get').mockImplementation(() => 100);

        // Tab-group chip drag: panelId is null, tabGroupId identifies the
        // moving subset, groupId matches the group we are dropping on.
        LocalSelectionTransfer.getInstance().setData(
            [new PanelTransfer('testcomponentid', 'groupviewid', null, 'tg-1')],
            PanelTransfer.prototype
        );

        const moveEvents: Array<{
            target: string;
            tabGroupId?: string;
            itemId?: string;
        }> = [];
        cut.onMove((e) => {
            moveEvents.push({
                target: e.target,
                tabGroupId: e.tabGroupId,
                itemId: e.itemId,
            });
        });

        fireEvent.dragEnter(element);
        // Position cursor near the right edge so the drop position
        // resolves to 'right' (split).
        fireEvent(
            element,
            createOffsetDragOverEvent({ clientX: 95, clientY: 50 })
        );

        const target = element.querySelector(
            '.dv-drop-target-dropzone'
        ) as HTMLElement;
        expect(target).not.toBeNull();

        jest.spyOn(target, 'clientHeight', 'get').mockImplementation(() => 100);
        jest.spyOn(target, 'clientWidth', 'get').mockImplementation(() => 100);

        // Re-fire with the dropzone target so the directional zone is
        // computed against the dropzone's geometry.
        fireEvent(
            target,
            createOffsetDragOverEvent({ clientX: 95, clientY: 50 })
        );
        fireEvent.drop(target);

        expect(moveEvents).toHaveLength(1);
        expect(moveEvents[0].target).toBe('right');
        expect(moveEvents[0].tabGroupId).toBe('tg-1');
        expect(moveEvents[0].itemId).toBeUndefined();

        LocalSelectionTransfer.getInstance().clearData(PanelTransfer.prototype);
    });

    // Companion regression test: full-group drag on self (no tabGroupId)
    // must still be a no-op so we don't regress the original behavior.
    test('that full group drop on self at edge does not fire onMove', () => {
        const accessor = fromPartial<DockviewComponent>({
            id: 'testcomponentid',
            options: {},
            getPanel: jest.fn(),
            doSetGroupActive: jest.fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            overlayRenderContainer: new OverlayRenderContainer(
                document.createElement('div'),
                fromPartial<DockviewComponent>({})
            ),
            onDidOptionsChange: jest.fn(),
        });

        const groupviewMock = jest.fn<Partial<DockviewGroupPanelModel>, []>(
            () => {
                return {
                    canDisplayOverlay: jest.fn(),
                };
            }
        );

        const groupView = new groupviewMock() as DockviewGroupPanelModel;

        const groupPanelMock = jest.fn<Partial<DockviewGroupPanel>, []>(() => {
            return {
                id: 'testgroupid',
                model: groupView,
            };
        });

        const container = document.createElement('div');
        const cut = new DockviewGroupPanelModel(
            container,
            accessor,
            'groupviewid',
            {},
            new groupPanelMock() as DockviewGroupPanel
        );

        cut.openPanel(new TestPanel('panel1', panelApi));

        const element = container
            .getElementsByClassName('dv-content-container')
            .item(0) as HTMLElement;

        jest.spyOn(element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(element, 'offsetWidth', 'get').mockImplementation(() => 100);

        // Full-group drag: panelId null AND tabGroupId undefined.
        LocalSelectionTransfer.getInstance().setData(
            [new PanelTransfer('testcomponentid', 'groupviewid', null)],
            PanelTransfer.prototype
        );

        const moveEvents: unknown[] = [];
        cut.onMove((e) => {
            moveEvents.push(e);
        });

        fireEvent.dragEnter(element);
        fireEvent(
            element,
            createOffsetDragOverEvent({ clientX: 95, clientY: 50 })
        );

        const target = element.querySelector(
            '.dv-drop-target-dropzone'
        ) as HTMLElement;
        if (target) {
            jest.spyOn(target, 'clientHeight', 'get').mockImplementation(
                () => 100
            );
            jest.spyOn(target, 'clientWidth', 'get').mockImplementation(
                () => 100
            );
            fireEvent(
                target,
                createOffsetDragOverEvent({ clientX: 95, clientY: 50 })
            );
            fireEvent.drop(target);
        }

        expect(moveEvents).toHaveLength(0);

        LocalSelectionTransfer.getInstance().clearData(PanelTransfer.prototype);
    });

    test('that should not allow drop when not dropping for different component id', () => {
        const accessor = fromPartial<DockviewComponent>({
            id: 'testcomponentid',
            options: {},
            getPanel: jest.fn(),
            doSetGroupActive: jest.fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            overlayRenderContainer: new OverlayRenderContainer(
                document.createElement('div'),
                fromPartial<DockviewComponent>({})
            ),
            onDidOptionsChange: jest.fn(),
        });

        const groupviewMock = jest.fn<Partial<DockviewGroupPanelModel>, []>(
            () => {
                return {
                    canDisplayOverlay: jest.fn(),
                };
            }
        );

        const groupView = new groupviewMock() as DockviewGroupPanelModel;

        const groupPanelMock = jest.fn<Partial<DockviewGroupPanel>, []>(() => {
            return {
                id: 'testgroupid',
                model: groupView,
            };
        });

        const container = document.createElement('div');
        const cut = new DockviewGroupPanelModel(
            container,
            accessor,
            'groupviewid',
            {},
            new groupPanelMock() as DockviewGroupPanel
        );

        let counter = 0;

        cut.onUnhandledDragOver(() => {
            counter++;
        });

        cut.openPanel(new TestPanel('panel1', panelApi));
        cut.openPanel(new TestPanel('panel2', panelApi));

        const element = container
            .getElementsByClassName('dv-content-container')
            .item(0) as HTMLElement;

        jest.spyOn(element, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(element, 'offsetWidth', 'get').mockImplementation(() => 100);

        LocalSelectionTransfer.getInstance().setData(
            [new PanelTransfer('anothercomponentid', 'groupviewid', 'panel1')],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(element);
        fireEvent.dragOver(element);

        expect(counter).toBe(1);

        expect(
            element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);
    });

    test('that the watermark is removed when dispose is called', () => {
        const groupviewMock = jest.fn<Partial<DockviewGroupPanelModel>, []>(
            () => {
                return {
                    canDisplayOverlay: jest.fn(),
                };
            }
        );

        const groupView = new groupviewMock() as DockviewGroupPanelModel;

        const groupPanelMock = jest.fn<Partial<DockviewGroupPanel>, []>(() => {
            return {
                id: 'testgroupid',
                model: groupView,
            };
        });

        const container = document.createElement('div');

        const cut = new DockviewGroupPanelModel(
            container,
            dockview,
            'groupviewid',
            {},
            new groupPanelMock() as DockviewGroupPanel
        );

        cut.initialize();

        expect(
            container.getElementsByClassName('watermark-test-container')
        ).toHaveLength(1);

        cut.dispose();

        expect(
            container.getElementsByClassName('watermark-test-container')
        ).toHaveLength(0);
    });

    test('that watermark is added', () => {
        const groupviewMock = jest.fn<Partial<DockviewGroupPanelModel>, []>(
            () => {
                return {
                    canDisplayOverlay: jest.fn(),
                };
            }
        );

        const groupView = new groupviewMock() as DockviewGroupPanelModel;

        const groupPanelMock = jest.fn<Partial<DockviewGroupPanel>, []>(() => {
            return {
                id: 'testgroupid',
                model: groupView,
            };
        });

        const container = document.createElement('div');

        const cut = new DockviewGroupPanelModel(
            container,
            dockview,
            'groupviewid',
            {},
            new groupPanelMock() as DockviewGroupPanel
        );

        cut.initialize();

        expect(
            container.getElementsByClassName('watermark-test-container')
        ).toHaveLength(1);

        cut.openPanel(new TestPanel('panel1', panelApi));

        expect(
            container.getElementsByClassName('watermark-test-container')
        ).toHaveLength(0);
        expect(
            container.getElementsByClassName('dv-tabs-and-actions-container')
        ).toHaveLength(1);

        cut.openPanel(new TestPanel('panel2', panelApi));

        expect(
            container.getElementsByClassName('watermark-test-container')
        ).toHaveLength(0);

        cut.removePanel('panel1');

        expect(
            container.getElementsByClassName('watermark-test-container')
        ).toHaveLength(0);

        cut.removePanel('panel2');

        expect(
            container.getElementsByClassName('watermark-test-container')
        ).toHaveLength(1);

        cut.openPanel(new TestPanel('panel1', panelApi));

        expect(
            container.getElementsByClassName('watermark-test-container')
        ).toHaveLength(0);
    });

    describe('tab groups', () => {
        test('createTabGroup creates a new tab group', () => {
            const tabGroup = groupview.model.createTabGroup({
                label: 'Frontend',
                color: 'blue',
            });

            expect(tabGroup.id).toBeDefined();
            expect(tabGroup.label).toBe('Frontend');
            expect(tabGroup.color).toBe('blue');
            expect(tabGroup.collapsed).toBe(false);
            expect(tabGroup.panelIds).toEqual([]);

            expect(groupview.model.getTabGroups()).toHaveLength(1);
            expect(groupview.model.getTabGroups()[0]).toBe(tabGroup);
        });

        test('createTabGroup with collapsed option creates collapsed group without firing onDidTabGroupCollapsedChange', () => {
            const collapseEvents: any[] = [];
            groupview.model.onDidTabGroupCollapsedChange((e) =>
                collapseEvents.push(e)
            );

            const tabGroup = groupview.model.createTabGroup({
                label: 'Born collapsed',
                color: 'red',
                collapsed: true,
            });

            expect(tabGroup.collapsed).toBe(true);
            // No transition occurred; chip / tabs render collapsed from the start.
            expect(collapseEvents).toHaveLength(0);
        });

        test('createTabGroup fires onDidCreateTabGroup', () => {
            const events: any[] = [];
            groupview.model.onDidCreateTabGroup((e) => events.push(e));

            const tabGroup = groupview.model.createTabGroup({ label: 'Test' });

            expect(events).toHaveLength(1);
            expect(events[0].tabGroup).toBe(tabGroup);
        });

        test('addPanelToTabGroup adds panel to group', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            groupview.model.openPanel(panel1);

            const tabGroup = groupview.model.createTabGroup();
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel1');

            expect(tabGroup.panelIds).toEqual(['panel1']);
        });

        test('addPanelToTabGroup fires onDidAddPanelToTabGroup', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            groupview.model.openPanel(panel1);

            const tabGroup = groupview.model.createTabGroup();
            const events: any[] = [];
            groupview.model.onDidAddPanelToTabGroup((e) => events.push(e));

            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel1');

            expect(events).toHaveLength(1);
            expect(events[0].tabGroup).toBe(tabGroup);
            expect(events[0].panelId).toBe('panel1');
        });

        test('addPanelToTabGroup at specific index', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            const panel3 = new TestPanel('panel3', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);
            groupview.model.openPanel(panel3);

            const tabGroup = groupview.model.createTabGroup();
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel1');
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel2');
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel3', 1);

            expect(tabGroup.panelIds).toEqual(['panel1', 'panel3', 'panel2']);
        });

        test('addPanelToTabGroup moves panel between groups', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            groupview.model.openPanel(panel1);

            const group1 = groupview.model.createTabGroup({ label: 'G1' });
            const group2 = groupview.model.createTabGroup({ label: 'G2' });

            groupview.model.addPanelToTabGroup(group1.id, 'panel1');
            expect(group1.panelIds).toEqual(['panel1']);

            groupview.model.addPanelToTabGroup(group2.id, 'panel1');
            expect(group1.panelIds).toEqual([]);
            expect(group2.panelIds).toEqual(['panel1']);
        });

        test('removePanelFromTabGroup removes panel from its group', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            groupview.model.openPanel(panel1);

            const tabGroup = groupview.model.createTabGroup();
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel1');
            groupview.model.removePanelFromTabGroup('panel1');

            expect(
                groupview.model.getTabGroupForPanel('panel1')
            ).toBeUndefined();
        });

        test('removePanelFromTabGroup fires onDidRemovePanelFromTabGroup', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            groupview.model.openPanel(panel1);

            const tabGroup = groupview.model.createTabGroup();
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel1');

            const events: any[] = [];
            groupview.model.onDidRemovePanelFromTabGroup((e) => events.push(e));

            groupview.model.removePanelFromTabGroup('panel1');

            expect(events).toHaveLength(1);
            expect(events[0].tabGroup).toBe(tabGroup);
            expect(events[0].panelId).toBe('panel1');
        });

        test('auto-destroy empty tab group when last panel removed', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            groupview.model.openPanel(panel1);

            const tabGroup = groupview.model.createTabGroup();
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel1');

            const destroyEvents: any[] = [];
            groupview.model.onDidDestroyTabGroup((e) => destroyEvents.push(e));

            groupview.model.removePanelFromTabGroup('panel1');

            expect(groupview.model.getTabGroups()).toHaveLength(0);
            expect(destroyEvents).toHaveLength(1);
        });

        test('dissolveTabGroup removes all panels from group', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);

            const tabGroup = groupview.model.createTabGroup();
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel1');
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel2');

            groupview.model.dissolveTabGroup(tabGroup.id);

            expect(groupview.model.getTabGroups()).toHaveLength(0);
            // Panels still exist in the model
            expect(groupview.model.panels).toHaveLength(2);
        });

        test('getTabGroupForPanel returns correct group', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);

            const tabGroup = groupview.model.createTabGroup({
                label: 'Test',
            });
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel1');

            expect(groupview.model.getTabGroupForPanel('panel1')).toBe(
                tabGroup
            );
            expect(
                groupview.model.getTabGroupForPanel('panel2')
            ).toBeUndefined();
        });

        test('panel removed from model also removed from tab group', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);

            const tabGroup = groupview.model.createTabGroup();
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel1');
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel2');

            // Remove panel1 from the model entirely
            groupview.model.removePanel('panel1');

            expect(tabGroup.panelIds).toEqual(['panel2']);
        });

        test('label and color update fires onDidTabGroupChange', () => {
            const tabGroup = groupview.model.createTabGroup({
                label: 'Test',
                color: 'blue',
            });

            const events: any[] = [];
            groupview.model.onDidTabGroupChange((e) => events.push(e));

            tabGroup.setLabel('Updated');
            tabGroup.setColor('red');

            expect(events).toHaveLength(2);
            expect(events[0].tabGroup).toBe(tabGroup);
        });

        test('tab groups are disposed when model is disposed', () => {
            const tabGroup = groupview.model.createTabGroup({
                label: 'Test',
            });
            const panel1 = new TestPanel('panel1', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel1');

            let destroyed = false;
            tabGroup.onDidDestroy(() => {
                destroyed = true;
            });

            groupview.model.dispose();

            expect(destroyed).toBe(true);
        });

        test('toJSON includes tabGroups when groups exist', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);

            const tabGroup = groupview.model.createTabGroup({
                label: 'Group A',
                color: 'blue',
            });
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel1');
            groupview.model.addPanelToTabGroup(tabGroup.id, 'panel2');
            tabGroup.collapse();

            const json = groupview.model.toJSON();
            expect(json.tabGroups).toBeDefined();
            expect(json.tabGroups!).toHaveLength(1);
            expect(json.tabGroups![0].id).toBe(tabGroup.id);
            expect(json.tabGroups![0].label).toBe('Group A');
            expect(json.tabGroups![0].color).toBe('blue');
            expect(json.tabGroups![0].collapsed).toBe(true);
            expect(json.tabGroups![0].panelIds).toEqual(['panel1', 'panel2']);
        });

        test('toJSON omits tabGroups when no groups exist', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            groupview.model.openPanel(panel1);

            const json = groupview.model.toJSON();
            expect(json.tabGroups).toBeUndefined();
        });

        test('restoreTabGroups recreates groups from serialized data', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            const panel3 = new TestPanel('panel3', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);
            groupview.model.openPanel(panel3);

            groupview.model.restoreTabGroups([
                {
                    id: 'tg-restored',
                    label: 'Restored',
                    color: 'red',
                    collapsed: true,
                    panelIds: ['panel1', 'panel2'],
                },
            ]);

            const groups = groupview.model.getTabGroups();
            expect(groups).toHaveLength(1);
            expect(groups[0].id).toBe('tg-restored');
            expect(groups[0].label).toBe('Restored');
            expect(groups[0].color).toBe('red');
            expect(groups[0].collapsed).toBe(true);
            expect(groups[0].panelIds).toEqual(['panel1', 'panel2']);
        });

        test('restoreTabGroups drops orphaned panel references', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            groupview.model.openPanel(panel1);

            groupview.model.restoreTabGroups([
                {
                    id: 'tg-orphan',
                    color: 'green',
                    collapsed: false,
                    panelIds: ['panel1', 'non-existent-panel'],
                },
            ]);

            const groups = groupview.model.getTabGroups();
            expect(groups).toHaveLength(1);
            expect(groups[0].panelIds).toEqual(['panel1']);
        });

        test('restoreTabGroups with no valid panels auto-destroys group', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            groupview.model.openPanel(panel1);

            groupview.model.restoreTabGroups([
                {
                    id: 'tg-empty',
                    color: 'grey',
                    collapsed: false,
                    panelIds: ['non-existent-a', 'non-existent-b'],
                },
            ]);

            const groups = groupview.model.getTabGroups();
            expect(groups).toHaveLength(0);
        });

        test('collapsing all tab groups shows watermark', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);

            const tg = groupview.model.createTabGroup({ label: 'All' });
            groupview.model.addPanelToTabGroup(tg.id, 'panel1');
            groupview.model.addPanelToTabGroup(tg.id, 'panel2');

            expect(groupview.model.hasWatermark).toBe(false);
            expect(groupview.model.activePanel).toBeDefined();

            tg.collapse();

            expect(groupview.model.activePanel).toBeUndefined();
            expect(groupview.model.hasWatermark).toBe(true);
        });

        test('expanding a tab group removes watermark and activates panel', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);

            const tg = groupview.model.createTabGroup({ label: 'All' });
            groupview.model.addPanelToTabGroup(tg.id, 'panel1');
            groupview.model.addPanelToTabGroup(tg.id, 'panel2');

            tg.collapse();
            expect(groupview.model.hasWatermark).toBe(true);

            tg.expand();
            expect(groupview.model.hasWatermark).toBe(false);
            expect(groupview.model.activePanel).toBeDefined();
            expect(groupview.model.activePanel!.id).toBe('panel1');
        });

        test('collapsing group with active panel activates panel in another group', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);

            const tg1 = groupview.model.createTabGroup({ label: 'G1' });
            const tg2 = groupview.model.createTabGroup({ label: 'G2' });
            groupview.model.addPanelToTabGroup(tg1.id, 'panel1');
            groupview.model.addPanelToTabGroup(tg2.id, 'panel2');

            // panel2 should be active (last opened)
            expect(groupview.model.activePanel?.id).toBe('panel2');

            tg2.collapse();

            // Should activate panel1 from the non-collapsed group
            expect(groupview.model.activePanel?.id).toBe('panel1');
            expect(groupview.model.hasWatermark).toBe(false);
        });

        test('collapsing all groups then expanding one restores correctly', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);

            const tg1 = groupview.model.createTabGroup({ label: 'G1' });
            const tg2 = groupview.model.createTabGroup({ label: 'G2' });
            groupview.model.addPanelToTabGroup(tg1.id, 'panel1');
            groupview.model.addPanelToTabGroup(tg2.id, 'panel2');

            tg1.collapse();
            tg2.collapse();

            expect(groupview.model.hasWatermark).toBe(true);
            expect(groupview.model.activePanel).toBeUndefined();

            tg2.expand();

            expect(groupview.model.hasWatermark).toBe(false);
            expect(groupview.model.activePanel?.id).toBe('panel2');
        });

        test('setActive selects first non-collapsed panel as fallback', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            const panel3 = new TestPanel('panel3', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);
            groupview.model.openPanel(panel3);

            const tg1 = groupview.model.createTabGroup({ label: 'G1' });
            const tg2 = groupview.model.createTabGroup({ label: 'G2' });
            groupview.model.addPanelToTabGroup(tg1.id, 'panel1');
            groupview.model.addPanelToTabGroup(tg1.id, 'panel2');
            groupview.model.addPanelToTabGroup(tg2.id, 'panel3');

            // Collapse tg1 (which contains panel1 and panel2)
            tg1.collapse();

            // Clear the active panel to simulate the setActive fallback path
            (groupview.model as any)._activePanel = undefined;

            // Force setActive to re-evaluate
            groupview.model.setActive(true, true);

            // panel3 is in a non-collapsed group, so it should be selected
            expect(groupview.model.activePanel?.id).toBe('panel3');
        });

        test('setActive skips all panels when all groups are collapsed', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);

            const tg = groupview.model.createTabGroup({ label: 'All' });
            groupview.model.addPanelToTabGroup(tg.id, 'panel1');
            groupview.model.addPanelToTabGroup(tg.id, 'panel2');

            tg.collapse();

            // Clear active panel
            (groupview.model as any)._activePanel = undefined;

            groupview.model.setActive(true, true);

            // No non-collapsed panel exists, so no fallback
            expect(groupview.model.activePanel).toBeUndefined();
        });

        test('setActive selects ungrouped panel over collapsed group panel', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);

            // panel1 is in a collapsed group, panel2 is ungrouped
            const tg = groupview.model.createTabGroup({ label: 'Collapsed' });
            groupview.model.addPanelToTabGroup(tg.id, 'panel1');
            tg.collapse();

            (groupview.model as any)._activePanel = undefined;

            groupview.model.setActive(true, true);

            // panel2 is ungrouped (no tab group) so it qualifies as a fallback
            expect(groupview.model.activePanel?.id).toBe('panel2');
        });

        test('toJSON/restoreTabGroups round-trip preserves state', () => {
            const panel1 = new TestPanel('panel1', panelApi);
            const panel2 = new TestPanel('panel2', panelApi);
            groupview.model.openPanel(panel1);
            groupview.model.openPanel(panel2);

            const tg1 = groupview.model.createTabGroup({
                label: 'G1',
                color: 'purple',
            });
            groupview.model.addPanelToTabGroup(tg1.id, 'panel1');

            const tg2 = groupview.model.createTabGroup({
                label: 'G2',
                color: 'cyan',
            });
            groupview.model.addPanelToTabGroup(tg2.id, 'panel2');
            tg2.collapse();

            const json = groupview.model.toJSON();
            expect(json.tabGroups!).toHaveLength(2);

            groupview.model.dissolveTabGroup(tg1.id);
            groupview.model.dissolveTabGroup(tg2.id);
            expect(groupview.model.getTabGroups()).toHaveLength(0);

            groupview.model.restoreTabGroups(json.tabGroups!);
            const restored = groupview.model.getTabGroups();
            expect(restored).toHaveLength(2);
            expect(restored[0].label).toBe('G1');
            expect(restored[0].color).toBe('purple');
            expect(restored[0].collapsed).toBe(false);
            expect(restored[0].panelIds).toEqual(['panel1']);
            expect(restored[1].label).toBe('G2');
            expect(restored[1].color).toBe('cyan');
            expect(restored[1].collapsed).toBe(true);
            expect(restored[1].panelIds).toEqual(['panel2']);
        });
    });

    describe('content drop-target zones (mouse + touch parity)', () => {
        // Regression: when a group's location changes (grid → floating /
        // popout / edge), the content drop target's accepted zones must be
        // updated on both the HTML5 dropTarget (mouse path) and the
        // pointerDropTarget (touch path). Without the parallel call, touch
        // drops on a non-grid group's content area would land in zones the
        // HTML5 path forbids, giving different layout outcomes between input
        // methods.
        function getContentTargets(group: DockviewGroupPanel): {
            dropTarget: { setTargetZones: jest.Mock };
            pointerDropTarget: { setTargetZones: jest.Mock };
        } {
            const cc = (group.model as any).contentContainer;
            // Spy on the bound methods so we can observe each call without
            // breaking the underlying behaviour.
            const dropSpy = jest.spyOn(cc.dropTarget, 'setTargetZones');
            const pointerSpy = jest.spyOn(
                cc.pointerDropTarget,
                'setTargetZones'
            );
            return {
                dropTarget: { setTargetZones: dropSpy as any as jest.Mock },
                pointerDropTarget: {
                    setTargetZones: pointerSpy as any as jest.Mock,
                },
            };
        }

        test.each([
            ['grid', ['top', 'bottom', 'left', 'right', 'center']],
            // floating + popout host their own nested gridview, so they accept
            // all zones (edge drops split the window). Edge groups are
            // structural and stay center-only.
            ['floating', ['top', 'bottom', 'left', 'right', 'center']],
            ['popout', ['top', 'bottom', 'left', 'right', 'center']],
            ['edge', ['center']],
        ] as const)('location=%s applies zones to BOTH dropTarget and pointerDropTarget', (locationType, expectedZones) => {
            const { dropTarget, pointerDropTarget } =
                getContentTargets(groupview);

            groupview.model.location = { type: locationType } as any;

            expect(dropTarget.setTargetZones).toHaveBeenCalledWith(
                expectedZones
            );
            expect(pointerDropTarget.setTargetZones).toHaveBeenCalledWith(
                expectedZones
            );
        });
    });
});
