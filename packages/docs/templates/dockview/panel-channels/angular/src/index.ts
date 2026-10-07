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
} from '@angular/core';
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

const INSTRUMENTS = ['AAPL', 'MSFT', 'GOOG', 'AMZN'];

// Broadcasts the clicked instrument to the other panels on its channel.
@Component({
    selector: 'tickers-panel',
    template: `
        <div class="example-panel">
            <p>Click an instrument to broadcast it on this panel's channel.</p>
            <button
                *ngFor="let id of instruments"
                style="display: block; margin: 4px 0"
                (click)="select(id)"
            >
                {{ id }}
            </button>
        </div>
    `,
})
export class TickersPanelComponent {
    @Input() api!: DockviewPanelApi;

    instruments = INSTRUMENTS;

    select(id: string): void {
        this.api.broadcast({ type: 'instrument', id });
    }
}

// Renders whatever instrument was last broadcast on its channel.
@Component({
    selector: 'details-panel',
    template: `
        <div class="example-panel">
            {{ params?.title }}:
            {{ selected === undefined ? 'nothing selected yet' : 'showing ' + selected }}
        </div>
    `,
})
export class DetailsPanelComponent implements OnInit, OnDestroy {
    @Input() api!: DockviewPanelApi;
    @Input() params!: { title: string };

    selected: unknown;

    private disposable?: { dispose(): void };

    ngOnInit(): void {
        this.selected = this.api.getCurrentContext()?.id;
        this.disposable = this.api.onDidReceiveContext((event) => {
            this.selected = event.context.id;
        });
    }

    ngOnDestroy(): void {
        this.disposable?.dispose();
    }
}

@Component({
    selector: 'app-root',
    template: `
        <div class="example-layout">
            <div class="example-dock">
                <dv-dockview
                    [components]="components"
                    [panelChannels]="panelChannels"
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
        tickers: TickersPanelComponent,
        details: DetailsPanelComponent,
    };

    // Enable linked panels: each panel may join one colour channel.
    panelChannels = { enabled: true };

    onReady(event: DockviewReadyEvent) {
        const api: DockviewApi = event.api;

        const tickers = api.addPanel({
            id: 'tickers',
            component: 'tickers',
            title: 'Tickers',
        });
        const chart = api.addPanel({
            id: 'chart',
            component: 'details',
            title: 'Chart',
            params: { title: 'Chart' },
            position: { direction: 'right' },
        });
        api.addPanel({
            id: 'news',
            component: 'details',
            title: 'News',
            params: { title: 'News' },
            position: { referencePanel: 'chart', direction: 'below' },
        });

        // Link the ticker list and the chart on Red. News starts unlinked:
        // right-click its tab and pick Red to wire it in.
        tickers.api.joinChannel('red');
        chart.api.joinChannel('red');
    }
}

@NgModule({
    declarations: [
        AppComponent,
        TickersPanelComponent,
        DetailsPanelComponent,
    ],
    imports: [BrowserModule, DockviewAngularModule],
    bootstrap: [AppComponent],
})
export class AppModule {}

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
