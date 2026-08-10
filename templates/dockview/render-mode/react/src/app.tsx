import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
    DockviewPanelApi,
    DockviewPanelRenderer,
    DockviewApi,
    SerializedDockview,
} from 'dockview-react';
import React from 'react';

const useRenderer = (
    api: DockviewPanelApi
): [DockviewPanelRenderer, (value: DockviewPanelRenderer) => void] => {
    const [mode, setMode] = React.useState<DockviewPanelRenderer>(api.renderer);

    React.useEffect(() => {
        const disposable = api.onDidRendererChange((event) => {
            setMode(event.renderer);
        });

        return () => {
            disposable.dispose();
        };
    }, []);

    const _setMode = React.useCallback(
        (mode: DockviewPanelRenderer) => {
            api.setRenderer(mode);
        },
        [api]
    );

    return [mode, _setMode];
};

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        const [mode, setMode] = useRenderer(props.api);

        return (
            <div style={{ height: '100%', overflow: 'auto' }}>
                <div
                    style={{
                        height: '1000px',
                        padding: '20px',
                        overflow: 'auto',
                    }}
                >
                    <div>{props.api.title}</div>
                    <div>
                        {mode}
                        <button
                            onClick={() => {
                                setMode(
                                    mode === 'onlyWhenVisible'
                                        ? 'always'
                                        : 'onlyWhenVisible'
                                );
                            }}
                        >
                            Toggle render mode
                        </button>
                    </div>
                </div>
            </div>
        );
    },
};

const DockviewDemo = (props: { theme?: string }) => {
    const [value, setValue] = React.useState<string>('100');
    const [api, setApi] = React.useState<DockviewApi | null>(null);

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
            position: { referencePanel: 'panel_1', direction: 'within' },
        });
        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
        });

        event.api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: { referencePanel: 'panel_3', direction: 'below' },
        });

        setApi(event.api);
    };

    const onSave = () => {
        if (!api) {
            return;
        }

        localStorage.setItem(
            'dv_rendermode_state',
            JSON.stringify({ size: value, state: api.toJSON() })
        );
    };

    const onLoad = () => {
        if (!api) {
            return;
        }

        const state = localStorage.getItem('dv_rendermode_state');
        if (typeof state !== 'string') {
            return;
        }

        const json = JSON.parse(state) as {
            size: string;
            state: SerializedDockview;
        };
        setValue(json.size);
        api.fromJSON(json.state);
    };

    return (
        <div className="example-layout">
            <div className="example-controls">
                <button onClick={onSave}>Save</button>
                <button onClick={onLoad}>Load</button>
                <label>
                    Container size ({value}%)
                    <input
                        onChange={(event) => setValue(event.target.value)}
                        type="range"
                        min="1"
                        max="100"
                        value={value}
                    />
                </label>
            </div>
            <div className="example-dock">
                <div style={{ height: `${value}%`, width: `${value}%` }}>
                    <DockviewReact
                        components={components}
                        onReady={onReady}
                        className={props.theme || 'dockview-theme-abyss'}
                    />
                </div>
            </div>
        </div>
    );
};

export default DockviewDemo;
