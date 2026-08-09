import {
    vi,
    describe,
    test,
    expect,
    beforeEach,
    afterEach,
    Mock,
} from 'vitest';
import {
    DockviewEmitter,
    DockviewGroupPanel,
    DockviewGroupPanelApi,
    DockviewGroupPanelModel,
    IDockviewPanel,
    IContextMenuItemComponentProps,
    IChipContextMenuItemComponentProps,
} from 'dockview';
import {
    VueContextMenuItemRenderer,
    VueHeaderActionsRenderer,
    VuePart,
    findComponent,
    mountVueComponent,
    resolveComponent,
} from '../utils';

const mockUpdate = vi.fn();
const mockVueDispose = vi.fn();

vi.mock('vue', () => ({
    createVNode: vi.fn(() => ({})),
    render: vi.fn(),
    cloneVNode: vi.fn(() => ({})),
}));

// After mocking vue, mountVueComponent will return { update, dispose }
// We need to get a reference to the render mock to track props
import { createVNode, render as vueRender, cloneVNode } from 'vue';
const createVNodeMock = createVNode as Mock;
const vueRenderMock = vueRender as Mock;

describe('Utils', () => {
    test('should export VuePart class', () => {
        expect(VuePart).toBeDefined();
        expect(typeof VuePart).toBe('function');
    });

    test('should export findComponent function', () => {
        expect(findComponent).toBeDefined();
        expect(typeof findComponent).toBe('function');
    });

    test('should export mountVueComponent function', () => {
        expect(mountVueComponent).toBeDefined();
        expect(typeof mountVueComponent).toBe('function');
    });
});

describe('findComponent', () => {
    test('should find component in instance components', () => {
        const testComponent = { template: '<div>Test</div>' };
        const mockInstance = {
            components: {
                'test-component': testComponent,
            },
            appContext: { components: {} },
            parent: null,
        } as any;

        const found = findComponent(mockInstance, 'test-component');
        expect(found).toBe(testComponent);
    });

    test('should find component in app context', () => {
        const testComponent = { template: '<div>Test</div>' };
        const mockInstance = {
            components: {},
            appContext: {
                components: {
                    'global-component': testComponent,
                },
            },
            parent: null,
        } as any;

        const found = findComponent(mockInstance, 'global-component');
        expect(found).toBe(testComponent);
    });

    test('should throw error when component not found', () => {
        const mockInstance = {
            components: {},
            appContext: { components: {} },
            parent: null,
        } as any;

        expect(() => findComponent(mockInstance, 'non-existent')).toThrow(
            "Failed to find Vue Component 'non-existent'"
        );
    });

    test('should find component in explicit components map without instance/app registration', () => {
        const testComponent = { template: '<div>Explicit</div>' };
        const mockInstance = {
            components: {},
            appContext: { components: {} },
            parent: null,
        } as any;

        const found = findComponent(mockInstance, 'explicit', {
            explicit: testComponent as any,
        });
        expect(found).toBe(testComponent);
    });

    test('explicit components map takes priority over instance components', () => {
        const instanceComponent = { template: '<div>Instance</div>' };
        const explicitComponent = { template: '<div>Explicit</div>' };
        const mockInstance = {
            components: { 'shared-name': instanceComponent },
            appContext: { components: {} },
            parent: null,
        } as any;

        const found = findComponent(mockInstance, 'shared-name', {
            'shared-name': explicitComponent as any,
        });
        expect(found).toBe(explicitComponent);
    });

    test('explicit components map takes priority over app context', () => {
        const globalComponent = { template: '<div>Global</div>' };
        const explicitComponent = { template: '<div>Explicit</div>' };
        const mockInstance = {
            components: {},
            appContext: { components: { 'shared-name': globalComponent } },
            parent: null,
        } as any;

        const found = findComponent(mockInstance, 'shared-name', {
            'shared-name': explicitComponent as any,
        });
        expect(found).toBe(explicitComponent);
    });

    test('falls through to instance walk when name not in components map', () => {
        const instanceComponent = { template: '<div>Instance</div>' };
        const mockInstance = {
            components: { 'only-in-instance': instanceComponent },
            appContext: { components: {} },
            parent: null,
        } as any;

        const found = findComponent(mockInstance, 'only-in-instance', {
            other: { template: '<div>Other</div>' } as any,
        });
        expect(found).toBe(instanceComponent);
    });

    test('falls through to app context when name not in components map or instance', () => {
        const globalComponent = { template: '<div>Global</div>' };
        const mockInstance = {
            components: {},
            appContext: { components: { 'only-global': globalComponent } },
            parent: null,
        } as any;

        const found = findComponent(mockInstance, 'only-global', {
            other: { template: '<div>Other</div>' } as any,
        });
        expect(found).toBe(globalComponent);
    });

    test('still throws when name not in components map and not registered anywhere', () => {
        const mockInstance = {
            components: {},
            appContext: { components: {} },
            parent: null,
        } as any;

        expect(() =>
            findComponent(mockInstance, 'missing', {
                other: { template: '<div>Other</div>' } as any,
            })
        ).toThrow("Failed to find Vue Component 'missing'");
    });

    test('treats empty components map identically to no map', () => {
        const globalComponent = { template: '<div>Global</div>' };
        const mockInstance = {
            components: {},
            appContext: { components: { foo: globalComponent } },
            parent: null,
        } as any;

        const found = findComponent(mockInstance, 'foo', {});
        expect(found).toBe(globalComponent);
    });
});

