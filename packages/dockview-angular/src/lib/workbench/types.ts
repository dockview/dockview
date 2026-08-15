import type { TemplateRef, Type } from '@angular/core';
import type {
    DockviewComponentOptions,
    WorkbenchActivityBarOptions,
    WorkbenchApi,
    WorkbenchBandOptions,
    WorkbenchPanelOptions,
    WorkbenchSideBarOptions,
} from 'dockview';

export interface WorkbenchAngularReadyEvent {
    api: WorkbenchApi;
}

export interface WorkbenchAngularEvents {
    ready: WorkbenchAngularReadyEvent;
}

export interface WorkbenchAngularOptions {
    /** Components for the chrome bands, side bars and tool panel. */
    components: Record<string, Type<any> | TemplateRef<any>>;
    /** Components for the editor area (embedded dockview). */
    editorComponents: Record<string, Type<any> | TemplateRef<any>>;
    /** Extra dockview options for the editor (theme, dnd, etc.). */
    editorProps?: Omit<DockviewComponentOptions, 'createComponent'>;
    header?: WorkbenchBandOptions;
    statusBar?: WorkbenchBandOptions;
    activityBar?: WorkbenchActivityBarOptions;
    primarySideBar?: WorkbenchSideBarOptions;
    secondarySideBar?: WorkbenchSideBarOptions;
    panel?: WorkbenchPanelOptions;
}

// Re-export commonly used types from dockview
export type { WorkbenchApi } from 'dockview';
