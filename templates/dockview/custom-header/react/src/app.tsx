import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelHeaderProps,
    IDockviewPanelProps,
} from 'dockview-react';
import React from 'react';

interface CustomParams {
    myValue: number;
}

const components = {
    default: (props: IDockviewPanelProps<CustomParams>) => {
        const [running, setRunning] = React.useState<boolean>(false);

        React.useEffect(() => {
            if (!running) {
                return;
            }

            const interval = setInterval(() => {
                props.api.updateParameters({ myValue: Date.now() });
            }, 1000);
            props.api.updateParameters({ myValue: Date.now() });
            return () => {
                clearInterval(interval);
            };
        }, [running]);

        return (
            <div className="example-panel">
                <div style={{ marginBottom: '8px' }}>{props.api.title}</div>
                <div className="example-controls">
                    <button onClick={() => setRunning(!running)}>
                        {running ? 'Stop' : 'Start'}
                    </button>
                    <span>{`Last updated: ${new Date(
                        props.params.myValue
                    ).toLocaleTimeString()}`}</span>
                </div>
            </div>
        );
    },
};

const tabComponents = {
    default: (props: IDockviewPanelHeaderProps<CustomParams>) => {
        return (
            <div>
                <div>{`custom tab: ${props.api.title}`}</div>
                <span>{`Last updated: ${new Date(
                    props.params.myValue
                ).toLocaleTimeString()}`}</span>
            </div>
        );
    },
};

export const App: React.FC<{ theme?: string }> = (props) => {
    const onReady = (event: DockviewReadyEvent) => {
        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            tabComponent: 'default',
            params: {
                myValue: Date.now(),
            },
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            tabComponent: 'default',
            params: {
                myValue: Date.now(),
            },
        });
    };

    return (
        <DockviewReact
            components={components}
            tabComponents={tabComponents}
            onReady={onReady}
            className={props.theme || 'dockview-theme-abyss'}
        />
    );
};

export default App;
