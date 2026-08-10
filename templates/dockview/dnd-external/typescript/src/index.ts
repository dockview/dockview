import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    GroupPanelPartInitParameters,
    IContentRenderer,
    positionToDirection,
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
        this._element.textContent = parameters.params.title ?? '';
    }
}

const root = document.getElementById('app')!;
root.className = 'example-layout';

// A native (non-dockview) draggable element that can be dropped into the dock.
const controls = document.createElement('div');
controls.className = 'example-controls';

const draggable = document.createElement('span');
draggable.tabIndex = -1;
draggable.draggable = true;
draggable.textContent = 'Drag me into the dock';
draggable.style.padding = '4px 12px';
draggable.style.borderRadius = '4px';
draggable.style.cursor = 'grab';
draggable.style.userSelect = 'none';
draggable.style.color = 'var(--dv-activegroup-visiblepanel-tab-color)';
draggable.style.background =
    'var(--dv-activegroup-visiblepanel-tab-background-color)';
draggable.style.border = '1px solid var(--dv-separator-border)';
draggable.addEventListener('dragstart', (event) => {
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', 'nothing');
    }
});

// A native drop zone that inspects any dockview tab/group dropped onto it.
const dropZone = document.createElement('div');
dropZone.textContent =
    'Drop a tab or group here to inspect the attached metadata';
dropZone.style.flex = '1';
dropZone.style.minWidth = '0';
dropZone.style.padding = '4px 12px';
dropZone.style.borderRadius = '4px';
dropZone.style.border = '1px dashed var(--dv-separator-border)';
dropZone.style.color = 'var(--dv-inactivegroup-visiblepanel-tab-color)';

// An inline status area that reports the dropped dataTransfer metadata.
const status = document.createElement('div');
status.className = 'example-controls';
status.style.display = 'none';
status.style.fontSize = '12px';

dropZone.addEventListener('drop', (event) => {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
        return;
    }

    status.replaceChildren();
    status.style.display = 'block';

    if (dataTransfer.items.length === 0) {
        const span = document.createElement('span');
        span.textContent = 'No dataTransfer data was found.';
        status.appendChild(span);
        return;
    }

    for (let i = 0; i < dataTransfer.items.length; i++) {
        const item = dataTransfer.items[i];
        const value = dataTransfer.getData(item.type);

        const row = document.createElement('div');
        const code = document.createElement('code');
        code.textContent = item.type;
        row.append(code, document.createTextNode(`: ${value}`));
        status.appendChild(row);
    }
});

controls.append(draggable, dropZone);

const dockElement = document.createElement('div');
dockElement.className = 'example-dock';

root.append(controls, status, dockElement);

const api: DockviewApi = createDockview(dockElement, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    dndEdges: {
        size: { value: 100, type: 'pixels' },
        activationSize: { value: 5, type: 'percentage' },
    },
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
});

api.addPanel({
    id: 'panel_1',
    component: 'default',
    params: {
        title: 'Panel 1',
    },
});

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

// Pointer (touch) drags can't bridge to external HTML5 drop
// zones outside dockview; narrow before reading `dataTransfer`.
api.onWillDragPanel((event) => {
    if (!(event.nativeEvent instanceof DragEvent)) {
        return;
    }
    const dataTransfer = event.nativeEvent.dataTransfer;

    if (dataTransfer) {
        dataTransfer.setData(
            'text/plain',
            'Some custom panel data transfer data'
        );
        dataTransfer.setData(
            'text/json',
            '{text: "Some custom panel data transfer data"}'
        );
    }
});

api.onWillDragGroup((event) => {
    if (!(event.nativeEvent instanceof DragEvent)) {
        return;
    }
    const dataTransfer = event.nativeEvent.dataTransfer;

    if (dataTransfer) {
        dataTransfer.setData(
            'text/plain',
            'Some custom group data transfer data'
        );
        dataTransfer.setData(
            'text/json',
            '{text: "Some custom group data transfer data"}'
        );
    }
});

api.onUnhandledDragOver((event) => {
    event.accept();
});

api.onDidDrop((event) => {
    event.api.addPanel({
        id: 'test',
        component: 'default',
        position: {
            direction: positionToDirection(event.position),
            referenceGroup: event.group || undefined,
        },
    });
});
