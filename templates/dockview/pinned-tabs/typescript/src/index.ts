import { LicenseManager } from 'dockview-enterprise';
import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
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
        this._element.textContent = parameters.api.title ?? '';
    }
}

// Renders a single clickable material-symbols icon, mirroring the React `Icon`.
function createIcon(
    icon: string,
    title: string,
    onClick: () => void
): HTMLElement {
    const container = document.createElement('div');
    container.title = title;
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    container.style.width = '30px';
    container.style.height = '100%';
    container.style.fontSize = '18px';

    const span = document.createElement('span');
    span.className = 'material-symbols-outlined';
    span.style.fontSize = 'inherit';
    span.style.cursor = 'pointer';
    span.textContent = icon;

    container.appendChild(span);
    container.addEventListener('click', onClick);

    return container;
}

// Right header action: pin/unpin the group's active tab, mirroring the React
// `RightComponent`.
class RightHeaderActions implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement = document.createElement('div');
    private readonly _disposables: (() => void)[] = [];
    private _pinnedDisposable: (() => void) | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    init(parameters: IGroupHeaderProps): void {
        this._element.style.height = '100%';
        this._element.style.padding = '0px 4px';

        const render = () => {
            this._element.innerHTML = '';
            const panel = parameters.group.activePanel;
            if (!panel) {
                return;
            }
            const pinned = panel.api.isPinned;
            const icon = createIcon(
                pinned ? 'keep_off' : 'keep',
                pinned ? 'Unpin tab' : 'Pin tab',
                () => panel.api.setPinned(!panel.api.isPinned)
            );
            this._element.appendChild(icon);
        };

        const subscribe = () => {
            this._pinnedDisposable?.();
            const panel = parameters.group.activePanel;
            if (panel) {
                const disposable = panel.api.onDidChangePinned(() => render());
                this._pinnedDisposable = () => disposable.dispose();
            }
            render();
        };

        subscribe();

        const disposable = parameters.api.onDidActivePanelChange(() =>
            subscribe()
        );
        this._disposables.push(() => disposable.dispose());
    }

    dispose(): void {
        this._pinnedDisposable?.();
        this._disposables.forEach((dispose) => dispose());
    }
}

const api = createDockview(document.getElementById('app')!, {
    theme: (window as any).__dockviewColorMode === 'light' ? themeLight : themeAbyss,
    // Enable pinned tabs, which stay ahead of the other tabs and never overflow.
    pinnedTabs: { enabled: true },
    createComponent: (options) => {
        switch (options.name) {
            case 'default':
                return new Panel();
        }
    },
    createRightHeaderActionComponent: () => new RightHeaderActions(),
});

const home = api.addPanel({ id: 'home', component: 'default', title: 'Home' });
api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
api.addPanel({ id: 'panel_2', component: 'default', title: 'Panel 2' });
api.addPanel({ id: 'panel_3', component: 'default', title: 'Panel 3' });
api.addPanel({ id: 'panel_4', component: 'default', title: 'Panel 4' });

// Pin the "Home" tab so it always renders first and never overflows.
home.api.setPinned(true);
