import {
    DockviewCompositeDisposable as CompositeDisposable,
    EdgeGroupModule,
    EdgeGroupPosition,
    IStackedEdgeGroupHost,
    IStackedEdgeGroupService,
    defineModule,
    isEdgeGroupEnabled,
} from 'dockview';

/**
 * Stacked edge groups: more than one group on an edge, laid out along it with
 * a sash between them. The stack layout itself is core infrastructure (every
 * edge is a stack, of one group without this module); this service is the
 * gate that lets a second group join an edge, per the `stackedEdgeGroups`
 * option.
 */
export class StackedEdgeGroupService
    extends CompositeDisposable
    implements IStackedEdgeGroupService
{
    constructor(private readonly host: IStackedEdgeGroupHost) {
        super();
    }

    canStack(position: EdgeGroupPosition): boolean {
        return isEdgeGroupEnabled(
            this.host.options.stackedEdgeGroups,
            position
        );
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
