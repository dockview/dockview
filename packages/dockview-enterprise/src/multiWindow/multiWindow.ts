/**
 * The one install for a window of a multi-window layout. It composes the
 * cross-window drag, the workspace and the shared history over the public
 * api, behind one transport to the orchestrator, and returns one handle for
 * the few things that only exist across windows. Everything else about the
 * instance keeps working as before.
 */

import {
    type DockviewApi,
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewEmitter as Emitter,
    type DockviewEvent as Event,
} from 'dockview';
import { CrossWindowDnd } from './crossWindowDnd';
import { EMPTY_HISTORY, SharedHistory } from './sharedHistory';
import type { HistoryInfo, MoveEvent, MultiWindowTransport } from './transport';
import { WindowWorkspace } from './windowWorkspace';

export interface MultiWindowOptions {
    /**
     * Builds the window's default layout when the orchestrator has none for
     * it. Not called for a window a detach created, which starts with what
     * was dragged, nor without the workspace (`workspace: false`).
     */
    buildDefaults?(windowId: string): void;
    /**
     * Restore this window's layout from the orchestrator at start and report
     * every change back. Default true.
     */
    workspace?: boolean;
    /** How long after a change the layout is reported. Default 300 ms. */
    debounceMs?: number;
    /**
     * One undo across windows, sequenced by the orchestrator. Default on,
     * with no key bound; `{ bindKeys: true }` routes Ctrl+Z / Ctrl+Shift+Z /
     * Ctrl+Y (Cmd on macOS) on the document to it. `false` keeps undo local
     * to each window.
     */
    history?: boolean | { bindKeys?: boolean };
    /**
     * Turn an unaccepted drag into a new window, where the orchestrator
     * supports it. Off by default: an HTML5 drag cannot tell a drop on the
     * desktop from a cancelled drag.
     */
    detach?: boolean;
}

export class MultiWindow extends CompositeDisposable {
    private readonly _api: DockviewApi;
    private readonly _transport: MultiWindowTransport;
    private readonly _dnd: CrossWindowDnd;
    private readonly _history: SharedHistory | undefined;

    private readonly _onDidChangeHistory = new Emitter<HistoryInfo>();
    readonly onDidChangeHistory: Event<HistoryInfo> =
        this._onDidChangeHistory.event;

    /** Panels moved between any two windows: by a drop, a detach, or undo or redo. */
    readonly onDidMoveAcrossWindows: Event<MoveEvent>;

    /** Resolves once the window holds its initial layout, restored or default. */
    readonly ready: Promise<{ restored: boolean }>;

    get windowId(): string {
        return this._transport.windowId;
    }

    /** The shared history's state; empty with `history: false`. */
    get history(): HistoryInfo {
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

        this.addDisposables(this._onDidChangeHistory, this._dnd);
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

    /**
     * Undo the most recent step in any window. With `history: false` this
     * falls back to this window's own history.
     */
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
        history = new SharedHistory(api, transport, {
            bindKeys:
                typeof options.history === 'object' && options.history.bindKeys,
        });
        history.connect();
    }

    return new MultiWindow(api, transport, { dnd, workspace, history, ready });
}
