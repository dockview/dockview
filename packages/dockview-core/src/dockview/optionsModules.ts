/**
 * Maps dockview options to the modules that implement them, so setting an
 * option for an absent module reports which module is missing instead of
 * silently doing nothing.
 *
 * This is the "declared intent" diagnostic. It fires when the user asks for a
 * feature via options, at construction and on every `updateOptions`. It
 * deliberately does *not* fire on user interaction: right-clicking without the
 * ContextMenu module stays silent (the browser's own menu shows), because the
 * `?.` service-slot call sites can't tell a missing module from a feature the
 * app never wanted.
 *
 * Rules are a flat list rather than a `Record<keyof DockviewOptions, ...>`
 * because dockview's options are nested and value-gated: `overflow.mode:
 * 'wrap'` needs MultiRowTabs while `overflow.search` needs AdvancedOverflow,
 * so one top-level key maps to several modules depending on its contents. A
 * rule per gated thing also lets `reason` name the exact path the user set,
 * which is the whole point of the message.
 *
 * ## Adding a rule
 *
 * A rule is just "this option needs that module". Whether that makes it paid is
 * not a judgement call: a module is enterprise iff it ships in
 * `dockview-enterprise`'s `Modules` list. {@link ENTERPRISE_MODULE_NAMES}
 * mirrors that list, and a test in dockview-enterprise fails if the two drift,
 * so naming the right module is the only thing you have to get right here.
 *
 * The one trap is picking the module. Don't infer it from what core does at
 * runtime: a core fallback that hands a paid feature to free builds would read
 * as "the option is free" and turn one bug into two. Pick the module that
 * *implements the documented feature*; if core also does it, that is a leak to
 * fix in core, not a reason to drop the rule.
 */

import { logMissingModule } from './modules';
import { DockviewComponentOptions, isAnyEdgeGroupEnabled } from './options';

export interface OptionModuleRule {
    /**
     * The top-level option this rule gates on. Several rules may share one key
     * (`overflow` gates both MultiRowTabs and AdvancedOverflow); `reason` carries
     * the precise path. Kept separate from `reason` so the completeness test in
     * dockview-enterprise can match rules to the options each module declares
     * without parsing prose.
     */
    optionKey: keyof DockviewComponentOptions;
    /**
     * How the user expressed intent, quoted verbatim into the message. Name
     * the exact option path and value, e.g. `overflow.mode: 'wrap'`.
     */
    reason: string;
    /** The module that implements it. */
    moduleName: string;
    /**
     * Whether `options` requests the feature. Receives the options the caller
     * passed, never the merged set: every key of `DockviewOptions` is present
     * (as `undefined`) on the merged object, so a presence test there is always
     * true. An option left out, `undefined`, or explicitly disabled must return
     * false: silence is correct for a feature nobody asked for.
     */
    when: (options: Partial<DockviewComponentOptions>) => boolean;
}

