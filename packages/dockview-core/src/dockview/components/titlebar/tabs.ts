import { getPanelData } from '../../../dnd/dataTransfer';
import {
    addClasses,
    isChildEntirelyVisibleWithinParent,
    OverflowObserver,
    removeClasses,
    toggleClass,
} from '../../../dom';
import { addDisposableListener, Emitter, Event } from '../../../events';
import {
    CompositeDisposable,
    Disposable,
    IDisposable,
    IValueDisposable,
    MutableDisposable,
} from '../../../lifecycle';
import { Scrollbar } from '../../../scrollbar';
import { PointerDragController } from '../../../dnd/pointer/pointerDragController';
import { DockviewComponent } from '../../dockviewComponent';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { DockviewWillShowOverlayLocationEvent } from '../../events';
import { DockviewPanel, IDockviewPanel } from '../../dockviewPanel';
import {
    DockviewHeaderDirection,
    OVERFLOW_WRAP_TABS_CLASS,
} from '../../options';
import { Tab } from '../tab/tab';
import { resolveDndCapabilities } from '../../dndCapabilities';
import { TabDragEvent, TabDropIndexEvent } from './tabsContainer';
import { ITabGroup } from '../../tabGroup';
import { TabGroupManager } from './tabGroups';
import { ITabGroupChipRenderer } from '../../framework';
import { DroptargetEvent } from '../../../dnd/droptarget';
import {
    ITabReorderHost,
    TabAnimationState,
    TabReorderController,
} from './tabReorderController';

export class Tabs extends CompositeDisposable implements ITabReorderHost {
    private readonly _element: HTMLElement;
    private readonly _tabsList: HTMLElement;
    private readonly _observerDisposable = new MutableDisposable();
    private readonly _pointerActivation = new MutableDisposable();
    private readonly _scrollbar: Scrollbar | null = null;

    private _tabs: IValueDisposable<Tab>[] = [];
    private readonly _tabMap = new Map<string, IValueDisposable<Tab>>();
    private selectedIndex = -1;
    private _showTabsOverflowControl = false;
    /**
     * Predicate that keeps a panel's tab out of the overflow dropdown
     * regardless of visibility. Wired by the PinnedTabs module so pinned tabs
     * never overflow. Defaults to a no-op so behaviour is unchanged when the
     * module is absent. Must stay a pure lookup (no DOM reads) because it runs
     * inside the overflow filter, which the `OverflowObserver` re-fires on every
     * resize.
     */
    private _overflowExclude: (panelId: string) => boolean = () => false;
    /**
     * Predicate that forces a panel's tab into the overflow dropdown regardless
     * of horizontal fit, the complement of {@link _overflowExclude}. Wired by
     * the MultiRowTabs module: in wrap mode tabs never clip horizontally (they
     * wrap), so the `OverflowObserver` detects nothing; this routes the surplus
     * rows beyond `overflow.maxRows` into the dropdown. Defaults to a no-op so
     * behaviour is unchanged when the module is absent. Must stay a pure lookup
     * (no DOM reads) because it runs inside the overflow filter.
     */
    private _forcedOverflow: (panelId: string) => boolean = () => false;
    /**
     * When true, pinned (overflow-excluded) tabs stick to the left edge as the
     * strip scrolls horizontally (Chrome-style frozen columns), wired by the
     * PinnedTabs module in inline mode. Each pinned tab is given a cumulative
     * `--dv-pinned-sticky-left` offset. Defaults to off so behaviour is
     * unchanged when the module is absent.
     */
    private _pinnedSticky = false;
    /** Whether any tab currently carries the sticky styling; lets
     *  {@link _applyPinnedSticky} bail early when there is nothing to do (the
     *  common case for components that never enable the feature). */
    private _hasPinnedStickyStyling = false;
    private _direction: DockviewHeaderDirection = 'horizontal';
    private _voidContainerListeners: IDisposable | null = null;

    private readonly _tabGroupManager: TabGroupManager;
    private readonly _reorder: TabReorderController;

    // The reorder/animation state lives in the controller; these accessors
    // bridge the (many) `Tabs` call sites (and the test suite, which reads
    // `(tabs as any)._animState` / `_pendingCollapse`) onto it.
    private get _animState(): TabAnimationState | null {
        return this._reorder.animState;
    }
    private set _animState(value: TabAnimationState | null) {
        this._reorder.animState = value;
    }
    private get _pendingCollapse(): boolean {
        return this._reorder.pendingCollapse;
    }
    private set _pendingCollapse(value: boolean) {
        this._reorder.pendingCollapse = value;
    }

    // --- ITabReorderHost ---
    get tabItems(): IValueDisposable<Tab>[] {
        return this._tabs;
    }
    get tabMap(): Map<string, IValueDisposable<Tab>> {
        return this._tabMap;
    }
    get tabsList(): HTMLElement {
        return this._tabsList;
    }
    get groupPanel(): DockviewGroupPanel {
        return this.group;
    }
    get component(): DockviewComponent {
        return this.accessor;
    }
    get tabGroupManager(): TabGroupManager {
        return this._tabGroupManager;
    }
    fireDrop(event: TabDropIndexEvent): void {
        this._onDrop.fire(event);
    }

    private readonly _onTabDragStart = new Emitter<TabDragEvent>();
    readonly onTabDragStart: Event<TabDragEvent> = this._onTabDragStart.event;

    private readonly _onDrop = new Emitter<TabDropIndexEvent>();
    readonly onDrop: Event<TabDropIndexEvent> = this._onDrop.event;

    private readonly _onWillShowOverlay =
        new Emitter<DockviewWillShowOverlayLocationEvent>();
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent> =
        this._onWillShowOverlay.event;

    private readonly _onOverflowTabsChange = new Emitter<{
        tabs: string[];
        tabGroups: string[];
        /**
         * Overflow-excluded (pinned) tabs that have themselves clipped out of
         * the strip. Rendered in a dedicated "Pinned" section at the top of the
         * dropdown so an overflowing pinned block stays reachable. Empty unless
         * the {@link _overflowExclude} predicate is wired (PinnedTabs module).
         */
        pinnedTabs: string[];
        reset: boolean;
    }>();
    readonly onOverflowTabsChange = this._onOverflowTabsChange.event;

