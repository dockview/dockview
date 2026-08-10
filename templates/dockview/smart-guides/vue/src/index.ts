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
      <div class="example-panel">{{ title }}</div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
    },
    data() {
        return {
            // Snap floating groups to each other (and to container edges) when
            // dragged within 8px of an alignment.
            smartGuides: { snapDistance: 8 },
        };
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            // A docked base panel to fill the container.
            event.api.addPanel({
                id: 'panel_1',
                component: 'default',
                title: 'Panel 1',
            });

            // Two floating groups so alignment + snapping is demonstrable: drag
            // one near the other (or towards a container edge) to see the guides.
            event.api.addPanel({
                id: 'float_1',
                component: 'default',
                title: 'Floating 1',
                floating: {
                    width: 220,
                    height: 140,
                    position: { top: 40, left: 60 },
                },
            });

            event.api.addPanel({
                id: 'float_2',
                component: 'default',
                title: 'Floating 2',
                floating: {
                    width: 220,
                    height: 140,
                    position: { top: 220, left: 340 },
                },
            });
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        :smartGuides="smartGuides"
        @ready="onReady"
      >
      </dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
