import { DragAndDropObserver } from '../dnd/dnd';
import { Droptarget } from '../dnd/droptarget';
import { getDomNodePagePosition, toggleClass } from '../dom';
import {
    CompositeDisposable,
    Disposable,
    IDisposable,
    MutableDisposable,
} from '../lifecycle';
import { IDockviewPanel } from '../dockview/dockviewPanel';
import { DockviewComponent } from '../dockview/dockviewComponent';

class PositionCache {
    /**
     * A WeakMap so an entry never extends the lifetime of its element: entries
     * are only ever read back within the frame they were written (`frameId`
     * guard below), so once an element is detached — `detatch()`, `fromJSON`,
     * group disposal — its entry is garbage. A strong `Map` here retained the
     * detached panel/group DOM (and, through parent pointers, the whole
     * previous layout tree) for the lifetime of the component (#1596).
     */
    private readonly cache = new WeakMap<
        Element,
        {
            rect: { left: number; top: number; width: number; height: number };
            frameId: number;
        }
    >();
    private currentFrameId = 0;
    private rafId: number | null = null;

    getPosition(element: Element): {
        left: number;
        top: number;
        width: number;
        height: number;
    } {
        const cached = this.cache.get(element);
        if (cached?.frameId === this.currentFrameId) {
            return cached.rect;
        }

        this.scheduleFrameUpdate();
        const rect = getDomNodePagePosition(element);
        this.cache.set(element, { rect, frameId: this.currentFrameId });
        return rect;
    }

    invalidate(): void {
        this.currentFrameId++;
    }

    private scheduleFrameUpdate() {
        if (this.rafId) return;
        this.rafId = requestAnimationFrame(() => {
            this.currentFrameId++;
            this.rafId = null;
        });
    }
}

export type DockviewPanelRenderer = 'onlyWhenVisible' | 'always';

export interface IRenderable {
    readonly element: HTMLElement;
    readonly dropTarget: Droptarget;
}

/**
 * Placeholder handle marking "a reposition frame has been requested but the
 * real handle is not known yet". Never passed to `cancelAnimationFrame` in
 * practice — it is replaced within the same synchronous block — and harmless
 * if it were, since no frame carries this id.
 */
const SCHEDULED = -1;

function createFocusableElement(): HTMLDivElement {
    const element = document.createElement('div');
    element.tabIndex = -1;
    return element;
}

export class OverlayRenderContainer extends CompositeDisposable {
    private readonly map: Record<
        string,
        {
            panel: IDockviewPanel;
            disposable: IDisposable;
            destroy: IDisposable;
            element: HTMLElement;
            resize?: () => void;
            /** Sticky peek state (set via `repositionPanelOverlay`): force the
             *  overlay visible despite the panel being collapsed, and clip it to
             *  the peek's reveal window. Preserved across internal resizes. */
            forceVisible?: boolean;
            clip?: DOMRect;
            /** Keep a positioned overlay stable while a replacement reference awaits layout. */
            retainPreviousGeometry: boolean;
            /** Set once real geometry has been written to the overlay element. */
            positioned: boolean;
            /**
             * The reference container the overlay currently tracks, used to
             * decide whether an `attach` is pointing the overlay somewhere new.
             */
            referenceContainer?: IRenderable;
            /**
             * Identifies the `attach` a `resize` closure belongs to. Container
             * identity is not enough on its own: after `detatch` deletes the
             * entry, re-attaching to the *same* container would leave a stale
             * closure's container matching the live one.
             */
            generation: number;
            /**
             * Handle of the queued reposition frame, so a burst of `resize()`
             * calls collapses into one frame and a superseded `attach` can
             * cancel work bound to the previous container.
             */
            pendingUpdate?: number;
        }
    > = {};

    private _disposed = false;
    /**
     * Monotonic for the container's lifetime, never per-entry: `detatch()`
     * deletes the entry, so an entry-local counter would restart and let a
     * superseded closure collide with a later `attach`.
     */
    private _generation = 0;
    private readonly positionCache = new PositionCache();

    constructor(
        readonly element: HTMLElement,
        readonly accessor: DockviewComponent
    ) {
        super();

        this.addDisposables(
            Disposable.from(() => {
                for (const value of Object.values(this.map)) {
                    value.disposable.dispose();
                    value.destroy.dispose();
                    this.cancelPendingUpdate(value);
                }
                this._disposed = true;
            })
        );
    }

    updateAllPositions(): void {
        if (this._disposed) {
            return;
        }

        this.positionCache.invalidate();

        for (const entry of Object.values(this.map)) {
            if (entry.panel.api.isVisible && entry.resize) {
                entry.resize();
            }
        }
    }

