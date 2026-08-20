/**
 * Internal module system for dockview.
 *
 * Modules are feature bundles that register services into the dockview
 * component. `registerModules(...)` is the one public entry point: it lets a
 * sibling package contribute modules that `DockviewComponent` picks up at
 * construction. The richer opt-in surface (a per-component `modules` option,
 * framework wrappers) is still reserved for a future version; the module
 * authoring API (`defineModule`, the service contracts) remains internal.
 */

import { IDisposable } from '../lifecycle';
import type { Event } from '../events';
import type { IDockviewPanel } from './dockviewPanel';
import { IFloatingGroupService } from './floatingGroupService';
import { IPopoutWindowService } from './popoutWindowService';
import { IWatermarkService } from './watermarkService';
import { IEdgeGroupService } from './edgeGroupService';
import { IRootDropTargetService } from './rootDropTargetService';
import { IHeaderActionsService } from './headerActionsService';
import { ILiveRegionService } from './liveRegionService';
import {
    IKeyboardNavigationService,
    IAdvancedDnDService,
    IAdvancedOverflowService,
    IAutoHideEdgeGroupService,
    IAutoEdgeGroupService,
    IContextMenuService,
    IDndCompassService,
    IKeyboardDockingService,
    ILayoutHistoryService,
    IMultiRowTabsService,
    IPinnedTabsService,
    ISmartGuidesService,
    ITabGroupChipsService,
} from './moduleContracts';

export interface ServiceCollection {
    floatingGroupService?: IFloatingGroupService;
    popoutWindowService?: IPopoutWindowService;
    watermarkService?: IWatermarkService;
    edgeGroupService?: IEdgeGroupService;
    tabGroupChipsService?: ITabGroupChipsService;
    contextMenuService?: IContextMenuService;
    rootDropTargetService?: IRootDropTargetService;
    headerActionsService?: IHeaderActionsService;
    advancedDnDService?: IAdvancedDnDService;
    liveRegionService?: ILiveRegionService;
    keyboardNavigationService?: IKeyboardNavigationService;
    keyboardDockingService?: IKeyboardDockingService;
    layoutHistoryService?: ILayoutHistoryService;
    dndCompassService?: IDndCompassService;
    smartGuidesService?: ISmartGuidesService;
    autoHideEdgeGroupService?: IAutoHideEdgeGroupService;
    autoEdgeGroupService?: IAutoEdgeGroupService;
    multiRowTabsService?: IMultiRowTabsService;
    pinnedTabsService?: IPinnedTabsService;
    advancedOverflowService?: IAdvancedOverflowService;
}

/**
 * A module service that owns a slice of each panel's serialized state.
 *
 * Modules that need per-panel persistence implement this on their service
 * rather than core carrying a field on their behalf (as it still does for
 * `GroupviewPanelState.pinned`). Each contributor owns one namespaced key
 * under `GroupviewPanelState.moduleState`.
 *
 * Slices must be JSON-serializable and are written into every saved layout,
 * so keep them small.
 */
export interface IPanelStateContributor<T = unknown> {
    /** The `moduleState` key this contributor owns. Must be unique. */
    readonly panelStateKey: string;
    /**
     * The slice to persist, or `undefined` to omit the key entirely. Returning
     * `undefined` for the common case keeps layouts byte-stable for apps that
     * never use the feature.
     */
    serializePanelState(panel: IDockviewPanel): T | undefined;
    /**
     * Apply a loaded slice. Called for every contributor on every load with
     * `undefined` when the layout carries no slice for this key, so
     * deserialization *replaces* rather than merges - matching the params
     * semantics in `updateFromStateModel`.
     */
    hydratePanelState(panel: IDockviewPanel, state: T | undefined): void;
}

export function isPanelStateContributor(
    service: unknown
): service is IPanelStateContributor {
    const candidate = service as Partial<IPanelStateContributor> | undefined;
    return (
        !!candidate &&
        typeof candidate.panelStateKey === 'string' &&
        typeof candidate.serializePanelState === 'function' &&
        typeof candidate.hydratePanelState === 'function'
    );
}

/**
 * A module service that contributes an element into every tab.
 *
 * The alternative is what core still does for the pin glyph: hardcode the
 * markup in `Tab` on a module's behalf. A decoration owns its own element,
 * its own listeners and its own re-render signal instead.
 *
 * Decorations sit in a container either side of the tab's content renderer,
 * so they compose with each other and survive `setContent`.
 */
