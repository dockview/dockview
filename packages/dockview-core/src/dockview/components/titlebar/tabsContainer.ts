import {
    IDisposable,
    CompositeDisposable,
    Disposable,
    MutableDisposable,
} from '../../../lifecycle';
import { addDisposableListener, Emitter, Event } from '../../../events';
import { Tab } from '../tab/tab';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { VoidContainer } from './voidContainer';
import {
    addClasses,
    findRelativeZIndexParent,
    removeClasses,
    toggleClass,
} from '../../../dom';
import { IDockviewPanel } from '../../dockviewPanel';
import { DockviewComponent } from '../../dockviewComponent';
import { DockviewWillShowOverlayLocationEvent } from '../../events';
import { getPanelData } from '../../../dnd/dataTransfer';
import { Tabs } from './tabs';
import {
    createDropdownElementHandle,
    DropdownElement,
} from './tabOverflowControl';
import { DockviewHeaderDirection } from '../../options';
import { applyTabGroupAccent } from '../../tabGroupAccent';
import { IAdvancedOverflowRenderContext } from '../../moduleContracts';
import { PopupService } from '../popupService';
import { createPinButton } from '../../../svg';

export interface TabDropIndexEvent {
    readonly event: DragEvent | PointerEvent;
    readonly index: number;
    readonly targetTabGroupId?: string | null;
}

export interface TabDragEvent {
    /** Narrow with `instanceof DragEvent` before reading `dataTransfer`. */
    readonly nativeEvent: DragEvent | PointerEvent;
    readonly panel: IDockviewPanel;
}

export interface GroupDragEvent {
    /** Narrow with `instanceof DragEvent` before reading `dataTransfer`. */
    readonly nativeEvent: DragEvent | PointerEvent;
    readonly group: DockviewGroupPanel;
}

export interface ITabsContainer extends IDisposable {
    readonly element: HTMLElement;
    /** The scrollable tab list element (`.dv-tabs-container`); see `Tabs.tabsListElement`. */
    readonly tabsListElement: HTMLElement;
    readonly panels: string[];
    readonly size: number;
    readonly onDrop: Event<TabDropIndexEvent>;
    readonly onTabDragStart: Event<TabDragEvent>;
    readonly onGroupDragStart: Event<GroupDragEvent>;
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent>;
    hidden: boolean;
    direction: DockviewHeaderDirection;
    delete(id: string): void;
    indexOf(id: string): number;
    getTabId(panelId: string): string | undefined;
    getPanelForTab(element: Element): IDockviewPanel | undefined;
    setActive(isGroupActive: boolean): void;
    setActivePanel(panel: IDockviewPanel): void;
    focusActiveTab(): void;
    isActive(tab: Tab): boolean;
    closePanel(panel: IDockviewPanel): void;
    openPanel(panel: IDockviewPanel, index?: number): void;
    setRightActionsElement(element: HTMLElement | undefined): void;
    setLeftActionsElement(element: HTMLElement | undefined): void;
    setPrefixActionsElement(element: HTMLElement | undefined): void;
    show(): void;
    hide(): void;
    updateDragAndDropState(): void;
    updateTabGroups(): void;
    refreshTabGroupAccent(): void;
    setOverflowExclude(fn: (panelId: string) => boolean): void;
    setForcedOverflow(fn: (panelId: string) => boolean): void;
    setPinnedSticky(enabled: boolean): void;
    refreshOverflow(): void;
    setDropIndexResolver(fn: (panelId: string, index: number) => number): void;
    resolveDropIndex(panelId: string, index: number): number;
    setPinnedRow(el: HTMLElement | undefined): void;
}

