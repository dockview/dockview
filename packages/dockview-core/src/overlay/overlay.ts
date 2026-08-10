import {
    disableIframePointEvents,
    quasiDefaultPrevented,
    toggleClass,
} from '../dom';
import { Emitter, Event, addDisposableListener } from '../events';
import {
    CompositeDisposable,
    Disposable,
    MutableDisposable,
} from '../lifecycle';
import { clamp } from '../math';
import { AnchoredBox, Box, DragModifiers } from '../types';

/**
 * Context handed to {@link OverlayOptions.transformDragPosition} each
 * pointer-move frame while a floating overlay is being dragged.
 */
export interface OverlayDragContext {
    /** Proposed top-left + size this frame, in container pixels (pre-clamp). */
    readonly proposed: Box;
    /** Size of the container the overlay is dragged within. */
    readonly container: { width: number; height: number };
    /** Bounds of the sibling overlays, snapshotted at drag start. */
    readonly others: readonly Box[];
    /** Modifier-key state from this frame's pointer event. */
    readonly modifiers: DragModifiers;
}

class AriaLevelTracker {
    private _orderedList: HTMLElement[] = [];

    push(element: HTMLElement): void {
        this._orderedList = [
            ...this._orderedList.filter((item) => item !== element),
            element,
        ];

        this.update();
    }

    destroy(element: HTMLElement): void {
        this._orderedList = this._orderedList.filter(
            (item) => item !== element
        );
        this.update();
    }

    private update(): void {
        for (let i = 0; i < this._orderedList.length; i++) {
            this._orderedList[i].setAttribute('aria-level', `${i}`);
            this._orderedList[i].style.zIndex =
                `calc(var(--dv-overlay-z-index, 999) + ${i * 2})`;
        }
    }
}

const arialLevelTracker = new AriaLevelTracker();

export class Overlay extends CompositeDisposable {
    private readonly _element: HTMLElement = document.createElement('div');

    private readonly _onDidChange = new Emitter<void>();
    readonly onDidChange: Event<void> = this._onDidChange.event;

    private readonly _onDidChangeEnd = new Emitter<void>();
    readonly onDidChangeEnd: Event<void> = this._onDidChangeEnd.event;

    private readonly _onDidStartMoving = new Emitter<void>();
    /** Fires once per drag, the first time the float actually moves. */
    readonly onDidStartMoving: Event<void> = this._onDidStartMoving.event;

    private readonly _dragMove = new MutableDisposable();
    private _dragCancelled = false;

    private static readonly MINIMUM_HEIGHT = 20;
    private static readonly MINIMUM_WIDTH = 20;

    private verticalAlignment: 'top' | 'bottom' | undefined;
    private horiziontalAlignment: 'left' | 'right' | undefined;

    private _isVisible: boolean;

    set minimumInViewportWidth(value: number | undefined) {
        this.options.minimumInViewportWidth = value;
    }

    set minimumInViewportHeight(value: number | undefined) {
        this.options.minimumInViewportHeight = value;
    }

    get element(): HTMLElement {
        return this._element;
    }

    get isVisible(): boolean {
        return this._isVisible;
    }

    /**
     * Height of the optional drag-handle header, or 0 when none is present.
     * Used to translate between the overlay's outer box and the content area
     * available to the group beneath the header.
     */
    get headerHeight(): number {
        return this.options.header?.offsetHeight ?? 0;
    }

