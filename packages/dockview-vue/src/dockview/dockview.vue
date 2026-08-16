<script setup lang="ts">
import {
    DockviewApi,
    type DockviewOptions,
    PROPERTY_KEYS_DOCKVIEW,
    type DockviewFrameworkOptions,
    type DockviewIDisposable,
    createDockview,
} from 'dockview';
import {
    ref,
    onMounted,
    watch,
    onBeforeUnmount,
    markRaw,
    getCurrentInstance,
} from 'vue';
import {
    VueGroupDragGhostRenderer,
    VueHeaderActionsRenderer,
    VueContextMenuItemRenderer,
    VueTabGroupChipRenderer,
    VueRenderer,
    VueRendererRegistry,
    VueWatermarkRenderer,
    findComponent,
    resolveComponent,
} from '../utils';
import { VueGridviewPanelView } from '../gridview/view';
import DockviewPortals from '../dockviewPortals.vue';
import type { IDockviewVueProps, VueEvents } from './types';

const DEFAULT_VUE_TAB = 'props.defaultTabComponent';

function extractCoreOptions(props: IDockviewVueProps): DockviewOptions {
    const coreOptions = (
        PROPERTY_KEYS_DOCKVIEW as (keyof DockviewOptions)[]
    ).reduce(
        (obj, key) => {
            (obj as any)[key] = props[key];
            return obj;
        },
        {} as Partial<DockviewOptions>
    );

    return coreOptions as DockviewOptions;
}

/**
 * The template renders multiple root nodes (the host element plus
 * `<DockviewPortals>`), so Vue cannot automatically forward fallthrough
 * attributes such as `style` and `class`. Disable automatic inheritance and
 * bind `$attrs` explicitly onto the host element below so consumer-supplied
 * attributes continue to reach the root dockview container.
 */
defineOptions({ inheritAttrs: false });

const emit = defineEmits<VueEvents>();

const props = defineProps<IDockviewVueProps>();

const el = ref<HTMLElement | null>(null);
const instance = ref<DockviewApi | null>(null);
const eventDisposables: DockviewIDisposable[] = [];

PROPERTY_KEYS_DOCKVIEW.forEach((coreOptionKey) => {
    watch(
        () => props[coreOptionKey],
        (newValue, oldValue) => {
            if (instance.value) {
                instance.value.updateOptions({ [coreOptionKey]: newValue });
            }
        }
    );
});

const inst = getCurrentInstance()!;

/**
 * Components are mounted into dockview's DOM via `<Teleport>` (rendered by
 * `<DockviewPortals>` below) rather than detached `render()` roots, keeping
 * panels in the Vue component tree. See {@link VueRendererRegistry}.
 */
const registry = new VueRendererRegistry();

watch(
    () => props.tabGroupChipComponent,
    (newValue) => {
        if (instance.value) {
            instance.value.updateOptions({
                createTabGroupChipComponent: newValue
                    ? () => {
                          const component = resolveComponent(newValue, inst);
                          return new VueTabGroupChipRenderer(
                              component!,
                              inst,
                              registry
                          );
                      }
                    : undefined,
            });
        }
    }
);

watch(
    () => props.groupDragGhostComponent,
    (newValue) => {
        if (instance.value) {
            instance.value.updateOptions({
                createGroupDragGhostComponent: newValue
                    ? () => {
                          const component = resolveComponent(newValue, inst);
                          return new VueGroupDragGhostRenderer(
                              component!,
                              inst,
                              registry
                          );
                      }
                    : undefined,
            });
        }
    }
);

