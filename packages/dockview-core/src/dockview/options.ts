import { DockviewApi } from '../api/component.api';
import { Direction } from '../gridview/baseComponentGridview';
import { IGridView } from '../gridview/gridview';
import { IContentRenderer, ITabRenderer, IWatermarkRenderer } from './types';
import { Parameters } from '../panel/types';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewMessages } from './accessibilityMessages';
export type { DockviewMessages } from './accessibilityMessages';
import { PanelTransfer } from '../dnd/dataTransfer';
import { IDisposable } from '../lifecycle';
import { Box, DragModifiers } from '../types';
import {
    DroptargetOverlayModel,
    Position,
    PositionResolver,
} from '../dnd/droptarget';
import { GroupOptions } from './dockviewGroupPanelModel';
import { EdgeGroupPosition } from './dockviewShell';
import { DockviewGroupDropLocation } from './events';
import { IDockviewPanel } from './dockviewPanel';
import { DockviewPanelRenderer } from '../overlay/overlayRenderContainer';
import {
    IGroupDragGhostRenderer,
    IGroupHeaderProps,
    ITabGroupChipRenderer,
} from './framework';
import { FloatingGroupOptions } from './dockviewComponent';
import { Constraints } from '../gridview/gridviewPanel';
import { AcceptableEvent, IAcceptableEvent } from '../events';
import { DockviewTheme } from './theme';
import { ITabGroup } from './tabGroup';
import { CspNonceProvider } from '../dom';
export { type CspNonceProvider };
import { DockviewTabGroupColorEntry } from './tabGroupAccent';

export interface IHeaderActionsRenderer extends IDisposable {
    readonly element: HTMLElement;
    init(params: IGroupHeaderProps): void;
}

export type BuiltInContextMenuItem =
    | 'close'
    | 'closeOthers'
    | 'closeAll'
    | 'closeLeft'
    | 'closeRight'
    | 'maximize'
    | 'float'
    | 'popout'
    | 'separator'
    // Toggle the panel's pinned state (PinnedTabs module). Renders as
    // "Pin tab" / "Unpin tab"; a no-op when pinning is not enabled.
    | 'pin';

export type BuiltInChipContextMenuItem =
    | 'separator'
    | 'colorPicker'
    | 'rename'
    | 'collapse'
    | 'close';

export interface ContextMenuItemConfig {
    label?: string;
    /**
     * A framework component to render as the menu item.
     * The component type is opaque to core; the framework adapter renders it.
     */
    component?: unknown;
    componentProps?: object;
    /**
     * A raw DOM element to embed as-is in the context menu.
     * Use this when you want to render custom content without a framework component.
     */
    element?: HTMLElement;
    action?: () => void;
    disabled?: boolean;
}

export type ContextMenuItem = BuiltInContextMenuItem | ContextMenuItemConfig;

export interface DropOverlayModelParams {
    /** Which of a group's drop targets the overlay is for. `'edge'` is shaped by `dndEdges`, not this option. */
    location: DockviewGroupDropLocation;
    /** The group the target belongs to, where known (tab / header_space / content). */
    group?: DockviewGroupPanel;
}

/** A layout change to be announced; see the `getAnnouncement` option. */
export interface LiveRegionEvent {
    /**
     * What changed: a panel was added (`'open'`) or removed (`'close'`); a
     * group was maximized (`'maximize'`) / restored (`'restore'`); or a group
     * moved to a floating window (`'float'`), back into the grid (`'dock'`), or
     * out to a popout window (`'popout'`). `panel` is the affected panel; for
     * group events, the group's active panel.
     */
    kind:
        | 'open'
        | 'close'
        | 'maximize'
        | 'restore'
        | 'float'
        | 'dock'
        | 'popout';
    panel: IDockviewPanel;
}

/** A resolved announcement handed to a custom `announcer`. */
export interface AnnouncementEvent {
    /** The (already localised) text to announce. */
    message: string;
    /** `'assertive'` interrupts the screen reader; `'polite'` waits for a pause. */
    politeness: 'polite' | 'assertive';
}

/**
 * Key bindings for {@link DockviewComponentOptions.keyboardNavigation}. Each
 * value is a string of `+`-separated parts, modifiers first, e.g. `'ctrl+]'`,
 * `'shift+f6'`. Recognised modifiers: `ctrl`, `shift`, `alt`, `meta` (alias
 * `cmd`). The final part is the `KeyboardEvent.key` to match, case-insensitively
 * (`']'`, `'f6'`, `'arrowleft'`).
 */
