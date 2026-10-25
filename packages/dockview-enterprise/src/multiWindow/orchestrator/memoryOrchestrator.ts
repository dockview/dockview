/**
 * An orchestrator for windows that share one JavaScript heap: several
 * dockview instances on one page, a test, an Electron main process, or a
 * host that runs the orchestrator in a page of its own and bridges windows
 * to it. It composes the three pure pieces, {@link DragSessions},
 * {@link WorkspaceRegistry} and {@link HistorySequencer}, and hands each
 * window a {@link MultiWindowTransport}.
 *
 * Every notice is delivered on a later microtask, never inside the call
 * that caused it, so a window's listeners run as they would with a real
 * message bus and nothing is re-entrant.
 */

import {
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewEmitter as Emitter,
    type DockviewEvent as Event,
    type DockviewIDisposable,
    type SerializedDockview,
} from 'dockview';
import {
    DRAG_END_GRACE_MS,
    type DragPayload,
    type HistoryInfo,
    type HistoryRequest,
    type MoveEvent,
    type MoveRole,
    type MultiWindowTransport,
    payloadPanels,
    type ReleaseEvent,
} from '../transport';
import { DragSessions } from './dragSessions';
import { HistorySequencer, type HistoryStep } from './historySequencer';
import {
    type WindowGeometry,
    WorkspaceRegistry,
    type WorkspaceState,
} from './workspaceRegistry';

export interface MemoryOrchestratorOptions {
    /** The workspace to start from, as a previous {@link MemoryOrchestrator.snapshot}. */
    workspace?: WorkspaceState;
    /**
     * How many steps the shared history keeps. Default 25, as dockview's own
     * `layoutHistory.depth`; no window's depth should be lower.
     */
    historyDepth?: number;
    /**
     * Called when an unaccepted drag ended with `detach`: the host opens a
     * window with this id and connects it; its cross-window drag then
     * collects the payload with `takeDetachedDrag`. Without this, a detached
     * drag is discarded like any other.
     */
    createWindow?(windowId: string, payload: DragPayload): void;
}

/** What only one window hears. */
class WindowChannel extends CompositeDisposable {
    readonly onDidRelease = new Emitter<ReleaseEvent>();
    readonly onDidRequestHistory = new Emitter<HistoryRequest>();

    constructor() {
        super();
        this.addDisposables(this.onDidRelease, this.onDidRequestHistory);
    }
}

export class MemoryOrchestrator extends CompositeDisposable {
    private readonly _drags = new DragSessions();
    private readonly _workspace: WorkspaceRegistry;
    private readonly _history: HistorySequencer;
    private readonly _channels = new Map<string, WindowChannel>();
    private readonly _createWindow: MemoryOrchestratorOptions['createWindow'];
    private _detachedCount = 0;

    private readonly _onDidMove = new Emitter<MoveEvent>();
    /** Panels moved between any two windows. */
    readonly onDidMove: Event<MoveEvent> = this._onDidMove.event;

    private readonly _onDidChangeHistory = new Emitter<HistoryInfo>();
    readonly onDidChangeHistory: Event<HistoryInfo> =
        this._onDidChangeHistory.event;

    private readonly _onDidChangeWorkspace = new Emitter<WorkspaceState>();
    /** The workspace changed: a layout or frame was reported, or a window left. */
    readonly onDidChangeWorkspace: Event<WorkspaceState> =
        this._onDidChangeWorkspace.event;

    /** The windows this orchestrator knows, connected or restored. */
    get windowIds(): string[] {
        return this._workspace.windowIds();
    }

    get history(): HistoryInfo {
        return this._history.info();
    }

    constructor(options: MemoryOrchestratorOptions = {}) {
        super();
        this._workspace = new WorkspaceRegistry(options.workspace);
        this._history = new HistorySequencer(options.historyDepth);
        this._createWindow = options.createWindow;
        this.addDisposables(
            this._onDidMove,
            this._onDidChangeHistory,
            this._onDidChangeWorkspace
        );
    }

    /** The transport for a window, which the orchestrator knows from now on. */
    connect(windowId: string): MultiWindowTransport {
        this._workspace.ensureWindow(windowId);
        const channel = this._channel(windowId);
        const listen =
            <T>(event: Event<T>) =>
            (listener: (value: T) => void): Promise<DockviewIDisposable> =>
                Promise.resolve(event(listener));

        return {
            windowId,

            startDrag: (session, payload) =>
                settle(() =>
                    this._drags.start(session, { from: windowId, payload })
                ),
            peekDrag: (session) => settle(() => this._drags.peek(session)),
            acceptDrag: (session) =>
                settle(() => this._accept(session, windowId)),
            endDrag: (session, detach) =>
                settle(() => this._endDrag(session, detach)),
            onDidRelease: listen(channel.onDidRelease.event),
            takeDetachedDrag: () =>
                settle(() => this._drags.takeDetachedDrag(windowId)),
            reportMove: (session, role, panels, before, after) =>
                settle(() =>
                    this._recordMove(
                        session,
                        windowId,
                        role,
                        panels,
                        before,
                        after
                    )
                ),
            onDidMove: listen(this.onDidMove),

            loadLayout: () =>
                settle(() => this._workspace.loadLayout(windowId)),
            reportLayout: (layout) =>
                settle(() => {
                    this._workspace.setLayout(windowId, layout);
                    this._workspaceDidChange();
                }),

            reportLocalStep: () =>
                settle(() => {
                    this._history.pushLocal(windowId);
                    this._historyDidChange();
                }),
            undo: () => settle(() => this.undo()),
            redo: () => settle(() => this.redo()),
            getHistory: () => settle(() => this._history.info()),
            onDidRequestHistory: listen(channel.onDidRequestHistory.event),
            onDidChangeHistory: listen(this.onDidChangeHistory),
        };
    }

