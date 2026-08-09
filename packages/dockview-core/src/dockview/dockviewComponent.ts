import {
    getRelativeLocation,
    SerializedGridObject,
    getGridLocation,
    ISerializedLeafNode,
    orthogonal,
    Gridview,
    SerializedGridview,
} from '../gridview/gridview';
import {
    directionToPosition,
    DroptargetOverlayModel,
    Position,
    PositionResolver,
} from '../dnd/droptarget';
import { tail, sequenceEquals } from '../array';
import { DockviewPanel, IDockviewPanel } from './dockviewPanel';
import {
    CompositeDisposable,
    Disposable,
    IDisposable,
    MutableDisposable,
} from '../lifecycle';
import { Event, Emitter, addDisposableListener } from '../events';
import { Watermark } from './components/watermark/watermark';
import { IWatermarkRenderer, GroupviewPanelState } from './types';
import { sequentialNumberGenerator } from '../math';
import { DefaultDockviewDeserialzier } from './deserializer';
import {
    AddGroupOptions,
    AddPanelOptions,
    DockviewComponentOptions,
    DockviewDndOverlayEvent,
    DockviewOptions,
    DockviewUnhandledDragOverEvent,
    isGroupOptionsWithGroup,
    isGroupOptionsWithPanel,
    isPanelOptionsWithGroup,
    isPanelOptionsWithPanel,
    MovementOptions,
    DockviewHeaderPosition,
    SmartGuidesOptions,
    isEdgeGroupEnabled,
} from './options';
import {
    BaseGrid,
    Direction,
    IBaseGrid,
    toTarget,
} from '../gridview/baseComponentGridview';
import { DockviewApi } from '../api/component.api';
import { Orientation, Sizing } from '../splitview/splitview';
import {
    GroupOptions,
    GroupPanelViewState,
    DockviewDidDropEvent,
    DockviewWillDropEvent,
} from './dockviewGroupPanelModel';
import {
    DockviewWillShowOverlayLocationEvent,
    DockviewTabGroupChangeEvent,
    DockviewTabGroupCollapsedChangeEvent,
    DockviewTabGroupPanelChangeEvent,
    DockviewGroupDropLocation,
} from './events';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewPanelModel } from './dockviewPanelModel';
import { getPanelData } from '../dnd/dataTransfer';
import { Parameters } from '../panel/types';
import { Overlay, OverlayDragContext } from '../overlay/overlay';
import {
    Classnames,
    getDockviewTheme,
    onDidWindowResizeEnd,
    onDidWindowMoveEnd,
    toggleClass,
} from '../dom';
import { DockviewFloatingGroupPanel } from './dockviewFloatingGroupPanel';
import {
    GroupDragEvent,
    TabDragEvent,
} from './components/titlebar/tabsContainer';
import { FloatingTitleBar } from './components/titlebar/floatingTitleBar';
import {
    assertModule,
    DockviewModule,
    getRegisteredModules,
    missingModuleMessage,
    ModuleRegistry,
} from './modules';
import { validateOptionModules } from './optionsModules';
import { AllModules } from './allModules';
import { IFloatingGroupHost } from './floatingGroupService';
import { IPopoutWindowHost, PopoutGroupEntry } from './popoutWindowService';
import { IWatermarkHost } from './watermarkService';
import { IEdgeGroupServiceHost } from './edgeGroupService';
import {
    IKeyboardNavigationHost,
    IAdvancedDnDHost,
    IAutoHideEdgeGroupHost,
    IContextMenuHost,
    IContextMenuService,
    IDndCompassHost,
    ILayoutHistoryHost,
    LayoutHistoryChangeEvent,
    IMultiRowTabsHost,
    ISmartGuidesHost,
    SmartGuidesSnapEvent,
    SmartGuidesSnapTogetherEvent,
    ITabGroupChipsHost,
    IPinnedTabsService,
    IAdvancedOverflowService,
} from './moduleContracts';
import { IHeaderActionsHost } from './headerActionsService';
import { AnchoredBox, AnchorPosition, Box } from '../types';
import {
    DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE,
    DEFAULT_FLOATING_GROUP_POSITION,
    DESERIALIZATION_POPOUT_DELAY_MS,
} from '../constants';
import {
    DockviewPanelRenderer,
    OverlayRenderContainer,
} from '../overlay/overlayRenderContainer';
import { PopoutWindow } from '../popoutWindow';
import { StrictEventsSequencing } from './strictEventsSequencing';
import { PopupService } from './components/popupService';
import { IRootDropTargetHost } from './rootDropTargetService';
import { ILiveRegionHost } from './liveRegionService';
import { IDragGhostSpec } from '../dnd/backend';
import { DropTargetAnchorContainer } from '../dnd/dropTargetAnchorContainer';
import { themeAbyss } from './theme';
import {
    EdgeGroupPosition,
    AddEdgeGroupOptions,
    SerializedEdgeGroups,
    ShellManager,
    IEdgeGroupHost,
} from './dockviewShell';
import { DockviewGroupPanelApi } from '../api/dockviewGroupPanelApi';
import {
    DEFAULT_TAB_GROUP_COLORS,
    DockviewTabGroupColorEntry,
    TabGroupColorPalette,
} from './tabGroupAccent';

function buildTabGroupColorPalette(options: {
    tabGroupColors?: DockviewTabGroupColorEntry[];
    tabGroupAccent?: 'palette' | 'off';
}): TabGroupColorPalette {
    const entries = options.tabGroupColors ?? DEFAULT_TAB_GROUP_COLORS;
    const enabled = options.tabGroupAccent !== 'off';
    return new TabGroupColorPalette(entries, enabled);
}

function moveGroupWithoutDestroying(options: {
    from: DockviewGroupPanel;
    to: DockviewGroupPanel;
}) {
    const activePanel = options.from.activePanel;
    const panels = [...options.from.panels].map((panel) => {
        const removedPanel = options.from.model.removePanel(panel);
        options.from.model.renderContainer.detatch(panel);
        return removedPanel;
    });

    panels.forEach((panel) => {
        options.to.model.openPanel(panel, {
            skipSetActive: activePanel !== panel,
            skipSetGroupActive: true,
        });
    });
}

export interface DockviewPopoutGroupOptions {
    /**
     * The position of the popout group
     */
    position?: Box;
    /**
     * The same-origin path at which the popout window will be created
     *
     * Defaults to `/popout.html` if not provided
     */
    popoutUrl?: string;
    onDidOpen?: (event: { id: string; window: Window }) => void;
    onWillClose?: (event: { id: string; window: Window }) => void;
}

interface DockviewPopoutGroupOptionsInternal
    extends DockviewPopoutGroupOptions {
    referenceGroup?: DockviewGroupPanel;
    overridePopoutGroup?: DockviewGroupPanel;
    /**
     * Restore into a pre-built nested gridview (multi-group popout window)
     * rather than creating one around a single group.
     */
    overridePopoutGridview?: Gridview;
}

export interface PanelReference {
    update: (event: { params: { [key: string]: any } }) => void;
    remove: () => void;
}

export interface SerializedFloatingGroup {
    /**
     * Legacy single-group form. Still written when a floating window hosts a
     * single group (for stable round-trips) and always accepted on read.
     */
    data?: GroupPanelViewState;
    /**
     * Nested layout of the floating window. Written when the window hosts more
     * than one group; mutually exclusive with `data`.
     */
    grid?: SerializedGridview<GroupPanelViewState>;
    position: AnchoredBox;
}

export interface SerializedPopoutGroup {
    /**
     * Legacy single-group form. Still written when a popout window hosts a
     * single group (for stable round-trips) and always accepted on read.
     */
    data?: GroupPanelViewState;
    /**
     * Nested layout of the popout window. Written when the window hosts more
     * than one group; mutually exclusive with `data`.
     */
    grid?: SerializedGridview<GroupPanelViewState>;
    url?: string;
    gridReferenceGroup?: string;
    position: Box | null;
}

export interface SerializedDockview {
    grid: {
        root: SerializedGridObject<GroupPanelViewState>;
        height: number;
        width: number;
        orientation: Orientation;
    };
    panels: Record<string, GroupviewPanelState>;
    activeGroup?: string;
    floatingGroups?: SerializedFloatingGroup[];
    popoutGroups?: SerializedPopoutGroup[];
    edgeGroups?: SerializedEdgeGroups;
}

export interface MovePanelEvent {
    panel: IDockviewPanel;
    from: DockviewGroupPanel;
}

type MoveGroupOptions = {
    from: { group: DockviewGroupPanel };
    to: { group: DockviewGroupPanel; position: Position };
    skipSetActive?: boolean;
};

type MoveGroupOrPanelOptions = {
    from: {
        groupId: string;
        panelId?: string;
        tabGroupId?: string;
    };
    to: {
        group: DockviewGroupPanel;
        position: Position;
        index?: number;
    };
    skipSetActive?: boolean;
    keepEmptyGroups?: boolean;
};

export interface FloatingGroupOptions {
    x?: number;
    y?: number;
    height?: number;
    width?: number;
    position?: AnchorPosition;
    /**
     * Override the component-level `floatingGroupDragHandle` option for this
     * group only. See {@link DockviewOptions.floatingGroupDragHandle}.
     */
    dragHandle?: 'titlebar' | 'tabbar';
    /**
     * Exclude this floating group from Smart Guides so it never snaps and shows
     * no guides when dragged (e.g. a pinned HUD). See
     * {@link DockviewOptions.smartGuides}.
     */
    disableSmartGuides?: boolean;
}

interface FloatingGroupOptionsInternal extends FloatingGroupOptions {
    skipRemoveGroup?: boolean;
    inDragMode?: boolean;
    skipActiveGroup?: boolean;
}

export interface DockviewMaximizedGroupChangeEvent {
    group: DockviewGroupPanel;
    isMaximized: boolean;
}

/** The coarse kind of a structural layout mutation (see `onWillMutateLayout`). */
export type DockviewLayoutMutationKind =
    | 'add'
    | 'remove'
    | 'move'
    | 'float'
    | 'popout'
    | 'maximize'
    | 'tab-group'
    | 'load'
    | 'clear';

/**
 * Who caused an operation: `'user'` for changes driven by direct interaction
 * (drag-and-drop, tab UI, keyboard docking) and `'api'` for those entered
 * through a {@link DockviewApi} method called by application code. Lets
 * consumers (e.g. an undo stack, or a context-sync listener) treat the app's
 * own programmatic changes differently from end-user gestures.
 */
export type DockviewOrigin = 'user' | 'api';

export interface DockviewLayoutMutationEvent {
    readonly kind: DockviewLayoutMutationKind;
    readonly origin: DockviewOrigin;
}

/**
 * Fired by `onDidActivePanelChange` when the active panel changes. Carries the
 * {@link DockviewOrigin} so consumers can distinguish a user clicking a tab
 * from a programmatic `setActive` call (e.g. to avoid feedback loops when
 * syncing context off the active panel).
 */
export interface DockviewActivePanelChangeEvent {
    readonly panel: IDockviewPanel | undefined;
    readonly origin: DockviewOrigin;
}

/**
 * Fired by `onDidPanelPinnedChange` when a panel is pinned or unpinned via the
 * PinnedTabs module. `isPinned` is the new state.
 */
export interface DockviewPanelPinnedChangeEvent {
    readonly panel: IDockviewPanel;
    readonly isPinned: boolean;
}

export interface PopoutGroupChangeSizeEvent {
    width: number;
    height: number;
    group: DockviewGroupPanel;
}

export interface PopoutGroupChangePositionEvent {
    screenX: number;
    screenY: number;
    group: DockviewGroupPanel;
}

/** A spatial (visual) direction for group-to-group navigation. */
export type GroupNavigationDirection = 'left' | 'right' | 'up' | 'down';

/**
 * A popout group currently open in its own window. `window` is the live
 * `Window` handle of the popout, so consumers can route focus, attach
 * per-document listeners, or place the window.
 */
export interface PopoutGroup {
    readonly id: string;
    readonly group: DockviewGroupPanel;
    readonly window: Window;
}

export interface IDockviewComponent extends IBaseGrid<DockviewGroupPanel> {
    readonly activePanel: IDockviewPanel | undefined;
    readonly totalPanels: number;
    readonly panels: IDockviewPanel[];
    readonly orientation: Orientation;
    readonly onDidDrop: Event<DockviewDidDropEvent>;
    readonly onWillDrop: Event<DockviewWillDropEvent>;
    readonly onWillMutateLayout: Event<DockviewLayoutMutationEvent>;
    readonly onDidMutateLayout: Event<DockviewLayoutMutationEvent>;
    currentOrigin(): DockviewOrigin;
    withOrigin<T>(origin: DockviewOrigin, func: () => T): T;
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent>;
    readonly onDidRemovePanel: Event<IDockviewPanel>;
    readonly onDidAddPanel: Event<IDockviewPanel>;
    readonly onDidLayoutFromJSON: Event<void>;
    readonly onDidActivePanelChange: Event<DockviewActivePanelChangeEvent>;
    readonly onDidPanelPinnedChange: Event<DockviewPanelPinnedChangeEvent>;
    readonly onWillDragPanel: Event<TabDragEvent>;
    readonly onWillDragGroup: Event<GroupDragEvent>;
    readonly onDidRemoveGroup: Event<DockviewGroupPanel>;
    readonly onDidAddGroup: Event<DockviewGroupPanel>;
    readonly onDidActiveGroupChange: Event<DockviewGroupPanel | undefined>;
    readonly onUnhandledDragOver: Event<DockviewDndOverlayEvent>;
    readonly onDidMovePanel: Event<MovePanelEvent>;
    readonly onDidMaximizedGroupChange: Event<DockviewMaximizedGroupChangeEvent>;
    readonly onDidPopoutGroupSizeChange: Event<PopoutGroupChangeSizeEvent>;
    readonly onDidPopoutGroupPositionChange: Event<PopoutGroupChangePositionEvent>;
    readonly onDidAddPopoutGroup: Event<PopoutGroup>;
    readonly onDidRemovePopoutGroup: Event<PopoutGroup>;
    readonly onDidOpenPopoutWindowFail: Event<void>;
    getPopouts(): PopoutGroup[];
    readonly onDidCreateTabGroup: Event<DockviewTabGroupChangeEvent>;
    readonly onDidDestroyTabGroup: Event<DockviewTabGroupChangeEvent>;
    readonly onDidAddPanelToTabGroup: Event<DockviewTabGroupPanelChangeEvent>;
    readonly onDidRemovePanelFromTabGroup: Event<DockviewTabGroupPanelChangeEvent>;
    readonly onDidTabGroupChange: Event<DockviewTabGroupChangeEvent>;
    readonly onDidTabGroupCollapsedChange: Event<DockviewTabGroupCollapsedChangeEvent>;
    readonly options: DockviewComponentOptions;
    readonly tabGroupColorPalette: TabGroupColorPalette;
    updateOptions(options: DockviewOptions): void;
    moveGroupOrPanel(options: MoveGroupOrPanelOptions): void;
    moveGroup(options: MoveGroupOptions): void;
    setPanelPinned(panel: DockviewPanel, pinned: boolean): void;
    doSetGroupActive: (group: DockviewGroupPanel, skipFocus?: boolean) => void;
    removeGroup: (group: DockviewGroupPanel) => void;
    addPanel<T extends object = Parameters>(
        options: AddPanelOptions<T>
    ): IDockviewPanel;
    removePanel(panel: IDockviewPanel): void;
    getGroupPanel: (id: string) => IDockviewPanel | undefined;
    createWatermarkComponent(): IWatermarkRenderer;
    // lifecycle
    addGroup(options?: AddGroupOptions): DockviewGroupPanel;
    closeAllGroups(): void;
    adjacentGroupInDirection(
        group: DockviewGroupPanel,
        direction: GroupNavigationDirection
    ): DockviewGroupPanel | undefined;
    // events
    activateNext(options?: MovementOptions): void;
    activatePrevious(options?: MovementOptions): void;
    setActivePanel(panel: IDockviewPanel): void;
    focus(): void;
    toJSON(): SerializedDockview;
    fromJSON(data: SerializedDockview): void;
    //
    addFloatingGroup(
        item: IDockviewPanel | DockviewGroupPanel,
        options?: FloatingGroupOptions
    ): void;
    addPopoutGroup(
        item: IDockviewPanel | DockviewGroupPanel,
        options?: DockviewPopoutGroupOptions
    ): Promise<boolean>;
    fromJSON(data: any, options?: { reuseExistingPanels: boolean }): void;
    addEdgeGroup(
        position: EdgeGroupPosition,
        options: AddEdgeGroupOptions
    ): DockviewGroupPanelApi;
    revealEdgeGroupWithData(
        position: EdgeGroupPosition,
        data: { groupId: string; panelId?: string | null },
        options?: { autoHide?: boolean }
    ): void;
    getEdgeGroup(
        position: EdgeGroupPosition
    ): DockviewGroupPanelApi | undefined;
    setEdgeGroupVisible(position: EdgeGroupPosition, visible: boolean): void;
    isEdgeGroupVisible(position: EdgeGroupPosition): boolean;
    removeEdgeGroup(position: EdgeGroupPosition): void;
    getEdgeGroupPanel(
        position: EdgeGroupPosition
    ): DockviewGroupPanel | undefined;
    pinEdgeGroup(position: EdgeGroupPosition): void;
    autoHideEdgeGroup(position: EdgeGroupPosition): void;
    peekEdgeGroup(position: EdgeGroupPosition, peek: boolean): void;
    isEdgeGroupAutoHide(group: DockviewGroupPanel): boolean;
    setEdgeGroupAutoHide(
        group: DockviewGroupPanel,
        value: boolean | undefined
    ): void;
    readonly onDidEdgeGroupAutoHideChange: Event<DockviewGroupPanel>;
    readonly overlayRoot: HTMLElement;
    getEdgeGroupExpandedSize(position: EdgeGroupPosition): number;
    // layout history (undo / redo)
    undo(): void;
    redo(): void;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    clearHistory(): void;
    readonly onDidChangeHistory: Event<LayoutHistoryChangeEvent>;
    readonly popoutRestorationPromise: Promise<void>;
    // smart guides
    readonly smartGuidesEnabled: boolean;
    setSmartGuidesEnabled(enabled: boolean): void;
    updateSmartGuidesOptions(options: Partial<SmartGuidesOptions>): void;
    readonly onDidSnapFloat: Event<SmartGuidesSnapEvent>;
    readonly onDidSnapTogether: Event<SmartGuidesSnapTogetherEvent>;
}

/** A never-firing event, the fallback the api returns when the backing module
 *  is absent, so the api events are always valid and subscribable. */
const NO_EVENT: Event<any> = () => ({
    dispose: () => {
        // noop, nothing ever fires
    },
});

/** A never-firing history-change event, the fallback `onDidChangeHistory`
 *  returns when the LayoutHistory module is absent. */
const NO_LAYOUT_HISTORY_CHANGES: Event<LayoutHistoryChangeEvent> = NO_EVENT;