export interface DockviewKeybindings {
    /** Switch to the next tab in the focused group. Default `ctrl+]`. */
    nextTab: string;
    /** Switch to the previous tab in the focused group. Default `ctrl+[`. */
    prevTab: string;
    /** Move focus to the next group. Default `f6`. */
    focusNextGroup: string;
    /** Move focus to the previous group. Default `shift+f6`. */
    focusPrevGroup: string;
    /** Move focus from panel content to the focused group's tab strip. Default `ctrl+shift+\`. */
    focusTabs: string;
    /**
     * Pin / unpin the active panel's tab. Default `ctrl+shift+enter`. Inert
     * unless the pinned-tabs feature is enabled (`pinnedTabs.enabled`).
     */
    togglePin: string;
}

export interface KeyboardNavigationOptions {
    /** Override individual {@link DockviewKeybindings}; unset keys keep their defaults. */
    keymap?: Partial<DockviewKeybindings>;
}

export interface GetTabContextMenuItemsParams {
    panel: IDockviewPanel;
    group: DockviewGroupPanel;
    api: DockviewApi;
    event: MouseEvent;
}

export interface GetTabGroupChipContextMenuItemsParams {
    tabGroup: ITabGroup;
    group: DockviewGroupPanel;
    api: DockviewApi;
    event: MouseEvent;
}

export interface IContextMenuItemComponentProps {
    panel: IDockviewPanel;
    group: DockviewGroupPanel;
    api: DockviewApi;
    /** Call to close the context menu */
    close: () => void;
    componentProps?: object;
}

/**
 * Props passed to a `component` menu item rendered in the tab group chip
 * context menu. Mirrors {@link IContextMenuItemComponentProps} but carries the
 * `tabGroup` the chip represents in place of a single `panel`: a chip spans
 * several panels, so there is no one panel to hand over.
 */
export interface IChipContextMenuItemComponentProps {
    tabGroup: ITabGroup;
    group: DockviewGroupPanel;
    api: DockviewApi;
    /** Call to close the context menu */
    close: () => void;
    componentProps?: object;
}

export interface IContextMenuItemRenderer extends IDisposable {
    readonly element: HTMLElement;
    init(
        props:
            | IContextMenuItemComponentProps
            | IChipContextMenuItemComponentProps
    ): void;
}

export interface CreateContextMenuItemComponentOptions {
    id: string;
    component: unknown;
}

export interface ViewFactoryData {
    content: string;
    tab?: string;
}

export type DockviewHeaderPosition = 'top' | 'bottom' | 'left' | 'right';
export type DockviewHeaderDirection = 'horizontal' | 'vertical';

export type DockviewDndStrategy = 'auto' | 'pointer' | 'html5';

/**
 * Context handed to {@link DockviewOptions.transformFloatingGroupDrag} on each
 * pointer-move frame while a floating group is being dragged.
 */
export interface FloatingGroupDragContext {
    /** The floating group being dragged. */
    readonly group: DockviewGroupPanel;
    /** Proposed top-left + size this frame, in container pixels (pre-clamp). */
    readonly proposed: Box;
    /** Size of the container the floating group is dragged within. */
    readonly container: { width: number; height: number };
    /**
     * Bounds of the other floating groups (relative to the same container),
     * snapshotted at drag start.
     */
    readonly others: readonly Box[];
    /** Modifier-key state from this frame's pointer event. */
    readonly modifiers: DragModifiers;
}

/** A keyboard modifier that, while held, suspends Smart Guides snapping. */
export type SnapModifier = 'alt' | 'ctrl' | 'meta' | 'shift';

/** Which alignment sources Smart Guides snaps a dragged floating group to. */
export interface SmartGuidesSnapTargets {
    /** Align to the other floating groups' edges + centers. Default `true`. */
    floats?: boolean;
    /** Align to the container's edges + center. Default `true`. */
    container?: boolean;
    /** Also emit inset guide lines this many px inside the container edges
     *  (e.g. a content margin). Default `undefined` (no inset lines). */
    containerInset?: number;
    /** Align to the underlying grid's splitter (sash) positions. Default
     *  `false`. */
    splitters?: boolean;
}

/**
 * Options for the Smart Guides module: Figma-style alignment guides + magnetic
 * snapping while dragging a floating group. Omit `smartGuides` entirely to leave
 * float dragging unchanged: the module is then inert and the drag loop is a
 * byte-for-byte pass-through.
 */
export interface SmartGuidesOptions {
    /** Master switch. Defaults to `true` when `smartGuides` is present. */
    enabled?: boolean;
    /** Distance, in px, within which a dragged edge/center engages a snap.
     *  Default `8`. */
    snapDistance?: number;
    /** Extra px beyond `snapDistance` the pointer must travel before an engaged
     *  snap releases; asymmetric hysteresis that stops boundary oscillation.
     *  Default `4`. */
    releaseDistance?: number;
    /** Render the alignment guide lines while snapping. Default `true`. */
    showGuides?: boolean;
    /** Detect a dock/merge intent when the dragged float comes flush against
     *  another float (edge-adjacency) or overlaps its tab strip (tabset merge),
     *  and commit it on drop. Opt-in: Smart Guides is an alignment-only tool by
     *  default and never merges floating groups unless this is set. Default
     *  `false`. */
    snapTogether?: boolean;
    /** Which alignment sources to snap against (floats + container by default). */
    snapTargets?: SmartGuidesSnapTargets;
    /** Hold this modifier while dragging to temporarily suspend snapping +
     *  guides (Figma/Keynote parity). `false` disables the gate. Default
     *  `'alt'`. */
    disableSnapModifier?: SnapModifier | false;
    /** Extra class applied to the guide overlay layer, for theming. */
    className?: string;
}

