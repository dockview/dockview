import type {
    DockviewApi,
    DockviewGroupLocation,
    DockviewGroupPanel,
    DockviewPanelApi,
    IContentRenderer,
    IDockviewGroupPanel,
    IDockviewHeaderActionsProps,
    IDockviewPanelHeaderProps,
    IGroupDragGhostRenderer,
    IGroupHeaderProps,
    IHeaderActionsRenderer,
    ITabGroupChipRenderer,
    ITabGroup,
    ITabRenderer,
    IWatermarkPanelProps,
    IWatermarkRenderer,
    IContextMenuItemRenderer,
    IContextMenuItemComponentProps,
    IChipContextMenuItemComponentProps,
    PanelUpdateEvent,
    Parameters,
    TabPartInitParameters,
    WatermarkRendererInitParameters,
} from 'dockview';
import {
    DockviewCompositeDisposable,
    DockviewMutableDisposable,
} from 'dockview';
import {
    createVNode,
    inject,
    type ComponentOptionsBase,
    type InjectionKey,
    type Slots,
    render,
    cloneVNode,
    markRaw,
    shallowReactive,
    shallowRef,
    type ShallowRef,
    type DefineComponent,
    type ComponentInternalInstance,
} from 'vue';

export type ComponentInterface = ComponentOptionsBase<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
>;

export type VueComponent<T = any> = DefineComponent<T>;

const SLOT_REFERENCE = Symbol('dockview-vue.slot');

/**
 * Points a renderer at a named slot of the host component instead of a
 * component. Created via {@link createSlotReference}.
 */
export interface VueSlotReference {
    readonly [SLOT_REFERENCE]: true;
    readonly name: string;
}

/** What a renderer mounts: a component, or a named slot of the host. */
export type VueRenderable = VueComponent | VueSlotReference;

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

export function findComponent(
    parent: ComponentInternalInstance,
    name: string,
    components?: Record<string, VueComponent | undefined>
): VueComponent | null {
    if (components?.[name]) {
        return components[name] as VueComponent;
    }

    let instance = parent as any;
    let component: any = null;

    while (!component && instance) {
        component = instance.components?.[name];
        instance = instance.parent;
    }

    if (!component) {
        component = parent.appContext.components?.[name];
    }

    if (!component) {
        throw new Error(`Failed to find Vue Component '${name}'`);
    }

    return component as VueComponent;
}

export function resolveComponent(
    value: string | VueComponent | undefined,
    parent: ComponentInternalInstance,
    components?: Record<string, VueComponent | undefined>
): VueComponent | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        return value;
    }
    return findComponent(parent, value, components) ?? undefined;
}

/**
 * @see https://vuejs.org/api/render-function.html#clonevnode
 * @see https://vuejs.org/api/render-function.html#mergeprops
 */
export function mountVueComponent<T extends Record<string, any>>(
    component: VueComponent<T>,
    parent: ComponentInternalInstance,
    props: T,
    element: HTMLElement
) {
    let vNode = createVNode(component, Object.freeze(props));

    /**
     * Clone the parent's app context instead of mutating it. Assigning
     * `vNode.appContext = parent.appContext` and then writing to `.provides`
     * would pollute the shared, app-level `provides` object for every other
     * component in the application. A shallow copy with a freshly merged
     * `provides` gives this vnode the parent's injectables without the side
     * effect.
     */
    vNode.appContext = {
        ...parent.appContext,
        provides: {
            // Object spread ignores null/undefined, so no `?? {}` guard is
            // needed for either source.
            ...parent.appContext?.provides,
            ...(parent as any).provides,
        },
    } as typeof parent.appContext;

    render(vNode, element);

    let runningProps = props;

    return {
        update: (newProps: any) => {
            runningProps = { ...props, ...newProps };
            vNode = cloneVNode(vNode, runningProps);
            render(vNode, element);
        },
        dispose: () => {
            render(null, element);
        },
    };
}

export interface VueMountDisposable {
    update: (props: Record<string, any>) => void;
    dispose: () => void;
}

/**
 * A single component to be teleported by the host's `<DockviewPortals>`.
 *
 * `props` is a {@link ShallowRef} so reassigning it triggers a re-render
 * without Vue deeply proxying the value. The params object carries raw
 * dockview API instances that must not be made reactive.
 */
export interface VueMountEntry {
    readonly id: number;
    readonly component: VueComponent;
    readonly target: HTMLElement;
    readonly props: ShallowRef<Record<string, any>>;
}

let nextMountEntryId = 0;

