import { describe, test, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createPaneview, PaneviewApi, PROPERTY_KEYS_PANEVIEW } from 'dockview';
import PaneviewVue from '../paneview/paneview.vue';
import { VuePaneviewPanelView } from '../paneview/view';
import * as paneviewTypes from '../paneview/types';

const MockPaneComponent = defineComponent({
    name: 'MockPaneComponent',
    props: ['params', 'api', 'containerApi', 'title'],
    template: '<div class="mock-pane">Pane</div>',
});

function mountPaneview(props: Record<string, any> = {}) {
    return mount(PaneviewVue, {
        props: {
            components: { MockPaneComponent: 'MockPaneComponent' },
            ...props,
        },
        attachTo: document.body,
        global: { components: { MockPaneComponent } },
    });
}

describe('PaneviewVue Component', () => {
    test('should export component types', () => {
        expect(paneviewTypes).toBeDefined();
        expect(typeof paneviewTypes).toBe('object');
    });

    test('should export dockview-core functionality', () => {
        expect(createPaneview).toBeDefined();
        expect(PROPERTY_KEYS_PANEVIEW).toBeDefined();
    });

    test('should have correct paneview properties', () => {
        expect(PROPERTY_KEYS_PANEVIEW).toContain('disableAutoResizing');
        expect(PROPERTY_KEYS_PANEVIEW).toContain('disableDnd');
    });

    test('should create paneview with Vue framework support', () => {
        expect(typeof createPaneview).toBe('function');
        expect(typeof VuePaneviewPanelView).toBe('function');

        const mockVueComponent = { template: '<div>Test</div>' } as any;
        const mockParent = {} as any;

        const panelView = new VuePaneviewPanelView(
            'test-id',
            mockVueComponent,
            mockParent
        );

        expect(panelView.id).toBe('test-id');
        expect(panelView.element).toBeInstanceOf(HTMLElement);
        expect(typeof panelView.init).toBe('function');
        expect(typeof panelView.update).toBe('function');
        expect(typeof panelView.dispose).toBe('function');
    });

    test('should handle Vue component integration for panes', () => {
        const mockComponent = {
            template:
                '<div class="vue-pane-panel">{{ title }}: {{ params.content }}</div>',
            props: ['params', 'api', 'containerApi', 'title'],
        };

        expect(mockComponent.template).toContain('vue-pane-panel');
        expect(mockComponent.props).toContain('params');
        expect(mockComponent.props).toContain('api');
        expect(mockComponent.props).toContain('containerApi');
        expect(mockComponent.props).toContain('title');
    });
});

describe('VuePaneviewPanelView', () => {
    test('should be a class that implements IPanePart interface', () => {
        expect(VuePaneviewPanelView).toBeDefined();
        expect(typeof VuePaneviewPanelView).toBe('function');
    });

    test('should create instance with required properties', () => {
        const mockVueInstance = {
            appContext: { components: {} },
            components: {},
            parent: null,
        };

        const mockVueComponent = {
            props: {
                params: Object,
                api: Object,
                containerApi: Object,
                title: String,
            },
            template: '<div>{{ title }}: Test Paneview Panel</div>',
        } as any;

        const panelView = new VuePaneviewPanelView(
            'paneview-test-id',
            mockVueComponent,
            mockVueInstance as any
        );

        expect(panelView.id).toBe('paneview-test-id');
        expect(panelView.element).toBeInstanceOf(HTMLElement);
        expect(typeof panelView.init).toBe('function');
        expect(typeof panelView.update).toBe('function');
        expect(typeof panelView.dispose).toBe('function');
        expect(typeof panelView.toJSON).toBe('function');
    });

    test('should return correct JSON representation', () => {
        const mockVueInstance = {
            appContext: { components: {} },
            components: {},
            parent: null,
        };

        const panelView = new VuePaneviewPanelView(
            'paneview-test-id',
            { template: '<div>Test</div>' } as any,
            mockVueInstance as any
        );

        const json = panelView.toJSON();
        expect(json).toEqual({ id: 'paneview-test-id' });
    });

    test('should handle lifecycle methods gracefully', () => {
        const mockVueInstance = {
            appContext: { components: {} },
            components: {},
            parent: null,
        };

        const panelView = new VuePaneviewPanelView(
            'test-id',
            { template: '<div>Test</div>' } as any,
            mockVueInstance as any
        );

        expect(() =>
            panelView.update({ params: { data: 'test' } })
        ).not.toThrow();
        expect(() => panelView.dispose()).not.toThrow();
    });
});

describe('PaneviewVue events', () => {
    let wrapper: ReturnType<typeof mountPaneview>;

    afterEach(() => {
        wrapper?.unmount();
    });

    test('should emit ready with api', async () => {
        wrapper = mountPaneview();
        await flushPromises();

        expect(wrapper.emitted('ready')).toBeTruthy();
        const readyEvent = wrapper.emitted('ready')![0][0] as any;
        expect(readyEvent.api).toBeInstanceOf(PaneviewApi);
    });

    test('should forward didDrop events from the api', async () => {
        wrapper = mountPaneview();
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as PaneviewApi;
        const fakeEvent = { id: 'fake-paneview-drop' } as any;

        (api as any).component._onDidDrop.fire(fakeEvent);

        const emitted = wrapper.emitted('didDrop');
        expect(emitted).toBeTruthy();
        expect(emitted![0][0]).toBe(fakeEvent);
    });
});

// Regression coverage for https://github.com/dockview/dockview/issues/1301
describe('PaneviewVue components prop resolves without registration', () => {
    let wrapper: ReturnType<typeof mount>;

    afterEach(() => {
        wrapper?.unmount();
    });

    test('addPanel resolves component from props.components alone', async () => {
        // No `global.components` and no `app.component()`: the user's
        // `<script setup>` scenario.
        wrapper = mount(PaneviewVue, {
            props: { components: { MyPane: MockPaneComponent } },
            attachTo: document.body,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as PaneviewApi;

        expect(() =>
            api.addPanel({
                id: 'pane-1',
                component: 'MyPane',
                title: 'Pane',
            })
        ).not.toThrow();

        expect(api.getPanel('pane-1')).toBeDefined();
    });

    test('throws when component name is not in the map and not registered', async () => {
        wrapper = mount(PaneviewVue, {
            props: { components: { MyPane: MockPaneComponent } },
            attachTo: document.body,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as PaneviewApi;

        expect(() =>
            api.addPanel({
                id: 'pane-bad',
                component: 'NotRegistered',
                title: 'Bad',
            })
        ).toThrow("Failed to find Vue Component 'NotRegistered'");
    });
});

test('forwards fallthrough attributes onto the host element (multi-root inheritance regression)', async () => {
    // The component has two root nodes (host element + <DockviewPortals>), so
    // Vue cannot auto-inherit fallthrough attributes. inheritAttrs:false plus
    // v-bind="$attrs" on the host restores it; without them a consumer's
    // `class`/`style` (e.g. a theme class) would land on nothing (see #1369).
    const wrapper = mount(PaneviewVue, {
        attrs: { class: 'dockview-theme-test', 'data-example': 'paneview' },
        attachTo: document.body,
    });
    await flushPromises();

    const host = document.querySelector(
        '.dockview-theme-test'
    ) as HTMLElement | null;
    expect(host).not.toBeNull();
    expect(host!.getAttribute('data-example')).toBe('paneview');

    wrapper.unmount();
});
