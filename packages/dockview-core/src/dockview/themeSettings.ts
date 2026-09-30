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
function read(style: StyleSource, property: string): string {
    return typeof style.getPropertyValue === 'function'
        ? (style.getPropertyValue(property) ?? '').trim()
        : '';
}

function readPixels(style: StyleSource, property: string): number | undefined {
    const value = read(style, property);
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
 * table there) from a computed style. Unset or unrecognised values are
 * omitted.
 */
export function readThemeSettingsFromStyle(
    style: StyleSource
): DockviewThemeSettings {
    const settings: DockviewThemeSettings = {};

    const gap = readPixels(style, '--dv-group-gap');
    if (gap !== undefined) {
        settings.gap = gap;
    }
    const collapsed =
        readPixels(style, '--dv-edge-group-collapsed-size') ??
        readPixels(style, '--dv-tabs-and-actions-container-height');
    if (collapsed !== undefined) {
        settings.edgeGroupCollapsedSize = collapsed;
    }

    for (const key of Object.keys(ENUM_THEME_SETTINGS) as Array<
        keyof typeof ENUM_THEME_SETTINGS
    >) {
        const [property, allowed] = ENUM_THEME_SETTINGS[key];
        const value = read(style, property);
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
    const resolved = { ...DEFAULT_THEME_SETTINGS };
    for (const key of Object.keys(resolved) as Array<
        keyof ResolvedDockviewThemeSettings
    >) {
        const value = theme?.[key] ?? fromCss?.[key];
        if (value !== undefined) {
            (resolved as Record<string, unknown>)[key] = value;
        }
    }
    return resolved;
}

/**
 * One resolved setting for a dockview: its resolved theme settings when it
 * has them, else the theme object's value.
 */
export function themeSetting<K extends keyof DockviewThemeSettings>(
    host: {
        readonly options: { readonly theme?: DockviewTheme };
        readonly themeSettings?: ResolvedDockviewThemeSettings;
    },
    key: K
): DockviewThemeSettings[K] {
    return host.themeSettings?.[key] ?? host.options.theme?.[key];
}
