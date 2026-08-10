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
    template: `<div class="example-panel">{{ params?.title }}</div>`,
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
                <button (click)="addPanel()">Add Tab</button>
                <button (click)="toggleMode()">
                    {{
                        mode === 'wrap'
                            ? 'Switch to dropdown mode'
                            : 'Switch to wrap mode'
                    }}
                </button>
                <button (click)="toggleVertical()">
                    {{ vertical ? 'Horizontal header' : 'Vertical header' }}
                </button>
            </div>
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [overflow]="overflow"
                    [pinnedTabs]="pinnedTabs"
                    [getTabContextMenuItems]="getTabContextMenuItems"
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

    mode: 'wrap' | 'dropdown' = 'wrap';

    // Wrap tabs onto multiple rows when they no longer fit on one row.
    overflow: { mode: 'wrap' | 'dropdown' } = { mode: 'wrap' };

    // Enable pinned tabs. This auto-injects Pin/Unpin into the tab
    // right-click menu.
    pinnedTabs = { enabled: true };

    // Header orientation. Vertical + wrap lays the tabs out in columns.
    vertical = false;

    // Two custom right-click items. Pin/Unpin is auto-prepended by
    // `pinnedTabs`, so it isn't listed here.
    getTabContextMenuItems = () => [
        {
            label:
                this.mode === 'wrap'
                    ? 'Switch to dropdown mode'
                    : 'Switch to wrap mode',
            action: () => this.toggleMode(),
        },
        {
            label: this.vertical ? 'Horizontal header' : 'Vertical header',
            action: () => this.toggleVertical(),
        },
    ];

    private api?: DockviewApi;
    private counter = 0;

    onReady(event: DockviewReadyEvent) {
        this.api = event.api;
        this.counter = 0;
        // Open enough panels in a single group that the tabs no longer fit on
        // one row.
        for (let i = 0; i < 12; i++) {
            this.addPanel();
        }
    }

    addPanel() {
        if (!this.api) {
            return;
        }

        this.counter++;
        this.api.addPanel({
            id: `panel_${this.counter}`,
            component: 'default',
            title: `Panel ${this.counter}`,
            params: { title: `Panel ${this.counter}` },
        });
        // Keep any newly created group aligned with the current orientation.
        this.applyHeaderPosition();
    }

    toggleMode() {
        this.mode = this.mode === 'wrap' ? 'dropdown' : 'wrap';
        this.overflow = { mode: this.mode };
        // Re-apply the option so flipping the mode takes effect immediately.
        this.api?.updateOptions({ overflow: this.overflow });
    }

    toggleVertical() {
        this.vertical = !this.vertical;
        this.applyHeaderPosition();
    }

    private applyHeaderPosition() {
        this.api?.groups.forEach((group) =>
            group.api.setHeaderPosition(this.vertical ? 'left' : 'top')
        );
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
