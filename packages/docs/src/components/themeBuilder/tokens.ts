// The tokens the theme builder exposes, grouped as the Advanced panel shows
// them. `derived` marks tokens that follow the base tokens (on the base theme,
// or with derived colours) until they are set.

export type TokenKind = 'color' | 'length' | 'number' | 'text';

export interface TokenDef {
    name: string;
    label: string;
    kind: TokenKind;
    group: TokenGroup;
    description: string;
    derived?: boolean;
    min?: number;
    max?: number;
    step?: number;
}

export type TokenGroup =
    | 'Surfaces'
    | 'Tabs: focused group'
    | 'Tabs: other groups'
    | 'Lines and details'
    | 'Shape'
    | 'Floating groups'
    | 'Drag and drop';

export const TOKEN_GROUPS: TokenGroup[] = [
    'Surfaces',
    'Tabs: focused group',
    'Tabs: other groups',
    'Lines and details',
    'Shape',
    'Floating groups',
    'Drag and drop',
];

const color = (
    name: string,
    label: string,
    group: TokenGroup,
    description: string,
    derived = true
): TokenDef => ({ name, label, kind: 'color', group, description, derived });

const length = (
    name: string,
    label: string,
    group: TokenGroup,
    description: string,
    max = 20,
    derived = false
): TokenDef => ({
    name,
    label,
    kind: 'length',
    group,
    description,
    derived,
    min: 0,
    max,
});

