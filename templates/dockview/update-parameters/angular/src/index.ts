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

interface CustomParams {
    myValue: number;
}

@Component({
    selector: 'default-panel',
    template: `
        <div class="example-panel">
            <div style="margin-bottom: 8px;">{{ api?.title }}</div>
            <div class="example-controls">
                <button (click)="toggle()">{{ running ? 'Stop' : 'Start' }}</button>
                <span>Last updated: {{ lastUpdated }}</span>
            </div>
        </div>
    `,
})
export class DefaultPanelComponent implements OnDestroy {
    @Input() api!: DockviewPanelApi;
    // Updated every second via api.updateParameters while running.
    @Input() params!: CustomParams;

    running = false;
    private interval: ReturnType<typeof setInterval> | undefined;

    get lastUpdated(): string {
        return new Date(this.params?.myValue).toLocaleTimeString();
    }

    toggle() {
        if (this.running) {
            this.stop();
        } else {
            this.start();
        }
    }

    private start() {
        this.running = true;
        this.api.updateParameters({ myValue: Date.now() });
        this.interval = setInterval(() => {
            this.api.updateParameters({ myValue: Date.now() });
        }, 1000);
    }

    private stop() {
        this.running = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
    }

    ngOnDestroy() {
        this.stop();
    }
}

@Component({
    selector: 'default-tab',
    template: `
        <div>
            <div>custom tab: {{ api?.title }}</div>
            <span>Last updated: {{ lastUpdated }}</span>
        </div>
    `,
})
export class DefaultTabComponent {
    @Input() api!: DockviewPanelApi;
    @Input() params!: CustomParams;

    get lastUpdated(): string {
        return new Date(this.params?.myValue).toLocaleTimeString();
    }
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [tabComponents]="tabComponents"
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
    tabComponents: Record<string, Type<any>> = {
        default: DefaultTabComponent,
    };

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;
        api.addPanel({
            id: 'panel_1',
            component: 'default',
            tabComponent: 'default',
            params: { myValue: Date.now() },
        });
        api.addPanel({
            id: 'panel_2',
            component: 'default',
            tabComponent: 'default',
            params: { myValue: Date.now() },
        });
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
