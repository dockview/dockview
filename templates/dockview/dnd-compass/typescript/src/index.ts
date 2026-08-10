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
        this._element.textContent = parameters.params.title ?? '';
    }
}

const api = createDockview(document.getElementById('app')!, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    // Show the aim-at-a-cell DnD compass while dragging tabs.
    dndCompass: true,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
});

// A small docked layout with panels on every side so that, while dragging a
// tab, the DnD compass can be seen resolving to each cell.
const panel1 = api.addPanel({
    id: 'panel_1',
    component: 'default',
    title: 'Panel 1',
    params: { title: 'Panel 1' },
});

api.addPanel({
    id: 'panel_2',
    component: 'default',
    title: 'Panel 2',
    params: { title: 'Panel 2' },
    position: { referencePanel: panel1, direction: 'right' },
});

api.addPanel({
    id: 'panel_3',
    component: 'default',
    title: 'Panel 3',
    params: { title: 'Panel 3' },
    position: { referencePanel: panel1, direction: 'below' },
});

api.addPanel({
    id: 'panel_4',
    component: 'default',
    title: 'Panel 4',
    params: { title: 'Panel 4' },
    position: { referencePanel: panel1, direction: 'within' },
});
