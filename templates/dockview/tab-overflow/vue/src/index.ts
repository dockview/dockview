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
            // Bound to `:overflow` below, so flipping it re-applies the option
            // through the Vue wrapper without a manual `updateOptions` call.
            mode: 'wrap' as 'wrap' | 'dropdown',
            // A vertical header plus wrap mode makes the tabs wrap into columns.
            vertical: false,
        };
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            this.api = event.api;
            panelCount = 0;

            // Open enough panels in a single group that the tabs no longer fit
            // on one row.
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
            // Keep the newly added tabs on the current header orientation.
            this.applyOrientation();
        },
        applyOrientation() {
            this.api?.groups.forEach((group) =>
                group.api.setHeaderPosition(this.vertical ? 'left' : 'top')
            );
        },
        toggleMode() {
            this.mode = this.mode === 'wrap' ? 'dropdown' : 'wrap';
        },
        toggleVertical() {
            this.vertical = !this.vertical;
            this.applyOrientation();
        },
        getTabContextMenuItems() {
            // Pin/Unpin is auto-prepended by the `pinnedTabs` option, so we only
            // return our own custom items here.
            return [
                {
                    label:
                        this.mode === 'wrap'
                            ? 'Switch to dropdown mode'
                            : 'Switch to wrap mode',
                    action: () => this.toggleMode(),
                },
                {
                    label: this.vertical
                        ? 'Horizontal header'
                        : 'Vertical header',
                    action: () => this.toggleVertical(),
                },
            ];
        },
    },
    template: `
      <div class="example-layout">
        <div class="example-controls">
          <button @click="addPanel">Add Tab</button>
          <button @click="toggleMode">
            {{ mode === 'wrap' ? 'Switch to dropdown mode' : 'Switch to wrap mode' }}
          </button>
          <button @click="toggleVertical">
            {{ vertical ? 'Horizontal header' : 'Vertical header' }}
          </button>
        </div>
        <dockview-vue
          class="example-dock"
          className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
          :overflow="{ mode }"
          :pinnedTabs="{ enabled: true }"
          :getTabContextMenuItems="getTabContextMenuItems"
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
