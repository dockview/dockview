export {
    getPaneData,
    getPanelData,
    LocalSelectionTransfer,
    PaneTransfer,
    PanelTransfer,
} from './dnd/dataTransfer';

/**
 * Events, Emitters and Disposables are very common concepts that many codebases will contain, however we need
 * to export them for dockview framework packages to use.
 * To be a good citizen these are exported with a `Dockview` prefix to prevent accidental use by others.
 */
export { Emitter as DockviewEmitter, Event as DockviewEvent } from './events';
export {
    type IDisposable as DockviewIDisposable,
    MutableDisposable as DockviewMutableDisposable,
    CompositeDisposable as DockviewCompositeDisposable,
    Disposable as DockviewDisposable,
} from './lifecycle';

export * from './panel/types';

export * from './splitview/splitview';
export {
    type SplitviewComponentOptions,
    type PanelViewInitParameters,
    type SplitviewOptions,
    type SplitviewFrameworkOptions,
    PROPERTY_KEYS_SPLITVIEW,
} from './splitview/options';

export * from './paneview/paneview';
export * from './gridview/gridview';
export {
    type GridviewComponentOptions,
    type GridviewOptions,
    type GridviewFrameworkOptions,
    PROPERTY_KEYS_GRIDVIEW,
} from './gridview/options';
export * from './gridview/baseComponentGridview';

export {
    DraggablePaneviewPanel,
    type PaneviewDidDropEvent,
} from './paneview/draggablePaneviewPanel';

export * from './dockview/components/panel/content';
export * from './dockview/components/tab/tab';
export {
    DockviewGroupPanelModel,
    DockviewDidDropEvent,
    DockviewWillDropEvent,
    type DockviewGroupChangeEvent,
    type DockviewGroupActivePanelChangeEvent,
    type DockviewGroupLocation,
} from './dockview/dockviewGroupPanelModel';
export {
    DockviewWillShowOverlayLocationEvent,
    type DockviewTabGroupChangeEvent,
    type DockviewTabGroupCollapsedChangeEvent,
    type DockviewTabGroupPanelChangeEvent,
    type DockviewGroupDropLocation,
} from './dockview/events';
export {
    type TabDragEvent,
    type GroupDragEvent,
} from './dockview/components/titlebar/tabsContainer';
export * from './dockview/types';
export * from './dockview/dockviewGroupPanel';
export {
    type IGroupPanelBaseProps,
    type IDockviewPanelHeaderProps,
    type IDockviewPanelProps,
    type IDockviewHeaderActionsProps,
    type IGroupHeaderProps,
    type IWatermarkPanelProps,
    type DockviewReadyEvent,
    type ITabGroupChipRenderer,
    type IGroupDragGhostRenderer,
} from './dockview/framework';

export * from './dockview/options';
export {
    type PopoutWindowOpenRequest,
    type PopoutWindowFactory,
} from './popoutWindow';
export * from './dockview/theme';
export * from './dockview/dockviewPanel';
export {
    type DockviewTabGroupColor,
    type ITabGroup,
    type SerializedTabGroup,
    type TabGroupOptions,
} from './dockview/tabGroup';
export {
    DEFAULT_TAB_GROUP_COLORS,
    type DockviewTabGroupColorEntry,
    TabGroupColorPalette,
    applyTabGroupAccent,
    resolveTabGroupAccent,
} from './dockview/tabGroupAccent';
export { DefaultTab } from './dockview/components/tab/defaultTab';
export {
    DefaultDockviewDeserialzier,
    type IPanelDeserializer,
} from './dockview/deserializer';

export * from './dockview/dockviewComponent';
export {
    type EdgeGroupOptions,
    type AddEdgeGroupOptions,
    type EdgeGroupPosition,
    type SerializedEdgeGroups,
} from './dockview/dockviewShell';
export * from './gridview/gridviewComponent';
export * from './splitview/splitviewComponent';
export * from './paneview/paneviewComponent';
export {
    type PaneviewComponentOptions,
    type PaneviewOptions,
    type PaneviewFrameworkOptions,
    PROPERTY_KEYS_PANEVIEW,
    PaneviewUnhandledDragOverEvent,
    type PaneviewDndOverlayEvent,
} from './paneview/options';

