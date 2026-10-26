import {
    type DockviewApi,
    type DockviewIDisposable,
    type DragPayload,
    type HistoryInfo,
    type HistoryRequest,
    installMultiWindow,
    type MoveEvent,
    type MultiWindow,
    type MultiWindowOptions,
    type MultiWindowTransport,
    type ReleaseEvent,
    type SerializedDockview,
} from 'dockview-enterprise';
import { isTauri } from './host';

const EMPTY_HISTORY: HistoryInfo = {
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
};

/** Asynchronous only because the Tauri api loads lazily. */
export async function createTauriTransport(): Promise<MultiWindowTransport> {
    if (!isTauri()) {
        return browserTransport();
    }
    const [{ invoke }, { listen }, { getCurrentWebviewWindow }] =
        await Promise.all([
            import('@tauri-apps/api/core'),
            import('@tauri-apps/api/event'),
            import('@tauri-apps/api/webviewWindow'),
        ]);
    const current = getCurrentWebviewWindow();

    const everyWindow =
        <T>(event: string) =>
        async (
            listener: (payload: T) => void
        ): Promise<DockviewIDisposable> => ({
            dispose: await listen<T>(event, (e) => listener(e.payload)),
        });

    /** A listener for "any" target hears every window's events, so filter on `key`. */
    const thisWindow =
        <P, T>(event: string, key: keyof P, pick: (payload: P) => T) =>
        async (listener: (value: T) => void): Promise<DockviewIDisposable> => ({
            dispose: await current.listen<P>(event, (e) => {
                if (e.payload[key] === current.label) {
                    listener(pick(e.payload));
                }
            }),
        });

    return {
        windowId: current.label,

        startDrag: (session, payload) =>
            invoke<void>('start_drag', { session, payload }),
        peekDrag: (session) => invoke<DragPayload>('peek_drag', { session }),
        acceptDrag: (session) => invoke<void>('accept_drag', { session }),
        endDrag: (session, detach) =>
            invoke<void>('end_drag', { session, detach }),
        onDidRelease: thisWindow<ReleaseEvent & { from: string }, ReleaseEvent>(
            'dockview:release',
            'from',
            (payload) => payload
        ),
        takeDetachedDrag: () =>
            invoke<DragPayload | null>('take_detached_drag'),
        reportMove: (session, role, panels, before, after) =>
            invoke<void>('report_move', {
                session,
                role,
                panels,
                before,
                after,
            }),
        onDidMove: everyWindow<MoveEvent>('dockview:moved'),

        loadLayout: () => invoke<SerializedDockview | null>('load_layout'),
        reportLayout: (layout) => invoke<void>('report_layout', { layout }),

        reportLocalStep: () => invoke<void>('report_local_step'),
        undo: () => invoke<void>('undo'),
        redo: () => invoke<void>('redo'),
        getHistory: () => invoke<HistoryInfo>('get_history'),
        onDidRequestHistory: thisWindow<
            { window: string; request: HistoryRequest },
            HistoryRequest
        >('dockview:history-request', 'window', (payload) => payload.request),
        onDidChangeHistory: everyWindow<HistoryInfo>('dockview:history'),
    };
}

function browserTransport(): MultiWindowTransport {
    const nothing = async () => undefined;
    const silent = async (): Promise<DockviewIDisposable> => ({
        dispose: () => undefined,
    });
    const shellOnly = () =>
        Promise.reject(new Error('another window needs the Tauri shell'));
    return {
        windowId: 'browser',
        startDrag: nothing,
        peekDrag: shellOnly,
        acceptDrag: shellOnly,
        endDrag: nothing,
        onDidRelease: silent,
        takeDetachedDrag: async () => null,
        reportMove: nothing,
        onDidMove: silent,
        loadLayout: async () => null,
        reportLayout: nothing,
        reportLocalStep: nothing,
        undo: nothing,
        redo: nothing,
        getHistory: async () => EMPTY_HISTORY,
        onDidRequestHistory: silent,
        onDidChangeHistory: silent,
    };
}

export interface CrossWindowCounters {
    dragsStarted: number;
    dropsAccepted: number;
    dropsRefused: number;
    releases: number;
}

export interface ShellMultiWindow {
    readonly multiWindow: MultiWindow;
    readonly counters: Readonly<CrossWindowCounters>;
    onLog(listener: (line: string) => void): () => void;
}

export async function installShellMultiWindow(
    api: DockviewApi,
    options: Pick<MultiWindowOptions, 'buildDefaults'>
): Promise<ShellMultiWindow> {
    const listeners = new Set<(line: string) => void>();
    const log = (line: string) => {
        for (const listener of listeners) {
            listener(line);
        }
    };
    const counters: CrossWindowCounters = {
        dragsStarted: 0,
        dropsAccepted: 0,
        dropsRefused: 0,
        releases: 0,
    };

    const transport = observed(await createTauriTransport(), counters, log);
    const multiWindow = installMultiWindow(api, transport, options);
    bindUndoKeys(multiWindow);
    void multiWindow.ready.then(({ restored }) => {
        log(
            restored
                ? `restored layout with ${api.panels.length} panel(s)`
                : `started with ${api.panels.length} panel(s)`
        );
    });

    return {
        multiWindow,
        counters,
        onLog(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

function bindUndoKeys(multiWindow: MultiWindow): void {
    document.addEventListener('keydown', (event) => {
        const target = event.target as HTMLElement;
        if (
            !(event.ctrlKey || event.metaKey) ||
            event.altKey ||
            target.closest?.('input, textarea, select, [contenteditable]')
        ) {
            return;
        }
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) {
            event.preventDefault();
            multiWindow.undo();
        } else if (key === 'z' || key === 'y') {
            event.preventDefault();
            multiWindow.redo();
        }
    });
}

function observed(
    transport: MultiWindowTransport,
    counters: CrossWindowCounters,
    log: (line: string) => void
): MultiWindowTransport {
    const short = (session: string) => session.slice(0, 8);
    const refused = (session: string) => (err: unknown) => {
        counters.dropsRefused += 1;
        log(`drop ${short(session)} refused: ${String(err)}`);
        throw err;
    };

    return {
        ...transport,
        startDrag: (session, payload) => {
            counters.dragsStarted += 1;
            log(`drag ${short(session)} announced (${payload.kind})`);
            return transport.startDrag(session, payload);
        },
        peekDrag: (session) =>
            transport.peekDrag(session).catch(refused(session)),
        acceptDrag: (session) =>
            transport.acceptDrag(session).catch(refused(session)),
        onDidRelease: (listener) =>
            transport.onDidRelease((event) => {
                counters.releases += 1;
                log(
                    `released ${short(event.session)} to ${event.to} (${event.reason})`
                );
                listener(event);
            }),
        takeDetachedDrag: () =>
            transport.takeDetachedDrag().then((payload) => {
                if (payload) {
                    log(`started with detached ${payload.kind}`);
                }
                return payload;
            }),
        reportMove: (session, role, panels, before, after) => {
            if (role === 'to') {
                const placed = panels.every((id) => id in (after.panels ?? {}));
                if (placed) {
                    counters.dropsAccepted += 1;
                    log(
                        `drop ${short(session)} placed ${panels.length} panel(s)`
                    );
                } else {
                    counters.dropsRefused += 1;
                    log(`drop ${short(session)} could not be placed`);
                }
            }
            return transport.reportMove(session, role, panels, before, after);
        },
    };
}
