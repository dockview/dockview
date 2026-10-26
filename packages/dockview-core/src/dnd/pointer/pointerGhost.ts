import { getOverlayParent, isShadowRoot } from '../../dom';
import { IDisposable } from '../../lifecycle';

export interface PointerGhostOptions {
    element: HTMLElement;
    initialX: number;
    initialY: number;
    /** Pointer position within the ghost; default top-left. */
    offsetX?: number;
    offsetY?: number;
    /** Default 0.8. */
    opacity?: number;
    /**
     * Source element whose document body (or shadow root, when it lives in
     * one) hosts the ghost. Pass it for popout-window drags so the ghost
     * renders in the popout's document.
     */
    owner?: Element;
}

/**
 * Floating clone that follows the pointer; appended to the owning
 * document's body with `pointer-events: none` so it doesn't intercept
 * hit-testing.
 */
export class PointerGhost implements IDisposable {
    private readonly element: HTMLElement;
    /** What is positioned and attached: `element`, or a top-layer wrapper
     *  around it when the ghost lives in a shadow root. */
    private readonly container: HTMLElement;
    private readonly offsetX: number;
    private readonly offsetY: number;
    private _disposed = false;

    constructor(opts: PointerGhostOptions) {
        this.element = opts.element;
        this.offsetX = opts.offsetX ?? 0;
        this.offsetY = opts.offsetY ?? 0;

        const parent = opts.owner
            ? getOverlayParent(opts.owner)
            : document.body;

        // Inside a shadow root the ghost is laid out under the shadow host, so
        // a transformed (or filtered, contained, ...) ancestor of the host
        // would become its containing block, offsetting and clipping it. The
        // top layer escapes that while keeping the shadow root's styles; the
        // wrapper takes the popover UA styles so the ghost's own are untouched.
        let popover: HTMLElement | undefined;
        if (
            isShadowRoot(parent) &&
            typeof this.element.showPopover === 'function'
        ) {
            popover = this.element.ownerDocument.createElement('div');
            popover.popover = 'manual';
            Object.assign(popover.style, {
                inset: 'auto',
                margin: '0',
                padding: '0',
                border: '0',
                background: 'transparent',
                color: 'inherit',
                overflow: 'visible',
            });
            popover.appendChild(this.element);
            // The ghost is a clone with *every* computed property copied
            // inline (see `Tab._buildGhostElement`), so its own declarations
            // beat the wrapper's: `pointer-events: auto` wins over the
            // wrapper's inherited `none` and makes the ghost hit-testable,
            // and a copied `transform` (a FLIP translation still running when
            // the drag starts) composes with the wrapper's `translate3d` and
            // offsets it from the pointer. The wrapper owns both.
            this.element.style.pointerEvents = 'none';
            this.element.style.transform = 'none';
        }
        this.container = popover ?? this.element;

        // Animate via transform (see update); position:fixed for scroll-independence.
        const style = this.container.style;
        style.position = 'fixed';
        style.left = '0px';
        style.top = '0px';
        style.pointerEvents = 'none';
        style.zIndex = '99999';
        style.opacity = String(opts.opacity ?? 0.8);
        style.willChange = 'transform';
        style.transform = `translate3d(${
            opts.initialX - this.offsetX
        }px, ${opts.initialY - this.offsetY}px, 0)`;

        parent.appendChild(this.container);
        popover?.showPopover();
    }

    update(clientX: number, clientY: number): void {
        if (this._disposed) {
            return;
        }
        // translate3d composites on the GPU, so there's no layout on each pointermove.
        this.container.style.transform = `translate3d(${
            clientX - this.offsetX
        }px, ${clientY - this.offsetY}px, 0)`;
    }

    dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        this.element.remove();
        if (this.container !== this.element) {
            this.container.remove();
        }
    }
}
