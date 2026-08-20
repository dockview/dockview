import 'zone.js';
import '@angular/compiler';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Component, NgModule, Input, Type, OnDestroy } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
    DockviewAngularModule,
    DockviewApi,
    DockviewPanelApi,
    DockviewReadyEvent,
} from 'dockview-angular';
import 'dockview-angular/dist/styles/dockview.css';

const TICKERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];

interface Instrument {
    ticker: string;
}

/** Broadcasts onto whichever channel the user put this panel on. */
@Component({
    selector: 'blotter-panel',
    template: `
        <div class="example-panel">
            <p>Click a ticker to broadcast it.</p>
            <div>
                <button *ngFor="let ticker of tickers" (click)="broadcast(ticker)">
                    {{ ticker }}
                </button>
            </div>
        </div>
    `,
})
export class BlotterPanelComponent {
    @Input() api!: DockviewPanelApi;
    @Input() containerApi!: DockviewApi;

    tickers = TICKERS;

    broadcast(ticker: string) {
        this.containerApi.channels.broadcast(this.api.id, { ticker });
    }
}

/** Listens on whichever channel the user put this panel on. */
@Component({
    selector: 'chart-panel',
    template: `
        <div class="example-panel">
            <h2 *ngIf="ticker">{{ ticker }}</h2>
            <p *ngIf="!ticker">Waiting for context.</p>
        </div>
    `,
})
export class ChartPanelComponent implements OnDestroy {
    @Input() set containerApi(value: DockviewApi) {
        this._containerApi = value;
        this.subscribe();
    }
    @Input() set api(value: DockviewPanelApi) {
        this._api = value;
        this.subscribe();
    }

    ticker: string | undefined;

    private _api: DockviewPanelApi | undefined;
    private _containerApi: DockviewApi | undefined;
    private disposable: { dispose(): void } | undefined;

    private subscribe() {
        if (!this._api || !this._containerApi || this.disposable) {
            return;
        }
        this.disposable = this._containerApi.channels.addContextListener(
            this._api.id,
            (context) => {
                this.ticker = (context as Instrument).ticker;
            }
        );
    }

    ngOnDestroy() {
        this.disposable?.dispose();
    }
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <span>Use the coloured dot on each tab to change a panel's channel.</span>
            </div>
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [channels]="{ enabled: true }"
                    className="${
                        (window as any).__dockviewThemeClass ??
                        'dockview-theme-abyss'
                    }"
                    (ready)="onReady($event)">
                </dv-dockview>
            </div>
        </div>
    `,
})
export class AppComponent {
    components: Record<string, Type<any>> = {
        blotter: BlotterPanelComponent,
        chart: ChartPanelComponent,
    };

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;

        api.addPanel({ id: 'blotter', component: 'blotter', title: 'Blotter' });
        api.addPanel({
            id: 'chart-1',
            component: 'chart',
            title: 'Chart 1',
            position: { direction: 'right' },
        });
        api.addPanel({
            id: 'chart-2',
            component: 'chart',
            title: 'Chart 2',
            position: { direction: 'below' },
        });

        // Start the blotter and the first chart linked, so the example does
        // something on the first click. Chart 2 is left unlinked on purpose.
        api.channels.setChannel('blotter', 'red');
        api.channels.setChannel('chart-1', 'red');
    }
}

@NgModule({
    declarations: [AppComponent, BlotterPanelComponent, ChartPanelComponent],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
