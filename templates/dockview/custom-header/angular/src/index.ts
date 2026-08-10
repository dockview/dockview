import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, Type, NgModule, Input, OnInit, OnDestroy } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { DockviewAngularModule, DockviewApi, DockviewReadyEvent } from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

interface CustomParams {
    myValue: number;
}

// Default panel component
@Component({
    selector: 'default-panel',
    template: `
        <div class="example-panel">
            <div style="margin-bottom: 8px;">{{ title }}</div>
            <div class="example-controls">
                <button (click)="toggleRunning()">{{ running ? 'Stop' : 'Start' }}</button>
                <span>Last updated: {{ lastUpdated }}</span>
            </div>
        </div>
    `
})
export class DefaultPanelComponent implements OnInit, OnDestroy {
    @Input() api: any;
    @Input() params: CustomParams;

    running = false;
    private interval: any;

    get title() {
        return this.api?.title || 'Panel';
    }

    get lastUpdated() {
        return new Date(this.params?.myValue).toLocaleTimeString();
    }

    ngOnInit() {
        // Component initialization
    }

    ngOnDestroy() {
        this.stopUpdating();
    }

    toggleRunning() {
        this.running = !this.running;
        if (this.running) {
            this.startUpdating();
        } else {
            this.stopUpdating();
        }
    }

    private startUpdating() {
        if (this.interval) {
            clearInterval(this.interval);
        }
        
        this.api?.updateParameters({ myValue: Date.now() });
        this.interval = setInterval(() => {
            this.api?.updateParameters({ myValue: Date.now() });
        }, 1000);
    }

    private stopUpdating() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

// Custom tab component  
@Component({
    selector: 'custom-tab',
    template: `
        <div>
            <div>custom tab: {{ title }}</div>
            <span>Last updated: {{ lastUpdated }}</span>
        </div>
    `
})
export class CustomTabComponent {
    @Input() api: any;
    @Input() params: CustomParams;

    get title() {
        return this.api?.title || 'Tab';
    }

    get lastUpdated() {
        return new Date(this.params?.myValue).toLocaleTimeString();
    }
}

// Main app component
@Component({
    selector: 'app-root',
    template: `
        <div style="height: 100%;">
            <dv-dockview
                [components]="components"
                [tabComponents]="tabComponents"
                className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                (ready)="onReady($event)">
            </dv-dockview>
        </div>
    `
})
export class AppComponent {
    components: Record<string, Type<any>>;
    tabComponents: Record<string, Type<any>>;

    constructor() {
        this.components = {
            default: DefaultPanelComponent,
        };
        
        this.tabComponents = {
            default: CustomTabComponent,
        };
    }

    onReady(event: DockviewReadyEvent) {
        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            tabComponent: 'default',
            params: {
                myValue: Date.now(),
            },
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            tabComponent: 'default',
            params: {
                myValue: Date.now(),
            },
        });
    }
}

// App module
@NgModule({
    declarations: [AppComponent, DefaultPanelComponent, CustomTabComponent],
    imports: [BrowserModule, DockviewAngularModule],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { }

// Bootstrap the application
platformBrowserDynamic().bootstrapModule(AppModule).catch(err => console.error(err));