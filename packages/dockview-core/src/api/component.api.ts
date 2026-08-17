import {
    DockviewActivePanelChangeEvent,
    DockviewPanelPinnedChangeEvent,
    DockviewLayoutMutationEvent,
    DockviewMaximizedGroupChangeEvent,
    DockviewPopoutGroupOptions,
    FloatingGroupOptions,
    GroupNavigationDirection,
    IDockviewComponent,
    MovePanelEvent,
    PopoutGroup,
    PopoutGroupChangePositionEvent,
    PopoutGroupChangeSizeEvent,
    SerializedDockview,
} from '../dockview/dockviewComponent';
import type { WorkbenchApi } from '../workbench/workbench.api';
import {
    AddGroupOptions,
    AddPanelOptions,
    DockviewComponentOptions,
    DockviewDndOverlayEvent,
    MovementOptions,
    SmartGuidesOptions,
} from '../dockview/options';
import {
    DockviewMessages,
    resolveMessages,
} from '../dockview/accessibilityMessages';
import { Parameters } from '../panel/types';
import { Direction } from '../gridview/baseComponentGridview';
import {
    AddGridviewComponentOptions,
    IGridviewComponent,
    SerializedGridviewComponent,
} from '../gridview/gridviewComponent';
import { IGridviewPanel } from '../gridview/gridviewPanel';

import {
    AddPaneviewComponentOptions,
    SerializedPaneview,
    IPaneviewComponent,
} from '../paneview/paneviewComponent';
import { IPaneviewPanel } from '../paneview/paneviewPanel';
import {
    AddSplitviewComponentOptions,
    ISplitviewComponent,
    SerializedSplitview,
} from '../splitview/splitviewComponent';
import { IView, Orientation, Sizing } from '../splitview/splitview';
import { ISplitviewPanel } from '../splitview/splitviewPanel';
import {
    DockviewGroupPanel,
    IDockviewGroupPanel,
} from '../dockview/dockviewGroupPanel';
import { Event } from '../events';
import {
    LayoutHistoryChangeEvent,
    SmartGuidesSnapEvent,
    SmartGuidesSnapTogetherEvent,
} from '../dockview/moduleContracts';
import { IDockviewPanel } from '../dockview/dockviewPanel';
import { PaneviewDidDropEvent } from '../paneview/draggablePaneviewPanel';
import {
    GroupDragEvent,
    TabDragEvent,
} from '../dockview/components/titlebar/tabsContainer';
import {
    DockviewDidDropEvent,
    DockviewWillDropEvent,
} from '../dockview/dockviewGroupPanelModel';
import {
    DockviewWillShowOverlayLocationEvent,
    DockviewTabGroupChangeEvent,
    DockviewTabGroupCollapsedChangeEvent,
    DockviewTabGroupPanelChangeEvent,
} from '../dockview/events';
import { ITabGroup } from '../dockview/tabGroup';
import { DockviewTabGroupColorEntry } from '../dockview/tabGroupAccent';
import {
    PaneviewComponentOptions,
    PaneviewDndOverlayEvent,
} from '../paneview/options';
import { SplitviewComponentOptions } from '../splitview/options';
import { GridviewComponentOptions } from '../gridview/options';
import {
    EdgeGroupPosition,
    AddEdgeGroupOptions,
} from '../dockview/dockviewShell';
import { DockviewGroupPanelApi } from './dockviewGroupPanelApi';

export interface CommonApi<T = any> {
    readonly height: number;
    readonly width: number;
    readonly onDidLayoutChange: Event<void>;
    readonly onDidLayoutFromJSON: Event<void>;
    focus(): void;
    layout(width: number, height: number): void;
    fromJSON(data: T): void;
    toJSON(): T;
    clear(): void;
    dispose(): void;
}

export class SplitviewApi implements CommonApi<SerializedSplitview> {
    /**
     * The minimum size  the component can reach where size is measured in the direction of orientation provided.
     */
    get minimumSize(): number {
        return this.component.minimumSize;
    }

    /**
     * The maximum size the component can reach where size is measured in the direction of orientation provided.
     */
    get maximumSize(): number {
        return this.component.maximumSize;
    }

    /**
     * Width of the component.
     */
    get width(): number {
        return this.component.width;
    }

    /**
     * Height of the component.
     */
    get height(): number {
        return this.component.height;
    }
    /**
     * The current number of panels.
     */
    get length(): number {
        return this.component.length;
    }

    /**
     * The current orientation of the component.
     */
    get orientation(): Orientation {
        return this.component.orientation;
    }

    /**
     * The list of current panels.
     */
    get panels(): ISplitviewPanel[] {
        return this.component.panels;
    }

    /**
     * Invoked after a layout is loaded through the `fromJSON` method.
     */
    get onDidLayoutFromJSON(): Event<void> {
        return this.component.onDidLayoutFromJSON;
    }

