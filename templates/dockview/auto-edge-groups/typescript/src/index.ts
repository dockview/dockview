import { LicenseManager } from 'dockview-enterprise';
import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    GroupPanelPartInitParameters,
    IContentRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';

// dockview.dev docs license key. Replace with your own key in production.
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

class Panel implements IContentRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';
    }

    init(parameters: GroupPanelPartInitParameters): void {
        this._element.textContent = parameters.title ?? '';
    }
}

const api = createDockview(document.getElementById('app'), {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    // Drag a tab to the far edge to dock it as an edge group; the edge is
    // invisible when empty and revealed on demand.
    dockToEdgeGroups: true,
    autoHideEdgeGroups: true,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
});

api.addPanel({
    id: 'about',
    component: 'default',
    title: 'Drag any tab to the far edge of the layout to dock it as an edge group (a green line marks the edge-group drop zone). Remove the last panel from an edge and it disappears to zero footprint; drag one back to reveal it again.',
});
api.addPanel({
    id: 'doc_1',
    component: 'default',
    title: 'Document',
    position: { direction: 'right', referencePanel: 'about' },
});
api.addPanel({
    id: 'doc_2',
    component: 'default',
    title: 'Preview',
    position: { direction: 'below', referencePanel: 'doc_1' },
});
