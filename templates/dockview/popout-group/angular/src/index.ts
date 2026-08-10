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
    ViewChild,
    ElementRef,
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

const STORAGE_KEY = 'popout.layout';
let panelCount = 0;

const MENU_ITEMS = ['New tab', 'Duplicate panel', 'Rename panel', 'Close panel'];

@Component({
    selector: 'popover-menu',
    template: `
        <button
            #button
            (click)="toggle()"
            style="position: relative; align-self: flex-start;">
            {{ isOpen ? 'Hide menu' : 'Show menu' }}
            <ul
                *ngIf="isOpen"
                style="position: absolute; top: calc(100% + 4px); left: 0; background: var(--dv-group-view-background-color); color: var(--dv-activegroup-visiblepanel-tab-color); border: 1px solid var(--dv-separator-border); border-radius: 4px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); list-style: none; padding: 4px 0; margin: 0; min-width: 160px; text-align: left; z-index: 1000;">
                <li
                    *ngFor="let item of menuItems"
                    style="padding: 6px 16px; cursor: pointer;"
                    (mouseenter)="setBackground($event, true)"
                    (mouseleave)="setBackground($event, false)">
                    {{ item }}
                </li>
            </ul>
        </button>
    `,
})
export class PopoverMenuComponent implements OnDestroy {
    @Input() window?: Window;
    @ViewChild('button') buttonRef?: ElementRef<HTMLButtonElement>;

    isOpen = false;
    menuItems = MENU_ITEMS;

    private doc?: Document;
    private handleClickOutside = (event: Event) => {
        if (
            this.buttonRef &&
            !this.buttonRef.nativeElement.contains(event.target as Node)
        ) {
            this.close();
        }
    };

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    private open() {
        this.isOpen = true;
        this.doc = this.window?.document || document;
        this.doc.addEventListener('mousedown', this.handleClickOutside);
    }

    private close() {
        this.isOpen = false;
        this.doc?.removeEventListener('mousedown', this.handleClickOutside);
    }

    setBackground(event: Event, hovered: boolean) {
        (event.currentTarget as HTMLElement).style.background = hovered
            ? 'var(--dv-activegroup-visiblepanel-tab-background-color)'
            : 'transparent';
    }

    ngOnDestroy() {
        this.close();
    }
}

@Component({
    selector: 'default-panel',
    template: `
        <div
            class="example-panel"
            style="display: flex; flex-direction: column; gap: 8px;">
            <div>{{ api?.title }}</div>
            <popover-menu [window]="window"></popover-menu>
        </div>
    `,
})
export class DefaultPanelComponent implements OnInit, OnDestroy {
    @Input() api!: DockviewPanelApi;

    window!: Window;
    private disposable?: { dispose(): void };

    constructor(private cd: ChangeDetectorRef) {}

    ngOnInit() {
        this.window = this.api.getWindow();
        this.disposable = this.api.onDidLocationChange(() => {
            this.window = this.api.getWindow();
            this.cd.markForCheck();
        });
    }

    ngOnDestroy() {
        this.disposable?.dispose();
    }
}

@Component({
    selector: 'watermark-panel',
    template: `<div style="padding: 8px;">Empty group</div>`,
})
export class WatermarkComponent {}

@Component({
    selector: 'left-header-actions',
    template: `
        <div style="height: 100%; padding: 0px 4px;">
            <div
                (click)="addPanel()"
                title="Add panel"
                style="display: flex; align-items: center; justify-content: center; width: 30px; height: 100%; cursor: pointer; font-size: 18px;">
                <span class="material-symbols-outlined">add</span>
            </div>
        </div>
    `,
})
export class LeftHeaderActionsComponent {
    @Input() containerApi!: DockviewApi;
    @Input() group!: DockviewGroupPanel;

    addPanel() {
        const id = (++panelCount).toString();
        this.containerApi.addPanel({
            id,
            title: `Tab ${id}`,
            component: 'default',
            position: { referenceGroup: this.group },
        });
    }
}

@Component({
    selector: 'right-header-actions',
    template: `
        <div style="height: 100%; padding: 0px 4px;">
            <div
                (click)="toggle()"
                [title]="popout ? 'Return group to dock' : 'Open group in new window'"
                style="display: flex; align-items: center; justify-content: center; width: 30px; height: 100%; cursor: pointer; font-size: 18px;">
                <span class="material-symbols-outlined">
                    {{ popout ? 'jump_to_element' : 'back_to_tab' }}
                </span>
            </div>
        </div>
    `,
})
export class RightHeaderActionsComponent implements OnInit, OnDestroy {
    @Input() api!: DockviewGroupPanelApi;
    @Input() containerApi!: DockviewApi;
    @Input() group!: DockviewGroupPanel;

    popout = false;
    private disposable?: { dispose(): void };

    constructor(private cd: ChangeDetectorRef) {}

    ngOnInit() {
        this.popout = this.api.location.type === 'popout';
        this.disposable = this.group.api.onDidLocationChange((event) => {
            this.popout = event.location.type === 'popout';
            this.cd.markForCheck();
        });
    }

    ngOnDestroy() {
        this.disposable?.dispose();
    }

    toggle() {
        if (this.popout) {
            const group = this.containerApi.addGroup();
            this.group.api.moveTo({ group });
        } else {
            this.containerApi.addPopoutGroup(this.group, {
                popoutUrl: '/popout/index.html',
            });
        }
    }
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <button (click)="save()">Save</button>
                <button (click)="load()">Load</button>
                <button (click)="clear()">Clear</button>
            </div>
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [watermarkComponent]="watermarkComponent"
                    [leftHeaderActionsComponent]="leftHeaderActionsComponent"
                    [rightHeaderActionsComponent]="rightHeaderActionsComponent"
                    className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                    (ready)="onReady($event)">
                </dv-dockview>
            </div>
        </div>
    `,
})
export class AppComponent {
    components: Record<string, Type<any>> = {
        default: DefaultPanelComponent,
    };
    watermarkComponent = WatermarkComponent;
    leftHeaderActionsComponent = LeftHeaderActionsComponent;
    rightHeaderActionsComponent = RightHeaderActionsComponent;

    private api?: DockviewApi;
    private layout: SerializedDockview | null = null;

    constructor() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                this.layout = JSON.parse(stored);
            } catch {
                this.layout = null;
            }
        }
    }

    onReady(event: DockviewReadyEvent) {
        this.api = event.api;
        this.loadLayout();
    }

    save() {
        if (!this.api) {
            return;
        }
        this.layout = this.api.toJSON();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.layout));
    }

    load() {
        if (this.api) {
            this.loadLayout();
        }
    }

    clear() {
        this.api?.clear();
        this.layout = null;
        localStorage.removeItem(STORAGE_KEY);
    }

    private loadLayout() {
        if (!this.api) {
            return;
        }
        this.api.clear();
        if (this.layout) {
            try {
                this.api.fromJSON(this.layout);
                return;
            } catch (err) {
                console.error(err);
                this.api.clear();
            }
        }
        this.loadDefaultLayout();
    }

    private loadDefaultLayout() {
        if (!this.api) {
            return;
        }
        this.api.addPanel({ id: 'panel_1', component: 'default', title: 'Panel 1' });
        this.api.addPanel({ id: 'panel_2', component: 'default', title: 'Panel 2' });
        this.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            position: { direction: 'right' },
        });
    }
}

@NgModule({
    declarations: [
        AppComponent,
        DefaultPanelComponent,
        PopoverMenuComponent,
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
