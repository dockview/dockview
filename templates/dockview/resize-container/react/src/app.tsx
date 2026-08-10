import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-react';
import React from 'react';

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        return <div className="example-panel">{props.params.title}</div>;
    },
};

export const App: React.FC<{ theme?: string }> = (props) => {
    const onReady = (event: DockviewReadyEvent) => {
        const panel = event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            params: {
                title: 'Panel 1',
            },
        });

        panel.group.locked = true;
        panel.group.header.hidden = true;

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            params: {
                title: 'Panel 2',
            },
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            params: {
                title: 'Panel 3',
            },
        });

        event.api.addPanel({
            id: 'panel_4',
            component: 'default',
            params: {
                title: 'Panel 4',
            },
            position: { referencePanel: 'panel_1', direction: 'right' },
        });

        event.api.addPanel({
            id: 'panel_5',
            component: 'default',
            params: {
                title: 'Panel 5',
            },
            position: { referencePanel: 'panel_3', direction: 'right' },
        });

        event.api.addPanel({
            id: 'panel_6',
            component: 'default',
            params: {
                title: 'Panel 6',
            },
            position: { referencePanel: 'panel_5', direction: 'below' },
        });

        event.api.addPanel({
            id: 'panel_7',
            component: 'default',
            params: {
                title: 'Panel 7',
            },
            position: { referencePanel: 'panel_6', direction: 'right' },
        });
    };

    return (
        <DockviewReact
            components={components}
            onReady={onReady}
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

const Container = (props: any) => {
    const [value, setValue] = React.useState<string>('50');

    return (
        <div className="example-layout">
            <div className="example-controls">
                <label>
                    Scale:{' '}
                    <input
                        onChange={(event) => setValue(event.target.value)}
                        type="range"
                        min="1"
                        max="100"
                        value={value}
                    />{' '}
                    {value}%
                </label>
            </div>
            <div className="example-dock">
                <div style={{ height: `${value}%`, width: `${value}%` }}>
                    <App {...props} />
                </div>
            </div>
        </div>
    );
};

export default Container;
