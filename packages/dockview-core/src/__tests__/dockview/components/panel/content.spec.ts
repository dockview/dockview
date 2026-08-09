import { fireEvent } from '@testing-library/dom';
import { ContentContainer } from '../../../../dockview/components/panel/content';
import {
    GroupPanelPartInitParameters,
    IContentRenderer,
} from '../../../../dockview/types';
import { CompositeDisposable } from '../../../../lifecycle';
import { PanelUpdateEvent } from '../../../../panel/types';
import { IDockviewPanel } from '../../../../dockview/dockviewPanel';
import { IDockviewPanelModel } from '../../../../dockview/dockviewPanelModel';
import { DockviewComponent } from '../../../../dockview/dockviewComponent';
import { fromPartial } from '@total-typescript/shoehorn';
import { DockviewGroupPanelModel } from '../../../../dockview/dockviewGroupPanelModel';
import { createOffsetDragOverEvent } from '../../../__test_utils__/utils';
import { OverlayRenderContainer } from '../../../../overlay/overlayRenderContainer';

class TestContentRenderer
    extends CompositeDisposable
    implements IContentRenderer
{
    readonly element: HTMLElement;

    constructor(public id: string) {
        super();
        this.element = document.createElement('div');
        this.element.id = id;
    }

    init(parameters: GroupPanelPartInitParameters): void {
        //
    }

    layout(width: number, height: number): void {
        //
    }
    update(event: PanelUpdateEvent): void {
        //
    }

    toJSON(): object {
        return {};
    }

    focus(): void {
        //
    }

    onShow?(): void;
    onHide?(): void;
}

