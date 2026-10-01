import { TabAnimation } from './options';
import {
    mergeThemeSettings,
    readThemeSettingsFromStyle,
} from './themeSettings';

export type DockviewTabGroupIndicator = 'wrap' | 'none';

export interface DockviewTheme {
    /**
     *  The name of the theme
     */
    name: string;
    /**
     * The class name to apply to the theme containing the CSS variables settings.
     */
    className: string;
    /**
     * Whether the theme is light or dark. Useful for adapting panel content colors.
     */
    colorScheme?: 'light' | 'dark';
    /**
     * The gap between the groups
     */
    gap?: number;
    /**
     * The collapsed size (in px) for edge groups when using this theme.
     * When set, this overrides the default 35px collapsed size so that
     * collapsed edge groups match the theme's tab strip height.
     */
    edgeGroupCollapsedSize?: number;
    /**
     * The mouting position of the overlay shown when dragging a panel. `absolute`
     * will mount the overlay to root of the dockview component whereas `relative` will mount the overlay to the group container.
     */
    dndOverlayMounting?: 'absolute' | 'relative';
    /**
     * When dragging a panel, the overlay can either encompass the panel contents or the entire group including the tab header space.
     */
    dndPanelOverlay?: 'content' | 'group';
    /**
     * The style of the drop indicator shown when dragging a tab over another tab.
     * `'line'` renders a thin 4px insertion strip at the tab edge (suited to bordered/spaced themes).
     * `'fill'` renders a half-width highlighted area (suited to themes that use a background fill).
     * Defaults to `'fill'`.
     */
    dndTabIndicator?: 'line' | 'fill';
    /**
     * The CSS value applied to `--dv-drag-over-border` when this theme is active.
     * For example `'2px solid var(--dv-active-sash-color)'`.
     * When unset the CSS variable is left to the stylesheet default (`none`).
     */
    dndOverlayBorder?: string;
    /**
     * Controls how tab groups are visually indicated in the tab bar.
     *
     * - `'wrap'` (default): Chrome-style SVG underline that wraps around the active tab
     *   with rounded corners. Requires JavaScript for positioning and path computation.
     * - `'none'`: Flat continuous colored bar spanning the full tab group width.
     *   Unlike `'wrap'`, the bar does not curve around the active tab.
     */
    tabGroupIndicator?: DockviewTabGroupIndicator;
    /**
     * Controls tab drag-and-drop reorder animation style.
     *
     * - `"smooth"`: tabs animate smoothly during drag-and-drop reorder. They
     *   slide apart to reveal the insertion gap, then animate to their
     *   final positions on drop (Chrome-like behavior).
     * - `"default"`: standard tab reorder behavior without animation.
     *
     * Defaults to `"default"`.
     */
    tabAnimation?: TabAnimation;
}

/**
 * Theme settings for layout and drag-and-drop behaviour. Each can be set on
 * the theme object or as a CSS custom property on the theme class:
 *
 * | setting                  | CSS custom property              | default |
 * | ------------------------ | -------------------------------- | ------- |
 * | `gap`                    | `--dv-group-gap`                 | `0`     |
 * | `edgeGroupCollapsedSize` | `--dv-edge-group-collapsed-size` | the tab strip height (`--dv-tabs-and-actions-container-height`), else `35` |
 * | `dndOverlayMounting`     | `--dv-dnd-overlay-mounting`      | `'relative'` |
 * | `dndPanelOverlay`        | `--dv-dnd-panel-overlay`         | `'content'` |
 * | `dndTabIndicator`        | `--dv-dnd-tab-indicator`         | `'fill'` |
 * | `tabGroupIndicator`      | `--dv-tab-group-indicator`       | `'wrap'` |
 * | `tabAnimation`           | `--dv-tab-animation`             | `'default'` |
 *
 * The theme object wins over CSS. Call `api.refreshTheme()` after changing
 * the CSS properties at runtime.
 */
export type DockviewThemeSettings = Pick<
    DockviewTheme,
    | 'gap'
    | 'edgeGroupCollapsedSize'
    | 'dndOverlayMounting'
    | 'dndPanelOverlay'
    | 'dndTabIndicator'
    | 'tabGroupIndicator'
    | 'tabAnimation'
>;

export type ResolvedDockviewThemeSettings = Required<DockviewThemeSettings>;

/**
 * Resolve a theme's settings outside a live dockview by reading the CSS of a
 * hidden element with `theme.className`. Without a document, uses the theme
 * object and defaults only.
 */
