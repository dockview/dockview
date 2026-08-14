<script setup lang="ts">
import { createWorkbench, type WorkbenchApi } from 'dockview';
import {
    getCurrentInstance,
    markRaw,
    onBeforeUnmount,
    onMounted,
    ref,
} from 'vue';
import DockviewPortals from '../dockviewPortals.vue';
import { findComponent, VueRenderer, VueRendererRegistry } from '../utils';
import { VueGridviewPanelView } from '../gridview/view';
import type { IWorkbenchVueProps, WorkbenchVueEvents } from './types';

/**
 * The template renders multiple root nodes (the host element plus
 * `<DockviewPortals>`), so disable automatic attribute inheritance and bind
 * `$attrs` onto the host element below so consumer `style`/`class` still reach
 * the root container.
 */
defineOptions({ inheritAttrs: false });

const emit = defineEmits<WorkbenchVueEvents>();
const props = defineProps<IWorkbenchVueProps>();

const el = ref<HTMLElement | null>(null);
const instance = ref<WorkbenchApi | null>(null);

const inst = getCurrentInstance()!;

/**
 * Both the chrome-band components and the editor panel components teleport into
 * the workbench DOM through a single registry, so all Vue content stays in the
 * component tree. See {@link VueRendererRegistry}.
 */
const registry = new VueRendererRegistry();

onMounted(() => {
    if (!el.value) {
        throw new Error('workbench-vue: element is not mounted');
    }

    const api = createWorkbench(el.value, {
        header: props.header,
        toolbar: props.toolbar,
        statusBar: props.statusBar,
        activityBar: props.activityBar,
        primarySideBar: props.primarySideBar,
        secondarySideBar: props.secondarySideBar,
        panel: props.panel,
        primarySideBarPosition: props.primarySideBarPosition,
        activeViewContainer: props.activeViewContainer,
        className: props.className,
        createComponent: (options) => {
            const component = findComponent(
                inst,
                options.name!,
                props.components
            );
            return new VueGridviewPanelView(
                options.id,
                options.name,
                component! as any,
                inst,
                registry
            );
        },
        dockview: {
            ...(props.editorProps ?? {}),
            createComponent: (options) => {
                const component = findComponent(
                    inst,
                    options.name,
                    props.editorComponents
                );
                return new VueRenderer(component!, inst, registry);
            },
        },
    });

    const { clientWidth, clientHeight } = el.value;
    api.layout(clientWidth, clientHeight);

    instance.value = markRaw(api);
    emit('ready', { api });
});

onBeforeUnmount(() => {
    instance.value?.dispose();
});
</script>

<template>
    <div ref="el" style="height: 100%; width: 100%" v-bind="$attrs" />
    <DockviewPortals :entries="registry.entries" />
</template>
