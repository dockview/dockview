import 'dockview-vue/dist/styles/dockview.css';
import { PropType, createApp, defineComponent } from 'vue';
import {
    DockviewVue,
    DockviewReadyEvent,
    WorkbenchApi,
    IDockviewPanelProps,
    themeAbyss,
    themeLight,
} from 'dockview-vue';

// A handle the header buttons use to drive the workbench after it is ready.
let workbench: WorkbenchApi | undefined;

const Header = defineComponent({
    name: 'Header',
    data() {
        return { alignment: 'center' };
    },
    methods: {
        flip() {
            if (!workbench) return;
            workbench.setPrimarySideBarPosition(
                workbench.primarySideBarPosition === 'left' ? 'right' : 'left'
            );
        },
        toggleAlign() {
            if (!workbench) return;
            workbench.setToolPanelAlignment(
                workbench.toolPanelAlignment === 'center' ? 'justify' : 'center'
            );
            this.alignment = workbench.toolPanelAlignment;
        },
    },
    template: `
    <div style="display:flex;align-items:center;gap:12px;height:100%;padding:0 12px;background:#3c3c3c;color:#cfcfcf;font-size:12px;box-sizing:border-box">
      <span style="color:#fff;font-weight:600">dockview</span>
      <span style="flex:1"></span>
      <button @click="flip">Flip side bar</button>
      <button @click="toggleAlign">Panel: {{ alignment }}</button>
    </div>`,
});

const ActivityBar = defineComponent({
    name: 'ActivityBar',
    template: `
    <div style="display:flex;flex-direction:column;gap:6px;padding-top:8px;align-items:center;height:100%;background:#333;font-size:20px;box-sizing:border-box">
      <span>🗂</span><span>🔍</span><span>⑃</span><span>▷</span>
    </div>`,
});

const Explorer = defineComponent({
    name: 'Explorer',
    template: `
    <div style="height:100%;width:100%;background:#252526;color:#cfcfcf;padding:8px 12px;box-sizing:border-box;font-size:13px">
      <div style="opacity:.6;font-size:11px">EXPLORER</div>
      <div>▾ src</div><div>&nbsp;&nbsp;index.ts</div><div>&nbsp;&nbsp;readme.md</div>
    </div>`,
});

const Outline = defineComponent({
    name: 'Outline',
    template: `
    <div style="height:100%;width:100%;background:#202020;color:#cfcfcf;padding:8px 12px;box-sizing:border-box;font-size:13px">
      <div style="opacity:.6;font-size:11px">OUTLINE</div>
      <div>◆ Workbench</div><div>◆ Editor</div>
    </div>`,
});

const Terminal = defineComponent({
    name: 'Terminal',
    template: `
    <div style="height:100%;background:#181818;color:#d0d0d0;padding:8px 12px;box-sizing:border-box;font-family:monospace;font-size:12px">
      $ echo "terminal panel"
    </div>`,
});

const StatusBar = defineComponent({
    name: 'StatusBar',
    template: `
    <div style="display:flex;align-items:center;gap:16px;height:100%;padding:0 12px;background:#007acc;color:#fff;font-size:12px;box-sizing:border-box">
      <span>⎇ main</span><span style="flex:1"></span><span>UTF-8</span><span>TypeScript</span>
    </div>`,
});

const Editor = defineComponent({
    name: 'Editor',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelProps>,
            required: true,
        },
    },
    template: `<div class="example-panel">{{ params.api.title }}</div>`,
});

const App = defineComponent({
    name: 'App',
    components: { 'dockview-vue': DockviewVue },
    data() {
        return {
            editorComponents: { editor: Editor },
            theme:
                (window as any).__dockviewColorMode === 'light'
                    ? themeLight
                    : themeAbyss,
            workbenchOptions: {
                components: {
                    header: Header,
                    activity: ActivityBar,
                    explorer: Explorer,
                    outline: Outline,
                    terminal: Terminal,
                    status: StatusBar,
                },
                header: { component: 'header' },
                statusBar: { component: 'status' },
                activityBar: { component: 'activity' },
                primarySideBar: { component: 'explorer' },
                secondarySideBar: { component: 'outline' },
                toolPanel: {
                    component: 'terminal',
                    position: 'bottom',
                    alignment: 'center',
                },
            },
        };
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            workbench = event.api.workbench;
            const dv = event.api;
            dv.addPanel({ id: 'index.ts', component: 'editor', title: 'index.ts' });
            dv.addPanel({
                id: 'readme.md',
                component: 'editor',
                title: 'readme.md',
                position: { referencePanel: 'index.ts', direction: 'right' },
            });
        },
    },
    template: `
      <dockview-vue
        style="width:100%;height:100%"
        :components="editorComponents"
        :theme="theme"
        :workbench="workbenchOptions"
        @ready="onReady"
      />`,
});

const app = createApp(App);
app.config.errorHandler = (err) => {
    console.log(err);
};
app.mount(document.getElementById('app')!);
