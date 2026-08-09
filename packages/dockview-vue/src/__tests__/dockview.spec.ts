import { describe, test, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import DockviewVue from '../dockview/dockview.vue';
import { DockviewApi } from 'dockview';

const MockPanel = defineComponent({
    name: 'MockPanel',
    props: ['params'],
    template: '<div class="mock-panel">Panel</div>',
});

const MockTab = defineComponent({
    name: 'MockTab',
    props: ['params'],
    template: '<div class="mock-tab">Tab</div>',
});

const MockTab2 = defineComponent({
    name: 'MockTab2',
    props: ['params'],
    template: '<div class="mock-tab-2">Tab2</div>',
});

const MockWatermark = defineComponent({
    name: 'MockWatermark',
    props: ['params'],
    template: '<div class="mock-watermark">Watermark</div>',
});

const MockHeaderAction = defineComponent({
    name: 'MockHeaderAction',
    props: ['params'],
    template: '<div class="mock-header-action">Action</div>',
});

function mountDockview(props: Record<string, any> = {}) {
    return mount(DockviewVue, {
        props,
        attachTo: document.body,
        global: {
            components: {
                MockPanel,
                MockTab,
                MockTab2,
                MockWatermark,
                MockHeaderAction,
            },
        },
    });
}

describe('DockviewVue Component', () => {
    let wrapper: ReturnType<typeof mountDockview>;

    afterEach(() => {
        wrapper?.unmount();
    });

    test('should mount and emit ready event with api', async () => {
        wrapper = mountDockview();
        await flushPromises();

        expect(wrapper.emitted('ready')).toBeTruthy();
        const readyEvent = wrapper.emitted('ready')![0][0] as any;
        expect(readyEvent.api).toBeInstanceOf(DockviewApi);
    });

    test('forwards fallthrough style/class attributes to the root container', async () => {
        // Regression test for #1510: the SFC renders multiple root nodes
        // (the host element plus <DockviewPortals>), so Vue cannot
        // auto-inherit fallthrough attributes. They must be bound explicitly
        // onto the root dockview container.
        wrapper = mount(DockviewVue, {
            attrs: {
                class: 'my-custom-dockview',
                style: 'height: 500px; width: 800px;',
            },
            attachTo: document.body,
            global: {
                components: { MockPanel },
            },
        });
        await flushPromises();

        const root = document.body.querySelector(
            '.my-custom-dockview'
        ) as HTMLElement | null;
        expect(root).not.toBeNull();
        expect(root!.style.height).toBe('500px');
        expect(root!.style.width).toBe('800px');
    });

    test('should pass defaultTabComponent to core options on mount', async () => {
        wrapper = mountDockview({
            defaultTabComponent: 'MockTab',
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        api.addPanel({
            id: 'panel-1',
            component: 'MockPanel',
            title: 'Panel 1',
        });

        const panel = api.getPanel('panel-1');
        expect(panel).toBeDefined();
    });

    test('should update defaultTabComponent when prop changes', async () => {
        wrapper = mountDockview({
            defaultTabComponent: 'MockTab',
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const updateSpy = vi.spyOn(api, 'updateOptions');

        await wrapper.setProps({ defaultTabComponent: 'MockTab2' });
        await nextTick();

        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                defaultTabComponent: 'MockTab2',
                createTabComponent: expect.any(Function),
            })
        );
    });

    test('should update watermarkComponent when prop changes', async () => {
        wrapper = mountDockview();
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const updateSpy = vi.spyOn(api, 'updateOptions');

        await wrapper.setProps({ watermarkComponent: 'MockWatermark' });
        await nextTick();

        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                createWatermarkComponent: expect.any(Function),
            })
        );
    });

    test('should clear watermarkComponent when prop is unset', async () => {
        wrapper = mountDockview({
            watermarkComponent: 'MockWatermark',
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const updateSpy = vi.spyOn(api, 'updateOptions');

        await wrapper.setProps({ watermarkComponent: undefined });
        await nextTick();

        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                createWatermarkComponent: undefined,
            })
        );
    });

    test('should update rightHeaderActionsComponent when prop changes', async () => {
        wrapper = mountDockview();
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const updateSpy = vi.spyOn(api, 'updateOptions');

        await wrapper.setProps({
            rightHeaderActionsComponent: 'MockHeaderAction',
        });
        await nextTick();

        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                createRightHeaderActionComponent: expect.any(Function),
            })
        );
    });

    test('should update leftHeaderActionsComponent when prop changes', async () => {
        wrapper = mountDockview();
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const updateSpy = vi.spyOn(api, 'updateOptions');

        await wrapper.setProps({
            leftHeaderActionsComponent: 'MockHeaderAction',
        });
        await nextTick();

        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                createLeftHeaderActionComponent: expect.any(Function),
            })
        );
    });

    test('should update prefixHeaderActionsComponent when prop changes', async () => {
        wrapper = mountDockview();
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const updateSpy = vi.spyOn(api, 'updateOptions');

        await wrapper.setProps({
            prefixHeaderActionsComponent: 'MockHeaderAction',
        });
        await nextTick();

        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                createPrefixHeaderActionComponent: expect.any(Function),
            })
        );
    });

    test('should update tabGroupChipComponent when prop changes', async () => {
        wrapper = mountDockview();
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const updateSpy = vi.spyOn(api, 'updateOptions');

        await wrapper.setProps({
            tabGroupChipComponent: 'MockHeaderAction',
        });
        await nextTick();

        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                createTabGroupChipComponent: expect.any(Function),
            })
        );
    });

    test('should update groupDragGhostComponent when prop changes', async () => {
        wrapper = mountDockview();
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const updateSpy = vi.spyOn(api, 'updateOptions');

        await wrapper.setProps({
            groupDragGhostComponent: 'MockHeaderAction',
        });
        await nextTick();

        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                createGroupDragGhostComponent: expect.any(Function),
            })
        );
    });

    test('should update tabGroupColors and tabGroupAccent when props change', async () => {
        wrapper = mountDockview();
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const updateSpy = vi.spyOn(api, 'updateOptions');

        const tabGroupColors = [{ name: 'cyan', value: '#00ffff' }];
        await wrapper.setProps({
            tabGroupColors,
            tabGroupAccent: 'off',
        });
        await nextTick();

        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ tabGroupColors })
        );
        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ tabGroupAccent: 'off' })
        );
    });

    test('should dispose api on unmount', async () => {
        wrapper = mountDockview();
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const disposeSpy = vi.spyOn(api, 'dispose');

        wrapper.unmount();

        expect(disposeSpy).toHaveBeenCalled();
    });

    test('should forward didDrop events from the api', async () => {
        wrapper = mountDockview();
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const fakeEvent = { id: 'fake-did-drop' } as any;

        (api as any).component._onDidDrop.fire(fakeEvent);

        const emitted = wrapper.emitted('didDrop');
        expect(emitted).toBeTruthy();
        expect(emitted![0][0]).toBe(fakeEvent);
    });

    test('should forward willDrop events from the api', async () => {
        wrapper = mountDockview();
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const fakeEvent = { id: 'fake-will-drop' } as any;

        (api as any).component._onWillDrop.fire(fakeEvent);

        const emitted = wrapper.emitted('willDrop');
        expect(emitted).toBeTruthy();
        expect(emitted![0][0]).toBe(fakeEvent);
    });
});

