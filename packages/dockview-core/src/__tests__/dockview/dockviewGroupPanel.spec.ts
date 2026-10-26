import { DockviewComponent } from '../../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../../dockview/dockviewGroupPanel';
import { fromPartial } from '@total-typescript/shoehorn';
import { GroupOptions } from '../../dockview/dockviewGroupPanelModel';
import { DockviewPanel, IDockviewPanel } from '../../dockview/dockviewPanel';
import { DockviewPanelModelMock } from '../__mocks__/mockDockviewPanelModel';
import { IContentRenderer, ITabRenderer } from '../../dockview/types';
import { OverlayRenderContainer } from '../../overlay/overlayRenderContainer';
import { IDockviewPanelModel } from '../../dockview/dockviewPanelModel';
import { ContentContainer } from '../../dockview/components/panel/content';

describe('dockviewGroupPanel', () => {
    test('default minimum/maximium width/height', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidActivePanelChange: jest.fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            onDidOptionsChange: jest.fn(),
        });
        const options = fromPartial<GroupOptions>({});
        const cut = new DockviewGroupPanel(accessor, 'test_id', options);

        expect(cut.minimumWidth).toBe(100);
        expect(cut.minimumHeight).toBe(100);
        expect(cut.maximumHeight).toBe(Number.MAX_SAFE_INTEGER);
        expect(cut.maximumWidth).toBe(Number.MAX_SAFE_INTEGER);
    });

    test('that onDidActivePanelChange is configured at inline', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidActivePanelChange: jest.fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            options: {},
            api: {},
            renderer: 'always',
            overlayRenderContainer: {
                attach: jest.fn(),
                detatch: jest.fn(),
            },
            doSetGroupActive: jest.fn(),
            onDidOptionsChange: jest.fn(),
        });
        const options = fromPartial<GroupOptions>({});

        const cut = new DockviewGroupPanel(accessor, 'test_id', options);

        let counter = 0;

        cut.api.onDidActivePanelChange((event) => {
            counter++;
        });

        cut.model.openPanel(
            fromPartial<IDockviewPanel>({
                updateParentGroup: jest.fn(),
                view: {
                    tab: { element: document.createElement('div') },
                    content: new ContentContainer(accessor, cut.model),
                },
                api: {
                    renderer: 'onlyWhenVisible',
                    onDidTitleChange: jest.fn(),
                    onDidParametersChange: jest.fn(),
                },
                layout: jest.fn(),
                runEvents: jest.fn(),
            })
        );

        expect(counter).toBe(1);
    });

    test('group constraints', () => {
        const accessor = fromPartial<DockviewComponent>({
            onDidActivePanelChange: jest.fn(),
            onDidAddPanel: jest.fn(),
            onDidRemovePanel: jest.fn(),
            doSetGroupActive: jest.fn(),
            overlayRenderContainer: fromPartial<OverlayRenderContainer>({
                attach: jest.fn(),
                detatch: jest.fn(),
            }),
            options: {},
            onDidOptionsChange: jest.fn(),
        });
        const options = fromPartial<GroupOptions>({});
        const cut = new DockviewGroupPanel(accessor, 'test_id', options);

        cut.api.setConstraints({
            minimumHeight: 10,
            maximumHeight: 100,
            minimumWidth: 20,
            maximumWidth: 200,
        });

        expect(cut.minimumWidth).toBe(20);
        expect(cut.minimumHeight).toBe(10);
        expect(cut.maximumHeight).toBe(100);
        expect(cut.maximumWidth).toBe(200);

        const panelModel = new DockviewPanelModelMock(
            'content_component',
            fromPartial<IContentRenderer>({
                element: document.createElement('div'),
            }),
            'tab_component',
            fromPartial<ITabRenderer>({
                element: document.createElement('div'),
            })
        );

        const panel = new DockviewPanel(
            'panel_id',
            'component_id',
            undefined,
            accessor,
            accessor.api,
            cut,
            panelModel,
            {
                renderer: 'onlyWhenVisible',
                minimumWidth: 21,
                minimumHeight: 11,
                maximumHeight: 101,
                maximumWidth: 201,
            }
        );

        cut.model.openPanel(panel);

        // explicit group constraints now override panel constraints

        expect(cut.minimumWidth).toBe(20);
        expect(cut.minimumHeight).toBe(10);
        expect(cut.maximumHeight).toBe(100);
        expect(cut.maximumWidth).toBe(200);

        const panel2 = new DockviewPanel(
            'panel_id',
            'component_id',
            undefined,
            accessor,
            accessor.api,
            cut,
            panelModel,
            {
                renderer: 'onlyWhenVisible',
                minimumWidth: 22,
                minimumHeight: 12,
                maximumHeight: 102,
                maximumWidth: 202,
            }
        );

        cut.model.openPanel(panel2);

        // explicit group constraints still override panel constraints

        expect(cut.minimumWidth).toBe(20);
        expect(cut.minimumHeight).toBe(10);
        expect(cut.maximumHeight).toBe(100);
        expect(cut.maximumWidth).toBe(200);

        const panel3 = new DockviewPanel(
            'panel_id',
            'component_id',
            undefined,
            accessor,
            accessor.api,
            cut,
            panelModel,
            {
                renderer: 'onlyWhenVisible',
            }
        );

        cut.model.openPanel(panel3);

        // active panel without specified constraints so falls back to group constraints

        expect(cut.minimumWidth).toBe(20);
        expect(cut.minimumHeight).toBe(10);
        expect(cut.maximumHeight).toBe(100);
        expect(cut.maximumWidth).toBe(200);
    });
});
