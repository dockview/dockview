// Every property of the `DockviewTheme` object.

export interface ThemeObjectProperty {
    name: string;
    type: string;
    default: string;
    text: string;
}

export const themeObjectProperties: ThemeObjectProperty[] = [
    {
        name: 'name',
        type: 'string',
        default: 'required',
        text: 'Identifies the theme, for example in a theme picker.',
    },
    {
        name: 'className',
        type: 'string',
        default: 'required',
        text: 'The class or classes applied to the dock, which declare the theme\'s CSS variables. Several can be combined, for example `dockview-spaced dockview-theme-slate my-theme`.',
    },
    {
        name: 'colorScheme',
        type: "'light' | 'dark'",
        default: 'unset',
        text: 'Whether the theme is light or dark, so an app can match its panel content. The theme class sets the CSS `color-scheme` itself.',
    },
    {
        name: 'gap',
        type: 'number',
        default: '`0`',
        text: 'Space between groups, and between the edge groups and the main area, in px.',
    },
    {
        name: 'edgeGroupCollapsedSize',
        type: 'number',
        default: '`35`',
        text: 'Width (or height) of a collapsed edge group, in px.',
    },
    {
        name: 'dndOverlayMounting',
        type: "'absolute' | 'relative'",
        default: "`'relative'`",
        text: "Where the drop preview mounts: in the group (`relative`) or at the layout root (`absolute`).",
    },
    {
        name: 'dndPanelOverlay',
        type: "'content' | 'group'",
        default: "`'content'`",
        text: 'Whether a drop over a group previews over its content or the whole group, tab strip included.',
    },
    {
        name: 'dndTabIndicator',
        type: "'line' | 'fill'",
        default: "`'fill'`",
        text: 'The preview when dropping onto a tab: an insertion line or a half-tab fill.',
    },
    {
        name: 'dndOverlayBorder',
        type: 'string',
        default: '`none`',
        text: 'A CSS border for the drop preview, for example `2px solid var(--dv-active-sash-color)`. Sets `--dv-drag-over-border`.',
    },
    {
        name: 'tabGroupIndicator',
        type: "'wrap' | 'none'",
        default: "`'wrap'`",
        text: 'How tab groups are marked in the strip: an outline that wraps the active tab, or a flat bar.',
    },
    {
        name: 'tabAnimation',
        type: "'default' | 'smooth'",
        default: "`'default'`",
        text: 'Whether tabs slide apart and animate into place while one is dragged to reorder.',
    },
];
