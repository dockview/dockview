import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-react';
import * as React from 'react';

const components = {
    iframeComponent: (props: IDockviewPanelProps) => {
        const [enabled, setEnabled] = React.useState<boolean>(
            props.api.isActive
        );

        React.useEffect(() => {
            const disposable = props.api.onDidActiveChange((event) => {
                setEnabled(event.isActive);
            });

            return () => {
                disposable.dispose();
            };
        }, [props.api]);

        return (
            <iframe
                style={{
                    width: '100%',
                    height: '100%',
                    pointerEvents: enabled ? 'inherit' : 'none',
                }}
                src="https://dockview.dev"
            />
        );
    },
    basicComponent: () => {
        return (
            <div className="example-panel">
                This panel is just a usual component.
            </div>
        );
    },
};

export const App = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        event.api.addPanel({
            id: 'panel_1',
            component: 'iframeComponent',
            renderer: 'always',
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'iframeComponent',
            renderer: 'always',
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'basicComponent',
        });
    };

    return (
        <DockviewReact
            components={components}
            onReady={onReady}
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

export default App;
