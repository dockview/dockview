import { Emitter, Event } from '../events';
import { GridviewPanelApiImpl, GridviewPanelApi } from './gridviewPanelApi';
import { DockviewGroupPanel } from '../dockview/dockviewGroupPanel';
import { CompositeDisposable, MutableDisposable } from '../lifecycle';
import { DockviewPanel } from '../dockview/dockviewPanel';
import { DockviewComponent } from '../dockview/dockviewComponent';
import { DockviewPanelRenderer } from '../overlay/overlayRenderContainer';
import {
    DockviewGroupMoveParams,
    DockviewGroupPanelLocationChangeEvent,
} from './dockviewGroupPanelApi';
import { DockviewGroupLocation } from '../dockview/dockviewGroupPanelModel';

export interface TitleEvent {
    readonly title: string;
}

export interface PinnedChangeEvent {
    readonly isPinned: boolean;
}

export interface RendererChangedEvent {
    readonly renderer: DockviewPanelRenderer;
}

export interface ActiveGroupEvent {
    readonly isActive: boolean;
}

export interface GroupChangedEvent {
    // empty
}

export type DockviewPanelMoveParams = DockviewGroupMoveParams;

export interface DockviewPanelApi
    extends Omit<
        GridviewPanelApi,
        // omit properties that do not make sense here
        'setVisible' | 'onDidConstraintsChange'
    > {
    /**
     * The id of the tab component renderer
     *
     * Undefined if no custom tab renderer is provided
     */
    readonly tabComponent: string | undefined;
    readonly group: DockviewGroupPanel;
    readonly isGroupActive: boolean;
    readonly renderer: DockviewPanelRenderer;
    readonly title: string | undefined;
    /**
     * Whether this panel's tab is pinned. Pinned tabs render before unpinned
     * tabs, never overflow, and resist cross-boundary reorder. Owned by the
     * PinnedTabs module. Reads `false` until a panel is pinned, which requires
     * `pinnedTabs.enabled` (both `setPinned` and restore are gated on it), so a
     * component with pinning disabled always reports `false`.
     */
    readonly isPinned: boolean;
    readonly onDidActiveGroupChange: Event<ActiveGroupEvent>;
    readonly onDidGroupChange: Event<GroupChangedEvent>;
    readonly onDidTitleChange: Event<TitleEvent>;
    readonly onDidChangePinned: Event<PinnedChangeEvent>;
    readonly onDidRendererChange: Event<RendererChangedEvent>;
    readonly location: DockviewGroupLocation;
    readonly onDidLocationChange: Event<DockviewGroupPanelLocationChangeEvent>;
    close(): void;
    setTitle(title: string): void;
    /**
     * Pin or unpin this panel's tab. No-op (warns once) when the PinnedTabs
     * module is not registered, and dormant unless `pinnedTabs.enabled` is set.
     */
    setPinned(pinned: boolean): void;
    setRenderer(renderer: DockviewPanelRenderer): void;
    moveTo(options: DockviewPanelMoveParams): void;
    maximize(): void;
    isMaximized(): boolean;
    exitMaximized(): void;
    /**
     * If you require the Window object
     */
    getWindow(): Window;
}

