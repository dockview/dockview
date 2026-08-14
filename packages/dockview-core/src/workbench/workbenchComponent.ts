import type { DockviewApi } from '../api/component.api';
import {
    DockviewComponent,
    type SerializedDockview,
} from '../dockview/dockviewComponent';
import type { DockviewComponentOptions } from '../dockview/options';
import {
    type AddGridviewComponentOptions,
    GridviewComponent,
    type SerializedGridviewComponent,
} from '../gridview/gridviewComponent';
import { GridviewPanel } from '../gridview/gridviewPanel';
import { CompositeDisposable } from '../lifecycle';
import type { IFrameworkPart } from '../panel/types';
import { LayoutPriority, Orientation } from '../splitview/splitview';
import {
    DEFAULT_ACTIVITY_BAR_SIZE,
    DEFAULT_HEADER_SIZE,
    DEFAULT_PANEL_MINIMUM_SIZE,
    DEFAULT_PANEL_SIZE,
    DEFAULT_SIDE_BAR_MINIMUM_SIZE,
    DEFAULT_SIDE_BAR_SIZE,
    DEFAULT_STATUS_BAR_SIZE,
    DEFAULT_TOOLBAR_SIZE,
    type PanelAlignment,
    type PanelPosition,
    type SideBarPosition,
    WORKBENCH_EDITOR_COMPONENT,
    WORKBENCH_IDS,
    type WorkbenchActivityBarOptions,
    type WorkbenchBand,
    type WorkbenchBandOptions,
    type WorkbenchComponentOptions,
    type WorkbenchPanelOptions,
    type WorkbenchRegion,
    type WorkbenchSideBarOptions,
} from './options';

/**
 * CSS class applied to each region's panel element so the theme
 * (`workbench.scss`) can style the region containers.
 */
const REGION_CLASS: Record<string, string> = {
    [WORKBENCH_IDS.header]: 'dv-workbench-header',
    [WORKBENCH_IDS.toolbar]: 'dv-workbench-toolbar',
    [WORKBENCH_IDS.statusBar]: 'dv-workbench-status-bar',
    [WORKBENCH_IDS.activityBar]: 'dv-workbench-activity-bar',
    [WORKBENCH_IDS.primarySideBar]: 'dv-workbench-primary-side-bar',
    [WORKBENCH_IDS.secondarySideBar]: 'dv-workbench-secondary-side-bar',
    [WORKBENCH_IDS.panel]: 'dv-workbench-panel',
};

export interface SerializedWorkbench {
    /** The outer gridview holding the chrome bands and the editor cell. */
    grid: SerializedGridviewComponent;
    /** The embedded dockview (editor area, edge groups included). */
    dockview?: SerializedDockview;
    /** Which side the primary side bar (and its activity bar) sits on. */
    primarySideBarPosition?: SideBarPosition;
    /** Which side of the editor the tool panel sits on. */
    panelPosition?: PanelPosition;
    /** Horizontal span of a top/bottom tool panel. */
    panelAlignment?: PanelAlignment;
}

/**
 * The editor cell. A plain gridview panel whose element hosts a full
 * {@link DockviewComponent}. Layout is forwarded to the dockview so the editor
 * tracks the cell size deterministically, independent of the shell's own
 * resize observer.
 */
export class WorkbenchEditorPanel extends GridviewPanel {
    private readonly _dockview: DockviewComponent;

    get dockview(): DockviewComponent {
        return this._dockview;
    }

    constructor(
        id: string,
        component: string,
        dockviewOptions: DockviewComponentOptions
    ) {
        super(id, component, {
            minimumWidth: 100,
            minimumHeight: 100,
        });

        this.element.classList.add('dv-workbench-editor');

        // The dockview mounts its shell (edge groups included) into this cell.
        this._dockview = new DockviewComponent(this.element, dockviewOptions);

        this.api.initialize(this);
    }

    getComponent(): IFrameworkPart {
        return {
            update: () => {
                // the editor has no framework params to update
            },
            dispose: () => {
                this._dockview.dispose();
            },
        };
    }

    override layout(width: number, height: number): void {
        super.layout(width, height);
        this._dockview.layout(width, height);
    }
}

/**
 * A VS Code-style workbench: fixed chrome bands (header, toolbar, status bar)
 * and side regions (activity bar, primary and secondary side bars) wrapped
 * around a central dockview editor.
 *
 * The outer frame is a vertical {@link GridviewComponent}: the header, toolbar
 * and status bar are full-width fixed-height bands, and the body row between
 * them nests a horizontal branch holding the activity bar, primary side bar,
 * editor and secondary side bar. The editor is the one high-priority panel, so
 * it absorbs all spare space; the bands and rails are fixed or snap-collapsible.
 *
 * The activity bar and primary side bar move together and can be flipped to
 * either side; the secondary side bar always sits opposite them.
 */
