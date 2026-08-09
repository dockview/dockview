import { Position, positionToDirection } from '../dnd/droptarget';
import { DockviewComponent } from '../dockview/dockviewComponent';
import { Box } from '../types';
import { DockviewGroupPanel } from '../dockview/dockviewGroupPanel';
import {
    DockviewGroupActivePanelChangeEvent,
    DockviewGroupLocation,
    DockviewGroupPanelLocked,
} from '../dockview/dockviewGroupPanelModel';
import {
    DockviewHeaderDirection,
    DockviewHeaderPosition,
} from '../dockview/options';
import { Emitter, Event } from '../events';
import {
    GridviewPanelApi,
    GridviewPanelApiImpl,
    SizeEvent,
} from './gridviewPanelApi';

export interface DockviewGroupMoveParams {
    group?: DockviewGroupPanel;
    position?: Position;
    /**
     * The index to place the panel within a group, only applicable if the placement is within an existing group
     */
    index?: number;
    /**
     * Whether to skip setting the group as active after moving
     */
    skipSetActive?: boolean;
}

export interface DockviewGroupPanelCollapsedChangeEvent {
    readonly isCollapsed: boolean;
}

export interface DockviewGroupPanelPeekChangeEvent {
    readonly isPeeking: boolean;
}

export interface DockviewGroupPanelHeaderDirectionChangeEvent {
    /** The header's new axis: `'horizontal'` (top/bottom) or `'vertical'` (left/right). */
    readonly direction: DockviewHeaderDirection;
    /** The header position that produced the new direction. */
    readonly position: DockviewHeaderPosition;
}

export interface DockviewGroupPanelApi extends GridviewPanelApi {
    readonly onDidLocationChange: Event<DockviewGroupPanelLocationChangeEvent>;
    /**
     * Fires when the active panel *within this group* changes. Scoped to the
     * group, in contrast to the component-level
     * `DockviewApi.onDidActivePanelChange` (which tracks the active panel across
     * the whole dockview). Both carry an {@link DockviewOrigin} reporting
     * whether the change came from a user gesture or an API call.
     */
    readonly onDidActivePanelChange: Event<DockviewGroupActivePanelChangeEvent>;
    /**
     * Fired when an edge group's collapsed state changes.
     * Never fires for non-edge groups.
     */
    readonly onDidCollapsedChange: Event<DockviewGroupPanelCollapsedChangeEvent>;
    /**
     * Fired when an edge group's auto-hide *peek* state changes (the slid-out
     * overlay shown/hidden while the group stays logically collapsed). Never
     * fires for non-edge groups or without the auto-hide module.
     */
    readonly onDidPeekChange: Event<DockviewGroupPanelPeekChangeEvent>;
    /**
     * Fires when this group's header flips orientation between horizontal
     * (top/bottom) and vertical (left/right), e.g. when `headerPosition`
     * moves from `top` to `left`. Does not fire for position changes that
     * keep the same axis (top↔bottom, left↔right) or for the initial set.
     */
    readonly onDidHeaderDirectionChange: Event<DockviewGroupPanelHeaderDirectionChangeEvent>;
    readonly location: DockviewGroupLocation;
    /**
     * Whether this group is locked against drop interactions.
     * - `true`: panels cannot be dropped into the group (center / tabs),
     *   but the group can still be split from its edges.
     * - `'no-drop-target'`: all drop zones are disabled for this group.
     */
    locked: DockviewGroupPanelLocked;
    /**
     * If you require the Window object
     */
    getWindow(): Window;
    moveTo(options: DockviewGroupMoveParams): void;
    setHeaderPosition(position: DockviewHeaderPosition): void;
    getHeaderPosition(): DockviewHeaderPosition;
    maximize(): void;
    isMaximized(): boolean;
    exitMaximized(): void;
    close(): void;
    /**
     * Collapse this group (edge groups only). No-op for non-edge groups.
     */
    collapse(): void;
    /**
     * Expand this group (edge groups only). No-op for non-edge groups.
     */
    expand(): void;
    /**
     * Returns true if this edge group is currently collapsed.
     * Always returns false for non-edge groups.
     */
    isCollapsed(): boolean;
    /** True while this edge group is peeking (auto-hide slid-out overlay). */
    isPeeking(): boolean;
    /**
     * Opt this edge group in/out of auto-hide (pinnable tool-window) behaviour
     * at runtime, overriding the global `autoHideEdgeGroups` option. Pass
     * `undefined` to clear the override and inherit the global. No-op for
     * non-edge groups or without the auto-hide module.
     */
    setAutoHide(value: boolean | undefined): void;
    /**
     * The resolved auto-hide state of this edge group: the per-group override
     * if one is set, otherwise the global `autoHideEdgeGroups` option for this
     * edge. Always returns false for non-edge groups.
     */
    isAutoHide(): boolean;
}

export interface DockviewGroupPanelLocationChangeEvent {
    readonly location: DockviewGroupLocation;
}

const NOT_INITIALIZED_MESSAGE =
    'dockview: DockviewGroupPanelApiImpl not initialized';

export class DockviewGroupPanelApiImpl extends GridviewPanelApiImpl {
    private _group: DockviewGroupPanel | undefined;
    private _pendingSize: SizeEvent | undefined;

