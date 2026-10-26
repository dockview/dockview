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
    /** Non-zero while carrying out a request, whose steps are not reported. */
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
                        this._warnOption('clearOnFromJSON');
                    }
                    return;
                }
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

    undo(): void {
        this._transport.undo().catch((err: unknown) => {
            console.warn('dockview: could not undo.', err);
        });
    }

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
