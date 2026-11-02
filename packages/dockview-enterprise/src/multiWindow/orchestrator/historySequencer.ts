import type { SerializedDockview } from 'dockview';
import type {
    MultiWindowHistoryInfo,
    MultiWindowHistoryRequest,
    MultiWindowHistoryStep,
    MultiWindowMoveEvent,
    MoveRole,
} from '../transport';

/** No window's `layoutHistory.depth` should be lower. */
export const DEFAULT_HISTORY_DEPTH = 25;

/** A move still missing a half after this never completes. */
export const ABANDONED_MOVE_MS = 10_000;

export interface MoveHalf {
    readonly window: string;
    readonly before: SerializedDockview;
    readonly after: SerializedDockview;
}

type HistoryEntry =
    | { readonly type: 'local'; readonly window: string }
    | {
          readonly type: 'move';
          readonly session: string;
          readonly panels: string[];
          /** When the first half arrived. */
          readonly opened: number;
          from?: MoveHalf;
          to?: MoveHalf;
      };

type MoveEntry = Extract<HistoryEntry, { type: 'move' }>;

export interface HistoryAction {
    readonly window: string;
    readonly request: MultiWindowHistoryRequest;
}

export interface HistoryStep {
    readonly actions: HistoryAction[];
    readonly moved?: Omit<MultiWindowMoveEvent, 'reason'>;
}

export class HistorySequencer {
    private readonly _undo: HistoryEntry[] = [];
    private readonly _redo: HistoryEntry[] = [];
    private readonly _depth: number;
    private readonly _now: () => number;

    constructor(depth = DEFAULT_HISTORY_DEPTH, now: () => number = Date.now) {
        this._depth = depth;
        this._now = now;
    }

    pushLocal(window: string): void {
        this._push({ type: 'local', window });
    }

    /** The two halves of a move arrive in either order. */
    recordMove(
        session: string,
        panels: string[],
        role: MoveRole,
        half: MoveHalf
    ): void {
        const existing = this._undo.find(
            (entry): entry is MoveEntry =>
                entry.type === 'move' && entry.session === session
        );
        if (existing) {
            existing[role] = half;
            return;
        }
        this._push({
            type: 'move',
            session,
            panels: [...panels],
            opened: this._now(),
            [role]: half,
        });
    }

    /** Throws when there is nothing to undo or the top move is incomplete. */
    undo(): HistoryStep {
        const entry = this._undo[this._undo.length - 1];
        if (!entry) {
            throw new Error('nothing to undo');
        }
        if (
            entry.type === 'move' &&
            (!entry.from || !entry.to) &&
            this._now() - entry.opened >= ABANDONED_MOVE_MS
        ) {
            // The steps before it restore layouts from before the move.
            this._undo.length = 0;
            throw new Error(
                `move ${entry.session} was never completed; the history before it is dropped`
            );
        }
        let step: HistoryStep;
        if (entry.type === 'local') {
            step = {
                actions: [{ window: entry.window, request: { type: 'undo' } }],
            };
        } else {
            const { from, to } = complete(entry);
            step = {
                actions: [
                    apply(to.window, to.before),
                    apply(from.window, from.before),
                ],
                moved: {
                    session: entry.session,
                    panels: entry.panels,
                    from: to.window,
                    to: from.window,
                },
            };
        }
        this._undo.pop();
        this._redo.push(entry);
        return step;
    }

    /** Throws when there is nothing to redo. */
    redo(): HistoryStep {
        const entry = this._redo[this._redo.length - 1];
        if (!entry) {
            throw new Error('nothing to redo');
        }
        let step: HistoryStep;
        if (entry.type === 'local') {
            step = {
                actions: [{ window: entry.window, request: { type: 'redo' } }],
            };
        } else {
            const { from, to } = complete(entry);
            step = {
                actions: [
                    apply(from.window, from.after),
                    apply(to.window, to.after),
                ],
                moved: {
                    session: entry.session,
                    panels: entry.panels,
                    from: from.window,
                    to: to.window,
                },
            };
        }
        this._redo.pop();
        this._undo.push(entry);
        return step;
    }

    info(): MultiWindowHistoryInfo {
        const nextUndo = this._undo[this._undo.length - 1];
        const nextRedo = this._redo[this._redo.length - 1];
        return {
            canUndo: nextUndo !== undefined,
            canRedo: nextRedo !== undefined,
            undoCount: this._undo.length,
            redoCount: this._redo.length,
            ...(nextUndo && { nextUndo: summarize(nextUndo) }),
            ...(nextRedo && { nextRedo: summarize(nextRedo) }),
        };
    }

    /**
     * Drop the window's entries and every incomplete move, and everything
     * older than a move dropped: those steps restore layouts from before it.
     */
    forgetWindow(window: string): void {
        const involves = (entry: HistoryEntry) =>
            entry.type === 'local'
                ? entry.window === window
                : !entry.from ||
                  !entry.to ||
                  entry.from.window === window ||
                  entry.to.window === window;
        // Oldest first in both stacks.
        for (const stack of [this._undo, this._redo]) {
            let cut = -1;
            stack.forEach((entry, index) => {
                if (entry.type === 'move' && involves(entry)) {
                    cut = index;
                }
            });
            const kept = stack.filter(
                (entry, index) => index > cut && !involves(entry)
            );
            stack.splice(0, stack.length, ...kept);
        }
    }

    private _push(entry: HistoryEntry): void {
        this._undo.push(entry);
        this._redo.length = 0;
        while (this._undo.length > this._depth) {
            this._undo.shift();
        }
    }
}

function apply(window: string, layout: SerializedDockview): HistoryAction {
    return { window, request: { type: 'apply-layout', layout } };
}

function complete(entry: MoveEntry): { from: MoveHalf; to: MoveHalf } {
    if (!entry.from || !entry.to) {
        throw new Error(`move ${entry.session} is still being recorded`);
    }
    return { from: entry.from, to: entry.to };
}

function summarize(entry: HistoryEntry): MultiWindowHistoryStep {
    if (entry.type === 'local') {
        return { type: 'local', windowId: entry.window };
    }
    return {
        type: 'move',
        panels: entry.panels,
        ...(entry.from && { from: entry.from.window }),
        ...(entry.to && { to: entry.to.window }),
    };
}
