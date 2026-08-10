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
    ChangeDetectorRef,
} from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewApi,
    DockviewGroupPanel,
    DockviewGroupPanelApi,
    DockviewPanelApi,
    DockviewReadyEvent,
    SerializedDockview,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

// dockview.dev docs license key. Replace with your own key in production.
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

const STORAGE_KEY = 'angular_demo_dockview_layout';

interface LogLine {
    text: string;
    timestamp: string;
}

// A simple service-like singleton for cross-component logging. Avoids the
// React demo's hook-based propagation while keeping the panels and the log
// pane decoupled.
class Logger {
    private subscribers = new Set<(lines: LogLine[]) => void>();
    private lines: LogLine[] = [];

    log(message: string) {
        this.lines = [
            { text: message, timestamp: new Date().toLocaleTimeString() },
            ...this.lines.slice(0, 199),
        ];
        this.subscribers.forEach((s) => s(this.lines));
    }

    subscribe(cb: (lines: LogLine[]) => void): () => void {
        cb(this.lines);
        this.subscribers.add(cb);
        return () => this.subscribers.delete(cb);
    }
}

const logger = new Logger();

@Component({
    selector: 'default-panel',
    template: `
        <div
            style="height: 100%; overflow: auto; color: white; position: relative;"
        >
            <span
                style="position: absolute; top: 50%; left: 50%;
                       transform: translate(-50%, -50%); pointer-events: none;
                       font-size: 42px; opacity: 0.5;"
            >
                {{ api?.title }}
            </span>
        </div>
    `,
})
export class DefaultPanelComponent {
    @Input() api!: DockviewPanelApi;
}

@Component({
    selector: 'iframe-panel',
    template: `
        <iframe
            (mousedown)="onActivate()"
            style="width: 100%; height: 100%; border: 0;"
            src="https://dockview.dev"
        >
        </iframe>
    `,
})
export class IframePanelComponent {
    @Input() api!: DockviewPanelApi;

    onActivate() {
        if (!this.api.isActive) {
            this.api.setActive();
        }
    }
}

@Component({
    selector: 'log-panel',
    template: `
        <div
            style="height: 100%; overflow: auto; color: white; font-family: monospace; font-size: 11px;"
        >
            <div *ngFor="let line of lines" style="padding: 2px 6px;">
                <span style="color: #888;">{{ line.timestamp }}</span>
                <span style="margin-left: 8px;">{{ line.text }}</span>
            </div>
        </div>
    `,
})
export class LogPanelComponent implements OnInit, OnDestroy {
    @Input() api!: DockviewPanelApi;
    lines: LogLine[] = [];
    private unsubscribe?: () => void;

    constructor(private cd: ChangeDetectorRef) {}

    ngOnInit() {
        this.unsubscribe = logger.subscribe((lines) => {
            this.lines = lines;
            this.cd.markForCheck();
        });
    }
    ngOnDestroy() {
        this.unsubscribe?.();
    }
}

@Component({
    selector: 'watermark-panel',
    template: `<div style="color: white; padding: 16px;">No panels open</div>`,
})
export class WatermarkComponent {}

@Component({
    selector: 'left-header-actions',
    template: `
        <div
            style="height: 100%; color: white; padding: 0 4px; display: flex; align-items: center;"
        >
            <div
                (click)="addPanel()"
                title="Add Panel"
                style="display: flex; align-items: center; justify-content: center; width: 30px; height: 100%; cursor: pointer; font-size: 18px;"
            >
                <span class="material-symbols-outlined">add</span>
            </div>
        </div>
    `,
})
export class LeftHeaderActionsComponent {
    @Input() containerApi!: DockviewApi;
    @Input() group!: DockviewGroupPanel;

    addPanel() {
        const id = `panel_${Date.now()}`;
        this.containerApi.addPanel({
            id,
            title: id,
            component: 'default',
            position: { referenceGroup: this.group },
        });
    }
}

@Component({
    selector: 'right-header-actions',
    template: `
        <div
            style="height: 100%; color: white; padding: 0 4px; display: flex; align-items: center;"
        >
            <div
                (click)="toggleFloat()"
                [title]="isFloating ? 'Dock group' : 'Float group'"
                style="display: flex; align-items: center; justify-content: center; width: 30px; height: 100%; cursor: pointer; font-size: 18px;"
            >
                <span class="material-symbols-outlined">
                    {{ isFloating ? 'jump_to_element' : 'back_to_tab' }}
                </span>
            </div>
        </div>
    `,
})
export class RightHeaderActionsComponent implements OnInit, OnDestroy {
    @Input() api!: DockviewGroupPanelApi;
    @Input() containerApi!: DockviewApi;
    @Input() group!: DockviewGroupPanel;

    isFloating = false;
    private disposable?: { dispose(): void };

    constructor(private cd: ChangeDetectorRef) {}

    ngOnInit() {
        this.isFloating = this.api.location.type === 'floating';
        this.disposable = this.group.api.onDidLocationChange((event) => {
            this.isFloating = event.location.type === 'floating';
            this.cd.markForCheck();
        });
    }
    ngOnDestroy() {
        this.disposable?.dispose();
    }

