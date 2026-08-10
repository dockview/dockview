import { LicenseManager } from 'dockview-enterprise';
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
    DockviewGroupPanel,
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
    template: `<div class="example-panel">{{ params?.title }}</div>`,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;
    @Input() params!: { title: string };
}

// Right header action: a pin/unpin toggle for the group's active tab.
@Component({
    selector: 'pin-header-action',
    template: `
        <div style="height: 100%; padding: 0px 4px;">
            <div
                class="pin-icon"
                [title]="pinned ? 'Unpin tab' : 'Pin tab'"
                (click)="onClick()"
            >
                <span class="material-symbols-outlined">{{
                    pinned ? 'keep_off' : 'keep'
                }}</span>
            </div>
        </div>
    `,
    styles: [
        `
            .pin-icon {
                display: flex;
                justify-content: center;
                align-items: center;
                width: 30px;
                height: 100%;
                font-size: 18px;
            }
            .pin-icon .material-symbols-outlined {
                font-size: inherit;
                cursor: pointer;
            }
        `,
    ],
})
export class PinHeaderActionComponent implements OnInit, OnDestroy {
    @Input() group!: DockviewGroupPanel;

    pinned = false;

    private activePanelDisposable?: { dispose(): void };
    private pinnedDisposable?: { dispose(): void };

    ngOnInit(): void {
        this.updateActivePanel();
        this.activePanelDisposable = this.group.model.onDidActivePanelChange(
            () => this.updateActivePanel()
        );
    }

    onClick(): void {
        this.group.activePanel?.api.setPinned(!this.pinned);
    }

    ngOnDestroy(): void {
        this.activePanelDisposable?.dispose();
        this.pinnedDisposable?.dispose();
    }

    private updateActivePanel(): void {
        this.pinnedDisposable?.dispose();

        const panel = this.group.activePanel;
        if (!panel) {
            this.pinned = false;
            return;
        }

        this.pinned = panel.api.isPinned;
        this.pinnedDisposable = panel.api.onDidChangePinned((event) => {
            this.pinned = event.isPinned;
        });
    }
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [pinnedTabs]="pinnedTabs"
                    [rightHeaderActionsComponent]="rightHeaderActionsComponent"
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

    rightHeaderActionsComponent = PinHeaderActionComponent;

    // Enable pinned tabs, which stay ahead of the other tabs and never overflow.
    pinnedTabs = { enabled: true };

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;

        const home = api.addPanel({
            id: 'home',
            component: 'default',
            title: 'Home',
            params: { title: 'Home' },
        });
        api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
            params: { title: 'Panel 1' },
        });
        api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            params: { title: 'Panel 2' },
        });
        api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            params: { title: 'Panel 3' },
        });
        api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            params: { title: 'Panel 4' },
        });

        // Pin the "Home" tab so it always renders first and never overflows.
        home.api.setPinned(true);
    }
}

@NgModule({
    declarations: [
        AppComponent,
        DefaultPanelComponent,
        PinHeaderActionComponent,
    ],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
