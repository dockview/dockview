import type { Position } from '../dnd/droptarget';
import { Orientation } from '../splitview/splitview';

export interface DropTreeNode<T> {
    readonly view?: T;
    readonly orientation: Orientation;
    readonly visible: boolean;
    readonly children: DropTreeNode<T>[];
}

/** A row or column to drop beside; an empty `location` is the whole layout. */
export interface BranchDropTarget<T> {
    readonly location: number[];
    readonly index: number;
    readonly views: T[];
}

function isBranch<T>(node: DropTreeNode<T>): boolean {
    return node.view === undefined;
}

function findPath<T>(
    node: DropTreeNode<T>,
    view: T,
    path: number[] = []
): number[] | undefined {
    if (node.view === view) {
        return path;
    }
    for (let i = 0; i < node.children.length; i++) {
        const found = findPath(node.children[i], view, [...path, i]);
        if (found) {
            return found;
        }
    }
    return undefined;
}

function visibleViews<T>(node: DropTreeNode<T>): T[] {
    if (!isBranch(node)) {
        return [node.view as T];
    }
    return node.children
        .filter((child) => child.visible)
        .flatMap((child) => visibleViews(child));
}

/** The tree once `view` is removed, normalized like `Gridview.removeView`. */
export function withoutView<T>(
    root: DropTreeNode<T>,
    view: T
): DropTreeNode<T> {
    const location = findPath(root, view);
    if (!location || location.length === 0) {
        return root;
    }

    const clone = (node: DropTreeNode<T>): DropTreeNode<T> => ({
        ...node,
        children: node.children.map(clone),
    });
    const newRoot = clone(root);

    const ancestors: DropTreeNode<T>[] = [newRoot];
    for (const index of location.slice(0, -1)) {
        ancestors.push(ancestors[ancestors.length - 1].children[index]);
    }

    const parent = ancestors[ancestors.length - 1];
    parent.children.splice(location[location.length - 1], 1);

    if (parent.children.length !== 1) {
        return newRoot;
    }

    const sibling = parent.children[0];

    if (ancestors.length === 1) {
        return isBranch(sibling) ? { ...sibling, visible: true } : newRoot;
    }

    const grandParent = ancestors[ancestors.length - 2];
    const parentIndex = location[location.length - 2];

    grandParent.children.splice(
        parentIndex,
        1,
        ...(isBranch(sibling) ? sibling.children : [sibling])
    );

    return newRoot;
}

/** Branches `view` can be dropped beside on its `position` side, innermost first. */
export function branchDropTargets<T>(
    root: DropTreeNode<T>,
    view: T,
    position: Position
): BranchDropTarget<T>[] {
    if (position === 'center') {
        return [];
    }

    const location = findPath(root, view);
    if (!location || location.length === 0) {
        return [];
    }

    const axis =
        position === 'left' || position === 'right'
            ? Orientation.HORIZONTAL
            : Orientation.VERTICAL;
    const toEnd = position === 'right' || position === 'bottom';

    const nodes: DropTreeNode<T>[] = [root];
    for (const index of location) {
        nodes.push(nodes[nodes.length - 1].children[index]);
    }

    const targets: BranchDropTarget<T>[] = [];

    let flush = true;
    let sameArea = true;

    for (let depth = location.length; depth >= 1; depth--) {
        const node = nodes[depth];
        const container = nodes[depth - 1];
        const index = location[depth - 1];

        if (
            depth < location.length &&
            !sameArea &&
            container.orientation === axis
        ) {
            targets.push({
                location: [
                    ...location.slice(0, depth - 1),
                    index + (toEnd ? 1 : 0),
                ],
                index,
                views: visibleViews(node),
            });
            sameArea = true;
        }

        const visibleSiblings = container.children
            .map((child, i) => (child.visible ? i : -1))
            .filter((i) => i !== -1);

        if (visibleSiblings.length > 1) {
            sameArea = false;
        }

        if (container.orientation === axis) {
            const edgeIndex = toEnd
                ? visibleSiblings[visibleSiblings.length - 1]
                : visibleSiblings[0];
            flush = flush && edgeIndex === index;
        }

        if (!flush) {
            return targets;
        }
    }

    // Across the drop axis, the whole layout is one more candidate.
    if (!sameArea && root.orientation !== axis) {
        targets.push({ location: [], index: 0, views: visibleViews(root) });
    }

    return targets;
}
