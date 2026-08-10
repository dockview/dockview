import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    GroupPanelPartInitParameters,
    IContentRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';

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

const toolbar = document.createElement('div');
toolbar.className = 'example-controls';

let disablePanelDrag = false;
let disableGroupDrag = false;
let disableOverlay = false;

const panelDragButton = document.createElement('button');
const groupDragButton = document.createElement('button');
const overlayButton = document.createElement('button');

const syncButtons = (): void => {
    panelDragButton.textContent = `Panel Drag: ${
        disablePanelDrag ? 'disabled' : 'enabled'
    }`;
    groupDragButton.textContent = `Group Drag: ${
        disableGroupDrag ? 'disabled' : 'enabled'
    }`;
    overlayButton.textContent = `Overlay: ${
        disableOverlay ? 'disabled' : 'enabled'
    }`;
};

panelDragButton.addEventListener('click', () => {
    disablePanelDrag = !disablePanelDrag;
    syncButtons();
});
groupDragButton.addEventListener('click', () => {
    disableGroupDrag = !disableGroupDrag;
    syncButtons();
});
overlayButton.addEventListener('click', () => {
    disableOverlay = !disableOverlay;
    syncButtons();
});
syncButtons();

toolbar.append(panelDragButton, groupDragButton, overlayButton);

const dockElement = document.createElement('div');
dockElement.className = 'example-dock';

root.append(toolbar, dockElement);

const api: DockviewApi = createDockview(dockElement, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
});

api.onWillDragPanel((e) => {
    if (!disablePanelDrag) {
        return;
    }
    e.nativeEvent.preventDefault();
});

api.onWillDragGroup((e) => {
    if (!disableGroupDrag) {
        return;
    }
    e.nativeEvent.preventDefault();
});

api.onWillShowOverlay((e) => {
    console.log(e);

    if (!disableOverlay) {
        return;
    }

    e.preventDefault();
});

api.onWillDrop((e) => {
    //
});

api.onDidDrop((e) => {
    //
});

api.addPanel({
    id: 'panel_1',
    component: 'default',
    title: 'Panel 1',
});

api.addPanel({
    id: 'panel_2',
    component: 'default',
    title: 'Panel 2',
    position: {
        direction: 'right',
        referencePanel: 'panel_1',
    },
});

api.addPanel({
    id: 'panel_3',
    component: 'default',
    title: 'Panel 3',
    position: {
        direction: 'below',
        referencePanel: 'panel_1',
    },
});

api.addPanel({
    id: 'panel_4',
    component: 'default',
    title: 'Panel 4',
});

api.addPanel({
    id: 'panel_5',
    component: 'default',
    title: 'Panel 5',
});