export class WorkbenchComponent extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private readonly _gridview: GridviewComponent;
    private readonly _dockviewOptions: DockviewComponentOptions;

    private _editorPanel: WorkbenchEditorPanel | undefined;
    private _primarySideBarPosition: SideBarPosition;
    private _panelPosition: PanelPosition = 'bottom';
    private _panelAlignment: PanelAlignment = 'center';
    private _panelOptions: WorkbenchPanelOptions | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    get primarySideBarPosition(): SideBarPosition {
        return this._primarySideBarPosition;
    }

    get panelPosition(): PanelPosition {
        return this._panelPosition;
    }

    get panelAlignment(): PanelAlignment {
        return this._panelAlignment;
    }

    get dockview(): DockviewApi {
        if (!this._editorPanel) {
            throw new Error('dockview: workbench editor is not initialised');
        }
        return this._editorPanel.dockview.api;
    }

    constructor(container: HTMLElement, options: WorkbenchComponentOptions) {
        super();

        this._dockviewOptions = options.dockview;
        this._primarySideBarPosition = options.primarySideBarPosition ?? 'left';

        this._element = document.createElement('div');
        this._element.className = 'dv-workbench';
        if (options.className) {
            this._element.classList.add(...options.className.split(' '));
        }
        this._element.style.height = '100%';
        this._element.style.width = '100%';
        container.appendChild(this._element);

        this._gridview = new GridviewComponent(this._element, {
            orientation: Orientation.VERTICAL,
            proportionalLayout: false,
            createComponent: (viewOptions) => {
                if (viewOptions.name === WORKBENCH_EDITOR_COMPONENT) {
                    const panel = new WorkbenchEditorPanel(
                        viewOptions.id,
                        viewOptions.name,
                        this._dockviewOptions
                    );
                    this._editorPanel = panel;
                    return panel;
                }
                return options.createComponent(viewOptions);
            },
        });

        this.addDisposables(this._gridview);

        // Establish an initial size before adding panels; the gridview
        // distributes sizes at add-time and needs non-negative bounds.
        this._gridview.layout(
            container.clientWidth || 0,
            container.clientHeight || 0
        );

        // Editor first - it is the reference all bands anchor to.
        this._gridview.addPanel({
            id: WORKBENCH_IDS.editor,
            component: WORKBENCH_EDITOR_COMPONENT,
            priority: LayoutPriority.High,
        });

        if (options.header) {
            this._addBand(
                'header',
                WORKBENCH_IDS.header,
                options.header,
                DEFAULT_HEADER_SIZE,
                { referencePanel: WORKBENCH_IDS.editor, direction: 'above' }
            );
        }

        if (options.toolbar) {
            this._addBand(
                'toolbar',
                WORKBENCH_IDS.toolbar,
                options.toolbar,
                DEFAULT_TOOLBAR_SIZE,
                { referencePanel: WORKBENCH_IDS.editor, direction: 'below' }
            );
        }

        if (options.statusBar) {
            this._addBand(
                'statusBar',
                WORKBENCH_IDS.statusBar,
                options.statusBar,
                DEFAULT_STATUS_BAR_SIZE,
                {
                    // sit below the toolbar when present, else below the editor
                    referencePanel: options.toolbar
                        ? WORKBENCH_IDS.toolbar
                        : WORKBENCH_IDS.editor,
                    direction: 'below',
                }
            );
        }

        // Side regions are added AFTER the full-width bands so they nest into a
        // horizontal branch beside the editor only, leaving the header/toolbar/
        // status bands spanning the full width.
        const pos = this._primarySideBarPosition;
        const primarySide = pos; // 'left' | 'right'
        const oppositeSide: SideBarPosition = pos === 'left' ? 'right' : 'left';

        if (options.primarySideBar) {
            this._addSideBar(
                WORKBENCH_IDS.primarySideBar,
                options.primarySideBar,
                {
                    referencePanel: WORKBENCH_IDS.editor,
                    direction: primarySide,
                }
            );
        }

        if (options.activityBar) {
            // The rail sits outside the primary side bar (or beside the editor
            // when there is no side bar).
            this._addActivityBar(options.activityBar, {
                referencePanel: options.primarySideBar
                    ? WORKBENCH_IDS.primarySideBar
                    : WORKBENCH_IDS.editor,
                direction: primarySide,
            });
        }

        if (options.secondarySideBar) {
            this._addSideBar(
                WORKBENCH_IDS.secondarySideBar,
                options.secondarySideBar,
                {
                    referencePanel: WORKBENCH_IDS.editor,
                    direction: oppositeSide,
                }
            );
        }

        if (options.panel) {
            this._panelOptions = options.panel;
            this._panelPosition = options.panel.position ?? 'bottom';
            this._panelAlignment = options.panel.alignment ?? 'center';
            this._addPanel();
            if (options.panel.visible === false) {
                this._setPanelVisible(WORKBENCH_IDS.panel, false);
            }
        }
    }

    private _addBand(
        band: WorkbenchBand,
        id: string,
        options: WorkbenchBandOptions,
        defaultSize: number,
        position: { referencePanel: string; direction: 'above' | 'below' }
    ): void {
        const size = options.size ?? defaultSize;
        this._gridview.addPanel({
            id,
            component: options.component,
            params: options.params,
            // fixed height: lock minimum === maximum
            minimumHeight: size,
            maximumHeight: size,
            priority: LayoutPriority.Low,
            snap: false,
            size,
            position,
        });
        this._tagRegion(id);
        if (options.visible === false) {
            this.setBandVisible(band, false);
        }
    }

    private _addSideBar(
        id: string,
        options: WorkbenchSideBarOptions,
        position: { referencePanel: string; direction: 'left' | 'right' }
    ): void {
        const size = options.size ?? DEFAULT_SIDE_BAR_SIZE;
        this._gridview.addPanel({
            id,
            component: options.component,
            params: options.params,
            minimumWidth: options.minimumWidth ?? DEFAULT_SIDE_BAR_MINIMUM_SIZE,
            priority: LayoutPriority.Low,
            // snap so the sash can collapse the side bar shut, VS Code style
            snap: true,
            size,
            position,
        });
        this._tagRegion(id);
        if (options.visible === false) {
            this._setPanelVisible(id, false);
        }
    }

    private _addActivityBar(
        options: WorkbenchActivityBarOptions,
        position: { referencePanel: string; direction: 'left' | 'right' }
    ): void {
        const size = options.size ?? DEFAULT_ACTIVITY_BAR_SIZE;
        this._gridview.addPanel({
            id: WORKBENCH_IDS.activityBar,
            component: options.component,
            params: options.params,
            // fixed width: lock minimum === maximum
            minimumWidth: size,
            maximumWidth: size,
            priority: LayoutPriority.Low,
            snap: false,
            size,
            position,
        });
        this._tagRegion(WORKBENCH_IDS.activityBar);
        if (options.visible === false) {
            this._setPanelVisible(WORKBENCH_IDS.activityBar, false);
        }
    }

    /**
     * Root-level index the body row occupies (the header, if present, always
     * sits above it). A `justify` panel is inserted at the root, just below or
     * above the body, so it spans the full width past the side bars.
     */
    private _rootBodyIndex(): number {
        return this._gridview.getPanel(WORKBENCH_IDS.header) ? 1 : 0;
    }

    private _addPanel(): void {
        const options = this._panelOptions;
        if (!options) {
            return;
        }

        const position = this._panelPosition;
        const alignment = this._panelAlignment;
        const size = options.size ?? DEFAULT_PANEL_SIZE;
        const minimum = options.minimumSize ?? DEFAULT_PANEL_MINIMUM_SIZE;
        const horizontal = position === 'left' || position === 'right';

        const add: AddGridviewComponentOptions = {
            id: WORKBENCH_IDS.panel,
            component: options.component,
            params: options.params,
            priority: LayoutPriority.Low,
            snap: true,
            size,
            // constrain on the panel's resize axis so the sash has room to snap
            ...(horizontal
                ? { minimumWidth: minimum }
                : { minimumHeight: minimum }),
        };

        if (position === 'left' || position === 'right') {
            // Beside the editor, inside the horizontal body branch.
            add.position = {
                referencePanel: WORKBENCH_IDS.editor,
                direction: position,
            };
        } else if (alignment === 'justify') {
            // Full-width row at the root, below/above the whole body branch.
            const bodyIndex = this._rootBodyIndex();
            add.location =
                position === 'bottom' ? [bodyIndex + 1] : [bodyIndex];
        } else {
            // center (and the not-yet-implemented left/right spans): nest the
            // panel with the editor so it spans the editor column only.
            add.position = {
                referencePanel: WORKBENCH_IDS.editor,
                direction: position === 'bottom' ? 'below' : 'above',
            };
        }

        this._gridview.addPanel(add);
        this._tagRegion(WORKBENCH_IDS.panel);
    }

    /** Move the tool panel to a different side of the editor. */
    setPanelPosition(position: PanelPosition): void {
        if (position === this._panelPosition || !this._panelOptions) {
            return;
        }
        this._panelPosition = position;
        this._rebuildPanel();
    }

    /** Change how a top/bottom tool panel spans horizontally. */
    setPanelAlignment(alignment: PanelAlignment): void {
        if (alignment === this._panelAlignment || !this._panelOptions) {
            return;
        }
        this._panelAlignment = alignment;
        this._rebuildPanel();
    }

    /**
     * Re-place the tool panel after a position/alignment change. The panel view
     * is recreated (its target location in the grid tree changes), so its
     * component is re-instantiated via `createComponent`.
     */
    private _rebuildPanel(): void {
        const existing = this._gridview.getPanel(WORKBENCH_IDS.panel);
        if (!existing) {
            return;
        }
        const wasVisible = existing.api.isVisible;
        this._gridview.removePanel(existing);
        this._addPanel();
        if (!wasVisible) {
            this._setPanelVisible(WORKBENCH_IDS.panel, false);
        }
    }

    /**
     * Flip the primary side bar (and the activity bar that tracks it) to the
     * given side. The secondary side bar mirrors to the opposite side. Panels
     * are moved, not recreated, so their contents and widths are preserved.
     *
     * A flip is simply a reversal of the body row's left-to-right order. It is
     * done with a sequence of "move to the front" operations: each move sends a
     * panel to the far left, which never crosses its own removal point, so it
     * sidesteps the stale-index hazard of a single right-crossing move.
     */
    setPrimarySideBarPosition(position: SideBarPosition): void {
        if (position === this._primarySideBarPosition) {
            return;
        }
        const oldPosition = this._primarySideBarPosition;
        this._primarySideBarPosition = position;

        // The body order for the OLD position, absent regions filtered out.
        const orderedIds =
            oldPosition === 'left'
                ? [
                      WORKBENCH_IDS.activityBar,
                      WORKBENCH_IDS.primarySideBar,
                      WORKBENCH_IDS.editor,
                      WORKBENCH_IDS.secondarySideBar,
                  ]
                : [
                      WORKBENCH_IDS.secondarySideBar,
                      WORKBENCH_IDS.editor,
                      WORKBENCH_IDS.primarySideBar,
                      WORKBENCH_IDS.activityBar,
                  ];

        const present = orderedIds
            .map((id) => this._gridview.getPanel(id))
            .filter((panel): panel is GridviewPanel => panel !== undefined);

        if (present.length < 2) {
            return;
        }

        // Reverse by moving each panel (after the first) to the left of the
        // running leftmost panel.
        let leftmost = present[0];
        for (let i = 1; i < present.length; i++) {
            const panel = present[i];
            this._gridview.movePanel(panel, {
                direction: 'left',
                reference: leftmost.id,
                size: panel.width || undefined,
            });
            leftmost = panel;
        }
    }

    private _setPanelVisible(id: string, visible: boolean): void {
        const panel = this._gridview.getPanel(id);
        if (panel) {
            this._gridview.setVisible(panel, visible);
        }
    }

    /** Tag a region's panel element so `workbench.scss` can style it. */
    private _tagRegion(id: string): void {
        const className = REGION_CLASS[id];
        const panel = this._gridview.getPanel(id);
        if (className && panel) {
            panel.element.classList.add('dv-workbench-region', className);
        }
    }

    setRegionVisible(region: WorkbenchRegion, visible: boolean): void {
        this._setPanelVisible(WORKBENCH_IDS[region], visible);
    }

    isRegionVisible(region: WorkbenchRegion): boolean {
        const panel = this._gridview.getPanel(WORKBENCH_IDS[region]);
        return panel?.api.isVisible ?? false;
    }

    setBandVisible(band: WorkbenchBand, visible: boolean): void {
        this.setRegionVisible(band, visible);
    }

    isBandVisible(band: WorkbenchBand): boolean {
        return this.isRegionVisible(band);
    }

    layout(width: number, height: number): void {
        this._gridview.layout(width, height);
    }

    toJSON(): SerializedWorkbench {
        return {
            grid: this._gridview.toJSON(),
            dockview: this._editorPanel?.dockview.toJSON(),
            primarySideBarPosition: this._primarySideBarPosition,
            panelPosition: this._panelPosition,
            panelAlignment: this._panelAlignment,
        };
    }

    fromJSON(data: SerializedWorkbench): void {
        // The serialized grid tree already encodes the flipped side-bar order
        // and the panel placement; keep our tracked state in sync so later
        // flips/re-alignments start from the right structure.
        this._primarySideBarPosition = data.primarySideBarPosition ?? 'left';
        this._panelPosition = data.panelPosition ?? 'bottom';
        this._panelAlignment = data.panelAlignment ?? 'center';
        // Rebuilds the outer grid, which re-creates the editor panel (and a
        // fresh dockview) through createComponent, repointing _editorPanel.
        this._gridview.fromJSON(data.grid);
        if (data.dockview && this._editorPanel) {
            this._editorPanel.dockview.fromJSON(data.dockview);
        }
    }

    override dispose(): void {
        super.dispose();
        this._element.remove();
    }
}
