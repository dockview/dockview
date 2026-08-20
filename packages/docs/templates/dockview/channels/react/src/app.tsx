import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-react';
import React from 'react';

const TICKERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];

interface Instrument {
    ticker: string;
}

/**
 * Broadcasts onto whichever channel the user put this panel on. It has no
 * reference to any chart panel.
 */
const Blotter = (props: IDockviewPanelProps) => {
    return (
        <div className="example-panel">
            <p>Click a ticker to broadcast it.</p>
            <div>
                {TICKERS.map((ticker) => (
                    <button
                        key={ticker}
                        onClick={() =>
                            props.containerApi.channels.broadcast(
                                props.api.id,
                                { ticker }
                            )
                        }
                    >
                        {ticker}
                    </button>
                ))}
            </div>
        </div>
    );
};

/**
 * Listens on whichever channel the user put this panel on. It has no reference
 * to the blotter.
 */
const Chart = (props: IDockviewPanelProps) => {
    const [ticker, setTicker] = React.useState<string>();

    React.useEffect(() => {
        const disposable = props.containerApi.channels.addContextListener(
            props.api.id,
            (context) => setTicker((context as Instrument).ticker)
        );
        return () => disposable.dispose();
    }, [props.api.id, props.containerApi]);

    if (!ticker) {
        return (
            <div className="example-panel">
                <p>Waiting for context.</p>
            </div>
        );
    }

    return (
        <div className="example-panel">
            <h2>{ticker}</h2>
        </div>
    );
};

const components = {
    blotter: Blotter,
    chart: Chart,
};

const Component = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    const onReady = (event: DockviewReadyEvent) => {
        const blotter = event.api.addPanel({
            id: 'blotter',
            component: 'blotter',
            title: 'Blotter',
        });

        event.api.addPanel({
            id: 'chart-1',
            component: 'chart',
            title: 'Chart 1',
            position: { direction: 'right' },
        });

        event.api.addPanel({
            id: 'chart-2',
            component: 'chart',
            title: 'Chart 2',
            position: { direction: 'below' },
        });

        // Start the blotter and the first chart linked, so the example does
        // something on the first click. Chart 2 is left unlinked on purpose.
        event.api.channels.setChannel('blotter', 'red');
        event.api.channels.setChannel('chart-1', 'red');

        blotter.api.setActive();
        setApi(event.api);
    };

    return (
        <div className="example-layout">
            <div className="example-controls">
                <span>
                    Use the coloured dot on each tab to change a panel's
                    channel.
                </span>
            </div>
            <DockviewReact
                components={components}
                onReady={onReady}
                channels={{ enabled: true }}
                className={props.theme || 'dockview-theme-abyss'}
            />
        </div>
    );
};

export default Component;
