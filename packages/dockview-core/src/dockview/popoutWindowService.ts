import { IDisposable } from '../lifecycle';
import { Emitter, Event } from '../events';
import { remove } from '../array';
import { PopupService } from './components/popupService';
import { PopoutWindow } from '../popoutWindow';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { SerializedPopoutGroup } from './dockviewComponent';
import { GroupPanelViewState } from './dockviewGroupPanelModel';
import { Gridview, ISerializedLeafNode } from '../gridview/gridview';
import { OverlayRenderContainer } from '../overlay/overlayRenderContainer';
import { DropTargetAnchorContainer } from '../dnd/dropTargetAnchorContainer';
import { defineModule } from './modules';

export interface PopoutGroupEntry {
    window: PopoutWindow;
    popoutGroup: DockviewGroupPanel;
    referenceGroup?: string;
    /**
     * The popout window hosts its own gridview so it can hold a nested
     * splitview layout of groups. `popoutGroup` is the window's anchor group.
     */
    gridview: Gridview;
    /**
     * Render / drop-target containers and window accessor for this popout, so
     * groups relocated into the window can be wired to its own document.
     */
    overlayRenderContainer: OverlayRenderContainer;
    dropTargetContainer: DropTargetAnchorContainer;
    getWindow: () => Window;
    popoutUrl?: string;
    /**
     * The window-scoped popup service shared by every group in this popout
     * window (resolved per-member via {@link IPopoutWindowService.findByGroup}
     * so overflow/context menus render in the correct window regardless of
     * which group is the anchor).
     */
    popupService: PopupService;
    /**
     * Promote a new anchor group after the current one leaves the window,
     * rebinding anchor-relative state (focus routing) to it.
     */
    setAnchorGroup: (group: DockviewGroupPanel) => void;
    disposable: { dispose: () => DockviewGroupPanel | undefined };
}

/**
 * Narrow callback surface the PopoutWindowService needs from its host.
 */
export interface IPopoutWindowHost {
    readonly isDisposed: boolean;
}

export interface IPopoutWindowService extends IDisposable {
    readonly entries: readonly PopoutGroupEntry[];

    readonly onDidRemove: Event<PopoutGroupEntry>;

    add(entry: PopoutGroupEntry): void;
    remove(entry: PopoutGroupEntry): void;

    findByGroup(group: DockviewGroupPanel): PopoutGroupEntry | undefined;
    findReferenceGroupId(group: DockviewGroupPanel): string | undefined;

    observeGridviewSize(
        popoutWindow: PopoutWindow,
        gridview: Gridview,
        overlayRenderContainer: OverlayRenderContainer
    ): IDisposable | undefined;

    readonly restorationPromise: Promise<void>;
    scheduleRestoration(
        delayMs: number,
        work: () => void,
        onCancel?: () => void
    ): Promise<void>;
    finishRestoration(promises: Promise<void>[]): void;
    cancelPendingRestorations(): void;

    serialize(): SerializedPopoutGroup[];
    disposeAll(): void;
}

export class PopoutWindowService implements IPopoutWindowService {
    private readonly _host: IPopoutWindowHost;
    private readonly _entries: PopoutGroupEntry[] = [];
    private readonly _restorationCleanups = new Set<() => void>();
    private _restorationPromise: Promise<void> = Promise.resolve();

    private readonly _onDidRemove = new Emitter<PopoutGroupEntry>();
    readonly onDidRemove = this._onDidRemove.event;

    constructor(host: IPopoutWindowHost) {
        this._host = host;
    }

    get entries(): readonly PopoutGroupEntry[] {
        return this._entries;
    }

    get restorationPromise(): Promise<void> {
        return this._restorationPromise;
    }

    add(entry: PopoutGroupEntry): void {
        this._entries.push(entry);
    }

    remove(entry: PopoutGroupEntry): void {
        // Fire only on a genuine removal, and not while the host component is
        // tearing down (consumers don't want popout-removed events during
        // dispose).
        if (remove(this._entries, entry) && !this._host.isDisposed) {
            this._onDidRemove.fire(entry);
        }
    }

    findByGroup(group: DockviewGroupPanel): PopoutGroupEntry | undefined {
        // A popout window may host several groups in a nested gridview, so
        // match by membership (DOM containment) rather than only the anchor.
        return this._entries.find(
            (entry) =>
                entry.popoutGroup === group ||
                entry.gridview.element.contains(group.element)
        );
    }

    findReferenceGroupId(group: DockviewGroupPanel): string | undefined {
        return this._entries.find((entry) => entry.popoutGroup === group)
            ?.referenceGroup;
    }

