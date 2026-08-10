import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewReadyEvent,
    IDockviewHeaderActionsProps,
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
            this.title = this.params.api.title;
        });
        this.title = this.params.api.title;

        return () => {
            disposable.dispose();
        };
    },
    template: `
    <div class="example-panel">
      {{title}}
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
    data() {
        return {
            collapsed: this.params.api.isCollapsed(),
        };
    },
    computed: {
        isEdge(): boolean {
            return this.params.location?.type === 'edge';
        },
    },
    methods: {
        onClick() {
            if (this.collapsed) {
                this.params.api.expand();
            } else {
                this.params.api.collapse();
            }
        },
    },
    mounted() {
        const disposable = this.params.api.onDidCollapsedChange((event) => {
            this.collapsed = event.isCollapsed;
        });

        return () => {
            disposable.dispose();
        };
    },
    template: `
      <button
        v-if="isEdge"
        :title="collapsed ? 'Expand group' : 'Collapse group'"
        :aria-label="collapsed ? 'Expand group' : 'Collapse group'"
        style="cursor:pointer;background:none;border:none;color:inherit;padding:0 4px;"
        @click="onClick"
      >{{ collapsed ? '+' : '-' }}</button>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        panel: Panel,
        rightAction: RightAction,
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            event.api.addEdgeGroup('left', {
                id: 'left',
                initialSize: 220,
                minimumSize: 150,
            });

            event.api.addEdgeGroup('bottom', {
                id: 'bottom',
                initialSize: 180,
                minimumSize: 100,
            });

            event.api.addEdgeGroup('right', {
                id: 'right',
                initialSize: 220,
                minimumSize: 150,
                collapsed: true,
            });

            event.api.addPanel({
                id: 'explorer',
                component: 'panel',
                title: 'Explorer',
                position: { referenceGroup: 'left' },
            });

            event.api.addPanel({
                id: 'search',
                component: 'panel',
                title: 'Search',
                position: { referenceGroup: 'left' },
            });

            event.api.addPanel({
                id: 'terminal',
                component: 'panel',
                title: 'Terminal',
                position: { referenceGroup: 'bottom' },
            });

            event.api.addPanel({
                id: 'output',
                component: 'panel',
                title: 'Output',
                position: { referenceGroup: 'bottom' },
            });

            event.api.addPanel({
                id: 'outline',
                component: 'panel',
                title: 'Outline',
                position: { referenceGroup: 'right' },
            });

            event.api.addPanel({
                id: 'panel_1',
                component: 'panel',
                title: 'Editor',
            });

            event.api.addPanel({
                id: 'panel_2',
                component: 'panel',
                title: 'Preview',
                position: { direction: 'right', referencePanel: 'panel_1' },
            });
        },
    },
    template: `
      <dockview-vue
        style="width:100%; height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        @ready="onReady"
        rightHeaderActionsComponent="rightAction"
      >
      </dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
