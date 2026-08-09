import {
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewIDisposable as IDisposable,
    Position,
    DockviewGroupPanel,
    IDockviewPanel,
    resolveMessages,
    defineModule,
    AdvancedDnDModule,
    LiveRegionModule,
    IKeyboardNavigationHost,
    IKeyboardDockingService,
} from 'dockview';
import {
    bindDocumentListeners,
    KEYBOARD_MOVE_ATTRIBUTE,
    matchesBinding,
    readKeyboardNavigation,
} from './keyboardShared';

type DockPhase = 'target' | 'edge';

interface MoveState {
    readonly source: IDockviewPanel;
    // Re-resolved against the live grid on each render/commit rather than held
    // as a fixed snapshot, so a group removed mid-move can't leave this
    // pointing at a disposed group.
    groups: DockviewGroupPanel[];
    groupIndex: number;
    phase: DockPhase;
    position: Position;
}

const EDGE_FROM_KEY: Record<string, Position> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'top',
    ArrowDown: 'bottom',
};

/** Bindings owned by this module (kept separate from the default navigation keymap). */
interface DockingKeybindings {
    /** Move focus to the group spatially to the left. Default `ctrl+shift+arrowleft`. */
    focusGroupLeft: string;
    /** Move focus to the group spatially to the right. Default `ctrl+shift+arrowright`. */
    focusGroupRight: string;
    /** Move focus to the group spatially above. Default `ctrl+shift+arrowup`. */
    focusGroupUp: string;
    /** Move focus to the group spatially below. Default `ctrl+shift+arrowdown`. */
    focusGroupDown: string;
    /** Arm keyboard docking of the active panel. Default `ctrl+m`. */
    dock: string;
    /** Float the moving panel (terminal action during the target phase). Default `ctrl+shift+f`. */
    float: string;
}

const DEFAULT_KEYMAP: DockingKeybindings = {
    focusGroupLeft: 'ctrl+shift+arrowleft',
    focusGroupRight: 'ctrl+shift+arrowright',
    focusGroupUp: 'ctrl+shift+arrowup',
    focusGroupDown: 'ctrl+shift+arrowdown',
    dock: 'ctrl+m',
    float: 'ctrl+shift+f',
};

/**
 * Advanced keyboard control: drive the layout itself without a mouse. Opt-in
 * via `keyboardNavigation` (shared with the default navigation module).
 *
 * - **Spatial group focus** (`Ctrl+Shift+Arrows`): move focus to the visually
 *   adjacent group via the `adjacentGroupInDirection` geometry primitive.
 * - **Keyboard docking** (`Ctrl+M`): arms a two-phase move of the active panel
 *   with a live drop preview + screen-reader narration:
 *     1. Pick target: arrows cycle the groups (incl. the panel's own, so a tab
 *        can be split out); `Enter` selects one.
 *     2. Pick edge: arrows choose a split edge (left/right/top/bottom) or the
 *        centre (tab-into); `Enter` commits, `Escape` steps back.
 *   From the target phase, `Ctrl+Shift+F` floats the panel as a terminal
 *   action; `Escape` cancels.
 *
 * While a move is in progress it marks the root with
 * {@link KEYBOARD_MOVE_ATTRIBUTE} so the default navigation listener stands
 * down and the move keys aren't double-handled.
 */
