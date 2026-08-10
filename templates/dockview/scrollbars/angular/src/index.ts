import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, NgModule, Type } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewApi,
    DockviewReadyEvent,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

const TEXT =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const PARAGRAPH = (TEXT + '\n\n').repeat(20);

@Component({
    selector: 'fixed-height-panel',
    template: `<div class="example-panel" style="height: 100%;">{{ text }}</div>`,
})
export class FixedHeightPanelComponent {
    text = PARAGRAPH;
}

@Component({
    selector: 'overflow-panel',
    template: `<div class="example-panel" style="height: 2000px; overflow: auto;">{{ text }}</div>`,
})
export class OverflowPanelComponent {
    text = PARAGRAPH;
}

@Component({
    selector: 'user-overflow-panel',
    template: `
        <div class="example-panel" style="height: 100%;">
            <div style="height: 100%; overflow: auto;">{{ text }}</div>
        </div>
    `,
})
export class UserOverflowPanelComponent {
    text = PARAGRAPH;
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
        fixedHeightContainer: FixedHeightPanelComponent,
        overflowContainer: OverflowPanelComponent,
        userDefinedOverflowContainer: UserOverflowPanelComponent,
    };

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;
        api.addPanel({
            id: 'panel_1',
            component: 'fixedHeightContainer',
            title: 'Panel 1',
        });
        api.addPanel({
            id: 'panel_2',
            component: 'overflowContainer',
            title: 'Panel 2',
            position: { direction: 'right' },
        });
        api.addPanel({
            id: 'panel_3',
            component: 'userDefinedOverflowContainer',
            title: 'Panel 3',
            position: { direction: 'right' },
        });
    }
}

@NgModule({
    declarations: [
        AppComponent,
        FixedHeightPanelComponent,
        OverflowPanelComponent,
        UserOverflowPanelComponent,
    ],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
