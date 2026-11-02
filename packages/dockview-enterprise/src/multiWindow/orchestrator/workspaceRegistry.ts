import type { SerializedDockview } from 'dockview';

export const WORKSPACE_FORMAT_VERSION = 1;

export interface WindowGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WindowRecord {
    id: string;
    geometry?: WindowGeometry;
    layout?: SerializedDockview;
}

/** The whole workspace, in the shape a host persists. */
export interface MultiWindowWorkspaceState {
    version: number;
    windows: WindowRecord[];
}

/** Until the source reports the panel gone, the destination may hold it too. */
interface PendingMove {
    panel: string;
    from: string;
    to: string;
}

export class WorkspaceRegistry {
    private readonly _windows: WindowRecord[];
    private readonly _pending: PendingMove[] = [];

    constructor(state?: MultiWindowWorkspaceState) {
        if (state && state.version !== WORKSPACE_FORMAT_VERSION) {
            throw new Error(
                `workspace format ${state.version} is not the supported ${WORKSPACE_FORMAT_VERSION}`
            );
        }
        this._windows = clone(state?.windows ?? []);
    }

    snapshot(): MultiWindowWorkspaceState {
        return {
            version: WORKSPACE_FORMAT_VERSION,
            windows: clone(this._windows),
        };
    }

    windowIds(): string[] {
        return this._windows.map((window) => window.id);
    }

    ensureWindow(windowId: string): void {
        this._entry(windowId);
    }

    expectMove(panels: string[], from: string, to: string): void {
        for (const panel of panels) {
            const index = this._pending.findIndex(
                (entry) => entry.panel === panel
            );
            if (index !== -1) {
                this._pending.splice(index, 1);
            }
            this._pending.push({ panel, from, to });
        }
    }

    setGeometry(windowId: string, geometry: WindowGeometry): void {
        this._entry(windowId).geometry = { ...geometry };
    }

    /** Refuses a layout holding another window's panel, unless a move explains it. */
    setLayout(windowId: string, layout: SerializedDockview): void {
        const incoming = panelIds(layout);
        for (const other of this._windows) {
            if (other.id === windowId || !other.layout) {
                continue;
            }
            const theirs = new Set(panelIds(other.layout));
            const duplicate = incoming.find(
                (id) =>
                    theirs.has(id) &&
                    !this._pending.some(
                        (entry) =>
                            entry.panel === id &&
                            entry.from === other.id &&
                            entry.to === windowId
                    )
            );
            if (duplicate) {
                throw new Error(
                    `panel ${duplicate} is already held by window ${other.id}`
                );
            }
        }
        // A source reporting without the panel completes the move.
        const kept = this._pending.filter(
            (entry) => entry.from !== windowId || incoming.includes(entry.panel)
        );
        this._pending.splice(0, this._pending.length, ...kept);
        this._entry(windowId).layout = clone(layout);
    }

    /** A layout the orchestrator itself applied. */
    setLayoutUnchecked(windowId: string, layout: SerializedDockview): void {
        this._entry(windowId).layout = clone(layout);
    }

    loadLayout(windowId: string): SerializedDockview | null {
        const record = this._windows.find((window) => window.id === windowId);
        return record?.layout ? clone(record.layout) : null;
    }

    removeWindow(windowId: string): WindowRecord | undefined {
        const index = this._windows.findIndex(
            (window) => window.id === windowId
        );
        if (index === -1) {
            return undefined;
        }
        return this._windows.splice(index, 1)[0];
    }

    private _entry(windowId: string): WindowRecord {
        let record = this._windows.find((window) => window.id === windowId);
        if (!record) {
            record = { id: windowId };
            this._windows.push(record);
        }
        return record;
    }
}

function panelIds(layout: SerializedDockview): string[] {
    return Object.keys(layout.panels ?? {});
}

/** So callers cannot alias state. */
function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
