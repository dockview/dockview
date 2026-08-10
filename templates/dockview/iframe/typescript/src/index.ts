import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    DockviewIDisposable,
    GroupPanelPartInitParameters,
    IContentRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';

class IframePanel implements IContentRenderer {
    private readonly _element: HTMLElement;
    private readonly _iframe: HTMLIFrameElement;
    private _disposable: DockviewIDisposable | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.style.height = '100%';

        this._iframe = document.createElement('iframe');
        this._iframe.style.width = '100%';
        this._iframe.style.height = '100%';
        this._iframe.src = 'https://dockview.dev';
        this._element.appendChild(this._iframe);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        const update = (isActive: boolean) => {
            // Disable pointer events on the iframe while the panel is inactive so
            // that it doesn't swallow drag interactions used to move the panel.
            this._iframe.style.pointerEvents = isActive ? 'inherit' : 'none';
        };

        update(parameters.api.isActive);

        this._disposable = parameters.api.onDidActiveChange((event) => {
            update(event.isActive);
        });
    }

    dispose(): void {
        this._disposable?.dispose();
    }
}

class BasicPanel implements IContentRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';
        this._element.textContent = 'This panel is just a usual component.';
    }

    init(_parameters: GroupPanelPartInitParameters): void {
        // no-op
    }
}

const api: DockviewApi = createDockview(document.getElementById('app')!, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    createComponent: (options) => {
        switch (options.name) {
            case 'iframeComponent':
                return new IframePanel();
            case 'basicComponent':
                return new BasicPanel();
        }
    },
});

// The iframe panels use `renderer: 'always'` so the panel (and therefore the
// iframe) is never removed from the DOM when it becomes inactive. This prevents
// the iframe from reloading as panels are moved or re-parented.
api.addPanel({
    id: 'panel_1',
    component: 'iframeComponent',
    renderer: 'always',
});

api.addPanel({
    id: 'panel_2',
    component: 'iframeComponent',
    renderer: 'always',
});

api.addPanel({
    id: 'panel_3',
    component: 'basicComponent',
});
