import { LicenseManager } from 'dockview-enterprise';
import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';

import {
    DockviewVue,
    DockviewApi,
    DockviewReadyEvent,
    DockviewScreen,
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
            disposable: undefined as { dispose(): void } | undefined,
        };
    },
    mounted() {
        this.disposable = this.params.api.onDidTitleChange(() => {
            this.title = this.params.api.title;
        });
        this.title = this.params.api.title;
    },
    unmounted() {
        this.disposable?.dispose();
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
    data() {
        return {
            api: undefined as DockviewApi | undefined,
            screens: [] as readonly DockviewScreen[],
            target: 0,
            status: '',
        };
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            this.api = event.api;

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
                position: { direction: 'right' },
            });

            this.screens = event.api.screens;
            event.api.onDidChangeScreens((e) => {
                this.screens = e.screens;
                this.refreshStatus();
            });
            this.refreshStatus();
        },
        refreshStatus() {
            const api = this.api;
            if (!api) {
                return;
            }
            if (!api.hasWindowManagement) {
                this.status =
                    'Window Management API unavailable: single screen';
                return;
            }
            void api.getWindowManagementPermission().then((state) => {
                this.status = `permission: ${state}, screens: ${api.screens.length}`;
            });
        },
        screenLabel(screen: DockviewScreen, index: number) {
            const flags = [
                screen.isPrimary ? 'primary' : '',
                screen.isCurrent ? 'current' : '',
            ]
                .filter(Boolean)
                .join(', ');
            return `${index}: ${screen.label || 'screen'}${
                flags ? ` (${flags})` : ''
            }`;
        },
        listScreens() {
            const api = this.api;
            if (!api) {
                return;
            }
            // May show the permission prompt, so it runs inside the click.
            void api.getScreens().then((screens) => {
                this.screens = screens;
                this.refreshStatus();
            });
        },
        popoutThere() {
            const api = this.api;
            const group = api?.activeGroup;
            if (!api || !group) {
                return;
            }
            void api.addPopoutGroup(group, {
                popoutUrl: '/popout/index.html',
                screen: Number(this.target) || 0,
            });
        },
        moveThere() {
            const group = this.api?.activeGroup;
            if (group?.api.location.type !== 'popout') {
                this.status = 'activate a popout group first';
                return;
            }
            void group.api.moveToScreen(Number(this.target) || 0);
        },
    },
    template: `
      <div class="example-layout">
        <div class="example-controls">
          <button @click="listScreens">List screens</button>
          <select v-model="target">
            <option v-for="(screen, index) in screens" :key="screen.id" :value="index">
              {{screenLabel(screen, index)}}
            </option>
          </select>
          <button @click="popoutThere">Popout there</button>
          <button @click="moveThere">Move popout there</button>
          <span>{{status}}</span>
        </div>
        <dockview-vue
          class="example-dock"
          className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
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
