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

let floatCount = 0;

function addFloatingGroup(
    api: DockviewApi,
    position: { top: number; left: number }
) {
    floatCount++;
    api.addPanel({
        id: `float_${floatCount}`,
        title: `Floating ${floatCount}`,
        component: 'default',
        params: { title: `Floating ${floatCount}` },
        floating: {
            width: 220,
            height: 140,
            position: { top: position.top, left: position.left },
        },
    });
}

function loadDefaultLayout(api: DockviewApi) {
    api.addPanel({
        id: 'panel_1',
        component: 'default',
        params: { title: 'Panel 1' },
    });

    api.addPanel({
        id: 'panel_2',
        component: 'default',
        params: { title: 'Panel 2' },
        position: { direction: 'right' },
    });

    // A couple of floating groups so alignment + snapping is demonstrable:
    // drag one near the other (or towards a container edge) to see the guides.
    addFloatingGroup(api, { top: 40, left: 60 });
    addFloatingGroup(api, { top: 220, left: 340 });
}

export const App = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    const onReady = (event: DockviewReadyEvent) => {
        loadDefaultLayout(event.api);
        setApi(event.api);
    };

    return (
        <div className="example-layout">
            <div className="example-controls">
                <button
                    onClick={() => {
                        if (api) {
                            addFloatingGroup(api, {
                                top: 60 + floatCount * 10,
                                left: 60 + floatCount * 10,
                            });
                        }
                    }}
                >
                    Add Floating Group
                </button>
            </div>
            <div className="example-dock">
                <DockviewReact
                    onReady={onReady}
                    components={components}
                    smartGuides={{ snapDistance: 8 }}
                    className={`${props.theme || 'dockview-theme-abyss'}`}
                />
            </div>
        </div>
    );
};

export default App;
