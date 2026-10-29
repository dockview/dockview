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

    test('setConstraints notifies the grid once, with the new constraints', () => {
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
        const cut = new DockviewGroupPanel(
            accessor,
            'test_id',
            fromPartial<GroupOptions>({})
        );

        const createPanel = (id: string, minimumWidth: number) =>
            new DockviewPanel(
                id,
                'component_id',
                undefined,
                accessor,
                accessor.api,
                cut,
                new DockviewPanelModelMock(
                    'content_component',
                    fromPartial<IContentRenderer>({
                        element: document.createElement('div'),
                    }),
                    'tab_component',
                    fromPartial<ITabRenderer>({
                        element: document.createElement('div'),
                    })
                ),
                { renderer: 'onlyWhenVisible', minimumWidth }
            );

        cut.model.openPanel(createPanel('panel_1', 21));
        expect(cut.minimumWidth).toBe(21);

        // the grid reads the group's constraints when it is notified
        const seen: number[] = [];
        cut.onDidChange(() => seen.push(cut.minimumWidth));

        cut.api.setConstraints({ minimumWidth: 50 });
        expect(seen).toEqual([50]);

        cut.api.setConstraints({ minimumWidth: () => 60 });
        expect(seen).toEqual([50, 60]);

        // the explicit constraint still wins over a new active panel, so the
        // grid is not told again
        cut.model.openPanel(createPanel('panel_2', 22));
        expect(cut.minimumWidth).toBe(60);
        expect(seen).toEqual([50, 60]);
    });

    /**
     * A group's min/max follow its active panel. The gridview branch above the
     * group caches its aggregate over child constraints, so switching tabs
     * must tell the grid the group's constraints changed or the root keeps the
     * previous panel's bounds.
     */
    describe('active panel constraints reach the grid', () => {
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
         * root V [ GP = H [ G1(p1, p2) , G4(p4) ], G3(p3) ]
         */
        function createDockview() {
            const container = document.createElement('div');
            const dockview = new DockviewComponent(container, {
                createComponent: () => new TestPanel(),
            });
            dockview.layout(1000, 1000);

            const p1 = dockview.addPanel({ id: 'p1', component: 'default' });
            const p3 = dockview.addPanel({
                id: 'p3',
                component: 'default',
                position: { referencePanel: 'p1', direction: 'below' },
            });
            dockview.addPanel({
                id: 'p4',
                component: 'default',
                position: { referencePanel: 'p1', direction: 'right' },
            });

            // reads (and caches) the aggregate with p1 active in G1
            expect(dockview.minimumHeight).toBe(200);

            const p2 = dockview.addPanel({
                id: 'p2',
                component: 'default',
                minimumHeight: 300,
                position: { referencePanel: 'p1' },
            });

            expect(p2.group).toBe(p1.group);
            expect(p1.group.activePanel).toBe(p2);

            return { dockview, p1, p2, p3 };
        }

        test('the component minimum follows the active panel of a group', () => {
            const { dockview, p1, p2 } = createDockview();

            expect(dockview.minimumHeight).toBe(400);

            p1.api.setActive();
            expect(dockview.minimumHeight).toBe(200);

            p2.api.setActive();
            expect(dockview.minimumHeight).toBe(400);

            dockview.dispose();
        });

        test('the root splitview clamps the group to its active panel minimum', () => {
            const { dockview, p1, p2, p3 } = createDockview();

            dockview.layout(1000, 400);

            // p2 (min 300) is active: the sibling cannot grow past 100
            p3.api.setSize({ height: 300 });
            expect(p3.group.api.height).toBe(100);
            expect(p1.group.api.height).toBe(300);

            // p1 (min 100) is active: the sibling may now take the space
            p1.api.setActive();
            p3.api.setSize({ height: 300 });
            expect(p3.group.api.height).toBe(300);
            expect(p1.group.api.height).toBe(100);

            // and back: the group reclaims its minimum from the sibling
            p2.api.setActive();
            expect(p1.group.api.height).toBe(300);
            expect(p3.group.api.height).toBe(100);

            dockview.dispose();
        });
    });
});
