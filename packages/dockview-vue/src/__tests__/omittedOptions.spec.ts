import { describe, test, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
import {
    Orientation,
    PROPERTY_KEYS_DOCKVIEW,
    PROPERTY_KEYS_GRIDVIEW,
    PROPERTY_KEYS_PANEVIEW,
    PROPERTY_KEYS_SPLITVIEW,
    type DockviewApi,
    type GridviewApi,
    type PaneviewApi,
    type SplitviewApi,
} from 'dockview';
import DockviewVue from '../dockview/dockview.vue';
import GridviewVue from '../gridview/gridview.vue';
import PaneviewVue from '../paneview/paneview.vue';
import SplitviewVue from '../splitview/splitview.vue';

const MockPanel = defineComponent({
    name: 'MockPanel',
    props: ['params', 'api', 'containerApi', 'title'],
    template: '<div class="mock-panel">Panel</div>',
});

function coreOptions(api: unknown): Record<string, unknown> {
    return (api as { component: { options: Record<string, unknown> } })
        .component.options;
}

function readyApi<T>(wrapper: {
    emitted(name: string): unknown[][] | undefined;
}): T {
    return (wrapper.emitted('ready')![0][0] as { api: T }).api;
}

describe('omitted core options reach dockview-core as undefined (#1691)', () => {
    let wrapper: ReturnType<typeof mount> | undefined;

    afterEach(() => {
        wrapper?.unmount();
        wrapper = undefined;
    });

    test('DockviewVue', async () => {
        wrapper = mount(DockviewVue, {
            props: { components: { MockPanel } },
            attachTo: document.body,
        });
        await flushPromises();
        const api = readyApi<DockviewApi>(wrapper);
        const options = coreOptions(api);

        for (const key of PROPERTY_KEYS_DOCKVIEW) {
            expect(options[key], key).toBeUndefined();
        }

        api.addPanel({ id: 'p1', component: 'MockPanel' });
        api.addPanel({
            id: 'p2',
            component: 'MockPanel',
            position: { direction: 'right' },
        });
        expect(api.groups).toHaveLength(2);
        api.getPanel('p2')!.api.close();
        expect(api.groups).toHaveLength(1);
    });

    test('DockviewVue passes an explicit false through', async () => {
        wrapper = mount(DockviewVue, {
            props: {
                components: { MockPanel },
                proportionalLayout: false,
                closeEmptyGroups: false,
                announcements: false,
            },
            attachTo: document.body,
        });
        await flushPromises();
        const api = readyApi<DockviewApi>(wrapper);
        const options = coreOptions(api);

        expect(options.proportionalLayout).toBe(false);
        expect(options.closeEmptyGroups).toBe(false);
        expect(options.announcements).toBe(false);

        api.addPanel({ id: 'p1', component: 'MockPanel' });
        api.addPanel({
            id: 'p2',
            component: 'MockPanel',
            position: { direction: 'right' },
        });
        api.getPanel('p2')!.api.close();
        expect(api.groups).toHaveLength(2);
    });

    test('SplitviewVue', async () => {
        wrapper = mount(SplitviewVue, {
            props: { orientation: Orientation.HORIZONTAL },
            attachTo: document.body,
        });
        await flushPromises();
        const api = readyApi<SplitviewApi>(wrapper);
        const options = coreOptions(api);

        for (const key of PROPERTY_KEYS_SPLITVIEW) {
            if (key === 'orientation') {
                continue;
            }
            expect(options[key], key).toBeUndefined();
        }
        expect(
            (
                api as unknown as {
                    component: { splitview: { proportionalLayout: boolean } };
                }
            ).component.splitview.proportionalLayout
        ).toBe(true);
    });

    test('GridviewVue', async () => {
        wrapper = mount(GridviewVue, {
            props: { orientation: Orientation.HORIZONTAL },
            attachTo: document.body,
        });
        await flushPromises();
        const api = readyApi<GridviewApi>(wrapper);
        const options = coreOptions(api);

        for (const key of PROPERTY_KEYS_GRIDVIEW) {
            if (key === 'orientation') {
                continue;
            }
            expect(options[key], key).toBeUndefined();
        }
        expect(
            (
                api as unknown as {
                    component: { gridview: { proportionalLayout: boolean } };
                }
            ).component.gridview.proportionalLayout
        ).toBe(true);
    });

    test('PaneviewVue', async () => {
        wrapper = mount(PaneviewVue, {
            props: {},
            attachTo: document.body,
        });
        await flushPromises();
        const api = readyApi<PaneviewApi>(wrapper);
        const options = coreOptions(api);

        for (const key of PROPERTY_KEYS_PANEVIEW) {
            expect(options[key], key).toBeUndefined();
        }
    });
});
