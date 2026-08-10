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

@Component({
    selector: 'default-panel',
    template: `
        <div style="padding: 10px; height: 100%;">
            <div style="margin-bottom: 8px;">{{ api?.title }}</div>
            <div
                style="display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 6px;">
                <span style="width: 60px;">Width:</span>
                <input
                    type="number"
                    min="50"
                    step="1"
                    style="width: 75px;"
                    [value]="width"
                    (input)="width = +$any($event.target).value" />
                <button (click)="resizeGroupWidth()">Resize Group</button>
                <button (click)="resizePanelWidth()">Resize Panel</button>
            </div>
            <div
                style="display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 6px;">
                <span style="width: 60px;">Height:</span>
                <input
                    type="number"
                    min="50"
                    step="1"
                    style="width: 75px;"
                    [value]="height"
                    (input)="height = +$any($event.target).value" />
                <button (click)="resizeGroupHeight()">Resize Group</button>
                <button (click)="resizePanelHeight()">Resize Panel</button>
            </div>
        </div>
    `,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;

    width = 100;
    height = 100;

    resizeGroupWidth() {
        this.api.group.api.setSize({ width: this.width });
    }
    resizePanelWidth() {
        this.api.setSize({ width: this.width });
    }
    resizeGroupHeight() {
        this.api.group.api.setSize({ height: this.height });
    }
    resizePanelHeight() {
        this.api.setSize({ height: this.height });
    }
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)">
                </dv-dockview>
            </div>
        </div>
    `,
})
export class AppComponent {
    components: Record<string, Type<any>> = {
        default: DefaultPanelComponent,
    };

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;
        api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
        api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            position: { direction: 'right', referencePanel: 'panel_1' },
        });
        api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            position: { direction: 'below', referencePanel: 'panel_1' },
        });
        api.addPanel({ id: 'panel_4', component: 'default', title: 'Panel 4' });
        api.addPanel({ id: 'panel_5', component: 'default', title: 'Panel 5' });
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
