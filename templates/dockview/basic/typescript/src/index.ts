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

const api = createDockview(document.getElementById('app'), {
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
    title: 'Panel 1',
});

api.addPanel({
    id: 'panel_2',
    component: 'default',
    position: { referencePanel: 'panel_1', direction: 'right' },
    title: 'Panel 2',
});

api.addPanel({
    id: 'panel_3',
    component: 'default',
    position: { referencePanel: 'panel_1', direction: 'below' },
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
});
