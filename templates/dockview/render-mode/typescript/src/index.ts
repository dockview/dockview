import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    GroupPanelPartInitParameters,
    IContentRenderer,
    SerializedDockview,
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
        this._element.style.height = '100%';
        this._element.style.overflow = 'auto';
    }

    init(parameters: GroupPanelPartInitParameters): void {
        // A tall inner element so each panel can be scrolled, which is what
        // makes the 'onlyWhenVisible' vs 'always' render modes observable.
        const inner = document.createElement('div');
        inner.style.height = '1000px';
        inner.style.padding = '20px';
        inner.style.overflow = 'auto';

        const titleElement = document.createElement('div');
        titleElement.textContent = parameters.api.title ?? '';

        const controls = document.createElement('div');
        const modeLabel = document.createElement('span');
        modeLabel.textContent = parameters.api.renderer;

        const button = document.createElement('button');
        button.textContent = 'Toggle render mode';
        button.addEventListener('click', () => {
            parameters.api.setRenderer(
                parameters.api.renderer === 'onlyWhenVisible'
                    ? 'always'
                    : 'onlyWhenVisible'
            );
        });

        // Keep the displayed mode in sync with the panel's renderer.
        parameters.api.onDidRendererChange((event) => {
            modeLabel.textContent = event.renderer;
        });

        controls.append(modeLabel, button);
        inner.append(titleElement, controls);
        this._element.appendChild(inner);
    }
}

const root = document.getElementById('app')!;
root.className = 'example-layout';

const toolbar = document.createElement('div');
toolbar.className = 'example-controls';

const saveButton = document.createElement('button');
saveButton.textContent = 'Save';
const loadButton = document.createElement('button');
loadButton.textContent = 'Load';

const sliderLabel = document.createElement('label');
const sliderText = document.createTextNode('');

const slider = document.createElement('input');
slider.type = 'range';
slider.min = '1';
slider.max = '100';
slider.value = '100';

sliderLabel.append(sliderText, slider);
toolbar.append(saveButton, loadButton, sliderLabel);

// The dock lives inside a wrapper whose size is driven by the slider, so the
// dock resizes together with its container.
const dock = document.createElement('div');
dock.className = 'example-dock';

const dockWrapper = document.createElement('div');
dock.appendChild(dockWrapper);

const applySize = (value: string): void => {
    slider.value = value;
    sliderText.textContent = `Container size (${value}%)`;
    dockWrapper.style.height = `${value}%`;
    dockWrapper.style.width = `${value}%`;
};
applySize(slider.value);

root.append(toolbar, dock);

const api: DockviewApi = createDockview(dockWrapper, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
});

slider.addEventListener('input', () => applySize(slider.value));

api.addPanel({
    id: 'panel_1',
    component: 'default',
    title: 'Panel 1',
});
api.addPanel({
    id: 'panel_2',
    component: 'default',
    title: 'Panel 2',
    position: { referencePanel: 'panel_1', direction: 'within' },
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
    position: { referencePanel: 'panel_3', direction: 'below' },
});

saveButton.addEventListener('click', () => {
    localStorage.setItem(
        'dv_rendermode_state',
        JSON.stringify({ size: slider.value, state: api.toJSON() })
    );
});

loadButton.addEventListener('click', () => {
    const state = localStorage.getItem('dv_rendermode_state');
    if (typeof state !== 'string') {
        return;
    }

    const json = JSON.parse(state) as {
        size: string;
        state: SerializedDockview;
    };
    applySize(json.size);
    api.fromJSON(json.state);
});