/**
 * The CSS class the `MultiRowTabsModule` toggles on a group's tab list
 * (`.dv-tabs-container`) to switch it into wrap layout. Shared here so core
 * (the reorder controller's wrap detection + the SCSS rules) and the module
 * agree on the one string; renaming it in one place would otherwise silently
 * break the seam across the package boundary.
 */
export const OVERFLOW_WRAP_TABS_CLASS = 'dv-tabs-container--wrap';

/**
 * The CSS class the `MultiRowTabsModule` adds alongside
 * {@link OVERFLOW_WRAP_TABS_CLASS} once `overflow.maxRows` is set. It clips the
 * wrapped strip to `--dv-max-tab-rows` rows (the surplus rows spill to the
 * dropdown) so the header stops growing at the cap. Shared here so core (SCSS)
 * and the module agree on the one string.
 */
export const OVERFLOW_WRAP_TABS_CAPPED_CLASS = 'dv-tabs-container--wrap-capped';

/**
 * The custom property the `MultiRowTabsModule` sets on a capped wrapped strip to
 * carry the `overflow.maxRows` value into the SCSS `max-height` calc. Shared for
 * the same reason as the class names above.
 */
export const OVERFLOW_MAX_TAB_ROWS_VARIABLE = '--dv-max-tab-rows';

/**
 * The custom property the `MultiRowTabsModule` sets on a wrapped vertical
 * (edge-group) tab list to pin every wrapped tab to a single, uniform height:
 * the tallest tab's natural height, measured live by the controller. A vertical
 * tab's natural height tracks its (rotated) title length, so a column only fits
 * a handful of tabs and tiny per-tab height differences flip how many fit,
 * ragged-ing the wrapped grid into a staircase. Pinning one height makes every
 * column hold the same count, so the columns line up as a clean grid (the mirror
 * of the horizontal wrap, whose tabs share the fixed row height). Shared here so
 * core (SCSS) and the module agree on the one string. Only meaningful in vertical
 * wrap; a horizontal strip never sets it and the SCSS falls back to auto height.
 */
export const OVERFLOW_WRAP_TABS_VERTICAL_TAB_HEIGHT_VARIABLE =
    '--dv-wrap-vertical-tab-height';

/**
 * Tab-header overflow behaviour. One shared block across the overflow axis:
 * `mode` chooses dropdown vs wrap; the remaining fields enrich the dropdown.
 * Each capability names the module it needs; without that module the field is
 * ignored and the free single-row strip + dropdown is used.
 */
export interface DockviewOverflowOptions {
    /**
     * What happens when tabs don't fit. Default `'dropdown'` (today's free
     * path). `'wrap'` requires the `MultiRowTabsModule`.
     */
    mode?: 'dropdown' | 'wrap';
    /**
     * Wrap mode only: cap the number of header rows. The strip grows to at most
     * `maxRows` rows; tabs that would land on a row beyond the cap spill into the
     * overflow dropdown instead. Requires the `MultiRowTabsModule`. Default:
     * unbounded (wrap grows to fit every tab).
     */
    maxRows?: number;
    /**
     * Filter input over the group's tabs. Reserved for `AdvancedOverflowModule`;
     * ignored until that module is present. Default: false.
     */
    search?: boolean | { placeholder?: string; scope?: 'overflow' | 'group' };
    /**
     * Order the dropdown by most-recently-activated. Reserved for
     * `AdvancedOverflowModule`; ignored until present. Default: false.
     */
    mru?: boolean;
}

