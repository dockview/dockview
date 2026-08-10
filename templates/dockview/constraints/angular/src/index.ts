import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, OnInit, OnDestroy, Type, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { DockviewAngularModule } from 'dockview-angular';
import { Subject } from 'rxjs';
import 'dockview-angular/dist/styles/dockview.css';

// Default panel component with constraints
@Component({
    selector: 'default-panel',
    template: `
        <div class="example-panel">
            <div class="example-controls">
                <button (click)="onClick()">Set constraints</button>
            </div>
            <div *ngIf="constraints" [ngStyle]="{ fontSize: '13px', marginTop: '12px' }">
                <div *ngIf="constraints.maximumHeight != null" [ngStyle]="constraintItemStyle">
                    <span>Maximum height: </span>
                    <span>{{ constraints.maximumHeight }}px</span>
                </div>
                <div *ngIf="constraints.minimumHeight != null" [ngStyle]="constraintItemStyle">
                    <span>Minimum height: </span>
                    <span>{{ constraints.minimumHeight }}px</span>
                </div>
                <div *ngIf="constraints.maximumWidth != null" [ngStyle]="constraintItemStyle">
                    <span>Maximum width: </span>
                    <span>{{ constraints.maximumWidth }}px</span>
                </div>
                <div *ngIf="constraints.minimumWidth != null" [ngStyle]="constraintItemStyle">
                    <span>Minimum width: </span>
                    <span>{{ constraints.minimumWidth }}px</span>
                </div>
            </div>
        </div>
    `,
})
export class DefaultPanelComponent implements OnInit, OnDestroy {
    api: any;
    constraints: any = null;
    private destroy$ = new Subject<void>();

    constraintItemStyle = {
        border: '1px solid grey',
        margin: '2px',
        padding: '4px 6px'
    };

    ngOnInit() {
        if (this.api?.group?.api?.onDidConstraintsChange) {
            this.api.group.api.onDidConstraintsChange((event: any) => {
                this.constraints = event;
            });
        }
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    onClick() {
        if (this.api?.group?.api?.setConstraints) {
            this.api.group.api.setConstraints({
                maximumWidth: 300,
                maximumHeight: 300,
            });
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
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)">
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

        const panel3 = api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            position: {
                referencePanel: panel2,
                direction: 'right',
            },
        });

        const panel4 = api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: {
                direction: 'below',
            },
        });
    }
}

@NgModule({
    declarations: [AppComponent, DefaultPanelComponent],
    imports: [BrowserModule, CommonModule, DockviewAngularModule],
    bootstrap: [AppComponent]
})
export class AppModule { }

platformBrowserDynamic().bootstrapModule(AppModule).catch(err => console.error(err));
