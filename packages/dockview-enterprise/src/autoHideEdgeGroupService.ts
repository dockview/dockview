import {
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewGroupPanel,
    IDockviewPanel,
    EdgeGroupPosition,
    EdgeGroupPeekOptions,
    defineModule,
    EdgeGroupModule,
    createCloseButton,
    createDismissableLayer,
    createPinButton,
    prefersReducedMotion,
    resolveOpaqueBackground,
    IAutoHideEdgeGroupHost,
    IAutoHideEdgeGroupService,
} from 'dockview';

/** Height (px) of the title bar; the content/`always` overlay is inset below it
 *  so nothing paints under the bar. The title bar's own height is set inline to
 *  this value, so it's the single source of truth (no theme var). */
const TITLEBAR_HEIGHT = 28;

function resolveOptions(o: EdgeGroupPeekOptions | undefined): {
    animate: boolean;
} {
    return {
        animate: o?.animate ?? true,
    };
}

/**
 * Click-driven auto-hide ("pinnable") peek for a single edge group, modelled on
 * Visual Studio tool windows. The collapsed edge group's native tabs are the
 * triggers, with **no hover**:
 *
 * - **Click a tab** → that tab's panel slides out as a non-reflowing overlay
 *   with a **title bar** (active title left; pin + close right). The content
 *   container is reparented out (state preserved) and the grid is not reflowed.
 * - **Click the same tab again**, or **click outside** the strip+peek, or
 *   **Esc** → hide. Clicking empty space inside the tab strip does nothing.
 * - **Pin** → re-dock (expand) the group. **Close** → close the panel.
 *
 * Both render modes slide out: it reparents the content container (not the
 * panel content). For `onlyWhenVisible` the content rides inside it; for
 * `always` the container is only the position reference the shared render
 * overlay re-anchors to (`repositionPanelOverlay`, force-visible + clipped to
 * the reveal window). A fixed clip frame makes the panel emerge from the
 * strip's inner edge rather than from the screen edge.
 */
class EdgeGroupController extends CompositeDisposable {
    private _peek:
        | {
              clip: HTMLElement;
              overlay: HTMLElement;
              header: HTMLElement;
              title: HTMLElement;
              content: HTMLElement;
              parent: HTMLElement;
              panel: IDockviewPanel;
          }
        | undefined;
    private _closeListeners: CompositeDisposable | undefined;
    /** The docked (pinned) tool-window chrome: a title bar at the top of the
     *  expanded group, with the tab strip moved to the bottom. Present only
     *  while the group is expanded (pinned); torn down when it auto-hides. */
    private _docked: { bar: HTMLElement; title: HTMLElement } | undefined;

    constructor(
        private readonly group: DockviewGroupPanel,
        private readonly host: IAutoHideEdgeGroupHost
    ) {
        super();

        const strip = this.group.element;
        // Click a collapsed tab → toggle the peek for that tab's panel (open it,
        // switch to it, or hide it if it's already the peeked tab). Natively
        // a collapsed-tab click expands the group; suppress that (the edge-expand
        // handler bails on a default-prevented click) so click peeks instead.
        // Capture phase so it runs before the tab's own bubble-phase handler.
        const onClick = (e: Event): void => {
            const panel = this._resolveTabPanel((e as MouseEvent).target);
            if (!panel || !this._gate()) {
                return;
            }
            e.preventDefault();
            this._toggle(panel);
        };
        // Enter/Space on a focused tab is the keyboard equivalent of a click.
        const onKeyDown = (e: Event): void => {
            const ke = e as KeyboardEvent;
            if (ke.key !== 'Enter' && ke.key !== ' ') {
                return;
            }
            const panel = this._resolveTabPanel(ke.target);
            if (!panel || !this._gate()) {
                return;
            }
            ke.preventDefault();
            this._toggle(panel);
        };
        strip.addEventListener('click', onClick, true);
        strip.addEventListener('keydown', onKeyDown);

        this.addDisposables(
            // Collapse change: tear the peek down, then reconcile the docked
            // tool-window chrome (expanded ⇒ title bar + tabs-bottom; collapsed
            // ⇒ only the strip).
            this.group.api.onDidCollapsedChange(() => {
                this._closePeek();
                this._updateDocked();
            }),
            // Switching the active tab: re-point whichever title bar is showing
            // (peek or docked) at the new panel, and re-anchor `always` content.
            this.group.api.onDidActivePanelChange(() => {
                const next = this.group.activePanel;
                if (!next) {
                    return;
                }
                if (this._peek) {
                    this.host.repositionPanelOverlay(this._peek.panel, false);
                    this._peek.panel = next;
                    this._peek.title.textContent = next.title ?? '';
                    this._syncOverlay();
                }
                if (this._docked) {
                    this._docked.title.textContent = next.title ?? '';
                }
            }),
            // Runtime per-group auto-hide toggle: reconcile the chrome. Turning
            // it off while peeking/docked closes the peek and restores the
            // group's normal header (via _updateDocked → _teardownDocked).
            this.host.onDidEdgeGroupAutoHideChange((group) => {
                if (group !== this.group) {
                    return;
                }
                if (!this._enabled()) {
                    this._closePeek();
                }
                this._updateDocked();
            }),
            {
                dispose: () => {
                    strip.removeEventListener('click', onClick, true);
                    strip.removeEventListener('keydown', onKeyDown);
                    this._closePeek();
                    this._teardownDocked();
                },
            }
        );

        // A pinnable edge group that's already expanded (e.g. restored from a
        // pinned layout) renders as a tool window. Deferred: at `onDidAddGroup`
        // time the shell hasn't applied the collapse yet, so an immediate
        // `isCollapsed()` reads false and would wrongly dock a collapsed strip.
        queueMicrotask(() => {
            if (!this.isDisposed) {
                this._updateDocked();
            }
        });
    }