// Regression coverage for https://github.com/dockview/dockview/issues/1301
// `<script setup>` users (and anyone not using the Options API) need to be
// able to supply panel components without registering globally in main.ts.
describe('DockviewVue components prop (issue #1301)', () => {
    let wrapper: ReturnType<typeof mount>;

    afterEach(() => {
        wrapper?.unmount();
    });

    function mountBare(props: Record<string, any> = {}) {
        // No `global.components` here; this is the scenario that used
        // to require `app.component(...)` in main.ts.
        return mount(DockviewVue, { props, attachTo: document.body });
    }

    test('addPanel resolves component from props.components without any registration', async () => {
        wrapper = mountBare({
            components: { Panel: MockPanel },
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        expect(() =>
            api.addPanel({
                id: 'panel-1',
                component: 'Panel',
                title: 'Panel 1',
            })
        ).not.toThrow();

        expect(api.getPanel('panel-1')).toBeDefined();
    });

    test('addPanel still throws a helpful error when component is not in the map', async () => {
        wrapper = mountBare({
            components: { Panel: MockPanel },
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        expect(() =>
            api.addPanel({
                id: 'panel-bad',
                component: 'DoesNotExist',
                title: 'Bad',
            })
        ).toThrow("Failed to find Vue Component 'DoesNotExist'");
    });

    test('tabComponents map resolves tab components without registration', async () => {
        wrapper = mountBare({
            components: { Panel: MockPanel },
            tabComponents: { CustomTab: MockTab },
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        expect(() =>
            api.addPanel({
                id: 'panel-1',
                component: 'Panel',
                tabComponent: 'CustomTab',
                title: 'Panel 1',
            })
        ).not.toThrow();

        expect(api.getPanel('panel-1')).toBeDefined();
    });

    test('defaultTabComponent accepts a component object directly', async () => {
        wrapper = mountBare({
            components: { Panel: MockPanel },
            defaultTabComponent: MockTab,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        expect(() =>
            api.addPanel({
                id: 'panel-1',
                component: 'Panel',
                title: 'Panel 1',
            })
        ).not.toThrow();

        expect(api.getPanel('panel-1')).toBeDefined();
    });

    test('defaultTabComponent still works as a string (backward compat)', async () => {
        wrapper = mount(DockviewVue, {
            props: {
                defaultTabComponent: 'MockTab',
                components: { Panel: MockPanel },
            },
            attachTo: document.body,
            // String form must continue to work with the legacy global
            // registration path too. That's the contract we promised.
            global: { components: { MockTab } },
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const updateSpy = vi.spyOn(api, 'updateOptions');

        await wrapper.setProps({ defaultTabComponent: 'MockTab2' });
        await nextTick();

        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ defaultTabComponent: 'MockTab2' })
        );
    });

    test('switching defaultTabComponent from string to component uses sentinel', async () => {
        wrapper = mount(DockviewVue, {
            props: {
                defaultTabComponent: 'MockTab',
                components: { Panel: MockPanel },
            },
            attachTo: document.body,
            global: { components: { MockTab } },
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        const updateSpy = vi.spyOn(api, 'updateOptions');

        await wrapper.setProps({ defaultTabComponent: MockTab2 });
        await nextTick();

        // Sentinel name routes core back into createTabComponent, which then
        // returns our component object via resolveComponent.
        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                defaultTabComponent: 'props.defaultTabComponent',
            })
        );
    });

    test('watermarkComponent accepts a component object directly', async () => {
        wrapper = mountBare({
            watermarkComponent: MockWatermark,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        // Should not throw on createWatermarkComponent invocation; we proxy
        // any call to verify resolveComponent doesn't reject the object.
        expect(() =>
            (api as any).component.options.createWatermarkComponent?.()
        ).not.toThrow();
    });

    test('rightHeaderActionsComponent accepts a component object directly', async () => {
        wrapper = mountBare({
            rightHeaderActionsComponent: MockHeaderAction,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        expect(() =>
            (api as any).component.options.createRightHeaderActionComponent?.({
                api: {},
                model: {},
            } as any)
        ).not.toThrow();
    });

    test('leftHeaderActionsComponent accepts a component object directly', async () => {
        wrapper = mountBare({
            leftHeaderActionsComponent: MockHeaderAction,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        expect(() =>
            (api as any).component.options.createLeftHeaderActionComponent?.({
                api: {},
                model: {},
            } as any)
        ).not.toThrow();
    });

    test('prefixHeaderActionsComponent accepts a component object directly', async () => {
        wrapper = mountBare({
            prefixHeaderActionsComponent: MockHeaderAction,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        expect(() =>
            (api as any).component.options.createPrefixHeaderActionComponent?.({
                api: {},
                model: {},
            } as any)
        ).not.toThrow();
    });

    test('tabGroupChipComponent accepts a component object directly', async () => {
        wrapper = mountBare({
            tabGroupChipComponent: MockHeaderAction,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        expect(() =>
            (api as any).component.options.createTabGroupChipComponent?.()
        ).not.toThrow();
    });

    test('groupDragGhostComponent accepts a component object directly', async () => {
        wrapper = mountBare({
            groupDragGhostComponent: MockHeaderAction,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        expect(() =>
            (api as any).component.options.createGroupDragGhostComponent?.()
        ).not.toThrow();
    });

    test('switching components map at runtime is picked up on next addPanel', async () => {
        wrapper = mountBare({
            components: { Panel: MockPanel },
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        api.addPanel({ id: 'panel-1', component: 'Panel', title: 'P1' });
        expect(api.getPanel('panel-1')).toBeDefined();

        const NewPanel = {
            name: 'NewPanel',
            props: ['params'],
            template: '<div class="new-panel">New</div>',
        };

        await wrapper.setProps({ components: { Panel: NewPanel } });
        await nextTick();

        // The next addPanel should resolve against the updated map, with no
        // rerender of existing panels (we explicitly chose read-at-create).
        expect(() =>
            api.addPanel({ id: 'panel-2', component: 'Panel', title: 'P2' })
        ).not.toThrow();
    });

    test('forwards fallthrough attributes (class/style) onto the host element', async () => {
        // Regression guard: the component renders two root nodes (the host
        // element and the `<DockviewPortals>` teleport host), so Vue cannot
        // auto-inherit fallthrough attributes. Without inheritAttrs:false plus
        // an explicit v-bind="$attrs" on the host, a consumer's
        // `<dockview-vue class="dockview-theme-abyss">` lands on nothing,
        // leaving the dock unstyled and zero-height (fallout from #1369, which
        // added the second root node).
        wrapper = mount(DockviewVue, {
            attrs: { class: 'dockview-theme-test', 'data-example': 'dock' },
            attachTo: document.body,
            global: { components: { MockPanel } },
        });
        await flushPromises();

        const host = document.querySelector(
            '.dockview-theme-test'
        ) as HTMLElement | null;
        expect(host).not.toBeNull();
        expect(host!.getAttribute('data-example')).toBe('dock');
        // the forwarded attributes land on the dockview host itself, not some
        // detached node: the initialised dock lives inside it
        expect(host!.querySelector('.dv-dockview')).not.toBeNull();
    });
});
