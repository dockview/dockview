import React from 'react';
import {
    PanelUpdateEvent,
    IPanePart,
    PanePanelComponentInitParameter,
} from 'dockview';
import { ReactPart, ReactPortalStore } from '../react';
import { IPaneviewPanelProps } from './paneview';

export class PanePanelSection implements IPanePart {
    private readonly _element: HTMLElement;
    private part?: ReactPart<IPaneviewPanelProps>;

    get element() {
        return this._element;
    }

    constructor(
        public readonly id: string,
        private readonly component: React.FunctionComponent<IPaneviewPanelProps>,
        private readonly reactPortalStore: ReactPortalStore
    ) {
        this._element = document.createElement('div');
        this._element.style.height = '100%';
        this._element.style.width = '100%';
    }

    public init(parameters: PanePanelComponentInitParameter): void {
        this.part = new ReactPart<IPaneviewPanelProps>(
            this.element,
            this.reactPortalStore,
            this.component,
            {
                params: parameters.params,
                api: parameters.api,
                title: parameters.title,
                containerApi: parameters.containerApi,
            }
        );
    }

    public toJSON() {
        return {
            id: this.id,
        };
    }

    public update(event: PanelUpdateEvent) {
        // Forward the merged params under the `params` prop. Spreading them
        // as top-level props would let a param named `title` or `api` clobber
        // the real prop.
        this.part?.update({ params: event.params });
    }

    public dispose() {
        this.part?.dispose();
    }
}
