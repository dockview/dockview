import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, Type, NgModule, Input } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewPanelApi,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

// Default panel component
@Component({
    selector: 'default-panel',
    template: `<div class="example-panel">{{ api?.title }}</div>`,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;
}

// Right header actions component (collapse/expand toggle for edge groups)
@Component({
    selector: 'right-header-actions',
    template: `
        <button
            *ngIf="isEdge"
            [title]="collapsed ? 'Expand group' : 'Collapse group'"
            [attr.aria-label]="collapsed ? 'Expand group' : 'Collapse group'"
            style="cursor: pointer; background: none; border: none; color: inherit; padding: 0 4px;"
            (click)="toggle()"
        >
            {{ collapsed ? '+' : '-' }}
        </button>
    `,
})
export class RightActionsComponent {
    @Input() api: any;

    isEdge = false;
    collapsed = false;
    private disposable: any;

    ngOnInit() {
        this.isEdge = this.api?.location?.type === 'edge';
        if (this.isEdge) {
            this.collapsed = this.api.isCollapsed();
            this.disposable = this.api.onDidCollapsedChange((event: any) => {
                this.collapsed = event.isCollapsed;
            });
        }
    }

    ngOnDestroy() {
        this.disposable?.dispose();
    }

    toggle() {
        this.collapsed ? this.api.expand() : this.api.collapse();
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
                    [rightHeaderActionsComponent]="rightHeaderActionsComponent"
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)">
                </dv-dockview>
            </div>
        </div>
    `
})
export class AppComponent {
    components: Record<string, Type<any>>;
    rightHeaderActionsComponent = RightActionsComponent;

    constructor() {
        this.components = {
            default: DefaultPanelComponent,
        };
    }

    onReady(event: any) {
        const api = event.api;

        api.addEdgeGroup('left', {
            id: 'left',
            initialSize: 220,
            minimumSize: 150,
        });

        api.addEdgeGroup('bottom', {
            id: 'bottom',
            initialSize: 180,
            minimumSize: 100,
        });

        api.addEdgeGroup('right', {
            id: 'right',
            initialSize: 220,
            minimumSize: 150,
            collapsed: true,
        });

        api.addPanel({
            id: 'explorer',
            component: 'default',
            title: 'Explorer',
            position: { referenceGroup: 'left' },
        });

        api.addPanel({
            id: 'search',
            component: 'default',
            title: 'Search',
            position: { referenceGroup: 'left' },
        });

        api.addPanel({
            id: 'terminal',
            component: 'default',
            title: 'Terminal',
            position: { referenceGroup: 'bottom' },
        });

        api.addPanel({
            id: 'output',
            component: 'default',
            title: 'Output',
            position: { referenceGroup: 'bottom' },
        });

        api.addPanel({
            id: 'outline',
            component: 'default',
            title: 'Outline',
            position: { referenceGroup: 'right' },
        });

        api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Editor',
        });

        api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Preview',
            position: {
                direction: 'right',
                referencePanel: 'panel_1',
            },
        });
    }
}

// App module
@NgModule({
    declarations: [AppComponent, DefaultPanelComponent, RightActionsComponent],
    imports: [BrowserModule, DockviewAngularModule],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { }

// Bootstrap the application with JIT compilation
platformBrowserDynamic().bootstrapModule(AppModule).catch(err => console.error(err));
