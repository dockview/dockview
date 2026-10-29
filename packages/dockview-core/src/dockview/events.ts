import { Position, WillShowOverlayEvent } from '../dnd/droptarget';
import { PanelTransfer } from '../dnd/dataTransfer';
import { DockviewApi } from '../api/component.api';
import { IDockviewPanel } from './dockviewPanel';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { IDockviewEvent } from '../events';
import { ITabGroup } from './tabGroup';

export type DockviewGroupDropLocation =
    | 'tab'
    | 'header_space'
    | 'content'
    | 'edge';

export interface DockviewWillShowOverlayLocationEventOptions {
    readonly kind: DockviewGroupDropLocation;
    readonly panel: IDockviewPanel | undefined;
    readonly api: DockviewApi;
    readonly group: DockviewGroupPanel | undefined;
    getData: () => PanelTransfer | undefined;
}

export interface DockviewTabGroupChangeEvent {
    readonly tabGroup: ITabGroup;
}

export interface DockviewTabGroupPanelChangeEvent {
    readonly tabGroup: ITabGroup;
    readonly panelId: string;
}

export type DockviewTabGroupCollapsedChangeEvent = DockviewTabGroupChangeEvent;

export class DockviewWillShowOverlayLocationEvent implements IDockviewEvent {
    get kind(): DockviewGroupDropLocation {
        return this.options.kind;
    }

    /** Narrow with `instanceof DragEvent` before reading `dataTransfer`. */
    get nativeEvent(): DragEvent | PointerEvent {
        return this.event.nativeEvent;
    }

    get position(): Position {
        return this.event.position;
    }

    /** The resolved cell was marked `edge` (an outer "dock to the whole layout"
     *  cell). See {@link DroptargetEvent.edge}. */
    get edge(): boolean {
        return this.event.edge;
    }

    /** The resolved cell docks as a dedicated edge group (display hint). See
     *  {@link PositionResolverResult.edgeGroup}. */
    get edgeGroup(): boolean {
        return this.event.edgeGroup;
    }

    /** Levels above the group the drop would apply to (`dndBranchDrops`); `0` is the group. */
    get depth(): number {
        return this.event.depth;
    }

    get defaultPrevented(): boolean {
        return this.event.defaultPrevented;
    }

    get panel(): IDockviewPanel | undefined {
        return this.options.panel;
    }

    get api(): DockviewApi {
        return this.options.api;
    }

    get group(): DockviewGroupPanel | undefined {
        return this.options.group;
    }

    preventDefault(): void {
        this.event.preventDefault();
    }

    getData(): PanelTransfer | undefined {
        return this.options.getData();
    }

    constructor(
        private readonly event: WillShowOverlayEvent,
        readonly options: DockviewWillShowOverlayLocationEventOptions
    ) {}
}
