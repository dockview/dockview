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

    private readonly e1: HTMLElement;
    private readonly e2: HTMLElement;
    private readonly e3: HTMLElement;

    private interval: any;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';

        this.e1 = document.createElement('div');
        this.e1.style.marginBottom = '8px';

        const controls = document.createElement('div');
        controls.className = 'example-controls';

        this.e2 = document.createElement('button');
        this.e3 = document.createElement('span');

        this.e2.textContent = 'Start';

        controls.append(this.e2, this.e3);
        this.element.append(this.e1, controls);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        parameters.api.onDidTitleChange((event) => {
            this.e1.textContent = event.title;
        });

        this.e1.textContent = parameters.api.title;
        this.e3.textContent = `Last updated: ${new Date(
            parameters.params.myValue
        ).toLocaleTimeString()}`;

        this.e2.addEventListener('click', () => {
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = undefined;
                this.e2.textContent = 'Start';
            } else {
                this.interval = setInterval(() => {
                    parameters.api.updateParameters({ myValue: Date.now() });
                }, 1000);
                parameters.api.updateParameters({ myValue: Date.now() });
                this.e2.textContent = 'Stop';
            }
        });
    }

    update(event: PanelUpdateEvent<Parameters>): void {
        this.e3.textContent = `Last updated: ${new Date(
            event.params.myValue
        ).toLocaleTimeString()}`;
    }
}

class CustomTab implements ITabRenderer {
    private readonly _element: HTMLElement;

    private readonly e1: HTMLElement;
    private readonly e2: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');

        this.e1 = document.createElement('div');
        this.e2 = document.createElement('span');

        this.element.append(this.e1, this.e2);
    }

    init(parameters: GroupPanelPartInitParameters): void {
        parameters.api.onDidTitleChange(() => {
            this.e1.textContent = `custom tab: ${parameters.api.title}`;
        });

        this.e1.textContent = `custom tab: ${parameters.api.title}`;
        this.e2.textContent = `Last updated: ${new Date(
            parameters.params.myValue
        ).toLocaleTimeString()}`;
    }

    update(event: PanelUpdateEvent<Parameters>): void {
        this.e2.textContent = `Last updated: ${new Date(
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
