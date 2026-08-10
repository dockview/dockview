import { LicenseManager } from 'dockview-enterprise';
import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, Type, NgModule, Input } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewApi,
    DockviewHeaderPosition,
    DockviewReadyEvent,
    GetTabContextMenuItemsParams,
    GetTabGroupChipContextMenuItemsParams,
    BuiltInChipContextMenuItem,
    ContextMenuItemConfig,
    DEFAULT_TAB_GROUP_COLORS,
    themeAbyss,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

type TabGroup = ReturnType<DockviewApi['getTabGroups']>[number];

interface MenuItem {
    label: string;
    onClick: () => void;
}

// dockview.dev docs license key. Replace with your own key in production.
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

@Component({
    selector: 'default-panel',
    template: `<div class="example-panel">{{ title }}</div>`,
})
export class DefaultPanelComponent {
    @Input() api: any;

    get title() {
        return this.api?.title || this.api?.id || 'Panel';
    }
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <label>Tab position:</label>
                <button
                    *ngFor="let pos of headerPositions"
                    (click)="onHeaderPositionChange(pos)"
                    [disabled]="headerPosition === pos"
                >
                    {{ pos }}
                </button>
            </div>
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [theme]="theme"
                    [disableFloatingGroups]="true"
                    [getTabContextMenuItems]="getTabContextMenuItems"
                    [getTabGroupChipContextMenuItems]="
                        getTabGroupChipContextMenuItems
                    "
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)"
                >
                </dv-dockview>
            </div>
        </div>
    `,
})
export class AppComponent {
    components: Record<string, Type<any>>;
    theme = {
        ...themeAbyss,
        tabAnimation: 'smooth' as const,
        tabGroupIndicator: 'wrap' as const,
    };

    headerPositions: DockviewHeaderPosition[] = ['top', 'bottom'];
    headerPosition: DockviewHeaderPosition = 'top';

    private api?: DockviewApi;

    getTabContextMenuItems = (
        params: GetTabContextMenuItemsParams
    ): ContextMenuItemConfig[] => {
        if (!this.api) {
            return [];
        }
        return this.buildTabContextMenuItems(
            params.group.id,
            params.panel.id
        ).map((item) => ({ label: item.label, action: item.onClick }));
    };

    getTabGroupChipContextMenuItems = (
        params: GetTabGroupChipContextMenuItemsParams
    ): (BuiltInChipContextMenuItem | ContextMenuItemConfig)[] => {
        const result: (BuiltInChipContextMenuItem | ContextMenuItemConfig)[] = [
            'rename',
            'colorPicker',
            'collapse',
            'close',
            'separator',
        ];
        if (this.api) {
            for (const item of this.buildChipContextMenuItems(
                params.group.id,
                params.tabGroup
            )) {
                result.push({ label: item.label, action: item.onClick });
            }
        }
        return result;
    };

    constructor() {
        this.components = {
            default: DefaultPanelComponent,
        };
    }

    onHeaderPositionChange(position: DockviewHeaderPosition) {
        this.headerPosition = position;
        if (!this.api) {
            return;
        }
        for (const group of this.api.groups) {
            group.api.setHeaderPosition(position);
        }
    }

    private buildChipContextMenuItems(
        groupId: string,
        tabGroup: TabGroup
    ): MenuItem[] {
        return [
            {
                label: 'Rename group',
                onClick: () => {
                    const name = window.prompt('Group name:', tabGroup.label);
                    if (name !== null) {
                        tabGroup.setLabel(name);
                    }
                },
            },
            {
                label: tabGroup.collapsed ? 'Expand group' : 'Collapse group',
                onClick: () => tabGroup.toggle(),
            },
            {
                label: 'Dissolve group',
                onClick: () =>
                    this.api!.dissolveTabGroup({
                        groupId,
                        tabGroupId: tabGroup.id,
                    }),
            },
        ];
    }

    private buildTabContextMenuItems(
        groupId: string,
        panelId: string
    ): MenuItem[] {
        const api = this.api!;
        const tabGroup = api.getTabGroupForPanel({ groupId, panelId });
        const allTabGroups = api.getTabGroups({ groupId });
        const items: MenuItem[] = [];

        if (tabGroup) {
            items.push({
                label: `Remove from "${tabGroup.label || tabGroup.id}"`,
                onClick: () =>
                    api.removePanelFromTabGroup({ groupId, panelId }),
            });
        }

        const otherTabGroups = allTabGroups.filter(
            (tg) => tg.id !== tabGroup?.id
        );
        for (const tg of otherTabGroups) {
            items.push({
                label: `Add to "${tg.label || tg.id}"`,
                onClick: () =>
                    api.addPanelToTabGroup({
                        groupId,
                        tabGroupId: tg.id,
                        panelId,
                    }),
            });
        }

        items.push({
            label: 'Add to new group',
            onClick: () => {
                const label = window.prompt('Group name:') || '';
                const colors = DEFAULT_TAB_GROUP_COLORS;
                const color =
                    colors[Math.floor(Math.random() * colors.length)].id;
                const newGroup = api.createTabGroup({ groupId, label, color });
                api.addPanelToTabGroup({
                    groupId,
                    tabGroupId: newGroup.id,
                    panelId,
                });
            },
        });

        items.push({
            label: 'Close tab',
            onClick: () => api.getPanel(panelId)?.api.close(),
        });

        return items;
    }

    onReady(event: DockviewReadyEvent) {
        const api = event.api;
        this.api = api;

        const titles = [
            'Dashboard',
            'Settings',
            'Users',
            'Analytics',
            'Reports',
            'Billing',
            'Notifications',
            'Logs',
        ];

        const first = api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: titles[0],
        });
        for (let i = 1; i < titles.length; i++) {
            api.addPanel({
                id: `panel_${i + 1}`,
                component: 'default',
                title: titles[i],
            });
        }

        const groupId = first.group.id;

        const featureGroup = api.createTabGroup({
            groupId,
            label: 'Feature',
            color: 'blue',
        });
        ['panel_1', 'panel_2', 'panel_3', 'panel_4'].forEach((panelId) => {
            api.addPanelToTabGroup({
                groupId,
                tabGroupId: featureGroup.id,
                panelId,
            });
        });

        const monitoringGroup = api.createTabGroup({
            groupId,
            label: 'Monitoring',
            color: 'purple',
        });
        ['panel_5', 'panel_7', 'panel_8'].forEach((panelId) => {
            api.addPanelToTabGroup({
                groupId,
                tabGroupId: monitoringGroup.id,
                panelId,
            });
        });
        monitoringGroup.collapse();
    }
}

@NgModule({
    declarations: [AppComponent, DefaultPanelComponent],
    imports: [BrowserModule, DockviewAngularModule],
    providers: [],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