    constructor(
        private readonly options: AnchoredBox & {
            container: HTMLElement;
            content: HTMLElement;
            /**
             * Optional dedicated drag handle rendered above the content (a
             * floating window title bar). When provided the resize container
             * lays its children out as a flex column so the content shrinks
             * to fit beneath the handle.
             */
            header?: HTMLElement;
            minimumInViewportWidth?: number;
            minimumInViewportHeight?: number;
            /**
             * Adjust the proposed top-left each drag frame (before the
             * container clamp). Return an adjusted position or nothing to leave
             * it unchanged. Used to implement snapping / custom bounds.
             */
            transformDragPosition?: (
                context: OverlayDragContext
            ) => { top: number; left: number } | void;
            /**
             * Snapshot the sibling overlays' boxes at drag start, supplied to
             * `transformDragPosition` as `context.others`.
             */
            getSiblingBoxes?: () => readonly Box[];
        }
    ) {
        super();

        this.addDisposables(
            this._onDidChange,
            this._onDidChangeEnd,
            this._onDidStartMoving,
            this._dragMove
        );

        this._element.className = 'dv-resize-container';
        // Floating groups are non-modal dialogs over the layout. The contained
        // group(s) carry their own `role="region"` + label, so the dialog
        // itself only needs role + modality here.
        this._element.setAttribute('role', 'dialog');
        this._element.setAttribute('aria-modal', 'false');
        this._isVisible = true;

        this.setupResize('top');
        this.setupResize('bottom');
        this.setupResize('left');
        this.setupResize('right');
        this.setupResize('topleft');
        this.setupResize('topright');
        this.setupResize('bottomleft');
        this.setupResize('bottomright');

        if (this.options.header) {
            toggleClass(
                this._element,
                'dv-resize-container-with-titlebar',
                true
            );
            this._element.appendChild(this.options.header);
        }

        this._element.appendChild(this.options.content);
        this.options.container.appendChild(this._element);

        // if input bad resize within acceptable boundaries
        this.setBounds({
            height: this.options.height,
            width: this.options.width,
            ...('top' in this.options && { top: this.options.top }),
            ...('bottom' in this.options && { bottom: this.options.bottom }),
            ...('left' in this.options && { left: this.options.left }),
            ...('right' in this.options && { right: this.options.right }),
        });

        arialLevelTracker.push(this._element);
    }

    setVisible(isVisible: boolean): void {
        if (isVisible === this.isVisible) {
            return;
        }

        this._isVisible = isVisible;

        toggleClass(this.element, 'dv-hidden', !this.isVisible);
    }

    bringToFront(): void {
        arialLevelTracker.push(this._element);
    }

    setBounds(bounds: Partial<AnchoredBox> = {}): void {
        if (typeof bounds.height === 'number') {
            this._element.style.height = `${bounds.height}px`;
        }
        if (typeof bounds.width === 'number') {
            this._element.style.width = `${bounds.width}px`;
        }
        if ('top' in bounds && typeof bounds.top === 'number') {
            this._element.style.top = `${bounds.top}px`;
            this._element.style.bottom = 'auto';
            this.verticalAlignment = 'top';
        }
        if ('bottom' in bounds && typeof bounds.bottom === 'number') {
            this._element.style.bottom = `${bounds.bottom}px`;
            this._element.style.top = 'auto';
            this.verticalAlignment = 'bottom';
        }
        if ('left' in bounds && typeof bounds.left === 'number') {
            this._element.style.left = `${bounds.left}px`;
            this._element.style.right = 'auto';
            this.horiziontalAlignment = 'left';
        }
        if ('right' in bounds && typeof bounds.right === 'number') {
            this._element.style.right = `${bounds.right}px`;
            this._element.style.left = 'auto';
            this.horiziontalAlignment = 'right';
        }

        const { container, overlay } = this.measureBoxes();
        this.applyConstraint(container, overlay);
    }

    /**
     * Read the overlay's own box and its container's box, so a batched caller
     * can measure every floating overlay before writing any clamp.
     */
    measureBoxes(): { container: DOMRect; overlay: DOMRect } {
        return {
            container: this.options.container.getBoundingClientRect(),
            overlay: this._element.getBoundingClientRect(),
        };
    }

