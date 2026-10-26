import React from 'react';
import { ReactPart, ReactPortalStore } from '../react';
import {
    IContextMenuItemRenderer,
    IContextMenuItemComponentProps,
    IChipContextMenuItemComponentProps,
} from 'dockview';

/**
 * The same renderer serves both the tab context menu (props carry a `panel`)
 * and the tab group chip context menu (props carry a `tabGroup`), so it accepts
 * either prop shape.
 */
type ContextMenuItemProps =
    | IContextMenuItemComponentProps
    | IChipContextMenuItemComponentProps;

export class ReactContextMenuItemPart implements IContextMenuItemRenderer {
    private readonly _element: HTMLElement;
    private part?: ReactPart<ContextMenuItemProps>;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(
        public readonly id: string,
        private readonly component: React.FunctionComponent<ContextMenuItemProps>,
        private readonly reactPortalStore: ReactPortalStore
    ) {
        this._element = document.createElement('div');
        this._element.className = 'dv-react-part';
        this._element.style.height = '100%';
        this._element.style.width = '100%';
    }

    public init(props: ContextMenuItemProps): void {
        this.part = new ReactPart(
            this._element,
            this.reactPortalStore,
            this.component,
            props
        );
    }

    public dispose(): void {
        this.part?.dispose();
    }
}