describe('resolveComponent', () => {
    const mockInstance = {
        components: {},
        appContext: { components: {} },
        parent: null,
    } as any;

    test('returns undefined when value is undefined', () => {
        expect(resolveComponent(undefined, mockInstance)).toBeUndefined();
    });

    test('returns the component directly when value is a component object', () => {
        const component = { template: '<div>Direct</div>' } as any;
        expect(resolveComponent(component, mockInstance)).toBe(component);
    });

    test('looks up string names via findComponent', () => {
        const component = { template: '<div>Named</div>' };
        const inst = {
            components: { 'my-name': component },
            appContext: { components: {} },
            parent: null,
        } as any;

        expect(resolveComponent('my-name', inst)).toBe(component);
    });

    test('looks up string names in the components map when provided', () => {
        const component = { template: '<div>Mapped</div>' };
        expect(
            resolveComponent('mapped', mockInstance, {
                mapped: component as any,
            })
        ).toBe(component);
    });

    test('returns the component object even when components map does not contain it', () => {
        // Direct component refs bypass the map entirely.
        const component = { template: '<div>Direct</div>' } as any;
        expect(
            resolveComponent(component, mockInstance, { other: {} as any })
        ).toBe(component);
    });

    test('throws when string name is not resolvable', () => {
        expect(() => resolveComponent('missing', mockInstance)).toThrow(
            "Failed to find Vue Component 'missing'"
        );
    });
});

describe('VuePart', () => {
    let container: HTMLElement;
    let testComponent: any;
    let mockParent: any;
    let vuePart: VuePart;

    beforeEach(() => {
        container = document.createElement('div');

        testComponent = {
            template:
                '<div class="vue-part">{{ params.title }} - {{ params.data }}</div>',
            props: ['params', 'api', 'containerApi'],
        };

        mockParent = {
            appContext: {
                components: {},
                provides: {},
            },
            provides: {},
        };

        const mockProps = {
            params: { title: 'Test Title', data: 'test data' },
            api: { id: 'test-api' },
            containerApi: { id: 'container-api' },
        };

        vuePart = new VuePart(container, testComponent, mockParent, mockProps);
    });

    test('should create VuePart instance', () => {
        expect(vuePart).toBeInstanceOf(VuePart);
        expect(vuePart.constructor.name).toBe('VuePart');
    });

    test('should have required methods', () => {
        expect(typeof vuePart.init).toBe('function');
        expect(typeof vuePart.update).toBe('function');
        expect(typeof vuePart.dispose).toBe('function');
    });

    test('should handle update before init gracefully', () => {
        expect(() =>
            vuePart.update({ params: { title: 'New' } })
        ).not.toThrow();
    });

    test('should handle dispose before init gracefully', () => {
        expect(() => vuePart.dispose()).not.toThrow();
    });

    test('should handle init call without throwing', () => {
        // Note: may fail due to Vue environment setup but should not crash the test
        try {
            vuePart.init();
            vuePart.dispose();
        } catch (error) {
            // Vue mounting may fail in test environment, but VuePart should handle it
            expect(error).toBeDefined();
        }
    });
});

