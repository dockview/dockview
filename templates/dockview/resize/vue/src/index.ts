import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-vue';
import './resize.css';

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
            width: 100,
            height: 100,
        };
    },
    methods: {
        onResizeGroupWidth() {
            this.params.api.group.api.setSize({ width: this.width });
        },
        onResizePanelWidth() {
            this.params.api.setSize({ width: this.width });
        },
        onResizeGroupHeight() {
            this.params.api.group.api.setSize({ height: this.height });
        },
        onResizePanelHeight() {
            this.params.api.setSize({ height: this.height });
        },
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
    <div class="resize-panel">
      <div class="resize-title">{{title}}</div>
      <div class="resize-control">
        <span>Width:</span>
        <input v-model.number="width" type="number" min="50" step="1"></input>
        <button @click="onResizeGroupWidth">Resize Group</button>
        <button @click="onResizePanelWidth">Resize Panel</button>
      </div>
      <div class="resize-control">
        <span>Height:</span>
        <input v-model.number="height" type="number" min="50" step="1"></input>
        <button @click="onResizeGroupHeight">Resize Group</button>
        <button @click="onResizePanelHeight">Resize Panel</button>
      </div>
    </div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            event.api.addPanel({
                id: 'panel_1',
                component: 'default',
                title: 'Panel 1',
            });
            event.api.addPanel({
                id: 'panel_2',
                component: 'default',
                title: 'Panel 2',
                position: {
                    direction: 'right',
                    referencePanel: 'panel_1',
                },
            });
            event.api.addPanel({
                id: 'panel_3',
                component: 'default',
                title: 'Panel 3',
                position: {
                    direction: 'below',
                    referencePanel: 'panel_1',
                },
            });
            event.api.addPanel({
                id: 'panel_4',
                component: 'default',
                title: 'Panel 4',
            });
            event.api.addPanel({
                id: 'panel_5',
                component: 'default',
                title: 'Panel 5',
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
