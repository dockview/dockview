import {
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewEmitter as Emitter,
    DockviewEvent as Event,
    DockviewComponentOptions,
    DockviewLayoutMutationEvent,
    DockviewLayoutMutationKind,
    SerializedDockview,
    defineModule,
    ILayoutHistoryHost,
    ILayoutHistoryService,
    LayoutChangeEvent,
    LayoutHistoryChangeEvent,
    LayoutHistoryKind,
} from 'dockview';

interface HistoryEntry {
    readonly kind: LayoutHistoryKind;
    readonly origin: DockviewLayoutMutationEvent['origin'];
    /** Pre-image: what undo restores. */
    readonly before: SerializedDockview;
    /** Post-image: what redo restores. */
    readonly after: SerializedDockview;
    readonly timestamp: number;
}

const DEFAULT_DEPTH = 25;
const DEFAULT_COALESCE_MS = 400;

/** Discrete mutations that produce one undo step each. */
const DISCRETE: ReadonlySet<DockviewLayoutMutationKind> = new Set([
    'add',
    'remove',
    'move',
    'float',
    'popout',
    'maximize',
    'tab-group',
]);

/** Bulk transactions that replace the whole layout. They clear history rather
 *  than recording, since undoing across a full restore resurrects a foreign layout. */
const BULK: ReadonlySet<DockviewLayoutMutationKind> = new Set([
    'load',
    'clear',
]);

function resolveOptions(options: DockviewComponentOptions): {
    enabled: boolean;
    depth: number;
    undoableProgrammaticMutations: boolean;
    clearOnFromJSON: boolean;
    recordResize: boolean;
    coalesceMs: number;
} {
    const o = options.layoutHistory;
    return {
        enabled: o?.enabled ?? false,
        depth: o?.depth ?? DEFAULT_DEPTH,
        undoableProgrammaticMutations:
            o?.undoableProgrammaticMutations ?? false,
        clearOnFromJSON: o?.clearOnFromJSON ?? true,
        recordResize: o?.recordResize ?? true,
        coalesceMs: o?.coalesceMs ?? DEFAULT_COALESCE_MS,
    };
}

/**
 * Undo / redo for layout mutations. Snapshot strategy: each recorded mutation
 * keeps a full `toJSON()` pre-image (`before`) and post-image (`after`); undo
 * restores `before` via `fromJSON(.., { reuseExistingPanels: true })`, redo
 * restores `after`. Opt-in via `layoutHistory.enabled`.
 *
 * Discrete mutations (close/move/float/popout/add/maximize/tab-group) record one
 * step each off the will/did boundary. Resize (sash drag) has no boundary, so
 * it's caught off the coalesced `onDidLayoutChange` ping, using the last settled
 * snapshot as the pre-image (the "lazy pre-image"), and a continuous drag is
 * debounced into a single entry; only a ping whose `reasons` carry `'geometry'`
 * (or an unbracketed `'structure'`) opens a run, the rest only refresh the
 * baseline. A bulk `load`/`clear` clears the stacks. Undo /
 * redo restore popout windows, which re-open asynchronously, so the guard is held
 * across that re-open via `popoutRestorationPromise`.
 */
