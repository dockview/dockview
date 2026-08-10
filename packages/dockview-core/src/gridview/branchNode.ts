/*---------------------------------------------------------------------------------------------
 * Accreditation: This file is largly based upon the MIT licenced VSCode sourcecode found at:
 * https://github.com/microsoft/vscode/tree/main/src/vs/base/browser/ui/grid
 *--------------------------------------------------------------------------------------------*/

import {
    IView,
    Splitview,
    Orientation,
    Sizing,
    LayoutPriority,
    ISplitviewStyles,
} from '../splitview/splitview';
import { Emitter, Event } from '../events';
import { INodeDescriptor } from './gridview';
import { Node } from './types';
import { CompositeDisposable, IDisposable, Disposable } from '../lifecycle';

export class BranchNode extends CompositeDisposable implements IView {
    readonly element: HTMLElement;
    private readonly splitview: Splitview;
    private _orthogonalSize: number;
    private _size: number;
    private _childrenDisposable: IDisposable = Disposable.NONE;

    public readonly children: Node[] = [];

    /**
     * `minimumSize`/`maximumSize`/`priority` are aggregates over all children,
     * read repeatedly per frame inside `Splitview.resize` / `layoutViews`.
     * Because a grid is splitviews-of-splitviews, recomputing them on every
     * getter access (with array allocations) would make a sash drag O(children²)
     * with per-read allocation. These values only change on a structural
     * mutation, a visibility toggle, or a child's own constraints changing (which
     * surfaces as the child's `onDidChange`) — none of which fire during a plain
     * sash drag — so we cache them and invalidate on exactly those signals.
     * `undefined` means "dirty; recompute on read".
     */
    private _cachedMinimumSize: number | undefined;
    private _cachedMaximumSize: number | undefined;
    private _cachedPriority: LayoutPriority | undefined;

    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;

    private readonly _onDidVisibilityChange = new Emitter<{
        visible: boolean;
    }>();
    readonly onDidVisibilityChange: Event<{
        visible: boolean;
    }> = this._onDidVisibilityChange.event;

    get width(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.size
            : this.orthogonalSize;
    }

    get height(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.orthogonalSize
            : this.size;
    }

    get minimumSize(): number {
        if (this._cachedMinimumSize === undefined) {
            let value = 0;
            for (let index = 0; index < this.children.length; index++) {
                if (this.splitview.isViewVisible(index)) {
                    value = Math.max(
                        value,
                        this.children[index].minimumOrthogonalSize
                    );
                }
            }
            this._cachedMinimumSize = value;
        }
        return this._cachedMinimumSize;
    }

    get maximumSize(): number {
        if (this._cachedMaximumSize === undefined) {
            let value = Number.POSITIVE_INFINITY;
            for (let index = 0; index < this.children.length; index++) {
                if (this.splitview.isViewVisible(index)) {
                    value = Math.min(
                        value,
                        this.children[index].maximumOrthogonalSize
                    );
                }
            }
            this._cachedMaximumSize = value;
        }
        return this._cachedMaximumSize;
    }

    get minimumOrthogonalSize(): number {
        return this.splitview.minimumSize;
    }

    get maximumOrthogonalSize(): number {
        return this.splitview.maximumSize;
    }

    get orthogonalSize(): number {
        return this._orthogonalSize;
    }

    get size(): number {
        return this._size;
    }

    get minimumWidth(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.minimumOrthogonalSize
            : this.minimumSize;
    }

    get minimumHeight(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.minimumSize
            : this.minimumOrthogonalSize;
    }

    get maximumWidth(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.maximumOrthogonalSize
            : this.maximumSize;
    }

    get maximumHeight(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.maximumSize
            : this.maximumOrthogonalSize;
    }

    get priority(): LayoutPriority {
        this._cachedPriority ??= this.computePriority();
        return this._cachedPriority;
    }

    private computePriority(): LayoutPriority {
        if (this.children.length === 0) {
            return LayoutPriority.Normal;
        }

        let hasHigh = false;
        let hasLow = false;
        for (const child of this.children) {
            const priority = child.priority ?? LayoutPriority.Normal;
            if (priority === LayoutPriority.High) {
                hasHigh = true;
            } else if (priority === LayoutPriority.Low) {
                hasLow = true;
            }
        }

        if (hasHigh) {
            return LayoutPriority.High;
        } else if (hasLow) {
            return LayoutPriority.Low;
        }

        return LayoutPriority.Normal;
    }

    private invalidateCachedSizes(): void {
        this._cachedMinimumSize = undefined;
        this._cachedMaximumSize = undefined;
        this._cachedPriority = undefined;
    }

    get disabled(): boolean {
        return this.splitview.disabled;
    }

    set disabled(value: boolean) {
        this.splitview.disabled = value;
    }

    get margin(): number {
        return this.splitview.margin;
    }

    set margin(value: number) {
        this.splitview.margin = value;

        this.children.forEach((child) => {
            if (child instanceof BranchNode) {
                child.margin = value;
            }
        });
    }

