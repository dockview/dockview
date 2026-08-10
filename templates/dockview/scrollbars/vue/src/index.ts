import 'dockview-vue/dist/styles/dockview.css';
import { createApp, defineComponent } from 'vue';
import { DockviewVue, DockviewReadyEvent } from 'dockview-vue';

const TEXT =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const FixedHeightContainer = defineComponent({
    name: 'FixedHeightContainer',
    data() {
        return {
            text: [TEXT, '\n\n'].join('').repeat(20),
        };
    },
    template: `
      <div class="example-panel" style="height:100%">
        {{text}}
      </div>`,
});

const OverflowContainer = defineComponent({
    name: 'OverflowContainer',
    data() {
        return {
            text: [TEXT, '\n\n'].join('').repeat(20),
        };
    },
    template: `
      <div class="example-panel" style="height:2000px;overflow:auto">
        {{text}}
      </div>`,
});

const UserDefinedOverflowContainer = defineComponent({
    name: 'UserDefinedOverflowContainer',
    data() {
        return {
            text: [TEXT, '\n\n'].join('').repeat(20),
        };
    },
    template: `
      <div class="example-panel" style="height:100%">
        <div style="height:100%;overflow:auto">
          {{text}}
        </div>
      </div>`,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        fixedHeightContainer: FixedHeightContainer,
        overflowContainer: OverflowContainer,
        userDefinedOverflowContainer: UserDefinedOverflowContainer,
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            event.api.addPanel({
                id: 'panel_1',
                component: 'fixedHeightContainer',
                title: 'Panel 1',
            });

            event.api.addPanel({
                id: 'panel_2',
                component: 'overflowContainer',
                title: 'Panel 2',
                position: { direction: 'right' },
            });

            event.api.addPanel({
                id: 'panel_3',
                component: 'userDefinedOverflowContainer',
                title: 'Panel 3',
                position: { direction: 'right' },
            });
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
        @ready="onReady"
        :disableFloatingGroups="true"
      ></dockview-vue>`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
