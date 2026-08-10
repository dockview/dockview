import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, Type, NgModule, Input } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewApi,
    DockviewReadyEvent,
    SerializedDockview,
    DockviewGroupPanel
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

let panelCount = 0;

// Default panel component
@Component({
    selector: 'default-panel',
    template: `<div class="example-panel">{{ api?.title }}</div>`
})
export class DefaultPanelComponent {
    @Input() api: any;
}

// Watermark component
@Component({
    selector: 'watermark-panel',
    template: `<div class="example-panel">This group is empty.</div>`
})
export class WatermarkComponent {}

// Left header actions component
@Component({
    selector: 'left-header-actions',
    template: `
        <div style="height: 100%; padding: 0px 4px;">
            <div (click)="addPanel()"
                 style="display: flex; justify-content: center; align-items: center; width: 30px; height: 100%; font-size: 18px; cursor: pointer;"
                 title="Add Panel">
                <span class="material-symbols-outlined">add</span>
            </div>
        </div>
    `
})
export class LeftHeaderActionsComponent {
    @Input() containerApi: DockviewApi;

    addPanel() {
        this.containerApi.addPanel({
            id: (++panelCount).toString(),
            title: `Tab ${panelCount}`,
            component: 'default',
        });
    }
}

// Right header actions component
@Component({
    selector: 'right-header-actions',
    template: `
        <div style="height: 100%; padding: 0px 4px;">
            <div (click)="toggleFloat()"
                 style="display: flex; justify-content: center; align-items: center; width: 30px; height: 100%; font-size: 18px; cursor: pointer;"
                 [title]="isFloating ? 'Dock Group' : 'Float Group'">
                <span class="material-symbols-outlined">{{ isFloating ? 'jump_to_element' : 'back_to_tab' }}</span>
            </div>
        </div>
    `
})
export class RightHeaderActionsComponent {
    @Input() containerApi: DockviewApi;
    @Input() api: any;
    @Input() group: DockviewGroupPanel;

    isFloating = false;

    ngOnInit() {
        this.isFloating = this.api?.location?.type === 'floating';
        if (this.group?.api) {
            this.group.api.onDidLocationChange((event) => {
                this.isFloating = event.location.type === 'floating';
            });
        }
    }

    toggleFloat() {
        if (this.isFloating) {
            const group = this.containerApi.addGroup();
            this.group.api.moveTo({ group });
        } else {
            this.containerApi.addFloatingGroup(this.group, {
                width: 400,
                height: 300,
                position: { bottom: 50, right: 50 },
            });
        }
    }
}

// Main app component
@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <button (click)="save()">Save</button>
                <button (click)="load()">Load</button>
                <button (click)="clear()">Clear</button>
                <button (click)="addFloatingPanel()">Add Floating Group</button>
                <button (click)="toggleBounds()">{{ boundsText }}</button>
                <button (click)="toggleDisableFloating()">{{ disableFloatingText }}</button>
            </div>
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [watermarkComponent]="watermarkComponent"
                    [leftHeaderActionsComponent]="leftHeaderActionsComponent"
                    [rightHeaderActionsComponent]="rightHeaderActionsComponent"
                    [disableFloatingGroups]="disableFloatingGroups"
                    [floatingGroupBounds]="floatingGroupBounds"
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)">
                </dv-dockview>
            </div>
        </div>
    `
})
export class AppComponent {
    components: Record<string, Type<any>>;
    watermarkComponent = WatermarkComponent;
    leftHeaderActionsComponent = LeftHeaderActionsComponent;
    rightHeaderActionsComponent = RightHeaderActionsComponent;

    api: DockviewApi;
    layout: SerializedDockview | null = null;
    disableFloatingGroups = false;
    floatingGroupBounds: 'boundedWithinViewport' | undefined = undefined;

    get boundsText() {
        return `Bounds: ${this.floatingGroupBounds ? 'Within' : 'Overflow'}`;
    }

    get disableFloatingText() {
        return `${this.disableFloatingGroups ? 'Enable' : 'Disable'} floating groups`;
    }

    constructor() {
        this.components = {
            default: DefaultPanelComponent,
        };

        // Load layout from localStorage
        try {
            const saved = localStorage.getItem('floating.layout');
            if (saved) {
                this.layout = JSON.parse(saved);
            }
        } catch (err) {
            // ignore
        }
    }

    onReady(event: DockviewReadyEvent) {
        this.api = event.api;
        this.loadLayout();
    }

    private loadDefaultLayout() {
        this.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });

        this.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
        });

        this.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
        });

        const panel4 = this.api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            floating: true,
        });

        this.api.addPanel({
            id: 'panel_5',
            component: 'default',
            title: 'Panel 5',
            floating: false,
            position: { referencePanel: panel4 },
        });

        this.api.addPanel({
            id: 'panel_6',
            component: 'default',
            title: 'Panel 6',
        });
    }

    private loadLayout() {
        this.api.clear();
        if (this.layout) {
            try {
                this.api.fromJSON(this.layout);
            } catch (err) {
                console.error(err);
                this.api.clear();
                this.loadDefaultLayout();
            }
        } else {
            this.loadDefaultLayout();
        }
    }

    save() {
        if (this.api) {
            this.layout = this.api.toJSON();
            localStorage.setItem('floating.layout', JSON.stringify(this.layout));
        }
    }

    load() {
        if (this.api) {
            this.loadLayout();
        }
    }

    clear() {
        this.api.clear();
        this.layout = null;
        localStorage.removeItem('floating.layout');
    }

    addFloatingPanel() {
        this.api.addPanel({
            id: (++panelCount).toString(),
            title: `Tab ${panelCount}`,
            component: 'default',
            floating: { width: 250, height: 150, x: 50, y: 50 },
        });
    }

    toggleBounds() {
        this.floatingGroupBounds = this.floatingGroupBounds === undefined
            ? 'boundedWithinViewport'
            : undefined;
    }

    toggleDisableFloating() {
        this.disableFloatingGroups = !this.disableFloatingGroups;
    }
}

// App module
@NgModule({
    declarations: [
        AppComponent,
        DefaultPanelComponent,
        WatermarkComponent,
        LeftHeaderActionsComponent,
        RightHeaderActionsComponent
    ],
    imports: [BrowserModule, DockviewAngularModule],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { }

// Bootstrap the application
platformBrowserDynamic().bootstrapModule(AppModule).catch(err => console.error(err));
