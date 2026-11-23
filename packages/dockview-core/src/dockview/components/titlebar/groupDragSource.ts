import {
    LocalSelectionTransfer,
    PanelTransfer,
} from '../../../dnd/dataTransfer';
import {
    DragSourceOptions,
    html5Backend,
    IDragGhostSpec,
    IDragSource,
    pointerBackend,
} from '../../../dnd/backend';
import { DockviewComponent } from '../../dockviewComponent';
import { Emitter } from '../../../events';
import {
    CompositeDisposable,
    Disposable,
    MutableDisposable,
} from '../../../lifecycle';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { toggleClass } from '../../../dom';
import { resolveDndCapabilities } from '../../dndCapabilities';

// Floating-group redock via touch: require a deliberate long press so the
// "move the float around" gesture doesn't double-trigger the redock ghost.
// Infinity pressTolerance disables the pre-arm flick override; any motion
// during the wait is treated as drag-the-float, not redock intent.
const FLOATING_REDOCK_INITIATION_DELAY_MS = 500;

export interface GroupDragSourceOptions {
    readonly element: HTMLElement;
    readonly accessor: DockviewComponent;
    /**
     * The group this handle drags. Pass a function when the handle outlives the
     * group it represents and can be retargeted, e.g. a floating window's
     * dedicated title bar, whose anchor group is reassigned when the original
     * anchor leaves a multi-group window. A fixed reference (the tab-bar void
     * container, which lives inside its own group's DOM) is also accepted.
     */
    readonly group: DockviewGroupPanel | (() => DockviewGroupPanel);
    /**
     * Whether this element is the floating window's move handle. Only the move
     * handle needs the floating disambiguation (shift for mouse / long-press
     * for touch) that keeps the redock gesture from firing alongside the
     * move-the-float gesture. Other handles on a floating group (e.g. the tab
     * bar's void container when a dedicated title bar is the move handle) drag
     * to redock with a plain drag, exactly like a group in the main grid.
     * Defaults to `() => true`.
     */
    readonly isFloatingMoveHandle?: () => boolean;
}

/**
 * The drag-source half of a group drag handle: html5 + pointer drag sources
 * that publish a group-level `PanelTransfer`, the "Multiple Panels (N)" ghost,
 * and the floating-group disambiguation that keeps the redock gesture from
 * firing alongside the overlay's move-the-float gesture.
 *
 * Shared by the tab-bar void container and the dedicated floating title bar so
 * both grab handles redock identically.
 */
