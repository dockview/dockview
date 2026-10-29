/*---------------------------------------------------------------------------------------------
 * Accreditation: This file is largly based upon the MIT licenced VSCode sourcecode found at:
 * https://github.com/microsoft/vscode/tree/main/src/vs/base/browser/ui/grid
 *--------------------------------------------------------------------------------------------*/

import {
    ISplitviewStyles,
    LayoutPriority,
    Orientation,
    Sizing,
} from '../splitview/splitview';
import { tail } from '../array';
import { LeafNode } from './leafNode';
import { BranchNode } from './branchNode';
import { Node } from './types';
import { Emitter, Event } from '../events';
import { IDisposable, MutableDisposable } from '../lifecycle';
import { Position } from '../dnd/droptarget';
import {
    type BranchDropTarget,
    branchDropTargets,
    type DropTreeNode,
    withoutView,
} from './branchDropTargets';

function findLeaf(candiateNode: Node, last: boolean): LeafNode {
    if (candiateNode instanceof LeafNode) {
        return candiateNode;
    }
    if (candiateNode instanceof BranchNode) {
        return findLeaf(
            candiateNode.children[last ? candiateNode.children.length - 1 : 0],
            last
        );
    }
    throw new Error('invalid node');
}

/**
 * The sizing to re-add a branch's child with, so a hidden child stays hidden
 * (with its cached size) instead of coming back visible at size 0.
 */
function childSizing(
    node: BranchNode,
    index: number,
    size: number,
    scale = 1
): number | Sizing {
    const cachedVisibleSize = node.getChildCachedVisibleSize(index);
    return cachedVisibleSize === undefined
        ? size
        : Sizing.Invisible(Math.round(cachedVisibleSize * scale));
}

function cloneNode<T extends Node>(
    node: T,
    size: number,
    orthogonalSize: number
): T {
    if (node instanceof BranchNode) {
        const result = new BranchNode(
            node.orientation,
            node.proportionalLayout,
            node.styles,
            size,
            orthogonalSize,
            node.disabled,
            node.margin
        );

        for (let i = node.children.length - 1; i >= 0; i--) {
            const child = node.children[i];

            // A branch's `size` is its own-axis extent; its extent along the
            // parent axis is `orthogonalSize`. Leaves store the parent-axis
            // extent in `size`.
            const childSize =
                child instanceof BranchNode ? child.orthogonalSize : child.size;

            result.addChild(
                cloneNode(child, child.size, child.orthogonalSize),
                childSizing(node, i, childSize),
                0,
                true
            );
        }

        return result as T;
    } else {
        return new LeafNode(node.view, node.orientation, orthogonalSize) as T;
    }
}

function flipNode<T extends Node>(
    node: T,
    size: number,
    orthogonalSize: number
): T {
    if (node instanceof BranchNode) {
        const result = new BranchNode(
            orthogonal(node.orientation),
            node.proportionalLayout,
            node.styles,
            size,
            orthogonalSize,
            node.disabled,
            node.margin
        );

        let totalSize = 0;

        // A hidden branch is laid out at size 0, so its children have nothing
        // to scale against. Keep their cached sizes as they are rather than
        // collapsing them to 0.
        const cachedSizeScale = node.size === 0 ? 1 : size / node.size;

        for (let i = node.children.length - 1; i >= 0; i--) {
            const child = node.children[i];
            const childSize =
                child instanceof BranchNode ? child.orthogonalSize : child.size;

            let newSize =
                node.size === 0
                    ? 0
                    : Math.round((size * childSize) / node.size);
            totalSize += newSize;

            // The last view to add should adjust to rounding errors
            if (i === 0) {
                newSize += size - totalSize;
            }

            result.addChild(
                flipNode(child, orthogonalSize, newSize),
                childSizing(node, i, newSize, cachedSizeScale),
                0,
                true
            );
        }

        return result as T;
    } else {
        return new LeafNode(
            node.view,
            orthogonal(node.orientation),
            orthogonalSize
        ) as T;
    }
}

export function indexInParent(element: HTMLElement): number {
    const parentElement = element.parentElement;

    if (!parentElement) {
        throw new Error('Invalid grid element');
    }

    let el = parentElement.firstElementChild;
    let index = 0;

    while (el !== element && el !== parentElement.lastElementChild && el) {
        el = el.nextElementSibling;
        index++;
    }

    return index;
}

/**
 * Find the grid location of a specific DOM element by traversing the parent
 * chain and finding each child index on the way.
 *
 * This will break as soon as DOM structures of the Splitview or Gridview change.
 */
export function getGridLocation(element: HTMLElement): number[] {
    const parentElement = element.parentElement;

    if (!parentElement) {
        throw new Error('Invalid grid element');
    }

    if (/\bdv-grid-view\b/.test(parentElement.className)) {
        return [];
    }

    const index = indexInParent(parentElement);
    const ancestor = parentElement.parentElement!.parentElement!.parentElement!;
    return [...getGridLocation(ancestor), index];
}

