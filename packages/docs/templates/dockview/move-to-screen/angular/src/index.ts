import { LicenseManager } from 'dockview-enterprise';
import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import {
    Component,
    NgModule,
    Input,
    Type,
    OnDestroy,
    ChangeDetectorRef,
} from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewApi,
    DockviewPanelApi,
    DockviewReadyEvent,
    DockviewScreen,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

// dockview.dev docs license key. Replace with your own key in production.
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

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
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <button (click)="listScreens()">List screens</button>
                <select (change)="onTargetChange($event)">
                    <option
                        *ngFor="let screen of screens; let i = index"
                        [value]="i"
                        [selected]="i === target"
                    >
                        {{ screenLabel(screen, i) }}
                    </option>
                </select>
                <button (click)="popoutThere()">Popout there</button>
                <button (click)="moveThere()">Move popout there</button>
                <span>{{ status }}</span>
            </div>
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
export class AppComponent implements OnDestroy {
    components: Record<string, Type<any>> = {
        default: DefaultPanelComponent,
    };

    screens: readonly DockviewScreen[] = [];
    target = 0;
    status = '';

    private api?: DockviewApi;
    private disposable?: { dispose(): void };

    constructor(private cd: ChangeDetectorRef) {}

    ngOnDestroy() {
        this.disposable?.dispose();
    }

    onReady(event: DockviewReadyEvent) {
        this.api = event.api;

        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });
        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
        });
        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            position: { direction: 'right' },
        });

        this.screens = event.api.screens;
        this.disposable = event.api.onDidChangeScreens((e) => {
            this.screens = e.screens;
            this.refreshStatus();
            this.cd.markForCheck();
        });
        this.refreshStatus();
    }

    onTargetChange(event: Event): void {
        this.target = Number((event.target as HTMLSelectElement).value) || 0;
    }

    screenLabel(screen: DockviewScreen, index: number): string {
        const flags = [
            screen.isPrimary ? 'primary' : '',
            screen.isCurrent ? 'current' : '',
        ]
            .filter(Boolean)
            .join(', ');
        return `${index}: ${screen.label || 'screen'}${
            flags ? ` (${flags})` : ''
        }`;
    }

    refreshStatus(): void {
        const api = this.api;
        if (!api) {
            return;
        }
        if (!api.hasWindowManagement) {
            this.status = 'Window Management API unavailable: single screen';
            return;
        }
        void api.getWindowManagementPermission().then((state) => {
            this.status = `permission: ${state}, screens: ${api.screens.length}`;
            this.cd.markForCheck();
        });
    }

    listScreens(): void {
        const api = this.api;
        if (!api) {
            return;
        }
        // May show the permission prompt, so it runs inside the click.
        void api.getScreens().then((screens) => {
            this.screens = screens;
            this.refreshStatus();
            this.cd.markForCheck();
        });
    }

    popoutThere(): void {
        const api = this.api;
        const group = api?.activeGroup;
        if (!api || !group) {
            return;
        }
        void api.addPopoutGroup(group, {
            popoutUrl: '/popout/index.html',
            screen: Number(this.target) || 0,
        });
    }

    moveThere(): void {
        const group = this.api?.activeGroup;
        if (group?.api.location.type !== 'popout') {
            this.status = 'activate a popout group first';
            return;
        }
        void group.api.moveToScreen(Number(this.target) || 0);
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
