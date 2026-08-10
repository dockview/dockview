import { LicenseManager } from 'dockview-enterprise';
import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewReadyEvent,
    IDockviewPanelProps,
    themeAbyss,
    themeLight,
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

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        panel: Panel,
    },
    data() {
        return {
            theme: {
                ...((window as any).__dockviewColorMode === 'light'
                    ? themeLight
                    : themeAbyss),
                tabAnimation: 'smooth' as const,
            },
            getTabGroupChipContextMenuItems: () =>
                ['rename', 'colorPicker', 'collapse', 'close'] as const,
        };
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            const titles = [
                'Dashboard',
                'Settings',
                'Users',
                'Analytics',
                'Reports',
                'Billing',
                'Notifications',
                'Logs',
            ];

            const first = event.api.addPanel({
                id: 'panel_1',
                component: 'panel',
                title: titles[0],
            });
            for (let i = 1; i < titles.length; i++) {
                event.api.addPanel({
                    id: `panel_${i + 1}`,
                    component: 'panel',
                    title: titles[i],
                });
            }

            const groupId = first.group.id;

            const featureGroup = event.api.createTabGroup({
                groupId,
                label: 'Feature',
                color: 'blue',
            });
            ['panel_1', 'panel_2', 'panel_3', 'panel_4'].forEach((panelId) => {
                event.api.addPanelToTabGroup({
                    groupId,
                    tabGroupId: featureGroup.id,
                    panelId,
                });
            });

            const monitoringGroup = event.api.createTabGroup({
                groupId,
                label: 'Monitoring',
                color: 'purple',
            });
            ['panel_5', 'panel_7', 'panel_8'].forEach((panelId) => {
                event.api.addPanelToTabGroup({
                    groupId,
                    tabGroupId: monitoringGroup.id,
                    panelId,
                });
            });
            monitoringGroup.collapse();
        },
    },
    template: `
      <dockview-vue
        style="width:100%; height:100%"
        :theme="theme"
        :disableFloatingGroups="true"
        :getTabGroupChipContextMenuItems="getTabGroupChipContextMenuItems"
        @ready="onReady"
      >
      </dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