    /**
     * Forget a window that closed: its listeners, its workspace record and
     * every history entry that involves it.
     */
    disconnect(windowId: string): void {
        const channel = this._channels.get(windowId);
        if (channel) {
            this.removeDisposable(channel);
            channel.dispose();
            this._channels.delete(windowId);
        }
        this._workspace.removeWindow(windowId);
        this._history.forgetWindow(windowId);
        this._workspaceDidChange();
        this._historyDidChange();
    }

    /** Undo the most recent step in any window. Throws when there is none. */
    undo(): void {
        this._carryOut(this._history.undo(), 'undo');
    }

    /** Redo the most recently undone step. Throws when there is none. */
    redo(): void {
        this._carryOut(this._history.redo(), 'redo');
    }

    /** The whole workspace, in the shape to persist and pass back as `workspace`. */
    snapshot(): WorkspaceState {
        return this._workspace.snapshot();
    }

    /** Record where the host put a window, for the next start. */
    setGeometry(windowId: string, geometry: WindowGeometry): void {
        this._workspace.setGeometry(windowId, geometry);
        this._workspaceDidChange();
    }

    private _channel(windowId: string): WindowChannel {
        let channel = this._channels.get(windowId);
        if (!channel) {
            channel = new WindowChannel();
            this._channels.set(windowId, channel);
            this.addDisposables(channel);
        }
        return channel;
    }

    private _accept(session: string, to: string): void {
        const { payload, release } = this._drags.accept(session, to);
        this._moved(release.from, to, session, payloadPanels(payload), 'drop');
    }

    private _endDrag(session: string, detach: boolean): void {
        if (this._drags.end(session, detach)) {
            setTimeout(() => this._expire(session), DRAG_END_GRACE_MS);
        }
    }

    private _expire(session: string): void {
        const ended = this._drags.expire(session, () => this._newWindowId());
        if (ended.outcome !== 'detached') {
            return;
        }
        if (!this._createWindow) {
            // Nobody to open a window: the parked payload is dropped.
            this._drags.takeDetachedDrag(ended.windowId);
            return;
        }
        this._createWindow(ended.windowId, ended.payload);
        this._moved(
            ended.release.from,
            ended.windowId,
            session,
            payloadPanels(ended.payload),
            'detach'
        );
        // A detach is no step to undo, and the source's earlier steps hold
        // the panels it gave away: undoing one would bring them back while
        // the new window holds them too. They end here.
        this._history.forgetWindow(ended.release.from);
        this._historyDidChange();
    }

    /** An id for a detached window, unused by any window on record. */
    private _newWindowId(): string {
        const taken = new Set(this._workspace.windowIds());
        let windowId: string;
        do {
            windowId = `detached-${++this._detachedCount}`;
        } while (taken.has(windowId) || this._channels.has(windowId));
        return windowId;
    }

    /**
     * Panels left `from` for `to`: let the workspace expect it, release the
     * source, and tell everyone. The destination may report the panels
     * before the source reports them gone.
     */
    private _moved(
        from: string,
        to: string,
        session: string,
        panels: string[],
        reason: 'drop' | 'detach'
    ): void {
        this._workspace.expectMove(panels, from, to);
        const channel = this._channels.get(from);
        if (channel) {
            post(channel.onDidRelease, { session, to, reason });
        }
        post(this._onDidMove, { session, panels, from, to, reason });
    }

    private _recordMove(
        session: string,
        window: string,
        role: MoveRole,
        panels: string[],
        before: SerializedDockview,
        after: SerializedDockview
    ): void {
        this._history.recordMove(session, panels, role, {
            window,
            before,
            after,
        });
        this._historyDidChange();
    }

    private _carryOut(step: HistoryStep, reason: 'undo' | 'redo'): void {
        for (const { window, request } of step.actions) {
            if (request.type === 'apply-layout') {
                // Stored before it is applied, so the window's own report
                // afterwards never reads as a duplicate.
                this._workspace.setLayoutUnchecked(window, request.layout);
            }
            const channel = this._channels.get(window);
            if (channel) {
                post(channel.onDidRequestHistory, request);
            }
        }
        if (step.moved) {
            post(this._onDidMove, { ...step.moved, reason });
        }
        this._workspaceDidChange();
        this._historyDidChange();
    }

    private _workspaceDidChange(): void {
        post(this._onDidChangeWorkspace, this._workspace.snapshot());
    }

    private _historyDidChange(): void {
        post(this._onDidChangeHistory, this._history.info());
    }
}

/** Fire on a later microtask, as a message bus would deliver it. */
function post<T>(emitter: Emitter<T>, value: T): void {
    queueMicrotask(() => emitter.fire(value));
}

/**
 * Run a synchronous orchestrator step as a transport call: its result, or
 * the error it throws, arrives as a settled promise, as it would over a
 * message bus.
 */
function settle<T>(step: () => T): Promise<T> {
    try {
        return Promise.resolve(step());
    } catch (err: unknown) {
        return Promise.reject(err);
    }
}