export class KeyboardDockingService
    extends CompositeDisposable
    implements IKeyboardDockingService
{
    private _move: MoveState | null = null;
    private _preview: IDisposable | undefined;
    /** On-screen hint mirroring the SR narration during an armed move. */
    private _hint: HTMLElement | undefined;

    constructor(private readonly host: IKeyboardNavigationHost) {
        super();

        // Capture phase, on the document, matching the navigation listener so
        // edge groups (outside the gridview) are covered. Mirrored onto each
        // popout document so docking can be driven from inside a popped-out
        // window (a separate `document`).
        const onKeyDown = (e: Event): void =>
            this._onKeyDown(e as KeyboardEvent);

        this.addDisposables(
            { dispose: () => this._exit() },
            bindDocumentListeners(host, [
                { type: 'keydown', handler: onKeyDown, capture: true },
            ])
        );
    }

    private get _enabled(): boolean {
        return !!readKeyboardNavigation(this.host.options);
    }

    private get _keymap(): DockingKeybindings {
        // The public `keyboardNavigation.keymap` carries the default-navigation
        // bindings; this module's bindings are read from the same object when
        // present (so a consumer can rebind them too).
        const overrides = (readKeyboardNavigation(this.host.options)?.keymap ??
            {}) as Record<string, string>;
        return {
            focusGroupLeft:
                overrides.focusGroupLeft ?? DEFAULT_KEYMAP.focusGroupLeft,
            focusGroupRight:
                overrides.focusGroupRight ?? DEFAULT_KEYMAP.focusGroupRight,
            focusGroupUp: overrides.focusGroupUp ?? DEFAULT_KEYMAP.focusGroupUp,
            focusGroupDown:
                overrides.focusGroupDown ?? DEFAULT_KEYMAP.focusGroupDown,
            dock: overrides.dock ?? DEFAULT_KEYMAP.dock,
            float: overrides.float ?? DEFAULT_KEYMAP.float,
        };
    }

    private get _messages() {
        return resolveMessages(this.host.options.messages);
    }

    private _onKeyDown(e: KeyboardEvent): void {
        if (!this._enabled) {
            return;
        }
        if (this._move) {
            this._onMoveKey(e);
            return;
        }
        // Only act on events originating inside *this* dockview (any window).
        if (!(e.target instanceof Node) || !this.host.ownsElement(e.target)) {
            return;
        }
        const keymap = this._keymap;
        if (matchesBinding(e, keymap.dock)) {
            this._enterMoveMode(e);
        } else if (matchesBinding(e, keymap.focusGroupLeft)) {
            this._consume(e);
            this._focusGroupInDirection('left');
        } else if (matchesBinding(e, keymap.focusGroupRight)) {
            this._consume(e);
            this._focusGroupInDirection('right');
        } else if (matchesBinding(e, keymap.focusGroupUp)) {
            this._consume(e);
            this._focusGroupInDirection('up');
        } else if (matchesBinding(e, keymap.focusGroupDown)) {
            this._consume(e);
            this._focusGroupInDirection('down');
        }
    }

    // --- spatial focus ---

    private _focusGroupInDirection(
        direction: 'left' | 'right' | 'up' | 'down'
    ): void {
        const current = this.host.activeGroup;
        if (!current) {
            return;
        }
        // Geometry lives on the host as the shared `adjacentGroupInDirection`
        // primitive (also public on the api), so mouse and keyboard navigation
        // agree on what "the group to the left" is.
        this._focusGroup(
            this.host.adjacentGroupInDirection(current, direction)
        );
    }

    private _focusGroup(target: DockviewGroupPanel | undefined): void {
        if (!target) {
            return;
        }
        target.api.setActive();
        target.model.focusContent();
    }

    private _restoreFocus(): void {
        this.host.activeGroup?.model.focusContent();
    }

    // --- keyboard docking (move mode) ---

    private _enterMoveMode(e: KeyboardEvent): void {
        const source = this.host.activePanel;
        const groups = this.host.groups;
        if (!source || groups.length === 0) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        // Start on the panel's own group so a single group of tabs can still
        // split a tab out via the edge phase.
        const groupIndex = Math.max(0, groups.indexOf(source.group));
        this._move = {
            source,
            groups,
            groupIndex,
            phase: 'target',
            position: 'center',
        };
        // Signal the navigation module to stand down while the move runs.
        this.host.rootElement.setAttribute(KEYBOARD_MOVE_ATTRIBUTE, '');
        this._render();
    }

    private _onMoveKey(e: KeyboardEvent): void {
        const move = this._move!;

        if (e.key === 'Escape') {
            this._onEscapeKey(e, move);
        } else if (e.key === 'Enter') {
            this._onEnterKey(e, move);
        } else if (move.phase === 'target') {
            this._onTargetPhaseKey(e, move);
        } else {
            this._onEdgePhaseKey(e, move);
        }
    }

    private _onEscapeKey(e: KeyboardEvent, move: MoveState): void {
        this._consume(e);
        if (move.phase === 'edge') {
            move.phase = 'target';
            move.position = 'center';
            this._render();
        } else {
            this._exit();
            this.host.announce(this._messages.moveCancelled());
            this._restoreFocus();
        }
    }

    private _onEnterKey(e: KeyboardEvent, move: MoveState): void {
        this._consume(e);
        if (move.phase === 'target') {
            move.phase = 'edge';
            move.position = 'center';
            this._render();
        } else {
            this._commit();
        }
    }

    private _onTargetPhaseKey(e: KeyboardEvent, move: MoveState): void {
        // Float is a terminal action from the target phase: pull the moving
        // panel out into a new floating group instead of docking it.
        if (matchesBinding(e, this._keymap.float)) {
            this._consume(e);
            this._float();
            return;
        }
        const n = move.groups.length;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            this._consume(e);
            move.groupIndex = (move.groupIndex + 1) % n;
            this._render();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            this._consume(e);
            move.groupIndex = (move.groupIndex - 1 + n) % n;
            this._render();
        }
    }

    private _onEdgePhaseKey(e: KeyboardEvent, move: MoveState): void {
        const edge = EDGE_FROM_KEY[e.key];
        if (edge) {
            this._consume(e);
            move.position = edge;
            this._render();
        } else if (e.key === ' ' || e.key === 'c' || e.key === 'C') {
            this._consume(e);
            move.position = 'center';
            this._render();
        }
    }

    /**
     * Re-resolve the targeted group against the *live* grid. A group can be
     * removed between arm-time and now (auto-close timer, programmatic
     * `removeGroup`, collaborative edit); re-reading `host.groups` and clamping
     * the index keeps the move pointing at a real, undisposed group instead of
     * a stale snapshot entry. Returns `undefined` when no groups remain.
     */
    private _resolveTargetGroup(): DockviewGroupPanel | undefined {
        const move = this._move!;
        move.groups = this.host.groups;
        if (move.groups.length === 0) {
            return undefined;
        }
        move.groupIndex = Math.min(
            Math.max(move.groupIndex, 0),
            move.groups.length - 1
        );
        return move.groups[move.groupIndex];
    }

    private _abortMove(): void {
        this._exit();
        this.host.announce(this._messages.moveCancelled());
        this._restoreFocus();
    }

    private _render(): void {
        const move = this._move!;
        const group = this._resolveTargetGroup();
        if (!group) {
            // every candidate group was removed mid-move, so bail out cleanly
            this._abortMove();
            return;
        }
        this._clearPreview();
        this._preview = this.host.showDropPreview(group, move.position);

        const name = group.activePanel?.title ?? group.id;
        const m = this._messages;
        const message =
            move.phase === 'target'
                ? m.movePickTarget(
                      this._label(move.source),
                      name,
                      move.groupIndex + 1,
                      move.groups.length
                  )
                : m.movePickEdge(move.position, name);
        // The same guidance goes to assistive tech (LiveRegion) and to the
        // on-screen hint, so sighted keyboard users see the arrows/Enter/Escape
        // affordance the narration describes.
        this.host.announce(message);
        this._showHint(message);
    }

    private _commit(): void {
        const move = this._move!;
        const group = this._resolveTargetGroup();
        if (!group) {
            this._abortMove();
            return;
        }
        const position = move.position;
        const source = move.source;
        const name = group.activePanel?.title ?? group.id;
        const m = this._messages;
        this._exit();
        try {
            this.host.dockPanel(source, group, position);
            this.host.announce(
                m.moveCommitted(this._label(source), name, position)
            );
        } catch {
            this.host.announce(m.moveNotAllowed());
        }
        // The move re-renders the grid; pull focus back into the dock so the
        // keymap keeps working without a click.
        this._restoreFocus();
    }

    private _float(): void {
        const move = this._move!;
        const source = move.source;
        const m = this._messages;
        this._exit();
        try {
            this.host.floatPanel(source);
            this.host.announce(m.moveFloated(this._label(source)));
        } catch {
            this.host.announce(m.moveNotAllowed());
        }
        // Floating re-renders the grid; pull focus back into the dock.
        this._restoreFocus();
    }

    private _exit(): void {
        this._clearPreview();
        this._hideHint();
        this._move = null;
        this.host.rootElement.removeAttribute(KEYBOARD_MOVE_ATTRIBUTE);
    }

    private _clearPreview(): void {
        try {
            this._preview?.dispose();
        } catch {
            // the previewed group may already have been disposed (removed
            // mid-move), which can throw from its drop-target teardown
        }
        this._preview = undefined;
    }

    /**
     * Show a visible on-screen hint carrying the same guidance the LiveRegion
     * speaks. `aria-hidden` because the LiveRegion already announces it (avoids
     * a double read); it is a purely visual affordance. Styleable via
     * `.dv-keyboard-docking-hint`.
     */
    private _showHint(text: string): void {
        if (!this._hint) {
            const mainDoc = this.host.rootElement.ownerDocument;
            // Mount the hint in the window that currently has focus, so a move
            // armed inside a popout shows its guidance in that popout, not the
            // opener (mirrors how announcements route to the focused window's
            // live region).
            const doc = this._focusedDocument();
            // In the main window scope the hint to the dock shell (a positioned
            // ancestor). A popout exposes no shell handle, so anchor it to that
            // window's body; the hint is `position: absolute; bottom`, so it
            // lands at the foot of whichever window armed the move.
            const parent = doc === mainDoc ? this.host.rootElement : doc.body;
            this._hint = doc.createElement('div');
            this._hint.className = 'dv-keyboard-docking-hint';
            this._hint.setAttribute('aria-hidden', 'true');
            parent.appendChild(this._hint);
        }
        this._hint.textContent = text;
    }

    /** The document of the window that currently has focus (a popout, if a
     *  keydown was made there), falling back to the main window. */
    private _focusedDocument(): Document {
        for (const win of this.host.getPopoutWindows()) {
            try {
                if (win.document.hasFocus()) {
                    return win.document;
                }
            } catch {
                // A closing / cross-origin window can throw on access; ignore.
            }
        }
        return this.host.rootElement.ownerDocument;
    }

    private _hideHint(): void {
        this._hint?.remove();
        this._hint = undefined;
    }

    private _consume(e: KeyboardEvent): void {
        e.preventDefault();
        e.stopPropagation();
    }

    private _label(panel: IDockviewPanel): string {
        return panel.title ?? panel.id;
    }
}

export const KeyboardDockingModule = defineModule<
    'keyboardDockingService',
    IKeyboardNavigationHost
>({
    name: 'KeyboardDocking',
    serviceKey: 'keyboardDockingService',
    create: (host) => new KeyboardDockingService(host),
    dependsOn: [AdvancedDnDModule, LiveRegionModule],
});
