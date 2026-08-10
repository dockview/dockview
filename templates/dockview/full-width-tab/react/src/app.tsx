import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
    IDockviewPanelHeaderProps,
} from 'dockview-react';
import * as React from 'react';

const components = {
    default: (props: IDockviewPanelProps<{ title: string; x?: number }>) => {
        return (
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                }}
            >
                <span>{`${props.params.title}`}</span>
                {props.params.x && <span>{`  ${props.params.x}`}</span>}
            </div>
        );
    },
};

const tabComponents = {
    default: (props: IDockviewPanelHeaderProps<{ title: string }>) => {
        return (
            <div
                className="my-custom-tab"
                style={{
                    padding: '0px 8px',
                    width: '100%',
                    display: 'flex',
                    height: '100%',
                    alignItems: 'center',
                    backgroundColor:
                        'var(--dv-tabs-and-actions-container-background-color)',
                }}
            >
                <span>{props.params.title}</span>
                <span style={{ flexGrow: 1 }} />

                <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '16px' }}
                >
                    minimize
                </span>
                <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '16px' }}
                >
                    maximize
                </span>
                <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '16px' }}
                >
                    close
                </span>
            </div>
        );
    },
};

const DockviewNative = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        const panel1 = event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            tabComponent: 'default',
            params: {
                title: 'Window 1',
            },
        });
        panel1.group.locked = true;

        const panel2 = event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            tabComponent: 'default',
            params: {
                title: 'Window 2',
            },
            position: {
                direction: 'right',
            },
        });
        panel2.group.locked = true;

        const panel3 = event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            tabComponent: 'default',
            params: {
                title: 'Window 3',
            },
            position: {
                direction: 'below',
            },
        });
        panel3.group.locked = true;
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            tabComponents={tabComponents}
            className={`${props.theme || 'dockview-theme-abyss'}`}
            singleTabMode="fullwidth"
        />
    );
};

export default DockviewNative;
