/**
 * Internals behind `<DockviewVue>`'s scoped slots. Deliberately not
 * re-exported from the package entry point.
 */
import {
    inject,
    markRaw,
    type InjectionKey,
    type ShallowRef,
    type Slots,
} from 'vue';
import type { VueComponent } from './utils';

const SLOT_REFERENCE = Symbol('dockview-vue.slot');

/**
 * Points a renderer at a named slot of the host component instead of a
 * component. Created via {@link createSlotReference}.
 */
export interface VueSlotReference {
    readonly [SLOT_REFERENCE]: true;
    readonly name: string;
}

export function createSlotReference(name: string): VueSlotReference {
    return markRaw({ [SLOT_REFERENCE]: true as const, name });
}

export function isSlotReference(value: unknown): value is VueSlotReference {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as any)[SLOT_REFERENCE] === true
    );
}

/**
 * Provided by a host (`dockview.vue`) so that {@link VueSlotOutlet} can look
 * up the host's slots. `version` is bumped whenever the host re-renders, which
 * re-runs every outlet so that slot functions replaced by the parent (dynamic
 * slots, render-function slots) are picked up.
 */
export interface VueSlotContext {
    readonly slots: Slots;
    readonly version: ShallowRef<number>;
}

export const VUE_SLOT_CONTEXT: InjectionKey<VueSlotContext> = Symbol(
    'dockview-vue.slotContext'
);

/**
 * Renders the host slot `slotName`, passing the renderer's `params` as the
 * slot props. Mounted through the same {@link VueRendererRegistry} teleport
 * path as components, so it lives inside the host's component tree and the
 * slot content keeps the parent's reactivity, event handlers and injections.
 */
export const VueSlotOutlet = {
    name: 'DockviewSlotOutlet',
    props: {
        slotName: { type: String, required: true },
        params: { type: Object, default: undefined },
    },
    setup(props: { slotName: string; params?: Record<string, any> }) {
        const context = inject(VUE_SLOT_CONTEXT, null);
        return () => {
            if (!context) {
                return null;
            }
            // Track the version so a host re-render re-runs this outlet.
            void context.version.value;
            const slot = context.slots[props.slotName];
            return slot ? slot(props.params ?? {}) : null;
        };
    },
} as unknown as VueComponent;