    /**
     * Register a predicate excluding panels from the overflow dropdown (pinned
     * tabs). Re-evaluates the dropdown immediately if overflow is being
     * observed. Passing `() => false` restores default behaviour.
     */
    setOverflowExclude(fn: (panelId: string) => boolean): void {
        this._overflowExclude = fn;
        this.refreshOverflow();
    }

    /**
     * Register a predicate that forces matching panels into the overflow
     * dropdown regardless of horizontal fit (the MultiRowTabs surplus set, the
     * rows beyond `overflow.maxRows`). Re-evaluates the dropdown immediately.
     * Passing `() => false` restores default behaviour.
     */
    setForcedOverflow(fn: (panelId: string) => boolean): void {
        this._forcedOverflow = fn;
        this.refreshOverflow();
    }

    /** Re-evaluate the overflow dropdown now (e.g. after the exclusion set
     *  changed) instead of waiting for the next resize/scroll observer fire. */
    refreshOverflow(): void {
        if (this._showTabsOverflowControl) {
            this.toggleDropdown({ reset: false });
        }
        // The pinned set may have changed alongside overflow (pin/unpin), so
        // recompute the sticky offsets too.
        this._applyPinnedSticky();
    }

    /**
     * Enable/disable sticky-on-scroll for pinned tabs (inline mode), wired by
     * the PinnedTabs module. When on, pinned (overflow-excluded) tabs are frozen
     * to the left edge as the strip scrolls, each at the cumulative width of the
     * pinned tabs before it; when off, the sticky styling is cleared. The
     * offsets are scroll-invariant, so they are recomputed only on resize,
     * horizontal scroll (a cheap self-heal after a reorder), and pinned-set
     * changes, not continuously.
     */
    setPinnedSticky(enabled: boolean): void {
        if (this._pinnedSticky === enabled) {
            return;
        }
        this._pinnedSticky = enabled;
        this._applyPinnedSticky();
    }

    /**
     * Freeze the pinned (overflow-excluded) tabs to the left edge: give each the
     * `dv-tab--pinned-sticky` class and a `--dv-pinned-sticky-left` offset so the
     * CSS `position: sticky` rule holds it in place as the strip scrolls. Clears
     * the styling from any tab that is no longer pinned, and from all tabs when
     * the feature is off.
     */
    private _applyPinnedSticky(): void {
        const pinned = this._pinnedSticky
            ? this._tabs.filter((tab) =>
                  this._overflowExclude(tab.value.panel.id)
              )
            : [];

        // Nothing pinned and nothing was ever styled, so bail before touching
        // the DOM. Keeps the common (feature-off) refreshOverflow path free.
        if (pinned.length === 0 && !this._hasPinnedStickyStyling) {
            return;
        }

        // Strip every existing sticky styling before measuring. `offsetLeft` on
        // a tab that still carries `position: sticky` reports its *stuck*
        // (frozen/scrolled) position, not its natural in-flow left, so reading
        // it here and feeding it back into `--dv-pinned-sticky-left` makes the
        // offset compound on each recompute and the pinned block drifts to the
        // right edge (it ends up rendering last instead of first). Removing the
        // class first drops the tabs back to static flow so the reads below are
        // clean. This also clears stale styling from now-unpinned tabs.
        for (const tab of this._tabs) {
            const el = tab.value.element;
            if (el.classList.contains('dv-tab--pinned-sticky')) {
                el.classList.remove('dv-tab--pinned-sticky');
                el.style.removeProperty('--dv-pinned-sticky-left');
            }
        }

        if (pinned.length === 0) {
            this._hasPinnedStickyStyling = false;
            return;
        }

        // Read every natural position before writing. The first `offsetLeft`
        // read flushes the class removals above, so all reads are unstuck.
        // `offsetLeft` (relative to the positioned `.dv-tabs-container`) is each
        // tab's in-flow left *including* the preceding tabs' margins, so the
        // frozen block keeps the theme's tab spacing; a bare width sum would
        // collapse the gaps in spaced themes.
        const lefts = pinned.map((tab) => tab.value.element.offsetLeft);
        pinned.forEach((tab, index) => {
            const el = tab.value.element;
            el.classList.add('dv-tab--pinned-sticky');
            el.style.setProperty(
                '--dv-pinned-sticky-left',
                `${lefts[index]}px`
            );
        });
        this._hasPinnedStickyStyling = true;
    }

    get showTabsOverflowControl(): boolean {
        return this._showTabsOverflowControl;
    }

    set showTabsOverflowControl(value: boolean) {
        if (this._showTabsOverflowControl == value) {
            return;
        }

        this._showTabsOverflowControl = value;

        if (value) {
            const observer = new OverflowObserver(this._tabsList);

            this._observerDisposable.value = new CompositeDisposable(
                observer,
                observer.onDidChange((event) => {
                    const hasOverflow = event.hasScrollX || event.hasScrollY;
                    this.toggleDropdown({ reset: !hasOverflow });
                    // A resize can change tab widths, so refresh sticky offsets.
                    this._applyPinnedSticky();
                    if (this._tabGroupManager.groupUnderlines.size > 0) {
                        this._tabGroupManager.positionUnderlines();
                    }
                }),
                addDisposableListener(this._tabsList, 'scroll', () => {
                    this.toggleDropdown({ reset: false });
                    // Cheap self-heal: re-assert sticky offsets on scroll (the
                    // only time they are visible) so any prior reorder settles.
                    this._applyPinnedSticky();
                    if (this._tabGroupManager.groupUnderlines.size > 0) {
                        this._tabGroupManager.positionUnderlines();
                    }
                })
            );
        } else {
            // Disabling the control at runtime must tear down the observer and
            // scroll listener, otherwise they keep firing toggleDropdown (which
            // bypasses the refreshOverflow flag guard) and leak until disposal.
            this._observerDisposable.value = Disposable.NONE;
        }
    }

    get element(): HTMLElement {
        return this._element;
    }

    /**
     * The scrollable tab list (`.dv-tabs-container`) holding the tab elements,
     * exposed (read-only) so the multi-row wrap controller can measure the
     * wrapped row count and toggle the wrap class. Not the outer header element.
     */
    get tabsListElement(): HTMLElement {
        return this._tabsList;
    }

