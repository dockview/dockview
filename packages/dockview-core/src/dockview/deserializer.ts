import { GroupviewPanelState } from './types';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewPanel, IDockviewPanel } from './dockviewPanel';
import { DockviewComponent } from './dockviewComponent';
import { DockviewPanelModel } from './dockviewPanelModel';
import { DockviewApi } from '../api/component.api';

export interface IPanelDeserializer {
    fromJSON(
        panelData: GroupviewPanelState,
        group: DockviewGroupPanel
    ): IDockviewPanel;
}

// @deprecated
interface LegacyState extends GroupviewPanelState {
    view?: {
        tab?: { id: string };
        content: { id: string };
    };
}

export class DefaultDockviewDeserialzier implements IPanelDeserializer {
    constructor(private readonly accessor: DockviewComponent) {}

    public fromJSON(
        panelData: GroupviewPanelState,
        group: DockviewGroupPanel
    ): IDockviewPanel {
        const panelId = panelData.id;
        const params = panelData.params;
        const title = panelData.title;

        const viewData = (panelData as LegacyState).view!;

        const contentComponent = viewData
            ? viewData.content.id
            : (panelData.contentComponent ?? 'unknown');
        const tabComponent = viewData
            ? viewData.tab?.id
            : panelData.tabComponent;

        const view = new DockviewPanelModel(
            this.accessor,
            panelId,
            contentComponent,
            tabComponent
        );

        const panel = new DockviewPanel(
            panelId,
            contentComponent,
            tabComponent,
            this.accessor,
            new DockviewApi(this.accessor),
            group,
            view,
            {
                renderer: panelData.renderer,
                minimumWidth: panelData.minimumWidth,
                minimumHeight: panelData.minimumHeight,
                maximumWidth: panelData.maximumWidth,
                maximumHeight: panelData.maximumHeight,
            }
        );

        panel.init({
            title: title ?? panelId,
            params: params ?? {},
        });

        // Only honour the serialized pinned flag when pinning is enabled.
        // Otherwise a layout saved with pinning would restore a pinned tab
        // (glyph, hidden close, no unpin path) into a component that can't
        // interact with it. When disabled the `pinned` key is ignored (unpinned).
        if (panelData.pinned && this.accessor.options.pinnedTabs?.enabled) {
            panel.setPinned(true);
        }

        // Hand each registered contributor its slice (and retain the slices of
        // any module that isn't registered, so re-saving preserves them).
        // Inline here, as `setPinned` above is: the panel knows its group, but
        // the group is not yet in the grid, so contributors must not depend on
        // final layout position.
        panel.applyModuleState(panelData.moduleState);

        return panel;
    }
}
