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

function loadDefaultLayout(api: DockviewApi) {
    // A small docked layout with panels on every side so that, while dragging
    // a tab, the aim-at-a-cell DnD compass can be seen resolving to each cell.
    const panel1 = api.addPanel({
        id: 'panel_1',
        component: 'default',
        title: 'Panel 1',
        params: { title: 'Panel 1' },
    });

    api.addPanel({
        id: 'panel_2',
        component: 'default',
        title: 'Panel 2',
        params: { title: 'Panel 2' },
        position: { referencePanel: panel1, direction: 'right' },
    });

    api.addPanel({
        id: 'panel_3',
        component: 'default',
        title: 'Panel 3',
        params: { title: 'Panel 3' },
        position: { referencePanel: panel1, direction: 'below' },
    });

    api.addPanel({
        id: 'panel_4',
        component: 'default',
        title: 'Panel 4',
        params: { title: 'Panel 4' },
        position: { referencePanel: panel1, direction: 'within' },
    });
}

export const App = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        loadDefaultLayout(event.api);
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            dndCompass={true}
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

export default App;
