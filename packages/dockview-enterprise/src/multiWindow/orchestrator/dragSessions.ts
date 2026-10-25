/**
 * The drag sessions an orchestrator tracks: announced by a source window,
 * accepted by at most one destination, or ended unaccepted. Pure state; the
 * orchestrator decides what to do with each outcome.
 */

import type { DragPayload } from '../transport';

export interface DragSession {
    readonly from: string;
    readonly payload: DragPayload;
}

interface TrackedSession extends DragSession {
    /** Set once the source reported its drag over; the value is `detach`. */
    ended?: boolean;
}

/** The source to tell that its drag was taken. */
export interface Release {
    readonly from: string;
    readonly session: string;
    readonly to: string;
}

export interface Accept {
    readonly payload: DragPayload;
    readonly release: Release;
}

export type DragEnd =
    | { readonly outcome: 'settled' }
    | { readonly outcome: 'discarded' }
    | {
          readonly outcome: 'detached';
          readonly windowId: string;
          readonly payload: DragPayload;
          readonly release: Release;
      };

export class DragSessions {
    private readonly _sessions = new Map<string, TrackedSession>();
    /** Payloads of detached drags, by the window created to hold them. */
    private readonly _detached = new Map<string, DragPayload>();

    start(session: string, drag: DragSession): void {
        this._sessions.set(session, { ...drag });
    }

    /** The payload of a drag in flight; throws otherwise. */
    peek(session: string): DragPayload {
        return this._inFlight(session).payload;
    }

    /** Take the drag for `to`. The first accept wins; a second throws. */
    accept(session: string, to: string): Accept {
        const taken = this._inFlight(session);
        this._sessions.delete(session);
        return {
            payload: taken.payload,
            release: { from: taken.from, session, to },
        };
    }

    /**
     * The source reported its drag over. Nothing happens yet; the drag
     * stays acceptable until {@link expire}. Returns whether it was in
     * flight, so an already-accepted drag needs no expiry.
     */
    end(session: string, detach: boolean): boolean {
        const tracked = this._sessions.get(session);
        if (!tracked) {
            return false;
        }
        tracked.ended = detach;
        return true;
    }

    /**
     * Settle an ended drag nobody accepted: discard it, or, when the source
     * asked for a detach, park its payload under a window id from
     * `newWindowId` for that window to collect with {@link takeDetachedDrag}.
     */
    expire(session: string, newWindowId: () => string): DragEnd {
        const tracked = this._sessions.get(session);
        if (tracked?.ended === undefined) {
            return { outcome: 'settled' };
        }
        this._sessions.delete(session);
        if (!tracked.ended) {
            return { outcome: 'discarded' };
        }
        const windowId = newWindowId();
        this._detached.set(windowId, tracked.payload);
        return {
            outcome: 'detached',
            windowId,
            payload: tracked.payload,
            release: { from: tracked.from, session, to: windowId },
        };
    }

    takeDetachedDrag(windowId: string): DragPayload | null {
        const payload = this._detached.get(windowId) ?? null;
        this._detached.delete(windowId);
        return payload;
    }

    private _inFlight(session: string): TrackedSession {
        const tracked = this._sessions.get(session);
        if (!tracked) {
            throw new Error(`drag session ${session} is not in flight`);
        }
        return tracked;
    }
}
