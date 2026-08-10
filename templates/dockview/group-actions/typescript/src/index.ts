import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewGroupPanel,
    GroupPanelPartInitParameters,
    IContentRenderer,
    IGroupHeaderProps,
    IHeaderActionsRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';
import './index.css';

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
        this._element.textContent = parameters.title;
    }
}

class PrefixHeader implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(group: DockviewGroupPanel) {
        this._element = document.createElement('div');
        this._element.className = 'dockview-groupcontrol-demo';
        this._element.innerText = '🌲';
    }

    init(parameters: IGroupHeaderProps): void {
        //
    }

    dispose(): void {
        //
    }
}

class RightHeaderActions implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement;
    private readonly _disposables: (() => void)[] = [];

    get element(): HTMLElement {
        return this._element;
    }

    constructor(group: DockviewGroupPanel) {
        this._element = document.createElement('div');
        this._element.className = 'dockview-groupcontrol-demo';
    }

    init(parameters: IGroupHeaderProps): void {
        const group = parameters.group;

        const span = document.createElement('span');
        span.className = 'dockview-groupcontrol-demo-group-active';

        this._element.appendChild(span);

        const render = (): void => {
            const active = group.api.isActive;
            span.setAttribute('data-active', `${active}`);
            span.innerText = active ? 'Group active' : 'Group inactive';
        };

        const d1 = group.api.onDidActiveChange(() => render());

        render();

        this._disposables.push(() => d1.dispose());
    }

    dispose(): void {
        this._disposables.forEach((dispose) => dispose());
    }
}

class LeftHeaderActions implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement;
    private readonly _disposables: (() => void)[] = [];

    get element(): HTMLElement {
        return this._element;
    }

    constructor(group: DockviewGroupPanel) {
        this._element = document.createElement('div');
        this._element.className = 'dockview-groupcontrol-demo';
    }

    init(parameters: IGroupHeaderProps): void {
        const group = parameters.group;

        const span = document.createElement('span');
        span.className = 'dockview-groupcontrol-demo-active-panel';

        this._element.appendChild(span);

        const d1 = group.api.onDidActivePanelChange((event) => {
            span.innerText = `activePanel: ${event.panel?.id || 'null'}`;
        });

        span.innerText = `activePanel: ${group.activePanel?.id || 'null'}`;

        this._disposables.push(() => d1.dispose());
    }

    dispose(): void {
        this._disposables.forEach((dispose) => dispose());
    }
}

const api = createDockview(document.getElementById('app'), {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    createComponent: (options): IContentRenderer => {
        switch (options.name) {
            case 'default':
                return new Panel();
            default:
                throw new Error('Panel not found');
        }
    },
    createPrefixHeaderActionComponent: (group): IHeaderActionsRenderer => {
        return new PrefixHeader(group);
    },
    createLeftHeaderActionComponent: (group): IHeaderActionsRenderer => {
        return new LeftHeaderActions(group);
    },
    createRightHeaderActionComponent: (group): IHeaderActionsRenderer => {
        return new RightHeaderActions(group);
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
    position: {
        direction: 'right',
    },
});

api.addPanel({
    id: 'panel_3',
    component: 'default',
    title: 'Panel 3',
    position: {
        direction: 'below',
    },
});
