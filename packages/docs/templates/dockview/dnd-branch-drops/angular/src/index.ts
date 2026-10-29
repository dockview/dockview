import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, Type, NgModule, Input } from '@angular/core';
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
        <div class="example-panel">{{ api?.title }}</div>
    `,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [dndCollapseSource]="true"
                    [dndBranchDrops]="true"
                    [dndLivePreview]="true"
                    [dndNearestEdge]="true"
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
        api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: { direction: 'below', referencePanel: 'panel_2' },
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
