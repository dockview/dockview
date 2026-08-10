import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewApi,
    DockviewReadyEvent,
    IDockviewHeaderActionsProps,
    IDockviewPanelProps,
} from 'dockview-vue';

let panelCount = 0;

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
    data() {
        return {
            title: this.title,
            icon: this.icon,
        };
    },
    methods: {
        onClick() {
            this.$emit('click');
        },
    },
    template: `
    <div
      @click="onClick"
      title="title"
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
            isPopout: this.params.api.location.type === 'popout',
        };
    },
    methods: {
        onClick() {
            if (this.isPopout) {
                const group = this.params.containerApi.addGroup();
                this.group.api.moveTo({ group });
            } else {
                this.params.containerApi.addPopoutGroup(this.params.group, {
                    popoutUrl: '/popout/index.html',
                });
            }
        },
    },
    mounted() {
        const disposable = this.params.group.api.onDidLocationChange(
            (event) => {
                this.isPopout = event.location.type === 'popout';
            }
        );

        return () => {
            disposable.dispose();
        };
    },
    template: `
    <div style="height:100%;padding:0px 4px">
      <material-icon v-if="isPopout" @click="onClick" icon="jump_to_element"></material-icon>
      <material-icon v-if="!isPopout" @click="onClick" icon="back_to_tab"></material-icon>
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
            this.title = this.api.title;
        });
        this.title = this.api.title;

        return () => {
            disposable.dispose();
        };
    },
    template: `
      <div class="example-panel">
        <div>{{title}}</div>
      </div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: Panel,
        leftAction: LeftAction,
        rightAction: RightAction,
    },
    data() {
        return {
            api: null as DockviewApi | null,
            bounds: undefined,
            disableFloatingGroups: false,
        };
    },
    methods: {
        onAddFloatingGroup() {
            this.api.addPanel({
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
            event.api.addPanel({
                id: 'panel_1',
                component: 'default',
                title: 'Panel 1',
            });

            event.api.addPanel({
                id: 'panel_2',
                component: 'default',
                title: 'Panel 2',
                position: {
                    direction: 'right',
                },
            });

            event.api.addPanel({
                id: 'panel_3',
                component: 'default',
                title: 'Panel 3',
                position: {
                    direction: 'below',
                },
            });

            this.api = event.api;
        },
    },
    template: `
    <div class="example-layout">
      <div class="example-controls">
        <button @click="onAddFloatingGroup">Add Floating Group</button>
        <button @click="onToggleBounds">{{'Bounds: ' + bounds}}</button>
        <button @click="onToggleEnabled">{{'Disabled: ' + disableFloatingGroups}}</button>
      </div>
      <div class="example-dock">
        <dockview-vue
          style="width:100%;height:100%"
          className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
          @ready="onReady"
          :floatingGroupBounds="bounds"
          leftHeaderActionsComponent="leftAction"
          rightHeaderActionsComponent="rightAction"
          prefixHeaderActionsComponent="prefixAction"
          :disableFloatingGroups="disableFloatingGroups"
        ></dockview-vue>
      </div>
    </div>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
