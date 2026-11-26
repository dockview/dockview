import { TabStrip } from '../../dockview/tabStrip';
import { TabGroup } from '../../dockview/tabGroup';

type P = { id: string; pinned?: boolean };

function strip(ids: string[]): TabStrip<P> {
    const s = new TabStrip<P>((p) => !!p.pinned);
    for (const id of ids) {
        s.insert({ id }, s.size);
    }
    return s;
}

const order = (s: TabStrip<P>): string[] => s.toArray().map((p) => p.id);

/** Strip `a b [X: c d e] f`. */
function withTabGroup(): { s: TabStrip<P>; x: TabGroup } {
    const s = strip(['a', 'b', 'c', 'd', 'e', 'f']);
    const x = new TabGroup('x');
    s.join('c', x);
    s.join('d', x);
    s.join('e', x);
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

    test('joining places the panel by the tab group, not where it was', () => {
        const { s, x } = withTabGroup();
        s.join('a', x, 1);
        s.join('f', x);
        expect(order(s)).toEqual(['b', 'c', 'a', 'd', 'e', 'f']);
        expect(x.panelIds).toEqual(['c', 'a', 'd', 'e', 'f']);
    });

    test('a tab group with no members takes the joining panel’s place', () => {
        const s = strip(['a', 'b', 'c']);
        const x = new TabGroup('x');
        s.join('b', x);
        expect(order(s)).toEqual(['a', 'b', 'c']);
        expect(x.panelIds).toEqual(['b']);
    });

    describe('slotForIndex', () => {
        test.each([
            [0, ['g', 'a', 'b', 'c', 'd', 'e', 'f']],
            [2, ['a', 'b', 'g', 'c', 'd', 'e', 'f']],
            [3, ['a', 'b', 'g', 'c', 'd', 'e', 'f']], // nearer the start
            [4, ['a', 'b', 'c', 'd', 'e', 'g', 'f']], // nearer the end
            [5, ['a', 'b', 'c', 'd', 'e', 'g', 'f']],
            [6, ['a', 'b', 'c', 'd', 'e', 'f', 'g']],
            [99, ['a', 'b', 'c', 'd', 'e', 'f', 'g']],
        ])('index %i never splits the tab group', (index, expected) => {
            const { s } = withTabGroup();
            s.insert({ id: 'g' }, s.slotForIndex(index));
            expect(order(s)).toEqual(expected);
        });

        test('a tie lands after the tab group', () => {
            const s = strip(['a', 'b', 'c']);
            const x = new TabGroup('x');
            s.join('a', x);
            s.join('b', x);
            s.insert({ id: 'g' }, s.slotForIndex(1));
            expect(order(s)).toEqual(['a', 'b', 'g', 'c']);
        });

        test('keeps a panel on its side of the pinned block', () => {
            const s = new TabStrip<P>((p) => !!p.pinned);
            s.insert({ id: 'p1', pinned: true }, 0);
            s.insert({ id: 'p2', pinned: true }, 1);
            s.insert({ id: 'a' }, 2);
            s.insert({ id: 'b' }, 3);

            s.insert({ id: 'u' }, s.slotForIndex(0, false));
            expect(order(s)).toEqual(['p1', 'p2', 'u', 'a', 'b']);

            s.insert({ id: 'p3', pinned: true }, s.slotForIndex(4, true));
            expect(order(s)).toEqual(['p1', 'p2', 'p3', 'u', 'a', 'b']);

            // without a pinned state the index is not clamped
            expect(s.slotForIndex(0)).toBe(0);
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
            s.join('b', x);
            s.leave('b');
            expect(order(s)).toEqual(['a', 'b', 'c']);
            expect(x.isEmpty).toBe(true);
        });
    });

    test('reorders a member within its tab group', () => {
        const { s, x } = withTabGroup();
        s.reorderInTabGroup('c', 2);
        expect(x.panelIds).toEqual(['d', 'e', 'c']);
        expect(order(s)).toEqual(['a', 'b', 'd', 'e', 'c', 'f']);
    });

    test('a tab group moves as one item and never into another', () => {
        const s = strip(['a', 'b', 'c', 'd', 'e']);
        const x = new TabGroup('x');
        const y = new TabGroup('y');
        s.join('a', x);
        s.join('b', x);
        s.join('c', y);
        s.join('d', y);
        // strip [x: a b] [y: c d] e; index 1 of `[y: c d] e` is a tie
        // inside y, so x lands after it
        s.moveTabGroup(x, 1);
        expect(order(s)).toEqual(['c', 'd', 'a', 'b', 'e']);
        s.moveTabGroup(x, 3);
        expect(order(s)).toEqual(['c', 'd', 'e', 'a', 'b']);
    });

    test('inserts into a tab group, or at a slot when it has no members', () => {
        const s = strip(['a', 'b']);
        const x = new TabGroup('x');
        s.insertIntoTabGroup({ id: 'c' }, x, 0, 1);
        expect(order(s)).toEqual(['a', 'c', 'b']);
        s.insertIntoTabGroup({ id: 'd' }, x, 0, 99);
        expect(order(s)).toEqual(['a', 'd', 'c', 'b']);
        expect(x.panelIds).toEqual(['d', 'c']);
    });

    test('removing the last member gives up the tab group’s place', () => {
        const { s, x } = withTabGroup();
        for (const id of ['c', 'd', 'e']) {
            expect(s.remove(id)).toBe(x);
        }
        expect(order(s)).toEqual(['a', 'b', 'f']);
        s.insert({ id: 'g' }, 2);
        expect(order(s)).toEqual(['a', 'b', 'g', 'f']);
    });

    test('unwraps a tab group in place', () => {
        const { s, x } = withTabGroup();
        s.unwrap(x);
        expect(order(s)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
        expect(s.tabGroupOf('d')).toBeUndefined();
        // its panels are top-level again, so an index can land between them
        s.insert({ id: 'g' }, s.slotForIndex(3));
        expect(order(s)).toEqual(['a', 'b', 'c', 'g', 'd', 'e', 'f']);
    });
});