export class DockviewComponent
    extends BaseGrid<DockviewGroupPanel>
    implements
        IDockviewComponent,
        IFloatingGroupHost,
        IPopoutWindowHost,
        IWatermarkHost,
        IEdgeGroupServiceHost,
        ITabGroupChipsHost,
        IContextMenuHost,
        IRootDropTargetHost,
        IHeaderActionsHost,
        IAdvancedDnDHost,
        ILiveRegionHost,
        IKeyboardNavigationHost,
        ILayoutHistoryHost,
        IDndCompassHost,
        ISmartGuidesHost,
        IAutoHideEdgeGroupHost,
        IMultiRowTabsHost
{
    private readonly nextGroupId = sequentialNumberGenerator();
    private readonly _deserializer = new DefaultDockviewDeserialzier(this);
    private readonly _api: DockviewApi;
    private readonly _moduleRegistry = new ModuleRegistry<DockviewComponent>();
    private _options: Exclude<DockviewComponentOptions, 'orientation'>;
    private readonly _tabGroupColorPalette: TabGroupColorPalette;
    private readonly _shellThemeClassnames: Classnames | undefined;

    readonly overlayRenderContainer: OverlayRenderContainer;
    readonly popupService: PopupService;
    readonly rootDropTargetContainer: DropTargetAnchorContainer;
    /**
     * Shell-level anchor container dedicated to floating groups. Unlike
     * {@link rootDropTargetContainer} it is never disabled by the
     * `dndOverlayMounting: 'relative'` theme setting: a floating group cannot
     * use an in-place ('relative') overlay because the overlay would be
     * appended inside the floating window's stacking context
     * (`.dv-resize-container`, a lower z-index than the shell-level render
     * overlay that hosts the floating panel's content) and be painted over.
     * Routing floating groups through this always-anchored container keeps
     * their drop overlays visible in both mounting modes.
     */
    readonly floatingDropTargetContainer: DropTargetAnchorContainer;

    private readonly _onWillDragPanel = new Emitter<TabDragEvent>();
    readonly onWillDragPanel: Event<TabDragEvent> = this._onWillDragPanel.event;

    private readonly _onWillDragGroup = new Emitter<GroupDragEvent>();
    readonly onWillDragGroup: Event<GroupDragEvent> =
        this._onWillDragGroup.event;

    private readonly _onDidDrop = new Emitter<DockviewDidDropEvent>();
    readonly onDidDrop: Event<DockviewDidDropEvent> = this._onDidDrop.event;

    private readonly _onWillDrop = new Emitter<DockviewWillDropEvent>();
    readonly onWillDrop: Event<DockviewWillDropEvent> = this._onWillDrop.event;

    // Transaction boundary bracketing each top-level structural mutation.
    // Compound operations (e.g. a drag that relocates a panel) nest via the
    // depth counter and bracket as a single transaction. See `mutation()`.
    private _mutationDepth = 0;
    // Current operation origin. Defaults to `'user'`; the DockviewApi boundary
    // flips it to `'api'` for the duration of a programmatic call via
    // `withOrigin`. Nested operations inherit the outermost origin (tracked by
    // `_originDepth`, independent of mutation bracketing so it also covers
    // active-panel changes that are not structural mutations).
    private _origin: DockviewOrigin = 'user';
    private _originDepth = 0;
    private readonly _onWillMutateLayout =
        new Emitter<DockviewLayoutMutationEvent>();
    readonly onWillMutateLayout: Event<DockviewLayoutMutationEvent> =
        this._onWillMutateLayout.event;
    private readonly _onDidMutateLayout =
        new Emitter<DockviewLayoutMutationEvent>();
    readonly onDidMutateLayout: Event<DockviewLayoutMutationEvent> =
        this._onDidMutateLayout.event;

    private readonly _onWillShowOverlay =
        new Emitter<DockviewWillShowOverlayLocationEvent>();
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent> =
        this._onWillShowOverlay.event;

    private readonly _onUnhandledDragOver =
        new Emitter<DockviewDndOverlayEvent>();
    readonly onUnhandledDragOver: Event<DockviewDndOverlayEvent> =
        this._onUnhandledDragOver.event;

    private readonly _onDidRemovePanel = new Emitter<IDockviewPanel>();
    readonly onDidRemovePanel: Event<IDockviewPanel> =
        this._onDidRemovePanel.event;

    private readonly _onDidAddPanel = new Emitter<IDockviewPanel>();
    readonly onDidAddPanel: Event<IDockviewPanel> = this._onDidAddPanel.event;

    private readonly _onDidPopoutGroupSizeChange =
        new Emitter<PopoutGroupChangeSizeEvent>();
    readonly onDidPopoutGroupSizeChange: Event<PopoutGroupChangeSizeEvent> =
        this._onDidPopoutGroupSizeChange.event;

    private readonly _onDidPopoutGroupPositionChange =
        new Emitter<PopoutGroupChangePositionEvent>();
    readonly onDidPopoutGroupPositionChange: Event<PopoutGroupChangePositionEvent> =
        this._onDidPopoutGroupPositionChange.event;

    private readonly _onDidAddPopoutGroup = new Emitter<PopoutGroup>();
    readonly onDidAddPopoutGroup: Event<PopoutGroup> =
        this._onDidAddPopoutGroup.event;

    private readonly _onDidRemovePopoutGroup = new Emitter<PopoutGroup>();
    readonly onDidRemovePopoutGroup: Event<PopoutGroup> =
        this._onDidRemovePopoutGroup.event;

    private readonly _onDidChangePopouts = new Emitter<void>();
    /** Fires whenever a popout window opens or closes, i.e. the set of popout
     *  documents changed. Used by accessibility services that mirror per-window
     *  state (e.g. a live region in each popout). */
    readonly onDidChangePopouts: Event<void> = this._onDidChangePopouts.event;

    private readonly _onDidOpenPopoutWindowFail = new Emitter<void>();
    readonly onDidOpenPopoutWindowFail: Event<void> =
        this._onDidOpenPopoutWindowFail.event;

    private readonly _onDidStartFloatingGroupDrag =
        new Emitter<DockviewGroupPanel>();
    /** Fires with the dragged group when a floating group move-drag first moves.
     *  Consumed by the Smart Guides service (`ISmartGuidesHost`) to start each
     *  drag from a clean slate (a redock long-press aborts with no end event). */
    readonly onDidStartFloatingGroupDrag: Event<DockviewGroupPanel> =
        this._onDidStartFloatingGroupDrag.event;

    private readonly _onDidEndFloatingGroupDrag =
        new Emitter<DockviewGroupPanel>();
    /** Fires with the dragged group when a floating group's move/resize drag
     *  ends. Consumed by the Smart Guides service (`ISmartGuidesHost`) to tear
     *  down its per-drag guides. */
    readonly onDidEndFloatingGroupDrag: Event<DockviewGroupPanel> =
        this._onDidEndFloatingGroupDrag.event;

    private readonly _onDidLayoutFromJSON = new Emitter<void>();
    readonly onDidLayoutFromJSON: Event<void> = this._onDidLayoutFromJSON.event;

    private readonly _onDidActivePanelChange =
        new Emitter<DockviewActivePanelChangeEvent>({ replay: true });
    readonly onDidActivePanelChange: Event<DockviewActivePanelChangeEvent> =
        this._onDidActivePanelChange.event;

    private readonly _onDidPanelPinnedChange =
        new Emitter<DockviewPanelPinnedChangeEvent>();
    readonly onDidPanelPinnedChange: Event<DockviewPanelPinnedChangeEvent> =
        this._onDidPanelPinnedChange.event;

    private readonly _onDidMovePanel = new Emitter<MovePanelEvent>();
    readonly onDidMovePanel = this._onDidMovePanel.event;

    private readonly _onDidCreateTabGroup =
        new Emitter<DockviewTabGroupChangeEvent>();
    readonly onDidCreateTabGroup: Event<DockviewTabGroupChangeEvent> =
        this._onDidCreateTabGroup.event;

    private readonly _onDidDestroyTabGroup =
        new Emitter<DockviewTabGroupChangeEvent>();
    readonly onDidDestroyTabGroup: Event<DockviewTabGroupChangeEvent> =
        this._onDidDestroyTabGroup.event;

    private readonly _onDidAddPanelToTabGroup =
        new Emitter<DockviewTabGroupPanelChangeEvent>();
    readonly onDidAddPanelToTabGroup: Event<DockviewTabGroupPanelChangeEvent> =
        this._onDidAddPanelToTabGroup.event;

    private readonly _onDidRemovePanelFromTabGroup =
        new Emitter<DockviewTabGroupPanelChangeEvent>();
    readonly onDidRemovePanelFromTabGroup: Event<DockviewTabGroupPanelChangeEvent> =
        this._onDidRemovePanelFromTabGroup.event;

    private readonly _onDidTabGroupChange =
        new Emitter<DockviewTabGroupChangeEvent>();
    readonly onDidTabGroupChange: Event<DockviewTabGroupChangeEvent> =
        this._onDidTabGroupChange.event;

    private readonly _onDidTabGroupCollapsedChange =
        new Emitter<DockviewTabGroupCollapsedChangeEvent>();
    readonly onDidTabGroupCollapsedChange: Event<DockviewTabGroupCollapsedChangeEvent> =
        this._onDidTabGroupCollapsedChange.event;

    fireDidCreateTabGroup(event: DockviewTabGroupChangeEvent): void {
        this._onDidCreateTabGroup.fire(event);
    }

    fireDidDestroyTabGroup(event: DockviewTabGroupChangeEvent): void {
        this._onDidDestroyTabGroup.fire(event);
    }

    fireDidAddPanelToTabGroup(event: DockviewTabGroupPanelChangeEvent): void {
        this._onDidAddPanelToTabGroup.fire(event);
    }

    fireDidRemovePanelFromTabGroup(
        event: DockviewTabGroupPanelChangeEvent
    ): void {
        this._onDidRemovePanelFromTabGroup.fire(event);
    }

    fireDidTabGroupChange(event: DockviewTabGroupChangeEvent): void {
        this._onDidTabGroupChange.fire(event);
    }

    fireDidTabGroupCollapsedChange(
        event: DockviewTabGroupCollapsedChangeEvent
    ): void {
        this._onDidTabGroupCollapsedChange.fire(event);
    }

    private readonly _onDidMaximizedGroupChange =
        new Emitter<DockviewMaximizedGroupChangeEvent>();
    readonly onDidMaximizedGroupChange = this._onDidMaximizedGroupChange.event;

    private readonly _shellManager: ShellManager | undefined;
    private readonly _floatingOverlayHost: HTMLDivElement | undefined;
    private _inShellLayout = false;

    private readonly _onDidRemoveGroup = new Emitter<DockviewGroupPanel>();
    readonly onDidRemoveGroup: Event<DockviewGroupPanel> =
        this._onDidRemoveGroup.event;

    private readonly _onDidEdgeGroupAutoHideChange =
        new Emitter<DockviewGroupPanel>();
    readonly onDidEdgeGroupAutoHideChange: Event<DockviewGroupPanel> =
        this._onDidEdgeGroupAutoHideChange.event;

    protected readonly _onDidAddGroup = new Emitter<DockviewGroupPanel>();
    readonly onDidAddGroup: Event<DockviewGroupPanel> =
        this._onDidAddGroup.event;

    private readonly _onDidOptionsChange = new Emitter<void>();
    readonly onDidOptionsChange: Event<void> = this._onDidOptionsChange.event;

    private readonly _onDidActiveGroupChange = new Emitter<
        DockviewGroupPanel | undefined
    >();
    readonly onDidActiveGroupChange: Event<DockviewGroupPanel | undefined> =
        this._onDidActiveGroupChange.event;

    get orientation(): Orientation {
        return this.gridview.orientation;
    }

    get totalPanels(): number {
        return this.panels.length;
    }

    get panels(): IDockviewPanel[] {
        return this.groups.flatMap((group) => group.panels);
    }

    get options(): DockviewComponentOptions {
        return this._options;
    }

    get tabGroupColorPalette(): TabGroupColorPalette {
        return this._tabGroupColorPalette;
    }

    get activePanel(): IDockviewPanel | undefined {
        const activeGroup = this.activeGroup;

        if (!activeGroup) {
            return undefined;
        }

        return activeGroup.activePanel;
    }

    get renderer(): DockviewPanelRenderer {
        return this.options.defaultRenderer ?? 'onlyWhenVisible';
    }

    get defaultHeaderPosition(): DockviewHeaderPosition {
        return this.options.defaultHeaderPosition ?? 'top';
    }

    get api(): DockviewApi {
        return this._api;
    }

    get floatingGroups(): readonly DockviewFloatingGroupPanel[] {
        return (
            this._moduleRegistry?.services.floatingGroupService
                ?.floatingGroups ?? []
        );
    }

    /**
     * Resolve the floating window hosting `group`, matched by membership so it
     * finds nested (non-anchor) members too — a floating window can host a
     * whole nested gridview, not just its anchor group. Returns `undefined`
     * when the group isn't in any floating window. `floatingGroups` alone only
     * exposes each window's anchor, so consumers that must act on any member
     * (e.g. lifting an `always`-rendered panel's overlay above the window)
     * should use this instead of a `.find(f => f.group === group)`.
     */
    getFloatingWindowForGroup(
        group: DockviewGroupPanel
    ): DockviewFloatingGroupPanel | undefined {
        return this._floatingGroupService?.findByGroup(group);
    }

    /**
     * Boxes of the floating groups other than `exclude`, in coordinates
     * relative to the floating overlay container. Supplied to a
     * `transformFloatingGroupDrag` callback as `context.others` so it can
     * align the dragged float against its siblings.
     */
    private _gatherFloatingGroupBoxes(
        exclude: DockviewGroupPanel
    ): readonly Box[] {
        // Same geometry as the snap-together snapshot, minus the group identity.
        return this.getFloatingGroupSnapshots(exclude).map((s) => s.box);
    }

    /**
     * ISmartGuidesHost: the positioning parent floats are placed in, also the
     * coordinate space the Smart Guides overlay draws its alignment lines in.
     */
    getFloatingContainer(): HTMLElement {
        return this._floatingOverlayHost ?? this.gridview.element;
    }

    /** ISmartGuidesHost: the other floats' group identity + container-relative
     *  box, for the snap-together detector. */
    getFloatingGroupSnapshots(
        exclude: DockviewGroupPanel
    ): readonly { group: DockviewGroupPanel; box: Box }[] {
        const container = this.getFloatingContainer();
        const containerRect = container.getBoundingClientRect();
        return this.floatingGroups
            .filter((floating) => floating.group !== exclude)
            .map((floating) => {
                const rect = floating.overlay.element.getBoundingClientRect();
                return {
                    group: floating.group,
                    box: {
                        left: rect.left - containerRect.left,
                        top: rect.top - containerRect.top,
                        width: rect.width,
                        height: rect.height,
                    },
                };
            });
    }

    /** ISmartGuidesHost: dock/merge a dragged float into a target group via the
     *  existing move primitive (so events + undo cover it). */
    mergeFloatInto(
        dragged: DockviewGroupPanel,
        target: DockviewGroupPanel,
        position: Position
    ): void {
        // The target was captured at drag start; it may have been closed /
        // removed before the drop committed. Bail rather than move into a dead
        // group (a self-drop is also a no-op).
        if (dragged === target || !this.getPanel(target.id)) {
            return;
        }
        this.moveGroupOrPanel({
            from: { groupId: dragged.id },
            to: { group: target, position },
        });
    }

    /** ISmartGuidesHost: the main grid's splitter (sash) rectangles, in the
     *  floating container's coordinate space, for the optional splitter target. */
    getGridSplitterRects(): Box[] {
        const origin = this.getFloatingContainer().getBoundingClientRect();
        const result: Box[] = [];
        this.gridview.element.querySelectorAll('.dv-sash').forEach((sash) => {
            const r = sash.getBoundingClientRect();
            result.push({
                left: r.left - origin.left,
                top: r.top - origin.top,
                width: r.width,
                height: r.height,
            });
        });
        return result;
    }

    private get _smartGuidesService() {
        // Optional like every module service; `?.`-guarded everywhere so the
        // module can be removed without crashing the float drag loop.
        return this._moduleRegistry.services.smartGuidesService;
    }

    /** Whether Smart Guides snapping is currently active. */
    get smartGuidesEnabled(): boolean {
        return this._smartGuidesService?.enabled ?? false;
    }

    /** Toggle Smart Guides snapping at runtime (no-op if the module is absent). */
    setSmartGuidesEnabled(enabled: boolean): void {
        assertModule(
            this._smartGuidesService,
            'SmartGuides',
            'api.setSmartGuidesEnabled'
        )?.setEnabled(enabled);
    }

    /** Merge a partial Smart Guides option override in at runtime. */
    updateSmartGuidesOptions(options: Partial<SmartGuidesOptions>): void {
        assertModule(
            this._smartGuidesService,
            'SmartGuides',
            'api.updateSmartGuidesOptions'
        )?.updateOptions(options);
    }

    /** Fires when a dragged float commits an alignment snap on drop. */
    get onDidSnapFloat(): Event<SmartGuidesSnapEvent> {
        return this._smartGuidesService?.onDidSnapFloat ?? NO_EVENT;
    }

    /** Fires when a dragged float commits a dock/merge on drop. */
    get onDidSnapTogether(): Event<SmartGuidesSnapTogetherEvent> {
        return this._smartGuidesService?.onDidSnapTogether ?? NO_EVENT;
    }

    /**
     * Compose the float drag-position transform from the public
     * `transformFloatingGroupDrag` option and the optional Smart Guides module,
     * so an app and the module can both nudge a single drag rather than one
     * clobbering the other. Returns `undefined` only when the app option is
     * unset and the module is absent (the removability case); then no transform
     * is installed and the sibling-box snapshot is skipped, so the drag loop is
     * truly byte-for-byte unchanged. When the module is present but `smartGuides`
     * is unset it installs a cheap pass-through (the service snaps nothing and
     * early-returns), so observable drag behaviour is still unchanged.
     */
    private _buildFloatingDragTransform(
        anchorGroup: DockviewGroupPanel,
        disableSmartGuides: boolean
    ):
        | ((
              context: OverlayDragContext
          ) => { top: number; left: number } | void)
        | undefined {
        const publicTransform = this.options.transformFloatingGroupDrag;
        // Per-float opt-out: this window never consults the module.
        const useGuides = !disableSmartGuides;
        if (!publicTransform && !(useGuides && this._smartGuidesService)) {
            return undefined;
        }
        return (context) => {
            // 1. the app's transform runs first on the raw proposed box...
            const appResult = publicTransform?.({
                group: anchorGroup,
                proposed: context.proposed,
                container: context.container,
                others: context.others,
                modifiers: context.modifiers,
            });
            // 2. ...then the module snaps the (possibly) app-adjusted position,
            //    so its guides reflect the final on-screen alignment.
            const proposed = appResult
                ? { ...context.proposed, ...appResult }
                : context.proposed;
            const snapped = useGuides
                ? this._smartGuidesService?.transformFloatingGroupDrag({
                      group: anchorGroup,
                      proposed,
                      container: context.container,
                      others: context.others,
                      modifiers: context.modifiers,
                  })
                : undefined;
            return snapped ?? appResult ?? undefined;
        };
    }

    private get _floatingGroupService() {
        return this._moduleRegistry.services.floatingGroupService;
    }

    private get _popoutWindowService() {
        return this._moduleRegistry.services.popoutWindowService;
    }

    private get _watermarkService() {
        // Tier 1 module, optional. Callers must `?.`-guard so the module
        // can be removed from AllModules without crashing the component.
        return this._moduleRegistry.services.watermarkService;
    }

    private get _edgeGroupService() {
        return this._moduleRegistry.services.edgeGroupService;
    }

    private get _rootDropTargetService() {
        // Optional like every other module service; RootDropTargetModule can be
        // removed from the registered set without crashing the component.
        return this._moduleRegistry.services.rootDropTargetService;
    }

    private get _advancedDnDService() {
        // Optional; callers `?.`-guard so the module can be removed from
        // AllModules. When absent the onWill* hooks don't fire (≡ no
        // subscriber), which is invisible to apps not customising DnD.
        return this._moduleRegistry.services.advancedDnDService;
    }

    private get _dndCompassService() {
        return this._moduleRegistry.services.dndCompassService;
    }

    /** IDndCompassHost: whether a content drop at `position` on `group` is
     *  allowed, for compass cell gating (only legal cells are shown). The same
     *  predicate the content drop target uses, so the compass and the real drop
     *  agree. */
    canDropOnGroup(
        group: DockviewGroupPanel,
        position: Position,
        event: DragEvent | PointerEvent
    ): boolean {
        return group.model.canDisplayContentOverlay(event, position);
    }

    /** IDndCompassHost: the frame the content drop target measures (mirrors the
     *  `getOverlayOutline` rule in `content.ts`): the whole group when
     *  `dndPanelOverlay === 'group'`, else just the content. The compass paints
     *  in this frame so its cells align with where a drop resolves. */
    getDropOverlayElement(group: DockviewGroupPanel): HTMLElement | undefined {
        const content = group.element.querySelector<HTMLElement>(
            '.dv-content-container'
        );
        if (!content) {
            return undefined;
        }
        return this.options.theme?.dndPanelOverlay === 'group'
            ? (content.parentElement ?? content)
            : content;
    }

    /** IMultiRowTabsHost: the group's scrollable tab list (`.dv-tabs-container`),
     *  the element the wrap controller toggles + measures. */
    getTabsListElement(group: DockviewGroupPanel): HTMLElement | undefined {
        return group.model.header.hidden
            ? undefined
            : group.model.tabsListElement;
    }

    /** IMultiRowTabsHost: re-run a group's layout so a wrapped-header height
     *  change propagates to the content + active panel. */
    relayoutGroup(group: DockviewGroupPanel): void {
        group.relayout();
    }

    /** IMultiRowTabsHost: force the wrap controller's surplus set (rows beyond
     *  `overflow.maxRows`) into the group's overflow dropdown. */
    setForcedOverflow(
        group: DockviewGroupPanel,
        fn: (panelId: string) => boolean
    ): void {
        group.model.header.setForcedOverflow(fn);
    }

    /** IDndCompassHost: the layout root (`.dv-dockview`, a positioned element),
     *  the surface the outer-cell landing preview is drawn over. */
    getLayoutElement(): HTMLElement {
        return this.gridview.element;
    }

    /**
     * The drop-position resolver installed on the group content drop targets:
     * the app's `dropPositionResolver` option if set, else the DnD compass
     * module's compass resolver (undefined when the compass is disabled). Read
     * live by the content drop targets; undefined ⇒ default cursor-quadrant.
     */
    getDropPositionResolver(): PositionResolver | undefined {
        if (this.options.dropPositionResolver) {
            return this.options.dropPositionResolver;
        }
        const compass = this._dndCompassService?.resolver;
        const autoEdge = this._moduleRegistry.services.autoEdgeGroupService;
        // With both the compass and auto edge groups on, compose them: the true
        // outer edge reveals an edge group, everything else (inner split cells,
        // the compass's grid-edge outer ring) falls through to the compass, so
        // a drop can target either the layout edge or an edge group.
        if (compass && autoEdge) {
            return {
                resolve: (args) =>
                    autoEdge.resolveEdge(args) ?? compass.resolve(args),
            };
        }
        return compass ?? autoEdge?.resolver;
    }

    /**
     * Dock the dragged item against the whole-layout edge at `position` (the
     * orthogonalized root group), as the layout-edge drop zones do. Shared by
     * the root drop target and by an `edge`-flagged drop on a group content
     * target (a position resolver that marks an outer "dock to the layout edge"
     * cell). No-op when there is no active drag data.
     */
    dockToLayoutEdge(
        nativeEvent: DragEvent | PointerEvent,
        position: Position
    ): void {
        const willDropEvent = new DockviewWillDropEvent({
            nativeEvent,
            position,
            panel: undefined,
            api: this._api,
            group: undefined,
            getData: getPanelData,
            kind: 'edge',
        });

        this._onWillDrop.fire(willDropEvent);

        if (willDropEvent.defaultPrevented) {
            return;
        }

        const data = getPanelData();

        // No `dockToEdgeGroups` handling here: docking a dragged panel to an
        // edge is an AutoEdgeGroup (enterprise) feature, and that module owns
        // edge-drop routing entirely: it preempts its outer "dock as edge
        // group" band via `onWillDrop.preventDefault` above and lets the inner
        // "split the grid" band fall through to the move below. Without the
        // module a root-edge drop splits the grid, exactly as when the option
        // is unset; the option's only other effect, widening the activation
        // band, is gated on the same service (see rootDropTargetService).

        if (data) {
            this.moveGroupOrPanel({
                from: {
                    groupId: data.groupId,
                    panelId: data.panelId ?? undefined,
                },
                to: {
                    group: this.orthogonalize(position),
                    position: 'center',
                },
            });
        } else {
            this._onDidDrop.fire(
                new DockviewDidDropEvent({
                    nativeEvent,
                    position,
                    panel: undefined,
                    api: this._api,
                    group: undefined,
                    getData: getPanelData,
                })
            );
        }
    }

    get headerActionsService() {
        return this._moduleRegistry.services.headerActionsService;
    }

    private get _layoutHistoryService() {
        // Optional like every other module service; `?.`-guarded so the module
        // can be removed from AllModules without crashing the component.
        return this._moduleRegistry.services.layoutHistoryService;
    }

    /** Undo the previous recorded layout mutation (no-op if nothing to undo or
     *  the LayoutHistory module is absent). Requires `layoutHistory.enabled`. */
    undo(): void {
        assertModule(
            this._layoutHistoryService,
            'LayoutHistory',
            'api.undo'
        )?.undo();
    }

    /** Re-apply the next layout mutation (no-op if nothing to redo). */
    redo(): void {
        assertModule(
            this._layoutHistoryService,
            'LayoutHistory',
            'api.redo'
        )?.redo();
    }

    get canUndo(): boolean {
        return this._layoutHistoryService?.canUndo ?? false;
    }

    get canRedo(): boolean {
        return this._layoutHistoryService?.canRedo ?? false;
    }

    /** Drop both undo and redo stacks. */
    clearHistory(): void {
        this._layoutHistoryService?.clear();
    }

    get onDidChangeHistory(): Event<LayoutHistoryChangeEvent> {
        return (
            this._layoutHistoryService?.onDidChangeHistory ??
            NO_LAYOUT_HISTORY_CHANGES
        );
    }

    /**
     * Whether the two-band edge drag-reveal affordance is registered. See
     * {@link IRootDropTargetHost.hasEdgeDragReveal}; must not be read during
     * module initialisation, only from `init`/postConstruct onwards.
     */
    get hasEdgeDragReveal(): boolean {
        return !!this._moduleRegistry.services.autoEdgeGroupService;
    }

    isGridEmpty(): boolean {
        return this.gridview.length === 0;
    }

    rootDropTargetOverrideTarget() {
        return this.rootDropTargetContainer?.model;
    }

    dispatchUnhandledDragOver(
        nativeEvent: DragEvent | PointerEvent,
        position: Position
    ): boolean {
        const event = new DockviewUnhandledDragOverEvent(
            nativeEvent,
            'edge',
            position,
            getPanelData
        );
        this._onUnhandledDragOver.fire(event);
        return event.isAccepted;
    }

    // IAdvancedDnDHost: the emitters stay here so the public onWill* event
    // shape is unchanged; AdvancedDnDService routes the per-group fires
    // through these. Engine guards (e.g. disableDnd) run on the component
    // ahead of the dispatch.
    fireWillDragPanel(event: TabDragEvent): void {
        this._onWillDragPanel.fire(event);
    }

    fireWillDragGroup(event: GroupDragEvent): void {
        this._onWillDragGroup.fire(event);
    }

    fireWillDrop(event: DockviewWillDropEvent): void {
        this._onWillDrop.fire(event);
    }

    fireWillShowOverlay(event: DockviewWillShowOverlayLocationEvent): void {
        this._onWillShowOverlay.fire(event);
    }

    /**
     * Resolve the custom group drag ghost (via the AdvancedDnD module), or
     * `undefined` to fall back to the default chip. Returns `undefined` when
     * the module is absent, and the default ghost then renders.
     */
    buildGroupDragGhost(group: DockviewGroupPanel): IDragGhostSpec | undefined {
        return this._advancedDnDService?.buildGroupDragGhost(group);
    }

    /**
     * Resolve the app-supplied drop overlay model (via the AdvancedDnD module)
     * for a group drop target, or `undefined` to keep the target's default.
     */
    resolveDropOverlayModel(
        location: DockviewGroupDropLocation,
        group?: DockviewGroupPanel
    ): DroptargetOverlayModel | undefined {
        return this._advancedDnDService?.resolveOverlayModel(location, group);
    }

    // IKeyboardNavigationHost: keyboard docking reaches the AdvancedDnD preview +
    // LiveRegion announcer through these so the service stays decoupled.
    /** Outermost element: the shell (incl. edge groups) once built, else the gridview. */
    get rootElement(): HTMLElement {
        return this._shellManager?.element ?? this.element;
    }

    /**
     * Does this dock own `node`, in any of its windows? True when the node is
     * inside the main shell, or inside one of this component's popout documents.
     * A popout window hosts only this component's content, so whole-document
     * membership is sufficient there; the main document may hold sibling docks,
     * so it must be a containment check. A same-document popout (the jsdom mock)
     * is already covered by the main check and contributes nothing.
     */
    ownsElement(node: Node): boolean {
        if (this.rootElement.contains(node)) {
            return true;
        }
        const mainDoc = this.rootElement.ownerDocument;
        const doc = node.ownerDocument;
        if (!doc || doc === mainDoc) {
            return false;
        }
        return this.getPopoutWindows().some((win) => win.document === doc);
    }

    /**
     * The next / previous group in gridview (spatial) order, wrapping round.
     * The keyboard accessibility module's focus navigation is built on this
     * primitive, the only piece that needs the grid internals; the rest of
     * the navigation logic lives in the KeyboardNavigationService.
     */
    adjacentGroup(
        group: DockviewGroupPanel,
        reverse: boolean
    ): DockviewGroupPanel | undefined {
        // gridview traversal only covers grid groups; a floating/popout group
        // isn't in the grid, so there's no adjacent grid group to step to.
        if (group.api.location.type !== 'grid') {
            return undefined;
        }
        const location = getGridLocation(group.element);
        return <DockviewGroupPanel | undefined>(
            (reverse
                ? this.gridview.previous(location)
                : this.gridview.next(location)
            )?.view
        );
    }

    /**
     * The nearest grid group in a spatial direction from `group`, by
     * comparing group centre points. Floating and popout groups sit outside
     * the grid's geometry and are ignored. Returns `undefined` when there is
     * no group in that direction.
     */
    adjacentGroupInDirection(
        group: DockviewGroupPanel,
        direction: GroupNavigationDirection
    ): DockviewGroupPanel | undefined {
        if (group.api.location.type !== 'grid') {
            return undefined;
        }
        const from = group.element.getBoundingClientRect();
        const fromX = from.left + from.width / 2;
        const fromY = from.top + from.height / 2;

        let best: DockviewGroupPanel | undefined;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const candidate of this.groups) {
            if (candidate === group || candidate.api.location.type !== 'grid') {
                continue;
            }
            const rect = candidate.element.getBoundingClientRect();
            const dx = rect.left + rect.width / 2 - fromX;
            const dy = rect.top + rect.height / 2 - fromY;
            // Require the candidate to sit predominantly in the asked-for
            // direction (dominant axis), so 'left' ignores a group that's
            // mostly above/below.
            const inDirection =
                direction === 'left'
                    ? dx < 0 && Math.abs(dx) >= Math.abs(dy)
                    : direction === 'right'
                      ? dx > 0 && Math.abs(dx) >= Math.abs(dy)
                      : direction === 'up'
                        ? dy < 0 && Math.abs(dy) >= Math.abs(dx)
                        : dy > 0 && Math.abs(dy) >= Math.abs(dx);
            if (!inDirection) {
                continue;
            }
            const distance = dx * dx + dy * dy;
            if (distance < bestDistance) {
                bestDistance = distance;
                best = candidate;
            }
        }
        return best;
    }

    showDropPreview(
        group: DockviewGroupPanel,
        position: Position
    ): IDisposable {
        return (
            this._advancedDnDService?.showPreviewOverlay(group, position) ??
            Disposable.NONE
        );
    }

    announce(message: string): void {
        this._moduleRegistry.services.liveRegionService?.announce(message);
    }

    dockPanel(
        panel: IDockviewPanel,
        group: DockviewGroupPanel,
        position: Position
    ): void {
        this.moveGroupOrPanel({
            from: { groupId: panel.group.id, panelId: panel.id },
            to: { group, position },
        });
    }

    floatPanel(panel: IDockviewPanel): void {
        // The accessibility host surface speaks in the public `IDockviewPanel`;
        // the runtime instance is always a concrete `DockviewPanel`.
        this.addFloatingGroup(panel as DockviewPanel);
    }

    get contextMenuService(): IContextMenuService | undefined {
        // Owned by ContextMenuModule; undefined when the module is not
        // registered, so callers must `?.`-guard.
        return this._moduleRegistry.services.contextMenuService;
    }

    get pinnedTabsService(): IPinnedTabsService | undefined {
        // Owned by PinnedTabsModule; undefined when the module is not
        // registered, so callers must `?.`-guard.
        return this._moduleRegistry.services.pinnedTabsService;
    }

    get advancedOverflowService(): IAdvancedOverflowService | undefined {
        // Owned by AdvancedOverflowModule; undefined when the module is not
        // registered, so callers must `?.`-guard (the free flat overflow list
        // renders in that case).
        return this._moduleRegistry.services.advancedOverflowService;
    }

    /**
     * Pin/unpin a panel's tab. The single gated entry point behind
     * `panel.api.setPinned`. Dormant unless `pinnedTabs.enabled` is set (a
     * silent no-op), and a silent no-op when the PinnedTabs module is not
     * registered: reaching past the `enabled` check means the option was set,
     * so the option rule has already named the missing module. When active it
     * mutates the panel's pinned flag (which fires
     * `panel.api.onDidChangePinned`) and the component-level
     * `onDidPanelPinnedChange`; the module reacts to enforce pinned-first
     * ordering.
     */
    setPanelPinned(panel: DockviewPanel, pinned: boolean): void {
        if (panel.isPinned === pinned) {
            return;
        }

        if (!this.options.pinnedTabs?.enabled) {
            // Feature dormant; pinning is opt-in via `pinnedTabs.enabled`.
            return;
        }

        // Not routed through assertModule: reaching here means
        // `pinnedTabs.enabled` is set, so the option rule in optionsModules.ts
        // has already reported the missing module at construction (or at the
        // updateOptions that enabled it). Warning again here would report the
        // same module twice for one mistake.
        const service = this.pinnedTabsService;
        if (!service) {
            return;
        }

        panel.setPinned(pinned);
        this._onDidPanelPinnedChange.fire({ panel, isPinned: pinned });
    }

    get mountElement(): HTMLElement {
        return this.gridview.element;
    }

    hasVisibleGridGroup(): boolean {
        return this.groups.some(
            (group) => group.api.location.type === 'grid' && group.api.isVisible
        );
    }

    fireLayoutChange(): void {
        this._bufferOnDidLayoutChange.fire();
    }

    /**
     * Promise that resolves when all popout groups from the last fromJSON call are restored.
     * Useful for tests that need to wait for delayed popout creation.
     */
    get popoutRestorationPromise(): Promise<void> {
        return (
            this._popoutWindowService?.restorationPromise ?? Promise.resolve()
        );
    }

    constructor(container: HTMLElement, options: DockviewComponentOptions) {
        super(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            styles: options.hideBorders
                ? { separatorBorder: 'transparent' }
                : undefined,
            disableAutoResizing: options.disableAutoResizing,
            locked: options.locked,
            margin: options.theme?.gap ?? 0,
            className: options.className,
        });

        this._options = options;
        this._tabGroupColorPalette = buildTabGroupColorPalette(options);

        // Internal seam: defaults to the full set, but tests can supply a
        // subset to assert every module is independently removable (and the
        // opt-in module API will build on this later). Not part of the public
        // options surface.
        const explicitModules = (options as { modules?: DockviewModule<any>[] })
            .modules;
        const modules = explicitModules ?? [
            ...AllModules,
            ...getRegisteredModules(),
        ];
        for (const module of modules) {
            this._moduleRegistry.register(module);
        }
        this._moduleRegistry.initialize(this);

        this.reportMissingOptionModules(options);

        // Surface popout removal symmetrically with `onDidAddPopoutGroup`. The
        // service is the single point every removal path funnels through, both
        // a genuine window close and an explicit removal, and it suppresses
        // the event during component teardown.
        const popoutWindowService = this._popoutWindowService;
        if (popoutWindowService) {
            this.addDisposables(
                popoutWindowService.onDidRemove((entry) => {
                    this._onDidRemovePopoutGroup.fire({
                        id: entry.popoutGroup.id,
                        group: entry.popoutGroup,
                        window: entry.getWindow(),
                    });
                })
            );
        }

        this.popupService = new PopupService(this.element);
        this._api = new DockviewApi(this);

        // The shell always wraps the dockview element so edge groups can be
        // added at any time via addEdgeGroup() without re-parenting the DOM.
        this.disableResizing = true;
        this.element.remove();

        this._shellManager = new ShellManager(
            container,
            this.element,
            (w, h) => this._layoutFromShell(w, h),
            options.theme?.gap ?? 0,
            options.theme?.edgeGroupCollapsedSize
        );
        // The shell wraps the dockview element, so move the popup anchor
        // into the shell so overflow dropdowns in edge groups position correctly
        this.popupService.updateRoot(this._shellManager.element);
        this._shellThemeClassnames = new Classnames(this._shellManager.element);

        // Anchor the overlay container to the shell element so that edge groups
        // (which live outside this.element in the shell layout) are covered when
        // dndOverlayMounting is 'absolute'.
        this.rootDropTargetContainer = new DropTargetAnchorContainer(
            this._shellManager.element,
            { disabled: true }
        );
        // Floating groups always anchor their drop overlays at the shell level
        // (see the field docs): in-place overlays would be trapped beneath the
        // floating panel's render overlay, so this container stays enabled
        // regardless of the `dndOverlayMounting` mode.
        this.floatingDropTargetContainer = new DropTargetAnchorContainer(
            this._shellManager.element,
            { disabled: false }
        );
        this.overlayRenderContainer = new OverlayRenderContainer(
            this._shellManager.element,
            this
        );

        // Hosted in the shell (not inside `.dv-dockview`) so floating overlays
        // share a stacking context with `dv-render-overlay` panels; sized to
        // mirror the gridview rect so saved positions remain valid.
        this._floatingOverlayHost = document.createElement('div');
        this._floatingOverlayHost.className = 'dv-floating-overlay-host';
        this._shellManager.element.appendChild(this._floatingOverlayHost);

        toggleClass(this.gridview.element, 'dv-dockview', true);
        toggleClass(this.element, 'dv-debug', !!options.debug);

        this.updateTheme();

        if (options.debug) {
            this.addDisposables(new StrictEventsSequencing(this));
        }

        this.addDisposables(
            this.rootDropTargetContainer,
            this.floatingDropTargetContainer,
            // Safety net for a stale anchored drop overlay after an HTML5 drag.
            // `dragend` fires only on the drag *source* element, and each drop
            // target clears only its own group's container. When a drag shows an
            // overlay in one shell-level container but ends via a source bound to
            // a different one — e.g. dragging a grid tab (whose disabled root
            // container renders in-place) over a floating group's tab (anchored
            // in `floatingDropTargetContainer`), then releasing over the grid —
            // nothing clears the first container and its overlay lingers.
            // `dragend` fires at the end of every HTML5 drag (drop or cancel),
            // so clearing both shell containers here guarantees no overlay
            // survives the drag. The pointer backend clears on drag-leave already
            // and doesn't emit `dragend`, so this is HTML5-only by construction.
            addDisposableListener(
                this._shellManager.element,
                'dragend',
                () => {
                    this.rootDropTargetContainer.model?.clear();
                    this.floatingDropTargetContainer.model?.clear();
                },
                true
            ),
            this.overlayRenderContainer,
            this._onWillDragPanel,
            this._onWillDragGroup,
            this._onWillShowOverlay,
            this._onDidActivePanelChange,
            this._onDidPanelPinnedChange,
            this._onDidAddPanel,
            this._onDidRemovePanel,
            this._onDidLayoutFromJSON,
            this._onDidDrop,
            this._onWillDrop,
            this._onWillMutateLayout,
            this._onDidMutateLayout,
            this._onDidMovePanel,
            this._onDidMovePanel.event(() => {
                /**
                 * Update overlay positions after DOM layout completes to prevent 0×0 dimensions.
                 * With defaultRenderer="always" this results in panel content not showing after move operations.
                 * Debounced to avoid multiple calls when moving groups with multiple panels.
                 */
                this.debouncedUpdateAllPositions();
            }),
            this._onDidAddGroup,
            this._onDidRemoveGroup,
            this._onDidEdgeGroupAutoHideChange,
            this._onDidActiveGroupChange,
            this._onUnhandledDragOver,
            this._onDidMaximizedGroupChange,
            this._onDidPopoutGroupSizeChange,
            this._onDidPopoutGroupPositionChange,
            this._onDidAddPopoutGroup,
            this._onDidRemovePopoutGroup,
            this._onDidChangePopouts,
            // Coalesce popout add/remove into a single "the popout set changed"
            // signal for per-window accessibility state.
            this._onDidAddPopoutGroup.event(() =>
                this._onDidChangePopouts.fire()
            ),
            this._onDidRemovePopoutGroup.event(() =>
                this._onDidChangePopouts.fire()
            ),
            this._onDidOpenPopoutWindowFail,
            this._onDidStartFloatingGroupDrag,
            this._onDidEndFloatingGroupDrag,
            this._onDidCreateTabGroup,
            this._onDidDestroyTabGroup,
            this._onDidAddPanelToTabGroup,
            this._onDidRemovePanelFromTabGroup,
            this._onDidTabGroupChange,
            this._onDidTabGroupCollapsedChange,
            Event.any<unknown>(
                this.onDidPopoutGroupSizeChange,
                this.onDidPopoutGroupPositionChange,
                this.onDidCreateTabGroup,
                this.onDidDestroyTabGroup,
                this.onDidAddPanelToTabGroup,
                this.onDidRemovePanelFromTabGroup,
                this.onDidTabGroupChange,
                this.onDidTabGroupCollapsedChange
            )(() => {
                // Popout size/position and tab-group mutations persist as layout changes.
                this.fireLayoutChange();
            }),
            this._onDidOptionsChange,
            this.onDidAdd((event) => {
                if (!this._moving) {
                    this._onDidAddGroup.fire(event);
                }
            }),
            this.onDidRemove((event) => {
                if (!this._moving) {
                    this._onDidRemoveGroup.fire(event);
                }
            }),
            this.onDidActiveChange((event) => {
                if (!this._moving) {
                    this._onDidActiveGroupChange.fire(event);
                }
            }),
            this.onDidMaximizedChange((event) => {
                this._onDidMaximizedGroupChange.fire({
                    group: event.panel,
                    isMaximized: event.isMaximized,
                });
            }),
            Event.any<unknown>(
                this.onDidAddPanel,
                this.onDidRemovePanel,
                this.onDidAddGroup,
                this.onDidRemove,
                this.onDidRemoveGroup,
                this.onDidMovePanel,
                this.onDidActivePanelChange
            )(() => {
                this._bufferOnDidLayoutChange.fire();
            }),
            Disposable.from(() => {
                // Registry disposes init() subscriptions then every module
                // service that implements IDisposable. The order matters so
                // init handlers stop firing into services about to be torn
                // down. Includes popout-restoration timer cancellation that
                // resolves promises so awaiters of popoutRestorationPromise
                // don't hang. See issue #851.
                this._moduleRegistry.dispose();
                this._shellManager?.dispose();
            })
        );

        // Root edge-drop wiring lives with its (optional) module; guard it so
        // the module is independently removable.
        const rootDropTarget = this._rootDropTargetService;
        if (rootDropTarget) {
            this.addDisposables(
                rootDropTarget.onWillShowOverlay((event) => {
                    if (
                        this.gridview.length > 0 &&
                        event.position === 'center'
                    ) {
                        // option only available when no panels in primary grid
                        return;
                    }

                    this._onWillShowOverlay.fire(
                        new DockviewWillShowOverlayLocationEvent(event, {
                            kind: 'edge',
                            panel: undefined,
                            api: this._api,
                            group: undefined,
                            getData: getPanelData,
                        })
                    );
                }),
                rootDropTarget.onDrop((event) =>
                    this.dockToLayoutEdge(event.nativeEvent, event.position)
                )
            );
        }

        // Final module wiring: runs after the host is fully constructed.
        // Modules subscribe to host events here so the component doesn't
        // need to manually invoke them at scattered call sites.
        this._moduleRegistry.postConstruct(this);
    }

    override setVisible(panel: DockviewGroupPanel, visible: boolean): void {
        switch (panel.api.location.type) {
            case 'grid':
                super.setVisible(panel, visible);
                break;
            case 'floating': {
                const item = this.floatingGroups.find(
                    (floatingGroup) => floatingGroup.group === panel
                );

                if (item) {
                    item.overlay.setVisible(visible);
                    panel.api._onDidVisibilityChange.fire({
                        isVisible: visible,
                    });
                }
                break;
            }
            case 'popout':
                console.warn(
                    'dockview: You cannot hide a group that is in a popout window'
                );
                break;
            case 'edge':
                // Edge group visibility is managed via setEdgeGroupVisible
                break;
        }
    }

    /**
     * Returns the {@link PopupService} that should host popovers (context
     * menus, tab overflow menus) for the given group. Popout groups have their
     * own service rooted in their popout window so the popover renders there
     * and dismisses on events from that window.
     */
    getPopupServiceForGroup(group: DockviewGroupPanel): PopupService {
        // Resolve by window membership (DOM containment), not the anchor id, so
        // every group in a multi-group popout (anchor or not, original or
        // promoted after the anchor left) uses that window's popup service
        // rather than falling back to the main window.
        return (
            this._popoutWindowService?.findByGroup(group)?.popupService ??
            this.popupService
        );
    }

    addPopoutGroup(
        itemToPopout: DockviewPanel | DockviewGroupPanel,
        options?: DockviewPopoutGroupOptionsInternal
    ): Promise<boolean> {
        // The transaction brackets the synchronous structural change; the
        // popout window opens asynchronously after it resolves.
        return this.mutation('popout', () =>
            this._doAddPopoutGroup(itemToPopout, options)
        );
    }

    /** Enumerate the popout groups currently open in their own windows. */
    getPopouts(): PopoutGroup[] {
        return (
            this._popoutWindowService?.entries.map((entry) => ({
                id: entry.popoutGroup.id,
                group: entry.popoutGroup,
                window: entry.getWindow(),
            })) ?? []
        );
    }

    /** The live popout `Window` handles, one per open popout group. The
     *  narrow surface accessibility services need to mirror per-window state. */
    getPopoutWindows(): Window[] {
        return this.getPopouts().map((popout) => popout.window);
    }

    private _doAddPopoutGroup(
        itemToPopout: DockviewPanel | DockviewGroupPanel,
        options?: DockviewPopoutGroupOptionsInternal
    ): Promise<boolean> {
        const service = assertModule(
            this._popoutWindowService,
            'PopoutWindow',
            'api.addPopoutGroup'
        );
        if (!service) {
            return Promise.resolve(false);
        }

        if (
            itemToPopout instanceof DockviewGroupPanel &&
            itemToPopout.model.location.type === 'edge'
        ) {
            // edge groups are permanent structural elements and cannot be popped out
            return Promise.resolve(false);
        }

        if (
            itemToPopout instanceof DockviewPanel &&
            itemToPopout.group.size === 1
        ) {
            return this.addPopoutGroup(itemToPopout.group, options);
        }

        const theme = getDockviewTheme(this.gridview.element);
        const element = this.element;

        // Always returns absolute *screen* coordinates. A caller-supplied /
        // restored `position` is already in screen space; it originates from
        // PopoutWindow.dimensions() (screenX/screenY). A fresh popout is
        // positioned from the source element's viewport-relative rect, so it
        // is offset here by the opener window's own screen position. Doing the
        // normalisation in one place keeps the window construction below
        // coordinate-space agnostic, and avoids double-offsetting a restored
        // popout when the opener sits on a non-primary monitor (screenX/Y != 0).
        function getBox(): Box {
            if (options?.position) {
                return options.position;
            }

            const sourceElement =
                itemToPopout instanceof DockviewGroupPanel
                    ? itemToPopout.element
                    : (itemToPopout.group?.element ?? element);

            const rect = sourceElement.getBoundingClientRect();

            return {
                left: window.screenX + rect.left,
                top: window.screenY + rect.top,
                width: rect.width,
                height: rect.height,
            };
        }

        const box: Box = getBox();

        const groupId =
            options?.overridePopoutGroup?.id ?? this.getNextGroupId();

        // Resolve the configured popout URL once (per-call override → global
        // option). Recorded on the entry / group locations so it survives
        // serialization; the '/popout.html' default is applied only when
        // actually opening the window, not baked into saved layouts.
        const resolvedPopoutUrl = options?.popoutUrl ?? this.options?.popoutUrl;

        const _window = new PopoutWindow(
            `${this.id}-${groupId}`, // unique id
            theme ?? '',
            {
                url: resolvedPopoutUrl ?? '/popout.html',
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
                onDidOpen: options?.onDidOpen,
                onWillClose: options?.onWillClose,
                nonce: this.options?.nonce,
            }
        );

        const popoutWindowDisposable = new CompositeDisposable(
            _window,
            _window.onDidClose(() => {
                popoutWindowDisposable.dispose();
            })
        );

        return _window
            .open()
            .then((popoutContainer) => {
                if (_window.isDisposed) {
                    return false;
                }

                const referenceGroup =
                    options?.referenceGroup ??
                    (itemToPopout instanceof DockviewPanel
                        ? itemToPopout.group
                        : itemToPopout);

                const referenceLocation = itemToPopout.api.location.type;

                /**
                 * The group that is being added doesn't already exist within the DOM, the most likely occurrence
                 * of this case is when being called from the `fromJSON(...)` method
                 */
                const isGroupAddedToDom =
                    referenceGroup.element.parentElement !== null;

                let group: DockviewGroupPanel;

                if (options?.overridePopoutGridview) {
                    // Restoring a multi-group window: the anchor group is
                    // already built inside the supplied gridview.
                    group = options.overridePopoutGroup ?? referenceGroup;
                } else if (!isGroupAddedToDom) {
                    group = referenceGroup;
                } else if (options?.overridePopoutGroup) {
                    group = options.overridePopoutGroup;
                } else {
                    group = this.createGroup({ id: groupId });

                    if (popoutContainer) {
                        this._onDidAddGroup.fire(group);
                    }
                }

                if (popoutContainer === null) {
                    this.handleBlockedPopout({
                        group,
                        referenceGroup,
                        options,
                        popoutWindowDisposable,
                    });
                    return false;
                }

                const gready = document.createElement('div');
                gready.className = 'dv-overlay-render-container';

                const overlayRenderContainer = new OverlayRenderContainer(
                    gready,
                    this
                );

                group.model.renderContainer = overlayRenderContainer;

                // The popout window hosts its own gridview so it can grow into
                // a nested splitview layout. The window starts with the single
                // anchor group; further groups arrive via drag-and-drop. On
                // restore a pre-populated gridview is supplied instead.
                const popoutGridview =
                    options?.overridePopoutGridview ??
                    this.createNestedGridview();
                if (!options?.overridePopoutGridview) {
                    popoutGridview.addView(group, Sizing.Distribute, [0]);
                }
                // Fill the popout window. Unlike the main grid (explicit px) and
                // floating windows (CSS inside .dv-resize-container), the popout
                // gridview has no sizing context, so without this it collapses
                // to 0 height and nothing renders.
                popoutGridview.element.style.width = '100%';
                popoutGridview.element.style.height = '100%';
                popoutGridview.layout(
                    _window.window!.innerWidth,
                    _window.window!.innerHeight
                );

                // Guarded so the teardown's re-entrant paths (window close
                // re-enters via the anchor's doRemoveGroup) never double-dispose.
                let popoutGridviewDisposed = false;
                const disposePopoutGridview = () => {
                    if (!popoutGridviewDisposed) {
                        popoutGridviewDisposed = true;
                        popoutGridview.dispose();
                    }
                };

                let floatingBox: AnchoredBox | undefined;

                if (
                    !options?.overridePopoutGroup &&
                    !options?.overridePopoutGridview &&
                    isGroupAddedToDom
                ) {
                    if (itemToPopout instanceof DockviewPanel) {
                        this.movingLock(() => {
                            const panel =
                                referenceGroup.model.removePanel(itemToPopout);
                            group.model.openPanel(panel);
                        });
                    } else {
                        this.movingLock(() =>
                            moveGroupWithoutDestroying({
                                from: referenceGroup,
                                to: group,
                            })
                        );

                        switch (referenceLocation) {
                            case 'grid':
                                referenceGroup.api.setVisible(false);
                                break;
                            case 'floating':
                            case 'popout':
                                floatingBox = this.floatingGroups
                                    .find(
                                        (value) =>
                                            value.group.api.id ===
                                            itemToPopout.api.id
                                    )
                                    ?.overlay.toJSON();

                                this.removeGroup(referenceGroup);

                                break;
                        }
                    }
                }

                popoutContainer.classList.add('dv-dockview');
                popoutContainer.style.overflow = 'hidden';
                popoutContainer.appendChild(gready);

                popoutContainer.appendChild(popoutGridview.element);

                const anchor = document.createElement('div');
                const dropTargetContainer = new DropTargetAnchorContainer(
                    anchor,
                    { disabled: this.rootDropTargetContainer.disabled }
                );
                popoutContainer.appendChild(anchor);

                group.model.dropTargetContainer = dropTargetContainer;

                // Each popout window needs its own popover service so that
                // tab context menus, chip menus, and tab overflow menus
                // render in the popout window (not the main window) and
                // their pointerdown/keydown listeners fire on the right
                // window for outside-click and Escape dismissal. It is stored
                // on the entry below and resolved per-member via
                // `findByGroup`, so it is shared by every group in the window.
                const popoutPopupService = new PopupService(
                    popoutContainer,
                    _window.window!
                );
                popoutWindowDisposable.addDisposables(popoutPopupService);

                group.model.location = {
                    type: 'popout',
                    getWindow: () => _window.window!,
                    popoutUrl: resolvedPopoutUrl,
                };

                if (options?.overridePopoutGridview) {
                    // Restored multi-group window. Wire every member (including
                    // the anchor) to this window's containers and popout
                    // location now that the gridview is attached and laid out.
                    // Re-setting renderContainer forces a re-render at the right
                    // time so 'always'-rendered content positions in this
                    // window rather than where it was first created.
                    const members = this.groups.filter((candidate) =>
                        popoutGridview.element.contains(candidate.element)
                    );
                    for (const member of members) {
                        member.model.renderContainer = overlayRenderContainer;
                        member.model.dropTargetContainer = dropTargetContainer;
                        member.model.location = {
                            type: 'popout',
                            getWindow: () => _window.window!,
                            popoutUrl: resolvedPopoutUrl,
                        };
                    }
                }

                if (
                    isGroupAddedToDom &&
                    itemToPopout.api.location.type === 'grid'
                ) {
                    itemToPopout.api.setVisible(false);
                }

                this.doSetGroupAndPanelActive(group);

                const resizeObserverDisposable = service.observeGridviewSize(
                    _window,
                    popoutGridview,
                    overlayRenderContainer
                );
                if (resizeObserverDisposable) {
                    popoutWindowDisposable.addDisposables(
                        resizeObserverDisposable
                    );
                }

                // Focus routing follows the window's *current* anchor group.
                // Hold it in a mutable disposable so it can be rebound to a new
                // anchor when the original is dragged out of a multi-group
                // popout (see `setAnchorGroup` on the entry below).
                const focusRoutingDisposable = new MutableDisposable();
                popoutWindowDisposable.addDisposables(focusRoutingDisposable);
                const bindFocusRouting = (anchor: DockviewGroupPanel): void => {
                    focusRoutingDisposable.value = new CompositeDisposable(
                        anchor.api.onDidActiveChange((event) => {
                            if (event.isActive) {
                                _window.window?.focus();
                            }
                        }),
                        anchor.api.onWillFocus(() => {
                            _window.window?.focus();
                        })
                    );
                };
                bindFocusRouting(group);

                // Holder so the close teardown (extracted below) can publish
                // the group that was returned to the main grid back to the
                // entry's `dispose()` contract.
                const closeResult: { returnedGroup?: DockviewGroupPanel } = {};

                const isValidReferenceGroup =
                    isGroupAddedToDom &&
                    referenceGroup &&
                    this.getPanel(referenceGroup.id);

                const value: PopoutGroupEntry = {
                    window: _window,
                    popoutGroup: group,
                    gridview: popoutGridview,
                    overlayRenderContainer,
                    dropTargetContainer,
                    getWindow: () => _window.window!,
                    popoutUrl: resolvedPopoutUrl,
                    referenceGroup: isValidReferenceGroup
                        ? referenceGroup.id
                        : undefined,
                    popupService: popoutPopupService,
                    setAnchorGroup: (newAnchor: DockviewGroupPanel) => {
                        value.popoutGroup = newAnchor;
                        // Size/position events read `value.popoutGroup` live, so
                        // only the focus subscription needs re-binding here.
                        bindFocusRouting(newAnchor);
                    },
                    disposable: {
                        dispose: () => {
                            popoutWindowDisposable.dispose();
                            return closeResult.returnedGroup;
                        },
                    },
                };

                const _onDidWindowPositionChange = onDidWindowMoveEnd(
                    _window.window!
                );

                popoutWindowDisposable.addDisposables(
                    _onDidWindowPositionChange,
                    onDidWindowResizeEnd(_window.window!, () => {
                        this._onDidPopoutGroupSizeChange.fire({
                            width: _window.window!.innerWidth,
                            height: _window.window!.innerHeight,
                            // the window's current anchor, which may have been
                            // reassigned after the original anchor left
                            group: value.popoutGroup,
                        });
                    }),
                    _onDidWindowPositionChange.event(() => {
                        this._onDidPopoutGroupPositionChange.fire({
                            screenX: _window.window!.screenX,
                            screenY: _window.window!.screenY,
                            group: value.popoutGroup,
                        });
                    }),
                    addDisposableListener(_window.window!, 'resize', () => {
                        popoutGridview.layout(
                            _window.window!.innerWidth,
                            _window.window!.innerHeight
                        );
                    }),
                    overlayRenderContainer,
                    Disposable.from(() =>
                        this.disposePopoutWindow({
                            group,
                            referenceGroup,
                            popoutGridview,
                            isGroupAddedToDom,
                            floatingBox,
                            disposePopoutGridview,
                            closeResult,
                        })
                    )
                );

                service.add(value);

                this._onDidAddPopoutGroup.fire({
                    id: value.popoutGroup.id,
                    group: value.popoutGroup,
                    window: value.getWindow(),
                });

                return true;
            })
            .catch((err) => {
                console.error('dockview: failed to create popout.', err);
                return false;
            });
    }

    /**
     * The popout window was blocked (e.g. by the browser's popup blocker,
     * common when restoring popouts on load). Fall back gracefully so the
     * group(s) end up valid and visible in the main grid rather than as
     * orphans that later crash clear()/remove().
     */
    private handleBlockedPopout(params: {
        group: DockviewGroupPanel;
        referenceGroup: DockviewGroupPanel;
        options?: DockviewPopoutGroupOptionsInternal;
        popoutWindowDisposable: CompositeDisposable;
    }): void {
        const { group, referenceGroup, options, popoutWindowDisposable } =
            params;

        console.error(
            'dockview: failed to create popout. perhaps you need to allow pop-ups for this website'
        );

        popoutWindowDisposable.dispose();
        this._onDidOpenPopoutWindowFail.fire();

        if (options?.overridePopoutGridview) {
            // Restoring a multi-group popout window: its nested gridview was
            // built up-front but never attached to a window. Dock every member
            // into the main grid so no group is lost, then discard the
            // detached gridview.
            const blockedGridview = options.overridePopoutGridview;
            const members = this.groups.filter((candidate) =>
                blockedGridview.element.contains(candidate.element)
            );
            for (const member of members) {
                this.movingLock(() => {
                    blockedGridview.remove(member);
                    this.redockGroupToMainGrid(member);
                });
            }
            blockedGridview.dispose();

            if (referenceGroup && !referenceGroup.api.isVisible) {
                referenceGroup.api.setVisible(true);
            }

            return;
        }

        if (group === referenceGroup) {
            // No separate grid group to return to (e.g. restoring a popout
            // straight from JSON), so dock this group into the main grid.
            if (!this.gridview.element.contains(group.element)) {
                this.movingLock(() => this.doAddGroup(group, [0]));
                group.model.location = { type: 'grid' };
            }
        } else {
            // A fresh group was created for the popout, so return its panels to
            // the reference group and discard the now-empty popout group so it
            // doesn't linger as an orphan.
            this.movingLock(() =>
                moveGroupWithoutDestroying({
                    from: group,
                    to: referenceGroup,
                })
            );

            if (group.model.size === 0 && this._groups.has(group.id)) {
                group.dispose();
                this._groups.delete(group.id);
                this._onDidRemoveGroup.fire(group);
            }
        }

        if (!referenceGroup.api.isVisible) {
            referenceGroup.api.setVisible(true);
        }
    }

    /**
     * Wire a group that has been displaced from a floating / popout window back
     * to the main grid's render & drop-target containers and dock it at the
     * root. The caller is responsible for first detaching it from its old
     * gridview; the detach strategy differs between the window-teardown path
     * (`doRemoveGroup`) and the blocked-window path (`gridview.remove`).
     */
    private redockGroupToMainGrid(group: DockviewGroupPanel): void {
        group.model.renderContainer = this.overlayRenderContainer;
        group.model.dropTargetContainer = this.rootDropTargetContainer;
        group.model.location = { type: 'grid' };
        this.doAddGroup(group, [0]);
    }

    /**
     * Teardown for a popout window's `popoutWindowDisposable`. Runs when the
     * window closes (by user, by `removeGroup`, or by component disposal):
     * relocates every member group back to the main grid (or to a floating
     * window when the anchor came from one), then disposes the nested gridview.
     * `closeResult.returnedGroup` is read by the entry's `dispose()` contract.
     */
    private disposePopoutWindow(params: {
        group: DockviewGroupPanel;
        referenceGroup: DockviewGroupPanel;
        popoutGridview: Gridview;
        isGroupAddedToDom: boolean;
        floatingBox: AnchoredBox | undefined;
        disposePopoutGridview: () => void;
        closeResult: { returnedGroup?: DockviewGroupPanel };
    }): void {
        const {
            group,
            referenceGroup,
            popoutGridview,
            isGroupAddedToDom,
            floatingBox,
            disposePopoutGridview,
            closeResult,
        } = params;

        if (this.isDisposed) {
            // cleanup may run after instance is disposed; just tear down the
            // nested gridview.
            disposePopoutGridview();
            return;
        }

        // Distinguish a genuine window close from an explicit `removeGroup`:
        // the explicit-removal paths remove the service entry *before* this
        // disposable runs. Key off the stable `popoutGridview` rather than the
        // captured `group`, which may no longer be the window's anchor (it can
        // have been dragged out, promoting another member to anchor).
        const genuineClose = !!this._popoutWindowService?.entries.find(
            (entry) => entry.gridview === popoutGridview
        );

        // The groups still living in this window, resolved from the gridview so
        // a reassigned anchor doesn't hide surviving members.
        const members = this.groups.filter((candidate) =>
            popoutGridview.element.contains(candidate.element)
        );
        const anchorPresent = members.includes(group);
        const anchorIsSoleMember = anchorPresent && members.length === 1;

        // On a genuine close, relocate every member that ISN'T the captured
        // anchor back to the main grid. The captured anchor (if still here) gets
        // the reference-return / re-float treatment below. Explicit removal
        // relocates via its own path, so the loop is skipped for it.
        if (genuineClose) {
            for (const member of members) {
                if (member === group) {
                    continue;
                }
                this.movingLock(() => {
                    this.doRemoveGroup(member, {
                        skipDispose: true,
                        skipActive: true,
                        skipPopoutReturn: true,
                    });
                    this.redockGroupToMainGrid(member);
                });
            }
        }

        if (
            anchorPresent &&
            isGroupAddedToDom &&
            this.getPanel(referenceGroup.id)
        ) {
            this.movingLock(() =>
                moveGroupWithoutDestroying({
                    from: group,
                    to: referenceGroup,
                })
            );

            if (!referenceGroup.api.isVisible) {
                referenceGroup.api.setVisible(true);
            }

            if (this.getPanel(group.id)) {
                this.doRemoveGroup(group, {
                    skipPopoutAssociated: true,
                });
            }
        } else if (anchorPresent && this.getPanel(group.id)) {
            group.model.renderContainer = this.overlayRenderContainer;
            group.model.dropTargetContainer = this.rootDropTargetContainer;
            closeResult.returnedGroup = group;

            if (!genuineClose) {
                /**
                 * If this popout group was explicitly removed then we shouldn't run the additional
                 * steps. The explicit remover re-docks the returned group itself; here we only hand
                 * it back (above) and tear down the nested gridview.
                 */
                disposePopoutGridview();
                return;
            }

            // Re-float only restores the pre-popout state of a SINGLE popped-out
            // group. A multi-group window must not be split (anchor re-floats
            // while the rest dock to the grid), so dock the anchor to the grid
            // alongside the other members once they're no longer alone.
            if (floatingBox && anchorIsSoleMember) {
                this.addFloatingGroup(group, {
                    height: floatingBox.height,
                    width: floatingBox.width,
                    position: floatingBox,
                });
            } else {
                this.doRemoveGroup(group, {
                    skipDispose: true,
                    skipActive: true,
                    skipPopoutReturn: true,
                });

                group.model.location = { type: 'grid' };

                this.movingLock(() => {
                    // suppress group add events since the group already exists
                    this.doAddGroup(group, [0]);
                });
            }
            this.doSetGroupAndPanelActive(group);
        }

        // All members have been relocated out; tear down the window's nested
        // gridview (does not dispose the leaf views, whose lifecycle stays
        // with `_groups`).
        disposePopoutGridview();
    }

    addFloatingGroup(
        item: DockviewPanel | DockviewGroupPanel,
        options?: FloatingGroupOptionsInternal
    ): void {
        this.mutation('float', () => this._doAddFloatingGroup(item, options));
    }

    private _doAddFloatingGroup(
        item: DockviewPanel | DockviewGroupPanel,
        options?: FloatingGroupOptionsInternal
    ): void {
        const service = assertModule(
            this._floatingGroupService,
            'FloatingGroup',
            'api.addFloatingGroup'
        );
        if (!service) {
            return;
        }

        if (
            item instanceof DockviewGroupPanel &&
            item.model.location.type === 'edge'
        ) {
            // edge groups are permanent structural elements and cannot be floated
            return;
        }

        let group: DockviewGroupPanel;

        if (item instanceof DockviewPanel) {
            group = this.createGroup();
            this._onDidAddGroup.fire(group);

            this.movingLock(() =>
                this.removePanel(item, {
                    removeEmptyGroup: true,
                    skipDispose: true,
                    skipSetActiveGroup: true,
                })
            );

            this.movingLock(() =>
                group.model.openPanel(item, { skipSetGroupActive: true })
            );
        } else {
            group = item;

            const popoutReferenceGroupId =
                this._popoutWindowService?.findReferenceGroupId(group);
            const popoutReferenceGroup = popoutReferenceGroupId
                ? this.getPanel(popoutReferenceGroupId)
                : undefined;

            const skip =
                typeof options?.skipRemoveGroup === 'boolean' &&
                options.skipRemoveGroup;

            if (!skip) {
                if (popoutReferenceGroup) {
                    this.movingLock(() =>
                        moveGroupWithoutDestroying({
                            from: item,
                            to: popoutReferenceGroup,
                        })
                    );
                    this.doRemoveGroup(item, {
                        skipPopoutReturn: true,
                        skipPopoutAssociated: true,
                    });
                    this.doRemoveGroup(popoutReferenceGroup, {
                        skipDispose: true,
                    });
                    group = popoutReferenceGroup;
                } else {
                    this.doRemoveGroup(item, {
                        skipDispose: true,
                        skipPopoutReturn: true,
                        skipPopoutAssociated: false,
                    });
                }
            }
        }

        function getAnchoredBox(): AnchoredBox {
            if (options?.position) {
                const result: any = {};

                if ('left' in options.position) {
                    result.left = Math.max(options.position.left, 0);
                } else if ('right' in options.position) {
                    result.right = Math.max(options.position.right, 0);
                } else {
                    result.left = DEFAULT_FLOATING_GROUP_POSITION.left;
                }
                if ('top' in options.position) {
                    result.top = Math.max(options.position.top, 0);
                } else if ('bottom' in options.position) {
                    result.bottom = Math.max(options.position.bottom, 0);
                } else {
                    result.top = DEFAULT_FLOATING_GROUP_POSITION.top;
                }
                if (typeof options.width === 'number') {
                    result.width = Math.max(options.width, 0);
                } else {
                    result.width = DEFAULT_FLOATING_GROUP_POSITION.width;
                }
                if (typeof options.height === 'number') {
                    result.height = Math.max(options.height, 0);
                } else {
                    result.height = DEFAULT_FLOATING_GROUP_POSITION.height;
                }
                return result as AnchoredBox;
            }

            return {
                left:
                    typeof options?.x === 'number'
                        ? Math.max(options.x, 0)
                        : DEFAULT_FLOATING_GROUP_POSITION.left,
                top:
                    typeof options?.y === 'number'
                        ? Math.max(options.y, 0)
                        : DEFAULT_FLOATING_GROUP_POSITION.top,
                width:
                    typeof options?.width === 'number'
                        ? Math.max(options.width, 0)
                        : DEFAULT_FLOATING_GROUP_POSITION.width,
                height:
                    typeof options?.height === 'number'
                        ? Math.max(options.height, 0)
                        : DEFAULT_FLOATING_GROUP_POSITION.height,
            };
        }

        const anchoredBox = getAnchoredBox();

        // The floating window hosts its own gridview so it can grow into a
        // nested splitview layout. The window starts with the single anchor
        // group; further groups are added via drag-and-drop.
        const floatingGridview = this.createNestedGridview();
        floatingGridview.addView(group, Sizing.Distribute, [0]);

        this.mountFloatingWindow(
            floatingGridview,
            group,
            [group],
            anchoredBox,
            {
                dragHandle: options?.dragHandle,
                inDragMode: options?.inDragMode,
                skipActiveGroup: options?.skipActiveGroup,
                disableSmartGuides: options?.disableSmartGuides,
            }
        );
    }

    /**
     * Build an empty gridview configured to match the main grid's styling, for
     * hosting a nested layout inside a floating or popout window.
     */
    private createNestedGridview(
        orientation: Orientation = Orientation.HORIZONTAL
    ): Gridview {
        return new Gridview(
            true,
            this.options.hideBorders
                ? { separatorBorder: 'transparent' }
                : undefined,
            orientation,
            false,
            this.options.theme?.gap ?? 0
        );
    }

    /**
     * Wrap a (populated) floating gridview in an overlay window: title bar /
     * move handle, drag wiring, the floating-group service entry and the
     * `floating` location tag for every member group.
     */
    private mountFloatingWindow(
        floatingGridview: Gridview,
        anchorGroup: DockviewGroupPanel,
        members: DockviewGroupPanel[],
        anchoredBox: AnchoredBox,
        options?: {
            dragHandle?: 'titlebar' | 'tabbar';
            inDragMode?: boolean;
            skipActiveGroup?: boolean;
            disableSmartGuides?: boolean;
        }
    ): void {
        const service = assertModule(
            this._floatingGroupService,
            'FloatingGroup',
            'api.addFloatingGroup'
        );
        if (!service) {
            return;
        }

        const dragHandleMode =
            options?.dragHandle ??
            this.options.floatingGroupDragHandle ??
            'titlebar';

        // `'titlebar'` renders a dedicated grab bar above the tab bar and uses
        // it as the move handle; `'tabbar'` falls back to moving via the
        // tab-bar void container.
        const titleBar =
            dragHandleMode === 'titlebar'
                ? new FloatingTitleBar(this, anchorGroup)
                : undefined;

        const overlay = new Overlay({
            container: this._floatingOverlayHost ?? this.gridview.element,
            content: floatingGridview.element,
            header: titleBar?.element,
            ...anchoredBox,
            minimumInViewportWidth:
                this.options.floatingGroupBounds === 'boundedWithinViewport'
                    ? undefined
                    : (this.options.floatingGroupBounds
                          ?.minimumWidthWithinViewport ??
                      DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE),
            minimumInViewportHeight:
                this.options.floatingGroupBounds === 'boundedWithinViewport'
                    ? undefined
                    : (this.options.floatingGroupBounds
                          ?.minimumHeightWithinViewport ??
                      DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE),
            transformDragPosition: this._buildFloatingDragTransform(
                anchorGroup,
                options?.disableSmartGuides ?? false
            ),
            getSiblingBoxes: () => this._gatherFloatingGroupBoxes(anchorGroup),
        });

        const dragHandle =
            titleBar?.element ??
            anchorGroup.element.querySelector('.dv-void-container');

        if (!dragHandle) {
            throw new Error('dockview: failed to find drag handle');
        }

        overlay.setupDrag(<HTMLElement>dragHandle, {
            inDragMode:
                typeof options?.inDragMode === 'boolean'
                    ? options.inDragMode
                    : false,
        });

        const floatingGroupPanel = service.add(
            anchorGroup,
            overlay,
            floatingGridview
        );

        // Surface the start + end of a move drag so the Smart Guides module can
        // (re)build then tear down its per-drag guides. Start (re)sets a clean
        // slate even if a prior drag aborted without an end (redock long-press);
        // end fires on pointerup/cancel (and harmlessly on resize-end). No-ops
        // when the module is absent.
        floatingGroupPanel.addDisposables(
            overlay.onDidStartMoving(() =>
                this._onDidStartFloatingGroupDrag.fire(anchorGroup)
            ),
            overlay.onDidChangeEnd(() =>
                this._onDidEndFloatingGroupDrag.fire(anchorGroup)
            )
        );

        if (titleBar) {
            // Tie the title bar's lifetime to the floating window and surface
            // its redock drag through the same public `onWillDragGroup` event
            // the tab-bar handle uses. Register it so anchor reassignment (when
            // the original anchor leaves a multi-group window) retargets the
            // bar at a group that still lives here.
            floatingGroupPanel.setTitleBar(titleBar);
            floatingGroupPanel.addDisposables(
                titleBar,
                Disposable.from(() =>
                    floatingGroupPanel.setTitleBar(undefined)
                ),
                titleBar.onDragStart((event) => {
                    this._onWillDragGroup.fire({
                        nativeEvent: event,
                        group: floatingGroupPanel.group,
                    });
                })
            );
        }

        for (const member of members) {
            member.model.location = { type: 'floating' };
        }

        if (!options?.skipActiveGroup) {
            this.doSetGroupAndPanelActive(anchorGroup);
        }
    }

    private orthogonalize(
        position: Position,
        options?: GroupOptions
    ): DockviewGroupPanel {
        this.gridview.normalize();

        switch (position) {
            case 'top':
            case 'bottom':
                if (this.gridview.orientation === Orientation.HORIZONTAL) {
                    // we need to add to a vertical splitview but the current root is a horizontal splitview.
                    // insert a vertical splitview at the root level and add the existing view as a child
                    this.gridview.insertOrthogonalSplitviewAtRoot();
                }
                break;
            case 'left':
            case 'right':
                if (this.gridview.orientation === Orientation.VERTICAL) {
                    // we need to add to a horizontal splitview but the current root is a vertical splitview.
                    // insert a horiziontal splitview at the root level and add the existing view as a child
                    this.gridview.insertOrthogonalSplitviewAtRoot();
                }
                break;
            default:
                break;
        }

        switch (position) {
            case 'top':
            case 'left':
            case 'center':
                return this.createGroupAtLocation([0], undefined, options); // insert into first position
            case 'bottom':
            case 'right':
                return this.createGroupAtLocation(
                    [this.gridview.length],
                    undefined,
                    options
                ); // insert into last position
            default:
                throw new Error(`dockview: unsupported position ${position}`);
        }
    }

    override updateOptions(options: Partial<DockviewComponentOptions>): void {
        super.updateOptions(options);

        // Validate what the caller passed, not the merged result: every key of
        // DockviewOptions is present (as `undefined`) on `this.options`, so a
        // presence test there would fire for every rule.
        this.reportMissingOptionModules(options);

        this._floatingGroupService?.updateBounds(options);

        this._rootDropTargetService?.setOptions(options);

        const oldDisableDnd = this.options.disableDnd;
        const oldDndStrategy = this.options.dndStrategy;
        this._options = { ...this.options, ...options };
        const newDisableDnd = this.options.disableDnd;
        const newDndStrategy = this.options.dndStrategy;

        if (
            oldDisableDnd !== newDisableDnd ||
            oldDndStrategy !== newDndStrategy
        ) {
            this.updateDragAndDropState();
        }

        if ('theme' in options) {
            this.updateTheme();
        }

        if (
            'createRightHeaderActionComponent' in options ||
            'createLeftHeaderActionComponent' in options ||
            'createPrefixHeaderActionComponent' in options
        ) {
            this.headerActionsService?.refreshAll();
        }

        if ('createWatermarkComponent' in options) {
            this._watermarkService?.refresh();
            for (const group of this.groups) {
                group.model.refreshWatermark();
            }
        }

        if ('tabGroupColors' in options || 'tabGroupAccent' in options) {
            this._tabGroupColorPalette.setEntries(
                this._options.tabGroupColors ?? DEFAULT_TAB_GROUP_COLORS
            );
            this._tabGroupColorPalette.enabled =
                this._options.tabGroupAccent !== 'off';
            for (const group of this.groups) {
                group.model.refreshTabGroupAccent();
            }
        }

        this._onDidOptionsChange.fire();

        this._layoutFromShell(this.gridview.width, this.gridview.height);
    }

    /**
     * Report any option the caller set whose module isn't registered. Logs
     * once per module+reason; never throws, matching the module system's
     * degrade-to-no-op contract.
     */
    private reportMissingOptionModules(
        options: Partial<DockviewComponentOptions>
    ): void {
        validateOptionModules(options, (moduleName) =>
            this._moduleRegistry.has(moduleName)
        );
    }

    override layout(
        width: number,
        height: number,
        forceResize?: boolean | undefined
    ): void {
        if (this._shellManager && !this._inShellLayout) {
            this._shellManager.layout(width, height);
        } else {
            super.layout(width, height, forceResize);
        }

        this._syncFloatingOverlayHost();

        // floatingGroupService may be undefined during super() (BaseGrid calls
        // layout(0, 0) before subclass field initialisers run).
        this._moduleRegistry?.services.floatingGroupService?.constrainBounds();
    }

    private _syncFloatingOverlayHost(): void {
        if (!this._floatingOverlayHost || !this._shellManager) {
            return;
        }
        const shellRect = this._shellManager.element.getBoundingClientRect();
        const gridRect = this.element.getBoundingClientRect();
        const host = this._floatingOverlayHost;
        host.style.left = `${gridRect.left - shellRect.left}px`;
        host.style.top = `${gridRect.top - shellRect.top}px`;
        host.style.width = `${gridRect.width}px`;
        host.style.height = `${gridRect.height}px`;
    }

    private _layoutFromShell(width: number, height: number): void {
        this._inShellLayout = true;
        this.layout(width, height, true);
        this._inShellLayout = false;
    }

    protected override forceRelayout(): void {
        if (this._shellManager) {
            this._layoutFromShell(this.width, this.height);
        } else {
            super.forceRelayout();
        }
    }

    addEdgeGroup(
        position: EdgeGroupPosition,
        options: AddEdgeGroupOptions
    ): DockviewGroupPanelApi {
        const service = this._edgeGroupService;
        if (!service) {
            // Throws rather than degrading to a no-op like every other module
            // entry point: the return type is non-optional, so there is no
            // group to hand back. Not routed through assertModule: that would
            // log and then throw, reporting the same problem twice.
            throw new Error(
                missingModuleMessage('EdgeGroup', 'api.addEdgeGroup')
            );
        }
        if (service.has(position)) {
            throw new Error(
                `dockview: edge group already exists at position '${position}'`
            );
        }

        return this.mutation('add', () => {
            const group = this.createGroup({ id: options.id });
            group.model.location = { type: 'edge', position };
            group.model.headerPosition = position;

            // When the group becomes empty: an auto-reveal edge tears down to
            // zero footprint; every other edge group collapses to its strip.
            const autoCollapseDisposable = group.model.onDidRemovePanel(() => {
                if (!group.model.isEmpty) {
                    return;
                }
                if (service.isAutoReveal(group)) {
                    // Defer the teardown: disposing the group (and its
                    // onDidRemovePanel emitter) from inside that emitter's own
                    // dispatch corrupts the emitter / mutation depth. The
                    // re-check no-ops if a concurrent move re-filled the edge.
                    queueMicrotask(() => {
                        if (
                            group.model.isEmpty &&
                            this._edgeGroupService?.includes(group)
                        ) {
                            this.removeEdgeGroup(position);
                        }
                    });
                } else {
                    this.setEdgeGroupCollapsed(group, true);
                }
            });

            service.add(position, group, autoCollapseDisposable);
            if (options.autoHide !== undefined) {
                service.setAutoHide(group, options.autoHide);
            }
            if (options.autoReveal !== undefined) {
                service.setAutoReveal(group, options.autoReveal);
            }
            this._onDidAddGroup.fire(group);

            this._shellManager!.addEdgeView(
                position,
                options,
                group as IEdgeGroupHost
            );

            return group.api;
        });
    }

    /**
     * Reveal (create-or-fill) the edge group at `position` and move the dragged
     * item described by `data` into it. A newly created edge group is created
     * collapsed, flagged `autoReveal` so it tears down to zero footprint when
     * later emptied, and takes its auto-hide state from `options.autoHide`. If an
     * edge group already exists there it is reused: the panel is added to its
     * tabs and its collapsed/toggled *and auto-hide* state are left as-is (never
     * re-created; `addEdgeGroup` throws on a duplicate position). This keeps a
     * drag-reveal from silently converting a static edge group into an
     * auto-hiding one; to change an existing group's auto-hide, call
     * `api.getEdgeGroup(position)?.setAutoHide(...)` directly. No-op if the
     * EdgeGroup module is absent.
     *
     * This is the primitive behind the dock-to-edge groups: the two-band
     * drag-reveal affordance routes its outer-band drops here.
     */
    revealEdgeGroupWithData(
        position: EdgeGroupPosition,
        data: { groupId: string; panelId?: string | null },
        options?: { autoHide?: boolean }
    ): void {
        const service = this._edgeGroupService;
        if (!service) {
            return;
        }
        this.mutation('add', () => {
            let group = service.get(position);
            if (!group) {
                // A newly revealed edge group is created collapsed, so the drop
                // adds a tab to its strip rather than popping the group open.
                this.addEdgeGroup(position, {
                    id: this.getNextGroupId(),
                    autoReveal: true,
                    autoHide: options?.autoHide,
                    collapsed: true,
                });
                group = service.get(position);
            }
            // An existing edge group is reused with its auto-hide state left
            // as-is: a drag-reveal must not flip a static edge group into an
            // auto-hiding one. Programmatic callers that intend to change it use
            // `api.getEdgeGroup(position)?.setAutoHide(...)`.
            if (!group) {
                return;
            }
            // Add the panel to the edge group's tabs WITHOUT changing its
            // collapsed/toggled state (leave it as the user last had it).
            this.moveGroupOrPanel({
                from: {
                    groupId: data.groupId,
                    panelId: data.panelId ?? undefined,
                },
                to: {
                    group,
                    position: 'center',
                },
            });
        });
    }

    getEdgeGroup(
        position: EdgeGroupPosition
    ): DockviewGroupPanelApi | undefined {
        return this._edgeGroupService?.get(position)?.api;
    }

    /** The edge group panel at a position (the model, not the api). */
    getEdgeGroupPanel(
        position: EdgeGroupPosition
    ): DockviewGroupPanel | undefined {
        return this._edgeGroupService?.get(position);
    }

    /** Pin (expand) the edge group at a position. Reports the missing module if
     *  AutoHideEdgeGroup is absent, since this command is reachable without the
     *  `autoHideEdgeGroups` option that would otherwise have named it. */
    pinEdgeGroup(position: EdgeGroupPosition): void {
        assertModule(
            this._moduleRegistry.services.autoHideEdgeGroupService,
            'AutoHideEdgeGroup',
            'api.pinEdgeGroup'
        )?.pin(position);
    }

    /** Auto-hide (collapse to strip) the edge group at a position. */
    autoHideEdgeGroup(position: EdgeGroupPosition): void {
        assertModule(
            this._moduleRegistry.services.autoHideEdgeGroupService,
            'AutoHideEdgeGroup',
            'api.autoHideEdgeGroup'
        )?.autoHide(position);
    }

    /** Peek (slide out) / close the collapsed edge group at a position. */
    peekEdgeGroup(position: EdgeGroupPosition, peek: boolean): void {
        assertModule(
            this._moduleRegistry.services.autoHideEdgeGroupService,
            'AutoHideEdgeGroup',
            'api.peekEdgeGroup'
        )?.peek(position, peek);
    }

    /** The auto-hide peek mounts on the shell, the same element the
     *  `OverlayRenderContainer` roots on, so `always` content re-anchors in the
     *  peek's coordinate space. */
    get overlayRoot(): HTMLElement {
        return this.rootElement;
    }

    /** Viewport rect of the docked content area (the element the root/group drop
     *  targets hit-test against), used by the two-band drag-reveal affordance to
     *  classify a pointer's distance from each edge. This is the gridview/center
     *  container, which is inset when edge groups are present, so the outer band
     *  sits at the boundary of the content area (adjacent to any existing edge
     *  group) rather than at the shell's outer edge. */
    getDropZoneRect(): DOMRect {
        return this.element.getBoundingClientRect();
    }

    /** The size an edge group expands to (pre-collapse); sizes the peek. */
    getEdgeGroupExpandedSize(position: EdgeGroupPosition): number {
        return this._shellManager?.getEdgeGroupExpandedSize(position) ?? 0;
    }

    /** Reposition a single `renderer:'always'` panel's overlay over its
     *  reference container, optionally forcing it visible (the auto-hide peek
     *  slides an `always` panel out without reparenting it or touching its
     *  visibility state). No-op for non-overlay-rendered panels. */
    repositionPanelOverlay(
        panel: IDockviewPanel,
        forceVisible: boolean,
        clip?: DOMRect
    ): void {
        this.overlayRenderContainer.repositionPanelOverlay(
            panel.api.id,
            forceVisible,
            clip
        );
    }

    setEdgeGroupVisible(position: EdgeGroupPosition, visible: boolean): void {
        this._shellManager!.setEdgeGroupVisible(position, visible);
    }

    isEdgeGroupVisible(position: EdgeGroupPosition): boolean {
        return this._shellManager!.isEdgeGroupVisible(position);
    }

    removeEdgeGroup(position: EdgeGroupPosition): void {
        const service = assertModule(
            this._edgeGroupService,
            'EdgeGroup',
            'api.removeEdgeGroup'
        );
        if (!service) {
            return;
        }
        const group = service.get(position);
        if (!group) {
            throw new Error(
                `dockview: no edge group exists at position '${position}'`
            );
        }

        // One transaction; the per-panel removals below nest via the depth
        // counter, so consumers see a single edge-group removal.
        this.mutation('remove', () => {
            // Remove panels inside the group first
            for (const panel of [...group.panels]) {
                this.removePanel(panel, {
                    removeEmptyGroup: false,
                    skipDispose: false,
                });
            }

            // Remove from the shell splitview
            this._shellManager!.removeEdgeView(position);

            // Clean up service-tracked state + group itself
            service.remove(position);
            group.dispose();
            this._groups.delete(group.id);
            this._onDidRemoveGroup.fire(group);
        });
    }

    setEdgeGroupCollapsed(group: DockviewGroupPanel, collapsed: boolean): void {
        const position = this._edgeGroupService?.findPositionOf(group);
        if (!position) {
            return;
        }
        if (this._shellManager!.isEdgeGroupCollapsed(position) === collapsed) {
            // Skip the splitview resize on a no-op: with non-zero theme gap,
            // redundant resizeView calls accumulate rounding drift that
            // gradually shrinks the group.
            return;
        }
        this._shellManager!.setEdgeGroupCollapsed(position, collapsed);
        group.api._onDidCollapsedChange.fire({ isCollapsed: collapsed });
    }

    isEdgeGroupCollapsed(group: DockviewGroupPanel): boolean {
        const position = this._edgeGroupService?.findPositionOf(group);
        return position
            ? this._shellManager!.isEdgeGroupCollapsed(position)
            : false;
    }

    /** Edge groups currently peeking (auto-hide). The peek state is owned by the
     *  auto-hide module; the component just records it so `group.api.isPeeking()`
     *  / `onDidPeekChange` work. */
    private readonly _peekingGroups = new Set<DockviewGroupPanel>();

    isEdgeGroupPeeking(group: DockviewGroupPanel): boolean {
        return this._peekingGroups.has(group);
    }

    /** Set the peek state and fire the group's `onDidPeekChange` (called by the
     *  auto-hide service). */
    setEdgeGroupPeeking(group: DockviewGroupPanel, peeking: boolean): void {
        if (this._peekingGroups.has(group) === peeking) {
            return;
        }
        if (peeking) {
            this._peekingGroups.add(group);
        } else {
            this._peekingGroups.delete(group);
        }
        group.api._onDidPeekChange.fire({ isPeeking: peeking });
    }

    /**
     * Resolve whether an edge group should behave as an auto-hide (pinnable)
     * tool window: the per-group flag when set, otherwise the per-edge
     * `autoHideEdgeGroups` option for the group's edge. This is what lets a
     * static edge group and an auto-hiding one co-exist in the same layout.
     */
    isEdgeGroupAutoHide(group: DockviewGroupPanel): boolean {
        const perGroup = this._edgeGroupService?.isAutoHide(group);
        if (perGroup !== undefined) {
            return perGroup;
        }
        const position = this._edgeGroupService?.findPositionOf(group);
        if (position === undefined) {
            return false;
        }
        return isEdgeGroupEnabled(this.options.autoHideEdgeGroups, position);
    }

    /**
     * Set (or clear, via `undefined`) the per-group auto-hide flag and notify
     * the auto-hide module so it can dock/undock the group at runtime.
     */
    setEdgeGroupAutoHide(
        group: DockviewGroupPanel,
        value: boolean | undefined
    ): void {
        const service = this._edgeGroupService;
        if (!service?.includes(group)) {
            return;
        }
        service.setAutoHide(group, value);
        this._onDidEdgeGroupAutoHideChange.fire(group);
    }

    private updateDragAndDropState(): void {
        // Update draggable state for all tabs and void containers
        for (const group of this.groups) {
            group.model.updateDragAndDropState();
        }
    }

    focus(): void {
        this.activeGroup?.focus();
    }

    getGroupPanel(id: string): IDockviewPanel | undefined {
        return this.panels.find((panel) => panel.id === id);
    }

    setActivePanel(panel: IDockviewPanel): void {
        panel.group.model.openPanel(panel);
        this.doSetGroupAndPanelActive(panel.group);
    }

    activateNext(options: MovementOptions = {}): void {
        if (!options.group) {
            if (!this.activeGroup) {
                return;
            }
            options.group = this.activeGroup;
        }

        if (options.includePanel && options.group) {
            if (
                options.group.activePanel !==
                options.group.panels[options.group.panels.length - 1]
            ) {
                options.group.model.moveToNext({ suppressRoll: true });
                return;
            }
        }

        const location = getGridLocation(options.group.element);
        const next = <DockviewGroupPanel>this.gridview.next(location)?.view;
        this.doSetGroupAndPanelActive(next);
    }

    activatePrevious(options: MovementOptions = {}): void {
        if (!options.group) {
            if (!this.activeGroup) {
                return;
            }
            options.group = this.activeGroup;
        }

        if (options.includePanel && options.group) {
            if (options.group.activePanel !== options.group.panels[0]) {
                options.group.model.moveToPrevious({ suppressRoll: true });
                return;
            }
        }

        const location = getGridLocation(options.group.element);
        const next = this.gridview.previous(location)?.view;
        if (next) {
            this.doSetGroupAndPanelActive(next as DockviewGroupPanel);
        }
    }

    /**
     * Serialize the current state of the layout
     *
     * @returns A JSON respresentation of the layout
     */
    toJSON(): SerializedDockview {
        const data = this.gridview.serialize();

        const panels = this.panels.reduce(
            (collection, panel) => {
                collection[panel.id] = panel.toJSON();
                return collection;
            },
            {} as { [key: string]: GroupviewPanelState }
        );

        const floats: SerializedFloatingGroup[] =
            this._floatingGroupService?.serialize() ?? [];

        const popoutGroups: SerializedPopoutGroup[] =
            this._popoutWindowService?.serialize() ?? [];

        const result: SerializedDockview = {
            grid: data,
            panels,
            activeGroup: this.activeGroup?.id,
        };

        if (floats.length > 0) {
            result.floatingGroups = floats;
        }

        if (popoutGroups.length > 0) {
            result.popoutGroups = popoutGroups;
        }

        const edgeGroups = this._serializeEdgeGroups();
        if (edgeGroups) {
            result.edgeGroups = edgeGroups;
        }

        return result;
    }

    /**
     * Serialize the edge groups, augmenting each shell entry with the serialized
     * group state + the component-owned per-group presentation flags (the shell
     * only knows geometry/collapse). Returns `undefined` when there are none.
     */
    private _serializeEdgeGroups():
        | SerializedDockview['edgeGroups']
        | undefined {
        if (!this._edgeGroupService?.hasAny()) {
            return undefined;
        }
        const shellSerialized = this._shellManager!.toJSON();

        for (const [position, group] of this._edgeGroupService.entries()) {
            const entry = shellSerialized[position];
            if (!entry) {
                continue;
            }
            // Don't persist a transient empty auto-reveal edge (it's
            // mid-teardown to zero footprint, and the deferred removeEdgeGroup
            // microtask hasn't run yet). Restoring it would recreate an edge
            // that can never tear itself down, since nothing is ever removed
            // from it to fire onDidRemovePanel.
            if (
                this._edgeGroupService.isAutoReveal(group) &&
                group.model.isEmpty
            ) {
                delete shellSerialized[position];
                continue;
            }
            entry.group = group.toJSON();
            if (this._edgeGroupService.isAutoReveal(group)) {
                entry.autoReveal = true;
            }
            const autoHide = this._edgeGroupService.isAutoHide(group);
            if (autoHide !== undefined) {
                entry.autoHide = autoHide;
            }
        }

        return shellSerialized;
    }

    fromJSON(
        data: SerializedDockview,
        options?: { reuseExistingPanels: boolean }
    ): void {
        // One 'load' transaction for the whole deserialization; the many
        // nested add/remove mutations join it via the depth counter.
        this.mutation('load', () => this._doFromJSON(data, options));
    }

    private _doFromJSON(
        data: SerializedDockview,
        options?: { reuseExistingPanels: boolean }
    ): void {
        // Cancel any popout-restoration timers queued by a previous fromJSON
        // that haven't fired yet. The cancel path also disposes orphan groups
        // registered in _groups synchronously but never parented into a popout
        // window; otherwise the upcoming clear() would call gridview.remove()
        // on an unparented element and throw "Invalid grid element". See
        // issue #1304.
        this._popoutWindowService?.cancelPendingRestorations();

        // Validate the input shape *before* mutating the live layout. Both the
        // reuseExistingPanels setup below and clear() destroy the current
        // layout, so any validation that runs after them (and outside the
        // restoration try/catch) would leave the component empty on malformed
        // input instead of failing safely.
        if (typeof data !== 'object' || data === null) {
            throw new Error(
                'dockview: serialized layout must be a non-null object'
            );
        }

        if (
            !data.grid ||
            data.grid.root?.type !== 'branch' ||
            !Array.isArray(data.grid.root.data)
        ) {
            throw new Error('dockview: root must be of type branch');
        }

        const existingPanels = new Map<string, IDockviewPanel>();

        let tempGroup: DockviewGroupPanel | undefined;

        if (options?.reuseExistingPanels) {
            /**
             * What are we doing here?
             *
             * 1. Create a temporary group to hold any panels that currently exist and that also exist in the new layout
             * 2. Remove that temporary group from the group mapping so that it doesn't get cleared when we clear the layout
             */

            tempGroup = this.createGroup();
            this._groups.delete(tempGroup.api.id);

            const newPanels = Object.keys(data.panels);

            for (const panel of this.panels) {
                if (newPanels.includes(panel.api.id)) {
                    existingPanels.set(panel.api.id, panel);
                }
            }

            this.movingLock(() => {
                Array.from(existingPanels.values()).forEach((panel) => {
                    this.moveGroupOrPanel({
                        from: {
                            groupId: panel.api.group.api.id,
                            panelId: panel.api.id,
                        },
                        to: {
                            group: tempGroup!,
                            position: 'center',
                        },
                        keepEmptyGroups: true,
                    });
                });
            });
        }

        this.clear();

        const { grid, panels, activeGroup } = data;

        try {
            const width = this.width;
            const height = this.height;

            const createGroupFromSerializedState = (
                data: GroupPanelViewState
            ) => {
                const {
                    id,
                    locked,
                    hideHeader,
                    headerPosition,
                    views,
                    activeView,
                } = data;

                if (typeof id !== 'string') {
                    throw new TypeError(
                        'dockview: group id must be of type string'
                    );
                }

                const group = this.createGroup({
                    id,
                    locked: !!locked,
                    hideHeader: !!hideHeader,
                    headerPosition,
                });
                this._onDidAddGroup.fire(group);

                const createdPanels: IDockviewPanel[] = [];

                /**
                 * Skip any view whose panel state is missing from the panels
                 * map rather than passing `undefined` to the deserializer
                 * (which would dereference `panelData.id` and throw, aborting
                 * the whole layout restore). Mirrors the guard on the
                 * edge-group deserialization path.
                 */
                const presentViews = views.filter(
                    (child: string) => panels[child]
                );

                for (const child of presentViews) {
                    /**
                     * Run the deserializer step seperately since this may fail to due corrupted external state.
                     * In running this section first we avoid firing lots of 'add' events in the event of a failure
                     * due to a corruption of input data.
                     */

                    const existingPanel = existingPanels.get(child);

                    if (tempGroup && existingPanel) {
                        this.movingLock(() => {
                            tempGroup!.model.removePanel(existingPanel);
                        });

                        createdPanels.push(existingPanel);
                        existingPanel.updateFromStateModel(panels[child]);
                    } else {
                        const panel = this._deserializer.fromJSON(
                            panels[child],
                            group
                        );
                        createdPanels.push(panel);
                    }
                }

                // Iterate the panels that were actually created (a view whose
                // panel state was missing is skipped above), keeping this loop
                // aligned with `createdPanels` rather than the raw `views`.
                for (const panel of createdPanels) {
                    const isActive =
                        typeof activeView === 'string' &&
                        activeView === panel.id;

                    const hasExisting = existingPanels.has(panel.api.id);

                    if (hasExisting) {
                        this.movingLock(() => {
                            group.model.openPanel(panel, {
                                skipSetActive: !isActive,
                                skipSetGroupActive: true,
                            });
                        });
                    } else {
                        group.model.openPanel(panel, {
                            skipSetActive: !isActive,
                            skipSetGroupActive: true,
                        });
                    }
                }

                // Restore tab groups before activating a fallback panel so
                // that collapsed groups can clear the active panel correctly.
                if (data.tabGroups && data.tabGroups.length > 0) {
                    group.model.restoreTabGroups(data.tabGroups);
                }

                if (!group.activePanel && group.panels.length > 0) {
                    group.model.openPanel(
                        group.panels[group.panels.length - 1],
                        {
                            skipSetGroupActive: true,
                        }
                    );
                }

                return group;
            };

            this.gridview.deserialize(grid, {
                fromJSON: (node: ISerializedLeafNode<GroupPanelViewState>) => {
                    return createGroupFromSerializedState(node.data);
                },
            });

            this._layoutFromShell(width, height);

            if (data.edgeGroups) {
                this.deserializeEdgeGroups(data.edgeGroups, panels);
            }

            this.deserializeFloatingWindows(
                data.floatingGroups ?? [],
                createGroupFromSerializedState
            );

            const popoutPromises = this.deserializePopoutWindows(
                data.popoutGroups ?? [],
                createGroupFromSerializedState
            );
            this._popoutWindowService?.finishRestoration(popoutPromises);

            this._floatingGroupService?.constrainBounds();

            if (typeof activeGroup === 'string') {
                const panel = this.getPanel(activeGroup);
                if (panel) {
                    this.doSetGroupAndPanelActive(panel);
                }
            }

            // `gridview.deserialize()` rebuilds the grid without firing the
            // BaseGrid add events the watermark module reacts to, so the
            // watermark mounted during `clear()` would otherwise persist over
            // the restored layout. Re-evaluate now the layout is in place.
            this._watermarkService?.update();
        } catch (err) {
            console.error(
                'dockview: failed to deserialize layout. Reverting changes',
                err
            );

            /**
             * Takes all the successfully created groups and remove all of their panels.
             */
            for (const group of this.groups) {
                for (const panel of group.panels) {
                    this.removePanel(panel, {
                        removeEmptyGroup: false,
                        skipDispose: false,
                    });
                }
            }

            /**
             * To remove a group we cannot call this.removeGroup(...) since this makes assumptions about
             * the underlying HTMLElement existing in the Gridview.
             */
            for (const group of this.groups) {
                group.dispose();
                this._groups.delete(group.id);
                this._onDidRemoveGroup.fire(group);
            }

            this._floatingGroupService?.disposeAll();

            // fires clean-up events and clears the underlying HTML gridview.
            this.clear();

            /**
             * even though we have cleaned-up we still want to inform the caller of their error
             * and we'll do this through re-throwing the original error since afterall you would
             * expect trying to load a corrupted layout to result in an error and not silently fail...
             */
            throw err;
        }

        // Force position updates for always visible panels after DOM layout is complete
        this.debouncedUpdateAllPositions();

        this._onDidLayoutFromJSON.fire();
    }

    /**
     * Rebuild a floating / popout window's nested gridview from its serialized
     * tree, collecting the member groups (in deserialization order) so the
     * caller can mount or restore the window.
     */
    private deserializeNestedGridview(
        grid: SerializedGridview<GroupPanelViewState>,
        createGroup: (state: GroupPanelViewState) => DockviewGroupPanel
    ): { gridview: Gridview; members: DockviewGroupPanel[] } {
        const gridview = this.createNestedGridview(grid.orientation);
        const members: DockviewGroupPanel[] = [];
        gridview.deserialize(grid, {
            fromJSON: (node: ISerializedLeafNode<GroupPanelViewState>) => {
                const group = createGroup(node.data);
                members.push(group);
                return group;
            },
        });
        return { gridview, members };
    }

    private deserializeEdgeGroups(
        edgeGroups: SerializedEdgeGroups,
        panels: Record<string, GroupviewPanelState>
    ): void {
        const edgeService = assertModule(
            this._edgeGroupService,
            'EdgeGroup',
            'fromJSON edge restoration'
        );
        if (!edgeService) {
            return;
        }

        // Auto-create edge groups for positions in the serialized state that
        // don't already have a group registered (e.g. when fromJSON is called
        // before the user has called addEdgeGroup).
        for (const _position of [
            'top',
            'bottom',
            'left',
            'right',
        ] as EdgeGroupPosition[]) {
            const fixedData = edgeGroups[_position];
            if (fixedData && !edgeService.has(_position)) {
                const groupState = fixedData.group as
                    | GroupPanelViewState
                    | undefined;
                const id = groupState?.id ?? `${_position}-group`;
                // Trust the serialized per-group flags. Absent → unset (a
                // static edge collapses to a strip; auto-hide inherits the
                // per-edge option). We deliberately don't fall back to the
                // `dockToEdgeGroups` option here, so a static edge group in a
                // saved layout is never silently turned into a self-tearing-
                // down one just because the option is on this session.
                this.addEdgeGroup(_position, {
                    id,
                    autoReveal: fixedData.autoReveal,
                    autoHide: fixedData.autoHide,
                    // Restore the per-group geometry constraints; without these
                    // the auto-created group reverts to defaults (maximumSize
                    // Infinity, minimumSize collapsedSize+50).
                    minimumSize: fixedData.minimumSize,
                    maximumSize: fixedData.maximumSize,
                    collapsedSize: fixedData.collapsedSize,
                });
            }
        }

        // Restore panel contents of edge groups
        for (const [position, edgeGroup] of edgeService.entries()) {
            const edgeData = edgeGroups[position];
            const groupState = edgeData?.group as
                | GroupPanelViewState
                | undefined;
            if (groupState) {
                const { views, activeView } = groupState;
                const createdPanels: IDockviewPanel[] = [];

                for (const panelId of views) {
                    if (panels[panelId]) {
                        const panel = this._deserializer.fromJSON(
                            panels[panelId],
                            edgeGroup
                        );
                        createdPanels.push(panel);
                    }
                }

                for (const panel of createdPanels) {
                    const isActive = activeView === panel.id;
                    edgeGroup.model.openPanel(panel, {
                        skipSetActive: !isActive,
                        skipSetGroupActive: true,
                    });
                }

                // Restore tab groups before activating a fallback panel
                if (groupState.tabGroups && groupState.tabGroups.length > 0) {
                    edgeGroup.model.restoreTabGroups(groupState.tabGroups);
                }

                if (!edgeGroup.activePanel && edgeGroup.panels.length > 0) {
                    edgeGroup.model.openPanel(
                        edgeGroup.panels[edgeGroup.panels.length - 1],
                        { skipSetGroupActive: true }
                    );
                }
            }
        }

        this._shellManager!.fromJSON(edgeGroups);
    }

    private deserializeFloatingWindows(
        serialized: SerializedFloatingGroup[],
        createGroup: (state: GroupPanelViewState) => DockviewGroupPanel
    ): void {
        for (const serializedFloatingGroup of serialized) {
            const { data, grid, position } = serializedFloatingGroup;

            if (grid) {
                // Multi-group window: rebuild the window's nested gridview from
                // its serialized tree.
                const { gridview: floatingGridview, members } =
                    this.deserializeNestedGridview(grid, createGroup);

                if (members.length === 0) {
                    continue;
                }

                this.mountFloatingWindow(
                    floatingGridview,
                    members[0],
                    members,
                    position,
                    { inDragMode: false }
                );
            } else if (data) {
                const group = createGroup(data);

                this.addFloatingGroup(group, {
                    position: position,
                    width: position.width,
                    height: position.height,
                    skipRemoveGroup: true,
                    inDragMode: false,
                });
            }
        }
    }

    private deserializePopoutWindows(
        serialized: SerializedPopoutGroup[],
        createGroup: (state: GroupPanelViewState) => DockviewGroupPanel
    ): Promise<void>[] {
        const popoutService =
            serialized.length > 0
                ? assertModule(
                      this._popoutWindowService,
                      'PopoutWindow',
                      'fromJSON popout restoration'
                  )
                : this._popoutWindowService;

        if (!popoutService) {
            return [];
        }

        // Queue popup group creation with delays to avoid browser blocking
        return serialized.flatMap((serializedPopoutGroup, index) => {
            const { data, grid, position, gridReferenceGroup, url } =
                serializedPopoutGroup;

            // Multi-group popout windows rebuild their nested gridview from the
            // serialized tree; single-group windows use the legacy single-group
            // path.
            let overridePopoutGridview: Gridview | undefined;
            let members: DockviewGroupPanel[] = [];

            if (grid) {
                const built = this.deserializeNestedGridview(grid, createGroup);
                overridePopoutGridview = built.gridview;
                members = built.members;

                if (members.length === 0) {
                    // A serialized window with no groups: nothing to restore.
                    // Mirror the floating path's guard and discard the empty
                    // gridview rather than passing an undefined anchor to
                    // addPopoutGroup.
                    overridePopoutGridview.dispose();
                    return [];
                }
            }

            const group = grid ? members[0] : createGroup(data!);

            return popoutService.scheduleRestoration(
                index * DESERIALIZATION_POPOUT_DELAY_MS,
                () => {
                    this.addPopoutGroup(group, {
                        position: position ?? undefined,
                        overridePopoutGroup: gridReferenceGroup
                            ? group
                            : undefined,
                        overridePopoutGridview,
                        referenceGroup: gridReferenceGroup
                            ? this.getPanel(gridReferenceGroup)
                            : undefined,
                        popoutUrl: url,
                    });
                },
                () => {
                    // The group was registered in _groups synchronously but the
                    // timer that would parent it into the popout window never
                    // ran. Dispose the orphan here so the next clear() doesn't
                    // trip over an unparented element. See issue #1304.
                    for (const orphan of members.length > 0
                        ? members
                        : [group]) {
                        if (
                            !this.isDisposed &&
                            this._groups.has(orphan.id) &&
                            orphan.element.parentElement === null
                        ) {
                            for (const panel of [...orphan.panels]) {
                                this.removePanel(panel, {
                                    removeEmptyGroup: false,
                                });
                            }
                            orphan.dispose();
                            this._groups.delete(orphan.id);
                            this._onDidRemoveGroup.fire(orphan);
                        }
                    }
                }
            );
        });
    }

    clear(): void {
        this.mutation('clear', () => this._doClear());
    }

    private _doClear(): void {
        const groups = Array.from(this._groups.values()).map((_) => _.value);

        const hasActiveGroup = !!this.activeGroup;

        for (const group of groups) {
            if (this._edgeGroupService?.includes(group)) {
                // Edge groups are structural - only clear their panels, not the group itself
                const panels = [...group.panels];
                for (const panel of panels) {
                    this.removePanel(panel, { removeEmptyGroup: false });
                }
                continue;
            }
            // remove the group will automatically remove the panels
            this.removeGroup(group, { skipActive: true });
        }

        if (hasActiveGroup) {
            this.doSetGroupAndPanelActive(undefined);
        }

        this.gridview.clear();
    }

    closeAllGroups(): void {
        // One transaction; the per-panel removals inside nest via the depth
        // counter, so consumers (undo, announcements) see a single mutation.
        this.mutation('remove', () => {
            for (const entry of this._groups.entries()) {
                const [_, group] = entry;

                group.value.model.closeAllPanels();
            }
        });
    }

    addPanel<T extends object = Parameters>(
        options: AddPanelOptions<T>
    ): DockviewPanel {
        return this.mutation('add', () => this._doAddPanel(options));
    }

    private _doAddPanel<T extends object = Parameters>(
        options: AddPanelOptions<T>
    ): DockviewPanel {
        if (this.panels.some((_) => _.id === options.id)) {
            throw new Error(
                `dockview: panel with id ${options.id} already exists`
            );
        }

        let referenceGroup: DockviewGroupPanel | undefined;

        if (options.position && options.floating) {
            throw new Error(
                'dockview: you can only provide one of: position, floating as arguments to .addPanel(...)'
            );
        }

        const initial = {
            width: options.initialWidth,
            height: options.initialHeight,
        };

        let index: number | undefined;

        if (options.position) {
            if (isPanelOptionsWithPanel(options.position)) {
                const referencePanel =
                    typeof options.position.referencePanel === 'string'
                        ? this.getGroupPanel(options.position.referencePanel)
                        : options.position.referencePanel;
                index = options.position.index;

                if (!referencePanel) {
                    const referenceId =
                        typeof options.position.referencePanel === 'string'
                            ? options.position.referencePanel
                            : options.position.referencePanel?.id;
                    throw new Error(
                        `dockview: referencePanel '${referenceId}' does not exist`
                    );
                }

                referenceGroup = this.findGroup(referencePanel);
            } else if (isPanelOptionsWithGroup(options.position)) {
                referenceGroup =
                    typeof options.position.referenceGroup === 'string'
                        ? this._groups.get(options.position.referenceGroup)
                              ?.value
                        : options.position.referenceGroup;
                index = options.position.index;

                if (!referenceGroup) {
                    const referenceId =
                        typeof options.position.referenceGroup === 'string'
                            ? options.position.referenceGroup
                            : options.position.referenceGroup?.id;
                    throw new Error(
                        `dockview: referenceGroup '${referenceId}' does not exist`
                    );
                }
            } else {
                const group = this.orthogonalize(
                    directionToPosition(<Direction>options.position.direction)
                );

                const panel = this.createPanel(options, group);
                group.model.openPanel(panel, {
                    skipSetActive: options.inactive,
                    skipSetGroupActive: options.inactive,
                    index,
                });

                if (!options.inactive) {
                    this.doSetGroupAndPanelActive(group);
                }

                group.api.setSize({
                    height: initial?.height,
                    width: initial?.width,
                });

                return panel;
            }
        } else {
            referenceGroup = this.activeGroup;
        }

        let panel: DockviewPanel;

        if (referenceGroup) {
            const target = toTarget(
                <Direction>options.position?.direction || 'within'
            );

            if (options.floating) {
                const group = this.createGroup();
                this._onDidAddGroup.fire(group);

                const floatingGroupOptions =
                    typeof options.floating === 'object' &&
                    options.floating !== null
                        ? options.floating
                        : {};

                this.addFloatingGroup(group, {
                    ...floatingGroupOptions,
                    inDragMode: false,
                    skipRemoveGroup: true,
                    skipActiveGroup: true,
                });

                panel = this.createPanel(options, group);

                group.model.openPanel(panel, {
                    skipSetActive: options.inactive,
                    skipSetGroupActive: options.inactive,
                    index,
                });
            } else if (
                referenceGroup.api.location.type === 'floating' ||
                referenceGroup.api.location.type === 'edge' ||
                target === 'center'
            ) {
                panel = this.createPanel(options, referenceGroup);
                referenceGroup.model.openPanel(panel, {
                    skipSetActive: options.inactive,
                    skipSetGroupActive: options.inactive,
                    index,
                });

                referenceGroup.api.setSize({
                    width: initial?.width,
                    height: initial?.height,
                });

                if (!options.inactive) {
                    this.doSetGroupAndPanelActive(referenceGroup);
                }
            } else {
                const location = getGridLocation(referenceGroup.element);
                const relativeLocation = getRelativeLocation(
                    this.gridview.orientation,
                    location,
                    target
                );
                const group = this.createGroupAtLocation(
                    relativeLocation,
                    this.orientationAtLocation(relativeLocation) ===
                        Orientation.VERTICAL
                        ? initial?.height
                        : initial?.width
                );
                panel = this.createPanel(options, group);
                group.model.openPanel(panel, {
                    skipSetActive: options.inactive,
                    skipSetGroupActive: options.inactive,
                    index,
                });

                if (!options.inactive) {
                    this.doSetGroupAndPanelActive(group);
                }
            }
        } else if (options.floating) {
            const group = this.createGroup();
            this._onDidAddGroup.fire(group);

            const coordinates =
                typeof options.floating === 'object' &&
                options.floating !== null
                    ? options.floating
                    : {};

            this.addFloatingGroup(group, {
                ...coordinates,
                inDragMode: false,
                skipRemoveGroup: true,
                skipActiveGroup: true,
            });

            panel = this.createPanel(options, group);
            group.model.openPanel(panel, {
                skipSetActive: options.inactive,
                skipSetGroupActive: options.inactive,
                index,
            });
        } else {
            const group = this.createGroupAtLocation(
                [0],
                this.gridview.orientation === Orientation.VERTICAL
                    ? initial?.height
                    : initial?.width
            );
            panel = this.createPanel(options, group);
            group.model.openPanel(panel, {
                skipSetActive: options.inactive,
                skipSetGroupActive: options.inactive,
                index,
            });

            if (!options.inactive) {
                this.doSetGroupAndPanelActive(group);
            }
        }

        return panel;
    }

    removePanel(
        panel: IDockviewPanel,
        options?: {
            removeEmptyGroup?: boolean;
            skipDispose?: boolean;
            skipSetActiveGroup?: boolean;
        }
    ): void {
        this.mutation('remove', () =>
            this._doRemovePanel(panel, {
                removeEmptyGroup: options?.removeEmptyGroup ?? true,
                skipDispose: options?.skipDispose,
                skipSetActiveGroup: options?.skipSetActiveGroup,
            })
        );
    }

    private _doRemovePanel(
        panel: IDockviewPanel,
        options: {
            removeEmptyGroup: boolean;
            skipDispose?: boolean;
            skipSetActiveGroup?: boolean;
        }
    ): void {
        const group = panel.group;

        if (!group) {
            throw new Error(
                `dockview: cannot remove panel ${panel.id}. it's missing a group.`
            );
        }

        group.model.removePanel(panel, {
            skipSetActiveGroup: options.skipSetActiveGroup,
        });

        if (!options.skipDispose) {
            panel.group.model.renderContainer.detatch(panel);
            panel.dispose();
        }

        if (group.size === 0 && options.removeEmptyGroup) {
            this.removeGroup(group, { skipActive: options.skipSetActiveGroup });
        }
    }

    createWatermarkComponent(): IWatermarkRenderer {
        if (this.options.createWatermarkComponent) {
            return this.options.createWatermarkComponent();
        }
        return new Watermark();
    }

    addGroup(options?: AddGroupOptions): DockviewGroupPanel {
        return this.mutation('add', () => this._doAddGroup(options));
    }

    private _doAddGroup(options?: AddGroupOptions): DockviewGroupPanel {
        if (options) {
            let referenceGroup: DockviewGroupPanel | undefined;

            if (isGroupOptionsWithPanel(options)) {
                const referencePanel =
                    typeof options.referencePanel === 'string'
                        ? this.panels.find(
                              (panel) => panel.id === options.referencePanel
                          )
                        : options.referencePanel;

                const referencePanelId =
                    typeof options.referencePanel === 'string'
                        ? options.referencePanel
                        : options.referencePanel?.id;

                if (!referencePanel) {
                    throw new Error(
                        `dockview: reference panel ${referencePanelId} does not exist`
                    );
                }

                referenceGroup = this.findGroup(referencePanel);

                if (!referenceGroup) {
                    throw new Error(
                        `dockview: reference group for reference panel ${referencePanelId} does not exist`
                    );
                }
            } else if (isGroupOptionsWithGroup(options)) {
                referenceGroup =
                    typeof options.referenceGroup === 'string'
                        ? this._groups.get(options.referenceGroup)?.value
                        : options.referenceGroup;

                if (!referenceGroup) {
                    const referenceId =
                        typeof options.referenceGroup === 'string'
                            ? options.referenceGroup
                            : options.referenceGroup?.id;
                    throw new Error(
                        `dockview: reference group ${referenceId} does not exist`
                    );
                }
            } else {
                const group = this.orthogonalize(
                    directionToPosition(<Direction>options.direction),
                    options
                );
                if (!options.skipSetActive) {
                    this.doSetGroupAndPanelActive(group);
                }
                return group;
            }

            const target = toTarget(<Direction>options.direction || 'within');

            const location = getGridLocation(referenceGroup.element);
            const relativeLocation = getRelativeLocation(
                this.gridview.orientation,
                location,
                target
            );

            const group = this.createGroup(options);
            const size =
                this.getLocationOrientation(relativeLocation) ===
                Orientation.VERTICAL
                    ? options.initialHeight
                    : options.initialWidth;
            this.doAddGroup(group, relativeLocation, size);
            if (!options.skipSetActive) {
                this.doSetGroupAndPanelActive(group);
            }
            return group;
        } else {
            const group = this.createGroup(options);

            this.doAddGroup(group);
            this.doSetGroupAndPanelActive(group);
            return group;
        }
    }

    private getLocationOrientation(location: number[]) {
        return location.length % 2 == 0 &&
            this.gridview.orientation === Orientation.HORIZONTAL
            ? Orientation.HORIZONTAL
            : Orientation.VERTICAL;
    }

    removeGroup(
        group: DockviewGroupPanel,
        options?:
            | {
                  skipActive?: boolean;
                  skipDispose?: boolean;
                  skipPopoutAssociated?: boolean;
                  skipPopoutReturn?: boolean;
              }
            | undefined
    ): void {
        this.mutation('remove', () => this.doRemoveGroup(group, options));
    }

    /**
     * Detach a single group from the nested gridview of its floating / popout
     * window, keeping the window and its remaining members alive, and reassign
     * the window's anchor if the detached group was it.
     *
     * @returns `true` if the group was detached from a multi-member window;
     * `false` if `group` is not in a nested window, or is the window's only
     * member, in which case the caller is responsible for disposing the whole
     * window.
     */
    private detachFromNestedWindow(group: DockviewGroupPanel): boolean {
        const floating = this._floatingGroupService?.findByGroup(group);
        if (floating) {
            const members = this.nestedWindowMembers(group);
            if (members.length <= 1) {
                return false;
            }
            floating.gridview.remove(group);
            if (floating.group === group) {
                // The anchor left; promote a remaining member.
                floating.setAnchorGroup(members.find((m) => m !== group)!);
            }
            return true;
        }

        const popout = this._popoutWindowService?.findByGroup(group);
        if (popout) {
            const members = this.nestedWindowMembers(group);
            if (members.length <= 1) {
                return false;
            }
            popout.gridview.remove(group);
            if (popout.popoutGroup === group) {
                // The anchor left; promote a remaining member and rebind the
                // window's anchor-relative state (focus routing) to it. The
                // popup service resolves per-member so needs no rebinding.
                popout.setAnchorGroup(members.find((m) => m !== group)!);
            }
            return true;
        }

        return false;
    }

    /**
     * Dispose a group and forget it: remove it from `_groups` and fire the
     * removed event.
     */
    private disposeGroupRecord(group: DockviewGroupPanel): void {
        group.dispose();
        this._groups.delete(group.id);
        this._onDidRemoveGroup.fire(group);
    }

    /**
     * When `removed` was the active group, fall the active selection back to
     * the first remaining group (or clear it when none remain).
     */
    private activateFallbackGroupIfRemoved(
        removed: DockviewGroupPanel,
        skipActive?: boolean
    ): void {
        if (!skipActive && this._activeGroup === removed) {
            const groups = Array.from(this._groups.values());
            this.doSetGroupAndPanelActive(
                groups.length > 0 ? groups[0].value : undefined
            );
        }
    }

    protected override doRemoveGroup(
        group: DockviewGroupPanel,
        options?:
            | {
                  skipActive?: boolean;
                  skipDispose?: boolean;
                  skipPopoutAssociated?: boolean;
                  skipPopoutReturn?: boolean;
              }
            | undefined
    ): DockviewGroupPanel {
        // Edge groups are permanent structural elements - never remove them from the layout
        if (this._edgeGroupService?.includes(group)) {
            return group;
        }

        const panels = [...group.panels]; // reassign since group panels will mutate

        if (!options?.skipDispose) {
            for (const panel of panels) {
                this.removePanel(panel, {
                    removeEmptyGroup: false,
                    skipDispose: options?.skipDispose ?? false,
                });
            }
        }

        const activePanel = this.activePanel;

        if (group.api.location.type === 'floating') {
            const floatingGroup =
                this._floatingGroupService?.findByGroup(group);

            if (!floatingGroup) {
                throw new Error('dockview: failed to find floating group');
            }

            if (this.detachFromNestedWindow(group)) {
                // The floating window hosts other groups and stays alive, so
                // finalize just this group.
                if (options?.skipDispose) {
                    // Relocation: reset location so the destination root can
                    // re-tag it.
                    group.model.location = { type: 'grid' };
                } else {
                    this.disposeGroupRecord(group);
                }

                this.activateFallbackGroupIfRemoved(group, options?.skipActive);
                return group;
            }

            // Last group leaving, so dispose the whole floating window.
            if (!options?.skipDispose) {
                this.disposeGroupRecord(group);
            }

            // floatingGroup.dispose() removes itself from the service array
            floatingGroup.dispose();

            this.activateFallbackGroupIfRemoved(group, options?.skipActive);
            return group;
        }

        if (group.api.location.type === 'popout') {
            const selectedGroup = this._popoutWindowService?.findByGroup(group);

            if (!selectedGroup) {
                throw new Error('dockview: failed to find popout group');
            }

            if (this.detachFromNestedWindow(group)) {
                // The popout window hosts other groups and stays alive, so
                // finalize just this group.
                if (options?.skipDispose) {
                    // Relocation: reset location so the destination root can
                    // re-tag it.
                    group.model.location = { type: 'grid' };
                } else {
                    this.disposeGroupRecord(group);
                }

                this.activateFallbackGroupIfRemoved(group, options?.skipActive);
                return group;
            }

            // Last group leaving, so tear the whole popout window down.
            if (!options?.skipDispose) {
                if (!options?.skipPopoutAssociated) {
                    const refGroup = selectedGroup.referenceGroup
                        ? this.getPanel(selectedGroup.referenceGroup)
                        : undefined;
                    if (refGroup?.panels.length === 0) {
                        this.removeGroup(refGroup);
                    }
                }

                selectedGroup.popoutGroup.dispose();

                this._groups.delete(group.id);
                this._onDidRemoveGroup.fire(group);
            }

            this._popoutWindowService?.remove(selectedGroup);

            const removedGroup = selectedGroup.disposable.dispose();

            if (!options?.skipPopoutReturn && removedGroup) {
                this.doAddGroup(removedGroup, [0]);
                this.doSetGroupAndPanelActive(removedGroup);
            }

            this.activateFallbackGroupIfRemoved(group, options?.skipActive);
            return selectedGroup.popoutGroup;
        }

        // A `grid`-location group whose element isn't actually in the gridview
        // is an orphan, e.g. a popout-destined group created during fromJSON
        // whose window hasn't opened yet, swept up by clear()/a re-entrant
        // fromJSON. `gridview.remove()` would throw "Invalid grid element", so
        // dispose it directly.
        if (!this.gridview.element.contains(group.element)) {
            if (!options?.skipDispose) {
                const item = this._groups.get(group.id);
                item?.disposable.dispose();
                this.disposeGroupRecord(group);
            }

            this.activateFallbackGroupIfRemoved(group, options?.skipActive);

            return group;
        }

        const re = super.doRemoveGroup(group, options);

        if (!options?.skipActive) {
            if (this.activePanel !== activePanel) {
                this.fireActivePanelChange(this.activePanel);
            }
        }

        return re;
    }

    private _moving = false;
    private _updatePositionsFrameId: number | undefined;

    private debouncedUpdateAllPositions(): void {
        if (this._updatePositionsFrameId !== undefined) {
            cancelAnimationFrame(this._updatePositionsFrameId);
        }
        this._updatePositionsFrameId = requestAnimationFrame(() => {
            this._updatePositionsFrameId = undefined;

            this.overlayRenderContainer.updateAllPositions();

            // Popout windows have their own render containers; reposition those
            // too so panels moved/split within a popout are laid out (the main
            // container only covers grid + floating, which share it).
            for (const entry of this._popoutWindowService?.entries ?? []) {
                entry.overlayRenderContainer.updateAllPositions();
            }
        });
    }

    movingLock<T>(func: () => T): T {
        const isMoving = this._moving;

        try {
            this._moving = true;
            return func();
        } finally {
            this._moving = isMoving;
        }
    }

    /**
     * Bracket a structural mutation with `onWillMutateLayout` /
     * `onDidMutateLayout`. Re-entrant: nested calls (a compound operation such
     * as a drag that relocates a panel) join the outermost transaction, so the
     * events fire exactly once around the whole operation. `kind` reflects the
     * outermost mutation.
     */
    mutation<T>(kind: DockviewLayoutMutationKind, func: () => T): T {
        const outer = this._mutationDepth === 0;
        const origin = this._origin;
        if (outer) {
            this._onWillMutateLayout.fire({ kind, origin });
        }
        this._mutationDepth++;
        try {
            return func();
        } finally {
            this._mutationDepth--;
            if (outer) {
                this._onDidMutateLayout.fire({ kind, origin });
            }
        }
    }

    /**
     * The origin of the operation currently in progress (`'user'` by default).
     * Read inside a `mutation()` or active-panel change to learn whether the
     * change was driven by application code (via the {@link DockviewApi}) or a
     * user gesture.
     */
    currentOrigin(): DockviewOrigin {
        return this._origin;
    }

    /**
     * Run `func` with the operation origin set to `origin`, restoring the
     * previous value afterwards. Used by the DockviewApi boundary to tag
     * programmatic operations as `'api'`, and by user-gesture handlers to tag
     * `'user'`. Only the outermost caller sets the origin; a nested call (or a
     * call made while a mutation is already in flight) keeps whatever the
     * enclosing operation established, so the trigger always wins.
     */
    withOrigin<T>(origin: DockviewOrigin, func: () => T): T {
        if (this._originDepth > 0 || this._mutationDepth > 0) {
            return func();
        }
        const previous = this._origin;
        this._origin = origin;
        this._originDepth++;
        try {
            return func();
        } finally {
            this._originDepth--;
            this._origin = previous;
        }
    }

    /**
     * Fire `onDidActivePanelChange` with the panel and the current operation
     * {@link DockviewOrigin}. Callers keep their own dedupe guards.
     */
    private fireActivePanelChange(panel: IDockviewPanel | undefined): void {
        this._onDidActivePanelChange.fire({ panel, origin: this._origin });
    }

    moveGroupOrPanel(options: MoveGroupOrPanelOptions): void {
        this.mutation('move', () => this._doMoveGroupOrPanel(options));
    }

    private _doMoveGroupOrPanel(options: MoveGroupOrPanelOptions): void {
        const destinationGroup = options.to.group;
        const sourceGroupId = options.from.groupId;
        const sourceItemId = options.from.panelId;
        const destinationTarget = options.to.position;
        const destinationIndex = options.to.index;

        const sourceGroup = sourceGroupId
            ? this._groups.get(sourceGroupId)?.value
            : undefined;

        if (!sourceGroup) {
            throw new Error(
                `dockview: Failed to find group id ${sourceGroupId}`
            );
        }

        if (sourceItemId === undefined) {
            if (options.from.tabGroupId) {
                /**
                 * Moving a tab group (subset of panels) into another group
                 */
                this.moveTabGroupToGroup({
                    sourceGroup,
                    tabGroupId: options.from.tabGroupId,
                    destinationGroup,
                    destinationTarget,
                    destinationIndex,
                    skipSetActive: options.skipSetActive,
                    keepEmptyGroups: options.keepEmptyGroups,
                });
            } else {
                /**
                 * Moving an entire group into another group
                 */
                this.moveGroup({
                    from: { group: sourceGroup },
                    to: {
                        group: destinationGroup,
                        position: destinationTarget,
                    },
                    skipSetActive: options.skipSetActive,
                });
            }
            return;
        }

        if (!destinationTarget || destinationTarget === 'center') {
            /**
             * Dropping a panel within another group
             */

            const removedPanel: IDockviewPanel | undefined = this.movingLock(
                () =>
                    sourceGroup.model.removePanel(sourceItemId, {
                        skipSetActive: false,
                        skipSetActiveGroup: true,
                    })
            );

            if (!removedPanel) {
                throw new Error(`dockview: No panel with id ${sourceItemId}`);
            }

            if (!options.keepEmptyGroups && sourceGroup.model.size === 0) {
                // remove the group and do not set a new group as active
                this.doRemoveGroup(sourceGroup, { skipActive: true });
            }

            // Check if destination group is empty - if so, force render the component
            const isDestinationGroupEmpty = destinationGroup.model.size === 0;

            this.movingLock(() =>
                destinationGroup.model.openPanel(removedPanel, {
                    index: destinationIndex,
                    skipSetActive:
                        (options.skipSetActive ?? false) &&
                        !isDestinationGroupEmpty,
                    skipSetGroupActive: true,
                })
            );
            if (!options.skipSetActive) {
                this.doSetGroupAndPanelActive(destinationGroup);
            }

            this._onDidMovePanel.fire({
                panel: removedPanel,
                from: sourceGroup,
            });
        } else {
            /**
             * Dropping a panel to the extremities of a group which will place that panel
             * into an adjacent group
             */

            // The destination group may live in the main grid or in a floating
            // window's nested gridview, so resolve which root we are dropping
            // into so locations/orientation are computed against it.
            const destinationGridview =
                this.getGridviewForGroup(destinationGroup);

            const referenceLocation = getGridLocation(destinationGroup.element);
            const targetLocation = getRelativeLocation(
                destinationGridview.orientation,
                referenceLocation,
                destinationTarget
            );

            if (sourceGroup.size < 2) {
                /**
                 * If we are moving from a group which only has one panel left we will consider
                 * moving the group itself rather than moving the panel into a newly created group
                 */

                const [targetParentLocation, to] = tail(targetLocation);

                if (
                    sourceGroup.api.location.type === 'grid' &&
                    destinationGridview === this.gridview
                ) {
                    const sourceLocation = getGridLocation(sourceGroup.element);
                    const [sourceParentLocation, from] = tail(sourceLocation);

                    if (
                        sequenceEquals(
                            sourceParentLocation,
                            targetParentLocation
                        )
                    ) {
                        // special case when 'swapping' two views within same grid location
                        // if a group has one tab - we are essentially moving the 'group'
                        // which is equivalent to swapping two views in this case
                        this.gridview.moveView(sourceParentLocation, from, to);

                        this._onDidMovePanel.fire({
                            panel: this.getGroupPanel(sourceItemId)!,
                            from: sourceGroup,
                        });

                        return;
                    }
                }

                if (
                    sourceGroup.api.location.type === 'popout' &&
                    this.nestedWindowMembers(sourceGroup).length <= 1
                ) {
                    /**
                     * the source group is the only group in a popout window and
                     * has a single panel
                     *
                     * 1. remove the panel from the group without triggering any events
                     * 2. remove the popout group; this may cascade-remove the empty
                     *    reference group it left behind in the main grid (see
                     *    doRemoveGroup for popout groups), which can shift grid indices
                     * 3. recompute the target location now that the grid is stable
                     * 4. create a new group at the recomputed location and add that panel
                     *
                     * Multi-group popout windows fall through to the generic
                     * detach-and-re-add path so the window stays alive.
                     */

                    const popoutGroup =
                        this._popoutWindowService?.findByGroup(sourceGroup);
                    if (!popoutGroup) {
                        return;
                    }

                    const removedPanel: IDockviewPanel | undefined =
                        this.movingLock(() =>
                            popoutGroup.popoutGroup.model.removePanel(
                                popoutGroup.popoutGroup.panels[0],
                                {
                                    skipSetActive: true,
                                    skipSetActiveGroup: true,
                                }
                            )
                        );

                    this.doRemoveGroup(sourceGroup, { skipActive: true });

                    const updatedTargetLocation = getRelativeLocation(
                        destinationGridview.orientation,
                        getGridLocation(destinationGroup.element),
                        destinationTarget
                    );

                    const newGroup = this.createGroupAtLocation(
                        updatedTargetLocation,
                        undefined,
                        undefined,
                        destinationGridview
                    );
                    this.movingLock(() =>
                        newGroup.model.openPanel(removedPanel, {
                            skipSetActive: true,
                        })
                    );
                    this.doSetGroupAndPanelActive(newGroup);

                    this._onDidMovePanel.fire({
                        panel: this.getGroupPanel(sourceItemId)!,
                        from: sourceGroup,
                    });
                    return;
                }

                if (sourceGroup.api.location.type === 'edge') {
                    /**
                     * Edge groups are permanent structural elements; never move the
                     * group itself. Instead extract the panel and create a new grid group,
                     * leaving the edge slot intact (same behaviour as the size >= 2 path).
                     */
                    const removedPanel: IDockviewPanel | undefined =
                        this.movingLock(() =>
                            sourceGroup.model.removePanel(sourceItemId, {
                                skipSetActive: false,
                                skipSetActiveGroup: true,
                            })
                        );

                    if (!removedPanel) {
                        throw new Error(
                            `dockview: No panel with id ${sourceItemId}`
                        );
                    }

                    const newGroup = this.createGroupAtLocation(
                        targetLocation,
                        undefined,
                        undefined,
                        destinationGridview
                    );
                    this.movingLock(() =>
                        newGroup.model.openPanel(removedPanel, {
                            skipSetGroupActive: true,
                        })
                    );
                    this.doSetGroupAndPanelActive(newGroup);

                    this._onDidMovePanel.fire({
                        panel: removedPanel,
                        from: sourceGroup,
                    });
                    return;
                }

                // source group will become empty so delete the group
                const targetGroup = this.movingLock(() =>
                    this.doRemoveGroup(sourceGroup, {
                        skipActive: true,
                        skipDispose: true,
                    })
                );

                // after deleting the group we need to re-evaulate the ref location
                const updatedReferenceLocation = getGridLocation(
                    destinationGroup.element
                );

                const location = getRelativeLocation(
                    destinationGridview.orientation,
                    updatedReferenceLocation,
                    destinationTarget
                );
                this.movingLock(() =>
                    this.doAddGroup(
                        targetGroup,
                        location,
                        undefined,
                        destinationGridview
                    )
                );
                this.setGroupLocationForRoot(targetGroup, destinationGridview);
                this.doSetGroupAndPanelActive(targetGroup);

                this._onDidMovePanel.fire({
                    panel: this.getGroupPanel(sourceItemId)!,
                    from: sourceGroup,
                });
            } else {
                /**
                 * The group we are removing from has many panels, we need to remove the panels we are moving,
                 * create a new group, add the panels to that new group and add the new group in an appropiate position
                 */
                const removedPanel: IDockviewPanel | undefined =
                    this.movingLock(() =>
                        sourceGroup.model.removePanel(sourceItemId, {
                            skipSetActive: false,
                            skipSetActiveGroup: true,
                        })
                    );

                if (!removedPanel) {
                    throw new Error(
                        `dockview: No panel with id ${sourceItemId}`
                    );
                }

                const dropLocation = getRelativeLocation(
                    destinationGridview.orientation,
                    referenceLocation,
                    destinationTarget
                );

                const group = this.createGroupAtLocation(
                    dropLocation,
                    undefined,
                    undefined,
                    destinationGridview
                );
                this.movingLock(() =>
                    group.model.openPanel(removedPanel, {
                        skipSetGroupActive: true,
                    })
                );
                this.doSetGroupAndPanelActive(group);

                this._onDidMovePanel.fire({
                    panel: removedPanel,
                    from: sourceGroup,
                });
            }
        }
    }

    private moveTabGroupToGroup(options: {
        sourceGroup: DockviewGroupPanel;
        tabGroupId: string;
        destinationGroup: DockviewGroupPanel;
        destinationTarget: Position;
        destinationIndex?: number;
        skipSetActive?: boolean;
        keepEmptyGroups?: boolean;
    }): void {
        const {
            sourceGroup,
            tabGroupId,
            destinationGroup,
            destinationTarget,
            destinationIndex,
        } = options;

        const tabGroup = sourceGroup.model
            .getTabGroups()
            .find((tg) => tg.id === tabGroupId);
        if (!tabGroup || tabGroup.panelIds.length === 0) {
            return;
        }

        // Snapshot tab group metadata before removing panels
        const label = tabGroup.label;
        const color = tabGroup.color;
        const collapsed = tabGroup.collapsed;
        const componentParams = tabGroup.componentParams;
        const panelIds = [...tabGroup.panelIds];

        // Capture the destination's grid location BEFORE potentially
        // removing the source group, in case source === destination and
        // the source becomes empty after panel removal.
        const referenceLocation =
            destinationTarget && destinationTarget !== 'center'
                ? getGridLocation(destinationGroup.element)
                : undefined;

        // Remove panels from the source group
        const removedPanels = this.movingLock(() =>
            panelIds
                .map((pid) =>
                    sourceGroup.model.removePanel(pid, {
                        skipSetActive: false,
                        skipSetActiveGroup: true,
                    })
                )
                .filter((p): p is IDockviewPanel => p !== undefined)
        );

        if (removedPanels.length === 0) {
            return;
        }

        const addPanelsToGroup = (targetGroup: DockviewGroupPanel) => {
            this.movingLock(() => {
                for (const panel of removedPanels) {
                    targetGroup.model.openPanel(panel, {
                        index: destinationIndex,
                        skipSetActive: true,
                        skipSetGroupActive: true,
                    });
                }
            });

            // Recreate the tab group in the destination
            const newTabGroup = targetGroup.model.createTabGroup({
                label,
                color,
                collapsed,
                componentParams,
            });
            for (const panel of removedPanels) {
                targetGroup.model.addPanelToTabGroup(newTabGroup.id, panel.id);
            }

            if (!options.skipSetActive) {
                this.doSetGroupAndPanelActive(targetGroup);
            }

            for (const panel of removedPanels) {
                this._onDidMovePanel.fire({
                    panel,
                    from: sourceGroup,
                });
            }
        };

        let targetGroup: DockviewGroupPanel;
        if (
            !destinationTarget ||
            destinationTarget === 'center' ||
            !referenceLocation
        ) {
            targetGroup = destinationGroup;
        } else {
            const dropLocation = getRelativeLocation(
                this.gridview.orientation,
                referenceLocation,
                destinationTarget
            );
            targetGroup = this.createGroupAtLocation(dropLocation);
        }

        // Remove the source group if it became empty. We compare against
        // the actual targetGroup (which is a freshly-created group for
        // edge drops) rather than the originally-passed destinationGroup,
        // so a tab-group drag onto its own group's edge still cleans up
        // the now-empty source.
        if (
            !options.keepEmptyGroups &&
            sourceGroup.model.size === 0 &&
            sourceGroup !== targetGroup
        ) {
            this.doRemoveGroup(sourceGroup, { skipActive: true });
        }

        addPanelsToGroup(targetGroup);
    }

    moveGroup(options: MoveGroupOptions): void {
        this.mutation('move', () => this._doMoveGroup(options));
    }

    // Bracket maximize/restore as a 'maximize' transaction. The maximized node
    // is serialized by the gridview (`SerializedGridview.maximizedNode`), so
    // the state round-trips through toJSON/fromJSON and is restorable on undo.
    // When the exit is a side-effect of another bracketed operation (e.g. a
    // move that activates a different group) the depth counter folds it in.
    override maximizeGroup(panel: DockviewGroupPanel): void {
        this.mutation('maximize', () => super.maximizeGroup(panel));
    }

    override exitMaximizedGroup(): void {
        this.mutation('maximize', () => super.exitMaximizedGroup());
    }

    private _doMoveGroup(options: MoveGroupOptions): void {
        const from = options.from.group;
        const to = options.to.group;
        const target = options.to.position;

        // The group whose panels end up at the target. For non-edge moves
        // we relocate `from` itself; for edge moves we move panels into a
        // freshly created group so the edge slot stays anchored.
        let source: DockviewGroupPanel = from;

        if (target === 'center') {
            const activePanel = from.activePanel;

            // Snapshot tab group metadata before removing panels so we
            // can recreate the tab groups in the destination after the
            // panels are merged in.
            const tabGroupSnapshots = from.model.getTabGroups().map((tg) => ({
                label: tg.label,
                color: tg.color,
                collapsed: tg.collapsed,
                componentParams: tg.componentParams,
                panelIds: [...tg.panelIds],
            }));

            const panels = this.movingLock(() =>
                [...from.panels].map((p) =>
                    from.model.removePanel(p.id, {
                        skipSetActive: true,
                    })
                )
            );

            if (from?.model.size === 0) {
                this.doRemoveGroup(from, { skipActive: true });
            }

            this.movingLock(() => {
                for (const panel of panels) {
                    to.model.openPanel(panel, {
                        skipSetActive: panel !== activePanel,
                        skipSetGroupActive: true,
                    });
                }
            });

            for (const snapshot of tabGroupSnapshots) {
                const newTabGroup = to.model.createTabGroup({
                    label: snapshot.label,
                    color: snapshot.color,
                    collapsed: snapshot.collapsed,
                    componentParams: snapshot.componentParams,
                });
                for (const panelId of snapshot.panelIds) {
                    to.model.addPanelToTabGroup(newTabGroup.id, panelId);
                }
            }

            // Ensure group becomes active after move
            if (options.skipSetActive !== true) {
                // For center moves (merges), we need to ensure the target group is active
                // unless explicitly told not to (skipSetActive: true)
                this.doSetGroupAndPanelActive(to);
            } else if (!this.activePanel) {
                // Even with skipSetActive: true, ensure there's an active panel if none exists
                // This maintains basic functionality while respecting skipSetActive
                this.doSetGroupAndPanelActive(to);
            }
        } else {
            if (from.api.location.type === 'edge') {
                /**
                 * Edge groups are permanent structural elements and must
                 * stay anchored in their edge slot. Move the panels into a
                 * new group; the auto-collapse listener registered in
                 * addEdgeGroup will collapse the now-empty edge slot once
                 * the last panel leaves. The placement code below then
                 * positions `source` like any other moved group.
                 */
                const activePanel = from.activePanel;

                // Snapshot tab group metadata so the new group inherits
                // the tab grouping from the edge slot.
                const tabGroupSnapshots = from.model
                    .getTabGroups()
                    .map((tg) => ({
                        label: tg.label,
                        color: tg.color,
                        collapsed: tg.collapsed,
                        componentParams: tg.componentParams,
                        panelIds: [...tg.panelIds],
                    }));

                const movedPanels = this.movingLock(() =>
                    [...from.panels].map((p) =>
                        from.model.removePanel(p.id, { skipSetActive: true })
                    )
                );
                source = this.createGroup();
                // The new source group enters the layout via gridview.addView
                // below, which bypasses doAddGroup and so doesn't fire
                // BaseGrid._onDidAdd. Modules (TabGroupChips, etc.) drive
                // per-group attachment off _onDidAddGroup, so we fire it
                // explicitly here, matching the pattern in addFloatingGroup
                // and addEdgeGroup.
                this._onDidAddGroup.fire(source);
                this.movingLock(() => {
                    for (const panel of movedPanels) {
                        source.model.openPanel(panel, {
                            skipSetActive: panel !== activePanel,
                            skipSetGroupActive: true,
                        });
                    }
                });

                for (const snapshot of tabGroupSnapshots) {
                    const newTabGroup = source.model.createTabGroup({
                        label: snapshot.label,
                        color: snapshot.color,
                        collapsed: snapshot.collapsed,
                        componentParams: snapshot.componentParams,
                    });
                    for (const panelId of snapshot.panelIds) {
                        source.model.addPanelToTabGroup(
                            newTabGroup.id,
                            panelId
                        );
                    }
                }
            } else {
                switch (from.api.location.type) {
                    case 'grid':
                        this.gridview.removeView(getGridLocation(from.element));
                        break;
                    case 'floating': {
                        const selectedFloatingGroup =
                            this._floatingGroupService?.findByGroup(from);
                        if (!selectedFloatingGroup) {
                            throw new Error(
                                'dockview: failed to find floating group'
                            );
                        }

                        // Detach just this group from the floating window's
                        // nested gridview, keeping the window (and its other
                        // groups) alive. If it was the only member, dispose the
                        // whole window.
                        if (!this.detachFromNestedWindow(from)) {
                            selectedFloatingGroup.dispose();
                        }
                        break;
                    }
                    case 'popout': {
                        const selectedPopoutGroup =
                            this._popoutWindowService?.findByGroup(from);
                        if (!selectedPopoutGroup) {
                            throw new Error(
                                'dockview: failed to find popout group'
                            );
                        }

                        // Detach just this group from the popout window's
                        // nested gridview, keeping the window + its other groups
                        // alive. Destination containers/location are applied by
                        // the placement block below.
                        if (this.detachFromNestedWindow(from)) {
                            break;
                        }

                        // Last group leaving, so tear the window down. Remove from
                        // the service first to prevent automatic restoration.
                        this._popoutWindowService?.remove(selectedPopoutGroup);

                        // Clean up the reference group (ghost) if it exists and is hidden
                        if (selectedPopoutGroup.referenceGroup) {
                            const referenceGroup = this.getPanel(
                                selectedPopoutGroup.referenceGroup
                            );
                            if (
                                referenceGroup &&
                                !referenceGroup.api.isVisible
                            ) {
                                this.doRemoveGroup(referenceGroup, {
                                    skipActive: true,
                                });
                            }
                        }

                        // Dispose the window without triggering restoration. The
                        // placement block below applies the destination
                        // location and containers to `from`.
                        selectedPopoutGroup.window.dispose();

                        break;
                    }
                }
            }

            // Place `source` next to `to`, in whichever gridview root `to`
            // lives in. When `to` is inside a floating / popout window this
            // splits that window's nested layout rather than spawning a new one.
            if (
                to.api.location.type === 'grid' ||
                to.api.location.type === 'floating' ||
                to.api.location.type === 'popout'
            ) {
                const destGridview = this.getGridviewForGroup(to);
                const referenceLocation = getGridLocation(to.element);
                const dropLocation = getRelativeLocation(
                    destGridview.orientation,
                    referenceLocation,
                    target
                );

                let size: number;

                switch (destGridview.orientation) {
                    case Orientation.VERTICAL:
                        size =
                            referenceLocation.length % 2 == 0
                                ? from.api.width
                                : from.api.height;
                        break;
                    case Orientation.HORIZONTAL:
                        size =
                            referenceLocation.length % 2 == 0
                                ? from.api.height
                                : from.api.width;
                        break;
                }

                destGridview.addView(source, size, dropLocation);
                this.setGroupLocationForRoot(source, destGridview);
            }
        }

        source.panels.forEach((panel) => {
            this._onDidMovePanel.fire({ panel, from });
        });

        this.debouncedUpdateAllPositions();

        // Ensure group becomes active after move
        if (options.skipSetActive === false) {
            // Only activate when explicitly requested (skipSetActive: false)
            // Use 'to' group for non-center moves since 'from' may have been destroyed
            const targetGroup = to ?? from;
            this.doSetGroupAndPanelActive(targetGroup);
        } else if (source !== from && options.skipSetActive !== true) {
            // Edge group moves create a fresh `source` group; activate it
            // by default so the moved panels receive focus.
            this.doSetGroupAndPanelActive(source);
        }
    }

    override doSetGroupActive(group: DockviewGroupPanel | undefined): void {
        super.doSetGroupActive(group);

        const activePanel = this.activePanel;

        if (
            !this._moving &&
            activePanel !== this._onDidActivePanelChange.value?.panel
        ) {
            this.fireActivePanelChange(activePanel);
        }
    }

    doSetGroupAndPanelActive(group: DockviewGroupPanel | undefined): void {
        super.doSetGroupActive(group);

        const activePanel = this.activePanel;

        if (
            group &&
            this.hasMaximizedGroup() &&
            !this.isMaximizedGroup(group)
        ) {
            this.exitMaximizedGroup();
        }

        if (
            !this._moving &&
            activePanel !== this._onDidActivePanelChange.value?.panel
        ) {
            this.fireActivePanelChange(activePanel);
        }
    }

    private getNextGroupId(): string {
        let id = this.nextGroupId.next();
        while (this._groups.has(id)) {
            id = this.nextGroupId.next();
        }

        return id;
    }

    createGroup(options?: GroupOptions): DockviewGroupPanel {
        options ??= {};

        let id = options?.id;

        if (id && this._groups.has(options.id!)) {
            console.warn(
                `dockview: Duplicate group id ${options?.id}. reassigning group id to avoid errors`
            );
            id = undefined;
        }

        if (!id) {
            id = this.nextGroupId.next();
            while (this._groups.has(id)) {
                id = this.nextGroupId.next();
            }
        }

        const view = new DockviewGroupPanel(this, id, options);
        view.init({ params: {}, accessor: this });

        if (!this._groups.has(view.id)) {
            const disposable = new CompositeDisposable(
                view.model.onTabDragStart((event) => {
                    this._advancedDnDService?.dispatchWillDragPanel(event);
                }),
                view.model.onGroupDragStart((event) => {
                    this._advancedDnDService?.dispatchWillDragGroup(event);
                }),
                view.model.onMove((event) => {
                    const { groupId, itemId, target, index, tabGroupId } =
                        event;
                    this.moveGroupOrPanel({
                        from: {
                            groupId: groupId,
                            panelId: itemId,
                            tabGroupId,
                        },
                        to: {
                            group: view,
                            position: target,
                            index,
                        },
                    });
                }),
                view.model.onDidDrop((event) => {
                    this._onDidDrop.fire(event);
                }),
                view.model.onWillDrop((event) => {
                    this._advancedDnDService?.dispatchWillDrop(event);
                }),
                view.model.onWillShowOverlay((event) => {
                    if (this.options.disableDnd) {
                        // Engine policy; stays in core, ahead of any
                        // customisation dispatch.
                        event.preventDefault();
                        return;
                    }

                    this._advancedDnDService?.dispatchWillShowOverlay(event);
                }),
                view.model.onUnhandledDragOver((event) => {
                    this._onUnhandledDragOver.fire(event);
                }),
                view.model.onDidAddPanel((event) => {
                    if (this._moving) {
                        return;
                    }
                    this._onDidAddPanel.fire(event.panel);
                }),
                view.model.onDidRemovePanel((event) => {
                    if (this._moving) {
                        return;
                    }
                    this._onDidRemovePanel.fire(event.panel);
                }),
                view.model.onDidActivePanelChange((event) => {
                    if (this._moving) {
                        return;
                    }

                    if (event.panel !== this.activePanel) {
                        return;
                    }

                    if (
                        this._onDidActivePanelChange.value?.panel !==
                        event.panel
                    ) {
                        this.fireActivePanelChange(event.panel);
                    }
                }),
                Event.any(
                    view.model.onDidPanelTitleChange,
                    view.model.onDidPanelParametersChange
                )(() => {
                    this._bufferOnDidLayoutChange.fire();
                })
            );

            this._groups.set(view.id, { value: view, disposable });
        }

        // TODO: must be called after the above listeners have been setup, not an ideal pattern
        view.initialize();

        return view;
    }

    private createPanel(
        options: AddPanelOptions,
        group: DockviewGroupPanel
    ): DockviewPanel {
        const contentComponent = options.component;
        const tabComponent =
            options.tabComponent ?? this.options.defaultTabComponent;

        const view = new DockviewPanelModel(
            this,
            options.id,
            contentComponent,
            tabComponent
        );

        const panel = new DockviewPanel(
            options.id,
            contentComponent,
            tabComponent,
            this,
            this._api,
            group,
            view,
            {
                renderer: options.renderer,
                minimumWidth: options.minimumWidth,
                minimumHeight: options.minimumHeight,
                maximumWidth: options.maximumWidth,
                maximumHeight: options.maximumHeight,
            }
        );

        panel.init({
            title: options.title ?? options.id,
            params: options?.params ?? {},
        });

        return panel;
    }

    private createGroupAtLocation(
        location: number[],
        size?: number,
        options?: GroupOptions,
        gridview: Gridview = this.gridview
    ): DockviewGroupPanel {
        const group = this.createGroup(options);
        this.doAddGroup(group, location, size, gridview);
        this.setGroupLocationForRoot(group, gridview);
        return group;
    }

    /**
     * Tag a group with the location and render / drop-target containers
     * matching the gridview root it now lives in: the main grid, a floating
     * window (shares the main containers), or a popout window (uses its own
     * window-local containers).
     */
    private setGroupLocationForRoot(
        group: DockviewGroupPanel,
        gridview: Gridview
    ): void {
        const popout = this._popoutWindowService?.entries.find(
            (entry) => entry.gridview === gridview
        );

        if (popout) {
            if (group.model.renderContainer !== popout.overlayRenderContainer) {
                group.model.renderContainer = popout.overlayRenderContainer;
            }
            group.model.dropTargetContainer = popout.dropTargetContainer;
            group.model.location = {
                type: 'popout',
                getWindow: popout.getWindow,
                popoutUrl: popout.popoutUrl,
            };
            return;
        }

        // grid / floating both render through the main containers
        if (group.model.renderContainer !== this.overlayRenderContainer) {
            group.model.renderContainer = this.overlayRenderContainer;
        }
        group.model.dropTargetContainer = this.rootDropTargetContainer;
        group.model.location =
            gridview === this.gridview
                ? { type: 'grid' }
                : { type: 'floating' };
    }

    /**
     * Resolve which gridview root currently owns a group: the main grid, or
     * the nested gridview of the floating / popout window it lives in.
     */
    getGridviewForGroup(group: DockviewGroupPanel): Gridview {
        const floating = this._floatingGroupService?.findByGroup(group);
        if (floating) {
            return floating.gridview;
        }
        // Use findByGroup (anchor-identity or containment) for symmetry with
        // the floating branch; it also resolves an anchor whose element is
        // briefly detached from the gridview during a move/restore.
        const popout = this._popoutWindowService?.findByGroup(group);
        if (popout) {
            return popout.gridview;
        }
        return this.gridview;
    }

    /**
     * The groups that live within the same floating / popout window as `group`
     * (including `group` itself). Empty when `group` is in the main grid.
     */
    private nestedWindowMembers(
        group: DockviewGroupPanel
    ): DockviewGroupPanel[] {
        const gridview = this.getGridviewForGroup(group);
        if (gridview === this.gridview) {
            return [];
        }
        return this.groups.filter((candidate) =>
            gridview.element.contains(candidate.element)
        );
    }

    private findGroup(panel: IDockviewPanel): DockviewGroupPanel | undefined {
        return Array.from(this._groups.values()).find((group) =>
            group.value.model.containsPanel(panel)
        )?.value;
    }

    private orientationAtLocation(location: number[]) {
        const rootOrientation = this.gridview.orientation;
        return location.length % 2 == 1
            ? rootOrientation
            : orthogonal(rootOrientation);
    }

    private updateTheme(): void {
        const theme = this._options.theme ?? themeAbyss;
        // Apply the theme class only to the shell so edge groups and the
        // main grid both inherit its CSS custom properties via the cascade.
        // Re-declaring it on `.dv-dockview` would block consumer overrides
        // set on the shell from reaching the dockview subtree.
        this._shellThemeClassnames?.setClassNames(theme.className);

        const gap = theme.gap ?? 0;
        this.gridview.margin = gap;
        // Floating / popout windows host their own nested gridviews; keep their
        // gap in sync with the main grid when the theme changes at runtime.
        for (const floating of this.floatingGroups) {
            floating.gridview.margin = gap;
        }
        for (const entry of this._popoutWindowService?.entries ?? []) {
            entry.gridview.margin = gap;
        }
        this._shellManager?.updateTheme(
            gap,
            theme.edgeGroupCollapsedSize ?? 35
        );

        if (theme.dndOverlayBorder === undefined) {
            this.element.style.removeProperty('--dv-drag-over-border');
            this._shellManager?.element.style.removeProperty(
                '--dv-drag-over-border'
            );
        } else {
            this.element.style.setProperty(
                '--dv-drag-over-border',
                theme.dndOverlayBorder
            );
            this._shellManager?.element.style.setProperty(
                '--dv-drag-over-border',
                theme.dndOverlayBorder
            );
        }

        switch (theme.dndOverlayMounting) {
            case 'absolute':
                this.rootDropTargetContainer.disabled = false;
                break;
            case 'relative':
            default:
                this.rootDropTargetContainer.disabled = true;
                break;
        }

        // Toggle a CSS class so theme stylesheets can scope pure-CSS
        // tab group indicator rules to the 'none' mode only.
        const indicatorNone = (theme.tabGroupIndicator ?? 'wrap') === 'none';
        toggleClass(this.element, 'dv-tab-group-indicator-none', indicatorNone);
        if (this._shellManager) {
            toggleClass(
                this._shellManager.element,
                'dv-tab-group-indicator-none',
                indicatorNone
            );
        }

        // Re-render tab group indicators so the new tabGroupIndicator mode takes effect
        for (const group of this.groups) {
            group.model.updateTabGroups();
        }
    }
}
