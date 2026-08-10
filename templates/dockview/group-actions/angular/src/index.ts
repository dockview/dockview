import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, Type, NgModule, Input } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { DockviewAngularModule, DockviewReadyEvent, DockviewPanel } from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

// Default panel component
@Component({
    selector: 'default-panel',
    template: `<div class="example-panel">{{ api?.title }}</div>`
})
export class DefaultPanelComponent {
    @Input() api: any;
}

// Right header actions component
@Component({
    selector: 'right-header-actions',
    template: `
        <div style="height: 100%; display: flex; align-items: center; gap: 8px; padding: 0 8px; font-size: 12px; color: var(--dv-inactivegroup-visiblepanel-tab-color, #969696);">
            <span
                [attr.data-active]="isGroupActive"
                style="padding: 1px 8px; border-radius: 10px; background-color: var(--dv-activegroup-hiddenpanel-tab-background-color, rgba(128, 128, 128, 0.15)); transition: color 0.15s ease, box-shadow 0.15s ease;"
                [style.color]="isGroupActive ? 'var(--dv-activegroup-visiblepanel-tab-color, #ffffff)' : 'var(--dv-inactivegroup-visiblepanel-tab-color, #969696)'"
                [style.box-shadow]="isGroupActive ? 'inset 0 0 0 1px var(--dv-tab-active-border-color, #4daafc)' : 'none'">
                {{ isGroupActive ? 'Group active' : 'Group inactive' }}
            </span>
        </div>
    `
})
export class RightHeaderActionsComponent {
    @Input() isGroupActive: boolean;
}

// Left header actions component
@Component({
    selector: 'left-header-actions',
    template: `
        <div style="height: 100%; display: flex; align-items: center; gap: 8px; padding: 0 8px; font-size: 12px; color: var(--dv-inactivegroup-visiblepanel-tab-color, #969696);">
            <span style="padding: 0 4px; color: var(--dv-activegroup-visiblepanel-tab-color, #ffffff); font-variant-numeric: tabular-nums;">activePanel: {{ activePanel?.id || 'null' }}</span>
        </div>
    `
})
export class LeftHeaderActionsComponent {
    @Input() activePanel: DockviewPanel;
}

// Prefix header component
@Component({
    selector: 'prefix-header-actions',
    template: `
        <div style="height: 100%; display: flex; align-items: center; gap: 8px; padding: 0 8px; font-size: 12px; color: var(--dv-inactivegroup-visiblepanel-tab-color, #969696);">🌲</div>
    `
})
export class PrefixHeaderActionsComponent {
    @Input() activePanel: DockviewPanel;
}

// Main app component
@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [prefixHeaderActionsComponent]="prefixHeaderActionsComponent"
                    [leftHeaderActionsComponent]="leftHeaderActionsComponent"
                    [rightHeaderActionsComponent]="rightHeaderActionsComponent"
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)">
                </dv-dockview>
            </div>
        </div>
    `
})
export class AppComponent {
    components: Record<string, Type<any>>;
    prefixHeaderActionsComponent = PrefixHeaderActionsComponent;
    leftHeaderActionsComponent = LeftHeaderActionsComponent;
    rightHeaderActionsComponent = RightHeaderActionsComponent;

    constructor() {
        this.components = {
            default: DefaultPanelComponent,
        };
    }

    onReady(event: DockviewReadyEvent) {
        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            position: {
                direction: 'right',
            },
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            position: {
                direction: 'below',
            },
        });
    }
}

// App module
@NgModule({
    declarations: [
        AppComponent,
        DefaultPanelComponent,
        RightHeaderActionsComponent,
        LeftHeaderActionsComponent,
        PrefixHeaderActionsComponent
    ],
    imports: [BrowserModule, DockviewAngularModule],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { }

// Bootstrap the application
platformBrowserDynamic().bootstrapModule(AppModule).catch(err => console.error(err));
