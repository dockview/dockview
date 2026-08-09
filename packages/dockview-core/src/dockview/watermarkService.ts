import { CompositeDisposable, IDisposable } from '../lifecycle';
import { addTestId } from '../dom';
import { Event } from '../events';
import { IWatermarkRenderer } from './types';
import { DockviewApi } from '../api/component.api';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { defineModule } from './modules';

export interface IWatermarkHost {
    readonly api: DockviewApi;
    readonly mountElement: HTMLElement;
    createWatermarkComponent(): IWatermarkRenderer;
    hasVisibleGridGroup(): boolean;
    // Events used by the module's init() to drive its own update cadence.
    // Subscribe to BaseGrid-level add/remove (not the dockview-level
    // onDidAddGroup/onDidRemoveGroup) because BaseGrid fires even when
    // doRemoveGroup is called with skipDispose=true during floating/popout
    // conversions, which is when a grid group disappears and the watermark
    // needs to re-evaluate. The dockview-level events skip these.
    readonly onDidAdd: Event<DockviewGroupPanel>;
    readonly onDidRemove: Event<DockviewGroupPanel>;
    readonly onDidViewVisibilityChangeMicroTaskQueue: Event<unknown>;
}

export interface IWatermarkService extends IDisposable {
    /** Mount or unmount the watermark based on current grid state. */
    update(): void;
    /** Tear down the current watermark and re-evaluate. Used when the watermark factory option changes. */
    refresh(): void;
}

export class WatermarkService implements IWatermarkService {
    private readonly _host: IWatermarkHost;
    private _watermark: IWatermarkRenderer | null = null;

    constructor(host: IWatermarkHost) {
        this._host = host;
    }

    update(): void {
        if (this._host.hasVisibleGridGroup()) {
            this._unmount();
            return;
        }
        if (this._watermark) {
            return;
        }
        this._watermark = this._host.createWatermarkComponent();
        this._watermark.init({ containerApi: this._host.api });

        const container = document.createElement('div');
        container.className = 'dv-watermark-container';
        addTestId(container, 'watermark-component');
        container.appendChild(this._watermark.element);

        this._host.mountElement.appendChild(container);
    }

    refresh(): void {
        this._unmount();
        this.update();
    }

    private _unmount(): void {
        if (!this._watermark) {
            return;
        }
        this._watermark.element.parentElement!.remove();
        this._watermark.dispose?.();
        this._watermark = null;
    }

    dispose(): void {
        this._unmount();
    }
}

export const WatermarkModule = defineModule<'watermarkService', IWatermarkHost>(
    {
        name: 'Watermark',
        serviceKey: 'watermarkService',
        create: (host) => new WatermarkService(host),
        init: (host, service) => {
            service.update();
            return new CompositeDisposable(
                Event.any(
                    host.onDidAdd,
                    host.onDidRemove
                )(() => {
                    service.update();
                }),
                host.onDidViewVisibilityChangeMicroTaskQueue(() => {
                    service.update();
                })
            );
        },
    }
);
