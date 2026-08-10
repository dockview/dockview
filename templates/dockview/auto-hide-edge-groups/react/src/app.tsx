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

function addEdgePanel(
    api: DockviewApi,
    referenceGroupId: string,
    id: string,
    title: string
) {
    api.addPanel({
        id,
        component: 'default',
        title,
        params: { title },
        position: { referenceGroup: referenceGroupId },
    });
}

const App = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        const api = event.api;

        // some regular grid panels to peek over
        api.addPanel({
            id: 'doc_1',
            component: 'default',
            title: 'Document',
            params: { title: 'Document' },
        });
        api.addPanel({
            id: 'doc_2',
            component: 'default',
            title: 'Preview',
            params: { title: 'Preview' },
            position: { direction: 'right', referencePanel: 'doc_1' },
        });

        // a left edge group with a couple of tool windows
        const left = api.addEdgeGroup('left', {
            id: 'left-edge',
            initialSize: 240,
            minimumSize: 150,
        });
        addEdgePanel(api, left.id, 'explorer', 'Explorer');
        addEdgePanel(api, left.id, 'search', 'Search');

        // a bottom edge group
        const bottom = api.addEdgeGroup('bottom', {
            id: 'bottom-edge',
            initialSize: 200,
            minimumSize: 100,
        });
        addEdgePanel(api, bottom.id, 'output', 'Output');
        addEdgePanel(api, bottom.id, 'problems', 'Problems');

        // auto-hide both edge groups to their strips; click a tab to peek
        api.autoHideEdgeGroup('left');
        api.autoHideEdgeGroup('bottom');
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            autoHideEdgeGroups={true}
            className={props.theme || 'dockview-theme-abyss'}
        />
    );
};

export default App;
