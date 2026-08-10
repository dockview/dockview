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
                <button (click)="addPanel()">Add Tab</button>
            </div>
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [overflow]="overflow"
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

    // Keep overflowing tabs in the chevron dropdown, then enrich that dropdown:
    // a search box filters the tabs and `mru` orders them most-recently-used
    // first.
    overflow = {
        mode: 'dropdown' as const,
        search: { placeholder: 'Search tabs…' },
        mru: true,
    };

    private api?: DockviewApi;
    private counter = 0;

    onReady(event: DockviewReadyEvent) {
        this.api = event.api;
        this.counter = 0;
        // Open enough panels in a single group that the tabs no longer fit on
        // one row and spill into the dropdown.
        for (let i = 0; i < 12; i++) {
            this.addPanel();
        }
    }

    addPanel() {
        if (!this.api) {
            return;
        }

        this.counter++;
        this.api.addPanel({
            id: `panel_${this.counter}`,
            component: 'default',
            title: `Panel ${this.counter}`,
            params: { title: `Panel ${this.counter}` },
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
