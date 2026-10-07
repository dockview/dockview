import { LicenseManager } from 'dockview-enterprise';
import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    DockviewPanelApi,
    GroupPanelPartInitParameters,
    IContentRenderer,
    themeAbyss,
    themeLight,
} from 'dockview';

// dockview.dev docs license key. Replace with your own key in production.
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

const INSTRUMENTS = ['AAPL', 'MSFT', 'GOOG', 'AMZN'];

// Broadcasts the clicked instrument to the other panels on its channel.
class TickersPanel implements IContentRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';
    }

    init(parameters: GroupPanelPartInitParameters): void {
        const hint = document.createElement('p');
        hint.textContent =
            "Click an instrument to broadcast it on this panel's channel.";
        this._element.appendChild(hint);

        for (const id of INSTRUMENTS) {
            const button = document.createElement('button');
            button.textContent = id;
            button.style.display = 'block';
            button.style.margin = '4px 0';
            button.addEventListener('click', () => {
                parameters.api.broadcast({ type: 'instrument', id });
            });
            this._element.appendChild(button);
        }
    }
}

// Renders whatever instrument was last broadcast on its channel.
class DetailsPanel implements IContentRenderer {
    private readonly _element: HTMLElement;
    private _disposable: { dispose(): void } | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';
    }

    init(parameters: GroupPanelPartInitParameters): void {
        const api: DockviewPanelApi = parameters.api;
        const render = (id: unknown) => {
            this._element.textContent =
                id === undefined
                    ? `${api.title}: nothing selected yet`
                    : `${api.title}: showing ${String(id)}`;
        };
        render(api.getCurrentContext()?.id);
        this._disposable = api.onDidReceiveContext((event) => {
            render(event.context.id);
        });
    }

    dispose(): void {
        this._disposable?.dispose();
    }
}

const api = createDockview(document.getElementById('app')!, {
    theme:
        (window as any).__dockviewColorMode === 'light'
            ? themeLight
            : themeAbyss,
    // Enable linked panels: each panel may join one colour channel.
    panelChannels: { enabled: true },
    createComponent: (options) => {
        switch (options.name) {
            case 'tickers':
                return new TickersPanel();
            case 'details':
                return new DetailsPanel();
            default:
                throw new Error(`unknown component ${options.name}`);
        }
    },
});

const tickers = api.addPanel({
    id: 'tickers',
    component: 'tickers',
    title: 'Tickers',
});
const chart = api.addPanel({
    id: 'chart',
    component: 'details',
    title: 'Chart',
    position: { direction: 'right' },
});
api.addPanel({
    id: 'news',
    component: 'details',
    title: 'News',
    position: { referencePanel: 'chart', direction: 'below' },
});

// Link the ticker list and the chart on Red. News starts unlinked:
// right-click its tab and pick Red to wire it in.
tickers.api.joinChannel('red');
chart.api.joinChannel('red');
