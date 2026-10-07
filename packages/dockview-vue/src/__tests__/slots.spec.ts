import { describe, test, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import {
    defineComponent,
    h,
    inject,
    nextTick,
    onMounted,
    onUnmounted,
    provide,
    ref,
    type Ref,
} from 'vue';
import type { DockviewApi } from 'dockview';
import DockviewVue from '../dockview/dockview.vue';
import { VueRenderer, VueRendererRegistry } from '../utils';
import { VueSlotOutlet, createSlotReference, isSlotReference } from '../slots';
import * as publicApi from '../index';

/**
 * Scoped-slot support for `<DockviewVue>` (#908): panels, tabs, header
 * actions and the watermark can be declared as slots in the parent template,
 * keeping the parent's reactivity, event handlers and injections. The
 * component props must keep working exactly as before alongside them.
 */

let wrapper: ReturnType<typeof mount> | undefined;

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = '';
});

async function settle() {
    await flushPromises();
    await nextTick();
}

function text(selector: string): string | null | undefined {
    return document.querySelector(selector)?.textContent;
}

function all(selector: string): Element[] {
    return Array.from(document.querySelectorAll(selector));
}

/**
 * Mount a parent component whose template wraps `<DockviewVue>`. The ready
 * api is captured into `api` (exposed on the returned object).
 */
async function mountHost(
    template: string,
    setup: () => Record<string, any> = () => ({}),
    components: Record<string, any> = {}
) {
    const api: Ref<DockviewApi | null> = ref(null);
    const Host = defineComponent({
        components: { DockviewVue, ...components },
        template,
        setup() {
            return {
                onReady: (event: { api: DockviewApi }) => {
                    api.value = event.api;
                },
                ...setup(),
            };
        },
    });
    wrapper = mount(Host, { attachTo: document.body });
    await settle();
    expect(api.value).not.toBeNull();
    return { api: api.value!, wrapper };
}

describe('slot helpers', () => {
    test('slot internals are not part of the public API', () => {
        for (const name of [
            'VueSlotOutlet',
            'createSlotReference',
            'isSlotReference',
            'VUE_SLOT_CONTEXT',
        ]) {
            expect(publicApi).not.toHaveProperty(name);
        }
    });

    test('createSlotReference / isSlotReference', () => {
        const reference = createSlotReference('panel-a');
        expect(isSlotReference(reference)).toBe(true);
        expect(reference.name).toBe('panel-a');

        expect(isSlotReference(undefined)).toBe(false);
        expect(isSlotReference(null)).toBe(false);
        expect(isSlotReference('panel-a')).toBe(false);
        expect(isSlotReference({ name: 'panel-a' })).toBe(false);
        expect(isSlotReference(defineComponent({ name: 'X' }))).toBe(false);
    });

    test('a slot outlet without a host context renders nothing', () => {
        const outlet = mount(VueSlotOutlet, {
            props: { slotName: 'panel-a', params: {} },
        });
        expect(outlet.text()).toBe('');
        expect(outlet.element.nodeType).toBe(Node.COMMENT_NODE);
        outlet.unmount();
    });

    test('a slot reference mounted without a registry falls back to a detached root', () => {
        const parent = mount(defineComponent({ render: () => h('div') }));
        const renderer = new VueRenderer(
            createSlotReference('panel-a'),
            parent.vm.$ as any
        );
        expect(() =>
            renderer.init({
                params: {},
                api: { onDidTitleChange: () => ({ dispose: () => {} }) } as any,
                containerApi: {} as any,
                tabLocation: 'header',
            })
        ).not.toThrow();
        renderer.dispose();
        parent.unmount();
    });
});

