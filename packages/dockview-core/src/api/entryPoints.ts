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
import { WorkbenchApi } from '../workbench/workbench.api';
import { WorkbenchComponent } from '../workbench/workbenchComponent';

export function createDockview(
    element: HTMLElement,
    options: DockviewComponentOptions
): DockviewApi {
    // Opt-in VS Code-style chrome: build the workbench frame around the
    // dockview and expose it through `api.workbench`.
    if (options.workbench) {
        const workbench = new WorkbenchComponent(element, options);
        const api = workbench.dockview;
        api.setWorkbench(new WorkbenchApi(workbench));
        return api;
    }

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