    /**
     * Invoked whenever any aspect of the layout changes.
     * If listening to this event it may be worth debouncing ouputs.
     */
    get onDidLayoutChange(): Event<void> {
        return this.component.onDidLayoutChange;
    }

    /**
     * Invoked when a view is added.
     */
    get onDidAddView(): Event<IView> {
        return this.component.onDidAddView;
    }

    /**
     * Invoked when a view is removed.
     */
    get onDidRemoveView(): Event<IView> {
        return this.component.onDidRemoveView;
    }

    constructor(private readonly component: ISplitviewComponent) {}

    /**
     * Removes an existing panel and optionally provide a `Sizing` method
     * for the subsequent resize.
     */
    removePanel(panel: ISplitviewPanel, sizing?: Sizing): void {
        this.component.removePanel(panel, sizing);
    }

    /**
     * Focus the component.
     */
    focus(): void {
        this.component.focus();
    }

    /**
     * Get the reference to a panel given it's `string` id.
     */
    getPanel(id: string): ISplitviewPanel | undefined {
        return this.component.getPanel(id);
    }

    /**
     * Layout the panel with a width and height.
     */
    layout(width: number, height: number): void {
        return this.component.layout(width, height);
    }

    /**
     * Add a new panel and return the created instance.
     */
    addPanel<T extends object = Parameters>(
        options: AddSplitviewComponentOptions<T>
    ): ISplitviewPanel {
        return this.component.addPanel(options);
    }

    /**
     * Move a panel given it's current and desired index.
     */
    movePanel(from: number, to: number): void {
        this.component.movePanel(from, to);
    }

    /**
     * Deserialize a layout to built a splitivew.
     */
    fromJSON(data: SerializedSplitview): void {
        this.component.fromJSON(data);
    }

    /** Serialize a layout */
    toJSON(): SerializedSplitview {
        return this.component.toJSON();
    }

    /**
     * Remove all panels and clear the component.
     */
    clear(): void {
        this.component.clear();
    }

    /**
     * Update configuratable options.
     */
    updateOptions(options: Partial<SplitviewComponentOptions>): void {
        this.component.updateOptions(options);
    }

    /**
     * Release resources and teardown component. Do not call when using framework versions of dockview.
     */
    dispose(): void {
        this.component.dispose();
    }
}

export class PaneviewApi implements CommonApi<SerializedPaneview> {
    /**
     * The minimum size  the component can reach where size is measured in the direction of orientation provided.
     */
    get minimumSize(): number {
        return this.component.minimumSize;
    }

    /**
     * The maximum size the component can reach where size is measured in the direction of orientation provided.
     */
    get maximumSize(): number {
        return this.component.maximumSize;
    }

    /**
     * Width of the component.
     */
    get width(): number {
        return this.component.width;
    }

    /**
     * Height of the component.
     */
    get height(): number {
        return this.component.height;
    }

    /**
     * All panel objects.
     */
    get panels(): IPaneviewPanel[] {
        return this.component.panels;
    }

    /**
     * Invoked when any layout change occures, an aggregation of many events.
     */
    get onDidLayoutChange(): Event<void> {
        return this.component.onDidLayoutChange;
    }

    /**
     * Invoked after a layout is deserialzied using the `fromJSON` method.
     */
    get onDidLayoutFromJSON(): Event<void> {
        return this.component.onDidLayoutFromJSON;
    }

    /**
     * Invoked when a panel is added. May be called multiple times when moving panels.
     */
    get onDidAddView(): Event<IPaneviewPanel> {
        return this.component.onDidAddView;
    }

    /**
     * Invoked when a panel is removed. May be called multiple times when moving panels.
     */
    get onDidRemoveView(): Event<IPaneviewPanel> {
        return this.component.onDidRemoveView;
    }

    /**
     * Invoked when a Drag'n'Drop event occurs that the component was unable to handle. Exposed for custom Drag'n'Drop functionality.
     */
    get onDidDrop(): Event<PaneviewDidDropEvent> {
        return this.component.onDidDrop;
    }

    get onUnhandledDragOver(): Event<PaneviewDndOverlayEvent> {
        return this.component.onUnhandledDragOver;
    }

    constructor(private readonly component: IPaneviewComponent) {}

    /**
     * Remove a panel given the panel object.
     */
    removePanel(panel: IPaneviewPanel): void {
        this.component.removePanel(panel);
    }

    /**
     * Get a panel object given a `string` id. May return `undefined`.
     */
    getPanel(id: string): IPaneviewPanel | undefined {
        return this.component.getPanel(id);
    }

    /**
     * Move a panel given it's current and desired index.
     */
    movePanel(from: number, to: number): void {
        this.component.movePanel(from, to);
    }

