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
        this._element.textContent = parameters.api.title ?? '';
    }
}

const root = document.getElementById('app')!;
root.className = 'example-layout';

const controls = document.createElement('div');
controls.className = 'example-controls';

const addButton = document.createElement('button');
addButton.textContent = 'Add Floating Group';
controls.append(addButton);

const dockElement = document.createElement('div');
dockElement.className = 'example-dock';

root.append(controls, dockElement);

const api = createDockview(dockElement, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    // Snap floating groups to each other (and to container edges) when dragged
    // within 8px of an alignment.
    smartGuides: { snapDistance: 8 },
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
});

let floatCount = 0;

function addFloatingGroup(position: { top: number; left: number }): void {
    floatCount++;
    api.addPanel({
        id: `float_${floatCount}`,
        component: 'default',
        title: `Floating ${floatCount}`,
        floating: {
            width: 220,
            height: 140,
            position: { top: position.top, left: position.left },
        },
    });
}

addButton.addEventListener('click', () => {
    addFloatingGroup({
        top: 60 + floatCount * 10,
        left: 60 + floatCount * 10,
    });
});

// A docked base panel to fill the container.
api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });

// Two floating groups so alignment + snapping is demonstrable: drag one near
// the other (or towards a container edge) to see the guides.
addFloatingGroup({ top: 40, left: 60 });
addFloatingGroup({ top: 220, left: 340 });
