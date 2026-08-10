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
        <div class="example-panel">{{ api?.title }}</div>
    `,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;
}

@Component({
    selector: 'inner-dockview',
    template: `
        <dv-dockview
            [components]="components"
            className="nested-dockview"
            (ready)="onReady($event)">
        </dv-dockview>
    `,
})
export class InnerDockviewComponent {
    // Inner dockview reuses the outer DefaultPanelComponent; it's registered
    // here under the same key so panels can be added recursively.
    components: Record<string, Type<any>> = {
        default: DefaultPanelComponent,
    };

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;
        api.addPanel({
            id: 'inner_panel_1',
            component: 'default',
            title: 'Inner 1',
        });
        api.addPanel({
            id: 'inner_panel_2',
            component: 'default',
            title: 'Inner 2',
        });
        api.addPanel({
            id: 'inner_panel_3',
            component: 'default',
            title: 'Inner 3',
        });
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
        innerDockview: InnerDockviewComponent,
    };

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;
        api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });
        api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
        });
        api.addPanel({
            id: 'panel_3',
            component: 'innerDockview',
            title: 'Nested layout',
            position: { referencePanel: 'panel_2', direction: 'right' },
        });
    }
}

@NgModule({
    declarations: [AppComponent, DefaultPanelComponent, InnerDockviewComponent],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
