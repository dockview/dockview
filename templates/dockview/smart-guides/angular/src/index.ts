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
    template: `<div class="example-panel">{{ params?.title }}</div>`,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;
    @Input() params!: { title: string };
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <button (click)="addFloatingGroup()">Add Floating Group</button>
            </div>
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [smartGuides]="smartGuides"
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)"
                >
                </dv-dockview>
            </div>
        </div>
    `,
})
export class AppComponent {
    components: Record<string, Type<any>> = {
        default: DefaultPanelComponent,
    };

    // Snap floating groups to each other (and to container edges) when dragged
    // within 8px of an alignment.
    smartGuides = { snapDistance: 8 };

    private api?: DockviewApi;
    private floatCount = 0;

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;
        this.api = api;

        api.addPanel({
            id: 'panel_1',
            component: 'default',
            params: { title: 'Panel 1' },
        });

        api.addPanel({
            id: 'panel_2',
            component: 'default',
            params: { title: 'Panel 2' },
            position: { direction: 'right' },
        });

        // A couple of floating groups so alignment + snapping is demonstrable:
        // drag one near the other (or towards a container edge) to see the
        // guides.
        this.addFloatingGroupAt({ top: 40, left: 60 });
        this.addFloatingGroupAt({ top: 220, left: 340 });
    }

    addFloatingGroup() {
        this.addFloatingGroupAt({
            top: 60 + this.floatCount * 10,
            left: 60 + this.floatCount * 10,
        });
    }

    private addFloatingGroupAt(position: { top: number; left: number }) {
        if (!this.api) {
            return;
        }

        this.floatCount++;
        this.api.addPanel({
            id: `float_${this.floatCount}`,
            component: 'default',
            params: { title: `Floating ${this.floatCount}` },
            floating: {
                width: 220,
                height: 140,
                position: { top: position.top, left: position.left },
            },
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
