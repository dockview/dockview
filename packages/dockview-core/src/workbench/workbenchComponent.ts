import type { DockviewApi } from '../api/component.api';
import {
    DockviewComponent,
    type SerializedDockview,
} from '../dockview/dockviewComponent';
import type { DockviewComponentOptions } from '../dockview/options';
import { Emitter, type Event } from '../events';
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
    type ActivityBarPosition,
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
    /** Where the activity bar sits (side rail, or top/bottom strip). */
    activityBarPosition?: ActivityBarPosition;
    /** Which side of the editor the tool panel sits on. */
    panelPosition?: PanelPosition;
    /** Horizontal span of a top/bottom tool panel. */
    panelAlignment?: PanelAlignment;
    /** The active view container shown in the primary side bar. */
    activeViewContainer?: string;
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
 * A VS Code-style workbench: fixed chrome bands (header, status bar) and side
 * regions (activity bar, primary and secondary side bars) wrapped around a
 * central dockview editor.
 *
 * The outer frame is a vertical {@link GridviewComponent}: the header and
 * status bar are full-width fixed-height bands, and the body row between
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
    private _activityBarPosition: ActivityBarPosition = 'default';
    private _panelPosition: PanelPosition = 'bottom';
    private _panelAlignment: PanelAlignment = 'center';
    private _panelOptions: WorkbenchPanelOptions | undefined;
    private _activityBarOptions: WorkbenchActivityBarOptions | undefined;
    private _primarySideBarOptions: WorkbenchSideBarOptions | undefined;
    private _secondarySideBarOptions: WorkbenchSideBarOptions | undefined;
    private _activeViewContainer: string | undefined;
    private _panelMaximized = false;
    /** Ids hidden by the current maximize, to re-show on restore. */
    private _maximizeRestore: string[] = [];

    private readonly _onDidChangeActiveViewContainer = new Emitter<
        string | undefined
    >();
    /** Fires when the active view container (primary side bar view) changes. */
    readonly onDidChangeActiveViewContainer: Event<string | undefined> =
        this._onDidChangeActiveViewContainer.event;

    private readonly _onDidChangePanelMaximized = new Emitter<boolean>();
    /** Fires when the tool panel is maximized or restored. */
    readonly onDidChangePanelMaximized: Event<boolean> =
        this._onDidChangePanelMaximized.event;

    get element(): HTMLElement {
        return this._element;
    }

    get activeViewContainer(): string | undefined {
        return this._activeViewContainer;
    }

    get primarySideBarPosition(): SideBarPosition {
        return this._primarySideBarPosition;
    }

    get activityBarPosition(): ActivityBarPosition {
        return this._activityBarPosition;
    }

    get panelPosition(): PanelPosition {
        return this._panelPosition;
    }

    get panelAlignment(): PanelAlignment {
        return this._panelAlignment;
    }

    get isPanelMaximized(): boolean {
        return this._panelMaximized;
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
        this._activityBarPosition = options.activityBar?.position ?? 'default';
        this._activeViewContainer = options.activeViewContainer;

        this._element = document.createElement('div');
        this._element.className = 'dv-workbench';
        if (options.className) {
            const tokens = options.className.split(/\s+/).filter(Boolean);
            if (tokens.length > 0) {
                this._element.classList.add(...tokens);
            }
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
                const view = options.createComponent(viewOptions);
                // Tag region panels by their reserved id so `workbench.scss`
                // can theme the containers. Keyed off the id (which the grid
                // serializes) exactly as the editor is keyed off its reserved
                // name, so the classes are re-applied on `fromJSON` for free.
                this._tagRegion(viewOptions.id, view);
                return view;
            },
        });

        this.addDisposables(
            this._gridview,
            this._onDidChangeActiveViewContainer,
            this._onDidChangePanelMaximized
        );

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

        if (options.statusBar) {
            this._addBand(
                'statusBar',
                WORKBENCH_IDS.statusBar,
                options.statusBar,
                DEFAULT_STATUS_BAR_SIZE,
                { referencePanel: WORKBENCH_IDS.editor, direction: 'below' }
            );
        }

        // Side regions are added AFTER the full-width bands so they nest into a
        // horizontal branch beside the editor only, leaving the header and
        // status bands spanning the full width.
        this._activityBarOptions = options.activityBar;
        this._primarySideBarOptions = options.primarySideBar;
        this._secondarySideBarOptions = options.secondarySideBar;
        this._addSideRegions();

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

    /**
     * Add the activity bar and side bars in the flat body arrangement (beside
     * the editor). A `left`/`right`-aligned panel later pulls the same-side
     * bars into the editor column so the panel spans them; this method always
     * produces the un-nested baseline, so it is also the reset step of a
     * panel re-alignment.
     */
    private _addSideRegions(): void {
        const primarySide = this._primarySideBarPosition;
        const oppositeSide: SideBarPosition =
            primarySide === 'left' ? 'right' : 'left';

        if (this._primarySideBarOptions) {
            this._addSideBar(
                WORKBENCH_IDS.primarySideBar,
                this._primarySideBarOptions,
                { referencePanel: WORKBENCH_IDS.editor, direction: primarySide }
            );
        }

        if (this._activityBarOptions) {
            // A `default` rail sits outside the primary side bar (or beside the
            // editor when there is no side bar). `top`/`bottom` stack the strip
            // into the primary side bar's column instead.
            const reference = this._primarySideBarOptions
                ? WORKBENCH_IDS.primarySideBar
                : WORKBENCH_IDS.editor;
            const direction =
                this._activityBarPosition === 'top'
                    ? 'above'
                    : this._activityBarPosition === 'bottom'
                      ? 'below'
                      : primarySide;
            this._addActivityBar(this._activityBarOptions, {
                referencePanel: reference,
                direction,
            });
        }

        if (this._secondarySideBarOptions) {
            this._addSideBar(
                WORKBENCH_IDS.secondarySideBar,
                this._secondarySideBarOptions,
                {
                    referencePanel: WORKBENCH_IDS.editor,
                    direction: oppositeSide,
                }
            );
        }
    }

    private _removeSideRegions(): void {
        for (const id of [
            WORKBENCH_IDS.secondarySideBar,
            WORKBENCH_IDS.activityBar,
            WORKBENCH_IDS.primarySideBar,
        ]) {
            const panel = this._gridview.getPanel(id);
            if (panel) {
                this._gridview.removePanel(panel);
            }
        }
    }

    /** True when the activity bar is stacked into the primary side bar column. */
    private _activityBarIsStacked(): boolean {
        return (
            this._activityBarOptions !== undefined &&
            this._activityBarPosition !== 'default'
        );
    }

    /**
     * The body-row side-bar ids sitting on the given side of the editor, in
     * visual left-to-right order, that a `left`/`right`-aligned panel can span
     * by pulling into the editor column.
     *
     * When the activity bar is stacked (top/bottom) it shares a vertical branch
     * with the primary side bar; that column can't be pulled into the editor
     * column without stranding the activity strip, so the primary's side is
     * reported as un-spannable (empty) and the panel spans the editor only
     * there. The opposite (secondary) side is always a plain body column.
     */
    private _sideBarsOnSide(side: SideBarPosition): string[] {
        const present = (id: string): boolean =>
            this._gridview.getPanel(id) !== undefined;
        const filter = (ids: string[]): string[] => ids.filter(present);

        const primarySide = this._primarySideBarPosition;

        if (side === primarySide) {
            if (this._activityBarIsStacked()) {
                return [];
            }
            // activity sits outside the primary side bar on that side
            return primarySide === 'left'
                ? filter([
                      WORKBENCH_IDS.activityBar,
                      WORKBENCH_IDS.primarySideBar,
                  ])
                : filter([
                      WORKBENCH_IDS.primarySideBar,
                      WORKBENCH_IDS.activityBar,
                  ]);
        }
        return filter([WORKBENCH_IDS.secondarySideBar]);
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
        if (options.visible === false) {
            this._setPanelVisible(id, false);
        }
    }

    private _addActivityBar(
        options: WorkbenchActivityBarOptions,
        position: {
            referencePanel: string;
            direction: 'left' | 'right' | 'above' | 'below';
        }
    ): void {
        const size = options.size ?? DEFAULT_ACTIVITY_BAR_SIZE;
        // A vertical rail (left/right) is fixed width; a top/bottom strip
        // (above/below) is fixed height. Lock minimum === maximum on that axis.
        const horizontal =
            position.direction === 'above' || position.direction === 'below';
        this._gridview.addPanel({
            id: WORKBENCH_IDS.activityBar,
            component: options.component,
            params: options.params,
            ...(horizontal
                ? { minimumHeight: size, maximumHeight: size }
                : { minimumWidth: size, maximumWidth: size }),
            priority: LayoutPriority.Low,
            snap: false,
            size,
            position,
        });
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
            // center / left / right: nest the panel with the editor column
            // (spanning the editor only for now); a left/right span then pulls
            // the same-side bars into that column below.
            add.position = {
                referencePanel: WORKBENCH_IDS.editor,
                direction: position === 'bottom' ? 'below' : 'above',
            };
        }

        this._gridview.addPanel(add);

        if (
            (position === 'bottom' || position === 'top') &&
            (alignment === 'left' || alignment === 'right')
        ) {
            this._spanPanelOverSide(alignment);
        }
    }

    /**
     * Extend a centred top/bottom panel to span the editor plus the side bars
     * on `side`, by pulling those bars into the editor's column (so the panel,
     * which sits below/above that column, spans them too). The opposite side's
     * bars stay full height. Uses `moveGroup`, which re-resolves the reference
     * after removing the moved bar, so these cross-branch moves are index-safe.
     */
    private _spanPanelOverSide(side: SideBarPosition): void {
        const bars = this._sideBarsOnSide(side);
        // 'left': pull bars to the left of the editor, right-to-left, chaining
        //   the reference so the final order stays [bars..., editor].
        // 'right': pull bars to the right, left-to-right, chaining likewise.
        const ordered = side === 'left' ? [...bars].reverse() : bars;
        let referenceId: string = WORKBENCH_IDS.editor;
        for (const barId of ordered) {
            const reference = this._gridview.getPanel(referenceId);
            const bar = this._gridview.getPanel(barId);
            if (reference && bar) {
                this._gridview.moveGroup(reference, barId, side);
                referenceId = barId;
            }
        }
    }

    /** Move the tool panel to a different side of the editor. */
    setPanelPosition(position: PanelPosition): void {
        if (position === this._panelPosition || !this._panelOptions) {
            return;
        }
        this._panelPosition = position;
        this._rebuildBody();
    }

    /** Change how a top/bottom tool panel spans horizontally. */
    setPanelAlignment(alignment: PanelAlignment): void {
        if (alignment === this._panelAlignment || !this._panelOptions) {
            return;
        }
        this._panelAlignment = alignment;
        this._rebuildBody();
    }

    /** Move the activity bar to a side rail (`default`) or a top/bottom strip. */
    setActivityBarPosition(position: ActivityBarPosition): void {
        if (
            position === this._activityBarPosition ||
            !this._activityBarOptions
        ) {
            return;
        }
        this._activityBarPosition = position;
        this._rebuildBody();
    }

    /** Toggle the tool panel between maximized and its previous layout. */
    toggleMaximizedPanel(): void {
        this.setPanelMaximized(!this._panelMaximized);
    }

    /**
     * Maximize the tool panel so it fills the body, hiding the editor and side
     * regions, or restore them. The editor and side bars are collapsed with
     * `setVisible`, which remembers their sizes, so restoring returns to the
     * previous layout exactly. Only regions that were visible are re-shown, so a
     * side bar the user had already hidden stays hidden. This is a transient
     * mode: it is not serialized, and any layout change (position, alignment,
     * activity-bar move or flip) restores first.
     */
    setPanelMaximized(maximized: boolean): void {
        if (maximized === this._panelMaximized || !this._panelOptions) {
            return;
        }
        const panel = this._gridview.getPanel(WORKBENCH_IDS.panel);
        if (!panel) {
            return;
        }

        if (maximized) {
            // reveal the panel itself, then collapse everything around it
            this._setPanelVisible(WORKBENCH_IDS.panel, true);
            this._maximizeRestore = [];
            for (const id of [
                WORKBENCH_IDS.editor,
                WORKBENCH_IDS.activityBar,
                WORKBENCH_IDS.primarySideBar,
                WORKBENCH_IDS.secondarySideBar,
            ]) {
                const region = this._gridview.getPanel(id);
                if (region?.api.isVisible) {
                    this._gridview.setVisible(region, false);
                    this._maximizeRestore.push(id);
                }
            }
        } else {
            for (const id of this._maximizeRestore) {
                const region = this._gridview.getPanel(id);
                if (region) {
                    this._gridview.setVisible(region, true);
                }
            }
            this._maximizeRestore = [];
        }

        this._panelMaximized = maximized;
        this._onDidChangePanelMaximized.fire(maximized);
    }

    /**
     * Rebuild the body's side regions and tool panel in place. Used after a
     * panel position/alignment change, an activity-bar reposition, or a flip
     * that the flat-row reversal can't express: a `left`/`right` span nests the
     * same-side bars into the editor column and a stacked activity bar nests
     * into the primary side bar column, so those structures must be torn down
     * and re-added. The editor is never touched, so the dockview is preserved;
     * the side bar / panel / activity bar components are re-created (their
     * content re-initialises). Per-region visibility is captured and restored.
     */
    private _rebuildBody(): void {
        // A layout change exits maximize first, so the captured visibility below
        // reflects the real per-region state rather than the collapsed one.
        this.setPanelMaximized(false);

        const wasVisible = (region: WorkbenchRegion): boolean =>
            this.isRegionVisible(region);
        const visibility = {
            panel: wasVisible('panel'),
            activityBar: wasVisible('activityBar'),
            primarySideBar: wasVisible('primarySideBar'),
            secondarySideBar: wasVisible('secondarySideBar'),
        };

        const existing = this._gridview.getPanel(WORKBENCH_IDS.panel);
        if (existing) {
            this._gridview.removePanel(existing);
        }
        this._removeSideRegions();

        this._addSideRegions();
        this._addPanel();

        // Restore any regions that were hidden before the rebuild.
        for (const region of [
            'activityBar',
            'primarySideBar',
            'secondarySideBar',
            'panel',
        ] as const) {
            if (!visibility[region]) {
                this.setRegionVisible(region, false);
            }
        }
    }

    /**
     * True when the tool panel occupies the body row (the horizontal branch
     * beside the editor), rather than sitting at the workbench root. A
     * top/bottom `justify` panel is a full-width root row; every other panel
     * placement is in the body: `left`/`right` positions are body siblings, and
     * a `center`/`left`/`right`-aligned top/bottom panel is nested into the
     * editor column. A flip cannot be expressed as a flat body-row reversal
     * while the panel is in the body, so those cases rebuild instead.
     */
    private _panelIsInBody(): boolean {
        if (!this._panelOptions) {
            return false;
        }
        const topOrBottom =
            this._panelPosition === 'bottom' || this._panelPosition === 'top';
        return !(topOrBottom && this._panelAlignment === 'justify');
    }

    /**
     * Flip the primary side bar (and the activity bar that tracks it) to the
     * given side. The secondary side bar mirrors to the opposite side.
     *
     * With no body panel (or only a full-width `justify` panel at the root) the
     * body is a flat `[bars…, editor, bars…]` row, so the flip is a reversal of
     * that row done with a sequence of "move to the front" operations: each move
     * sends a panel to the far left, which never crosses its own removal point,
     * so it sidesteps the stale-index hazard of a single right-crossing move.
     * Side bars are moved, not recreated, so their contents and widths survive.
     *
     * When the row is no longer flat — a body panel is present
     * ({@link _panelIsInBody}: a centred/aligned panel nested into the editor
     * column, or a left/right panel as an extra sibling), or the activity bar
     * is stacked into the primary side bar column
     * ({@link _activityBarIsStacked}) — the reversal cannot express the flip, so
     * those cases rebuild the body (like a panel re-alignment does), which
     * re-creates the side bar components.
     */
    setPrimarySideBarPosition(position: SideBarPosition): void {
        if (position === this._primarySideBarPosition) {
            return;
        }
        // A flip is a layout change; exit maximize so the reversal below runs
        // against the real (visible) body rather than the collapsed one.
        this.setPanelMaximized(false);

        const oldPosition = this._primarySideBarPosition;
        this._primarySideBarPosition = position;

        if (this._panelIsInBody() || this._activityBarIsStacked()) {
            this._rebuildBody();
            return;
        }

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
    private _tagRegion(id: string, panel: GridviewPanel): void {
        const className = REGION_CLASS[id];
        if (className) {
            panel.element.classList.add('dv-workbench-region', className);
        }
    }

    /**
     * Select the active view container shown in the primary side bar (the
     * view an activity-bar item maps to). Reveals the primary side bar if it is
     * hidden, and fires {@link onDidChangeActiveViewContainer} so the side bar
     * component can render the selected view. Selecting the already-active
     * container while the side bar is visible toggles it shut, matching VS
     * Code's activity-bar behaviour.
     */
    setActiveViewContainer(id: string): void {
        const sideBarVisible = this.isRegionVisible('primarySideBar');

        if (id === this._activeViewContainer && sideBarVisible) {
            this.setRegionVisible('primarySideBar', false);
            return;
        }

        const changed = id !== this._activeViewContainer;
        this._activeViewContainer = id;

        if (!sideBarVisible) {
            this.setRegionVisible('primarySideBar', true);
        }

        if (changed) {
            this._onDidChangeActiveViewContainer.fire(id);
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
        // Maximize is a transient mode and is not serialized. If it is active
        // the editor and side bars are collapsed, so restore them for the
        // snapshot and re-maximize afterwards, capturing the real layout.
        const wasMaximized = this._panelMaximized;
        if (wasMaximized) {
            this.setPanelMaximized(false);
        }
        const json: SerializedWorkbench = {
            grid: this._gridview.toJSON(),
            dockview: this._editorPanel?.dockview.toJSON(),
            primarySideBarPosition: this._primarySideBarPosition,
            activityBarPosition: this._activityBarPosition,
            panelPosition: this._panelPosition,
            panelAlignment: this._panelAlignment,
            activeViewContainer: this._activeViewContainer,
        };
        if (wasMaximized) {
            this.setPanelMaximized(true);
        }
        return json;
    }

    fromJSON(data: SerializedWorkbench): void {
        // The serialized grid tree already encodes the flipped side-bar order
        // and the panel placement; keep our tracked state in sync so later
        // flips/re-alignments start from the right structure.
        this._primarySideBarPosition = data.primarySideBarPosition ?? 'left';
        this._activityBarPosition = data.activityBarPosition ?? 'default';
        this._panelPosition = data.panelPosition ?? 'bottom';
        this._panelAlignment = data.panelAlignment ?? 'center';
        this._activeViewContainer = data.activeViewContainer;
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