export const OPTION_MODULE_RULES: OptionModuleRule[] = [
    {
        optionKey: 'smartGuides',
        reason: 'smartGuides',
        moduleName: 'SmartGuides',
        // Present implies enabled; `enabled: false` is an explicit opt-out.
        // Truthiness rather than `!= null` so a JS caller passing the untyped
        // `smartGuides: false` (a reasonable guess at the off switch, and
        // whatever a binding forwards) isn't billed for disabling it.
        when: (o) => !!o.smartGuides && o.smartGuides.enabled !== false,
    },
    {
        optionKey: 'layoutHistory',
        reason: 'layoutHistory.enabled: true',
        moduleName: 'LayoutHistory',
        // Defaults to false: the module is inert until asked for.
        when: (o) => o.layoutHistory?.enabled === true,
    },
    {
        optionKey: 'pinnedTabs',
        reason: 'pinnedTabs.enabled: true',
        moduleName: 'PinnedTabs',
        when: (o) => o.pinnedTabs?.enabled === true,
    },
    {
        optionKey: 'overflow',
        reason: "overflow.mode: 'wrap'",
        moduleName: 'MultiRowTabs',
        when: (o) => o.overflow?.mode === 'wrap',
    },
    {
        optionKey: 'overflow',
        reason: 'overflow.maxRows',
        moduleName: 'MultiRowTabs',
        when: (o) => o.overflow?.maxRows != null,
    },
    {
        optionKey: 'overflow',
        reason: 'overflow.search',
        moduleName: 'AdvancedOverflow',
        when: (o) => !!o.overflow?.search,
    },
    {
        optionKey: 'overflow',
        reason: 'overflow.mru',
        moduleName: 'AdvancedOverflow',
        when: (o) => !!o.overflow?.mru,
    },
    {
        optionKey: 'autoHideEdgeGroups',
        reason: 'autoHideEdgeGroups',
        moduleName: 'AutoHideEdgeGroup',
        // Without the module a collapsed edge group renders an empty strip and
        // can't be pinned back; the activators are the module's whole job, so
        // core has no fallback here.
        when: (o) => isAnyEdgeGroupEnabled(o.autoHideEdgeGroups),
    },

    {
        optionKey: 'dockToEdgeGroups',
        reason: 'dockToEdgeGroups',
        moduleName: 'AutoEdgeGroup',
        // Dock-to-edge is a paid feature end to end: features.mdx ticks only
        // the Enterprise column and autoEdgeGroups.mdx is `enterprise: true`.
        // Core implements no part of it: its edge-drop handler always splits
        // the grid, and the widened activation band is gated on the service,
        // so without the module the option is inert and this is the only thing
        // that says so.
        when: (o) => isAnyEdgeGroupEnabled(o.dockToEdgeGroups),
    },

    // No rule for `edgeGroupPeek`: it only tunes `autoHideEdgeGroups`, and is
    // read solely by AutoHideEdgeGroupService. Alone it is inert even *with*
    // the module, so it can't justify a message of its own; alongside
    // `autoHideEdgeGroups` the rule above already covers it.
    {
        optionKey: 'getTabContextMenuItems',
        reason: 'getTabContextMenuItems',
        moduleName: 'ContextMenu',
        when: (o) => o.getTabContextMenuItems != null,
    },
    {
        optionKey: 'getTabGroupChipContextMenuItems',
        reason: 'getTabGroupChipContextMenuItems',
        moduleName: 'ContextMenu',
        when: (o) => o.getTabGroupChipContextMenuItems != null,
    },
    {
        optionKey: 'createContextMenuItemComponent',
        reason: 'createContextMenuItemComponent',
        moduleName: 'ContextMenu',
        when: (o) => o.createContextMenuItemComponent != null,
    },
    {
        optionKey: 'dndCompass',
        reason: 'dndCompass',
        moduleName: 'DndCompass',
        // Truthiness, not presence: `dndCompass` is `boolean | {...}`, so a
        // `!= null` test would fire on `dndCompass: false`, billing a user for
        // turning the compass off.
        when: (o) => !!o.dndCompass,
    },
    {
        optionKey: 'keyboardNavigation',
        reason: 'keyboardNavigation',
        moduleName: 'KeyboardNavigation',
        // Any truthy value opts in (`true` or an options object), mirroring
        // `readKeyboardNavigation` in the enterprise keyboard modules. Baseline
        // a11y (ARIA, within-strip arrow keys, live region, focus indicators)
        // is free and needs no option; this opt-in buys layout-level keyboard
        // operability, which is the paid part.
        //
        // The same opt-in also gates KeyboardDocking, but one message is
        // enough: both ship in dockview-enterprise, so the install fixes both,
        // and naming each separately would report one mistake twice.
        when: (o) => !!o.keyboardNavigation,
    },
];

/**
 * Reports any option in `options` whose module isn't registered. Never throws.
 *
 * Reasons are grouped so each missing module produces exactly one message, however
 * many of its options were set: `overflow: { mode: 'wrap', maxRows: 3 }` names
 * both paths in a single MultiRowTabs error rather than repeating the install
 * instructions twice. Logging is deduplicated per module+reasons (see
 * `logMissingModule`), so re-validating on every `updateOptions` stays quiet.
 *
 * Pass the options the caller supplied, not the merged set; see
 * {@link OptionModuleRule.when}.
 */
export function validateOptionModules(
    options: Partial<DockviewComponentOptions>,
    isModuleRegistered: (moduleName: string) => boolean
): void {
    const reasonsByModule = new Map<string, string[]>();

    for (const rule of OPTION_MODULE_RULES) {
        if (!rule.when(options) || isModuleRegistered(rule.moduleName)) {
            continue;
        }
        const reasons = reasonsByModule.get(rule.moduleName);
        if (reasons) {
            reasons.push(rule.reason);
        } else {
            reasonsByModule.set(rule.moduleName, [rule.reason]);
        }
    }

    for (const [moduleName, reasons] of reasonsByModule) {
        logMissingModule(moduleName, reasons);
    }
}
