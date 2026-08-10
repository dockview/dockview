import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewApi,
    DockviewReadyEvent,
    IDockviewHeaderActionsProps,
    IDockviewPanelProps,
    SerializedDockview,
} from 'dockview-vue';

const STORAGE_KEY = 'floating.layout';

let panelCount = 0;

function safeParse<T>(value: any): T | null {
    try {
        return JSON.parse(value) as T;
    } catch (err) {
        return null;
    }
}

function loadDefaultLayout(api: DockviewApi) {
    api.addPanel({
        id: 'panel_1',
        component: 'default',
        title: 'Panel 1',
    });

    api.addPanel({
        id: 'panel_2',
        component: 'default',
        title: 'Panel 2',
    });

    api.addPanel({
        id: 'panel_3',
        component: 'default',
        title: 'Panel 3',
    });

    const panel4 = api.addPanel({
        id: 'panel_4',
        component: 'default',
        title: 'Panel 4',
        floating: true,
    });

    api.addPanel({
        id: 'panel_5',
        component: 'default',
        title: 'Panel 5',
        floating: false,
        position: { referencePanel: panel4 },
    });

    api.addPanel({
        id: 'panel_6',
        component: 'default',
        title: 'Panel 6',
    });
}

const MaterialIcon = defineComponent({
    name: 'MaterialIcon',
    props: {
        icon: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            required: false,
        },
    },
    emits: ['click'],
    methods: {
        onClick() {
            this.$emit('click');
        },
    },
    template: `
    <div
      @click="onClick"
      :title="title"
      style="display:flex;justify-content:center;align-items:center;width:30px;height:100%;font-size:18px;">
        <span class="material-symbols-outlined" style="font-size:inherit;cursor:pointer;">
          {{icon}}
        </span>
    </div>`,
});

const LeftAction = defineComponent({
    name: 'LeftAction',
    props: {
        params: {
            type: Object as PropType<IDockviewHeaderActionsProps>,
            required: true,
        },
    },
    components: {
        'material-icon': MaterialIcon,
    },
    methods: {
        onClick() {
            this.params.containerApi.addPanel({
                id: (++panelCount).toString(),
                title: `Tab ${panelCount}`,
                component: 'default',
            });
        },
    },
    template: `
      <div style="height:100%;padding:0px 4px;">
        <material-icon @click="onClick" icon="add"></material-icon>
      </div>`,
});

const RightAction = defineComponent({
    name: 'RightAction',
    props: {
        params: {
            type: Object as PropType<IDockviewHeaderActionsProps>,
            required: true,
        },
    },
    components: {
        'material-icon': MaterialIcon,
    },
    data() {
        return {
            floating: this.params.api.location.type === 'floating',
        };
    },
    methods: {
        onClick() {
            if (this.floating) {
                const group = this.params.containerApi.addGroup();
                this.params.group.api.moveTo({ group });
            } else {
                this.params.containerApi.addFloatingGroup(this.params.group, {
                    width: 400,
                    height: 300,
                    position: {
                        bottom: 50,
                        right: 50,
                    },
                });
            }
        },
    },
    mounted() {
        const disposable = this.params.group.api.onDidLocationChange(
            (event) => {
                this.floating = event.location.type === 'floating';
            }
        );

        return () => {
            disposable.dispose();
        };
    },
    template: `
    <div style="height:100%;padding:0px 4px">
      <material-icon v-if="floating" @click="onClick" icon="jump_to_element"></material-icon>
      <material-icon v-else @click="onClick" icon="back_to_tab"></material-icon>
    </div>`,
});

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

const Watermark = defineComponent({
    name: 'Watermark',
    template: `<div class="example-panel">This group is empty.</div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
        watermark: Watermark,
        leftAction: LeftAction,
        rightAction: RightAction,
    },
    data() {
        return {
            api: null as DockviewApi | null,
            bounds: undefined as 'boundedWithinViewport' | undefined,
            disableFloatingGroups: false,
            layout: safeParse<SerializedDockview>(
                localStorage.getItem(STORAGE_KEY)
            ),
        };
    },
    methods: {
        setLayout(state: SerializedDockview | null) {
            if (state === null) {
                localStorage.removeItem(STORAGE_KEY);
                this.layout = null;
            } else {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                this.layout = state;
            }
        },
        load(api: DockviewApi) {
            api.clear();
            if (this.layout) {
                try {
                    api.fromJSON(this.layout);
                } catch (err) {
                    console.error(err);
                    api.clear();
                    loadDefaultLayout(api);
                }
            } else {
                loadDefaultLayout(api);
            }
        },
        onSave() {
            if (this.api) {
                this.setLayout(this.api.toJSON());
            }
        },
        onLoad() {
            if (this.api) {
                this.load(this.api);
            }
        },
        onClear() {
            if (this.api) {
                this.api.clear();
            }
            this.setLayout(null);
        },
        onAddFloatingGroup() {
            this.api!.addPanel({
                id: (++panelCount).toString(),
                title: `Tab ${panelCount}`,
                component: 'default',
                floating: { width: 250, height: 150, x: 50, y: 50 },
            });
        },
        onToggleBounds() {
            this.bounds =
                this.bounds === undefined ? 'boundedWithinViewport' : undefined;
        },
        onToggleEnabled() {
            this.disableFloatingGroups = !this.disableFloatingGroups;
        },
        onReady(event: DockviewReadyEvent) {
            this.load(event.api);
            this.api = event.api;
        },
    },
    template: `
    <div class="example-layout">
      <div class="example-controls">
        <button @click="onSave">Save</button>
        <button @click="onLoad">Load</button>
        <button @click="onClear">Clear</button>
        <button @click="onAddFloatingGroup">Add Floating Group</button>
        <button @click="onToggleBounds">{{ 'Bounds: ' + (bounds ? 'Within' : 'Overflow') }}</button>
        <button @click="onToggleEnabled">{{ (disableFloatingGroups ? 'Enable' : 'Disable') + ' floating groups' }}</button>
      </div>
      <dockview-vue
        class="example-dock"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        @ready="onReady"
        :floatingGroupBounds="bounds"
        :disableFloatingGroups="disableFloatingGroups"
        watermarkComponent="watermark"
        leftHeaderActionsComponent="leftAction"
        rightHeaderActionsComponent="rightAction"
      >
      </dockview-vue>
    </div>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
