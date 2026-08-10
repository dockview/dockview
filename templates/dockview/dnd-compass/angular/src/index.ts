import { LicenseManager } from 'dockview-enterprise';
import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, NgModule, Input, Type } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewApi,
    DockviewPanelApi,
    DockviewReadyEvent,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

// dockview.dev docs license key. Replace with your own key in production.
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

@Component({
    selector: 'default-panel',
    template: `
        <div class="example-panel">{{ params?.title }}</div>
    `,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;
    @Input() params!: { title: string };
}

@Component({
    selector: 'app-root',
    template: `
        <div style="height: 100%;">
            <dv-dockview
                [components]="components"
                [dndCompass]="true"
                className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                (ready)="onReady($event)"
            >
            </dv-dockview>
        </div>
    `,
})
export class AppComponent {
    components: Record<string, Type<any>> = {
        default: DefaultPanelComponent,
    };

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;

        // A small docked layout with panels on every side so that, while
        // dragging a tab, the DnD compass can be seen resolving to each cell.
        const panel1 = api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
            params: { title: 'Panel 1' },
        });

        api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            params: { title: 'Panel 2' },
            position: { referencePanel: panel1, direction: 'right' },
        });

        api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            params: { title: 'Panel 3' },
            position: { referencePanel: panel1, direction: 'below' },
        });

        api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            params: { title: 'Panel 4' },
            position: { referencePanel: panel1, direction: 'within' },
        });
    }
}

@NgModule({
    declarations: [AppComponent, DefaultPanelComponent],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