    /**
     * Reposition a single panel's overlay over its reference container,
     * optionally forcing it visible even when the panel is not currently
     * "visible" (e.g. its group is collapsed). Used by the auto-hide peek to
     * slide an `always`-rendered panel out without reparenting it or mutating
     * the panel's visibility state. No-op if the panel isn't overlay-rendered.
     */
    repositionPanelOverlay(
        panelId: string,
        forceVisible = false,
        clip?: DOMRect
    ): void {
        if (this._disposed) {
            return;
        }
        const entry = this.map[panelId];
        if (!entry) {
            return;
        }
        // Set the sticky peek state, then reposition; `resize()` reads it back
        // so it survives any concurrent internal resize.
        entry.forceVisible = forceVisible;
        entry.clip = clip;
        this.positionCache.invalidate();
        entry.resize?.();
    }

    /**
     * Drop the reposition frame queued for a panel, if any. A queued frame is
     * bound to the reference container that was current when it was scheduled,
     * so it must be discarded whenever that container stops being the one the
     * overlay should track.
     */
    private cancelPendingUpdate(entry: { pendingUpdate?: number }): void {
        if (entry.pendingUpdate !== undefined) {
            cancelAnimationFrame(entry.pendingUpdate);
            entry.pendingUpdate = undefined;
        }
    }

    detatch(panel: IDockviewPanel): boolean {
        if (this.map[panel.api.id]) {
            const entry = this.map[panel.api.id];
            entry.disposable.dispose();
            entry.destroy.dispose();
            this.cancelPendingUpdate(entry);
            delete this.map[panel.api.id];
            return true;
        }
        return false;
    }

