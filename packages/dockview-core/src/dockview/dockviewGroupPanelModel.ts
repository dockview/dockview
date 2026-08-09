import { DockviewApi } from '../api/component.api';
import { getPanelData, PanelTransfer } from '../dnd/dataTransfer';
import { Droptarget, Position } from '../dnd/droptarget';
import { DockviewComponent, DockviewOrigin } from './dockviewComponent';
import {
    addClasses,
    isAncestor,
    removeClasses,
    toggleClass,
    watchElementResize,
} from '../dom';
import {
    addDisposableListener,
    DockviewEvent,
    Emitter,
    Event,
} from '../events';
import {
    DockviewGroupDropLocation,
    DockviewWillShowOverlayLocationEvent,
} from './events';
import { IViewSize } from '../gridview/gridview';
import { CompositeDisposable, IDisposable } from '../lifecycle';
import {
    IPanel,
    PanelInitParameters,
    PanelUpdateEvent,
    Parameters,
} from '../panel/types';
import {
    ContentContainer,
    IContentContainer,
} from './components/panel/content';
import {
    GroupDragEvent,
    ITabsContainer,
    TabDragEvent,
    TabsContainer,
} from './components/titlebar/tabsContainer';
import { IWatermarkRenderer } from './types';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { IDockviewPanel } from './dockviewPanel';
import {
    DockviewDndOverlayEvent,
    DockviewUnhandledDragOverEvent,
    DockviewHeaderDirection,
    DockviewHeaderPosition,
} from './options';
import { OverlayRenderContainer } from '../overlay/overlayRenderContainer';
import { TitleEvent } from '../api/dockviewPanelApi';
import { Constraints } from '../gridview/gridviewPanel';
import { DropTargetAnchorContainer } from '../dnd/dropTargetAnchorContainer';
import {
    TabGroup,
    ITabGroup,
    SerializedTabGroup,
    TabGroupOptions,
} from './tabGroup';
import { EdgeGroupPosition } from './dockviewShell';

interface GroupMoveEvent {
    groupId: string;
    itemId?: string;
    target: Position;
    index?: number;
    tabGroupId?: string;
}

interface CoreGroupOptions {
    locked?: DockviewGroupPanelLocked;
    hideHeader?: boolean;
    headerPosition?: 'top' | 'bottom' | 'left' | 'right';
    skipSetActive?: boolean;
    constraints?: Partial<Constraints>;
    initialWidth?: number;
    initialHeight?: number;
}

export interface GroupOptions extends CoreGroupOptions {
    readonly panels?: IDockviewPanel[];
    readonly activePanel?: IDockviewPanel;
    readonly id?: string;
}

export interface GroupPanelViewState extends CoreGroupOptions {
    views: string[];
    activeView?: string;
    id: string;
    tabGroups?: SerializedTabGroup[];
}

export interface DockviewGroupChangeEvent {
    readonly panel: IDockviewPanel;
}

/**
 * Payload for the group-level `onDidActivePanelChange`. Extends
 * {@link DockviewGroupChangeEvent} with the {@link DockviewOrigin} so it mirrors
 * the component-level `DockviewActivePanelChangeEvent`. Both report whether the
 * change came from a user gesture or an API call.
 */
export interface DockviewGroupActivePanelChangeEvent
    extends DockviewGroupChangeEvent {
    readonly origin: DockviewOrigin;
}

export interface CreateTabGroupOptions extends TabGroupOptions {
    id?: string;
}

export class DockviewDidDropEvent extends DockviewEvent {
    /**
     * `PointerEvent` for touch drags has no `dataTransfer`; use
     * `getData()` for the dockview payload regardless of input method.
     */
    get nativeEvent(): DragEvent | PointerEvent {
        return this.options.nativeEvent;
    }

    get position(): Position {
        return this.options.position;
    }

    get panel(): IDockviewPanel | undefined {
        return this.options.panel;
    }

    get group(): DockviewGroupPanel | undefined {
        return this.options.group;
    }

    get api(): DockviewApi {
        return this.options.api;
    }

    constructor(
        private readonly options: {
            readonly nativeEvent: DragEvent | PointerEvent;
            readonly position: Position;
            readonly panel?: IDockviewPanel;
            getData(): PanelTransfer | undefined;
            group?: DockviewGroupPanel;
            api: DockviewApi;
        }
    ) {
        super();
    }

    getData(): PanelTransfer | undefined {
        return this.options.getData();
    }
}

export class DockviewWillDropEvent extends DockviewDidDropEvent {
    private readonly _kind: DockviewGroupDropLocation;

    get kind(): DockviewGroupDropLocation {
        return this._kind;
    }

    constructor(options: {
        readonly nativeEvent: DragEvent | PointerEvent;
        readonly position: Position;
        readonly panel?: IDockviewPanel;
        getData(): PanelTransfer | undefined;
        kind: DockviewGroupDropLocation;
        group?: DockviewGroupPanel;
        api: DockviewApi;
    }) {
        super(options);

        this._kind = options.kind;
    }
}

export interface IHeader {
    hidden: boolean;
    direction: DockviewHeaderDirection;
    /** Register a predicate that keeps matching panels out of the overflow
     *  dropdown (used by the PinnedTabs module). No-op default. */
    setOverflowExclude(fn: (panelId: string) => boolean): void;
    /** Register a predicate that forces matching panels into the overflow
     *  dropdown regardless of horizontal fit (used by the MultiRowTabs module
     *  for the surplus rows beyond `overflow.maxRows`). No-op default. */
    setForcedOverflow(fn: (panelId: string) => boolean): void;
    /** Re-evaluate the overflow dropdown now (e.g. after the exclusion set
     *  changed). */
    refreshOverflow(): void;
    /** Enable/disable sticky-on-scroll for pinned tabs (PinnedTabs inline mode):
     *  pinned tabs freeze to the left edge as the strip scrolls. No-op default. */
    setPinnedSticky(enabled: boolean): void;
    /** Register a resolver that clamps/redirects a header drop index (used by
     *  the PinnedTabs module to enforce the pin boundary). Identity default. */
    setDropIndexResolver(fn: (panelId: string, index: number) => number): void;
    /** Mount (or clear, with `undefined`) a second tab row above the main strip
     *  (PinnedTabs `separate-row` mode). The module owns the element. */
    setPinnedRow(el: HTMLElement | undefined): void;
}

export type DockviewGroupPanelLocked = boolean | 'no-drop-target';

export interface IDockviewGroupPanelModel extends IPanel {
    readonly isActive: boolean;
    readonly size: number;
    readonly panels: IDockviewPanel[];
    readonly activePanel: IDockviewPanel | undefined;
    readonly header: IHeader;
    readonly isContentFocused: boolean;
    readonly onDidDrop: Event<DockviewDidDropEvent>;
    readonly onWillDrop: Event<DockviewWillDropEvent>;
    readonly onDidAddPanel: Event<DockviewGroupChangeEvent>;
    readonly onDidRemovePanel: Event<DockviewGroupChangeEvent>;
    readonly onDidActivePanelChange: Event<DockviewGroupActivePanelChangeEvent>;
    readonly onMove: Event<GroupMoveEvent>;
    locked: DockviewGroupPanelLocked;
    headerPosition: DockviewHeaderPosition;
    setActive(isActive: boolean): void;
    initialize(): void;
    relayout(): void;
    readonly tabsListElement: HTMLElement;
    // state
    isPanelActive: (panel: IDockviewPanel) => boolean;
    indexOf(panel: IDockviewPanel): number;
    // panel lifecycle
    openPanel(
        panel: IDockviewPanel,
        options?: {
            index?: number;
            skipFocus?: boolean;
            skipSetPanelActive?: boolean;
            skipSetGroupActive?: boolean;
        }
    ): void;
    closePanel(panel: IDockviewPanel): void;
    closeAllPanels(): void;
    containsPanel(panel: IDockviewPanel): boolean;
    removePanel: (panelOrId: IDockviewPanel | string) => IDockviewPanel;
    moveToNext(options?: {
        panel?: IDockviewPanel;
        suppressRoll?: boolean;
    }): void;
    moveToPrevious(options?: {
        panel?: IDockviewPanel;
        suppressRoll?: boolean;
    }): void;
    canDisplayOverlay(
        event: DragEvent | PointerEvent,
        position: Position,
        target: DockviewGroupDropLocation
    ): boolean;
    updateHeaderActions(): void;
    attachHeaderAction(
        slot: 'left' | 'right' | 'prefix',
        element: HTMLElement | undefined
    ): void;
}

