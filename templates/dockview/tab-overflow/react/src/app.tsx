import {
    DockviewApi,
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

let counter = 0;

function addPanel(api: DockviewApi) {
    counter++;
    api.addPanel({
        id: `panel_${counter}`,
        component: 'default',
        title: `Panel ${counter}`,
        params: { title: `Panel ${counter}` },
    });
}

// Apply the header orientation to every group: `'left'` runs the tabs down a
// vertical header (so wrap mode wraps into columns), `'top'` is the default row.
function applyHeaderPosition(api: DockviewApi, vertical: boolean) {
    api.groups.forEach((group) =>
        group.api.setHeaderPosition(vertical ? 'left' : 'top')
    );
}

export const App = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();
    const [mode, setMode] = React.useState<'wrap' | 'dropdown'>('wrap');
    const [vertical, setVertical] = React.useState<boolean>(false);

    const onReady = (event: DockviewReadyEvent) => {
        counter = 0;
        // Open enough panels in a single group that the tabs no longer fit on
        // one row.
        for (let i = 0; i < 12; i++) {
            addPanel(event.api);
        }
        setApi(event.api);
    };

    const onAddTab = () => {
        if (!api) {
            return;
        }
        addPanel(api);
        // Re-apply the current orientation so a tab added while vertical keeps
        // its group's header on the left.
        applyHeaderPosition(api, vertical);
    };

    const toggleMode = () => {
        // The `overflow` prop below is bound to `mode`, so flipping the state
        // re-applies the option through the React wrapper, so no manual
        // `updateOptions` call is needed (a hard-coded prop would revert it).
        setMode((m) => (m === 'wrap' ? 'dropdown' : 'wrap'));
    };

    const toggleVertical = () => {
        const next = !vertical;
        setVertical(next);
        if (api) {
            applyHeaderPosition(api, next);
        }
    };

    return (
        <div className="example-layout">
            <div className="example-controls">
                <button onClick={onAddTab}>Add Tab</button>
                <button onClick={toggleMode}>
                    {mode === 'wrap'
                        ? 'Switch to dropdown mode'
                        : 'Switch to wrap mode'}
                </button>
                <button onClick={toggleVertical}>
                    {vertical ? 'Horizontal header' : 'Vertical header'}
                </button>
            </div>
            <div className="example-dock">
                <DockviewReact
                    onReady={onReady}
                    components={components}
                    overflow={{ mode }}
                    // Enabling pinned tabs auto-injects a Pin/Unpin item into the
                    // tab right-click menu, so our custom items need no extra wiring.
                    pinnedTabs={{ enabled: true }}
                    getTabContextMenuItems={() => [
                        {
                            label:
                                mode === 'wrap'
                                    ? 'Switch to dropdown mode'
                                    : 'Switch to wrap mode',
                            action: () =>
                                setMode((m) =>
                                    m === 'wrap' ? 'dropdown' : 'wrap'
                                ),
                        },
                        {
                            label: vertical
                                ? 'Horizontal header'
                                : 'Vertical header',
                            action: () => toggleVertical(),
                        },
                    ]}
                    className={`${props.theme || 'dockview-theme-abyss'}`}
                />
            </div>
        </div>
    );
};

export default App;