export interface ITabDecoration {
    /** Unique key identifying this decoration. */
    readonly decorationKey: string;
    /** Which side of the tab content. Defaults to `'before'`. */
    readonly placement?: 'before' | 'after';
    /** Ascending sort within a placement. Defaults to `0`. */
    readonly order?: number;
    /**
     * Set when the decoration handles its own clicks (a picker, a toggle).
     * Pointer events on it are then stopped from reaching the tab, so it
     * cannot activate the tab or begin a drag. Passive indicators leave this
     * unset and remain click-through.
     */
    readonly interactive?: boolean;
    /**
     * Render even when the panel uses a custom `tabComponent`. Defaults to
     * `false`, matching the pin glyph: a custom renderer owns its own markup.
     * Set it when the decoration is the only way to reach a feature, and so
     * must survive a custom tab.
     */
    readonly renderWithCustomTab?: boolean;
    /**
     * Build or update this decoration for `panel`. `element` is whatever was
     * previously returned for that panel, so a decoration can update in place
     * rather than rebuild. Return `null` to render nothing for this panel.
     */
    renderTabDecoration(
        panel: IDockviewPanel,
        element: HTMLElement | undefined
    ): HTMLElement | null;
    /**
     * Fires when a re-render is needed. `panelId` narrows it to one tab;
     * omitted (or a void event) re-renders every tab.
     */
    readonly onDidChangeTabDecoration?: Event<{ panelId?: string } | void>;
}

export function isTabDecoration(service: unknown): service is ITabDecoration {
    const candidate = service as Partial<ITabDecoration> | undefined;
    return (
        !!candidate &&
        typeof candidate.decorationKey === 'string' &&
        typeof candidate.renderTabDecoration === 'function'
    );
}

export interface DockviewModule<THost = unknown> {
    moduleName: string;
    services?: Record<string, (host: THost) => unknown>;
    /**
     * Optional post-construct hook called once after the host is fully
     * constructed and all module services are instantiated. Use this to
     * subscribe to host events; the returned disposable runs at host
     * teardown. Components don't need to call into the service from event
     * handlers; the module owns its own reactivity.
     */
    init?: (host: THost, services: ServiceCollection) => IDisposable;
    dependsOn?: DockviewModule<any>[];
    /**
     * Top-level option keys that must report *this* module when it isn't
     * registered: the module's half of the contract with core's
     * `OPTION_MODULE_RULES`, which core cannot derive because it can't import
     * the modules it might be missing.
     *
     * Declared here rather than inferred so a test can hold the two in sync:
     * see `enterpriseModuleNames.spec.ts`, which fails if an option listed here
     * has no rule (the user would get silence) or a rule names this module for
     * an option not listed here.
     *
     * List an option only if it should produce a diagnostic naming this module.
     * Options this module merely *reads* don't belong here: `edgeGroupPeek` only
     * tunes `autoHideEdgeGroups` and is inert alone, and where one opt-in gates
     * two modules in the same package (`keyboardNavigation`) only the module the
     * message should name declares it: one mistake, one message.
     */
    options?: string[];
}

/**
 * Typed helper for defining a module. Enforces that the factory's return
 * type matches the slot in ServiceCollection at compile time, replacing
 * the manual cast each module file would otherwise need.
 */
export function defineModule<K extends keyof ServiceCollection, THost>(config: {
    name: string;
    serviceKey: K;
    create: (host: THost) => NonNullable<ServiceCollection[K]>;
    init?: (
        host: THost,
        service: NonNullable<ServiceCollection[K]>
    ) => IDisposable;
    dependsOn?: DockviewModule<any>[];
    /** See {@link DockviewModule.options}. */
    options?: string[];
}): DockviewModule<THost> {
    return {
        moduleName: config.name,
        options: config.options,
        services: {
            [config.serviceKey]: config.create,
        },
        init: config.init
            ? (host, services) =>
                  config.init!(
                      host,
                      services[config.serviceKey] as NonNullable<
                          ServiceCollection[K]
                      >
                  )
            : undefined,
        dependsOn: config.dependsOn,
    };
}

/**
 * The modules that ship in `dockview-enterprise` rather than the free
 * packages. Core never imports them; it holds their names only so a
 * missing-module message can name the package that provides the fix.
 *
 * Keep in sync with the `Modules` list exported by `dockview-enterprise`.
 */
export const ENTERPRISE_MODULE_NAMES: ReadonlySet<string> = new Set([
    'AdvancedOverflow',
    'AutoEdgeGroup',
    'AutoHideEdgeGroup',
    'ContextMenu',
    'DndCompass',
    'KeyboardDocking',
    'KeyboardNavigation',
    'LayoutHistory',
    'License',
    'MultiRowTabs',
    'PinnedTabs',
    'SmartGuides',
]);

const _warnedMissingModule = new Set<string>();

/**
 * For tests: clears the once-per-key dedup cache used by `logMissingModule`
 * (and therefore `assertModule`).
 */