    /**
     * Clamp the overlay within its container and write the result. Pure writes
     * given pre-measured boxes (no geometry reads), so it can run in a batched
     * write pass after all overlays have been measured.
     */
    applyConstraint(containerRect: DOMRect, overlayRect: DOMRect): void {
        // region: ensure bounds within allowable limits

        // a minimum width of minimumViewportWidth must be inside the viewport
        const xOffset = Math.max(0, this.getMinimumWidth(overlayRect.width));

        // a minimum height of minimumViewportHeight must be inside the viewport
        const yOffset = Math.max(0, this.getMinimumHeight(overlayRect.height));

        if (this.verticalAlignment === 'top') {
            const top = clamp(
                overlayRect.top - containerRect.top,
                -yOffset,
                Math.max(0, containerRect.height - overlayRect.height + yOffset)
            );
            this._element.style.top = `${top}px`;
            this._element.style.bottom = 'auto';
        }

        if (this.verticalAlignment === 'bottom') {
            const bottom = clamp(
                containerRect.bottom - overlayRect.bottom,
                -yOffset,
                Math.max(0, containerRect.height - overlayRect.height + yOffset)
            );
            this._element.style.bottom = `${bottom}px`;
            this._element.style.top = 'auto';
        }

        if (this.horiziontalAlignment === 'left') {
            const left = clamp(
                overlayRect.left - containerRect.left,
                -xOffset,
                Math.max(0, containerRect.width - overlayRect.width + xOffset)
            );
            this._element.style.left = `${left}px`;
            this._element.style.right = 'auto';
        }

        if (this.horiziontalAlignment === 'right') {
            const right = clamp(
                containerRect.right - overlayRect.right,
                -xOffset,
                Math.max(0, containerRect.width - overlayRect.width + xOffset)
            );
            this._element.style.right = `${right}px`;
            this._element.style.left = 'auto';
        }

        this._onDidChange.fire();
    }

    toJSON(): AnchoredBox {
        const container = this.options.container.getBoundingClientRect();
        const element = this._element.getBoundingClientRect();

        const result: any = {};

        if (this.verticalAlignment === 'top') {
            result.top = Number.parseFloat(this._element.style.top);
        } else if (this.verticalAlignment === 'bottom') {
            result.bottom = Number.parseFloat(this._element.style.bottom);
        } else {
            result.top = element.top - container.top;
        }

        if (this.horiziontalAlignment === 'left') {
            result.left = Number.parseFloat(this._element.style.left);
        } else if (this.horiziontalAlignment === 'right') {
            result.right = Number.parseFloat(this._element.style.right);
        } else {
            result.left = element.left - container.left;
        }

        result.width = element.width;
        result.height = element.height;

        return result;
    }

    /**
     * Abort an in-flight move-the-float drag. Used by the void container
     * when a redock long-press fires after the move started, so the ghost
     * gesture wins without the float continuing to follow the finger.
     * Does not emit `onDidChangeEnd` because no change is being committed.
     */
    cancelPendingDrag(): void {
        if (!this._dragMove.value) {
            return;
        }
        this._dragCancelled = true;
        toggleClass(this._element, 'dv-resize-container-dragging', false);
        this._dragMove.value = Disposable.NONE;
    }

