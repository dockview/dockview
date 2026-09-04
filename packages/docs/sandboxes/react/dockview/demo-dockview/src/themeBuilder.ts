import {
    TabAnimation,
    DockviewTheme,
    themeAbyss,
    themeAbyssSpaced,
    themeCatppuccinMocha,
    themeCatppuccinMochaSpaced,
    themeDark,
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

export function getInitialStateFromTheme(
    theme: DockviewTheme
): ThemeBuilderState {
    return {
        gap: theme.gap ?? 0,
        dndOverlayMounting: theme.dndOverlayMounting ?? 'relative',
        dndPanelOverlay: theme.dndPanelOverlay ?? 'content',
        dndTabIndicator: theme.dndTabIndicator ?? 'fill',
        dndOverlayBorder: theme.dndOverlayBorder ?? '',
        tabGroupIndicator: theme.tabGroupIndicator ?? 'wrap',
        tabAnimation: theme.tabAnimation ?? 'default',
        cssOverrides: {},
    };
}

export function buildEffectiveTheme(
    baseTheme: DockviewTheme,
    state: ThemeBuilderState
): DockviewTheme {
    return {
        ...baseTheme,
        gap: state.gap > 0 ? state.gap : undefined,
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

    const themeFields: string[] = [];
    if (state.gap !== (baseTheme.gap ?? 0)) {
        themeFields.push(`  gap: ${state.gap},`);
    }
    if (
        state.dndOverlayMounting !==
        (baseTheme.dndOverlayMounting ?? 'relative')
    ) {
        themeFields.push(
            `  dndOverlayMounting: '${state.dndOverlayMounting}',`
        );
    }
    if (state.dndPanelOverlay !== (baseTheme.dndPanelOverlay ?? 'content')) {
        themeFields.push(`  dndPanelOverlay: '${state.dndPanelOverlay}',`);
    }
    if (state.dndTabIndicator !== (baseTheme.dndTabIndicator ?? 'fill')) {
        themeFields.push(`  dndTabIndicator: '${state.dndTabIndicator}',`);
    }
    if (state.dndOverlayBorder !== (baseTheme.dndOverlayBorder ?? '')) {
        themeFields.push(`  dndOverlayBorder: '${state.dndOverlayBorder}',`);
    }
    if (
        state.tabGroupIndicator !==
        (baseTheme.tabGroupIndicator ?? 'wrap')
    ) {
        themeFields.push(
            `  tabGroupIndicator: '${state.tabGroupIndicator}',`
        );
    }
    if (state.tabAnimation !== (baseTheme.tabAnimation ?? 'default')) {
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
