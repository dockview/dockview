import {
    TabAnimation,
    DockviewTheme,
    resolveDockviewThemeSettings,
    themeAbyss,
    themeAbyssSpaced,
    themeCatppuccinMocha,
    themeCatppuccinMochaSpaced,
    themeDark,
    themeDarkRounded,
    themeDracula,
    themeGithubDark,
    themeGithubDarkSpaced,
    themeGithubLight,
    themeGithubLightSpaced,
    themeLight,
    themeLightSpaced,
    themeMonokai,
    themeNord,
    themeNordSpaced,
    themeSlate,
    themeSlateDark,
    themeSolarizedLight,
    themeSolarizedLightSpaced,
    themeVisualStudio,
} from 'dockview-react';

export const BUILTIN_THEMES: { theme: DockviewTheme; label: string }[] = [
    { theme: themeDark, label: 'Dark' },
    { theme: themeLight, label: 'Light' },
    { theme: themeVisualStudio, label: 'Visual Studio' },
    { theme: themeAbyss, label: 'Abyss' },
    { theme: themeDracula, label: 'Dracula' },
    { theme: themeLightSpaced, label: 'Light Spaced' },
    { theme: themeAbyssSpaced, label: 'Abyss Spaced' },
    { theme: themeNord, label: 'Nord' },
    { theme: themeNordSpaced, label: 'Nord Spaced' },
    { theme: themeCatppuccinMocha, label: 'Catppuccin Mocha' },
    { theme: themeCatppuccinMochaSpaced, label: 'Catppuccin Mocha Spaced' },
    { theme: themeMonokai, label: 'Monokai' },
    { theme: themeSolarizedLight, label: 'Solarized Light' },
    { theme: themeSolarizedLightSpaced, label: 'Solarized Light Spaced' },
    { theme: themeGithubDark, label: 'GitHub Dark' },
    { theme: themeGithubDarkSpaced, label: 'GitHub Dark Spaced' },
    { theme: themeGithubLight, label: 'GitHub Light' },
    { theme: themeGithubLightSpaced, label: 'GitHub Light Spaced' },
    { theme: themeSlate, label: 'Slate' },
    { theme: themeSlateDark, label: 'Slate Dark' },
    { theme: themeDarkRounded, label: 'Dark Rounded' },
];

export interface ThemeCssOverrides {
    '--dv-group-view-background-color'?: string;
    '--dv-tabs-and-actions-container-background-color'?: string;
    '--dv-tabs-and-actions-container-height'?: string;
    '--dv-tabs-and-actions-container-font-size'?: string;
    '--dv-border-radius'?: string;
    '--dv-spacing-padding'?: string;
    '--dv-tab-border-radius'?: string;
    '--dv-sash-border-radius'?: string;
    '--dv-floating-group-border'?: string;
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
    '--dv-drag-over-border'?: string;
    '--dv-active-sash-color'?: string;
    '--dv-sash-color'?: string;
    '--dv-scrollbar-background-color'?: string;
    '--dv-floating-box-shadow'?: string;
    '--dv-floating-border'?: string;
    '--dv-floating-group-dragging-opacity'?: string;
}

export interface ThemeBuilderState {
    gap: number;
    dndOverlayMounting: 'absolute' | 'relative';
    dndPanelOverlay: 'content' | 'group';
    dndTabIndicator: 'line' | 'fill';
    dndOverlayBorder: string;
    tabGroupIndicator: 'wrap' | 'none';
    tabAnimation: TabAnimation;
    cssOverrides: ThemeCssOverrides;
}

// The built-in themes declare their settings in CSS, so seed the builder
// from the resolved settings (theme object, then the theme's CSS, then the
// defaults) rather than the theme object alone.
export function getInitialStateFromTheme(
    theme: DockviewTheme
): ThemeBuilderState {
    const settings = resolveDockviewThemeSettings(theme);
    return {
        gap: settings.gap,
        dndOverlayMounting: settings.dndOverlayMounting,
        dndPanelOverlay: settings.dndPanelOverlay,
        dndTabIndicator: settings.dndTabIndicator,
        dndOverlayBorder: theme.dndOverlayBorder ?? '',
        tabGroupIndicator: settings.tabGroupIndicator,
        tabAnimation: settings.tabAnimation,
        cssOverrides: {},
    };
}

export function buildEffectiveTheme(
    baseTheme: DockviewTheme,
    state: ThemeBuilderState
): DockviewTheme {
    return {
        ...baseTheme,
        // Explicit, so 0 can override a theme whose CSS declares a gap.
        gap: state.gap,
        dndOverlayMounting: state.dndOverlayMounting,
        dndPanelOverlay: state.dndPanelOverlay,
        dndTabIndicator: state.dndTabIndicator,
        dndOverlayBorder: state.dndOverlayBorder || undefined,
        tabGroupIndicator: state.tabGroupIndicator,
        tabAnimation: state.tabAnimation,
    };
}

export function generateCodeSnippet(
    baseTheme: DockviewTheme,
    state: ThemeBuilderState
): string {
    const name = baseTheme.name;
    const importName = `theme${name.charAt(0).toUpperCase()}${name.slice(1)}`;

    const overrideEntries = Object.entries(state.cssOverrides).filter(
        ([, v]) => v !== undefined && v !== ''
    ) as [string, string][];

    const base = resolveDockviewThemeSettings(baseTheme);
    const themeFields: string[] = [];
    if (state.gap !== base.gap) {
        themeFields.push(`  gap: ${state.gap},`);
    }
    if (
        state.dndOverlayMounting !== base.dndOverlayMounting
    ) {
        themeFields.push(
            `  dndOverlayMounting: '${state.dndOverlayMounting}',`
        );
    }
    if (state.dndPanelOverlay !== base.dndPanelOverlay) {
        themeFields.push(`  dndPanelOverlay: '${state.dndPanelOverlay}',`);
    }
    if (state.dndTabIndicator !== base.dndTabIndicator) {
        themeFields.push(`  dndTabIndicator: '${state.dndTabIndicator}',`);
    }
    if (state.dndOverlayBorder !== (baseTheme.dndOverlayBorder ?? '')) {
        themeFields.push(`  dndOverlayBorder: '${state.dndOverlayBorder}',`);
    }
    if (
        state.tabGroupIndicator !== base.tabGroupIndicator
    ) {
        themeFields.push(
            `  tabGroupIndicator: '${state.tabGroupIndicator}',`
        );
    }
    if (state.tabAnimation !== base.tabAnimation) {
        themeFields.push(`  tabAnimation: '${state.tabAnimation}',`);
    }

    let out = `import { ${importName} } from 'dockview-react';\n\n`;

    if (themeFields.length > 0) {
        out += `const myTheme = {\n  ...${importName},\n${themeFields.join('\n')}\n};\n`;
    } else {
        out += `const myTheme = ${importName};\n`;
    }

    if (overrideEntries.length > 0) {
        out += `\n// Apply to the div wrapping <DockviewReact>:\nconst cssOverrides: React.CSSProperties = {\n`;
        for (const [k, v] of overrideEntries) {
            out += `  '${k}': '${v}',\n`;
        }
        out += `};\n`;
    }

    return out;
}
