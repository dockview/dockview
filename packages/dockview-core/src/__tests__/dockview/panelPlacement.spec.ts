import {
    flatIndexOfTarget,
    resolvePanelPlacement,
    tabGroupOfTarget,
} from '../../dockview/panelPlacement';

describe('panelPlacement', () => {
    describe('resolvePanelPlacement', () => {
        test('index is shorthand for at: { index }', () => {
            expect(resolvePanelPlacement({ index: 2 })).toEqual({ index: 2 });
        });

        test('at is taken as given', () => {
            const at = { tabGroup: 'x', index: 1 };
            expect(resolvePanelPlacement({ at })).toBe(at);
        });

        test('neither asks for no place', () => {
            expect(resolvePanelPlacement({})).toBeUndefined();
        });

        test('index combined with at throws', () => {
            expect(() =>
                resolvePanelPlacement({ index: 0, at: { index: 1 } })
            ).toThrow('dockview: index cannot be combined with at');
        });
    });

    describe('reading a target', () => {
        test('a place in a tab group names it and no flat index', () => {
            const at = { tabGroup: 'x', index: 1 };
            expect(tabGroupOfTarget(at)).toBe('x');
            expect(flatIndexOfTarget(at)).toBeUndefined();
        });

        test('a top-level place names a flat index and no tab group', () => {
            expect(tabGroupOfTarget({ index: 3 })).toBeUndefined();
            expect(flatIndexOfTarget({ index: 3 })).toBe(3);
        });

        test('a tab group given as null is a top-level place', () => {
            const at = { tabGroup: null, index: 3 } as never;
            expect(tabGroupOfTarget(at)).toBeUndefined();
            expect(flatIndexOfTarget(at)).toBe(3);
        });

        test('no target names neither', () => {
            expect(tabGroupOfTarget(undefined)).toBeUndefined();
            expect(flatIndexOfTarget(undefined)).toBeUndefined();
        });
    });
});
