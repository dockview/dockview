import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    GroupPanelPartInitParameters,
    IContentRenderer,
    IWatermarkRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';

const STORAGE_KEY = 'dockview_persistence_layout';

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
}

const root = document.getElementById('app')!;
root.className = 'example-layout';

const toolbar = document.createElement('div');
toolbar.className = 'example-controls';

const resetButton = document.createElement('button');
resetButton.textContent = 'Reset Layout';
toolbar.append(resetButton);

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
});

// Restore any previously persisted layout, otherwise start from the default.
const layoutString = localStorage.getItem(STORAGE_KEY);
let restored = false;

if (layoutString) {
    try {
        api.fromJSON(JSON.parse(layoutString));
        restored = true;
    } catch (err) {
        console.error(err);
    }
}

if (!restored) {
    loadDefaultLayout(api);
}

// Persist the layout on every change.
api.onDidLayoutChange(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(api.toJSON()));
});

resetButton.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    api.clear();
    loadDefaultLayout(api);
});
