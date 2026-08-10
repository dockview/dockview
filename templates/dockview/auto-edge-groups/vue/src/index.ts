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

            api.addPanel({
                id: 'about',
                component: 'default',
                title: 'Drag any tab to the far edge of the layout to dock it as an edge group (a green line marks the edge-group drop zone). Remove the last panel from an edge and it disappears to zero footprint; drag one back to reveal it again.',
            });
            api.addPanel({
                id: 'doc_1',
                component: 'default',
                title: 'Document',
                position: { direction: 'right', referencePanel: 'about' },
            });
            api.addPanel({
                id: 'doc_2',
                component: 'default',
                title: 'Preview',
                position: { direction: 'below', referencePanel: 'doc_1' },
            });
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        :dockToEdgeGroups="true"
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
