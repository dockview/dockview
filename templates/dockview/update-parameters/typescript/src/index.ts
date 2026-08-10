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

class Panel implements IContentRenderer {
    private readonly _element: HTMLElement;

    private readonly _title: HTMLElement;
    private readonly _button: HTMLElement;
    private readonly _status: HTMLElement;

    private interval: any;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';

        this._title = document.createElement('div');
        this._title.style.marginBottom = '8px';

        const controls = document.createElement('div');
        controls.className = 'example-controls';

        this._button = document.createElement('button');
        this._button.textContent = 'Start';

        this._status = document.createElement('span');

        controls.append(this._button, this._status);
        this._element.append(this._title, controls);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        parameters.api.onDidTitleChange((event) => {
            this._title.textContent = event.title;
        });

        this._title.textContent = parameters.api.title;
        this._status.textContent = `Last updated: ${new Date(
            parameters.params.myValue
        ).toLocaleTimeString()}`;

        this._button.addEventListener('click', () => {
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = undefined;
                this._button.textContent = 'Start';
            } else {
                this.interval = setInterval(() => {
                    parameters.api.updateParameters({ myValue: Date.now() });
                }, 1000);
                parameters.api.updateParameters({ myValue: Date.now() });
                this._button.textContent = 'Stop';
            }
        });
    }

    update(event: PanelUpdateEvent<Parameters>): void {
        this._status.textContent = `Last updated: ${new Date(
            event.params.myValue
        ).toLocaleTimeString()}`;
    }
}

class CustomTab implements ITabRenderer {
    private readonly _element: HTMLElement;

    private readonly _title: HTMLElement;
    private readonly _status: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');

        this._title = document.createElement('div');
        this._status = document.createElement('span');

        this._element.append(this._title, this._status);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        parameters.api.onDidTitleChange(() => {
            this._title.textContent = `custom tab: ${parameters.api.title}`;
        });

        this._title.textContent = `custom tab: ${parameters.api.title}`;
        this._status.textContent = `Last updated: ${new Date(
            parameters.params.myValue
        ).toLocaleTimeString()}`;
    }

    update(event: PanelUpdateEvent<Parameters>): void {
        this._status.textContent = `Last updated: ${new Date(
            event.params.myValue
        ).toLocaleTimeString()}`;
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
    createTabComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new CustomTab();
        }
    },
});

api.addPanel({
    id: 'panel_1',
    component: 'default',
    tabComponent: 'default',
    title: 'Panel 1',
    params: {
        myValue: Date.now(),
    },
});

api.addPanel({
    id: 'panel_2',
    component: 'default',
    tabComponent: 'default',
    position: { referencePanel: 'panel_1', direction: 'right' },
    title: 'Panel 2',
    params: {
        myValue: Date.now(),
    },
});
