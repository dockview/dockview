<script setup lang="ts">
import {
    DockviewApi,
    type CreateComponentOptions,
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
    onBeforeUpdate,
    onUpdated,
    markRaw,
    getCurrentInstance,
    provide,
    shallowRef,
    type Slots,
} from 'vue';
import {
    VueGroupDragGhostRenderer,
    VueHeaderActionsRenderer,
    VueContextMenuItemRenderer,
    VueTabGroupChipRenderer,
    VueRenderer,
    VueRendererRegistry,
    VueWatermarkRenderer,
    VUE_SLOT_CONTEXT,
    createSlotReference,
    findComponent,
    resolveComponent,
    type VueComponent,
    type VueRenderable,
} from '../utils';
import DockviewPortals from '../dockviewPortals.vue';
import type { DockviewVueSlots, IDockviewVueProps, VueEvents } from './types';

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

/**
 * Scoped slots (see {@link DockviewVueSlots}) are rendered by
 * {@link VueSlotOutlet}s mounted through the registry. Bumping `slotsVersion`
 * whenever this component re-renders makes the outlets pick up slot functions
 * the parent replaced (dynamic `v-if` slots, render-function slots).
 */
const slots = defineSlots<DockviewVueSlots>();
const slotsVersion = shallowRef(0);
provide(VUE_SLOT_CONTEXT, { slots: slots as Slots, version: slotsVersion });

const PANEL_SLOT_PREFIX = 'panel-';
const TAB_SLOT_PREFIX = 'tab-';

type FixedSlotName =
    | 'defaultTab'
    | 'watermark'
    | 'rightHeaderActions'
    | 'leftHeaderActions'
    | 'prefixHeaderActions';

const FIXED_SLOTS: FixedSlotName[] = [
    'defaultTab',
    'watermark',
    'rightHeaderActions',
    'leftHeaderActions',
    'prefixHeaderActions',
];

function hasSlot(name: string): boolean {
    return typeof (slots as Slots)[name] === 'function';
}

function snapshotFixedSlots(): Record<FixedSlotName, boolean> {
    return FIXED_SLOTS.reduce(
        (obj, name) => {
            obj[name] = hasSlot(name);
            return obj;
        },
        {} as Record<FixedSlotName, boolean>
    );
}

/**
 * Prefer the slot `slotName` when present, otherwise resolve `value` exactly
 * as the component props always have.
 */
function resolveRenderable(
    slotName: string,
    value: string | VueComponent | undefined
): VueRenderable | undefined {
    if (hasSlot(slotName)) {
        return createSlotReference(slotName);
    }
    return resolveComponent(value, inst);
}

function defaultTabCoreName(): string | undefined {
    if (hasSlot('defaultTab')) {
        return DEFAULT_VUE_TAB;
    }
    const value = props.defaultTabComponent;
    if (typeof value === 'string') {
        return value;
    }
    return value ? DEFAULT_VUE_TAB : undefined;
}

function createTabComponent(
    options: CreateComponentOptions
): VueRenderer | undefined {
    if (options.name !== DEFAULT_VUE_TAB) {
        const slotName = TAB_SLOT_PREFIX + options.name;
        if (hasSlot(slotName)) {
            return new VueRenderer(
                createSlotReference(slotName),
                inst,
                registry
            );
        }
    }

    let component: VueRenderable | null =
        options.name === DEFAULT_VUE_TAB
            ? null
            : findComponent(inst, options.name, props.tabComponents);

    if (!component && (hasSlot('defaultTab') || props.defaultTabComponent)) {
        component =
            resolveRenderable('defaultTab', props.defaultTabComponent) ?? null;
    }

    if (component) {
        return new VueRenderer(component, inst, registry);
    }
    return undefined;
}

function watermarkFactory(): DockviewFrameworkOptions['createWatermarkComponent'] {
    if (!hasSlot('watermark') && !props.watermarkComponent) {
        return undefined;
    }
    return () => {
        const component = resolveRenderable(
            'watermark',
            props.watermarkComponent
        );
        return new VueWatermarkRenderer(component!, inst, registry);
    };
}

type HeaderActionsFactory =
    DockviewFrameworkOptions['createRightHeaderActionComponent'];

