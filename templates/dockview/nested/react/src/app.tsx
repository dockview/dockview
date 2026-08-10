import {
    DockviewDidDropEvent,
    DockviewDndOverlayEvent,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-react';
import React from 'react';

const InnerDockview = () => {
    const onReady = (event: DockviewReadyEvent) => {
        event.api.addPanel({
            id: 'inner_panel_1',
            component: 'default',
            title: 'Inner 1',
        });

        event.api.addPanel({
            id: 'inner_panel_2',
            component: 'default',
            title: 'Inner 2',
        });

        event.api.addPanel({
            id: 'inner_panel_3',
            component: 'default',
            title: 'Inner 3',
        });
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            className="nested-dockview"
        />
    );
};

const components = {
    default: (props: IDockviewPanelProps) => {
        return <div className="example-panel">{props.api.title}</div>;
    },
    innerDockview: InnerDockview,
};

const NestedDockview = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'innerDockview',
            title: 'Nested layout',
            position: { referencePanel: 'panel_2', direction: 'right' },
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

export default NestedDockview;
