import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    DockviewTheme,
    IDockviewPanelProps,
    themeAbyss,
    TabAnimation,
} from 'dockview-react';
import React from 'react';

const Default = (props: IDockviewPanelProps) => {
    return <div className="example-panel">{props.api.title}</div>;
};

const components = {
    default: Default,
};

const Component = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();
    const [tabAnimation, setTabAnimation] = React.useState<TabAnimation>('default');

    const theme: DockviewTheme = React.useMemo(
        () => ({ ...themeAbyss, tabAnimation }),
        [tabAnimation]
    );

    const toggleMode = () => {
        setTabAnimation((prev) => (prev === 'smooth' ? 'default' : 'smooth'));
    };

    React.useEffect(() => {
        if (!api) {
            return;
        }

        const disposables = [
            api.onWillShowOverlay((e) => {
                if (e.kind === 'header_space' || e.kind === 'tab') {
                    return;
                }
                e.preventDefault();
            }),
        ];

        return () => {
            disposables.forEach((disposable) => {
                disposable.dispose();
            });
        };
    }, [api]);

    const onReady = (event: DockviewReadyEvent) => {
        setApi(event.api);

        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
        });
        event.api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
        });
        event.api.addPanel({
            id: 'panel_5',
            component: 'default',
            title: 'Panel 5',
        });
    };

    return (
        <div className="example-layout">
            <div className="example-controls">
                <button onClick={toggleMode}>
                    {`tabAnimation: ${tabAnimation}`}
                </button>
            </div>
            <div className="example-dock">
                <DockviewReact
                    className={`${props.theme || 'dockview-theme-abyss'}`}
                    onReady={onReady}
                    components={components}
                    theme={theme}
                    disableFloatingGroups={true}
                />
            </div>
        </div>
    );
};

export default Component;
