import { Disposable, IDisposable } from '../lifecycle';
import { IDragGhostSpec } from '../dnd/backend';
import { DroptargetOverlayModel, Position } from '../dnd/droptarget';
import {
    GroupDragEvent,
    TabDragEvent,
} from './components/titlebar/tabsContainer';
import { DockviewWillDropEvent } from './dockviewGroupPanelModel';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import {
    DockviewGroupDropLocation,
    DockviewWillShowOverlayLocationEvent,
} from './events';
import { defineModule } from './modules';
import { IAdvancedDnDHost, IAdvancedDnDService } from './moduleContracts';

/** Cursor offset of the group drag ghost. */
const GROUP_DRAG_GHOST_OFFSET_X = 30;
const GROUP_DRAG_GHOST_OFFSET_Y = -10;

/**
 * Owns the dispatch of the advanced drag-and-drop hooks: `onWillDragPanel`,
 * `onWillDragGroup`, `onWillDrop` and `onWillShowOverlay`, forwarding each to
 * the host's emitters so the public event shape is unchanged whether or not
 * this module is registered.
 *
 * The service holds no drag state of its own. The gesture is driven by the
 * DnD backends, and the per-group subscriptions live on the component's group
 * lifecycle (so groups created mid-move are not missed).
 */
export class AdvancedDnDService implements IAdvancedDnDService {
    constructor(private readonly host: IAdvancedDnDHost) {}

    dispatchWillDragPanel(event: TabDragEvent): void {
        this.host.fireWillDragPanel(event);
    }

    dispatchWillDragGroup(event: GroupDragEvent): void {
        this.host.fireWillDragGroup(event);
    }

    dispatchWillDrop(event: DockviewWillDropEvent): void {
        this.host.fireWillDrop(event);
    }

    dispatchWillShowOverlay(event: DockviewWillShowOverlayLocationEvent): void {
        this.host.fireWillShowOverlay(event);
    }

    buildGroupDragGhost(group: DockviewGroupPanel): IDragGhostSpec | undefined {
        const createGhost = this.host.options.createGroupDragGhostComponent;
        if (!createGhost) {
            return undefined;
        }
        const renderer = createGhost(group);
        renderer.init({ group, api: this.host.api });
        return {
            element: renderer.element,
            offsetX: GROUP_DRAG_GHOST_OFFSET_X,
            offsetY: GROUP_DRAG_GHOST_OFFSET_Y,
            dispose: renderer.dispose ? () => renderer.dispose?.() : undefined,
        };
    }

    resolveOverlayModel(
        location: DockviewGroupDropLocation,
        group?: DockviewGroupPanel
    ): DroptargetOverlayModel | undefined {
        return this.host.options.dropOverlayModel?.({ location, group });
    }

    showPreviewOverlay(
        group: DockviewGroupPanel,
        position: Position
    ): IDisposable {
        const target = group.model.contentDropTarget;
        target.showOverlay(position);
        return Disposable.from(() => target.clearOverlay());
    }

    dispose(): void {
        // Nothing to tear down; see the class doc (the service holds no state).
    }
}

export const AdvancedDnDModule = defineModule<
    'advancedDnDService',
    IAdvancedDnDHost
>({
    name: 'AdvancedDnD',
    serviceKey: 'advancedDnDService',
    create: (host) => new AdvancedDnDService(host),
});
