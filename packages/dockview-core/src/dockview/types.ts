import { DockviewPanelApi } from '../api/dockviewPanelApi';
import { PanelInitParameters, IPanel } from '../panel/types';
import { DockviewApi } from '../api/component.api';
import { Optional } from '../types';
import { IDockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewPanelRenderer } from '../overlay/overlayRenderContainer';
import { TabLocation } from './framework';

export interface HeaderPartInitParameters {
    title: string;
}

export interface GroupPanelPartInitParameters
    extends PanelInitParameters,
        HeaderPartInitParameters {
    api: DockviewPanelApi;
    containerApi: DockviewApi;
}

export interface WatermarkRendererInitParameters {
    containerApi: DockviewApi;
    group?: IDockviewGroupPanel;
}

type RendererMethodOptionalList =
    | 'dispose'
    | 'update'
    | 'layout'
    | 'toJSON'
    | 'focus';

export interface IWatermarkRenderer
    extends Optional<Omit<IPanel, 'id' | 'init'>, RendererMethodOptionalList> {
    readonly element: HTMLElement;
    init: (params: WatermarkRendererInitParameters) => void;
}

export interface TabPartInitParameters extends GroupPanelPartInitParameters {
    tabLocation: TabLocation;
}

export interface ITabRenderer
    extends Optional<Omit<IPanel, 'id'>, RendererMethodOptionalList> {
    readonly element: HTMLElement;
    init(parameters: TabPartInitParameters): void;
}

export interface IContentRenderer
    extends Optional<Omit<IPanel, 'id'>, RendererMethodOptionalList> {
    readonly element: HTMLElement;
    init(parameters: GroupPanelPartInitParameters): void;
    onShow?(): void;
    onHide?(): void;
}

export interface IGroupPanelInitParameters
    extends PanelInitParameters,
        HeaderPartInitParameters {
    //
}

export interface GroupviewPanelState {
    id: string;
    contentComponent?: string;
    tabComponent?: string;
    title?: string;
    renderer?: DockviewPanelRenderer;
    params?: { [key: string]: any };
    minimumWidth?: number;
    minimumHeight?: number;
    maximumWidth?: number;
    maximumHeight?: number;
    /** Pinned tab state (PinnedTabs module). Emitted only when `true`; absent
     *  layouts load unpinned.
     *
     *  Predates `moduleState` and stays here deliberately: it lives in layouts
     *  customers have already persisted, so moving it would stop older
     *  dockview reading newer layouts for no user benefit. New module state
     *  belongs in `moduleState`. */
    pinned?: boolean;
    /**
     * Namespaced per-module state, one key per `IPanelStateContributor`
     * (see `./modules`). Absent when no module contributed, so layouts from
     * apps using none of them stay byte-stable.
     *
     * Keys owned by a module that isn't registered are preserved verbatim
     * across a load/save round-trip rather than dropped, so opening a layout
     * in a build without that module and re-saving doesn't discard state.
     */
    moduleState?: Record<string, unknown>;
}
