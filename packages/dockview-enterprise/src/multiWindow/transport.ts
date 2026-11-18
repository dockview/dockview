import type {
    DockviewCompositeDisposable,
    DockviewIDisposable,
    GroupviewPanelState,
    SerializedDockview,
    SerializedDockviewGroup,
} from 'dockview';

/**
 * How long a drag stays acceptable after `endDrag`: the destination's accept
 * can arrive after the source's `dragend`.
 */
export const DRAG_END_GRACE_MS = 1500;

/** One tab as its `toJSON()` state, or one group as `serializeGroup` output. */
export type MultiWindowDragPayload =
    | { kind: 'panel'; panel: GroupviewPanelState }
    | { kind: 'group'; group: SerializedDockviewGroup };

/** Delivered to the source window once another window took its drag. */
export interface MultiWindowReleaseEvent {
    readonly session: string;
    /** The window that took the payload. */
    readonly to: string;
    readonly reason: 'drop' | 'detach';
}

/** Broadcast after panels moved between any two windows. */
export interface MultiWindowMoveEvent {
    readonly session: string;
    readonly panels: string[];
    readonly from: string;
    readonly to: string;
    readonly reason: 'drop' | 'detach' | 'undo' | 'redo';
}

export type MoveRole = 'from' | 'to';

/** The step an undo or redo would take next. */
export type MultiWindowHistoryStep =
    | { readonly type: 'local'; readonly windowId: string }
    | {
          readonly type: 'move';
          readonly panels: string[];
          /** Unset until that window has reported its half of the move. */
          readonly from?: string;
          readonly to?: string;
      };

export interface MultiWindowHistoryInfo {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly undoCount: number;
    readonly redoCount: number;
    readonly nextUndo?: MultiWindowHistoryStep;
    readonly nextRedo?: MultiWindowHistoryStep;
}

/** What the orchestrator asks of one window to carry out an undo or redo. */
export type MultiWindowHistoryRequest =
    | { readonly type: 'undo' }
    | { readonly type: 'redo' }
    | { readonly type: 'apply-layout'; readonly layout: SerializedDockview };

/**
 * One window's connection to the orchestrator. Messages between a window and
 * the orchestrator must arrive in the order they were sent.
 */
export interface MultiWindowTransport {
    readonly windowId: string;

    startDrag(session: string, payload: MultiWindowDragPayload): Promise<void>;
    /** Read a drag's payload without accepting it. Rejects if not in flight. */
    peekDrag(session: string): Promise<MultiWindowDragPayload>;
    /** Accept a drop. Rejects if another window accepted it first. */
    acceptDrag(session: string): Promise<void>;
    /** With `detach`, an unaccepted drag becomes a new window holding it. */
    endDrag(session: string, detach: boolean): Promise<void>;
    onDidRelease(
        listener: (event: MultiWindowReleaseEvent) => void
    ): Promise<DockviewIDisposable>;
    /** The payload a detach parked for this window, if it was created by one. */
    takeDetachedDrag(): Promise<MultiWindowDragPayload | null>;
    /** This window's half of a move, for the shared history. */
    reportMove(
        session: string,
        role: 'from' | 'to',
        panels: string[],
        before: SerializedDockview,
        after: SerializedDockview
    ): Promise<void>;
    onDidMove(
        listener: (event: MultiWindowMoveEvent) => void
    ): Promise<DockviewIDisposable>;

    /** Null to build the window's defaults. */
    loadLayout(): Promise<SerializedDockview | null>;
    /** Rejects if the layout holds a panel another window holds. */
    reportLayout(layout: SerializedDockview): Promise<void>;

    reportLocalStep(): Promise<void>;
    undo(): Promise<void>;
    redo(): Promise<void>;
    getHistory(): Promise<MultiWindowHistoryInfo>;
    onDidRequestHistory(
        listener: (request: MultiWindowHistoryRequest) => void
    ): Promise<DockviewIDisposable>;
    onDidChangeHistory(
        listener: (info: MultiWindowHistoryInfo) => void
    ): Promise<DockviewIDisposable>;
}

export function payloadPanels(payload: MultiWindowDragPayload): string[] {
    return payload.kind === 'panel'
        ? [payload.panel.id]
        : payload.group.group.views;
}

/** Dispose a subscription with `owner`, even one that resolves after it. */
export function retainSubscription(
    owner: DockviewCompositeDisposable,
    subscription: Promise<DockviewIDisposable>
): void {
    subscription.then(
        (disposable) => {
            if (owner.isDisposed) {
                disposable.dispose();
            } else {
                owner.addDisposables(disposable);
            }
        },
        (err: unknown) => {
            console.error('dockview: multi-window subscription failed.', err);
        }
    );
}