export interface DockviewOptions {
    /**
     * Disable the auto-resizing which is controlled through a `ResizeObserver`.
     * Call `.layout(width, height)` to manually resize the container.
     */
    disableAutoResizing?: boolean;
    hideBorders?: boolean;
    singleTabMode?: 'fullwidth' | 'default';
    disableFloatingGroups?: boolean;
    floatingGroupBounds?:
        | 'boundedWithinViewport'
        | {
              minimumHeightWithinViewport?: number;
              minimumWidthWithinViewport?: number;
          };
    /**
     * Adjust a floating group's position while it is being dragged. Runs on
     * each pointer-move frame with the proposed top-left (before the container
     * clamp) and returns an adjusted top-left, or nothing to leave it
     * unchanged. Use it for snapping, alignment, or custom bounds. Move only:
     * resizing a floating group is unaffected.
     *
     * `context.others` holds the bounds of the other floating groups (relative
     * to the same container), snapshotted at drag start, so the callback can
     * align the dragged group against its siblings.
     */
    transformFloatingGroupDrag?: (
        context: FloatingGroupDragContext
    ) => { top: number; left: number } | void;
    /**
     * Enable Smart Guides: alignment guides + magnetic snapping while a
     * floating group is being dragged. Omit to disable entirely (float dragging
     * is then unchanged). Provided by the Smart Guides module.
     */
    smartGuides?: SmartGuidesOptions;
    /**
     * Selects which element moves a floating group when dragged.
     *
     * - `'titlebar'` (default): a dedicated, blank drag-handle bar is rendered
     *   above the group's tab bar. Dragging it moves the floating window;
     *   shift+drag (mouse) / long-press (touch) redocks into the grid. Style
     *   it with the `--dv-floating-titlebar-*` theme variables.
     * - `'tabbar'`: the legacy behaviour, where the empty space in the tab bar
     *   (the "void container") doubles as the move handle. No dedicated bar
     *   is rendered.
     */
    floatingGroupDragHandle?: 'titlebar' | 'tabbar';
    popoutUrl?: string;
    nonce?: CspNonceProvider;
    defaultRenderer?: DockviewPanelRenderer;
    defaultHeaderPosition?: DockviewHeaderPosition;
    debug?: boolean;
    // #start dnd
    dndEdges?: false | DroptargetOverlayModel;
    disableDnd?: boolean;
    /**
     * Selects which drag-and-drop implementation is active.
     *
     * - `'auto'` (default): HTML5 drag-and-drop drives mouse drags; pointer
     *   events drive touch and pen drags. Matches the historical behaviour.
     * - `'pointer'`: pointer events drive every input type. Useful in
     *   environments where HTML5 drag-and-drop is unreliable (some Linux
     *   browsers, certain Safari versions, embedded webviews). Cross-window
     *   HTML5 drag and the HTML5 native drag image are not available in this
     *   mode.
     * - `'html5'`: HTML5 drag-and-drop only; disables touch / pen drag.
     */
    dndStrategy?: DockviewDndStrategy;
    /**
     * Override how a pointer location maps to a drop {@link Position} (or `null`
     * for no drop) on the 5-way group/layout drop targets (the group content
     * and the whole-layout edges), replacing the built-in cursor-quadrant logic.
     * Tab/header reorder targets are unaffected. Unset ⇒ the default quadrant
     * behaviour, unchanged. Read live, so it can be swapped via
     * {@link DockviewApi.updateOptions}.
     */
    dropPositionResolver?: PositionResolver;
    /**
     * Show an aim-at-a-cell DnD compass over a group while dragging,
     * instead of resolving the drop by which quadrant the cursor is in. Default
     * off ⇒ the cursor-quadrant behaviour, unchanged. Provided by the DnD compass
     * module. Pass an object to restrict which inner cells appear (`zones`) or to
     * hide the outer whole-layout-edge cells (`edges: false`, default on).
     */
    dndCompass?: boolean | { zones?: Position[]; edges?: boolean };
    // #end dnd
    locked?: boolean;
    className?: string;
    /**
     * Define the behaviour of the dock when there are no panels to display. Defaults to `watermark`.
     */
    noPanelsOverlay?: 'emptyGroup' | 'watermark';
    theme?: DockviewTheme;
    disableTabsOverflowList?: boolean;
    /**
     * How the tab header behaves when there are more tabs than fit on one row.
     *
     * The single-row strip + chevron dropdown is the default and is free. The
     * `'wrap'` mode (tabs wrap onto multiple rows and the header grows) requires
     * the `MultiRowTabsModule`; without that module `'wrap'` is ignored and the
     * dropdown is used. The `search`/`mru` fields enrich the
     * dropdown and require the `AdvancedOverflowModule`; they are ignored when
     * that module is absent.
     *
     * Omitting `overflow` is identical to today's behaviour
     * (`mode: 'dropdown'`).
     */
    overflow?: DockviewOverflowOptions;
    /**
     * Select `native` to use built-in scrollbar behaviours and `custom` to use an internal implementation
     * that allows for improved scrollbar overlay UX.
     *
     * This is only applied to the tab header section. Defaults to `custom`.
     */
    scrollbars?: 'native' | 'custom';
    /**
     * Return the items to display in the tab context menu on right-click.
     *
     * Use built-in string shortcuts or provide a `ContextMenuItemConfig`
     * object for custom items. The available shortcuts are:
     * - `'close'`: close this panel
     * - `'closeOthers'`: close every other panel in the group
     * - `'closeAll'`: close every panel in the group
     * - `'closeLeft'` / `'closeRight'`: close the panels before / after this
     *   one in the tab strip
     * - `'maximize'`: maximize the group (renders as *Restore* and disables
     *   for non-grid panels, tracking the group's live maximized state)
     * - `'float'`: move the panel into a floating window (disabled when
     *   already floating)
     * - `'popout'`: move the panel into a new browser window (disabled when
     *   already popped out)
     * - `'pin'`: toggle the panel's pinned state (PinnedTabs module)
     * - `'separator'`: a divider line
     *
     * If omitted, no context menu is shown.
     * Return an empty array to suppress the menu for specific cases.
     */
    getTabContextMenuItems?: (
        params: GetTabContextMenuItemsParams
    ) => ContextMenuItem[];
    /**
     * Return the items to display in the tab group chip context menu on right-click.
     *
     * Use built-in string shortcuts or provide a `ContextMenuItemConfig`
     * object for custom items. The available shortcuts are:
     * - `'rename'`: renders an inline text input to rename the tab group
     * - `'colorPicker'`: renders a grid of color swatches for the tab group
     * - `'collapse'`: collapse the tab group (renders as *Expand* when the
     *   group is already collapsed)
     * - `'close'`: close every panel belonging to the tab group
     * - `'separator'`: a divider line
     *
     * If omitted, no context menu is shown on chip right-click.
     * Return an empty array to suppress the menu for specific cases.
     */
    getTabGroupChipContextMenuItems?: (
        params: GetTabGroupChipContextMenuItemsParams
    ) => (BuiltInChipContextMenuItem | ContextMenuItemConfig)[];
    /**
     * Factory to create custom tab group chip renderers.
     * If not provided, the default chip renderer is used.
     */
    createTabGroupChipComponent?: (
        tabGroup: ITabGroup
    ) => ITabGroupChipRenderer;
    /**
     * Factory to create the custom ghost element shown while dragging a
     * group of panels (the small floating chip that follows the cursor).
     *
     * If not provided, a default ghost rendering `"Multiple Panels (N)"`
     * is used. Supplying a factory replaces the entire default ghost,
     * enabling i18n / custom visuals.
     */
    createGroupDragGhostComponent?: (
        group: DockviewGroupPanel
    ) => IGroupDragGhostRenderer;
    /**
     * Shape the drop overlay shown over a group's drop targets: the tab
     * strip (`'tab'`), the header void space (`'header_space'`) and the
     * panel content area (`'content'`). Return a {@link DroptargetOverlayModel}
     * to override that target's default overlay (size, activation threshold,
     * small-element boundaries), or `undefined` to keep the default.
     *
     * `group` is provided where known (tab / header_space). The outer-layout
     * edge overlay is shaped by `dndEdges`, not this option, so `'edge'` is
     * not dispatched here.
     */
    dropOverlayModel?: (
        params: DropOverlayModelParams
    ) => DroptargetOverlayModel | undefined;
    /**
     * Built-in screen-reader announcements of layout changes (a visually-hidden
     * `aria-live` region narrating panel open/close etc.). On by default;
     * set to `false` to disable, e.g. when the host app provides its own
     * announcement system. Honoured live via `updateOptions`.
     */
    announcements?: boolean;
    /**
     * Localise or override the built-in announcement strings (the default
     * messages are English). Return a string to use it, `null` / `''` to
     * suppress that announcement, or `undefined` to keep the default. This is
     * how non-English apps translate announcements; core ships no message
     * catalog, only the default strings + this hook.
     */
    getAnnouncement?: (event: LiveRegionEvent) => string | null | undefined;
    /**
     * Route announcements to your own screen-reader infrastructure instead of
     * the built-in `aria-live` regions (e.g. an app-wide live region). When
     * set, dockview hands you each {@link AnnouncementEvent} and writes nothing
     * to its own regions. `getAnnouncement` (localisation) still applies first.
     */
    announcer?: (event: AnnouncementEvent) => void;
    /**
     * Translate / override the strings dockview speaks to assistive technology,
     * covering both the LiveRegion announcements and the keyboard-docking
     * narration. Provide any subset of {@link DockviewMessages}; unset entries
     * keep the English defaults. (`getAnnouncement` still applies first,
     * per-event, for announcements.)
     */
    messages?: Partial<DockviewMessages>;
    /**
     * Operate the dock with the keyboard. `true` enables the default bindings;
     * pass an object to override individual ones via `keymap`. Off by default
     * (opt-in while the feature matures). Enables:
     *
     * - **Switch tab** within the focused group: `Ctrl`+`]` / `Ctrl`+`[`.
     * - **Move focus between groups**: `F6` / `Shift`+`F6` (sequential) or
     *   `Ctrl`+`Shift`+arrow keys (spatial: focus the group in that direction).
     * - **Dock the active panel** without a mouse: `Ctrl`+`M` arms a two-phase
     *   move (arrows cycle the target group with a live drop preview +
     *   screen-reader narration, `Enter` docks, `Escape` cancels).
     *
     * Defaults avoid `Cmd`-based and browser-reserved combinations (e.g.
     * `Cmd`+`M` is the macOS minimise-window shortcut); use {@link keymap} to
     * rebind for your platform.
     */
    keyboardNavigation?: boolean | KeyboardNavigationOptions;
    /**
     * Undo / redo for layout mutations (close / move / float / popout / add /
     * maximize / tab-group changes). Off by default; set `{ enabled: true }`
     * to record. Drive it via `api.undo()` / `api.redo()`; dockview binds no
     * keys itself (that's the host app's call, and collides with the keyboard
     * navigation keymap). Honoured live via `updateOptions`.
     */
    layoutHistory?: LayoutHistoryOptions;
    /**
     * VS Code-style "auto hide" for edge groups: render clickable activators in
     * a collapsed edge group's strip so it can be pinned back. Off by default →
     * today's baseline (an empty collapsed strip) is unchanged.
     *
     * A per-edge set: `true` applies to all four edges, or name edges
     * individually (`{ left: true, bottom: true }`). An edge group at an edge
     * not in the set stays a static collapsing sidebar. A per-group
     * `api.setEdgeGroupAutoHide()` override wins over this default. Peek
     * animation is tuned globally via `edgeGroupPeek`.
     */
    autoHideEdgeGroups?: EdgeGroupSet;
    /**
     * Let panels dragged to a layout edge create/fill an **edge group** that is
     * invisible when empty (VS Code-style "drag a panel to the far edge → new
     * sidebar"). Created on drop; torn down to zero footprint when its last
     * panel leaves.
     *
     * A per-edge set: `true` enables dock-to-edge on all four edges, or name
     * edges individually. Off by default.
     *
     * Requires the `AutoEdgeGroup` module (and the `EdgeGroup` module it builds
     * on); a no-op if absent, where a root-edge drop splits the grid as usual.
     * Distinct from `dndEdges`, which only shapes the outer drop overlay (and
     * still splits the grid).
     */
    dockToEdgeGroups?: EdgeGroupSet;
    /**
     * Peek interaction tuning for `autoHideEdgeGroups` (global, not per-edge).
     */
    edgeGroupPeek?: EdgeGroupPeekOptions;
    /**
     * Replace the built-in tab group color palette with a user-defined list.
     *
     * Each entry has an `id` (stored on `tabGroup.color` and serialized),
     * a `value` (any CSS color expression: hex, rgb(), `var(...)`, etc.),
     * and an optional `label` shown in the context menu picker.
     *
     * If omitted, the default 9-color palette is used. The list fully
     * replaces the defaults; there is no merge.
     */
    tabGroupColors?: DockviewTabGroupColorEntry[];
    /**
     * Controls how dockview applies tab group color accents.
     *
     * - `'palette'` (default): write `--dv-tab-group-color`, render the
     *   color picker, and apply built-in accent styling.
     * - `'off'`: opt out entirely. No `--dv-tab-group-color` is written,
     *   the color picker is suppressed, and chips/indicators render
     *   without the accent. The `tg.color` data field is preserved so
     *   custom chip renderers can still read it and roll their own visual.
     */
    tabGroupAccent?: 'palette' | 'off';
    /**
     * Pin tabs so they render before all unpinned tabs in their group, never
     * overflow into the dropdown, and resist reorder across the pin boundary.
     * Modelled on VS Code / Chrome pinned tabs. Owned by the PinnedTabs
     * module; dormant unless `enabled` is set.
     */
    pinnedTabs?: PinnedTabsOptions;
}

