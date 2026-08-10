import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, Type, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { DockviewAngularModule } from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

const positions = ['top', 'bottom', 'left', 'right'];

// Default panel component with header position controls
@Component({
    selector: 'default-panel',
    template: `
        <div class="example-panel">
            <div class="example-controls">
                <button
                    *ngFor="let value of positions"
                    [disabled]="value === position"
                    (click)="setPosition(value)"
                >
                    {{ value }}
                </button>
            </div>
            <div [ngStyle]="{ fontSize: '13px', marginTop: '12px' }">
                Header position: {{ position }}
            </div>
        </div>
    `,
})
export class DefaultPanelComponent {
    api: any;
    positions = positions;
    position = 'top';

    ngOnInit() {
        if (this.api?.group?.api?.getHeaderPosition) {
            this.position = this.api.group.api.getHeaderPosition();
        }
    }

    setPosition(value: string) {
        if (this.api?.group?.api?.setHeaderPosition) {
            this.api.group.api.setHeaderPosition(value);
            this.position = value;
        }
    }
}

// Main app component
@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    defaultHeaderPosition="bottom"
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)"
                >
                </dv-dockview>
            </div>
        </div>
    `,
})
export class AppComponent {
    components: Record<string, Type<any>>;

    constructor() {
        this.components = {
            default: DefaultPanelComponent,
        };
    }

    onReady(event: any) {
        const api = event.api;

        const panel1 = api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });

        const panel2 = api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            position: {
                referencePanel: panel1,
                direction: 'right',
            },
        });

        api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            position: {
                referencePanel: panel2,
                direction: 'below',
            },
        });
    }
}

@NgModule({
    declarations: [AppComponent, DefaultPanelComponent],
    imports: [BrowserModule, CommonModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
