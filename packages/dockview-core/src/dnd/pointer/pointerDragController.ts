import { disableIframePointEvents } from '../../dom';
import { addDisposableListener, Emitter, Event } from '../../events';
import { CompositeDisposable, IDisposable } from '../../lifecycle';
import { PointerGhost } from './pointerGhost';
import { IPointerDropTargetHandle, PointerDragEvent } from './types';

export interface ActiveDrag {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly source: HTMLElement;
}

/**
 * Only one pointer-driven drag can be active at a time.
 *
 * State is shared across every Dockview instance on the page. Targets
 * from instance B receive hit-tests from drags originating in instance A;
 * that's intentional for cross-instance drops since `LocalSelectionTransfer`
 * is also process-wide. The corollary is that every Tabs subscriber to
 * `onDragMove` fires for every pointer drag globally; each subscriber
 * hit-tests against its own DOM, so this is O(N) per pointermove where N
 * is the number of registered listeners across all instances.
 */
export class PointerDragController extends CompositeDisposable {
    private static _instance: PointerDragController | undefined;

    static getInstance(): PointerDragController {
        PointerDragController._instance ??= new PointerDragController();
        return PointerDragController._instance;
    }

    private readonly _targets = new Set<IPointerDropTargetHandle>();
    /** Kept in sync with `_targets` so hit-testing is allocation-free. */
    private readonly _targetByElement = new Map<
        Element,
        IPointerDropTargetHandle
    >();
    private _active: ActiveDrag | undefined;
    /** The most recent pointer event of the active drag, used to build the
     * drag-end event when a drag is cancelled (which carries no event). */
    private _lastPointerEvent: PointerEvent | undefined;
    private _currentTarget: IPointerDropTargetHandle | undefined;
    private _dataDisposable: IDisposable | undefined;
    private _ghost: PointerGhost | undefined;
    private _moveListener: IDisposable | undefined;
    private _upListener: IDisposable | undefined;
    private _cancelListener: IDisposable | undefined;
    private _iframeShield: { release: () => void } | undefined;
    private _onDragMoveCallback?: (e: PointerDragEvent) => void;
    private _onDragEndCallback?: (
        e: PointerDragEvent,
        dropped: boolean
    ) => void;

    private readonly _onDragStart = new Emitter<PointerDragEvent>();
    readonly onDragStart: Event<PointerDragEvent> = this._onDragStart.event;

    private readonly _onDragMove = new Emitter<PointerDragEvent>();
    readonly onDragMove: Event<PointerDragEvent> = this._onDragMove.event;

    private readonly _onDragEnd = new Emitter<PointerDragEvent>();
    readonly onDragEnd: Event<PointerDragEvent> = this._onDragEnd.event;

    private constructor() {
        super();
        this.addDisposables(
            this._onDragStart,
            this._onDragMove,
            this._onDragEnd
        );
    }

    get active(): ActiveDrag | undefined {
        return this._active;
    }

    registerTarget(target: IPointerDropTargetHandle): IDisposable {
        this._targets.add(target);
        this._targetByElement.set(target.element, target);
        return {
            dispose: () => {
                this._targets.delete(target);
                if (this._targetByElement.get(target.element) === target) {
                    this._targetByElement.delete(target.element);
                }
                if (this._currentTarget === target) {
                    this._currentTarget = undefined;
                }
            },
        };
    }

    beginDrag(args: {
        pointerEvent: PointerEvent;
        source: HTMLElement;
        getData: () => IDisposable;
        ghost?: PointerGhost;
        onDragMove?: (e: PointerDragEvent) => void;
        onDragEnd?: (e: PointerDragEvent, dropped: boolean) => void;
    }): void {
        if (this._active) {
            this.cancel();
        }

        const { pointerEvent, source } = args;

        // Call `getData()` before mutating controller state. A throw
        // here would otherwise leave `_active` populated with no window
        // listeners installed, blocking every subsequent drag.
        const dataDisposable = args.getData();

        this._active = {
            pointerId: pointerEvent.pointerId,
            startX: pointerEvent.clientX,
            startY: pointerEvent.clientY,
            source,
        };
        this._lastPointerEvent = pointerEvent;
        this._onDragMoveCallback = args.onDragMove;
        this._onDragEndCallback = args.onDragEnd;
        this._dataDisposable = dataDisposable;
        this._ghost = args.ghost;

        // Iframes capture pointermove once the cursor crosses into them,
        // which would freeze the drag from the parent window's POV.
        this._iframeShield = disableIframePointEvents(
            source.ownerDocument ?? document
        );

        const startEvent: PointerDragEvent = {
            clientX: pointerEvent.clientX,
            clientY: pointerEvent.clientY,
            pointerEvent,
        };
        this._onDragStart.fire(startEvent);

        // Source's owning window; popout drags fire on their own window,
        // not the main one.
        const targetWindow: Window =
            source.ownerDocument?.defaultView ?? globalThis.window;

        this._moveListener = addDisposableListener(
            targetWindow,
            'pointermove',
            (e) => {
                if (e.pointerId !== this._active?.pointerId) {
                    return;
                }
                this._handleMove(e);
            }
        );

        this._upListener = addDisposableListener(
            targetWindow,
            'pointerup',
            (e) => {
                if (e.pointerId !== this._active?.pointerId) {
                    return;
                }
                this._handleEnd(e, true);
            }
        );

        this._cancelListener = addDisposableListener(
            targetWindow,
            'pointercancel',
            (e) => {
                if (e.pointerId !== this._active?.pointerId) {
                    return;
                }
                this._handleEnd(e, false);
            }
        );
    }

