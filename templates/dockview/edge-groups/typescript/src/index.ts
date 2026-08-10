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
        this._element.textContent = parameters.title ?? 'Panel';
    }
}

class RightHeaderAction implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement;
    private readonly _group: DockviewGroupPanel;
    private _disposable: { dispose(): void } | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(group: DockviewGroupPanel) {
        this._group = group;
        this._element = document.createElement('div');
    }

    init(parameters: IGroupHeaderProps): void {
        if (this._group.api.location.type !== 'edge') {
            return;
        }

        const button = document.createElement('button');
        button.style.cursor = 'pointer';
        button.style.background = 'none';
        button.style.border = 'none';
        button.style.color = 'inherit';
        button.style.padding = '0 4px';

        const render = (): void => {
            const collapsed = this._group.api.isCollapsed();
            button.textContent = collapsed ? '+' : '-';
            button.title = collapsed ? 'Expand group' : 'Collapse group';
            button.setAttribute(
                'aria-label',
                collapsed ? 'Expand group' : 'Collapse group'
            );
        };

        button.addEventListener('click', () => {
            if (this._group.api.isCollapsed()) {
                this._group.api.expand();
            } else {
                this._group.api.collapse();
            }
        });

        render();
        this._disposable = this._group.api.onDidCollapsedChange(() => render());

        this._element.appendChild(button);
    }

    dispose(): void {
        this._disposable?.dispose();
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
    createRightHeaderActionComponent: (group) => new RightHeaderAction(group),
});

api.addEdgeGroup('left', {
    id: 'left',
    initialSize: 220,
    minimumSize: 150,
});

api.addEdgeGroup('bottom', {
    id: 'bottom',
    initialSize: 180,
    minimumSize: 100,
});

api.addEdgeGroup('right', {
    id: 'right',
    initialSize: 220,
    minimumSize: 150,
    collapsed: true,
});

api.addPanel({
    id: 'explorer',
    component: 'default',
    title: 'Explorer',
    position: { referenceGroup: 'left' },
});

api.addPanel({
    id: 'search',
    component: 'default',
    title: 'Search',
    position: { referenceGroup: 'left' },
});

api.addPanel({
    id: 'terminal',
    component: 'default',
    title: 'Terminal',
    position: { referenceGroup: 'bottom' },
});

api.addPanel({
    id: 'output',
    component: 'default',
    title: 'Output',
    position: { referenceGroup: 'bottom' },
});

api.addPanel({
    id: 'outline',
    component: 'default',
    title: 'Outline',
    position: { referenceGroup: 'right' },
});

api.addPanel({
    id: 'panel_1',
    component: 'default',
    title: 'Editor',
});

api.addPanel({
    id: 'panel_2',
    component: 'default',
    title: 'Preview',
    position: { direction: 'right', referencePanel: 'panel_1' },
});
