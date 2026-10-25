/**
 * A window's side of the one undo history across every window.
 *
 * Dockview's own history keeps this window's local steps and knows how to
 * restore them. What it cannot know is the order of those steps against the
 * moves between windows, so the orchestrator sequences: this reports each
 * local step as it is pushed, forwards undo and redo to the orchestrator,
 * and carries out the requests that come back, which are either "undo (or
 * redo) your own top step" or "take this layout". Ordering is what keeps it
 * safe: an older local step is only reachable once the move after it has
 * been undone.
 *
 * Needs `layoutHistory` enabled with `clearOnFromJSON: false`, since an
 * applied layout arrives through `fromJSON` and must not wipe the stack;
 * `recordResize: false`, since a resize is only recorded once its run of
 * sash drags settles, which can fall after a request has already been
 * carried out against the stack without it; and
 * `undoableProgrammaticMutations: false`, since the install's own adds and
 * removes must not become local steps. Each is reported once if broken.
 */

import {
    type DockviewApi,
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewEmitter as Emitter,
    type DockviewEvent as Event,
} from 'dockview';
import {
    type HistoryInfo,
    type HistoryRequest,
    type MultiWindowTransport,
    retainSubscription,
} from './transport';

export const EMPTY_HISTORY: HistoryInfo = {
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
};

export class SharedHistory extends CompositeDisposable {
    private readonly _api: DockviewApi;
    private readonly _transport: MultiWindowTransport;
    private _info: HistoryInfo = EMPTY_HISTORY;
    /**
     * >0 while carrying out a request, so the local history changes it causes
     * are not reported back as new steps.
     */
    private _applyDepth = 0;
    private readonly _warned = new Set<string>();

    private readonly _onDidChange = new Emitter<HistoryInfo>();
    readonly onDidChange: Event<HistoryInfo> = this._onDidChange.event;

    get info(): HistoryInfo {
        return this._info;
    }

    constructor(api: DockviewApi, transport: MultiWindowTransport) {
        super();
        this._api = api;
        this._transport = transport;

        this.addDisposables(
            this._onDidChange,
            api.onDidChangeHistory((event) => {
                if (event.reason === 'push') {
                    if (event.lastEntry?.kind === 'resize') {
                        this._warnOption('recordResize');
                    } else if (event.lastEntry?.origin === 'api') {
                        this._warnOption('undoableProgrammaticMutations');
                    }
                }
                if (this._applyDepth > 0) {
                    if (event.reason === 'clear') {
                        // An applied layout cleared this window's own
                        // history, so the steps the orchestrator has on
                        // record for it can no longer be undone here.
                        this._warnOption('clearOnFromJSON');
                    }
                    return;
                }
                // A step the user made here; the orchestrator needs it in the
                // global order.
                if (event.reason === 'push') {
                    transport.reportLocalStep().catch((err: unknown) => {
                        console.error(
                            'dockview: could not report a local step.',
                            err
                        );
                    });
                }
            })
        );
    }

    /** Carry out the orchestrator's requests and follow its history. */
    connect(): void {
        retainSubscription(
            this,
            this._transport.onDidRequestHistory((request) =>
                this._carryOut(request)
            )
        );
        retainSubscription(
            this,
            this._transport.onDidChangeHistory((info) => this._setInfo(info))
        );
        this._transport.getHistory().then(
            (info) => {
                if (!this.isDisposed) {
                    this._setInfo(info);
                }
            },
            (err: unknown) => {
                console.error('dockview: could not read the history.', err);
            }
        );
    }

    /** Undo the most recent step in any window. */
    undo(): void {
        this._transport.undo().catch((err: unknown) => {
            console.warn('dockview: could not undo.', err);
        });
    }

    /** Redo the most recently undone step in any window. */
    redo(): void {
        this._transport.redo().catch((err: unknown) => {
            console.warn('dockview: could not redo.', err);
        });
    }

    private _setInfo(info: HistoryInfo): void {
        this._info = info;
        this._onDidChange.fire(info);
    }

    private _carryOut(request: HistoryRequest): void {
        this._applyDepth += 1;
        try {
            switch (request.type) {
                case 'undo':
                    this._api.undo();
                    break;
                case 'redo':
                    this._api.redo();
                    break;
                case 'apply-layout':
                    this._api.fromJSON(request.layout, {
                        reuseExistingPanels: true,
                    });
                    break;
            }
        } catch (err: unknown) {
            console.error(
                `dockview: could not carry out a history ${request.type}.`,
                err
            );
        } finally {
            this._applyDepth -= 1;
        }
    }

    /** A `layoutHistory` option the shared history needs off is on. */
    private _warnOption(
        option:
            | 'clearOnFromJSON'
            | 'recordResize'
            | 'undoableProgrammaticMutations'
    ): void {
        if (!this._warned.has(option)) {
            this._warned.add(option);
            console.warn(
                `dockview: the shared history needs layoutHistory.${option} set to false; undo across windows can restore the wrong layout while it is on.`
            );
        }
    }
}