watch(
    () => props.defaultTabComponent,
    (newValue) => {
        if (instance.value) {
            let coreDefault: string | undefined;
            if (typeof newValue === 'string') {
                coreDefault = newValue;
            } else if (newValue) {
                coreDefault = DEFAULT_VUE_TAB;
            } else {
                coreDefault = undefined;
            }
            instance.value.updateOptions({
                defaultTabComponent: coreDefault,
                createTabComponent(options) {
                    let component =
                        options.name === DEFAULT_VUE_TAB
                            ? null
                            : findComponent(
                                  inst,
                                  options.name,
                                  props.tabComponents
                              );

                    if (!component && newValue) {
                        component = resolveComponent(newValue, inst) ?? null;
                    }

                    if (component) {
                        return new VueRenderer(component, inst, registry);
                    }
                    return undefined;
                },
            });
        }
    }
);

watch(
    () => props.watermarkComponent,
    (newValue) => {
        if (instance.value) {
            instance.value.updateOptions({
                createWatermarkComponent: newValue
                    ? () => {
                          const component = resolveComponent(newValue, inst);
                          return new VueWatermarkRenderer(
                              component!,
                              inst,
                              registry
                          );
                      }
                    : undefined,
            });
        }
    }
);

watch(
    () => props.rightHeaderActionsComponent,
    (newValue) => {
        if (instance.value) {
            instance.value.updateOptions({
                createRightHeaderActionComponent: newValue
                    ? (group) => {
                          const component = resolveComponent(newValue, inst);
                          return new VueHeaderActionsRenderer(
                              component!,
                              inst,
                              group,
                              registry
                          );
                      }
                    : undefined,
            });
        }
    }
);

watch(
    () => props.leftHeaderActionsComponent,
    (newValue) => {
        if (instance.value) {
            instance.value.updateOptions({
                createLeftHeaderActionComponent: newValue
                    ? (group) => {
                          const component = resolveComponent(newValue, inst);
                          return new VueHeaderActionsRenderer(
                              component!,
                              inst,
                              group,
                              registry
                          );
                      }
                    : undefined,
            });
        }
    }
);

watch(
    () => props.prefixHeaderActionsComponent,
    (newValue) => {
        if (instance.value) {
            instance.value.updateOptions({
                createPrefixHeaderActionComponent: newValue
                    ? (group) => {
                          const component = resolveComponent(newValue, inst);
                          return new VueHeaderActionsRenderer(
                              component!,
                              inst,
                              group,
                              registry
                          );
                      }
                    : undefined,
            });
        }
    }
);