    attach(options: {
        panel: IDockviewPanel;
        referenceContainer: IRenderable;
    }): HTMLElement {
        const { panel, referenceContainer } = options;

        if (!this.map[panel.api.id]) {
            const element = createFocusableElement();
            element.className = 'dv-render-overlay';
            // Hide until the first RAF-based position is applied to prevent a
            // one-frame flash at position 0,0 when the element is first attached.
            element.style.visibility = 'hidden';

            this.map[panel.api.id] = {
                panel,
                disposable: Disposable.NONE,
                destroy: Disposable.NONE,

                element,
                retainPreviousGeometry: false,
                positioned: false,
                generation: ++this._generation,
            };
        }

        const mapEntry = this.map[panel.api.id];

        /**
         * A *change* of reference container supersedes the previous `attach`:
         * take a fresh generation so its `resize` closure can no longer run,
         * and drop the frame it queued against the old container. During
         * `fromJSON({ reuseExistingPanels: true })` that old container is a
         * detached staging group measuring 0x0, so leaving its frame in flight
         * both wastes the update and delays the reposition against the real one.
         *
         * Re-attaching over the *same* container (re-open, active panel change)
         * deliberately leaves scheduled work alone: `repositionPanelOverlay`
         * (the auto-hide peek) schedules a frame carrying the sticky
         * `forceVisible`/`clip` state which `attach` does not re-apply, and a
         * peeked panel's `api.isVisible` is false — so discarding that frame
         * leaves `visibilityChanged` to hide the overlay and the peek renders
         * nothing. A newly created entry already holds a fresh generation, so
         * the stale closures a `detatch` left behind are fenced off either way.
         */
        if (mapEntry.referenceContainer !== referenceContainer) {
            mapEntry.generation = ++this._generation;
            this.cancelPendingUpdate(mapEntry);
            mapEntry.referenceContainer = referenceContainer;

            /**
             * Arm the retain flag only here: it means "a replacement reference
             * container is awaiting layout", so the 0x0 early-return below
             * holds the last good box rather than blanking the panel mid-move.
             * Arming it on every re-attach instead would make a container that
             * genuinely collapses to zero keep its stale geometry forever.
             *
             * Gated on `positioned` because an overlay that has never been
             * positioned has no left/top/width/height, and `.dv-render-overlay`
             * defaults to 100%/100% — retaining "previous" geometry there would
             * pin the content over the whole container.
             */
            mapEntry.retainPreviousGeometry = mapEntry.positioned;
        }

        const generation = mapEntry.generation;

        const focusContainer = mapEntry.element;

        // Capture the content element now so the destroy disposable below
        // does not re-query the renderer's `element` getter during teardown.
        // Some framework adapters (e.g. dockview-angular) tear down their
        // backing renderer before this disposable fires; reading through the
        // getter at that point can throw.
        const contentElement = panel.view.content.element;

        if (contentElement.parentElement !== focusContainer) {
            focusContainer.appendChild(contentElement);
        }

        if (focusContainer.parentElement !== this.element) {
            this.element.appendChild(focusContainer);
        }

        const resize = () => {
            const panelId = panel.api.id;
            const scheduling = this.map[panelId];

            if (scheduling?.generation !== generation) {
                return; // superseded by a later attach
            }

            if (scheduling.pendingUpdate !== undefined) {
                return; // Update already scheduled
            }

            /**
             * Claim the slot *before* scheduling. `requestAnimationFrame` is
             * shimmed to run inline by some hosts (and by several suites here),
             * in which case the callback below clears `pendingUpdate` while
             * this call is still on the stack — assigning the handle afterwards
             * would resurrect a slot that is already spent and block every
             * later reposition. The sentinel is replaced by the real handle
             * only if the frame has not already run.
             */
            scheduling.pendingUpdate = SCHEDULED;

            const handle = requestAnimationFrame(() => {
                const entry = this.map[panelId];
                if (entry) {
                    entry.pendingUpdate = undefined;
                }

                if (this.isDisposed || entry?.generation !== generation) {
                    return;
                }
                // `forceVisible` / `clip` are sticky per-panel state owned by
                // the peek (set via `repositionPanelOverlay`). Read them at paint
                // time so an unrelated `resize()` (visibility / layout) can't
                // clobber a force-shown, clipped peek panel back to hidden. A
                // peeked panel's `isVisible` is false (its group is collapsed),
                // so without the sticky force it would render nothing.
                const forceVisible = entry.forceVisible ?? false;
                const clip = entry.clip;

                const box = this.positionCache.getPosition(
                    referenceContainer.element
                );
                const box2 = this.positionCache.getPosition(this.element);

                const left = box.left - box2.left;
                const top = box.top - box2.top;
                const width = box.width;
                const height = box.height;

                if (
                    entry.retainPreviousGeometry &&
                    (width === 0 || height === 0)
                ) {
                    if (!panel.api.isVisible && !forceVisible) {
                        focusContainer.style.visibility = 'hidden';
                        focusContainer.style.pointerEvents = 'none';
                    }
                    return;
                }

                entry.retainPreviousGeometry = false;
                entry.positioned = true;

                focusContainer.style.left = `${left}px`;
                focusContainer.style.top = `${top}px`;
                focusContainer.style.width = `${width}px`;
                focusContainer.style.height = `${height}px`;
                // Sync visibility/pointer-events with the panel's current
                // visibility at paint time. visibilityChanged() may have
                // flipped to hidden between scheduling this rAF and now;
                // unconditionally clearing `visibility:hidden` here would
                // leave a hidden panel visually visible at a stale position,
                // because onDidDimensionsChange skips non-visible panels and
                // never recomputes their box on subsequent resizes.
                if (panel.api.isVisible || forceVisible) {
                    focusContainer.style.visibility = '';
                    focusContainer.style.pointerEvents = '';
                } else {
                    focusContainer.style.visibility = 'hidden';
                    focusContainer.style.pointerEvents = 'none';
                }
                // When force-shown for an auto-hide peek, lift the overlay above
                // the peek's own (opaque) backdrop so the content is visible.
                // For a floating panel the stacking is owned by
                // `correctLayerPosition()` (tracks the window's aria-level and
                // lifts the overlay above the floating window); leave it alone
                // here so we don't clobber it back to the default and drop the
                // content behind the window. Only reset to the default for a
                // plain grid-docked overlay.
                if (forceVisible) {
                    focusContainer.style.zIndex = '1000';
                } else if (panel.api.location.type !== 'floating') {
                    focusContainer.style.zIndex = '';
                }

                // Clip to the peek's reveal window so an `always` panel emerges
                // from the strip's inner edge as the container slides, rather
                // than appearing on the dock side of it. `box` is in page
                // coordinates (`getDomNodePagePosition`) but `clip` is a
                // viewport rect, so shift it by the scroll offset before taking
                // the inset (otherwise the clip is wrong in a scrolled document).
                if (clip) {
                    const view = this.element.ownerDocument.defaultView;
                    const sx = view?.scrollX ?? 0;
                    const sy = view?.scrollY ?? 0;
                    const top = clip.top + sy;
                    const left = clip.left + sx;
                    const insetTop = Math.max(0, top - box.top);
                    const insetLeft = Math.max(0, left - box.left);
                    const insetRight = Math.max(
                        0,
                        box.left + width - (clip.right + sx)
                    );
                    const insetBottom = Math.max(
                        0,
                        box.top + height - (clip.bottom + sy)
                    );
                    focusContainer.style.clipPath = `inset(${insetTop}px ${insetRight}px ${insetBottom}px ${insetLeft}px)`;
                } else {
                    focusContainer.style.clipPath = '';
                }

                toggleClass(
                    focusContainer,
                    'dv-render-overlay-float',
                    panel.group.api.location.type === 'floating'
                );
            });

            if (scheduling.pendingUpdate === SCHEDULED) {
                scheduling.pendingUpdate = handle;
            }
        };

        const visibilityChanged = () => {
            if (panel.api.isVisible) {
                this.positionCache.invalidate();
                resize();
                /**
                 * Existing geometry is safe to show while its replacement lays
                 * out. `retainPreviousGeometry` is only set when geometry has
                 * actually been written (see `attach`), so this can never
                 * un-hide an overlay whose left/top/width/height are unset —
                 * `.dv-render-overlay` is 100%/100% by default and would
                 * otherwise cover the whole dock.
                 *
                 * The retained geometry is the panel's position in the previous
                 * layout, so restoring a layout that moves the panel does paint
                 * it at stale coordinates until the reposition lands. That is
                 * bounded to the next frame now that a superseded `attach` can
                 * no longer swallow the reposition (see `attach`); showing
                 * stale-but-real geometry for a frame is the deliberate
                 * trade-off against blanking the panel for the whole rebuild.
                 */
                if (this.map[panel.api.id]?.retainPreviousGeometry) {
                    focusContainer.style.visibility = '';
                }
                focusContainer.style.pointerEvents = '';
            } else {
                focusContainer.style.visibility = 'hidden';
                focusContainer.style.pointerEvents = 'none';
            }
        };

        const observerDisposable = new MutableDisposable();

        const correctLayerPosition = () => {
            if (panel.api.location.type === 'floating') {
                queueMicrotask(() => {
                    // Resolve by membership, not anchor identity: a floating
                    // window can host a nested gridview, so a panel split into
                    // it lives in a non-anchor member group. Matching only the
                    // anchor (`f.group === panel.api.group`) left such panels
                    // without the lifted z-index, so an `always`-rendered
                    // panel's overlay (CSS `dv-render-overlay-float`, one below
                    // the window) rendered *behind* the floating window.
                    const floatingGroup =
                        this.accessor.getFloatingWindowForGroup(
                            panel.api.group
                        );

                    if (!floatingGroup) {
                        return;
                    }

                    const element = floatingGroup.overlay.element;

                    const update = () => {
                        const level = Number(
                            element.getAttribute('aria-level')
                        );
                        focusContainer.style.zIndex = `calc(var(--dv-overlay-z-index, 999) + ${
                            level * 2 + 1
                        })`;
                    };

                    const observer = new MutationObserver(() => {
                        update();
                    });

                    observerDisposable.value = Disposable.from(() =>
                        observer.disconnect()
                    );

                    observer.observe(element, {
                        attributeFilter: ['aria-level'],
                        attributes: true,
                    });

                    update();
                });
            } else {
                focusContainer.style.zIndex = ''; // reset the z-index, perhaps CSS will take over here
            }
        };

        const disposable = new CompositeDisposable(
            observerDisposable,
            /**
             * since container is positioned absoutely we must explicitly forward
             * the dnd events for the expect behaviours to continue to occur in terms of dnd
             *
             * the dnd observer does not need to be conditional on whether the panel is visible since
             * non-visible panels have 'pointer-events: none' and in such case the dnd observer will not fire.
             */
            new DragAndDropObserver(focusContainer, {
                onDragEnd: (e) => {
                    referenceContainer.dropTarget.dnd.onDragEnd(e);
                },
                onDragEnter: (e) => {
                    referenceContainer.dropTarget.dnd.onDragEnter(e);
                },
                onDragLeave: (e) => {
                    referenceContainer.dropTarget.dnd.onDragLeave(e);
                },
                onDrop: (e) => {
                    referenceContainer.dropTarget.dnd.onDrop(e);
                },
                onDragOver: (e) => {
                    referenceContainer.dropTarget.dnd.onDragOver(e);
                },
            }),

            panel.api.onDidVisibilityChange(() => {
                /**
                 * Control the visibility of the content, however even when not visible (display: none)
                 * the content is still maintained within the DOM hence DOM specific attributes
                 * such as scroll position are maintained when next made visible.
                 */
                visibilityChanged();
            }),
            panel.api.onDidDimensionsChange(() => {
                if (!panel.api.isVisible) {
                    return;
                }

                resize();
            }),
            panel.api.onDidLocationChange(() => {
                correctLayerPosition();
            })
        );

        this.map[panel.api.id].destroy = Disposable.from(() => {
            if (contentElement.parentElement === focusContainer) {
                contentElement.remove();
            }

            focusContainer.remove();
        });

        correctLayerPosition();

        queueMicrotask(() => {
            if (this.isDisposed) {
                return;
            }

            /**
             * wait until everything has finished in the current stack-frame call before
             * calling the first resize as other size-altering events may still occur before
             * the end of the stack-frame.
             */
            visibilityChanged();
        });

        this.map[panel.api.id].disposable.dispose();
        this.map[panel.api.id].disposable = disposable;
        this.map[panel.api.id].resize = resize;

        return focusContainer;
    }
}