export interface PinnedTabsOptions {
    /** Master switch. Default: undefined (dormant; pinning is a no-op). */
    enabled?: boolean;
    /**
     * `'inline'` (default) keeps pinned tabs first within the existing strip;
     * `'separate-row'` renders them on their own VS-Code-style row.
     */
    mode?: 'inline' | 'separate-row';
    /**
     * Render pinned tabs icon-only (title + close button hidden), VS-Code /
     * Chrome style. Default false; dockview's default tab has no favicon, so
     * pinned tabs stay labelled (with a pin glyph) unless you opt in. Best
     * enabled alongside a custom tab renderer that shows an icon.
     */
    compact?: boolean;
    /**
     * Drag a tab across the pin boundary to toggle its pinned state
     * (VS-Code-style). Default false; dragging across the boundary is clamped
     * back, matching Chrome, where pinning is an explicit action only.
     */
    togglePinOnCrossBoundaryDrag?: boolean;
    /**
     * In `'inline'` mode, keep pinned tabs frozen to the left edge when the tab
     * strip scrolls horizontally (Chrome-style sticky columns); each pinned tab
     * sits at the cumulative width of the pinned tabs before it. Default true;
     * set `false` to let pinned tabs scroll away with the rest. Ignored in
     * `'separate-row'` mode, where the pinned row is always visible.
     */
    stickyScroll?: boolean;
    /** Add a Pin/Unpin item to the tab context menu (requires ContextMenuModule). Default true. */
    contextMenuItem?: boolean;
}