    private get _opts() {
        return resolveOptions(this.host.options.edgeGroupPeek);
    }

    /** Whether this specific edge group is opted into auto-hide. The per-group
     *  flag is resolved against the global option by the host, so a static and
     *  an auto-hiding edge group can co-exist. */
    private _enabled(): boolean {
        return this.host.isEdgeGroupAutoHide(this.group);
    }

    /** Enabled and collapsed, the precondition for peeking. */
    private _gate(): boolean {
        return this._enabled() && this.group.api.isCollapsed();
    }

    private get _position(): EdgeGroupPosition | undefined {
        const location = this.group.api.location;
        return location.type === 'edge' ? location.position : undefined;
    }

    /** The opaque backdrop for the tool-window title bars (peek + docked).
     *  Resolved from the group's tab strip so the bar adopts the theme's tab-bar
     *  colour rather than the group-view *frame* colour — the latter is the
     *  near-black inter-group gap colour in dark (and spaced) themes, which made
     *  the header read as a plain black band. Falls back to the group element
     *  when the strip has no opaque background of its own. */
    private _titleBarBackground(): string {
        const strip = this.group.element.querySelector<HTMLElement>(
            '.dv-tabs-and-actions-container'
        );
        return resolveOpaqueBackground(strip ?? this.group.element);
    }

    /** Map a pointer/keyboard target to the panel of the strip tab under it, or
     *  `undefined` for non-tab regions. Uses the core's authoritative tab→panel
     *  lookup (no DOM-order assumptions). */
    private _resolveTabPanel(
        target: EventTarget | null
    ): IDockviewPanel | undefined {
        if (!(target instanceof Element)) {
            return undefined;
        }
        return this.group.model.getPanelForTab(target);
    }

    /** Click/activate a tab: hide if it's the peeked one, switch if a different
     *  one is peeked, else open it. */
    private _toggle(panel: IDockviewPanel): void {
        if (this._peek?.panel === panel) {
            this._closePeek();
        } else if (this._peek) {
            panel.api.setActive(); // → onDidActivePanelChange re-anchors + retitles
        } else {
            this._openPeek(panel);
        }
    }

    // --- shared title bar (peek overlay + docked tool window) ---