export type DockviewGroupLocation =
    | { type: 'grid' }
    | { type: 'floating' }
    | { type: 'popout'; getWindow: () => Window; popoutUrl?: string }
    | { type: 'edge'; position: EdgeGroupPosition };

export class DockviewGroupPanelModel
    extends CompositeDisposable
    implements IDockviewGroupPanelModel
{
    private readonly tabsContainer: ITabsContainer;
    private readonly contentContainer: IContentContainer;
    private _activePanel: IDockviewPanel | undefined;
    private watermark?: IWatermarkRenderer;
    private _isGroupActive = false;
    private _locked: DockviewGroupPanelLocked = false;
    private _headerPosition: DockviewHeaderPosition | undefined;
    private _headerDirection: DockviewHeaderDirection | undefined;
    private _location: DockviewGroupLocation = { type: 'grid' };
    /**
     * The header (`dv-tabs-and-actions-container`) extent along its occupied
     * axis — `offsetHeight` for a top/bottom header, `offsetWidth` for a
     * left/right one — which `contentDimensions` subtracts from the group box.
     *
     * This was read via `offset*` on *every* `layout()`. Because the read comes
     * after the group's container styles were written, it forces a synchronous
     * reflow, and with N groups a single window-resize frame flushed layout N
     * times (measured: 24 forced reflows/frame at 24 groups, ~68% of resize
     * cost). The extent only changes when the header's tabs change (add/remove/
     * wrap), its axis flips, or it's hidden/shown — never during a plain
     * resize — so we cache it and invalidate on exactly those signals (plus a
     * `ResizeObserver` that also catches CSS/theme-driven height changes and
     * display:none transitions). `undefined` means "dirty; measure on read".
     */
    private _cachedHeaderSize: number | undefined;

    private mostRecentlyUsed: IDockviewPanel[] = [];
    private _overwriteRenderContainer: OverlayRenderContainer | null = null;
    private _overwriteDropTargetContainer: DropTargetAnchorContainer | null =
        null;

    private readonly _onDidChange = new Emitter<IViewSize | undefined>();
    readonly onDidChange: Event<IViewSize | undefined> =
        this._onDidChange.event;

    private _width = 0;
    private _height = 0;

    private readonly _panels: IDockviewPanel[] = [];
    private readonly _panelDisposables = new Map<string, IDisposable>();
    private readonly _tabGroupDisposables = new Map<string, IDisposable>();
    private readonly _pendingMicrotaskDisposables = new Set<IDisposable>();

    private readonly _onMove = new Emitter<GroupMoveEvent>();
    readonly onMove: Event<GroupMoveEvent> = this._onMove.event;

    private readonly _onDidDrop = new Emitter<DockviewDidDropEvent>();
    readonly onDidDrop: Event<DockviewDidDropEvent> = this._onDidDrop.event;

    private readonly _onWillDrop = new Emitter<DockviewWillDropEvent>();
    readonly onWillDrop: Event<DockviewWillDropEvent> = this._onWillDrop.event;

    private readonly _onWillShowOverlay =
        new Emitter<DockviewWillShowOverlayLocationEvent>();
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent> =
        this._onWillShowOverlay.event;

    private readonly _onTabDragStart = new Emitter<TabDragEvent>();
    readonly onTabDragStart: Event<TabDragEvent> = this._onTabDragStart.event;

    private readonly _onGroupDragStart = new Emitter<GroupDragEvent>();
    readonly onGroupDragStart: Event<GroupDragEvent> =
        this._onGroupDragStart.event;

    private readonly _onDidAddPanel = new Emitter<DockviewGroupChangeEvent>();
    readonly onDidAddPanel: Event<DockviewGroupChangeEvent> =
        this._onDidAddPanel.event;

    private readonly _onDidPanelTitleChange = new Emitter<TitleEvent>();
    readonly onDidPanelTitleChange: Event<TitleEvent> =
        this._onDidPanelTitleChange.event;

    private readonly _onDidPanelParametersChange = new Emitter<Parameters>();
    readonly onDidPanelParametersChange: Event<Parameters> =
        this._onDidPanelParametersChange.event;

    private readonly _onDidRemovePanel =
        new Emitter<DockviewGroupChangeEvent>();
    readonly onDidRemovePanel: Event<DockviewGroupChangeEvent> =
        this._onDidRemovePanel.event;

    private readonly _onDidActivePanelChange =
        new Emitter<DockviewGroupActivePanelChangeEvent>();
    readonly onDidActivePanelChange: Event<DockviewGroupActivePanelChangeEvent> =
        this._onDidActivePanelChange.event;

    private readonly _onUnhandledDragOver =
        new Emitter<DockviewDndOverlayEvent>();
    readonly onUnhandledDragOver: Event<DockviewDndOverlayEvent> =
        this._onUnhandledDragOver.event;

    private readonly _tabGroups: TabGroup[] = [];
    private readonly _tabGroupMap = new Map<string, TabGroup>();
    private readonly _panelToTabGroup = new Map<string, TabGroup>();
    private _tabGroupIdCounter = 0;
    private _pendingTabGroupUpdate = false;

    private readonly _onDidCreateTabGroup = new Emitter<{
        tabGroup: ITabGroup;
    }>();
    readonly onDidCreateTabGroup = this._onDidCreateTabGroup.event;

    private readonly _onDidDestroyTabGroup = new Emitter<{
        tabGroup: ITabGroup;
    }>();
    readonly onDidDestroyTabGroup = this._onDidDestroyTabGroup.event;

    private readonly _onDidAddPanelToTabGroup = new Emitter<{
        tabGroup: ITabGroup;
        panelId: string;
    }>();
    readonly onDidAddPanelToTabGroup = this._onDidAddPanelToTabGroup.event;

    private readonly _onDidRemovePanelFromTabGroup = new Emitter<{
        tabGroup: ITabGroup;
        panelId: string;
    }>();
    readonly onDidRemovePanelFromTabGroup =
        this._onDidRemovePanelFromTabGroup.event;

    private readonly _onDidTabGroupChange = new Emitter<{
        tabGroup: ITabGroup;
    }>();
    readonly onDidTabGroupChange = this._onDidTabGroupChange.event;

    private readonly _onDidTabGroupCollapsedChange = new Emitter<{
        tabGroup: ITabGroup;
    }>();
    readonly onDidTabGroupCollapsedChange =
        this._onDidTabGroupCollapsedChange.event;

    private readonly _api: DockviewApi;

    get tabGroups(): readonly ITabGroup[] {
        return this._tabGroups;
    }

    get element(): HTMLElement {
        throw new Error('dockview: not supported');
    }

    get activePanel(): IDockviewPanel | undefined {
        return this._activePanel;
    }

    /** DOM id of the content container (the group's tabpanel), referenced by each tab's `aria-controls`. */
    get contentContainerId(): string {
        return this.contentContainer.element.id;
    }

    /** The group's content drop target; lets keyboard docking preview a drop here. */
    get contentDropTarget(): Droptarget {
        return this.contentContainer.dropTarget;
    }

    get locked(): DockviewGroupPanelLocked {
        return this._locked;
    }

    set locked(value: DockviewGroupPanelLocked) {
        this._locked = value;

        toggleClass(
            this.container,
            'dv-locked-groupview',
            value === 'no-drop-target' || value
        );
    }

    get isActive(): boolean {
        return this._isGroupActive;
    }

    get panels(): IDockviewPanel[] {
        return this._panels;
    }

    get size(): number {
        return this._panels.length;
    }

    get isEmpty(): boolean {
        return this._panels.length === 0;
    }

    get hasWatermark(): boolean {
        return !!(
            this.watermark && this.container.contains(this.watermark.element)
        );
    }

    get header(): IHeader {
        return this.tabsContainer;
    }

    /** The scrollable tab list element (`.dv-tabs-container`), exposed for the
     *  multi-row wrap controller to measure rows / toggle the wrap class. */
    get tabsListElement(): HTMLElement {
        return this.tabsContainer.tabsListElement;
    }

    /** The panel whose tab owns `element` (the tab itself or a descendant of
     *  it), or `undefined` when the target isn't a tab. The robust inverse of a
     *  tab→panel lookup, with no positional/DOM-order assumptions. */
    getPanelForTab(element: Element): IDockviewPanel | undefined {
        return this.tabsContainer.getPanelForTab(element);
    }

    get isContentFocused(): boolean {
        if (!document.activeElement) {
            return false;
        }
        return isAncestor(
            document.activeElement,
            this.contentContainer.element
        );
    }

    get headerPosition(): DockviewHeaderPosition {
        return this._headerPosition ?? 'top';
    }

    set headerPosition(value: DockviewHeaderPosition) {
        this._headerPosition = value;
        // the header may have flipped axis (top/bottom <-> left/right), so the
        // cached extent (measured along the old axis) no longer applies
        this.invalidateHeaderSize();
        removeClasses(
            this.container,
            'dv-groupview-header-top',
            'dv-groupview-header-bottom',
            'dv-groupview-header-left',
            'dv-groupview-header-right'
        );
        addClasses(this.container, `dv-groupview-header-${value}`);

        const direction: DockviewHeaderDirection =
            value === 'top' || value === 'bottom' ? 'horizontal' : 'vertical';
        const previousDirection = this._headerDirection;
        this._headerDirection = direction;
        this.tabsContainer.direction = direction;
        this.header.direction = direction;

        // resize the active panel to fit the new header direction
        // if not, the panel will overflow the tabs container
        if (this._activePanel?.layout) {
            const { width, height } = this.contentDimensions();
            this._activePanel.layout(width, height);
        }

        this.updateHeaderActions();

        // Signal a genuine horizontal↔vertical flip so features that lay out
        // per-axis (e.g. multi-row tab wrapping) can react. Fired after the
        // side effects above, and only on a real axis change, not on the
        // initial set, nor on a same-axis move (top↔bottom, left↔right).
        if (
            previousDirection !== undefined &&
            previousDirection !== direction
        ) {
            this.groupPanel?.api._onDidHeaderDirectionChange.fire({
                direction,
                position: value,
            });
        }
    }

    get location(): DockviewGroupLocation {
        return this._location;
    }

    set location(value: DockviewGroupLocation) {
        this._location = value;

        toggleClass(this.container, 'dv-groupview-floating', false);
        toggleClass(this.container, 'dv-groupview-popout', false);
        toggleClass(this.container, 'dv-groupview-edge', false);

        // Mouse and touch drop targets must agree on accepted zones.
        const applyZones = (zones: Position[]): void => {
            this.contentContainer.dropTarget.setTargetZones(zones);
            this.contentContainer.pointerDropTarget.setTargetZones(zones);
        };

        switch (value.type) {
            case 'grid':
                applyZones(['top', 'bottom', 'left', 'right', 'center']);
                break;
            case 'floating':
                // Floating windows host their own nested gridview, so an edge
                // drop splits the window's layout just like the main grid.
                applyZones(['top', 'bottom', 'left', 'right', 'center']);

                toggleClass(this.container, 'dv-groupview-floating', true);

                break;
            case 'popout':
                // Popout windows host their own nested gridview, so an edge
                // drop splits the window's layout just like the main grid.
                applyZones(['top', 'bottom', 'left', 'right', 'center']);

                toggleClass(this.container, 'dv-groupview-popout', true);

                break;
            case 'edge':
                applyZones(['center']);

                toggleClass(this.container, 'dv-groupview-edge', true);

                break;
        }

        this.groupPanel.api._onDidLocationChange.fire({
            location: this.location,
        });
    }

    constructor(
        private readonly container: HTMLElement,
        private readonly accessor: DockviewComponent,
        public id: string,
        private readonly options: GroupOptions,
        private readonly groupPanel: DockviewGroupPanel
    ) {
        super();

        toggleClass(this.container, 'dv-groupview', true);
        // Each group is a navigable region, labelled by its active panel
        // (see `updateAccessibleLabel`, driven on activation / title change).
        this.container.setAttribute('role', 'region');

        this._api = new DockviewApi(this.accessor);

        this.tabsContainer = new TabsContainer(this.accessor, this.groupPanel);

        this.contentContainer = new ContentContainer(this.accessor, this);

        container.append(
            this.tabsContainer.element,
            this.contentContainer.element
        );

        this.header.hidden = !!options.hideHeader;
        this.locked = options.locked ?? false;
        this.headerPosition =
            options.headerPosition ?? accessor.defaultHeaderPosition;

        this.addDisposables(
            // Keep the cached header extent fresh without reading `offset*` on
            // every layout: re-measure only when the header element actually
            // changes size (tabs wrapping, hide/show — ResizeObserver fires on
            // display:none transitions too — theme-driven height), and relayout
            // the content if the extent moved.
            watchElementResize(this.tabsContainer.element, () => {
                // `watchElementResize` defers via requestAnimationFrame, so a
                // frame queued just before disposal can still fire; don't run
                // layout on a disposed group (mirrors `Resizable`).
                if (this.isDisposed) {
                    return;
                }
                const size = this.measureHeaderSize();
                if (size !== this._cachedHeaderSize) {
                    this._cachedHeaderSize = size;
                    this.layout(this._width, this._height);
                }
            }),
            // Keep the region's accessible name in sync when the active
            // panel's title changes (no-op when a non-active title changes).
            this._onDidPanelTitleChange.event(() =>
                this.updateAccessibleLabel()
            ),
            this._onTabDragStart,
            this._onGroupDragStart,
            this._onWillShowOverlay,
            this.tabsContainer.onTabDragStart((event) => {
                this._onTabDragStart.fire(event);
            }),
            this.tabsContainer.onGroupDragStart((event) => {
                this._onGroupDragStart.fire(event);
            }),
            this.tabsContainer.onDrop((event) => {
                // Capture panel data before handleDropEvent (which may trigger moves)
                const dragData = getPanelData();
                const draggedPanelId = dragData?.panelId ?? null;

                // Let an injected resolver (PinnedTabs) clamp/redirect the drop
                // index, e.g. so an unpinned tab cannot land left of a pinned
                // one. Identity by default; only same-panel header drops carry
                // a panel id to resolve against.
                const resolvedIndex = draggedPanelId
                    ? this.tabsContainer.resolveDropIndex(
                          draggedPanelId,
                          event.index
                      )
                    : event.index;

                this.handleDropEvent(
                    'header',
                    event.event,
                    'center',
                    resolvedIndex
                );

                // Update tab group membership after the move completes
                if (draggedPanelId && event.targetTabGroupId) {
                    // Compute the local index within the target tab group
                    // from the global panel index so the panel is inserted
                    // at the correct position, not just appended.
                    const tabGroup = this._tabGroupMap.get(
                        event.targetTabGroupId
                    );
                    let localIndex: number | undefined;
                    if (tabGroup) {
                        const globalIdx = this._panels.findIndex(
                            (p) => p.id === draggedPanelId
                        );
                        if (globalIdx !== -1) {
                            // Count how many of this group's panels
                            // appear before the dragged panel
                            localIndex = 0;
                            for (const pid of tabGroup.panelIds) {
                                const pidIdx = this._panels.findIndex(
                                    (p) => p.id === pid
                                );
                                if (pidIdx < globalIdx) {
                                    localIndex++;
                                }
                            }
                        }
                    }
                    this.addPanelToTabGroup(
                        event.targetTabGroupId,
                        draggedPanelId,
                        localIndex
                    );
                } else if (draggedPanelId && event.targetTabGroupId === null) {
                    // Dropped outside any group, so remove it from the current group
                    this.removePanelFromTabGroup(draggedPanelId);
                }
            }),

            this.contentContainer.onDidFocus(() => {
                this.accessor.doSetGroupActive(this.groupPanel);
            }),
            this.contentContainer.onDidBlur(() => {
                // noop
            }),
            this.contentContainer.dropTarget.onDrop((event) => {
                this.handleDropEvent(
                    'content',
                    event.nativeEvent,
                    event.position,
                    undefined,
                    event.edge
                );
            }),
            this.contentContainer.pointerDropTarget.onDrop((event) => {
                this.handleDropEvent(
                    'content',
                    event.nativeEvent,
                    event.position,
                    undefined,
                    event.edge
                );
            }),
            this.tabsContainer.onWillShowOverlay((event) => {
                this._onWillShowOverlay.fire(event);
            }),
            this.contentContainer.dropTarget.onWillShowOverlay((event) => {
                this._onWillShowOverlay.fire(
                    new DockviewWillShowOverlayLocationEvent(event, {
                        kind: 'content',
                        panel: this.activePanel,
                        api: this._api,
                        group: this.groupPanel,
                        getData: getPanelData,
                    })
                );
            }),
            this.contentContainer.pointerDropTarget.onWillShowOverlay(
                (event) => {
                    this._onWillShowOverlay.fire(
                        new DockviewWillShowOverlayLocationEvent(event, {
                            kind: 'content',
                            panel: this.activePanel,
                            api: this._api,
                            group: this.groupPanel,
                            getData: getPanelData,
                        })
                    );
                }
            ),
            this._onMove,
            this._onDidChange,
            this._onDidDrop,
            this._onWillDrop,
            this._onDidAddPanel,
            this._onDidRemovePanel,
            this._onDidActivePanelChange,
            this._onUnhandledDragOver,
            this._onDidPanelTitleChange,
            this._onDidPanelParametersChange,
            this._onDidCreateTabGroup,
            this._onDidDestroyTabGroup,
            this._onDidAddPanelToTabGroup,
            this._onDidRemovePanelFromTabGroup,
            this._onDidTabGroupChange,
            this._onDidTabGroupCollapsedChange,
            this._onDidCreateTabGroup.event(() => {
                this._scheduleTabGroupUpdate();
            }),
            this._onDidDestroyTabGroup.event(() => {
                this._scheduleTabGroupUpdate();
            }),
            this._onDidAddPanelToTabGroup.event(() => {
                this._scheduleTabGroupUpdate();
            }),
            this._onDidRemovePanelFromTabGroup.event(() => {
                this._scheduleTabGroupUpdate();
            }),
            this._onDidTabGroupChange.event(() => {
                this._scheduleTabGroupUpdate();
            }),
            this._onDidTabGroupCollapsedChange.event(() => {
                this._scheduleTabGroupUpdate();
            })
        );
    }

    private _scheduleTabGroupUpdate(): void {
        if (this._pendingTabGroupUpdate) {
            return;
        }
        this._pendingTabGroupUpdate = true;
        queueMicrotask(() => {
            this._pendingTabGroupUpdate = false;
            if (!this.isDisposed) {
                this.tabsContainer.updateTabGroups();
            }
        });
    }

    /**
     * Bracket a tab-group mutation as a layout transaction. `accessor` is
     * always a full {@link DockviewComponent} in production; the optional-call
     * fallback keeps partial test doubles (which omit `mutation`) working.
     * When nested inside a larger operation (a drag-driven move, fromJSON
     * restore) the component's depth counter folds it into the outer one.
     */
    private _bracketTabGroupMutation<T>(func: () => T): T {
        return this.accessor.mutation
            ? this.accessor.mutation('tab-group', func)
            : func();
    }

    createTabGroup(options?: CreateTabGroupOptions): ITabGroup {
        return this._bracketTabGroupMutation(() =>
            this._doCreateTabGroup(options)
        );
    }

    private _doCreateTabGroup(options?: CreateTabGroupOptions): ITabGroup {
        const id = options?.id ?? `tg-${this.id}-${this._tabGroupIdCounter++}`;
        const tabGroup = new TabGroup(id, {
            label: options?.label,
            color: options?.color,
            collapsed: options?.collapsed,
            componentParams: options?.componentParams,
        });
        this._tabGroups.push(tabGroup);
        this._tabGroupMap.set(id, tabGroup);

        this._tabGroupDisposables.set(
            id,
            new CompositeDisposable(
                tabGroup.onDidChange(() => {
                    this._onDidTabGroupChange.fire({ tabGroup });
                }),
                tabGroup.onDidCollapseChange((isCollapsed) => {
                    if (isCollapsed) {
                        this._handleGroupCollapse(tabGroup);
                    } else {
                        this._handleGroupExpand(tabGroup);
                    }
                    this._onDidTabGroupCollapsedChange.fire({
                        tabGroup,
                    });
                }),
                tabGroup.onDidDestroy(() => {
                    this._removeTabGroupInternal(tabGroup);
                })
            )
        );

        this._onDidCreateTabGroup.fire({ tabGroup });
        return tabGroup;
    }

    dissolveTabGroup(tabGroupId: string): void {
        const tabGroup = this._tabGroupMap.get(tabGroupId);
        if (!tabGroup) {
            return;
        }

        this._bracketTabGroupMutation(() => {
            // Remove all panels from the group (they stay in the flat panel list)
            const panelIds = [...tabGroup.panelIds];
            for (const panelId of panelIds) {
                tabGroup.removePanel(panelId);
                this._panelToTabGroup.delete(panelId);
                this._onDidRemovePanelFromTabGroup.fire({ tabGroup, panelId });
            }

            tabGroup.dispose();
        });
    }

    addPanelToTabGroup(
        tabGroupId: string,
        panelId: string,
        index?: number
    ): void {
        const tabGroup = this._tabGroupMap.get(tabGroupId);
        if (!tabGroup) {
            return;
        }

        // Ensure the panel actually exists in this group model
        if (!this._panels.some((p) => p.id === panelId)) {
            return;
        }

        // Remove from any existing group first
        const existingGroup = this.getTabGroupForPanel(panelId);
        if (existingGroup?.id === tabGroupId) {
            return; // already in this group, nothing to mutate
        }

        this._bracketTabGroupMutation(() => {
            if (existingGroup) {
                this.removePanelFromTabGroup(panelId);
            }

            tabGroup.addPanel(panelId, index);
            this._panelToTabGroup.set(panelId, tabGroup);

            // Enforce contiguity: move the panel in the flat _panels array
            // to the correct global position matching its group-local index
            this._enforceContiguity(tabGroup, panelId);

            this._onDidAddPanelToTabGroup.fire({ tabGroup, panelId });
        });
    }

    /**
     * Move a panel to a new index within its tab group.
     * Updates both the group's panelIds order and the flat _panels array.
     */
    movePanelWithinGroup(
        tabGroupId: string,
        panelId: string,
        newIndex: number
    ): void {
        const tabGroup = this._tabGroupMap.get(tabGroupId);
        if (!tabGroup?.containsPanel(panelId)) {
            return;
        }

        tabGroup.removePanel(panelId);
        tabGroup.addPanel(panelId, newIndex);

        // Re-enforce contiguity in the flat array
        this._enforceContiguity(tabGroup, panelId);

        this.tabsContainer.updateTabGroups();
    }

    /**
     * Move a panel from one tab group to another.
     */
    movePanelBetweenGroups(
        sourcePanelId: string,
        targetTabGroupId: string,
        targetIndex?: number
    ): void {
        const sourceGroup = this._findTabGroupForPanel(sourcePanelId);
        const targetGroup = this._tabGroupMap.get(targetTabGroupId);

        if (!targetGroup) {
            return;
        }

        if (sourceGroup) {
            sourceGroup.removePanel(sourcePanelId);
            this._panelToTabGroup.delete(sourcePanelId);
            this._onDidRemovePanelFromTabGroup.fire({
                tabGroup: sourceGroup,
                panelId: sourcePanelId,
            });

            // Auto-destroy empty source group
            if (sourceGroup.isEmpty) {
                sourceGroup.dispose();
            }
        }

        targetGroup.addPanel(sourcePanelId, targetIndex);
        this._panelToTabGroup.set(sourcePanelId, targetGroup);
        this._enforceContiguity(targetGroup, sourcePanelId);
        this._onDidAddPanelToTabGroup.fire({
            tabGroup: targetGroup,
            panelId: sourcePanelId,
        });
    }

    /**
     * Move an entire tab group to a new position in the tab bar.
     * The group's internal panel order is preserved.
     */
    moveTabGroup(tabGroupId: string, targetIndex: number): void {
        const tabGroup = this._tabGroupMap.get(tabGroupId);
        if (!tabGroup || tabGroup.panelIds.length === 0) {
            return;
        }

        // Collect group panels in their current order
        const groupPanelIds = new Set(tabGroup.panelIds);
        const groupPanels = tabGroup.panelIds
            .map((pid) => this._panels.find((p) => p.id === pid))
            .filter((p): p is IDockviewPanel => p !== undefined);

        if (groupPanels.length === 0) {
            return;
        }

        // Count how many group panels sit before the target index so
        // we can compensate after removing them from the array.
        let groupPanelsBefore = 0;
        for (let i = 0; i < Math.min(targetIndex, this._panels.length); i++) {
            if (groupPanelIds.has(this._panels[i].id)) {
                groupPanelsBefore++;
            }
        }

        // Remove group panels from the flat array
        for (const panel of groupPanels) {
            const idx = this._panels.indexOf(panel);
            if (idx !== -1) {
                this._panels.splice(idx, 1);
            }
        }

        // Adjust target index to account for removed panels
        const adjustedIndex = targetIndex - groupPanelsBefore;

        // Clamp target index to valid range after removal
        const insertAt = Math.max(
            0,
            Math.min(adjustedIndex, this._panels.length)
        );

        // Insert group panels at the target position
        this._panels.splice(insertAt, 0, ...groupPanels);

        // Rebuild the tabs container to match new order
        for (const panel of this._panels) {
            this.tabsContainer.delete(panel.id);
        }
        for (let i = 0; i < this._panels.length; i++) {
            this.tabsContainer.openPanel(this._panels[i], i);
        }

        this.tabsContainer.updateTabGroups();
    }

    /**
     * Ensure a panel is at the correct global index in _panels
     * to maintain contiguity of its tab group members.
     */
    private _enforceContiguity(tabGroup: TabGroup, panelId: string): void {
        const panel = this._panels.find((p) => p.id === panelId);
        if (!panel) {
            return;
        }

        const localIndex = tabGroup.indexOfPanel(panelId);
        const globalIndex = this._computeGlobalIndex(tabGroup, localIndex);

        const currentIndex = this._panels.indexOf(panel);
        if (currentIndex === globalIndex) {
            return;
        }

        // Move panel in the flat array
        this._panels.splice(currentIndex, 1);
        const adjustedIndex =
            globalIndex > currentIndex ? globalIndex - 1 : globalIndex;
        this._panels.splice(adjustedIndex, 0, panel);

        // Reorder in the tabs container to match
        this.tabsContainer.delete(panelId);
        this.tabsContainer.openPanel(panel, adjustedIndex);
    }

    /**
     * Compute the global index in _panels for a group-local index.
     * Finds where the group's panels start in the flat array and offsets.
     */
    private _computeGlobalIndex(
        tabGroup: TabGroup,
        localIndex: number
    ): number {
        const groupPanelIds = tabGroup.panelIds;

        if (groupPanelIds.length <= 1) {
            // Only one panel (the one being added), keep current position
            const panel = this._panels.find((p) => p.id === groupPanelIds[0]);
            return panel ? this._panels.indexOf(panel) : this._panels.length;
        }

        // Find the first existing group member (other than the one at localIndex)
        // to anchor the group position
        for (let i = 0; i < groupPanelIds.length; i++) {
            if (i === localIndex) {
                continue;
            }
            const existingPanel = this._panels.find(
                (p) => p.id === groupPanelIds[i]
            );
            if (existingPanel) {
                const existingGlobalIndex = this._panels.indexOf(existingPanel);
                // Offset based on relative position within group
                return Math.max(0, existingGlobalIndex + (localIndex - i));
            }
        }

        return this._panels.length;
    }

    removePanelFromTabGroup(panelId: string): void {
        const tabGroup = this._findTabGroupForPanel(panelId);
        if (!tabGroup) {
            return;
        }

        this._bracketTabGroupMutation(() => {
            tabGroup.removePanel(panelId);
            this._panelToTabGroup.delete(panelId);
            this._onDidRemovePanelFromTabGroup.fire({ tabGroup, panelId });

            // Auto-destroy empty groups
            if (tabGroup.isEmpty) {
                tabGroup.dispose();
            }
        });
    }

    getTabGroups(): readonly ITabGroup[] {
        return this._tabGroups;
    }

    updateTabGroups(): void {
        this.tabsContainer.updateTabGroups();
    }

    refreshTabGroupAccent(): void {
        this.tabsContainer.refreshTabGroupAccent();
    }

    refreshWatermark(): void {
        if (this.watermark) {
            this.watermark.element.remove();
            this.watermark.dispose?.();
            this.watermark = undefined;
        }
        this.updateContainer();
    }

    getTabGroupForPanel(panelId: string): ITabGroup | undefined {
        return this._findTabGroupForPanel(panelId);
    }

    private _findTabGroupForPanel(panelId: string): TabGroup | undefined {
        return this._panelToTabGroup.get(panelId);
    }

    private _removeTabGroupInternal(tabGroup: TabGroup): void {
        const index = this._tabGroups.indexOf(tabGroup);
        if (index !== -1) {
            this._tabGroups.splice(index, 1);
            this._tabGroupMap.delete(tabGroup.id);
            for (const panelId of tabGroup.panelIds) {
                this._panelToTabGroup.delete(panelId);
            }

            this._onDidDestroyTabGroup.fire({ tabGroup });

            // Dispose the external listeners (onDidChange, onDidCollapseChange)
            // we registered on this group. We cannot dispose synchronously
            // here because this method runs inside the onDidDestroy fire
            // loop, and disposing the CompositeDisposable that holds the
            // onDidDestroy subscription would splice listeners mid-iteration.
            // Schedule cleanup on the next microtask instead.
            const tabGroupDisposable = this._tabGroupDisposables.get(
                tabGroup.id
            );
            this._tabGroupDisposables.delete(tabGroup.id);
            if (tabGroupDisposable) {
                this._pendingMicrotaskDisposables.add(tabGroupDisposable);
                queueMicrotask(() => {
                    this._pendingMicrotaskDisposables.delete(
                        tabGroupDisposable
                    );
                    tabGroupDisposable.dispose();
                });
            }
        }
    }

    private _handleGroupCollapse(tabGroup: TabGroup): void {
        if (!this._activePanel) {
            return;
        }

        // Only act if the active panel belongs to the collapsed group
        if (!tabGroup.containsPanel(this._activePanel.id)) {
            return;
        }

        const activePanelIndex = this._panels.indexOf(this._activePanel);

        // Search right first, then left, for a visible (non-collapsed-group) panel
        for (let i = activePanelIndex + 1; i < this._panels.length; i++) {
            const candidate = this._panels[i];
            const candidateGroup = this._findTabGroupForPanel(candidate.id);
            if (!candidateGroup?.collapsed) {
                this.doSetActivePanel(candidate);
                this.updateContainer();
                return;
            }
        }

        for (let i = activePanelIndex - 1; i >= 0; i--) {
            const candidate = this._panels[i];
            const candidateGroup = this._findTabGroupForPanel(candidate.id);
            if (!candidateGroup?.collapsed) {
                this.doSetActivePanel(candidate);
                this.updateContainer();
                return;
            }
        }

        // All tabs are in collapsed groups, so show the watermark
        this.contentContainer.closePanel();
        this.doSetActivePanel(undefined);
        this.updateContainer();
    }

    private _handleGroupExpand(tabGroup: TabGroup): void {
        if (this._activePanel) {
            return;
        }

        // Watermark is showing because all groups were collapsed.
        // Activate the first panel in the newly expanded group.
        const firstPanelId = tabGroup.panelIds[0];
        if (firstPanelId) {
            const panel = this._panels.find((p) => p.id === firstPanelId);
            if (panel) {
                this.doSetActivePanel(panel);
                this.updateContainer();
            }
        }
    }

    /** Restore tab groups from serialized data (used by fromJSON) */
    restoreTabGroups(serializedGroups: SerializedTabGroup[]): void {
        // Bump counter past any restored numeric suffixes to avoid ID collisions
        for (const data of serializedGroups) {
            const match = /-(\d+)$/.exec(data.id);
            if (match) {
                const num = Number.parseInt(match[1], 10) + 1;
                if (num > this._tabGroupIdCounter) {
                    this._tabGroupIdCounter = num;
                }
            }
        }

        for (const data of serializedGroups) {
            const tabGroup = this.createTabGroup({
                id: data.id,
                label: data.label,
                color: data.color,
                componentParams: data.componentParams,
            });

            const concreteGroup = this._tabGroupMap.get(tabGroup.id)!;
            for (const panelId of data.panelIds) {
                // Only add panels that actually exist in this group model
                if (this._panels.some((p) => p.id === panelId)) {
                    tabGroup.addPanel(panelId);
                    this._panelToTabGroup.set(panelId, concreteGroup);
                    this._enforceContiguity(concreteGroup, panelId);
                }
            }

            if (data.collapsed) {
                tabGroup.collapse();
            }

            // Auto-destroy if no valid panels were added
            if (tabGroup.isEmpty) {
                tabGroup.dispose();
            }
        }
    }

    focusContent(): void {
        this.contentContainer.element.focus();
    }

    focusActiveTab(): void {
        this.tabsContainer.focusActiveTab();
    }

    set renderContainer(value: OverlayRenderContainer | null) {
        this.panels.forEach((panel) => {
            this.renderContainer.detatch(panel);
        });

        this._overwriteRenderContainer = value;

        this.panels.forEach((panel) => {
            this.rerender(panel);
        });

        // rerender() re-attaches each panel with asActive:false; for the default
        // onlyWhenVisible renderer that loop leaves the active panel's content
        // detached. Re-show it so swapping the render container on an
        // already-populated group (e.g. restoring a popout group from JSON)
        // keeps the active content mounted.
        if (this._activePanel) {
            this.contentContainer.renderPanel(this._activePanel, {
                asActive: true,
            });
        }
    }

    get renderContainer(): OverlayRenderContainer {
        return (
            this._overwriteRenderContainer ??
            this.accessor.overlayRenderContainer
        );
    }

    set dropTargetContainer(value: DropTargetAnchorContainer | null) {
        this._overwriteDropTargetContainer = value;
    }

    get dropTargetContainer(): DropTargetAnchorContainer | null {
        // A floating group can't use an in-place ('relative') drop overlay: the
        // overlay would be appended inside the floating window's stacking
        // context (`.dv-resize-container`), which sits *below* the shell-level
        // render overlay hosting the floating panel's content, so it would be
        // painted over and never seen. Under 'relative' mounting the root
        // container is disabled (grid groups render in-place), so route
        // floating groups through the always-enabled, shell-level floating
        // container instead. Under 'absolute' mounting the root container is
        // enabled and already anchors overlays at the shell level, so floating
        // groups keep sharing it (a single container lets the anchored overlay
        // slide between grid and floating groups without leaving a stale copy).
        if (
            this._location.type === 'floating' &&
            this.accessor.rootDropTargetContainer.disabled
        ) {
            return this.accessor.floatingDropTargetContainer;
        }
        return (
            this._overwriteDropTargetContainer ??
            this.accessor.rootDropTargetContainer
        );
    }

    initialize(): void {
        if (this.options.panels) {
            this.options.panels.forEach((panel) => {
                this.doAddPanel(panel);
            });
        }

        if (this.options.activePanel) {
            this.openPanel(this.options.activePanel);
        }

        // must be run after the constructor otherwise this.parent may not be
        // correctly initialized
        this.setActive(this.isActive, true);
        this.updateContainer();

        this.updateHeaderActions();
    }

    updateHeaderActions(): void {
        this.accessor.headerActionsService?.refresh(this.groupPanel);
    }

    attachHeaderAction(
        slot: 'left' | 'right' | 'prefix',
        element: HTMLElement | undefined
    ): void {
        switch (slot) {
            case 'left':
                this.tabsContainer.setLeftActionsElement(element);
                break;
            case 'right':
                this.tabsContainer.setRightActionsElement(element);
                break;
            case 'prefix':
                this.tabsContainer.setPrefixActionsElement(element);
                break;
        }
    }

    rerender(panel: IDockviewPanel): void {
        this.contentContainer.renderPanel(panel, { asActive: false });
    }

    public indexOf(panel: IDockviewPanel): number {
        return this.tabsContainer.indexOf(panel.id);
    }

    public toJSON(): GroupPanelViewState {
        const result: GroupPanelViewState = {
            views: this.tabsContainer.panels,
            activeView: this._activePanel?.id,
            id: this.id,
        };

        if (this.locked !== false) {
            result.locked = this.locked;
        }

        if (this.header.hidden) {
            result.hideHeader = true;
        }

        if (this.headerPosition !== 'top') {
            result.headerPosition = this.headerPosition;
        }

        if (this._tabGroups.length > 0) {
            result.tabGroups = this._tabGroups.map((tg) => tg.toJSON());
        }

        return result;
    }

    public moveToNext(options?: {
        panel?: IDockviewPanel;
        suppressRoll?: boolean;
    }): void {
        options ??= {};
        options.panel ??= this.activePanel;

        const index = options.panel ? this.panels.indexOf(options.panel) : -1;

        let normalizedIndex: number;

        if (index < this.panels.length - 1) {
            normalizedIndex = index + 1;
        } else if (options.suppressRoll) {
            return;
        } else {
            normalizedIndex = 0;
        }

        this.openPanel(this.panels[normalizedIndex]);
    }

    public moveToPrevious(options?: {
        panel?: IDockviewPanel;
        suppressRoll?: boolean;
    }): void {
        options ??= {};
        options.panel ??= this.activePanel;

        if (!options.panel) {
            return;
        }

        const index = this.panels.indexOf(options.panel);

        let normalizedIndex: number;

        if (index > 0) {
            normalizedIndex = index - 1;
        } else if (options.suppressRoll) {
            return;
        } else {
            normalizedIndex = this.panels.length - 1;
        }

        this.openPanel(this.panels[normalizedIndex]);
    }

    public containsPanel(panel: IDockviewPanel): boolean {
        return this.panels.includes(panel);
    }

    init(_params: PanelInitParameters): void {
        //noop
    }

    update(_params: PanelUpdateEvent): void {
        //noop
    }

    focus(): void {
        this._activePanel?.focus();
    }

    public openPanel(
        panel: IDockviewPanel,
        options: {
            index?: number;
            skipSetActive?: boolean;
            skipSetGroupActive?: boolean;
        } = {}
    ): void {
        if (
            typeof options.index !== 'number' ||
            options.index > this.panels.length
        ) {
            options.index = this.panels.length;
        }

        const skipSetActive = !!options.skipSetActive;

        // ensure the group is updated before we fire any events
        panel.updateParentGroup(this.groupPanel, {
            skipSetActive: options.skipSetActive,
        });

        this.doAddPanel(panel, options.index, {
            skipSetActive: skipSetActive,
        });

        // a new tab can change the header's extent (e.g. push it to wrap)
        this.invalidateHeaderSize();

        if (this._activePanel === panel) {
            this.contentContainer.renderPanel(panel, { asActive: true });
            return;
        }

        if (!skipSetActive) {
            this.doSetActivePanel(panel);
        }

        if (!options.skipSetGroupActive) {
            this.accessor.doSetGroupActive(this.groupPanel);
        }

        if (!options.skipSetActive) {
            this.updateContainer();
        }
    }

    public removePanel(
        groupItemOrId: IDockviewPanel | string,
        options?: {
            skipSetActive?: boolean;
            skipSetActiveGroup?: boolean;
        }
    ): IDockviewPanel {
        const id =
            typeof groupItemOrId === 'string'
                ? groupItemOrId
                : groupItemOrId.id;

        const panelToRemove = this._panels.find((panel) => panel.id === id);

        if (!panelToRemove) {
            throw new Error('invalid operation');
        }

        return this._removePanel(panelToRemove, options);
    }

    public closeAllPanels(): void {
        if (this.panels.length > 0) {
            // take a copy since we will be edting the array as we iterate through
            const arrPanelCpy = [...this.panels];
            for (const panel of arrPanelCpy) {
                this.doClose(panel);
            }
        } else {
            this.accessor.removeGroup(this.groupPanel);
        }
    }

    public closePanel(panel: IDockviewPanel): void {
        this.doClose(panel);
    }

    private doClose(panel: IDockviewPanel): void {
        const isLast =
            this.panels.length === 1 && this.accessor.groups.length === 1;

        this.accessor.removePanel(
            panel,
            isLast && this.accessor.options.noPanelsOverlay === 'emptyGroup'
                ? { removeEmptyGroup: false }
                : undefined
        );
    }

    public isPanelActive(panel: IDockviewPanel): boolean {
        return this._activePanel === panel;
    }

    updateActions(element: HTMLElement | undefined): void {
        this.tabsContainer.setRightActionsElement(element);
    }

    public setActive(isGroupActive: boolean, force = false): void {
        if (!force && this.isActive === isGroupActive) {
            return;
        }

        this._isGroupActive = isGroupActive;

        toggleClass(this.container, 'dv-active-group', isGroupActive);
        toggleClass(this.container, 'dv-inactive-group', !isGroupActive);

        this.tabsContainer.setActive(this.isActive);

        if (!this._activePanel && this.panels.length > 0) {
            const candidate = this._panels.find((p) => {
                const tg = this._findTabGroupForPanel(p.id);
                return !tg?.collapsed;
            });
            if (candidate) {
                this.doSetActivePanel(candidate);
            }
        }

        this.updateContainer();
    }

    public layout(width: number, height: number): void {
        this._width = width;
        this._height = height;

        const { width: contentWidth, height: contentHeight } =
            this.contentDimensions();

        this.contentContainer.layout(contentWidth, contentHeight);

        if (this._activePanel?.layout) {
            this._activePanel.layout(contentWidth, contentHeight);
        }
    }

    /**
     * Re-run the group's layout with its current dimensions. Used to propagate a
     * header-size change (e.g. a header that grew/shrank without the group box
     * changing) down to the content + active panel.
     */
    public relayout(): void {
        // `relayout` exists to propagate a header-size change (e.g. tabs
        // wrapping to a second row) into the content, so drop the cached extent
        // and re-measure on the next `contentDimensions`.
        this.invalidateHeaderSize();
        this.layout(this._width, this._height);
    }

    /**
     * The dimensions available to the content/panel: the group box minus the
     * header along its axis. The header (`dv-tabs-and-actions-container`) is
     * laid out top/bottom (subtract its height) or left/right (subtract its
     * width); a hidden header has `display:none` so its `offset*` is 0 and
     * nothing is subtracted.
     */
    /**
     * Measure the header's extent along its occupied axis. This is the single
     * forced-reflow read; it now runs only on a cache miss (first layout after
     * a header change) and inside the header's ResizeObserver — not on every
     * layout frame.
     */
    private measureHeaderSize(): number {
        const headerEl = this.tabsContainer.element;
        const horizontal =
            this.headerPosition === 'top' || this.headerPosition === 'bottom';
        return horizontal ? headerEl.offsetHeight : headerEl.offsetWidth;
    }

    private invalidateHeaderSize(): void {
        this._cachedHeaderSize = undefined;
    }

    private contentDimensions(): { width: number; height: number } {
        const horizontal =
            this.headerPosition === 'top' || this.headerPosition === 'bottom';

        const headerSize = (this._cachedHeaderSize ??=
            this.measureHeaderSize());

        return {
            width: horizontal
                ? this._width
                : Math.max(0, this._width - headerSize),
            height: horizontal
                ? Math.max(0, this._height - headerSize)
                : this._height,
        };
    }

    private _removePanel(
        panel: IDockviewPanel,
        options?: {
            skipSetActive?: boolean;
            skipSetActiveGroup?: boolean;
        }
    ): IDockviewPanel {
        const isActivePanel = this._activePanel === panel;

        this.doRemovePanel(panel);

        // removing a tab can change the header's extent (e.g. drop a wrap row)
        this.invalidateHeaderSize();

        if (isActivePanel && this.panels.length > 0) {
            const nextPanel = this.mostRecentlyUsed[0];
            this.openPanel(nextPanel, {
                skipSetActive: options?.skipSetActive,
                skipSetGroupActive: options?.skipSetActiveGroup,
            });
        }

        if (this._activePanel && this.panels.length === 0) {
            this.doSetActivePanel(undefined);
        }

        if (!options?.skipSetActive) {
            this.updateContainer();
        }

        return panel;
    }

    private doRemovePanel(panel: IDockviewPanel): void {
        const index = this.panels.indexOf(panel);

        if (this._activePanel === panel) {
            this.contentContainer.closePanel();
        }

        this.tabsContainer.delete(panel.id);
        this._panels.splice(index, 1);

        if (this.mostRecentlyUsed.includes(panel)) {
            const index = this.mostRecentlyUsed.indexOf(panel);
            this.mostRecentlyUsed.splice(index, 1);
        }

        const disposable = this._panelDisposables.get(panel.id);
        if (disposable) {
            disposable.dispose();
            this._panelDisposables.delete(panel.id);
        }

        // Remove panel from its tab group (auto-destroys empty groups)
        this.removePanelFromTabGroup(panel.id);

        this._onDidRemovePanel.fire({ panel });
    }

    private doAddPanel(
        panel: IDockviewPanel,
        index: number = this.panels.length,
        options?: {
            skipSetActive?: boolean;
        }
    ): void {
        const existingPanel = this._panels.indexOf(panel);
        const hasExistingPanel = existingPanel > -1;

        this.tabsContainer.show();
        this.contentContainer.show();

        this.tabsContainer.openPanel(panel, index);

        if (!options?.skipSetActive) {
            this.contentContainer.openPanel(panel);
        } else if (panel.api.renderer === 'always') {
            this.contentContainer.renderPanel(panel, { asActive: false });
        }

        if (hasExistingPanel) {
            // TODO - need to ensure ordering hasn't changed and if it has need to re-order this.panels
            return;
        }

        this.updateMru(panel);
        this.panels.splice(index, 0, panel);

        this._panelDisposables.set(
            panel.id,
            new CompositeDisposable(
                panel.api.onDidTitleChange((event) =>
                    this._onDidPanelTitleChange.fire(event)
                ),
                panel.api.onDidParametersChange((event) =>
                    this._onDidPanelParametersChange.fire(event)
                )
            )
        );

        this._onDidAddPanel.fire({ panel });
    }

    private doSetActivePanel(panel: IDockviewPanel | undefined): void {
        if (this._activePanel === panel) {
            return;
        }

        this._activePanel = panel;

        if (panel) {
            this.tabsContainer.setActivePanel(panel);

            // Point the tabpanel's `aria-labelledby` at the now-active tab.
            this.contentContainer.setLabelledBy(
                this.tabsContainer.getTabId(panel.id)
            );

            this.contentContainer.openPanel(panel);

            const { width, height } = this.contentDimensions();
            panel.layout(width, height);

            this.updateMru(panel);

            // Refresh focus state to handle programmatic activation without DOM focus change
            this.contentContainer.refreshFocusState();

            this._onDidActivePanelChange.fire({
                panel,
                // `currentOrigin` is always present on the real component;
                // default to 'user' for minimal test accessors.
                origin: this.accessor.currentOrigin?.() ?? 'user',
            });
        }

        this.updateAccessibleLabel();
    }

    /** Label the group region with its active panel's title (the WAI-ARIA region name). */
    private updateAccessibleLabel(): void {
        const title = this._activePanel?.title;
        if (title) {
            this.container.setAttribute('aria-label', title);
        } else {
            this.container.removeAttribute('aria-label');
        }
    }

    private updateMru(panel: IDockviewPanel): void {
        if (this.mostRecentlyUsed.includes(panel)) {
            this.mostRecentlyUsed.splice(
                this.mostRecentlyUsed.indexOf(panel),
                1
            );
        }
        this.mostRecentlyUsed = [panel, ...this.mostRecentlyUsed];
    }

    private updateContainer(): void {
        this.panels.forEach((panel) => panel.runEvents());

        const shouldShowWatermark = this.isEmpty || !this._activePanel;

        if (shouldShowWatermark && !this.watermark) {
            const watermark = this.accessor.createWatermarkComponent();
            watermark.init({
                containerApi: this._api,
                group: this.groupPanel,
            });
            this.watermark = watermark;

            addDisposableListener(this.watermark.element, 'pointerdown', () => {
                if (!this.isActive) {
                    this.accessor.doSetGroupActive(this.groupPanel);
                }
            });

            this.contentContainer.element.appendChild(this.watermark.element);
        }
        if (!shouldShowWatermark && this.watermark) {
            this.watermark.element.remove();
            this.watermark.dispose?.();
            this.watermark = undefined;
        }
    }

    canDisplayOverlay(
        event: DragEvent | PointerEvent,
        position: Position,
        target: DockviewGroupDropLocation
    ): boolean {
        const firedEvent = new DockviewUnhandledDragOverEvent(
            event,
            target,
            position,
            getPanelData,
            this.accessor.getPanel(this.id)
        );

        this._onUnhandledDragOver.fire(firedEvent);

        return firedEvent.isAccepted;
    }

    /**
     * Whether a content drop at `position` is allowed: the locked rules, the
     * shift-to-not-drop gesture, the same-component shortcut, then the
     * `canDisplayOverlay` veto. The single source of truth for the content drop
     * target (`content.ts`) and the compass cell gating (`canDropOnGroup`).
     */
    canDisplayContentOverlay(
        event: DragEvent | PointerEvent,
        position: Position
    ): boolean {
        if (
            this.locked === 'no-drop-target' ||
            (this.locked && position === 'center')
        ) {
            return false;
        }

        const data = getPanelData();

        if (!data && event.shiftKey && this.location.type !== 'floating') {
            return false;
        }

        if (data?.viewId === this.accessor.id) {
            return true;
        }

        return this.canDisplayOverlay(event, position, 'content');
    }

    private handleDropEvent(
        type: 'header' | 'content',
        event: DragEvent | PointerEvent,
        position: Position,
        index?: number,
        edge?: boolean
    ): void {
        if (this.locked === 'no-drop-target') {
            return;
        }

        // An `edge` content drop (a resolver's outer "dock to the layout edge"
        // cell) docks against the whole layout, not this group.
        if (type === 'content' && edge) {
            this.accessor.dockToLayoutEdge(event, position);
            return;
        }

        function getKind(): DockviewGroupDropLocation {
            switch (type) {
                case 'header':
                    return typeof index === 'number' ? 'tab' : 'header_space';
                case 'content':
                    return 'content';
            }
        }

        const panel =
            typeof index === 'number' ? this.panels[index] : undefined;

        const willDropEvent = new DockviewWillDropEvent({
            nativeEvent: event,
            position,
            panel,
            getData: () => getPanelData(),
            kind: getKind(),
            group: this.groupPanel,
            api: this._api,
        });

        this._onWillDrop.fire(willDropEvent);

        if (willDropEvent.defaultPrevented) {
            return;
        }

        const data = getPanelData();

        if (data?.viewId === this.accessor.id) {
            if (type === 'content') {
                if (data.groupId === this.id) {
                    // don't allow to drop on self for center position

                    if (position === 'center') {
                        return;
                    }

                    if (data.panelId === null && !data.tabGroupId) {
                        // Full-group drops on self are a no-op.
                        // Tab-group drags are partial moves: an edge drop
                        // splits the layout and creates a new group.
                        return;
                    }
                }
            }

            if (type === 'header') {
                if (data.groupId === this.id) {
                    if (data.panelId === null && !data.tabGroupId) {
                        return;
                    }
                }
            }

            if (data.panelId === null) {
                // this is a group move dnd event
                const { groupId } = data;

                this._onMove.fire({
                    target: position,
                    groupId: groupId,
                    index,
                    tabGroupId: data.tabGroupId,
                });
                return;
            }

            const fromSameGroup =
                this.tabsContainer.indexOf(data.panelId) !== -1;

            if (fromSameGroup && this.tabsContainer.size === 1) {
                return;
            }

            const { groupId, panelId } = data;
            const isSameGroup = this.id === groupId;
            if (isSameGroup && !position) {
                const oldIndex = this.tabsContainer.indexOf(panelId);
                if (oldIndex === index) {
                    return;
                }
            }

            this._onMove.fire({
                target: position,
                groupId: data.groupId,
                itemId: data.panelId,
                index,
            });
        } else {
            this._onDidDrop.fire(
                new DockviewDidDropEvent({
                    nativeEvent: event,
                    position,
                    panel,
                    getData: () => getPanelData(),
                    group: this.groupPanel,
                    api: this._api,
                })
            );
        }
    }

    updateDragAndDropState(): void {
        this.tabsContainer.updateDragAndDropState();
    }

    public dispose(): void {
        super.dispose();

        this.watermark?.element.remove();
        this.watermark?.dispose?.();
        this.watermark = undefined;

        // Dispose all tab groups
        for (const tabGroup of [...this._tabGroups]) {
            tabGroup.dispose();
        }
        for (const disposable of this._tabGroupDisposables.values()) {
            disposable.dispose();
        }
        this._tabGroupDisposables.clear();

        // Dispose any microtask-deferred disposables that haven't run yet
        for (const disposable of this._pendingMicrotaskDisposables) {
            disposable.dispose();
        }
        this._pendingMicrotaskDisposables.clear();

        for (const panel of this.panels) {
            panel.dispose();
        }

        this.tabsContainer.dispose();
        this.contentContainer.dispose();
    }
}