    /**
     *  Focus the component. Will try to focus an active panel if one exists.
     */
    focus(): void {
        this.component.focus();
    }

    /**
     * Force resize the component to an exact width and height. Read about auto-resizing before using.
     */
    layout(width: number, height: number): void {
        this.component.layout(width, height);
    }

    /**
     * Add a panel and return the created object.
     */
    addPanel<T extends object = Parameters>(
        options: AddPaneviewComponentOptions<T>
    ): IPaneviewPanel {
        return this.component.addPanel(options);
    }

    /**
     * Create a component from a serialized object.
     */
    fromJSON(data: SerializedPaneview): void {
        this.component.fromJSON(data);
    }

    /**
     * Create a serialized object of the current component.
     */
    toJSON(): SerializedPaneview {
        return this.component.toJSON();
    }

    /**
     * Reset the component back to an empty and default state.
     */
    clear(): void {
        this.component.clear();
    }

    /**
     * Update configuratable options.
     */
    updateOptions(options: Partial<PaneviewComponentOptions>): void {
        this.component.updateOptions(options);
    }

    /**
     * Release resources and teardown component. Do not call when using framework versions of dockview.
     */
    dispose(): void {
        this.component.dispose();
    }
}

export class GridviewApi implements CommonApi<SerializedGridviewComponent> {
    /**
     * Width of the component.
     */
    get width(): number {
        return this.component.width;
    }

    /**
     * Height of the component.
     */
    get height(): number {
        return this.component.height;
    }

    /**
     * Minimum height of the component.
     */
    get minimumHeight(): number {
        return this.component.minimumHeight;
    }

    /**
     * Maximum height of the component.
     */
    get maximumHeight(): number {
        return this.component.maximumHeight;
    }

    /**
     * Minimum width of the component.
     */
    get minimumWidth(): number {
        return this.component.minimumWidth;
    }

    /**
     * Maximum width of the component.
     */
    get maximumWidth(): number {
        return this.component.maximumWidth;
    }

    /**
     * Invoked when any layout change occures, an aggregation of many events.
     */
    get onDidLayoutChange(): Event<void> {
        return this.component.onDidLayoutChange;
    }

    /**
     * Invoked when a panel is added. May be called multiple times when moving panels.
     */
    get onDidAddPanel(): Event<IGridviewPanel> {
        return this.component.onDidAddGroup;
    }

    /**
     * Invoked when a panel is removed. May be called multiple times when moving panels.
     */
    get onDidRemovePanel(): Event<IGridviewPanel> {
        return this.component.onDidRemoveGroup;
    }

    /**
     * Invoked when the active panel changes. May be undefined if no panel is active.
     */
    get onDidActivePanelChange(): Event<IGridviewPanel | undefined> {
        return this.component.onDidActiveGroupChange;
    }

    /**
     * Invoked after a layout is deserialzied using the `fromJSON` method.
     */
    get onDidLayoutFromJSON(): Event<void> {
        return this.component.onDidLayoutFromJSON;
    }

    /**
     * All panel objects.
     */
    get panels(): IGridviewPanel[] {
        return this.component.groups;
    }

    /**
     * Current orientation. Can be changed after initialization.
     */
    get orientation(): Orientation {
        return this.component.orientation;
    }

    set orientation(value: Orientation) {
        this.component.updateOptions({ orientation: value });
    }

    constructor(private readonly component: IGridviewComponent) {}

    /**
     *  Focus the component. Will try to focus an active panel if one exists.
     */
    focus(): void {
        this.component.focus();
    }

    /**
     * Force resize the component to an exact width and height. Read about auto-resizing before using.
     */
    layout(width: number, height: number, force = false): void {
        this.component.layout(width, height, force);
    }

    /**
     * Add a panel and return the created object.
     */
    addPanel<T extends object = Parameters>(
        options: AddGridviewComponentOptions<T>
    ): IGridviewPanel {
        return this.component.addPanel(options);
    }

    /**
     * Remove a panel given the panel object.
     */
    removePanel(panel: IGridviewPanel, sizing?: Sizing): void {
        this.component.removePanel(panel, sizing);
    }

    /**
     * Move a panel in a particular direction relative to another panel.
     */
    movePanel(
        panel: IGridviewPanel,
        options: { direction: Direction; reference: string; size?: number }
    ): void {
        this.component.movePanel(panel, options);
    }

    /**
     * Get a panel object given a `string` id. May return `undefined`.
     */
    getPanel(id: string): IGridviewPanel | undefined {
        return this.component.getPanel(id);
    }

    /**
     * Create a component from a serialized object.
     */
    fromJSON(data: SerializedGridviewComponent): void {
        return this.component.fromJSON(data);
    }

    /**
     * Create a serialized object of the current component.
     */
    toJSON(): SerializedGridviewComponent {
        return this.component.toJSON();
    }

