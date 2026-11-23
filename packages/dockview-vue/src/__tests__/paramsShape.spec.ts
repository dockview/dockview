import { describe, test, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { createPaneview, createSplitview } from 'dockview';
import { VuePaneviewPanelView } from '../paneview/view';
import { VueSplitviewPanelView } from '../splitview/view';
import { VueRendererRegistry } from '../utils';
import DockviewPortals from '../dockviewPortals.vue';

/**
 * Drive the view classes with the real core so the shape core hands to
 * `part.update` is what the component actually receives. User `params` must
 * only ever arrive under the `params` prop: never spread as top-level props
 * (a param named `api` would clobber the real one) and never double-wrapped
 * as `{ params: { params } }`.
 */
function mountHost() {
    const registry = new VueRendererRegistry();
    const Host = defineComponent({
        setup: () => () => h(DockviewPortals, { entries: registry.entries }),
    });
    const wrapper = mount(Host, { attachTo: document.body });
    const parent = (wrapper.vm as any).$;
    const container = document.createElement('div');
    document.body.appendChild(container);
    return { registry, wrapper, parent, container };
}

async function settle() {
    await nextTick();
    await flushPromises();
}

describe('params are delivered under the params prop only', () => {
    test('paneview: updateParameters and layout keep params flat', async () => {
        const Probe = defineComponent({
            name: 'ProbePanel',
            props: ['params', 'api', 'containerApi', 'title'],
            template:
                '<div class="probe">wrapped={{ !!(params && params.params) }}|a={{ params?.a }}|b={{ params?.b }}|title={{ title }}|api.id={{ api?.id }}</div>',
        });
        const { registry, wrapper, parent, container } = mountHost();
        const api = createPaneview(container, {
            createComponent: (o) =>
                new VuePaneviewPanelView(o.id, Probe as any, parent, registry),
        });
        api.layout(500, 500);
        const panel = api.addPanel({
            id: 'p1',
            component: 'probe',
            title: 'REAL',
            params: { a: 1, title: 'PARAM' },
        });
        await settle();
        const probe = () => container.querySelector('.probe')?.textContent;
        expect(probe()).toBe('wrapped=false|a=1|b=|title=REAL|api.id=p1');

        panel.api.updateParameters({ b: 2 });
        await settle();
        expect(probe()).toBe('wrapped=false|a=1|b=2|title=REAL|api.id=p1');

        api.layout(600, 600);
        await settle();
        expect(probe()).toBe('wrapped=false|a=1|b=2|title=REAL|api.id=p1');

        api.dispose();
        wrapper.unmount();
    });

    test('splitview: layout does not spread params as top-level props', async () => {
        const Probe = defineComponent({
            name: 'ProbePanel',
            props: ['params', 'api', 'containerApi'],
            template:
                '<div class="probe">api.id={{ api?.id }}|params.api={{ params?.api }}|leaked={{ $attrs.foo }}</div>',
        });
        const { registry, wrapper, parent, container } = mountHost();
        const api = createSplitview(container, {
            createComponent: (o) =>
                new VueSplitviewPanelView(
                    o.id,
                    o.name,
                    Probe as any,
                    parent,
                    registry
                ),
        });
        api.layout(500, 500);
        api.addPanel({
            id: 'p1',
            component: 'probe',
            params: { api: 'NOT_AN_API', foo: 'LEAK' },
        });
        await settle();
        const probe = () => container.querySelector('.probe')?.textContent;
        expect(probe()).toBe('api.id=p1|params.api=NOT_AN_API|leaked=');

        api.layout(600, 600);
        await settle();
        expect(probe()).toBe('api.id=p1|params.api=NOT_AN_API|leaked=');

        api.dispose();
        wrapper.unmount();
    });
});
