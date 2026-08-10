import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    GridConstraintChangeEvent,
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
        const controls = document.createElement('div');
        controls.className = 'example-controls';

        const button = document.createElement('button');
        button.textContent = 'Set constraints';
        button.addEventListener('click', () => {
            parameters.api.group.api.setConstraints({
                maximumWidth: 300,
                maximumHeight: 300,
            });
        });
        controls.appendChild(button);

        const output = document.createElement('div');
        output.style.fontSize = '13px';
        output.style.marginTop = '12px';

        const render = (constraints: GridConstraintChangeEvent): void => {
            output.replaceChildren();

            const row = (label: string, value: number): void => {
                const container = document.createElement('div');
                container.style.border = '1px solid grey';
                container.style.margin = '2px';
                container.style.padding = '4px 6px';

                const key = document.createElement('span');
                key.textContent = `${label}: `;

                const val = document.createElement('span');
                val.textContent = `${value}px`;

                container.append(key, val);
                output.appendChild(container);
            };

            if (typeof constraints.maximumHeight === 'number') {
                row('Maximum height', constraints.maximumHeight);
            }
            if (typeof constraints.minimumHeight === 'number') {
                row('Minimum height', constraints.minimumHeight);
            }
            if (typeof constraints.maximumWidth === 'number') {
                row('Maximum width', constraints.maximumWidth);
            }
            if (typeof constraints.minimumWidth === 'number') {
                row('Minimum width', constraints.minimumWidth);
            }
        };

        parameters.api.group.api.onDidConstraintsChange((event) => {
            render(event);
        });

        this._element.append(controls, output);
    }
}

const api: DockviewApi = createDockview(document.getElementById('app')!, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
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

const panel3 = api.addPanel({
    id: 'panel_3',
    component: 'default',
    title: 'Panel 3',
    position: {
        referencePanel: panel2,
        direction: 'right',
    },
});

const panel4 = api.addPanel({
    id: 'panel_4',
    component: 'default',
    title: 'Panel 4',
    position: {
        direction: 'below',
    },
});