    set voidContainer(el: HTMLElement | null) {
        this._voidContainerListeners?.dispose();
        this._voidContainerListeners = null;
        this._reorder.voidContainerElement = el;

        if (el) {
            this._voidContainerListeners = new CompositeDisposable(
                addDisposableListener(el, 'dragover', (event) => {
                    if (this._animState) {
                        event.preventDefault();
                    }
                }),
                addDisposableListener(el, 'drop', (event) => {
                    if (
                        this._animState?.sourceTabGroupId &&
                        this._animState.currentInsertionIndex !== null
                    ) {
                        event.preventDefault();
                        event.stopPropagation();
                        this.handleVoidDrop();
                    }
                })
            );
        }
    }

    /**
     * Handle a drop that occurred on the void container (empty header
     * space to the right of the tabs). Returns `true` if the drop was
     * consumed by an active group drag, `false` otherwise.
     */
    handleVoidDrop(): boolean {
        if (!this._animState?.sourceTabGroupId) {
            return false;
        }
        const sourceTabGroupId = this._animState.sourceTabGroupId;
        const insertionIndex =
            this._animState.currentInsertionIndex ?? this._tabs.length;
        this._animState = null;
        this._commitGroupMove(sourceTabGroupId, insertionIndex);
        return true;
    }

    get panels(): string[] {
        return this._tabs.map((_) => _.value.panel.id);
    }

    get size(): number {
        return this._tabs.length;
    }

    get tabs(): Tab[] {
        return this._tabs.map((_) => _.value);
    }

    get direction(): DockviewHeaderDirection {
        return this._direction;
    }

    set direction(value: DockviewHeaderDirection) {
        if (this._direction === value) {
            return;
        }

        this._direction = value;
        this._tabsList.setAttribute(
            'aria-orientation',
            value === 'vertical' ? 'vertical' : 'horizontal'
        );
        if (this._scrollbar) {
            this._scrollbar.orientation = value;
        }
        removeClasses(this._tabsList, 'dv-horizontal', 'dv-vertical');
        if (value === 'vertical') {
            addClasses(
                this._tabsList,
                'dv-tabs-container-vertical',
                'dv-vertical'
            );
        } else {
            removeClasses(this._tabsList, 'dv-tabs-container-vertical');
            addClasses(this._tabsList, 'dv-horizontal');
        }

        for (const tab of this._tabs) {
            tab.value.setDirection(value);
        }
        this._tabGroupManager.updateDirection();
    }

