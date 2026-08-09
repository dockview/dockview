import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
import {
    createGridview,
    GridviewApi,
    PROPERTY_KEYS_GRIDVIEW,
    Orientation,
} from 'dockview';
import GridviewVue from '../gridview/gridview.vue';
import { VueGridviewPanelView } from '../gridview/view';
import { VuePart } from '../utils';
import * as gridviewTypes from '../gridview/types';

const MockGridComponent = defineComponent({
    name: 'MockGridComponent',
    props: ['params', 'api', 'containerApi'],
    template: '<div class="mock-grid">Grid</div>',
});

describe('GridviewVue Component', () => {
    test('should export component types', () => {
        expect(gridviewTypes).toBeDefined();
        expect(typeof gridviewTypes).toBe('object');
    });

    test('should export dockview-core functionality', () => {
        expect(createGridview).toBeDefined();
        expect(PROPERTY_KEYS_GRIDVIEW).toBeDefined();
    });

    test('should have correct gridview properties', () => {
        expect(PROPERTY_KEYS_GRIDVIEW).toContain('proportionalLayout');
        expect(PROPERTY_KEYS_GRIDVIEW).toContain('hideBorders');
        expect(PROPERTY_KEYS_GRIDVIEW).toContain('disableAutoResizing');
    });

    test('should create gridview instance with DOM element', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        const api = createGridview(element, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: true,
            hideBorders: false,
            createComponent: () =>
                new VueGridviewPanelView(
                    'test',
                    'test-component',
                    { template: '<div>Test</div>' } as any,
                    {} as any
                ),
        });

        expect(api).toBeDefined();
        expect(typeof api.layout).toBe('function');
        expect(typeof api.dispose).toBe('function');
        expect(typeof api.addPanel).toBe('function');
        expect(typeof api.updateOptions).toBe('function');

        api.dispose();
        document.body.removeChild(element);
    });

    test('should handle proportional layout changes', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);

        const api = createGridview(element, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: false,
            createComponent: () =>
                new VueGridviewPanelView(
                    'test',
                    'test-component',
                    { template: '<div>Test</div>' } as any,
                    {} as any
                ),
        });

        api.updateOptions({ proportionalLayout: true });

        // Test passes if no errors are thrown
        expect(true).toBe(true);

        api.dispose();
        document.body.removeChild(element);
    });

    test('should add and manage grid panels', () => {
        const initSpy = vi
            .spyOn(VuePart.prototype, 'init')
            .mockImplementation(() => {});

        const element = document.createElement('div');
        document.body.appendChild(element);

        const api = createGridview(element, {
            orientation: Orientation.HORIZONTAL,
            proportionalLayout: true,
            createComponent: (options) =>
                new VueGridviewPanelView(
                    options.id,
                    options.name,
                    { template: '<div>Test</div>' } as any,
                    {} as any
                ),
        });

        api.addPanel({
            id: 'grid-panel-1',
            component: 'test-component',
        });

        expect(api.panels).toHaveLength(1);
        expect(api.panels[0].id).toBe('grid-panel-1');
        expect(initSpy).toHaveBeenCalled();

        api.removePanel(api.panels[0]);
        expect(api.panels).toHaveLength(0);

        initSpy.mockRestore();
        api.dispose();
        document.body.removeChild(element);
    });
});

describe('VueGridviewPanelView', () => {
    let mockVueInstance: any;
    let mockVueComponent: any;
    let panelView: VueGridviewPanelView;

    beforeEach(() => {
        mockVueInstance = {
            appContext: { components: {} },
            components: {},
            parent: null,
        };

        mockVueComponent = {
            props: { params: Object, api: Object, containerApi: Object },
            template: '<div>Test Gridview Panel</div>',
        };

        panelView = new VueGridviewPanelView(
            'gridview-test-id',
            'gridview-test-component',
            mockVueComponent as any,
            mockVueInstance
        );
    });

    test('should create panel view with correct properties', () => {
        expect(panelView.id).toBe('gridview-test-id');
        expect(panelView.element).toBeInstanceOf(HTMLElement);
        expect(panelView.element.style.height).toBe('100%');
        expect(panelView.element.style.width).toBe('100%');
        expect(panelView.element.style.overflow).toBe('hidden');
    });

    test('should implement GridviewPanel interface', () => {
        expect(panelView.api).toBeDefined();
        expect(typeof panelView.getComponent).toBe('function');
        expect(panelView.element).toBeInstanceOf(HTMLElement);
    });

    test('should create framework part and call init when getComponent is called', () => {
        const initSpy = vi
            .spyOn(VuePart.prototype, 'init')
            .mockImplementation(() => {});

        // Mock _params to avoid accessor error
        (panelView as any)._params = {
            params: {},
            accessor: { id: 'test-accessor' },
        };

        const component = panelView.getComponent();
        expect(component).toBeDefined();
        expect(component.constructor.name).toBe('VuePart');
        expect(initSpy).toHaveBeenCalled();

        initSpy.mockRestore();
    });

    test('should handle empty params', () => {
        const initSpy = vi
            .spyOn(VuePart.prototype, 'init')
            .mockImplementation(() => {});

        // Mock _params to avoid accessor error
        (panelView as any)._params = {
            params: {},
            accessor: { id: 'test-accessor' },
        };

        const component = panelView.getComponent();
        expect(component).toBeDefined();

        initSpy.mockRestore();
    });
});

