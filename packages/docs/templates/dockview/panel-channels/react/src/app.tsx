import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
    PanelChannelContext,
} from 'dockview-react';
import React from 'react';

const INSTRUMENTS = ['AAPL', 'MSFT', 'GOOG', 'AMZN'];

// Broadcasts the clicked instrument to the other panels on its channel.
const Tickers = (props: IDockviewPanelProps) => {
    return (
        <div className="example-panel">
            <p>Click an instrument to broadcast it on this panel's channel.</p>
            {INSTRUMENTS.map((id) => (
                <button
                    key={id}
                    style={{ display: 'block', margin: '4px 0' }}
                    onClick={() =>
                        props.api.broadcast({ type: 'instrument', id })
                    }
                >
                    {id}
                </button>
            ))}
        </div>
    );
};

// Renders whatever instrument was last broadcast on its channel.
const Details = (props: IDockviewPanelProps) => {
    const [context, setContext] = React.useState<
        PanelChannelContext | undefined
    >(props.api.getCurrentContext());

    React.useEffect(() => {
        const disposable = props.api.onDidReceiveContext((event) => {
            setContext(event.context);
        });
        return () => disposable.dispose();
    }, [props.api]);

    return (
        <div className="example-panel">
            {context
                ? `${props.api.title}: showing ${String(context.id)}`
                : `${props.api.title}: nothing selected yet`}
        </div>
    );
};

const components = {
    tickers: Tickers,
    details: Details,
};

function loadDefaultLayout(api: DockviewApi) {
    const tickers = api.addPanel({
        id: 'tickers',
        title: 'Tickers',
        component: 'tickers',
    });
    const chart = api.addPanel({
        id: 'chart',
        title: 'Chart',
        component: 'details',
        position: { direction: 'right' },
    });
    api.addPanel({
        id: 'news',
        title: 'News',
        component: 'details',
        position: { referencePanel: 'chart', direction: 'below' },
    });

    // Link the ticker list and the chart on Red. News starts unlinked:
    // right-click its tab and pick Red to wire it in.
    tickers.api.joinChannel('red');
    chart.api.joinChannel('red');
}

export const App = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        loadDefaultLayout(event.api);
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            panelChannels={{ enabled: true }}
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

export default App;