export function getRelativeLocation(
    rootOrientation: Orientation,
    location: number[],
    direction: Position
): number[] {
    const orientation = getLocationOrientation(rootOrientation, location);
    const directionOrientation = getDirectionOrientation(direction);

    if (orientation === directionOrientation) {
        const [rest, _index] = tail(location);
        let index = _index;

        if (direction === 'right' || direction === 'bottom') {
            index += 1;
        }

        return [...rest, index];
    } else {
        const index = direction === 'right' || direction === 'bottom' ? 1 : 0;
        return [...location, index];
    }
}

export function getDirectionOrientation(direction: Position): Orientation {
    return direction === 'top' || direction === 'bottom'
        ? Orientation.VERTICAL
        : Orientation.HORIZONTAL;
}

export function getLocationOrientation(
    rootOrientation: Orientation,
    location: number[]
): Orientation {
    return location.length % 2 === 0
        ? orthogonal(rootOrientation)
        : rootOrientation;
}

export interface IViewSize {
    width?: number;
    height?: number;
}

export interface IGridView {
    readonly onDidChange: Event<IViewSize | undefined>;
    readonly element: HTMLElement;
    readonly minimumWidth: number;
    readonly maximumWidth: number;
    readonly minimumHeight: number;
    readonly maximumHeight: number;
    readonly isVisible: boolean;
    priority?: LayoutPriority;
    layout(width: number, height: number): void;
    toJSON(): object;
    fromJSON?(json: object): void;
    snap?: boolean;
    setVisible?(visible: boolean): void;
}

export const orthogonal = (orientation: Orientation) =>
    orientation === Orientation.HORIZONTAL
        ? Orientation.VERTICAL
        : Orientation.HORIZONTAL;

export interface GridLeafNode<T extends IGridView> {
    readonly view: T;
    readonly cachedVisibleSize: number | undefined;
    readonly box: { width: number; height: number };
}

export interface GridBranchNode<T extends IGridView> {
    readonly children: GridNode<T>[];
    readonly box: { width: number; height: number };
    readonly cachedVisibleSize: number | undefined;
}

export type GridNode<T extends IGridView> = GridLeafNode<T> | GridBranchNode<T>;

export function isGridBranchNode<T extends IGridView>(
    node: GridNode<T>
): node is GridBranchNode<T> {
    return !!(node as any).children;
}

export interface SerializedGridObject<T> {
    type: 'leaf' | 'branch';
    data: T | SerializedGridObject<T>[];
    size?: number;
    visible?: boolean;
}

const serializeBranchNode = <T extends IGridView>(
    node: GridNode<T>,
    orientation: Orientation
): SerializedGridObject<any> => {
    const size =
        orientation === Orientation.VERTICAL ? node.box.width : node.box.height;

    if (!isGridBranchNode(node)) {
        if (typeof node.cachedVisibleSize === 'number') {
            return {
                type: 'leaf',
                data: node.view.toJSON(),
                size: node.cachedVisibleSize,
                visible: false,
            };
        }

        return { type: 'leaf', data: node.view.toJSON(), size };
    }

    const data = node.children.map((c) =>
        serializeBranchNode(c, orthogonal(orientation))
    );

    // A branch that is hidden in its parent (all its children collapsed) has a
    // cached visible size; carry it through symmetrically with leaf nodes so
    // the branch round-trips hidden instead of loading visible at size 0.
    if (typeof node.cachedVisibleSize === 'number') {
        return {
            type: 'branch',
            data,
            size: node.cachedVisibleSize,
            visible: false,
        };
    }

    return {
        type: 'branch',
        data,
        size,
    };
};

export interface ISerializedLeafNode<T = any> {
    type: 'leaf';
    data: T;
    size: number;
    visible?: boolean;
}

export interface ISerializedBranchNode {
    type: 'branch';
    data: ISerializedNode[];
    size: number;
    visible?: boolean;
}

export type ISerializedNode = ISerializedLeafNode | ISerializedBranchNode;

export interface INodeDescriptor {
    node: Node;
    visible?: boolean;
}

export interface IViewDeserializer {
    fromJSON: (data: ISerializedLeafNode) => IGridView;
}

export interface SerializedNodeDescriptor {
    location: number[];
}

export interface SerializedGridview<T> {
    root: SerializedGridObject<T>;
    width: number;
    height: number;
    orientation: Orientation;
    maximizedNode?: SerializedNodeDescriptor;
}

export interface MaximizedViewChanged {
    view: IGridView;
    isMaximized: boolean;
}

export class Gridview implements IDisposable {
    readonly element: HTMLElement;

    private _root: BranchNode | undefined;
    private _locked = false;
    private _margin = 0;
    private _maximizedNode:
        | { leaf: LeafNode; hiddenOnMaximize: LeafNode[] }
        | undefined = undefined;
    private readonly disposable: MutableDisposable = new MutableDisposable();

    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;