    /**
     * Reset the component back to an empty and default state.
     */
    clear(): void {
        this.component.clear();
    }

    updateOptions(options: Partial<GridviewComponentOptions>) {
        this.component.updateOptions(options);
    }

    /**
     * Release resources and teardown component. Do not call when using framework versions of dockview.
     */
    dispose(): void {
        this.component.dispose();
    }
}

export interface DockviewGetTabGroupsOptions {
    groupId: string;
}

export class DockviewApi implements CommonApi<SerializedDockview> {
    /**
     * The unique identifier for this instance. Used to manage scope of Drag'n'Drop events.
     */
    get id(): string {
        return this.component.id;
    }

    /**
     * Width of the component. Reports the outer workbench frame when one wraps
     * this dockview, so it stays consistent with what `layout()` sizes.
     */
    get width(): number {
        return this._workbench ? this._workbench.width : this.component.width;
    }

    /**
     * Height of the component. Reports the outer workbench frame when one wraps
     * this dockview, so it stays consistent with what `layout()` sizes.
     */
    get height(): number {
        return this._workbench ? this._workbench.height : this.component.height;
    }

    /**
     * Minimum height of the component.
     */
    get minimumHeight(): number {
        return this.component.minimumHeight;
    }

    /**
     * Maximum height of the component.
     */
    get maximumHeight(): number {
        return this.component.maximumHeight;
    }

    /**
     * Minimum width of the component.
     */
    get minimumWidth(): number {
        return this.component.minimumWidth;
    }

    /**
     * Maximum width of the component.
     */
    get maximumWidth(): number {
        return this.component.maximumWidth;
    }

    /**
     * Total number of groups.
     */
    get size(): number {
        return this.component.size;
    }

    /**
     * The active tab-group color palette. Reflects the configured
     * `tabGroupColors` option, or the built-in defaults when unset.
     * Useful for custom chip renderers that want to roll their own
     * picker UI.
     */
    get tabGroupColors(): readonly DockviewTabGroupColorEntry[] {
        return this.component.tabGroupColorPalette.entries();
    }

    /**
     * Total number of panels.
     */
    get totalPanels(): number {
        return this.component.totalPanels;
    }

    /**
     * Invoked when the active group changes. May be undefined if no group is active.
     */
    get onDidActiveGroupChange(): Event<DockviewGroupPanel | undefined> {
        return this.component.onDidActiveGroupChange;
    }

    /**
     * Invoked when a group is added. May be called multiple times when moving groups.
     */
    get onDidAddGroup(): Event<DockviewGroupPanel> {
        return this.component.onDidAddGroup;
    }

    /**
     * Invoked when a group is removed. May be called multiple times when moving groups.
     */
    get onDidRemoveGroup(): Event<DockviewGroupPanel> {
        return this.component.onDidRemoveGroup;
    }

    /**
     * Invoked when the active panel changes. The event carries the active
     * `panel` (may be undefined if no panel is active) and the
     * {@link DockviewOrigin} (`'user'` vs `'api'`) of the change.
     */
    get onDidActivePanelChange(): Event<DockviewActivePanelChangeEvent> {
        return this.component.onDidActivePanelChange;
    }

    /**
     * Fired when a panel is pinned or unpinned (PinnedTabs module). Carries the
     * panel and its new `isPinned` state.
     */
    get onDidPanelPinnedChange(): Event<DockviewPanelPinnedChangeEvent> {
        return this.component.onDidPanelPinnedChange;
    }

    /**
     * Invoked when a panel is added. May be called multiple times when moving panels.
     */
    get onDidAddPanel(): Event<IDockviewPanel> {
        return this.component.onDidAddPanel;
    }

    /**
     * Invoked when a panel is removed. May be called multiple times when moving panels.
     */
    get onDidRemovePanel(): Event<IDockviewPanel> {
        return this.component.onDidRemovePanel;
    }

    get onDidMovePanel(): Event<MovePanelEvent> {
        return this.component.onDidMovePanel;
    }

    /**
     * Invoked after a layout is deserialzied using the `fromJSON` method.
     */
    get onDidLayoutFromJSON(): Event<void> {
        return this.component.onDidLayoutFromJSON;
    }

    /**
     * Invoked when any layout change occures, an aggregation of many events.
     */
    get onDidLayoutChange(): Event<void> {
        return this.component.onDidLayoutChange;
    }

    /**
     * Invoked when a Drag'n'Drop event occurs that the component was unable to handle. Exposed for custom Drag'n'Drop functionality.
     */
    get onDidDrop(): Event<DockviewDidDropEvent> {
        return this.component.onDidDrop;
    }

