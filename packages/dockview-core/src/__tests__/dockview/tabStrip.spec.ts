import { TabStrip } from '../../dockview/tabStrip';
import { TabGroup } from '../../dockview/tabGroup';

type P = { id: string; pinned?: boolean };

function strip(ids: string[]): TabStrip<P> {
    const s = new TabStrip<P>((p) => !!p.pinned);
    for (const id of ids) {
        s.add({ id }, { index: s.size }, s.size);
    }
    return s;
}

const order = (s: TabStrip<P>): string[] => s.toArray().map((p) => p.id);

/** Strip `a b [X: c d e] f`. */
function withTabGroup(): { s: TabStrip<P>; x: TabGroup } {
    const s = strip(['a', 'b', 'c', 'd', 'e', 'f']);
    const x = new TabGroup('x');
    for (const id of ['c', 'd', 'e']) {
        s.move(id, { tabGroup: x });
    }
    return { s, x };
}

describe('TabStrip', () => {
    test('derives the flat order from its items', () => {
        const { s, x } = withTabGroup();
        expect(order(s)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
        expect(x.panelIds).toEqual(['c', 'd', 'e']);
        expect(s.tabGroupOf('d')).toBe(x);
        expect(s.tabGroupOf('a')).toBeUndefined();
    });

    describe('move into a tab group', () => {
        test('places the panel by the tab group, not where it was', () => {
            const { s, x } = withTabGroup();
            s.move('a', { tabGroup: x, index: 1 });
            s.move('f', { tabGroup: x });
            expect(order(s)).toEqual(['b', 'c', 'a', 'd', 'e', 'f']);
            expect(x.panelIds).toEqual(['c', 'a', 'd', 'e', 'f']);
        });

        test('a tab group with no members takes the panel’s place', () => {
            const s = strip(['a', 'b', 'c']);
            const x = new TabGroup('x');
            s.move('b', { tabGroup: x });
            expect(order(s)).toEqual(['a', 'b', 'c']);
            expect(x.panelIds).toEqual(['b']);
        });

        test('reorders within the same tab group', () => {
            const { s, x } = withTabGroup();
            s.move('c', { tabGroup: x, index: 2 });
            expect(x.panelIds).toEqual(['d', 'e', 'c']);
            expect(order(s)).toEqual(['a', 'b', 'd', 'e', 'c', 'f']);
        });

        test('moves between tab groups', () => {
            const { s, x } = withTabGroup();
            const y = new TabGroup('y');
            s.move('a', { tabGroup: y });
            s.move('d', { tabGroup: y, index: 0 });
            expect(order(s)).toEqual(['d', 'a', 'b', 'c', 'e', 'f']);
            expect(x.panelIds).toEqual(['c', 'e']);
            expect(y.panelIds).toEqual(['d', 'a']);
        });

        test('the only member moving within its tab group keeps it', () => {
            const s = strip(['a', 'b']);
            const x = new TabGroup('x');
            s.move('a', { tabGroup: x });
            s.move('a', { tabGroup: x, index: 0 });
            expect(order(s)).toEqual(['a', 'b']);
            expect(s.tabGroupOf('a')).toBe(x);
        });

        test('a disposed tab group is a no-op', () => {
            const s = strip(['a', 'b']);
            const x = new TabGroup('x');
            x.dispose();
            s.move('a', { tabGroup: x });
            expect(order(s)).toEqual(['a', 'b']);
            expect(s.tabGroupOf('a')).toBeUndefined();
        });
    });

    describe('move to an index', () => {
        test.each([
            [0, ['f', 'a', 'b', 'c', 'd', 'e']],
            [2, ['a', 'b', 'f', 'c', 'd', 'e']],
            [3, ['a', 'b', 'f', 'c', 'd', 'e']], // nearer the start
            [4, ['a', 'b', 'c', 'd', 'e', 'f']], // nearer the end
            [5, ['a', 'b', 'c', 'd', 'e', 'f']],
            [99, ['a', 'b', 'c', 'd', 'e', 'f']],
        ])('index %i never splits the tab group', (index, expected) => {
            const { s } = withTabGroup();
            s.move('f', { index });
            expect(order(s)).toEqual(expected);
        });

        test('a tie lands after the tab group', () => {
            const s = strip(['a', 'b', 'c']);
            const x = new TabGroup('x');
            s.move('a', { tabGroup: x });
            s.move('b', { tabGroup: x });
            s.move('c', { index: 1 });
            expect(order(s)).toEqual(['a', 'b', 'c']);
        });

        test('a member moved to an index leaves its tab group', () => {
            const { s, x } = withTabGroup();
            s.move('d', { index: 0 });
            expect(order(s)).toEqual(['d', 'a', 'b', 'c', 'e', 'f']);
            expect(x.panelIds).toEqual(['c', 'e']);
            expect(s.tabGroupOf('d')).toBeUndefined();
        });

        test('keeps a panel in its section', () => {
            const s = new TabStrip<P>((p) => !!p.pinned);
            s.add({ id: 'p1', pinned: true }, { index: 0 }, 0);
            s.add({ id: 'p2', pinned: true }, { index: 1 }, 1);
            s.add({ id: 'a' }, { index: 2 }, 2);
            s.add({ id: 'b' }, { index: 3 }, 3);

            s.add({ id: 'u' }, { index: 0 }, 0);
            expect(order(s)).toEqual(['p1', 'p2', 'u', 'a', 'b']);

            s.add({ id: 'p3', pinned: true }, { index: 4 }, 4);
            expect(order(s)).toEqual(['p1', 'p2', 'p3', 'u', 'a', 'b']);

            s.move('b', { index: 0 });
            expect(order(s)).toEqual(['p1', 'p2', 'p3', 'b', 'u', 'a']);
            s.move('p1', { index: 5 });
            expect(order(s)).toEqual(['p2', 'p3', 'p1', 'b', 'u', 'a']);

            // a pinned panel never joins a tab group
            s.move('p2', { tabGroup: new TabGroup('x') });
            expect(s.tabGroupOf('p2')).toBeUndefined();
        });
    });

    describe('reconcilePinned', () => {
        test('pinning leaves the tab group for the end of the pinned block', () => {
            const { s, x } = withTabGroup();
            const d = s.toArray().find((p) => p.id === 'd')!;
            const a = s.toArray().find((p) => p.id === 'a')!;
            a.pinned = true;
            d.pinned = true;

            expect(s.reconcilePinned()).toEqual([
                { panel: a, leftTabGroup: undefined },
                { panel: d, leftTabGroup: x },
            ]);
            expect(order(s)).toEqual(['a', 'd', 'b', 'c', 'e', 'f']);
            expect(x.panelIds).toEqual(['c', 'e']);
        });

        test('unpinning returns a panel to the front of the rest', () => {
            const s = new TabStrip<P>((p) => !!p.pinned);
            const p1 = { id: 'p1', pinned: true };
            s.add(p1, { index: 0 }, 0);
            s.add({ id: 'p2', pinned: true }, { index: 1 }, 1);
            s.add({ id: 'a' }, { index: 2 }, 2);

            p1.pinned = false;
            expect(s.reconcilePinned()).toEqual([{ panel: p1 }]);
            expect(order(s)).toEqual(['p2', 'p1', 'a']);
            expect(s.reconcilePinned()).toEqual([]);
        });
    });

    describe('leave', () => {
        test.each([
            ['c', ['a', 'b', 'c', 'd', 'e', 'f'], ['d', 'e']], // first: before
            ['d', ['a', 'b', 'c', 'e', 'd', 'f'], ['c', 'e']], // middle: after
            ['e', ['a', 'b', 'c', 'd', 'e', 'f'], ['c', 'd']], // last: after
        ])('%s leaves to the right side of the tab group', (id, expected, members) => {
            const { s, x } = withTabGroup();
            expect(s.leave(id)).toBe(x);
            expect(order(s)).toEqual(expected);
            expect(x.panelIds).toEqual(members);
            expect(s.tabGroupOf(id)).toBeUndefined();
        });

        test('the last member takes the tab group’s place', () => {
            const s = strip(['a', 'b', 'c']);
            const x = new TabGroup('x');
            s.move('b', { tabGroup: x });
            s.leave('b');
            expect(order(s)).toEqual(['a', 'b', 'c']);
            expect(x.isEmpty).toBe(true);
        });
    });

    test('a tab group moves as one item and never into another', () => {
        const s = strip(['a', 'b', 'c', 'd', 'e']);
        const x = new TabGroup('x');
        const y = new TabGroup('y');
        s.move('a', { tabGroup: x });
        s.move('b', { tabGroup: x });
        s.move('c', { tabGroup: y });
        s.move('d', { tabGroup: y });
        // strip [x: a b] [y: c d] e; index 1 of `[y: c d] e` is a tie
        // inside y, so x lands after it
        s.moveTabGroup(x, 1);
        expect(order(s)).toEqual(['c', 'd', 'a', 'b', 'e']);
        s.moveTabGroup(x, 3);
        expect(order(s)).toEqual(['c', 'd', 'e', 'a', 'b']);
    });

    test('adds into a tab group, or at the fallback index when it has no members', () => {
        const s = strip(['a', 'b']);
        const x = new TabGroup('x');
        s.add({ id: 'c' }, { tabGroup: x, index: 0 }, 1);
        expect(order(s)).toEqual(['a', 'c', 'b']);
        s.add({ id: 'd' }, { tabGroup: x, index: 0 }, 99);
        expect(order(s)).toEqual(['a', 'd', 'c', 'b']);
        expect(x.panelIds).toEqual(['d', 'c']);

        const disposed = new TabGroup('gone');
        disposed.dispose();
        s.add({ id: 'e' }, { tabGroup: disposed }, 0);
        expect(order(s)).toEqual(['e', 'a', 'd', 'c', 'b']);
        expect(s.tabGroupOf('e')).toBeUndefined();
    });

    test('removing the last member gives up the tab group’s place', () => {
        const { s, x } = withTabGroup();
        for (const id of ['c', 'd', 'e']) {
            expect(s.remove(id)).toBe(x);
        }
        expect(order(s)).toEqual(['a', 'b', 'f']);
        s.add({ id: 'g' }, { index: 2 }, 2);
        expect(order(s)).toEqual(['a', 'b', 'g', 'f']);
    });

    test('unwraps a tab group in place', () => {
        const { s, x } = withTabGroup();
        s.unwrap(x);
        expect(order(s)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
        expect(s.tabGroupOf('d')).toBeUndefined();
        // its panels are top-level again, so an index can land between them
        s.move('f', { index: 3 });
        expect(order(s)).toEqual(['a', 'b', 'c', 'f', 'd', 'e']);
    });

    test('edits member lists without firing the tab group’s events', () => {
        const s = strip(['a', 'b']);
        const x = new TabGroup('x');
        const events: string[] = [];
        x.onDidPanelChange((e) => events.push(`${e.type} ${e.panelId}`));
        s.move('a', { tabGroup: x });
        s.leave('a');
        expect(events).toEqual([]);
    });

    test('finds a drop position among a tab group’s members', () => {
        const s = strip(['a', 'b', 'c', 'd']);
        const y = new TabGroup('y');
        s.move('c', { tabGroup: y });
        s.move('d', { tabGroup: y });

        // counted without b, index 2 of `a [y: c d]` is after c
        expect(s.indexInTabGroupAt(y, 2, 'b')).toBe(1);
        expect(s.indexInTabGroupAt(y, 1, 'b')).toBe(0);
    });
});