    /** Build the tool-window title bar: panel title (left), pin + close (right).
     *  Used by both the peek overlay and the docked group chrome; only the
     *  mounting/positioning and the pin action differ. */
    private _buildTitleBar(opts: {
        title: string;
        pinLabel: string;
        closeLabel: string;
        onPin: () => void;
        onClose: () => void;
        background: string;
    }): { element: HTMLElement; title: HTMLElement } {
        const doc = this.group.element.ownerDocument;
        const bar = doc.createElement('div');
        bar.className = 'dv-edge-peek-header';
        // Layout/cosmetics are owned by `.dv-edge-peek-header` / -title in the
        // stylesheet (overlay.scss). Only the resolved opaque background is
        // dynamic, because the floating peek must never be see-through.
        if (opts.background) {
            bar.style.backgroundColor = opts.background;
        }

        const titleEl = doc.createElement('span');
        titleEl.className = 'dv-edge-peek-title';
        titleEl.textContent = opts.title;
        bar.appendChild(titleEl);

        const mk = (
            cls: string,
            icon: SVGElement,
            label: string,
            onClick: () => void
        ): void => {
            const btn = doc.createElement('button');
            btn.className = cls;
            btn.type = 'button';
            btn.title = label;
            btn.setAttribute('aria-label', label);
            // Monotone SVG (inherits `currentColor` via `.dv-svg`), matching the
            // tab close button. Cosmetics (incl. the hover background) are owned
            // by the stylesheet; inline styles here would beat its `:hover`.
            icon.setAttribute('aria-hidden', 'true');
            btn.appendChild(icon);
            btn.addEventListener('click', onClick);
            bar.appendChild(btn);
        };
        mk('dv-edge-peek-pin', createPinButton(), opts.pinLabel, opts.onPin);
        mk(
            'dv-edge-peek-close',
            createCloseButton(),
            opts.closeLabel,
            opts.onClose
        );
        return { element: bar, title: titleEl };
    }

    // --- docked (pinned) tool-window chrome ---

    /** Reconcile the docked chrome with the collapse state: an expanded
     *  (pinned) edge group renders as a tool window (title bar top + tabs
     *  bottom); a collapsed one is only the strip. */
    private _updateDocked(): void {
        const shouldDock = this._enabled() && !this.group.api.isCollapsed();
        if (shouldDock && !this._docked) {
            this._setupDocked();
        } else if (!shouldDock && this._docked) {
            this._teardownDocked();
        }
    }

    private _setupDocked(): void {
        // Tabs to the bottom (existing per-group capability); the strip's edge
        // orientation is restored on teardown.
        this.group.api.setHeaderPosition('bottom');

        const title = this.group.activePanel?.title ?? '';
        const { element, title: titleEl } = this._buildTitleBar({
            title,
            // The pushpin here un-pins (auto-hides), the inverse of the peek's.
            // Generic labels: the title element carries the panel name and
            // updates on switch, so the button names never go stale.
            pinLabel: 'Auto-hide',
            closeLabel: 'Close',
            onPin: () => this.host.setEdgeGroupCollapsed(this.group, true),
            onClose: () => this.group.activePanel?.api.close(),
            background: this._titleBarBackground(),
        });
        element.style.flexShrink = '0';
        element.style.height = `${TITLEBAR_HEIGHT}px`;
        // Mark the group as a docked tool window so the spaced themes can
        // reshape its rounding (title bar caps the top; tab strip caps the
        // bottom; the content-container's default bottom rounding — which would
        // otherwise carve notches mid-card now the header is at the bottom — is
        // dropped). Removed on teardown.
        this.group.element.classList.add('dv-edge-tool-window');
        // Appended last → under the group's `column-reverse` (header-bottom)
        // flow it lands at the visual top, above the content, with the tab
        // strip at the bottom.
        this.group.element.appendChild(element);
        this._docked = { bar: element, title: titleEl };
    }

    private _teardownDocked(): void {
        if (!this._docked) {
            return;
        }
        this._docked.bar.remove();
        this._docked = undefined;
        this.group.element.classList.remove('dv-edge-tool-window');
        // Restore the strip's edge orientation (left/right/top/bottom).
        this.group.api.setHeaderPosition(this._position ?? 'top');
    }

    // --- peek ---

    /** Pull keyboard focus into the peeked content (best-effort): the first
     *  focusable descendant, else the content container (it carries tabindex). */
    private _focusPeekContent(): void {
        const content = this._peek?.content;
        if (!content) {
            return;
        }
        const focusable = content.querySelector<HTMLElement>(
            'a[href], button, input, select, textarea, [tabindex]'
        );
        (focusable ?? content).focus();
    }