export class GroupDragSource extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private readonly accessor: DockviewComponent;
    private readonly groupAccessor: () => DockviewGroupPanel;
    private readonly html5DragSource: IDragSource;
    private readonly pointerDragSource: IDragSource;
    private readonly panelTransfer =
        LocalSelectionTransfer.getInstance<PanelTransfer>();

    private readonly _onDragStart = new Emitter<DragEvent | PointerEvent>();
    readonly onDragStart = this._onDragStart.event;

    private readonly isFloatingMoveHandle: () => boolean;

    // Resolved lazily so a retargetable handle (the floating title bar) always
    // drags the window's *current* anchor group, not the one captured here.
    private get group(): DockviewGroupPanel {
        return this.groupAccessor();
    }

    constructor(options: GroupDragSourceOptions) {
        super();

        this._element = options.element;
        this.accessor = options.accessor;
        const group = options.group;
        this.groupAccessor = typeof group === 'function' ? group : () => group;
        this.isFloatingMoveHandle =
            options.isFloatingMoveHandle ?? (() => true);

        const caps = resolveDndCapabilities(this.accessor.options);

        this._element.draggable = caps.html5;
        toggleClass(this._element, 'dv-draggable', caps.html5 || caps.pointer);

        this.addDisposables(this._onDragStart);

        const buildMultiPanelsGhost = (): HTMLElement => {
            const ghostEl = document.createElement('div');
            const style = globalThis.getComputedStyle(this._element);
            const bgColor = style.getPropertyValue(
                '--dv-activegroup-visiblepanel-tab-background-color'
            );
            const color = style.getPropertyValue(
                '--dv-activegroup-visiblepanel-tab-color'
            );
            ghostEl.style.backgroundColor = bgColor;
            ghostEl.style.color = color;
            ghostEl.style.padding = '2px 8px';
            ghostEl.style.height = '24px';
            ghostEl.style.fontSize = '11px';
            ghostEl.style.lineHeight = '20px';
            ghostEl.style.borderRadius = '12px';
            ghostEl.style.whiteSpace = 'nowrap';
            ghostEl.style.boxSizing = 'border-box';
            // HTML5 setDragImage snapshots the element as appended to the
            // document; a default block-level div would stretch to the
            // body's width and render as a viewport-wide bar.
            ghostEl.style.display = 'inline-block';
            ghostEl.textContent = `Multiple Panels (${this.group.size})`;
            return ghostEl;
        };

        const buildGhostSpec = (): IDragGhostSpec => {
            // The custom-ghost resolution (createGroupDragGhostComponent) is
            // owned by the AdvancedDnD module; core keeps the default chip and
            // falls back to it when no custom ghost is produced (incl. when
            // the module is absent).
            const customGhost = this.accessor.buildGroupDragGhost?.(this.group);
            if (customGhost) {
                return customGhost;
            }
            return {
                element: buildMultiPanelsGhost(),
                offsetX: 30,
                offsetY: -10,
            };
        };

        const sharedDragOptions: DragSourceOptions = {
            getData: () => {
                this.panelTransfer.setData(
                    [new PanelTransfer(this.accessor.id, this.group.id, null)],
                    PanelTransfer.prototype
                );
                return {
                    dispose: () => {
                        this.panelTransfer.clearData(PanelTransfer.prototype);
                    },
                };
            },
            createGhost: buildGhostSpec,
            onDragStart: (event) => {
                this._onDragStart.fire(event);
            },
        };

        this.html5DragSource = html5Backend.createDragSource(this._element, {
            ...sharedDragOptions,
            disabled: !caps.html5,
            isCancelled: (event) => {
                // HTML5: when this element is the floating window's move
                // handle, redock needs shift+drag (otherwise click-and-drag
                // conflicts with moving the float). A non-move-handle (e.g. the
                // void container when a title bar moves the float) redocks with
                // a plain drag, like a group in the main grid.
                if (
                    this.group.api.location.type === 'floating' &&
                    this.isFloatingMoveHandle() &&
                    !(event as DragEvent).shiftKey
                ) {
                    return true;
                }
                if (
                    this.group.api.location.type === 'edge' &&
                    this.group.size === 0
                ) {
                    return true;
                }
                return false;
            },
        });

        // Only the move handle needs the touch disambiguation; other handles
        // redock with the normal grid press behaviour.
        const isFloating = () =>
            this.group?.api?.location?.type === 'floating' &&
            this.isFloatingMoveHandle();

        this.pointerDragSource = pointerBackend.createDragSource(
            this._element,
            {
                ...sharedDragOptions,
                disabled: !caps.pointer,
                touchOnly: !caps.pointerHandlesMouse,
                // Floating groups share this element with the overlay's
                // move-the-float drag. Without a longer hold + tolerance
                // override, both gestures commit simultaneously and the
                // user sees the float follow their finger *and* a ghost.
                touchInitiationDelay: () =>
                    isFloating() ? FLOATING_REDOCK_INITIATION_DELAY_MS : 250,
                pressTolerance: () => (isFloating() ? Infinity : 8),
                isCancelled: () => {
                    if (
                        !resolveDndCapabilities(this.accessor.options).pointer
                    ) {
                        return true;
                    }
                    // Pointer: long-press IS the deliberate gesture, so
                    // floating groups don't need the shift gate.
                    if (
                        this.group.api.location.type === 'edge' &&
                        this.group.size === 0
                    ) {
                        return true;
                    }
                    return false;
                },
                onDragStart: (event) => {
                    const wasPrevented = event.defaultPrevented;
                    this._onDragStart.fire(event);
                    // `onWillDragGroup` vetoed the redock: the float keeps
                    // following the finger. (Only a flip during the hook
                    // counts; the overlay's own handle may have prevented
                    // the pointerdown already.)
                    if (event.defaultPrevented && !wasPrevented) {
                        return;
                    }
                    // Redock just committed, so abort any in-flight overlay
                    // move so the float stops following the finger while
                    // the ghost takes over.
                    this.getFloatingOverlay()?.cancelPendingDrag();
                },
            }
        );

        // Mirror direction: once the overlay's move-the-float gesture has
        // actually moved something, cancel the pending redock arm so the
        // ghost doesn't appear mid-drag if the user holds past 500ms.
        const overlayMoveSub = new MutableDisposable();
        const refreshOverlayMoveSub = () => {
            const overlay = this.getFloatingOverlay();
            overlayMoveSub.value = overlay
                ? overlay.onDidStartMoving(() => {
                      this.pointerDragSource.cancelPending();
                  })
                : Disposable.NONE;
        };
        refreshOverlayMoveSub();
        this.addDisposables(overlayMoveSub);
        const locationChange = this.group?.api?.onDidLocationChange;
        if (locationChange) {
            this.addDisposables(locationChange(refreshOverlayMoveSub));
        }

        this.addDisposables(this.html5DragSource, this.pointerDragSource);
    }

    updateDragAndDropState(): void {
        const caps = resolveDndCapabilities(this.accessor.options);
        this._element.draggable = caps.html5;
        toggleClass(this._element, 'dv-draggable', caps.html5 || caps.pointer);
        this.html5DragSource.setDisabled(!caps.html5);
        this.pointerDragSource.setDisabled(!caps.pointer);
        this.pointerDragSource.setTouchOnly(!caps.pointerHandlesMouse);
    }

    private getFloatingOverlay() {
        if (!this.group) {
            return undefined;
        }
        return this.accessor.floatingGroups?.find(
            (fg) => fg.group === this.group
        )?.overlay;
    }
}

export { FLOATING_REDOCK_INITIATION_DELAY_MS };