    private readonly _onDidViewVisibilityChange = new Emitter<void>();
    readonly onDidViewVisibilityChange = this._onDidViewVisibilityChange.event;

    private readonly _onDidMaximizedNodeChange =
        new Emitter<MaximizedViewChanged>();
    readonly onDidMaximizedNodeChange = this._onDidMaximizedNodeChange.event;

    public get length(): number {
        return this._root ? this._root.children.length : 0;
    }

    public get orientation(): Orientation {
        return this.root.orientation;
    }

    public set orientation(orientation: Orientation) {
        if (this.root.orientation === orientation) {
            return;
        }

        const { size, orthogonalSize } = this.root;
        // Flipping orientation transposes the axes, so the swapped argument
        // order into flipNode is intentional.
        this.root = flipNode(this.root, orthogonalSize, size);
        this.root.layout(size, orthogonalSize);
    }

    get width(): number {
        return this.root.width;
    }

    get height(): number {
        return this.root.height;
    }

    get minimumWidth(): number {
        return this.root.minimumWidth;
    }

    get minimumHeight(): number {
        return this.root.minimumHeight;
    }

    get maximumWidth(): number {
        return this.root.maximumWidth;
    }

    get maximumHeight(): number {
        return this.root.maximumHeight;
    }

    get locked(): boolean {
        return this._locked;
    }

    set locked(value: boolean) {
        this._locked = value;

        const branch: Node[] = [this.root];

        /**
         * simple depth-first-search to cover all nodes
         *
         * @see https://en.wikipedia.org/wiki/Depth-first_search
         */
        while (branch.length > 0) {
            const node = branch.pop();

            if (node instanceof BranchNode) {
                node.disabled = value;
                branch.push(...node.children);
            }
        }
    }

    get margin(): number {
        return this._margin;
    }

    set margin(value: number) {
        this._margin = value;
        this.root.margin = value;
    }

    maximizedView(): IGridView | undefined {
        return this._maximizedNode?.leaf.view;
    }

    hasMaximizedView(): boolean {
        return this._maximizedNode !== undefined;
    }

    maximizeView(view: IGridView): void {
        const location = getGridLocation(view.element);
        const [_, node] = this.getNode(location);

        if (!(node instanceof LeafNode)) {
            return;
        }

        if (this._maximizedNode?.leaf === node) {
            return;
        }

        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }

        serializeBranchNode(this.getView(), this.orientation);

        const hiddenOnMaximize: LeafNode[] = [];

        function hideAllViewsBut(parent: BranchNode, exclude: LeafNode): void {
            for (let i = 0; i < parent.children.length; i++) {
                const child = parent.children[i];
                if (child instanceof LeafNode) {
                    if (child !== exclude) {
                        if (parent.isChildVisible(i)) {
                            parent.setChildVisible(i, false);
                        } else {
                            hiddenOnMaximize.push(child);
                        }
                    }
                } else {
                    hideAllViewsBut(child, exclude);
                }
            }
        }

