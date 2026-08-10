import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-react';
import React from 'react';

const shortcutStyle: React.CSSProperties = {
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
};

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        return (
            <div className="example-panel" style={{ fontSize: '13px' }}>
                <div style={{ padding: '10px 0px' }}>{props.api.title}</div>
                <div
                    style={{
                        padding: '10px 0px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        alignItems: 'center',
                    }}
                >
                    <span style={shortcutStyle}>Ctrl+]</span>
                    <span style={shortcutStyle}>Ctrl+[</span>
                    <span>switch tabs</span>
                    <span style={shortcutStyle}>F6</span>
                    <span style={shortcutStyle}>Shift+F6</span>
                    <span>move between groups</span>
                    <span style={shortcutStyle}>Ctrl+M</span>
                    <span>dock with the keyboard</span>
                </div>
            </div>
        );
    },
};

const DockviewDemo = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        const api: DockviewApi = event.api;

        // A couple of groups so F6 group-switching and Ctrl+] tab-switching are
        // both demonstrable.
        api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
        api.addPanel({ id: 'panel_2', component: 'default', title: 'Panel 2' });
        api.addPanel({ id: 'panel_3', component: 'default', title: 'Panel 3' });
        api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: { referencePanel: 'panel_3', direction: 'right' },
        });
        api.addPanel({
            id: 'panel_5',
            component: 'default',
            title: 'Panel 5',
            position: { referencePanel: 'panel_4', direction: 'within' },
        });

        api.getPanel('panel_1')!.api.setActive();
    };

    return (
        <div style={{ height: '100%' }}>
            <DockviewReact
                components={components}
                onReady={onReady}
                // Enable the built-in enterprise keymap: Ctrl+]/Ctrl+[ to switch
                // tabs, F6/Shift+F6 to move between groups, Ctrl+M to dock.
                keyboardNavigation={true}
                className={props.theme || 'dockview-theme-abyss'}
            />
        </div>
    );
};

export default DockviewDemo;