/**
 * Shared, reactive registry of components that a host (`dockview.vue`,
 * `splitview.vue`, ...) renders via `<Teleport>` instead of the detached
 * `render()` root used by {@link mountVueComponent}.
 *
 * Teleporting keeps each panel a true descendant of the host in the Vue
 * component tree, so framework features that walk the tree work natively:
 * KeepAlive (`onActivated`/`onDeactivated`), `provide`/`inject`, `<Suspense>`
 * and error boundaries.
 */
export class VueRendererRegistry {
    readonly entries = shallowReactive<VueMountEntry[]>([]);

    mount(
        component: VueComponent,
        target: HTMLElement,
        props: Record<string, any>
    ): VueMountDisposable {
        const entry: VueMountEntry = {
            id: nextMountEntryId++,
            component: markRaw(component),
            target,
            props: shallowRef(props),
        };
        this.entries.push(entry);

        return {
            update: (newProps: Record<string, any>) => {
                entry.props.value = { ...entry.props.value, ...newProps };
            },
            dispose: () => {
                const index = this.entries.indexOf(entry);
                if (index !== -1) {
                    this.entries.splice(index, 1);
                }
            },
        };
    }
}

abstract class AbstractVueRenderer {
    protected readonly _element: HTMLElement;
    protected _renderDisposable: VueMountDisposable | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(
        protected readonly component: VueRenderable,
        protected readonly parent: ComponentInternalInstance,
        protected readonly registry?: VueRendererRegistry
    ) {
        this._element = document.createElement('div');
        this.element.className = 'dv-vue-part';
        this.element.style.height = '100%';
        this.element.style.width = '100%';
    }

    /**
     * Mount `component` into `this.element`. When a {@link VueRendererRegistry}
     * is provided the component is teleported by the host (keeping it in the
     * Vue component tree); otherwise it falls back to the detached
     * {@link mountVueComponent} render root.
     *
     * A {@link VueSlotReference} is mounted as a {@link VueSlotOutlet}, which
     * renders the host's slot with `props.params` as the slot props.
     */
    protected mount(props: Record<string, any>): void {
        let component: VueComponent;
        if (isSlotReference(this.component)) {
            component = VueSlotOutlet;
            props = { ...props, slotName: this.component.name };
        } else {
            component = this.component;
        }

        this._renderDisposable?.dispose();
        this._renderDisposable = this.registry
            ? this.registry.mount(component, this.element, props)
            : mountVueComponent(component, this.parent, props, this.element);
    }
}

export class VueRenderer
    extends AbstractVueRenderer
    implements ITabRenderer, IContentRenderer
{
    private _api: DockviewPanelApi | undefined;
    private _containerApi: DockviewApi | undefined;
    private _tabLocation: TabPartInitParameters['tabLocation'] | undefined;

    init(parameters: TabPartInitParameters): void {
        this._api = parameters.api;
        this._containerApi = parameters.containerApi;
        this._tabLocation = parameters.tabLocation;

        const props: IDockviewPanelHeaderProps = {
            params: parameters.params,
            api: parameters.api,
            containerApi: parameters.containerApi,
            tabLocation: parameters.tabLocation,
        };

        this.mount({ params: props });
    }

    update(event: PanelUpdateEvent<Parameters>): void {
        if (!this._api || !this._containerApi) {
            return;
        }

        const params = event.params;
        this._renderDisposable?.update({
            params: {
                params: params,
                api: this._api,
                containerApi: this._containerApi,
                tabLocation: this._tabLocation,
            },
        });
    }

    dispose(): void {
        this._renderDisposable?.dispose();
    }
}

export class VueWatermarkRenderer
    extends AbstractVueRenderer
    implements IWatermarkRenderer
{
    get element(): HTMLElement {
        return this._element;
    }

    init(parameters: WatermarkRendererInitParameters): void {
        const props: IWatermarkPanelProps = {
            group: parameters.group,
            containerApi: parameters.containerApi,
        };

        this.mount({ params: props });
    }

    update(event: PanelUpdateEvent<Parameters>): void {
        // noop
    }

    dispose(): void {
        this._renderDisposable?.dispose();
    }
}