export class TabsContainer
    extends CompositeDisposable
    implements ITabsContainer
{
    private readonly _element: HTMLElement;
    private readonly tabs: Tabs;
    private readonly rightActionsContainer: HTMLElement;
    private readonly leftActionsContainer: HTMLElement;
    private readonly preActionsContainer: HTMLElement;
    private readonly voidContainer: VoidContainer;

    private rightActions: HTMLElement | undefined;
    private leftActions: HTMLElement | undefined;
    private preActions: HTMLElement | undefined;

    private _hidden = false;
    private _direction: DockviewHeaderDirection = 'horizontal';
    /**
     * Clamps/redirects a header drop index, wired by the PinnedTabs module to
     * keep drops on the correct side of the pin boundary. Identity by default
     * so behaviour is unchanged when the module is absent.
     */
    private _dropIndexResolver: (panelId: string, index: number) => number = (
        _panelId,
        index
    ) => index;
    /** The pinned second-row element (PinnedTabs `separate-row` mode), owned by
     *  the module and mounted here. Undefined when there is no row. */
    private _pinnedRow: HTMLElement | undefined = undefined;

    private dropdownPart: DropdownElement | null = null;
    private _overflowTabs: string[] = [];
    private _overflowTabGroups: string[] = [];
    /** Pinned tabs that have clipped out of the strip, rendered in a "Pinned"
     *  section at the top of the dropdown. Empty unless the PinnedTabs module is
     *  active and the pinned block itself overflows. */
    private _overflowPinnedTabs: string[] = [];
    private readonly _dropdownDisposable = new MutableDisposable();

    private readonly _onDrop = new Emitter<TabDropIndexEvent>();
    readonly onDrop: Event<TabDropIndexEvent> = this._onDrop.event;

    get onTabDragStart(): Event<TabDragEvent> {
        return this.tabs.onTabDragStart;
    }

    private readonly _onGroupDragStart = new Emitter<GroupDragEvent>();
    readonly onGroupDragStart: Event<GroupDragEvent> =
        this._onGroupDragStart.event;

    private readonly _onWillShowOverlay =
        new Emitter<DockviewWillShowOverlayLocationEvent>();
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent> =
        this._onWillShowOverlay.event;

    get panels(): string[] {
        return this.tabs.panels;
    }

    get size(): number {
        return this.tabs.size;
    }

    get hidden(): boolean {
        return this._hidden;
    }

    set hidden(value: boolean) {
        this._hidden = value;
        this.element.style.display = value ? 'none' : '';
    }

    get direction(): DockviewHeaderDirection {
        return this._direction;
    }

    set direction(value: DockviewHeaderDirection) {
        this._direction = value;
        if (value === 'vertical') {
            addClasses(this._element, 'dv-groupview-header-vertical');
            addClasses(
                this.rightActionsContainer,
                'dv-right-actions-container-vertical'
            );
            this.tabs.direction = value;
        } else {
            removeClasses(this._element, 'dv-groupview-header-vertical');
            removeClasses(
                this.rightActionsContainer,
                'dv-right-actions-container-vertical'
            );
            this.tabs.direction = value;
        }
    }

    get element(): HTMLElement {
        return this._element;
    }

    get tabsListElement(): HTMLElement {
        return this.tabs.tabsListElement;
    }

    constructor(
        private readonly accessor: DockviewComponent,
        private readonly group: DockviewGroupPanel
    ) {
        super();

        this._element = document.createElement('div');
        this._element.className = 'dv-tabs-and-actions-container';

        toggleClass(
            this._element,
            'dv-full-width-single-tab',
            this.accessor.options.singleTabMode === 'fullwidth'
        );

        this.rightActionsContainer = document.createElement('div');
        this.rightActionsContainer.className = 'dv-right-actions-container';

        this.leftActionsContainer = document.createElement('div');
        this.leftActionsContainer.className = 'dv-left-actions-container';

        this.preActionsContainer = document.createElement('div');
        this.preActionsContainer.className = 'dv-pre-actions-container';

        this.tabs = new Tabs(group, accessor, {
            showTabsOverflowControl: !accessor.options.disableTabsOverflowList,
        });

        this.voidContainer = new VoidContainer(this.accessor, this.group);
        this.tabs.voidContainer = this.voidContainer.element;

        this._element.appendChild(this.preActionsContainer);
        this._element.appendChild(this.tabs.element);
        this._element.appendChild(this.leftActionsContainer);
        this._element.appendChild(this.voidContainer.element);
        this._element.appendChild(this.rightActionsContainer);

        this.tabs.setExtendedDropZone(this._element);

        this.addDisposables(
            this.tabs.onDrop((e) => this._onDrop.fire(e)),
            this.tabs.onWillShowOverlay((e) => this._onWillShowOverlay.fire(e)),
            accessor.onDidOptionsChange(() => {
                this.tabs.showTabsOverflowControl =
                    !accessor.options.disableTabsOverflowList;
            }),
            this.tabs.onOverflowTabsChange((event) => {
                this.toggleDropdown(event);
            }),
            this.tabs,
            this._onWillShowOverlay,
            this._onDrop,
            this._onGroupDragStart,
            this.voidContainer,
            this.voidContainer.onDragStart((event) => {
                this._onGroupDragStart.fire({
                    nativeEvent: event,
                    group: this.group,
                });
            }),
            this.voidContainer.onDrop((event) => {
                // If an active group drag is in progress, let Tabs handle it
                if (this.tabs.handleVoidDrop()) {
                    return;
                }
                this._onDrop.fire({
                    event: event.nativeEvent,
                    index: this.tabs.size,
                });
            }),
            this.voidContainer.onWillShowOverlay((event) => {
                this._onWillShowOverlay.fire(
                    new DockviewWillShowOverlayLocationEvent(event, {
                        kind: 'header_space',
                        panel: this.group.activePanel,
                        api: this.accessor.api,
                        group: this.group,
                        getData: getPanelData,
                    })
                );
            }),
            addDisposableListener(
                this.leftActionsContainer,
                'dragleave',
                (event) => {
                    const related = event.relatedTarget as HTMLElement | null;
                    if (
                        !this.leftActionsContainer.contains(related) &&
                        !this._element.contains(related)
                    ) {
                        // Left the header entirely
                        this.tabs.clearExternalAnimState();
                    }
                }
            ),
            addDisposableListener(
                this.voidContainer.element,
                'dragleave',
                (event) => {
                    const related = event.relatedTarget as HTMLElement | null;
                    if (!this.voidContainer.element.contains(related)) {
                        if (this._element.contains(related)) {
                            // Moved to another part of the header, so keep state
                            this.tabs.setExternalInsertionIndex(null);
                        } else {
                            // Left the header entirely
                            this.tabs.clearExternalAnimState();
                        }
                    }
                }
            ),
            addDisposableListener(
                this.voidContainer.element,
                'pointerdown',
                (event) => {
                    if (event.defaultPrevented) {
                        return;
                    }

                    const isFloatingGroupsEnabled =
                        !this.accessor.options.disableFloatingGroups;

                    if (
                        isFloatingGroupsEnabled &&
                        event.shiftKey &&
                        this.group.api.location.type !== 'floating' &&
                        this.group.api.location.type !== 'edge'
                    ) {
                        event.preventDefault();

                        const { top, left } =
                            this.element.getBoundingClientRect();
                        const { top: rootTop, left: rootLeft } =
                            this.accessor.element.getBoundingClientRect();

                        this.accessor.addFloatingGroup(this.group, {
                            x: left - rootLeft + 20,
                            y: top - rootTop + 20,
                            inDragMode: true,
                        });
                    }
                }
            )
        );
    }

    show(): void {
        if (!this.hidden) {
            this.element.style.display = '';
        }
    }

    hide(): void {
        this._element.style.display = 'none';
    }

    setRightActionsElement(element: HTMLElement | undefined): void {
        if (this.rightActions === element) {
            return;
        }
        if (this.rightActions) {
            this.rightActions.remove();
            this.rightActions = undefined;
        }
        if (element) {
            this.rightActionsContainer.appendChild(element);
            this.rightActions = element;
        }
    }

    setLeftActionsElement(element: HTMLElement | undefined): void {
        if (this.leftActions === element) {
            return;
        }
        if (this.leftActions) {
            this.leftActions.remove();
            this.leftActions = undefined;
        }
        if (element) {
            this.leftActionsContainer.appendChild(element);
            this.leftActions = element;
        }
    }

    setPrefixActionsElement(element: HTMLElement | undefined): void {
        if (this.preActions === element) {
            return;
        }
        if (this.preActions) {
            this.preActions.remove();
            this.preActions = undefined;
        }
        if (element) {
            this.preActionsContainer.appendChild(element);
            this.preActions = element;
        }
    }

    isActive(tab: Tab): boolean {
        return this.tabs.isActive(tab);
    }

    indexOf(id: string): number {
        return this.tabs.indexOf(id);
    }

    getTabId(panelId: string): string | undefined {
        return this.tabs.getTabId(panelId);
    }

    getPanelForTab(element: Element): IDockviewPanel | undefined {
        return this.tabs.getPanelForTab(element);
    }

    setActive(_isGroupActive: boolean) {
        // noop
    }

    delete(id: string): void {
        this.tabs.delete(id);
        this.updateClassnames();
    }

    setActivePanel(panel: IDockviewPanel): void {
        this.tabs.setActivePanel(panel);
    }

    focusActiveTab(): void {
        this.tabs.focusActiveTab();
    }

    openPanel(panel: IDockviewPanel, index: number = this.tabs.size): void {
        this.tabs.openPanel(panel, index);
        this.updateClassnames();
    }

    closePanel(panel: IDockviewPanel): void {
        this.delete(panel.id);
    }

    setOverflowExclude(fn: (panelId: string) => boolean): void {
        this.tabs.setOverflowExclude(fn);
    }

    setForcedOverflow(fn: (panelId: string) => boolean): void {
        this.tabs.setForcedOverflow(fn);
    }

    setPinnedSticky(enabled: boolean): void {
        this.tabs.setPinnedSticky(enabled);
    }

    refreshOverflow(): void {
        this.tabs.refreshOverflow();
    }

    setPinnedRow(el: HTMLElement | undefined): void {
        if (this._pinnedRow === el) {
            return;
        }
        if (this._pinnedRow) {
            this._pinnedRow.remove();
        }
        this._pinnedRow = el;
        if (el) {
            el.classList.add('dv-pinned-row');
            // `order: -1` (in SCSS) keeps it visually first; the header wraps
            // it onto its own line above the main strip.
            this._element.insertBefore(el, this._element.firstChild);
        }
        toggleClass(
            this._element,
            'dv-tabs-and-actions-container--pinned-row',
            !!el
        );
    }

    setDropIndexResolver(fn: (panelId: string, index: number) => number): void {
        this._dropIndexResolver = fn;
    }

    resolveDropIndex(panelId: string, index: number): number {
        return this._dropIndexResolver(panelId, index);
    }

    private updateClassnames(): void {
        toggleClass(this._element, 'dv-single-tab', this.size === 1);
    }

    private toggleDropdown(options: {
        tabs: string[];
        tabGroups: string[];
        pinnedTabs: string[];
        reset: boolean;
    }): void {
        const tabs = options.reset ? [] : options.tabs;
        const tabGroups = options.reset ? [] : options.tabGroups;
        const pinnedTabs = options.reset ? [] : options.pinnedTabs;
        this._overflowTabs = tabs;
        this._overflowTabGroups = tabGroups;
        this._overflowPinnedTabs = pinnedTabs;

        const totalCount =
            this._overflowTabs.length + this._overflowPinnedTabs.length;

        if (totalCount > 0 && this.dropdownPart) {
            this.dropdownPart.update({ tabs: totalCount });
            return;
        }

        if (totalCount === 0) {
            this._dropdownDisposable.dispose();
            return;
        }

        const root = document.createElement('div');
        root.className = 'dv-tabs-overflow-dropdown-root';

        const part = createDropdownElementHandle();
        part.update({ tabs: totalCount });

        this.dropdownPart = part;

        root.appendChild(part.element);
        this.rightActionsContainer.prepend(root);

        this._dropdownDisposable.value = new CompositeDisposable(
            Disposable.from(() => {
                root.remove();
                this.dropdownPart?.dispose?.();
                this.dropdownPart = null;
            }),
            addDisposableListener(
                root,
                'pointerdown',
                (event) => {
                    event.preventDefault();
                },
                { capture: true }
            ),
            addDisposableListener(root, 'click', (event) => {
                const relativeParent = findRelativeZIndexParent(root);
                const anchor = {
                    x: event.clientX,
                    y: event.clientY,
                    zIndex: relativeParent?.style.zIndex
                        ? `calc(${relativeParent.style.zIndex} * 2)`
                        : undefined,
                };

                const context = this.createOverflowRenderContext(root, anchor);

                // When the AdvancedOverflowModule is registered it upgrades the
                // dropdown in place (search + MRU + keyboard), building and
                // opening the popover itself. Absent (the free path), core
                // renders the flat list and opens it, byte-identical to before.
                const advancedOverflow = this.accessor.advancedOverflowService;
                if (advancedOverflow) {
                    advancedOverflow.renderOverflow({
                        group: this.group,
                        overflowTabs: [...this._overflowTabs],
                        overflowTabGroups: [...this._overflowTabGroups],
                        pinnedOverflowTabs: [...this._overflowPinnedTabs],
                        context,
                    });
                } else {
                    context.open(this.renderFreeOverflowList(context));
                }
            })
        );
    }

    /**
     * Build the core row/header builders + popover control shared by the free
     * overflow list and the advanced overflow module. Everything the module
     * needs to rebuild the dropdown body in a custom order lives here, so the
     * row DOM, group-header DOM, click-to-activate, and (critically) the
     * window-bound popover open/close stay in core, so the module never captures
     * the wrong `window` for a popped-out group.
     */
    private createOverflowRenderContext(
        root: HTMLElement,
        anchor: { x: number; y: number; zIndex?: string }
    ): IAdvancedOverflowRenderContext {
        // Build lookup: panelId → tabGroup for overflow groups.
        const overflowGroupSet = new Set(this._overflowTabGroups);
        const allTabGroups = this.group.model.getTabGroups();
        type OverflowTabGroup = (typeof allTabGroups)[number];
        const panelToGroup = new Map<string, OverflowTabGroup>();
        const groupById = new Map<string, OverflowTabGroup>();
        for (const tg of allTabGroups) {
            groupById.set(tg.id, tg);
            if (overflowGroupSet.has(tg.id)) {
                for (const pid of tg.panelIds) {
                    panelToGroup.set(pid, tg);
                }
            }
        }

        const popup = (): PopupService =>
            this.accessor.getPopupServiceForGroup(this.group);

        const buildGroupHeader = (tg: OverflowTabGroup): HTMLElement => {
            const groupHeader = document.createElement('div');
            groupHeader.className = 'dv-tabs-overflow-group-header';

            const colorDot = document.createElement('span');
            colorDot.className = 'dv-tabs-overflow-group-color';
            applyTabGroupAccent(
                colorDot,
                tg.color,
                this.accessor.tabGroupColorPalette
            );
            groupHeader.appendChild(colorDot);

            const labelSpan = document.createElement('span');
            labelSpan.className = 'dv-tabs-overflow-group-label';
            labelSpan.textContent = tg.label || tg.id;
            groupHeader.appendChild(labelSpan);

            if (tg.collapsed) {
                const badge = document.createElement('span');
                badge.className = 'dv-tabs-overflow-group-collapsed-badge';
                badge.textContent = `${tg.panelIds.length}`;
                groupHeader.appendChild(badge);
            }

            groupHeader.addEventListener('click', () => {
                popup().close();
                if (tg.collapsed) {
                    tg.expand();
                }
                // Activate the first panel in the group.
                const firstPanelId = tg.panelIds[0];
                if (firstPanelId) {
                    const panel = this.group.panels.find(
                        (p) => p.id === firstPanelId
                    );
                    this.accessor.withOrigin('user', () =>
                        panel?.api.setActive()
                    );
                }
            });

            return groupHeader;
        };

        return {
            overflowGroupIdForPanel: (panelId) => panelToGroup.get(panelId)?.id,
            buildGroupHeader: (tabGroupId) => {
                const tg = groupById.get(tabGroupId);
                if (!tg || !overflowGroupSet.has(tg.id)) {
                    return undefined;
                }
                return buildGroupHeader(tg);
            },
            buildPinnedHeader: () => {
                const header = document.createElement('div');
                header.className =
                    'dv-tabs-overflow-group-header dv-tabs-overflow-pinned-header';

                const glyph = createPinButton();
                glyph.classList.add('dv-tabs-overflow-pinned-icon');
                header.appendChild(glyph);

                const labelSpan = document.createElement('span');
                labelSpan.className = 'dv-tabs-overflow-group-label';
                labelSpan.textContent = 'Pinned';
                header.appendChild(labelSpan);

                return header;
            },
            buildRow: (panelId) => {
                const panel = this.group.panels.find((p) => p.id === panelId);
                if (!panel) {
                    return undefined;
                }
                const tab = this.tabs.tabs.find((t) => t.panel.id === panelId);
                const tg = panelToGroup.get(panelId);

                const tabComponent =
                    panel.view.createTabRenderer('headerOverflow');
                const child = tabComponent.element;

                const wrapper = document.createElement('div');
                toggleClass(wrapper, 'dv-tab', true);
                toggleClass(wrapper, 'dv-active-tab', panel.api.isActive);
                toggleClass(wrapper, 'dv-inactive-tab', !panel.api.isActive);
                if (tg) {
                    toggleClass(wrapper, 'dv-tab--grouped', true);
                }

                const doActivate = (): void => {
                    if (tg?.collapsed) {
                        tg.expand();
                    }
                    // `block: 'nearest'` keeps this from scrolling ancestor
                    // scroll containers (incl. the page) vertically; a bare
                    // scrollIntoView() defaults to `block: 'start'`, which
                    // yanks the whole dockview up when it sits low in a
                    // scrollable page. We only want to reveal the tab
                    // horizontally within the tab strip.
                    tab?.element.scrollIntoView({
                        block: 'nearest',
                        inline: 'nearest',
                    });
                    this.accessor.withOrigin('user', () =>
                        panel.api.setActive()
                    );
                };

                wrapper.addEventListener('click', (event) => {
                    popup().close();
                    if (event.defaultPrevented) {
                        return;
                    }
                    doActivate();
                });
                wrapper.appendChild(child);

                return {
                    element: wrapper,
                    panel,
                    activate: () => {
                        popup().close();
                        doActivate();
                    },
                };
            },
            open: (body) => {
                popup().openPopover(body, anchor);
            },
            close: () => popup().close(),
            focusTrigger: () => {
                // The chevron root isn't focusable by default; make it so the
                // Esc-restores-focus behaviour lands somewhere sensible.
                root.tabIndex = -1;
                root.focus();
            },
        };
    }

    /**
     * The free (module-absent) overflow list: the flat `.dv-tabs-overflow-container`
     * body with a group header before the first member tab of each overflow
     * group, in tab (DOM) order. Reuses the shared row/header builders so it
     * stays identical to the advanced path's per-row DOM.
     */
    private renderFreeOverflowList(
        context: IAdvancedOverflowRenderContext
    ): HTMLElement {
        const el = document.createElement('div');
        el.style.overflow = 'auto';
        el.className = 'dv-tabs-overflow-container';

        // Pinned tabs that clipped out of the strip render first, under a
        // dedicated "Pinned" header, so an overflowing pinned block stays
        // reachable ahead of the regular overflow rows. Build the rows first and
        // only add the header if at least one survived (a panel can close
        // between the overflow event and this click), avoiding an orphan header.
        const pinnedRows = this._overflowPinnedTabs
            .map((panelId) => context.buildRow(panelId))
            .filter((row): row is NonNullable<typeof row> => row != null);
        if (pinnedRows.length > 0) {
            el.appendChild(context.buildPinnedHeader());
            for (const row of pinnedRows) {
                el.appendChild(row.element);
            }
        }

        const renderedGroups = new Set<string>();

        for (const tab of this.tabs.tabs.filter((tab) =>
            this._overflowTabs.includes(tab.panel.id)
        )) {
            const tgId = context.overflowGroupIdForPanel(tab.panel.id);

            // If this tab belongs to an overflow group, render the group header
            // before its first member tab.
            if (tgId && !renderedGroups.has(tgId)) {
                renderedGroups.add(tgId);
                const header = context.buildGroupHeader(tgId);
                if (header) {
                    el.appendChild(header);
                }
            }

            const row = context.buildRow(tab.panel.id);
            if (row) {
                el.appendChild(row.element);
            }
        }

        return el;
    }

    updateDragAndDropState(): void {
        this.tabs.updateDragAndDropState();
        this.voidContainer.updateDragAndDropState();
    }

    updateTabGroups(): void {
        this.tabs.updateTabGroups();
    }

    refreshTabGroupAccent(): void {
        this.tabs.refreshTabGroupAccent();
    }
}
