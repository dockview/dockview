import {
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

const App = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        const api = event.api;

        api.addPanel({
            id: 'about',
            component: 'default',
            title: 'Read me',
            params: {
                title: 'Drag any tab to the far edge of the layout to dock it as an edge group (a green line marks the edge-group drop zone). Remove the last panel from an edge and it disappears to zero footprint; drag one back to reveal it again.',
            },
        });
        api.addPanel({
            id: 'doc_1',
            component: 'default',
            title: 'Document',
            params: { title: 'Document' },
            position: { direction: 'right', referencePanel: 'about' },
        });
        api.addPanel({
            id: 'doc_2',
            component: 'default',
            title: 'Preview',
            params: { title: 'Preview' },
            position: { direction: 'below', referencePanel: 'doc_1' },
        });
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            dockToEdgeGroups={true}
            autoHideEdgeGroups={true}
            className={props.theme || 'dockview-theme-abyss'}
        />
    );
};

export default App;
