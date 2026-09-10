import { DockviewComponent } from '../../dockviewComponent';
import { addDisposableListener, Emitter } from '../../../events';
import { CompositeDisposable } from '../../../lifecycle';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { quasiPreventDefault } from '../../../dom';
import { GroupDragSource } from './groupDragSource';

/**
 * A dedicated, blank drag handle rendered above a floating group's tab bar.
 *
 * It plays the same dual role the tab-bar void container plays today: a plain
 * pointer-drag moves the floating window (wired by the overlay via
 * `setupDrag`), while a shift+drag (mouse) or long-press (touch) detaches the
 * group to redock it into the grid. The redock half is provided by the shared
 * {@link GroupDragSource}; the move half is owned by the overlay.
 *
 * The bar is intentionally contentless; styling is driven entirely through
 * the `--dv-floating-titlebar-*` theme variables.
 */
export class FloatingTitleBar extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private readonly dragSource: GroupDragSource;
    private _group: DockviewGroupPanel;

    private readonly _onDragStart = new Emitter<DragEvent | PointerEvent>();
    readonly onDragStart = this._onDragStart.event;

    get element(): HTMLElement {
        return this._element;
    }

    /** The window's current anchor group, the one this bar drags/activates. */
    get group(): DockviewGroupPanel {
        return this._group;
    }

    /**
     * Retarget the bar at a new anchor group. Called when the original anchor
     * leaves a multi-group floating window and another member is promoted, so
     * the bar keeps activating/redocking a group that actually lives here.
     */
    setGroup(group: DockviewGroupPanel): void {
        this._group = group;
    }

    constructor(
        private readonly accessor: DockviewComponent,
        group: DockviewGroupPanel
    ) {
        super();

        this._group = group;

        this._element = document.createElement('div');
        this._element.className = 'dv-floating-titlebar';

        // A contentless grip affordance. It is invisible by default
        // (`--dv-floating-titlebar-handle-color` is transparent) and only
        // renders as a dotted grip on themes that opt in (e.g. the slate
        // theme). `pointer-events: none` (set in CSS) keeps drags on the bar.
        const handle = document.createElement('div');
        handle.className = 'dv-floating-titlebar-handle';
        this._element.appendChild(handle);

        this.addDisposables(
            this._onDragStart,
            addDisposableListener(this._element, 'pointerdown', () => {
                this.accessor.doSetGroupActive(this._group);
            }),
            // Shift+pointerdown marks the event so the overlay's
            // move-the-float drag doesn't fire alongside the HTML5 redock
            // drag. See VoidContainer for the same disambiguation.
            addDisposableListener(
                this._element,
                'pointerdown',
                (e) => {
                    if (e.shiftKey) {
                        quasiPreventDefault(e);
                    }
                },
                true
            )
        );

        this.dragSource = new GroupDragSource({
            element: this._element,
            accessor: this.accessor,
            // resolve lazily so the drag source follows anchor reassignment
            group: () => this._group,
        });

        this.addDisposables(
            this.dragSource,
            this.dragSource.onDragStart((event) => {
                this._onDragStart.fire(event);
            })
        );
    }

    updateDragAndDropState(): void {
        this.dragSource.updateDragAndDropState();
    }
}