    constructor(
        private readonly group: DockviewGroupPanel,
        private readonly accessor: DockviewComponent,
        options: {
            showTabsOverflowControl: boolean;
        }
    ) {
        super();

        this._tabsList = document.createElement('div');
        this._tabsList.className = 'dv-tabs-container';
        // WAI-ARIA Tabs pattern: the strip of tabs is the tablist.
        this._tabsList.setAttribute('role', 'tablist');
        this._tabsList.setAttribute(
            'aria-orientation',
            this._direction === 'vertical' ? 'vertical' : 'horizontal'
        );

        this.showTabsOverflowControl = options.showTabsOverflowControl;

        if (accessor.options.scrollbars === 'native') {
            this._element = this._tabsList;
        } else {
            this._scrollbar = new Scrollbar(this._tabsList);
            this._scrollbar.orientation = this.direction;
            this._element = this._scrollbar.element;
            this.addDisposables(this._scrollbar);
        }

        this._tabGroupManager = new TabGroupManager(
            {
                group: this.group,
                accessor: this.accessor,
                tabsList: this._tabsList,
                getTabs: () => this._tabs,
                getTabMap: () => this._tabMap,
                getDirection: () => this._direction,
            },
            {
                onChipContextMenu: (tabGroup, event) => {
                    this.accessor.contextMenuService?.showForChip(
                        tabGroup,
                        this.group,
                        event
                    );
                },
                onChipDragStart: (tabGroup, chip, event) => {
                    this._handleChipDragStart(tabGroup, chip, event);
                },
                onChipDragEnd: () => {
                    // HTML5 chip dragend (incl. cancels). The Html5DragSource
                    // owns the listener on the chip element, so this fires
                    // even if the chip was detached cross-group; the
                    // element keeps its listeners until the source is
                    // disposed. resetDragAnimation is a no-op after a
                    // successful drop (anim state already null) thanks to
                    // the gating inside it.
                    this._reorder.resetDragAnimation();
                },
                onChipDrop: (tabGroup, event) => {
                    this._handleChipDrop(tabGroup, event);
                },
            }
        );

        this._reorder = new TabReorderController(this);

        this.addDisposables(
            this._onOverflowTabsChange,
            this._observerDisposable,
            this._pointerActivation,
            this._onWillShowOverlay,
            this._onDrop,
            this._onTabDragStart,
            this._reorder,
            // Pointer-side cleanup: when any pointer drag ends, tear
            // down smooth-reorder anim state the dragover bridge may
            // have installed. The chip's pointer drag source handles
            // its own transfer payload + iframe-shield cleanup.
            PointerDragController.getInstance().onDragEnd((e) => {
                this._reorder.handlePointerDragEnd(e);
            }),
            // Pointer-event mirror of the HTML5 dragover / dragleave handlers
            // below. Drives smooth-reorder for `dndStrategy: 'pointer'` and
            // for touch drags in `'auto'`.
            PointerDragController.getInstance().onDragMove((e) => {
                this._reorder.handlePointerDragMove(e.clientX, e.clientY);
            }),
            addDisposableListener(this.element, 'pointerdown', (event) => {
                if (event.defaultPrevented) {
                    return;
                }

                const isLeftClick = event.button === 0;

                if (isLeftClick) {
                    this.accessor.doSetGroupActive(this.group);
                }
            }),
            // Trackpad / wheel forwarding. The strip scrolls along its own
            // axis (x for horizontal headers, y for vertical), so deltaY
            // from a plain mouse wheel maps onto the strip's axis too,
            // giving the VS Code-style "scroll over tab bar to page
            // through tabs" feel. We only consume the event when the strip
            // is actually overflowing in the direction the user wheeled in,
            // so a wheel at the edge of a non-overflowing strip still
            // bubbles up and scrolls the page. `{ passive: false }` is
            // required because we call preventDefault().
            addDisposableListener(
                this._tabsList,
                'wheel',
                (event) => {
                    const isVertical = this._direction === 'vertical';
                    const primary = isVertical
                        ? event.deltaY || event.deltaX
                        : event.deltaX || event.deltaY;
                    if (primary === 0) {
                        return;
                    }
                    const max = isVertical
                        ? this._tabsList.scrollHeight -
                          this._tabsList.clientHeight
                        : this._tabsList.scrollWidth -
                          this._tabsList.clientWidth;
                    if (max <= 0) {
                        return;
                    }
                    const current = isVertical
                        ? this._tabsList.scrollTop
                        : this._tabsList.scrollLeft;
                    // At the edge in the wheel direction: let the page
                    // scroll instead of trapping the gesture.
                    if (
                        (primary < 0 && current <= 0) ||
                        (primary > 0 && current >= max)
                    ) {
                        return;
                    }
                    event.preventDefault();
                    // Custom-scrollbar mode wraps the tabs list and installs
                    // its own wheel listener that rewrites scrollLeft from a
                    // deltaY-only tracker. Without stopPropagation that
                    // handler would clobber our deltaX-aware update.
                    event.stopPropagation();
                    if (isVertical) {
                        this._tabsList.scrollTop = current + primary;
                    } else {
                        this._tabsList.scrollLeft = current + primary;
                    }
                },
                { passive: false }
            ),
            // WAI-ARIA Tabs keyboard pattern: arrow keys move the roving
            // focus along the strip, Home/End jump to the ends, and
            // Enter/Space activate the focused tab (manual activation, so
            // arrowing through tabs doesn't switch panels until committed).
            addDisposableListener(this._tabsList, 'keydown', (event) => {
                this._onKeyDown(event);
            }),
            addDisposableListener(
                this._tabsList,
                'dragover',
                (event) => {
                    if (
                        this._reorder.processDragOver(
                            event.clientX,
                            event.clientY
                        )
                    ) {
                        // Allow `drop` to fire on the tabs list container.
                        event.preventDefault();
                    }
                },
                true
            ),
            addDisposableListener(
                this._tabsList,
                'dragleave',
                (event) => {
                    this._reorder.processDragLeave(
                        event.relatedTarget as Element | null
                    );
                },
                true
            ),
            addDisposableListener(this._tabsList, 'dragend', () => {
                this._reorder.resetDragAnimation();
            }),
            addDisposableListener(
                this._tabsList,
                'drop',
                (event) => {
                    if (
                        !this._animState ||
                        this._animState.currentInsertionIndex === null
                    ) {
                        return;
                    }

                    // In non-smooth mode only handle group drags here;
                    // individual tab drops are handled by tab Droptargets.
                    if (
                        this.accessor.options.theme?.tabAnimation !==
                            'smooth' &&
                        !this._animState.sourceTabGroupId
                    ) {
                        return;
                    }

                    event.stopPropagation();
                    event.preventDefault();

                    // The capturing stopPropagation above prevents the
                    // individual tab's Droptarget.onDrop from firing, so
                    // the anchor overlay won't be cleared by that path.
                    // Clear it explicitly here before processing the drop.
                    this.group.model.dropTargetContainer?.model?.clear();

                    const animState = this._animState;
                    this._animState = null;
                    this._pendingCollapse = false;

                    // Handle group drag (entire group repositioned)
                    if (animState.sourceTabGroupId) {
                        this._commitGroupMove(
                            animState.sourceTabGroupId,
                            animState.currentInsertionIndex as number
                        );
                        return;
                    }

                    const insertionIndex =
                        animState.currentInsertionIndex as number;
                    const sourceIndex = animState.sourceIndex;
                    const adjustedIndex =
                        insertionIndex -
                        (sourceIndex !== -1 && sourceIndex < insertionIndex
                            ? 1
                            : 0);

                    const sourceCurrentGroup =
                        this.group.model.getTabGroupForPanel(
                            animState.sourceTabId
                        );
                    if (
                        adjustedIndex === sourceIndex &&
                        !animState.targetTabGroupId &&
                        !sourceCurrentGroup
                    ) {
                        this._reorder.uncollapseSourceTab(
                            animState.sourceTabId
                        );
                        this.resetTabTransforms();
                        return;
                    }

                    this._reorder.uncollapseSourceTab(animState.sourceTabId);

                    const firstPositions = this.snapshotTabPositions();
                    this.resetTabTransforms();
                    this._onDrop.fire({
                        event,
                        index: adjustedIndex,
                        targetTabGroupId: animState.targetTabGroupId,
                    });
                    this.runFlipAnimation(
                        firstPositions,
                        animState.sourceTabId,
                        animState.sourceIndex === -1,
                        {
                            from: Math.min(sourceIndex, adjustedIndex),
                            to: Math.max(sourceIndex, adjustedIndex),
                        }
                    );
                },
                true
            ),
            Disposable.from(() => {
                this._voidContainerListeners?.dispose();
                this._reorder.resetDragAnimation();
                this._tabGroupManager.disposeAll();

                for (const { value, disposable } of this._tabs) {
                    disposable.dispose();
                    value.dispose();
                }

                this._tabs = [];
                this._tabMap.clear();
            })
        );
    }

    indexOf(id: string): number {
        return this._tabs.findIndex((tab) => tab.value.panel.id === id);
    }

    /** DOM id of the tab element for a panel, used for the tabpanel's `aria-labelledby`. */
    getTabId(panelId: string): string | undefined {
        return this._tabMap.get(panelId)?.value.element.id;
    }

    /** Inverse of {@link getTabId}: the panel whose tab owns `element` (the tab
     *  itself or any descendant of it), or `undefined` for non-tab targets. */
    getPanelForTab(element: Element): IDockviewPanel | undefined {
        for (const { value } of this._tabs) {
            if (value.element === element || value.element.contains(element)) {
                return value.panel;
            }
        }
        return undefined;
    }

    isActive(tab: Tab): boolean {
        return (
            this.selectedIndex > -1 &&
            this._tabs[this.selectedIndex].value === tab
        );
    }

