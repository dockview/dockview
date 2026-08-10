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
    template: `<div class="example-panel">{{ title }}</div>`,
});

const InnerDockview = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            event.api.addPanel({
                id: 'inner_panel_1',
                component: 'default',
                title: 'Inner 1',
            });

            event.api.addPanel({
                id: 'inner_panel_2',
                component: 'default',
                title: 'Inner 2',
            });

            event.api.addPanel({
                id: 'inner_panel_3',
                component: 'default',
                title: 'Inner 3',
            });
        },
    },
    template: `
    <dockview-vue
      style="width:100%;height:100%"
      class="nested-dockview"
      @ready="onReady"
    ></dockview-vue>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
        innerDockview: InnerDockview,
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
            });

            event.api.addPanel({
                id: 'panel_3',
                component: 'innerDockview',
                title: 'Nested layout',
                position: { referencePanel: 'panel_2', direction: 'right' },
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