    private _openPeek(panel: IDockviewPanel): void {
        if (!this._gate() || !panel) {
            return;
        }
        const title = panel.title ?? '';
        // The content container only shows the active panel, so activate the
        // target first (the grid stays collapsed).
        if (this.group.activePanel !== panel) {
            panel.api.setActive();
        }
        // Reparent the whole content container so both renderers work (see class
        // doc). It un-hides automatically once out of the collapsed subtree.
        const content = this.group.element.querySelector<HTMLElement>(
            '.dv-content-container'
        );
        const parent = content?.parentElement;
        if (!content || !parent || this._peek?.content === content) {
            return;
        }

        const doc = this.group.element.ownerDocument;
        // Backdrop = the group *frame* colour (it only shows at the sliding
        // edges); the title bar uses the tab-bar colour so it doesn't read as a
        // black band in dark/spaced themes.
        const background = resolveOpaqueBackground(this.group.element);
        const titleBarBackground = this._titleBarBackground();

        // --- peek backdrop (slides inside the clip frame) ---
        const overlay = doc.createElement('div');
        overlay.className = 'dv-edge-peek';
        overlay.style.position = 'absolute';
        overlay.style.overflow = 'hidden';
        overlay.style.boxSizing = 'border-box';
        overlay.style.zIndex = '999'; // float-host is pointer-events:none; opt in
        overlay.style.pointerEvents = 'auto';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        if (background) {
            overlay.style.backgroundColor = background;
        }

        // --- title bar (separate sibling so it layers above an `always` render
        //     overlay; it sits in the top band above the content) ---
        const { element: header, title: titleEl } = this._buildTitleBar({
            title,
            pinLabel: 'Pin',
            closeLabel: 'Close',
            onPin: () => this.pin(),
            onClose: () => this.close(),
            background: titleBarBackground,
        });
        header.style.position = 'absolute';
        header.style.zIndex = '1001';
        // The overlay root is pointer-events:none, so opt the title bar back in
        // so its buttons are clickable. It's in the top band, above the content.
        header.style.pointerEvents = 'auto';

        // --- fixed clip frame (content emerges from the strip's inner edge) ---
        const clip = doc.createElement('div');
        clip.className = 'dv-edge-peek-clip';
        clip.style.position = 'absolute';
        clip.style.overflow = 'hidden';
        clip.style.pointerEvents = 'none';

        content.style.width = '100%';
        content.style.height = '100%';
        overlay.appendChild(content);
        clip.appendChild(overlay);

        this.host.overlayRoot.appendChild(clip);
        this.host.overlayRoot.appendChild(header);
        this._peek = {
            clip,
            overlay,
            header,
            title: titleEl,
            content,
            parent,
            panel,
        };
        this._positionOverlay();
        this._armCloseListeners();
        this.host.setEdgeGroupPeeking(this.group, true);
        this._animateIn(overlay);
        this._focusPeekContent();
        if (title) {
            this.host.announce(`${title} shown`);
        }
    }

    /** Re-anchor the peeked `always` panel's render overlay over the (current)
     *  content box, force-showing it and clipping it to the reveal window. No-op
     *  for `onlyWhenVisible` (whose content rides inside the reparented box). */
    private _syncOverlay(): void {
        if (this._peek) {
            this.host.repositionPanelOverlay(
                this._peek.panel,
                true,
                this._peek.clip.getBoundingClientRect()
            );
        }
    }

    /**
     * Slide the content overlay in from the strip edge via a manual rAF loop, so
     * that each frame re-anchors any `always` content over the moving box. The
     * title bar is fixed (it doesn't slide); the content slides in beneath it.
     */
    private _animateIn(overlay: HTMLElement): void {
        const position = this._position;
        const win = this.group.element.ownerDocument.defaultView;
        if (
            !position ||
            !this._opts.animate ||
            prefersReducedMotion(this.group.element.ownerDocument) ||
            typeof win?.requestAnimationFrame !== 'function' ||
            typeof win.performance?.now !== 'function'
        ) {
            this._syncOverlay();
            return;
        }

        const axis = position === 'left' || position === 'right' ? 'X' : 'Y';
        const sign = position === 'left' || position === 'top' ? -1 : 1;
        const duration = 150;
        const start = win.performance.now();

        const step = (now: number): void => {
            if (this._peek?.overlay !== overlay) {
                return; // closed mid-animation
            }
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
            const remaining = (1 - eased) * 100 * sign;
            overlay.style.transform =
                t >= 1 ? '' : `translate${axis}(${remaining}%)`;
            this._syncOverlay();
            if (t < 1) {
                win.requestAnimationFrame(step);
            }
        };
        win.requestAnimationFrame(step);
    }