    private _onKeyDown(event: KeyboardEvent): void {
        // Only handle when a tab element itself is focused; never hijack keys
        // typed inside a custom tab renderer's own controls (inputs etc.).
        const index = this._tabs.findIndex(
            (tab) => tab.value.element === event.target
        );
        if (index === -1) {
            return;
        }

        const isVertical = this._direction === 'vertical';
        const nextKey = isVertical ? 'ArrowDown' : 'ArrowRight';
        const prevKey = isVertical ? 'ArrowUp' : 'ArrowLeft';
        const last = this._tabs.length - 1;

        switch (event.key) {
            case nextKey:
                event.preventDefault();
                this._focusTab(Math.min(index + 1, last));
                break;
            case prevKey:
                event.preventDefault();
                this._focusTab(Math.max(index - 1, 0));
                break;
            case 'Home':
                event.preventDefault();
                this._focusTab(0);
                break;
            case 'End':
                event.preventDefault();
                this._focusTab(last);
                break;
            case 'Enter':
            case ' ':
                // Manual activation of the focused tab.
                event.preventDefault();
                this.accessor.withOrigin('user', () =>
                    this._tabs[index].value.panel.api.setActive()
                );
                break;
            case 'Delete':
            case 'Backspace':
                // Close the focused tab (Backspace covers macOS, where the
                // primary delete key reports as Backspace).
                event.preventDefault();
                this._closeTab(index);
                break;
        }
    }

    /**
     * Close the tab at `index` and move roving focus to a neighbouring tab so
     * keyboard focus stays in the tablist.
     */
    private _closeTab(index: number): void {
        const tab = this._tabs[index]?.value;
        if (!tab) {
            return;
        }
        // Resolve the post-close focus target before closing mutates the list:
        // prefer the next tab, otherwise the previous.
        const neighbourId = (
            this._tabs[index + 1]?.value ?? this._tabs[index - 1]?.value
        )?.panel.id;

        tab.panel.api.close();

        if (neighbourId !== undefined) {
            const nextIndex = this._tabs.findIndex(
                (t) => t.value.panel.id === neighbourId
            );
            if (nextIndex > -1) {
                this._focusTab(nextIndex);
            }
        }
    }

    /** Move the roving focus to the tab at `index` (updates tabindex + DOM focus). */
    private _focusTab(index: number): void {
        for (let i = 0; i < this._tabs.length; i++) {
            this._tabs[i].value.element.tabIndex = i === index ? 0 : -1;
        }
        this._tabs[index].value.element.focus();
    }

    /** Move DOM focus to the active tab, the entry point into the tablist. */
    focusActiveTab(): void {
        if (this._tabs.length === 0) {
            return;
        }
        const activeId = this.group.activePanel?.id;
        const activeIndex = activeId
            ? this._tabs.findIndex((t) => t.value.panel.id === activeId)
            : -1;
        this._focusTab(activeIndex > -1 ? activeIndex : 0);
    }

    setActivePanel(panel: IDockviewPanel): void {
        const isVertical = this._direction === 'vertical';

        for (const tab of this._tabs) {
            const isActivePanel = panel.id === tab.value.panel.id;
            tab.value.setActive(isActivePanel);

            if (isActivePanel) {
                this._scrollTabIntoView(tab.value.element, isVertical);
            }
        }

        // Reposition underlines so the wrap-around follows the new active tab
        if (this._tabGroupManager.groupUnderlines.size > 0) {
            this._tabGroupManager.positionUnderlines();
        }
    }

    /**
     * Scroll the active tab into view within its scroll container. Uses the
     * element's own offset (relative to the container) rather than accumulating
     * tab client sizes, which omits tab margins and any in-flow group chips
     * between tabs and so undershoots the active tab's real position.
     */
    private _scrollTabIntoView(
        element: HTMLElement,
        isVertical: boolean
    ): void {
        const parentElement = element.parentElement;
        if (!parentElement) {
            return;
        }

        const start = isVertical ? element.offsetTop : element.offsetLeft;
        const size = isVertical ? element.offsetHeight : element.offsetWidth;
        const scrollStart = isVertical
            ? parentElement.scrollTop
            : parentElement.scrollLeft;
        const clientSize = isVertical
            ? parentElement.clientHeight
            : parentElement.clientWidth;

        if (start < scrollStart || start + size > scrollStart + clientSize) {
            if (isVertical) {
                parentElement.scrollTop = start;
            } else {
                parentElement.scrollLeft = start;
            }
        }
    }

    /**
     * Activate a tab in response to a plain (non-shift) left pointerdown.
     *
     * With the HTML5 drag backend the tab is natively `draggable`, and a native
     * drag arms from the same pointerdown+move gesture. Firefox aborts that
     * pending drag if the pointerdown also moves focus / relayouts the tab strip
     * synchronously — which `openPanel` does — so a drag started on an inactive
     * tab never begins (issue #932). Defer the activation past the frame so
     * `dragstart` arms first; a plain click (no drag) still activates on the
     * next frame, which is imperceptible. The pointer backend has no native drag
     * to pre-empt, so it activates synchronously as before.
     */
    private _activateOnPointerDown(panel: IDockviewPanel): void {
        if (!resolveDndCapabilities(this.accessor.options).html5) {
            this.group.model.openPanel(panel);
            return;
        }

        const handle = requestAnimationFrame(() => {
            // The panel's tab may have been removed within the deferred frame;
            // only activate a panel this strip still owns.
            if (this._tabMap.has(panel.id)) {
                this.group.model.openPanel(panel);
            }
        });
        this._pointerActivation.value = {
            dispose: () => cancelAnimationFrame(handle),
        };
    }

