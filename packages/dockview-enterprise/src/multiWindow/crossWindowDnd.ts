/**
 * Cross-window drag and drop as an interceptor over dockview's public drag
 * hooks. Ordinary tab and group drags keep working as before; the only
 * addition is that a drag can now land in another window's dockview.
 *
 * Every native window runs its own dockview in its own JavaScript context,
 * so nothing can move between them as DOM. What can cross is an OS drag
 * session, and only an HTML5 drag rides one. The drag's `DataTransfer`
 * carries a session id and nothing else; the orchestrator outside every
 * window holds what the drag carries; the window the drop lands in rebuilds
 * it with `addPanelFromJSON` or `addGroupFromJSON`, and the source is told
 * to remove its copy. No window owns another.
 */

import {
    type Direction,
    type DockviewApi,
    DockviewCompositeDisposable as CompositeDisposable,
    type DockviewDidDropEvent,
    DockviewEmitter as Emitter,
    type DockviewEvent as Event,
    type DockviewGroupPanel,
    positionToDirection,
    type SerializedDockview,
} from 'dockview';
import {
    DRAG_END_GRACE_MS,
    type DragPayload,
    type MoveEvent,
    type MoveRole,
    type MultiWindowTransport,
    payloadPanels,
    type ReleaseEvent,
    retainSubscription,
} from './transport';

/**
 * The drag type that marks a dockview drag as one the orchestrator brokers.
 * During `dragover` a browser exposes a drag's types but not its data, so
 * this is what the destination accepts on; the session id is read at the
 * drop.
 */
export const MULTI_WINDOW_DRAG_TYPE = 'application/x-dockview-multi-window';

/**
 * How long after its drag ended a source keeps what it needs to act on a
 * release: past the orchestrator's grace period, so a late accept is still
 * honoured here.
 */
const LOCAL_SESSION_TTL_MS = 2 * DRAG_END_GRACE_MS;

/** What the source window remembers about a drag, to act on its release. */
interface LocalSession {
    readonly kind: DragPayload['kind'];
    /** The panel id (`panel`) or group id (`group`) to remove on release. */
    readonly id: string;
}

export class CrossWindowDnd extends CompositeDisposable {
    private readonly _api: DockviewApi;
    private readonly _transport: MultiWindowTransport;
    /** The drags this window started that another window may yet take. */
    private readonly _local = new Map<string, LocalSession>();

    private readonly _onDidMove = new Emitter<MoveEvent>();
    /** Panels moved between any two windows. */
    readonly onDidMove: Event<MoveEvent> = this._onDidMove.event;

    /** See `MultiWindowOptions.detach`. */
    detach: boolean;

    constructor(
        api: DockviewApi,
        transport: MultiWindowTransport,
        options: { detach?: boolean } = {}
    ) {
        super();
        this._api = api;
        this._transport = transport;
        this.detach = options.detach ?? false;

        this.addDisposables(
            this._onDidMove,
            api.onWillDragPanel((event) => {
                this._announce(event.nativeEvent, event.panel.id, {
                    kind: 'panel',
                    panel: event.panel.toJSON(),
                });
            }),
            api.onWillDragGroup((event) => {
                this._announce(event.nativeEvent, event.group.id, {
                    kind: 'group',
                    group: api.serializeGroup(event.group),
                });
            }),
            // dockview treats a drag it did not start as external and asks;
            // a brokered drag is accepted so the normal drop overlay shows.
            api.onUnhandledDragOver((event) => {
                if (isMultiWindowDrag(event.nativeEvent)) {
                    event.accept();
                }
            }),
            // Fired only for a drop dockview does not handle itself, so never
            // for a drag that stays in this window.
            api.onDidDrop((event) => {
                const session = readSession(event.nativeEvent);
                if (session) {
                    void this._receive(session, event);
                }
            })
        );
    }

    /** Listen for the orchestrator's releases and moves. */
    connect(): void {
        retainSubscription(
            this,
            this._transport.onDidRelease((event) => this._release(event))
        );
        retainSubscription(
            this,
            this._transport.onDidMove((event) => this._onDidMove.fire(event))
        );
    }

    /**
     * Place what a detach parked for this window, if it was created by one.
     * Resolves to whether there was anything to place.
     */
    async placeDetachedDrag(): Promise<boolean> {
        try {
            const payload = await this._transport.takeDetachedDrag();
            if (!payload || this.isDisposed) {
                return false;
            }
            place(this._api, payload);
            return true;
        } catch (err: unknown) {
            console.error('dockview: could not place a detached drag.', err);
            return false;
        }
    }

    /**
     * Put the session id on the drag, hand the orchestrator the payload, and
     * remember what to remove if another window takes it. The drag's own end
     * reports back whether anything accepted it.
     */
    private _announce(
        nativeEvent: DragEvent | PointerEvent,
        id: string,
        payload: DragPayload
    ): void {
        if (!hasDataTransfer(nativeEvent) || !nativeEvent.dataTransfer) {
            // A pointer-backend drag cannot leave the window.
            return;
        }

        const session = randomSessionId();
        nativeEvent.dataTransfer.setData(MULTI_WINDOW_DRAG_TYPE, session);
        this._local.set(session, { kind: payload.kind, id });
        this._transport.startDrag(session, payload).catch((err: unknown) => {
            console.error('dockview: could not announce a drag.', err);
        });

        nativeEvent.target?.addEventListener(
            'dragend',
            (end) => {
                const dropEffect =
                    (end as DragEvent).dataTransfer?.dropEffect ?? 'none';
                this._endDrag(session, this.detach && dropEffect === 'none');
                // Only conclude the drag stayed here once a late accept would
                // have shown up as a release.
                setTimeout(
                    () => this._local.delete(session),
                    LOCAL_SESSION_TTL_MS
                );
            },
            { once: true }
        );
    }

