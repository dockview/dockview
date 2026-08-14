import { flushPromises, mount } from '@vue/test-utils';
import type { WorkbenchApi } from 'dockview';
import { defineComponent } from 'vue';
import { describe, expect, test } from 'vitest';
import WorkbenchVue from '../workbench/workbench.vue';
import * as workbenchTypes from '../workbench/types';

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

describe('WorkbenchVue Component', () => {
    test('exports component types', () => {
        expect(workbenchTypes).toBeDefined();
        expect(typeof workbenchTypes).toBe('object');
    });

    test('mounts and emits a ready event with a workbench api', async () => {
        const wrapper = mount(WorkbenchVue, {
            props: {
                components: { header: Band, explorer: Band, terminal: Band },
                editorComponents: { editor: Editor },
                header: { component: 'header' },
                primarySideBar: { component: 'explorer' },
                panel: { component: 'terminal' },
            },
            attachTo: document.body,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as { api: WorkbenchApi })
            .api;

        expect(api).toBeDefined();
        expect(typeof api.layout).toBe('function');
        expect(api.dockview).toBeDefined();

        wrapper.unmount();
    });

    test('exposes workbench layout controls and a working editor', async () => {
        const wrapper = mount(WorkbenchVue, {
            props: {
                components: { explorer: Band },
                editorComponents: { editor: Editor },
                activityBar: { component: 'explorer' },
                primarySideBar: { component: 'explorer' },
                secondarySideBar: { component: 'explorer' },
            },
            attachTo: document.body,
        });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as { api: WorkbenchApi })
            .api;

        expect(api.primarySideBarPosition).toBe('left');
        api.setPrimarySideBarPosition('right');
        expect(api.primarySideBarPosition).toBe('right');

        expect(() =>
            api.dockview.addPanel({ id: 'e1', component: 'editor' })
        ).not.toThrow();
        expect(api.dockview.getPanel('e1')).toBeDefined();

        wrapper.unmount();
    });
});