    openPanel(panel: IDockviewPanel, index: number = this._tabs.length): void {
        if (this._tabMap.has(panel.id)) {
            return;
        }
        const tab = new Tab(panel, this.accessor, this.group);
        tab.setContent(panel.view.tab);
        if (this._direction !== 'horizontal') {
            tab.setDirection(this._direction);
        }

        const disposable = new CompositeDisposable(
            tab.onDragStart((event) => {
                this._onTabDragStart.fire({ nativeEvent: event, panel });

                // Both HTML5 and pointer drags initialize _animState. Cleanup
                // is wired in both paths: HTML5 via dragend/drop on _tabsList,
                // pointer via PointerDragController.onDragEnd subscriptions.
                if (this.accessor.options.theme?.tabAnimation === 'smooth') {
                    const tabWidth = tab.element.getBoundingClientRect().width;
                    const sourceIndex = this._tabs.findIndex(
                        (x) => x.value === tab
                    );

                    this._animState = {
                        sourceTabId: panel.id,
                        sourceIndex,
                        tabPositions: this.snapshotTabPositions(),
                        chipPositions:
                            this._tabGroupManager.snapshotChipWidths(),
                        currentInsertionIndex: null,
                        targetTabGroupId: null,
                        sourceTabGroupId: null,
                        sourceGroupPanelIds: null,
                        sourceChipWidth: 0,
                        cursorOffsetFromDragLeft: tabWidth / 2,
                        sourceGapWidth: tabWidth,
                        containerLeft:
                            this._tabsList.getBoundingClientRect().left,
                    };

                    // Collapse the source tab after the browser captures the
                    // drag image, then open the gap at the source position in
                    // the same paint frame, so there's no visual jump.
                    // Both collapse and gap must be instant (no transition).
                    // In wrap mode there is no gap (the 1-D transforms no-op),
                    // and collapsing the source would reflow the wrapped rows
                    // mid-drag under the 2-D hit-test, so skip the collapse and
                    // leave the source in place.
                    this._pendingCollapse = true;
                    requestAnimationFrame(() => {
                        this._pendingCollapse = false;
                        if (!this._animState) {
                            return;
                        }
                        const wrap = this._tabsList.classList.contains(
                            OVERFLOW_WRAP_TABS_CLASS
                        );
                        if (!wrap) {
                            tab.element.style.transition = 'none';
                            toggleClass(tab.element, 'dv-tab--dragging', true);
                            void tab.element.offsetHeight; // force reflow
                        }

                        this._animState.currentInsertionIndex ??= sourceIndex;
                        // Apply gap with transitions disabled on the target
                        // (no-op in wrap).
                        this.applyDragOverTransforms(true);

                        // Re-enable transitions for subsequent moves
                        tab.element.style.removeProperty('transition');
                    });
                }
            }),
            tab.onTabClick((event) => {
                if (event.defaultPrevented) {
                    return;
                }
                if (this.group.api.location.type !== 'edge') {
                    return;
                }
                if (this.group.activePanel === panel) {
                    // Clicking the active tab toggles expansion
                    if (this.group.api.isCollapsed()) {
                        this.group.api.expand();
                    } else {
                        this.group.api.collapse();
                    }
                } else {
                    // Clicking a non-active tab switches the active tab.
                    // If the group is collapsed, also expand it.
                    this.group.model.openPanel(panel);
                    if (this.group.api.isCollapsed()) {
                        this.group.api.expand();
                    }
                }
            }),
            tab.onPointerDown((event) => {
                if (event.defaultPrevented) {
                    return;
                }

                const isFloatingGroupsEnabled =
                    !this.accessor.options.disableFloatingGroups;

                const isFloatingWithOnePanel =
                    this.group.api.location.type === 'floating' &&
                    this.size === 1;

                if (
                    isFloatingGroupsEnabled &&
                    !isFloatingWithOnePanel &&
                    event.shiftKey
                ) {
                    event.preventDefault();

                    const panel = this.accessor.getGroupPanel(tab.panel.id);

                    const { top, left } = tab.element.getBoundingClientRect();
                    const { top: rootTop, left: rootLeft } =
                        this.accessor.element.getBoundingClientRect();

                    this.accessor.addFloatingGroup(panel as DockviewPanel, {
                        x: left - rootLeft,
                        y: top - rootTop,
                        inDragMode: true,
                    });
                    return;
                }

                // Edge groups are skipped here: all their tab interaction
                // is handled by onTabClick to avoid race conditions with
                // active panel state.
                if (
                    event.button === 0 &&
                    this.group.api.location.type !== 'edge' &&
                    this.group.activePanel !== panel
                ) {
                    this._activateOnPointerDown(panel);
                }
            }),
            tab.onDrop((event) => {
                const animState = this._animState;
                this._animState = null;
                this._pendingCollapse = false;

                const tabIndex = this._tabs.findIndex((x) => x.value === tab);
                if (animState) {
                    const dropIndex =
                        event.position === 'right' ? tabIndex + 1 : tabIndex;

                    if (animState.sourceTabGroupId) {
                        this._commitGroupMove(
                            animState.sourceTabGroupId,
                            animState.currentInsertionIndex ?? dropIndex
                        );
                        return;
                    }

                    this._reorder.uncollapseSourceTab(animState.sourceTabId);

                    const firstPositions = this.snapshotTabPositions();
                    this.resetTabTransforms();

                    this._onDrop.fire({
                        event: event.nativeEvent,
                        index: dropIndex,
                        targetTabGroupId: animState.targetTabGroupId,
                    });

                    if (
                        this.accessor.options.theme?.tabAnimation === 'smooth'
                    ) {
                        this.runFlipAnimation(
                            firstPositions,
                            animState.sourceTabId,
                            animState.sourceIndex === -1,
                            animState.sourceIndex === -1
                                ? undefined
                                : {
                                      from: Math.min(
                                          animState.sourceIndex,
                                          dropIndex
                                      ),
                                      to: Math.max(
                                          animState.sourceIndex,
                                          dropIndex
                                      ),
                                  }
                        );
                    }
                } else {
                    // Compute insertion index based on which half of the tab
                    // the pointer is over, then adjust for same-group removal:
                    // when the source tab sits before the insertion point,
                    // removing it shifts all subsequent indices down by one.
                    const afterPosition =
                        this._direction === 'vertical' ? 'bottom' : 'right';
                    const insertionIndex =
                        event.position === afterPosition
                            ? tabIndex + 1
                            : tabIndex;
                    const data = getPanelData();
                    const sourceIndex = data
                        ? this._tabs.findIndex(
                              (x) => x.value.panel.id === data.panelId
                          )
                        : -1;
                    const adjustedIndex =
                        insertionIndex -
                        (sourceIndex !== -1 && sourceIndex < insertionIndex
                            ? 1
                            : 0);
                    const targetTabGroupId =
                        this.group.model.getTabGroupForPanel(tab.panel.id)
                            ?.id ?? null;
                    this._onDrop.fire({
                        event: event.nativeEvent,
                        index: adjustedIndex,
                        targetTabGroupId,
                    });
                }
            }),
            tab.onWillShowOverlay((event) => {
                this._onWillShowOverlay.fire(
                    new DockviewWillShowOverlayLocationEvent(event, {
                        kind: 'tab',
                        panel: this.group.activePanel,
                        api: this.accessor.api,
                        group: this.group,
                        getData: getPanelData,
                    })
                );
            })
        );

        const value: IValueDisposable<Tab> = { value: tab, disposable };

        this.addTab(value, index);

        // A new tab may have been inserted between a chip and its
        // group's first tab, so reposition all chips to stay correct.
        this._tabGroupManager.positionAllChips();

        // If a tab was added during active drag, refresh positions
        if (this._animState) {
            this._animState.tabPositions = this.snapshotTabPositions();
            this._animState.chipPositions =
                this._tabGroupManager.snapshotChipWidths();
            this.applyDragOverTransforms();
        }
    }

