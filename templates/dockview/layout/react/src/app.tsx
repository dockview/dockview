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
    });
}

export const DockviewPersistence = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    const clearLayout = () => {
        localStorage.removeItem('dockview_persistence_layout');
        if (api) {
            api.clear();
            loadDefaultLayout(api);
        }
    };

    const onReady = (event: DockviewReadyEvent) => {
        const layoutString = localStorage.getItem(
            'dockview_persistence_layout'
        );

        let success = false;

        if (layoutString) {
            try {
                const layout = JSON.parse(layoutString);
                event.api.fromJSON(layout);
                success = true;
            } catch (err) {
                console.error(err);
            }
        }

        if (!success) {
            loadDefaultLayout(event.api);
        }

        setApi(event.api);
    };

    React.useEffect(() => {
        if (!api) {
            return;
        }

        api.onDidLayoutChange(() => {
            const layout = api.toJSON();

            localStorage.setItem(
                'dockview_persistence_layout',
                JSON.stringify(layout)
            );
        });
    }, [api]);

    return (
        <div className="example-layout">
            <div className="example-controls">
                <button onClick={clearLayout}>Reset Layout</button>
            </div>
            <div className="example-dock">
                <DockviewReact
                    onReady={onReady}
                    components={components}
                    watermarkComponent={Watermark}
                    className={`${props.theme || 'dockview-theme-abyss'}`}
                />
            </div>
        </div>
    );
};

export default DockviewPersistence;

const Watermark = () => {
    return <div className="example-panel">This group is empty.</div>;
};
