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

const shortcutStyle =
    'padding:2px 6px;border-radius:4px;border:1px solid;font-family:monospace;white-space:nowrap;';

@Component({
    selector: 'default-panel',
    template: `
        <div class="example-panel" style="font-size: 13px;">
            <div style="padding: 10px 0px;">{{ api?.title }}</div>
            <div
                style="padding: 10px 0px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;"
            >
                <span [style]="shortcutStyle">Ctrl+]</span>
                <span [style]="shortcutStyle">Ctrl+[</span>
                <span>switch tabs</span>
                <span [style]="shortcutStyle">F6</span>
                <span [style]="shortcutStyle">Shift+F6</span>
                <span>move between groups</span>
                <span [style]="shortcutStyle">Ctrl+M</span>
                <span>dock with the keyboard</span>
            </div>
        </div>
    `,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;
    @Input() params!: { title: string };

    shortcutStyle = shortcutStyle;
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [keyboardNavigation]="keyboardNavigation"
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

    // Enable the built-in enterprise keymap: Ctrl+]/Ctrl+[ to switch tabs,
    // F6/Shift+F6 to move between groups, Ctrl+M to dock.
    keyboardNavigation = true;

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;

        // A couple of groups so F6 group-switching and Ctrl+] tab-switching are
        // both demonstrable.
        api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
        api.addPanel({ id: 'panel_2', component: 'default', title: 'Panel 2' });
        api.addPanel({ id: 'panel_3', component: 'default', title: 'Panel 3' });
        api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: { referencePanel: 'panel_3', direction: 'right' },
        });
        api.addPanel({
            id: 'panel_5',
            component: 'default',
            title: 'Panel 5',
            position: { referencePanel: 'panel_4', direction: 'within' },
        });

        api.getPanel('panel_1')!.api.setActive();
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
