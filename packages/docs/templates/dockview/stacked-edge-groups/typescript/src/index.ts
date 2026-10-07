import { LicenseManager } from 'dockview-enterprise';
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

// dockview.dev docs license key. Replace with your own key in production.
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

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
        this._element.textContent = parameters.title ?? '';
    }
}

// A collapse/expand toggle for each group stacked on an edge.
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

    init(_parameters: IGroupHeaderProps): void {
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
    // Let an edge hold more than one group.
    stackedEdgeGroups: true,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
    createRightHeaderActionComponent: (group) => new RightHeaderAction(group),
});

api.addPanel({ id: 'doc_1', component: 'default', title: 'Document' });
api.addPanel({
    id: 'doc_2',
    component: 'default',
    title: 'Preview',
    position: { direction: 'right', referencePanel: 'doc_1' },
});

// the left edge: two groups stacked top to bottom
api.addEdgeGroup('left', {
    id: 'explorer',
    initialSize: 240,
    minimumSize: 150,
});
api.addPanel({
    id: 'files',
    component: 'default',
    title: 'Files',
    position: { referenceGroup: 'explorer' },
});
api.addPanel({
    id: 'search',
    component: 'default',
    title: 'Search',
    position: { referenceGroup: 'explorer' },
});

// joins the left edge below the first group, taking half of its height
api.addEdgeGroup('left', {
    id: 'outline',
    stack: { relativeTo: 'explorer', placement: 'after' },
});
api.addPanel({
    id: 'outline-panel',
    component: 'default',
    title: 'Outline',
    position: { referenceGroup: 'outline' },
});

// the bottom edge: a single group, as before
api.addEdgeGroup('bottom', {
    id: 'bottom-edge',
    initialSize: 180,
    minimumSize: 100,
});
api.addPanel({
    id: 'output',
    component: 'default',
    title: 'Output',
    position: { referenceGroup: 'bottom-edge' },
});
api.addPanel({
    id: 'problems',
    component: 'default',
    title: 'Problems',
    position: { referenceGroup: 'bottom-edge' },
});

// drag a tab onto the top or bottom half of a left edge group to open it in
// a new group stacked there
