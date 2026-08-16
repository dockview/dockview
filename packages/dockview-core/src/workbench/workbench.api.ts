import type { DockviewApi } from '../api/component.api';
import type { Event } from '../events';
import type { IDisposable } from '../lifecycle';
import type {
    ActivityBarPosition,
    PanelAlignment,
    PanelPosition,
    SideBarPosition,
    WorkbenchBand,
    WorkbenchRegion,
} from './options';
import type {
    SerializedWorkbench,
    WorkbenchComponent,
} from './workbenchComponent';

/**
 * Public handle for a {@link WorkbenchComponent}. The editor is exposed as a
 * regular {@link DockviewApi} via `dockview`, so all existing dockview features
 * (edge groups, floating, popout, serialization) keep working inside the
 * workbench editor.
 */
export class WorkbenchApi implements IDisposable {
    constructor(private readonly _component: WorkbenchComponent) {}

    /** The workbench root element. */
    get element(): HTMLElement {
        return this._component.element;
    }

    /** The dockview backing the editor area. */
    get dockview(): DockviewApi {
        return this._component.dockview;
    }

    setHeaderVisible(visible: boolean): void {
        this._component.setBandVisible('header', visible);
    }

    setStatusBarVisible(visible: boolean): void {
        this._component.setBandVisible('statusBar', visible);
    }

    isBandVisible(band: WorkbenchBand): boolean {
        return this._component.isBandVisible(band);
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
    get panelPosition(): PanelPosition {
        return this._component.panelPosition;
    }

    /** Horizontal span of a top/bottom tool panel. */
    get panelAlignment(): PanelAlignment {
        return this._component.panelAlignment;
    }

    /** Move the tool panel to a different side of the editor. */
    setPanelPosition(position: PanelPosition): void {
        this._component.setPanelPosition(position);
    }

    /** Change how a top/bottom tool panel spans horizontally. */
    setPanelAlignment(alignment: PanelAlignment): void {
        this._component.setPanelAlignment(alignment);
    }

    setPanelVisible(visible: boolean): void {
        this._component.setRegionVisible('panel', visible);
    }

    togglePanel(): void {
        this._component.setRegionVisible(
            'panel',
            !this._component.isRegionVisible('panel')
        );
    }

    /** Whether the tool panel is currently maximized (filling the body). */
    get isPanelMaximized(): boolean {
        return this._component.isPanelMaximized;
    }

    /** Fires when the tool panel is maximized or restored. */
    get onDidChangePanelMaximized(): Event<boolean> {
        return this._component.onDidChangePanelMaximized;
    }

    /**
     * Maximize the tool panel so it fills the body (hiding the editor and side
     * regions), or restore the previous layout.
     */
    setPanelMaximized(maximized: boolean): void {
        this._component.setPanelMaximized(maximized);
    }

    /** Toggle the tool panel between maximized and its previous layout. */
    toggleMaximizedPanel(): void {
        this._component.toggleMaximizedPanel();
    }

    isRegionVisible(region: WorkbenchRegion): boolean {
        return this._component.isRegionVisible(region);
    }

    /** The active view container shown in the primary side bar. */
    get activeViewContainer(): string | undefined {
        return this._component.activeViewContainer;
    }

    /** Fires when the active view container changes. */
    get onDidChangeActiveViewContainer(): Event<string | undefined> {
        return this._component.onDidChangeActiveViewContainer;
    }

    /**
     * Select the view container shown in the primary side bar (what an
     * activity-bar item maps to). Reveals the side bar if hidden; selecting the
     * active container again toggles it shut.
     */
    setActiveViewContainer(id: string): void {
        this._component.setActiveViewContainer(id);
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