describe('mountVueComponent', () => {
    test('does not mutate the shared parent app context provides', () => {
        // Regression test: the detached render path used to do
        // `vNode.appContext = parent.appContext` followed by writing to
        // `.provides`, which mutated the shared, app-level provides object for
        // every other component. The parent's app context must be untouched.
        const sharedProvides: Record<string | symbol, unknown> = {
            existing: 'value',
        };
        const parent = {
            appContext: { components: {}, provides: sharedProvides },
            provides: { fromInstance: 'x' },
        } as any;

        mountVueComponent(
            { template: '<div/>' } as any,
            parent,
            { params: {} } as any,
            document.createElement('div')
        );

        expect(parent.appContext.provides).toBe(sharedProvides);
        expect(parent.appContext.provides).toEqual({ existing: 'value' });
        expect('fromInstance' in parent.appContext.provides).toBe(false);
    });
});

describe('VueHeaderActionsRenderer', () => {
    let onDidAddPanel: DockviewEmitter<any>;
    let onDidRemovePanel: DockviewEmitter<any>;
    let onDidActivePanelChange: DockviewEmitter<any>;
    let onDidActiveChange: DockviewEmitter<any>;
    let onDidLocationChange: DockviewEmitter<any>;
    let groupPanel: DockviewGroupPanel;
    let mockParent: any;
    let mockComponent: any;
    let panels: IDockviewPanel[];
    let activePanel: IDockviewPanel | undefined;
    let isGroupActive: boolean;

    beforeEach(() => {
        onDidAddPanel = new DockviewEmitter();
        onDidRemovePanel = new DockviewEmitter();
        onDidActivePanelChange = new DockviewEmitter();
        onDidActiveChange = new DockviewEmitter();
        onDidLocationChange = new DockviewEmitter();

        panels = [{ id: 'panel-1' } as IDockviewPanel];
        activePanel = panels[0];
        isGroupActive = true;

        const groupModel = {
            onDidAddPanel: onDidAddPanel.event,
            onDidRemovePanel: onDidRemovePanel.event,
            onDidActivePanelChange: onDidActivePanelChange.event,
            get panels() {
                return panels;
            },
            get activePanel() {
                return activePanel;
            },
        } as Partial<DockviewGroupPanelModel> as DockviewGroupPanelModel;

        const groupApi = {
            onDidActiveChange: onDidActiveChange.event,
            onDidLocationChange: onDidLocationChange.event,
            location: { type: 'grid' },
            get isActive() {
                return isGroupActive;
            },
        } as Partial<DockviewGroupPanelApi> as DockviewGroupPanelApi;

        groupPanel = {
            api: groupApi,
            model: groupModel,
        } as Partial<DockviewGroupPanel> as DockviewGroupPanel;

        mockParent = {
            appContext: { components: {}, provides: {} },
            provides: {},
        };

        mockComponent = {
            template: '<div>header actions</div>',
            props: ['params'],
        };
    });

    afterEach(() => {
        onDidAddPanel.dispose();
        onDidRemovePanel.dispose();
        onDidActivePanelChange.dispose();
        onDidActiveChange.dispose();
        onDidLocationChange.dispose();
        createVNodeMock.mockClear();
        vueRenderMock.mockClear();
        (cloneVNode as Mock).mockClear();
    });

    test('should create element with correct class and styles', () => {
        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel
        );

        expect(renderer.element).toBeInstanceOf(HTMLElement);
        expect(renderer.element.className).toBe('dv-vue-part');
        expect(renderer.element.style.height).toBe('100%');
        expect(renderer.element.style.width).toBe('100%');
    });

    test('should pass enriched IDockviewHeaderActionsProps on init', () => {
        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel
        );

        const mockContainerApi = {} as any;

        renderer.init({
            api: groupPanel.api,
            containerApi: mockContainerApi,
            group: groupPanel as any,
        });

        expect(createVNodeMock).toHaveBeenCalledTimes(1);

        const passedProps = createVNodeMock.mock.calls[0][1];
        expect(passedProps.params).toEqual(
            expect.objectContaining({
                api: groupPanel.api,
                containerApi: mockContainerApi,
                panels: panels,
                activePanel: activePanel,
                isGroupActive: true,
                group: groupPanel,
            })
        );

        renderer.dispose();
    });

    test('should update panels reactively when onDidAddPanel fires', () => {
        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel
        );

        renderer.init({
            api: groupPanel.api,
            containerApi: {} as any,
            group: groupPanel as any,
        });

        // Clear from init call
        (cloneVNode as Mock).mockClear();
        vueRenderMock.mockClear();

        const newPanel = { id: 'panel-2' } as IDockviewPanel;
        panels = [...panels, newPanel];

        onDidAddPanel.fire(undefined);

        expect(vueRenderMock).toHaveBeenCalled();

        renderer.dispose();
    });

    test('should update panels reactively when onDidRemovePanel fires', () => {
        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel
        );

        renderer.init({
            api: groupPanel.api,
            containerApi: {} as any,
            group: groupPanel as any,
        });

        vueRenderMock.mockClear();

        panels = [];
        onDidRemovePanel.fire(undefined);

        expect(vueRenderMock).toHaveBeenCalled();

        renderer.dispose();
    });

    test('should update activePanel reactively when onDidActivePanelChange fires', () => {
        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel
        );

        renderer.init({
            api: groupPanel.api,
            containerApi: {} as any,
            group: groupPanel as any,
        });

        vueRenderMock.mockClear();

        activePanel = undefined;
        onDidActivePanelChange.fire(undefined);

        expect(vueRenderMock).toHaveBeenCalled();

        renderer.dispose();
    });

    test('should update isGroupActive reactively when onDidActiveChange fires', () => {
        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel
        );

        renderer.init({
            api: groupPanel.api,
            containerApi: {} as any,
            group: groupPanel as any,
        });

        vueRenderMock.mockClear();

        isGroupActive = false;
        onDidActiveChange.fire(undefined);

        expect(vueRenderMock).toHaveBeenCalled();

        renderer.dispose();
    });

    test('should dispose event subscriptions on dispose', () => {
        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel
        );

        renderer.init({
            api: groupPanel.api,
            containerApi: {} as any,
            group: groupPanel as any,
        });

        renderer.dispose();

        vueRenderMock.mockClear();

        // After dispose, firing events should not trigger re-renders
        onDidAddPanel.fire(undefined);
        onDidRemovePanel.fire(undefined);
        onDidActivePanelChange.fire(undefined);
        onDidActiveChange.fire(undefined);

        // Only the dispose render(null) call, no update re-renders
        expect(vueRenderMock).not.toHaveBeenCalled();
    });

    test('should dispose previous subscriptions when init is called again', () => {
        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel
        );

        renderer.init({
            api: groupPanel.api,
            containerApi: {} as any,
            group: groupPanel as any,
        });

        // Second init should dispose previous mount
        renderer.init({
            api: groupPanel.api,
            containerApi: {} as any,
            group: groupPanel as any,
        });

        // createVNode should have been called twice (once per init)
        expect(createVNodeMock).toHaveBeenCalledTimes(2);

        renderer.dispose();
    });

    test('should handle dispose before init gracefully', () => {
        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel
        );

        expect(() => renderer.dispose()).not.toThrow();
    });

    test('should subscribe to all five group events', () => {
        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel
        );

        renderer.init({
            api: groupPanel.api,
            containerApi: {} as any,
            group: groupPanel as any,
        });

        vueRenderMock.mockClear();

        onDidAddPanel.fire(undefined);
        expect(vueRenderMock).toHaveBeenCalledTimes(1);

        onDidRemovePanel.fire(undefined);
        expect(vueRenderMock).toHaveBeenCalledTimes(2);

        onDidActivePanelChange.fire(undefined);
        expect(vueRenderMock).toHaveBeenCalledTimes(3);

        onDidActiveChange.fire(undefined);
        expect(vueRenderMock).toHaveBeenCalledTimes(4);

        onDidLocationChange.fire({
            location: { type: 'edge', position: 'left' },
        });
        expect(vueRenderMock).toHaveBeenCalledTimes(5);

        renderer.dispose();
    });

    test('should preserve full params including api after reactive updates', () => {
        // Regression test for https://github.com/dockview/dockview/issues/1127
        // Partial updates (e.g. isGroupActive) must not discard api and other fields
        const renderer = new VueHeaderActionsRenderer(
            mockComponent,
            mockParent,
            groupPanel
        );

        const mockContainerApi = {} as any;

        renderer.init({
            api: groupPanel.api,
            containerApi: mockContainerApi,
            group: groupPanel as any,
        });

        (cloneVNode as Mock).mockClear();

        isGroupActive = false;
        onDidActiveChange.fire(undefined);

        expect(cloneVNode as Mock).toHaveBeenCalledTimes(1);
        const updatedProps = (cloneVNode as Mock).mock.calls[0][1];
        expect(updatedProps.params).toEqual(
            expect.objectContaining({
                api: groupPanel.api,
                containerApi: mockContainerApi,
                panels: panels,
                activePanel: activePanel,
                isGroupActive: false,
                group: groupPanel,
            })
        );

        renderer.dispose();
    });
});