    delete(id: string): void {
        if (this._animState?.sourceTabId === id) {
            this.resetTabTransforms();
            this._animState = null;
        }

        // Force-clean any pending transitionend listener
        this._tabGroupManager.cleanupTransition(id);

        const index = this.indexOf(id);
        const tabToRemove = this._tabs.splice(index, 1)[0];
        this._tabMap.delete(id);

        if (tabToRemove) {
            const { value, disposable } = tabToRemove;

            disposable.dispose();
            value.dispose();
            value.element.remove();
        }

        // If a non-source tab was removed during active drag, refresh positions
        if (this._animState) {
            this._animState.tabPositions = this.snapshotTabPositions();
            this._animState.chipPositions =
                this._tabGroupManager.snapshotChipWidths();
            this.applyDragOverTransforms();
        }
    }

    private addTab(
        tab: IValueDisposable<Tab>,
        index: number = this._tabs.length
    ): void {
        if (index < 0 || index > this._tabs.length) {
            throw new Error('invalid location');
        }

        // Use the tab element at `index` as the reference node rather than
        // `children[index]`, because `_tabsList` may contain non-tab children
        // (e.g. group chips, underlines) that shift the DOM indices.
        const refNode =
            index < this._tabs.length ? this._tabs[index].value.element : null;
        this._tabsList.insertBefore(tab.value.element, refNode);

        this._tabs = [
            ...this._tabs.slice(0, index),
            tab,
            ...this._tabs.slice(index),
        ];
        this._tabMap.set(tab.value.panel.id, tab);

        if (this.selectedIndex < 0) {
            this.selectedIndex = index;
        }
    }

    private toggleDropdown(options: { reset: boolean }): void {
        // Surplus tabs forced past the wrap row cap must land in the dropdown
        // even on a reset: in wrap mode nothing clips horizontally, so the
        // `OverflowObserver` reports no overflow and asks for a reset every time.
        const hasForced = this._tabs.some(
            (tab) =>
                !this._overflowExclude(tab.value.panel.id) &&
                this._forcedOverflow(tab.value.panel.id)
        );

        if (options.reset && !hasForced) {
            this._onOverflowTabsChange.fire({
                tabs: [],
                tabGroups: [],
                pinnedTabs: [],
                reset: true,
            });
            return;
        }

        const tabs = this._tabs
            .filter(
                (tab) =>
                    !this._overflowExclude(tab.value.panel.id) &&
                    (this._forcedOverflow(tab.value.panel.id) ||
                        (!options.reset &&
                            !isChildEntirelyVisibleWithinParent(
                                tab.value.element,
                                this._tabsList
                            )))
            )
            .map((x) => x.value.panel.id);

        // Pinned (overflow-excluded) tabs are normally kept out of the dropdown
        // entirely. The exception is when the pinned block *itself* overflows:
        // a pinned tab that is laid out (has width) yet clipped is unreachable
        // in the strip, so it is surfaced in a "Pinned" section at the top of
        // the dropdown. A zero-width tab is not clipped-but-hidden; it is a
        // pinned tab whose main-strip copy is display:none (separate-row mode,
        // where the row already provides access), so it is skipped.
        const pinnedTabs = options.reset
            ? []
            : this._tabs
                  .filter(
                      (tab) =>
                          this._overflowExclude(tab.value.panel.id) &&
                          tab.value.element.getBoundingClientRect().width > 0 &&
                          !isChildEntirelyVisibleWithinParent(
                              tab.value.element,
                              this._tabsList
                          )
                  )
                  .map((x) => x.value.panel.id);

        // Detect tab groups whose chip is clipped or whose tabs are all
        // in the overflow set (e.g. collapsed groups scrolled out of view).
        const overflowTabSet = new Set(tabs);
        const tabGroups: string[] = [];

        for (const tg of this.group.model.getTabGroups()) {
            const chipEntry = this._tabGroupManager.chipRenderers.get(tg.id);
            const chipClipped =
                chipEntry &&
                !isChildEntirelyVisibleWithinParent(
                    chipEntry.chip.element,
                    this._tabsList
                );

            // A group is in overflow if its chip is clipped OR all its
            // visible tabs are in the overflow set.
            const allTabsOverflow =
                tg.panelIds.length > 0 &&
                tg.panelIds.every((pid) => overflowTabSet.has(pid));

            if (chipClipped || allTabsOverflow) {
                tabGroups.push(tg.id);

                // For collapsed groups whose chip is clipped, ensure all
                // member tabs are included in the overflow list so they appear
                // in the dropdown. Pinned members are not excluded here: a
                // collapsed group's members aren't rendered as visible tabs, so
                // the dropdown is their only reachable path, and excluding a
                // pinned one would make it unreachable.
                if (tg.collapsed) {
                    for (const pid of tg.panelIds) {
                        if (!overflowTabSet.has(pid)) {
                            overflowTabSet.add(pid);
                            tabs.push(pid);
                        }
                    }
                }
            }
        }

        this._onOverflowTabsChange.fire({
            tabs,
            tabGroups,
            pinnedTabs,
            reset: false,
        });
    }

    updateDragAndDropState(): void {
        for (const tab of this._tabs) {
            tab.value.updateDragAndDropState();
        }
        this._tabGroupManager.updateDragAndDropState();
    }

    /**
     * Synchronize chip elements and CSS classes for all tab groups
     * in the parent group model. Call after any tab group mutation.
     */
    updateTabGroups(): void {
        this._tabGroupManager.update();
    }

    refreshTabGroupAccent(): void {
        this._tabGroupManager.refreshAccents();
    }