describe('panel slots', () => {
    test('renders a panel from a panel-<name> slot with flat slot props', async () => {
        const seen = vi.fn();
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor="props">
                    <div class="editor">{{ record(props) }}{{ props.params.title }}</div>
                </template>
            </DockviewVue>`,
            () => ({
                record: (props: any) => {
                    seen(props);
                    return '';
                },
            })
        );

        api.addPanel({
            id: 'p1',
            component: 'editor',
            params: { title: 'hello' },
        });
        await settle();

        expect(text('.editor')).toBe('hello');
        const props = seen.mock.calls.at(-1)![0];
        expect(props.params).toEqual({ title: 'hello' });
        expect(props.api).toBe(api.getPanel('p1')!.api);
        expect(props.containerApi).toBe(api);

        // rendered inside the panel's content container
        const content = document
            .querySelector('.editor')!
            .closest('.dv-vue-part');
        expect(content).not.toBeNull();
    });

    test('hyphenated and camelCase component names map to slot names verbatim', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-my-panel><div class="hyphenated" /></template>
                <template #panel-myComponent><div class="camel" /></template>
            </DockviewVue>`
        );

        api.addPanel({ id: 'p1', component: 'my-panel' });
        api.addPanel({
            id: 'p2',
            component: 'myComponent',
            position: { referencePanel: 'p1', direction: 'right' },
        });
        await settle();
        expect(all('.hyphenated')).toHaveLength(1);
        expect(all('.camel')).toHaveLength(1);
    });

    test('updateParameters flows into the slot props', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor="{ params }">
                    <div class="editor">{{ params.value }}</div>
                </template>
            </DockviewVue>`
        );

        api.addPanel({
            id: 'p1',
            component: 'editor',
            params: { value: 'before' },
        });
        await settle();
        expect(text('.editor')).toBe('before');

        api.getPanel('p1')!.api.updateParameters({ value: 'after' });
        await settle();
        expect(text('.editor')).toBe('after');
    });

    test('slot content reacts to parent state and calls parent handlers', async () => {
        const count = ref(0);
        const onSave = vi.fn();
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor="{ api }">
                    <button class="save" @click="onSave(api.id)">{{ count }}</button>
                </template>
            </DockviewVue>`,
            () => ({ count, onSave })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(text('.save')).toBe('0');

        count.value = 5;
        await settle();
        expect(text('.save')).toBe('5');

        (document.querySelector('.save') as HTMLButtonElement).click();
        expect(onSave).toHaveBeenCalledWith('p1');
    });

    test('child components in slot content can inject what the parent provides', async () => {
        const Child = defineComponent({
            setup() {
                const value = inject<string>('host-value', 'missing');
                return () => h('div', { class: 'injected' }, value);
            },
        });
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><Child /></template>
            </DockviewVue>`,
            () => {
                provide('host-value', 'from-parent');
                return {};
            },
            { Child }
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(text('.injected')).toBe('from-parent');
    });

    test('a slot takes precedence over a components entry of the same name', async () => {
        const Editor = defineComponent({
            props: ['params'],
            render: () => h('div', { class: 'from-component' }),
        });
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady" :components="components">
                <template #panel-editor><div class="from-slot" /></template>
            </DockviewVue>`,
            () => ({ components: { editor: Editor } })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(all('.from-slot')).toHaveLength(1);
        expect(all('.from-component')).toHaveLength(0);
    });

    test('slots and components can be mixed: names without a slot fall back to components', async () => {
        const Other = defineComponent({
            props: ['params'],
            setup: (props) => () =>
                h('div', { class: 'other' }, props.params.params.label),
        });
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady" :components="components">
                <template #panel-editor><div class="editor" /></template>
            </DockviewVue>`,
            () => ({ components: { other: Other } })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        api.addPanel({
            id: 'p2',
            component: 'other',
            params: { label: 'legacy' },
            position: { referencePanel: 'p1', direction: 'right' },
        });
        await settle();
        expect(all('.editor')).toHaveLength(1);
        expect(text('.other')).toBe('legacy');
    });

    test('a slot takes precedence over a globally registered component', async () => {
        const Global = defineComponent({
            props: ['params'],
            render: () => h('div', { class: 'global' }),
        });
        const Host = defineComponent({
            components: { DockviewVue },
            template: `<DockviewVue @ready="onReady">
                <template #panel-editor><div class="from-slot" /></template>
            </DockviewVue>`,
            setup: () => ({
                onReady: (e: any) => {
                    api = e.api;
                },
            }),
        });
        let api: DockviewApi | undefined;
        wrapper = mount(Host, {
            attachTo: document.body,
            global: { components: { editor: Global } },
        });
        await settle();

        api!.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(all('.from-slot')).toHaveLength(1);
        expect(all('.global')).toHaveLength(0);
    });

    test('missing slot and component still throws the existing error', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
            </DockviewVue>`
        );
        expect(() => api.addPanel({ id: 'p1', component: 'unknown' })).toThrow(
            "Failed to find Vue Component 'unknown'"
        );
    });

    test('each panel gets its own slot instance and lifecycle', async () => {
        const mounted = vi.fn();
        const unmounted = vi.fn();
        const Tracker = defineComponent({
            props: ['id'],
            setup(props) {
                onMounted(() => mounted(props.id));
                onUnmounted(() => unmounted(props.id));
                return () => h('div', { class: `tracker-${props.id}` });
            },
        });
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor="{ api }"><Tracker :id="api.id" /></template>
            </DockviewVue>`,
            () => ({}),
            { Tracker }
        );

        api.addPanel({ id: 'a', component: 'editor' });
        api.addPanel({
            id: 'b',
            component: 'editor',
            position: { referencePanel: 'a', direction: 'within' },
        });
        await settle();
        expect(mounted.mock.calls.map((c) => c[0]).sort()).toEqual(['a', 'b']);

        // switching tabs keeps both instances alive
        api.getPanel('a')!.api.setActive();
        await settle();
        api.getPanel('b')!.api.setActive();
        await settle();
        expect(unmounted).not.toHaveBeenCalled();

        api.getPanel('a')!.api.close();
        await settle();
        expect(unmounted).toHaveBeenCalledWith('a');
        expect(all('.tracker-a')).toHaveLength(0);
        expect(all('.tracker-b')).toHaveLength(1);

        wrapper!.unmount();
        wrapper = undefined;
        await settle();
        expect(unmounted).toHaveBeenCalledWith('b');
    });

    test('slot panels survive a toJSON/fromJSON round trip', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor="{ params }">
                    <div class="editor">{{ params.n }}</div>
                </template>
            </DockviewVue>`
        );

        api.addPanel({ id: 'a', component: 'editor', params: { n: 1 } });
        api.addPanel({
            id: 'b',
            component: 'editor',
            params: { n: 2 },
            position: { referencePanel: 'a', direction: 'right' },
        });
        await settle();

        const json = api.toJSON();
        api.clear();
        await settle();
        expect(all('.editor')).toHaveLength(0);

        api.fromJSON(json);
        await settle();
        expect(
            all('.editor')
                .map((e) => e.textContent)
                .sort()
        ).toEqual(['1', '2']);
    });

    test('existing panels keep rendering when their slot is removed', async () => {
        const show = ref(true);
        const label = ref('first');
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template v-if="show" #panel-editor><div class="editor">{{ label }}</div></template>
            </DockviewVue>`,
            () => ({ show, label })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(text('.editor')).toBe('first');

        // like removing an entry from the components prop
        show.value = false;
        await settle();
        expect(text('.editor')).toBe('first');

        label.value = 'second';
        show.value = true;
        await settle();
        expect(text('.editor')).toBe('second');
    });

    test('render-function slots replaced on every parent render are picked up', async () => {
        const label = ref('one');
        let api: DockviewApi | undefined;
        const Host = defineComponent({
            setup() {
                return () => {
                    // capture the value outside the slot function so only the
                    // replaced slot function carries the new label
                    const current = label.value;
                    return h(
                        DockviewVue,
                        {
                            onReady: (e: any) => {
                                api = e.api;
                            },
                        },
                        {
                            'panel-editor': () =>
                                h('div', { class: 'editor' }, current),
                        }
                    );
                };
            },
        });
        wrapper = mount(Host, { attachTo: document.body });
        await settle();

        api!.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(text('.editor')).toBe('one');

        label.value = 'two';
        await settle();
        expect(text('.editor')).toBe('two');
    });

    test('two dockview instances resolve their own slots', async () => {
        const apis: DockviewApi[] = [];
        const Host = defineComponent({
            components: { DockviewVue },
            template: `<div>
                <DockviewVue @ready="push">
                    <template #panel-editor><div class="first" /></template>
                </DockviewVue>
                <DockviewVue @ready="push">
                    <template #panel-editor><div class="second" /></template>
                </DockviewVue>
            </div>`,
            setup: () => ({ push: (e: any) => apis.push(e.api) }),
        });
        wrapper = mount(Host, { attachTo: document.body });
        await settle();
        expect(apis).toHaveLength(2);

        apis[0].addPanel({ id: 'p1', component: 'editor' });
        apis[1].addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(all('.first')).toHaveLength(1);
        expect(all('.second')).toHaveLength(1);
    });
});

describe('tab slots', () => {
    test('renders a tab from a tab-<name> slot, including tabLocation', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template #tab-fancy="{ api, tabLocation, params }">
                    <span class="fancy-tab">{{ api.title }}|{{ tabLocation }}|{{ params.n }}</span>
                </template>
            </DockviewVue>`
        );

        api.addPanel({
            id: 'p1',
            component: 'editor',
            tabComponent: 'fancy',
            title: 'Title',
            params: { n: 1 },
        });
        await settle();
        expect(text('.fancy-tab')).toBe('Title|header|1');

        // tabLocation is kept across parameter updates
        api.getPanel('p1')!.api.updateParameters({ n: 2 });
        await settle();
        expect(text('.fancy-tab')).toBe('Title|header|2');
    });

    test('a tab slot takes precedence over a tabComponents entry', async () => {
        const Tab = defineComponent({
            props: ['params'],
            render: () => h('span', { class: 'component-tab' }),
        });
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady" :tabComponents="{ fancy: Tab }">
                <template #panel-editor><div /></template>
                <template #tab-fancy><span class="slot-tab" /></template>
            </DockviewVue>`,
            () => ({ Tab })
        );

        api.addPanel({ id: 'p1', component: 'editor', tabComponent: 'fancy' });
        await settle();
        expect(all('.slot-tab')).toHaveLength(1);
        expect(all('.component-tab')).toHaveLength(0);
    });

    test('defaultTab slot renders tabs without a tabComponent', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template #defaultTab="{ api }">
                    <span class="default-tab">{{ api.id }}</span>
                </template>
            </DockviewVue>`
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(text('.default-tab')).toBe('p1');
    });

    test('defaultTab slot takes precedence over the defaultTabComponent prop', async () => {
        const Tab = defineComponent({
            props: ['params'],
            render: () => h('span', { class: 'component-tab' }),
        });
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady" :defaultTabComponent="Tab">
                <template #panel-editor><div /></template>
                <template #defaultTab><span class="slot-tab" /></template>
            </DockviewVue>`,
            () => ({ Tab })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(all('.slot-tab')).toHaveLength(1);
        expect(all('.component-tab')).toHaveLength(0);
    });

    test('defaultTab slot also beats a string defaultTabComponent', async () => {
        const Tab = defineComponent({
            props: ['params'],
            render: () => h('span', { class: 'component-tab' }),
        });
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady" defaultTabComponent="named" :tabComponents="{ named: Tab }">
                <template #panel-editor><div /></template>
                <template #defaultTab><span class="slot-tab" /></template>
            </DockviewVue>`,
            () => ({ Tab })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(all('.slot-tab')).toHaveLength(1);
        expect(all('.component-tab')).toHaveLength(0);
    });

    test('an explicit tab-<name> slot beats the defaultTab slot', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template #defaultTab><span class="default-tab" /></template>
                <template #tab-fancy><span class="fancy-tab" /></template>
            </DockviewVue>`
        );

        api.addPanel({ id: 'p1', component: 'editor', tabComponent: 'fancy' });
        api.addPanel({ id: 'p2', component: 'editor' });
        await settle();
        expect(all('.fancy-tab')).toHaveLength(1);
        expect(all('.default-tab')).toHaveLength(1);
    });

    test('adding a defaultTab slot after mount applies to panels added afterwards', async () => {
        const show = ref(false);
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template v-if="show" #defaultTab><span class="default-tab" /></template>
            </DockviewVue>`,
            () => ({ show })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(all('.default-tab')).toHaveLength(0);

        show.value = true;
        await settle();
        api.addPanel({ id: 'p2', component: 'editor' });
        await settle();
        expect(all('.default-tab')).toHaveLength(1);
    });
});