    setupDrag(
        dragTarget: HTMLElement,
        options?: { inDragMode?: boolean }
    ): void {
        const track = (captureTarget?: HTMLElement, pointerId?: number) => {
            let offset: { x: number; y: number } | null = null;
            let hasMoved = false;
            this._dragCancelled = false;

            // Snapshot once per drag; siblings don't move while this one drags.
            const siblingBoxes = this.options.transformDragPosition
                ? (this.options.getSiblingBoxes?.() ?? [])
                : [];

            const iframes = disableIframePointEvents();

            if (
                captureTarget &&
                typeof pointerId === 'number' &&
                typeof captureTarget.setPointerCapture === 'function'
            ) {
                try {
                    captureTarget.setPointerCapture(pointerId);
                } catch {
                    // ignore: non-fatal if the browser refuses capture
                }
            }

            const end = () => {
                toggleClass(
                    this._element,
                    'dv-resize-container-dragging',
                    false
                );

                this._dragMove.value = Disposable.NONE;
                this._onDidChangeEnd.fire();
            };

            this._dragMove.value = new CompositeDisposable(
                {
                    dispose: () => {
                        iframes.release();
                        if (
                            captureTarget &&
                            typeof pointerId === 'number' &&
                            typeof captureTarget.releasePointerCapture ===
                                'function'
                        ) {
                            try {
                                captureTarget.releasePointerCapture(pointerId);
                            } catch {
                                // ignore: pointer may already be released
                            }
                        }
                    },
                },
                addDisposableListener(globalThis.window, 'pointermove', (e) => {
                    if (this._dragCancelled) {
                        return;
                    }
                    const containerRect =
                        this.options.container.getBoundingClientRect();
                    const x = e.clientX - containerRect.left;
                    const y = e.clientY - containerRect.top;

                    toggleClass(
                        this._element,
                        'dv-resize-container-dragging',
                        true
                    );

                    const overlayRect = this._element.getBoundingClientRect();
                    offset ??= {
                        x: e.clientX - overlayRect.left,
                        y: e.clientY - overlayRect.top,
                    };

                    const xOffset = Math.max(
                        0,
                        this.getMinimumWidth(overlayRect.width)
                    );
                    const yOffset = Math.max(
                        0,
                        this.getMinimumHeight(overlayRect.height)
                    );

                    let proposedTop = y - offset.y;
                    let proposedLeft = x - offset.x;

                    // Let a consumer nudge the proposed position (snapping,
                    // custom bounds) before the container clamp below.
                    if (this.options.transformDragPosition) {
                        const adjusted = this.options.transformDragPosition({
                            proposed: {
                                top: proposedTop,
                                left: proposedLeft,
                                width: overlayRect.width,
                                height: overlayRect.height,
                            },
                            container: {
                                width: containerRect.width,
                                height: containerRect.height,
                            },
                            others: siblingBoxes,
                            modifiers: {
                                altKey: e.altKey,
                                ctrlKey: e.ctrlKey,
                                metaKey: e.metaKey,
                                shiftKey: e.shiftKey,
                            },
                        });
                        if (adjusted) {
                            proposedTop = adjusted.top;
                            proposedLeft = adjusted.left;
                        }
                    }

                    const maxTop = Math.max(
                        0,
                        containerRect.height - overlayRect.height + yOffset
                    );
                    const maxLeft = Math.max(
                        0,
                        containerRect.width - overlayRect.width + xOffset
                    );

                    const top = clamp(proposedTop, -yOffset, maxTop);

                    const bottom = clamp(
                        containerRect.height - overlayRect.height - proposedTop,
                        -yOffset,
                        maxTop
                    );

                    const left = clamp(proposedLeft, -xOffset, maxLeft);

                    const right = clamp(
                        containerRect.width - overlayRect.width - proposedLeft,
                        -xOffset,
                        maxLeft
                    );

                    const bounds: any = {};

                    // Anchor to top or to bottom depending on which one is closer
                    if (top <= bottom) {
                        bounds.top = top;
                    } else {
                        bounds.bottom = bottom;
                    }

                    // Anchor to left or to right depending on which one is closer
                    if (left <= right) {
                        bounds.left = left;
                    } else {
                        bounds.right = right;
                    }

                    this.setBounds(bounds);
                    if (!hasMoved) {
                        hasMoved = true;
                        this._onDidStartMoving.fire();
                    }
                }),
                addDisposableListener(globalThis.window, 'pointerup', end),
                addDisposableListener(globalThis.window, 'pointercancel', end)
            );
        };

        this.addDisposables(
            addDisposableListener(dragTarget, 'pointerdown', (event) => {
                if (event.defaultPrevented) {
                    event.preventDefault();
                    return;
                }

                // if somebody has marked this event then treat as a defaultPrevented
                // without actually calling event.preventDefault()
                if (quasiDefaultPrevented(event)) {
                    return;
                }

                track(dragTarget, event.pointerId);
            }),
            addDisposableListener(
                this.options.content,
                'pointerdown',
                (event) => {
                    if (event.defaultPrevented) {
                        return;
                    }

                    // if somebody has marked this event then treat as a defaultPrevented
                    // without actually calling event.preventDefault()
                    if (quasiDefaultPrevented(event)) {
                        return;
                    }

                    if (event.shiftKey) {
                        track(this.options.content, event.pointerId);
                    }
                }
            ),
            addDisposableListener(
                this.options.content,
                'pointerdown',
                () => {
                    arialLevelTracker.push(this._element);
                },
                true
            )
        );

        if (options?.inDragMode) {
            track();
        }
    }

