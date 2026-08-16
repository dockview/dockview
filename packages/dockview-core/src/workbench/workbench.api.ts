import type { Event } from '../events';
import type { IDisposable } from '../lifecycle';
import type {
    ActivityBarPosition,
    SideBarPosition,
    ToolPanelAlignment,
    ToolPanelPosition,
    WorkbenchRegion,
} from './options';
import type {
    SerializedWorkbench,
    WorkbenchComponent,
} from './workbenchComponent';

/**
 * Runtime handle for the workbench chrome around a dockview. Reached through
 * `api.workbench` on the {@link DockviewApi} returned by `createDockview` when a
 * `workbench` option was supplied; `undefined` otherwise. The editor itself is
 * the dockview `api`, so all existing dockview features (edge groups, floating,
 * popout, serialization) keep working at the centre of the workbench.
 */
export class WorkbenchApi implements IDisposable {
    constructor(private readonly _component: WorkbenchComponent) {}

    /** The workbench root element. */
    get element(): HTMLElement {
        return this._component.element;
    }

    setHeaderVisible(visible: boolean): void {
        this._component.setRegionVisible('header', visible);
    }

    setStatusBarVisible(visible: boolean): void {
        this._component.setRegionVisible('statusBar', visible);
    }

    /** Which side the primary side bar (and activity bar) currently sits on. */
    get primarySideBarPosition(): SideBarPosition {
        return this._component.primarySideBarPosition;
    }

    /** Flip the primary side bar (and activity bar) to the given side. */
    setPrimarySideBarPosition(position: SideBarPosition): void {
        this._component.setPrimarySideBarPosition(position);
    }

    setActivityBarVisible(visible: boolean): void {
        this._component.setRegionVisible('activityBar', visible);
    }

    /** Where the activity bar currently sits (side rail, or top/bottom strip). */
    get activityBarPosition(): ActivityBarPosition {
        return this._component.activityBarPosition;
    }

    /** Move the activity bar to a side rail (`default`) or a top/bottom strip. */
    setActivityBarPosition(position: ActivityBarPosition): void {
        this._component.setActivityBarPosition(position);
    }

    setPrimarySideBarVisible(visible: boolean): void {
        this._component.setRegionVisible('primarySideBar', visible);
    }

    setSecondarySideBarVisible(visible: boolean): void {
        this._component.setRegionVisible('secondarySideBar', visible);
    }

    togglePrimarySideBar(): void {
        this._component.setRegionVisible(
            'primarySideBar',
            !this._component.isRegionVisible('primarySideBar')
        );
    }

    toggleSecondarySideBar(): void {
        this._component.setRegionVisible(
            'secondarySideBar',
            !this._component.isRegionVisible('secondarySideBar')
        );
    }

    /** Which side of the editor the tool panel currently occupies. */
    get toolPanelPosition(): ToolPanelPosition {
        return this._component.toolPanelPosition;
    }

    /** Horizontal span of a top/bottom tool panel. */
    get toolPanelAlignment(): ToolPanelAlignment {
        return this._component.toolPanelAlignment;
    }

    /** Move the tool panel to a different side of the editor. */
    setToolPanelPosition(position: ToolPanelPosition): void {
        this._component.setToolPanelPosition(position);
    }

    /** Change how a top/bottom tool panel spans horizontally. */
    setToolPanelAlignment(alignment: ToolPanelAlignment): void {
        this._component.setToolPanelAlignment(alignment);
    }

    setToolPanelVisible(visible: boolean): void {
        this._component.setRegionVisible('toolPanel', visible);
    }

    toggleToolPanel(): void {
        this._component.setRegionVisible(
            'toolPanel',
            !this._component.isRegionVisible('toolPanel')
        );
    }

    /** Whether the tool panel is currently maximized (filling the body). */
    get isToolPanelMaximized(): boolean {
        return this._component.isToolPanelMaximized;
    }

    /** Fires when the tool panel is maximized or restored. */
    get onDidChangeToolPanelMaximized(): Event<boolean> {
        return this._component.onDidChangeToolPanelMaximized;
    }

    /**
     * Maximize the tool panel so it fills the body (hiding the editor and side
     * regions), or restore the previous layout.
     */
    setToolPanelMaximized(maximized: boolean): void {
        this._component.setToolPanelMaximized(maximized);
    }

    /** Toggle the tool panel between maximized and its previous layout. */
    toggleMaximizedToolPanel(): void {
        this._component.toggleMaximizedToolPanel();
    }

    isRegionVisible(region: WorkbenchRegion): boolean {
        return this._component.isRegionVisible(region);
    }

    layout(width: number, height: number): void {
        this._component.layout(width, height);
    }

    toJSON(): SerializedWorkbench {
        return this._component.toJSON();
    }

    fromJSON(data: SerializedWorkbench): void {
        this._component.fromJSON(data);
    }

    dispose(): void {
        this._component.dispose();
    }
}
