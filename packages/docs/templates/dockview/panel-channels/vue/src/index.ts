import { LicenseManager } from 'dockview-enterprise';
import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';

import {
    DockviewVue,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-vue';

// dockview.dev docs license key. Replace with your own key in production.
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

const INSTRUMENTS = ['AAPL', 'MSFT', 'GOOG', 'AMZN'];

// Broadcasts the clicked instrument to the other panels on its channel.
const Tickers = defineComponent({
    name: 'Tickers',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelProps>,
            required: true,
        },
    },
    data() {
        return { instruments: INSTRUMENTS };
    },
    methods: {
        select(id: string) {
            this.params.api.broadcast({ type: 'instrument', id });
        },
    },
    template: `
      <div class="example-panel">
        <p>Click an instrument to broadcast it on this panel's channel.</p>
        <button
          v-for="id in instruments"
          :key="id"
          style="display:block;margin:4px 0"
          @click="select(id)"
        >{{ id }}</button>
      </div>`,
});

// Renders whatever instrument was last broadcast on its channel.
const Details = defineComponent({
    name: 'Details',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelProps>,
            required: true,
        },
    },
    data() {
        return {
            title: '',
            selected: undefined as unknown,
            disposable: undefined as { dispose(): void } | undefined,
        };
    },
    mounted() {
        this.title = this.params.api.title ?? '';
        this.selected = this.params.api.getCurrentContext()?.id;
        this.disposable = this.params.api.onDidReceiveContext((event) => {
            this.selected = event.context.id;
        });
    },
    beforeUnmount() {
        this.disposable?.dispose();
    },
    template: `
      <div class="example-panel">
        {{ selected === undefined ? title + ': nothing selected yet' : title + ': showing ' + selected }}
      </div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        tickers: Tickers,
        details: Details,
    },
    data() {
        return {
            // Enable linked panels: each panel may join one colour channel.
            panelChannels: { enabled: true },
        };
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            const tickers = event.api.addPanel({
                id: 'tickers',
                component: 'tickers',
                title: 'Tickers',
            });
            const chart = event.api.addPanel({
                id: 'chart',
                component: 'details',
                title: 'Chart',
                position: { direction: 'right' },
            });
            event.api.addPanel({
                id: 'news',
                component: 'details',
                title: 'News',
                position: { referencePanel: 'chart', direction: 'below' },
            });

            // Link the ticker list and the chart on Red. News starts
            // unlinked: right-click its tab and pick Red to wire it in.
            tickers.api.joinChannel('red');
            chart.api.joinChannel('red');
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        :panelChannels="panelChannels"
        @ready="onReady"
      >
      </dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
