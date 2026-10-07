import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewHeaderActionsProps,
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

// A collapse/expand toggle for each group stacked on an edge.
const RightActions = (props: IDockviewHeaderActionsProps) => {
    if (props.location?.type !== 'edge') {
        return null;
    }

    const [collapsed, setCollapsed] = React.useState(props.api.isCollapsed());

    React.useEffect(() => {
        const disposable = props.api.onDidCollapsedChange((event) => {
            setCollapsed(event.isCollapsed);
        });
        return () => disposable.dispose();
    }, [props.api]);

    return (
        <button
            title={collapsed ? 'Expand group' : 'Collapse group'}
            aria-label={collapsed ? 'Expand group' : 'Collapse group'}
            style={{
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                color: 'inherit',
                padding: '0 4px',
            }}
            onClick={() =>
                collapsed ? props.api.expand() : props.api.collapse()
            }
        >
            {collapsed ? '+' : '-'}
        </button>
    );
};

const App = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        const api = event.api;

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

        // the left edge: two groups stacked top to bottom
        const explorer = api.addEdgeGroup('left', {
            id: 'explorer',
            initialSize: 240,
            minimumSize: 150,
        });
        addEdgePanel(api, explorer.id, 'files', 'Files');
        addEdgePanel(api, explorer.id, 'search', 'Search');

        // joins the left edge below the first group, taking half of its height
        const outline = api.addEdgeGroup('left', {
            id: 'outline',
            stack: { relativeTo: explorer.id, placement: 'after' },
        });
        addEdgePanel(api, outline.id, 'outline-panel', 'Outline');

        // the bottom edge: a single group, as before
        const bottom = api.addEdgeGroup('bottom', {
            id: 'bottom-edge',
            initialSize: 180,
            minimumSize: 100,
        });
        addEdgePanel(api, bottom.id, 'output', 'Output');
        addEdgePanel(api, bottom.id, 'problems', 'Problems');

        // drag a tab onto the top or bottom half of a left edge group to
        // open it in a new group stacked there
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            rightHeaderActionsComponent={RightActions}
            stackedEdgeGroups={true}
            className={props.theme || 'dockview-theme-abyss'}
        />
    );
};

export default App;
