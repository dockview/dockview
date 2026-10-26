import { describe, test, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
import DockviewVue from '../dockview/dockview.vue';

const MockPanel = defineComponent({
    name: 'MockPanel',
    props: ['params'],
    template: '<div class="mock-panel">Panel</div>',
});

// #1594: a bare mount without dockview-enterprise must not log a missing-module
// error. Own file so the process-global missing-module dedup cache is empty and
// this is the first mount that could surface the message.
describe('DockviewVue bare mount', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('does not warn about a missing dockview-enterprise module (#1594)', async () => {
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        const wrapper = mount(DockviewVue, {
            attachTo: document.body,
            global: { components: { MockPanel } },
        });

        await flushPromises();

        const enterpriseWarnings = errorSpy.mock.calls
            .map((call) => String(call[0]))
            .filter((message) => message.includes('dockview-enterprise'));

        expect(enterpriseWarnings).toEqual([]);

        wrapper.unmount();
    });
});
