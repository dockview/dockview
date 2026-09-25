// Every `--dv-*` custom property a theme can set, grouped by what it styles.
// Defaults live in `dockview-theme-core-mixin` (packages/dockview-core/src/theme.scss).
export const cssVariableConfig = [
    // ── Layout and sizing ──────────────────────────────────────────────────
    {
        key: '--dv-tabs-and-actions-container-height',
        text: 'Height of the tab strip (the width of a vertical edge-group rail).',
    },
    {
        key: '--dv-tabs-and-actions-container-font-size',
        text: 'Font size of the tab strip and its action buttons.',
    },
    {
        key: '--dv-tab-font-size',
        text: 'Font size of tab labels; `inherit` follows the strip font size.',
    },
    {
        key: '--dv-tab-margin',
        text: 'Margin around each tab. A top-only value insets a rounded tab from the strip edge.',
    },
    {
        key: '--dv-tab-close-icon-size',
        text: 'Size of the close glyph on the default tab.',
    },
    {
        key: '--dv-spacing-padding',
        text: 'Padding around the whole layout; used by the spaced themes.',
    },
    {
        key: '--dv-border-radius',
        text: 'Corner radius of groups and floating cards; used by the spaced themes.',
    },
    {
        key: '--dv-tab-border-radius',
        text: 'Top-corner radius of tabs (all four corners on spaced pill tabs).',
    },
    { key: '--dv-sash-border-radius', text: 'Corner radius of the resize sashes.' },
    {
        key: '--dv-dropdown-border-radius',
        text: 'Corner radius of the tab overflow dropdown.',
    },

    // ── Colours ────────────────────────────────────────────────────────────
    {
        key: '--dv-group-view-background-color',
        text: 'Background of a group (and of the gaps between groups).',
    },
    {
        key: '--dv-tabs-and-actions-container-background-color',
        text: 'Background of the tab strip.',
    },
    {
        key: '--dv-activegroup-visiblepanel-tab-background-color',
        text: 'Background of the visible panel’s tab in the focused group.',
    },
    {
        key: '--dv-activegroup-hiddenpanel-tab-background-color',
        text: 'Background of a hidden panel’s tab in the focused group.',
    },
    {
        key: '--dv-inactivegroup-visiblepanel-tab-background-color',
        text: 'Background of the visible panel’s tab in an unfocused group.',
    },
    {
        key: '--dv-inactivegroup-hiddenpanel-tab-background-color',
        text: 'Background of a hidden panel’s tab in an unfocused group.',
    },
    {
        key: '--dv-activegroup-visiblepanel-tab-color',
        text: 'Label colour of the visible panel’s tab in the focused group.',
    },
    {
        key: '--dv-activegroup-hiddenpanel-tab-color',
        text: 'Label colour of a hidden panel’s tab in the focused group.',
    },
    {
        key: '--dv-inactivegroup-visiblepanel-tab-color',
        text: 'Label colour of the visible panel’s tab in an unfocused group.',
    },
    {
        key: '--dv-inactivegroup-hiddenpanel-tab-color',
        text: 'Label colour of a hidden panel’s tab in an unfocused group.',
    },
    {
        key: '--dv-tab-inactive-hover-background-color',
        text: 'Fill of a hidden panel’s tab while hovered.',
    },
    {
        key: '--dv-tab-divider-color',
        text: 'Hairline between adjacent tabs; also the border of the tab overflow list and context menu.',
    },
    {
        key: '--dv-separator-border',
        text: 'Colour of the 1px separators between groups.',
    },
    {
        key: '--dv-paneview-header-border-color',
        text: 'Border between paneview section headers; defaults to `--dv-separator-border`.',
    },
    {
        key: '--dv-paneview-active-outline-color',
        text: 'Focus outline of the active paneview section.',
    },
    {
        key: '--dv-icon-hover-background-color',
        text: 'Hover fill behind action icons (close, overflow, group controls).',
    },
    {
        key: '--dv-tabs-container-scrollbar-color',
        text: 'Thumb colour of the tab strip’s overflow scrollbar.',
    },
    {
        key: '--dv-scrollbar-background-color',
        text: 'Thumb colour of the custom panel scrollbar.',
    },

    // ── Active-tab marker ──────────────────────────────────────────────────
    {
        key: '--dv-tab-marker-size',
        text: 'Thickness of the active-tab marker drawn on the edge that meets the content.',
    },
    {
        key: '--dv-activegroup-tab-marker-color',
        text: 'Active-tab marker colour in the focused group; `transparent` (default) hides it.',
    },
    {
        key: '--dv-inactivegroup-tab-marker-color',
        text: 'Active-tab marker colour in an unfocused group.',
    },

    // ── Keyboard focus ─────────────────────────────────────────────────────
    {
        key: '--dv-focus-ring-color',
        text: 'Colour of the keyboard focus ring on tabs, the overflow list, floating title-bar buttons and paneview headers; defaults to `--dv-paneview-active-outline-color`.',
    },
    { key: '--dv-focus-ring-width', text: 'Thickness of the keyboard focus ring.' },

    // ── Connected (folder) tabs ────────────────────────────────────────────
    {
        key: '--dv-tab-shoulder-size',
        text: 'Size of the concave shoulders at the base of the active tab; `0` turns them off.',
    },
    {
        key: '--dv-tab-shoulder-color',
        text: 'Shoulder colour; defaults to the active tab background.',
    },

    // ── Sashes ─────────────────────────────────────────────────────────────
    { key: '--dv-sash-color', text: 'Resting colour of the resize sashes.' },
    {
        key: '--dv-active-sash-color',
        text: 'Sash colour while hovered or dragged.',
    },
    {
        key: '--dv-active-sash-transition-duration',
        text: 'Fade duration of the active sash colour.',
    },
    {
        key: '--dv-active-sash-transition-delay',
        text: 'Delay before the active sash colour fades in on hover.',
    },

    // ── Drag and drop ──────────────────────────────────────────────────────
    {
        key: '--dv-drag-over-background-color',
        text: 'Fill of the drop preview while dragging over a target.',
    },
    {
        key: '--dv-drag-over-border-color',
        text: 'Colour of the drop-position lines (tab insertion strip edge, multi-row reorder bars, pinned-tab drop bar); defaults to `--dv-paneview-active-outline-color`.',
    },
    {
        key: '--dv-drag-over-border',
        text: 'Border of the drop preview (a full `border` value).',
    },
    {
        key: '--dv-drop-target-border-radius',
        text: 'Corner radius of the drop preview.',
    },
    {
        key: '--dv-edge-dock-indicator-color',
        text: 'Colour of the edge reveal line shown while dragging towards a layout edge.',
    },

    // ── Floating groups ────────────────────────────────────────────────────
    { key: '--dv-floating-box-shadow', text: 'Shadow of a floating group.' },
    {
        key: '--dv-floating-border',
        text: 'Border of a floating group (a full `border` value).',
    },
    {
        key: '--dv-floating-border-radius',
        text: 'Corner radius of a floating group’s frame.',
    },
    {
        key: '--dv-floating-inset',
        text: 'Inset between a floating group’s frame and its content.',
    },
    {
        key: '--dv-floating-frame-color',
        text: 'Colour of the frame revealed by `--dv-floating-inset`.',
    },
    {
        key: '--dv-floating-group-border',
        text: 'Border of the group inside a floating container (a full `border` value).',
    },
    {
        key: '--dv-floating-group-dragging-opacity',
        text: 'Opacity of a floating group while it is being dragged.',
    },
    {
        key: '--dv-floating-titlebar-height',
        text: 'Height of the floating group’s drag handle bar.',
    },
    {
        key: '--dv-floating-titlebar-background-color',
        text: 'Background of the drag handle bar.',
    },
    {
        key: '--dv-floating-titlebar-border-bottom',
        text: 'Border below the drag handle bar (a full `border` value).',
    },
    {
        key: '--dv-floating-titlebar-handle-color',
        text: 'Colour of the dotted grip in the drag handle bar; `transparent` (default) hides it.',
    },
    {
        key: '--dv-floating-titlebar-handle-size',
        text: 'Size of the dotted grip.',
    },
    {
        key: '--dv-floating-titlebar-cursor',
        text: 'Cursor shown over the drag handle bar.',
    },
    {
        key: '--dv-overlay-z-index',
        text: 'Base z-index of floating groups and overlays.',
    },

    // ── Context menu ───────────────────────────────────────────────────────
    {
        key: '--dv-context-menu-background-color',
        text: 'Background of the tab context menu; defaults to the tab strip colour.',
    },
    {
        key: '--dv-context-menu-color',
        text: 'Text colour of the context menu; defaults to the visible panel’s tab colour.',
    },
    {
        key: '--dv-context-menu-border-color',
        text: 'Border and separator colour of the context menu; defaults to `--dv-separator-border`.',
    },

    // ── Tab groups ─────────────────────────────────────────────────────────
    {
        key: '--dv-tab-group-color-grey',
        text: 'Tab group palette: grey. The other entries are `-blue`, `-red`, `-yellow`, `-green`, `-pink`, `-purple`, `-cyan` and `-orange`.',
    },
    {
        key: '--dv-tab-group-chip-padding',
        text: 'Padding of a collapsed tab group chip.',
    },
    {
        key: '--dv-tab-group-chip-border-radius',
        text: 'Corner radius of a tab group chip.',
    },
    {
        key: '--dv-tab-group-chip-font-size',
        text: 'Font size of a tab group chip.',
    },
    {
        key: '--dv-tab-group-line-height',
        text: 'Thickness of the tab group underline.',
    },
    {
        key: '--dv-tab-group-line-opacity',
        text: 'Opacity of the tab group underline.',
    },
];
