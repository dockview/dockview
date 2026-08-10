import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    DockviewHeaderPosition,
    GroupPanelPartInitParameters,
    IContentRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';

const positions: DockviewHeaderPosition[] = ['top', 'bottom', 'left', 'right'];

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
        const groupApi = parameters.api.group.api;

        const controls = document.createElement('div');
        controls.className = 'example-controls';

        const output = document.createElement('div');
        output.style.fontSize = '13px';
        output.style.marginTop = '12px';

        const render = (): void => {
            const current = groupApi.getHeaderPosition();
            output.textContent = `Header position: ${current}`;
            buttons.forEach((button, position) => {
                button.disabled = position === current;
            });
        };

        const buttons = new Map<DockviewHeaderPosition, HTMLButtonElement>();
        positions.forEach((position) => {
            const button = document.createElement('button');
            button.textContent = position;
            button.addEventListener('click', () => {
                groupApi.setHeaderPosition(position);
                render();
            });
            buttons.set(position, button);
            controls.appendChild(button);
        });

        this._element.append(controls, output);
        render();
    }
}

const api: DockviewApi = createDockview(document.getElementById('app')!, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    defaultHeaderPosition: 'bottom',
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
});

const panel1 = api.addPanel({
    id: 'panel_1',
    component: 'default',
    title: 'Panel 1',
});

const panel2 = api.addPanel({
    id: 'panel_2',
    component: 'default',
    title: 'Panel 2',
    position: {
        referencePanel: panel1,
        direction: 'right',
    },
});

api.addPanel({
    id: 'panel_3',
    component: 'default',
    title: 'Panel 3',
    position: {
        referencePanel: panel2,
        direction: 'below',
    },
});
