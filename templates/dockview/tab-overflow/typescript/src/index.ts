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

const layout = document.getElementById('app')!;
layout.className = 'example-layout';

const controls = document.createElement('div');
controls.className = 'example-controls';

const addButton = document.createElement('button');
addButton.textContent = 'Add Tab';

let mode: 'wrap' | 'dropdown' = 'wrap';
const modeButton = document.createElement('button');
modeButton.textContent = 'Switch to dropdown mode';

let vertical = false;
const verticalButton = document.createElement('button');
verticalButton.textContent = 'Vertical header';

controls.append(addButton, modeButton, verticalButton);

const dockElement = document.createElement('div');
dockElement.className = 'example-dock';

layout.append(controls, dockElement);

const api: DockviewApi = createDockview(dockElement, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    // Wrap tabs onto multiple rows when they no longer fit on one row.
    overflow: { mode: 'wrap' },
    // Enable pinned tabs, which also auto-injects Pin/Unpin into the tab
    // right-click menu alongside the custom items below.
    pinnedTabs: { enabled: true },
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
    // Pin/Unpin is auto-prepended by the pinned-tabs module, so we only add our
    // own items here. The labels read from the live `mode`/`vertical` state so
    // the menu stays in sync with the toolbar buttons.
    getTabContextMenuItems: () => [
        {
            label:
                mode === 'wrap'
                    ? 'Switch to dropdown mode'
                    : 'Switch to wrap mode',
            action: () => toggleMode(),
        },
        {
            label: vertical ? 'Horizontal header' : 'Vertical header',
            action: () => toggleVertical(),
        },
    ],
});

// Apply the current header orientation to every group. A left-hand header makes
// wrapped tabs flow into columns instead of rows.
function applyHeaderPosition(): void {
    api.groups.forEach((group) =>
        group.api.setHeaderPosition(vertical ? 'left' : 'top')
    );
}

let counter = 0;

function addPanel(): void {
    counter++;
    api.addPanel({
        id: `panel_${counter}`,
        component: 'default',
        title: `Panel ${counter}`,
    });
    // Re-apply the current orientation so any newly created group adopts it.
    applyHeaderPosition();
}

function toggleMode(): void {
    mode = mode === 'wrap' ? 'dropdown' : 'wrap';
    api.updateOptions({ overflow: { mode } });
    modeButton.textContent =
        mode === 'wrap' ? 'Switch to dropdown mode' : 'Switch to wrap mode';
}

function toggleVertical(): void {
    vertical = !vertical;
    applyHeaderPosition();
    verticalButton.textContent = vertical
        ? 'Horizontal header'
        : 'Vertical header';
}

addButton.addEventListener('click', () => addPanel());
modeButton.addEventListener('click', () => toggleMode());
verticalButton.addEventListener('click', () => toggleVertical());

// Open enough panels in a single group that the tabs no longer fit on one row.
for (let i = 0; i < 12; i++) {
    addPanel();
}