    constructor(
        readonly orientation: Orientation,
        readonly proportionalLayout: boolean,
        readonly styles: ISplitviewStyles | undefined,
        size: number,
        orthogonalSize: number,
        disabled: boolean,
        margin: number | undefined,
        childDescriptors?: INodeDescriptor[]
    ) {
        super();
        this._orthogonalSize = orthogonalSize;
        this._size = size;

        this.element = document.createElement('div');
        this.element.className = 'dv-branch-node';

        if (childDescriptors) {
            const descriptor = {
                views: childDescriptors.map((childDescriptor) => {
                    return {
                        view: childDescriptor.node,
                        size: childDescriptor.node.size,
                        // Honour an explicit `visible` flag for branch children
                        // too (not just leaves), so a hidden sub-grid restores
                        // hidden with its cached size rather than visible at 0.
                        visible: childDescriptor.visible ?? true,
                    };
                }),
                size: this.orthogonalSize,
            };

            this.children = childDescriptors.map((c) => c.node);
            this.splitview = new Splitview(this.element, {
                orientation: this.orientation,
                descriptor,
                proportionalLayout,
                styles,
                margin,
            });
        } else {
            this.splitview = new Splitview(this.element, {
                orientation: this.orientation,
                proportionalLayout,
                styles,
                margin,
            });
            this.splitview.layout(this.size, this.orthogonalSize);
        }

        this.disabled = disabled;

        this.addDisposables(
            this._onDidChange,
            this._onDidVisibilityChange,
            this.splitview.onDidSashEnd(() => {
                this._onDidChange.fire({});
            })
        );

        this.setupChildrenEvents();
    }

    setVisible(_visible: boolean): void {
        // noop
    }

    isChildVisible(index: number): boolean {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        return this.splitview.isViewVisible(index);
    }

    setChildVisible(index: number, visible: boolean): void {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        if (this.splitview.isViewVisible(index) === visible) {
            return;
        }

        const wereAllChildrenHidden = this.splitview.contentSize === 0;

        this.splitview.setViewVisible(index, visible);
        // a child's visibility changed, so our aggregate min/max are stale
        this.invalidateCachedSizes();
        const areAllChildrenHidden = this.splitview.contentSize === 0;

        // If all children are hidden then the parent should hide the entire splitview
        // If the entire splitview is hidden then the parent should show the splitview when a child is shown
        if (
            (visible && wereAllChildrenHidden) ||
            (!visible && areAllChildrenHidden)
        ) {
            this._onDidVisibilityChange.fire({ visible });
        }
    }

    moveChild(from: number, to: number): void {
        if (from === to) {
            return;
        }

        if (from < 0 || from >= this.children.length) {
            throw new Error('Invalid from index');
        }

        if (from < to) {
            to--;
        }

        this.splitview.moveView(from, to);

        const child = this._removeChild(from);
        this._addChild(child, to);
    }

    getChildSize(index: number): number {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        return this.splitview.getViewSize(index);
    }

    resizeChild(index: number, size: number): void {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        this.splitview.resizeView(index, size);
    }

    public layout(size: number, orthogonalSize: number) {
        this._size = orthogonalSize;
        this._orthogonalSize = size;

        this.splitview.layout(orthogonalSize, size);
    }

    public addChild(
        node: Node,
        size: number | Sizing,
        index: number,
        skipLayout?: boolean
    ): void {
        if (index < 0 || index > this.children.length) {
            throw new Error('Invalid index');
        }

        this.splitview.addView(node, size, index, skipLayout);
        this._addChild(node, index);
    }

    getChildCachedVisibleSize(index: number): number | undefined {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        return this.splitview.getViewCachedVisibleSize(index);
    }

    public removeChild(index: number, sizing?: Sizing): Node {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        this.splitview.removeView(index, sizing);
        return this._removeChild(index);
    }

    private _addChild(node: Node, index: number): void {
        this.children.splice(index, 0, node);
        this.setupChildrenEvents();
    }

    private _removeChild(index: number): Node {
        const [child] = this.children.splice(index, 1);
        this.setupChildrenEvents();

        return child;
    }

    private setupChildrenEvents(): void {
        // the children set has just changed (add/remove/move), so any cached
        // aggregate min/max/priority is stale
        this.invalidateCachedSizes();

        this._childrenDisposable.dispose();

        this._childrenDisposable = new CompositeDisposable(
            Event.any(...this.children.map((c) => c.onDidChange))((e) => {
                /**
                 * indicate a change has occured to allows any re-rendering but don't bubble
                 * event because that was specific to this branch
                 */
                // a child's size or constraints changed; our cached aggregate
                // min/max/priority may no longer be valid
                this.invalidateCachedSizes();
                this._onDidChange.fire({ size: e.orthogonalSize });
            }),
            ...this.children.map((c, i) => {
                if (c instanceof BranchNode) {
                    return c.onDidVisibilityChange(({ visible }) => {
                        this.setChildVisible(i, visible);
                    });
                }
                return Disposable.NONE;
            })
        );
    }

    public dispose(): void {
        this._childrenDisposable.dispose();
        this.splitview.dispose();
        this.children.forEach((child) => child.dispose());

        super.dispose();
    }
}
