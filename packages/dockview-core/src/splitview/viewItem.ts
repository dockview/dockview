import { IDisposable } from '../lifecycle';
import { clamp } from '../math';
import { IView, LayoutPriority } from './splitview';

export class ViewItem {
    private _size: number;
    private _cachedVisibleSize: number | undefined = undefined;

    /**
     * The geometry styles last written to `container` by `layoutViews`. Sizes
     * are re-applied on every layout/resize frame, but for the many views that
     * didn't move on a given frame the value is identical to last time; writing
     * an unchanged inline style still dirties the element for style recalc, so
     * we diff against these and skip the no-op writes. `layoutViews` is the only
     * writer of these four properties (verified), so the cache cannot drift.
     */
    private readonly _appliedStyles: {
        width?: string;
        height?: string;
        top?: string;
        left?: string;
    } = {};

    set size(size: number) {
        this._size = size;
    }

    setContainerGeometry(
        prop: 'width' | 'height' | 'top' | 'left',
        value: string
    ): void {
        if (this._appliedStyles[prop] === value) {
            return;
        }
        this._appliedStyles[prop] = value;
        this.container.style[prop] = value;
    }

    get size(): number {
        return this._size;
    }

    get cachedVisibleSize(): number | undefined {
        return this._cachedVisibleSize;
    }

    get visible(): boolean {
        return this._cachedVisibleSize === undefined;
    }

    get minimumSize(): number {
        return this.visible ? this.view.minimumSize : 0;
    }
    get viewMinimumSize(): number {
        return this.view.minimumSize;
    }

    get maximumSize(): number {
        return this.visible ? this.view.maximumSize : 0;
    }
    get viewMaximumSize(): number {
        return this.view.maximumSize;
    }

    get priority(): LayoutPriority | undefined {
        return this.view.priority;
    }
    get snap(): boolean {
        return !!this.view.snap;
    }

    set enabled(enabled: boolean) {
        this.container.style.pointerEvents = enabled ? '' : 'none';
    }

    constructor(
        public container: HTMLElement,
        public view: IView,
        size: number | { cachedVisibleSize: number },
        private readonly disposable: IDisposable
    ) {
        if (typeof size === 'number') {
            this._size = size;
            this._cachedVisibleSize = undefined;
            container.classList.add('visible');
        } else {
            this._size = 0;
            this._cachedVisibleSize = size.cachedVisibleSize;
        }
    }

    setVisible(visible: boolean, size?: number): void {
        if (visible === this.visible) {
            return;
        }

        if (visible) {
            // visible first, so constraints that depend on it see the new state
            const cachedVisibleSize = this._cachedVisibleSize ?? 0;
            this._cachedVisibleSize = undefined;
            this.size = clamp(
                cachedVisibleSize,
                this.viewMinimumSize,
                this.viewMaximumSize
            );
        } else {
            this._cachedVisibleSize =
                typeof size === 'number' ? size : this.size;
            this.size = 0;
        }

        this.container.classList.toggle('visible', visible);

        if (this.view.setVisible) {
            this.view.setVisible(visible);
        }
    }

    /**
     * Rescales the size, or the cached size while hidden, by `factor`.
     */
    scale(factor: number): void {
        if (this._cachedVisibleSize !== undefined) {
            this._cachedVisibleSize = Math.round(
                this._cachedVisibleSize * factor
            );
            return;
        }

        this.size = clamp(
            Math.round(this.size * factor),
            this.minimumSize,
            this.maximumSize
        );
    }

    dispose(): IView {
        this.disposable.dispose();
        return this.view;
    }
}