function headerActionsFactory(
    slotName: FixedSlotName,
    getValue: () => string | VueComponent | undefined
): HeaderActionsFactory {
    if (!hasSlot(slotName) && !getValue()) {
        return undefined;
    }
    return (group) => {
        const component = resolveRenderable(slotName, getValue());
        return new VueHeaderActionsRenderer(component!, inst, group, registry);
    };
}

const rightHeaderActionsFactory = () =>
    headerActionsFactory(
        'rightHeaderActions',
        () => props.rightHeaderActionsComponent
    );
const leftHeaderActionsFactory = () =>
    headerActionsFactory(
        'leftHeaderActions',
        () => props.leftHeaderActionsComponent
    );
const prefixHeaderActionsFactory = () =>
    headerActionsFactory(
        'prefixHeaderActions',
        () => props.prefixHeaderActionsComponent
    );

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
    () => {
        if (instance.value) {
            instance.value.updateOptions({
                defaultTabComponent: defaultTabCoreName(),
                createTabComponent,
            });
        }
    }
);

watch(
    () => props.watermarkComponent,
    () => {
        if (instance.value) {
            instance.value.updateOptions({
                createWatermarkComponent: watermarkFactory(),
            });
        }
    }
);

watch(
    () => props.rightHeaderActionsComponent,
    () => {
        if (instance.value) {
            instance.value.updateOptions({
                createRightHeaderActionComponent: rightHeaderActionsFactory(),
            });
        }
    }
);

watch(
    () => props.leftHeaderActionsComponent,
    () => {
        if (instance.value) {
            instance.value.updateOptions({
                createLeftHeaderActionComponent: leftHeaderActionsFactory(),
            });
        }
    }
);

watch(
    () => props.prefixHeaderActionsComponent,
    () => {
        if (instance.value) {
            instance.value.updateOptions({
                createPrefixHeaderActionComponent: prefixHeaderActionsFactory(),
            });
        }
    }
);

/**
 * The fixed slots enable dockview features (header actions, watermark,
 * default tab) that are configured once through options, so adding or
 * removing one of them after mount has to be pushed to dockview explicitly.
 */
let fixedSlotsPresence = snapshotFixedSlots();

onBeforeUpdate(() => {
    slotsVersion.value++;
});

onUpdated(() => {
    const next = snapshotFixedSlots();
    const changed = FIXED_SLOTS.filter(
        (name) => next[name] !== fixedSlotsPresence[name]
    );
    fixedSlotsPresence = next;

    if (!instance.value || changed.length === 0) {
        return;
    }

    const options: Partial<DockviewFrameworkOptions> = {};
    for (const name of changed) {
        switch (name) {
            case 'defaultTab':
                options.defaultTabComponent = defaultTabCoreName();
                break;
            case 'watermark':
                options.createWatermarkComponent = watermarkFactory();
                break;
            case 'rightHeaderActions':
                options.createRightHeaderActionComponent =
                    rightHeaderActionsFactory();
                break;
            case 'leftHeaderActions':
                options.createLeftHeaderActionComponent =
                    leftHeaderActionsFactory();
                break;
            case 'prefixHeaderActions':
                options.createPrefixHeaderActionComponent =
                    prefixHeaderActionsFactory();
                break;
        }
    }
    instance.value.updateOptions(options);
});

onMounted(() => {
    if (!el.value) {
        throw new Error('dockview-vue: element is not mounted');
    }

    if (!inst) {
        throw new Error('dockview-vue: getCurrentInstance() returned null');
    }

    fixedSlotsPresence = snapshotFixedSlots();

    const frameworkOptions: DockviewFrameworkOptions = {
        createComponent(options) {
            const slotName = PANEL_SLOT_PREFIX + options.name;
            if (hasSlot(slotName)) {
                return new VueRenderer(
                    createSlotReference(slotName),
                    inst,
                    registry
                );
            }
            const component = findComponent(
                inst,
                options.name,
                props.components
            );
            return new VueRenderer(component!, inst, registry);
        },
        createTabComponent,
        createWatermarkComponent: watermarkFactory(),
        createLeftHeaderActionComponent: leftHeaderActionsFactory(),
        createPrefixHeaderActionComponent: prefixHeaderActionsFactory(),
        createRightHeaderActionComponent: rightHeaderActionsFactory(),
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

    const defaultTab = defaultTabCoreName();
    if (defaultTab) {
        frameworkOptions.defaultTabComponent = defaultTab;
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

    const api = createDockview(el.value, {
        ...coreOptions,
        ...frameworkOptions,
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
