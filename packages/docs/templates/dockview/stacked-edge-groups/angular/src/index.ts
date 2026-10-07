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
    template: `
        <div class="example-panel">{{ params?.title }}</div>
    `,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;
    @Input() params!: { title: string };
}

// A collapse/expand toggle for each group stacked on an edge.
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

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [rightHeaderActionsComponent]="rightHeaderActionsComponent"
                    [stackedEdgeGroups]="true"
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
    rightHeaderActionsComponent = RightActionsComponent;

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;

        api.addPanel({
            id: 'doc_1',
            component: 'default',
            title: 'Document',
            params: { title: 'Document' },
        });
        api.addPanel({
            id: 'doc_2',
            component: 'default',
            title: 'Preview',
            params: { title: 'Preview' },
            position: { direction: 'right', referencePanel: 'doc_1' },
        });

        // the left edge: two groups stacked top to bottom
        api.addEdgeGroup('left', {
            id: 'explorer',
            initialSize: 240,
            minimumSize: 150,
        });
        api.addPanel({
            id: 'files',
            component: 'default',
            title: 'Files',
            params: { title: 'Files' },
            position: { referenceGroup: 'explorer' },
        });
        api.addPanel({
            id: 'search',
            component: 'default',
            title: 'Search',
            params: { title: 'Search' },
            position: { referenceGroup: 'explorer' },
        });

        // joins the left edge below the first group, taking half of its height
        api.addEdgeGroup('left', {
            id: 'outline',
            stack: { relativeTo: 'explorer', placement: 'after' },
        });
        api.addPanel({
            id: 'outline-panel',
            component: 'default',
            title: 'Outline',
            params: { title: 'Outline' },
            position: { referenceGroup: 'outline' },
        });

        // the bottom edge: a single group, as before
        api.addEdgeGroup('bottom', {
            id: 'bottom-edge',
            initialSize: 180,
            minimumSize: 100,
        });
        api.addPanel({
            id: 'output',
            component: 'default',
            title: 'Output',
            params: { title: 'Output' },
            position: { referenceGroup: 'bottom-edge' },
        });
        api.addPanel({
            id: 'problems',
            component: 'default',
            title: 'Problems',
            params: { title: 'Problems' },
            position: { referenceGroup: 'bottom-edge' },
        });

        // drag a tab onto the top or bottom half of a left edge group to
        // open it in a new group stacked there
    }
}

@NgModule({
    declarations: [AppComponent, DefaultPanelComponent, RightActionsComponent],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
