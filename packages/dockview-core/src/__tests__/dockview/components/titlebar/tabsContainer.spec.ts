import {
    LocalSelectionTransfer,
    PanelTransfer,
} from '../../../../dnd/dataTransfer';
import { TabsContainer } from '../../../../dockview/components/titlebar/tabsContainer';
import { DockviewComponent } from '../../../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../../../dockview/dockviewGroupPanel';
import { DockviewGroupPanelModel } from '../../../../dockview/dockviewGroupPanelModel';
import { fireEvent } from '@testing-library/dom';
import { TestPanel } from '../../dockviewGroupPanelModel.spec';
import { IDockviewPanel } from '../../../../dockview/dockviewPanel';
import { fromPartial } from '@total-typescript/shoehorn';
import { DockviewPanelApi } from '../../../../api/dockviewPanelApi';
import { Emitter } from '../../../../events';

describe('tabsContainer', () => {
    test('that an external event does not render a drop target and calls through to the group mode', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
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
                model: groupView,
                api: fromPartial<DockviewGroupPanel['api']>({
                    locked: false,
                }),
            };
        });

        const groupPanel = new groupPanelMock() as DockviewGroupPanel;

        const cut = new TabsContainer(accessor, groupPanel);

        const emptySpace = cut.element
            .getElementsByClassName('dv-void-container')
            .item(0) as HTMLElement;

        if (!emptySpace!) {
            fail('element not found');
        }

        jest.spyOn(emptySpace!, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(emptySpace!, 'offsetWidth', 'get').mockImplementation(
            () => 100
        );

        fireEvent.dragEnter(emptySpace!);
        fireEvent.dragOver(emptySpace!);

        expect(groupView.canDisplayOverlay).toHaveBeenCalled();

        expect(
            cut.element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);
    });

    test('that a drag over event from another tab should render a drop target', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            id: 'testcomponentid',
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
        });

        const dropTargetContainer = document.createElement('div');

        const groupView = fromPartial<DockviewGroupPanelModel>({
            canDisplayOverlay: jest.fn(),
            // dropTargetContainer: new DropTargetAnchorContainer(
            //     dropTargetContainer
            // ),
        });

        const groupPanelMock = jest.fn<Partial<DockviewGroupPanel>, []>(() => {
            return {
                id: 'testgroupid',
                model: groupView,
                panels: [],
                api: fromPartial<DockviewGroupPanel['api']>({
                    locked: false,
                }),
            };
        });

        const groupPanel = new groupPanelMock() as DockviewGroupPanel;

        const cut = new TabsContainer(accessor, groupPanel);

        const emptySpace = cut.element
            .getElementsByClassName('dv-void-container')
            .item(0) as HTMLElement;

        if (!emptySpace!) {
            fail('element not found');
        }

        jest.spyOn(emptySpace!, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(emptySpace!, 'offsetWidth', 'get').mockImplementation(
            () => 100
        );

        LocalSelectionTransfer.getInstance().setData(
            [
                new PanelTransfer(
                    'testcomponentid',
                    'anothergroupid',
                    'anotherpanelid'
                ),
            ],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(emptySpace!);
        fireEvent.dragOver(emptySpace!);

        expect(groupView.canDisplayOverlay).toHaveBeenCalledTimes(0);

        expect(
            cut.element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(1);
        // expect(
        //     dropTargetContainer.getElementsByClassName('dv-drop-target-anchor')
        //         .length
        // ).toBe(1);
    });

    test('that dropping over the empty space should render a drop target', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            id: 'testcomponentid',
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
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
                panels: [],
                api: fromPartial<DockviewGroupPanel['api']>({
                    locked: false,
                }),
            };
        });

        const groupPanel = new groupPanelMock() as DockviewGroupPanel;

        const cut = new TabsContainer(accessor, groupPanel);

        cut.openPanel(new TestPanel('panel1', jest.fn() as any));
        cut.openPanel(new TestPanel('panel2', jest.fn() as any));

        const emptySpace = cut.element
            .getElementsByClassName('dv-void-container')
            .item(0) as HTMLElement;

        if (!emptySpace!) {
            fail('element not found');
        }

        jest.spyOn(emptySpace!, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(emptySpace!, 'offsetWidth', 'get').mockImplementation(
            () => 100
        );

        LocalSelectionTransfer.getInstance().setData(
            [new PanelTransfer('testcomponentid', 'anothergroupid', 'panel2')],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(emptySpace!);
        fireEvent.dragOver(emptySpace!);

        expect(groupView.canDisplayOverlay).toHaveBeenCalledTimes(0);

        expect(
            cut.element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(1);
    });

    test.each([
        true,
        'no-drop-target' as const,
    ])('that dropping over the empty space does not render a drop target when group is locked=%p (regression #990)', (lockedValue) => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            id: 'testcomponentid',
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
        });

        const groupView = fromPartial<DockviewGroupPanelModel>({
            canDisplayOverlay: jest.fn(),
        });

        const groupPanel = fromPartial<DockviewGroupPanel>({
            id: 'testgroupid',
            model: groupView,
            panels: [],
            api: fromPartial<DockviewGroupPanel['api']>({
                locked: lockedValue,
            }),
        });

        const cut = new TabsContainer(accessor, groupPanel);

        cut.openPanel(new TestPanel('panel1', jest.fn() as any));
        cut.openPanel(new TestPanel('panel2', jest.fn() as any));

        const emptySpace = cut.element
            .getElementsByClassName('dv-void-container')
            .item(0) as HTMLElement;

        if (!emptySpace!) {
            fail('element not found');
        }

        jest.spyOn(emptySpace!, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(emptySpace!, 'offsetWidth', 'get').mockImplementation(
            () => 100
        );

        // an internal same-accessor drag: the void container must honour the
        // group's locked state rather than short-circuiting to `return true`.
        LocalSelectionTransfer.getInstance().setData(
            [new PanelTransfer('testcomponentid', 'anothergroupid', 'panel1')],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(emptySpace!);
        fireEvent.dragOver(emptySpace!);

        expect(
            cut.element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);
    });

    test('that dropping the first tab should render a drop target', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            id: 'testcomponentid',
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
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
                panels: [],
                api: fromPartial<DockviewGroupPanel['api']>({
                    locked: false,
                }),
            };
        });

        const groupPanel = new groupPanelMock() as DockviewGroupPanel;

        const cut = new TabsContainer(accessor, groupPanel);

        cut.openPanel(new TestPanel('panel1', jest.fn() as any));
        cut.openPanel(new TestPanel('panel2', jest.fn() as any));

        const emptySpace = cut.element
            .getElementsByClassName('dv-void-container')
            .item(0) as HTMLElement;

        if (!emptySpace!) {
            fail('element not found');
        }

        jest.spyOn(emptySpace!, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(emptySpace!, 'offsetWidth', 'get').mockImplementation(
            () => 100
        );

        LocalSelectionTransfer.getInstance().setData(
            [new PanelTransfer('testcomponentid', 'anothergroupid', 'panel1')],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(emptySpace!);
        fireEvent.dragOver(emptySpace!);

        expect(groupView.canDisplayOverlay).toHaveBeenCalledTimes(0);

        expect(
            cut.element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(1);
    });

    test('that dropping a tab from another component should not render a drop target', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            id: 'testcomponentid',
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
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
                api: fromPartial<DockviewGroupPanel['api']>({
                    locked: false,
                }),
            };
        });

        const groupPanel = new groupPanelMock() as DockviewGroupPanel;

        const cut = new TabsContainer(accessor, groupPanel);

        cut.openPanel(new TestPanel('panel1', jest.fn() as any));
        cut.openPanel(new TestPanel('panel2', jest.fn() as any));

        const emptySpace = cut.element
            .getElementsByClassName('dv-void-container')
            .item(0) as HTMLElement;

        if (!emptySpace!) {
            fail('element not found');
        }

        jest.spyOn(emptySpace!, 'offsetHeight', 'get').mockImplementation(
            () => 100
        );
        jest.spyOn(emptySpace!, 'offsetWidth', 'get').mockImplementation(
            () => 100
        );

        LocalSelectionTransfer.getInstance().setData(
            [
                new PanelTransfer(
                    'anothercomponentid',
                    'anothergroupid',
                    'panel1'
                ),
            ],
            PanelTransfer.prototype
        );

        fireEvent.dragEnter(emptySpace!);
        fireEvent.dragOver(emptySpace!);

        expect(groupView.canDisplayOverlay).toHaveBeenCalledTimes(1);

        expect(
            cut.element.getElementsByClassName('dv-drop-target-dropzone')
        ).toHaveLength(0);
    });

    test('left actions', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            id: 'testcomponentid',
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
        });

        const groupPanelMock = jest.fn<DockviewGroupPanel, []>(() => {
            return (<Partial<DockviewGroupPanel>>{}) as DockviewGroupPanel;
        });

        const groupPanel = new groupPanelMock();

        const cut = new TabsContainer(accessor, groupPanel);

        let query = cut.element.querySelectorAll(
            '.dv-tabs-and-actions-container > .dv-left-actions-container'
        );

        expect(query).toHaveLength(1);
        expect(query[0].children).toHaveLength(0);

        const left = document.createElement('div');
        left.className = 'test-left-actions-element';
        cut.setLeftActionsElement(left);

        query = cut.element.querySelectorAll(
            '.dv-tabs-and-actions-container > .dv-left-actions-container'
        );
        expect(query).toHaveLength(1);
        expect(query[0].children.item(0)?.className).toBe(
            'test-left-actions-element'
        );
        expect(query[0].children).toHaveLength(1);

        const left2 = document.createElement('div');
        left2.className = 'test-left-actions-element-2';
        cut.setLeftActionsElement(left2);

        query = cut.element.querySelectorAll(
            '.dv-tabs-and-actions-container > .dv-left-actions-container'
        );
        expect(query).toHaveLength(1);
        expect(query[0].children.item(0)?.className).toBe(
            'test-left-actions-element-2'
        );
        expect(query[0].children).toHaveLength(1);

        cut.setLeftActionsElement(undefined);
        query = cut.element.querySelectorAll(
            '.dv-tabs-and-actions-container > .dv-left-actions-container'
        );

        expect(query).toHaveLength(1);
        expect(query[0].children).toHaveLength(0);
    });

    test('right actions', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            id: 'testcomponentid',
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
        });

        const groupPanelMock = jest.fn<DockviewGroupPanel, []>(() => {
            return (<Partial<DockviewGroupPanel>>{}) as DockviewGroupPanel;
        });

        const groupPanel = new groupPanelMock();

        const cut = new TabsContainer(accessor, groupPanel);

        let query = cut.element.querySelectorAll(
            '.dv-tabs-and-actions-container > .dv-right-actions-container'
        );

        expect(query).toHaveLength(1);
        expect(query[0].children).toHaveLength(0);

        const right = document.createElement('div');
        right.className = 'test-right-actions-element';
        cut.setRightActionsElement(right);

        query = cut.element.querySelectorAll(
            '.dv-tabs-and-actions-container > .dv-right-actions-container'
        );
        expect(query).toHaveLength(1);
        expect(query[0].children.item(0)?.className).toBe(
            'test-right-actions-element'
        );
        expect(query[0].children).toHaveLength(1);

        const right2 = document.createElement('div');
        right2.className = 'test-right-actions-element-2';
        cut.setRightActionsElement(right2);

        query = cut.element.querySelectorAll(
            '.dv-tabs-and-actions-container > .dv-right-actions-container'
        );
        expect(query).toHaveLength(1);
        expect(query[0].children.item(0)?.className).toBe(
            'test-right-actions-element-2'
        );
        expect(query[0].children).toHaveLength(1);

        cut.setRightActionsElement(undefined);
        query = cut.element.querySelectorAll(
            '.dv-tabs-and-actions-container > .dv-right-actions-container'
        );

        expect(query).toHaveLength(1);
        expect(query[0].children).toHaveLength(0);
    });

    test('that a tab will become floating when clicked if not floating and shift is selected', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            options: {},
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            element: document.createElement('div'),
            addFloatingGroup: jest.fn(),
            doSetGroupActive: jest.fn(),
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
        });

        const groupPanelMock = jest.fn<DockviewGroupPanel, []>(() => {
            return (<Partial<DockviewGroupPanel>>{
                api: { location: { type: 'grid' } } as any,
            }) as DockviewGroupPanel;
        });

        const groupPanel = new groupPanelMock();

        const cut = new TabsContainer(accessor, groupPanel);

        const container = cut.element.querySelector('.dv-void-container')!;
        expect(container).toBeTruthy();

        jest.spyOn(cut.element, 'getBoundingClientRect').mockImplementation(
            () => {
                return { top: 50, left: 100, width: 0, height: 0 } as any;
            }
        );
        jest.spyOn(
            accessor.element,
            'getBoundingClientRect'
        ).mockImplementation(() => {
            return { top: 10, left: 20, width: 0, height: 0 } as any;
        });

        const event = new KeyboardEvent('pointerdown', { shiftKey: true });
        const eventPreventDefaultSpy = jest.spyOn(event, 'preventDefault');
        fireEvent(container, event);

        expect(accessor.doSetGroupActive).toHaveBeenCalledWith(groupPanel);
        expect(accessor.addFloatingGroup).toHaveBeenCalledWith(groupPanel, {
            x: 100,
            y: 60,
            inDragMode: true,
        });
        expect(accessor.addFloatingGroup).toHaveBeenCalledTimes(1);
        expect(eventPreventDefaultSpy).toHaveBeenCalledTimes(1);

        const event2 = new KeyboardEvent('pointerdown', { shiftKey: false });
        const eventPreventDefaultSpy2 = jest.spyOn(event2, 'preventDefault');
        fireEvent(container, event2);

        expect(accessor.addFloatingGroup).toHaveBeenCalledTimes(1);
        expect(eventPreventDefaultSpy2).toHaveBeenCalledTimes(0);
    });

    test('that an edge group cannot be floated via shift+click', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            options: {},
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            element: document.createElement('div'),
            addFloatingGroup: jest.fn(),
            doSetGroupActive: jest.fn(),
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
        });

        const groupPanelMock = jest.fn<DockviewGroupPanel, []>(() => {
            return (<Partial<DockviewGroupPanel>>{
                api: {
                    location: { type: 'edge', position: 'left' },
                } as any,
            }) as DockviewGroupPanel;
        });

        const groupPanel = new groupPanelMock();

        const cut = new TabsContainer(accessor, groupPanel);

        const container = cut.element.querySelector('.dv-void-container')!;
        expect(container).toBeTruthy();

        jest.spyOn(cut.element, 'getBoundingClientRect').mockImplementation(
            () => {
                return { top: 50, left: 100, width: 0, height: 0 } as any;
            }
        );
        jest.spyOn(
            accessor.element,
            'getBoundingClientRect'
        ).mockImplementation(() => {
            return { top: 10, left: 20, width: 0, height: 0 } as any;
        });

        const event = new KeyboardEvent('pointerdown', { shiftKey: true });
        const eventPreventDefaultSpy = jest.spyOn(event, 'preventDefault');
        fireEvent(container, event);

        expect(accessor.doSetGroupActive).toHaveBeenCalledWith(groupPanel);
        expect(accessor.addFloatingGroup).toHaveBeenCalledTimes(0);
        expect(eventPreventDefaultSpy).toHaveBeenCalledTimes(0);
    });

    test('that a tab that is already floating cannot be floated again', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            options: {},
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            element: document.createElement('div'),
            addFloatingGroup: jest.fn(),
            doSetGroupActive: jest.fn(),
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
        });

        const groupPanelMock = jest.fn<DockviewGroupPanel, []>(() => {
            return (<Partial<DockviewGroupPanel>>{
                api: { location: { type: 'floating' } } as any,
            }) as DockviewGroupPanel;
        });

        const groupPanel = new groupPanelMock();

        const cut = new TabsContainer(accessor, groupPanel);

        const container = cut.element.querySelector('.dv-void-container')!;
        expect(container).toBeTruthy();

        jest.spyOn(cut.element, 'getBoundingClientRect').mockImplementation(
            () => {
                return { top: 50, left: 100, width: 0, height: 0 } as any;
            }
        );
        jest.spyOn(
            accessor.element,
            'getBoundingClientRect'
        ).mockImplementation(() => {
            return { top: 10, left: 20, width: 0, height: 0 } as any;
        });

        const event = new KeyboardEvent('pointerdown', { shiftKey: true });
        const eventPreventDefaultSpy = jest.spyOn(event, 'preventDefault');
        fireEvent(container, event);

        expect(accessor.doSetGroupActive).toHaveBeenCalledWith(groupPanel);
        expect(accessor.addFloatingGroup).toHaveBeenCalledTimes(0);
        expect(eventPreventDefaultSpy).toHaveBeenCalledTimes(0);

        const event2 = new KeyboardEvent('pointerdown', { shiftKey: false });
        const eventPreventDefaultSpy2 = jest.spyOn(event2, 'preventDefault');
        fireEvent(container, event2);

        expect(accessor.addFloatingGroup).toHaveBeenCalledTimes(0);
        expect(eventPreventDefaultSpy2).toHaveBeenCalledTimes(0);
    });

    test('that selecting a tab with shift down will move that tab into a new floating group', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            options: {},
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            element: document.createElement('div'),
            addFloatingGroup: jest.fn(),
            getGroupPanel: jest.fn(),
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
        });

        const groupPanelMock = jest.fn<DockviewGroupPanel, []>(() => {
            return (<Partial<DockviewGroupPanel>>{
                api: { location: { type: 'floating' } } as any,
                model: {} as any,
            }) as DockviewGroupPanel;
        });

        const groupPanel = new groupPanelMock();

        const cut = new TabsContainer(accessor, groupPanel);

        const createPanel = (id: string) =>
            fromPartial<IDockviewPanel>({
                id,
                view: {
                    tab: {
                        element: document.createElement('div'),
                    },
                    content: {
                        element: document.createElement('div'),
                    },
                },
            });

        const panel = createPanel('test_id');
        cut.openPanel(panel);

        const el = cut.element.querySelector('.dv-tab')!;
        expect(el).toBeTruthy();

        const event = new KeyboardEvent('pointerdown', { shiftKey: true });
        const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
        fireEvent(el, event);

        // a floating group with a single tab shouldn't be eligible
        expect(preventDefaultSpy).toHaveBeenCalledTimes(0);
        expect(accessor.addFloatingGroup).toHaveBeenCalledTimes(0);

        const panel2 = createPanel('test_id_2');
        cut.openPanel(panel2);
        fireEvent(el, event);

        expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
        expect(accessor.addFloatingGroup).toHaveBeenCalledTimes(1);
    });

    test('pre header actions', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            options: {},
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            element: document.createElement('div'),
            addFloatingGroup: jest.fn(),
            getGroupPanel: jest.fn(),
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
        });

        const groupPanelMock = jest.fn<DockviewGroupPanel, []>(() => {
            return (<Partial<DockviewGroupPanel>>{
                api: { location: { type: 'grid' } } as any,
                model: {} as any,
            }) as DockviewGroupPanel;
        });

        const groupPanel = new groupPanelMock();

        const cut = new TabsContainer(accessor, groupPanel);

        const panelMock = jest.fn<IDockviewPanel, [string]>((id: string) => {
            const partial: Partial<IDockviewPanel> = {
                id,

                view: {
                    tab: {
                        element: document.createElement('div'),
                    } as any,
                    content: {
                        element: document.createElement('div'),
                    } as any,
                } as any,
            };
            return partial as IDockviewPanel;
        });

        const panel = new panelMock('test_id');
        cut.openPanel(panel);

        let result = cut.element.querySelector('.dv-pre-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(0);

        const actions = document.createElement('div');
        cut.setPrefixActionsElement(actions);

        result = cut.element.querySelector('.dv-pre-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(1);
        expect(result!.childNodes.item(0)).toBe(actions);

        const updatedActions = document.createElement('div');
        cut.setPrefixActionsElement(updatedActions);

        result = cut.element.querySelector('.dv-pre-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(1);
        expect(result!.childNodes.item(0)).toBe(updatedActions);

        cut.setPrefixActionsElement(undefined);

        result = cut.element.querySelector('.dv-pre-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(0);
    });

    test('left header actions', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            options: {},
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            element: document.createElement('div'),
            addFloatingGroup: jest.fn(),
            getGroupPanel: jest.fn(),
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
        });

        const groupPanelMock = jest.fn<DockviewGroupPanel, []>(() => {
            return (<Partial<DockviewGroupPanel>>{
                api: { location: { type: 'grid' } } as any,
                model: {} as any,
            }) as DockviewGroupPanel;
        });

        const groupPanel = new groupPanelMock();

        const cut = new TabsContainer(accessor, groupPanel);

        const panelMock = jest.fn<IDockviewPanel, [string]>((id: string) => {
            const partial: Partial<IDockviewPanel> = {
                id,

                view: {
                    tab: {
                        element: document.createElement('div'),
                    } as any,
                    content: {
                        element: document.createElement('div'),
                    } as any,
                } as any,
            };
            return partial as IDockviewPanel;
        });

        const panel = new panelMock('test_id');
        cut.openPanel(panel);

        let result = cut.element.querySelector('.dv-left-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(0);

        const actions = document.createElement('div');
        cut.setLeftActionsElement(actions);

        result = cut.element.querySelector('.dv-left-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(1);
        expect(result!.childNodes.item(0)).toBe(actions);

        const updatedActions = document.createElement('div');
        cut.setLeftActionsElement(updatedActions);

        result = cut.element.querySelector('.dv-left-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(1);
        expect(result!.childNodes.item(0)).toBe(updatedActions);

        cut.setLeftActionsElement(undefined);

        result = cut.element.querySelector('.dv-left-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(0);
    });

    test('right header actions', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            options: {},
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            element: document.createElement('div'),
            addFloatingGroup: jest.fn(),
            getGroupPanel: jest.fn(),
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
        });

        const groupPanelMock = jest.fn<DockviewGroupPanel, []>(() => {
            return (<Partial<DockviewGroupPanel>>{
                api: { location: { type: 'grid' } } as any,
                model: {} as any,
            }) as DockviewGroupPanel;
        });

        const groupPanel = new groupPanelMock();

        const cut = new TabsContainer(accessor, groupPanel);

        const panelMock = jest.fn<IDockviewPanel, [string]>((id: string) => {
            const partial: Partial<IDockviewPanel> = {
                id,

                view: {
                    tab: {
                        element: document.createElement('div'),
                    } as any,
                    content: {
                        element: document.createElement('div'),
                    } as any,
                } as any,
            };
            return partial as IDockviewPanel;
        });

        const panel = new panelMock('test_id');
        cut.openPanel(panel);

        let result = cut.element.querySelector('.dv-right-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(0);

        const actions = document.createElement('div');
        cut.setRightActionsElement(actions);

        result = cut.element.querySelector('.dv-right-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(1);
        expect(result!.childNodes.item(0)).toBe(actions);

        const updatedActions = document.createElement('div');
        cut.setRightActionsElement(updatedActions);

        result = cut.element.querySelector('.dv-right-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(1);
        expect(result!.childNodes.item(0)).toBe(updatedActions);

        cut.setRightActionsElement(undefined);

        result = cut.element.querySelector('.dv-right-actions-container');
        expect(result).toBeTruthy();
        expect(result!.childNodes).toHaveLength(0);
    });

    test('class dv-single-tab is present when only one tab exists`', () => {
        const cut = new TabsContainer(
            fromPartial<DockviewComponent>({
                withOrigin: (_origin: any, fn: () => any) => fn(),
                options: {},
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
            }),
            fromPartial<DockviewGroupPanel>({})
        );

        expect(cut.element.classList.contains('dv-single-tab')).toBeFalsy();

        const panel1 = new TestPanel(
            'panel_1',
            fromPartial<DockviewPanelApi>({})
        );
        cut.openPanel(panel1);
        expect(cut.element.classList.contains('dv-single-tab')).toBeTruthy();

        const panel2 = new TestPanel(
            'panel_2',
            fromPartial<DockviewPanelApi>({})
        );
        cut.openPanel(panel2);
        expect(cut.element.classList.contains('dv-single-tab')).toBeFalsy();

        cut.closePanel(panel1);
        expect(cut.element.classList.contains('dv-single-tab')).toBeTruthy();

        cut.closePanel(panel2);
        expect(cut.element.classList.contains('dv-single-tab')).toBeFalsy();
    });

    describe('updateDragAndDropState', () => {
        test('that updateDragAndDropState calls updateDragAndDropState on tabs and voidContainer', () => {
            const accessor = fromPartial<DockviewComponent>({
                withOrigin: (_origin: any, fn: () => any) => fn(),
                onDidAddPanel: jest.fn(),
                onDidRemovePanel: jest.fn(),
                options: {},
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
            });

            const groupPanel = fromPartial<DockviewGroupPanel>({
                id: 'testgroupid',
                model: fromPartial<DockviewGroupPanelModel>({
                    getTabGroups: () => [],
                }),
            });

            const cut = new TabsContainer(accessor, groupPanel);

            // Mock the tabs and voidContainer to verify methods are called
            const mockTabs = { updateDragAndDropState: jest.fn() };
            const mockVoidContainer = { updateDragAndDropState: jest.fn() };

            (cut as any).tabs = mockTabs;
            (cut as any).voidContainer = mockVoidContainer;

            cut.updateDragAndDropState();

            expect(mockTabs.updateDragAndDropState).toHaveBeenCalledTimes(1);
            expect(
                mockVoidContainer.updateDragAndDropState
            ).toHaveBeenCalledTimes(1);
        });
    });

    describe('tab overflow dropdown with close buttons', () => {
        test('close button should be visible and clickable in dropdown tabs', () => {
            const mockPopupService = {
                openPopover: jest.fn(),
                close: jest.fn(),
            };

            const accessor = fromPartial<DockviewComponent>({
                withOrigin: (_origin: any, fn: () => any) => fn(),
                onDidAddPanel: jest.fn(),
                onDidRemovePanel: jest.fn(),
                options: {},
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                popupService: mockPopupService,
                getPopupServiceForGroup: () => mockPopupService,
            });

            const mockClose = jest.fn();
            const mockSetActive = jest.fn();
            const mockScrollIntoView = jest.fn();

            const mockPanel = fromPartial<IDockviewPanel>({
                id: 'test-panel',
                api: {
                    isActive: false,
                    close: mockClose,
                    setActive: mockSetActive,
                },
                view: {
                    createTabRenderer: jest.fn().mockReturnValue({
                        element: (() => {
                            const tabElement = document.createElement('div');
                            tabElement.className = 'dv-default-tab';

                            const content = document.createElement('div');
                            content.className = 'dv-default-tab-content';
                            content.textContent = 'Test Tab';

                            const action = document.createElement('div');
                            action.className = 'dv-default-tab-action';
                            const closeButton = document.createElement('div');
                            action.appendChild(closeButton);

                            // Simulate close button functionality
                            action.addEventListener('click', (e) => {
                                e.preventDefault();
                                mockClose();
                            });

                            tabElement.appendChild(content);
                            tabElement.appendChild(action);

                            return tabElement;
                        })(),
                    }),
                },
            });

            const mockTab = {
                panel: mockPanel,
                element: {
                    scrollIntoView: mockScrollIntoView,
                },
            };

            const mockTabs = {
                tabs: [mockTab],
                onDrop: jest.fn(),
                onTabDragStart: jest.fn(),
                onWillShowOverlay: jest.fn(),
                onOverflowTabsChange: jest.fn(),
                size: 1,
                panels: ['test-panel'],
                isActive: jest.fn(),
                indexOf: jest.fn(),
                delete: jest.fn(),
                setActivePanel: jest.fn(),
                openPanel: jest.fn(),
                showTabsOverflowControl: true,
                updateDragAndDropState: jest.fn(),
                element: document.createElement('div'),
                dispose: jest.fn(),
            };

            const groupPanel = fromPartial<DockviewGroupPanel>({
                id: 'testgroupid',
                panels: [mockPanel],
                model: fromPartial<DockviewGroupPanelModel>({
                    getTabGroups: () => [],
                }),
            });

            const cut = new TabsContainer(accessor, groupPanel);
            (cut as any).tabs = mockTabs;

            (cut as any).toggleDropdown({
                tabs: ['test-panel'],
                tabGroups: [],
                pinnedTabs: [],
                reset: false,
            });

            const dropdownTrigger = cut.element.querySelector(
                '.dv-tabs-overflow-dropdown-root'
            );
            expect(dropdownTrigger).toBeTruthy();

            fireEvent.click(dropdownTrigger!);

            expect(mockPopupService.openPopover).toHaveBeenCalled();

            const popoverContent =
                mockPopupService.openPopover.mock.calls[0][0];
            expect(popoverContent).toBeTruthy();

            const tabWrapper = popoverContent.querySelector('.dv-tab');
            expect(tabWrapper).toBeTruthy();

            const closeButton = tabWrapper!.querySelector(
                '.dv-default-tab-action'
            ) as HTMLElement;
            expect(closeButton).toBeTruthy();
            expect(closeButton.style.display).not.toBe('none');

            fireEvent.click(closeButton!);

            expect(mockClose).toHaveBeenCalledTimes(1);

            expect(mockScrollIntoView).not.toHaveBeenCalled();
            expect(mockSetActive).not.toHaveBeenCalled();
        });

        test('clicking tab content (not close button) should activate tab', () => {
            const mockPopupService = {
                openPopover: jest.fn(),
                close: jest.fn(),
            };

            const accessor = fromPartial<DockviewComponent>({
                withOrigin: (_origin: any, fn: () => any) => fn(),
                onDidAddPanel: jest.fn(),
                onDidRemovePanel: jest.fn(),
                options: {},
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                popupService: mockPopupService,
                getPopupServiceForGroup: () => mockPopupService,
            });

            const mockClose = jest.fn();
            const mockSetActive = jest.fn();
            const mockScrollIntoView = jest.fn();

            const mockPanel = fromPartial<IDockviewPanel>({
                id: 'test-panel',
                api: {
                    isActive: false,
                    close: mockClose,
                    setActive: mockSetActive,
                },
                view: {
                    createTabRenderer: jest.fn().mockReturnValue({
                        element: (() => {
                            const tabElement = document.createElement('div');
                            tabElement.className = 'dv-default-tab';

                            const content = document.createElement('div');
                            content.className = 'dv-default-tab-content';
                            content.textContent = 'Test Tab';

                            const action = document.createElement('div');
                            action.className = 'dv-default-tab-action';
                            const closeButton = document.createElement('div');
                            action.appendChild(closeButton);

                            // Simulate close button functionality
                            action.addEventListener('click', (e) => {
                                e.preventDefault();
                                mockClose();
                            });

                            tabElement.appendChild(content);
                            tabElement.appendChild(action);

                            return tabElement;
                        })(),
                    }),
                },
            });

            const mockTab = {
                panel: mockPanel,
                element: {
                    scrollIntoView: mockScrollIntoView,
                },
            };

            const mockTabs = {
                tabs: [mockTab],
                onDrop: jest.fn(),
                onTabDragStart: jest.fn(),
                onWillShowOverlay: jest.fn(),
                onOverflowTabsChange: jest.fn(),
                size: 1,
                panels: ['test-panel'],
                isActive: jest.fn(),
                indexOf: jest.fn(),
                delete: jest.fn(),
                setActivePanel: jest.fn(),
                openPanel: jest.fn(),
                showTabsOverflowControl: true,
                updateDragAndDropState: jest.fn(),
                element: document.createElement('div'),
                dispose: jest.fn(),
            };

            const groupPanel = fromPartial<DockviewGroupPanel>({
                id: 'testgroupid',
                panels: [mockPanel],
                model: fromPartial<DockviewGroupPanelModel>({
                    getTabGroups: () => [],
                }),
            });

            const cut = new TabsContainer(accessor, groupPanel);
            (cut as any).tabs = mockTabs;

            (cut as any).toggleDropdown({
                tabs: ['test-panel'],
                tabGroups: [],
                pinnedTabs: [],
                reset: false,
            });

            const dropdownTrigger = cut.element.querySelector(
                '.dv-tabs-overflow-dropdown-root'
            );
            expect(dropdownTrigger).toBeTruthy();

            fireEvent.click(dropdownTrigger!);

            const popoverContent =
                mockPopupService.openPopover.mock.calls[0][0];
            const tabWrapper = popoverContent.querySelector('.dv-tab');

            const tabContent = tabWrapper!.querySelector(
                '.dv-default-tab-content'
            );
            fireEvent.click(tabContent!);

            expect(mockPopupService.close).toHaveBeenCalled();
            expect(mockScrollIntoView).toHaveBeenCalled();
            expect(mockSetActive).toHaveBeenCalled();

            expect(mockClose).not.toHaveBeenCalled();
        });

        test('click event should respect preventDefault in dropdown wrapper', () => {
            const mockPopupService = {
                openPopover: jest.fn(),
                close: jest.fn(),
            };

            const accessor = fromPartial<DockviewComponent>({
                withOrigin: (_origin: any, fn: () => any) => fn(),
                onDidAddPanel: jest.fn(),
                onDidRemovePanel: jest.fn(),
                options: {},
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                popupService: mockPopupService,
                getPopupServiceForGroup: () => mockPopupService,
            });

            const mockClose = jest.fn();
            const mockSetActive = jest.fn();
            const mockScrollIntoView = jest.fn();

            const mockPanel = fromPartial<IDockviewPanel>({
                id: 'test-panel',
                api: {
                    isActive: false,
                    close: mockClose,
                    setActive: mockSetActive,
                },
                view: {
                    createTabRenderer: jest.fn().mockReturnValue({
                        element: (() => {
                            const tabElement = document.createElement('div');
                            tabElement.className = 'dv-default-tab';

                            const content = document.createElement('div');
                            content.className = 'dv-default-tab-content';
                            content.textContent = 'Test Tab';

                            const action = document.createElement('div');
                            action.className = 'dv-default-tab-action';
                            const closeButton = document.createElement('div');
                            action.appendChild(closeButton);

                            // Simulate close button functionality that prevents default
                            action.addEventListener('click', (e) => {
                                e.preventDefault();
                                mockClose();
                            });

                            tabElement.appendChild(content);
                            tabElement.appendChild(action);

                            return tabElement;
                        })(),
                    }),
                },
            });

            const mockTab = {
                panel: mockPanel,
                element: {
                    scrollIntoView: mockScrollIntoView,
                },
            };

            const mockTabs = {
                tabs: [mockTab],
                onDrop: jest.fn(),
                onTabDragStart: jest.fn(),
                onWillShowOverlay: jest.fn(),
                onOverflowTabsChange: jest.fn(),
                size: 1,
                panels: ['test-panel'],
                isActive: jest.fn(),
                indexOf: jest.fn(),
                delete: jest.fn(),
                setActivePanel: jest.fn(),
                openPanel: jest.fn(),
                showTabsOverflowControl: true,
                updateDragAndDropState: jest.fn(),
                element: document.createElement('div'),
                dispose: jest.fn(),
            };

            const groupPanel = fromPartial<DockviewGroupPanel>({
                id: 'testgroupid',
                panels: [mockPanel],
                model: fromPartial<DockviewGroupPanelModel>({
                    getTabGroups: () => [],
                }),
            });

            const cut = new TabsContainer(accessor, groupPanel);
            (cut as any).tabs = mockTabs;

            (cut as any).toggleDropdown({
                tabs: ['test-panel'],
                tabGroups: [],
                pinnedTabs: [],
                reset: false,
            });

            const dropdownTrigger = cut.element.querySelector(
                '.dv-tabs-overflow-dropdown-root'
            );
            fireEvent.click(dropdownTrigger!);

            const popoverContent =
                mockPopupService.openPopover.mock.calls[0][0];
            const tabWrapper = popoverContent.querySelector('.dv-tab');
            const closeButton = tabWrapper!.querySelector(
                '.dv-default-tab-action'
            );

            // Simulate clicking the close button (which calls preventDefault)
            fireEvent.click(closeButton!);

            // Verify close was called
            expect(mockClose).toHaveBeenCalledTimes(1);

            // Verify that tab activation methods were NOT called due to preventDefault
            expect(mockScrollIntoView).not.toHaveBeenCalled();
            expect(mockSetActive).not.toHaveBeenCalled();
        });
    });

    test('direction setter toggles CSS classes', () => {
        const accessor = fromPartial<DockviewComponent>({
            withOrigin: (_origin: any, fn: () => any) => fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest
                .fn()
                .mockReturnValue({ dispose: jest.fn() }),
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
                model: groupView,
                api: fromPartial<DockviewGroupPanel['api']>({
                    locked: false,
                }),
            };
        });

        const groupPanel = new groupPanelMock() as DockviewGroupPanel;

        const cut = new TabsContainer(accessor, groupPanel);

        // default should not have vertical classes
        expect(
            cut.element.classList.contains('dv-groupview-header-vertical')
        ).toBeFalsy();

        cut.direction = 'vertical';
        expect(
            cut.element.classList.contains('dv-groupview-header-vertical')
        ).toBeTruthy();

        const rightActions = cut.element.querySelector(
            '.dv-right-actions-container'
        );
        expect(
            rightActions?.classList.contains(
                'dv-right-actions-container-vertical'
            )
        ).toBeTruthy();

        cut.direction = 'horizontal';
        expect(
            cut.element.classList.contains('dv-groupview-header-vertical')
        ).toBeFalsy();
        expect(
            rightActions?.classList.contains(
                'dv-right-actions-container-vertical'
            )
        ).toBeFalsy();
    });

    describe('additional coverage', () => {
        const makeAccessor = (
            overrides: Partial<DockviewComponent> = {}
        ): DockviewComponent =>
            fromPartial<DockviewComponent>({
                withOrigin: (_origin: any, fn: () => any) => fn(),
                onDidAddPanel: jest.fn(),
                onDidRemovePanel: jest.fn(),
                doSetGroupActive: jest.fn(),
                options: {},
                onDidOptionsChange: jest
                    .fn()
                    .mockReturnValue({ dispose: jest.fn() }),
                ...overrides,
            });

        const makeGroup = (
            overrides: Partial<DockviewGroupPanel> = {}
        ): DockviewGroupPanel =>
            fromPartial<DockviewGroupPanel>({
                id: 'testgroupid',
                model: fromPartial<DockviewGroupPanelModel>({
                    getTabGroups: () => [],
                }),
                api: fromPartial<DockviewGroupPanel['api']>({
                    locked: false,
                }),
                ...overrides,
            });

        const makeOverflowMockTabs = (tabs: any[]): any => ({
            tabs,
            onDrop: jest.fn(),
            onTabDragStart: jest.fn(),
            onWillShowOverlay: jest.fn(),
            onOverflowTabsChange: jest.fn(),
            size: tabs.length,
            panels: tabs.map((t) => t.panel.id),
            isActive: jest.fn(),
            indexOf: jest.fn(),
            delete: jest.fn(),
            setActivePanel: jest.fn(),
            openPanel: jest.fn(),
            showTabsOverflowControl: true,
            updateDragAndDropState: jest.fn(),
            element: document.createElement('div'),
            dispose: jest.fn(),
        });

        const makeOverflowPanel = (
            id: string,
            isActive = false
        ): IDockviewPanel =>
            fromPartial<IDockviewPanel>({
                id,
                api: {
                    isActive,
                    setActive: jest.fn(),
                },
                view: {
                    createTabRenderer: jest.fn().mockReturnValue({
                        element: document.createElement('div'),
                    }),
                },
            });

        test('delegates simple methods and getters to the underlying tabs', () => {
            const cut = new TabsContainer(makeAccessor(), makeGroup());

            const listEl = document.createElement('div');
            const sentinelPanel = fromPartial<IDockviewPanel>({ id: 'sp' });

            const mockTabs = {
                ...makeOverflowMockTabs([]),
                isActive: jest.fn().mockReturnValue(true),
                indexOf: jest.fn().mockReturnValue(3),
                getTabId: jest.fn().mockReturnValue('the-tab-id'),
                getPanelForTab: jest.fn().mockReturnValue(sentinelPanel),
                focusActiveTab: jest.fn(),
                setActivePanel: jest.fn(),
                setOverflowExclude: jest.fn(),
                setForcedOverflow: jest.fn(),
                setPinnedSticky: jest.fn(),
                refreshOverflow: jest.fn(),
                updateTabGroups: jest.fn(),
                refreshTabGroupAccent: jest.fn(),
                delete: jest.fn(),
                size: 2,
                panels: ['a', 'b'],
                tabsListElement: listEl,
            };
            (cut as any).tabs = mockTabs;

            const tab = {} as any;
            expect(cut.isActive(tab)).toBe(true);
            expect(mockTabs.isActive).toHaveBeenCalledWith(tab);

            expect(cut.indexOf('panel')).toBe(3);
            expect(mockTabs.indexOf).toHaveBeenCalledWith('panel');

            expect(cut.getTabId('panel')).toBe('the-tab-id');
            expect(mockTabs.getTabId).toHaveBeenCalledWith('panel');

            const el = document.createElement('div');
            expect(cut.getPanelForTab(el)).toBe(sentinelPanel);
            expect(mockTabs.getPanelForTab).toHaveBeenCalledWith(el);

            cut.focusActiveTab();
            expect(mockTabs.focusActiveTab).toHaveBeenCalledTimes(1);

            const activePanel = fromPartial<IDockviewPanel>({ id: 'x' });
            cut.setActivePanel(activePanel);
            expect(mockTabs.setActivePanel).toHaveBeenCalledWith(activePanel);

            const excludeFn = (_: string) => true;
            cut.setOverflowExclude(excludeFn);
            expect(mockTabs.setOverflowExclude).toHaveBeenCalledWith(excludeFn);

            const forcedFn = (_: string) => true;
            cut.setForcedOverflow(forcedFn);
            expect(mockTabs.setForcedOverflow).toHaveBeenCalledWith(forcedFn);

            cut.setPinnedSticky(true);
            expect(mockTabs.setPinnedSticky).toHaveBeenCalledWith(true);

            cut.refreshOverflow();
            expect(mockTabs.refreshOverflow).toHaveBeenCalledTimes(1);

            cut.updateTabGroups();
            expect(mockTabs.updateTabGroups).toHaveBeenCalledTimes(1);

            cut.refreshTabGroupAccent();
            expect(mockTabs.refreshTabGroupAccent).toHaveBeenCalledTimes(1);

            cut.delete('panel');
            expect(mockTabs.delete).toHaveBeenCalledWith('panel');

            expect(cut.size).toBe(2);
            expect(cut.panels).toEqual(['a', 'b']);
            expect(cut.tabsListElement).toBe(listEl);

            // setActive is a documented noop
            expect(() => cut.setActive(true)).not.toThrow();
        });

        test('show/hide/hidden control the element display style', () => {
            const cut = new TabsContainer(makeAccessor(), makeGroup());

            cut.hide();
            expect(cut.element.style.display).toBe('none');

            // show() only clears display when not hidden
            cut.show();
            expect(cut.element.style.display).toBe('');

            cut.hidden = true;
            expect(cut.hidden).toBe(true);
            expect(cut.element.style.display).toBe('none');

            // show() is a noop while hidden
            cut.show();
            expect(cut.element.style.display).toBe('none');

            cut.hidden = false;
            expect(cut.hidden).toBe(false);
            expect(cut.element.style.display).toBe('');
        });

        test('drop index resolver defaults to identity and can be overridden', () => {
            const cut = new TabsContainer(makeAccessor(), makeGroup());

            // identity by default
            expect(cut.resolveDropIndex('panel', 4)).toBe(4);

            const resolver = jest.fn().mockReturnValue(9);
            cut.setDropIndexResolver(resolver);
            expect(cut.resolveDropIndex('panel', 4)).toBe(9);
            expect(resolver).toHaveBeenCalledWith('panel', 4);
        });

        test('setPinnedRow mounts, replaces and removes the pinned row', () => {
            const cut = new TabsContainer(makeAccessor(), makeGroup());

            const row = document.createElement('div');
            cut.setPinnedRow(row);
            expect(cut.element.firstChild).toBe(row);
            expect(row.classList.contains('dv-pinned-row')).toBe(true);
            expect(
                cut.element.classList.contains(
                    'dv-tabs-and-actions-container--pinned-row'
                )
            ).toBe(true);

            // setting the same row again is a noop
            cut.setPinnedRow(row);
            expect(cut.element.firstChild).toBe(row);

            const row2 = document.createElement('div');
            cut.setPinnedRow(row2);
            expect(cut.element.contains(row)).toBe(false);
            expect(cut.element.firstChild).toBe(row2);

            cut.setPinnedRow(undefined);
            expect(cut.element.contains(row2)).toBe(false);
            expect(
                cut.element.classList.contains(
                    'dv-tabs-and-actions-container--pinned-row'
                )
            ).toBe(false);
        });

        test('re-emits drop, overlay, tab-drag and group-drag events', () => {
            const cut = new TabsContainer(makeAccessor(), makeGroup());
            const group = (cut as any).group as DockviewGroupPanel;

            const dropEvents: any[] = [];
            cut.onDrop((e) => dropEvents.push(e));
            (cut as any).tabs._onDrop.fire({ event: {} as any, index: 5 });
            expect(dropEvents).toHaveLength(1);
            expect(dropEvents[0].index).toBe(5);

            const overlayEvents: any[] = [];
            cut.onWillShowOverlay((e) => overlayEvents.push(e));
            (cut as any).tabs._onWillShowOverlay.fire({} as any);
            expect(overlayEvents).toHaveLength(1);

            const tabDragEvents: any[] = [];
            cut.onTabDragStart((e) => tabDragEvents.push(e));
            (cut as any).tabs._onTabDragStart.fire({
                nativeEvent: {} as any,
                panel: {} as any,
            });
            expect(tabDragEvents).toHaveLength(1);

            const groupDragEvents: any[] = [];
            cut.onGroupDragStart((e) => groupDragEvents.push(e));
            const dragEvent = {} as any;
            (cut as any).voidContainer._onDragStart.fire(dragEvent);
            expect(groupDragEvents).toHaveLength(1);
            expect(groupDragEvents[0].group).toBe(group);
            expect(groupDragEvents[0].nativeEvent).toBe(dragEvent);

            const voidDropEvents: any[] = [];
            cut.onDrop((e) => voidDropEvents.push(e));
            (cut as any).voidContainer._onDrop.fire({
                nativeEvent: {} as any,
            });
            // no active group drag -> re-emits with the tabs size as index
            expect(voidDropEvents).toHaveLength(1);
            expect(voidDropEvents[0].index).toBe((cut as any).tabs.size);
        });

        test('overflow-tabs change from tabs builds the dropdown', () => {
            const cut = new TabsContainer(makeAccessor(), makeGroup());

            (cut as any).tabs._onOverflowTabsChange.fire({
                tabs: ['a', 'b'],
                tabGroups: [],
                pinnedTabs: [],
                reset: false,
            });

            const root = cut.element.querySelector(
                '.dv-tabs-overflow-dropdown-root'
            );
            expect(root).toBeTruthy();
        });

        test('option changes toggle the overflow control on the tabs', () => {
            const optionsChange = new Emitter<void>();
            const options: any = { disableTabsOverflowList: false };
            const accessor = fromPartial<DockviewComponent>({
                withOrigin: (_origin: any, fn: () => any) => fn(),
                onDidAddPanel: jest.fn(),
                onDidRemovePanel: jest.fn(),
                doSetGroupActive: jest.fn(),
                options,
                onDidOptionsChange: optionsChange.event,
            });

            const cut = new TabsContainer(accessor, makeGroup());
            const mockTabs = { showTabsOverflowControl: true };
            (cut as any).tabs = mockTabs;

            options.disableTabsOverflowList = true;
            optionsChange.fire();
            expect(mockTabs.showTabsOverflowControl).toBe(false);

            options.disableTabsOverflowList = false;
            optionsChange.fire();
            expect(mockTabs.showTabsOverflowControl).toBe(true);

            optionsChange.dispose();
        });

        test('dragleave on left actions/void container updates tab drag state', () => {
            const cut = new TabsContainer(makeAccessor(), makeGroup());

            const mockTabs = {
                clearExternalAnimState: jest.fn(),
                setExternalInsertionIndex: jest.fn(),
            };
            (cut as any).tabs = mockTabs;

            const leftActions = cut.element.querySelector(
                '.dv-left-actions-container'
            ) as HTMLElement;
            const voidEl = cut.element.querySelector(
                '.dv-void-container'
            ) as HTMLElement;

            const dragLeaveWith = (
                target: HTMLElement,
                relatedTarget: EventTarget | null
            ): void => {
                const evt = new Event('dragleave', { bubbles: true });
                Object.defineProperty(evt, 'relatedTarget', {
                    value: relatedTarget,
                    configurable: true,
                });
                fireEvent(target, evt);
            };

            // Leaving the header entirely from the left actions clears state.
            dragLeaveWith(leftActions, null);
            expect(mockTabs.clearExternalAnimState).toHaveBeenCalledTimes(1);

            // Leaving into the left actions container itself does nothing.
            mockTabs.clearExternalAnimState.mockClear();
            dragLeaveWith(leftActions, leftActions);
            expect(mockTabs.clearExternalAnimState).not.toHaveBeenCalled();

            // Leaving the void container for the header entirely clears state.
            dragLeaveWith(voidEl, document.createElement('div'));
            expect(mockTabs.clearExternalAnimState).toHaveBeenCalledTimes(1);

            // Leaving the void container for another header part keeps state.
            dragLeaveWith(voidEl, leftActions);
            expect(mockTabs.setExternalInsertionIndex).toHaveBeenCalledWith(
                null
            );
        });

        test('void container pointerdown is ignored when default is prevented', () => {
            const accessor = makeAccessor({
                element: document.createElement('div'),
                addFloatingGroup: jest.fn(),
                options: { disableFloatingGroups: false },
            });
            const cut = new TabsContainer(
                accessor,
                makeGroup({
                    api: fromPartial<DockviewGroupPanel['api']>({
                        location: { type: 'grid' } as any,
                    }),
                })
            );

            const voidEl = cut.element.querySelector(
                '.dv-void-container'
            ) as HTMLElement;

            const evt = new KeyboardEvent('pointerdown', {
                shiftKey: true,
                cancelable: true,
                bubbles: true,
            });
            evt.preventDefault();
            fireEvent(voidEl, evt);

            expect(accessor.addFloatingGroup).not.toHaveBeenCalled();
        });

        test('toggleDropdown updates count in place and disposes on reset', () => {
            const cut = new TabsContainer(makeAccessor(), makeGroup());

            (cut as any).toggleDropdown({
                tabs: ['a', 'b'],
                tabGroups: [],
                pinnedTabs: [],
                reset: false,
            });
            const root = cut.element.querySelector(
                '.dv-tabs-overflow-dropdown-root'
            ) as HTMLElement;
            expect(root).toBeTruthy();
            expect(root.querySelector('span')?.textContent).toBe('2');

            // second call reuses the same root and updates the count
            (cut as any).toggleDropdown({
                tabs: ['a', 'b', 'c'],
                tabGroups: [],
                pinnedTabs: [],
                reset: false,
            });
            expect(
                cut.element.querySelector('.dv-tabs-overflow-dropdown-root')
            ).toBe(root);
            expect(root.querySelector('span')?.textContent).toBe('3');

            // reset tears the dropdown down
            (cut as any).toggleDropdown({
                tabs: [],
                tabGroups: [],
                pinnedTabs: [],
                reset: true,
            });
            expect(
                cut.element.querySelector('.dv-tabs-overflow-dropdown-root')
            ).toBeNull();
        });

        test('dropdown root swallows pointerdown', () => {
            const cut = new TabsContainer(makeAccessor(), makeGroup());
            (cut as any).toggleDropdown({
                tabs: ['a'],
                tabGroups: [],
                pinnedTabs: [],
                reset: false,
            });
            const root = cut.element.querySelector(
                '.dv-tabs-overflow-dropdown-root'
            ) as HTMLElement;

            const evt = new KeyboardEvent('pointerdown', {
                cancelable: true,
                bubbles: true,
            });
            const spy = jest.spyOn(evt, 'preventDefault');
            fireEvent(root, evt);
            expect(spy).toHaveBeenCalled();
        });

        test('overflow render context builders (advanced overflow path)', () => {
            const mockPopupService = {
                openPopover: jest.fn(),
                close: jest.fn(),
            };

            let capturedContext: any;
            const accessor = makeAccessor({
                getPopupServiceForGroup: () => mockPopupService as any,
                advancedOverflowService: {
                    renderOverflow: (args: any) => {
                        capturedContext = args.context;
                    },
                } as any,
            });

            const expand = jest.fn();
            const tabGroup = {
                id: 'tg1',
                label: 'Group One',
                color: 'blue',
                collapsed: true,
                panelIds: ['panel-a'],
                expand,
            };

            const mockSetActive = jest.fn();
            const mockPanel = fromPartial<IDockviewPanel>({
                id: 'panel-a',
                api: {
                    isActive: false,
                    setActive: mockSetActive,
                },
                view: {
                    createTabRenderer: jest.fn().mockReturnValue({
                        element: document.createElement('div'),
                    }),
                },
            });

            const mockTab = {
                panel: mockPanel,
                element: { scrollIntoView: jest.fn() },
            };

            const group = makeGroup({
                panels: [mockPanel],
                model: fromPartial<DockviewGroupPanelModel>({
                    getTabGroups: () => [tabGroup] as any,
                }),
            });

            const cut = new TabsContainer(accessor, group);
            (cut as any).tabs = makeOverflowMockTabs([mockTab]);

            (cut as any).toggleDropdown({
                tabs: ['panel-a'],
                tabGroups: ['tg1'],
                pinnedTabs: [],
                reset: false,
            });

            const trigger = cut.element.querySelector(
                '.dv-tabs-overflow-dropdown-root'
            );
            fireEvent.click(trigger!);

            expect(capturedContext).toBeTruthy();

            // overflowGroupIdForPanel resolves overflow-group membership
            expect(capturedContext.overflowGroupIdForPanel('panel-a')).toBe(
                'tg1'
            );
            expect(
                capturedContext.overflowGroupIdForPanel('unknown')
            ).toBeUndefined();

            // buildGroupHeader for an overflow group
            const header = capturedContext.buildGroupHeader('tg1');
            expect(header).toBeTruthy();
            expect(
                header.querySelector('.dv-tabs-overflow-group-label')
                    ?.textContent
            ).toBe('Group One');
            // collapsed group renders a count badge
            expect(
                header.querySelector('.dv-tabs-overflow-group-collapsed-badge')
                    ?.textContent
            ).toBe('1');
            // a non-overflow group returns undefined
            expect(
                capturedContext.buildGroupHeader('does-not-exist')
            ).toBeUndefined();

            // clicking a group header closes the popup, expands and activates
            fireEvent.click(header);
            expect(mockPopupService.close).toHaveBeenCalled();
            expect(expand).toHaveBeenCalled();
            expect(mockSetActive).toHaveBeenCalled();

            // pinned header
            const pinnedHeader = capturedContext.buildPinnedHeader();
            expect(
                pinnedHeader.querySelector('.dv-tabs-overflow-group-label')
                    ?.textContent
            ).toBe('Pinned');

            // buildRow for a grouped panel
            const row = capturedContext.buildRow('panel-a');
            expect(row).toBeTruthy();
            expect(row.element.classList.contains('dv-tab')).toBe(true);
            expect(row.element.classList.contains('dv-tab--grouped')).toBe(
                true
            );
            expect(row.panel).toBe(mockPanel);
            // an unknown panel has no row
            expect(capturedContext.buildRow('missing')).toBeUndefined();

            // activating via the row handle
            expand.mockClear();
            mockSetActive.mockClear();
            row.activate();
            expect(mockPopupService.close).toHaveBeenCalled();
            expect(expand).toHaveBeenCalled();
            expect(mockSetActive).toHaveBeenCalled();

            // clicking the row wrapper activates the tab too
            mockSetActive.mockClear();
            fireEvent.click(row.element);
            expect(mockSetActive).toHaveBeenCalled();

            // open/close/focusTrigger route through the popup service
            const body = document.createElement('div');
            capturedContext.open(body);
            expect(mockPopupService.openPopover).toHaveBeenCalledWith(
                body,
                expect.anything()
            );
            mockPopupService.close.mockClear();
            capturedContext.close();
            expect(mockPopupService.close).toHaveBeenCalled();
            expect(() => capturedContext.focusTrigger()).not.toThrow();
        });

        test('free overflow list renders pinned section and group headers', () => {
            const mockPopupService = {
                openPopover: jest.fn(),
                close: jest.fn(),
            };

            const accessor = makeAccessor({
                getPopupServiceForGroup: () => mockPopupService as any,
                // no advancedOverflowService -> free render path
            });

            const pinnedPanel = makeOverflowPanel('pinned-a');
            const groupedPanel = makeOverflowPanel('grouped-b');

            const tabGroup = {
                id: 'tg1',
                label: 'Group One',
                color: undefined,
                collapsed: false,
                panelIds: ['grouped-b'],
                expand: jest.fn(),
            };

            const group = makeGroup({
                panels: [pinnedPanel, groupedPanel],
                model: fromPartial<DockviewGroupPanelModel>({
                    getTabGroups: () => [tabGroup] as any,
                }),
            });

            const cut = new TabsContainer(accessor, group);
            (cut as any).tabs = makeOverflowMockTabs([
                { panel: pinnedPanel, element: { scrollIntoView: jest.fn() } },
                { panel: groupedPanel, element: { scrollIntoView: jest.fn() } },
            ]);

            (cut as any).toggleDropdown({
                tabs: ['grouped-b'],
                tabGroups: ['tg1'],
                pinnedTabs: ['pinned-a'],
                reset: false,
            });

            const trigger = cut.element.querySelector(
                '.dv-tabs-overflow-dropdown-root'
            );
            fireEvent.click(trigger!);

            expect(mockPopupService.openPopover).toHaveBeenCalled();
            const body = mockPopupService.openPopover.mock.calls[0][0];

            // a pinned section header precedes the pinned rows
            expect(
                body.querySelector('.dv-tabs-overflow-pinned-header')
            ).toBeTruthy();
            // an overflow group header precedes its member tab
            expect(
                body.querySelector(
                    '.dv-tabs-overflow-group-header:not(.dv-tabs-overflow-pinned-header)'
                )
            ).toBeTruthy();
            // pinned row + grouped row
            expect(body.querySelectorAll('.dv-tab')).toHaveLength(2);
        });
    });
});