    /**
     * Invoked when a Drag'n'Drop event occurs but before dockview handles it giving the user an opportunity to intecept and
     * prevent the event from occuring using the standard `preventDefault()` syntax.
     *
     * Preventing certain events may causes unexpected behaviours, use carefully.
     */
    get onWillDrop(): Event<DockviewWillDropEvent> {
        return this.component.onWillDrop;
    }

    /**
     * Fires before each top-level structural layout mutation (add / remove /
     * move / float / popout / maximize / load / clear). Compound operations
     * (e.g. a drag) fire once. Pair with `onDidMutateLayout` to bracket a
     * change, which is useful for undo/redo, autosave and dirty-tracking.
     */
    get onWillMutateLayout(): Event<DockviewLayoutMutationEvent> {
        return this.component.onWillMutateLayout;
    }

    /** Fires after each top-level structural layout mutation. See `onWillMutateLayout`. */
    get onDidMutateLayout(): Event<DockviewLayoutMutationEvent> {
        return this.component.onDidMutateLayout;
    }

    /**
     * Invoked before an overlay is shown indicating a drop target.
     *
     * Calling `event.preventDefault()` will prevent the overlay being shown and prevent
     * the any subsequent drop event.
     */
    get onWillShowOverlay(): Event<DockviewWillShowOverlayLocationEvent> {
        return this.component.onWillShowOverlay;
    }

    /**
     * Invoked before a group is dragged.
     *
     * Calling `event.nativeEvent.preventDefault()` will prevent the group drag starting.
     *
     */
    get onWillDragGroup(): Event<GroupDragEvent> {
        return this.component.onWillDragGroup;
    }

    /**
     * Invoked before a panel is dragged.
     *
     * Calling `event.nativeEvent.preventDefault()` will prevent the panel drag starting.
     */
    get onWillDragPanel(): Event<TabDragEvent> {
        return this.component.onWillDragPanel;
    }

    get onUnhandledDragOver(): Event<DockviewDndOverlayEvent> {
        return this.component.onUnhandledDragOver;
    }

    get onDidPopoutGroupSizeChange(): Event<PopoutGroupChangeSizeEvent> {
        return this.component.onDidPopoutGroupSizeChange;
    }

    get onDidPopoutGroupPositionChange(): Event<PopoutGroupChangePositionEvent> {
        return this.component.onDidPopoutGroupPositionChange;
    }

    /**
     * Fires when a popout group successfully opens in its own window, carrying
     * the live `Window` handle. Use it to route focus or attach per-document
     * listeners. Enumerate the current popouts at any time with `getPopouts()`.
     */
    get onDidAddPopoutGroup(): Event<PopoutGroup> {
        return this.component.onDidAddPopoutGroup;
    }

    /**
     * Fires when a popout group is removed, whether the user closed its window
     * or it was docked back programmatically. Symmetric with
     * {@link onDidAddPopoutGroup}; not fired during component disposal.
     */
    get onDidRemovePopoutGroup(): Event<PopoutGroup> {
        return this.component.onDidRemovePopoutGroup;
    }

    get onDidOpenPopoutWindowFail(): Event<void> {
        return this.component.onDidOpenPopoutWindowFail;
    }

    /** Enumerate the popout groups currently open in their own windows. */
    getPopouts(): PopoutGroup[] {
        return this.component.getPopouts();
    }

    /**
     * Invoked when a tab group is created in any group.
     */
    get onDidCreateTabGroup(): Event<DockviewTabGroupChangeEvent> {
        return this.component.onDidCreateTabGroup;
    }

    /**
     * Invoked when a tab group is destroyed in any group.
     */
    get onDidDestroyTabGroup(): Event<DockviewTabGroupChangeEvent> {
        return this.component.onDidDestroyTabGroup;
    }

    /**
     * Invoked when a panel is added to a tab group.
     */
    get onDidAddPanelToTabGroup(): Event<DockviewTabGroupPanelChangeEvent> {
        return this.component.onDidAddPanelToTabGroup;
    }

    /**
     * Invoked when a panel is removed from a tab group.
     */
    get onDidRemovePanelFromTabGroup(): Event<DockviewTabGroupPanelChangeEvent> {
        return this.component.onDidRemovePanelFromTabGroup;
    }

    /**
     * Invoked when a tab group's properties (label, color) change.
     */
    get onDidTabGroupChange(): Event<DockviewTabGroupChangeEvent> {
        return this.component.onDidTabGroupChange;
    }

    /**
     * Invoked when a tab group is collapsed or expanded.
     */
    get onDidTabGroupCollapsedChange(): Event<DockviewTabGroupCollapsedChangeEvent> {
        return this.component.onDidTabGroupCollapsedChange;
    }

    /**
     * All panel objects.
     */
    get panels(): IDockviewPanel[] {
        return this.component.panels;
    }

    /**
     * All group objects.
     */
    get groups(): DockviewGroupPanel[] {
        return this.component.groups;
    }

