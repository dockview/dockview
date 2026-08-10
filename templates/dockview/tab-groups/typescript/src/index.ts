import { LicenseManager } from 'dockview-enterprise';
import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewHeaderPosition,
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
        this._element.textContent = parameters.api.title ?? '';
    }
}

const root = document.getElementById('app')!;
root.className = 'example-layout';

const controls = document.createElement('div');
controls.className = 'example-controls';

const positionLabel = document.createElement('label');
positionLabel.textContent = 'Tab position:';
controls.append(positionLabel);

const positions: DockviewHeaderPosition[] = ['top', 'bottom'];
const positionButtons = new Map<DockviewHeaderPosition, HTMLButtonElement>();
let headerPosition: DockviewHeaderPosition = 'top';

const syncPositionButtons = (): void => {
    for (const pos of positions) {
        positionButtons.get(pos)!.disabled = headerPosition === pos;
    }
};

const setHeaderPosition = (position: DockviewHeaderPosition): void => {
    headerPosition = position;
    for (const group of api.groups) {
        group.api.setHeaderPosition(position);
    }
    syncPositionButtons();
};

for (const pos of positions) {
    const button = document.createElement('button');
    button.textContent = pos;
    button.addEventListener('click', () => setHeaderPosition(pos));
    positionButtons.set(pos, button);
    controls.append(button);
}
syncPositionButtons();

const dockElement = document.createElement('div');
dockElement.className = 'example-dock';

root.append(controls, dockElement);

const api = createDockview(dockElement, {
    theme: {
        ...((window as any).__dockviewColorMode === 'light'
            ? themeLight
            : themeAbyss),
        tabAnimation: 'smooth',
    },
    disableFloatingGroups: true,
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
    getTabGroupChipContextMenuItems: () => [
        'rename',
        'colorPicker',
        'collapse',
        'close',
    ],
});

const titles = [
    'Dashboard',
    'Settings',
    'Users',
    'Analytics',
    'Reports',
    'Billing',
    'Notifications',
    'Logs',
];

const firstPanel = api.addPanel({
    id: 'panel_1',
    component: 'default',
    title: titles[0],
});

for (let i = 1; i < titles.length; i++) {
    api.addPanel({
        id: `panel_${i + 1}`,
        component: 'default',
        title: titles[i],
    });
}

const groupId = firstPanel.group.id;

const featureGroup = api.createTabGroup({
    groupId,
    label: 'Feature',
    color: 'blue',
});
['panel_1', 'panel_2', 'panel_3', 'panel_4'].forEach((panelId) => {
    api.addPanelToTabGroup({ groupId, tabGroupId: featureGroup.id, panelId });
});

const monitoringGroup = api.createTabGroup({
    groupId,
    label: 'Monitoring',
    color: 'purple',
});
['panel_5', 'panel_7', 'panel_8'].forEach((panelId) => {
    api.addPanelToTabGroup({
        groupId,
        tabGroupId: monitoringGroup.id,
        panelId,
    });
});
monitoringGroup.collapse();
