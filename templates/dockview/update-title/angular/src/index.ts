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
    DockviewReadyEvent,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

@Component({
    selector: 'default-panel',
    template: `
        <div class="example-panel">
            <div style="margin-bottom: 8px;">
                <span>Current title: </span>
                <span>{{ api?.title }}</span>
            </div>
            <div class="example-controls">
                <label>
                    New title
                    <input [value]="title" (input)="title = $any($event.target).value" />
                </label>
                <button (click)="apply()">Set title</button>
            </div>
        </div>
    `,
})
export class DefaultPanelComponent implements OnInit, OnDestroy {
    @Input() api!: DockviewPanelApi;

    title = '';

    private titleDisposable?: { dispose(): void };

    constructor(private cd: ChangeDetectorRef) {}

    ngOnInit() {
        this.title = this.api?.title ?? '';
        // Reflect external title changes back into the input field.
        this.titleDisposable = this.api?.onDidTitleChange(() => {
            this.title = this.api.title ?? '';
            this.cd.markForCheck();
        });
    }

    ngOnDestroy() {
        this.titleDisposable?.dispose();
    }

    apply() {
        this.api?.setTitle(this.title);
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

        const panel = api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });
        api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            position: { referencePanel: panel.id },
        });
        const panel3 = api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            position: { referencePanel: panel.id, direction: 'right' },
        });
        api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: { referencePanel: panel3.id },
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