    /**
     * The nearest grid group in a spatial direction from `group`, comparing
     * group centre points, e.g. the group visually to the left. Floating and
     * popout groups are ignored. Returns `undefined` when there is no group in
     * that direction. Pair with `group.api.boundingBox` to build your own
     * spatial navigation.
     */
    adjacentGroupInDirection(
        group: IDockviewGroupPanel,
        direction: GroupNavigationDirection
    ): IDockviewGroupPanel | undefined {
        return this.component.adjacentGroupInDirection(
            <DockviewGroupPanel>group,
            direction
        );
    }

    /**
     *  Active panel object.
     */
    get activePanel(): IDockviewPanel | undefined {
        return this.component.activePanel;
    }

    /**
     * Active group object.
     */
    get activeGroup(): DockviewGroupPanel | undefined {
        return this.component.activeGroup;
    }

    /**
     * The resolved accessibility message catalog (the app's `messages`
     * overrides merged over the English defaults). Used by parts that surface
     * localisable AT strings, e.g. the default tab's close-button label.
     */
    get messages(): DockviewMessages {
        return resolveMessages(this.component.options.messages);
    }

    private _workbench: WorkbenchApi | undefined;

    /**
     * The workbench chrome around this dockview (header, side bars, tool panel,
     * ...), present only when `createDockview` was called with a `workbench`
     * option; otherwise `undefined`. Save the workbench layout via
     * `api.workbench.toJSON()`.
     */
    get workbench(): WorkbenchApi | undefined {
        return this._workbench;
    }

    /** @internal Attach the workbench frame that wraps this dockview. Set once. */
    setWorkbench(workbench: WorkbenchApi): void {
        if (this._workbench) {
            throw new Error('dockview: workbench is already attached');
        }
        this._workbench = workbench;
    }

    constructor(private readonly component: IDockviewComponent) {}

    /**
     *  Focus the component. Will try to focus an active panel if one exists.
     */
    focus(): void {
        this.component.focus();
    }

    /**
     * Get a panel object given a `string` id. May return `undefined`.
     */
    getPanel(id: string): IDockviewPanel | undefined {
        return this.component.getGroupPanel(id);
    }

    /**
     * Force resize the component to an exact width and height. Read about auto-resizing before using.
     */
    layout(width: number, height: number, force = false): void {
        // When wrapped in a workbench, sizing the outer frame cascades down to
        // this dockview through the editor cell; sizing the dockview alone would
        // leave the frame unlaid-out.
        if (this._workbench) {
            this._workbench.layout(width, height, force);
            return;
        }
        this.component.layout(width, height, force);
    }

    /**
     * Add a panel and return the created object.
     */
    addPanel<T extends object = Parameters>(
        options: AddPanelOptions<T>
    ): IDockviewPanel {
        return this.component.withOrigin('api', () =>
            this.component.addPanel(options)
        );
    }

    /**
     * Remove a panel given the panel object.
     */
    removePanel(panel: IDockviewPanel): void {
        this.component.withOrigin('api', () =>
            this.component.removePanel(panel)
        );
    }

    /**
     * Add a group and return the created object.
     */
    addGroup(options?: AddGroupOptions): DockviewGroupPanel {
        return this.component.withOrigin('api', () =>
            this.component.addGroup(options)
        );
    }

    /**
     * Close all groups and panels.
     */
    closeAllGroups(): void {
        return this.component.withOrigin('api', () =>
            this.component.closeAllGroups()
        );
    }

    /**
     * Remove a group and any panels within the group.
     */
    removeGroup(group: IDockviewGroupPanel): void {
        this.component.withOrigin('api', () =>
            this.component.removeGroup(<DockviewGroupPanel>group)
        );
    }

    /**
     * Get a group object given a `string` id. May return undefined.
     */
    getGroup(id: string): IDockviewGroupPanel | undefined {
        return this.component.getPanel(id);
    }

    /**
     * Add a floating group
     */
    addFloatingGroup(
        item: IDockviewPanel | DockviewGroupPanel,
        options?: FloatingGroupOptions
    ): void {
        return this.component.withOrigin('api', () =>
            this.component.addFloatingGroup(item, options)
        );
    }

    /**
     * Create a component from a serialized object.
     */
    fromJSON(
        data: SerializedDockview,
        options?: { reuseExistingPanels: boolean }
    ): void {
        this.component.withOrigin('api', () =>
            this.component.fromJSON(data, options)
        );
    }

    /**
     * Create a serialized object of the current component.
     */
    toJSON(): SerializedDockview {
        return this.component.toJSON();
    }

    /**
     * Reset the component back to an empty and default state.
     */
    clear(): void {
        this.component.withOrigin('api', () => this.component.clear());
    }

    /**
     * Undo the previous recorded layout mutation. No-op when there is nothing
     * to undo, when `layoutHistory.enabled` is not set, or when the
     * LayoutHistory module is absent.
     */
    undo(): void {
        this.component.undo();
    }

