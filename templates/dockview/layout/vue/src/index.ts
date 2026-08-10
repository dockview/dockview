import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewApi,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-vue';

function loadDefaultLayout(api: DockviewApi) {
    api.addPanel({
        id: 'panel_1',
        component: 'default',
        title: 'Panel 1',
    });

    api.addPanel({
        id: 'panel_2',
        component: 'default',
        title: 'Panel 2',
    });

    api.addPanel({
        id: 'panel_3',
        component: 'default',
        title: 'Panel 3',
    });
}

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
            title: '',
        };
    },
    mounted() {
        this.title = this.params.api.title ?? '';
    },
    template: `
      <div class="example-panel">{{title}}</div>`,
});

const Watermark = defineComponent({
    name: 'Watermark',
    template: `
      <div class="example-panel">This group is empty.</div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
        watermark: Watermark,
    },
    data() {
        return {
            api: null as DockviewApi | null,
        };
    },
    methods: {
        clearLayout() {
            localStorage.removeItem('dockview_persistence_layout');
            if (this.api) {
                this.api.clear();
                loadDefaultLayout(this.api);
            }
        },
        onReady(event: DockviewReadyEvent) {
            const layoutString = localStorage.getItem(
                'dockview_persistence_layout'
            );

            let success = false;

            if (layoutString) {
                try {
                    const layout = JSON.parse(layoutString);
                    event.api.fromJSON(layout);
                    success = true;
                } catch (err) {
                    console.error(err);
                }
            }

            if (!success) {
                loadDefaultLayout(event.api);
            }

            this.api = event.api;
        },
    },
    watch: {
        api(newValue: DockviewApi | null) {
            if (!newValue) {
                return;
            }

            newValue.onDidLayoutChange(() => {
                const layout = newValue.toJSON();

                localStorage.setItem(
                    'dockview_persistence_layout',
                    JSON.stringify(layout)
                );
            });
        },
    },
    template: `
      <div class="example-layout">
        <div class="example-controls">
          <button @click="clearLayout">Reset Layout</button>
        </div>
        <dockview-vue
          class="example-dock"
          className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
          watermarkComponent="watermark"
          @ready="onReady"
        >
        </dockview-vue>
      </div>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
