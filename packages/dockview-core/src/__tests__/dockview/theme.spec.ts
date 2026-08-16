import {
    type DockviewTheme,
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
} from '../../dockview/theme';

describe('theme', () => {
    const allThemes: {
        theme: DockviewTheme;
        name: string;
        className: string;
    }[] = [
        { theme: themeDark, name: 'dark', className: 'dockview-theme-dark' },
        {
            theme: themeLight,
            name: 'light',
            className: 'dockview-theme-light',
        },
        {
            theme: themeVisualStudio,
            name: 'visualStudio',
            className: 'dockview-theme-vs',
        },
        {
            theme: themeAbyss,
            name: 'abyss',
            className: 'dockview-theme-abyss',
        },
        {
            theme: themeDracula,
            name: 'dracula',
            className: 'dockview-theme-dracula',
        },
        {
            theme: themeAbyssSpaced,
            name: 'abyssSpaced',
            className: 'dockview-theme-abyss-spaced',
        },
        {
            theme: themeLightSpaced,
            name: 'lightSpaced',
            className: 'dockview-theme-light-spaced',
        },
        {
            theme: themeNord,
            name: 'nord',
            className: 'dockview-theme-nord',
        },
        {
            theme: themeNordSpaced,
            name: 'nordSpaced',
            className: 'dockview-theme-nord-spaced',
        },
        {
            theme: themeCatppuccinMocha,
            name: 'catppuccinMocha',
            className: 'dockview-theme-catppuccin-mocha',
        },
        {
            theme: themeCatppuccinMochaSpaced,
            name: 'catppuccinMochaSpaced',
            className: 'dockview-theme-catppuccin-mocha-spaced',
        },
        {
            theme: themeMonokai,
            name: 'monokai',
            className: 'dockview-theme-monokai',
        },
        {
            theme: themeSolarizedLight,
            name: 'solarizedLight',
            className: 'dockview-theme-solarized-light',
        },
        {
            theme: themeSolarizedLightSpaced,
            name: 'solarizedLightSpaced',
            className: 'dockview-theme-solarized-light-spaced',
        },
        {
            theme: themeGithubDark,
            name: 'githubDark',
            className: 'dockview-theme-github-dark',
        },
        {
            theme: themeGithubDarkSpaced,
            name: 'githubDarkSpaced',
            className: 'dockview-theme-github-dark-spaced',
        },
        {
            theme: themeGithubLight,
            name: 'githubLight',
            className: 'dockview-theme-github-light',
        },
        {
            theme: themeGithubLightSpaced,
            name: 'githubLightSpaced',
            className: 'dockview-theme-github-light-spaced',
        },
        {
            theme: themeSlate,
            name: 'slate',
            className: 'dockview-theme-slate',
        },
        {
            theme: themeSlateDark,
            name: 'slateDark',
            className: 'dockview-theme-slate-dark',
        },
    ];

    test.each(allThemes)('theme $name has the expected name and className', ({
        theme,
        name,
        className,
    }) => {
        expect(theme.name).toBe(name);
        expect(theme.className).toBe(className);
    });

    test('every theme declares a colorScheme of light or dark', () => {
        for (const { theme } of allThemes) {
            expect(['light', 'dark']).toContain(theme.colorScheme);
        }
    });

    test('theme names are unique', () => {
        const names = allThemes.map(({ theme }) => theme.name);
        expect(new Set(names).size).toBe(names.length);
    });

    test('theme classNames are unique', () => {
        const classNames = allThemes.map(({ theme }) => theme.className);
        expect(new Set(classNames).size).toBe(classNames.length);
    });

    describe('colorScheme', () => {
        test('dark themes are marked dark', () => {
            const darkThemes = [
                themeDark,
                themeVisualStudio,
                themeAbyss,
                themeDracula,
                themeAbyssSpaced,
                themeNord,
                themeNordSpaced,
                themeCatppuccinMocha,
                themeCatppuccinMochaSpaced,
                themeMonokai,
                themeGithubDark,
                themeGithubDarkSpaced,
                themeSlateDark,
            ];
            for (const theme of darkThemes) {
                expect(theme.colorScheme).toBe('dark');
            }
        });

        test('light themes are marked light', () => {
            const lightThemes = [
                themeLight,
                themeLightSpaced,
                themeSolarizedLight,
                themeSolarizedLightSpaced,
                themeGithubLight,
                themeGithubLightSpaced,
                themeSlate,
            ];
            for (const theme of lightThemes) {
                expect(theme.colorScheme).toBe('light');
            }
        });
    });

    describe('non-spaced themes', () => {
        test('do not declare spacing / gap related overrides', () => {
            const nonSpaced = [
                themeDark,
                themeLight,
                themeAbyss,
                themeDracula,
                themeNord,
                themeCatppuccinMocha,
                themeMonokai,
                themeSolarizedLight,
                themeGithubDark,
                themeGithubLight,
            ];
            for (const theme of nonSpaced) {
                expect(theme.gap).toBeUndefined();
                expect(theme.dndOverlayMounting).toBeUndefined();
                expect(theme.dndPanelOverlay).toBeUndefined();
                expect(theme.dndTabIndicator).toBeUndefined();
                expect(theme.dndOverlayBorder).toBeUndefined();
            }
        });
    });

    describe('spaced themes', () => {
        const spacedThemes = [
            themeAbyssSpaced,
            themeLightSpaced,
            themeNordSpaced,
            themeCatppuccinMochaSpaced,
            themeSolarizedLightSpaced,
            themeGithubDarkSpaced,
            themeGithubLightSpaced,
        ];

        test('share the common spaced configuration', () => {
            for (const theme of spacedThemes) {
                expect(theme.gap).toBe(10);
                // Matches the compact spaced tab-strip height
                // (--dv-tabs-and-actions-container-height in the space mixin).
                expect(theme.edgeGroupCollapsedSize).toBe(28);
                expect(theme.dndOverlayMounting).toBe('absolute');
                expect(theme.dndPanelOverlay).toBe('group');
                expect(theme.dndTabIndicator).toBe('line');
                expect(theme.dndOverlayBorder).toBe(
                    '2px solid var(--dv-active-sash-color)'
                );
            }
        });
    });

    describe('specific overrides', () => {
        test('visualStudio overrides the edge group collapsed size to 22', () => {
            expect(themeVisualStudio.edgeGroupCollapsedSize).toBe(22);
        });

        test('abyss disables the tab group indicator', () => {
            expect(themeAbyss.tabGroupIndicator).toBe('none');
        });

        test('themes without an explicit tabGroupIndicator leave it undefined', () => {
            expect(themeDark.tabGroupIndicator).toBeUndefined();
            expect(themeLight.tabGroupIndicator).toBeUndefined();
            expect(themeAbyssSpaced.tabGroupIndicator).toBeUndefined();
        });
    });
});
