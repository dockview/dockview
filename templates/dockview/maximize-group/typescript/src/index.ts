import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    GroupPanelPartInitParameters,
    IContentRenderer,
    IGroupHeaderProps,
    IHeaderActionsRenderer,
    IWatermarkRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';

const STORAGE_KEY = 'floating.layout';

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

class Watermark implements IWatermarkRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';
        this._element.textContent = 'This group is empty.';
    }

    init(): void {
        //
    }
}

// Renders a single clickable material-symbols icon, mirroring the React `Icon`.
function createIcon(icon: string, onClick: () => void): HTMLElement {
    const container = document.createElement('div');
    container.style.height = '100%';
    container.style.padding = '0px 4px';

    const button = document.createElement('div');
    button.style.display = 'flex';
    button.style.justifyContent = 'center';
    button.style.alignItems = 'center';
    button.style.width = '30px';
    button.style.height = '100%';
    button.style.fontSize = '18px';

    const span = document.createElement('span');
    span.className = 'material-symbols-outlined';
    span.style.fontSize = 'inherit';
    span.style.cursor = 'pointer';
    span.textContent = icon;

    button.appendChild(span);
    button.addEventListener('click', onClick);
    container.appendChild(button);

    return container;
}

let panelCount = 0;

// Left header action: add a new panel to the group.
class LeftHeaderActions implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement = document.createElement('div');

    get element(): HTMLElement {
        return this._element;
    }

    init(parameters: IGroupHeaderProps): void {
        const icon = createIcon('add', () => {
            parameters.containerApi.addPanel({
                id: (++panelCount).toString(),
                title: `Tab ${panelCount}`,
                component: 'default',
                position: { referenceGroup: parameters.group.id },
            });
        });
        this._element.appendChild(icon);
    }

    dispose(): void {
        //
    }
}

// Right header action: toggle the maximized state of the group.
class RightHeaderActions implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement = document.createElement('div');
    private readonly _disposables: (() => void)[] = [];

    get element(): HTMLElement {
        return this._element;
    }

    init(parameters: IGroupHeaderProps): void {
        const render = () => {
            const maximized = parameters.api.isMaximized();
            this._element.innerHTML = '';
            const icon = createIcon(
                maximized ? 'jump_to_element' : 'back_to_tab',
                () => {
                    if (parameters.api.isMaximized()) {
                        parameters.api.exitMaximized();
                    } else {
                        parameters.api.maximize();
                    }
                }
            );
            this._element.appendChild(icon);
        };

        render();

        const disposable = parameters.containerApi.onDidMaximizedGroupChange(
            () => render()
        );
        this._disposables.push(() => disposable.dispose());
    }

    dispose(): void {
        this._disposables.forEach((dispose) => dispose());
    }
}

function loadDefaultLayout(api: DockviewApi): void {
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
        position: { direction: 'right' },
    });

    api.addPanel({
        id: 'panel_6',
        component: 'default',
        title: 'Panel 6',
    });
}

function load(api: DockviewApi): void {
    api.clear();
    const layoutString = localStorage.getItem(STORAGE_KEY);
    if (layoutString) {
        try {
            api.fromJSON(JSON.parse(layoutString));
        } catch (err) {
            console.error(err);
            api.clear();
            loadDefaultLayout(api);
        }
    } else {
        loadDefaultLayout(api);
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
const clearButton = document.createElement('button');
clearButton.textContent = 'Clear';
toolbar.append(saveButton, loadButton, clearButton);

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
    createWatermarkComponent: () => new Watermark(),
    createLeftHeaderActionComponent: () => new LeftHeaderActions(),
    createRightHeaderActionComponent: () => new RightHeaderActions(),
});

load(api);

saveButton.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(api.toJSON()));
});

loadButton.addEventListener('click', () => {
    load(api);
});

clearButton.addEventListener('click', () => {
    api.clear();
    localStorage.removeItem(STORAGE_KEY);
});
