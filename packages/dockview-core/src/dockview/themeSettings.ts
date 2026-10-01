import type {
    DockviewTheme,
    DockviewThemeSettings,
    ResolvedDockviewThemeSettings,
} from './theme';

type StyleSource = Pick<CSSStyleDeclaration, 'getPropertyValue'>;

const DEFAULT_THEME_SETTINGS: ResolvedDockviewThemeSettings = {
    gap: 0,
    edgeGroupCollapsedSize: 35,
    dndOverlayMounting: 'relative',
    dndPanelOverlay: 'content',
    dndTabIndicator: 'fill',
    tabGroupIndicator: 'wrap',
    tabAnimation: 'default',
};

const ENUM_THEME_SETTINGS = {
    dndOverlayMounting: ['--dv-dnd-overlay-mounting', ['absolute', 'relative']],
    dndPanelOverlay: ['--dv-dnd-panel-overlay', ['content', 'group']],
    dndTabIndicator: ['--dv-dnd-tab-indicator', ['line', 'fill']],
    tabGroupIndicator: ['--dv-tab-group-indicator', ['wrap', 'none']],
    tabAnimation: ['--dv-tab-animation', ['smooth', 'default']],
} as const;

// Returns `''` when `getPropertyValue` is missing (partial `getComputedStyle`
// mocks in tests or non-browser environments).
export function readStyleProperty(
    style: StyleSource,
    property: string
): string {
    return typeof style.getPropertyValue === 'function'
        ? (style.getPropertyValue(property) ?? '').trim()
        : '';
}

function readFirst(styles: StyleSource[], property: string): string {
    for (const style of styles) {
        const value = readStyleProperty(style, property);
        if (value) {
            return value;
        }
    }
    return '';
}

function toPixels(value: string): number | undefined {
    // Only bare numbers and px lengths; other units and calc() are ignored.
    const number = value.endsWith('px') ? value.slice(0, -2) : value;
    if (number === '' || !Number.isFinite(Number(number))) {
        return undefined;
    }
    return Number(number);
}

/**
 * Read the {@link DockviewThemeSettings} declared in CSS. Each setting comes
 * from the first style that declares it; unset or unrecognised values are
 * omitted. The properties don't inherit, so each element reports only its own.
 */
export function readThemeSettingsFromStyle(
    style: StyleSource,
    ...fallbacks: StyleSource[]
): DockviewThemeSettings {
    const styles = [style, ...fallbacks];
    const settings: DockviewThemeSettings = {};

    const gap = toPixels(readFirst(styles, '--dv-group-gap'));
    if (gap !== undefined) {
        settings.gap = gap;
    }
    // The strip height does inherit, so `style` alone gives the one in effect.
    const collapsed =
        toPixels(readFirst(styles, '--dv-edge-group-collapsed-size')) ??
        toPixels(
            readStyleProperty(style, '--dv-tabs-and-actions-container-height')
        );
    if (collapsed !== undefined) {
        settings.edgeGroupCollapsedSize = collapsed;
    }

    for (const key of Object.keys(ENUM_THEME_SETTINGS) as Array<
        keyof typeof ENUM_THEME_SETTINGS
    >) {
        const [property, allowed] = ENUM_THEME_SETTINGS[key];
        const value = readFirst(styles, property);
        if ((allowed as readonly string[]).includes(value)) {
            (settings as Record<string, string>)[key] = value;
        }
    }

    return settings;
}

/** Theme object first, then CSS, then defaults. */
export function mergeThemeSettings(
    theme: DockviewTheme | undefined,
    fromCss: DockviewThemeSettings | undefined
): ResolvedDockviewThemeSettings {
    return {
        ...DEFAULT_THEME_SETTINGS,
        ...declaredThemeSettings(theme, fromCss),
    };
}

/** The settings the theme object or CSS declares, without defaults. */
export function declaredThemeSettings(
    theme: DockviewTheme | undefined,
    fromCss: DockviewThemeSettings | undefined
): DockviewThemeSettings {
    const declared: DockviewThemeSettings = {};
    for (const key of Object.keys(DEFAULT_THEME_SETTINGS) as Array<
        keyof DockviewThemeSettings
    >) {
        const value = theme?.[key] ?? fromCss?.[key];
        if (value !== undefined) {
            (declared as Record<string, unknown>)[key] = value;
        }
    }
    return declared;
}

/**
 * One declared setting, `undefined` when unset. No default is filled in, as
 * some callers (e.g. `tabAnimation`) treat unset differently from the default.
 */
export function themeSetting<K extends keyof DockviewThemeSettings>(
    host: {
        readonly options: { readonly theme?: DockviewTheme };
        readonly declaredThemeSettings?: DockviewThemeSettings;
    },
    key: K
): DockviewThemeSettings[K] {
    return host.declaredThemeSettings
        ? host.declaredThemeSettings[key]
        : host.options.theme?.[key];
}
