import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    GroupPanelPartInitParameters,
    IContentRenderer,
    TabAnimation,
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

const layout = document.getElementById('app')!;
layout.className = 'example-layout';

const controls = document.createElement('div');
controls.className = 'example-controls';

let tabAnimation: TabAnimation = 'default';
const modeButton = document.createElement('button');
modeButton.textContent = `tabAnimation: ${tabAnimation}`;
controls.append(modeButton);

const dockElement = document.createElement('div');
dockElement.className = 'example-dock';

layout.append(controls, dockElement);

const api = createDockview(dockElement, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
    disableFloatingGroups: true,
});

modeButton.addEventListener('click', () => {
    tabAnimation = tabAnimation === 'smooth' ? 'default' : 'smooth';
    api.updateOptions({ theme: { ...themeAbyss, tabAnimation } });
    modeButton.textContent = `tabAnimation: ${tabAnimation}`;
});

api.onWillShowOverlay((e) => {
    if (e.kind === 'header_space' || e.kind === 'tab') {
        return;
    }
    e.preventDefault();
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
});

api.addPanel({
    id: 'panel_3',
    component: 'default',
    title: 'Panel 3',
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