    /**
     * Tabs-list-specific side effects of a chip drag start. The chip's
     * drag sources (constructed by `TabGroupManager`) own the transfer
     * payload, iframe shielding, dataTransfer setup, and the HTML5 drag
     * image. This method just sets up the smooth-reorder anim state and
     * collapses the source-group tabs in the tabs list.
     */
    private _handleChipDragStart(
        tabGroup: ITabGroup,
        chip: ITabGroupChipRenderer,
        event: DragEvent | PointerEvent
    ): void {
        const firstPanelId = tabGroup.panelIds[0];
        const firstIdx = firstPanelId
            ? this._tabs.findIndex((t) => t.value.panel.id === firstPanelId)
            : -1;
        const chipRect = chip.element.getBoundingClientRect();

        // Compute total group width (chip + all tabs)
        let groupGapWidth = chipRect.width;
        for (const pid of tabGroup.panelIds) {
            const tabEntry = this._tabMap.get(pid);
            if (tabEntry) {
                groupGapWidth +=
                    tabEntry.value.element.getBoundingClientRect().width;
            }
        }

        this._animState = {
            sourceTabId: '',
            sourceIndex: firstIdx,
            tabPositions: this.snapshotTabPositions(),
            chipPositions: this._tabGroupManager.snapshotChipWidths(),
            currentInsertionIndex: null,
            targetTabGroupId: null,
            sourceTabGroupId: tabGroup.id,
            sourceGroupPanelIds: new Set(tabGroup.panelIds),
            sourceChipWidth: chipRect.width,
            cursorOffsetFromDragLeft: event.clientX - chipRect.left,
            sourceGapWidth: groupGapWidth,
            containerLeft: this._tabsList.getBoundingClientRect().left,
        };

        if (this.accessor.options.theme?.tabAnimation !== 'smooth') {
            return;
        }

        // Collapse group tabs + chip after the browser captures the drag
        // image, then open the gap at the source position, all instant
        // (no transitions).
        const groupPanelIds = new Set(tabGroup.panelIds);
        this._pendingCollapse = true;
        requestAnimationFrame(() => {
            this._pendingCollapse = false;
            if (!this._animState) {
                return;
            }
            for (const t of this._tabs) {
                if (groupPanelIds.has(t.value.panel.id)) {
                    t.value.element.style.transition = 'none';
                    toggleClass(t.value.element, 'dv-tab--dragging', true);
                }
            }
            const chipEntry = this._tabGroupManager.chipRenderers.get(
                tabGroup.id
            );
            if (chipEntry) {
                chipEntry.chip.element.style.transition = 'none';
                toggleClass(
                    chipEntry.chip.element,
                    'dv-tab-group-chip--dragging',
                    true
                );
            }
            // Single reflow for the entire batch
            void this._tabsList.offsetHeight;

            const underline = this._tabGroupManager.groupUnderlines.get(
                tabGroup.id
            );
            if (underline) {
                underline.style.display = 'none';
            }

            this._animState.currentInsertionIndex ??= firstIdx;
            this.applyDragOverTransforms(true);

            for (const t of this._tabs) {
                if (groupPanelIds.has(t.value.panel.id)) {
                    t.value.element.style.removeProperty('transition');
                }
            }
            if (chipEntry) {
                chipEntry.chip.element.style.removeProperty('transition');
            }
        });
    }

    /**
     * A drop on a tab group chip means "insert before this group". Resolve to
     * the index of the group's first tab, adjusting for same-group removal
     * (when the source tab is currently to the left of the target slot, its
     * removal shifts the insertion index down by one). Always clears
     * `targetTabGroupId` so the dropped tab lands outside the group.
     */
    private _handleChipDrop(tabGroup: ITabGroup, event: DroptargetEvent): void {
        const firstPanelId = tabGroup.panelIds[0];
        if (!firstPanelId) {
            return;
        }
        const insertionIndex = this._tabs.findIndex(
            (x) => x.value.panel.id === firstPanelId
        );
        if (insertionIndex === -1) {
            return;
        }
        const data = getPanelData();
        const sourceIndex =
            data?.groupId === this.group.id && data?.panelId
                ? this._tabs.findIndex((x) => x.value.panel.id === data.panelId)
                : -1;
        const adjustedIndex =
            insertionIndex -
            (sourceIndex !== -1 && sourceIndex < insertionIndex ? 1 : 0);
        this._onDrop.fire({
            event: event.nativeEvent,
            index: adjustedIndex,
            targetTabGroupId: null,
        });
    }

    /**
     * Sets the broader container that is part of the same logical drop surface
     * as this tab list (e.g. the full header element).  When a dragleave from
     * the tabs list lands inside this container, `_animState` is preserved so
     * that external dragover listeners can continue the animation.
     */
    setExtendedDropZone(el: HTMLElement): void {
        this._reorder.setExtendedDropZone(el);
    }

    /**
     * Allows external elements (e.g. void container, left actions) to push an
     * insertion index into the animation while the cursor is outside the tabs
     * list itself.  Pass `null` to clear the indicator.
     */
    setExternalInsertionIndex(index: number | null): void {
        this._reorder.setExternalInsertionIndex(index);
    }

    /**
     * Called when the drag cursor leaves the entire header area (not just the
     * tabs list).  Clears animation state for cross-group drags, which never
     * receive a `dragend` event on this tab list.
     */
    clearExternalAnimState(): void {
        this._reorder.clearExternalAnimState();
    }

    private snapshotTabPositions(): Map<string, DOMRect> {
        return this._reorder.snapshotTabPositions();
    }

    private handleDragOver(event: { clientX: number }): void {
        this._reorder.handleDragOver(event);
    }

    private applyDragOverTransforms(skipTransition = false): void {
        this._reorder.applyDragOverTransforms(skipTransition);
    }

    private resetTabTransforms(): void {
        this._reorder.resetTabTransforms();
    }

    private _commitGroupMove(
        sourceTabGroupId: string,
        insertionIndex: number
    ): void {
        this._reorder.commitGroupMove(sourceTabGroupId, insertionIndex);
    }

    private runFlipAnimation(
        firstPositions: Map<string, DOMRect>,
        sourceTabId: string,
        isCrossGroup: boolean = false,
        animRange?: { from: number; to: number }
    ): void {
        this._reorder.runFlipAnimation(
            firstPositions,
            sourceTabId,
            isCrossGroup,
            animRange
        );
    }
}
