import type { MultiWindowDragPayload } from '../transport';

export interface DragSession {
    readonly from: string;
    readonly payload: MultiWindowDragPayload;
}

interface TrackedSession extends DragSession {
    /** Set once the source reported its drag over; the value is `detach`. */
    ended?: boolean;
}

export interface Release {
    readonly from: string;
    readonly session: string;
    readonly to: string;
}

export interface Accept {
    readonly payload: MultiWindowDragPayload;
    readonly release: Release;
}

export type DragEnd =
    | { readonly outcome: 'settled' }
    | { readonly outcome: 'discarded' }
    | {
          readonly outcome: 'detached';
          readonly windowId: string;
          readonly payload: MultiWindowDragPayload;
          readonly release: Release;
      };

export class DragSessions {
    private readonly _sessions = new Map<string, TrackedSession>();
    /** By the id of the window created to hold them. */
    private readonly _detached = new Map<string, MultiWindowDragPayload>();

    start(session: string, drag: DragSession): void {
        this._sessions.set(session, { ...drag });
    }

    peek(session: string): MultiWindowDragPayload {
        return this._inFlight(session).payload;
    }

    /** The first accept wins; a second throws. */
    accept(session: string, to: string): Accept {
        const taken = this._inFlight(session);
        this._sessions.delete(session);
        return {
            payload: taken.payload,
            release: { from: taken.from, session, to },
        };
    }

    /** The drag stays acceptable until {@link expire}. Returns whether it is in flight. */
    end(session: string, detach: boolean): boolean {
        const tracked = this._sessions.get(session);
        if (!tracked) {
            return false;
        }
        tracked.ended = detach;
        return true;
    }

    /** Discard an ended, unaccepted drag, or park it for a new window. */
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

    takeDetachedDrag(windowId: string): MultiWindowDragPayload | null {
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