    toggleFloat() {
        if (this.isFloating) {
            const dest = this.containerApi.addGroup();
            this.group.api.moveTo({ group: dest });
        } else {
            this.containerApi.addFloatingGroup(this.group, {
                width: 400,
                height: 300,
                position: { right: 50, bottom: 50 },
            });
        }
    }
}

@Component({
    selector: 'app-root',
    template: `
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div
                style="padding: 4px 8px; display: flex; gap: 4px; flex-wrap: wrap; background: #1a1a1a;"
            >
                <button (click)="addPanel()">Add Panel</button>
                <button (click)="addIframe()">Add Iframe</button>
                <button (click)="addLog()">Add Log</button>
                <button (click)="addGroup()">Add Group</button>
                <button (click)="save()">Save</button>
                <button (click)="load()">Load</button>
                <button (click)="clear()">Clear</button>
                <span
                    style="color: #888; margin-left: auto; align-self: center;"
                >
                    panels={{ panelCount }} groups={{ groupCount }} active={{
                        activePanelId || '-'
                    }}
                </span>
            </div>
            <div style="flex-grow: 1;">
                <dv-dockview
                    [components]="components"
                    [watermarkComponent]="watermarkComponent"
                    [leftHeaderActionsComponent]="leftHeaderActionsComponent"
                    [rightHeaderActionsComponent]="rightHeaderActionsComponent"
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)"
                >
                </dv-dockview>
            </div>
        </div>
    `,
})
export class AppComponent implements OnDestroy {
    components: Record<string, Type<any>> = {
        default: DefaultPanelComponent,
        iframe: IframePanelComponent,
        log: LogPanelComponent,
    };
    watermarkComponent = WatermarkComponent;
    leftHeaderActionsComponent = LeftHeaderActionsComponent;
    rightHeaderActionsComponent = RightHeaderActionsComponent;

    panelCount = 0;
    groupCount = 0;
    activePanelId = '';

    private api?: DockviewApi;
    private disposables: { dispose(): void }[] = [];
    private counter = 0;

    constructor(private cd: ChangeDetectorRef) {}

    onReady(event: DockviewReadyEvent) {
        this.api = event.api;

        this.disposables.push(
            this.api.onDidAddPanel((panel) => {
                this.panelCount = this.api!.panels.length;
                logger.log(`Added panel ${panel.id}`);
                this.cd.markForCheck();
            }),
            this.api.onDidRemovePanel((panel) => {
                this.panelCount = this.api!.panels.length;
                logger.log(`Removed panel ${panel.id}`);
                this.cd.markForCheck();
            }),
            this.api.onDidAddGroup(() => {
                this.groupCount = this.api!.groups.length;
                this.cd.markForCheck();
            }),
            this.api.onDidRemoveGroup(() => {
                this.groupCount = this.api!.groups.length;
                this.cd.markForCheck();
            }),
            this.api.onDidActivePanelChange((event) => {
                this.activePanelId = event.panel?.id ?? '';
                this.cd.markForCheck();
            })
        );

        if (!this.tryLoad()) {
            this.loadDefaultLayout();
        }
    }

    addPanel() {
        if (!this.api) return;
        const id = this.nextId('panel');
        this.api.addPanel({ id, component: 'default', title: id });
    }

    addIframe() {
        if (!this.api) return;
        const id = this.nextId('iframe');
        this.api.addPanel({ id, component: 'iframe', title: id });
    }

    addLog() {
        if (!this.api) return;
        this.api.addPanel({
            id: 'log',
            component: 'log',
            title: 'Log',
            position: { direction: 'below' },
        });
    }

    addGroup() {
        if (!this.api) return;
        this.api.addGroup();
    }

    save() {
        if (!this.api) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.api.toJSON()));
        logger.log('Saved layout');
    }

    load() {
        if (this.tryLoad()) {
            logger.log('Loaded layout');
        }
    }

    clear() {
        this.api?.clear();
        localStorage.removeItem(STORAGE_KEY);
        logger.log('Cleared layout');
    }

    private tryLoad(): boolean {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw || !this.api) {
            return false;
        }
        try {
            const json = JSON.parse(raw) as SerializedDockview;
            this.api.fromJSON(json);
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    private loadDefaultLayout() {
        if (!this.api) return;
        const panel1 = this.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });
        this.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            position: { referencePanel: panel1 },
        });
        this.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            position: { referencePanel: panel1, direction: 'right' },
        });
        this.api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: { referencePanel: 'panel_3', direction: 'below' },
        });
        this.api.addPanel({
            id: 'log',
            component: 'log',
            title: 'Log',
            position: { direction: 'below' },
        });
        panel1.api.setActive();
    }

    private nextId(prefix: string): string {
        return `${prefix}_${++this.counter}`;
    }

    ngOnDestroy() {
        this.disposables.forEach((d) => d.dispose());
    }
}

@NgModule({
    declarations: [
        AppComponent,
        DefaultPanelComponent,
        IframePanelComponent,
        LogPanelComponent,
        WatermarkComponent,
        LeftHeaderActionsComponent,
        RightHeaderActionsComponent,
    ],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
