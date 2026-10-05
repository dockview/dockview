/**
 * Internals behind `<DockviewVue>`'s scoped slots. Deliberately not
 * re-exported from the package entry point.
 */
import {
    inject,
    markRaw,
    renderSlot,
    shallowReactive,
    type InjectionKey,
    type Slot,
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
 * The host's slot functions, keyed by slot name, held in a
 * `shallowReactive` record so that each {@link VueSlotOutlet} only tracks
 * the one slot it renders.
 */
export type VueSlotFunctions = Record<string, Slot | undefined>;

/**
 * Provided by a host (`dockview.vue`) so that {@link VueSlotOutlet} can look
 * up the host's slots.
 */
export interface VueSlotContext {
    readonly slots: VueSlotFunctions;
}

export const VUE_SLOT_CONTEXT: InjectionKey<VueSlotContext> = Symbol(
    'dockview-vue.slotContext'
);

/**
 * Create the reactive slot record for a host, plus a `sync` to call from the
 * host's `onBeforeUpdate`. `sync` only writes entries whose function actually
 * changed, so outlets re-render only when their own slot is replaced (dynamic
 * `v-if` slots, render-function slots), not on every host re-render.
 */
export function createSlotFunctions(slots: Slots): {
    functions: VueSlotFunctions;
    sync: () => void;
} {
    const functions = shallowReactive<VueSlotFunctions>({});

    const sync = () => {
        for (const name of Object.keys(functions)) {
            if (typeof slots[name] !== 'function') {
                delete functions[name];
            }
        }
        for (const name of Object.keys(slots)) {
            const slot = slots[name];
            if (typeof slot === 'function' && functions[name] !== slot) {
                functions[name] = slot;
            }
        }
    };

    sync();
    return { functions, sync };
}

/**
 * Renders the host slot `slotName`, passing the renderer's `params` as the
 * slot props. Mounted through the same {@link VueRendererRegistry} teleport
 * path as components, so it lives inside the host's component tree and the
 * slot content keeps the parent's reactivity, event handlers and injections.
 *
 * `renderSlot` is what compiled `<slot>` elements use; it renders the content
 * as a block so updates take Vue's optimised patch path.
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
            return renderSlot(
                context.slots as Slots,
                props.slotName,
                props.params ?? {}
            );
        };
    },
} as unknown as VueComponent;
