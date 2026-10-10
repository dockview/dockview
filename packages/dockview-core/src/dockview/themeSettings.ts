import type { DockviewTheme, ResolvedDockviewThemeSettings } from './theme';

const DEFAULT_THEME_SETTINGS: ResolvedDockviewThemeSettings = {
    gap: 0,
    edgeGroupCollapsedSize: 35,
    dndOverlayMounting: 'relative',
    dndPanelOverlay: 'content',
    dndTabIndicator: 'fill',
    tabGroupIndicator: 'wrap',
    tabAnimation: 'default',
};

// Returns `''` when `getPropertyValue` is missing (partial `getComputedStyle`
// mocks in tests or non-browser environments).
export function readStyleProperty(
    style: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
    property: string
): string {
    return typeof style.getPropertyValue === 'function'
        ? (style.getPropertyValue(property) ?? '').trim()
        : '';
}

/** The theme's settings, with defaults for those it leaves unset. */
export function resolveThemeSettings(
    theme: DockviewTheme | undefined
): ResolvedDockviewThemeSettings {
    const resolved = { ...DEFAULT_THEME_SETTINGS };
    for (const key of Object.keys(DEFAULT_THEME_SETTINGS) as Array<
        keyof ResolvedDockviewThemeSettings
    >) {
        const value = theme?.[key];
        if (value !== undefined) {
            (resolved as Record<string, unknown>)[key] = value;
        }
    }
    return resolved;
}
