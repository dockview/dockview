import React from 'react';
import { ReactPart, ReactPortalStore } from '../react';
import {
    DockviewCompositeDisposable,
    DockviewMutableDisposable,
    DockviewApi,
    DockviewGroupPanel,
    DockviewGroupPanelApi,
    DockviewGroupLocation,
    PanelUpdateEvent,
    IHeaderActionsRenderer,
    IDockviewHeaderActionsProps,
} from 'dockview';

export class ReactHeaderActionsRendererPart implements IHeaderActionsRenderer {
    private readonly mutableDisposable = new DockviewMutableDisposable();
    private readonly _element: HTMLElement;
    private _part?: ReactPart<IDockviewHeaderActionsProps>;

    get element(): HTMLElement {
        return this._element;
    }

    get part(): ReactPart<IDockviewHeaderActionsProps> | undefined {
        return this._part;
    }

    constructor(
        private readonly component: React.FunctionComponent<IDockviewHeaderActionsProps>,
        private readonly reactPortalStore: ReactPortalStore,
        private readonly _group: DockviewGroupPanel
    ) {
        this._element = document.createElement('div');
        this._element.className = 'dv-react-part';
        this._element.style.height = '100%';
        this._element.style.width = '100%';
    }

    init(parameters: {
        containerApi: DockviewApi;
        api: DockviewGroupPanelApi;
    }): void {
        this.mutableDisposable.value = new DockviewCompositeDisposable(
            this._group.model.onDidAddPanel(() => {
                this.updatePanels();
            }),
            this._group.model.onDidRemovePanel(() => {
                this.updatePanels();
            }),
            this._group.model.onDidChangeTabOrder(() => {
                this.updatePanels();
            }),
            this._group.model.onDidActivePanelChange(() => {
                this.updateActivePanel();
            }),
            parameters.api.onDidActiveChange(() => {
                this.updateGroupActive();
            }),
            parameters.api.onDidLocationChange((event) => {
                this.updateLocation(event.location);
            })
        );

        this._part = new ReactPart<IDockviewHeaderActionsProps>(
            this.element,
            this.reactPortalStore,
            this.component,
            {
                api: parameters.api,
                containerApi: parameters.containerApi,
                panels: this._group.model.panels,
                activePanel: this._group.model.activePanel,
                isGroupActive: this._group.api.isActive,
                group: this._group,
                headerPosition: this._group.model.headerPosition,
                location: parameters.api.location,
            }
        );
    }

    dispose(): void {
        this.mutableDisposable.dispose();
        this._part?.dispose();
    }

    update(event: PanelUpdateEvent): void {
        this._part?.update(event.params);
    }

    private updatePanels(): void {
        this.update({ params: { panels: this._group.model.panels } });
    }

    private updateActivePanel(): void {
        this.update({
            params: {
                activePanel: this._group.model.activePanel,
            },
        });
    }

    private updateGroupActive(): void {
        this.update({
            params: {
                isGroupActive: this._group.api.isActive,
            },
        });
    }

    private updateLocation(location: DockviewGroupLocation): void {
        this.update({ params: { location } });
    }
}
