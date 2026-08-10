import { LicenseManager } from 'dockview-enterprise';
import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, Input, NgModule, OnInit, Type } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewReadyEvent,
    GetTabContextMenuItemsParams,
    IContextMenuItemComponentProps,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

// dockview.dev docs license key. Replace with your own key in production.
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

@Component({
    selector: 'default-panel',
    template: `<div class="example-panel">{{ api?.title }}</div>`,
})
export class DefaultPanelComponent {
    @Input() api: any;
}

/**
 * A custom context menu item as an Angular component.
 * Receives panel, group, api, and close via @Input bindings.
 */
@Component({
    selector: 'float-menu-item',
    template: `
        <div class="dv-context-menu-item" (click)="onClick()">Float tab</div>
    `,
})
export class FloatMenuItemComponent implements IContextMenuItemComponentProps {
    @Input() panel: any;
    @Input() group: any;
    @Input() api: any;
    @Input() close!: () => void;

    onClick() {
        this.api.addFloatingGroup(this.panel);
        this.close();
    }
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    [components]="components"
                    [getTabContextMenuItems]="getTabContextMenuItems"
                    (ready)="onReady($event)"
                >
                </dv-dockview>
            </div>
        </div>
    `,
})
export class AppComponent implements OnInit {
    components: Record<string, Type<any>> = {
        default: DefaultPanelComponent,
    };

    getTabContextMenuItems = (params: GetTabContextMenuItemsParams) => [
        'close' as const,
        'closeOthers' as const,
        'closeAll' as const,
        'closeLeft' as const,
        'closeRight' as const,
        'separator' as const,
        'maximize' as const,
        'popout' as const,
        'separator' as const,
        {
            label: 'Log panel id',
            action: () => console.log(params.panel.id),
        },
        'separator' as const,
        // A custom component item, shown here as an alternative to the
        // built-in `'float'` shortcut.
        { component: FloatMenuItemComponent },
    ];

    ngOnInit() {}

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
        });
        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
        });
    }
}

@NgModule({
    declarations: [AppComponent, DefaultPanelComponent, FloatMenuItemComponent],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
