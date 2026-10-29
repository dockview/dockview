import type { Position } from '../dnd/droptarget';
import { Emitter, type Event } from '../events';
import type { IGridView, IViewSize } from '../gridview/gridview';
import type { IDisposable } from '../lifecycle';

/** The empty slot a live drop preview opens in the layout. */
export class DropPlaceholder implements IGridView, IDisposable {
    private readonly _onDidChange = new Emitter<IViewSize | undefined>();
    readonly onDidChange: Event<IViewSize | undefined> =
        this._onDidChange.event;

    readonly element: HTMLElement;
    readonly minimumWidth = 0;
    readonly maximumWidth = Number.MAX_SAFE_INTEGER;
    readonly minimumHeight = 0;
    readonly maximumHeight = Number.MAX_SAFE_INTEGER;
    readonly isVisible = true;

    constructor() {
        this.element = document.createElement('div');
        this.element.className = 'dv-drop-placeholder';
    }

    layout(_width: number, _height: number): void {
        // nothing to lay out
    }

    toJSON(): object {
        return {};
    }

    dispose(): void {
        this._onDidChange.dispose();
    }
}

export interface LiveDropTarget {
    readonly groupId: string;
    readonly position: Position;
    readonly depth: number;
}

/** Keeps at most one placeholder in the layout, until another drop is previewed. */
export class LiveDropPreview implements IDisposable {
    private _current:
        | {
              target: LiveDropTarget;
              placeholder: DropPlaceholder;
              remove: () => void;
          }
        | undefined;

    get placeholder(): DropPlaceholder | undefined {
        return this._current?.placeholder;
    }

    get target(): LiveDropTarget | undefined {
        return this._current?.target;
    }

    matches(target: LiveDropTarget): boolean {
        const current = this._current?.target;
        return (
            !!current &&
            current.groupId === target.groupId &&
            current.position === target.position &&
            current.depth === target.depth
        );
    }

    /** `insert` adds the placeholder and returns how to remove it. */
    show(
        target: LiveDropTarget,
        insert: (placeholder: DropPlaceholder) => () => void
    ): void {
        if (this.matches(target)) {
            return;
        }

        this.clear();

        const placeholder = new DropPlaceholder();
        try {
            const remove = insert(placeholder);
            this._current = { target, placeholder, remove };
        } catch (err) {
            placeholder.dispose();
            throw err;
        }
    }

    /** End the preview, leaving the placeholder for the caller to replace. */
    take(): DropPlaceholder | undefined {
        const current = this._current;
        this._current = undefined;
        current?.placeholder.dispose();
        return current?.placeholder;
    }

    clear(): void {
        const current = this._current;
        this._current = undefined;
        if (current) {
            current.remove();
            current.placeholder.dispose();
        }
    }

    dispose(): void {
        this._current?.placeholder.dispose();
        this._current = undefined;
    }
}
