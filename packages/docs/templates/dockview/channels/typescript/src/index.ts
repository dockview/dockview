import 'dockview/dist/styles/dockview.css';
import {
    createDockview,
    GroupPanelPartInitParameters,
    IContentRenderer,
} from 'dockview';

const TICKERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];

interface Instrument {
    ticker: string;
}

/** Broadcasts onto whichever channel the user put this panel on. */
class BlotterPanel implements IContentRenderer {
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
        hint.textContent = 'Click a ticker to broadcast it.';
        this._element.appendChild(hint);

        const row = document.createElement('div');

        for (const ticker of TICKERS) {
            const button = document.createElement('button');
            button.textContent = ticker;
            button.addEventListener('click', () => {
                parameters.containerApi.channels.broadcast(
                    parameters.api.id,
                    { ticker }
                );
            });
            row.appendChild(button);
        }

        this._element.appendChild(row);
    }
}

/** Listens on whichever channel the user put this panel on. */
class ChartPanel implements IContentRenderer {
    private readonly _element: HTMLElement;
    private _disposable: { dispose(): void } | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'example-panel';
        this._element.textContent = 'Waiting for context.';
    }

    init(parameters: GroupPanelPartInitParameters): void {
        this._disposable = parameters.containerApi.channels.addContextListener(
            parameters.api.id,
            (context) => {
                this._element.textContent = (context as Instrument).ticker;
            }
        );
    }

    dispose(): void {
        this._disposable?.dispose();
    }
}

const root = document.getElementById('app')!;
root.className = 'example-layout';

const controls = document.createElement('div');
controls.className = 'example-controls';
const hint = document.createElement('span');
hint.textContent =
    "Use the coloured dot on each tab to change a panel's channel.";
controls.appendChild(hint);

const dockRoot = document.createElement('div');
dockRoot.className = 'example-dock';

root.appendChild(controls);
root.appendChild(dockRoot);

const api = createDockview(dockRoot, {
    className: (window as any).__dockviewThemeClass ?? 'dockview-theme-abyss',
    channels: { enabled: true },
    createComponent: (options) => {
        switch (options.name) {
            case 'blotter':
                return new BlotterPanel();
            default:
                return new ChartPanel();
        }
    },
});

api.addPanel({ id: 'blotter', component: 'blotter', title: 'Blotter' });
api.addPanel({
    id: 'chart-1',
    component: 'chart',
    title: 'Chart 1',
    position: { direction: 'right' },
});
api.addPanel({
    id: 'chart-2',
    component: 'chart',
    title: 'Chart 2',
    position: { direction: 'below' },
});

// Start the blotter and the first chart linked, so the example does something
// on the first click. Chart 2 is left unlinked on purpose.
api.channels.setChannel('blotter', 'red');
api.channels.setChannel('chart-1', 'red');
