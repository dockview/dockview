import { LicenseManager } from 'dockview-enterprise';
import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';

import {
    DockviewVue,
    DockviewApi,
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

let panelCount = 0;

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
    },
    data() {
        return {
            api: undefined as DockviewApi | undefined,
        };
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            this.api = event.api;
            panelCount = 0;

            // Open enough panels in a single group that the tabs overflow behind
            // the chevron dropdown.
            for (let i = 0; i < 12; i++) {
                this.addPanel();
            }
        },
        addPanel() {
            this.api?.addPanel({
                id: `panel_${++panelCount}`,
                component: 'default',
                title: `Panel ${panelCount}`,
            });
        },
    },
    // The `overflow` option turns the plain chevron dropdown into a searchable,
    // most-recently-used tab switcher (the Advanced Overflow module).
    template: `
      <div class="example-layout">
        <div class="example-controls">
          <button @click="addPanel">Add Tab</button>
        </div>
        <dockview-vue
          class="example-dock"
          className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
          :overflow="{ mode: 'dropdown', search: { placeholder: 'Search tabs…' }, mru: true }"
          @ready="onReady"
        >
        </dockview-vue>
      </div>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
