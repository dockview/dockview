import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';

import {
    DockviewVue,
    DockviewReadyEvent,
    IDockviewPanelHeaderProps,
    IDockviewPanelProps,
} from 'dockview-vue';

interface CustomParams {
    title: string;
    x?: number;
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
            title: '',
            x: undefined as number | undefined,
        };
    },
    mounted() {
        this.title = this.params.params.title;
        this.x = this.params.params.x;
    },
    template: `
      <div style="display:flex;justify-content:center;align-items:center;height:100%;">
        <span>{{title}}</span>
        <span v-if="x">&nbsp;&nbsp;{{x}}</span>
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
            title: '',
        };
    },
    mounted() {
        this.title = this.params.params.title;
    },
    template: `
      <div
        class="my-custom-tab"
        style="padding:0px 8px;width:100%;display:flex;height:100%;align-items:center;background-color:var(--dv-tabs-and-actions-container-background-color);"
      >
        <span>{{title}}</span>
        <span style="flex-grow:1;"></span>
        <span class="material-symbols-outlined" style="font-size:16px;">minimize</span>
        <span class="material-symbols-outlined" style="font-size:16px;">maximize</span>
        <span class="material-symbols-outlined" style="font-size:16px;">close</span>
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
            const panel1 = event.api.addPanel({
                id: 'panel_1',
                component: 'defaultPanel',
                tabComponent: 'defaultTab',
                params: {
                    title: 'Window 1',
                },
            });
            panel1.group.locked = true;

            const panel2 = event.api.addPanel({
                id: 'panel_2',
                component: 'defaultPanel',
                tabComponent: 'defaultTab',
                params: {
                    title: 'Window 2',
                },
                position: {
                    direction: 'right',
                },
            });
            panel2.group.locked = true;

            const panel3 = event.api.addPanel({
                id: 'panel_3',
                component: 'defaultPanel',
                tabComponent: 'defaultTab',
                params: {
                    title: 'Window 3',
                },
                position: {
                    direction: 'below',
                },
            });
            panel3.group.locked = true;
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        single-tab-mode="fullwidth"
        @ready="onReady"
      >
      </dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
