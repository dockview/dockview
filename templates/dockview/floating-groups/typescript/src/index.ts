import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    DockviewGroupPanel,
    GroupPanelPartInitParameters,
    IContentRenderer,
    IGroupHeaderProps,
    IHeaderActionsRenderer,
    IWatermarkRenderer,
    SerializedDockview,
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
        this._element.textContent = parameters.title ?? '';
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

function createIcon(icon: string, onClick: () => void): HTMLElement {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    container.style.width = '30px';
    container.style.height = '100%';
    container.style.fontSize = '18px';
    container.addEventListener('click', onClick);

    const span = document.createElement('span');
    span.className = 'material-symbols-outlined';
    span.style.fontSize = 'inherit';
    span.style.cursor = 'pointer';
    span.textContent = icon;

    container.appendChild(span);
    return container;
}

let panelCount = 0;

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

    const panel4 = api.addPanel({
        id: 'panel_4',
        component: 'default',
        title: 'Panel 4',
        floating: true,
    });

    api.addPanel({
        id: 'panel_5',
        component: 'default',
        title: 'Panel 5',
        floating: false,
        position: { referencePanel: panel4 },
    });

    api.addPanel({
        id: 'panel_6',
        component: 'default',
        title: 'Panel 6',
    });
}

function addPanel(api: DockviewApi): void {
    api.addPanel({
        id: (++panelCount).toString(),
        title: `Tab ${panelCount}`,
        component: 'default',
    });
}

function addFloatingPanel(api: DockviewApi): void {
    api.addPanel({
        id: (++panelCount).toString(),
        title: `Tab ${panelCount}`,
        component: 'default',
        floating: { width: 250, height: 150, x: 50, y: 50 },
    });
}

class LeftHeaderAction implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.style.height = '100%';
        this._element.style.padding = '0px 4px';
    }

    init(parameters: IGroupHeaderProps): void {
        this._element.appendChild(
            createIcon('add', () => addPanel(parameters.containerApi))
        );
    }

    dispose(): void {
        //
    }
}

class RightHeaderAction implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement;
    private readonly _group: DockviewGroupPanel;
    private _disposable: { dispose(): void } | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(group: DockviewGroupPanel) {
        this._group = group;
        this._element = document.createElement('div');
        this._element.style.height = '100%';
        this._element.style.padding = '0px 4px';
    }

    init(parameters: IGroupHeaderProps): void {
        const render = (): void => {
            const floating = this._group.api.location.type === 'floating';

            this._element.replaceChildren(
                createIcon(floating ? 'jump_to_element' : 'back_to_tab', () => {
                    if (floating) {
                        const group = parameters.containerApi.addGroup();
                        this._group.api.moveTo({ group });
                    } else {
                        parameters.containerApi.addFloatingGroup(this._group, {
                            width: 400,
                            height: 300,
                            position: { bottom: 50, right: 50 },
                        });
                    }
                })
            );
        };

        render();
        this._disposable = this._group.api.onDidLocationChange(() => {
            render();
        });
    }

    dispose(): void {
        this._disposable?.dispose();
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
const addFloatingButton = document.createElement('button');
addFloatingButton.textContent = 'Add Floating Group';
const boundsButton = document.createElement('button');
const disableButton = document.createElement('button');

toolbar.append(
    saveButton,
    loadButton,
    clearButton,
    addFloatingButton,
    boundsButton,
    disableButton
);

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
    createLeftHeaderActionComponent: () => new LeftHeaderAction(),
    createRightHeaderActionComponent: (group) => new RightHeaderAction(group),
});

function readLayout(): SerializedDockview | null {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === null) {
        return null;
    }
    try {
        return JSON.parse(value) as SerializedDockview;
    } catch (err) {
        return null;
    }
}

function load(): void {
    api.clear();
    const layout = readLayout();
    if (layout) {
        try {
            api.fromJSON(layout);
        } catch (err) {
            console.error(err);
            api.clear();
            loadDefaultLayout(api);
        }
    } else {
        loadDefaultLayout(api);
    }
}

let floatingGroupBounds: 'boundedWithinViewport' | undefined = undefined;
let disableFloatingGroups = false;

const syncToggleButtons = (): void => {
    boundsButton.textContent = `Bounds: ${
        floatingGroupBounds ? 'Within' : 'Overflow'
    }`;
    disableButton.textContent = `${
        disableFloatingGroups ? 'Enable' : 'Disable'
    } floating groups`;
};
syncToggleButtons();

saveButton.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(api.toJSON()));
});

loadButton.addEventListener('click', () => {
    load();
});

clearButton.addEventListener('click', () => {
    api.clear();
    localStorage.removeItem(STORAGE_KEY);
});

addFloatingButton.addEventListener('click', () => {
    addFloatingPanel(api);
});

boundsButton.addEventListener('click', () => {
    floatingGroupBounds =
        floatingGroupBounds === undefined ? 'boundedWithinViewport' : undefined;
    api.updateOptions({ floatingGroupBounds });
    syncToggleButtons();
});

disableButton.addEventListener('click', () => {
    disableFloatingGroups = !disableFloatingGroups;
    api.updateOptions({ disableFloatingGroups });
    syncToggleButtons();
});

load();
