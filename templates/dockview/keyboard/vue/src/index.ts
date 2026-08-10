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

const shortcutStyle =
    'padding:2px 6px;border-radius:4px;border:1px solid;font-family:monospace;white-space:nowrap;';

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
            shortcutStyle,
        };
    },
    mounted() {
        this.title = this.params.api.title ?? '';
    },
    template: `
      <div class="example-panel" style="font-size:13px;">
        <div style="padding:10px 0px;">{{title}}</div>
        <div style="padding:10px 0px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
          <span :style="shortcutStyle">Ctrl+]</span>
          <span :style="shortcutStyle">Ctrl+[</span>
          <span>switch tabs</span>
          <span :style="shortcutStyle">F6</span>
          <span :style="shortcutStyle">Shift+F6</span>
          <span>move between groups</span>
          <span :style="shortcutStyle">Ctrl+M</span>
          <span>dock with the keyboard</span>
        </div>
      </div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
    },
    data() {
        return {
            // Enable the built-in enterprise keymap: Ctrl+]/Ctrl+[ to switch
            // tabs, F6/Shift+F6 to move between groups, Ctrl+M to dock.
            keyboardNavigation: true,
        };
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            // A couple of groups so F6 group-switching and Ctrl+] tab-switching
            // are both demonstrable.
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
                component: 'default',
                title: 'Panel 3',
            });
            event.api.addPanel({
                id: 'panel_4',
                component: 'default',
                title: 'Panel 4',
                position: { referencePanel: 'panel_3', direction: 'right' },
            });
            event.api.addPanel({
                id: 'panel_5',
                component: 'default',
                title: 'Panel 5',
                position: { referencePanel: 'panel_4', direction: 'within' },
            });

            event.api.getPanel('panel_1')!.api.setActive();
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        :keyboardNavigation="keyboardNavigation"
        @ready="onReady"
      >
      </dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
