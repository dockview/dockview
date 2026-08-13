import {
    DockviewApi,
    GridviewApi,
    PaneviewApi,
    SplitviewApi,
} from '../api/component.api';
import { DockviewComponent } from '../dockview/dockviewComponent';
import { DockviewComponentOptions } from '../dockview/options';
import { GridviewComponent } from '../gridview/gridviewComponent';
import { GridviewComponentOptions } from '../gridview/options';
import { PaneviewComponentOptions } from '../paneview/options';
import { PaneviewComponent } from '../paneview/paneviewComponent';
import { SplitviewComponentOptions } from '../splitview/options';
import { SplitviewComponent } from '../splitview/splitviewComponent';
import { WorkbenchComponentOptions } from '../workbench/options';
import { WorkbenchApi } from '../workbench/workbench.api';
import { WorkbenchComponent } from '../workbench/workbenchComponent';

export function createDockview(
    element: HTMLElement,
    options: DockviewComponentOptions
): DockviewApi {
    const component = new DockviewComponent(element, options);
    return component.api;
}

export function createSplitview(
    element: HTMLElement,
    options: SplitviewComponentOptions
): SplitviewApi {
    const component = new SplitviewComponent(element, options);
    return new SplitviewApi(component);
}

export function createGridview(
    element: HTMLElement,
    options: GridviewComponentOptions
): GridviewApi {
    const component = new GridviewComponent(element, options);
    return new GridviewApi(component);
}

export function createPaneview(
    element: HTMLElement,
    options: PaneviewComponentOptions
): PaneviewApi {
    const component = new PaneviewComponent(element, options);
    return new PaneviewApi(component);
}

export function createWorkbench(
    element: HTMLElement,
    options: WorkbenchComponentOptions
): WorkbenchApi {
    const component = new WorkbenchComponent(element, options);
    return new WorkbenchApi(component);
}
