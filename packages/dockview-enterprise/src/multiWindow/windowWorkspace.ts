import {
    type DockviewApi,
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewDisposable as Disposable,
    type SerializedDockview,
} from 'dockview';
import type { MultiWindowTransport } from './transport';

const DEFAULT_DEBOUNCE_MS = 300;

export interface WindowWorkspaceOptions {
    buildDefaults(windowId: string): void | Promise<void>;
    debounceMs?: number;
}

export class WindowWorkspace extends CompositeDisposable {
    private readonly _api: DockviewApi;
    private readonly _transport: MultiWindowTransport;
    private readonly _debounceMs: number;
    private readonly _buildDefaults: WindowWorkspaceOptions['buildDefaults'];
    private _timer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        api: DockviewApi,
        transport: MultiWindowTransport,
        options: WindowWorkspaceOptions
    ) {
        super();
        this._api = api;
        this._transport = transport;
        this._debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
        this._buildDefaults = options.buildDefaults;
        this.addDisposables(Disposable.from(() => clearTimeout(this._timer)));
    }

    /** Resolves once the window holds its initial layout. */
    async restore(): Promise<{ restored: boolean }> {
        const windowId = this._transport.windowId;
        let layout: SerializedDockview | null = null;
        try {
            layout = await this._transport.loadLayout();
        } catch (err: unknown) {
            console.error(
                'dockview: no layout from the orchestrator; building defaults.',
                err
            );
        }

        if (this.isDisposed) {
            return { restored: false };
        }

        let restored = false;
        if (layout) {
            try {
                this._api.fromJSON(layout);
                restored = true;
            } catch (err: unknown) {
                console.error(
                    'dockview: could not restore the layout; building defaults.',
                    err
                );
                this._api.clear();
                await this._buildDefaults(windowId);
            }
        } else {
            await this._buildDefaults(windowId);
        }

        // Report only from here, so a half-built layout is never written back.
        if (!this.isDisposed) {
            this.addDisposables(
                this._api.onDidLayoutChange(() => this._scheduleReport())
            );
            this._scheduleReport();
        }
        return { restored };
    }

    private _scheduleReport(): void {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
            this._transport
                .reportLayout(this._api.toJSON())
                .catch((err: unknown) => {
                    console.warn('dockview: layout refused.', err);
                });
        }, this._debounceMs);
    }
}