export function _resetMissingModuleWarnings(): void {
    _warnedMissingModule.clear();
}

/**
 * Builds the text for a module that a caller needed but which isn't
 * registered. `reason` describes what the user did to need it (an option they
 * set, an api method they called) and is quoted verbatim. Pass several when one
 * module is needed for several reasons at once: a single message listing them
 * beats one message per reason each repeating the same install instructions.
 *
 * Exported so the rare caller that must throw (see `assertModule`) can raise
 * the same message rather than a thinner second one.
 *
 * Enterprise modules get the install/import fix inline, because importing
 * `dockview-enterprise` self-registers every enterprise module, so there is no
 * separate `registerModules` step for the user to get wrong.
 */
export function missingModuleMessage(
    moduleName: string,
    reason?: string | string[]
): string {
    const reasons = reason === undefined ? [] : ([] as string[]).concat(reason);
    const quoted = reasons.map((r) => `\`${r}\``).join(', ');
    const requires = reasons.length > 1 ? 'require' : 'requires';
    const needed = reasons.length
        ? `${quoted} ${requires} the "${moduleName}" module`
        : `The "${moduleName}" module is required`;

    if (ENTERPRISE_MODULE_NAMES.has(moduleName)) {
        return (
            `dockview: ${needed}, which ships in dockview-enterprise.\n\n` +
            `  npm install dockview-enterprise\n` +
            `  import 'dockview-enterprise'; // self-registers every enterprise module\n`
        );
    }

    return `dockview: ${needed}, but it is not registered.`;
}

/**
 * Logs a deduplicated "module not registered" error naming what was needed and
 * how to get it. Deduped per module+reasons for the lifetime of the page, so
 * repeated calls (and re-validation on every `updateOptions`) log once.
 */
export function logMissingModule(
    moduleName: string,
    reason?: string | string[]
): void {
    const reasons = reason === undefined ? [] : ([] as string[]).concat(reason);
    const key = `${moduleName}|${reasons.join('|')}`;
    if (_warnedMissingModule.has(key)) {
        return;
    }
    _warnedMissingModule.add(key);
    console.error(missingModuleMessage(moduleName, reason));
}

/**
 * Returns the service if its module is registered, otherwise logs a
 * deduplicated console error and returns `undefined`. This function never
 * throws: the affected feature degrades to a no-op so consuming applications
 * don't crash in production.
 *
 * The one exception is an entry point that must return a value it cannot
 * synthesise: `addEdgeGroup(): DockviewGroupPanelApi` has no group to hand
 * back and no `undefined` in its return type, so it throws
 * `missingModuleMessage(...)` directly instead of calling this. Don't route
 * such a caller through here: it would log *and* throw, reporting twice.
 *
 * Use at public-API entry points where the caller wants to surface which
 * module is missing. For internal/lifecycle paths, plain `?.` chaining on
 * the service slot is preferred: no log, a silent no-op.
 *
 * Two rules decide whether an entry point guards:
 *
 * 1. **Commands, not queries.** `api.undo()` asked for something to happen, so
 *    silence is a bug report waiting to happen; `canUndo` asked a question, and
 *    `false` is a truthful answer that shouldn't log. Same for event getters
 *    falling back to a never-firing event, and for idempotent cleanup
 *    (`clearHistory()` on an absent history has genuinely nothing to do).
 *
 * 2. **Only if the option rule can't already have fired.** A command reachable
 *    without its gating option (`api.undo()` works on a component that never
 *    set `layoutHistory`) needs this, because no rule will have run. A command
 *    that can't be reached until the option is set doesn't: `setPanelPinned`
 *    returns early unless `pinnedTabs.enabled`, so by the time it could warn,
 *    the option rule has already named the same module. Guarding it too would
 *    report one mistake twice.
 *
 * Rule 2 tolerates one overlap: setting `layoutHistory.enabled` *and* calling
 * `api.undo()` without the module reports both, since the reasons differ and
 * dedup is per module+reason. That's the price of covering the far more likely
 * case: calling `undo()` having never set the option at all.
 *
 * Interaction handlers are queries in this sense too: a right-click reaching an
 * absent ContextMenu module means the app never asked for one, so it stays
 * silent (`?.`) and the browser's own menu shows. Options are where intent is
 * declared; see `optionsModules.ts`.
 */
export function assertModule<T>(
    service: T | undefined,
    moduleName: string,
    context?: string
): T | undefined {
    if (service !== undefined) {
        return service;
    }
    logMissingModule(moduleName, context);
    return undefined;
}

export class ModuleRegistry<THost> implements IDisposable {
    private readonly _modules = new Map<string, DockviewModule<any>>();
    private readonly _services: ServiceCollection = {};
    private readonly _initDisposables: IDisposable[] = [];
    private _panelStateContributors: IPanelStateContributor[] | undefined;
    private _tabDecorations: ITabDecoration[] | undefined;

