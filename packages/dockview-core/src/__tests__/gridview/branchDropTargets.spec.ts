import {
    branchDropTargets,
    DropTreeNode,
    withoutView,
} from '../../gridview/branchDropTargets';
import { Orientation } from '../../splitview/splitview';

const H = Orientation.HORIZONTAL;
const V = Orientation.VERTICAL;

function leaf(view: string, visible = true): DropTreeNode<string> {
    return { view, orientation: H, visible, children: [] };
}

function branch(
    orientation: Orientation,
    children: DropTreeNode<string>[],
    visible = true
): DropTreeNode<string> {
    return { orientation, visible, children };
}

describe('branchDropTargets', () => {
    test('a column of two views can be dropped beside as a whole', () => {
        // root (H): [ column (V): [a, b], c ]
        const root = branch(H, [branch(V, [leaf('a'), leaf('b')]), leaf('c')]);

        expect(branchDropTargets(root, 'a', 'right')).toEqual([
            { location: [1], index: 0, views: ['a', 'b'] },
        ]);
        expect(branchDropTargets(root, 'b', 'left')).toEqual([
            { location: [0], index: 0, views: ['a', 'b'] },
        ]);
        expect(branchDropTargets(root, 'a', 'bottom')).toEqual([]);
        expect(branchDropTargets(root, 'a', 'center')).toEqual([]);
    });

    test('lists every enclosing branch, innermost first', () => {
        // root (H): [ x (V): [ y (H): [ z (V): [a, b], c ], d ], e ]
        const root = branch(H, [
            branch(V, [
                branch(H, [branch(V, [leaf('a'), leaf('b')]), leaf('c')]),
                leaf('d'),
            ]),
            leaf('e'),
        ]);

        expect(branchDropTargets(root, 'a', 'left')).toEqual([
            { location: [0, 0, 0], index: 0, views: ['a', 'b'] },
            { location: [0], index: 0, views: ['a', 'b', 'c', 'd'] },
        ]);
    });

    test('stops at a branch whose edge is not the view edge', () => {
        // root (H): [ column (V): [ row (H): [a, b], c ], d ]
        const root = branch(H, [
            branch(V, [branch(H, [leaf('a'), leaf('b')]), leaf('c')]),
            leaf('d'),
        ]);

        expect(branchDropTargets(root, 'a', 'right')).toEqual([]);
        expect(branchDropTargets(root, 'b', 'right')).toEqual([
            { location: [1], index: 0, views: ['a', 'b', 'c'] },
        ]);
    });

    test('a layout laid out across the drop axis is offered as a whole', () => {
        // root (V): [ row (H): [a, c], b ]
        const root = branch(V, [branch(H, [leaf('a'), leaf('c')]), leaf('b')]);

        expect(branchDropTargets(root, 'a', 'left')).toEqual([
            { location: [], index: 0, views: ['a', 'c', 'b'] },
        ]);
        expect(branchDropTargets(root, 'b', 'right')).toEqual([
            { location: [], index: 0, views: ['a', 'c', 'b'] },
        ]);
        expect(branchDropTargets(root, 'a', 'right')).toEqual([]);
    });

    test('a branch covering the same area as the view is not offered', () => {
        // root (H): [ column (V): [a, hidden], c ]
        const root = branch(H, [
            branch(V, [leaf('a'), leaf('hidden', false)]),
            leaf('c'),
        ]);

        expect(branchDropTargets(root, 'a', 'right')).toEqual([]);
    });

    test('hidden views do not count towards the edge', () => {
        // root (H): [ column (V): [ row (H): [a, hidden], b ], c ]
        const root = branch(H, [
            branch(V, [
                branch(H, [leaf('a'), leaf('hidden', false)]),
                leaf('b'),
            ]),
            leaf('c'),
        ]);

        expect(branchDropTargets(root, 'a', 'right')).toEqual([
            { location: [1], index: 0, views: ['a', 'b'] },
        ]);
    });
});

describe('withoutView', () => {
    test('a branch left with one view is replaced by it', () => {
        const root = branch(H, [branch(V, [leaf('a'), leaf('b')]), leaf('c')]);

        expect(withoutView(root, 'b')).toEqual(
            branch(H, [leaf('a'), leaf('c')])
        );
        expect(root.children[0].children).toHaveLength(2);
    });

    test('a branch left with one branch spreads it into the grandparent', () => {
        // root (H): [ p (V): [s, x (H): [y, z]], w ]
        const root = branch(H, [
            branch(V, [leaf('s'), branch(H, [leaf('y'), leaf('z')])]),
            leaf('w'),
        ]);

        expect(withoutView(root, 's')).toEqual(
            branch(H, [leaf('y'), leaf('z'), leaf('w')])
        );
    });

    test('a root left with one branch is replaced by it', () => {
        const root = branch(H, [leaf('a'), branch(V, [leaf('b'), leaf('c')])]);

        expect(withoutView(root, 'a')).toEqual(
            branch(V, [leaf('b'), leaf('c')])
        );
    });

    test('targets follow the layout the removal produces', () => {
        const root = branch(H, [
            branch(V, [leaf('s', false), branch(H, [leaf('y'), leaf('z')])]),
            leaf('w'),
        ]);

        expect(branchDropTargets(root, 'y', 'left')).toHaveLength(1);
        expect(branchDropTargets(withoutView(root, 's'), 'y', 'left')).toEqual(
            []
        );
    });
});
