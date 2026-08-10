import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';

import {
    DockviewVue,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-vue';

const IframePanel = defineComponent({
    name: 'IframePanel',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelProps>,
            required: true,
        },
    },
    data() {
        return {
            enabled: false,
            disposable: undefined as { dispose(): void } | undefined,
        };
    },
    mounted() {
        this.enabled = this.params.api.isActive;
        // Disable pointer events on the iframe while the panel is inactive so
        // that it doesn't swallow drag interactions used to move the panel.
        this.disposable = this.params.api.onDidActiveChange((event) => {
            this.enabled = event.isActive;
        });
    },
    unmounted() {
        this.disposable?.dispose();
    },
    computed: {
        style(): Record<string, string> {
            return {
                width: '100%',
                height: '100%',
                pointerEvents: this.enabled ? 'inherit' : 'none',
            };
        },
    },
    template: `
      <iframe
        :style="style"
        src="https://dockview.dev"
      ></iframe>`,
});

const BasicPanel = defineComponent({
    name: 'BasicPanel',
    template: `
      <div class="example-panel">
        This panel is just a usual component.
      </div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        iframeComponent: IframePanel,
        basicComponent: BasicPanel,
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            // The iframe panels use `renderer: 'always'` so the panel (and
            // therefore the iframe) is never removed from the DOM when it
            // becomes inactive. This prevents the iframe from reloading as
            // panels are moved or re-parented.
            event.api.addPanel({
                id: 'panel_1',
                component: 'iframeComponent',
                renderer: 'always',
            });

            event.api.addPanel({
                id: 'panel_2',
                component: 'iframeComponent',
                renderer: 'always',
            });

            event.api.addPanel({
                id: 'panel_3',
                component: 'basicComponent',
            });
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        @ready="onReady"
      >
      </dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
