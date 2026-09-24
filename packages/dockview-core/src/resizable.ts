import { isInDocument, watchElementResize } from './dom';
import { CompositeDisposable } from './lifecycle';

export abstract class Resizable extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private _disableResizing: boolean;
    private _lastWidth = -1;
    private _lastHeight = -1;

    get element(): HTMLElement {
        return this._element;
    }

    get disableResizing(): boolean {
        return this._disableResizing;
    }

    set disableResizing(value: boolean) {
        this._disableResizing = value;
    }

    constructor(parentElement: HTMLElement, disableResizing = false) {
        super();

        this._disableResizing = disableResizing;

        this._element = parentElement;

        this.addDisposables(
            watchElementResize(this._element, (entry) => {
                if (this.isDisposed) {
                    /**
                     * resize is delayed through requestAnimationFrame so there is a small chance
                     * the component has already been disposed of
                     */
                    return;
                }

                if (this.disableResizing) {
                    return;
                }

                if (!this._element.offsetParent) {
                    /**
                     * offsetParent === null is equivalent to display: none being set on the element or one
                     * of it's parents. In the display: none case the size will become (0, 0) which we do
                     * not want to propagate.
                     *
                     * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetParent
                     *
                     * You could use checkVisibility() but at the time of writing it's not supported across
                     * all Browsers
                     *
                     * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/checkVisibility
                     */
                    return;
                }

                if (!isInDocument(this._element)) {
                    /**
                     * since the event is dispatched through requestAnimationFrame there is a small chance
                     * the component is no longer attached to the DOM, if that is the case the dimensions
                     * are mostly likely all zero and meaningless. we should skip this case.
                     */
                    return;
                }

                // Round to integers to absorb sub-pixel jitter from
                // fractional devicePixelRatio (e.g. multi-monitor setups),
                // which would otherwise re-fire layout in a feedback loop.
                const width = Math.round(entry.contentRect.width);
                const height = Math.round(entry.contentRect.height);
                if (width === this._lastWidth && height === this._lastHeight) {
                    return;
                }
                this._lastWidth = width;
                this._lastHeight = height;
                this.layout(width, height);
            })
        );
    }

    /**
     * Lay out from the element's current size.
     *
     * The ResizeObserver above only reports asynchronously, so between
     * construction and its first callback the component believes it has no
     * size - and anything built in that window (panels added right after
     * `createDockview`, say) resolves its sizes against zero and collapses to
     * minimums. Concrete components call this once they are fully constructed
     * so that work sees the real size. The same guards as the observer apply:
     * a detached or hidden element has no size worth propagating.
     */
    protected layoutFromElement(): void {
        if (this.disableResizing || !this._element.offsetParent) {
            return;
        }

        if (!isInDocument(this._element)) {
            return;
        }

        const width = Math.round(this._element.clientWidth);
        const height = Math.round(this._element.clientHeight);

        if (width === 0 || height === 0) {
            return;
        }

        this.layout(width, height);
    }

    abstract layout(width: number, height: number): void;
}
