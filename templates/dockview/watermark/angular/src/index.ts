import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, Type, NgModule, Input } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { DockviewAngularModule, DockviewApi, DockviewReadyEvent, Orientation } from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

let panelCount = 0;

// Default panel component
@Component({
    selector: 'default-panel',
    template: `<div class="example-panel">{{ title }}</div>`
})
export class DefaultPanelComponent {
    @Input() api: any;
    @Input() params: any;

    get title() {
        return this.api?.title || this.api?.id || 'Panel';
    }

    constructor() {}
}

// Watermark component
@Component({
    selector: 'watermark-panel',
    template: `
        <div style="height: 100%; display: flex; justify-content: center; align-items: center;">
            <div>
                <p>This is a custom watermark. You can change this content.</p>
                <div class="example-controls">
                    <button (click)="addPanel()">Add New Panel</button>
                    <button *ngIf="isGroup" (click)="closeGroup()">Close Group</button>
                </div>
            </div>
        </div>
    `
})
export class WatermarkComponent {
    @Input() containerApi: DockviewApi;
    @Input() group: any;

    get isGroup(): boolean {
        return this.containerApi?.groups.length > 0;
    }

    addPanel() {
        this.containerApi.addPanel({
            id: Date.now().toString(),
            title: `Panel ${++panelCount}`,
            component: 'default'
        });
    }

    closeGroup() {
        this.group?.api.close();
    }
}

// Main app component
@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <button (click)="addEmptyGroup()">Add Empty Group</button>
            </div>
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [watermarkComponent]="watermarkComponent"
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)">
                </dv-dockview>
            </div>
        </div>
    `
})
export class AppComponent {
    components: Record<string, Type<any>>;
    watermarkComponent = WatermarkComponent;
    api: DockviewApi;

    constructor() {
        this.components = {
            default: DefaultPanelComponent,
        };
    }

    onReady(event: DockviewReadyEvent) {
        this.api = event.api;

        // Start with empty layout to show watermark
        event.api.fromJSON({
            grid: {
                orientation: Orientation.HORIZONTAL,
                root: { type: 'branch', data: [] },
                height: 100,
                width: 100,
            },
            panels: {},
        });
    }

    addEmptyGroup() {
        if (this.api) {
            this.api.addGroup();
        }
    }
}

// App module
@NgModule({
    declarations: [AppComponent, DefaultPanelComponent, WatermarkComponent],
    imports: [BrowserModule, DockviewAngularModule],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { }

// Bootstrap the application
platformBrowserDynamic().bootstrapModule(AppModule).catch(err => console.error(err));