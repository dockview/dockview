import { TabGroup } from './tabGroup';

type TabStripItem<T> = { readonly panel: T } | { readonly tabGroup: TabGroup };

/** Where a panel goes in the strip. */
export type TabStripTarget =
    /** A top-level panel at flat `index`, counted without the panel. With
     *  `pinned` set, kept on that side of the pinned block. */
    | { readonly index: number; readonly pinned?: boolean }
    /** A member of `tabGroup` at `index` among its members (default: last). */
    | { readonly tabGroup: TabGroup; readonly index?: number };

/**
 * The order of a group's tabs, as top-level items: a panel, or a tab group
 * holding its members. The flat tab order is derived from it, so a tab
 * group's members are always contiguous and in the tab group's own order.
 *
 * A tab group has a place in the strip only while it has members; an empty
 * one is not an item. Member lists are edited silently: the caller fires the
 * tab group's events once the strip is in its final state.
 */
export class TabStrip<T extends { readonly id: string }> {
    private readonly _items: TabStripItem<T>[] = [];
    private readonly _panels = new Map<string, T>();
    private readonly _tabGroupOf = new Map<string, TabGroup>();

    constructor(private readonly isPinned: (panel: T) => boolean) {}

    get size(): number {
        return this._panels.size;
    }

    /** The flat tab order. */
    toArray(): T[] {
        const result: T[] = [];
        for (const item of this._items) {
            if ('panel' in item) {
                result.push(item.panel);
                continue;
            }
            for (const id of item.tabGroup.panelIds) {
                const panel = this._panels.get(id);
                if (panel) {
                    result.push(panel);
                }
            }
        }
        return result;
    }

    has(panelId: string): boolean {
        return this._panels.has(panelId);
    }

    tabGroupOf(panelId: string): TabGroup | undefined {
        return this._tabGroupOf.get(panelId);
    }

    /** Add a new panel at `target`. A disposed tab group leaves it top-level
     *  at `fallbackIndex`; one without members takes its place there. */
    add(panel: T, target: TabStripTarget, fallbackIndex: number): void {
        this._panels.set(panel.id, panel);
        if ('tabGroup' in target && !target.tabGroup.isDisposed) {
            this.addMember(panel.id, target.tabGroup, target.index, () =>
                this.slotForIndex(fallbackIndex)
            );
            return;
        }
        const index = 'tabGroup' in target ? fallbackIndex : target.index;
        const pinned = 'tabGroup' in target ? undefined : target.pinned;
        this._items.splice(this.slotForIndex(index, pinned), 0, { panel });
    }

    /**
     * Move a panel to `target`. Moving into a tab group places the panel by
     * the tab group: a tab group without members takes the panel's place. A
     * disposed tab group is a no-op.
     */
    move(panelId: string, target: TabStripTarget): void {
        const panel = this._panels.get(panelId);
        if (!panel) {
            return;
        }
        const current = this._tabGroupOf.get(panelId);

        if ('tabGroup' in target) {
            const tabGroup = target.tabGroup;
            if (tabGroup.isDisposed) {
                return;
            }
            if (tabGroup === current) {
                tabGroup.removeMember(panelId);
                tabGroup.insertMember(panelId, target.index);
                return;
            }
            if (current) {
                this.leave(panelId);
            }
            const slot = this.slotOfPanel(panelId);
            this._items.splice(slot, 1);
            this.addMember(panelId, tabGroup, target.index, () => slot);
            return;
        }

        this.detach(panelId);
        this._items.splice(this.slotForIndex(target.index, target.pinned), 0, {
            panel,
        });
    }

    /**
     * Take a panel out of its tab group as a top-level item: before the tab
     * group if it was the first member, else after it. A tab group left
     * without members gives the panel its place.
     */
    leave(panelId: string): TabGroup | undefined {
        const tabGroup = this._tabGroupOf.get(panelId);
        const panel = this._panels.get(panelId);
        if (!tabGroup || !panel) {
            return undefined;
        }
        const wasFirst = tabGroup.indexOfPanel(panelId) === 0;
        const slot = this.slotOfTabGroup(tabGroup);
        this.removeMember(tabGroup, panelId);
        if (this.slotOfTabGroup(tabGroup) === -1 || wasFirst) {
            this._items.splice(slot, 0, { panel });
        } else {
            this._items.splice(slot + 1, 0, { panel });
        }
        return tabGroup;
    }