export interface LayoutHistoryOptions {
    /** Record mutations. Default `false` (module is registered but inert). */
    enabled?: boolean;
    /** Max undo depth (bounded ring). Default `25`. */
    depth?: number;
    /** Also record mutations originating from `DockviewApi` calls (the app's
     *  own programmatic changes). Default `false`; only user gestures. */
    undoableProgrammaticMutations?: boolean;
    /** Clear the stacks when the whole layout is replaced via `fromJSON` /
     *  `clear`. Default `true`. */
    clearOnFromJSON?: boolean;
    /** Record sash-resize as undoable steps, coalescing a continuous drag into
     *  a single entry. Default `true`. */
    recordResize?: boolean;
    /** Debounce window (ms) for coalescing a continuous resize drag into one
     *  undo entry. Default `400`. */
    coalesceMs?: number;
}

export interface EdgeGroupPeekOptions {
    /** Slide the peek overlay in. Default true; ignored when the OS requests
     *  reduced motion. */
    animate?: boolean;
}

/**
 * A per-edge on/off set for edge-group options. A `boolean` applies to all
 * four edges; an object opts edges in individually (an omitted or `false`
 * edge is off).
 */
export type EdgeGroupSet =
    | boolean
    | Partial<Record<EdgeGroupPosition, boolean>>;

