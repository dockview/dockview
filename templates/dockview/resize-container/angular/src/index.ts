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
        <div class="example-layout">
            <div class="example-controls">
                <label>
                    Scale:
                    <input
                        type="range"
                        min="1"
                        max="100"
                        [value]="size"
                        (input)="size = +$any($event.target).value" />
                    {{ size }}%
                </label>
            </div>
            <div class="example-dock">
                <div [style.height.%]="size" [style.width.%]="size">
                    <dv-dockview
                        [components]="components"
                        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                        (ready)="onReady($event)">
                    </dv-dockview>
                </div>
            </div>
        </div>
    `,
})
export class AppComponent {
    components: Record<string, Type<any>> = {
        default: DefaultPanelComponent,
    };
    size = 50;

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;

        const panel1 = api.addPanel({
            id: 'panel_1',
            component: 'default',
            params: { title: 'Panel 1' },
        });
        panel1.group.locked = true;
        panel1.group.header.hidden = true;

        api.addPanel({
            id: 'panel_2',
            component: 'default',
            params: { title: 'Panel 2' },
        });
        api.addPanel({
            id: 'panel_3',
            component: 'default',
            params: { title: 'Panel 3' },
        });
        api.addPanel({
            id: 'panel_4',
            component: 'default',
            params: { title: 'Panel 4' },
            position: { referencePanel: 'panel_1', direction: 'right' },
        });
        api.addPanel({
            id: 'panel_5',
            component: 'default',
            params: { title: 'Panel 5' },
            position: { referencePanel: 'panel_3', direction: 'right' },
        });
        api.addPanel({
            id: 'panel_6',
            component: 'default',
            params: { title: 'Panel 6' },
            position: { referencePanel: 'panel_5', direction: 'below' },
        });
        api.addPanel({
            id: 'panel_7',
            component: 'default',
            params: { title: 'Panel 7' },
            position: { referencePanel: 'panel_6', direction: 'right' },
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