    /** Anchor the title bar (top band) and the clip frame (content, inset below
     *  the title bar) to the strip's inner edge, sized to the group's expanded
     *  size, relative to the overlay root. No grid reflow. */
    private _positionOverlay(): void {
        const position = this._position;
        if (!position || !this._peek) {
            return;
        }
        const strip = this.group.element.getBoundingClientRect();
        const host = this.host.overlayRoot.getBoundingClientRect();
        const size = this.host.getEdgeGroupExpandedSize(position);
        const left = strip.left - host.left;
        const top = strip.top - host.top;

        let box: { left: number; top: number; width: number; height: number };
        switch (position) {
            case 'left':
                box = {
                    left: left + strip.width,
                    top,
                    width: size,
                    height: strip.height,
                };
                break;
            case 'right':
                box = {
                    left: left - size,
                    top,
                    width: size,
                    height: strip.height,
                };
                break;
            case 'top':
                box = {
                    left,
                    top: top + strip.height,
                    width: strip.width,
                    height: size,
                };
                break;
            case 'bottom':
                box = {
                    left,
                    top: top - size,
                    width: strip.width,
                    height: size,
                };
                break;
        }

        // Title bar fills the top band; content occupies the rest below it.
        const bar = Math.min(TITLEBAR_HEIGHT, box.height);
        const set = (
            el: HTMLElement,
            b: { left: number; top: number; width: number; height: number }
        ): void => {
            el.style.left = `${b.left}px`;
            el.style.top = `${b.top}px`;
            el.style.width = `${b.width}px`;
            el.style.height = `${b.height}px`;
        };
        set(this._peek.header, { ...box, height: bar });
        set(this._peek.clip, {
            left: box.left,
            top: box.top + bar,
            width: box.width,
            height: box.height - bar,
        });
    }

    /** Is the point within the peek (overlay or title bar) or the strip
     *  container? In the click model, clicking anywhere in the strip (tab or
     *  empty space) must not dismiss; only an outside click does. */
    private _pointWithinPeek(x: number, y: number): boolean {
        if (!this._peek) {
            return false;
        }
        const within = (r: DOMRect): boolean =>
            x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        // Use the fixed clip frame (the reveal window), not the sliding overlay:
        // during the slide-in the overlay doesn't yet cover the whole reveal,
        // so a click on the revealed content would otherwise read as "outside".
        return (
            within(this.group.element.getBoundingClientRect()) ||
            within(this._peek.clip.getBoundingClientRect()) ||
            within(this._peek.header.getBoundingClientRect())
        );
    }

    private _armCloseListeners(): void {
        const doc = this.group.element.ownerDocument;
        // The whole dismissal lifecycle (Esc + outside-pointerdown + resize +
        // focus-out) is the shared layer's job. Inside/outside is geometry-based
        // (for a pointer event and for a focused element's centre) because an
        // `always` panel's content is a sibling overlay on top, not inside the
        // peek's DOM subtree. Capture so it's seen before content handlers.
        const withinCentre = (el: Element): boolean => {
            const r = el.getBoundingClientRect();
            return this._pointWithinPeek(
                r.left + r.width / 2,
                r.top + r.height / 2
            );
        };
        this._closeListeners = new CompositeDisposable(
            createDismissableLayer({
                window: doc.defaultView ?? window,
                capture: true,
                onDismiss: () => this._closePeek(),
                isInside: (e) => this._pointWithinPeek(e.clientX, e.clientY),
                // Anchored to the strip and not re-laid-out on resize → close
                // (popover-style) rather than leave it stale. Focus leaving the
                // peek closes it (the VS "slide back on focus loss").
                resize: true,
                focusOut: true,
                isFocusInside: withinCentre,
            })
        );
    }

