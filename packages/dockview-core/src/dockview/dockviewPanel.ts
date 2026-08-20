import { DockviewApi } from '../api/component.api';
import {
    DockviewPanelApi,
    DockviewPanelApiImpl,
} from '../api/dockviewPanelApi';
import { GroupviewPanelState, IGroupPanelInitParameters } from './types';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { CompositeDisposable, IDisposable } from '../lifecycle';
import { IPanel, PanelUpdateEvent, Parameters } from '../panel/types';
import { IDockviewPanelModel } from './dockviewPanelModel';
import { DockviewComponent } from './dockviewComponent';
import { DockviewPanelRenderer } from '../overlay/overlayRenderContainer';
import { WillFocusEvent } from '../api/panelApi';
import { Constraints } from '../gridview/gridviewPanel';

export interface IDockviewPanel extends IDisposable, IPanel {
    readonly view: IDockviewPanelModel;
    readonly group: DockviewGroupPanel;
    readonly api: DockviewPanelApi;
    readonly title: string | undefined;
    readonly params: Parameters | undefined;
    readonly minimumWidth?: number;
    readonly minimumHeight?: number;
    readonly maximumWidth?: number;
    readonly maximumHeight?: number;
    readonly isPinned: boolean;
    setPinned(pinned: boolean): void;
    updateParentGroup(
        group: DockviewGroupPanel,
        options?: { skipSetActive?: boolean }
    ): void;
    updateFromStateModel(state: GroupviewPanelState): void;
    applyModuleState(state: Record<string, unknown> | undefined): void;
    init(params: IGroupPanelInitParameters): void;
    toJSON(): GroupviewPanelState;
    setTitle(title: string): void;
    update(event: PanelUpdateEvent): void;
    runEvents(): void;
}

