import {
    type DockviewApi,
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewEmitter as Emitter,
    type DockviewEvent as Event,
} from 'dockview';
import { CrossWindowDnd } from './crossWindowDnd';
import { EMPTY_HISTORY, SharedHistory } from './sharedHistory';
import type {
    MultiWindowHistoryInfo,
    MultiWindowMoveEvent,
    MultiWindowTransport,
} from './transport';
import { WindowWorkspace } from './windowWorkspace';

export interface MultiWindowOptions {
    /** Builds the layout of a window the orchestrator has none for. */
    buildDefaults?(windowId: string): void;
    /** Restore and report this window's layout. Default true. */
    workspace?: boolean;
    /** Default 300 ms. */
    debounceMs?: number;
    /** One undo across windows. Default true. */
    history?: boolean;
    /**
     * Turn an unaccepted drag into a new window. Off by default: an HTML5
     * drag cannot tell a drop on the desktop from a cancelled one.
     */
    detach?: boolean;
}

export class MultiWindow extends CompositeDisposable {
    private readonly _api: DockviewApi;
    private readonly _transport: MultiWindowTransport;
    private readonly _dnd: CrossWindowDnd;
    private readonly _history: SharedHistory | undefined;

    private readonly _onDidChangeHistory =
        new Emitter<MultiWindowHistoryInfo>();
    readonly onDidChangeHistory: Event<MultiWindowHistoryInfo> =
        this._onDidChangeHistory.event;

    readonly onDidMoveAcrossWindows: Event<MultiWindowMoveEvent>;

    /** Resolves once the window holds its initial layout, restored or default. */
    readonly ready: Promise<{ restored: boolean }>;

    get windowId(): string {
        return this._transport.windowId;
    }

    get history(): MultiWindowHistoryInfo {
        return this._history?.info ?? EMPTY_HISTORY;
    }

    constructor(
        api: DockviewApi,
        transport: MultiWindowTransport,
        parts: {
            dnd: CrossWindowDnd;
            workspace?: WindowWorkspace;
            history?: SharedHistory;
            ready: Promise<{ restored: boolean }>;
        }
    ) {
        super();
        this._api = api;
        this._transport = transport;
        this._dnd = parts.dnd;
        this._history = parts.history;
        this.ready = parts.ready;
        this.onDidMoveAcrossWindows = this._dnd.onDidMove;

        let warnedPopout = false;
        this.addDisposables(
            this._onDidChangeHistory,
            this._dnd,
            api.onDidLayoutChange(() => {
                if (
                    !warnedPopout &&
                    api.groups.some(
                        (group) => group.api.location.type === 'popout'
                    )
                ) {
                    warnedPopout = true;
                    console.warn(
                        'dockview: popout groups are not supported in a multi-window layout; undo and restore do not account for them.'
                    );
                }
            })
        );
        if (parts.workspace) {
            this.addDisposables(parts.workspace);
        }
        if (this._history) {
            this.addDisposables(
                this._history,
                this._history.onDidChange((info) =>
                    this._onDidChangeHistory.fire(info)
                )
            );
        }
    }

    /** Falls back to this window's own history with `history: false`. */
    undo(): void {
        if (this._history) {
            this._history.undo();
        } else {
            this._api.undo();
        }
    }

    redo(): void {
        if (this._history) {
            this._history.redo();
        } else {
            this._api.redo();
        }
    }

    updateOptions(options: Pick<MultiWindowOptions, 'detach'>): void {
        if (options.detach !== undefined) {
            this._dnd.detach = options.detach;
        }
    }
}

export function installMultiWindow(
    api: DockviewApi,
    transport: MultiWindowTransport,
    options: MultiWindowOptions = {}
): MultiWindow {
    const dnd = new CrossWindowDnd(api, transport, { detach: options.detach });
    dnd.connect();

    let workspace: WindowWorkspace | undefined;
    let ready: Promise<{ restored: boolean }>;
    if (options.workspace === false) {
        ready = dnd.placeDetachedDrag().then(() => ({ restored: false }));
    } else {
        workspace = new WindowWorkspace(api, transport, {
            buildDefaults: async (windowId) => {
                if (!(await dnd.placeDetachedDrag())) {
                    options.buildDefaults?.(windowId);
                }
            },
            debounceMs: options.debounceMs,
        });
        ready = workspace.restore();
    }

    let history: SharedHistory | undefined;
    if (options.history !== false) {
        history = new SharedHistory(api, transport);
        history.connect();
    }

    return new MultiWindow(api, transport, { dnd, workspace, history, ready });
}
