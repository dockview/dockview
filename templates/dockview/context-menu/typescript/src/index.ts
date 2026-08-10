import { LicenseManager } from 'dockview-enterprise';
import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    IContentRenderer,
    GroupPanelPartInitParameters,
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
        this._element.textContent = parameters.api.title ?? '';
    }
}

const api = createDockview(document.getElementById('app'), {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
    getTabContextMenuItems: (params) => [
        'close',
        'closeOthers',
        'closeAll',
        'closeLeft',
        'closeRight',
        'separator',
        'maximize',
        'popout',
        'separator',
        {
            label: 'Log panel id',
            action: () => console.log(params.panel.id),
        },
        'separator',
        {
            // Custom item mirroring the React `FloatMenuItem` component: floats
            // the panel's tab into its own group. Shown as an alternative to
            // the built-in `'float'` shortcut.
            label: 'Float tab',
            action: () => params.api.addFloatingGroup(params.panel),
        },
    ],
});

api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
api.addPanel({ id: 'panel_2', component: 'default', title: 'Panel 2' });
api.addPanel({ id: 'panel_3', component: 'default', title: 'Panel 3' });
