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
        this._element.className = 'example-panel';
    }

    init(parameters: GroupPanelPartInitParameters): void {
        this._element.textContent = parameters.api.title ?? '';

        parameters.api.onDidTitleChange(() => {
            this._element.textContent = parameters.api.title ?? '';
        });
    }
}

// A panel whose content is itself a nested dockview instance.
class InnerDockview implements IContentRenderer {
    private readonly _element: HTMLElement;
    private _innerApi?: DockviewApi;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'nested-dockview';
        this._element.style.height = '100%';
    }

    init(): void {
        this._innerApi = createDockview(this._element, {
            theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
            createComponent: (options) => {
                switch (options.name) {
                    case 'default':
                        return new Panel();
                }
            },
        });

        this._innerApi.addPanel({
            id: 'inner_panel_1',
            component: 'default',
            title: 'Inner 1',
        });

        this._innerApi.addPanel({
            id: 'inner_panel_2',
            component: 'default',
            title: 'Inner 2',
        });

        this._innerApi.addPanel({
            id: 'inner_panel_3',
            component: 'default',
            title: 'Inner 3',
        });
    }

    dispose(): void {
        this._innerApi?.dispose();
    }
}

const api: DockviewApi = createDockview(document.getElementById('app')!, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
            case 'innerDockview':
                return new InnerDockview();
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
    title: 'Panel 2',
});

api.addPanel({
    id: 'panel_3',
    component: 'innerDockview',
    title: 'Nested layout',
    position: { referencePanel: 'panel_2', direction: 'right' },
});
