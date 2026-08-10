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
    // Enable Visual Studio-style pinnable tool windows on edge groups.
    autoHideEdgeGroups: true,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
});

// some regular grid panels to peek over
api.addPanel({ id: 'doc_1', component: 'default', title: 'Document' });
api.addPanel({
    id: 'doc_2',
    component: 'default',
    title: 'Preview',
    position: { direction: 'right', referencePanel: 'doc_1' },
});

// a left edge group with a couple of tool windows
api.addEdgeGroup('left', {
    id: 'left-edge',
    initialSize: 240,
    minimumSize: 150,
});
api.addPanel({
    id: 'explorer',
    component: 'default',
    title: 'Explorer',
    position: { referenceGroup: 'left-edge' },
});
api.addPanel({
    id: 'search',
    component: 'default',
    title: 'Search',
    position: { referenceGroup: 'left-edge' },
});

// a bottom edge group
api.addEdgeGroup('bottom', {
    id: 'bottom-edge',
    initialSize: 200,
    minimumSize: 100,
});
api.addPanel({
    id: 'output',
    component: 'default',
    title: 'Output',
    position: { referenceGroup: 'bottom-edge' },
});
api.addPanel({
    id: 'problems',
    component: 'default',
    title: 'Problems',
    position: { referenceGroup: 'bottom-edge' },
});

// auto-hide both edge groups to their strips; click a tab to peek
api.autoHideEdgeGroup('left');
api.autoHideEdgeGroup('bottom');
