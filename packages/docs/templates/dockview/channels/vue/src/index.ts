import { createApp, ref, onUnmounted, defineComponent, PropType } from 'vue';
import {
    DockviewVue,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-vue';
import 'dockview-vue/dist/styles/dockview.css';

const TICKERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];

interface Instrument {
    ticker: string;
}

/** Broadcasts onto whichever channel the user put this panel on. */
const BlotterPanel = defineComponent({
    name: 'BlotterPanel',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelProps>,
            required: true,
        },
    },
    setup(props) {
        const tickers = TICKERS;

        const broadcast = (ticker: string) => {
            props.params.containerApi.channels.broadcast(props.params.api.id, {
                ticker,
            });
        };

        return { tickers, broadcast };
    },
    template: `
        <div class="example-panel">
            <p>Click a ticker to broadcast it.</p>
            <div>
                <button v-for="ticker in tickers" :key="ticker" @click="broadcast(ticker)">
                    {{ ticker }}
                </button>
            </div>
        </div>
    `,
});

/** Listens on whichever channel the user put this panel on. */
const ChartPanel = defineComponent({
    name: 'ChartPanel',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelProps>,
            required: true,
        },
    },
    setup(props) {
        const ticker = ref<string | undefined>(undefined);

        const disposable = props.params.containerApi.channels.addContextListener(
            props.params.api.id,
            (context) => {
                ticker.value = (context as Instrument).ticker;
            }
        );

        onUnmounted(() => disposable.dispose());

        return { ticker };
    },
    template: `
        <div class="example-panel">
            <h2 v-if="ticker">{{ ticker }}</h2>
            <p v-else>Waiting for context.</p>
        </div>
    `,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        blotter: BlotterPanel,
        chart: ChartPanel,
    },
    setup() {
        const onReady = (event: DockviewReadyEvent) => {
            event.api.addPanel({
                id: 'blotter',
                component: 'blotter',
                title: 'Blotter',
            });
            event.api.addPanel({
                id: 'chart-1',
                component: 'chart',
                title: 'Chart 1',
                position: { direction: 'right' },
            });
            event.api.addPanel({
                id: 'chart-2',
                component: 'chart',
                title: 'Chart 2',
                position: { direction: 'below' },
            });

            // Start the blotter and the first chart linked, so the example
            // does something on the first click. Chart 2 is left unlinked.
            event.api.channels.setChannel('blotter', 'red');
            event.api.channels.setChannel('chart-1', 'red');
        };

        const themeClass =
            (window as any).__dockviewThemeClass ?? 'dockview-theme-abyss';

        return { onReady, themeClass };
    },
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <span>Use the coloured dot on each tab to change a panel's channel.</span>
            </div>
            <dockview-vue
                style="height: 100%"
                :class="themeClass"
                :channels="{ enabled: true }"
                @ready="onReady"
            />
        </div>
    `,
});

createApp(App).mount('#app');
