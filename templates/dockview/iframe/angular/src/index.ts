import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import {
    Component,
    NgModule,
    Input,
    Type,
    OnInit,
    OnDestroy,
} from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewApi,
    DockviewPanelApi,
    DockviewReadyEvent,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

@Component({
    selector: 'iframe-panel',
    template: `
        <iframe
            [style.width]="'100%'"
            [style.height]="'100%'"
            [style.pointerEvents]="enabled ? 'inherit' : 'none'"
            src="https://dockview.dev"
        ></iframe>
    `,
})
export class IframePanelComponent implements OnInit, OnDestroy {
    @Input() api!: DockviewPanelApi;

    enabled = false;

    private disposable?: { dispose(): void };

    ngOnInit(): void {
        this.enabled = this.api.isActive;
        // Disable pointer events on the iframe while the panel is inactive so
        // that it doesn't swallow drag interactions used to move the panel.
        this.disposable = this.api.onDidActiveChange((event) => {
            this.enabled = event.isActive;
        });
    }

    ngOnDestroy(): void {
        this.disposable?.dispose();
    }
}

@Component({
    selector: 'basic-panel',
    template: `
        <div class="example-panel">
            This panel is just a usual component.
        </div>
    `,
})
export class BasicPanelComponent {}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
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
        iframeComponent: IframePanelComponent,
        basicComponent: BasicPanelComponent,
    };

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;

        // The iframe panels use `renderer: 'always'` so the panel (and
        // therefore the iframe) is never removed from the DOM when it becomes
        // inactive. This prevents the iframe from reloading as panels are moved
        // or re-parented.
        api.addPanel({
            id: 'panel_1',
            component: 'iframeComponent',
            renderer: 'always',
        });

        api.addPanel({
            id: 'panel_2',
            component: 'iframeComponent',
            renderer: 'always',
        });

        api.addPanel({
            id: 'panel_3',
            component: 'basicComponent',
        });
    }
}

@NgModule({
    declarations: [AppComponent, IframePanelComponent, BasicPanelComponent],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
