import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
    IWatermarkPanelProps,
    Orientation,
} from 'dockview-react';
import React from 'react';

let panelCount = 0;

const components = {
    default: (props: IDockviewPanelProps) => {
        return <div className="example-panel">{props.api.title}</div>;
    },
};

const Watermark = (props: IWatermarkPanelProps) => {
    const isGroup = props.containerApi.groups.length > 0;

    const addPanel = () => {
        props.containerApi.addPanel({
            id: Date.now().toString(),
            title: `Panel ${++panelCount}`,
            component: 'default',
        });
    };

    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
            }}
        >
            <div>
                <p>This is a custom watermark. You can change this content.</p>
                <div className="example-controls">
                    <button onClick={addPanel}>Add New Panel</button>
                    {isGroup && (
                        <button
                            onClick={() => {
                                props.group?.api.close();
                            }}
                        >
                            Close Group
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const DockviewWatermark = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    const onReady = (event: DockviewReadyEvent) => {
        event.api.fromJSON({
            grid: {
                orientation: Orientation.HORIZONTAL,
                root: { type: 'branch', data: [] },
                height: 100,
                width: 100,
            },
            panels: {},
        });

        setApi(event.api);
    };

    const onClick = () => {
        if (!api) {
            return;
        }

        api.addGroup();
    };

    return (
        <div className="example-layout">
            <div className="example-controls">
                <button onClick={onClick}>Add Empty Group</button>
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

export default DockviewWatermark;
