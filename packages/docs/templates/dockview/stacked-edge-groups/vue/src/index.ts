import { LicenseManager } from 'dockview-enterprise';
import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';

import {
    DockviewVue,
    DockviewReadyEvent,
    IDockviewHeaderActionsProps,
    IDockviewPanelProps,
} from 'dockview-vue';

// dockview.dev docs license key. Replace with your own key in production.
LicenseManager.setLicenseKey(
    '[KeyId:DOCKVIEW-DOCS]_[Company:Dockview]_[Plan:team]_[AppName:Dockview_Docs]_[Email:enterprise@dockview.dev]_[ValidFrom:01_Jan_2025]_[ValidUntil:01_Jan_2099]__aaa294ecec1eed47'
);

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

// A collapse/expand toggle for each group stacked on an edge.
const RightActions = defineComponent({
    name: 'RightActions',
    props: {
        params: {
            type: Object as PropType<IDockviewHeaderActionsProps>,
            required: true,
        },
    },
    data() {
        return {
            collapsed: false,
            isEdge: false,
        };
    },
    mounted() {
        this.isEdge = this.params.location?.type === 'edge';
        this.collapsed = this.params.api.isCollapsed();
        const disposable = this.params.api.onDidCollapsedChange((event) => {
            this.collapsed = event.isCollapsed;
        });
        return () => {
            disposable.dispose();
        };
    },
    methods: {
        toggle() {
            if (this.collapsed) {
                this.params.api.expand();
            } else {
                this.params.api.collapse();
            }
        },
    },
    template: `
      <button
        v-if="isEdge"
        :title="collapsed ? 'Expand group' : 'Collapse group'"
        :aria-label="collapsed ? 'Expand group' : 'Collapse group'"
        style="cursor:pointer;background:none;border:none;color:inherit;padding:0 4px"
        @click="toggle"
      >{{ collapsed ? '+' : '-' }}</button>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
        rightActions: RightActions,
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            const api = event.api;

            api.addPanel({
                id: 'doc_1',
                component: 'default',
                title: 'Document',
            });
            api.addPanel({
                id: 'doc_2',
                component: 'default',
                title: 'Preview',
                position: { direction: 'right', referencePanel: 'doc_1' },
            });

            // the left edge: two groups stacked top to bottom
            api.addEdgeGroup('left', {
                id: 'explorer',
                initialSize: 240,
                minimumSize: 150,
            });
            api.addPanel({
                id: 'files',
                component: 'default',
                title: 'Files',
                position: { referenceGroup: 'explorer' },
            });
            api.addPanel({
                id: 'search',
                component: 'default',
                title: 'Search',
                position: { referenceGroup: 'explorer' },
            });

            // joins the left edge below the first group, taking half of its height
            api.addEdgeGroup('left', {
                id: 'outline',
                stack: { relativeTo: 'explorer', placement: 'after' },
            });
            api.addPanel({
                id: 'outline-panel',
                component: 'default',
                title: 'Outline',
                position: { referenceGroup: 'outline' },
            });

            // the bottom edge: a single group, as before
            api.addEdgeGroup('bottom', {
                id: 'bottom-edge',
                initialSize: 180,
                minimumSize: 100,
            });
            api.addPanel({
                id: 'output',
                component: 'default',
                title: 'Output',
                position: { referenceGroup: 'bottom-edge' },
            });
            api.addPanel({
                id: 'problems',
                component: 'default',
                title: 'Problems',
                position: { referenceGroup: 'bottom-edge' },
            });

            // drag a tab onto the top or bottom half of a left edge group to
            // open it in a new group stacked there
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        :stackedEdgeGroups="true"
        rightHeaderActionsComponent="rightActions"
        @ready="onReady"
      >
      </dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
