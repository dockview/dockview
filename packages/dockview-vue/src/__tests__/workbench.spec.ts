import { flushPromises, mount } from '@vue/test-utils';
import type { DockviewApi } from 'dockview';
import { defineComponent } from 'vue';
import { describe, expect, test } from 'vitest';
import DockviewVue from '../dockview/dockview.vue';

const Band = defineComponent({
    name: 'Band',
    props: ['params', 'api', 'containerApi'],
    template: '<div class="mock-band">Band</div>',
});

const Editor = defineComponent({
    name: 'Editor',
    props: ['params', 'api', 'containerApi'],
    template: '<div class="mock-editor">Editor</div>',
});

describe('DockviewVue workbench', () => {
    test('mounts and emits a ready event exposing a workbench api', async () => {
        const wrapper = mount(DockviewVue, {
            props: {
                components: { editor: Editor },
                workbench: {
                    components: {
                        header: Band,
                        explorer: Band,
                        terminal: Band,
                    },
                    header: { component: 'header' },
                    primarySideBar: { component: 'explorer' },
                    toolPanel: { component: 'terminal' },
                },
            },
            attachTo: document.body,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as { api: DockviewApi })
            .api;

        expect(api).toBeDefined();
        expect(typeof api.layout).toBe('function');
        expect(api.workbench).toBeDefined();

        wrapper.unmount();
    });

    test('exposes workbench layout controls and a working editor', async () => {
        const wrapper = mount(DockviewVue, {
            props: {
                components: { editor: Editor },
                workbench: {
                    components: { explorer: Band },
                    activityBar: { component: 'explorer' },
                    primarySideBar: { component: 'explorer' },
                    secondarySideBar: { component: 'explorer' },
                },
            },
            attachTo: document.body,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as { api: DockviewApi })
            .api;

        expect(api.workbench!.primarySideBarPosition).toBe('left');
        api.workbench!.setPrimarySideBarPosition('right');
        expect(api.workbench!.primarySideBarPosition).toBe('right');

        expect(() =>
            api.addPanel({ id: 'e1', component: 'editor' })
        ).not.toThrow();
        expect(api.getPanel('e1')).toBeDefined();

        wrapper.unmount();
    });
});