export class LayoutHistoryService
    extends CompositeDisposable
    implements ILayoutHistoryService
{
    private readonly _host: ILayoutHistoryHost;
    private readonly _undo: HistoryEntry[] = [];
    private readonly _redo: HistoryEntry[] = [];
    /** Pre-image captured on `onWillMutateLayout`, consumed on `onDidMutateLayout`. */
    private _pendingBefore: SerializedDockview | undefined;
    /** >0 while an undo/redo apply is in flight (counter, not a boolean, so an
     *  apply that starts before a previous one's async popout restoration has
     *  settled still keeps the guard up). The recorder ignores all boundary /
     *  layout events while it's active (re-entrancy). */
    private _applyDepth = 0;
    private get _applying(): boolean {
        return this._applyDepth > 0;
    }

    // --- resize coalescing (off the post-only onDidLayoutChange ping) ---
    /** The last settled snapshot, used as the pre-image for the next resize run. */
    private _baseline: SerializedDockview | undefined;
    /** The resize entry currently being coalesced (open during a drag). */
    private _pendingResize:
        | { before: SerializedDockview; after: SerializedDockview }
        | undefined;
    private _resizeTimer: ReturnType<typeof setTimeout> | undefined;
    /** Set when a boundary mutation just ran, so its trailing layout ping is
     *  treated as a settle, not the start of a resize. */
    private _mutationSettlePending = false;

    private readonly _onDidChangeHistory =
        new Emitter<LayoutHistoryChangeEvent>();
    readonly onDidChangeHistory: Event<LayoutHistoryChangeEvent> =
        this._onDidChangeHistory.event;

    constructor(host: ILayoutHistoryHost) {
        super();
        this._host = host;

        this.addDisposables(
            this._onDidChangeHistory,
            host.onWillMutateLayout((e) => this._onWill(e)),
            host.onDidMutateLayout((e) => this._onDid(e)),
            host.onDidLayoutChange((e) => this._onLayoutChange(e)),
            { dispose: () => this._clearResizeTimer() }
        );
    }

    private get _opts() {
        // Read live so `updateOptions({ layoutHistory })` applies without rebuild.
        return resolveOptions(this._host.options);
    }

    get canUndo(): boolean {
        return this._undo.length > 0;
    }

    get canRedo(): boolean {
        return this._redo.length > 0;
    }

    private _records(e: DockviewLayoutMutationEvent): boolean {
        const opts = this._opts;
        if (!opts.enabled || this._applying) {
            return false;
        }
        if (!DISCRETE.has(e.kind)) {
            return false;
        }
        // A programmatic (`api.*`) mutation is the app's own state management;
        // by default it doesn't pollute the user's Ctrl+Z stack.
        return e.origin === 'user' || opts.undoableProgrammaticMutations;
    }

    private _onWill(e: DockviewLayoutMutationEvent): void {
        if (this._applying) {
            return;
        }
        // A discrete mutation closes any open resize run first, so a resize and
        // an unrelated close never fold into one undo step.
        this._finalizeResize();
        // Fully inert when off: never touch toJSON() (zero overhead, and no
        // side effects on hosts whose serialization reads live geometry).
        if (!this._opts.enabled) {
            this._pendingBefore = undefined;
            return;
        }
        // A bulk restore/clear blows away the stacks (see class doc); nothing to
        // pre-image.
        if (BULK.has(e.kind)) {
            return;
        }
        // Capture the pre-image only when this mutation will actually be
        // recorded, which avoids a wasted toJSON() on ignored mutations.
        this._pendingBefore = this._records(e)
            ? this._host.toJSON()
            : undefined;
    }

    private _onDid(e: DockviewLayoutMutationEvent): void {
        if (this._applying) {
            return;
        }
        if (!this._opts.enabled) {
            this._pendingBefore = undefined;
            return;
        }
        // The trailing layout ping from this mutation is a settle, not a resize.
        this._mutationSettlePending = true;
        if (BULK.has(e.kind)) {
            if (this._opts.enabled && this._opts.clearOnFromJSON) {
                this.clear();
            }
            this._pendingBefore = undefined;
            this._baseline = undefined;
            return;
        }
        const before = this._pendingBefore;
        this._pendingBefore = undefined;
        if (!before || !this._records(e)) {
            // Not recorded, but the layout still changed. Keep the baseline
            // current so the next resize's pre-image is right (only when resize
            // recording is on, else don't bother calling toJSON()).
            if (this._opts.recordResize) {
                this._baseline = this._host.toJSON();
            }
            return;
        }
        const after = this._host.toJSON();
        this._push({
            kind: e.kind,
            origin: e.origin,
            before,
            after,
            timestamp: Date.now(),
        });
        this._baseline = after;
    }

    /** Push an entry, invalidate redo, trim to depth, and notify. */
    private _push(entry: HistoryEntry): void {
        this._undo.push(entry);
        // A fresh mutation invalidates the redo future.
        this._redo.length = 0;
        // Bounded ring: drop the oldest beyond the depth limit.
        const depth = Math.max(1, this._opts.depth);
        while (this._undo.length > depth) {
            this._undo.shift();
        }
        this._fire('push');
    }

    // --- resize coalescing ---

    private _onLayoutChange(e: LayoutChangeEvent): void {
        if (this._applying) {
            return;
        }
        const opts = this._opts;
        if (!opts.enabled || !opts.recordResize) {
            // Feature off: don't hold a stale baseline or pending run.
            this._baseline = undefined;
            this._clearResizeTimer();
            this._pendingResize = undefined;
            return;
        }
        // The ping that trails a boundary mutation (or the initial layout) is a
        // settle: record the resting snapshot as the baseline, don't open a run.
        if (this._mutationSettlePending || this._baseline === undefined) {
            this._mutationSettlePending = false;
            this._baseline = this._host.toJSON();
            return;
        }
        if (!e.reasons.has('geometry') && !e.reasons.has('structure')) {
            // Metadata only (active panel / title / params): not a resize, not
            // an undo step. Keep the baseline (or the open run's post-image)
            // current so a later resize does not fold it into its pre-image.
            const snapshot = this._host.toJSON();
            if (this._pendingResize) {
                this._pendingResize.after = snapshot;
            } else {
                this._baseline = snapshot;
            }
            return;
        }
        // A genuine resize ping: open or extend the coalesced run.
        const after = this._host.toJSON();
        if (!this._pendingResize) {
            this._pendingResize = { before: this._baseline, after };
        } else {
            this._pendingResize.after = after;
        }
        this._clearResizeTimer();
        this._resizeTimer = setTimeout(
            () => this._finalizeResize(),
            opts.coalesceMs
        );
    }

    /** Close an open resize run, pushing one entry for the whole drag. */
    private _finalizeResize(): void {
        this._clearResizeTimer();
        const pending = this._pendingResize;
        this._pendingResize = undefined;
        if (!pending) {
            return;
        }
        this._baseline = pending.after;
        // A drag that nets no change (e.g. settled back) isn't an undo step.
        if (JSON.stringify(pending.before) === JSON.stringify(pending.after)) {
            return;
        }
        this._push({
            kind: 'resize',
            origin: 'user',
            before: pending.before,
            after: pending.after,
            timestamp: Date.now(),
        });
    }

    private _clearResizeTimer(): void {
        if (this._resizeTimer !== undefined) {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = undefined;
        }
    }

    undo(): void {
        // A pending resize drag is a real step, so commit it before undoing it.
        this._finalizeResize();
        const entry = this._undo.pop();
        if (!entry) {
            return;
        }
        this._apply(entry.before);
        this._redo.push(entry);
        this._fire('undo');
    }

    redo(): void {
        this._finalizeResize();
        const entry = this._redo.pop();
        if (!entry) {
            return;
        }
        this._apply(entry.after);
        this._undo.push(entry);
        this._fire('redo');
    }

    /**
     * Restore a snapshot. `reuseExistingPanels` is mandatory; without it every
     * undo disposes and recreates every renderer (content flash, lost focus).
     * The re-entrancy guard stops the mutations this fires from re-recording.
     */
    private _apply(snapshot: SerializedDockview): void {
        this._applyDepth++;
        const release = (): void => {
            this._applyDepth = Math.max(0, this._applyDepth - 1);
        };
        let restoresPopout: boolean;
        try {
            this._host.fromJSON(snapshot, { reuseExistingPanels: true });
            // The applied layout is the new resting state; its trailing layout
            // ping is a settle, not a resize.
            this._baseline = snapshot;
            this._mutationSettlePending = true;
            restoresPopout = (snapshot.popoutGroups?.length ?? 0) > 0;
        } catch (e) {
            release();
            throw e;
        }
        if (restoresPopout) {
            // Floating groups restore synchronously, but popout windows re-open
            // asynchronously and re-fire the mutation boundary on the root once
            // their window loads. Hold the guard until that settles, or the
            // re-open records a spurious entry.
            this._host.popoutRestorationPromise.then(release, release);
        } else {
            // Common case: nothing async, release now so a user mutation made
            // right after undo/redo is still recorded.
            release();
        }
    }

    clear(): void {
        const had = this._undo.length > 0 || this._redo.length > 0;
        this._undo.length = 0;
        this._redo.length = 0;
        this._pendingBefore = undefined;
        this._pendingResize = undefined;
        this._clearResizeTimer();
        if (had) {
            this._fire('clear');
        }
    }

    private _fire(reason: LayoutHistoryChangeEvent['reason']): void {
        const last = this._undo[this._undo.length - 1];
        this._onDidChangeHistory.fire({
            reason,
            canUndo: this.canUndo,
            canRedo: this.canRedo,
            undoCount: this._undo.length,
            redoCount: this._redo.length,
            lastEntry: last
                ? { kind: last.kind, origin: last.origin }
                : undefined,
        });
    }
}

export const LayoutHistoryModule = defineModule<
    'layoutHistoryService',
    ILayoutHistoryHost
>({
    name: 'LayoutHistory',
    options: ['layoutHistory'],
    serviceKey: 'layoutHistoryService',
    create: (host) => new LayoutHistoryService(host),
});
