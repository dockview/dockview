import { LicenseManager } from 'dockview-enterprise';
import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    GroupPanelPartInitParameters,
    IContentRenderer,
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
        this._element.textContent = parameters.title;
    }
}

const root = document.getElementById('app')!;
root.className = 'example-layout';

const toolbar = document.createElement('div');
toolbar.className = 'example-controls';

const undoButton = document.createElement('button');
undoButton.textContent = 'Undo';
const redoButton = document.createElement('button');
redoButton.textContent = 'Redo';
const addButton = document.createElement('button');
addButton.textContent = 'Add Panel';
toolbar.append(undoButton, redoButton, addButton);

const dockElement = document.createElement('div');
dockElement.className = 'example-dock';

root.append(toolbar, dockElement);

const api: DockviewApi = createDockview(dockElement, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    layoutHistory: { enabled: true, undoableProgrammaticMutations: true },
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
});

let panelCount = 5;

api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
api.addPanel({ id: 'panel_2', component: 'default', title: 'Panel 2' });
api.addPanel({ id: 'panel_3', component: 'default', title: 'Panel 3' });
api.addPanel({
    id: 'panel_4',
    component: 'default',
    title: 'Panel 4',
    position: { direction: 'right' },
});
api.addPanel({ id: 'panel_5', component: 'default', title: 'Panel 5' });

// The seed layout shouldn't be undoable, so start with a clean history.
api.clearHistory();

// Drive the toolbar's disabled state from the history stack.
const sync = (): void => {
    undoButton.disabled = !api.canUndo;
    redoButton.disabled = !api.canRedo;
};
sync();
api.onDidChangeHistory(sync);

undoButton.addEventListener('click', () => api.undo());
redoButton.addEventListener('click', () => api.redo());
addButton.addEventListener('click', () =>
    api.addPanel({
        id: `panel_${++panelCount}`,
        component: 'default',
        title: `Panel ${panelCount}`,
    })
);