    /**
     * A popout window's innerWidth/innerHeight are often 0 or stale until it
     * has painted, and the nested gridview lays its children out to the size
     * passed to `layout()` rather than filling via CSS. Observe the gridview
     * element so content doesn't render into a zero box until a manual resize.
     *
     * The observer is created in the popout window's own realm: a parent-realm
     * observer fires unreliably across the window boundary, while a same-realm
     * one fires reliably, including the initial observation.
     *
     * @returns a disposable that disconnects the observer, or `undefined` when
     * the popout realm has no ResizeObserver (e.g. jsdom).
     */
    observeGridviewSize(
        popoutWindow: PopoutWindow,
        gridview: Gridview,
        overlayRenderContainer: OverlayRenderContainer
    ): IDisposable | undefined {
        const PopoutResizeObserver = (
            popoutWindow.window as (Window & typeof globalThis) | undefined
        )?.ResizeObserver;
        if (!PopoutResizeObserver) {
            return undefined;
        }

        let lastWidth = -1;
        let lastHeight = -1;
        const relayout = () => {
            const win = popoutWindow.window;
            if (this._host.isDisposed || !win || win.closed) {
                return;
            }
            const width = Math.round(gridview.element.clientWidth);
            const height = Math.round(gridview.element.clientHeight);
            if (width === lastWidth && height === lastHeight) {
                return;
            }
            lastWidth = width;
            lastHeight = height;
            if (width > 0 && height > 0) {
                gridview.layout(width, height);
            }
            overlayRenderContainer.updateAllPositions();
        };
        const observer = new PopoutResizeObserver(() => {
            // Defer out of the observer callback into the popout's own frame to
            // size against the settled layout and to avoid resize-loop warnings.
            const raf = popoutWindow.window?.requestAnimationFrame;
            if (raf) {
                raf.call(popoutWindow.window, relayout);
            } else {
                relayout();
            }
        });
        observer.observe(gridview.element);
        return { dispose: () => observer.disconnect() };
    }

    scheduleRestoration(
        delayMs: number,
        work: () => void,
        onCancel?: () => void
    ): Promise<void> {
        return new Promise<void>((resolve) => {
            const cleanup = () => {
                this._restorationCleanups.delete(cleanup);
                clearTimeout(handle);
                onCancel?.();
                resolve();
            };
            const handle = setTimeout(() => {
                this._restorationCleanups.delete(cleanup);
                // Guard against the component being disposed before this
                // timer fires. Under React StrictMode the component is
                // mounted -> disposed -> remounted, and without this guard
                // the first instance's queued restoration would open a
                // second popout window. See issue #851.
                if (this._host.isDisposed) {
                    resolve();
                    return;
                }
                work();
                resolve();
            }, delayMs);
            this._restorationCleanups.add(cleanup);
        });
    }

    finishRestoration(promises: Promise<void>[]): void {
        this._restorationPromise = Promise.all(promises).then(() => void 0);
    }

    cancelPendingRestorations(): void {
        // Iterate a copy: cleanup() removes itself from _restorationCleanups as it goes.
        for (const cleanup of [...this._restorationCleanups]) {
            cleanup();
        }
        this._restorationCleanups.clear();
    }

    serialize(): SerializedPopoutGroup[] {
        return this._entries.map((entry) => {
            const grid = entry.gridview.serialize();
            const root = grid.root;
            const url =
                entry.popoutGroup.api.location.type === 'popout'
                    ? entry.popoutGroup.api.location.popoutUrl
                    : undefined;

            const base = {
                gridReferenceGroup: entry.referenceGroup,
                position: entry.window.dimensions(),
                url,
            };

            // Single-group window keeps the legacy `data` shape so layouts
            // round-trip byte-stably and older readers keep working.
            if (
                root.type === 'branch' &&
                root.data.length === 1 &&
                root.data[0].type === 'leaf'
            ) {
                return {
                    ...base,
                    data: (
                        root.data[0] as ISerializedLeafNode<GroupPanelViewState>
                    ).data,
                };
            }

            return { ...base, grid };
        });
    }

    disposeAll(): void {
        // Iterate a copy: dispose removes entries from _entries as it goes.
        for (const entry of [...this._entries]) {
            entry.disposable.dispose();
        }
    }

    dispose(): void {
        this.cancelPendingRestorations();
        this.disposeAll();
        this._onDidRemove.dispose();
    }
}

export const PopoutWindowModule = defineModule<
    'popoutWindowService',
    IPopoutWindowHost
>({
    name: 'PopoutWindow',
    serviceKey: 'popoutWindowService',
    create: (host) => new PopoutWindowService(host),
});
