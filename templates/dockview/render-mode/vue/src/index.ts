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
            renderer: null,
        };
    },
    methods: {
        onToggleRenderMode() {
            this.params.api.setRenderer(
                this.params.api.renderer === 'onlyWhenVisible'
                    ? 'always'
                    : 'onlyWhenVisible'
            );
        },
    },
    mounted() {
        const disposable = this.params.api.onDidTitleChange(() => {
            this.title = this.api.title;
        });
        const disposable2 = this.params.api.onDidRendererChange((event) => {
            this.renderer = event.renderer;
        });

        this.title = this.api.title;
        this.renderer = this.api.renderer;

        return () => {
            disposable.dispose();
            disposable2.dispose();
        };
    },
    template: `
    <div style="height:100%;overflow:auto;">
      <div style="height:1000px;padding:20px;overflow:auto;">
        <div>{{title}}</div>
        <div>
          {{renderer}}
          <button @click="onToggleRenderMode">Toggle render mode</button>
        </div>
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
                position: { referencePanel: 'panel_1', direction: 'within' },
            });

            event.api.addPanel({
                id: 'panel_3',
                component: 'default',
                title: 'Panel 3',
            });

            event.api.addPanel({
                id: 'panel_4',
                component: 'default',
                title: 'Panel 4',
                position: { referencePanel: 'panel_3', direction: 'below' },
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