    cancel(): void {
        if (!this._active) {
            return;
        }
        // Capture before teardown clears them.
        const onEnd = this._onDragEndCallback;
        const lastEvent = this._lastPointerEvent;

        this._currentTarget?.handleDragLeave();
        this._teardown();
        this._dataDisposable?.dispose();
        this._dataDisposable = undefined;

        // Fire the drag-end (dropped=false) so consumers reset, mirroring
        // `_handleEnd`. Without this, a cancelled drag (e.g. a second touch
        // preempting the first via `beginDrag`) never notifies the tab-reorder
        // consumer, leaving its smooth-reorder transforms stuck.
        if (lastEvent) {
            const dragEvent: PointerDragEvent = {
                clientX: lastEvent.clientX,
                clientY: lastEvent.clientY,
                pointerEvent: lastEvent,
            };
            onEnd?.(dragEvent, false);
            this._onDragEnd.fire(dragEvent);
        }
    }

    private _findTargetUnder(
        x: number,
        y: number
    ): IPointerDropTargetHandle | undefined {
        // `elementsFromPoint` is topmost-first; walk up to find the closest
        // registered ancestor (so a tab beats the layout-root that contains it).
        // Use the source's owning document so popout drags hit their own targets.
        const sourceDoc = this._active?.source.ownerDocument ?? document;
        const elements = sourceDoc.elementsFromPoint(x, y);
        for (const el of elements) {
            let current: Element | null = el;
            while (current) {
                const target = this._targetByElement.get(current);
                if (target && !target.isHitTestTransparent?.()) {
                    return target;
                }
                current = current.parentElement;
            }
        }
        return undefined;
    }

    private _handleMove(e: PointerEvent): void {
        this._lastPointerEvent = e;
        this._ghost?.update(e.clientX, e.clientY);

        const dragEvent: PointerDragEvent = {
            clientX: e.clientX,
            clientY: e.clientY,
            pointerEvent: e,
        };

        const newTarget = this._findTargetUnder(e.clientX, e.clientY);

        if (newTarget !== this._currentTarget) {
            this._currentTarget?.handleDragLeave();
            this._currentTarget = newTarget;
        }

        if (newTarget) {
            newTarget.handleDragOver(dragEvent);
        }

        this._onDragMoveCallback?.(dragEvent);
        this._onDragMove.fire(dragEvent);
    }

    private _handleEnd(e: PointerEvent, dropped: boolean): void {
        const dragEvent: PointerDragEvent = {
            clientX: e.clientX,
            clientY: e.clientY,
            pointerEvent: e,
        };

        if (dropped && this._currentTarget) {
            this._currentTarget.handleDrop(dragEvent);
        } else {
            this._currentTarget?.handleDragLeave();
        }

        const onEnd = this._onDragEndCallback;
        const dataDisposable = this._dataDisposable;

        this._teardown();
        this._dataDisposable = undefined;

        // Defer disposal so drop handlers can still read the transfer data.
        setTimeout(() => dataDisposable?.dispose(), 0);

        onEnd?.(dragEvent, dropped);
        this._onDragEnd.fire(dragEvent);
    }

    private _teardown(): void {
        this._currentTarget = undefined;
        this._active = undefined;
        this._lastPointerEvent = undefined;
        this._onDragMoveCallback = undefined;
        this._onDragEndCallback = undefined;
        this._ghost?.dispose();
        this._ghost = undefined;
        this._iframeShield?.release();
        this._iframeShield = undefined;
        this._moveListener?.dispose();
        this._upListener?.dispose();
        this._cancelListener?.dispose();
        this._moveListener = undefined;
        this._upListener = undefined;
        this._cancelListener = undefined;
    }
}
