import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewReadyEvent,
    IDockviewPanelHeaderProps,
    IDockviewPanelProps,
} from 'dockview-vue';

interface CustomParams {
    myValue: number;
}

const Panel = defineComponent({
    name: 'Panel',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelProps<CustomParams>>,
            required: true,
        },
    },
    data() {
        return {
            running: false,
            title: '',
            myValue: this.params.params.myValue,
            interval: undefined as ReturnType<typeof setInterval> | undefined,
        };
    },
    computed: {
        lastUpdated(): string {
            return new Date(this.myValue).toLocaleTimeString();
        },
    },
    methods: {
        onClick() {
            this.running = !this.running;
        },
    },
    watch: {
        params(newValue) {
            this.myValue = newValue.params.myValue;
        },
        running(newValue) {
            if (!newValue) {
                if (this.interval) {
                    clearInterval(this.interval);
                    this.interval = undefined;
                }
                return;
            }

            this.interval = setInterval(() => {
                this.params.api.updateParameters({ myValue: Date.now() });
            }, 1000);
            this.params.api.updateParameters({ myValue: Date.now() });
        },
    },
    mounted() {
        const disposable = this.params.api.onDidTitleChange(() => {
            this.title = this.params.api.title;
        });
        this.title = this.params.api.title;

        return () => {
            disposable.dispose();
        };
    },
    template: `
    <div class="example-panel">
      <div style="margin-bottom:8px;">{{title}}</div>
      <div class="example-controls">
        <button @click="onClick">{{ running ? 'Stop' : 'Start' }}</button>
        <span>Last updated: {{ lastUpdated }}</span>
      </div>
    </div>`,
});

const Tab = defineComponent({
    name: 'Tab',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelHeaderProps<CustomParams>>,
            required: true,
        },
    },
    data() {
        return {
            myValue: this.params.params.myValue,
            title: '',
        };
    },
    computed: {
        lastUpdated(): string {
            return new Date(this.myValue).toLocaleTimeString();
        },
    },
    watch: {
        params(newValue) {
            this.myValue = newValue.params.myValue;
        },
    },
    mounted() {
        const disposable = this.params.api.onDidTitleChange(() => {
            this.title = this.params.api.title;
        });
        this.title = this.params.api.title;

        return () => {
            disposable.dispose();
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
      >
      </dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
