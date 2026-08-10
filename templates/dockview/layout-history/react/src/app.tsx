import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-react';
import React from 'react';

const components = {
    default: (props: IDockviewPanelProps) => {
        return <div className="example-panel">{props.api.title}</div>;
    },
};

let panelCount = 5;

function loadDefaultLayout(api: DockviewApi) {
    api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
    api.addPanel({ id: 'panel_2', component: 'default', title: 'Panel 2' });
    api.addPanel({ id: 'panel_3', component: 'default', title: 'Panel 3' });
    api.addPanel({
        id: 'panel_4',
        component: 'default',
        title: 'Panel 4',
        position: { direction: 'right' },
    });
    api.addPanel({ id: 'panel_5', component: 'default', title: 'Panel 5' });
}

const App = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();
    const [canUndo, setCanUndo] = React.useState(false);
    const [canRedo, setCanRedo] = React.useState(false);

    const onReady = (event: DockviewReadyEvent) => {
        loadDefaultLayout(event.api);
        // The seed layout shouldn't be undoable, so start with a clean history.
        event.api.clearHistory();
        setApi(event.api);
    };

    React.useEffect(() => {
        if (!api) {
            return;
        }

        setCanUndo(api.canUndo);
        setCanRedo(api.canRedo);

        const disposable = api.onDidChangeHistory((event) => {
            setCanUndo(event.canUndo);
            setCanRedo(event.canRedo);
        });

        return () => disposable.dispose();
    }, [api]);

    return (
        <div className="example-layout">
            <div className="example-controls">
                <button disabled={!canUndo} onClick={() => api?.undo()}>
                    Undo
                </button>
                <button disabled={!canRedo} onClick={() => api?.redo()}>
                    Redo
                </button>
                <button
                    onClick={() =>
                        api?.addPanel({
                            id: `panel_${++panelCount}`,
                            component: 'default',
                            title: `Panel ${panelCount}`,
                        })
                    }
                >
                    Add Panel
                </button>
            </div>
            <div className="example-dock">
                <DockviewReact
                    onReady={onReady}
                    components={components}
                    layoutHistory={{
                        enabled: true,
                        undoableProgrammaticMutations: true,
                    }}
                    className={props.theme || 'dockview-theme-abyss'}
                />
            </div>
        </div>
    );
};

export default App;
