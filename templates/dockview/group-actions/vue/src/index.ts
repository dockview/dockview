import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewReadyEvent,
    IDockviewHeaderActionsProps,
    IDockviewPanelProps,
} from 'dockview-vue';

const demoContainerStyle =
    'height:100%;display:flex;align-items:center;gap:8px;padding:0 8px;font-size:12px;color:var(--dv-inactivegroup-visiblepanel-tab-color, #969696);';

const LeftAction = defineComponent({
    name: 'LeftAction',
    props: {
        params: {
            type: Object as PropType<IDockviewHeaderActionsProps>,
            required: true,
        },
    },
    template: `
      <div style="${demoContainerStyle}">
        <span style="padding:0 4px;color:var(--dv-activegroup-visiblepanel-tab-color, #ffffff);font-variant-numeric:tabular-nums;">
          activePanel: {{ params.activePanel ? params.activePanel.id : 'null' }}
        </span>
      </div>`,
});

const RightAction = defineComponent({
    name: 'RightAction',
    props: {
        params: {
            type: Object as PropType<IDockviewHeaderActionsProps>,
            required: true,
        },
    },
    computed: {
        pillStyle(): Record<string, string> {
            const style: Record<string, string> = {
                padding: '1px 8px',
                borderRadius: '10px',
                backgroundColor:
                    'var(--dv-activegroup-hiddenpanel-tab-background-color, rgba(128, 128, 128, 0.15))',
                color: 'var(--dv-inactivegroup-visiblepanel-tab-color, #969696)',
                transition: 'color 0.15s ease, box-shadow 0.15s ease',
            };

            if (this.params.isGroupActive) {
                style.color =
                    'var(--dv-activegroup-visiblepanel-tab-color, #ffffff)';
                style.boxShadow =
                    'inset 0 0 0 1px var(--dv-tab-active-border-color, #4daafc)';
            }

            return style;
        },
    },
    template: `
      <div style="${demoContainerStyle}">
        <span :style="pillStyle" :data-active="params.isGroupActive">
          {{ params.isGroupActive ? 'Group active' : 'Group inactive' }}
        </span>
      </div>`,
});

const PrefixAction = defineComponent({
    name: 'PrefixAction',
    props: {
        params: {
            type: Object as PropType<IDockviewHeaderActionsProps>,
            required: true,
        },
    },
    template: `<div style="${demoContainerStyle}">🌲</div>`,
});

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
      <div class="example-panel">{{title}}</div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
        leftAction: LeftAction,
        rightAction: RightAction,
        prefixAction: PrefixAction,
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
                },
            });

            event.api.addPanel({
                id: 'panel_3',
                component: 'default',
                title: 'Panel 3',
                position: {
                    direction: 'below',
                },
            });
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        @ready="onReady"
        leftHeaderActionsComponent="leftAction"
        rightHeaderActionsComponent="rightAction"
        prefixHeaderActionsComponent="prefixAction"
      >
      </dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