export class VueHeaderActionsRenderer
    extends AbstractVueRenderer
    implements IHeaderActionsRenderer
{
    private readonly _mutableDisposable = new DockviewMutableDisposable();
    private _baseProps: IGroupHeaderProps | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(
        component: VueRenderable,
        parent: ComponentInternalInstance,
        private readonly group: DockviewGroupPanel,
        registry?: VueRendererRegistry
    ) {
        super(component, parent, registry);
    }

    init(props: IGroupHeaderProps): void {
        this._baseProps = props;

        this._mutableDisposable.value = new DockviewCompositeDisposable(
            this.group.model.onDidAddPanel(() => {
                this.updateProps();
            }),
            this.group.model.onDidRemovePanel(() => {
                this.updateProps();
            }),
            this.group.model.onDidActivePanelChange(() => {
                this.updateProps();
            }),
            props.api.onDidActiveChange(() => {
                this.updateProps();
            }),
            props.api.onDidLocationChange((event) => {
                this.updateLocation(event.location);
            })
        );

        this.mount({ params: this.buildEnrichedProps() });
    }

    dispose(): void {
        this._mutableDisposable.dispose();
        this._renderDisposable?.dispose();
    }

    private buildEnrichedProps(): IDockviewHeaderActionsProps {
        return {
            ...this._baseProps!,
            panels: this.group.model.panels,
            activePanel: this.group.model.activePanel,
            isGroupActive: this.group.api.isActive,
            group: this.group,
            headerPosition: this.group.model.headerPosition,
            location: this.group.api.location,
        };
    }

    private updateProps(): void {
        this._renderDisposable?.update({ params: this.buildEnrichedProps() });
    }

    private updateLocation(location: DockviewGroupLocation): void {
        // Send the full enriched props (with the new location applied) rather
        // than a bare `{ params: { location } }`, which the registry's shallow
        // top-level merge would use to replace the entire params object and
        // drop panels/activePanel/group/api/etc. until the next full update.
        this._renderDisposable?.update({
            params: { ...this.buildEnrichedProps(), location },
        });
    }
}

export class VueContextMenuItemRenderer
    extends AbstractVueRenderer
    implements IContextMenuItemRenderer
{
    init(
        props:
            | IContextMenuItemComponentProps
            | IChipContextMenuItemComponentProps
    ): void {
        this.mount({ params: props });
    }

    dispose(): void {
        this._renderDisposable?.dispose();
    }
}

export class VueTabGroupChipRenderer
    extends AbstractVueRenderer
    implements ITabGroupChipRenderer
{
    get element(): HTMLElement {
        return this._element;
    }

    constructor(
        component: VueComponent,
        parent: ComponentInternalInstance,
        registry?: VueRendererRegistry
    ) {
        super(component, parent, registry);
        this.element.style.height = '';
        this.element.style.width = '';
        this.element.style.display = 'inline-flex';
    }

    private _api: DockviewApi | undefined;

    init(params: { tabGroup: ITabGroup; api: DockviewApi }): void {
        this._api = params.api;
        this.mount({
            params: {
                tabGroup: params.tabGroup,
                api: params.api,
            },
        });
    }

    update(params: { tabGroup: ITabGroup }): void {
        // Re-send `api` alongside the new tabGroup; the registry replaces the
        // whole params object on update, so a bare `{ tabGroup }` would drop
        // the api after the first chip update.
        this._renderDisposable?.update({
            params: { tabGroup: params.tabGroup, api: this._api },
        });
    }

    dispose(): void {
        this._renderDisposable?.dispose();
    }
}

export class VueGroupDragGhostRenderer
    extends AbstractVueRenderer
    implements IGroupDragGhostRenderer
{
    constructor(
        component: VueComponent,
        parent: ComponentInternalInstance,
        registry?: VueRendererRegistry
    ) {
        super(component, parent, registry);
        this.element.style.height = '';
        this.element.style.width = '';
        this.element.style.display = 'inline-flex';
    }

    init(params: { group: IDockviewGroupPanel; api: DockviewApi }): void {
        this.mount({
            params: {
                group: params.group,
                api: params.api,
            },
        });
    }

    dispose(): void {
        this._renderDisposable?.dispose();
    }
}

export class VuePart<T extends Record<string, any> = any> {
    private _renderDisposable: VueMountDisposable | undefined;

    constructor(
        private readonly element: HTMLElement,
        private readonly vueComponent: VueComponent<T>,
        private readonly parent: ComponentInternalInstance,
        private props: T,
        private readonly registry?: VueRendererRegistry
    ) {}

    init(): void {
        this._renderDisposable?.dispose();
        this._renderDisposable = this.registry
            ? this.registry.mount(
                  this.vueComponent as VueComponent,
                  this.element,
                  this.props
              )
            : mountVueComponent(
                  this.vueComponent,
                  this.parent,
                  this.props,
                  this.element
              );
    }

    update(props: T): void {
        this.props = { ...this.props, ...props };
        this._renderDisposable?.update(this.props);
    }

    dispose(): void {
        this._renderDisposable?.dispose();
    }
}
