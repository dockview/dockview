import {
    CompositeDisposable,
    Disposable,
    IDisposable,
    MutableDisposable,
} from '../../../lifecycle';
import { Emitter, Event } from '../../../events';
import { trackFocus } from '../../../dom';
import { IDockviewPanel } from '../../dockviewPanel';
import { DockviewComponent } from '../../dockviewComponent';
import {
    Droptarget,
    DropTargetLivePreview,
    DropTargetScopeArgs,
    IDropTarget,
    Position,
} from '../../../dnd/droptarget';
import { pointerBackend } from '../../../dnd/backend';
import { DockviewGroupPanelModel } from '../../dockviewGroupPanelModel';
import { Size } from '../../../types';

let _contentId = 0;
/** Stable DOM id so each tab's `aria-controls` can reference its tabpanel. */
const nextContentId = (): string => `dv-tabpanel-${_contentId++}`;

export interface IContentContainer extends IDisposable {
    // `Droptarget` here (not `IDropTarget`) because overlayRenderContainer
    // forwards HTML5 drag events through `dropTarget.dnd` (the inner
    // DragAndDropObserver), which has no pointer-backend equivalent.
    readonly dropTarget: Droptarget;
    readonly pointerDropTarget: IDropTarget;
    onDidFocus: Event<void>;
    onDidBlur: Event<void>;
    /**
     * The content box most recently handed to `layout()` (group box minus
     * header extent), `undefined` until the group has been laid out. The
     * overlay render container sizes `renderer: 'always'` content from it.
     */
    readonly dimensions: Size | undefined;
    readonly onDidDimensionsChange: Event<Size>;
    element: HTMLElement;
    layout(width: number, height: number): void;
    openPanel: (panel: IDockviewPanel) => void;
    closePanel: () => void;
    show(): void;
    hide(): void;
    renderPanel(panel: IDockviewPanel, options: { asActive: boolean }): void;
    refreshFocusState(): void;
    setLabelledBy(tabElementId: string | undefined): void;
}

