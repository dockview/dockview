import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewReadyEvent,
    IDockviewPanelHeaderProps,
    IDockviewPanelProps,
} from 'dockview-vue';

const Panel = defineComponent({
    name: 'Panel',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelProps>,
            required: true,
        },
    },
    data() {
        return {
            isRunning: false,
            title: null,
            myValue: this.params.params.myValue,
        };
    },
    computed: {
        lastUpdated() {
            return new Date(this.myValue).toLocaleTimeString();
        },
    },
    methods: {
        toggle() {
            this.isRunning = !this.isRunning;
        },
    },
    mounted() {
        const disposable = this.params.api.onDidTitleChange(() => {
            this.title = this.api.title;
        });
        const disposable2 = this.params.api.onDidParametersChange(() => {
            this.myValue = this.params.params.myValue;
        });
        this.title = this.api.title;

        return () => {
            disposable.dispose();
            disposable2.dispose();
        };
    },
    watch: {
        isRunning(newValue, oldValue) {
            if (!newValue) {
                return;
            }

            const interval = setInterval(() => {
                this.params.api.updateParameters({ myValue: Date.now() });
            }, 1000);
            this.params.api.updateParameters({ myValue: Date.now() });

            return () => {
                clearInterval(interval);
            };
        },
    },
    template: `
      <div class="example-panel">
        <div style="margin-bottom:8px">{{ title }}</div>
        <div class="example-controls">
          <button @click="toggle">{{ isRunning ? 'Stop' : 'Start' }}</button>
          <span>Last updated: {{ lastUpdated }}</span>
        </div>
      </div>`,
});

const Tab = defineComponent({
    name: 'Tab',
    props: {
        params: {
            type: Object as PropType<
                IDockviewPanelHeaderProps<{ myValue: number }>
            >,
            required: true,
        },
    },
    data() {
        return {
            title: '',
            value: this.params.params.myValue,
        };
    },
    computed: {
        lastUpdated() {
            return new Date(this.value).toLocaleTimeString();
        },
    },
    mounted() {
        const disposable = this.params.api.onDidTitleChange(() => {
            this.title = this.api.title;
        });

        const disposable2 = this.params.api.onDidParametersChange(() => {
            this.value = this.params.params.myValue;
        });

        this.title = this.api.title;
        this.value = this.params.params.myValue;

        return () => {
            disposable.dispose();
            disposable2.dispose();
        };
    },
    template: `
    <div>
      <div>custom tab: {{title}}</div>
      <span>Last updated: {{ lastUpdated }}</span>
    </div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        Panel,
        defaultPanel: Panel,
        defaultTab: Tab,
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            event.api.addPanel({
                id: 'panel_1',
                component: 'defaultPanel',
                tabComponent: 'defaultTab',
                params: {
                    myValue: Date.now(),
                },
            });

            event.api.addPanel({
                id: 'panel_2',
                component: 'defaultPanel',
                tabComponent: 'defaultTab',
                params: {
                    myValue: Date.now(),
                },
            });
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        @ready="onReady"
      ></dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
