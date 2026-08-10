import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    GridConstraintChangeEvent,
    IDockviewPanelProps,
} from 'dockview-react';
import React from 'react';

const components = {
    default: (props: IDockviewPanelProps) => {
        const [contraints, setContraints] =
            React.useState<GridConstraintChangeEvent | null>(null);

        React.useEffect(() => {
            props.api.group.api.onDidConstraintsChange((event) => {
                setContraints(event);
            });
        }, []);

        const onClick = () => {
            props.api.group.api.setConstraints({
                maximumWidth: 300,
                maximumHeight: 300,
            });
        };

        return (
            <div className="example-panel">
                <div className="example-controls">
                    <button onClick={onClick}>Set constraints</button>
                </div>
                {contraints && (
                    <div style={{ fontSize: '13px', marginTop: '12px' }}>
                        {typeof contraints.maximumHeight === 'number' && (
                            <div
                                style={{
                                    border: '1px solid grey',
                                    margin: '2px',
                                    padding: '4px 6px',
                                }}
                            >
                                <span>{`Maximum height: `}</span>
                                <span>{`${contraints.maximumHeight}px`}</span>
                            </div>
                        )}
                        {typeof contraints.minimumHeight === 'number' && (
                            <div
                                style={{
                                    border: '1px solid grey',
                                    margin: '2px',
                                    padding: '4px 6px',
                                }}
                            >
                                <span>{`Minimum height: `}</span>
                                <span>{`${contraints.minimumHeight}px`}</span>
                            </div>
                        )}
                        {typeof contraints.maximumWidth === 'number' && (
                            <div
                                style={{
                                    border: '1px solid grey',
                                    margin: '2px',
                                    padding: '4px 6px',
                                }}
                            >
                                <span>{`Maximum width: `}</span>
                                <span>{`${contraints.maximumWidth}px`}</span>
                            </div>
                        )}
                        {typeof contraints.minimumWidth === 'number' && (
                            <div
                                style={{
                                    border: '1px solid grey',
                                    margin: '2px',
                                    padding: '4px 6px',
                                }}
                            >
                                <span>{`Minimum width: `}</span>
                                <span>{`${contraints.minimumWidth}px`}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    },
};

const App = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    const onReady = (event: DockviewReadyEvent) => {
        const panel1 = event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });

        const panel2 = event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            position: {
                referencePanel: panel1,
                direction: 'right',
            },
        });

        const panel3 = event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            position: {
                referencePanel: panel2,
                direction: 'right',
            },
        });

        const panel4 = event.api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: {
                direction: 'below',
            },
        });
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

export default App;
