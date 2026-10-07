import {
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewWillDropEvent,
    EdgeGroupModule,
    EdgeGroupPosition,
    IStackedEdgeGroupHost,
    IStackedEdgeGroupService,
    defineModule,
    isEdgeGroupEnabled,
    resolveMessages,
} from 'dockview';

/**
 * Stacked edge groups: more than one group on an edge, laid out along it with
 * a sash between them. The stack layout itself is core infrastructure (every
 * edge is a stack, of one group without this module); this service is the
 * gate that lets a second group join an edge, per the `stackedEdgeGroups`
 * option, and announces a drop that splits an edge group.
 */
export class StackedEdgeGroupService
    extends CompositeDisposable
    implements IStackedEdgeGroupService
{
    constructor(private readonly host: IStackedEdgeGroupHost) {
        super();
        this.addDisposables(
            this.host.onWillDrop((event) => this._announceSplit(event))
        );
    }

    canStack(position: EdgeGroupPosition): boolean {
        return isEdgeGroupEnabled(
            this.host.options.stackedEdgeGroups,
            position
        );
    }

    /** A user drop on a split zone of an edge group that can stack opens the
     *  dragged panel in a new group on that edge; say so. */
    private _announceSplit(event: DockviewWillDropEvent): void {
        const location = event.group?.api.location;
        if (
            event.defaultPrevented ||
            event.kind !== 'content' ||
            event.position === 'center' ||
            location?.type !== 'edge' ||
            !this.canStack(location.position)
        ) {
            return;
        }
        const data = event.getData();
        const panel = data?.panelId
            ? event.api.getPanel(data.panelId)
            : data && event.api.getGroup(data.groupId)?.activePanel;
        if (panel?.title) {
            this.host.announce(
                resolveMessages(this.host.options.messages).edgeGroupStacked(
                    panel.title,
                    location.position
                )
            );
        }
    }
}

export const StackedEdgeGroupModule = defineModule<
    'stackedEdgeGroupService',
    IStackedEdgeGroupHost
>({
    name: 'StackedEdgeGroup',
    options: ['stackedEdgeGroups'],
    serviceKey: 'stackedEdgeGroupService',
    dependsOn: [EdgeGroupModule],
    create: (host) => new StackedEdgeGroupService(host),
});