describe('panel title changes', () => {
    test('a defaultTab slot reading api.title updates on setTitle', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template #defaultTab="{ api }"><span class="tab-title">{{ api.title }}</span></template>
            </DockviewVue>`
        );

        api.addPanel({ id: 'p1', component: 'editor', title: 'A' });
        await settle();
        expect(text('.tab-title')).toBe('A');

        api.getPanel('p1')!.api.setTitle('B');
        await settle();
        expect(text('.tab-title')).toBe('B');
    });

    test('a tab-<name> slot reading api.title updates on setTitle', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template #tab-fancy="{ api }"><span class="tab-title">{{ api.title }}</span></template>
            </DockviewVue>`
        );

        api.addPanel({
            id: 'p1',
            component: 'editor',
            tabComponent: 'fancy',
            title: 'A',
        });
        await settle();

        api.getPanel('p1')!.api.setTitle('B');
        await settle();
        expect(text('.tab-title')).toBe('B');
    });

    test('a panel slot reading api.title updates on setTitle', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor="{ api }"><h1 class="panel-title">{{ api.title }}</h1></template>
            </DockviewVue>`
        );

        api.addPanel({ id: 'p1', component: 'editor', title: 'A' });
        await settle();

        api.getPanel('p1')!.api.setTitle('B');
        await settle();
        expect(text('.panel-title')).toBe('B');
    });

    test('component tabs are not re-rendered on setTitle', async () => {
        const renders = vi.fn();
        const Tab = defineComponent({
            props: ['params'],
            setup: (props) => () => {
                renders(props.params);
                return h('span', { class: 'component-tab' });
            },
        });
        const Panel = defineComponent({
            props: ['params'],
            render: () => h('div'),
        });
        wrapper = mount(DockviewVue, {
            props: { components: { Panel }, tabComponents: { Tab } },
            attachTo: document.body,
        });
        await settle();
        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        api.addPanel({ id: 'p1', component: 'Panel', tabComponent: 'Tab' });
        await settle();
        renders.mockClear();

        api.getPanel('p1')!.api.setTitle('B');
        await settle();
        expect(renders).not.toHaveBeenCalled();
    });
});

describe('removing tab slots after mount', () => {
    test('existing tabs keep rendering when the defaultTab slot is removed', async () => {
        const show = ref(true);
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template v-if="show" #defaultTab="{ api }"><span class="default-tab">{{ api.id }}</span></template>
            </DockviewVue>`,
            () => ({ show })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(text('.default-tab')).toBe('p1');

        show.value = false;
        await settle();
        // like changing the defaultTabComponent prop, only new tabs change
        expect(text('.default-tab')).toBe('p1');

        api.addPanel({
            id: 'p2',
            component: 'editor',
            position: { referencePanel: 'p1', direction: 'right' },
        });
        await settle();
        expect(all('.default-tab')).toHaveLength(1);
        expect(all('.dv-default-tab')).toHaveLength(1);
    });

    test('existing tabs keep rendering when a tab-<name> slot is removed', async () => {
        const show = ref(true);
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template v-if="show" #tab-fancy="{ api }"><span class="fancy-tab">{{ api.id }}</span></template>
            </DockviewVue>`,
            () => ({ show })
        );

        api.addPanel({ id: 'p1', component: 'editor', tabComponent: 'fancy' });
        await settle();
        expect(text('.fancy-tab')).toBe('p1');

        show.value = false;
        await settle();
        expect(text('.fancy-tab')).toBe('p1');
    });

    test('a removed tab slot that is added back renders its new content', async () => {
        const label = ref('first');
        const show = ref(true);
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template v-if="show" #defaultTab><span class="default-tab">{{ label }}</span></template>
            </DockviewVue>`,
            () => ({ show, label })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();

        show.value = false;
        await settle();
        label.value = 'second';
        show.value = true;
        await settle();
        expect(text('.default-tab')).toBe('second');
    });
});

