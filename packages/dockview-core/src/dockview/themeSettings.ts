import type {
    DockviewTheme,
    DockviewThemeSettings,
    ResolvedDockviewThemeSettings,
} from './theme';

/** Anything with `getPropertyValue`, e.g. a `CSSStyleDeclaration`. */
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

/** A property's value, or `''` where the style can't provide one (e.g. a
 *  partial `getComputedStyle` in a test or non-browser environment). */
export function readStyleProperty(
    style: StyleSource,
    property: string
): string {
    return typeof style.getPropertyValue === 'function'
        ? (style.getPropertyValue(property) ?? '').trim()
        : '';
}

/** The first non-empty value of `property` among `styles`, in order. */
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
    // A bare number or a px length; anything else (other units, calc()) is
    // not a resolvable pixel value here.
    const number = value.endsWith('px') ? value.slice(0, -2) : value;
    if (number === '' || !Number.isFinite(Number(number))) {
        return undefined;
    }
    return Number(number);
}

/**
 * Read the {@link DockviewThemeSettings} a theme declares in CSS (see the
 * table there) from computed styles. Each setting comes from the first style
 * that declares it, so `style` wins over `fallbacks` (the settings'
 * properties are registered as non-inheriting, so each element reports only
 * its own declarations). Unset or unrecognised values are omitted.
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
    // The strip height is an ordinary inherited property, so `style` alone
    // gives the one in effect.
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

/**
 * Merge a theme's settings: the theme object first, then the settings read
 * from CSS, then the defaults.
 */
export function mergeThemeSettings(
    theme: DockviewTheme | undefined,
    fromCss: DockviewThemeSettings | undefined
): ResolvedDockviewThemeSettings {
    return {
        ...DEFAULT_THEME_SETTINGS,
        ...declaredThemeSettings(theme, fromCss),
    };
}

/**
 * The settings a theme actually declares, on its object or in its CSS, with
 * no defaults filled in (`undefined` where neither sets one).
 */
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
 * One setting as the theme declares it (object, then CSS), `undefined` when
 * unset. Callers compare against the non-default value, and some tell an
 * unset value apart from an explicit default (e.g. `tabAnimation`), so the
 * defaults are deliberately not filled in here.
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
