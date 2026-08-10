import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, NgModule, Input, Type, OnDestroy } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewApi,
    DockviewDidDropEvent,
    DockviewPanelApi,
    DockviewReadyEvent,
    positionToDirection,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

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
                <span
                    tabindex="-1"
                    draggable="true"
                    (dragstart)="onExternalDragStart($event)"
                    style="padding: 4px 12px; border-radius: 4px; cursor: grab; user-select: none; color: var(--dv-activegroup-visiblepanel-tab-color); background: var(--dv-activegroup-visiblepanel-tab-background-color); border: 1px solid var(--dv-separator-border);"
                >
                    Drag me into the dock
                </span>
                <div
                    (dragover)="$event.preventDefault()"
                    (drop)="onDropOutside($event)"
                    style="flex: 1; min-width: 0; padding: 4px 12px; border-radius: 4px; border: 1px dashed var(--dv-separator-border); color: var(--dv-inactivegroup-visiblepanel-tab-color);"
                >
                    Drop a tab or group here to inspect the attached metadata
                </div>
            </div>
            <div
                *ngIf="dropped"
                class="example-controls"
                style="display: block; font-size: 12px;"
            >
                <span *ngIf="dropped.length === 0"
                    >No dataTransfer data was found.</span
                >
                <div *ngFor="let entry of dropped">
                    <code>{{ entry.type }}</code>: {{ entry.data }}
                </div>
            </div>
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [dndEdges]="dndEdges"
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)"
                    (didDrop)="onDidDrop($event)"
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

    dndEdges = {
        size: { value: 100, type: 'pixels' as const },
        activationSize: { value: 5, type: 'percentage' as const },
    };

    dropped: { type: string; data: string }[] | null = null;

    private disposables: { dispose(): void }[] = [];

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;

        api.addPanel({
            id: 'panel_1',
            component: 'default',
            params: { title: 'Panel 1' },
        });
        api.addPanel({
            id: 'panel_2',
            component: 'default',
            params: { title: 'Panel 2' },
        });
        api.addPanel({
            id: 'panel_3',
            component: 'default',
            params: { title: 'Panel 3' },
        });
        api.addPanel({
            id: 'panel_4',
            component: 'default',
            params: { title: 'Panel 4' },
            position: { referencePanel: 'panel_1', direction: 'right' },
        });

        this.disposables.push(
            // Attach custom metadata when an internal panel/group drag starts,
            // so an external drop zone can read it via dataTransfer.
            api.onWillDragPanel((event) => {
                if (!(event.nativeEvent instanceof DragEvent)) {
                    return;
                }
                event.nativeEvent.dataTransfer?.setData(
                    'text/plain',
                    'Some custom panel data transfer data'
                );
            }),
            api.onWillDragGroup((event) => {
                if (!(event.nativeEvent instanceof DragEvent)) {
                    return;
                }
                event.nativeEvent.dataTransfer?.setData(
                    'text/plain',
                    'Some custom group data transfer data'
                );
            }),
            // Accept arbitrary outside drags into the dock.
            api.onUnhandledDragOver((event) => {
                event.accept();
            })
        );
    }

    onExternalDragStart(event: DragEvent) {
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', 'nothing');
        }
    }

    onDropOutside(event: DragEvent) {
        event.preventDefault();
        const dt = event.dataTransfer;

        const entries: { type: string; data: string }[] = [];
        if (dt) {
            for (let i = 0; i < dt.items.length; i++) {
                const item = dt.items[i];
                entries.push({
                    type: item.type,
                    data: dt.getData(item.type),
                });
            }
        }

        this.dropped = entries;
    }

    onDidDrop(event: DockviewDidDropEvent) {
        event.api.addPanel({
            id: 'test',
            component: 'default',
            position: {
                direction: positionToDirection(event.position),
                referenceGroup: event.group || undefined,
            },
        });
    }

    ngOnDestroy() {
        this.disposables.forEach((d) => d.dispose());
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