/** Whether `position` is enabled in a per-edge {@link EdgeGroupSet}. */
export function isEdgeGroupEnabled(
    set: EdgeGroupSet | undefined,
    position: EdgeGroupPosition
): boolean {
    if (typeof set === 'boolean') {
        return set;
    }
    return !!set?.[position];
}

/** Whether any edge is enabled in a per-edge {@link EdgeGroupSet}. */
export function isAnyEdgeGroupEnabled(set: EdgeGroupSet | undefined): boolean {
    if (typeof set === 'boolean') {
        return set;
    }
    if (!set) {
        return false;
    }
    return Object.values(set).some(Boolean);
}

export type TabAnimation = 'smooth' | 'default';

export interface DockviewDndOverlayEvent extends IAcceptableEvent {
    /** Narrow with `instanceof DragEvent` before reading `dataTransfer`. */
    nativeEvent: DragEvent | PointerEvent;
    target: DockviewGroupDropLocation;
    position: Position;
    group?: DockviewGroupPanel;
    getData: () => PanelTransfer | undefined;
}

export class DockviewUnhandledDragOverEvent
    extends AcceptableEvent
    implements DockviewDndOverlayEvent
{
    constructor(
        readonly nativeEvent: DragEvent | PointerEvent,
        readonly target: DockviewGroupDropLocation,
        readonly position: Position,
        readonly getData: () => PanelTransfer | undefined,
        readonly group?: DockviewGroupPanel
    ) {
        super();
    }
}

export const PROPERTY_KEYS_DOCKVIEW: (keyof DockviewOptions)[] = (() => {
    /**
     * by readong the keys from an empty value object TypeScript will error
     * when we add or remove new properties to `DockviewOptions`
     */
    const properties: Record<keyof DockviewOptions, undefined> = {
        disableAutoResizing: undefined,
        hideBorders: undefined,
        singleTabMode: undefined,
        disableFloatingGroups: undefined,
        floatingGroupBounds: undefined,
        transformFloatingGroupDrag: undefined,
        smartGuides: undefined,
        floatingGroupDragHandle: undefined,
        popoutUrl: undefined,
        nonce: undefined,
        defaultRenderer: undefined,
        defaultHeaderPosition: undefined,
        debug: undefined,
        locked: undefined,
        disableDnd: undefined,
        dndStrategy: undefined,
        className: undefined,
        noPanelsOverlay: undefined,
        dndEdges: undefined,
        dropPositionResolver: undefined,
        dndCompass: undefined,
        theme: undefined,
        disableTabsOverflowList: undefined,
        overflow: undefined,
        scrollbars: undefined,
        getTabContextMenuItems: undefined,
        getTabGroupChipContextMenuItems: undefined,
        createTabGroupChipComponent: undefined,
        createGroupDragGhostComponent: undefined,
        dropOverlayModel: undefined,
        announcements: undefined,
        getAnnouncement: undefined,
        announcer: undefined,
        messages: undefined,
        keyboardNavigation: undefined,
        layoutHistory: undefined,
        autoHideEdgeGroups: undefined,
        dockToEdgeGroups: undefined,
        edgeGroupPeek: undefined,
        tabGroupColors: undefined,
        tabGroupAccent: undefined,
        pinnedTabs: undefined,
    };

    return Object.keys(properties) as (keyof DockviewOptions)[];
})();