export class DockviewPanel
    extends CompositeDisposable
    implements IDockviewPanel
{
    readonly api: DockviewPanelApiImpl;

    private _group: DockviewGroupPanel;
    private _params?: Parameters;
    private _title: string | undefined;
    private _renderer: DockviewPanelRenderer | undefined;
    private _pinned = false;
    private _moduleState: Record<string, unknown> | undefined;

    private _minimumWidth: number | undefined;
    private _minimumHeight: number | undefined;
    private _maximumWidth: number | undefined;
    private _maximumHeight: number | undefined;

    get params(): Parameters | undefined {
        return this._params;
    }

    get title(): string | undefined {
        return this._title;
    }

    get isPinned(): boolean {
        return this._pinned;
    }

    get group(): DockviewGroupPanel {
        return this._group;
    }

    get renderer(): DockviewPanelRenderer {
        return this._renderer ?? this.accessor.renderer;
    }

    get minimumWidth(): number | undefined {
        return this._minimumWidth;
    }

    get minimumHeight(): number | undefined {
        return this._minimumHeight;
    }

    get maximumWidth(): number | undefined {
        return this._maximumWidth;
    }

    get maximumHeight(): number | undefined {
        return this._maximumHeight;
    }

    constructor(
        public readonly id: string,
        component: string,
        tabComponent: string | undefined,
        private readonly accessor: DockviewComponent,
        private readonly containerApi: DockviewApi,
        group: DockviewGroupPanel,
        readonly view: IDockviewPanelModel,
        options: { renderer?: DockviewPanelRenderer } & Partial<Constraints>
    ) {
        super();
        this._renderer = options.renderer;
        this._group = group;
        this._minimumWidth = options.minimumWidth;
        this._minimumHeight = options.minimumHeight;
        this._maximumWidth = options.maximumWidth;
        this._maximumHeight = options.maximumHeight;

        this.api = new DockviewPanelApiImpl(
            this,
            this._group,
            accessor,
            component,
            tabComponent
        );

        this.addDisposables(
            this.api.onActiveChange(() => {
                accessor.setActivePanel(this);
            }),
            this.api.onDidSizeChange((event) => {
                // forward the resize event to the group since if you want to resize a panel
                // you are actually just resizing the panels parent which is the group
                this.group.api.setSize(event);
            }),
            this.api.onDidRendererChange(() => {
                this.group.model.rerender(this);
            })
        );
    }

    public init(params: IGroupPanelInitParameters): void {
        this._params = params.params;

        this.view.init({
            ...params,
            api: this.api,
            containerApi: this.containerApi,
        });

        this.setTitle(params.title);
    }

    focus(): void {
        const event = new WillFocusEvent();
        this.api._onWillFocus.fire(event);

        if (event.defaultPrevented) {
            return;
        }

        if (!this.api.isActive) {
            this.api.setActive();
        }
    }

    public toJSON(): GroupviewPanelState {
        return <GroupviewPanelState>{
            id: this.id,
            contentComponent: this.view.contentComponent,
            tabComponent: this.view.tabComponent,
            params:
                Object.keys(this._params || {}).length > 0
                    ? this._params
                    : undefined,
            title: this.title,
            renderer: this._renderer,
            minimumHeight: this._minimumHeight,
            maximumHeight: this._maximumHeight,
            minimumWidth: this._minimumWidth,
            maximumWidth: this._maximumWidth,
            // Emit only when pinned so existing layouts stay byte-stable.
            pinned: this._pinned ? true : undefined,
            moduleState: this._serializeModuleState(),
        };
    }

    /**
     * Merge the live contributors' slices over the slices this panel was
     * loaded with. A key a registered contributor owns takes that
     * contributor's value - including `undefined`, which drops the key, so
     * state can actually be cleared. A key no registered contributor owns is
     * passed through verbatim, so loading a layout in a build without that
     * module and re-saving preserves it rather than silently discarding it.
     */
    private _serializeModuleState(): Record<string, unknown> | undefined {
        // `?? []` for the mock accessors used widely in tests; the real
        // component always provides the getter.
        const contributors = this.accessor.panelStateContributors ?? [];

        if (contributors.length === 0) {
            // Nothing live to claim any key: preserve whatever was loaded.
            return this._moduleState;
        }

        const claimed = new Set(contributors.map((c) => c.panelStateKey));
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(this._moduleState ?? {})) {
            if (!claimed.has(key)) {
                result[key] = value;
            }
        }

        for (const contributor of contributors) {
            const slice = contributor.serializePanelState(this);
            if (slice !== undefined) {
                result[contributor.panelStateKey] = slice;
            }
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }

    /**
     * Retain the loaded slices and hand each registered contributor its own.
     * Every contributor is called, with `undefined` when the layout carries no
     * slice for it, so a load replaces rather than merges - matching the
     * params handling in {@link updateFromStateModel}.
     */
    applyModuleState(state: Record<string, unknown> | undefined): void {
        this._moduleState = state;

        for (const contributor of this.accessor.panelStateContributors ?? []) {
            contributor.hydratePanelState(
                this,
                state?.[contributor.panelStateKey]
            );
        }
    }

    setTitle(title: string): void {
        const didTitleChange = title !== this.title;

        if (didTitleChange) {
            this._title = title;
            // keep the view-model's cached init params in sync so that tab
            // renderers constructed lazily (e.g. the header overflow
            // dropdown via createTabRenderer) see the updated title
            // (#914).
            this.view.setTitle(title);
            this.api._onDidTitleChange.fire({ title });
        }
    }

    /**
     * Low-level pinned-state mutation. Sets the flag and fires the panel-api
     * event. The public, module-gated entry point is
     * `panel.api.setPinned` → `DockviewComponent.setPanelPinned`, which decides
     * whether pinning is active before reaching here; this method itself does
     * not gate, so the ordering module and serialization can drive it directly.
     */
    setPinned(pinned: boolean): void {
        if (this._pinned === pinned) {
            return;
        }
        this._pinned = pinned;
        this.api._onDidChangePinned.fire({ isPinned: pinned });
    }

    setRenderer(renderer: DockviewPanelRenderer): void {
        const didChange = renderer !== this.renderer;

        if (didChange) {
            this._renderer = renderer;
            this.api._onDidRendererChange.fire({
                renderer: renderer,
            });
        }
    }

    public update(event: PanelUpdateEvent): void {
        this._params = {
            ...this._params,
            ...event.params,
        };

        /**
         * delete new keys that have a value of undefined,
         * allow values of null
         */
        for (const key of Object.keys(event.params)) {
            if (event.params[key] === undefined) {
                delete this._params[key];
            }
        }

        this.view.update({
            params: this._params,
        });
    }

    updateFromStateModel(state: GroupviewPanelState): void {
        this._maximumHeight = state.maximumHeight;
        this._minimumHeight = state.minimumHeight;
        this._maximumWidth = state.maximumWidth;
        this._minimumWidth = state.minimumWidth;

        // Replace the params wholesale rather than merging via `update`:
        // deserialization must restore exactly the saved params, so stale keys
        // present on the reused live panel but absent from the saved state
        // don't leak through (matching the fresh-panel `init` path).
        this._params = state.params ?? {};
        this.view.update({ params: this._params });

        this.setTitle(state.title ?? this.id);
        this.setRenderer(state.renderer ?? this.accessor.renderer);
        // Honour the serialized pinned flag only when pinning is enabled (see
        // the deserializer for the rationale); disabled → load unpinned.
        this.setPinned(
            (state.pinned ?? false) &&
                !!this.accessor.options.pinnedTabs?.enabled
        );

        // Replaces rather than merges, for the same reason as params above: a
        // reused panel must not keep module state the saved layout dropped.
        this.applyModuleState(state.moduleState);

        // state.contentComponent;
        // state.tabComponent;
    }

    public updateParentGroup(
        group: DockviewGroupPanel,
        options?: { skipSetActive?: boolean }
    ): void {
        this._group = group;
        this.api.group = this._group;

        const isPanelVisible = this._group.model.isPanelActive(this);
        const isActive = this.group.api.isActive && isPanelVisible;

        if (!options?.skipSetActive) {
            if (this.api.isActive !== isActive) {
                this.api._onDidActiveChange.fire({
                    isActive: this.group.api.isActive && isPanelVisible,
                });
            }
        }

        if (this.api.isVisible !== isPanelVisible) {
            this.api._onDidVisibilityChange.fire({
                isVisible: isPanelVisible,
            });
        }
    }

    runEvents(): void {
        const isPanelVisible = this._group.model.isPanelActive(this);

        const isActive = this.group.api.isActive && isPanelVisible;

        if (this.api.isActive !== isActive) {
            this.api._onDidActiveChange.fire({
                isActive: this.group.api.isActive && isPanelVisible,
            });
        }

        if (this.api.isVisible !== isPanelVisible) {
            this.api._onDidVisibilityChange.fire({
                isVisible: isPanelVisible,
            });
        }
    }

    public layout(width: number, height: number): void {
        // `width`/`height` are the content-area dimensions (the group box minus
        // the header), computed by DockviewGroupPanelModel.contentDimensions().
        this.api._onDidDimensionChange.fire({
            width,
            height: height,
        });

        this.view.layout(width, height);
    }

    public dispose(): void {
        this.api.dispose();
        this.view.dispose();
    }
}
