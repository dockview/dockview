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
        this._element.textContent = parameters.params.title;
    }
}

const root = document.getElementById('app')!;
root.className = 'example-layout';

const controls = document.createElement('div');
controls.className = 'example-controls';

// A slider drives the size of the wrapper the dock lives in. Dockview watches
// its container and resizes automatically, so the layout tracks the container.
const sliderLabel = document.createElement('label');
const sliderPrefix = document.createTextNode('Scale: ');
const sliderSuffix = document.createTextNode('');

const slider = document.createElement('input');
slider.type = 'range';
slider.min = '1';
slider.max = '100';
slider.value = '50';

sliderLabel.append(sliderPrefix, slider, sliderSuffix);
controls.appendChild(sliderLabel);

const dock = document.createElement('div');
dock.className = 'example-dock';

const dockWrapper = document.createElement('div');
dock.appendChild(dockWrapper);

const applySize = (value: string): void => {
    sliderSuffix.textContent = ` ${value}%`;
    dockWrapper.style.height = `${value}%`;
    dockWrapper.style.width = `${value}%`;
};
applySize(slider.value);

slider.addEventListener('input', () => applySize(slider.value));

root.append(controls, dock);

const api: DockviewApi = createDockview(dockWrapper, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
});

const panel = api.addPanel({
    id: 'panel_1',
    component: 'default',
    params: {
        title: 'Panel 1',
    },
});

panel.group.locked = true;
panel.group.header.hidden = true;

api.addPanel({
    id: 'panel_2',
    component: 'default',
    params: {
        title: 'Panel 2',
    },
});

api.addPanel({
    id: 'panel_3',
    component: 'default',
    params: {
        title: 'Panel 3',
    },
});

api.addPanel({
    id: 'panel_4',
    component: 'default',
    params: {
        title: 'Panel 4',
    },
    position: { referencePanel: 'panel_1', direction: 'right' },
});

api.addPanel({
    id: 'panel_5',
    component: 'default',
    params: {
        title: 'Panel 5',
    },
    position: { referencePanel: 'panel_3', direction: 'right' },
});

api.addPanel({
    id: 'panel_6',
    component: 'default',
    params: {
        title: 'Panel 6',
    },
    position: { referencePanel: 'panel_5', direction: 'below' },
});

api.addPanel({
    id: 'panel_7',
    component: 'default',
    params: {
        title: 'Panel 7',
    },
    position: { referencePanel: 'panel_6', direction: 'right' },
});
