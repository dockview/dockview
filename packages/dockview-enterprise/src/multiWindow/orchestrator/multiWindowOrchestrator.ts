import {
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewEmitter as Emitter,
    type DockviewEvent as Event,
    type DockviewIDisposable,
    type SerializedDockview,
} from 'dockview';
import {
    DRAG_END_GRACE_MS,
    type MultiWindowDragPayload,
    type MultiWindowHistoryInfo,
    type MultiWindowHistoryRequest,
    type MultiWindowMoveEvent,
    type MoveRole,
    type MultiWindowTransport,
    payloadPanels,
    type MultiWindowReleaseEvent,
} from '../transport';
import { DragSessions } from './dragSessions';
import { HistorySequencer, type HistoryStep } from './historySequencer';
import {
    type WindowGeometry,
    WorkspaceRegistry,
    type MultiWindowWorkspaceState,
} from './workspaceRegistry';

export interface MultiWindowOrchestratorOptions {
    /** The workspace to start from, as a previous {@link MultiWindowOrchestrator.snapshot}. */
    workspace?: MultiWindowWorkspaceState;
    /** Default 25. No window's `layoutHistory.depth` should be lower. */
    historyDepth?: number;
    /** Open and connect a window for a detached drag. Without it, detaches are discarded. */
    createWindow?(windowId: string, payload: MultiWindowDragPayload): void;
}

class WindowChannel extends CompositeDisposable {
    readonly onDidRelease = new Emitter<MultiWindowReleaseEvent>();
    readonly onDidRequestHistory = new Emitter<MultiWindowHistoryRequest>();

    constructor() {
        super();
        this.addDisposables(this.onDidRelease, this.onDidRequestHistory);
    }
}

export class MultiWindowOrchestrator extends CompositeDisposable {
    private readonly _drags = new DragSessions();
    private readonly _workspace: WorkspaceRegistry;
    private readonly _history: HistorySequencer;
    private readonly _channels = new Map<string, WindowChannel>();
    private readonly _createWindow: MultiWindowOrchestratorOptions['createWindow'];
    private _detachedCount = 0;

    private readonly _onDidMove = new Emitter<MultiWindowMoveEvent>();
    readonly onDidMove: Event<MultiWindowMoveEvent> = this._onDidMove.event;

    private readonly _onDidChangeHistory =
        new Emitter<MultiWindowHistoryInfo>();
    readonly onDidChangeHistory: Event<MultiWindowHistoryInfo> =
        this._onDidChangeHistory.event;

    private readonly _onDidChangeWorkspace =
        new Emitter<MultiWindowWorkspaceState>();
    /** The workspace changed: a layout or frame was reported, or a window left. */
    readonly onDidChangeWorkspace: Event<MultiWindowWorkspaceState> =
        this._onDidChangeWorkspace.event;

    get windowIds(): string[] {
        return this._workspace.windowIds();
    }

    get history(): MultiWindowHistoryInfo {
        return this._history.info();
    }

    constructor(options: MultiWindowOrchestratorOptions = {}) {
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

    /** Throws when there is nothing to undo. */
    undo(): void {
        this._carryOut(this._history.undo(), 'undo');
    }

    /** Throws when there is nothing to redo. */
    redo(): void {
        this._carryOut(this._history.redo(), 'redo');
    }

    /** To persist and pass back as `workspace`. */
    snapshot(): MultiWindowWorkspaceState {
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
        // The source's earlier steps would bring the panels back.
        this._history.forgetWindow(ended.release.from);
        this._historyDidChange();
    }

    private _newWindowId(): string {
        const taken = new Set(this._workspace.windowIds());
        let windowId: string;
        do {
            windowId = `detached-${++this._detachedCount}`;
        } while (taken.has(windowId) || this._channels.has(windowId));
        return windowId;
    }

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
                // Stored first, so the window's report is not a duplicate.
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

/** A synchronous step as a transport call: its result or error, as a promise. */
function settle<T>(step: () => T): Promise<T> {
    try {
        return Promise.resolve(step());
    } catch (err: unknown) {
        return Promise.reject(err);
    }
}
