import { describe, test, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import {
    defineComponent,
    h,
    inject,
    KeepAlive,
    onActivated,
    onDeactivated,
    nextTick,
    provide,
} from 'vue';
import DockviewVue from '../dockview/dockview.vue';
import SplitviewVue from '../splitview/splitview.vue';
import GridviewVue from '../gridview/gridview.vue';
import PaneviewVue from '../paneview/paneview.vue';
import { Orientation } from 'dockview';

/**
 * Regression coverage for https://github.com/dockview/dockview/issues/1369
 *
 * Panels are mounted via `<Teleport>` (rendered by `<DockviewPortals>`), which
 * keeps them as real descendants of the host component in the Vue component
 * tree. That ancestry is what lets framework features that walk the tree reach
 * panels: KeepAlive (`onActivated`/`onDeactivated`) and `provide`/`inject`.
 *
 * Before the teleport migration, panels were detached `render()` roots with no
 * tree ancestry, so KeepAlive could never reach them and these hooks never ran.
 */

interface ViewCase {
    name: string;
    view: ReturnType<typeof defineComponent>;
    viewProps: Record<string, any>;
    addPanel: (api: any) => void;
}

/** Wrap any view component in `<keep-alive>` behind a `show` toggle. */
function createHost(view: ReturnType<typeof defineComponent>, viewProps: any) {
    return defineComponent({
        name: 'KeepAliveHost',
        props: { show: { type: Boolean, default: true } },
        emits: ['ready'],
        setup(props, { emit }) {
            return () =>
                h(KeepAlive, null, {
                    default: () =>
                        props.show
                            ? h(view, {
                                  ...viewProps,
                                  onReady: (event: { api: any }) =>
                                      emit('ready', event),
                              })
                            : null,
                });
        },
    });
}

function makePanel(
    cssClass: string,
    hooks?: { activated?: () => void; deactivated?: () => void }
) {
    return defineComponent({
        name: `Panel_${cssClass}`,
        props: ['params', 'api', 'containerApi', 'title'],
        setup() {
            if (hooks?.activated) {
                onActivated(hooks.activated);
            }
            if (hooks?.deactivated) {
                onDeactivated(hooks.deactivated);
            }
            return () => h('div', { class: cssClass }, 'Panel');
        },
    });
}

describe('Vue components under <keep-alive> (issue #1369)', () => {
    let wrapper: ReturnType<typeof mount>;

    afterEach(() => {
        wrapper?.unmount();
    });

    const cases: ViewCase[] = [
        {
            name: 'DockviewVue',
            view: DockviewVue,
            viewProps: {},
            addPanel: (api) =>
                api.addPanel({ id: 'p1', component: 'Panel', title: 'P1' }),
        },
        {
            name: 'SplitviewVue',
            view: SplitviewVue,
            viewProps: { orientation: Orientation.HORIZONTAL },
            addPanel: (api) => api.addPanel({ id: 'p1', component: 'Panel' }),
        },
        {
            name: 'GridviewVue',
            view: GridviewVue,
            viewProps: {},
            addPanel: (api) => api.addPanel({ id: 'p1', component: 'Panel' }),
        },
        {
            name: 'PaneviewVue',
            view: PaneviewVue,
            viewProps: {},
            addPanel: (api) =>
                api.addPanel({ id: 'p1', component: 'Panel', title: 'P1' }),
        },
    ];

    for (const c of cases) {
        test(`${c.name}: panel renders into the DOM via teleport`, async () => {
            const cssClass = `teleport-${c.name}`;
            const Panel = makePanel(cssClass);

            wrapper = mount(
                createHost(c.view, { ...c.viewProps, components: { Panel } }),
                { attachTo: document.body, props: { show: true } }
            );
            await flushPromises();

            const api = (wrapper.emitted('ready')![0][0] as any).api;
            c.addPanel(api);
            await flushPromises();
            await nextTick();

            expect(document.querySelector(`.${cssClass}`)).not.toBeNull();
        });

        test(`${c.name}: onActivated/onDeactivated fire across keep-alive toggles`, async () => {
            const activated = vi.fn();
            const deactivated = vi.fn();
            const Panel = makePanel(`ka-${c.name}`, { activated, deactivated });

            wrapper = mount(
                createHost(c.view, { ...c.viewProps, components: { Panel } }),
                { attachTo: document.body, props: { show: true } }
            );
            await flushPromises();

            const api = (wrapper.emitted('ready')![0][0] as any).api;
            c.addPanel(api);
            await flushPromises();
            await nextTick();

            // Deactivate (e.g. router navigates away): the panel is cached, not
            // unmounted, so onDeactivated fires.
            await wrapper.setProps({ show: false });
            await flushPromises();
            expect(deactivated).toHaveBeenCalledTimes(1);

            // Reactivate: the cached panel is re-inserted and onActivated fires.
            await wrapper.setProps({ show: true });
            await flushPromises();
            expect(activated).toHaveBeenCalledTimes(1);

            // The cycle keeps working on subsequent toggles.
            await wrapper.setProps({ show: false });
            await flushPromises();
            expect(deactivated).toHaveBeenCalledTimes(2);

            await wrapper.setProps({ show: true });
            await flushPromises();
            expect(activated).toHaveBeenCalledTimes(2);
        });
    }
});

describe('provide/inject reaches teleported panels', () => {
    let wrapper: ReturnType<typeof mount>;

    afterEach(() => {
        wrapper?.unmount();
    });

    test('a value provided above the host is injectable inside a panel', async () => {
        const injected = vi.fn();

        const Panel = defineComponent({
            name: 'InjectPanel',
            props: ['params'],
            setup() {
                injected(inject('shared-token'));
                return () => h('div', { class: 'inject-panel' }, 'Panel');
            },
        });

        // The host provides a value; the panel (a teleported descendant)
        // must resolve it through the component tree.
        const Host = defineComponent({
            name: 'ProvideHost',
            emits: ['ready'],
            setup(_, { emit }) {
                provide('shared-token', 'from-host');
                return () =>
                    h(DockviewVue, {
                        components: { Panel },
                        onReady: (event: { api: any }) => emit('ready', event),
                    });
            },
        });

        wrapper = mount(Host, { attachTo: document.body });
        await flushPromises();

        const api = (wrapper.emitted('ready')![0][0] as any).api;
        api.addPanel({ id: 'p1', component: 'Panel', title: 'P1' });
        await flushPromises();
        await nextTick();

        expect(document.querySelector('.inject-panel')).not.toBeNull();
        expect(injected).toHaveBeenCalledWith('from-host');
    });
});
