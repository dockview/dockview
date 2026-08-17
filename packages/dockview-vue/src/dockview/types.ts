import {
    type DockviewDidDropEvent,
    type DockviewOptions,
    type DockviewReadyEvent,
    type DockviewWillDropEvent,
    type GridviewApi,
    type GridviewPanelApi,
    type SideBarPosition,
    type WorkbenchActivityBarOptions,
    type WorkbenchBandOptions,
    type WorkbenchSideBarOptions,
    type WorkbenchToolPanelOptions,
} from 'dockview';
import type { VueComponent } from '../utils';

/**
 * Props for a workbench chrome component (header, status bar, activity bar,
 * side bars, tool panel), rendered as a panel in the workbench's outer gridview.
 */
export interface IWorkbenchVuePanelProps<T extends Record<string, any> = any> {
    params: T;
    api: GridviewPanelApi;
    containerApi: GridviewApi;
}

/**
 * Opt-in VS Code-style chrome around the dockview editor, supplied on the
 * `workbench` prop of `DockviewVue`. Reached at runtime through `api.workbench`.
 */
export interface IDockviewVueWorkbenchProps {
    /** Components for the chrome bands, side bars and tool panel. */
    components: Record<string, VueComponent>;
    header?: WorkbenchBandOptions;
    statusBar?: WorkbenchBandOptions;
    activityBar?: WorkbenchActivityBarOptions;
    primarySideBar?: WorkbenchSideBarOptions;
    secondarySideBar?: WorkbenchSideBarOptions;
    toolPanel?: WorkbenchToolPanelOptions;
    primarySideBarPosition?: SideBarPosition;
    className?: string;
}

export interface VueProps {
    components?: Record<string, VueComponent>;
    tabComponents?: Record<string, VueComponent>;
    watermarkComponent?: string | VueComponent;
    defaultTabComponent?: string | VueComponent;
    rightHeaderActionsComponent?: string | VueComponent;
    leftHeaderActionsComponent?: string | VueComponent;
    prefixHeaderActionsComponent?: string | VueComponent;
    tabGroupChipComponent?: string | VueComponent;
    groupDragGhostComponent?: string | VueComponent;
    /** Opt in to VS Code-style workbench chrome. Reached via `api.workbench`. */
    workbench?: IDockviewVueWorkbenchProps;
}

export type VueEvents = {
    ready: [event: DockviewReadyEvent];
    didDrop: [event: DockviewDidDropEvent];
    willDrop: [event: DockviewWillDropEvent];
};

export type IDockviewVueProps = DockviewOptions & VueProps;
