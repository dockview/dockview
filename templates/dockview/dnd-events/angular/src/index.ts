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
            <div class="example-controls">
                <button (click)="togglePanelDrag()">
                    Panel Drag: {{ disablePanelDrag ? 'disabled' : 'enabled' }}
                </button>
                <button (click)="toggleGroupDrag()">
                    Group Drag: {{ disableGroupDrag ? 'disabled' : 'enabled' }}
                </button>
                <button (click)="toggleOverlay()">
                    Overlay: {{ disableOverlay ? 'disabled' : 'enabled' }}
                </button>
            </div>
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
export class AppComponent implements OnDestroy {
    components: Record<string, Type<any>> = {
        default: DefaultPanelComponent,
    };

    disablePanelDrag = false;
    disableGroupDrag = false;
    disableOverlay = false;

    private disposables: { dispose(): void }[] = [];

    togglePanelDrag() {
        this.disablePanelDrag = !this.disablePanelDrag;
    }
    toggleGroupDrag() {
        this.disableGroupDrag = !this.disableGroupDrag;
    }
    toggleOverlay() {
        this.disableOverlay = !this.disableOverlay;
    }

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;

        this.disposables.push(
            api.onWillDragPanel((e) => {
                if (!this.disablePanelDrag) {
                    return;
                }
                if (e.nativeEvent instanceof DragEvent) {
                    e.nativeEvent.preventDefault();
                }
            }),
            api.onWillDragGroup((e) => {
                if (!this.disableGroupDrag) {
                    return;
                }
                if (e.nativeEvent instanceof DragEvent) {
                    e.nativeEvent.preventDefault();
                }
            }),
            api.onWillShowOverlay((e) => {
                if (!this.disableOverlay) {
                    return;
                }
                e.preventDefault();
            })
        );

        api.addPanel({ id: 'panel_1', component: 'default' });
        api.addPanel({
            id: 'panel_2',
            component: 'default',
            position: { direction: 'right', referencePanel: 'panel_1' },
        });
        api.addPanel({
            id: 'panel_3',
            component: 'default',
            position: { direction: 'below', referencePanel: 'panel_1' },
        });
        api.addPanel({ id: 'panel_4', component: 'default' });
        api.addPanel({ id: 'panel_5', component: 'default' });
    }

    ngOnDestroy() {
        this.disposables.forEach((d) => d.dispose());
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
