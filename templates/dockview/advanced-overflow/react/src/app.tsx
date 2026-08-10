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

export const App = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    const onReady = (event: DockviewReadyEvent) => {
        counter = 0;
        // Open enough panels in a single group that the tabs no longer fit,
        // so the extras collapse into the overflow dropdown.
        for (let i = 0; i < 12; i++) {
            addPanel(event.api);
        }
        setApi(event.api);
    };

    return (
        <div className="example-layout">
            <div className="example-controls">
                <button onClick={() => api && addPanel(api)}>Add Tab</button>
            </div>
            <div className="example-dock">
                <DockviewReact
                    onReady={onReady}
                    components={components}
                    // The overflow dropdown gains a filter input (`search`) and
                    // orders its entries most-recently-active first (`mru`).
                    // Click the chevron to search and jump between tabs.
                    overflow={{
                        mode: 'dropdown',
                        search: { placeholder: 'Search tabs…' },
                        mru: true,
                    }}
                    className={`${props.theme || 'dockview-theme-abyss'}`}
                />
            </div>
        </div>
    );
};

export default App;
