import type { DockviewApi } from '../api/component.api';
import {
    DockviewComponent,
    type SerializedDockview,
} from '../dockview/dockviewComponent';
import type { DockviewComponentOptions } from '../dockview/options';
import {
    GridviewComponent,
    type SerializedGridviewComponent,
} from '../gridview/gridviewComponent';
import { GridviewPanel } from '../gridview/gridviewPanel';
import { CompositeDisposable } from '../lifecycle';
import type { IFrameworkPart } from '../panel/types';
import { LayoutPriority, Orientation } from '../splitview/splitview';
import {
    DEFAULT_HEADER_SIZE,
    DEFAULT_STATUS_BAR_SIZE,
    DEFAULT_TOOLBAR_SIZE,
    WORKBENCH_EDITOR_COMPONENT,
    WORKBENCH_IDS,
    type WorkbenchBand,
    type WorkbenchBandOptions,
    type WorkbenchComponentOptions,
} from './options';

export interface SerializedWorkbench {
    /** The outer gridview holding the chrome bands and the editor cell. */
    grid: SerializedGridviewComponent;
    /** The embedded dockview (editor area, edge groups included). */
    dockview?: SerializedDockview;
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
 * wrapped around a central dockview editor. This is Phase 1 - the chrome bands
 * and the embedded editor. Side bars, activity bar and the tool panel are added
 * in later phases.
 *
 * The outer frame is a vertical {@link GridviewComponent}; each band is a
 * fixed-height panel (`minimumHeight === maximumHeight`) and the editor is a
 * high-priority panel that absorbs the remaining space.
 */
export class WorkbenchComponent extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private readonly _gridview: GridviewComponent;
    private readonly _dockviewOptions: DockviewComponentOptions;

    private _editorPanel: WorkbenchEditorPanel | undefined;

    get element(): HTMLElement {
        return this._element;
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

    private _bandId(band: WorkbenchBand): string {
        return WORKBENCH_IDS[band];
    }

    setBandVisible(band: WorkbenchBand, visible: boolean): void {
        const panel = this._gridview.getPanel(this._bandId(band));
        if (panel) {
            this._gridview.setVisible(panel, visible);
        }
    }

    isBandVisible(band: WorkbenchBand): boolean {
        const panel = this._gridview.getPanel(this._bandId(band));
        return panel?.api.isVisible ?? false;
    }

    layout(width: number, height: number): void {
        this._gridview.layout(width, height);
    }

    toJSON(): SerializedWorkbench {
        return {
            grid: this._gridview.toJSON(),
            dockview: this._editorPanel?.dockview.toJSON(),
        };
    }

    fromJSON(data: SerializedWorkbench): void {
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
