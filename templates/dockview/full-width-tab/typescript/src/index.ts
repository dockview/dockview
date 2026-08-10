import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    GroupPanelPartInitParameters,
    IContentRenderer,
    ITabRenderer,
    PanelUpdateEvent,
    Parameters,
    themeAbyss,
    themeLight,
} from 'dockview';

class DefaultPanel implements IContentRenderer {
    private readonly _element: HTMLElement;
    private readonly _titleElement: HTMLElement;
    private readonly _paramsElement: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.style.display = 'flex';
        this._element.style.justifyContent = 'center';
        this._element.style.alignItems = 'center';
        this._element.style.height = '100%';

        this._titleElement = document.createElement('span');
        this._paramsElement = document.createElement('span');

        this._element.appendChild(this._titleElement);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        this.render(parameters.params);
    }

    update(event: PanelUpdateEvent<Parameters>): void {
        this.render(event.params);
    }

    private render(params: Record<string, any>) {
        this._titleElement.textContent = params.title;

        if (params.x) {
            if (!this._paramsElement.parentElement) {
                this._element.appendChild(this._paramsElement);
            }
            this._paramsElement.textContent = params.x;
        } else {
            this._paramsElement.parentElement?.removeChild(this._paramsElement);
        }
    }
}

class DefaultTab implements ITabRenderer {
    private readonly _element: HTMLElement;
    private readonly _title: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'my-custom-tab';
        this._element.style.padding = '0px 8px';
        this._element.style.width = '100%';
        this._element.style.display = 'flex';
        this._element.style.height = '100%';
        this._element.style.alignItems = 'center';
        this._element.style.backgroundColor =
            'var(--dv-tabs-and-actions-container-background-color)';

        this._title = document.createElement('span');

        const spacer = document.createElement('span');
        spacer.style.flexGrow = '1';

        const btn1 = document.createElement('span');
        btn1.className = 'my-custom-tab-icon material-symbols-outlined';
        btn1.style.fontSize = '16px';
        btn1.textContent = 'minimize';

        const btn2 = document.createElement('span');
        btn2.className = 'my-custom-tab-icon material-symbols-outlined';
        btn2.style.fontSize = '16px';
        btn2.textContent = 'maximize';

        const btn3 = document.createElement('span');
        btn3.className = 'my-custom-tab-icon material-symbols-outlined';
        btn3.style.fontSize = '16px';
        btn3.textContent = 'close';

        this._element.appendChild(this._title);
        this._element.appendChild(spacer);
        this._element.appendChild(btn1);
        this._element.appendChild(btn2);
        this._element.appendChild(btn3);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        this.render(parameters.params);
    }

    update(event: PanelUpdateEvent<Parameters>): void {
        this.render(event.params);
    }

    private render(params: Record<string, any>) {
        this._title.textContent = params.title;
    }
}

const api = createDockview(document.getElementById('app')!, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    // A lone tab in a group fills the entire header width.
    singleTabMode: 'fullwidth',
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new DefaultPanel();
        }
    },
    createTabComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new DefaultTab();
        }
    },
});

const panel1 = api.addPanel({
    id: 'panel_1',
    component: 'default',
    tabComponent: 'default',
    params: {
        title: 'Window 1',
    },
});
panel1.group.locked = true;

const panel2 = api.addPanel({
    id: 'panel_2',
    component: 'default',
    tabComponent: 'default',
    params: {
        title: 'Window 2',
    },
    position: {
        direction: 'right',
    },
});
panel2.group.locked = true;

const panel3 = api.addPanel({
    id: 'panel_3',
    component: 'default',
    tabComponent: 'default',
    params: {
        title: 'Window 3',
    },
    position: {
        direction: 'below',
    },
});
panel3.group.locked = true;
