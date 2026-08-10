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
    ChangeDetectorRef,
} from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewApi,
    DockviewPanelApi,
    DockviewPanelRenderer,
    DockviewReadyEvent,
    SerializedDockview,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

const STORAGE_KEY = 'dv_rendermode_state';

@Component({
    selector: 'default-panel',
    template: `
        <div style="height: 100%; overflow: auto;">
            <div style="height: 1000px; padding: 20px; overflow: auto;">
                <div>{{ api?.title }}</div>
                <div>
                    {{ mode }}
                    <button (click)="toggleMode()">Toggle render mode</button>
                </div>
            </div>
        </div>
    `,
})
export class DefaultPanelComponent implements OnInit, OnDestroy {
    @Input() api!: DockviewPanelApi;

    mode: DockviewPanelRenderer = 'onlyWhenVisible';
    private disposable?: { dispose(): void };

    constructor(private cd: ChangeDetectorRef) {}

    ngOnInit() {
        this.mode = this.api.renderer;
        this.disposable = this.api.onDidRendererChange((event) => {
            this.mode = event.renderer;
            this.cd.markForCheck();
        });
    }

    ngOnDestroy() {
        this.disposable?.dispose();
    }

    toggleMode() {
        const next: DockviewPanelRenderer =
            this.mode === 'onlyWhenVisible' ? 'always' : 'onlyWhenVisible';
        this.api.setRenderer(next);
    }
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <button (click)="save()">Save</button>
                <button (click)="load()">Load</button>
                <label>
                    Container size ({{ size }}%)
                    <input
                        type="range"
                        min="1"
                        max="100"
                        [value]="size"
                        (input)="size = +$any($event.target).value" />
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

    size = 100;
    private api?: DockviewApi;

    onReady(event: DockviewReadyEvent) {
        this.api = event.api;
        this.api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
        this.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            position: { referencePanel: 'panel_1', direction: 'within' },
        });
        this.api.addPanel({ id: 'panel_3', component: 'default', title: 'Panel 3' });
        this.api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: { referencePanel: 'panel_3', direction: 'below' },
        });
    }

    save() {
        if (!this.api) {
            return;
        }
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ size: this.size, state: this.api.toJSON() })
        );
    }

    load() {
        if (!this.api) {
            return;
        }
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return;
        }
        try {
            const json = JSON.parse(raw) as {
                size: number;
                state: SerializedDockview;
            };
            this.size = json.size;
            this.api.fromJSON(json.state);
        } catch (err) {
            console.error(err);
        }
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
