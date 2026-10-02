import { shiftAbsoluteElementIntoView } from '../../dom';
import { createDismissableLayer } from '../../dismissableLayer';
import {
    CompositeDisposable,
    Disposable,
    IDisposable,
    MutableDisposable,
} from '../../lifecycle';

export class PopupService extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private _active: HTMLElement | null = null;
    private readonly _activeDisposable = new MutableDisposable();
    private _root: HTMLElement;
    // The window the popover lives in. Different from `window` for popout
    // groups: their popovers must register pointerdown/keydown/resize on the
    // popout window (not the main one) and create elements with the popout's
    // document so they render and dismiss correctly.
    private readonly _window: Window;

    constructor(root: HTMLElement, win: Window = globalThis.window) {
        super();

        this._root = root;
        this._window = win;
        this._element = win.document.createElement('div');
        this._element.className = 'dv-popover-anchor';
        this._element.style.position = 'relative';

        this._root.prepend(this._element);

        this.addDisposables(
            Disposable.from(() => {
                this.close();
            }),
            this._activeDisposable
        );
    }

    /**
     * Move the popup anchor into a new root element. Call this when a shell
     * wraps the dockview component so that edge-group overflow dropdowns
     * position correctly relative to the full layout area.
     */
    updateRoot(newRoot: HTMLElement): void {
        newRoot.prepend(this._element);
        this._root = newRoot;
    }

    /**
     * @param owned disposed when this popover closes or is replaced
     */
    openPopover(
        element: HTMLElement,
        position: { x: number; y: number; zIndex?: string },
        owned?: IDisposable
    ): void {
        this.close();

        const wrapper = this._window.document.createElement('div');
        wrapper.style.position = 'absolute';
        wrapper.style.zIndex = position.zIndex ?? 'var(--dv-overlay-z-index)';
        wrapper.appendChild(element);

        const anchorBox = this._element.getBoundingClientRect();
        const offsetX = anchorBox.left;
        const offsetY = anchorBox.top;

        wrapper.style.top = `${position.y - offsetY}px`;
        wrapper.style.left = `${position.x - offsetX}px`;

        this._element.appendChild(wrapper);

        this._active = wrapper;

        // Outside-pointerdown dismissal is suppressed for a short grace window:
        // touch long-press callers (chip / tab context menus) open the popover
        // while the user's finger is still pressing the source. Android Chrome
        // can dispatch a follow-up pointerdown tied to the gesture that lands
        // just outside the wrapper and would dismiss it before it's seen. Enter
        // dismisses as well (commit-and-close); resize dismisses except on
        // touch-primary input, where a resize is usually the on-screen keyboard
        // (e.g. focusing a rename input) rather than intent to dismiss.
        const POINTERDOWN_GRACE_MS = 200;

        this._activeDisposable.value = new CompositeDisposable(
            createDismissableLayer({
                window: this._window,
                onDismiss: () => this.close(),
                elements: () => (this._active ? [this._active] : []),
                keys: ['Enter'],
                pointerDownGraceMs: POINTERDOWN_GRACE_MS,
                resize: true,
            }),
            owned ?? Disposable.NONE
        );

        this._window.requestAnimationFrame(() => {
            shiftAbsoluteElementIntoView(wrapper, this._root);
        });
    }

    close(): void {
        if (this._active) {
            this._active.remove();
            this._activeDisposable.dispose();
            this._active = null;
        }
    }
}