    private setupResize(
        direction:
            | 'top'
            | 'bottom'
            | 'left'
            | 'right'
            | 'topleft'
            | 'topright'
            | 'bottomleft'
            | 'bottomright'
    ): void {
        const resizeHandleElement = document.createElement('div');
        resizeHandleElement.className = `dv-resize-handle-${direction}`;
        this._element.appendChild(resizeHandleElement);

        const move = new MutableDisposable();

        this.addDisposables(
            move,
            addDisposableListener(resizeHandleElement, 'pointerdown', (e) => {
                e.preventDefault();

                let startPosition: {
                    originalY: number;
                    originalHeight: number;
                    originalX: number;
                    originalWidth: number;
                } | null = null;

                const iframes = disableIframePointEvents();

                const pointerId = e.pointerId;
                if (
                    typeof resizeHandleElement.setPointerCapture === 'function'
                ) {
                    try {
                        resizeHandleElement.setPointerCapture(pointerId);
                    } catch {
                        // ignore: non-fatal if the browser refuses capture
                    }
                }

                const end = () => {
                    move.dispose();
                    this._onDidChangeEnd.fire();
                };

                move.value = new CompositeDisposable(
                    addDisposableListener(
                        globalThis.window,
                        'pointermove',
                        (e) => {
                            const containerRect =
                                this.options.container.getBoundingClientRect();
                            const overlayRect =
                                this._element.getBoundingClientRect();

                            const y = e.clientY - containerRect.top;
                            const x = e.clientX - containerRect.left;

                            // record the initial dimensions since as all subsequence moves are relative to this
                            startPosition ??= {
                                originalY: y,
                                originalHeight: overlayRect.height,
                                originalX: x,
                                originalWidth: overlayRect.width,
                            };

                            let top: number | undefined = undefined;
                            let bottom: number | undefined = undefined;
                            let height: number | undefined = undefined;
                            let left: number | undefined = undefined;
                            let right: number | undefined = undefined;
                            let width: number | undefined = undefined;

                            const moveTop = () => {
                                // When dragging top handle, constrain top position to prevent oversizing
                                const maxTop =
                                    startPosition!.originalY +
                                        startPosition!.originalHeight >
                                    containerRect.height
                                        ? Math.max(
                                              0,
                                              containerRect.height -
                                                  Overlay.MINIMUM_HEIGHT
                                          )
                                        : Math.max(
                                              0,
                                              startPosition!.originalY +
                                                  startPosition!
                                                      .originalHeight -
                                                  Overlay.MINIMUM_HEIGHT
                                          );
                                top = clamp(y, 0, maxTop);

                                height =
                                    startPosition!.originalY +
                                    startPosition!.originalHeight -
                                    top;

                                bottom = containerRect.height - top - height;
                            };

                            const moveBottom = () => {
                                top =
                                    startPosition!.originalY -
                                    startPosition!.originalHeight;

                                // When dragging bottom handle, constrain height to container height
                                const minHeight =
                                    top < 0 &&
                                    typeof this.options
                                        .minimumInViewportHeight === 'number'
                                        ? -top +
                                          this.options.minimumInViewportHeight
                                        : Overlay.MINIMUM_HEIGHT;

                                const maxHeight =
                                    containerRect.height - Math.max(0, top);

                                height = clamp(y - top, minHeight, maxHeight);

                                bottom = containerRect.height - top - height;
                            };

                            const moveLeft = () => {
                                const maxLeft =
                                    startPosition!.originalX +
                                        startPosition!.originalWidth >
                                    containerRect.width
                                        ? Math.max(
                                              0,
                                              containerRect.width -
                                                  Overlay.MINIMUM_WIDTH
                                          ) // Prevent extending beyong right edge
                                        : Math.max(
                                              0,
                                              startPosition!.originalX +
                                                  startPosition!.originalWidth -
                                                  Overlay.MINIMUM_WIDTH
                                          );

                                left = clamp(x, 0, maxLeft); // min is 0 (Not -Infinity) to prevent dragging beyond left edge

                                width =
                                    startPosition!.originalX +
                                    startPosition!.originalWidth -
                                    left;

                                right = containerRect.width - left - width;
                            };

                            const moveRight = () => {
                                left =
                                    startPosition!.originalX -
                                    startPosition!.originalWidth;

                                // When dragging right handle, constrain width to container width
                                const minWidth =
                                    left < 0 &&
                                    typeof this.options
                                        .minimumInViewportWidth === 'number'
                                        ? -left +
                                          this.options.minimumInViewportWidth
                                        : Overlay.MINIMUM_WIDTH;

                                const maxWidth =
                                    containerRect.width - Math.max(0, left);

                                width = clamp(x - left, minWidth, maxWidth);

                                right = containerRect.width - left - width;
                            };

                            switch (direction) {
                                case 'top':
                                    moveTop();
                                    break;
                                case 'bottom':
                                    moveBottom();
                                    break;
                                case 'left':
                                    moveLeft();
                                    break;
                                case 'right':
                                    moveRight();
                                    break;
                                case 'topleft':
                                    moveTop();
                                    moveLeft();
                                    break;
                                case 'topright':
                                    moveTop();
                                    moveRight();
                                    break;
                                case 'bottomleft':
                                    moveBottom();
                                    moveLeft();
                                    break;
                                case 'bottomright':
                                    moveBottom();
                                    moveRight();
                                    break;
                            }

                            const bounds: any = {};

                            // Anchor to top or to bottom depending on which one is closer
                            if (top! <= bottom!) {
                                bounds.top = top;
                            } else {
                                bounds.bottom = bottom;
                            }

                            // Anchor to left or to right depending on which one is closer
                            if (left! <= right!) {
                                bounds.left = left;
                            } else {
                                bounds.right = right;
                            }

                            bounds.height = height;
                            bounds.width = width;

                            this.setBounds(bounds);
                        }
                    ),
                    {
                        dispose: () => {
                            iframes.release();
                            if (
                                typeof resizeHandleElement.releasePointerCapture ===
                                'function'
                            ) {
                                try {
                                    resizeHandleElement.releasePointerCapture(
                                        pointerId
                                    );
                                } catch {
                                    // ignore: pointer may already be released
                                }
                            }
                        },
                    },
                    addDisposableListener(globalThis.window, 'pointerup', end),
                    addDisposableListener(
                        globalThis.window,
                        'pointercancel',
                        end
                    )
                );
            })
        );
    }

    private getMinimumWidth(width: number) {
        if (typeof this.options.minimumInViewportWidth === 'number') {
            return width - this.options.minimumInViewportWidth;
        }
        return 0;
    }

    private getMinimumHeight(height: number) {
        if (typeof this.options.minimumInViewportHeight === 'number') {
            return height - this.options.minimumInViewportHeight;
        }
        return 0;
    }

    override dispose(): void {
        arialLevelTracker.destroy(this._element);
        this._element.remove();
        super.dispose();
    }
}
