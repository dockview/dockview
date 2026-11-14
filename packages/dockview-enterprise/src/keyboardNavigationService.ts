import {
    getActiveElement,
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewGroupPanel,
    DockviewKeybindings,
    KeyboardNavigationOptions,
    defineModule,
    IKeyboardNavigationHost,
    IKeyboardNavigationService,
} from 'dockview';
import {
    KEYBOARD_MOVE_ATTRIBUTE,
    matchesBinding,
    readKeyboardNavigation,
} from './keyboardShared';
import {
    bindDocumentListeners,
    bindShadowRootListeners,
    eventOrigin,
} from './shadowDom';

const DEFAULT_KEYMAP: DockviewKeybindings = {
    nextTab: 'ctrl+]',
    prevTab: 'ctrl+[',
    focusNextGroup: 'f6',
    focusPrevGroup: 'shift+f6',
    focusTabs: 'ctrl+shift+\\',
    // A Ctrl-based combo that steers clear of OS/browser-reserved shortcuts
    // (unlike, say, `ctrl+shift+p`, which is Firefox's private-window key), and
    // whose key is unchanged by Shift so it matches reliably across keyboard
    // layouts. Rebindable via `keymap.togglePin`.
    togglePin: 'ctrl+shift+enter',
};

/**
 * Keyboard navigation & focus management: operate the dock without a mouse.
 * Opt-in via `keyboardNavigation`, with a rebindable {@link DockviewKeybindings}
 * keymap.
 *
 * - **Switch tab** (`Ctrl+]` / `Ctrl+[`): cycle the focused group's tabs.
 * - **Focus group** (`F6` / `Shift+F6`): move focus to the next / previous
 *   group in sequence.
 * - **Focus the tab strip** (`Ctrl+Shift+\`): jump focus from panel content to
 *   the active group's tab strip (the strip's roving-tabindex takes over).
 * - **Toggle pin** (`Ctrl+Shift+Enter`): pin / unpin the active panel's tab.
 *   Inert unless the pinned-tabs feature is enabled.
 * - **Focus restore on close**: when removing a panel/group pulls focus out of
 *   the dock, focus returns to the neighbour the layout just activated instead
 *   of being stranded on `<body>`.
 * - **Floating `Esc`**: `Esc` inside a floating group returns focus to the
 *   control that had it before entering the float (polite: bubble phase,
 *   respects `defaultPrevented`, so panel content keeps `Esc`).
 * - **Floating Tab-containment**: Tab wraps within the floating group so focus
 *   doesn't leak to the grid behind it.
 *
 * Stands down while an advanced keyboard move is in progress (see
 * {@link KEYBOARD_MOVE_ATTRIBUTE}) so the docking module owns the keys then.
 */