    /** Remove a panel. Returns the tab group it was in. */
    remove(panelId: string): TabGroup | undefined {
        const tabGroup = this._tabGroupOf.get(panelId);
        this.detach(panelId);
        this._panels.delete(panelId);
        return tabGroup;
    }

    /**
     * Move a tab group to flat `index`, counted without its members, resolved
     * as for a top-level panel so it never lands inside another tab group.
     */
    moveTabGroup(tabGroup: TabGroup, index: number): void {
        const slot = this.slotOfTabGroup(tabGroup);
        if (slot === -1) {
            return;
        }
        this._items.splice(slot, 1);
        this._items.splice(this.slotForIndex(index), 0, { tabGroup });
    }

    /**
     * Replace a tab group's item with its members as top-level panels, in
     * place. The tab group's own member list is left to the caller.
     */
    unwrap(tabGroup: TabGroup): void {
        const slot = this.slotOfTabGroup(tabGroup);
        if (slot === -1) {
            return;
        }
        const panels: TabStripItem<T>[] = [];
        for (const id of tabGroup.panelIds) {
            const panel = this._panels.get(id);
            if (panel && this._tabGroupOf.get(id) === tabGroup) {
                panels.push({ panel });
                this._tabGroupOf.delete(id);
            }
        }
        this._items.splice(slot, 1, ...panels);
    }

    /**
     * The top-level slot for a panel placed at flat `index`. An index between
     * two members of a tab group moves to the nearer edge of it (after it on
     * a tie). With `pinned` set, the slot is also kept on its side of the
     * pinned block: `true` keeps it within, `false` keeps it after.
     */
    private slotForIndex(index: number, pinned?: boolean): number {
        let slot = this._items.length;
        let start = 0;
        for (let i = 0; i < this._items.length; i++) {
            if (index <= start) {
                slot = i;
                break;
            }
            const end = start + this.lengthOf(this._items[i]);
            if (index < end) {
                // strictly inside a tab group
                slot = index - start < end - index ? i : i + 1;
                break;
            }
            start = end;
        }

        if (pinned === undefined) {
            return slot;
        }
        const boundary = this.pinnedBoundary();
        return pinned ? Math.min(slot, boundary) : Math.max(slot, boundary);
    }

    /** Add `panelId` to `tabGroup`'s members; a tab group without members
     *  takes its place at `slot()`. */
    private addMember(
        panelId: string,
        tabGroup: TabGroup,
        index: number | undefined,
        slot: () => number
    ): void {
        if (this.slotOfTabGroup(tabGroup) === -1) {
            this._items.splice(this.clampSlot(slot()), 0, { tabGroup });
        }
        this._tabGroupOf.set(panelId, tabGroup);
        tabGroup.insertMember(panelId, index);
    }

    /** Take a panel out of the items, or out of its tab group's members. */
    private detach(panelId: string): void {
        const tabGroup = this._tabGroupOf.get(panelId);
        if (tabGroup) {
            this.removeMember(tabGroup, panelId);
            return;
        }
        const slot = this.slotOfPanel(panelId);
        if (slot !== -1) {
            this._items.splice(slot, 1);
        }
    }

    private removeMember(tabGroup: TabGroup, panelId: string): void {
        this._tabGroupOf.delete(panelId);
        tabGroup.removeMember(panelId);
        if (tabGroup.isEmpty) {
            const slot = this.slotOfTabGroup(tabGroup);
            if (slot !== -1) {
                this._items.splice(slot, 1);
            }
        }
    }

    private lengthOf(item: TabStripItem<T>): number {
        return 'panel' in item ? 1 : item.tabGroup.size;
    }

    private pinnedBoundary(): number {
        let boundary = 0;
        while (boundary < this._items.length) {
            const item = this._items[boundary];
            if (!('panel' in item) || !this.isPinned(item.panel)) {
                break;
            }
            boundary++;
        }
        return boundary;
    }

    private clampSlot(slot: number): number {
        return Math.max(0, Math.min(slot, this._items.length));
    }

    private slotOfPanel(panelId: string): number {
        return this._items.findIndex(
            (item) => 'panel' in item && item.panel.id === panelId
        );
    }

    private slotOfTabGroup(tabGroup: TabGroup): number {
        return this._items.findIndex(
            (item) => 'tabGroup' in item && item.tabGroup === tabGroup
        );
    }
}
