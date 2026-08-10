import {
    DockviewApi,
    DockviewDndOverlayEvent,
    DockviewDidDropEvent,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
    positionToDirection,
} from 'dockview-react';
import React from 'react';

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        return <div className="example-panel">{props.params.title}</div>;
    },
};

const DraggableElement = () => (
    <span
        tabIndex={-1}
        onDragStart={(event) => {
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';

                event.dataTransfer.setData('text/plain', 'nothing');
            }
        }}
        style={{
            padding: '4px 12px',
            borderRadius: '4px',
            cursor: 'grab',
            userSelect: 'none',
            color: 'var(--dv-activegroup-visiblepanel-tab-color)',
            background:
                'var(--dv-activegroup-visiblepanel-tab-background-color)',
            border: '1px solid var(--dv-separator-border)',
        }}
        draggable={true}
    >
        Drag me into the dock
    </span>
);

const DndDockview = (props: { renderVisibleOnly: boolean; theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();
    const [dropped, setDropped] = React.useState<
        { type: string; data: string }[] | null
    >(null);

    React.useEffect(() => {
        if (!api) {
            return;
        }

        api.addPanel({
            id: 'panel_1',
            component: 'default',
            params: {
                title: 'Panel 1',
            },
        });

        api.addPanel({
            id: 'panel_2',
            component: 'default',
            params: {
                title: 'Panel 2',
            },
        });

        api.addPanel({
            id: 'panel_3',
            component: 'default',
            params: {
                title: 'Panel 3',
            },
        });

        api.addPanel({
            id: 'panel_4',
            component: 'default',
            params: {
                title: 'Panel 4',
            },
            position: { referencePanel: 'panel_1', direction: 'right' },
        });

        // Pointer (touch) drags can't bridge to external HTML5 drop
        // zones outside dockview; narrow before reading `dataTransfer`.
        const panelDragDisposable = api.onWillDragPanel((event) => {
            if (!(event.nativeEvent instanceof DragEvent)) {
                return;
            }
            const dataTransfer = event.nativeEvent.dataTransfer;

            if (dataTransfer) {
                dataTransfer.setData(
                    'text/plain',
                    'Some custom panel data transfer data'
                );
                dataTransfer.setData(
                    'text/json',
                    '{text: "Some custom panel data transfer data"}'
                );
            }
        });

        const groupDragDisposable = api.onWillDragGroup((event) => {
            if (!(event.nativeEvent instanceof DragEvent)) {
                return;
            }
            const dataTransfer = event.nativeEvent.dataTransfer;

            if (dataTransfer) {
                dataTransfer.setData(
                    'text/plain',
                    'Some custom group data transfer data'
                );
                dataTransfer.setData(
                    'text/json',
                    '{text: "Some custom group data transfer data"}'
                );
            }
        });

        const disposable = api.onUnhandledDragOver((event) => {
            event.accept();
        });

        return () => {
            panelDragDisposable.dispose();
            groupDragDisposable.dispose();
        };
    }, [api]);

    const onReady = (event: DockviewReadyEvent) => {
        setApi(event.api);
    };

    const onDidDrop = (event: DockviewDidDropEvent) => {
        event.api.addPanel({
            id: 'test',
            component: 'default',
            position: {
                direction: positionToDirection(event.position),
                referenceGroup: event.group || undefined,
            },
        });
    };

    const onDrop = (event: React.DragEvent) => {
        const dataTransfer = event.dataTransfer;

        const entries: { type: string; data: string }[] = [];
        for (let i = 0; i < dataTransfer.items.length; i++) {
            const item = dataTransfer.items[i];
            entries.push({
                type: item.type,
                data: dataTransfer.getData(item.type),
            });
        }

        setDropped(entries);
    };

    return (
        <div className="example-layout">
            <div className="example-controls">
                <DraggableElement />
                <div
                    style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '4px 12px',
                        borderRadius: '4px',
                        border: '1px dashed var(--dv-separator-border)',
                        color: 'var(--dv-inactivegroup-visiblepanel-tab-color)',
                    }}
                    onDrop={onDrop}
                >
                    Drop a tab or group here to inspect the attached metadata
                </div>
            </div>
            {dropped && (
                <div
                    className="example-controls"
                    style={{ display: 'block', fontSize: '12px' }}
                >
                    {dropped.length === 0 ? (
                        <span>No dataTransfer data was found.</span>
                    ) : (
                        dropped.map((entry, index) => (
                            <div key={index}>
                                <code>{entry.type}</code>: {entry.data}
                            </div>
                        ))
                    )}
                </div>
            )}
            <div className="example-dock">
                <DockviewReact
                    components={components}
                    onReady={onReady}
                    className={`${props.theme || 'dockview-theme-abyss'}`}
                    onDidDrop={onDidDrop}
                    dndEdges={{
                        size: { value: 100, type: 'pixels' },
                        activationSize: { value: 5, type: 'percentage' },
                    }}
                />
            </div>
        </div>
    );
};

export default DndDockview;
