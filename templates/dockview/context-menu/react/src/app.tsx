import {
    DockviewReact,
    DockviewReadyEvent,
    IContextMenuItemComponentProps,
    IDockviewPanelProps,
} from 'dockview-react';
import React from 'react';

const Default = (props: IDockviewPanelProps) => {
    return <div className="example-panel">{props.api.title}</div>;
};

const components = { default: Default };

/**
 * A custom context menu item rendered as a React component.
 * Receives panel, group, api, and close via IContextMenuItemComponentProps.
 */
const FloatMenuItem = ({
    panel,
    api,
    close,
}: IContextMenuItemComponentProps) => {
    return (
        <div
            className="dv-context-menu-item"
            onClick={() => {
                api.addFloatingGroup(panel);
                close();
            }}
        >
            Float tab
        </div>
    );
};

const App = (props: { theme?: string }) => {
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
            component: 'default',
            title: 'Panel 3',
        });
    };

    return (
        <DockviewReact
            className={props.theme || 'dockview-theme-abyss'}
            components={components}
            onReady={onReady}
            getTabContextMenuItems={(params) => [
                'close',
                'closeOthers',
                'closeAll',
                'closeLeft',
                'closeRight',
                'separator',
                'maximize',
                'popout',
                'separator',
                {
                    label: 'Log panel id',
                    action: () => console.log(params.panel.id),
                },
                'separator',
                // A custom component item, shown here as an alternative to the
                // built-in `'float'` shortcut.
                { component: FloatMenuItem },
            ]}
        />
    );
};

export default App;