    private _closePeek(): void {
        this._closeListeners?.dispose();
        this._closeListeners = undefined;
        const peek = this._peek;
        this._peek = undefined;
        if (!peek) {
            return;
        }
        // If focus is inside the peek (a keyboard close: Esc / pin / close),
        // return it to the strip tab so it isn't dropped onto <body>.
        const doc = this.group.element.ownerDocument;
        const restoreFocus =
            doc.activeElement instanceof Node &&
            (peek.overlay.contains(doc.activeElement) ||
                peek.header.contains(doc.activeElement));
        // Restore the content container before removing the overlay.
        peek.content.style.width = '';
        peek.content.style.height = '';
        peek.parent.appendChild(peek.content);
        peek.clip.remove(); // removes the overlay (its child) too
        peek.header.remove();
        this.host.setEdgeGroupPeeking(this.group, false);
        // Re-anchor the `always` overlay back over the collapsed in-group
        // container (forceVisible:false lets it hide again, and clears the clip).
        this.host.repositionPanelOverlay(peek.panel, false);
        if (restoreFocus) {
            const tab =
                this.group.element.querySelector<HTMLElement>(
                    '.dv-active-tab'
                ) ?? this.group.element.querySelector<HTMLElement>('.dv-tab');
            tab?.focus();
        }
    }

    isPeeking(): boolean {
        return this._peek !== undefined;
    }

    openPeek(): void {
        const panel = this.group.activePanel;
        if (panel) {
            this._openPeek(panel);
        }
    }

    closePeek(): void {
        this._closePeek();
    }

    /** Re-dock: restore content, then expand (pin) the group via the host. */
    pin(): void {
        const title = this._peek?.panel.title ?? this.group.activePanel?.title;
        this._closePeek();
        this.host.setEdgeGroupCollapsed(this.group, false);
        if (title) {
            this.host.announce(`${title} pinned`);
        }
    }

    /** Close the peeked (active) panel and tear the peek down. */
    close(): void {
        const panel = this._peek?.panel ?? this.group.activePanel;
        this._closePeek();
        panel?.api.close();
    }
}

/**
 * Auto-hide ("pinnable") edge groups, modelled on Visual Studio tool windows. A
 * collapsed edge group's native tabs are click triggers: clicking a tab slides
 * the panel out as a non-reflowing overlay with a title bar (pin + close);
 * pinning re-docks the group. Opt-in via `autoHideEdgeGroups` (default off →
 * collapsed edge groups behave as today).
 */
export class AutoHideEdgeGroupService
    extends CompositeDisposable
    implements IAutoHideEdgeGroupService
{
    private readonly _controllers = new Map<
        DockviewGroupPanel,
        EdgeGroupController
    >();

    constructor(private readonly host: IAutoHideEdgeGroupHost) {
        super();

        this.addDisposables(
            this.host.onDidAddGroup((group) => this._track(group)),
            this.host.onDidRemoveGroup((group) => this._untrack(group)),
            {
                dispose: () => {
                    this._controllers.forEach((c) => c.dispose());
                    this._controllers.clear();
                },
            }
        );
    }

    private _track(group: DockviewGroupPanel): void {
        if (
            group.api.location.type !== 'edge' ||
            this._controllers.has(group)
        ) {
            return;
        }
        this._controllers.set(group, new EdgeGroupController(group, this.host));
    }

    private _untrack(group: DockviewGroupPanel): void {
        const controller = this._controllers.get(group);
        if (controller) {
            controller.dispose();
            this._controllers.delete(group);
        }
    }

    pin(position: EdgeGroupPosition): void {
        const group = this.host.getEdgeGroupPanel(position);
        if (!group) {
            return;
        }
        const controller = this._controllers.get(group);
        if (controller) {
            controller.pin();
        } else {
            this.host.setEdgeGroupCollapsed(group, false);
        }
    }

    autoHide(position: EdgeGroupPosition): void {
        const group = this.host.getEdgeGroupPanel(position);
        if (group) {
            this.host.setEdgeGroupCollapsed(group, true);
        }
    }

    peek(position: EdgeGroupPosition, peek: boolean): void {
        const group = this.host.getEdgeGroupPanel(position);
        const controller = group && this._controllers.get(group);
        if (peek) {
            controller?.openPeek();
        } else {
            controller?.closePeek();
        }
    }
}

export const AutoHideEdgeGroupModule = defineModule<
    'autoHideEdgeGroupService',
    IAutoHideEdgeGroupHost
>({
    name: 'AutoHideEdgeGroup',
    options: ['autoHideEdgeGroups'],
    serviceKey: 'autoHideEdgeGroupService',
    dependsOn: [EdgeGroupModule],
    create: (host) => new AutoHideEdgeGroupService(host),
});
