import {
    DockviewTheme,
    DockviewThemeSettings,
    ResolvedDockviewThemeSettings,
    resolveDockviewThemeSettings,
    themeBase,
} from 'dockview-react';

/** The base theme derives everything from the tokens the builder sets. */
export const isBaseTheme = (theme: DockviewTheme) =>
    theme.name === themeBase.name;

export interface ThemeCssOverrides {
    'color-scheme'?: 'light' | 'dark';
    // Base tokens
    '--dv-background-color'?: string;
    '--dv-foreground-color'?: string;
    '--dv-accent-color'?: string;
    '--dv-spacing'?: string;
    '--dv-border-radius'?: string;
    // Layout
    '--dv-spacing-padding'?: string;
    '--dv-tabs-and-actions-container-height'?: string;
    '--dv-tabs-and-actions-container-font-size'?: string;
    '--dv-tab-border-radius'?: string;
    '--dv-sash-border-radius'?: string;
    '--dv-vertical-tab-border-radius'?: string;
    '--dv-dropdown-border-radius'?: string;
    '--dv-floating-border-radius'?: string;
    // Colours
    '--dv-group-view-background-color'?: string;
    '--dv-tabs-and-actions-container-background-color'?: string;
    '--dv-activegroup-visiblepanel-tab-background-color'?: string;
    '--dv-activegroup-hiddenpanel-tab-background-color'?: string;
    '--dv-inactivegroup-visiblepanel-tab-background-color'?: string;
    '--dv-inactivegroup-hiddenpanel-tab-background-color'?: string;
    '--dv-activegroup-visiblepanel-tab-color'?: string;
    '--dv-activegroup-hiddenpanel-tab-color'?: string;
    '--dv-inactivegroup-visiblepanel-tab-color'?: string;
    '--dv-inactivegroup-hiddenpanel-tab-color'?: string;
    '--dv-tab-divider-color'?: string;
    '--dv-separator-border'?: string;
    '--dv-paneview-header-border-color'?: string;
    '--dv-icon-hover-background-color'?: string;
    '--dv-drag-over-background-color'?: string;
    '--dv-active-sash-color'?: string;
    '--dv-sash-color'?: string;
    '--dv-tabs-container-scrollbar-color'?: string;
    '--dv-scrollbar-background-color'?: string;
    // Floating groups
    '--dv-floating-group-border'?: string;
    '--dv-floating-box-shadow'?: string;
    '--dv-floating-border'?: string;
    '--dv-floating-group-dragging-opacity'?: string;
}

/** Classes ("parts") added next to the theme's own class. */
export interface ThemeParts {
    /** Re-derive the theme's colours from the base tokens; layout unchanged. */
    baseColors: boolean;
    cards: boolean;
    connectedTabs: boolean;
}

const PART_CLASSES: Record<keyof ThemeParts, string> = {
    baseColors: 'dockview-base-colors',
    cards: 'dockview-spaced',
    connectedTabs: 'dockview-tabs-connected',
};

/**
 * Settings the user has changed. Anything left undefined comes from the
 * theme's CSS, so toggling a part (which declares its own settings) still
 * takes effect.
 */
export type ThemeSettingOverrides = Omit<
    DockviewThemeSettings,
    'edgeGroupCollapsedSize'
>;

export interface ThemeBuilderState {
    settings: ThemeSettingOverrides;
    dndOverlayBorder: string;
    parts: ThemeParts;
    cssOverrides: ThemeCssOverrides;
}

export function getInitialState(
    seed: ThemeCssOverrides = {},
    parts: Partial<ThemeParts> = {}
): ThemeBuilderState {
    return {
        settings: {},
        dndOverlayBorder: '',
        parts: {
            baseColors: false,
            cards: false,
            connectedTabs: false,
            ...parts,
        },
        cssOverrides: Object.fromEntries(
            Object.entries(seed).filter(([, v]) => v !== undefined && v !== '')
        ),
    };
}

function partClassNames(parts: ThemeParts): string[] {
    return (Object.keys(PART_CLASSES) as (keyof ThemeParts)[])
        .filter((key) => parts[key])
        .map((key) => PART_CLASSES[key]);
}

export function buildEffectiveTheme(
    baseTheme: DockviewTheme,
    state: ThemeBuilderState
): DockviewTheme {
    const className = [...partClassNames(state.parts), baseTheme.className]
        .filter(Boolean)
        .join(' ');
    const settings = Object.fromEntries(
        Object.entries(state.settings).filter(([, v]) => v !== undefined)
    );
    return {
        ...baseTheme,
        ...settings,
        colorScheme: state.cssOverrides['color-scheme'] ?? baseTheme.colorScheme,
        className,
        dndOverlayBorder:
            state.dndOverlayBorder || baseTheme.dndOverlayBorder || undefined,
    };
}

/** The settings in effect: user overrides, then the theme's CSS, then defaults. */
export function resolveSettings(
    baseTheme: DockviewTheme,
    state: ThemeBuilderState
): ResolvedDockviewThemeSettings {
    return resolveDockviewThemeSettings(buildEffectiveTheme(baseTheme, state));
}

const importNameOf = (theme: DockviewTheme) =>
    `theme${theme.name.charAt(0).toUpperCase()}${theme.name.slice(1)}`;

/**
 * The theme as code: a CSS class holding the overrides plus a theme object
 * that adds it. The class sits on the same element as the theme's own class,
 * so load it after dockview's stylesheet and its values win.
 */
export function generateCodeSnippet(
    baseTheme: DockviewTheme,
    state: ThemeBuilderState
): string {
    const custom = isBaseTheme(baseTheme);
    const overrides = Object.entries(state.cssOverrides).filter(
        ([, v]) => v !== undefined && v !== ''
    ) as [string, string][];

    const classes = [
        ...partClassNames(state.parts),
        '${' + importNameOf(baseTheme) + '.className}',
        ...(overrides.length > 0 ? ['my-theme'] : []),
    ].join(' ');

    const fields: string[] = [];
    for (const [key, value] of Object.entries(state.settings)) {
        if (value !== undefined) {
            fields.push(`    ${key}: ${JSON.stringify(value)},`);
        }
    }
    if (state.dndOverlayBorder) {
        fields.push(
            `    dndOverlayBorder: ${JSON.stringify(state.dndOverlayBorder)},`
        );
    }

    let out = '';
    if (overrides.length > 0) {
        out += '/* Load after dockview.css */\n.my-theme {\n';
        for (const [k, v] of overrides) {
            out += `    ${k}: ${v};\n`;
        }
        out += '}\n\n';
    }

    const importName = importNameOf(baseTheme);
    out += `import { DockviewTheme, ${importName} } from 'dockview-react';\n\n`;
    out += `const myTheme: DockviewTheme = {\n    ...${importName},\n`;
    if (custom) {
        out += `    name: 'mine',\n`;
    }
    if (classes !== '${' + importName + '.className}') {
        out += `    className: \`${classes}\`,\n`;
    }
    const scheme = state.cssOverrides['color-scheme'];
    if (scheme && scheme !== baseTheme.colorScheme) {
        out += `    colorScheme: '${scheme}',\n`;
    }
    if (fields.length > 0) {
        out += fields.join('\n') + '\n';
    }
    out += '};\n';
    return out;
}