export interface CreateComponentOptions {
    /**
     * The unqiue identifer of the component
     */
    id: string;
    /**
     * The component name, this should determine what is rendered.
     */
    name: string;
}

export interface DockviewFrameworkOptions {
    defaultTabComponent?: string;
    createRightHeaderActionComponent?: (
        group: DockviewGroupPanel
    ) => IHeaderActionsRenderer;
    createLeftHeaderActionComponent?: (
        group: DockviewGroupPanel
    ) => IHeaderActionsRenderer;
    createPrefixHeaderActionComponent?: (
        group: DockviewGroupPanel
    ) => IHeaderActionsRenderer;
    createTabComponent?: (
        options: CreateComponentOptions
    ) => ITabRenderer | undefined;
    createComponent: (options: CreateComponentOptions) => IContentRenderer;
    createWatermarkComponent?: () => IWatermarkRenderer;
    createContextMenuItemComponent?: (
        options: CreateContextMenuItemComponentOptions
    ) => IContextMenuItemRenderer | undefined;
}

export type DockviewComponentOptions = DockviewOptions &
    DockviewFrameworkOptions;

export interface PanelOptions<P extends object = Parameters> {
    component: string;
    tabComponent?: string;
    params?: P;
    id: string;
    title?: string;
}

type RelativePanel = {
    direction?: Direction;
    referencePanel: string | IDockviewPanel;
    /**
     * The index to place the panel within a group, only applicable if the placement is within an existing group
     */
    index?: number;
};

type RelativeGroup = {
    direction?: Direction;
    referenceGroup: string | DockviewGroupPanel;
    /**
     * The index to place the panel within a group, only applicable if the placement is within an existing group
     */
    index?: number;
};

type AbsolutePosition = {
    direction: Omit<Direction, 'within'>;
};

export type AddPanelPositionOptions =
    | RelativePanel
    | RelativeGroup
    | AbsolutePosition;

export function isPanelOptionsWithPanel(
    data: AddPanelPositionOptions
): data is RelativePanel {
    if ((data as RelativePanel).referencePanel) {
        return true;
    }
    return false;
}

export function isPanelOptionsWithGroup(
    data: AddPanelPositionOptions
): data is RelativeGroup {
    if ((data as RelativeGroup).referenceGroup) {
        return true;
    }
    return false;
}

type AddPanelFloatingGroupUnion = {
    floating: Partial<FloatingGroupOptions> | true;
    position: never;
};

type AddPanelPositionUnion = {
    floating: false;
    position: AddPanelPositionOptions;
};

type AddPanelOptionsUnion = AddPanelFloatingGroupUnion | AddPanelPositionUnion;

export type AddPanelOptions<P extends object = Parameters> = {
    params?: P;
    /**
     * The unique id for the panel
     */
    id: string;
    /**
     * The title for the panel which can be accessed within both the tab and component.
     *
     * If using the default tab renderer this title will be displayed in the tab.
     */
    title?: string;
    /**
     * The id of the component renderer
     */
    component: string;
    /**
     * The id of the tab componnet renderer
     */
    tabComponent?: string;
    /**
     * The rendering mode of the panel.
     *
     * This dictates what happens to the HTML of the panel when it is hidden.
     */
    renderer?: DockviewPanelRenderer;
    /**
     * If true then add the panel without setting it as the active panel.
     *
     * Defaults to `false` which forces newly added panels to become active.
     */
    inactive?: boolean;
    initialWidth?: number;
    initialHeight?: number;
} & Partial<AddPanelOptionsUnion> &
    Partial<Constraints>;

type AddGroupOptionsWithPanel = {
    referencePanel: string | IDockviewPanel;
    direction?: Omit<Direction, 'within'>;
};

type AddGroupOptionsWithGroup = {
    referenceGroup: string | DockviewGroupPanel;
    direction?: Omit<Direction, 'within'>;
};

export type AddGroupOptions = (
    | AddGroupOptionsWithGroup
    | AddGroupOptionsWithPanel
    | AbsolutePosition
) &
    GroupOptions;

export function isGroupOptionsWithPanel(
    data: AddGroupOptions
): data is AddGroupOptionsWithPanel {
    if ((data as AddGroupOptionsWithPanel).referencePanel) {
        return true;
    }
    return false;
}

export function isGroupOptionsWithGroup(
    data: AddGroupOptions
): data is AddGroupOptionsWithGroup {
    if ((data as AddGroupOptionsWithGroup).referenceGroup) {
        return true;
    }
    return false;
}

export interface MovementOptions2 {
    group?: IGridView;
}

export interface MovementOptions extends MovementOptions2 {
    includePanel?: boolean;
    group?: DockviewGroupPanel;
}