onMounted(() => {
    if (!el.value) {
        throw new Error('dockview-vue: element is not mounted');
    }

    if (!inst) {
        throw new Error('dockview-vue: getCurrentInstance() returned null');
    }

    const frameworkOptions: DockviewFrameworkOptions = {
        createComponent(options) {
            const component = findComponent(
                inst,
                options.name,
                props.components
            );
            return new VueRenderer(component!, inst, registry);
        },
        createTabComponent(options) {
            let component =
                options.name === DEFAULT_VUE_TAB
                    ? null
                    : findComponent(inst, options.name, props.tabComponents);

            if (!component && props.defaultTabComponent) {
                component =
                    resolveComponent(props.defaultTabComponent, inst) ?? null;
            }

            if (component) {
                return new VueRenderer(component, inst, registry);
            }
            return undefined;
        },
        createWatermarkComponent: props.watermarkComponent
            ? () => {
                  const component = resolveComponent(
                      props.watermarkComponent,
                      inst
                  );

                  return new VueWatermarkRenderer(component!, inst, registry);
              }
            : undefined,
        createLeftHeaderActionComponent: props.leftHeaderActionsComponent
            ? (group) => {
                  const component = resolveComponent(
                      props.leftHeaderActionsComponent,
                      inst
                  );
                  return new VueHeaderActionsRenderer(
                      component!,
                      inst,
                      group,
                      registry
                  );
              }
            : undefined,
        createPrefixHeaderActionComponent: props.prefixHeaderActionsComponent
            ? (group) => {
                  const component = resolveComponent(
                      props.prefixHeaderActionsComponent,
                      inst
                  );
                  return new VueHeaderActionsRenderer(
                      component!,
                      inst,
                      group,
                      registry
                  );
              }
            : undefined,
        createRightHeaderActionComponent: props.rightHeaderActionsComponent
            ? (group) => {
                  const component = resolveComponent(
                      props.rightHeaderActionsComponent,
                      inst
                  );
                  return new VueHeaderActionsRenderer(
                      component!,
                      inst,
                      group,
                      registry
                  );
              }
            : undefined,
        createContextMenuItemComponent: (options) => {
            if (!options.component) {
                return undefined;
            }
            const component = findComponent(
                inst,
                options.component as string,
                props.components
            );
            return new VueContextMenuItemRenderer(component!, inst, registry);
        },
    };

    const coreOptions = extractCoreOptions(props);

    if (typeof props.defaultTabComponent === 'string') {
        frameworkOptions.defaultTabComponent = props.defaultTabComponent;
    } else if (props.defaultTabComponent) {
        frameworkOptions.defaultTabComponent = DEFAULT_VUE_TAB;
    }

    if (props.tabGroupChipComponent) {
        const chipValue = props.tabGroupChipComponent;
        coreOptions.createTabGroupChipComponent = () => {
            const component = resolveComponent(chipValue, inst);
            return new VueTabGroupChipRenderer(component!, inst, registry);
        };
    }

    if (props.groupDragGhostComponent) {
        const ghostValue = props.groupDragGhostComponent;
        coreOptions.createGroupDragGhostComponent = () => {
            const component = resolveComponent(ghostValue, inst);
            return new VueGroupDragGhostRenderer(component!, inst, registry);
        };
    }

    const workbenchProps = props.workbench;

    const api = createDockview(el.value, {
        ...coreOptions,
        ...frameworkOptions,
        ...(workbenchProps
            ? {
                  workbench: {
                      createComponent: (options) => {
                          const component = findComponent(
                              inst,
                              options.name!,
                              workbenchProps.components
                          );
                          return new VueGridviewPanelView(
                              options.id,
                              options.name,
                              component! as any,
                              inst,
                              registry
                          );
                      },
                      header: workbenchProps.header,
                      statusBar: workbenchProps.statusBar,
                      activityBar: workbenchProps.activityBar,
                      primarySideBar: workbenchProps.primarySideBar,
                      secondarySideBar: workbenchProps.secondarySideBar,
                      toolPanel: workbenchProps.toolPanel,
                      primarySideBarPosition:
                          workbenchProps.primarySideBarPosition,
                      className: workbenchProps.className,
                  },
              }
            : {}),
    });

    const { clientWidth, clientHeight } = el.value;
    api.layout(clientWidth, clientHeight);

    /**
     * !!! THIS IS VERY IMPORTANT
     *
     * Since we store a reference to `DockviewComponent` within the Vue.js world Vue.js will 'deeply Proxyify' the object
     * since this is how Vue.js does its reactivity magic.
     *
     * We do not want Vue.js to touch the `DockviewComponent` reference since it does not need to be reactive in accordance
     * to the Vue.js reactivity model and since `DockviewComponent` is written in plain TypeScript allowing Vue.js
     * to proxify the reference will cause all kinds of unexpected issues
     *
     * @see https://vuejs.org/guide/extras/reactivity-in-depth.html
     * @see https://vuejs.org/api/reactivity-advanced.html#markraw
     */
    instance.value = markRaw(api);

    eventDisposables.push(
        api.onDidDrop((event) => emit('didDrop', event)),
        api.onWillDrop((event) => emit('willDrop', event))
    );

    emit('ready', { api });
});

onBeforeUnmount(() => {
    eventDisposables.forEach((d) => d.dispose());
    eventDisposables.length = 0;
    if (instance.value) {
        instance.value.dispose();
    }
});
</script>

<template>
    <div ref="el" v-bind="$attrs" />
    <DockviewPortals :entries="registry.entries" />
</template>
