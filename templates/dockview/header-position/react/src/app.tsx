import {
    DockviewApi,
    DockviewHeaderPosition,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-react';
import React from 'react';

const positions: DockviewHeaderPosition[] = ['top', 'bottom', 'left', 'right'];

const components = {
    default: (props: IDockviewPanelProps) => {
        const [position, setPosition] = React.useState<DockviewHeaderPosition>(
            props.api.group.api.getHeaderPosition()
        );

        const onClick = (value: DockviewHeaderPosition) => {
            props.api.group.api.setHeaderPosition(value);
            setPosition(value);
        };

        return (
            <div className="example-panel">
                <div className="example-controls">
                    {positions.map((value) => (
                        <button
                            key={value}
                            disabled={value === position}
                            onClick={() => onClick(value)}
                        >
                            {value}
                        </button>
                    ))}
                </div>
                <div style={{ fontSize: '13px', marginTop: '12px' }}>
                    {`Header position: ${position}`}
                </div>
            </div>
        );
    },
};

const App = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    const onReady = (event: DockviewReadyEvent) => {
        setApi(event.api);

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

        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            position: {
                referencePanel: panel2,
                direction: 'below',
            },
        });
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            defaultHeaderPosition="bottom"
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

export default App;
