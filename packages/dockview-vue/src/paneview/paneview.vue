<script setup lang="ts">
import {
    type PaneviewOptions,
    PROPERTY_KEYS_PANEVIEW,
    createPaneview,
} from 'dockview';
import { useViewComponent } from '../composables/useViewComponent';
import { undefinedDefaults } from '../props';
import { VuePaneviewPanelView } from './view';
import DockviewPortals from '../dockviewPortals.vue';
import type { IPaneviewVueProps, PaneviewVueEvents } from './types';

function extractCoreOptions(props: IPaneviewVueProps): PaneviewOptions {
    const coreOptions = (
        PROPERTY_KEYS_PANEVIEW as (keyof PaneviewOptions)[]
    ).reduce(
        (obj, key) => {
            (obj as any)[key] = props[key];
            return obj;
        },
        {} as Partial<PaneviewOptions>
    );

    return coreOptions as PaneviewOptions;
}

/**
 * The template renders multiple root nodes (the host element plus
 * `<DockviewPortals>`), so Vue cannot automatically forward fallthrough
 * attributes such as `style` and `class`. Disable automatic inheritance and
 * bind `$attrs` explicitly onto the host element below so consumer-supplied
 * attributes continue to reach the root container.
 */
defineOptions({ inheritAttrs: false });

const emit = defineEmits<PaneviewVueEvents>();
const props = withDefaults(
    defineProps<IPaneviewVueProps>(),
    undefinedDefaults(PROPERTY_KEYS_PANEVIEW)
);

const { el, registry } = useViewComponent(
    {
        componentName: 'paneview-vue',
        propertyKeys: PROPERTY_KEYS_PANEVIEW,
        createApi: createPaneview,
        createView: (id, name, component, instance, registry) =>
            new VuePaneviewPanelView(id, component, instance, registry),
        extractCoreOptions,
        onApiCreated: (api) => [
            api.onDidDrop((event) => emit('didDrop', event)),
        ],
    },
    props,
    emit
);
</script>

<template>
    <div ref="el" style="height: 100%; width: 100%" v-bind="$attrs" />
    <DockviewPortals :entries="registry.entries" />
</template>
