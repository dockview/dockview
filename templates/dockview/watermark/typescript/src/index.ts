import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    GroupPanelPartInitParameters,
    IContentRenderer,
    IDockviewGroupPanel,
    IWatermarkRenderer,
    themeAbyss,
    themeLight,
    WatermarkRendererInitParameters,
} from 'dockview';

let panelCount = 0;

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

        parameters.api.onDidTitleChange(() => {
            this._element.textContent = parameters.api.title ?? '';
        });
    }
}

class Watermark implements IWatermarkRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        const element = document.createElement('div');
        element.style.height = '100%';
        element.style.display = 'flex';
        element.style.justifyContent = 'center';
        element.style.alignItems = 'center';

        this._element = element;
    }

    init(params: WatermarkRendererInitParameters): void {
        this.build(params.containerApi, params.group);
    }

    private build(api: DockviewApi, group?: IDockviewGroupPanel): void {
        const container = document.createElement('div');

        const text = document.createElement('p');
        text.textContent =
            'This is a custom watermark. You can change this content.';

        const controls = document.createElement('div');
        controls.className = 'example-controls';

        const button = document.createElement('button');
        button.textContent = 'Add New Panel';
        button.addEventListener('click', () => {
            api.addPanel({
                id: Date.now().toString(),
                component: 'default',
                title: `Panel ${++panelCount}`,
            });
        });

        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close Group';
        closeButton.addEventListener('click', () => {
            group?.api.close();
        });

        controls.append(button, closeButton);
        container.append(text, controls);
        this.element.append(container);

        const updateVisibility = () => {
            closeButton.style.display = api.groups.length > 0 ? '' : 'none';
        };

        updateVisibility();
        api.onDidLayoutChange(updateVisibility);
    }
}

const root = document.createElement('div');
root.className = 'example-layout';

const controls = document.createElement('div');
controls.className = 'example-controls';

const button = document.createElement('button');
button.textContent = 'Add Empty Group';
controls.append(button);

const container = document.createElement('div');
container.className = 'example-dock';

root.append(controls, container);

const app = document.getElementById('app');
app.append(root);

const api = createDockview(container, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
    createWatermarkComponent: () => {
        return new Watermark();
    },
});

api.addPanel({
    id: 'panel_1',
    component: 'default',
    title: 'Panel 1',
});

api.addPanel({
    id: 'panel_2',
    component: 'default',
    position: { referencePanel: 'panel_1', direction: 'right' },
    title: 'Panel 2',
});

button.addEventListener('click', () => {
    api.addGroup();
});