    /** Re-apply the next layout mutation undone via {@link undo}. */
    redo(): void {
        this.component.redo();
    }

    /** Whether {@link undo} would do something. Reactive via {@link onDidChangeHistory}. */
    get canUndo(): boolean {
        return this.component.canUndo;
    }

    /** Whether {@link redo} would do something. */
    get canRedo(): boolean {
        return this.component.canRedo;
    }

    /** Drop both undo and redo stacks (e.g. on document switch). */
    clearHistory(): void {
        this.component.clearHistory();
    }

    /** Fires whenever the undo/redo stacks change. */
    get onDidChangeHistory(): Event<LayoutHistoryChangeEvent> {
        return this.component.onDidChangeHistory;
    }

    /**
     * Whether Smart Guides snapping is active (the `smartGuides` option is
     * present + enabled and the module is registered). Reactive via
     * {@link setSmartGuidesEnabled}.
     */
    get smartGuidesEnabled(): boolean {
        return this.component.smartGuidesEnabled;
    }

    /** Toggle Smart Guides snapping at runtime (no-op when the module is absent). */
    setSmartGuidesEnabled(enabled: boolean): void {
        this.component.setSmartGuidesEnabled(enabled);
    }

    /** Merge a partial Smart Guides option override in at runtime. */
    updateSmartGuidesOptions(options: Partial<SmartGuidesOptions>): void {
        this.component.updateSmartGuidesOptions(options);
    }

    /** Fires when a dragged floating group commits an alignment snap on drop. */
    get onDidSnapFloat(): Event<SmartGuidesSnapEvent> {
        return this.component.onDidSnapFloat;
    }

    /** Fires when a dragged floating group docks/merges into another on drop. */
    get onDidSnapTogether(): Event<SmartGuidesSnapTogetherEvent> {
        return this.component.onDidSnapTogether;
    }

    /**
     * Resolves once any in-flight popout-window restoration completes. Popout
     * windows re-open asynchronously, so after an {@link undo} / {@link redo} (or
     * {@link fromJSON}) that re-opens a popout, await this to know the window is
     * ready. Already-resolved when nothing is restoring.
     */
    get popoutRestorationPromise(): Promise<void> {
        return this.component.popoutRestorationPromise;
    }

    /**
     * Activate the next panel or group, moving focus programmatically. Pass
     * `{ includePanel: true }` to step through the panels of the active group
     * before advancing to the next group.
     */
    activateNext(options?: MovementOptions): void {
        this.component.activateNext(options);
    }

    /**
     * Activate the previous panel or group, moving focus programmatically. Pass
     * `{ includePanel: true }` to step through the panels of the active group
     * before advancing to the previous group.
     */
    activatePrevious(options?: MovementOptions): void {
        this.component.activatePrevious(options);
    }

    /**
     * @deprecated Use {@link DockviewApi.activateNext} instead. Renamed because
     * this advances the active panel/group (focus), it does not relocate a
     * panel. Removal planned for a future major release.
     */
    moveToNext(options?: MovementOptions): void {
        this.activateNext(options);
    }

    /**
     * @deprecated Use {@link DockviewApi.activatePrevious} instead. Renamed
     * because this advances the active panel/group (focus), it does not
     * relocate a panel. Removal planned for a future major release.
     */
    moveToPrevious(options?: MovementOptions): void {
        this.activatePrevious(options);
    }

    maximizeGroup(panel: IDockviewPanel): void {
        this.component.withOrigin('api', () =>
            this.component.maximizeGroup(panel.group)
        );
    }

    hasMaximizedGroup(): boolean {
        return this.component.hasMaximizedGroup();
    }

    exitMaximizedGroup(): void {
        this.component.withOrigin('api', () =>
            this.component.exitMaximizedGroup()
        );
    }

    get onDidMaximizedGroupChange(): Event<DockviewMaximizedGroupChangeEvent> {
        return this.component.onDidMaximizedGroupChange;
    }

    /**
     * Add a popout group in a new Window
     */
    addPopoutGroup(
        item: IDockviewPanel | DockviewGroupPanel,
        options?: DockviewPopoutGroupOptions
    ): Promise<boolean> {
        return this.component.withOrigin('api', () =>
            this.component.addPopoutGroup(item, options)
        );
    }

    /**
     * Add an edge group at the given position. Returns the group panel API
     * for the newly created group. Throws if a group already exists there.
     */
    addEdgeGroup(
        position: EdgeGroupPosition,
        options: AddEdgeGroupOptions
    ): DockviewGroupPanelApi {
        return this.component.addEdgeGroup(position, options);
    }

