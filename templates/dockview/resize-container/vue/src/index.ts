import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewReadyEvent,
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
            title: '',
        };
    },
    mounted() {
        const disposable = this.params.api.onDidTitleChange(() => {
            this.title = this.api.title;
        });
        this.title = this.api.title;

        return () => {
            disposable.dispose();
        };
    },
    template: `
    <div class="example-panel">
      <div>{{title}}</div>
    </div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
    },
    data() {
        return {
            value: 50,
        };
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            const panel = event.api.addPanel({
                id: 'panel_1',
                component: 'default',
                params: {
                    title: 'Panel 1',
                },
            });

            panel.group.locked = true;
            panel.group.header.hidden = true;

            event.api.addPanel({
                id: 'panel_2',
                component: 'default',
                params: {
                    title: 'Panel 2',
                },
            });

            event.api.addPanel({
                id: 'panel_3',
                component: 'default',
                params: {
                    title: 'Panel 3',
                },
            });

            event.api.addPanel({
                id: 'panel_4',
                component: 'default',
                params: {
                    title: 'Panel 4',
                },
                position: { referencePanel: 'panel_1', direction: 'right' },
            });

            event.api.addPanel({
                id: 'panel_5',
                component: 'default',
                params: {
                    title: 'Panel 5',
                },
                position: { referencePanel: 'panel_3', direction: 'right' },
            });

            event.api.addPanel({
                id: 'panel_6',
                component: 'default',
                params: {
                    title: 'Panel 6',
                },
                position: { referencePanel: 'panel_5', direction: 'below' },
            });

            event.api.addPanel({
                id: 'panel_7',
                component: 'default',
                params: {
                    title: 'Panel 7',
                },
                position: { referencePanel: 'panel_6', direction: 'right' },
            });
        },
    },
    computed: {
        styleObject() {
            return {
                height: `${this.value}%`,
                width: `${this.value}%`,
            };
        },
    },
    template: `
      <div class="example-layout">
        <div class="example-controls">
          <label>Scale: <input v-model.number="value" type="range" min="1" max="100"></input> {{value}}%</label>
        </div>
        <div class="example-dock">
          <div :style="styleObject">
            <dockview-vue
              style="width:100%;height:100%"
              className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
              @ready="onReady"
              :disableFloatingGroups=true
            ></dockview-vue>
          </div>
        </div>
      </div>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
