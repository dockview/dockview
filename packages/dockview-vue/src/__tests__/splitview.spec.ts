import { vi, describe, test, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
import {
    createSplitview,
    Orientation,
    PROPERTY_KEYS_SPLITVIEW,
    SplitviewApi,
} from 'dockview';
import SplitviewVue from '../splitview/splitview.vue';
import { VueSplitviewPanelView } from '../splitview/view';
import { VuePart } from '../utils';
import * as splitviewTypes from '../splitview/types';

const MockSplitComponent = defineComponent({
    name: 'MockSplitComponent',
    props: ['params', 'api', 'containerApi'],
    template: '<div class="mock-split">Split</div>',
});

describe('SplitviewVue Component', () => {
    test('should export component types', () => {
        expect(splitviewTypes).toBeDefined();
        expect(typeof splitviewTypes).toBe('object');
    });

    test('should have access to orientation constants', () => {
        expect(Orientation.HORIZONTAL).toBeDefined();
        expect(Orientation.VERTICAL).toBeDefined();
    });

    test('should export dockview-core functionality', () => {
        expect(createSplitview).toBeDefined();
        expect(PROPERTY_KEYS_SPLITVIEW).toBeDefined();
    });

    test('should have correct splitview properties', () => {
        expect(PROPERTY_KEYS_SPLITVIEW).toContain('orientation');
        expect(PROPERTY_KEYS_SPLITVIEW).toContain('proportionalLayout');
        expect(PROPERTY_KEYS_SPLITVIEW).toContain('disableAutoResizing');
    });

    test('should create splitview with Vue framework support', () => {
        expect(typeof createSplitview).toBe('function');
        expect(typeof VueSplitviewPanelView).toBe('function');

        const mockVueComponent = { template: '<div>Test</div>' } as any;
        const mockParent = {} as any;

        const panelView = new VueSplitviewPanelView(
            'test-id',
            'test-component',
            mockVueComponent,
            mockParent
        );

        expect(panelView.id).toBe('test-id');
        expect(panelView.element).toBeInstanceOf(HTMLElement);
        expect(typeof panelView.getComponent).toBe('function');
    });

    test('should handle Vue component integration', () => {
        const mockComponent = {
            template:
                '<div class="vue-splitview-panel">{{ params.title }}</div>',
            props: ['params', 'api', 'containerApi'],
        };

        expect(mockComponent.template).toContain('vue-splitview-panel');
        expect(mockComponent.props).toContain('params');
        expect(mockComponent.props).toContain('api');
        expect(mockComponent.props).toContain('containerApi');
    });
});

describe('VueSplitviewPanelView', () => {
    test('should be a class that extends SplitviewPanel', () => {
        expect(VueSplitviewPanelView).toBeDefined();
        expect(typeof VueSplitviewPanelView).toBe('function');
    });

    test('should create instance with required properties', () => {
        const mockVueInstance = {
            appContext: { components: {} },
            components: {},
            parent: null,
        };

        const mockVueComponent = {
            props: { params: Object, api: Object, containerApi: Object },
            template: '<div>Test</div>',
        } as any;

        const panelView = new VueSplitviewPanelView(
            'test-id',
            'test-component',
            mockVueComponent,
            mockVueInstance as any
        );

        expect(panelView.id).toBe('test-id');
        expect(panelView.element).toBeInstanceOf(HTMLElement);
        expect(typeof panelView.getComponent).toBe('function');
    });

    test('should handle getComponent with mocked parameters and call init', () => {
        const initSpy = vi
            .spyOn(VuePart.prototype, 'init')
            .mockImplementation(() => {});

        const mockVueInstance = {
            appContext: { components: {} },
            components: {},
            parent: null,
        };

        const mockVueComponent = {
            props: { params: Object, api: Object, containerApi: Object },
            template: '<div>Test</div>',
        } as any;

        const panelView = new VueSplitviewPanelView(
            'test-id',
            'test-component',
            mockVueComponent,
            mockVueInstance as any
        );

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
});

// Regression coverage for https://github.com/dockview/dockview/issues/1301
describe('SplitviewVue components prop resolves without registration', () => {
    let wrapper: ReturnType<typeof mount>;

    afterEach(() => {
        wrapper?.unmount();
    });

    test('addPanel resolves component from props.components alone', async () => {
        wrapper = mount(SplitviewVue, {
            props: {
                orientation: Orientation.HORIZONTAL,
                components: { Pane: MockSplitComponent },
            },
            attachTo: document.body,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any)
            .api as SplitviewApi;

        expect(() =>
            api.addPanel({ id: 'pane-1', component: 'Pane' })
        ).not.toThrow();

        expect(api.getPanel('pane-1')).toBeDefined();
    });

    test('throws when component name is not in the map and not registered', async () => {
        wrapper = mount(SplitviewVue, {
            props: {
                orientation: Orientation.HORIZONTAL,
                components: { Pane: MockSplitComponent },
            },
            attachTo: document.body,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any)
            .api as SplitviewApi;

        expect(() =>
            api.addPanel({ id: 'bad', component: 'NotRegistered' })
        ).toThrow("Failed to find Vue Component 'NotRegistered'");
    });
});

test('forwards fallthrough attributes onto the host element (multi-root inheritance regression)', async () => {
    // The component has two root nodes (host element + <DockviewPortals>), so
    // Vue cannot auto-inherit fallthrough attributes. inheritAttrs:false plus
    // v-bind="$attrs" on the host restores it; without them a consumer's
    // `class`/`style` (e.g. a theme class) would land on nothing (see #1369).
    const wrapper = mount(SplitviewVue, {
        attrs: { class: 'dockview-theme-test', 'data-example': 'splitview' },
        attachTo: document.body,
    });
    await flushPromises();

    const host = document.querySelector(
        '.dockview-theme-test'
    ) as HTMLElement | null;
    expect(host).not.toBeNull();
    expect(host!.getAttribute('data-example')).toBe('splitview');

    wrapper.unmount();
});