    private _endDrag(session: string, detach: boolean): void {
        this._transport.endDrag(session, detach).catch((err: unknown) => {
            console.error('dockview: could not end a drag.', err);
        });
    }

    /**
     * Rebuild the payload where the drop landed. It is read before the
     * accept so one this window cannot take, because it already holds a
     * panel of the same id, is refused without the source letting go of it;
     * only then is the drag accepted, which releases the source.
     */
    private async _receive(
        session: string,
        event: DockviewDidDropEvent
    ): Promise<void> {
        let payload: DragPayload;
        try {
            payload = await this._transport.peekDrag(session);
            const held = payloadPanels(payload).filter((id) =>
                this._api.getPanel(id)
            );
            if (held.length > 0) {
                console.warn(
                    `dockview: refused a drop of ${held.join(', ')}, which this window already holds.`
                );
                return;
            }
            await this._transport.acceptDrag(session);
        } catch (err: unknown) {
            console.warn('dockview: refused a drop.', err);
            return;
        }

        // The source has let go by now. Whatever happens here, this half of
        // the move is recorded, so a shared undo can restore the source's
        // layout even when the panels could not be placed.
        const before = this._api.toJSON();
        try {
            place(this._api, payload, event);
        } catch (err: unknown) {
            console.error(
                'dockview: could not place a drop; undo restores it to its source.',
                err
            );
        }
        this._reportMove(session, 'to', payloadPanels(payload), before);
    }

    /** The source window's half of a completed move. */
    private _release(event: ReleaseEvent): void {
        const local = this._local.get(event.session);
        if (!local) {
            return;
        }
        this._local.delete(event.session);

        const before = this._api.toJSON();
        let panels: string[] = [];
        if (local.kind === 'panel') {
            const panel = this._api.getPanel(local.id);
            if (panel) {
                panels = [panel.id];
                this._api.removePanel(panel);
            }
        } else {
            const group = this._api.getGroup(local.id);
            if (group) {
                panels = group.panels.map((panel) => panel.id);
                this._api.removeGroup(group);
            }
        }

        // The new window of a detach is the host's to create; a detach is
        // not a move the shared history can undo.
        if (event.reason === 'drop') {
            this._reportMove(event.session, 'from', panels, before);
        }
    }

    private _reportMove(
        session: string,
        role: MoveRole,
        panels: string[],
        before: SerializedDockview
    ): void {
        this._transport
            .reportMove(session, role, panels, before, this._api.toJSON())
            .catch((err: unknown) => {
                console.error('dockview: could not report a move.', err);
            });
    }
}

/**
 * A random id for drag sessions. `randomUUID` is only defined in a secure
 * context, which a custom-scheme origin such as `tauri://localhost` need not
 * be, so fall back to raw random bytes.
 */
function randomSessionId(): string {
    const crypto = globalThis.crypto;
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, '0')
    ).join('');
}

/**
 * Narrow a drag-related native event to one with a `dataTransfer`. A
 * property check rather than `instanceof DragEvent`, which some
 * environments (jsdom among them) do not define.
 */
function hasDataTransfer(
    nativeEvent: DragEvent | PointerEvent
): nativeEvent is DragEvent {
    return 'dataTransfer' in nativeEvent;
}

function isMultiWindowDrag(nativeEvent: DragEvent | PointerEvent): boolean {
    return (
        hasDataTransfer(nativeEvent) &&
        (nativeEvent.dataTransfer?.types.includes(MULTI_WINDOW_DRAG_TYPE) ??
            false)
    );
}

function readSession(nativeEvent: DragEvent | PointerEvent): string | null {
    if (!hasDataTransfer(nativeEvent)) {
        return null;
    }
    return nativeEvent.dataTransfer?.getData(MULTI_WINDOW_DRAG_TYPE) || null;
}

/**
 * Where the drop landed decides how the payload is rebuilt. An edge of a
 * grid group or of the layout becomes a new group there. The centre of a
 * group, its tab bar, or any edge of a floating or edge group (which has no
 * grid neighbours) merges into that group, at the tab index the drop
 * reports for a tab-bar landing. Without a drop event (a detach) the
 * payload is appended to the layout.
 */
function place(
    api: DockviewApi,
    payload: DragPayload,
    event?: DockviewDidDropEvent
): void {
    const target = event?.group as DockviewGroupPanel | undefined;

    if (!event) {
        if (payload.kind === 'panel') {
            api.addPanelFromJSON(payload.panel);
        } else {
            api.addGroupFromJSON(payload.group);
        }
        return;
    }

    if (!target) {
        const direction = positionToDirection(event.position) as Exclude<
            Direction,
            'within'
        >;
        if (payload.kind === 'panel') {
            api.addPanelFromJSON(payload.panel, { position: { direction } });
        } else {
            api.addGroupFromJSON(payload.group, { direction });
        }
        return;
    }

    if (event.position !== 'center' && target.api.location.type === 'grid') {
        const direction = positionToDirection(event.position);
        if (payload.kind === 'panel') {
            api.addPanelFromJSON(payload.panel, {
                position: { referenceGroup: target, direction },
            });
        } else {
            api.addGroupFromJSON(payload.group, {
                referenceGroup: target,
                direction,
            });
        }
        return;
    }

    if (payload.kind === 'panel') {
        api.addPanelFromJSON(payload.panel, {
            position: { referenceGroup: target, index: event.index },
        });
    } else {
        api.addGroupFromJSON(payload.group, {
            referenceGroup: target,
            direction: 'within',
            index: event.index,
        });
    }
}
