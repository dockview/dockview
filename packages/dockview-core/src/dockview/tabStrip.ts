import { TabGroup } from './tabGroup';

type TabStripItem<T> = { readonly panel: T } | { readonly tabGroup: TabGroup };

/**
 * The order of a group's tabs, as top-level items: a panel, or a tab group
 * holding its members. The flat tab order is derived from it, so a tab
 * group's members are always contiguous and in the tab group's own order.
 *
 * A tab group has a place in the strip only while it has members; an empty
 * one is not an item. Members are read from, and written through, the
 * `TabGroup` itself.
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

    /**
     * The top-level slot for a panel placed at flat `index`, counted without
     * that panel. An index between two members of a tab group moves to the
     * nearer edge of it (after it on a tie), so a top-level panel never splits
     * one. With `pinned` set, the slot is also kept on its side of the pinned
     * block: `true` keeps it within, `false` keeps it after.
     */
    slotForIndex(index: number, pinned?: boolean): number {
        let slot = this._items.length;
        let start = 0;
        for (let i = 0; i < this._items.length; i++) {
            if (index <= start) {
                slot = i;
                break;
            }
            const length = this.lengthOf(this._items[i]);
            const end = start + length;
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

    /** Add a panel as a top-level item at `slot`. */
    insert(panel: T, slot: number): void {
        this._panels.set(panel.id, panel);
        this._items.splice(this.clampSlot(slot), 0, { panel });
    }

    /**
     * Add a panel to `tabGroup` at `index` among its members. A tab group
     * without members takes its place at `slot`.
     */
    insertIntoTabGroup(
        panel: T,
        tabGroup: TabGroup,
        index: number | undefined,
        slot: number
    ): void {
        this._panels.set(panel.id, panel);
        if (this.slotOfTabGroup(tabGroup) === -1) {
            this._items.splice(this.clampSlot(slot), 0, { tabGroup });
        }
        this._tabGroupOf.set(panel.id, tabGroup);
        tabGroup.insertMember(panel.id, index);
    }

    /**
     * Remove a panel. A tab group it leaves without members gives up its
     * place. Returns the tab group the panel was in.
     */
    remove(panelId: string): TabGroup | undefined {
        const tabGroup = this._tabGroupOf.get(panelId);
        if (tabGroup) {
            this.removeMember(tabGroup, panelId);
        } else {
            const slot = this.slotOfPanel(panelId);
            if (slot !== -1) {
                this._items.splice(slot, 1);
            }
        }
        this._panels.delete(panelId);
        return tabGroup;
    }

    /**
     * Move a top-level panel into `tabGroup` at `index` among its members. A
     * tab group without members takes the panel's place.
     */
    join(panelId: string, tabGroup: TabGroup, index?: number): void {
        const slot = this.slotOfPanel(panelId);
        if (slot === -1) {
            return;
        }
        if (this.slotOfTabGroup(tabGroup) === -1) {
            this._items.splice(slot, 1, { tabGroup });
        } else {
            this._items.splice(slot, 1);
        }
        this._tabGroupOf.set(panelId, tabGroup);
        tabGroup.insertMember(panelId, index);
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

    /** Move a member to `index` among its tab group's members. */
    reorderInTabGroup(panelId: string, index: number): void {
        const tabGroup = this._tabGroupOf.get(panelId);
        if (!tabGroup) {
            return;
        }
        tabGroup.removeMember(panelId);
        tabGroup.insertMember(panelId, index);
    }

    /**
     * Move a tab group to flat `index`, counted without its members. The
     * index is resolved as for a top-level panel, so it never lands inside
     * another tab group.
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