export * from './gridview/gridviewPanel';
export {
    SplitviewPanel,
    type ISplitviewPanel,
} from './splitview/splitviewPanel';
export * from './paneview/paneviewPanel';
export * from './dockview/types';
export {
    type Box,
    type AnchorPosition,
    type AnchoredBox,
    type DragModifiers,
} from './types';

export { type DockviewPanelRenderer } from './overlay/overlayRenderContainer';

export {
    type Position,
    positionToDirection,
    directionToPosition,
    type MeasuredValue,
    type DroptargetOverlayModel,
    type PositionResolver,
    type PositionResolverArgs,
    type PositionResolverResult,
} from './dnd/droptarget';

export {
    type FocusEvent,
    type PanelDimensionChangeEvent,
    type VisibilityEvent,
    type ActiveEvent,
    type PanelApi,
} from './api/panelApi';
export {
    type SizeEvent,
    type GridviewPanelApi,
    type GridConstraintChangeEvent,
} from './api/gridviewPanelApi';
export {
    type TitleEvent,
    type PinnedChangeEvent,
    type RendererChangedEvent,
    type DockviewPanelApi,
    type DockviewPanelMoveParams,
} from './api/dockviewPanelApi';
export {
    type PanelSizeEvent,
    type PanelConstraintChangeEvent,
    type SplitviewPanelApi,
} from './api/splitviewPanelApi';
export {
    type ExpansionEvent,
    type PaneviewPanelApi,
} from './api/paneviewPanelApi';
export {
    type DockviewGroupPanelApi,
    type DockviewGroupPanelLocationChangeEvent,
    type DockviewGroupPanelCollapsedChangeEvent,
    type DockviewGroupPanelPeekChangeEvent,
    type DockviewGroupPanelHeaderDirectionChangeEvent,
    type DockviewGroupMoveParams,
} from './api/dockviewGroupPanelApi';
export {
    type CommonApi,
    SplitviewApi,
    PaneviewApi,
    GridviewApi,
    DockviewApi,
    type DockviewGetTabGroupsOptions,
} from './api/component.api';
export {
    createDockview,
    createGridview,
    createPaneview,
    createSplitview,
} from './api/entryPoints';
export {
    registerModules,
    getRegisteredModules,
    clearRegisteredModules,
    defineModule,
    type DockviewModule,
    type ServiceCollection,
} from './dockview/modules';
export {
    type IKeyboardNavigationHost,
    type IKeyboardNavigationService,
    type IAdvancedDnDHost,
    type IAdvancedDnDService,
    type IAutoHideEdgeGroupHost,
    type IAutoHideEdgeGroupService,
    type IAutoEdgeGroupHost,
    type IAutoEdgeGroupService,
    type IContextMenuHost,
    type IContextMenuService,
    type IDndCompassHost,
    type IDndCompassService,
    type IKeyboardDockingService,
    type ILayoutHistoryHost,
    type ILayoutHistoryService,
    type LayoutHistoryChangeEvent,
    type LayoutHistoryKind,
    type IMultiRowTabsHost,
    type IMultiRowTabsService,
    type ISmartGuidesHost,
    type ISmartGuidesService,
    type SmartGuidesSnapPosition,
    type SmartGuidesSnapEvent,
    type SmartGuidesSnapTogetherEvent,
    type ITabGroupChipsHost,
    type ITabGroupChipsService,
    type IPinnedTabsHost,
    type IPinnedTabsService,
    type IAdvancedOverflowHost,
    type IAdvancedOverflowService,
    type IAdvancedOverflowRenderContext,
    type AdvancedOverflowRenderParams,
    type IOverflowRow,
} from './dockview/moduleContracts';
export { resolveMessages } from './dockview/accessibilityMessages';
export {
    findRelativeZIndexParent,
    prefersReducedMotion,
    resolveOpaqueBackground,
} from './dom';
export {
    createDismissableLayer,
    type DismissableLayerOptions,
} from './dismissableLayer';
export { type IDragGhostSpec } from './dnd/backend';
export { LiveRegionModule } from './dockview/liveRegionService';
export {
    AdvancedDnDModule,
    AdvancedDnDService,
} from './dockview/advancedDnDService';
export {
    TabGroupChipsModule,
    TabGroupChipsService,
} from './dockview/tabGroupChipsService';
export { FloatingGroupModule } from './dockview/floatingGroupService';
export { EdgeGroupModule } from './dockview/edgeGroupService';
export { createCloseButton, createPinButton } from './svg';