    readonly _onDidLocationChange =
        new Emitter<DockviewGroupPanelLocationChangeEvent>();
    readonly onDidLocationChange: Event<DockviewGroupPanelLocationChangeEvent> =
        this._onDidLocationChange.event;

    readonly _onDidActivePanelChange =
        new Emitter<DockviewGroupActivePanelChangeEvent>();
    readonly onDidActivePanelChange = this._onDidActivePanelChange.event;

    readonly _onDidCollapsedChange =
        new Emitter<DockviewGroupPanelCollapsedChangeEvent>();
    readonly onDidCollapsedChange: Event<DockviewGroupPanelCollapsedChangeEvent> =
        this._onDidCollapsedChange.event;

    readonly _onDidPeekChange =
        new Emitter<DockviewGroupPanelPeekChangeEvent>();
    readonly onDidPeekChange: Event<DockviewGroupPanelPeekChangeEvent> =
        this._onDidPeekChange.event;

    readonly _onDidHeaderDirectionChange =
        new Emitter<DockviewGroupPanelHeaderDirectionChangeEvent>();
    readonly onDidHeaderDirectionChange: Event<DockviewGroupPanelHeaderDirectionChangeEvent> =
        this._onDidHeaderDirectionChange.event;

    get location(): DockviewGroupLocation {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }
        return this._group.model.location;
    }

    /**
     * The group's bounding box relative to the top-left of the dockview root,
     * in pixels. Covers grid and floating groups; returns `undefined` for a
     * popout group (it lives in a separate window). Reflects the live rendered
     * geometry, so it is only meaningful once the layout has been sized.
     */
    get boundingBox(): Box | undefined {
        if (!this._group || this._group.model.location.type === 'popout') {
            return undefined;
        }
        const root = this.accessor.element.getBoundingClientRect();
        const rect = this._group.element.getBoundingClientRect();
        return {
            left: rect.left - root.left,
            top: rect.top - root.top,
            width: rect.width,
            height: rect.height,
        };
    }

    get locked(): DockviewGroupPanelLocked {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }
        return this._group.locked;
    }

    set locked(value: DockviewGroupPanelLocked) {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }
        this._group.locked = value;
    }

    constructor(
        id: string,
        private readonly accessor: DockviewComponent
    ) {
        super(id, '__dockviewgroup__');

        this.addDisposables(
            this._onDidLocationChange,
            this._onDidActivePanelChange,
            this._onDidCollapsedChange,
            this._onDidPeekChange,
            this._onDidHeaderDirectionChange,
            this._onDidVisibilityChange.event((event) => {
                if (event.isVisible && this._pendingSize) {
                    super.setSize(this._pendingSize);
                    this._pendingSize = undefined;
                }
            })
        );
    }

    public override setSize(event: SizeEvent): void {
        this._pendingSize = { ...event };

        super.setSize(event);
    }

    close(): void {
        if (!this._group) {
            return;
        }
        return this.accessor.removeGroup(this._group);
    }

    getWindow(): Window {
        return this.location.type === 'popout'
            ? this.location.getWindow()
            : globalThis.window;
    }

    setHeaderPosition(position: DockviewHeaderPosition): void {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }
        this._group.model.headerPosition = position;
    }

    getHeaderPosition(): DockviewHeaderPosition {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }
        return this._group.model.headerPosition;
    }

    moveTo(options: DockviewGroupMoveParams): void {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }

        const group =
            options.group ??
            this.accessor.addGroup({
                direction: positionToDirection(options.position ?? 'right'),
                skipSetActive: options.skipSetActive ?? false,
            });

        this.accessor.moveGroupOrPanel({
            from: { groupId: this._group.id },
            to: {
                group,
                position: options.group
                    ? (options.position ?? 'center')
                    : 'center',
                index: options.index,
            },
            skipSetActive: options.skipSetActive,
        });
    }

    maximize(): void {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }

        if (this.location.type !== 'grid') {
            // only grid groups can be maximized
            return;
        }

        this.accessor.maximizeGroup(this._group);
    }

    isMaximized(): boolean {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }

        return this.accessor.isMaximizedGroup(this._group);
    }

    exitMaximized(): void {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }

        if (this.isMaximized()) {
            this.accessor.exitMaximizedGroup();
        }
    }

    collapse(): void {
        if (!this._group) {
            return;
        }
        this.accessor.setEdgeGroupCollapsed(this._group, true);
    }

    expand(): void {
        if (!this._group) {
            return;
        }
        this.accessor.setEdgeGroupCollapsed(this._group, false);
    }

    isCollapsed(): boolean {
        if (!this._group) {
            return false;
        }
        return this.accessor.isEdgeGroupCollapsed(this._group);
    }

    isPeeking(): boolean {
        if (!this._group) {
            return false;
        }
        return this.accessor.isEdgeGroupPeeking(this._group);
    }

    setAutoHide(value: boolean | undefined): void {
        if (!this._group) {
            return;
        }
        this.accessor.setEdgeGroupAutoHide(this._group, value);
    }

    isAutoHide(): boolean {
        if (!this._group) {
            return false;
        }
        return this.accessor.isEdgeGroupAutoHide(this._group);
    }

    initialize(group: DockviewGroupPanel): void {
        this._group = group;
    }
}
