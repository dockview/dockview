import { createApp, ref, onUnmounted, watchEffect, defineComponent, PropType } from 'vue';
import { DockviewVue, DockviewReadyEvent, DockviewApi, IDockviewPanelProps } from 'dockview-vue';
import 'dockview-vue/dist/styles/dockview.css';

const DefaultPanel = defineComponent({
    name: 'DefaultPanel',
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
        <div class="example-panel">{{ title }}</div>
    `
});

const App = defineComponent({
    name: 'App',
    components: {
        'dockview-vue': DockviewVue,
        default: DefaultPanel,
    },
    setup() {
        const api = ref<DockviewApi | null>(null);
        const disablePanelDrag = ref(false);
        const disableGroupDrag = ref(false);
        const disableOverlay = ref(false);

        const disposables: any[] = [];

        const setupEventListeners = () => {
            if (!api.value) return;

            // Clear existing disposables
            disposables.forEach(d => d?.dispose?.());
            disposables.length = 0;

            disposables.push(
                api.value.onWillDragPanel((e: any) => {
                    if (disablePanelDrag.value) {
                        e.nativeEvent.preventDefault();
                    }
                }),

                api.value.onWillDragGroup((e: any) => {
                    if (disableGroupDrag.value) {
                        e.nativeEvent.preventDefault();
                    }
                }),

                api.value.onWillShowOverlay((e: any) => {
                    console.log(e);
                    if (disableOverlay.value) {
                        e.preventDefault();
                    }
                }),

                api.value.onWillDrop((e: any) => {
                    // Handle will drop
                }),

                api.value.onDidDrop((e: any) => {
                    // Handle did drop
                })
            );
        };

        // Watch for changes in the disable flags
        watchEffect(() => {
            if (api.value) {
                setupEventListeners();
            }
        });

        onUnmounted(() => {
            disposables.forEach(d => d?.dispose?.());
        });

        const onReady = (event: DockviewReadyEvent) => {
            api.value = event.api;

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
                    referencePanel: 'panel_1',
                },
            });

            event.api.addPanel({
                id: 'panel_3',
                component: 'default',
                title: 'Panel 3',
                position: {
                    direction: 'below',
                    referencePanel: 'panel_1',
                },
            });

            event.api.addPanel({
                id: 'panel_4',
                component: 'default',
                title: 'Panel 4',
            });

            event.api.addPanel({
                id: 'panel_5',
                component: 'default',
                title: 'Panel 5',
            });

            setupEventListeners();
        };

        const togglePanelDrag = () => {
            disablePanelDrag.value = !disablePanelDrag.value;
        };

        const toggleGroupDrag = () => {
            disableGroupDrag.value = !disableGroupDrag.value;
        };

        const toggleOverlay = () => {
            disableOverlay.value = !disableOverlay.value;
        };

        return {
            onReady,
            disablePanelDrag,
            disableGroupDrag,
            disableOverlay,
            togglePanelDrag,
            toggleGroupDrag,
            toggleOverlay,
        };
    },
    template: `
        <div class="example-layout">
            <div class="example-controls">
                <button @click="togglePanelDrag">
                    Panel Drag: {{ disablePanelDrag ? 'disabled' : 'enabled' }}
                </button>
                <button @click="toggleGroupDrag">
                    Group Drag: {{ disableGroupDrag ? 'disabled' : 'enabled' }}
                </button>
                <button @click="toggleOverlay">
                    Overlay: {{ disableOverlay ? 'disabled' : 'enabled' }}
                </button>
            </div>
            <dockview-vue
                class="example-dock"
                className="${(window as any).__dockviewThemeClass ?? 'dockview-theme-abyss'}"
                @ready="onReady">
            </dockview-vue>
        </div>
    `
});

createApp(App).mount('#app');