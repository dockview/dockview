import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import {
    Component,
    NgModule,
    Input,
    Type,
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

const STORAGE_KEY = 'dockview_persistence_layout';

@Component({
    selector: 'default-panel',
    template: `
        <div class="example-panel">{{ api?.title }}</div>
    `,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;
    @Input() params!: { title: string };
}

@Component({
    selector: 'watermark-panel',
    template: `<div class="example-panel">This group is empty.</div>`,
})
export class WatermarkComponent {}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <button (click)="clearLayout()">Reset Layout</button>
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
    `,
})
export class AppComponent implements OnDestroy {
    components: Record<string, Type<any>> = {
        default: DefaultPanelComponent,
    };
    watermarkComponent = WatermarkComponent;

    private api?: DockviewApi;
    private layoutDisposable?: { dispose(): void };

    onReady(event: DockviewReadyEvent) {
        this.api = event.api;

        const layoutString = localStorage.getItem(STORAGE_KEY);
        let restored = false;
        if (layoutString) {
            try {
                this.api.fromJSON(JSON.parse(layoutString));
                restored = true;
            } catch (err) {
                console.error(err);
            }
        }
        if (!restored) {
            this.loadDefaultLayout(this.api);
        }

        this.layoutDisposable = this.api.onDidLayoutChange(() => {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(this.api!.toJSON())
            );
        });
    }

    clearLayout() {
        localStorage.removeItem(STORAGE_KEY);
        if (this.api) {
            this.api.clear();
            this.loadDefaultLayout(this.api);
        }
    }

    ngOnDestroy() {
        this.layoutDisposable?.dispose();
    }

    private loadDefaultLayout(api: DockviewApi) {
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
            component: 'default',
            title: 'Panel 3',
        });
    }
}

@NgModule({
    declarations: [AppComponent, DefaultPanelComponent, WatermarkComponent],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