export class DockviewPanelApiImpl
    extends GridviewPanelApiImpl
    implements DockviewPanelApi
{
    private _group: DockviewGroupPanel;
    private readonly _tabComponent: string | undefined;

    readonly _onDidTitleChange = new Emitter<TitleEvent>();
    readonly onDidTitleChange = this._onDidTitleChange.event;

    readonly _onDidChangePinned = new Emitter<PinnedChangeEvent>();
    readonly onDidChangePinned = this._onDidChangePinned.event;

    private readonly _onDidActiveGroupChange = new Emitter<ActiveGroupEvent>();
    readonly onDidActiveGroupChange = this._onDidActiveGroupChange.event;

    private readonly _onDidGroupChange = new Emitter<GroupChangedEvent>();
    readonly onDidGroupChange = this._onDidGroupChange.event;

    readonly _onDidRendererChange = new Emitter<RendererChangedEvent>();
    readonly onDidRendererChange = this._onDidRendererChange.event;

    private readonly _onDidLocationChange =
        new Emitter<DockviewGroupPanelLocationChangeEvent>();
    readonly onDidLocationChange: Event<DockviewGroupPanelLocationChangeEvent> =
        this._onDidLocationChange.event;

    private readonly groupEventsDisposable = new MutableDisposable();

    get location(): DockviewGroupLocation {
        return this.group.api.location;
    }

    get title(): string | undefined {
        return this.panel.title;
    }

    get isPinned(): boolean {
        return this.panel.isPinned;
    }

    get isGroupActive(): boolean {
        return this.group.isActive;
    }

    get renderer(): DockviewPanelRenderer {
        return this.panel.renderer;
    }

    set group(value: DockviewGroupPanel) {
        const oldGroup = this._group;

        if (this._group !== value) {
            this._group = value;

            this._onDidGroupChange.fire({});

            this.setupGroupEventListeners(oldGroup);

            this.fireLocationChange();
        }
    }

    get group(): DockviewGroupPanel {
        return this._group;
    }

    get tabComponent(): string | undefined {
        return this._tabComponent;
    }

    constructor(
        private readonly panel: DockviewPanel,
        group: DockviewGroupPanel,
        private readonly accessor: DockviewComponent,
        component: string,
        tabComponent?: string
    ) {
        super(panel.id, component);

        this._tabComponent = tabComponent;

        this.initialize(panel);

        this._group = group;
        this.setupGroupEventListeners();

        this.addDisposables(
            this.groupEventsDisposable,
            this._onDidRendererChange,
            this._onDidTitleChange,
            this._onDidChangePinned,
            this._onDidGroupChange,
            this._onDidActiveGroupChange,
            this._onDidLocationChange
        );
    }

    getWindow(): Window {
        return this.group.api.getWindow();
    }

    override setActive(): void {
        // A bare `panel.api.setActive()` from application code is a
        // programmatic activation. Tag it `'api'` so `onDidActivePanelChange`
        // reports the correct origin; user-gesture call sites that route
        // through here wrap the call in `withOrigin('user')` first, which wins.
        this.accessor.withOrigin('api', () => super.setActive());
    }

    moveTo(options: DockviewPanelMoveParams): void {
        // Programmatic relocation: tag it `'api'` so the `'move'` layout
        // mutation reports the correct origin. User-gesture moves (DnD) drive
        // `accessor.moveGroupOrPanel` directly and keep the default `'user'`.
        this.accessor.withOrigin('api', () =>
            this.accessor.moveGroupOrPanel({
                from: { groupId: this._group.id, panelId: this.panel.id },
                to: {
                    group: options.group ?? this._group,
                    position: options.group
                        ? (options.position ?? 'center')
                        : 'center',
                    index: options.index,
                },
                skipSetActive: options.skipSetActive,
            })
        );
    }

    setTitle(title: string): void {
        this.panel.setTitle(title);
    }

    setPinned(pinned: boolean): void {
        this.accessor.setPanelPinned(this.panel, pinned);
    }

    setRenderer(renderer: DockviewPanelRenderer): void {
        this.panel.setRenderer(renderer);
    }

    close(): void {
        this.group.model.closePanel(this.panel);
    }

    maximize(): void {
        this.group.api.maximize();
    }

    isMaximized(): boolean {
        return this.group.api.isMaximized();
    }

    exitMaximized(): void {
        this.group.api.exitMaximized();
    }

    /**
     * Report that this panel's location may have moved.
     *
     * A relocation touches the location more than once - the panel is
     * reparented into the destination group, then that group is tagged with
     * the location it ends up at - so the event is coalesced to the end of the
     * enclosing layout mutation and reports where the panel actually settled.
     * Firing each signal as it happened surfaced an intermediate `grid`
     * location the panel was never in, at a point where it was in neither
     * group's panel list. Outside a mutation this fires straight away.
     */
    private fireLocationChange(): void {
        this.accessor.deferLocationChange(this, () => {
            if (this.isDisposed) {
                return;
            }

            this._onDidLocationChange.fire({ location: this.location });
        });
    }

    private setupGroupEventListeners(previousGroup?: DockviewGroupPanel) {
        let _trackGroupActive = previousGroup?.isActive ?? false; // prevent duplicate events with same state

        this.groupEventsDisposable.value = new CompositeDisposable(
            this.group.api.onDidVisibilityChange((event) => {
                const hasBecomeHidden = !event.isVisible && this.isVisible;
                const hasBecomeVisible = event.isVisible && !this.isVisible;

                const isActivePanel = this.group.model.isPanelActive(
                    this.panel
                );

                if (hasBecomeHidden || (hasBecomeVisible && isActivePanel)) {
                    this._onDidVisibilityChange.fire(event);
                }
            }),
            this.group.api.onDidLocationChange(() => {
                if (this.group !== this.panel.group) {
                    return;
                }
                this.fireLocationChange();
            }),
            this.group.api.onDidActiveChange(() => {
                if (this.group !== this.panel.group) {
                    return;
                }

                if (_trackGroupActive !== this.isGroupActive) {
                    _trackGroupActive = this.isGroupActive;
                    this._onDidActiveGroupChange.fire({
                        isActive: this.isGroupActive,
                    });
                }
            })
        );
    }
}
