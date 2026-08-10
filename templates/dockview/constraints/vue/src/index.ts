import { createApp, ref, onMounted, defineComponent, PropType } from 'vue';
import { DockviewVue, DockviewReadyEvent, IDockviewPanelProps } from 'dockview-vue';
import 'dockview-vue/dist/styles/dockview.css';

const DefaultPanel = defineComponent({
    name: 'DefaultPanel',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelProps>,
            required: true,
        },
    },
    setup(props) {
        const constraints = ref<any>(null);

        onMounted(() => {
            if (props.params?.api?.group?.api) {
                props.params.api.group.api.onDidConstraintsChange((event: any) => {
                    constraints.value = event;
                });
            }
        });

        const setConstraints = () => {
            if (props.params?.api?.group?.api) {
                props.params.api.group.api.setConstraints({
                    maximumWidth: 300,
                    maximumHeight: 300,
                });
            }
        };

        return {
            constraints,
            setConstraints,
        };
    },
    template: `
        <div class="example-panel">
            <div class="example-controls">
                <button @click="setConstraints">Set constraints</button>
            </div>
            <div v-if="constraints" style="font-size: 13px; margin-top: 12px;">
                <div v-if="typeof constraints.maximumHeight === 'number'"
                     style="border: 1px solid grey; margin: 2px; padding: 4px 6px;">
                    <span>Maximum height: </span>
                    <span>{{ constraints.maximumHeight }}px</span>
                </div>
                <div v-if="typeof constraints.minimumHeight === 'number'"
                     style="border: 1px solid grey; margin: 2px; padding: 4px 6px;">
                    <span>Minimum height: </span>
                    <span>{{ constraints.minimumHeight }}px</span>
                </div>
                <div v-if="typeof constraints.maximumWidth === 'number'"
                     style="border: 1px solid grey; margin: 2px; padding: 4px 6px;">
                    <span>Maximum width: </span>
                    <span>{{ constraints.maximumWidth }}px</span>
                </div>
                <div v-if="typeof constraints.minimumWidth === 'number'"
                     style="border: 1px solid grey; margin: 2px; padding: 4px 6px;">
                    <span>Minimum width: </span>
                    <span>{{ constraints.minimumWidth }}px</span>
                </div>
            </div>
        </div>
    `
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

            const panel3 = event.api.addPanel({
                id: 'panel_3',
                component: 'default',
                title: 'Panel 3',
                position: {
                    referencePanel: panel2,
                    direction: 'right',
                },
            });

            const panel4 = event.api.addPanel({
                id: 'panel_4',
                component: 'default',
                title: 'Panel 4',
                position: {
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
            @ready="onReady"
            style="width: 100%; height: 100%;">
        </dockview-vue>
    `
});

createApp(App).mount('#app');