describe('header action slots', () => {
    test('rightHeaderActions slot renders per group with header props', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template #rightHeaderActions="{ group, panels, activePanel, isGroupActive, containerApi }">
                    <div class="right-actions" :data-group="group.id">
                        {{ panels.length }}|{{ activePanel && activePanel.id }}|{{ containerApi === expectedApi() }}
                    </div>
                </template>
            </DockviewVue>`,
            () => ({ expectedApi: () => capturedApi })
        );
        let capturedApi: DockviewApi | undefined = api;

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(text('.right-actions')!.trim()).toBe('1|p1|true');

        api.addPanel({
            id: 'p2',
            component: 'editor',
            position: { referencePanel: 'p1', direction: 'within' },
        });
        await settle();
        expect(text('.right-actions')!.trim()).toBe('2|p2|true');

        api.getPanel('p1')!.api.setActive();
        await settle();
        expect(text('.right-actions')!.trim()).toBe('2|p1|true');

        api.addPanel({
            id: 'p3',
            component: 'editor',
            position: { referencePanel: 'p1', direction: 'right' },
        });
        await settle();
        expect(all('.right-actions')).toHaveLength(2);
        capturedApi = undefined;
    });

    test('header action slots can call parent handlers and read parent state', async () => {
        const onMaximize = vi.fn();
        const label = ref('max');
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template #rightHeaderActions="{ group }">
                    <button class="maximize" @click="onMaximize(group.id)">{{ label }}</button>
                </template>
            </DockviewVue>`,
            () => ({ onMaximize, label })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();

        (document.querySelector('.maximize') as HTMLButtonElement).click();
        expect(onMaximize).toHaveBeenCalledWith(api.groups[0].id);

        label.value = 'restore';
        await settle();
        expect(text('.maximize')).toBe('restore');
    });

    test('left and prefix header action slots render', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template #leftHeaderActions><span class="left-actions" /></template>
                <template #prefixHeaderActions><span class="prefix-actions" /></template>
            </DockviewVue>`
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(all('.left-actions')).toHaveLength(1);
        expect(all('.prefix-actions')).toHaveLength(1);
    });

    test('a header action slot takes precedence over the component prop', async () => {
        const Actions = defineComponent({
            props: ['params'],
            render: () => h('span', { class: 'component-actions' }),
        });
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady" :rightHeaderActionsComponent="Actions">
                <template #panel-editor><div /></template>
                <template #rightHeaderActions><span class="slot-actions" /></template>
            </DockviewVue>`,
            () => ({ Actions })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(all('.slot-actions')).toHaveLength(1);
        expect(all('.component-actions')).toHaveLength(0);
    });

    test('toggling a header action slot after mount adds and removes it', async () => {
        const show = ref(false);
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template v-if="show" #rightHeaderActions><span class="right-actions" /></template>
            </DockviewVue>`,
            () => ({ show })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(all('.right-actions')).toHaveLength(0);

        show.value = true;
        await settle();
        expect(all('.right-actions')).toHaveLength(1);

        show.value = false;
        await settle();
        expect(all('.right-actions')).toHaveLength(0);
    });

    test('removing the slot falls back to the component prop', async () => {
        const show = ref(true);
        const Actions = defineComponent({
            props: ['params'],
            render: () => h('span', { class: 'component-actions' }),
        });
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady" :rightHeaderActionsComponent="Actions">
                <template #panel-editor><div /></template>
                <template v-if="show" #rightHeaderActions><span class="slot-actions" /></template>
            </DockviewVue>`,
            () => ({ show, Actions })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(all('.slot-actions')).toHaveLength(1);

        show.value = false;
        await settle();
        expect(all('.slot-actions')).toHaveLength(0);
        expect(all('.component-actions')).toHaveLength(1);
    });

    test('clearing the component prop keeps a present slot', async () => {
        const Actions = defineComponent({
            props: ['params'],
            render: () => h('span', { class: 'component-actions' }),
        });
        const actions = ref<any>(Actions);
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady" :rightHeaderActionsComponent="actions">
                <template #panel-editor><div /></template>
                <template #rightHeaderActions><span class="slot-actions" /></template>
            </DockviewVue>`,
            () => ({ actions })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();

        actions.value = undefined;
        await settle();
        expect(all('.slot-actions')).toHaveLength(1);
        expect(all('.component-actions')).toHaveLength(0);
    });

    test('header action slot props keep the full shape after a location change', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template #rightHeaderActions="{ group, panels, location }">
                    <span class="right-actions" :data-group="group.id">{{ panels.length }}|{{ location && location.type }}</span>
                </template>
            </DockviewVue>`
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        api.addPanel({
            id: 'p2',
            component: 'editor',
            position: { referencePanel: 'p1', direction: 'right' },
        });
        await settle();

        const group = api.getPanel('p2')!.group;
        api.addFloatingGroup(group);
        await settle();

        const floating = all('.right-actions').find(
            (e) => (e as HTMLElement).dataset.group === group.id
        );
        expect(floating?.textContent).toBe('1|floating');
    });
});