export class ContentContainer
    extends CompositeDisposable
    implements IContentContainer
{
    private readonly _element: HTMLElement;
    private panel: IDockviewPanel | undefined;
    private readonly disposable = new MutableDisposable();
    private focusTracker: { refreshState?(): void } | undefined;

    private readonly _onDidFocus = new Emitter<void>();
    readonly onDidFocus: Event<void> = this._onDidFocus.event;

    private readonly _onDidBlur = new Emitter<void>();
    readonly onDidBlur: Event<void> = this._onDidBlur.event;

    private _dimensions: Size | undefined;
    private readonly _onDidDimensionsChange = new Emitter<Size>();
    readonly onDidDimensionsChange: Event<Size> =
        this._onDidDimensionsChange.event;

    get element(): HTMLElement {
        return this._element;
    }

    get dimensions(): Size | undefined {
        return this._dimensions;
    }

    readonly dropTarget: Droptarget;
    readonly pointerDropTarget: IDropTarget;

    constructor(
        private readonly accessor: DockviewComponent,
        private readonly group: DockviewGroupPanelModel
    ) {
        super();
        this._element = document.createElement('div');
        this._element.className = 'dv-content-container';
        this._element.tabIndex = -1;
        // WAI-ARIA Tabs pattern: the single content area per group is the
        // tabpanel; `aria-labelledby` is pointed at the active tab in
        // `setLabelledBy` (driven from the group model on activation).
        this._element.id = nextContentId();
        this._element.setAttribute('role', 'tabpanel');

        this.addDisposables(
            this._onDidFocus,
            this._onDidBlur,
            this._onDidDimensionsChange
        );

        // Resolve the override anchor dynamically: a group can be relocated
        // between roots (grid / floating / popout) after construction, and the
        // popout anchor in particular lives in another window, so a value
        // captured here would mount overlays in the wrong window.
        const getOverrideTarget = () => group.dropTargetContainer?.model;

        const getScope = (args: DropTargetScopeArgs) =>
            accessor.resolveBranchDropScope?.(group.id, args);
        const livePreview = (preview: DropTargetLivePreview) =>
            accessor.showLiveDropPreview?.(group.id, preview) ?? false;

        const canDisplayOverlay = (
            event: DragEvent | PointerEvent,
            position: Position
        ): boolean => this.group.canDisplayContentOverlay(event, position);

        // `dropTarget` stays the concrete `Droptarget` (not via the backend
        // factory) because overlayRenderContainer forwards HTML5 drag events
        // through `dropTarget.dnd`, and that field is not part of `IDropTarget`.
        this.dropTarget = new Droptarget(this.element, {
            getOverlayOutline: () => {
                return accessor.options.theme?.dndPanelOverlay === 'group'
                    ? this.element.parentElement
                    : null;
            },
            className: 'dv-drop-target-content',
            acceptedTargetZones: ['top', 'bottom', 'left', 'right', 'center'],
            canDisplayOverlay,
            getOverrideTarget,
            overlayModel: this.accessor.resolveDropOverlayModel?.('content'),
            getPositionResolver: () =>
                accessor.getDropPositionResolver?.(group.id),
            getScope,
            livePreview,
        });

        this.pointerDropTarget = pointerBackend.createDropTarget(this.element, {
            acceptedTargetZones: ['top', 'bottom', 'left', 'right', 'center'],
            canDisplayOverlay,
            getOverlayOutline: () => {
                return accessor.options.theme?.dndPanelOverlay === 'group'
                    ? this.element.parentElement
                    : null;
            },
            className: 'dv-drop-target-content',
            getOverrideTarget,
            overlayModel: this.accessor.resolveDropOverlayModel?.('content'),
            getPositionResolver: () =>
                accessor.getDropPositionResolver?.(group.id),
            getScope,
            livePreview,
        });

        this.addDisposables(
            this.dropTarget,
            this.pointerDropTarget,
            // Re-apply the app-supplied overlay model when options change.
            // `{}` resets to the built-in default (all fields optional).
            this.accessor.onDidOptionsChange?.(() => {
                const model =
                    this.accessor.resolveDropOverlayModel?.('content') ?? {};
                this.dropTarget.setOverlayModel(model);
                this.pointerDropTarget.setOverlayModel(model);
            }) ?? Disposable.NONE
        );
    }

    show(): void {
        this.element.style.display = '';
    }

    hide(): void {
        this.element.style.display = 'none';
    }

    setLabelledBy(tabElementId: string | undefined): void {
        if (tabElementId) {
            this._element.setAttribute('aria-labelledby', tabElementId);
        } else {
            this._element.removeAttribute('aria-labelledby');
        }
    }

    renderPanel(panel: IDockviewPanel, options?: { asActive?: boolean }): void {
        const doRender =
            (options?.asActive ?? true) || this.group.isPanelActive(panel);

        // Inactive and not on display: only (de)register with the overlay
        // container, leaving the displayed panel mounted.
        if (doRender || this.panel === panel) {
            if (
                this.panel?.view.content.element.parentElement === this._element
            ) {
                this.panel.view.content.element.remove();
                this.panel.view.content.onHide?.();
            }

            this.panel = panel;
        }

        let container: HTMLElement;

        switch (panel.api.renderer) {
            case 'onlyWhenVisible':
                this.group.renderContainer.detatch(panel);
                if (doRender) {
                    this._element.appendChild(panel.view.content.element);
                    panel.view.content.onShow?.();
                }
                container = this._element;
                break;
            case 'always':
                if (
                    panel.view.content.element.parentElement === this._element
                ) {
                    panel.view.content.element.remove();
                }
                container = this.group.renderContainer.attach({
                    panel,
                    referenceContainer: this,
                });
                break;
            default:
                throw new Error(
                    `dockview: invalid renderer type '${panel.api.renderer}'`
                );
        }

        if (doRender) {
            const focusTracker = trackFocus(container);
            this.focusTracker = focusTracker;
            const disposable = new CompositeDisposable();

            disposable.addDisposables(
                focusTracker,
                focusTracker.onDidFocus(() => this._onDidFocus.fire()),
                focusTracker.onDidBlur(() => this._onDidBlur.fire())
            );

            this.disposable.value = disposable;
        }
    }

    public openPanel(panel: IDockviewPanel): void {
        if (this.panel === panel) {
            return;
        }

        this.renderPanel(panel);
    }

    public layout(width: number, height: number): void {
        // The element is sized by CSS (a flex child of the group); only the
        // numbers are recorded, and a change broadcast, for overlay sizing.
        if (
            this._dimensions?.width === width &&
            this._dimensions.height === height
        ) {
            return;
        }
        this._dimensions = { width, height };
        this._onDidDimensionsChange.fire(this._dimensions);
    }

    public closePanel(): void {
        if (this.panel) {
            if (this.panel.api.renderer === 'onlyWhenVisible') {
                this.panel.view.content.element.remove();
                this.panel.view.content.onHide?.();
            }
        }
        this.panel = undefined;
    }

    public dispose(): void {
        this.disposable.dispose();
        super.dispose();
    }

    /**
     * Refresh the focus tracker state to handle cases where focus state
     * gets out of sync due to programmatic panel activation
     */
    public refreshFocusState(): void {
        if (this.focusTracker?.refreshState) {
            this.focusTracker.refreshState();
        }
    }
}
