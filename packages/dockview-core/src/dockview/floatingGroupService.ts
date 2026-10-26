import { CompositeDisposable, IDisposable } from '../lifecycle';
import { remove } from '../array';
import { watchElementResize } from '../dom';
import { Gridview, ISerializedLeafNode } from '../gridview/gridview';
import { Overlay } from '../overlay/overlay';
import { DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE } from '../constants';
import { DockviewFloatingGroupPanel } from './dockviewFloatingGroupPanel';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewOptions } from './options';
import { SerializedFloatingGroup } from './dockviewComponent';
import { GroupPanelViewState } from './dockviewGroupPanelModel';
import { defineModule } from './modules';

/**
 * Narrow callback surface the FloatingGroupService needs from its host
 * component. Keeps the service decoupled from DockviewComponent.
 */
export interface IFloatingGroupHost {
    fireLayoutChange(): void;
}

export interface IFloatingGroupService extends IDisposable {
    readonly floatingGroups: readonly DockviewFloatingGroupPanel[];

    add(
        group: DockviewGroupPanel,
        overlay: Overlay,
        gridview: Gridview
    ): DockviewFloatingGroupPanel;

    findByGroup(
        group: DockviewGroupPanel
    ): DockviewFloatingGroupPanel | undefined;

    serialize(): SerializedFloatingGroup[];

    constrainBounds(): void;

    updateBounds(options: Partial<DockviewOptions>): void;

    disposeAll(): void;
}

export class FloatingGroupService implements IFloatingGroupService {
    private readonly _host: IFloatingGroupHost;
    private readonly _floatingGroups: DockviewFloatingGroupPanel[] = [];

    get floatingGroups(): readonly DockviewFloatingGroupPanel[] {
        return this._floatingGroups;
    }

    constructor(host: IFloatingGroupHost) {
        this._host = host;
    }

    add(
        group: DockviewGroupPanel,
        overlay: Overlay,
        gridview: Gridview
    ): DockviewFloatingGroupPanel {
        const floatingGroupPanel = new DockviewFloatingGroupPanel(
            group,
            overlay,
            gridview
        );

        const disposable = new CompositeDisposable(
            group.api.onDidActiveChange((event) => {
                if (event.isActive) {
                    overlay.bringToFront();
                }
            }),
            (() => {
                // The floating window's nested gridview fills the overlay
                // beneath the (optional) title bar; size it from its own
                // measured box so it follows the overlay as the user drags
                // / resizes the window.
                let lastWidth = -1;
                let lastHeight = -1;
                return watchElementResize(gridview.element, (entry) => {
                    const width = Math.round(entry.contentRect.width);
                    const height = Math.round(entry.contentRect.height);
                    if (width === lastWidth && height === lastHeight) {
                        return;
                    }
                    lastWidth = width;
                    lastHeight = height;
                    gridview.layout(width, height);
                });
            })()
        );

        // Floating windows are non-modal dialogs (role set in Overlay). Give
        // the dialog an accessible name from the representative group's active
        // panel, refreshed as the active panel changes. An untitled panel
        // leaves the dialog unnamed rather than hard-coding a label string.
        const updateDialogLabel = (): void => {
            const title = group.activePanel?.title;
            if (title) {
                overlay.element.setAttribute('aria-label', title);
            } else {
                overlay.element.removeAttribute('aria-label');
            }
        };
        updateDialogLabel();

        floatingGroupPanel.addDisposables(
            group.api.onDidActivePanelChange(() => updateDialogLabel()),
            overlay.onDidChange(() => {
                gridview.layout(gridview.width, gridview.height);
            }),
            overlay.onDidChangeEnd(() => {
                this._host.fireLayoutChange();
            }),
            group.onDidChange((event) => {
                // `event.height` is the group's requested *content* height.
                // When a dedicated title bar is present the overlay's outer
                // box is taller by the header, so add it back to preserve the
                // requested content size.
                overlay.setBounds({
                    height:
                        typeof event?.height === 'number'
                            ? event.height + overlay.headerHeight
                            : event?.height,
                    width: event?.width,
                });
            }),
            {
                dispose: () => {
                    disposable.dispose();
                    remove(this._floatingGroups, floatingGroupPanel);
                    group.model.location = { type: 'grid' };
                },
            }
        );

        this._floatingGroups.push(floatingGroupPanel);
        return floatingGroupPanel;
    }

    findByGroup(
        group: DockviewGroupPanel
    ): DockviewFloatingGroupPanel | undefined {
        // A floating window may host several groups in a nested gridview, so
        // match by membership (DOM containment) rather than only the anchor
        // group. `floating.group === group` covers the brief window before the
        // anchor's element is attached to the gridview.
        return this._floatingGroups.find(
            (floating) =>
                floating.group === group ||
                floating.gridview.element.contains(group.element)
        );
    }

    serialize(): SerializedFloatingGroup[] {
        return this._floatingGroups.map((floating) => {
            const grid = floating.gridview.serialize();
            const position = floating.overlay.toJSON();
            const root = grid.root;

            // A single-group window keeps the legacy `data` shape so layouts
            // round-trip byte-stably and older readers keep working; only
            // genuine multi-group windows emit the nested `grid` form.
            if (
                root.type === 'branch' &&
                root.data.length === 1 &&
                root.data[0].type === 'leaf'
            ) {
                return {
                    data: (
                        root.data[0] as ISerializedLeafNode<GroupPanelViewState>
                    ).data,
                    position,
                };
            }

            return { grid, position };
        });
    }

    constrainBounds(): void {
        for (const floating of this._floatingGroups) {
            floating.overlay.setBounds();
        }
    }

    updateBounds(options: Partial<DockviewOptions>): void {
        if (!('floatingGroupBounds' in options)) {
            return;
        }
        for (const group of this._floatingGroups) {
            switch (options.floatingGroupBounds) {
                case 'boundedWithinViewport':
                    group.overlay.minimumInViewportHeight = undefined;
                    group.overlay.minimumInViewportWidth = undefined;
                    break;
                case undefined:
                    group.overlay.minimumInViewportHeight =
                        DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE;
                    group.overlay.minimumInViewportWidth =
                        DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE;
                    break;
                default:
                    group.overlay.minimumInViewportHeight =
                        options.floatingGroupBounds?.minimumHeightWithinViewport;
                    group.overlay.minimumInViewportWidth =
                        options.floatingGroupBounds?.minimumWidthWithinViewport;
            }
            group.overlay.setBounds();
        }
    }

    disposeAll(): void {
        // Iterate a copy: dispose removes entries from _floatingGroups as it goes.
        for (const floating of [...this._floatingGroups]) {
            floating.dispose();
        }
    }

    dispose(): void {
        this.disposeAll();
    }
}

export const FloatingGroupModule = defineModule<
    'floatingGroupService',
    IFloatingGroupHost
>({
    name: 'FloatingGroup',
    serviceKey: 'floatingGroupService',
    create: (host) => new FloatingGroupService(host),
});
