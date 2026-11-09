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
    type MultiWindowDragPayload,
    type MultiWindowMoveEvent,
    type MoveRole,
    type MultiWindowTransport,
    payloadPanels,
    type MultiWindowReleaseEvent,
    retainSubscription,
} from './transport';

/** Carries the drag's session id; only the type is readable before the drop. */
export const MULTI_WINDOW_DRAG_TYPE = 'application/x-dockview-multi-window';

/** Outlasts the orchestrator's grace period, so a late accept is honoured. */
const LOCAL_SESSION_TTL_MS = 2 * DRAG_END_GRACE_MS;

interface LocalSession {
    readonly kind: MultiWindowDragPayload['kind'];
    /** The panel or group id to remove on release. */
    readonly id: string;
}

export class CrossWindowDnd extends CompositeDisposable {
    private readonly _api: DockviewApi;
    private readonly _transport: MultiWindowTransport;
    private readonly _local = new Map<string, LocalSession>();

    private readonly _onDidMove = new Emitter<MultiWindowMoveEvent>();
    readonly onDidMove: Event<MultiWindowMoveEvent> = this._onDidMove.event;

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
            api.onUnhandledDragOver((event) => {
                if (isMultiWindowDrag(event.nativeEvent)) {
                    event.accept();
                }
            }),
            api.onDidDrop((event) => {
                const session = readSession(event.nativeEvent);
                if (session) {
                    void this._receive(session, event);
                }
            })
        );
    }

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

    /** Resolves to whether a detach had parked anything for this window. */
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

    private _announce(
        nativeEvent: DragEvent | PointerEvent,
        id: string,
        payload: MultiWindowDragPayload
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

    /** Peeks first, so a duplicate is refused before the source lets go. */
    private async _receive(
        session: string,
        event: DockviewDidDropEvent
    ): Promise<void> {
        let payload: MultiWindowDragPayload;
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

        // Recorded even if placing fails, so undo restores the source.
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

    private _release(event: MultiWindowReleaseEvent): void {
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

        // A detach is not undoable.
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

/** `randomUUID` needs a secure context, which `tauri://localhost` need not be. */
function randomSessionId(): string {
    const crypto = globalThis.crypto;
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, '0')
    ).join('');
}

/** Not `instanceof DragEvent`, which jsdom does not define. */
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
 * An edge of a grid group or the layout makes a new group; anything else
 * merges into the target group. Without an event (a detach) it is appended.
 */
function place(
    api: DockviewApi,
    payload: MultiWindowDragPayload,
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
