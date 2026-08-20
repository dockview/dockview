import { LicenseManager } from 'dockview-enterprise';
import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewApi,
    DockviewScreen,
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

const status = document.createElement('span');

const listButton = document.createElement('button');
listButton.textContent = 'List screens';

const screenSelect = document.createElement('select');

const popoutButton = document.createElement('button');
popoutButton.textContent = 'Popout there';

const moveButton = document.createElement('button');
moveButton.textContent = 'Move popout there';

toolbar.append(listButton, screenSelect, popoutButton, moveButton, status);

const dockElement = document.createElement('div');
dockElement.className = 'example-dock';

root.append(toolbar, dockElement);

const api: DockviewApi = createDockview(dockElement, {
    theme:
        (window as any).__dockviewColorMode === 'light'
            ? themeLight
            : themeAbyss,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
        throw new Error('unsupported');
    },
});

api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
api.addPanel({ id: 'panel_2', component: 'default', title: 'Panel 2' });
api.addPanel({
    id: 'panel_3',
    component: 'default',
    title: 'Panel 3',
    position: { direction: 'right' },
});

function populate(screens: readonly DockviewScreen[]): void {
    screenSelect.innerHTML = '';
    screens.forEach((screen, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        const flags = [
            screen.isPrimary ? 'primary' : '',
            screen.isCurrent ? 'current' : '',
        ]
            .filter(Boolean)
            .join(', ');
        option.textContent = `${index}: ${screen.label || 'screen'}${
            flags ? ` (${flags})` : ''
        }`;
        screenSelect.appendChild(option);
    });
}

function refreshStatus(): void {
    if (!api.hasWindowManagement) {
        status.textContent = 'Window Management API unavailable: single screen';
        return;
    }
    void api.getWindowManagementPermission().then((state) => {
        status.textContent = `permission: ${state}, screens: ${api.screens.length}`;
    });
}

listButton.addEventListener('click', () => {
    // May show the permission prompt, so it runs inside the click handler.
    void api.getScreens().then((screens) => {
        populate(screens);
        refreshStatus();
    });
});

popoutButton.addEventListener('click', () => {
    const group = api.activeGroup;
    if (!group) {
        return;
    }
    void api.addPopoutGroup(group, {
        popoutUrl: '/popout/index.html',
        screen: Number(screenSelect.value) || 0,
    });
});

moveButton.addEventListener('click', () => {
    const group = api.activeGroup;
    if (group?.api.location.type !== 'popout') {
        status.textContent = 'activate a popout group first';
        return;
    }
    void group.api.moveToScreen(Number(screenSelect.value) || 0);
});

api.onDidChangeScreens(() => {
    populate(api.screens);
    refreshStatus();
});

populate(api.screens);
refreshStatus();
