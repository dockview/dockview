import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    GroupPanelPartInitParameters,
    IContentRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';

class Panel implements IContentRenderer {
    private readonly _element: HTMLElement;

    private readonly _currentTitle: HTMLElement;
    private readonly _input: HTMLInputElement;
    private readonly _button: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';

        const currentLine = document.createElement('div');
        currentLine.style.marginBottom = '8px';

        const currentLabel = document.createElement('span');
        currentLabel.textContent = 'Current title: ';

        this._currentTitle = document.createElement('span');

        currentLine.append(currentLabel, this._currentTitle);

        const controls = document.createElement('div');
        controls.className = 'example-controls';

        this._input = document.createElement('input');

        const label = document.createElement('label');
        label.append('New title ', this._input);

        this._button = document.createElement('button');
        this._button.textContent = 'Set title';

        controls.append(label, this._button);

        this._element.append(currentLine, controls);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        parameters.api.onDidTitleChange((event) => {
            this._currentTitle.textContent = event.title;
        });

        this._currentTitle.textContent = parameters.api.title ?? '';
        this._input.value = parameters.api.title ?? '';

        this._button.addEventListener('click', () => {
            parameters.api.setTitle(this._input.value);
        });
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
});

const panel = api.addPanel({
    id: 'panel_1',
    component: 'default',
    title: 'Panel 1',
});

const panel2 = api.addPanel({
    id: 'panel_2',
    component: 'default',
    title: 'Panel 2',
    position: { referencePanel: panel },
});

const panel3 = api.addPanel({
    id: 'panel_3',
    component: 'default',
    title: 'Panel 3',

    position: { referencePanel: panel, direction: 'right' },
});

const panel4 = api.addPanel({
    id: 'panel_4',
    component: 'default',
    title: 'Panel 4',
    position: { referencePanel: panel3 },
});
