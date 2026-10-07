import { IDisposable } from '../lifecycle';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { EdgeGroupPosition } from './dockviewShell';
import { defineModule } from './modules';

/**
 * EdgeGroupService is a pure registry: it tracks the ordered stack of groups
 * at each edge and owns each edge group's per-instance cleanup disposable.
 *
 * The ShellManager (layout infrastructure) and the addEdgeGroup
 * orchestration remain on DockviewComponent.
 */
export interface IEdgeGroupServiceHost {
    // Intentionally empty: the service has no callbacks into the host.
}

export interface IEdgeGroupService extends IDisposable {
    /** Register `group` at `position`, at `index` in the edge's stack (default:
     *  the end). */
    add(
        position: EdgeGroupPosition,
        group: DockviewGroupPanel,
        autoCollapseDisposable: IDisposable,
        index?: number
    ): void;
    /** Deregister one group, disposing its cleanup; siblings stay. */
    remove(group: DockviewGroupPanel): void;

    /** The first group on the edge, or undefined. */
    get(position: EdgeGroupPosition): DockviewGroupPanel | undefined;
    /** Every group on the edge in stack order; empty when none. */
    getAll(position: EdgeGroupPosition): readonly DockviewGroupPanel[];
    has(position: EdgeGroupPosition): boolean;
    hasAny(): boolean;
    /** Every edge group, flattened in stack order. */
    entries(): IterableIterator<[EdgeGroupPosition, DockviewGroupPanel]>;
    includes(group: DockviewGroupPanel): boolean;
    findPositionOf(group: DockviewGroupPanel): EdgeGroupPosition | undefined;
    /** The group's index in its edge's stack, or -1. */
    indexOf(group: DockviewGroupPanel): number;
    /** Reorder the group within its edge. */
    move(group: DockviewGroupPanel, index: number): void;

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

const NO_GROUPS: readonly DockviewGroupPanel[] = [];

export class EdgeGroupService implements IEdgeGroupService {
    private readonly _edgeGroups = new Map<
        EdgeGroupPosition,
        DockviewGroupPanel[]
    >();
    private readonly _edgeGroupDisposables = new Map<
        DockviewGroupPanel,
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
        autoCollapseDisposable: IDisposable,
        index?: number
    ): void {
        let stack = this._edgeGroups.get(position);
        if (!stack) {
            stack = [];
            this._edgeGroups.set(position, stack);
        }
        stack.splice(index ?? stack.length, 0, group);
        this._edgeGroupDisposables.set(group, autoCollapseDisposable);
    }

    remove(group: DockviewGroupPanel): void {
        const position = this.findPositionOf(group);
        if (!position) {
            return;
        }
        const stack = this._edgeGroups.get(position)!;
        stack.splice(stack.indexOf(group), 1);
        if (stack.length === 0) {
            this._edgeGroups.delete(position);
        }
        this._edgeGroupDisposables.get(group)?.dispose();
        this._edgeGroupDisposables.delete(group);
    }

    get(position: EdgeGroupPosition): DockviewGroupPanel | undefined {
        return this._edgeGroups.get(position)?.[0];
    }

    getAll(position: EdgeGroupPosition): readonly DockviewGroupPanel[] {
        return this._edgeGroups.get(position) ?? NO_GROUPS;
    }

    has(position: EdgeGroupPosition): boolean {
        return this._edgeGroups.has(position);
    }

    hasAny(): boolean {
        return this._edgeGroups.size > 0;
    }

    *entries(): IterableIterator<[EdgeGroupPosition, DockviewGroupPanel]> {
        for (const [position, stack] of this._edgeGroups) {
            for (const group of stack) {
                yield [position, group];
            }
        }
    }

    includes(group: DockviewGroupPanel): boolean {
        return this._edgeGroupDisposables.has(group);
    }

    findPositionOf(group: DockviewGroupPanel): EdgeGroupPosition | undefined {
        for (const [position, stack] of this._edgeGroups) {
            if (stack.includes(group)) {
                return position;
            }
        }
        return undefined;
    }

    indexOf(group: DockviewGroupPanel): number {
        const position = this.findPositionOf(group);
        return position ? this._edgeGroups.get(position)!.indexOf(group) : -1;
    }

    move(group: DockviewGroupPanel, index: number): void {
        const position = this.findPositionOf(group);
        if (!position) {
            return;
        }
        const stack = this._edgeGroups.get(position)!;
        stack.splice(stack.indexOf(group), 1);
        stack.splice(index, 0, group);
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
