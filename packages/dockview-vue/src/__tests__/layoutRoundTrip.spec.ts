import { describe, test, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import {
    defineComponent,
    getCurrentInstance,
    nextTick,
    onMounted,
    onUnmounted,
} from 'vue';
import DockviewVue from '../dockview/dockview.vue';
import { mountVueComponent } from '../utils';
import type { DockviewApi } from 'dockview';

const MockPanel = defineComponent({
    name: 'MockPanel',
    props: ['params'],
    emits: ['something'],
    setup() {
        onMounted(() => void 0);
        onUnmounted(() => void 0);
    },
    template: '<div class="mock-panel">Panel {{ params?.api?.id }}</div>',
});

const MockTab = defineComponent({
    name: 'MockTab',
    props: ['params'],
    emits: ['close'],
    template: '<div class="mock-tab">Tab</div>',
});

const MockWatermark = defineComponent({
    name: 'MockWatermark',
    props: ['params'],
    template: '<div class="mock-watermark">W</div>',
});

const MockAction = defineComponent({
    name: 'MockAction',
    props: ['params'],
    emits: ['x'],
    template: '<div class="mock-action">A</div>',
});

function collectErrors() {
    const errors: any[] = [];
    const spy = vi
        .spyOn(console, 'error')
        .mockImplementation((...args) => errors.push(args));
    const onErr = (e: any) => errors.push(e.error ?? e);
    window.addEventListener('error', onErr);
    return {
        errors,
        stop: () => {
            window.removeEventListener('error', onErr);
            spy.mockRestore();
        },
    };
}

function mountDockview(props: Record<string, any> = {}) {
    return mount(DockviewVue, {
        props,
        attachTo: document.body,
        global: {
            components: { MockPanel, MockTab, MockWatermark, MockAction },
        },
    });
}

async function settle() {
    await nextTick();
    await flushPromises();
    await nextTick();
}

/**
 * Regression coverage for #1134: `api.fromJSON(api.toJSON())` threw
 * `Cannot read properties of null (reading 'emitsOptions')` in dockview-vue,
 * i.e. Vue patched a vnode whose component instance had already been
 * unmounted while the layout was being torn down and rebuilt.
 */
describe('dockview-vue layout round-trip', () => {
    let wrapper: any;
    afterEach(() => wrapper?.unmount());

    test.each([
        ['plain', {}],
        ['custom tab', { defaultTabComponent: 'MockTab' }],
        [
            'tab + watermark + header actions',
            {
                defaultTabComponent: 'MockTab',
                watermarkComponent: 'MockWatermark',
                leftHeaderActionsComponent: 'MockAction',
                rightHeaderActionsComponent: 'MockAction',
                prefixHeaderActionsComponent: 'MockAction',
            },
        ],
        ['renderer always', { defaultRenderer: 'always' }],
    ])('round-trip does not throw (%s)', async (_name, props) => {
        const { errors, stop } = collectErrors();

        wrapper = mountDockview(props);
        await flushPromises();
        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;

        api.addPanel({ id: 'panel-1', component: 'MockPanel', title: 'P1' });
        api.addPanel({ id: 'panel-2', component: 'MockPanel', title: 'P2' });
        api.addPanel({
            id: 'panel-3',
            component: 'MockPanel',
            title: 'P3',
            position: { referencePanel: 'panel-1', direction: 'right' },
        });
        const floating = api.addPanel({
            id: 'panel-4',
            component: 'MockPanel',
            title: 'P4',
            floating: true,
        });
        expect(floating).toBeDefined();
        await settle();

        const layout = api.toJSON();
        const before = document.body.querySelectorAll('.mock-panel').length;
        expect(before).toBeGreaterThan(0);

        api.fromJSON(layout);
        await settle();

        expect(api.panels.length).toBe(4);
        expect(
            document.body.querySelectorAll('.mock-panel').length
        ).toBeGreaterThan(0);

        api.fromJSON(api.toJSON());
        await settle();
        expect(api.panels.length).toBe(4);
        expect(
            document.body.querySelectorAll('.mock-panel').length
        ).toBeGreaterThan(0);

        stop();
        expect(errors).toEqual([]);
    });

    test('legacy mountVueComponent path survives remount/update/dispose cycles', async () => {
        const { errors, stop } = collectErrors();

        let parent: any;
        const Host = defineComponent({
            name: 'HostComponent',
            setup() {
                parent = getCurrentInstance();
                return () => null;
            },
        });
        const host = mount(Host, {
            attachTo: document.body,
            global: { components: { MockPanel } },
        });
        await flushPromises();

        const el = document.createElement('div');
        document.body.appendChild(el);

        const a = mountVueComponent(MockPanel as any, parent, {} as any, el);
        a.update({ params: { x: 1 } });
        a.dispose();
        // re-mount into the same element (what a layout reload does)
        const b = mountVueComponent(MockPanel as any, parent, {} as any, el);
        b.update({ params: { x: 2 } });
        b.dispose();
        // update after dispose must not blow up
        b.update({ params: { x: 3 } });

        host.unmount();
        stop();
        expect(errors).toEqual([]);
    });
});
