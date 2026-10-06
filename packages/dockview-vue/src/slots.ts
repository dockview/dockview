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
 *
 * @internal
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
 * up the host's slots. `functions` is what outlets track; `slots` is the
 * host's own slots object, read for Vue's compiled-slot flag.
 */
export interface VueSlotContext {
    readonly functions: VueSlotFunctions;
    readonly slots: Slots;
}

export const VUE_SLOT_CONTEXT: InjectionKey<VueSlotContext> = Symbol(
    'dockview-vue.slotContext'
);

/**
 * Create the reactive slot record for a host, plus a `sync` to call from the
 * host's `onBeforeUpdate`. `sync` only writes entries whose function actually
 * changed, so outlets re-render only when their own slot is replaced (dynamic
 * `v-if` slots, render-function slots), not on every host re-render.
 *
 * Entries for which `retain(name)` is true are kept when their slot is
 * removed, so outlets already showing them keep their last content.
 */
export function createSlotFunctions(
    slots: Slots,
    retain: (name: string) => boolean = () => false
): {
    functions: VueSlotFunctions;
    sync: () => void;
} {
    const functions = shallowReactive<VueSlotFunctions>({});

    const sync = () => {
        for (const name of Object.keys(functions)) {
            if (typeof slots[name] !== 'function' && !retain(name)) {
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
 * Rendering goes through `renderSlot`, as a compiled `<slot>` does. It reads
 * the slot and the compiled-slot flag (`_`) from the object it is given, and
 * renders stable compiled slots as stable fragments that patch without a
 * full diff, so the host's flag is passed alongside the tracked function.
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
            const slot = context?.functions[props.slotName];
            if (!context || !slot) {
                return null;
            }
            const source = {
                [props.slotName]: slot,
                _: (context.slots as { _?: unknown })._,
            } as unknown as Slots;
            return renderSlot(source, props.slotName, props.params ?? {});
        };
    },
} as unknown as VueComponent;
