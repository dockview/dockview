import { PaneviewApi } from '../api/component.api';
import {
    DragSourceOptions,
    html5Backend,
    IDragSource,
    pointerBackend,
} from '../dnd/backend';
import {
    getPaneData,
    LocalSelectionTransfer,
    PaneTransfer,
} from '../dnd/dataTransfer';
import { DroptargetEvent, IDropTarget, Position } from '../dnd/droptarget';
import { Emitter, Event } from '../events';
import { Orientation } from '../splitview/splitview';
import {
    PaneviewDndOverlayEvent,
    PaneviewUnhandledDragOverEvent,
} from './options';
import { IPaneviewComponent } from './paneviewComponent';
import {
    IPaneviewPanel,
    PanePanelInitParameter,
    PaneviewPanel,
} from './paneviewPanel';

export interface PaneviewDidDropEvent extends DroptargetEvent {
    panel: IPaneviewPanel;
    getData: () => PaneTransfer | undefined;
    api: PaneviewApi;
}

export abstract class DraggablePaneviewPanel extends PaneviewPanel {
    private html5DragSource: IDragSource | undefined;
    private pointerDragSource: IDragSource | undefined;
    private target: IDropTarget | undefined;
    private pointerTarget: IDropTarget | undefined;

    private readonly _onDidDrop = new Emitter<PaneviewDidDropEvent>();
    readonly onDidDrop = this._onDidDrop.event;

    private readonly _onUnhandledDragOver =
        new Emitter<PaneviewDndOverlayEvent>();
    readonly onUnhandledDragOver: Event<PaneviewDndOverlayEvent> =
        this._onUnhandledDragOver.event;

    readonly accessor: IPaneviewComponent;

    constructor(options: {
        accessor: IPaneviewComponent;
        id: string;
        component: string;
        headerComponent: string | undefined;
        orientation: Orientation;
        isExpanded: boolean;
        disableDnd: boolean;
        headerSize: number;
        minimumBodySize: number;
        maximumBodySize: number;
    }) {
        super({
            id: options.id,
            component: options.component,
            headerComponent: options.headerComponent,
            orientation: options.orientation,
            isExpanded: options.isExpanded,
            isHeaderVisible: true,
            headerSize: options.headerSize,
            minimumBodySize: options.minimumBodySize,
            maximumBodySize: options.maximumBodySize,
        });

        this.accessor = options.accessor;

        this.addDisposables(this._onDidDrop, this._onUnhandledDragOver);

        if (!options.disableDnd) {
            this.initDragFeatures();
        }
    }

    private initDragFeatures(): void {
        if (!this.header) {
            return;
        }

        const id = this.id;
        const accessorId = this.accessor.id;
        this.header.draggable = true;

        const sharedDragOptions: DragSourceOptions = {
            getData: () => {
                LocalSelectionTransfer.getInstance().setData(
                    [new PaneTransfer(accessorId, id)],
                    PaneTransfer.prototype
                );
                return {
                    dispose: () => {
                        LocalSelectionTransfer.getInstance().clearData(
                            PaneTransfer.prototype
                        );
                    },
                };
            },
        };

        this.html5DragSource = html5Backend.createDragSource(
            this.header,
            sharedDragOptions
        );
        this.pointerDragSource = pointerBackend.createDragSource(
            this.header,
            sharedDragOptions
        );

        const canDisplayOverlay = (
            event: DragEvent | PointerEvent,
            position: Position
        ): boolean => {
            const data = getPaneData();

            if (data) {
                if (
                    data.paneId !== this.id &&
                    data.viewId === this.accessor.id
                ) {
                    return true;
                }
            }

            const firedEvent = new PaneviewUnhandledDragOverEvent(
                event,
                position,
                getPaneData,
                this
            );

            this._onUnhandledDragOver.fire(firedEvent);

            return firedEvent.isAccepted;
        };

        const dropTargetOptions = {
            acceptedTargetZones: ['top', 'bottom'] as Position[],
            overlayModel: {
                activationSize: { type: 'percentage' as const, value: 50 },
            },
            canDisplayOverlay,
        };

        this.target = html5Backend.createDropTarget(
            this.element,
            dropTargetOptions
        );
        this.pointerTarget = pointerBackend.createDropTarget(
            this.element,
            dropTargetOptions
        );

        this.addDisposables(
            this._onDidDrop,
            this.html5DragSource,
            this.pointerDragSource,
            this.target,
            this.pointerTarget,
            this.target.onDrop((event) => {
                this.onDrop(event);
            }),
            this.pointerTarget.onDrop((event) => {
                this.onDrop(event);
            })
        );
    }

    private onDrop(event: DroptargetEvent): void {
        const data = getPaneData();

        if (data?.viewId !== this.accessor.id) {
            // if there is no local drag event for this panel
            // or if the drag event was creating by another Paneview instance
            this._onDidDrop.fire({
                ...event,
                panel: this,
                api: new PaneviewApi(this.accessor),
                getData: getPaneData,
            });
            return;
        }

        const containerApi = (this._params! as PanePanelInitParameter)
            .containerApi;
        const panelId = data.paneId;

        const existingPanel = containerApi.getPanel(panelId);
        if (!existingPanel) {
            this._onDidDrop.fire({
                ...event,
                panel: this,
                getData: getPaneData,
                api: new PaneviewApi(this.accessor),
            });
            return;
        }

        const allPanels = containerApi.panels;

        const fromIndex = allPanels.indexOf(existingPanel);
        let toIndex = containerApi.panels.indexOf(this);

        if (event.position === 'left' || event.position === 'top') {
            toIndex = Math.max(0, toIndex - 1);
        }
        if (event.position === 'right' || event.position === 'bottom') {
            if (fromIndex > toIndex) {
                toIndex++;
            }
            toIndex = Math.min(allPanels.length - 1, toIndex);
        }

        containerApi.movePanel(fromIndex, toIndex);
    }
}
