import {
    CompositeDisposable,
    IDisposable,
    MutableDisposable,
} from '../lifecycle';
import { Event } from '../events';
import { DockviewComponentOptions, IHeaderActionsRenderer } from './options';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewApi } from '../api/component.api';
import { defineModule } from './modules';

export interface IHeaderActionsHost {
    readonly api: DockviewApi;
    readonly options: DockviewComponentOptions;
    readonly groups: DockviewGroupPanel[];
    readonly onDidAddGroup: Event<DockviewGroupPanel>;
    readonly onDidRemoveGroup: Event<DockviewGroupPanel>;
}

export interface IHeaderActionsService extends IDisposable {
    /** Re-mount the three header action slots on a single group. */
    refresh(group: DockviewGroupPanel): void;
    /** Re-mount on every group; used when one of the three options changes. */
    refreshAll(): void;
    /** Tear down per-group renderer state. */
    disposeGroup(group: DockviewGroupPanel): void;
}

type Slot = 'left' | 'right' | 'prefix';

interface PerGroupState {
    readonly left: MutableDisposable;
    readonly right: MutableDisposable;
    readonly prefix: MutableDisposable;
}

const SLOT_OPTION_KEY: Record<
    Slot,
    keyof Pick<
        DockviewComponentOptions,
        | 'createLeftHeaderActionComponent'
        | 'createRightHeaderActionComponent'
        | 'createPrefixHeaderActionComponent'
    >
> = {
    left: 'createLeftHeaderActionComponent',
    right: 'createRightHeaderActionComponent',
    prefix: 'createPrefixHeaderActionComponent',
};

export class HeaderActionsService implements IHeaderActionsService {
    private readonly _host: IHeaderActionsHost;
    private readonly _perGroup = new Map<DockviewGroupPanel, PerGroupState>();

    constructor(host: IHeaderActionsHost) {
        this._host = host;
    }

    refresh(group: DockviewGroupPanel): void {
        // The headerPosition setter on DockviewGroupPanelModel fires inside
        // the model's constructor, before the parent DockviewGroupPanel has
        // assigned its `_model` field, and in tests where the parent panel
        // may be null. Skip; DockviewGroupPanel.initialize() will refresh
        // once construction completes for real groups.
        if (!group?.model) {
            return;
        }
        const state = this._ensureState(group);
        this._refreshSlot('left', group, state.left);
        this._refreshSlot('right', group, state.right);
        this._refreshSlot('prefix', group, state.prefix);
    }

    refreshAll(): void {
        for (const group of this._host.groups) {
            this.refresh(group);
        }
    }

    disposeGroup(group: DockviewGroupPanel): void {
        const state = this._perGroup.get(group);
        if (!state) {
            return;
        }
        state.left.dispose();
        state.right.dispose();
        state.prefix.dispose();
        this._perGroup.delete(group);
    }

    dispose(): void {
        // Iterate a copy of the keys: disposeGroup deletes from _perGroup as it goes.
        for (const group of [...this._perGroup.keys()]) {
            this.disposeGroup(group);
        }
    }

    private _ensureState(group: DockviewGroupPanel): PerGroupState {
        let state = this._perGroup.get(group);
        if (!state) {
            state = {
                left: new MutableDisposable(),
                right: new MutableDisposable(),
                prefix: new MutableDisposable(),
            };
            this._perGroup.set(group, state);
        }
        return state;
    }

    private _refreshSlot(
        slot: Slot,
        group: DockviewGroupPanel,
        disposable: MutableDisposable
    ): void {
        const factory = this._host.options[SLOT_OPTION_KEY[slot]] as
            | ((group: DockviewGroupPanel) => IHeaderActionsRenderer)
            | undefined;

        if (factory) {
            const renderer = factory(group);
            disposable.value = renderer;
            renderer.init({
                containerApi: this._host.api,
                api: group.api,
                group,
            });
            group.model.attachHeaderAction(slot, renderer.element);
        } else {
            disposable.dispose();
            group.model.attachHeaderAction(slot, undefined);
        }
    }
}

export const HeaderActionsModule = defineModule<
    'headerActionsService',
    IHeaderActionsHost
>({
    name: 'HeaderActions',
    serviceKey: 'headerActionsService',
    create: (host) => new HeaderActionsService(host),
    init: (host, service) => {
        return new CompositeDisposable(
            host.onDidRemoveGroup((group) => {
                service.disposeGroup(group);
            })
        );
    },
});
