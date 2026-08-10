import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewHeaderActionsProps,
    IDockviewPanelProps,
} from 'dockview-react';
import React from 'react';

const Icon = (props: {
    icon: string;
    title?: string;
    onClick?: (event: React.MouseEvent) => void;
}) => {
    return (
        <div
            title={props.title}
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '30px',
                height: '100%',
                fontSize: '18px',
            }}
            onClick={props.onClick}
        >
            <span
                style={{ fontSize: 'inherit', cursor: 'pointer' }}
                className="material-symbols-outlined"
            >
                {props.icon}
            </span>
        </div>
    );
};

const components = {
    default: (props: IDockviewPanelProps) => {
        return <div className="example-panel">{props.api.title}</div>;
    },
};

function loadDefaultLayout(api: DockviewApi) {
    const home = api.addPanel({
        id: 'home',
        title: 'Home',
        component: 'default',
    });

    api.addPanel({ id: 'panel_1', title: 'Panel 1', component: 'default' });
    api.addPanel({ id: 'panel_2', title: 'Panel 2', component: 'default' });
    api.addPanel({ id: 'panel_3', title: 'Panel 3', component: 'default' });
    api.addPanel({ id: 'panel_4', title: 'Panel 4', component: 'default' });

    // Pin the "Home" tab so it always renders first and never overflows.
    home.api.setPinned(true);
}

export const App = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        loadDefaultLayout(event.api);
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            rightHeaderActionsComponent={RightComponent}
            pinnedTabs={{ enabled: true }}
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

const RightComponent = (props: IDockviewHeaderActionsProps) => {
    const [pinned, setPinned] = React.useState<boolean>(false);

    React.useEffect(() => {
        const panel = props.group.activePanel;
        if (!panel) {
            return;
        }

        setPinned(panel.api.isPinned);

        const disposable = panel.api.onDidChangePinned((event) => {
            setPinned(event.isPinned);
        });

        return () => {
            disposable.dispose();
        };
    }, [props.group.activePanel]);

    const onClick = () => {
        props.group.activePanel?.api.setPinned(!pinned);
    };

    return (
        <div style={{ height: '100%', padding: '0px 4px' }}>
            <Icon
                onClick={onClick}
                icon={pinned ? 'keep_off' : 'keep'}
                title={pinned ? 'Unpin tab' : 'Pin tab'}
            />
        </div>
    );
};

export default App;