describe('contentContainer', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    test('basic focus test', () => {
        let focus = 0;
        let blur = 0;

        const disposable = new CompositeDisposable();

        const overlayRenderContainer = new OverlayRenderContainer(
            document.createElement('div'),
            fromPartial<DockviewComponent>({})
        );

        const cut = new ContentContainer(
            fromPartial<DockviewComponent>({
                renderer: 'onlyWhenVisible',
                overlayRenderContainer,
            }),
            fromPartial<DockviewGroupPanelModel>({
                renderContainer: overlayRenderContainer,
            })
        );

        disposable.addDisposables(
            cut.onDidFocus(() => {
                focus++;
            }),
            cut.onDidBlur(() => {
                blur++;
            })
        );

        const contentRenderer = new TestContentRenderer('id-1');

        const panel = fromPartial<IDockviewPanel>({
            view: {
                content: contentRenderer,
            },
            api: { renderer: 'onlyWhenVisible' },
        });

        cut.openPanel(panel as IDockviewPanel);

        expect(focus).toBe(0);
        expect(blur).toBe(0);

        fireEvent.focus(contentRenderer.element);
        expect(focus).toBe(1);
        expect(blur).toBe(0);

        fireEvent.blur(contentRenderer.element);
        jest.runAllTimers();
        expect(focus).toBe(1);
        expect(blur).toBe(1);

        const contentRenderer2 = new TestContentRenderer('id-2');

        const panel2 = {
            view: {
                content: contentRenderer2,
            } as Partial<IDockviewPanelModel>,
            api: { renderer: 'onlyWhenVisible' },
        } as Partial<IDockviewPanel>;

        cut.openPanel(panel2 as IDockviewPanel);
        // expect(focus).toBe(2);
        // expect(blur).toBe(1);

        fireEvent.focus(contentRenderer2.element);
        expect(focus).toBe(2);
        expect(blur).toBe(1);

        fireEvent.blur(contentRenderer2.element);
        jest.runAllTimers();
        expect(focus).toBe(2);
        expect(blur).toBe(2);

        disposable.dispose();
    });

    test('that onShow and onHide are called when switching panels with onlyWhenVisible renderer', () => {
        const overlayRenderContainer = fromPartial<OverlayRenderContainer>({
            detatch: jest.fn(),
        });

        const cut = new ContentContainer(
            fromPartial<DockviewComponent>({
                overlayRenderContainer,
            }),
            fromPartial<DockviewGroupPanelModel>({
                renderContainer: overlayRenderContainer,
            })
        );

        const renderer1 = new TestContentRenderer('panel_1');
        renderer1.onShow = jest.fn();
        renderer1.onHide = jest.fn();

        const renderer2 = new TestContentRenderer('panel_2');
        renderer2.onShow = jest.fn();
        renderer2.onHide = jest.fn();

        const panel1 = fromPartial<IDockviewPanel>({
            api: { renderer: 'onlyWhenVisible' },
            view: { content: renderer1 },
        });

        const panel2 = fromPartial<IDockviewPanel>({
            api: { renderer: 'onlyWhenVisible' },
            view: { content: renderer2 },
        });

        cut.openPanel(panel1);

        expect(renderer1.onShow).toHaveBeenCalledTimes(1);
        expect(renderer1.onHide).toHaveBeenCalledTimes(0);

        cut.openPanel(panel2);

        expect(renderer1.onHide).toHaveBeenCalledTimes(1);
        expect(renderer2.onShow).toHaveBeenCalledTimes(1);

        cut.closePanel();

        expect(renderer2.onHide).toHaveBeenCalledTimes(1);
    });

    test('that onShow and onHide are not called for panels without the hooks', () => {
        const overlayRenderContainer = fromPartial<OverlayRenderContainer>({
            detatch: jest.fn(),
        });

        const cut = new ContentContainer(
            fromPartial<DockviewComponent>({
                overlayRenderContainer,
            }),
            fromPartial<DockviewGroupPanelModel>({
                renderContainer: overlayRenderContainer,
            })
        );

        const panel1 = fromPartial<IDockviewPanel>({
            api: { renderer: 'onlyWhenVisible' },
            view: { content: new TestContentRenderer('panel_1') },
        });

        const panel2 = fromPartial<IDockviewPanel>({
            api: { renderer: 'onlyWhenVisible' },
            view: { content: new TestContentRenderer('panel_2') },
        });

        expect(() => {
            cut.openPanel(panel1);
            cut.openPanel(panel2);
            cut.closePanel();
        }).not.toThrow();
    });

    test("that panels renderered as 'onlyWhenVisible' are removed when closed", () => {
        const overlayRenderContainer = fromPartial<OverlayRenderContainer>({
            detatch: jest.fn(),
        });

        const cut = new ContentContainer(
            fromPartial<DockviewComponent>({
                overlayRenderContainer,
            }),
            fromPartial<DockviewGroupPanelModel>({
                renderContainer: overlayRenderContainer,
            })
        );

        const panel1 = fromPartial<IDockviewPanel>({
            api: {
                renderer: 'onlyWhenVisible',
            },
            view: { content: new TestContentRenderer('panel_1') },
        });

        const panel2 = fromPartial<IDockviewPanel>({
            api: {
                renderer: 'onlyWhenVisible',
            },
            view: { content: new TestContentRenderer('panel_2') },
        });

        cut.openPanel(panel1);

        expect(panel1.view.content.element.parentElement).toBe(cut.element);
        expect(cut.element.childNodes).toHaveLength(1);

        cut.openPanel(panel2);

        expect(panel1.view.content.element.parentElement).toBeNull();
        expect(panel2.view.content.element.parentElement).toBe(cut.element);
        expect(cut.element.childNodes).toHaveLength(1);
    });

    test('the resolved drop-position resolver drives the content drop target', () => {
        const resolver = { resolve: () => ({ position: 'right' as const }) };

        const cut = new ContentContainer(
            fromPartial<DockviewComponent>({
                getDropPositionResolver: () => resolver,
                options: {},
                resolveDropOverlayModel: () => undefined,
            }),
            fromPartial<DockviewGroupPanelModel>({
                canDisplayContentOverlay: () => true,
            })
        );

        jest.spyOn(cut.element, 'offsetWidth', 'get').mockReturnValue(200);
        jest.spyOn(cut.element, 'offsetHeight', 'get').mockReturnValue(100);

        fireEvent.dragEnter(cut.element);
        fireEvent(
            cut.element,
            createOffsetDragOverEvent({ clientX: 100, clientY: 50 })
        );

        // 100,50 in 200x100 is the centre by default; the option forces right.
        expect(cut.dropTarget.state).toBe('right');

        cut.dispose();
    });
});
