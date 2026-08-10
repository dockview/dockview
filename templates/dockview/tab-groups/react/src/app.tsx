import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
    DockviewApi,
    GetTabContextMenuItemsParams,
    GetTabGroupChipContextMenuItemsParams,
    themeAbyss,
    DockviewHeaderPosition,
} from 'dockview-react';
import React from 'react';
import {
    buildChipContextMenuItems,
    buildTabContextMenuItems,
} from './tabGroupActions';

const Default = (props: IDockviewPanelProps) => {
    return <div className="example-panel">{props.api.title}</div>;
};

const components = {
    default: Default,
};

export default (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();
    const [headerPosition, setHeaderPosition] =
        React.useState<DockviewHeaderPosition>('top');

    const onHeaderPositionChange = (position: DockviewHeaderPosition) => {
        setHeaderPosition(position);
        if (!api) return;
        for (const group of api.groups) {
            group.api.setHeaderPosition(position);
        }
    };

    const onReady = (event: DockviewReadyEvent) => {
        setApi(event.api);

        const panel1 = event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Dashboard',
        });
        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Settings',
        });
        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Users',
        });
        event.api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Analytics',
        });
        event.api.addPanel({
            id: 'panel_5',
            component: 'default',
            title: 'Reports',
        });
        event.api.addPanel({
            id: 'panel_6',
            component: 'default',
            title: 'Billing',
        });
        event.api.addPanel({
            id: 'panel_7',
            component: 'default',
            title: 'Notifications',
        });
        event.api.addPanel({
            id: 'panel_8',
            component: 'default',
            title: 'Logs',
        });

        const groupId = panel1.group.id;

        // Group 1: Feature (blue, expanded)
        const featureGroup = event.api.createTabGroup({
            groupId,
            label: 'Feature',
            color: 'blue',
        });
        event.api.addPanelToTabGroup({
            groupId,
            tabGroupId: featureGroup.id,
            panelId: 'panel_1',
        });
        event.api.addPanelToTabGroup({
            groupId,
            tabGroupId: featureGroup.id,
            panelId: 'panel_2',
        });
        event.api.addPanelToTabGroup({
            groupId,
            tabGroupId: featureGroup.id,
            panelId: 'panel_3',
        });
        event.api.addPanelToTabGroup({
            groupId,
            tabGroupId: featureGroup.id,
            panelId: 'panel_4',
        });

        // Group 2: Monitoring (purple, collapsed)
        const monitoringGroup = event.api.createTabGroup({
            groupId,
            label: 'Monitoring',
            color: 'purple',
        });
        event.api.addPanelToTabGroup({
            groupId,
            tabGroupId: monitoringGroup.id,
            panelId: 'panel_5',
        });
        event.api.addPanelToTabGroup({
            groupId,
            tabGroupId: monitoringGroup.id,
            panelId: 'panel_7',
        });
        event.api.addPanelToTabGroup({
            groupId,
            tabGroupId: monitoringGroup.id,
            panelId: 'panel_8',
        });
        monitoringGroup.collapse();
    };

    const getTabContextMenuItems = React.useCallback(
        ({ panel, group }: GetTabContextMenuItemsParams) => {
            return buildTabContextMenuItems(api!, group.id, panel.id).map(
                (item) => ({
                    label: item.label,
                    action: item.onClick,
                })
            );
        },
        [api]
    );

    const getTabGroupChipContextMenuItems = React.useCallback(
        ({ tabGroup, group }: GetTabGroupChipContextMenuItemsParams) => {
            const items = buildChipContextMenuItems(api!, group.id, tabGroup);
            return [
                'rename' as const,
                'colorPicker' as const,
                'collapse' as const,
                'close' as const,
                'separator' as const,
                ...items.map((item) => ({
                    label: item.label,
                    action: item.onClick,
                })),
            ];
        },
        [api]
    );

    return (
        <div className="example-layout">
            <div className="example-controls">
                <label>Tab position:</label>
                {(['top', 'bottom'] as DockviewHeaderPosition[]).map((pos) => (
                    <button
                        key={pos}
                        onClick={() => onHeaderPositionChange(pos)}
                        disabled={headerPosition === pos}
                    >
                        {pos}
                    </button>
                ))}
            </div>
            <div className="example-dock">
                <DockviewReact
                    className={props.theme || 'dockview-theme-abyss'}
                    onReady={onReady}
                    components={components}
                    theme={{
                        ...themeAbyss,
                        tabAnimation: 'smooth',
                        tabGroupIndicator: 'wrap',
                    }}
                    disableFloatingGroups={true}
                    getTabContextMenuItems={getTabContextMenuItems}
                    getTabGroupChipContextMenuItems={
                        getTabGroupChipContextMenuItems
                    }
                />
            </div>
        </div>
    );
};
