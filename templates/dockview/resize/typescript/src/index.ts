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
        this._element.style.padding = '10px';
        this._element.style.height = '100%';
    }

    init(parameters: GroupPanelPartInitParameters): void {
        const { api } = parameters;

        const titleElement = document.createElement('div');
        titleElement.style.marginBottom = '8px';
        titleElement.textContent = api.title ?? '';

        // Width controls: resize either the whole group or just this panel.
        const widthRow = this.createControl('Width:');
        const widthInput = widthRow.input;
        widthInput.value = '100';
        widthRow.groupButton.addEventListener('click', () => {
            api.group.api.setSize({ width: Number(widthInput.value) });
        });
        widthRow.panelButton.addEventListener('click', () => {
            api.setSize({ width: Number(widthInput.value) });
        });

        // Height controls: resize either the whole group or just this panel.
        const heightRow = this.createControl('Height:');
        const heightInput = heightRow.input;
        heightInput.value = '100';
        heightRow.groupButton.addEventListener('click', () => {
            api.group.api.setSize({ height: Number(heightInput.value) });
        });
        heightRow.panelButton.addEventListener('click', () => {
            api.setSize({ height: Number(heightInput.value) });
        });

        this._element.append(titleElement, widthRow.element, heightRow.element);
    }

    private createControl(label: string): {
        element: HTMLElement;
        input: HTMLInputElement;
        groupButton: HTMLButtonElement;
        panelButton: HTMLButtonElement;
    } {
        const element = document.createElement('div');
        element.style.display = 'flex';
        element.style.alignItems = 'center';
        element.style.gap = '8px';
        element.style.fontSize = '13px';
        element.style.marginBottom = '6px';

        const span = document.createElement('span');
        span.style.width = '60px';
        span.textContent = label;

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '50';
        input.step = '1';
        input.style.width = '75px';

        const groupButton = document.createElement('button');
        groupButton.textContent = 'Resize Group';

        const panelButton = document.createElement('button');
        panelButton.textContent = 'Resize Panel';

        element.append(span, input, groupButton, panelButton);

        return { element, input, groupButton, panelButton };
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

api.addPanel({
    id: 'panel_1',
    component: 'default',
});
api.addPanel({
    id: 'panel_2',
    component: 'default',
    position: {
        direction: 'right',
        referencePanel: 'panel_1',
    },
});
api.addPanel({
    id: 'panel_3',
    component: 'default',
    position: {
        direction: 'below',
        referencePanel: 'panel_1',
    },
});
api.addPanel({
    id: 'panel_4',
    component: 'default',
});
api.addPanel({
    id: 'panel_5',
    component: 'default',
});
