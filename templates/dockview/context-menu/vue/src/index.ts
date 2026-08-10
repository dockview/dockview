import { LicenseManager } from 'dockview-enterprise';
import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewReadyEvent,
    IContextMenuItemComponentProps,
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
    template: `
      <div class="example-panel">{{ params.api.title }}</div>`,
});

/**
 * A custom context menu item rendered as a Vue component.
 * Receives panel, group, api, and close via IContextMenuItemComponentProps.
 */
const FloatMenuItem = defineComponent({
    name: 'FloatMenuItem',
    props: {
        params: {
            type: Object as PropType<IContextMenuItemComponentProps>,
            required: true,
        },
    },
    methods: {
        onClick() {
            this.params.api.addFloatingGroup(this.params.panel);
            this.params.close();
        },
    },
    template: `
      <div class="dv-context-menu-item" @click="onClick">Float tab</div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
        floatMenuItem: FloatMenuItem,
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
            });
            event.api.addPanel({
                id: 'panel_3',
                component: 'default',
                title: 'Panel 3',
            });
        },
        getTabContextMenuItems(params: any) {
            return [
                'close',
                'closeOthers',
                'closeAll',
                'closeLeft',
                'closeRight',
                'separator',
                'maximize',
                'popout',
                'separator',
                {
                    label: 'Log panel id',
                    action: () => console.log(params.panel.id),
                },
                'separator',
                // A custom component item, shown here as an alternative to the
                // built-in `'float'` shortcut.
                { component: 'floatMenuItem' },
            ];
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        @ready="onReady"
        :getTabContextMenuItems="getTabContextMenuItems"
      />`,
});

const app = createApp(App);
app.mount(document.getElementById('app')!);