export class KeyboardNavigationService
    extends CompositeDisposable
    implements IKeyboardNavigationService
{
    private _focusWasInside = false;
    private _lastNonFloatFocus: HTMLElement | undefined;

    constructor(private readonly host: IKeyboardNavigationHost) {
        super();

        // Listen on the document (capture) rather than the dockview element:
        // edge groups live in the shell *outside* the gridview, and the shell
        // is created after this service, so a fixed element would miss them.
        // Mirrored onto each popout document too (a separate `document`), so the
        // keys, focus tracking and Esc-from-float work inside a popped-out window.
        const onKeyDown = (e: Event): void =>
            this._onKeyDown(e as KeyboardEvent);

        // Remember the last control focused anywhere in this dock (outside any
        // float) so Esc inside a floating group can return focus to its
        // invoking control. Observe-only; it never consumes.
        const onFocusIn = (e: Event): void => {
            const t = eventOrigin(e, this.host.rootElement);
            if (
                t instanceof HTMLElement &&
                this.host.ownsElement(t) &&
                !t.closest('[role="dialog"]')
            ) {
                this._lastNonFloatFocus = t;
            }
        };
        // A dock inside a shadow root: focus moves within the root never reach
        // the document, so track them on the root too. `onFocusIn` is
        // idempotent, so an event seen by both listeners is harmless.
        const shadowFocus = bindShadowRootListeners(
            () => host.rootElement,
            [{ type: 'focusin', handler: onFocusIn, capture: true }]
        );
        // Focus entering the root from outside does reach the document, so
        // re-check the root there (before any intra-root move) in case the
        // dock was mounted into a shadow root after construction.
        const onDocumentFocusIn = (e: Event): void => {
            shadowFocus.sync();
            onFocusIn(e);
        };

        // Esc-from-float restore runs in the bubble phase and respects
        // defaultPrevented, so panel content that uses Esc keeps priority.
        const onEscape = (e: Event): void =>
            this._onFloatingEscape(e as KeyboardEvent);

        this.addDisposables(
            shadowFocus,
            bindDocumentListeners(host, [
                { type: 'keydown', handler: onKeyDown, capture: true },
                { type: 'focusin', handler: onDocumentFocusIn, capture: true },
                { type: 'keydown', handler: onEscape, capture: false },
            ]),
            // When a structural change pulls focus out of the dock, return it to
            // the neighbour the component just activated rather than leaving it
            // stranded on <body>. Snapshot before the change (focus still on the
            // affected panel), restore after.
            //
            // - `remove`: closing the focused panel/group.
            // - `maximize`: maximizing a *different* group hides the focused
            //   one, blurring it to <body>. (Maximizing the focused group keeps
            //   its DOM in place, so focus stays inside and we no-op, which is
            //   exactly what the was-inside / not-inside guard checks, so we
            //   never steal focus from a mouse user who maximized in place.)
            host.onWillMutateLayout((e) => {
                if (this._restoresFocus(e) && this._nav) {
                    this._focusWasInside = this._isFocusInside();
                }
            }),
            host.onDidMutateLayout((e) => {
                if (
                    this._restoresFocus(e) &&
                    this._nav &&
                    this._focusWasInside &&
                    !this._isFocusInside()
                ) {
                    this._restoreFocus();
                }
            })
        );
    }

    private get _moveActive(): boolean {
        return this.host.rootElement.hasAttribute(KEYBOARD_MOVE_ATTRIBUTE);
    }

    /** Mutations that can strand focus on `<body>` and so warrant a restore. */
    private _restoresFocus(e: { kind: string }): boolean {
        return e.kind === 'remove' || e.kind === 'maximize';
    }

    /**
     * The element that actually has focus, across windows: the `activeElement`
     * of whichever document currently holds focus (a popout, else the main
     * document). Each document tracks its own `activeElement` even when blurred,
     * so we must pick the focused one rather than trust the main document.
     * In the main document, read the dock's own root node so a dock mounted in
     * a shadow root sees the focused element rather than the shadow host.
     */
    private _activeElement(): Element | null {
        const mainDoc = this.host.rootElement.ownerDocument;
        for (const win of this.host.getPopoutWindows()) {
            try {
                if (win.document !== mainDoc && win.document.hasFocus()) {
                    return win.document.activeElement;
                }
            } catch {
                // A closing / cross-origin window can throw on access, so ignore it.
            }
        }
        return getActiveElement(this.host.rootElement);
    }

    private _isFocusInside(): boolean {
        const active = this._activeElement();
        return active instanceof Node && this.host.ownsElement(active);
    }

    private _onFloatingEscape(e: KeyboardEvent): void {
        if (
            !this._nav ||
            this._moveActive ||
            e.defaultPrevented ||
            e.key !== 'Escape'
        ) {
            return;
        }
        const target = eventOrigin(e, this.host.rootElement);
        if (!(target instanceof Element)) {
            return;
        }
        // Only when focus is inside one of *this* dock's floating groups
        // (in any window).
        const float = target.closest('[role="dialog"]');
        if (!float || !this.host.ownsElement(float)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        this._returnFocusFromFloat();
    }

    /**
     * Keep Tab inside the floating group that holds focus: at the last tabbable
     * Tab wraps to the first, at the first Shift+Tab wraps to the last. Returns
     * true if it handled the event. No-op outside a float.
     */
    private _trapFloatTab(e: KeyboardEvent): boolean {
        const target = eventOrigin(e, this.host.rootElement);
        if (!(target instanceof Element)) {
            return false;
        }
        const float = target.closest('[role="dialog"]');
        if (!float || !this.host.ownsElement(float)) {
            return false;
        }
        // Always manage Tab inside a float, never only at the boundary: focus
        // often sits on non-tabbable plumbing (the content container, which is
        // tabindex="-1"), and the browser's default Tab from there escapes to
        // the grid behind. Drive the cursor through the float's tabbables
        // ourselves and swallow the default so it can't leak out.
        e.preventDefault();
        const tabbables = this._tabbables(float);
        if (tabbables.length === 0) {
            return true;
        }
        const active = getActiveElement(float);
        const index =
            active instanceof HTMLElement ? tabbables.indexOf(active) : -1;
        const n = tabbables.length;
        let next: number;
        if (index === -1) {
            next = e.shiftKey ? n - 1 : 0;
        } else {
            next = (index + (e.shiftKey ? -1 : 1) + n) % n;
        }
        tabbables[next].focus();
        return true;
    }

    private _tabbables(root: Element): HTMLElement[] {
        const nodes = root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), ' +
                'select:not([disabled]), textarea:not([disabled]), [tabindex]'
        );
        // tabIndex >= 0 keeps naturally-focusable controls and roving anchors
        // (the active tab) while dropping tabindex="-1" plumbing (content
        // containers, inactive tabs).
        return Array.from(nodes).filter((el) => el.tabIndex >= 0);
    }

    private _returnFocusFromFloat(): void {
        const prev = this._lastNonFloatFocus;
        if (
            prev &&
            prev.isConnected &&
            this.host.ownsElement(prev) &&
            !prev.closest('[role="dialog"]')
        ) {
            prev.focus();
            return;
        }
        // Invoking control is gone, so fall back to a grid group's content.
        this.host.groups
            .find((g) => g.api.location.type === 'grid')
            ?.model.focusContent();
    }

    private get _nav(): KeyboardNavigationOptions | undefined {
        return readKeyboardNavigation(this.host.options);
    }

    private get _keymap(): DockviewKeybindings {
        return { ...DEFAULT_KEYMAP, ...this._nav?.keymap };
    }

    private _onKeyDown(e: KeyboardEvent): void {
        if (!this._nav) {
            return;
        }
        // Stand down while the docking module is driving a keyboard move.
        if (this._moveActive) {
            return;
        }
        // Only act on events originating inside *this* dockview (any window).
        const target = eventOrigin(e, this.host.rootElement);
        if (!(target instanceof Node) || !this.host.ownsElement(target)) {
            return;
        }
        // Trap Tab within a floating group so focus doesn't leak to the grid
        // behind it (the float is non-modal, but its Tab order should be).
        if (e.key === 'Tab' && this._trapFloatTab(e)) {
            return;
        }
        const keymap = this._keymap;
        if (matchesBinding(e, keymap.nextTab)) {
            this._consume(e);
            this._switchTab(false);
        } else if (matchesBinding(e, keymap.prevTab)) {
            this._consume(e);
            this._switchTab(true);
        } else if (matchesBinding(e, keymap.focusNextGroup)) {
            this._consume(e);
            this._cycleGroup(false);
        } else if (matchesBinding(e, keymap.focusPrevGroup)) {
            this._consume(e);
            this._cycleGroup(true);
        } else if (matchesBinding(e, keymap.focusTabs)) {
            this._consume(e);
            this._focusTabs();
        } else if (matchesBinding(e, keymap.togglePin)) {
            this._consume(e);
            this._togglePin();
        }
    }

    // --- navigation (uses the public group API + the adjacentGroup primitive) ---

    private _focusTabs(): void {
        // Jump from panel content to the active group's tab strip; the
        // tablist's own roving-tabindex handler takes over from there.
        this.host.activeGroup?.model.focusActiveTab();
    }

    private _togglePin(): void {
        // Inert unless the pinned-tabs feature is enabled; the binding is dead
        // weight without it. (`setPinned` is itself gated in core, but guarding
        // here also skips the needless refocus below when nothing can change.)
        if (!this.host.options.pinnedTabs?.enabled) {
            return;
        }
        const panel = this.host.activePanel;
        if (!panel) {
            return;
        }
        panel.api.setPinned(!panel.api.isPinned);
        // Pinning re-orders the strip (pinned-first), which can strand focus on
        // <body>; return it to the active content the same way the other
        // actions do.
        this._restoreFocus();
    }

    private _switchTab(reverse: boolean): void {
        const group = this.host.activeGroup;
        if (!group) {
            return;
        }
        if (reverse) {
            group.model.moveToPrevious();
        } else {
            group.model.moveToNext();
        }
        // Keep DOM focus inside the dock: switching hides the previously
        // focused content, which would otherwise drop focus to <body> and
        // leave the keymap unable to see the next key.
        group.model.focusContent();
    }

    private _cycleGroup(reverse: boolean): void {
        const current = this.host.activeGroup;
        const target = current
            ? this.host.adjacentGroup(current, reverse)
            : this.host.groups[0];
        this._focusGroup(target);
    }

    private _focusGroup(target: DockviewGroupPanel | undefined): void {
        if (!target) {
            return;
        }
        target.api.setActive();
        target.model.focusContent();
    }

    /** Return DOM focus to the active group's content, keeping it in the dock. */
    private _restoreFocus(): void {
        this.host.activeGroup?.model.focusContent();
    }

    private _consume(e: KeyboardEvent): void {
        e.preventDefault();
        e.stopPropagation();
    }
}

export const KeyboardNavigationModule = defineModule<
    'keyboardNavigationService',
    IKeyboardNavigationHost
>({
    name: 'KeyboardNavigation',
    options: ['keyboardNavigation'],
    serviceKey: 'keyboardNavigationService',
    create: (host) => new KeyboardNavigationService(host),
});
