import { IDisposable } from '../lifecycle';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { EdgeGroupPosition } from './dockviewShell';
import { defineModule } from './modules';

/**
 * EdgeGroupService is a pure registry: it tracks which positions are
 * occupied and owns each edge group's per-instance cleanup disposable.
 *
 * The ShellManager (layout infrastructure) and the addEdgeGroup
 * orchestration remain on DockviewComponent.
 */
export interface IEdgeGroupServiceHost {
    // Intentionally empty: the service has no callbacks into the host.
}

export interface IEdgeGroupService extends IDisposable {
    add(
        position: EdgeGroupPosition,
        group: DockviewGroupPanel,
        autoCollapseDisposable: IDisposable
    ): void;
    remove(position: EdgeGroupPosition): void;

    get(position: EdgeGroupPosition): DockviewGroupPanel | undefined;
    has(position: EdgeGroupPosition): boolean;
    hasAny(): boolean;
    entries(): IterableIterator<[EdgeGroupPosition, DockviewGroupPanel]>;
    includes(group: DockviewGroupPanel): boolean;
    findPositionOf(group: DockviewGroupPanel): EdgeGroupPosition | undefined;

    /**
     * Per-group auto-hide opt-in. `undefined` means "unset", so callers should
     * fall back to the global `autoHideEdgeGroups` option. This lets a static
     * edge group and an auto-hiding one co-exist in the same layout.
     */
    setAutoHide(group: DockviewGroupPanel, value: boolean | undefined): void;
    isAutoHide(group: DockviewGroupPanel): boolean | undefined;

    /**
     * Per-group "auto-reveal" flag. When set, an edge group tears itself down
     * to zero footprint when emptied (instead of collapsing to a strip). This
     * is the state used by drag-revealed edges.
     */
    setAutoReveal(group: DockviewGroupPanel, value: boolean): void;
    isAutoReveal(group: DockviewGroupPanel): boolean;

    disposeAll(): void;
}

export class EdgeGroupService implements IEdgeGroupService {
    private readonly _edgeGroups = new Map<
        EdgeGroupPosition,
        DockviewGroupPanel
    >();
    private readonly _edgeGroupDisposables = new Map<
        EdgeGroupPosition,
        IDisposable
    >();
    // Per-group presentation flags, keyed by the group so they survive the
    // position bookkeeping and are dropped when the group is GC'd.
    private readonly _autoHide = new WeakMap<DockviewGroupPanel, boolean>();
    private readonly _autoReveal = new WeakMap<DockviewGroupPanel, boolean>();

    // No constructor needed; the host is currently unused.

    add(
        position: EdgeGroupPosition,
        group: DockviewGroupPanel,
        autoCollapseDisposable: IDisposable
    ): void {
        this._edgeGroups.set(position, group);
        this._edgeGroupDisposables.set(position, autoCollapseDisposable);
    }

    remove(position: EdgeGroupPosition): void {
        this._edgeGroupDisposables.get(position)?.dispose();
        this._edgeGroupDisposables.delete(position);
        this._edgeGroups.delete(position);
    }

    get(position: EdgeGroupPosition): DockviewGroupPanel | undefined {
        return this._edgeGroups.get(position);
    }

    has(position: EdgeGroupPosition): boolean {
        return this._edgeGroups.has(position);
    }

    hasAny(): boolean {
        return this._edgeGroups.size > 0;
    }

    entries(): IterableIterator<[EdgeGroupPosition, DockviewGroupPanel]> {
        return this._edgeGroups.entries();
    }

    includes(group: DockviewGroupPanel): boolean {
        for (const edgeGroup of this._edgeGroups.values()) {
            if (edgeGroup === group) {
                return true;
            }
        }
        return false;
    }

    findPositionOf(group: DockviewGroupPanel): EdgeGroupPosition | undefined {
        for (const [position, edgeGroup] of this._edgeGroups) {
            if (edgeGroup === group) {
                return position;
            }
        }
        return undefined;
    }

    setAutoHide(group: DockviewGroupPanel, value: boolean | undefined): void {
        if (value === undefined) {
            this._autoHide.delete(group);
        } else {
            this._autoHide.set(group, value);
        }
    }

    isAutoHide(group: DockviewGroupPanel): boolean | undefined {
        return this._autoHide.get(group);
    }

    setAutoReveal(group: DockviewGroupPanel, value: boolean): void {
        this._autoReveal.set(group, value);
    }

    isAutoReveal(group: DockviewGroupPanel): boolean {
        return this._autoReveal.get(group) ?? false;
    }

    disposeAll(): void {
        for (const disposable of this._edgeGroupDisposables.values()) {
            disposable.dispose();
        }
        this._edgeGroupDisposables.clear();
        this._edgeGroups.clear();
    }

    dispose(): void {
        this.disposeAll();
    }
}

export const EdgeGroupModule = defineModule<
    'edgeGroupService',
    IEdgeGroupServiceHost
>({
    name: 'EdgeGroup',
    serviceKey: 'edgeGroupService',
    create: () => new EdgeGroupService(),
});
