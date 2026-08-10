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
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [autoHideEdgeGroups]="true"
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

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;

        // some regular grid panels to peek over
        api.addPanel({
            id: 'doc_1',
            component: 'default',
            title: 'Document',
            params: { title: 'Document' },
        });
        api.addPanel({
            id: 'doc_2',
            component: 'default',
            title: 'Preview',
            params: { title: 'Preview' },
            position: { direction: 'right', referencePanel: 'doc_1' },
        });

        // a left edge group with a couple of tool windows
        api.addEdgeGroup('left', {
            id: 'left-edge',
            initialSize: 240,
            minimumSize: 150,
        });
        api.addPanel({
            id: 'explorer',
            component: 'default',
            title: 'Explorer',
            params: { title: 'Explorer' },
            position: { referenceGroup: 'left-edge' },
        });
        api.addPanel({
            id: 'search',
            component: 'default',
            title: 'Search',
            params: { title: 'Search' },
            position: { referenceGroup: 'left-edge' },
        });

        // a bottom edge group
        api.addEdgeGroup('bottom', {
            id: 'bottom-edge',
            initialSize: 200,
            minimumSize: 100,
        });
        api.addPanel({
            id: 'output',
            component: 'default',
            title: 'Output',
            params: { title: 'Output' },
            position: { referenceGroup: 'bottom-edge' },
        });
        api.addPanel({
            id: 'problems',
            component: 'default',
            title: 'Problems',
            params: { title: 'Problems' },
            position: { referenceGroup: 'bottom-edge' },
        });

        // auto-hide both edge groups to their strips; click a tab to peek
        api.autoHideEdgeGroup('left');
        api.autoHideEdgeGroup('bottom');
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