export function resolveDockviewThemeSettings(
    theme: DockviewTheme
): ResolvedDockviewThemeSettings {
    if (typeof document === 'undefined' || !document.body) {
        return mergeThemeSettings(theme, undefined);
    }
    const probe = document.createElement('div');
    probe.className = theme.className;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    try {
        return mergeThemeSettings(
            theme,
            readThemeSettingsFromStyle(getComputedStyle(probe))
        );
    } finally {
        probe.remove();
    }
}

/**
 * Derives every colour, radius and padding from five base tokens:
 * `--dv-background-color`, `--dv-foreground-color`, `--dv-accent-color`,
 * `--dv-spacing` and `--dv-border-radius`. Add your own class next to it to set
 * them, or to override any derived token.
 */
export const themeBase: DockviewTheme = {
    name: 'base',
    className: 'dockview-theme-base',
    colorScheme: 'dark',
};

export const themeDark: DockviewTheme = {
    name: 'dark',
    className: 'dockview-theme-dark',
    colorScheme: 'dark',
};

export const themeLight: DockviewTheme = {
    name: 'light',
    className: 'dockview-theme-light',
    colorScheme: 'light',
};

export const themeVisualStudio: DockviewTheme = {
    name: 'visualStudio',
    className: 'dockview-theme-vs',
    colorScheme: 'dark',
};

export const themeAbyss: DockviewTheme = {
    name: 'abyss',
    className: 'dockview-theme-abyss',
    colorScheme: 'dark',
};

export const themeDracula: DockviewTheme = {
    name: 'dracula',
    className: 'dockview-theme-dracula',
    colorScheme: 'dark',
};

export const themeAbyssSpaced: DockviewTheme = {
    name: 'abyssSpaced',
    className: 'dockview-theme-abyss-spaced',
    colorScheme: 'dark',
};

export const themeLightSpaced: DockviewTheme = {
    name: 'lightSpaced',
    className: 'dockview-theme-light-spaced',
    colorScheme: 'light',
};

export const themeNord: DockviewTheme = {
    name: 'nord',
    className: 'dockview-theme-nord',
    colorScheme: 'dark',
};

export const themeNordSpaced: DockviewTheme = {
    name: 'nordSpaced',
    className: 'dockview-theme-nord-spaced',
    colorScheme: 'dark',
};

export const themeCatppuccinMocha: DockviewTheme = {
    name: 'catppuccinMocha',
    className: 'dockview-theme-catppuccin-mocha',
    colorScheme: 'dark',
};

export const themeCatppuccinMochaSpaced: DockviewTheme = {
    name: 'catppuccinMochaSpaced',
    className: 'dockview-theme-catppuccin-mocha-spaced',
    colorScheme: 'dark',
};

export const themeMonokai: DockviewTheme = {
    name: 'monokai',
    className: 'dockview-theme-monokai',
    colorScheme: 'dark',
};

export const themeSolarizedLight: DockviewTheme = {
    name: 'solarizedLight',
    className: 'dockview-theme-solarized-light',
    colorScheme: 'light',
};

export const themeSolarizedLightSpaced: DockviewTheme = {
    name: 'solarizedLightSpaced',
    className: 'dockview-theme-solarized-light-spaced',
    colorScheme: 'light',
};

export const themeGithubDark: DockviewTheme = {
    name: 'githubDark',
    className: 'dockview-theme-github-dark',
    colorScheme: 'dark',
};

export const themeGithubDarkSpaced: DockviewTheme = {
    name: 'githubDarkSpaced',
    className: 'dockview-theme-github-dark-spaced',
    colorScheme: 'dark',
};

export const themeGithubLight: DockviewTheme = {
    name: 'githubLight',
    className: 'dockview-theme-github-light',
    colorScheme: 'light',
};

export const themeGithubLightSpaced: DockviewTheme = {
    name: 'githubLightSpaced',
    className: 'dockview-theme-github-light-spaced',
    colorScheme: 'light',
};

export const themeSlate: DockviewTheme = {
    name: 'slate',
    className: 'dockview-theme-slate',
    colorScheme: 'light',
};

export const themeSlateDark: DockviewTheme = {
    name: 'slateDark',
    className: 'dockview-theme-slate-dark',
    colorScheme: 'dark',
};

export const themeDarkRounded: DockviewTheme = {
    name: 'darkRounded',
    className: 'dockview-theme-dark-rounded',
    colorScheme: 'dark',
};
