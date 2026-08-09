import {
    ref,
    onMounted,
    watch,
    onBeforeUnmount,
    markRaw,
    getCurrentInstance,
    type ComponentInternalInstance,
    type Ref,
} from 'vue';
import type { DockviewIDisposable } from 'dockview';
import { findComponent, VueRendererRegistry } from '../utils';

export interface UseViewComponentReturn<TApi> {
    el: Ref<HTMLElement | null>;
    instance: Ref<TApi | null>;
    registry: VueRendererRegistry;
}

export interface ViewComponentConfig<
    TApi,
    TOptions,
    TProps,
    TEvents,
    TView,
    TFrameworkOptions,
> {
    componentName: string;
    propertyKeys: readonly (keyof TOptions)[];
    createApi: (
        element: HTMLElement,
        options: TOptions & TFrameworkOptions
    ) => TApi;
    createView: (
        id: string,
        name: string | undefined,
        component: any,
        instance: ComponentInternalInstance,
        registry: VueRendererRegistry
    ) => TView;
    extractCoreOptions: (props: TProps) => TOptions;
    onApiCreated?: (api: TApi) => DockviewIDisposable[];
}

export interface UseViewComponentReturn<TApi> {
    el: Ref<HTMLElement | null>;
    instance: Ref<TApi | null>;
    registry: VueRendererRegistry;
}

export function useViewComponent<
    TApi extends {
        dispose(): void;
        updateOptions(options: Partial<TOptions>): void;
        layout(width: number, height: number): void;
    },
    TOptions,
    TProps,
    TEvents,
    TView,
    TFrameworkOptions,
>(
    config: ViewComponentConfig<
        TApi,
        TOptions,
        TProps,
        TEvents,
        TView,
        TFrameworkOptions
    >,
    props: TProps,
    emit: (event: 'ready', payload: { api: TApi }) => void
): UseViewComponentReturn<TApi> {
    const el = ref<HTMLElement | null>(null);
    // Pin the ref type: `ref<TApi>()` would infer `Ref<UnwrapRef<TApi>>`,
    // which both widens the public type and produces a non-portable
    // declaration (TS2742).
    const instance = ref<TApi | null>(null) as Ref<TApi | null>;
    const eventDisposables: DockviewIDisposable[] = [];

    /**
     * Capture the component instance synchronously during `setup`. Watcher
     * callbacks run via Vue's scheduler flush, where `getCurrentInstance()`
     * returns null, so re-calling it there would throw and silently abort the
     * update. Cache it once here and reuse it everywhere below.
     */
    const vueInstance = getCurrentInstance();
    if (!vueInstance) {
        throw new Error(
            `${config.componentName}: getCurrentInstance() returned null`
        );
    }

    /**
     * Components are teleported into the view's DOM (rendered by
     * `<DockviewPortals>` in the host template) so panels stay in the Vue
     * component tree. See {@link VueRendererRegistry}.
     */
    const registry = new VueRendererRegistry();

    config.propertyKeys.forEach((coreOptionKey) => {
        watch(
            () => (props as any)[coreOptionKey],
            (newValue) => {
                if (instance.value) {
                    instance.value.updateOptions({
                        [coreOptionKey]: newValue,
                    } as Partial<TOptions>);
                }
            }
        );
    });

    watch(
        () => (props as any).components,
        () => {
            if (instance.value) {
                instance.value.updateOptions({
                    createComponent: (options: {
                        id: string;
                        name?: string;
                    }) => {
                        const component = findComponent(
                            vueInstance,
                            options.name!,
                            (props as any).components
                        );
                        return config.createView(
                            options.id,
                            options.name,
                            component! as any,
                            vueInstance,
                            registry
                        );
                    },
                } as unknown as Partial<TOptions>);
            }
        }
    );

    onMounted(() => {
        if (!el.value) {
            throw new Error(`${config.componentName}: element is not mounted`);
        }

        const frameworkOptions = {
            createComponent(options: { id: string; name?: string }) {
                const component = findComponent(
                    vueInstance,
                    options.name!,
                    (props as any).components
                );
                return config.createView(
                    options.id,
                    options.name,
                    component! as any,
                    vueInstance,
                    registry
                );
            },
        } as TFrameworkOptions;

        const api = config.createApi(el.value, {
            ...config.extractCoreOptions(props),
            ...frameworkOptions,
        });

        const { clientWidth, clientHeight } = el.value;
        api.layout(clientWidth, clientHeight);

        instance.value = markRaw(api) as any;

        if (config.onApiCreated) {
            eventDisposables.push(...config.onApiCreated(api));
        }

        emit('ready', { api });
    });

    onBeforeUnmount(() => {
        eventDisposables.forEach((d) => d.dispose());
        eventDisposables.length = 0;
        if (instance.value) {
            instance.value.dispose();
        }
    });

    return {
        el,
        instance,
        registry,
    };
}
