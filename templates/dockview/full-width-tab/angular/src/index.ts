import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, NgModule, Input, Type } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewPanelApi,
    DockviewReadyEvent,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

interface CustomParams {
    title: string;
    x?: number;
}

@Component({
    selector: 'default-panel',
    template: `
        <div
            style="display: flex; justify-content: center; align-items: center; height: 100%;"
        >
            <span>{{ params?.title }}</span>
            <span *ngIf="params?.x">&nbsp;&nbsp;{{ params?.x }}</span>
        </div>
    `,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;
    @Input() params!: CustomParams;
}

@Component({
    selector: 'default-tab',
    template: `
        <div
            class="my-custom-tab"
            style="padding: 0px 8px; width: 100%; display: flex; height: 100%; align-items: center; background-color: var(--dv-tabs-and-actions-container-background-color);"
        >
            <span>{{ params?.title }}</span>
            <span style="flex-grow: 1;"></span>
            <span class="material-symbols-outlined" style="font-size: 16px;"
                >minimize</span
            >
            <span class="material-symbols-outlined" style="font-size: 16px;"
                >maximize</span
            >
            <span class="material-symbols-outlined" style="font-size: 16px;"
                >close</span
            >
        </div>
    `,
})
export class DefaultTabComponent {
    @Input() api!: DockviewPanelApi;
    @Input() params!: CustomParams;
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [tabComponents]="tabComponents"
                    [singleTabMode]="'fullwidth'"
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

    tabComponents: Record<string, Type<any>> = {
        default: DefaultTabComponent,
    };

    onReady(event: DockviewReadyEvent) {
        const panel1 = event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            tabComponent: 'default',
            params: { title: 'Window 1' },
        });
        panel1.group.locked = true;

        const panel2 = event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            tabComponent: 'default',
            params: { title: 'Window 2' },
            position: { direction: 'right' },
        });
        panel2.group.locked = true;

        const panel3 = event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            tabComponent: 'default',
            params: { title: 'Window 3' },
            position: { direction: 'below' },
        });
        panel3.group.locked = true;
    }
}

@NgModule({
    declarations: [AppComponent, DefaultPanelComponent, DefaultTabComponent],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
