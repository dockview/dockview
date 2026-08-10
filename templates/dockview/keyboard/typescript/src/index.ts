import { LicenseManager } from 'dockview-enterprise';
import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    GroupPanelPartInitParameters,
    IContentRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';

// dockview.dev docs license key. Replace with your own key in production.
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

const shortcutStyle =
    'padding:2px 6px;border-radius:4px;border:1px solid;font-family:monospace;white-space:nowrap;';

function createShortcut(text: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.setAttribute('style', shortcutStyle);
    span.textContent = text;
    return span;
}

function createText(text: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
}

class Panel implements IContentRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';
        this._element.style.fontSize = '13px';
    }

    init(parameters: GroupPanelPartInitParameters): void {
        const title = document.createElement('div');
        title.style.padding = '10px 0px';
        title.textContent = parameters.api.title ?? '';

        const description = document.createElement('div');
        description.style.padding = '10px 0px';
        description.style.display = 'flex';
        description.style.flexWrap = 'wrap';
        description.style.gap = '6px';
        description.style.alignItems = 'center';

        description.append(
            createShortcut('Ctrl+]'),
            createShortcut('Ctrl+['),
            createText('switch tabs'),
            createShortcut('F6'),
            createShortcut('Shift+F6'),
            createText('move between groups'),
            createShortcut('Ctrl+M'),
            createText('dock with the keyboard')
        );

        this._element.appendChild(title);
        this._element.appendChild(description);
    }
}

const container = document.getElementById('app')!;

const api: DockviewApi = createDockview(container, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    // Enable the built-in enterprise keymap: Ctrl+]/Ctrl+[ to switch tabs,
    // F6/Shift+F6 to move between groups, Ctrl+M to dock.
    keyboardNavigation: true,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
});

// A couple of groups so F6 group-switching and Ctrl+] tab-switching are both
// demonstrable.
api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
api.addPanel({ id: 'panel_2', component: 'default', title: 'Panel 2' });
api.addPanel({ id: 'panel_3', component: 'default', title: 'Panel 3' });
api.addPanel({
    id: 'panel_4',
    component: 'default',
    title: 'Panel 4',
    position: { referencePanel: 'panel_3', direction: 'right' },
});
api.addPanel({
    id: 'panel_5',
    component: 'default',
    title: 'Panel 5',
    position: { referencePanel: 'panel_4', direction: 'within' },
});

api.getPanel('panel_1')!.api.setActive();
