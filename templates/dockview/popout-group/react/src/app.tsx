import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewHeaderActionsProps,
    IDockviewPanelProps,
    SerializedDockview,
    DockviewPanelApi,
} from 'dockview-react';
import React from 'react';
import { Icon } from './utils.tsx';
import { PopoverMenu } from './popover.tsx';

function usePanelWindowObject(api: DockviewPanelApi): Window {
    const [document, setDocument] = React.useState<Window>(api.getWindow());

    React.useEffect(() => {
        const disposable = api.onDidLocationChange((event) => {
            setDocument(api.getWindow());
        });

        return () => {
            disposable.dispose();
        };
    }, [api]);

    return document;
}

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        const _window = usePanelWindowObject(props.api);

        return (
            <div
                className="example-panel"
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
                <div>{props.api.title}</div>
                <PopoverMenu window={_window} />
            </div>
        );
    },
};

function loadDefaultLayout(api: DockviewApi) {
    api.addPanel({
        id: 'panel_1',
        component: 'default',
        title: 'Panel 1',
    });

    api.addPanel({
        id: 'panel_2',
        component: 'default',
        title: 'Panel 2',
    });

    api.addPanel({
        id: 'panel_3',
        component: 'default',
        title: 'Panel 3',
        position: { direction: 'right' },
    });
}

let panelCount = 0;

function safeParse<T>(value: any): T | null {
    try {
        return JSON.parse(value) as T;
    } catch (err) {
        return null;
    }
}

const useLocalStorage = <T,>(
    key: string
): [T | null, (setter: T | null) => void] => {
    const [state, setState] = React.useState<T | null>(
        safeParse(localStorage.getItem(key))
    );

    React.useEffect(() => {
        const _state = localStorage.getItem('key');
        try {
            if (_state !== null) {
                setState(JSON.parse(_state));
            }
        } catch (err) {
            //
        }
    }, [key]);

    return [
        state,
        (_state: T | null) => {
            if (_state === null) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, JSON.stringify(_state));
                setState(_state);
            }
        },
    ];
};

export const App = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();
    const [layout, setLayout] =
        useLocalStorage<SerializedDockview>('floating.layout');

    const [disableFloatingGroups, setDisableFloatingGroups] =
        React.useState<boolean>(false);

    const load = (api: DockviewApi) => {
        api.clear();
        if (layout) {
            try {
                api.fromJSON(layout);
            } catch (err) {
                console.error(err);
                api.clear();
                loadDefaultLayout(api);
            }
        } else {
            loadDefaultLayout(api);
        }
    };

    const onReady = (event: DockviewReadyEvent) => {
        load(event.api);
        setApi(event.api);
    };

    const [options, setOptions] = React.useState<
        'boundedWithinViewport' | undefined
    >(undefined);

    return (
        <div className="example-layout">
            <div className="example-controls">
                <button
                    onClick={() => {
                        if (api) {
                            setLayout(api.toJSON());
                        }
                    }}
                >
                    Save
                </button>
                <button
                    onClick={() => {
                        if (api) {
                            load(api);
                        }
                    }}
                >
                    Load
                </button>
                <button
                    onClick={() => {
                        api!.clear();
                        setLayout(null);
                    }}
                >
                    Clear
                </button>
            </div>
            <div className="example-dock">
                <DockviewReact
                    onReady={onReady}
                    components={components}
                    watermarkComponent={Watermark}
                    leftHeaderActionsComponent={LeftComponent}
                    rightHeaderActionsComponent={RightComponent}
                    disableFloatingGroups={disableFloatingGroups}
                    floatingGroupBounds={options}
                    className={`${props.theme || 'dockview-theme-abyss'}`}
                />
            </div>
        </div>
    );
};

const LeftComponent = (props: IDockviewHeaderActionsProps) => {
    const onClick = () => {
        props.containerApi.addPanel({
            id: (++panelCount).toString(),
            title: `Tab ${panelCount}`,
            component: 'default',
            position: { referenceGroup: props.group },
        });
    };
    return (
        <div style={{ height: '100%', padding: '0px 4px' }}>
            <Icon onClick={onClick} icon={'add'} title="Add panel" />
        </div>
    );
};

const RightComponent = (props: IDockviewHeaderActionsProps) => {
    const [popout, setPopout] = React.useState<boolean>(
        props.api.location.type === 'popout'
    );

    React.useEffect(() => {
        const disposable = props.group.api.onDidLocationChange((event) => [
            setPopout(event.location.type === 'popout'),
        ]);

        return () => {
            disposable.dispose();
        };
    }, [props.group.api]);

    const onClick = () => {
        if (popout) {
            const group = props.containerApi.addGroup();
            props.group.api.moveTo({ group });
        } else {
            const window = props.containerApi.addPopoutGroup(props.group, {
                popoutUrl: '/popout/index.html',
            });
        }
    };

    return (
        <div style={{ height: '100%', padding: '0px 4px' }}>
            <Icon
                onClick={onClick}
                icon={popout ? 'jump_to_element' : 'back_to_tab'}
                title={popout ? 'Return group to dock' : 'Open group in new window'}
            />
        </div>
    );
};

export default App;

const Watermark = () => {
    return <div style={{ padding: '8px' }}>Empty group</div>;
};
