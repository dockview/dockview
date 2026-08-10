import { createApp, ref, defineComponent, PropType } from 'vue';
import {
    DockviewVue,
    DockviewHeaderPosition,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview-vue';
import 'dockview-vue/dist/styles/dockview.css';

const positions: DockviewHeaderPosition[] = ['top', 'bottom', 'left', 'right'];

const DefaultPanel = defineComponent({
    name: 'DefaultPanel',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelProps>,
            required: true,
        },
    },
    setup(props) {
        const groupApi = props.params.api.group.api;
        const position = ref<DockviewHeaderPosition>(
            groupApi.getHeaderPosition()
        );

        const setPosition = (value: DockviewHeaderPosition) => {
            groupApi.setHeaderPosition(value);
            position.value = value;
        };

        return {
            positions,
            position,
            setPosition,
        };
    },
    template: `
        <div class="example-panel">
            <div class="example-controls">
                <button
                    v-for="value in positions"
                    :key="value"
                    :disabled="value === position"
                    @click="setPosition(value)">
                    {{ value }}
                </button>
            </div>
            <div style="font-size: 13px; margin-top: 12px;">
                Header position: {{ position }}
            </div>
        </div>
    `,
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: DefaultPanel,
    },
    setup() {
        const onReady = (event: DockviewReadyEvent) => {
            const panel1 = event.api.addPanel({
                id: 'panel_1',
                component: 'default',
                title: 'Panel 1',
            });

            const panel2 = event.api.addPanel({
                id: 'panel_2',
                component: 'default',
                title: 'Panel 2',
                position: {
                    referencePanel: panel1,
                    direction: 'right',
                },
            });

            event.api.addPanel({
                id: 'panel_3',
                component: 'default',
                title: 'Panel 3',
                position: {
                    referencePanel: panel2,
                    direction: 'below',
                },
            });
        };

        return {
            onReady,
        };
    },
    template: `
        <dockview-vue
            className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
            defaultHeaderPosition="bottom"
            @ready="onReady"
            style="width: 100%; height: 100%;">
        </dockview-vue>
    `,
});

createApp(App).mount('#app');
