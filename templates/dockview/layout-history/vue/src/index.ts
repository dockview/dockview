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
        const disposable = this.params.api.onDidTitleChange(() => {
            this.title = this.params.api.title;
        });
        this.title = this.params.api.title;

        return () => {
            disposable.dispose();
        };
    },
    template: `
      <div class="example-panel">{{title}}</div>`,
});

let panelCount = 5;

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
    },
    data() {
        return {
            api: undefined as DockviewApi | undefined,
            canUndo: false,
            canRedo: false,
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
            });
            event.api.addPanel({
                id: 'panel_4',
                component: 'default',
                title: 'Panel 4',
                position: { direction: 'right' },
            });
            event.api.addPanel({
                id: 'panel_5',
                component: 'default',
                title: 'Panel 5',
            });

            // The seed layout shouldn't be undoable, so start with a clean history.
            event.api.clearHistory();

            this.canUndo = event.api.canUndo;
            this.canRedo = event.api.canRedo;
            event.api.onDidChangeHistory((e) => {
                this.canUndo = e.canUndo;
                this.canRedo = e.canRedo;
            });
        },
        undo() {
            this.api?.undo();
        },
        redo() {
            this.api?.redo();
        },
        addPanel() {
            this.api?.addPanel({
                id: `panel_${++panelCount}`,
                component: 'default',
                title: `Panel ${panelCount}`,
            });
        },
    },
    template: `
      <div class="example-layout">
        <div class="example-controls">
          <button :disabled="!canUndo" @click="undo">Undo</button>
          <button :disabled="!canRedo" @click="redo">Redo</button>
          <button @click="addPanel">Add Panel</button>
        </div>
        <dockview-vue
          class="example-dock"
          className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
          :layoutHistory="{ enabled: true, undoableProgrammaticMutations: true }"
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