    /**
     * Reveal (create-or-fill) the edge group at `position` and move the dragged
     * item described by `data` into it. A newly created edge group tears down to
     * zero footprint when later emptied. Drives the dock-to-edge groups behind
     * the `dockToEdgeGroups` option; a no-op if edge groups are unavailable.
     */
    revealEdgeGroupWithData(
        position: EdgeGroupPosition,
        data: { groupId: string; panelId?: string | null },
        options?: { autoHide?: boolean }
    ): void {
        this.component.revealEdgeGroupWithData(position, data, options);
    }

    /**
     * Get the group panel API for an edge group at the given position.
     * Returns `undefined` if no edge group is configured at that position.
     */
    getEdgeGroup(
        position: EdgeGroupPosition
    ): DockviewGroupPanelApi | undefined {
        return this.component.getEdgeGroup(position);
    }

    /**
     * Set the visibility of an edge group.
     */
    setEdgeGroupVisible(position: EdgeGroupPosition, visible: boolean): void {
        this.component.setEdgeGroupVisible(position, visible);
    }

    /**
     * Check whether an edge group is currently visible.
     */
    isEdgeGroupVisible(position: EdgeGroupPosition): boolean {
        return this.component.isEdgeGroupVisible(position);
    }

    /**
     * Remove an edge group and reclaim its slot in the layout.
     * All panels inside the group are disposed. Throws if no group exists at position.
     */
    removeEdgeGroup(position: EdgeGroupPosition): void {
        this.component.removeEdgeGroup(position);
    }

    /**
     * Pin (expand) the collapsed edge group at `position`. Requires the
     * auto-hide edge groups module; no-op when it is absent.
     */
    pinEdgeGroup(position: EdgeGroupPosition): void {
        this.component.pinEdgeGroup(position);
    }

    /** Auto-hide (collapse to a strip) the edge group at `position`. */
    autoHideEdgeGroup(position: EdgeGroupPosition): void {
        this.component.autoHideEdgeGroup(position);
    }

    /**
     * Peek (slide out as an overlay, without reflowing the grid) or close the
     * collapsed edge group at `position`. No-op when the auto-hide module is
     * absent or the group is not collapsed.
     */
    peekEdgeGroup(position: EdgeGroupPosition, peek: boolean): void {
        this.component.peekEdgeGroup(position, peek);
    }

    updateOptions(options: Partial<DockviewComponentOptions>) {
        this.component.updateOptions(options);
    }

    // === Tab Group API ===

    private _getGroupModel(groupId: string) {
        const group = this.component.getPanel(groupId);
        if (!group) {
            throw new Error(`dockview: group '${groupId}' not found`);
        }
        return group.model;
    }

    createTabGroup(options: {
        groupId: string;
        label?: string;
        color?: string;
        componentParams?: Record<string, unknown>;
    }): ITabGroup {
        const model = this._getGroupModel(options.groupId);
        return this.component.withOrigin('api', () =>
            model.createTabGroup({
                label: options.label,
                color: options.color,
                componentParams: options.componentParams,
            })
        );
    }

    dissolveTabGroup(options: { groupId: string; tabGroupId: string }): void {
        const model = this._getGroupModel(options.groupId);
        this.component.withOrigin('api', () =>
            model.dissolveTabGroup(options.tabGroupId)
        );
    }

    addPanelToTabGroup(options: {
        groupId: string;
        tabGroupId: string;
        panelId: string;
        index?: number;
    }): void {
        const model = this._getGroupModel(options.groupId);
        this.component.withOrigin('api', () =>
            model.addPanelToTabGroup(
                options.tabGroupId,
                options.panelId,
                options.index
            )
        );
    }

    removePanelFromTabGroup(options: {
        groupId: string;
        panelId: string;
    }): void {
        const model = this._getGroupModel(options.groupId);
        this.component.withOrigin('api', () =>
            model.removePanelFromTabGroup(options.panelId)
        );
    }

    getTabGroups(options: DockviewGetTabGroupsOptions): readonly ITabGroup[] {
        const model = this._getGroupModel(options.groupId);
        return model.getTabGroups();
    }

    getTabGroupForPanel(options: {
        groupId: string;
        panelId: string;
    }): ITabGroup | undefined {
        const model = this._getGroupModel(options.groupId);
        return model.getTabGroupForPanel(options.panelId);
    }

    moveTabGroup(options: {
        groupId: string;
        tabGroupId: string;
        index: number;
    }): void {
        const model = this._getGroupModel(options.groupId);
        model.moveTabGroup(options.tabGroupId, options.index);
    }

    /**
     * Release resources and teardown component. Do not call when using framework versions of dockview.
     */
    dispose(): void {
        // The workbench frame owns this dockview (via its editor cell), so
        // tearing the frame down disposes the dockview too.
        if (this._workbench) {
            this._workbench.dispose();
            return;
        }
        this.component.dispose();
    }
}
