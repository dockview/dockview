import {
    type DockviewTheme,
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
} from '../../dockview/theme';
import {
    declaredThemeSettings,
    mergeThemeSettings,
    readThemeSettingsFromStyle,
    themeSetting,
} from '../../dockview/themeSettings';

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
        {
            theme: themeDarkRounded,
            name: 'darkRounded',
            className: 'dockview-theme-dark-rounded',
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
                themeDarkRounded,
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

    describe('settings', () => {
        test('built-in presets leave every setting to their CSS', () => {
            // Gap, collapsed size and the drag-and-drop modes are declared by
            // each theme's stylesheet (see themeStylesheet.spec.ts), so CSS
            // alone can restyle or override a built-in theme.
            for (const { theme } of allThemes) {
                expect(Object.keys(theme).sort()).toEqual(
                    ['className', 'colorScheme', 'name'].sort()
                );
            }
        });

        const style = (values: Record<string, string>) => ({
            getPropertyValue: (name: string) => values[name] ?? '',
        });

        test('reads each setting from its custom property', () => {
            expect(
                readThemeSettingsFromStyle(
                    style({
                        '--dv-group-gap': '10px',
                        '--dv-edge-group-collapsed-size': ' 28px',
                        '--dv-dnd-overlay-mounting': 'absolute',
                        '--dv-dnd-panel-overlay': 'group',
                        '--dv-dnd-tab-indicator': ' line',
                        '--dv-tab-group-indicator': 'none',
                        '--dv-tab-animation': 'smooth',
                    })
                )
            ).toEqual({
                gap: 10,
                edgeGroupCollapsedSize: 28,
                dndOverlayMounting: 'absolute',
                dndPanelOverlay: 'group',
                dndTabIndicator: 'line',
                tabGroupIndicator: 'none',
                tabAnimation: 'smooth',
            });
        });

        test('the collapsed size falls back to the tab strip height', () => {
            expect(
                readThemeSettingsFromStyle(
                    style({ '--dv-tabs-and-actions-container-height': '22px' })
                )
            ).toEqual({ edgeGroupCollapsedSize: 22 });
        });

        test('takes each setting from the first style that declares it', () => {
            const root = style({ '--dv-group-gap': '4px' });
            const shell = style({
                '--dv-group-gap': '10px',
                '--dv-dnd-tab-indicator': 'line',
                '--dv-edge-group-collapsed-size': '30px',
            });
            expect(readThemeSettingsFromStyle(root, shell)).toEqual({
                gap: 4,
                dndTabIndicator: 'line',
                edgeGroupCollapsedSize: 30,
            });
        });

        test('ignores unset and unrecognised values', () => {
            expect(
                readThemeSettingsFromStyle(
                    style({
                        '--dv-group-gap': 'calc(1px + 2px)',
                        '--dv-dnd-tab-indicator': 'dashed',
                    })
                )
            ).toEqual({});
        });

        test('the theme object wins over CSS, CSS over the defaults', () => {
            expect(
                mergeThemeSettings(
                    { name: 'x', className: 'x', gap: 4 },
                    { gap: 10, dndTabIndicator: 'line' }
                )
            ).toEqual({
                gap: 4,
                edgeGroupCollapsedSize: 35,
                dndOverlayMounting: 'relative',
                dndPanelOverlay: 'content',
                dndTabIndicator: 'line',
                tabGroupIndicator: 'wrap',
                tabAnimation: 'default',
            });
        });

        test('resolveDockviewThemeSettings reads a theme class without a dockview', () => {
            const style = document.createElement('style');
            style.textContent =
                '.probe-theme { --dv-group-gap: 6px; --dv-dnd-tab-indicator: line; }';
            document.head.appendChild(style);
            try {
                const settings = resolveDockviewThemeSettings({
                    name: 'probe',
                    className: 'probe-theme',
                    tabAnimation: 'smooth',
                });
                expect(settings.gap).toBe(6);
                expect(settings.dndTabIndicator).toBe('line');
                expect(settings.tabAnimation).toBe('smooth');
                expect(document.body.querySelector('.probe-theme')).toBeNull();
            } finally {
                style.remove();
            }
        });

        test('a partial style object reads as unset', () => {
            expect(
                readThemeSettingsFromStyle({} as CSSStyleDeclaration)
            ).toEqual({});
        });

        test("themeSetting reads a host's declared settings, unset stays unset", () => {
            const theme: DockviewTheme = {
                name: 'x',
                className: 'x',
                tabAnimation: 'default',
            };
            // Without declared settings (e.g. a test double), the object.
            expect(themeSetting({ options: { theme } }, 'tabAnimation')).toBe(
                'default'
            );
            // CSS declarations count; defaults are not filled in, so an
            // unset `tabAnimation` is distinguishable from 'default'.
            const host = {
                options: { theme: { name: 'y', className: 'y' } },
                declaredThemeSettings: declaredThemeSettings(
                    { name: 'y', className: 'y' },
                    { dndTabIndicator: 'line' }
                ),
            };
            expect(themeSetting(host, 'dndTabIndicator')).toBe('line');
            expect(themeSetting(host, 'tabAnimation')).toBeUndefined();
        });
    });
});
