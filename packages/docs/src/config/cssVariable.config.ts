// Every `--dv-*` custom property a theme can set, grouped by what it styles.
// Defaults live in `dockview-theme-core-mixin` (packages/dockview-core/src/theme.scss)
// or, for the structural properties, in the `var()` fallbacks where core reads
// them. Every built-in theme is a set of these properties and nothing else.
export const cssVariableConfig = [
    // ── Theme settings (read by dockview, see DockviewThemeSettings) ─────────
    {
        key: '--dv-group-gap',
        text: 'Gap between groups, in px (the `gap` theme setting). Default `0`.',
    },
    {
        key: '--dv-edge-group-collapsed-size',
        text: 'Collapsed size of an edge group, in px (`edgeGroupCollapsedSize`). Defaults to the tab strip height.',
    },
    {
        key: '--dv-dnd-overlay-mounting',
        text: '`relative` (default) mounts the drop preview in the group; `absolute` at the layout root (`dndOverlayMounting`).',
    },
    {
        key: '--dv-dnd-panel-overlay',
        text: '`content` (default) previews a drop over the content; `group` over the whole group (`dndPanelOverlay`).',
    },
    {
        key: '--dv-dnd-tab-indicator',
        text: '`fill` (default) or `line`: the preview when dropping onto a tab (`dndTabIndicator`).',
    },
    {
        key: '--dv-tab-group-indicator',
        text: '`wrap` (default) or `none`: how tab groups are marked in the strip (`tabGroupIndicator`).',
    },
    {
        key: '--dv-tab-animation',
        text: '`default` or `smooth` tab reorder animation (`tabAnimation`).',
    },

    // ── Layout frame ───────────────────────────────────────────────────────
    {
        key: '--dv-root-padding',
        text: 'Padding around the whole layout, on the element carrying the theme class only (non-inheriting).',
    },
    {
        key: '--dv-root-background-color',
        text: 'Background of the element carrying the theme class, i.e. the band around the layout (non-inheriting).',
    },
    {
        key: '--dv-group-border-radius',
        text: 'Corner radius of each group.',
    },
    {
        key: '--dv-header-border-radius',
        text: 'Corner radius of the tab strip (a full `border-radius` value, e.g. `12px 12px 0 0`).',
    },
    {
        key: '--dv-header-padding',
        text: 'Inset of the tab strip along its length (across it on vertical rails).',
    },
    {
        key: '--dv-content-border-radius',
        text: 'Corner radius of the content area (a full `border-radius` value).',
    },
    {
        key: '--dv-content-background-color',
        text: 'Background of the content area. Default `transparent`.',
    },
    {
        key: '--dv-content-overflow',
        text: 'Overflow of the content area; `hidden` clips panels to `--dv-content-border-radius`.',
    },

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
        key: '--dv-tab-margin-block',
        text: 'The cross-axis part of the tab margin, when a theme sets it; multi-row strips subtract it so each row stays one strip tall.',
    },
    {
        key: '--dv-bottom-header-tab-margin',
        text: 'Tab margin when the strip sits below the content; defaults to `--dv-tab-margin`.',
    },
    {
        key: '--dv-vertical-tab-margin',
        text: 'Tab margin on vertical rails (physical, under the rail’s vertical writing mode); defaults to `--dv-tab-margin`.',
    },
    {
        key: '--dv-tab-padding-block',
        text: 'Tab padding across the strip. Default `0.25rem`.',
    },
    {
        key: '--dv-tab-padding-inline',
        text: 'Tab padding along the strip, either side of the label. Default `0.5rem`.',
    },
    {
        key: '--dv-tab-gap',
        text: 'Gap between adjacent tabs. Default `0`.',
    },
    {
        key: '--dv-tabs-container-padding',
        text: 'Gutter around the row of tabs (a full `padding` value).',
    },
    {
        key: '--dv-tab-font-weight',
        text: 'Font weight of tab labels; inherited when unset.',
    },
    {
        key: '--dv-active-tab-font-weight',
        text: 'Font weight of the visible panel’s tab; defaults to `--dv-tab-font-weight`.',
    },
    {
        key: '--dv-tab-transition-duration',
        text: 'Duration of the tab background/colour fade on hover and selection. Default `0s`.',
    },
    {
        key: '--dv-tab-close-icon-size',
        text: 'Size of the close glyph on the default tab.',
    },
    {
        key: '--dv-spacing-padding',
        text: 'The spaced layout’s inset: feeds `--dv-root-padding` and `--dv-floating-inset` in the spaced themes.',
    },
    {
        key: '--dv-border-radius',
        text: 'The spaced layout’s card radius: feeds the group, strip, content, peek and floating radii in the spaced themes.',
    },
    {
        key: '--dv-tab-border-radius',
        text: 'Radius of a tab’s corners on the strip’s outer side (all corners unless `--dv-tab-content-side-border-radius` differs).',
    },
    {
        key: '--dv-tab-content-side-border-radius',
        text: 'Radius of a tab’s corners facing the content; defaults to `--dv-tab-border-radius` (a pill). Connected tabs set `0`.',
    },
    {
        key: '--dv-vertical-tab-border-radius',
        text: 'Corner radius of tabs on vertical rails; defaults to `--dv-tab-border-radius`.',
    },
    { key: '--dv-sash-border-radius', text: 'Corner radius of the resize sashes.' },
    {
        key: '--dv-sheet-border-radius',
        text: 'Corner radius of the content sheet in the sheet-layout themes (slate).',
    },
    {
        key: '--dv-dropdown-border-radius',
        text: 'Corner radius of the tab overflow button and list.',
    },
    {
        key: '--dv-tabs-overflow-dropdown-height',
        text: 'Height of the tab overflow button. Default `100%` of the strip.',
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
        key: '--dv-tab-border-top-width',
        text: 'Width of an accent edge along the top of each tab, in the tab’s own fill. Default `0`.',
    },
    {
        key: '--dv-tabs-and-actions-container-border-bottom-width',
        text: 'Width of a rule under the tab strip, in the visible tab’s fill. Default `0`.',
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

    // ── Tab dividers ───────────────────────────────────────────────────────
    {
        key: '--dv-tab-divider-width',
        text: 'Thickness of the divider between tabs. Default `1px`.',
    },
    {
        key: '--dv-tab-divider-length',
        text: 'Length of the divider, centred across the strip. Default `100%`.',
    },
    {
        key: '--dv-tab-divider-radius',
        text: 'Corner radius of the divider.',
    },
    {
        key: '--dv-active-tab-divider-color',
        text: 'Divider colour either side of the visible panel’s tab; defaults to `--dv-tab-divider-color`.',
    },
    {
        key: '--dv-vertical-tab-divider-color',
        text: 'Divider colour on vertical rails; defaults to `--dv-tab-divider-color`.',
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

    // ── Edge groups ────────────────────────────────────────────────────────
    {
        key: '--dv-collapsed-edge-visiblepanel-tab-background-color',
        text: 'Background of the visible panel’s tab on a collapsed, unfocused edge rail; defaults to the unfocused-group value.',
    },
    {
        key: '--dv-collapsed-edge-visiblepanel-tab-color',
        text: 'Label colour of that tab.',
    },
    {
        key: '--dv-collapsed-edge-tab-marker-color',
        text: 'Active-tab marker colour on that tab.',
    },
    {
        key: '--dv-edge-peek-border',
        text: 'Border of the auto-hide peek and its title bar (a full `border` value).',
    },
    {
        key: '--dv-edge-peek-border-radius',
        text: 'Corner radius of the auto-hide peek (the title bar takes the top corners).',
    },
    {
        key: '--dv-edge-peek-box-shadow',
        text: 'Shadow of the auto-hide peek.',
    },
    {
        key: '--dv-tool-window-header-border-radius',
        text: 'Tab strip radius in a docked auto-hide tool window; defaults to `--dv-header-border-radius`.',
    },
    {
        key: '--dv-tool-window-content-border-radius',
        text: 'Content radius in a docked tool window; defaults to `--dv-content-border-radius`.',
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
        key: '--dv-drop-target-content-border-radius',
        text: 'Corner radius of the preview for a drop into a group’s content; defaults to `--dv-drop-target-border-radius`.',
    },
    {
        key: '--dv-drop-target-travel',
        text: '`1` (default): the root-mounted preview glides between groups; `0`: it jumps.',
    },
    {
        key: '--dv-dnd-compass-color',
        text: 'Accent of the drop compass.',
    },
    {
        key: '--dv-dnd-compass-cell-color',
        text: 'Fill of a drop compass cell.',
    },
    {
        key: '--dv-dnd-compass-edge-cell-color',
        text: 'Fill of a compass cell that docks to a layout edge.',
    },
    {
        key: '--dv-dnd-compass-active-cell-color',
        text: 'Fill of the compass cell under the pointer.',
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
        key: '--dv-floating-inset-below-titlebar',
        text: 'Top inset under the drag handle bar; defaults to `--dv-floating-inset`.',
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
