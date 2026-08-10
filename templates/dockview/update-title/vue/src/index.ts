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
            value: '',
            title: '',
        };
    },
    methods: {
        onChangeTitle() {
            this.params.api.setTitle(this.value);
        },
        updateTitle(title: string) {
            this.title = title;
        },
    },
    mounted() {
        const disposable = this.api.onDidTitleChange(() => {
            this.title = this.api.title;
        });
        this.title = this.api.title;

        return () => {
            disposable.dispose();
        };
    },

    template: `
    <div class="example-panel">
      <div style="margin-bottom:8px">
        <span>Current title: </span>
        <span>{{ title }}</span>
      </div>
      <div class="example-controls">
        <label>New title <input v-model="value"/></label>
        <button @click="onChangeTitle">Set title</button>
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
            const panel = event.api.addPanel({
                id: 'panel_1',
                component: 'default',
                title: 'Panel 1',
            });

            event.api.addPanel({
                id: 'panel_2',
                component: 'default',
                title: 'Panel 2',
                position: { referencePanel: panel },
            });

            const panel3 = event.api.addPanel({
                id: 'panel_3',
                component: 'default',
                title: 'Panel 3',

                position: { referencePanel: panel, direction: 'right' },
            });

            event.api.addPanel({
                id: 'panel_4',
                component: 'default',
                title: 'Panel 4',
                position: { referencePanel: panel3 },
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