export const TOKENS: TokenDef[] = [
    // Surfaces
    color(
        '--dv-group-view-background-color',
        'Group background',
        'Surfaces',
        'Behind the content of every group. Defaults to Background.'
    ),
    color(
        '--dv-tabs-and-actions-container-background-color',
        'Tab strip',
        'Surfaces',
        'The row of tabs and header actions. A step away from Background.'
    ),
    color(
        '--dv-content-background-color',
        'Content',
        'Surfaces',
        'Behind panel content. Transparent unless a layout sets it (cards, sheets).',
        false
    ),
    color(
        '--dv-root-background-color',
        'Layout background',
        'Surfaces',
        'Behind the whole layout, visible in the gaps of the cards and sheet layouts.',
        false
    ),

    // Tabs, focused group
    color(
        '--dv-activegroup-visiblepanel-tab-background-color',
        'Selected tab',
        'Tabs: focused group',
        'The open tab of the focused group. Defaults to the group background.'
    ),
    color(
        '--dv-activegroup-visiblepanel-tab-color',
        'Selected tab text',
        'Tabs: focused group',
        'Defaults to Foreground.'
    ),
    color(
        '--dv-activegroup-hiddenpanel-tab-background-color',
        'Other tabs',
        'Tabs: focused group',
        'Tabs that are not open. A further step from Background.'
    ),
    color(
        '--dv-activegroup-hiddenpanel-tab-color',
        'Other tabs text',
        'Tabs: focused group',
        'Foreground at 65%.'
    ),
    color(
        '--dv-tab-inactive-hover-background-color',
        'Tab hover',
        'Tabs: focused group',
        'An unselected tab under the pointer.'
    ),
    color(
        '--dv-activegroup-tab-marker-color',
        'Selected tab marker',
        'Tabs: focused group',
        'A line on the selected tab, facing the content. Transparent unless set.',
        false
    ),

    // Tabs, other groups
    color(
        '--dv-inactivegroup-visiblepanel-tab-background-color',
        'Selected tab',
        'Tabs: other groups',
        'The open tab of groups without focus.'
    ),
    color(
        '--dv-inactivegroup-visiblepanel-tab-color',
        'Selected tab text',
        'Tabs: other groups',
        'Foreground at 75%.'
    ),
    color(
        '--dv-inactivegroup-hiddenpanel-tab-background-color',
        'Other tabs',
        'Tabs: other groups',
        'Unselected tabs of groups without focus.'
    ),
    color(
        '--dv-inactivegroup-hiddenpanel-tab-color',
        'Other tabs text',
        'Tabs: other groups',
        'Foreground at 50%.'
    ),

    // Lines and details
    color(
        '--dv-separator-border',
        'Separators',
        'Lines and details',
        'Lines between groups and under the tab strip. Foreground at 18%.'
    ),
    color(
        '--dv-tab-divider-color',
        'Tab dividers',
        'Lines and details',
        'Short lines between unselected tabs, and menu borders.'
    ),
    color(
        '--dv-icon-hover-background-color',
        'Icon hover',
        'Lines and details',
        'Behind header action and close icons under the pointer.'
    ),
    color(
        '--dv-active-sash-color',
        'Resize handle (active)',
        'Lines and details',
        'The sash between groups while it is hovered or dragged. Defaults to Accent.'
    ),
    color(
        '--dv-focus-ring-color',
        'Focus ring',
        'Lines and details',
        'Keyboard focus outline. Defaults to Accent.'
    ),
    color(
        '--dv-scrollbar-background-color',
        'Scrollbar',
        'Lines and details',
        "Dockview's own scrollbars."
    ),

    // Shape
    length(
        '--dv-tab-border-radius',
        'Tab radius',
        'Shape',
        "Corners of a tab. Defaults to ⅔ of Border radius.",
        20,
        true
    ),
    length(
        '--dv-tab-shoulder-size',
        'Tab flare',
        'Shape',
        'The curve where the selected tab meets the content. 0 turns it off; the connected tabs layout sets it.',
        16
    ),
    length(
        '--dv-vertical-tab-border-radius',
        'Tab radius on rails',
        'Shape',
        'Tabs on collapsed edge groups. Defaults to the tab radius.'
    ),
    length(
        '--dv-floating-border-radius',
        'Floating group radius',
        'Shape',
        'Defaults to Border radius.',
        20,
        true
    ),
    length(
        '--dv-dropdown-border-radius',
        'Menu radius',
        'Shape',
        'Tab overflow list and context menu. Defaults to ⅔ of Border radius.',
        20,
        true
    ),
    length(
        '--dv-sash-border-radius',
        'Resize handle radius',
        'Shape',
        'Defaults to ⅓ of Border radius.',
        20,
        true
    ),

    // Floating groups
    {
        name: '--dv-floating-group-dragging-opacity',
        label: 'Opacity while dragging',
        kind: 'number',
        group: 'Floating groups',
        description: 'Opacity of a floating group as it is moved.',
        min: 0,
        max: 1,
        step: 0.05,
    },
    {
        name: '--dv-floating-box-shadow',
        label: 'Shadow',
        kind: 'text',
        group: 'Floating groups',
        description: 'Any CSS box-shadow.',
    },
    {
        name: '--dv-floating-border',
        label: 'Frame border',
        kind: 'text',
        group: 'Floating groups',
        description: 'Any CSS border, for example 1px solid #444.',
    },

    // Drag and drop
    color(
        '--dv-drag-over-background-color',
        'Drop fill',
        'Drag and drop',
        'The preview where a dragged panel will land. Accent at 25%.'
    ),
    color(
        '--dv-drag-over-border-color',
        'Drop line',
        'Drag and drop',
        'The insertion line when dropping between tabs. Defaults to Accent.'
    ),
];

export const TOKEN_BY_NAME = new Map(TOKENS.map((t) => [t.name, t]));

/** Base tokens the Essentials panel edits directly. */
export const BASE_COLORS = [
    '--dv-background-color',
    '--dv-foreground-color',
    '--dv-accent-color',
] as const;

export const ESSENTIAL_LENGTHS = [
    {
        name: '--dv-border-radius',
        label: 'Border radius',
        min: 0,
        max: 20,
        fallback: 0,
    },
    { name: '--dv-spacing', label: 'Spacing', min: 1, max: 8, fallback: 4 },
    {
        name: '--dv-tabs-and-actions-container-height',
        label: 'Tab bar height',
        min: 20,
        max: 56,
        fallback: 35,
    },
    {
        name: '--dv-tabs-and-actions-container-font-size',
        label: 'Font size',
        min: 10,
        max: 18,
        fallback: 13,
    },
] as const;
