import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    DockviewScreen,
    IDockviewPanelProps,
} from 'dockview-react';
import React from 'react';

const components = {
    default: (props: IDockviewPanelProps) => {
        return <div className="example-panel">{props.api.title}</div>;
    },
};

function loadDefaultLayout(api: DockviewApi) {
    api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
    api.addPanel({ id: 'panel_2', component: 'default', title: 'Panel 2' });
    api.addPanel({
        id: 'panel_3',
        component: 'default',
        title: 'Panel 3',
        position: { direction: 'right' },
    });
}

const screenLabel = (screen: DockviewScreen, index: number) => {
    const flags = [
        screen.isPrimary ? 'primary' : '',
        screen.isCurrent ? 'current' : '',
    ]
        .filter(Boolean)
        .join(', ');
    return `${index}: ${screen.label || 'screen'}${flags ? ` (${flags})` : ''}`;
};

const App = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();
    const [screens, setScreens] = React.useState<readonly DockviewScreen[]>([]);
    const [target, setTarget] = React.useState(0);
    const [status, setStatus] = React.useState('');

    const refreshStatus = React.useCallback((api: DockviewApi) => {
        if (!api.hasWindowManagement) {
            setStatus('Window Management API unavailable: single screen');
            return;
        }
        void api.getWindowManagementPermission().then((state) => {
            setStatus(`permission: ${state}, screens: ${api.screens.length}`);
        });
    }, []);

    const onReady = (event: DockviewReadyEvent) => {
        loadDefaultLayout(event.api);
        setApi(event.api);
        setScreens(event.api.screens);
        refreshStatus(event.api);
    };

    React.useEffect(() => {
        if (!api) {
            return;
        }
        const disposable = api.onDidChangeScreens((event) => {
            setScreens(event.screens);
            refreshStatus(api);
        });
        return () => disposable.dispose();
    }, [api, refreshStatus]);

    const listScreens = () => {
        if (!api) {
            return;
        }
        // May show the permission prompt, so it runs inside the click handler.
        void api.getScreens().then((screens) => {
            setScreens(screens);
            refreshStatus(api);
        });
    };

    const popoutThere = () => {
        const group = api?.activeGroup;
        if (!api || !group) {
            return;
        }
        void api.addPopoutGroup(group, {
            popoutUrl: '/popout/index.html',
            screen: target,
        });
    };

    const moveThere = () => {
        const group = api?.activeGroup;
        if (group?.api.location.type !== 'popout') {
            setStatus('activate a popout group first');
            return;
        }
        void group.api.moveToScreen(target);
    };

    return (
        <div className="example-layout">
            <div className="example-controls">
                <button onClick={listScreens}>List screens</button>
                <select
                    value={target}
                    onChange={(event) => setTarget(Number(event.target.value))}
                >
                    {screens.map((screen, index) => (
                        <option key={screen.id} value={index}>
                            {screenLabel(screen, index)}
                        </option>
                    ))}
                </select>
                <button onClick={popoutThere}>Popout there</button>
                <button onClick={moveThere}>Move popout there</button>
                <span>{status}</span>
            </div>
            <div className="example-dock">
                <DockviewReact
                    className={props.theme}
                    onReady={onReady}
                    components={components}
                />
            </div>
        </div>
    );
};

export default App;
