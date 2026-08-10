import { createApp, ref, onUnmounted, defineComponent, PropType } from 'vue';
import {
    DockviewVue,
    DockviewReadyEvent,
    DockviewApi,
    positionToDirection,
    DockviewDidDropEvent,
    IDockviewPanelProps,
} from 'dockview-vue';
import 'dockview-vue/dist/styles/dockview.css';

const DefaultPanel = defineComponent({
    name: 'DefaultPanel',
    props: {
        params: {
            type: Object as PropType<IDockviewPanelProps<{ title: string }>>,
            required: true,
        },
    },
    template: `
        <div class="example-panel">{{ params.params.title }}</div>
    `,
});

const DraggableElement = defineComponent({
    name: 'DraggableElement',
    template: `
        <span
            tabindex="-1"
            @dragstart="onDragStart"
            style="padding: 4px 12px; border-radius: 4px; cursor: grab; user-select: none; color: var(--dv-activegroup-visiblepanel-tab-color); background: var(--dv-activegroup-visiblepanel-tab-background-color); border: 1px solid var(--dv-separator-border);"
            draggable="true">
            Drag me into the dock
        </span>
    `,
    methods: {
        onDragStart(event: DragEvent) {
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', 'nothing');
            }
        },
    },
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: DefaultPanel,
        'draggable-element': DraggableElement,
    },
    setup() {
        const api = ref<DockviewApi | null>(null);
        const dropped = ref<{ type: string; data: string }[] | null>(null);
        const disposables: any[] = [];

        const setupDragListeners = () => {
            if (!api.value) return;

            // Clear existing disposables
            disposables.forEach((d) => d?.dispose?.());
            disposables.length = 0;

            // Pointer (touch) drags can't bridge to external HTML5 drop
            // zones outside dockview; narrow before reading dataTransfer.
            const panelDragDisposable = api.value.onWillDragPanel(
                (event: any) => {
                    if (!(event.nativeEvent instanceof DragEvent)) {
                        return;
                    }
                    const dataTransfer = event.nativeEvent.dataTransfer;
                    if (dataTransfer) {
                        dataTransfer.setData(
                            'text/plain',
                            'Some custom panel data transfer data'
                        );
                        dataTransfer.setData(
                            'text/json',
                            '{text: "Some custom panel data transfer data"}'
                        );
                    }
                }
            );

            const groupDragDisposable = api.value.onWillDragGroup(
                (event: any) => {
                    if (!(event.nativeEvent instanceof DragEvent)) {
                        return;
                    }
                    const dataTransfer = event.nativeEvent.dataTransfer;
                    if (dataTransfer) {
                        dataTransfer.setData(
                            'text/plain',
                            'Some custom group data transfer data'
                        );
                        dataTransfer.setData(
                            'text/json',
                            '{text: "Some custom group data transfer data"}'
                        );
                    }
                }
            );

            const unhandledDragDisposable = api.value.onUnhandledDragOver(
                (event: any) => {
                    event.accept();
                }
            );

            disposables.push(
                panelDragDisposable,
                groupDragDisposable,
                unhandledDragDisposable
            );
        };

        onUnmounted(() => {
            disposables.forEach((d) => d?.dispose?.());
        });

        const onReady = (event: DockviewReadyEvent) => {
            api.value = event.api;

            event.api.addPanel({
                id: 'panel_1',
                component: 'default',
                params: { title: 'Panel 1' },
            });

            event.api.addPanel({
                id: 'panel_2',
                component: 'default',
                params: { title: 'Panel 2' },
            });

            event.api.addPanel({
                id: 'panel_3',
                component: 'default',
                params: { title: 'Panel 3' },
            });

            event.api.addPanel({
                id: 'panel_4',
                component: 'default',
                params: { title: 'Panel 4' },
                position: { referencePanel: 'panel_1', direction: 'right' },
            });

            setupDragListeners();
        };

        const onDidDrop = (event: DockviewDidDropEvent) => {
            event.api.addPanel({
                id: 'test',
                component: 'default',
                position: {
                    direction: positionToDirection(event.position),
                    referenceGroup: event.group || undefined,
                },
            });
        };

        const onDrop = (event: DragEvent) => {
            const dataTransfer = event.dataTransfer;
            if (!dataTransfer) return;

            const entries: { type: string; data: string }[] = [];
            for (let i = 0; i < dataTransfer.items.length; i++) {
                const item = dataTransfer.items[i];
                entries.push({
                    type: item.type,
                    data: dataTransfer.getData(item.type),
                });
            }

            dropped.value = entries;
        };

        return {
            onReady,
            onDidDrop,
            onDrop,
            dropped,
        };
    },
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <draggable-element />
                <div
                    style="flex: 1; min-width: 0; padding: 4px 12px; border-radius: 4px; border: 1px dashed var(--dv-separator-border); color: var(--dv-inactivegroup-visiblepanel-tab-color);"
                    @dragover.prevent
                    @drop="onDrop">
                    Drop a tab or group here to inspect the attached metadata
                </div>
            </div>
            <div
                v-if="dropped"
                class="example-controls"
                style="display: block; font-size: 12px;">
                <span v-if="dropped.length === 0">No dataTransfer data was found.</span>
                <template v-else>
                    <div v-for="(entry, index) in dropped" :key="index">
                        <code>{{ entry.type }}</code>: {{ entry.data }}
                    </div>
                </template>
            </div>
            <dockview-vue
                class="example-dock"
                className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                :dnd-edges="{ size: { value: 100, type: 'pixels' }, activationSize: { value: 5, type: 'percentage' } }"
                @ready="onReady"
                @didDrop="onDidDrop">
            </dockview-vue>
        </div>
    `,
});

createApp(App).mount('#app');
