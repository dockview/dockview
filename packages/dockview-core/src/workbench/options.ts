import type {
    CreateComponentOptions,
    DockviewComponentOptions,
} from '../dockview/options';
import type { GridviewPanel } from '../gridview/gridviewPanel';
import type { Parameters } from '../panel/types';

/**
 * A fixed-height chrome band (header, toolbar, or status bar) rendered above or
 * below the editor. The band's `component` is resolved through the workbench's
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

/**
 * Options that describe the workbench chrome. The editor itself is a full
 * dockview instance (edge groups included) configured via `dockview`.
 */
export interface WorkbenchOptions {
    /** Fixed band pinned to the top of the workbench. */
    header?: WorkbenchBandOptions;
    /** Fixed band pinned directly above the status bar. */
    toolbar?: WorkbenchBandOptions;
    /** Fixed band pinned to the bottom of the workbench. */
    statusBar?: WorkbenchBandOptions;
    /** CSS class applied to the workbench root element. */
    className?: string;
}

export interface WorkbenchFrameworkOptions {
    /**
     * Factory for the chrome band components (header/toolbar/status bar, and in
     * later phases the side bars and panel views). Mirrors the gridview
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
export const DEFAULT_TOOLBAR_SIZE = 35;
export const DEFAULT_STATUS_BAR_SIZE = 22;

/** Reserved component name for the editor panel that hosts the dockview. */
export const WORKBENCH_EDITOR_COMPONENT = '__dv_workbench_editor__';

/** Reserved panel ids used inside the outer gridview. */
export const WORKBENCH_IDS = {
    editor: '__dv_workbench_editor__',
    header: '__dv_workbench_header__',
    toolbar: '__dv_workbench_toolbar__',
    statusBar: '__dv_workbench_status_bar__',
} as const;

export type WorkbenchBand = 'header' | 'toolbar' | 'statusBar';