        hideAllViewsBut(this.root, node);
        this._maximizedNode = { leaf: node, hiddenOnMaximize };
        this._onDidMaximizedNodeChange.fire({
            view: node.view,
            isMaximized: true,
        });
    }

    exitMaximizedView(): void {
        if (!this._maximizedNode) {
            return;
        }

        const hiddenOnMaximize = this._maximizedNode.hiddenOnMaximize;

        function showViewsInReverseOrder(parent: BranchNode): void {
            for (let index = parent.children.length - 1; index >= 0; index--) {
                const child = parent.children[index];
                if (child instanceof LeafNode) {
                    if (!hiddenOnMaximize.includes(child)) {
                        parent.setChildVisible(index, true);
                    }
                } else {
                    showViewsInReverseOrder(child);
                }
            }
        }

        showViewsInReverseOrder(this.root);

        const tmp = this._maximizedNode.leaf;
        this._maximizedNode = undefined;
        this._onDidMaximizedNodeChange.fire({
            view: tmp.view,
            isMaximized: false,
        });
    }

    public serialize(): SerializedGridview<any> {
        const maximizedView = this.maximizedView();

        let maxmizedViewLocation: number[] | undefined;

        if (maximizedView) {
            /**
             * The minimum information we can get away with in order to serialize a maxmized view is it's location within the grid
             * which is represented as a branch of indices
             */
            maxmizedViewLocation = getGridLocation(maximizedView.element);
        }

        /**
         * We pause the onDidMaximizedNodeChange events because this method needs to
         * call `this.exitMaximizedView()`. We don't want this to invoke any listeners
         * since we undo it before leaving this method
         */
        const pauseToken = this._onDidMaximizedNodeChange.pause();

        try {
            if (this.hasMaximizedView()) {
                /**
                 * the saved layout cannot be in its maxmized state otherwise all of the underlying
                 * view dimensions will be wrong
                 *
                 * To counteract this we temporaily remove the maximized view to compute the serialized output
                 * of the grid before adding back the maxmized view as to not alter the layout from the users
                 * perspective when `.toJSON()` is called
                 */
                this.exitMaximizedView();
            }

            const root = serializeBranchNode(this.getView(), this.orientation);

            const result: SerializedGridview<any> = {
                root,
                width: this.width,
                height: this.height,
                orientation: this.orientation,
            };

            if (maxmizedViewLocation) {
                result.maximizedNode = {
                    location: maxmizedViewLocation,
                };
            }

            if (maximizedView) {
                // replace any maximzied view that was removed for serialization purposes
                this.maximizeView(maximizedView);
            }

            return result;
        } finally {
            pauseToken.dispose();
        }
    }

    public dispose(): void {
        this.disposable.dispose();
        this._onDidChange.dispose();
        this._onDidMaximizedNodeChange.dispose();
        this._onDidViewVisibilityChange.dispose();

        this.root.dispose();
        this._maximizedNode = undefined;
        this.element.remove();
    }

    public clear(): void {
        const orientation = this.root.orientation;
        this.root = new BranchNode(
            orientation,
            this.proportionalLayout,
            this.styles,
            this.root.size,
            this.root.orthogonalSize,
            this.locked,
            this.margin
        );
    }

    public deserialize<T>(
        json: SerializedGridview<T>,
        deserializer: IViewDeserializer
    ): void {
        const orientation = json.orientation;
        const height =
            orientation === Orientation.VERTICAL ? json.height : json.width;

        this._deserialize(
            json.root as ISerializedBranchNode,
            orientation,
            deserializer,
            height
        );

        /**
         * The deserialied layout must be positioned through this.layout(...)
         * before any maximizedNode can be positioned
         */
        this.layout(json.width, json.height);

        if (json.maximizedNode) {
            const location = json.maximizedNode.location;

            const [_, node] = this.getNode(location);

            if (!(node instanceof LeafNode)) {
                return;
            }

            this.maximizeView(node.view);
        }
    }

    private _deserialize(
        root: ISerializedBranchNode,
        orientation: Orientation,
        deserializer: IViewDeserializer,
        orthogonalSize: number
    ): void {
        this.root = this._deserializeNode(
            root,
            orientation,
            deserializer,
            orthogonalSize
        ) as BranchNode;
    }

    private _deserializeNode(
        node: ISerializedNode,
        orientation: Orientation,
        deserializer: IViewDeserializer,
        orthogonalSize: number
    ): Node {
        let result: Node;
        if (node.type === 'branch') {
            const serializedChildren = node.data;
            const children = serializedChildren.map((serializedChild) => {
                return {
                    node: this._deserializeNode(
                        serializedChild,
                        orthogonal(orientation),
                        deserializer,
                        node.size
                    ),
                    visible: (serializedChild as { visible: boolean }).visible,
                } as INodeDescriptor;
            });

            result = new BranchNode(
                orientation,
                this.proportionalLayout,
                this.styles,
                node.size, // <- orthogonal size - flips at each depth
                orthogonalSize, // <- size - flips at each depth,
                this.locked,
                this.margin,
                children
            );
        } else {
            const view = deserializer.fromJSON(node);
            if (typeof node.visible === 'boolean') {
                view.setVisible?.(node.visible);
            }

            result = new LeafNode(view, orientation, orthogonalSize, node.size);
        }

        return result;
    }

    private get root(): BranchNode {
        return this._root!;
    }

    private set root(root: BranchNode) {
        const oldRoot = this._root;

        if (oldRoot) {
            oldRoot.dispose();
            this._maximizedNode = undefined;
            oldRoot.element.remove();
        }

        this._root = root;
        this.element.appendChild(this._root.element);
        this.disposable.value = this._root.onDidChange((e) => {
            this._onDidChange.fire(e);
        });
    }

    normalize(): void {
        if (!this._root) {
            return;
        }

        if (this._root.children.length !== 1) {
            return;
        }

        const oldRoot = this.root;

        // can remove one level of redundant branching if there is only a single child
        const childReference = oldRoot.children[0];

        if (childReference instanceof LeafNode) {
            return;
        }

        oldRoot.element.remove();

        const child = oldRoot.removeChild(0); // Remove child to prevent double disposal
        oldRoot.dispose(); // won't dispose the removed child
        child.dispose();

        this._root = cloneNode(
            childReference,
            childReference.size,
            childReference.orthogonalSize
        );

        this.element.appendChild(this._root.element);

        this.disposable.value = this._root.onDidChange((e) => {
            this._onDidChange.fire(e);
        });
    }

    /**
     * If the root is orientated as a VERTICAL node then nest the existing root within a new HORIZIONTAL root node
     * If the root is orientated as a HORIZONTAL node then nest the existing root within a new VERITCAL root node
     */
    public insertOrthogonalSplitviewAtRoot(): void {
        if (!this._root) {
            return;
        }

        const oldRoot = this.root;
        oldRoot.element.remove();

        this._root = new BranchNode(
            orthogonal(oldRoot.orientation),
            this.proportionalLayout,
            this.styles,
            this.root.orthogonalSize,
            this.root.size,
            this.locked,
            this.margin
        );

        if (oldRoot.children.length === 0) {
            // no data so no need to add anything back in
        } else if (oldRoot.children.length === 1) {
            // can remove one level of redundant branching if there is only a single child
            const childReference = oldRoot.children[0];
            const child = oldRoot.removeChild(0); // remove to prevent disposal when disposing of unwanted root
            child.dispose();
            oldRoot.dispose();

            this._root.addChild(
                /**
                 * the child node will have the same orientation as the new root since
                 * we are removing the inbetween node.
                 * the entire 'tree' must be flipped recursively to ensure that the orientation
                 * flips at each level
                 */
                flipNode(
                    childReference,
                    childReference.orthogonalSize,
                    childReference.size
                ),
                Sizing.Distribute,
                0
            );
        } else {
            this._root.addChild(oldRoot, Sizing.Distribute, 0);
        }

        this.element.appendChild(this._root.element);

        this.disposable.value = this._root.onDidChange((e) => {
            this._onDidChange.fire(e);
        });
    }

    public next(location: number[]): LeafNode {
        return this.progmaticSelect(location);
    }

    public previous(location: number[]): LeafNode {
        return this.progmaticSelect(location, true);
    }

    getView(): GridBranchNode<IGridView>;
    getView(location?: number[]): GridNode<IGridView>;
    getView(location?: number[]): GridNode<IGridView> {
        const node = location ? this.getNode(location)[1] : this.root;
        return this._getViews(node, this.orientation);
    }

    /** Rows and columns `view` can be dropped beside, innermost first; `exclude` is left out. */
    getBranchDropTargets(
        view: IGridView,
        position: Position,
        exclude?: IGridView
    ): BranchDropTarget<IGridView>[] {
        let tree = this.toDropTree(this.root, true);
        if (exclude && exclude !== view) {
            tree = withoutView(tree, exclude);
        }
        return branchDropTargets(tree, view, position);
    }

    private toDropTree(node: Node, visible: boolean): DropTreeNode<IGridView> {
        if (node instanceof LeafNode) {
            return {
                view: node.view,
                orientation: node.orientation,
                visible,
                children: [],
            };
        }
        return {
            orientation: node.orientation,
            visible,
            children: node.children.map((child, i) =>
                this.toDropTree(child, node.isChildVisible(i))
            ),
        };
    }

    private _getViews(
        node: Node,
        orientation: Orientation,
        cachedVisibleSize?: number
    ): GridNode<IGridView> {
        const box = { height: node.height, width: node.width };

        if (node instanceof LeafNode) {
            return { box, view: node.view, cachedVisibleSize };
        }

        const children: GridNode<IGridView>[] = [];

        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const nodeCachedVisibleSize = node.getChildCachedVisibleSize(i);

            children.push(
                this._getViews(
                    child,
                    orthogonal(orientation),
                    nodeCachedVisibleSize
                )
            );
        }

        return { box, children, cachedVisibleSize };
    }

    private progmaticSelect(location: number[], reverse = false): LeafNode {
        const [path, node] = this.getNode(location);

        if (!(node instanceof LeafNode)) {
            throw new TypeError('invalid location');
        }

        for (let i = path.length - 1; i > -1; i--) {
            const n = path[i];
            const l = location[i] || 0;
            const canProgressInCurrentLevel = reverse
                ? l - 1 > -1
                : l + 1 < n.children.length;
            if (canProgressInCurrentLevel) {
                return findLeaf(n.children[reverse ? l - 1 : l + 1], reverse);
            }
        }

        return findLeaf(this.root, reverse);
    }

    get proportionalLayout(): boolean {
        return this.root.proportionalLayout;
    }

    set proportionalLayout(value: boolean) {
        this.root.proportionalLayout = value;
    }

    constructor(
        proportionalLayout: boolean,
        readonly styles: ISplitviewStyles | undefined,
        orientation: Orientation,
        locked?: boolean,
        margin?: number
    ) {
        this.element = document.createElement('div');
        this.element.className = 'dv-grid-view';

        this._locked = locked ?? false;
        this._margin = margin ?? 0;

        this.root = new BranchNode(
            orientation,
            proportionalLayout,
            styles,
            0,
            0,
            this.locked,
            this.margin
        );
    }

    isViewVisible(location: number[]): boolean {
        const [rest, index] = tail(location);
        const [, parent] = this.getNode(rest);

        if (!(parent instanceof BranchNode)) {
            throw new TypeError('Invalid from location');
        }

        return parent.isChildVisible(index);
    }

    setViewVisible(location: number[], visible: boolean): void {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }

        const [rest, index] = tail(location);
        const [, parent] = this.getNode(rest);

        if (!(parent instanceof BranchNode)) {
            throw new TypeError('Invalid from location');
        }

        this._onDidViewVisibilityChange.fire();

        parent.setChildVisible(index, visible);
    }

    /** Hide the view at `location`; returns a function that undoes it. */
    collapseView(location: number[]): () => void {
        const [ancestors] = this.getNode(location);

        let depth = ancestors.length - 1;
        while (depth > 0) {
            const branch = ancestors[depth];
            const onPath = location[depth];
            const hasVisibleSibling = branch.children.some(
                (_, i) => i !== onPath && branch.isChildVisible(i)
            );
            if (hasVisibleSibling) {
                break;
            }
            depth--;
        }

        const container = ancestors[depth];
        const collapsed = location[depth];
        const before = container.children.map((_, i) =>
            container.getChildSize(i)
        );

        this.setViewVisible(location, false);

        const freed = before[collapsed];
        let remaining = 0;
        for (let i = 0; i < before.length; i++) {
            if (i !== collapsed && container.isChildVisible(i)) {
                remaining += before[i];
            }
        }
        if (remaining > 0) {
            container.setChildSizes(
                before.map((size, i) =>
                    i === collapsed ? 0 : size + (freed * size) / remaining
                )
            );
        }

        return () => {
            this.setViewVisible(location, true);
            if (container.children.length === before.length) {
                container.setChildSizes(before);
            }
        };
    }

    /** Put `view` where `existing` is, at its size. */
    replaceView(existing: IGridView, view: IGridView): void {
        const [rest, index] = tail(getGridLocation(existing.element));
        const [, parent] = this.getNode(rest);

        if (!(parent instanceof BranchNode)) {
            throw new TypeError('Invalid location');
        }

        const node = parent.children[index];
        if (!(node instanceof LeafNode)) {
            throw new TypeError('Invalid location');
        }

        parent.replaceChild(
            index,
            new LeafNode(view, node.orientation, node.orthogonalSize)
        );
        node.dispose();
    }

    /**
     * Add `view` until the returned function removes it. With `share`, it takes an
     * equal share of its branch, counted as if the hidden `exclude` were removed.
     */
    addTransientView(
        view: IGridView,
        size: number | Sizing,
        location: number[],
        options?: { share?: boolean; exclude?: IGridView }
    ): () => void {
        const [rest, index] = tail(location);
        const [, parent] = this.getNode(rest);
        const sizesOf = (node: Node) =>
            node instanceof BranchNode
                ? node.children.map((_, i) => node.getChildSize(i))
                : undefined;
        const restore: [BranchNode, number[]][] = [];
        const keep = (node: Node) => {
            const sizes = sizesOf(node);
            if (node instanceof BranchNode && sizes) {
                restore.push([node, sizes]);
            }
        };

        const merge = options?.share
            ? this.collapsingBranch(options.exclude, parent)
            : undefined;

        if (merge) {
            keep(merge.grandParent);
            keep(merge.sibling);
            this.addSharedAcrossCollapse(view, location, index, merge);
        } else if (options?.share && parent instanceof BranchNode) {
            keep(parent);
            const before = sizesOf(parent) ?? [];
            const visible = before.filter((_, i) => parent.isChildVisible(i));
            const total = visible.reduce((sum, value) => sum + value, 0);
            const share = total / (visible.length + 1);
            const scale = visible.length / (visible.length + 1);

            this.addView(view, share, location);

            const sizes = before.map((value) => value * scale);
            sizes.splice(index, 0, share);
            parent.setChildSizes(sizes);
        } else {
            keep(parent);
            this.addView(view, size, location);
        }

        return () => {
            this.remove(view);
            for (const [node, sizes] of restore) {
                if (node.children.length === sizes.length) {
                    node.setChildSizes(sizes);
                }
            }
        };
    }

    /**
     * The branch `exclude` shares with a single sibling, which collapses into the
     * grandparent once `exclude` is removed; returned only when `insertInto` (the
     * grandparent, the sibling branch or the sibling leaf) is affected.
     */
    private collapsingBranch(
        exclude: IGridView | undefined,
        insertInto: Node
    ):
        | {
              grandParent: BranchNode;
              branch: BranchNode;
              sibling: Node;
          }
        | undefined {
        if (!exclude || !this.element.contains(exclude.element)) {
            return undefined;
        }
        const [branchLocation, index] = tail(getGridLocation(exclude.element));
        const [path, branch] = this.getNode(branchLocation);
        if (
            !(branch instanceof BranchNode) ||
            branch.children.length !== 2 ||
            branch.isChildVisible(index) ||
            path.length === 0
        ) {
            return undefined;
        }
        const grandParent = path[path.length - 1];
        const sibling = branch.children[1 - index];
        const affected =
            insertInto === sibling ||
            (insertInto === grandParent && sibling instanceof BranchNode);
        return affected ? { grandParent, branch, sibling } : undefined;
    }

    /** Add `view` with an equal share of the grandparent once `branch` collapses into it. */
    private addSharedAcrossCollapse(
        view: IGridView,
        location: number[],
        index: number,
        merge: { grandParent: BranchNode; branch: BranchNode; sibling: Node }
    ): void {
        const { grandParent, branch, sibling } = merge;
        const branchIndex = grandParent.children.indexOf(branch);
        const into =
            sibling instanceof LeafNode
                ? 'wrap'
                : this.getNode(tail(location)[0])[1] === sibling
                  ? 'sibling'
                  : 'grandParent';

        const outer = grandParent.children.map((_, i) =>
            grandParent.isChildVisible(i) ? grandParent.getChildSize(i) : 0
        );
        const inner =
            sibling instanceof BranchNode
                ? sibling.children.map((_, i) =>
                      sibling.isChildVisible(i) ? sibling.getChildSize(i) : 0
                  )
                : [outer[branchIndex]];
        const members =
            outer.filter((v, i) => i !== branchIndex && v > 0).length +
            inner.filter((v) => v > 0).length;
        const total =
            outer.reduce((a, b) => a + b, 0) -
            outer[branchIndex] +
            inner.reduce((a, b) => a + b, 0);
        const share = total / (members + 1);
        const scale = members / (members + 1);

        this.addView(view, into === 'wrap' ? Sizing.Split(0) : share, location);

        const scaledInner = inner.map((v) => v * scale);
        if (into === 'sibling') {
            scaledInner.splice(index, 0, share);
        }
        const branchSize =
            scaledInner.reduce((a, b) => a + b, 0) +
            (into === 'wrap' ? share : 0);

        const outerSizes = outer.map((v, i) =>
            i === branchIndex ? branchSize : v * scale
        );
        if (into === 'grandParent') {
            outerSizes.splice(index, 0, share);
        }
        grandParent.setChildSizes(outerSizes);

        if (into === 'wrap') {
            const wrapped = branch.children.find(
                (child) => child instanceof BranchNode
            );
            if (wrapped instanceof BranchNode) {
                const sizes = [scaledInner[0]];
                sizes.splice(index, 0, share);
                wrapped.setChildSizes(sizes);
            }
        } else if (sibling instanceof BranchNode) {
            sibling.setChildSizes(scaledInner);
        }
    }

    public moveView(parentLocation: number[], from: number, to: number): void {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }

        const [, parent] = this.getNode(parentLocation);

        if (!(parent instanceof BranchNode)) {
            throw new TypeError('Invalid location');
        }

        parent.moveChild(from, to);
    }

    public addView(
        view: IGridView,
        size: number | Sizing,
        location: number[]
    ): void {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }

        const [rest, index] = tail(location);

        const [pathToParent, parent] = this.getNode(rest);

        if (parent instanceof BranchNode) {
            const node = new LeafNode(
                view,
                orthogonal(parent.orientation),
                parent.orthogonalSize
            );
            parent.addChild(node, size, index);
        } else {
            const [grandParent, ..._] = [...pathToParent].reverse();
            const [parentIndex, ...__] = [...rest].reverse();

            let newSiblingSize: number | Sizing = 0;

            const newSiblingCachedVisibleSize =
                grandParent.getChildCachedVisibleSize(parentIndex);
            if (typeof newSiblingCachedVisibleSize === 'number') {
                newSiblingSize = Sizing.Invisible(newSiblingCachedVisibleSize);
            }

            // BranchNode.removeChild(index) is a domain method, not the DOM
            // Node.removeChild.
            const child = grandParent.removeChild(parentIndex);
            child.dispose();

            const newParent = new BranchNode(
                parent.orientation,
                this.proportionalLayout,
                this.styles,
                parent.size,
                parent.orthogonalSize,
                this.locked,
                this.margin
            );
            grandParent.addChild(newParent, parent.size, parentIndex);

            const newSibling = new LeafNode(
                parent.view,
                grandParent.orientation,
                parent.size
            );
            newParent.addChild(newSibling, newSiblingSize, 0);

            if (typeof size !== 'number' && size.type === 'split') {
                size = { type: 'split', index: 0 };
            }

            const node = new LeafNode(
                view,
                grandParent.orientation,
                parent.size
            );
            newParent.addChild(node, size, index);
        }
    }

    public remove(
        view: IGridView,
        sizing?: Sizing,
        options?: { exactSizes?: boolean }
    ): IGridView {
        const location = getGridLocation(view.element);
        return this.removeView(location, sizing, options);
    }

    /** `exactSizes` restores the sizes around a collapsed branch in one pass, so the neighbours are not nudged. */
    removeView(
        location: number[],
        sizing?: Sizing,
        options?: { exactSizes?: boolean }
    ): IGridView {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }

        const [rest, index] = tail(location);
        const [pathToParent, parent] = this.getNode(rest);

        if (!(parent instanceof BranchNode)) {
            throw new TypeError('Invalid location');
        }

        const nodeToRemove = parent.children[index];

        if (!(nodeToRemove instanceof LeafNode)) {
            throw new TypeError('Invalid location');
        }

        parent.removeChild(index, sizing);
        nodeToRemove.dispose();

        if (parent.children.length !== 1) {
            return nodeToRemove.view;
        }

        // if the parent has only one child and we know the parent is a BranchNode we can make the tree
        // more efficiently spaced by replacing the parent BranchNode with the child.
        // if that child is a LeafNode then we simply replace the BranchNode with the child otherwise if the child
        // is a BranchNode too we should spread it's children into the grandparent.

        // refer to the remaining child as the sibling
        const sibling = parent.children[0];

        if (pathToParent.length === 0) {
            // if the parent is root

            if (sibling instanceof LeafNode) {
                // if the sibling is a leaf node no action is required
                return nodeToRemove.view;
            }

            // otherwise the sibling is a branch node. since the parent is the root and the root has only one child
            // which is a branch node we can just set this branch node to be the new root node

            // for good housekeeping we'll removing the sibling from it's existing tree
            parent.removeChild(0, sizing);

            // and set that sibling node to be root
            this.root = sibling;

            return nodeToRemove.view;
        }

        // otherwise the parent is apart of a large sub-tree

        const [grandParent, ..._] = [...pathToParent].reverse();
        const [parentIndex, ...__] = [...rest].reverse();

        const isSiblingVisible = parent.isChildVisible(0);

        // either way we need to remove the sibling from it's existing tree
        parent.removeChild(0, sizing);

        // note the sizes of all of the grandparents children
        const sizes = grandParent.children.map((_size, i) =>
            grandParent.getChildSize(i)
        );

        // remove the parent from the grandparent since we are moving the sibling to take the parents place
        // this parent is no longer used and can be disposed of
        grandParent.removeChild(parentIndex, sizing).dispose();

        if (sibling instanceof BranchNode) {
            // A child's extent along the sibling's axis (which is also the
            // grandparent's axis) is `size` for a leaf but `orthogonalSize`
            // for a branch, whose `size` is its own-axis extent.
            const childSizes = sibling.children.map((c, i) => {
                if (options?.exactSizes) {
                    return sibling.getChildSize(i);
                }
                return c instanceof BranchNode ? c.orthogonalSize : c.size;
            });

            // replace the parent with the siblings children
            sizes.splice(parentIndex, 1, ...childSizes);

            // and add those siblings to the grandparent. If the sibling branch
            // itself was hidden its children must stay hidden too, otherwise
            // they come back visible once the branch is flattened away.
            for (let i = 0; i < sibling.children.length; i++) {
                const child = sibling.children[i];
                const childSize = childSizing(sibling, i, childSizes[i]);
                grandParent.addChild(
                    child,
                    !isSiblingVisible && typeof childSize === 'number'
                        ? Sizing.Invisible(childSize)
                        : childSize,
                    parentIndex + i
                );
            }

            /**
             * clean down the branch node since we need to dipose of it and
             * when .dispose() it called on a branch it will dispose of any
             * views it is holding onto.
             */
            while (sibling.children.length > 0) {
                sibling.removeChild(0);
            }
        } else {
            // otherwise create a new leaf node and add that to the grandparent

            const newSibling = new LeafNode(
                sibling.view,
                orthogonal(sibling.orientation),
                sibling.size
            );
            const siblingSizing = isSiblingVisible
                ? sibling.orthogonalSize
                : Sizing.Invisible(sibling.orthogonalSize);

            grandParent.addChild(newSibling, siblingSizing, parentIndex);
        }

        // the containing node of the sibling is no longer required and can be disposed of
        sibling.dispose();

        // resize everything
        if (options?.exactSizes) {
            grandParent.setChildSizes(sizes);
        } else {
            for (let i = 0; i < sizes.length; i++) {
                grandParent.resizeChild(i, sizes[i]);
            }
        }

        return nodeToRemove.view;
    }

    public layout(width: number, height: number): void {
        const [size, orthogonalSize] =
            this.root.orientation === Orientation.HORIZONTAL
                ? [height, width]
                : [width, height];
        this.root.layout(size, orthogonalSize);
    }

    private getNode(
        location: number[],
        node: Node = this.root,
        path: BranchNode[] = []
    ): [BranchNode[], Node] {
        if (location.length === 0) {
            return [path, node];
        }

        if (!(node instanceof BranchNode)) {
            throw new TypeError('Invalid location');
        }

        const [index, ...rest] = location;

        if (index < 0 || index >= node.children.length) {
            throw new Error('Invalid location');
        }

        const child = node.children[index];
        path.push(node);

        return this.getNode(rest, child, path);
    }
}