describe('watermark slot', () => {
    test('renders when there are no panels and is removed when one is added', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div /></template>
                <template #watermark="{ containerApi }">
                    <div class="wm">{{ containerApi === undefined ? 'no' : 'yes' }}</div>
                </template>
            </DockviewVue>`
        );

        expect(text('.wm')).toBe('yes');

        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        expect(all('.wm')).toHaveLength(0);

        api.getPanel('p1')!.api.close();
        await settle();
        expect(all('.wm')).toHaveLength(1);
    });

    test('takes precedence over watermarkComponent', async () => {
        const Wm = defineComponent({
            props: ['params'],
            render: () => h('div', { class: 'component-wm' }),
        });
        await mountHost(
            `<DockviewVue @ready="onReady" :watermarkComponent="Wm">
                <template #watermark><div class="slot-wm" /></template>
            </DockviewVue>`,
            () => ({ Wm })
        );

        expect(all('.slot-wm')).toHaveLength(1);
        expect(all('.component-wm')).toHaveLength(0);
    });

    test('toggling the watermark slot after mount swaps it in and out', async () => {
        const show = ref(false);
        await mountHost(
            `<DockviewVue @ready="onReady">
                <template v-if="show" #watermark><div class="wm" /></template>
            </DockviewVue>`,
            () => ({ show })
        );

        expect(all('.wm')).toHaveLength(0);
        show.value = true;
        await settle();
        expect(all('.wm')).toHaveLength(1);
        show.value = false;
        await settle();
        expect(all('.wm')).toHaveLength(0);
    });
});

describe('slot rendering efficiency', () => {
    test('host re-renders with unchanged slots do not re-render slot content', async () => {
        const panelRenders = vi.fn();
        const headerRenders = vi.fn();
        const cls = ref('a');
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady" :class="cls">
                <template #panel-editor>{{ panelRendered() }}<div class="editor" /></template>
                <template #rightHeaderActions>{{ headerRendered() }}<span /></template>
            </DockviewVue>`,
            () => ({
                cls,
                panelRendered: () => {
                    panelRenders();
                    return '';
                },
                headerRendered: () => {
                    headerRenders();
                    return '';
                },
            })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        api.addPanel({
            id: 'p2',
            component: 'editor',
            position: { referencePanel: 'p1', direction: 'right' },
        });
        await settle();
        panelRenders.mockClear();
        headerRenders.mockClear();

        // re-renders the host (attrs change) without touching its slots
        cls.value = 'b';
        await settle();
        cls.value = 'c';
        await settle();

        expect(document.querySelector('.c')).not.toBeNull();
        expect(panelRenders).not.toHaveBeenCalled();
        expect(headerRenders).not.toHaveBeenCalled();
    });

    test('a parent state change re-renders only the slot content that reads it', async () => {
        const count = ref(0);
        const editorRenders = vi.fn();
        const otherRenders = vi.fn();
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady">
                <template #panel-editor>{{ editorRendered() }}<div class="editor">{{ count }}</div></template>
                <template #panel-other>{{ otherRendered() }}<div class="other" /></template>
            </DockviewVue>`,
            () => ({
                count,
                editorRendered: () => {
                    editorRenders();
                    return '';
                },
                otherRendered: () => {
                    otherRenders();
                    return '';
                },
            })
        );

        api.addPanel({ id: 'p1', component: 'editor' });
        api.addPanel({
            id: 'p2',
            component: 'other',
            position: { referencePanel: 'p1', direction: 'right' },
        });
        await settle();
        editorRenders.mockClear();
        otherRenders.mockClear();

        count.value++;
        await settle();
        expect(text('.editor')).toBe('1');
        expect(editorRenders).toHaveBeenCalledTimes(1);
        expect(otherRenders).not.toHaveBeenCalled();
    });
});

describe('slot patch path', () => {
    // PatchFlags.STABLE_FRAGMENT / PatchFlags.BAIL from @vue/shared
    const STABLE_FRAGMENT = 64;
    const BAIL = -2;

    async function outletPatchFlags(template: string, setup?: () => any) {
        const { api, wrapper } = await mountHost(template, setup);
        api.addPanel({ id: 'p1', component: 'editor' });
        await settle();
        return wrapper
            .findAllComponents({ name: 'DockviewSlotOutlet' })
            .map((outlet) => (outlet.vm.$ as any).subTree.patchFlag);
    }

    test('stable compiled slots render as stable fragments', async () => {
        const flags = await outletPatchFlags(
            `<DockviewVue @ready="onReady">
                <template #panel-editor><div class="editor" /></template>
                <template #rightHeaderActions><span /></template>
            </DockviewVue>`
        );
        expect(flags).toHaveLength(2);
        expect(flags.every((flag) => flag === STABLE_FRAGMENT)).toBe(true);
    });

    test('dynamic slots fall back to a full diff', async () => {
        const flags = await outletPatchFlags(
            `<DockviewVue @ready="onReady">
                <template v-if="show" #panel-editor><div class="editor" /></template>
            </DockviewVue>`,
            () => ({ show: true })
        );
        expect(flags).toEqual([BAIL]);
    });
});

describe('backwards compatibility', () => {
    test('component-only usage renders no slot outlets', async () => {
        const Panel = defineComponent({
            props: ['params'],
            setup: (props) => () =>
                h('div', { class: 'panel' }, props.params.params.label),
        });
        const Actions = defineComponent({
            props: ['params'],
            setup: (props) => () =>
                h('div', { class: 'actions' }, props.params.panels.length),
        });
        const wrapperLocal = mount(DockviewVue, {
            props: {
                components: { Panel },
                rightHeaderActionsComponent: Actions,
            },
            attachTo: document.body,
        });
        wrapper = wrapperLocal;
        await settle();

        const api = (wrapperLocal.emitted('ready')![0][0] as any)
            .api as DockviewApi;
        api.addPanel({ id: 'p1', component: 'Panel', params: { label: 'x' } });
        await settle();

        expect(text('.panel')).toBe('x');
        expect(text('.actions')).toBe('1');
        expect(
            wrapperLocal.findAllComponents({ name: 'DockviewSlotOutlet' })
        ).toHaveLength(0);
    });

    test('components still receive their props under a single params prop', async () => {
        const received = vi.fn();
        const Panel = defineComponent({
            props: ['params'],
            setup(props) {
                received(props.params);
                return () => h('div');
            },
        });
        wrapper = mount(DockviewVue, {
            props: { components: { Panel } },
            attachTo: document.body,
        });
        await settle();
        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        api.addPanel({ id: 'p1', component: 'Panel', params: { a: 1 } });
        await settle();

        const params = received.mock.calls[0][0];
        expect(params.params).toEqual({ a: 1 });
        expect(params.api).toBe(api.getPanel('p1')!.api);
        expect(params.containerApi).toBe(api);
    });

    test('VueRenderer.update keeps the props mounted by init, replacing only params', () => {
        const parent = mount(defineComponent({ render: () => h('div') }));
        const registry = new VueRendererRegistry();
        const renderer = new VueRenderer(
            defineComponent({ props: ['params'], render: () => h('div') }),
            parent.vm.$ as any,
            registry
        );
        renderer.init({
            params: { n: 1 },
            api: { id: 'p1' } as any,
            containerApi: {} as any,
            tabLocation: 'headerOverflow',
            title: 'ignored',
        });
        const mounted = registry.entries[0].props.value.params;
        expect(Object.keys(mounted).sort()).toEqual([
            'api',
            'containerApi',
            'params',
            'tabLocation',
        ]);

        renderer.update({ params: { n: 2 } });
        expect(registry.entries[0].props.value.params).toEqual({
            ...mounted,
            params: { n: 2 },
        });

        renderer.dispose();
        parent.unmount();
    });

    test('tab components keep tabLocation after updateParameters', async () => {
        const Tab = defineComponent({
            props: ['params'],
            setup: (props) => () =>
                h(
                    'span',
                    { class: 'tab' },
                    `${props.params.tabLocation}|${props.params.params.n}`
                ),
        });
        const Panel = defineComponent({
            props: ['params'],
            render: () => h('div'),
        });
        wrapper = mount(DockviewVue, {
            props: { components: { Panel }, tabComponents: { Tab } },
            attachTo: document.body,
        });
        await settle();
        const api = (wrapper.emitted('ready')![0][0] as any).api as DockviewApi;
        api.addPanel({
            id: 'p1',
            component: 'Panel',
            tabComponent: 'Tab',
            params: { n: 1 },
        });
        await settle();
        expect(text('.tab')).toBe('header|1');

        api.getPanel('p1')!.api.updateParameters({ n: 2 });
        await settle();
        expect(text('.tab')).toBe('header|2');
    });

    test('content that is not a recognised slot is still ignored', async () => {
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady" :components="components">
                <div class="stray-default" />
                <template #something-else><div class="stray-named" /></template>
            </DockviewVue>`,
            () => ({
                components: {
                    Panel: defineComponent({
                        props: ['params'],
                        render: () => h('div', { class: 'panel' }),
                    }),
                },
            })
        );

        api.addPanel({ id: 'p1', component: 'Panel' });
        await settle();
        expect(all('.panel')).toHaveLength(1);
        expect(all('.stray-default')).toHaveLength(0);
        expect(all('.stray-named')).toHaveLength(0);
    });

    test('without slots, header actions and watermark are not enabled', async () => {
        wrapper = mount(DockviewVue, { attachTo: document.body });
        await settle();
        const api = (wrapper.emitted('ready')![0][0] as any).api;
        const options = api.component.options;
        expect(options.createRightHeaderActionComponent).toBeUndefined();
        expect(options.createLeftHeaderActionComponent).toBeUndefined();
        expect(options.createPrefixHeaderActionComponent).toBeUndefined();
        expect(options.createWatermarkComponent).toBeUndefined();
        expect(options.defaultTabComponent).toBeUndefined();
    });

    test('re-rendering the parent without slot changes does not call updateOptions', async () => {
        const tick = ref(0);
        const { api } = await mountHost(
            `<DockviewVue @ready="onReady" :data-tick="tick">
                <template #panel-editor><div /></template>
                <template v-if="tick >= 0" #rightHeaderActions><span /></template>
            </DockviewVue>`,
            () => ({ tick })
        );
        const spy = vi.spyOn(api, 'updateOptions');

        tick.value++;
        await settle();
        tick.value++;
        await settle();
        expect(spy).not.toHaveBeenCalled();
    });
});
