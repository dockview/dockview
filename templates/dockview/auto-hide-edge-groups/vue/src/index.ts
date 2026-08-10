import { LicenseManager } from 'dockview-enterprise';
import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';

import {
    DockviewVue,
    DockviewReadyEvent,
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

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            const api = event.api;

            // some regular grid panels to peek over
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

            // a left edge group with a couple of tool windows
            api.addEdgeGroup('left', {
                id: 'left-edge',
                initialSize: 240,
                minimumSize: 150,
            });
            api.addPanel({
                id: 'explorer',
                component: 'default',
                title: 'Explorer',
                position: { referenceGroup: 'left-edge' },
            });
            api.addPanel({
                id: 'search',
                component: 'default',
                title: 'Search',
                position: { referenceGroup: 'left-edge' },
            });

            // a bottom edge group
            api.addEdgeGroup('bottom', {
                id: 'bottom-edge',
                initialSize: 200,
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

            // auto-hide both edge groups to their strips; click a tab to peek
            api.autoHideEdgeGroup('left');
            api.autoHideEdgeGroup('bottom');
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        :autoHideEdgeGroups="true"
        @ready="onReady"
      >
      </dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