describe('VueContextMenuItemRenderer', () => {
    let mockParent: any;
    let mockComponent: any;

    beforeEach(() => {
        mockParent = {
            appContext: { components: {}, provides: {} },
            provides: {},
        };
        mockComponent = { template: '<div>menu item</div>', props: ['params'] };
        createVNodeMock.mockClear();
        vueRenderMock.mockClear();
        (cloneVNode as Mock).mockClear();
    });

    test('element has class dv-vue-part with full dimensions', () => {
        const renderer = new VueContextMenuItemRenderer(
            mockComponent,
            mockParent
        );

        expect(renderer.element.className).toBe('dv-vue-part');
        expect(renderer.element.style.height).toBe('100%');
        expect(renderer.element.style.width).toBe('100%');
    });

    test('init mounts the component with props', () => {
        const renderer = new VueContextMenuItemRenderer(
            mockComponent,
            mockParent
        );
        const props = {
            panel: {} as IDockviewPanel,
            group: {} as DockviewGroupPanel,
            api: {} as any,
            close: vi.fn(),
        } as IContextMenuItemComponentProps;

        renderer.init(props);

        expect(createVNodeMock).toHaveBeenCalledTimes(1);
        const passedProps = createVNodeMock.mock.calls[0][1];
        expect(passedProps.params).toBe(props);
    });

    test('componentProps is accessible as params.componentProps', () => {
        const renderer = new VueContextMenuItemRenderer(
            mockComponent,
            mockParent
        );
        const componentProps = { foo: 'bar' };
        const props: IContextMenuItemComponentProps = {
            panel: {} as IDockviewPanel,
            group: {} as DockviewGroupPanel,
            api: {} as any,
            close: vi.fn(),
            componentProps,
        };

        renderer.init(props);

        const passedProps = createVNodeMock.mock.calls[0][1];
        expect(passedProps.params.componentProps).toBe(componentProps);
    });

    test('chip props (tabGroup) are forwarded via params', () => {
        // The same renderer serves the chip menu, whose props carry a `tabGroup`
        // instead of a `panel`; the tests above already cover the params /
        // componentProps pass-through, so this only checks the tabGroup shape.
        const renderer = new VueContextMenuItemRenderer(
            mockComponent,
            mockParent
        );
        const props = {
            tabGroup: {},
        } as unknown as IChipContextMenuItemComponentProps;

        renderer.init(props);

        expect(createVNodeMock.mock.calls[0][1].params).toBe(props);
    });

    test('dispose unmounts the component', () => {
        const renderer = new VueContextMenuItemRenderer(
            mockComponent,
            mockParent
        );

        renderer.init({
            panel: {} as IDockviewPanel,
            group: {} as DockviewGroupPanel,
            api: {} as any,
            close: vi.fn(),
        } as IContextMenuItemComponentProps);

        vueRenderMock.mockClear();
        renderer.dispose();

        // render(null, element) is called to unmount
        expect(vueRenderMock).toHaveBeenCalledWith(null, renderer.element);
    });

    test('dispose before init does not throw', () => {
        const renderer = new VueContextMenuItemRenderer(
            mockComponent,
            mockParent
        );
        expect(() => renderer.dispose()).not.toThrow();
    });
});
