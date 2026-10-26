import { describe, test, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import DockviewVue from '../dockview/dockview.vue';
import { DockviewApi } from 'dockview';

/**
 * Guards the Vue binding's re-render behaviour (mirrors the React binding's
 * guarantees): a panel component renders once on mount, resizing re-renders no
 * panels, updating one panel's params re-renders only that panel, and adding a
 * panel does not re-render the panels already mounted.
 */
const renders: Record<string, number> = {};

const CountingPanel = defineComponent({
    name: 'CountingPanel',
    props: ['params'],
    render() {
        const id = (this as any).params?.api?.id ?? '?';
        renders[id] = (renders[id] ?? 0) + 1;
        return h('div', { class: 'counting-panel' }, id);
    },
});

function mountDockview() {
    for (const k of Object.keys(renders)) delete renders[k];
    return mount(DockviewVue, {
        attachTo: document.body,
        global: { components: { CountingPanel } },
    });
}

const total = () => Object.values(renders).reduce((a, b) => a + b, 0);

describe('dockview-vue render behaviour', () => {
    let wrapper: ReturnType<typeof mountDockview>;
    afterEach(() => wrapper?.unmount());

    async function withPanels(n: number): Promise<DockviewApi> {
        wrapper = mountDockview();
        await flushPromises();
        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        api.layout(1000, 1000);
        for (let i = 0; i < n; i++) {
            api.addPanel({ id: `p${i}`, component: 'CountingPanel' });
        }
        await flushPromises();
        return api;
    }

    test('each panel renders exactly once on mount', async () => {
        await withPanels(30);
        const counts = Object.values(renders);
        expect(counts).toHaveLength(30);
        expect(Math.max(...counts)).toBe(1);
    });

    test('resizing does not re-render any panel', async () => {
        const api = await withPanels(20);
        const before = { ...renders };
        for (let i = 0; i < 50; i++) {
            api.layout(900 + i, 800 + i);
        }
        await flushPromises();
        expect(renders).toEqual(before);
    });

    test('updating one panel re-renders only that panel', async () => {
        const api = await withPanels(20);
        const before = { ...renders };
        api.getPanel('p10')?.api.updateParameters({ x: 1 });
        await flushPromises();
        const changed = Object.keys(renders).filter(
            (id) => renders[id] !== before[id]
        );
        expect(changed).toEqual(['p10']);
    });

    test('adding a panel does not re-render the panels already mounted', async () => {
        const api = await withPanels(40);
        const before = { ...renders };
        api.addPanel({ id: 'newcomer', component: 'CountingPanel' });
        await flushPromises();
        const existingReRendered = Object.keys(before).filter(
            (id) => renders[id] !== before[id]
        );
        expect(existingReRendered).toHaveLength(0);
        expect(renders['newcomer']).toBe(1);
    });
});
