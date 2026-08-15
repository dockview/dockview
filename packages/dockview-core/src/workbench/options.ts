import type {
    CreateComponentOptions,
    DockviewComponentOptions,
} from '../dockview/options';
import type { GridviewPanel } from '../gridview/gridviewPanel';
import type { Parameters } from '../panel/types';

/**
 * A fixed-height chrome band (header or status bar) rendered above or below the
 * editor. The band's `component` is resolved through the workbench's
 * `createComponent` factory, exactly like a gridview panel.
 */
export interface WorkbenchBandOptions {
    /** The component name resolved via `createComponent`. */
    component: string;
    /** Fixed pixel height of the band. */
    size?: number;
    /** Start hidden. Toggle later via the api. Defaults to visible. */
    visible?: boolean;
    /** Parameters forwarded to the band component. */
    params?: Parameters;
}

/** Which side the primary side bar (and the activity bar that tracks it) sits on. */
export type SideBarPosition = 'left' | 'right';

/**
 * A resizable side bar region (primary or secondary). Hosts a single component
 * that the caller can fill with an accordion (paneview), a view container, or
 * anything else. The primary side bar is where VS Code shows the Explorer.
 */
export interface WorkbenchSideBarOptions {
    /** The component name resolved via `createComponent`. */
    component: string;
    /** Initial width in pixels. */
    size?: number;
    /** Minimum width the sash can drag to before snapping shut. */
    minimumWidth?: number;
    /** Start hidden. Toggle later via the api. Defaults to visible. */
    visible?: boolean;
    /** Parameters forwarded to the side bar component. */
    params?: Parameters;
}

/**
 * Where the activity bar sits relative to the primary side bar.
 * - `default`: a fixed-width vertical rail on the outer edge of the primary
 *   side bar; it follows the side bar when the side bar flips.
 * - `top`: a fixed-height horizontal strip stacked at the top of the primary
 *   side bar column.
 * - `bottom`: the same strip stacked at the bottom of the primary side bar.
 */
export type ActivityBarPosition = 'default' | 'top' | 'bottom';

/**
 * The activity bar: a thin fixed-size icon strip. By default a vertical rail on
 * the outer edge next to the primary side bar (moving with it when the side bar
 * flips); it can instead sit as a horizontal strip at the `top` or `bottom` of
 * the primary side bar column.
 */
export interface WorkbenchActivityBarOptions {
    /** The component name resolved via `createComponent`. */
    component: string;
    /** Where the activity bar sits. Defaults to `'default'` (side rail). */
    position?: ActivityBarPosition;
    /** Fixed pixel size of the strip (width when a rail, height when top/bottom). */
    size?: number;
    /** Start hidden. Toggle later via the api. Defaults to visible. */
    visible?: boolean;
    /** Parameters forwarded to the activity bar component. */
    params?: Parameters;
}

/** Where the tool panel sits relative to the editor. */
export type PanelPosition = 'bottom' | 'top' | 'left' | 'right';

/**
 * How a top/bottom tool panel spans horizontally.
 * - `center`: spans the editor column only; the side bars run full height beside it.
 * - `justify`: spans the full workbench width; the side bars stop above it.
 * - `left`: spans the editor plus the side bars to its left; the right side bar
 *   stays full height.
 * - `right`: spans the editor plus the side bars to its right; the left side
 *   bars stay full height.
 *
 * Alignment is ignored when the panel `position` is `left` or `right`.
 */
export type PanelAlignment = 'center' | 'justify' | 'left' | 'right';

/**
 * The tool panel (VS Code's bottom panel: terminal, problems, output). A
 * resizable region that can sit on any side of the editor and, when on the
 * top/bottom, span either the editor column (`center`) or the full width
 * (`justify`).
 */
export interface WorkbenchPanelOptions {
    /** The component name resolved via `createComponent`. */
    component: string;
    /** Side of the editor the panel occupies. Defaults to `'bottom'`. */
    position?: PanelPosition;
    /** Horizontal span for a top/bottom panel. Defaults to `'center'`. */
    alignment?: PanelAlignment;
    /** Initial size (height for top/bottom, width for left/right). */
    size?: number;
    /** Minimum size before the sash snaps the panel shut. */
    minimumSize?: number;
    /** Start hidden. Toggle later via the api. Defaults to visible. */
    visible?: boolean;
    /** Parameters forwarded to the panel component. */
    params?: Parameters;
}

/**
 * Options that describe the workbench chrome. The editor itself is a full
 * dockview instance (edge groups included) configured via `dockview`.
 */
export interface WorkbenchOptions {
    /** Fixed band pinned to the top of the workbench. */
    header?: WorkbenchBandOptions;
    /** Fixed band pinned to the bottom of the workbench. */
    statusBar?: WorkbenchBandOptions;
    /** Thin icon rail next to the primary side bar. */
    activityBar?: WorkbenchActivityBarOptions;
    /** Primary side bar (VS Code's Explorer side). */
    primarySideBar?: WorkbenchSideBarOptions;
    /** Secondary side bar, always mounted opposite the primary. */
    secondarySideBar?: WorkbenchSideBarOptions;
    /** Tool panel (terminal / problems / output). */
    panel?: WorkbenchPanelOptions;
    /** Which side the primary side bar starts on. Defaults to `'left'`. */
    primarySideBarPosition?: SideBarPosition;
    /** The view container shown in the primary side bar on creation. */
    activeViewContainer?: string;
    /** CSS class applied to the workbench root element. */
    className?: string;
}

export interface WorkbenchFrameworkOptions {
    /**
     * Factory for the chrome band components (header/status bar, the side bars
     * and the tool panel). Mirrors the gridview
     * `createComponent` contract. The reserved editor component is created by
     * the workbench itself and never passed here.
     */
    createComponent: (options: CreateComponentOptions) => GridviewPanel;
    /** Options for the embedded dockview that backs the editor area. */
    dockview: DockviewComponentOptions;
}

export type WorkbenchComponentOptions = WorkbenchOptions &
    WorkbenchFrameworkOptions;

export const DEFAULT_HEADER_SIZE = 35;
export const DEFAULT_STATUS_BAR_SIZE = 22;
export const DEFAULT_ACTIVITY_BAR_SIZE = 48;
export const DEFAULT_SIDE_BAR_SIZE = 240;
export const DEFAULT_SIDE_BAR_MINIMUM_SIZE = 170;
export const DEFAULT_PANEL_SIZE = 200;
export const DEFAULT_PANEL_MINIMUM_SIZE = 80;

/** Reserved component name for the editor panel that hosts the dockview. */
export const WORKBENCH_EDITOR_COMPONENT = '__dv_workbench_editor__';

/** Reserved panel ids used inside the outer gridview. */
export const WORKBENCH_IDS = {
    editor: '__dv_workbench_editor__',
    header: '__dv_workbench_header__',
    statusBar: '__dv_workbench_status_bar__',
    activityBar: '__dv_workbench_activity_bar__',
    primarySideBar: '__dv_workbench_primary_side_bar__',
    secondarySideBar: '__dv_workbench_secondary_side_bar__',
    panel: '__dv_workbench_panel__',
} as const;

/** Fixed-height chrome bands stacked above/below the body row. */
export type WorkbenchBand = 'header' | 'statusBar';

/** All toggleable workbench regions. */
export type WorkbenchRegion =
    | WorkbenchBand
    | 'activityBar'
    | 'primarySideBar'
    | 'secondarySideBar'
    | 'panel';