    get services(): ServiceCollection {
        return this._services;
    }

    /**
     * The registered services that own a slice of panel state. Resolved once
     * after `initialize`; the service set doesn't change afterwards.
     */
    get panelStateContributors(): readonly IPanelStateContributor[] {
        if (this._panelStateContributors === undefined) {
            const contributors: IPanelStateContributor[] = [];
            const seen = new Set<string>();

            for (const service of Object.values(this._services)) {
                if (!isPanelStateContributor(service)) {
                    continue;
                }
                if (seen.has(service.panelStateKey)) {
                    // Two modules writing one key would silently clobber each
                    // other in every saved layout; fail loudly at construction
                    // instead of corrupting persistence.
                    throw new Error(
                        `dockview: duplicate panel state key '${service.panelStateKey}'`
                    );
                }
                seen.add(service.panelStateKey);
                contributors.push(service);
            }

            this._panelStateContributors = contributors;
        }

        return this._panelStateContributors;
    }

    /**
     * The registered services contributing a tab decoration, in render order.
     * Resolved once after `initialize`.
     */
    get tabDecorations(): readonly ITabDecoration[] {
        if (this._tabDecorations === undefined) {
            const decorations: ITabDecoration[] = [];
            const seen = new Set<string>();

            for (const service of Object.values(this._services)) {
                if (!isTabDecoration(service)) {
                    continue;
                }
                if (seen.has(service.decorationKey)) {
                    // Two decorations under one key would fight over the same
                    // slot on every tab; fail loudly instead.
                    throw new Error(
                        `dockview: duplicate tab decoration key '${service.decorationKey}'`
                    );
                }
                seen.add(service.decorationKey);
                decorations.push(service);
            }

            // Stable order: by `order`, then by key so registration sequence
            // never decides what a user sees.
            decorations.sort(
                (a, b) =>
                    (a.order ?? 0) - (b.order ?? 0) ||
                    a.decorationKey.localeCompare(b.decorationKey)
            );

            this._tabDecorations = decorations;
        }

        return this._tabDecorations;
    }

    register<H>(module: DockviewModule<H>): void {
        if (this._modules.has(module.moduleName)) {
            return;
        }
        if (module.dependsOn) {
            for (const dep of module.dependsOn) {
                this.register(dep);
            }
        }
        this._modules.set(module.moduleName, module);
    }

    initialize(host: THost): void {
        for (const module of this._modules.values()) {
            if (!module.services) {
                continue;
            }
            for (const [name, factory] of Object.entries(module.services)) {
                (this._services as Record<string, unknown>)[name] = (
                    factory as (h: THost) => unknown
                )(host);
            }
        }
    }

    postConstruct(host: THost): void {
        for (const module of this._modules.values()) {
            if (module.init) {
                this._initDisposables.push(
                    (
                        module.init as (
                            h: THost,
                            s: ServiceCollection
                        ) => IDisposable
                    )(host, this._services)
                );
            }
        }
    }

    has(moduleName: string): boolean {
        return this._modules.has(moduleName);
    }

    dispose(): void {
        // Tear down init() subscriptions first so they stop firing into
        // services that are about to be disposed.
        for (const disposable of this._initDisposables) {
            disposable.dispose();
        }
        this._initDisposables.length = 0;

        for (const service of Object.values(this._services)) {
            if (
                service !== undefined &&
                typeof (service as Partial<IDisposable>).dispose === 'function'
            ) {
                (service as IDisposable).dispose();
            }
        }
    }
}

/**
 * Process-global list of modules registered via {@link registerModules}.
 * `DockviewComponent` appends these to its built-in set at construction, so
 * importing a package that calls `registerModules(...)` (e.g. `dockview`)
 * makes those modules available to every component in the process.
 */
const _globalModules: DockviewModule<any>[] = [];

/**
 * Register modules globally. Idempotent per `moduleName`: registering the
 * same module twice is a no-op. Intended to be called once at import time by
 * the package that bundles a given set of modules.
 */
export function registerModules(modules: DockviewModule<any>[]): void {
    for (const module of modules) {
        if (_globalModules.some((m) => m.moduleName === module.moduleName)) {
            continue;
        }
        _globalModules.push(module);
    }
}

/**
 * Returns the globally-registered modules (a copy). `DockviewComponent` reads
 * this to extend its built-in module set.
 */
export function getRegisteredModules(): DockviewModule<any>[] {
    return [..._globalModules];
}

/**
 * For tests: clears the global module registry.
 */
export function clearRegisteredModules(): void {
    _globalModules.length = 0;
}
