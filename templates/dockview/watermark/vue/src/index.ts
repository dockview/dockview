import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewApi,
    DockviewReadyEvent,
    IDockviewPanelProps,
    IWatermarkPanelProps,
    Orientation,
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
            this.title = this.params.api.title;
        });
        this.title = this.params.api.title;

        return () => {
            disposable.dispose();
        };
    },
    template: `
    <div class="example-panel">{{ title }}</div>`,
});

const WatermarkPanel = defineComponent({
    name: 'Panel',
    props: {
        params: {
            type: Object as PropType<IWatermarkPanelProps>,
            required: true,
        },
    },
    setup(props) {
        return { isGroup: props.params.containerApi.groups.length > 0 };
    },
    methods: {
        onAddNewPanel() {
            this.params.containerApi.addPanel({
                id: Date.now().toString(),
                component: 'default',
            });
        },
        onCloseGroup() {
            this.params.group?.api.close();
        },
    },
    template: `
      <div style="height:100%;display:flex;justify-content:center;align-items:center;">
        <div>
          <p>This is a custom watermark. You can change this content.</p>
          <div class="example-controls">
            <button @click="onAddNewPanel">Add New Panel</button>
            <button v-if="isGroup" @click="onCloseGroup">Close Group</button>
          </div>
        </div>
      </div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
        watermarkComponent: WatermarkPanel,
    },
    data() {
        return {
            api: null as DockviewApi | null,
        };
    },
    methods: {
        onClick() {
            if (!this.api) {
                return;
            }

            this.api.addGroup();
        },
        onReady(event: DockviewReadyEvent) {
            this.api = event.api;
            event.api.fromJSON({
                grid: {
                    orientation: Orientation.HORIZONTAL,
                    root: { type: 'branch', data: [] },
                    height: 100,
                    width: 100,
                },
                panels: {},
            });
        },
    },
    template: `
      <div class="example-layout">
        <div class="example-controls">
          <button @click="onClick">Add Empty Group</button>
        </div>
        <div class="example-dock">
          <dockview-vue
            style="width:100%;height:100%"
            className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
            @ready="onReady"
            watermarkComponent="watermarkComponent"
          ></dockview-vue>
        </div>
      </div>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