// Regression coverage for https://github.com/dockview/dockview/issues/1301
describe('GridviewVue components prop resolves without registration', () => {
    let wrapper: ReturnType<typeof mount>;

    afterEach(() => {
        wrapper?.unmount();
    });

    test('addPanel resolves component from props.components alone', async () => {
        wrapper = mount(GridviewVue, {
            props: {
                orientation: Orientation.HORIZONTAL,
                components: { Cell: MockGridComponent },
            },
            attachTo: document.body,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as GridviewApi;

        expect(() =>
            api.addPanel({ id: 'cell-1', component: 'Cell' })
        ).not.toThrow();

        expect(api.getPanel('cell-1')).toBeDefined();
    });

    test('changing the components prop at runtime does not crash', async () => {
        // Regression test: useViewComponent used to call getCurrentInstance()
        // inside the async `components` watcher, where Vue returns null, so
        // updating the prop at runtime threw. The instance is now captured
        // once during setup.
        const Other = defineComponent({
            name: 'OtherGridComponent',
            props: ['params'],
            template: '<div class="other-grid">Other</div>',
        });

        wrapper = mount(GridviewVue, {
            props: {
                orientation: Orientation.HORIZONTAL,
                components: { Cell: MockGridComponent },
            },
            attachTo: document.body,
        });
        await flushPromises();

        await expect(
            wrapper.setProps({ components: { Cell: Other } })
        ).resolves.not.toThrow();

        const api = (wrapper.emitted('ready')![0][0] as any).api as GridviewApi;
        expect(() =>
            api.addPanel({ id: 'cell-1', component: 'Cell' })
        ).not.toThrow();
    });

    test('throws when component name is not in the map and not registered', async () => {
        wrapper = mount(GridviewVue, {
            props: {
                orientation: Orientation.HORIZONTAL,
                components: { Cell: MockGridComponent },
            },
            attachTo: document.body,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as GridviewApi;

        expect(() =>
            api.addPanel({ id: 'bad', component: 'NotRegistered' })
        ).toThrow("Failed to find Vue Component 'NotRegistered'");
    });

    test('changing the components prop at runtime refreshes the map without throwing', async () => {
        const errors: unknown[] = [];

        wrapper = mount(GridviewVue, {
            props: {
                orientation: Orientation.HORIZONTAL,
                components: { Cell: MockGridComponent },
            },
            attachTo: document.body,
            global: {
                config: {
                    // the components watcher previously re-called
                    // getCurrentInstance() during the scheduler flush (returns
                    // null) and threw; Vue routes that to the app error handler
                    errorHandler: (err: unknown) => errors.push(err),
                },
            },
        });
        await flushPromises();

        const Extra = defineComponent({
            name: 'ExtraComponent',
            props: ['params', 'api', 'containerApi'],
            template: '<div class="mock-extra">Extra</div>',
        });

        // swap in a brand-new components object (new reference) at runtime
        await wrapper.setProps({
            components: { Cell: MockGridComponent, Extra },
        });
        await flushPromises();

        expect(errors).toEqual([]);

        const api = (wrapper.emitted('ready')![0][0] as any).api as GridviewApi;

        expect(() =>
            api.addPanel({ id: 'extra-1', component: 'Extra' })
        ).not.toThrow();
        expect(api.getPanel('extra-1')).toBeDefined();
    });
});

test('forwards fallthrough attributes onto the host element (multi-root inheritance regression)', async () => {
    // The component has two root nodes (host element + <DockviewPortals>), so
    // Vue cannot auto-inherit fallthrough attributes. inheritAttrs:false plus
    // v-bind="$attrs" on the host restores it; without them a consumer's
    // `class`/`style` (e.g. a theme class) would land on nothing (see #1369).
    const wrapper = mount(GridviewVue, {
        attrs: { class: 'dockview-theme-test', 'data-example': 'gridview' },
        attachTo: document.body,
    });
    await flushPromises();

    const host = document.querySelector(
        '.dockview-theme-test'
    ) as HTMLElement | null;
    expect(host).not.toBeNull();
    expect(host!.getAttribute('data-example')).toBe('gridview');

    wrapper.unmount();
});
