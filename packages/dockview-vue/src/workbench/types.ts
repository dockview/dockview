import type {
    DockviewComponentOptions,
    GridviewApi,
    GridviewPanelApi,
    SideBarPosition,
    WorkbenchActivityBarOptions,
    WorkbenchApi,
    WorkbenchBandOptions,
    WorkbenchPanelOptions,
    WorkbenchSideBarOptions,
} from 'dockview';
import type { VueComponent } from '../utils';

export interface WorkbenchReadyEvent {
    api: WorkbenchApi;
}

/**
 * Props for a chrome-band / side-bar / tool-panel Vue component. These render
 * as panels in the workbench's outer gridview.
 */
export interface IWorkbenchVuePanelProps<T extends Record<string, any> = any> {
    params: T;
    api: GridviewPanelApi;
    containerApi: GridviewApi;
}

export interface IWorkbenchVueProps {
    /** Components for the chrome bands, side bars and tool panel. */
    components?: Record<string, VueComponent>;
    /** Components for the editor area (embedded dockview). */
    editorComponents?: Record<string, VueComponent>;
    /** Extra dockview options for the editor (theme, dnd, etc.). */
    editorProps?: Omit<DockviewComponentOptions, 'createComponent'>;

    header?: WorkbenchBandOptions;
    statusBar?: WorkbenchBandOptions;
    activityBar?: WorkbenchActivityBarOptions;
    primarySideBar?: WorkbenchSideBarOptions;
    secondarySideBar?: WorkbenchSideBarOptions;
    panel?: WorkbenchPanelOptions;
    primarySideBarPosition?: SideBarPosition;
    activeViewContainer?: string;
    className?: string;
}

export type WorkbenchVueEvents = {
    ready: [event: WorkbenchReadyEvent];
};
