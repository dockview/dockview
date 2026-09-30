import { CompositeDisposable, Disposable } from '../lifecycle';
import { DropTargetTargetModel } from './droptarget';

export class DropTargetAnchorContainer extends CompositeDisposable {
    private _model:
        | { root: HTMLElement; overlay: HTMLElement; changed: boolean }
        | undefined;

    private _outline: HTMLElement | undefined;

    private _disabled = false;

    /**
     * Handle for a deferred {@link DropTargetTargetModel.scheduleClear}. The
     * HTML5 backend does not clear this container on `dragleave` (that would
     * churn the shared overlay and kill its slide transition on every crossing
     * between adjacent targets). Instead it *schedules* a clear, which a
     * subsequent `getElements` (the next target rendering into this container)
     * cancels — so the overlay slides between targets, but is torn down when the
     * drag genuinely leaves to somewhere that doesn't re-render here.
     */
    private _pendingClear: ReturnType<typeof setTimeout> | undefined;

    /**
     * The element the live overlay was rendered for, `undefined` when nothing
     * is showing. The container is shared by every drop target, so a caller
     * tearing down only its own overlay must check this before `clear()`.
     */
    get renderedOutline(): HTMLElement | undefined {
        return this._model ? this._outline : undefined;
    }

    get disabled(): boolean {
        return this._disabled;
    }

    set disabled(value: boolean) {
        if (this.disabled === value) {
            return;
        }

        this._disabled = value;

        if (value) {
            this._clearNow();
        }
    }

    private _cancelPendingClear(): void {
        if (this._pendingClear !== undefined) {
            clearTimeout(this._pendingClear);
            this._pendingClear = undefined;
        }
    }

    private _clearNow(): void {
        this._cancelPendingClear();
        if (this._model) {
            this._model.root.remove();
        }
        this._model = undefined;
    }

    get model(): DropTargetTargetModel | undefined {
        if (this.disabled) {
            return undefined;
        }

        return {
            clear: () => {
                this._clearNow();
            },
            scheduleClear: () => {
                if (this._pendingClear !== undefined || !this._model) {
                    return;
                }
                this._pendingClear = setTimeout(() => {
                    this._pendingClear = undefined;
                    this._clearNow();
                }, 0);
            },
            exists: () => {
                return !!this._model;
            },
            getElements: (event?: DragEvent, outline?: HTMLElement) => {
                // A render means the overlay is (still) live: cancel any clear
                // scheduled by the target the cursor just left, so the overlay
                // slides here instead of being torn down.
                this._cancelPendingClear();

                const changed = this._outline !== outline;
                this._outline = outline;

                if (this._model) {
                    this._model.changed = changed;
                    return this._model;
                }

                const container = this.createContainer();
                const anchor = this.createAnchor();

                this._model = { root: container, overlay: anchor, changed };

                container.appendChild(anchor);
                this.element.appendChild(container);

                if (event?.target instanceof HTMLElement) {
                    const targetBox = event.target.getBoundingClientRect();
                    const box = this.element.getBoundingClientRect();

                    anchor.style.left = `${targetBox.left - box.left}px`;
                    anchor.style.top = `${targetBox.top - box.top}px`;
                }

                return this._model;
            },
        };
    }

    constructor(
        readonly element: HTMLElement,
        options: { disabled: boolean }
    ) {
        super();

        this._disabled = options.disabled;

        this.addDisposables(
            Disposable.from(() => {
                this.model?.clear();
            })
        );
    }

    private createContainer(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'dv-drop-target-container';

        return el;
    }

    private createAnchor(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'dv-drop-target-anchor';
        el.style.visibility = 'hidden';

        return el;
    }
}
