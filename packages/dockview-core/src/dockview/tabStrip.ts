import { TabGroup } from './tabGroup';

type TabStripItem<T> = { readonly panel: T } | { readonly tabGroup: TabGroup };

/**
 * The edge of the span `[start, end)` nearer to `index`, after it on a tie:
 * where an index that would land inside a tab group goes instead.
 */
export function nearerEdge(index: number, start: number, end: number): number {
    return index - start < end - index ? start : end;
}

/** Where a panel goes in the strip. */
export type TabStripTarget =
    /** At flat `index`, counted without the panel, within the panel's
     *  section. Leaves any tab group. */
    | { readonly index: number }
    /** A member of `tabGroup` at `index` among its members (default: last). */
    | { readonly tabGroup: TabGroup; readonly index?: number };

/**
 * The order of a group's tabs: a pinned section of panels, then an unpinned
 * section of items, each a panel or a tab group holding its members. The
 * flat tab order is derived from it, so pinned tabs always come first and a
 * tab group's members are always contiguous and in the tab group's own
 * order. Tab groups live only in the unpinned section.
 *
 * A tab group has a place in the strip only while it has members; an empty
 * one is not an item. Member lists are edited silently: the caller fires the
 * tab group's events once the strip is in its final state.
 */
export class TabStrip<T extends { readonly id: string }> {
    private readonly _pinned: T[] = [];
    private readonly _items: TabStripItem<T>[] = [];
    private readonly _panels = new Map<string, T>();
    private readonly _tabGroupOf = new Map<string, TabGroup>();

    constructor(private readonly isPinned: (panel: T) => boolean) {}

    get size(): number {
        return this._panels.size;
    }

    /** The flat tab order. */
    toArray(): T[] {
        const result: T[] = [...this._pinned];
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
     * Add a new panel at `target`. A pinned panel goes in the pinned section
     * whatever the target. A disposed tab group leaves the panel top-level at
     * `fallbackIndex`; one without members takes its place there.
     */
    add(panel: T, target: TabStripTarget, fallbackIndex: number): void {
        this._panels.set(panel.id, panel);
        const index = 'tabGroup' in target ? fallbackIndex : target.index;
        if (this.isPinned(panel)) {
            this._pinned.splice(this.clampPinned(index), 0, panel);
            return;
        }
        if ('tabGroup' in target && !target.tabGroup.isDisposed) {
            this.addMember(panel.id, target.tabGroup, target.index, () =>
                this.slotForIndex(fallbackIndex)
            );
            return;
        }
        this._items.splice(this.slotForIndex(index), 0, { panel });
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
        if (this._pinned.includes(panel)) {
            // pinned panels stay in the pinned section, out of tab groups
            if (!('tabGroup' in target)) {
                this._pinned.splice(this._pinned.indexOf(panel), 1);
                this._pinned.splice(this.clampPinned(target.index), 0, panel);
            }
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
        this._items.splice(this.slotForIndex(target.index), 0, { panel });
    }

    /**
     * Move every panel whose pinned state no longer matches its section: a
     * newly pinned panel leaves its tab group for the end of the pinned
     * section, a newly unpinned one goes to the front of the unpinned
     * section. Returns the moved panels with the tab group each one left.
     */
    reconcilePinned(): { panel: T; leftTabGroup?: TabGroup }[] {
        const changes: { panel: T; leftTabGroup?: TabGroup }[] = [];
        const unpinned = this._pinned.filter((p) => !this.isPinned(p));
        for (const panel of unpinned) {
            this._pinned.splice(this._pinned.indexOf(panel), 1);
        }
        this._items.splice(0, 0, ...unpinned.map((panel) => ({ panel })));
        changes.push(...unpinned.map((panel) => ({ panel })));

        const pinned = this.toArray().filter(
            (p) => this.isPinned(p) && !this._pinned.includes(p)
        );
        for (const panel of pinned) {
            const leftTabGroup = this._tabGroupOf.get(panel.id);
            this.detach(panel.id);
            this._pinned.push(panel);
            changes.push({ panel, leftTabGroup });
        }
        return changes;
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
        const pinnedIndex = this._pinned.findIndex((p) => p.id === panelId);
        if (pinnedIndex === -1) {
            this.detach(panelId);
        } else {
            this._pinned.splice(pinnedIndex, 1);
        }
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
     * The unpinned slot for a panel placed at flat `index` (counted from the
     * start of the strip; an index in the pinned section lands at the front
     * of the unpinned one). An index between two members of a tab group
     * moves to the nearer edge of it, after it on a tie.
     */
    private slotForIndex(flatIndex: number): number {
        const index = flatIndex - this._pinned.length;
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
                slot = nearerEdge(index, start, end) === start ? i : i + 1;
                break;
            }
            start = end;
        }
        return slot;
    }

    private clampPinned(index: number): number {
        return Math.max(0, Math.min(index, this._pinned.length));
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
