import {
    findRelativeZIndexParent,
    DockviewGroupPanel,
    IDockviewPanel,
    BuiltInChipContextMenuItem,
    ContextMenuItemConfig,
    ContextMenuItem,
    ITabGroup,
    TabGroupColorPalette,
    defineModule,
    IContextMenuHost,
    IContextMenuService,
    IContextMenuItemComponentProps,
    IChipContextMenuItemComponentProps,
} from 'dockview';

function popoverZIndexFor(
    target: EventTarget | null,
    group: DockviewGroupPanel
): string | undefined {
    // A peeking auto-hide edge group slides its active panel out as an overlay
    // (inline z-index 999) with a title bar above it (z-index 1001), both
    // mounted on the shell. A context menu opened from that group's tab strip
    // shares the shell stacking context but anchors *earlier* in DOM order, so
    // at the default overlay z-index it renders behind the peek. The clicked
    // tab isn't a descendant of the peek overlay, so the ancestor walk below
    // can't discover the peek's z-index — key off the peek state directly and
    // lift the menu clear of the peek band (mirrors the smart-guide "+100").
    if (group.api?.isPeeking?.()) {
        return 'calc(var(--dv-overlay-z-index, 999) + 100)';
    }
    if (!(target instanceof HTMLElement)) {
        return undefined;
    }
    // Floating overlays live in the shell as siblings of the popover anchor
    // and the AriaLevelTracker sets their inline z-index. Without this, a
    // popover opened from inside a floating group would render behind it
    // because they share the shell stacking context.
    const relativeParent = findRelativeZIndexParent(target);
    return relativeParent?.style.zIndex
        ? `calc(${relativeParent.style.zIndex} * 2)`
        : undefined;
}

let _nextId = 0;
const nextContextMenuItemId = () => `dv-ctx-menu-item-${_nextId++}`;

function isItemConfig(
    item: BuiltInChipContextMenuItem | ContextMenuItemConfig | ContextMenuItem
): item is ContextMenuItemConfig {
    return typeof item === 'object';
}

function buildItem(
    label: string,
    close: () => void,
    action: () => void,
    disabled?: boolean
): HTMLElement {
    const el = document.createElement('div');
    el.className = 'dv-context-menu-item';
    el.setAttribute('role', 'menuitem');
    if (disabled) {
        el.classList.add('dv-context-menu-item--disabled');
        el.setAttribute('aria-disabled', 'true');
    }
    el.textContent = label;
    if (!disabled) {
        el.addEventListener('click', () => {
            action();
            close();
        });
    }
    return el;
}

function buildSeparator(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'dv-context-menu-separator';
    el.setAttribute('role', 'separator');
    return el;
}

function isCoarsePrimaryInput(): boolean {
    if (globalThis.window === undefined || !globalThis.matchMedia) {
        return false;
    }
    const coarse = globalThis.matchMedia('(pointer: coarse)').matches;
    const fine = globalThis.matchMedia('(pointer: fine)').matches;
    return coarse && !fine;
}

function buildRenameInput(tabGroup: ITabGroup): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'dv-context-menu-rename';

    const input = document.createElement('input');
    input.className = 'dv-context-menu-rename-input';
    input.type = 'text';
    input.placeholder = 'Name This Group';
    input.value = tabGroup.label;
    input.addEventListener('input', () => {
        tabGroup.setLabel(input.value);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' && e.key !== 'Enter') {
            e.stopPropagation();
        }
    });
    input.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    wrapper.appendChild(input);

    // Skip auto-focus on touch-primary devices: focusing the input pops the
    // on-screen keyboard, which fires `window resize`, which `PopupService`
    // listens to and uses to dismiss the popover, so the menu opens, the
    // keyboard appears, and the menu immediately closes before the user can
    // type. The user can still tap the input to focus it intentionally.
    if (!isCoarsePrimaryInput()) {
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    }

    return wrapper;
}

function buildColorPicker(
    tabGroup: ITabGroup,
    palette: TabGroupColorPalette
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'dv-context-menu-color-picker';

    if (!palette.enabled) {
        // Opt-out: render no swatches. Returning a wrapper rather than null
        // keeps the call site simple; the wrapper is empty and visually inert.
        return wrapper;
    }

    for (const entry of palette.entries()) {
        const swatch = document.createElement('div');
        swatch.className = 'dv-context-menu-color-swatch';
        // Use a CSS custom property rather than setting `backgroundColor`
        // directly: the IDL setter validates the value against a color
        // grammar and rejects `var(...)` references in some environments
        // (notably jsdom; some browsers have historically had similar
        // quirks). The matching SCSS rule reads the var at use time.
        swatch.style.setProperty('--dv-tab-group-color', entry.value);
        if (entry.label) {
            swatch.title = entry.label;
        }
        if (tabGroup.color === entry.id) {
            swatch.classList.add('dv-context-menu-color-swatch--selected');
        }
        swatch.addEventListener('click', () => {
            tabGroup.setColor(entry.id);
        });
        wrapper.appendChild(swatch);
    }

    return wrapper;
}

export class ContextMenuController implements IContextMenuService {
    constructor(private readonly accessor: IContextMenuHost) {}

    /**
     * A single maximize/restore toggle whose label and behaviour track the
     * group's live state: it reads *Restore* + calls `exitMaximized` when the
     * group is maximized, otherwise *Maximize* + `maximize`. Only grid groups
     * can be maximized, so the item is disabled for floating / popout panels
     * that are not already maximized.
     */
    private buildMaximizeItem(
        panel: IDockviewPanel,
        close: () => void
    ): HTMLElement {
        const isMaximized = panel.api.isMaximized();
        const label = isMaximized ? 'Restore' : 'Maximize';
        const action = isMaximized
            ? () => panel.api.exitMaximized()
            : () => panel.api.maximize();
        const disabled = !isMaximized && panel.api.location.type !== 'grid';
        return buildItem(label, close, action, disabled);
    }

    /**
     * A single collapse/expand toggle whose label tracks the tab group's live
     * state: *Expand* when the group is already collapsed, otherwise *Collapse*.
     */
    private buildCollapseItem(
        tabGroup: ITabGroup,
        close: () => void
    ): HTMLElement {
        const label = tabGroup.collapsed ? 'Expand' : 'Collapse';
        return buildItem(label, close, () => tabGroup.toggle());
    }

    /**
     * Whether to auto-inject the built-in Pin/Unpin item at the top of the tab
     * menu. True only when the PinnedTabs module is registered, pinning is
     * enabled, and the app has not opted out via `pinnedTabs.contextMenuItem:
     * false` (the item is on by default). This keeps pinning reachable from the
     * menu without the app having to return `'pin'` from
     * `getTabContextMenuItems` itself.
     */
    private _shouldInjectPin(): boolean {
        const pinnedTabs = this.accessor.options.pinnedTabs;
        return (
            !!this.accessor.pinnedTabsService &&
            !!pinnedTabs?.enabled &&
            pinnedTabs.contextMenuItem !== false
        );
    }

    /**
     * The tab menu items: the app's own items (if any) with the built-in
     * `'pin'` item prepended when {@link _shouldInjectPin} applies, so the app
     * keeps full control of its list, and pinning is added without disturbing
     * it. Reuses the existing `'pin'` token rendering below.
     */
    private _resolveTabItems(
        panel: IDockviewPanel,
        group: DockviewGroupPanel,
        event: MouseEvent
    ): ContextMenuItem[] {
        const appItems =
            this.accessor.options.getTabContextMenuItems?.({
                panel,
                group,
                api: this.accessor.api,
                event,
            }) ?? [];

        return this._shouldInjectPin() ? ['pin', ...appItems] : appItems;
    }

    /**
     * Render a custom `component` menu item and append it to `menuEl`. Builds
     * the framework renderer via the host's `createContextMenuItemComponent`
     * factory and initialises it. Shared by the tab menu and the chip menu,
     * which differ only in `identity`: the tab menu passes the `panel`, the chip
     * menu passes the `tabGroup`. No-op when no renderer could be created (no
     * factory configured, or the factory declined the component).
     */
    private appendComponentItem(
        menuEl: HTMLElement,
        item: ContextMenuItemConfig,
        identity:
            | Pick<IContextMenuItemComponentProps, 'panel'>
            | Pick<IChipContextMenuItemComponentProps, 'tabGroup'>,
        group: DockviewGroupPanel,
        close: () => void
    ): void {
        const renderer = this.accessor.options.createContextMenuItemComponent?.(
            {
                id: nextContextMenuItemId(),
                component: item.component,
            }
        );
        if (!renderer) {
            return;
        }
        renderer.init({
            ...identity,
            group,
            api: this.accessor.api,
            close,
            componentProps: item.componentProps,
        } as
            | IContextMenuItemComponentProps
            | IChipContextMenuItemComponentProps);
        menuEl.appendChild(renderer.element);
    }

    show(
        panel: IDockviewPanel,
        group: DockviewGroupPanel,
        event: MouseEvent
    ): void {
        const items: ContextMenuItem[] = this._resolveTabItems(
            panel,
            group,
            event
        );

        if (items.length === 0) {
            return;
        }

        event.preventDefault();

        const popupService = this.accessor.getPopupServiceForGroup(group);
        const close = () => popupService.close();
        const menuEl = document.createElement('div');
        menuEl.className = 'dv-context-menu';
        menuEl.setAttribute('role', 'menu');

        for (const item of items) {
            if (item === 'separator') {
                menuEl.appendChild(buildSeparator());
            } else if (item === 'close') {
                menuEl.appendChild(
                    buildItem('Close', close, () => panel.api.close())
                );
            } else if (item === 'closeOthers') {
                menuEl.appendChild(
                    buildItem('Close Others', close, () => {
                        group.panels
                            .filter((p) => p !== panel)
                            .forEach((p) => p.api.close());
                    })
                );
            } else if (item === 'closeAll') {
                menuEl.appendChild(
                    buildItem('Close All', close, () => {
                        [...group.panels].forEach((p) => p.api.close());
                    })
                );
            } else if (item === 'closeLeft') {
                const index = group.panels.indexOf(panel);
                menuEl.appendChild(
                    buildItem(
                        'Close to the Left',
                        close,
                        () => {
                            group.panels
                                .filter((_, i) => i < index)
                                .forEach((p) => p.api.close());
                        },
                        index <= 0
                    )
                );
            } else if (item === 'closeRight') {
                const index = group.panels.indexOf(panel);
                menuEl.appendChild(
                    buildItem(
                        'Close to the Right',
                        close,
                        () => {
                            group.panels
                                .filter((_, i) => i > index)
                                .forEach((p) => p.api.close());
                        },
                        index === -1 || index >= group.panels.length - 1
                    )
                );
            } else if (item === 'maximize') {
                menuEl.appendChild(this.buildMaximizeItem(panel, close));
            } else if (item === 'float') {
                menuEl.appendChild(
                    buildItem(
                        'Float',
                        close,
                        () => this.accessor.api.addFloatingGroup(panel),
                        panel.api.location.type === 'floating'
                    )
                );
            } else if (item === 'popout') {
                menuEl.appendChild(
                    buildItem(
                        'Open in New Window',
                        close,
                        () => {
                            this.accessor.api.addPopoutGroup(panel);
                        },
                        panel.api.location.type === 'popout'
                    )
                );
            } else if (item === 'pin') {
                menuEl.appendChild(
                    buildItem(
                        panel.api.isPinned ? 'Unpin tab' : 'Pin tab',
                        close,
                        () => panel.api.setPinned(!panel.api.isPinned)
                    )
                );
            } else if (isItemConfig(item) && item.element) {
                menuEl.appendChild(item.element);
            } else if (isItemConfig(item) && item.component) {
                this.appendComponentItem(menuEl, item, { panel }, group, close);
            } else if (isItemConfig(item) && item.label) {
                menuEl.appendChild(
                    buildItem(
                        item.label,
                        close,
                        () => item.action?.(),
                        item.disabled
                    )
                );
            }
        }

        popupService.openPopover(menuEl, {
            x: event.clientX,
            y: event.clientY,
            zIndex: popoverZIndexFor(event.target, group),
        });
    }

    showForChip(
        tabGroup: ITabGroup,
        group: DockviewGroupPanel,
        event: MouseEvent
    ): void {
        if (!this.accessor.options.getTabGroupChipContextMenuItems) {
            return;
        }

        const items = this.accessor.options.getTabGroupChipContextMenuItems({
            tabGroup,
            group,
            api: this.accessor.api,
            event,
        });

        if (items.length === 0) {
            return;
        }

        event.preventDefault();

        const popupService = this.accessor.getPopupServiceForGroup(group);
        const close = () => popupService.close();
        const menuEl = document.createElement('div');
        menuEl.className = 'dv-context-menu';
        menuEl.setAttribute('role', 'menu');

        for (const item of items) {
            if (item === 'separator') {
                menuEl.appendChild(buildSeparator());
            } else if (item === 'rename') {
                menuEl.appendChild(buildRenameInput(tabGroup));
            } else if (item === 'colorPicker') {
                menuEl.appendChild(
                    buildColorPicker(
                        tabGroup,
                        this.accessor.tabGroupColorPalette
                    )
                );
            } else if (item === 'collapse') {
                menuEl.appendChild(this.buildCollapseItem(tabGroup, close));
            } else if (item === 'close') {
                menuEl.appendChild(
                    buildItem('Close All', close, () => {
                        group.panels
                            .filter((p) => tabGroup.containsPanel(p.id))
                            .forEach((p) => p.api.close());
                    })
                );
            } else if (isItemConfig(item) && item.element) {
                menuEl.appendChild(item.element);
            } else if (isItemConfig(item) && item.component) {
                this.appendComponentItem(
                    menuEl,
                    item,
                    { tabGroup },
                    group,
                    close
                );
            } else if (isItemConfig(item) && item.label) {
                menuEl.appendChild(
                    buildItem(
                        item.label,
                        close,
                        () => item.action?.(),
                        item.disabled
                    )
                );
            }
        }

        popupService.openPopover(menuEl, {
            x: event.clientX,
            y: event.clientY,
            zIndex: popoverZIndexFor(event.target, group),
        });
    }
}

export const ContextMenuModule = defineModule<
    'contextMenuService',
    IContextMenuHost
>({
    name: 'ContextMenu',
    options: [
        'getTabContextMenuItems',
        'getTabGroupChipContextMenuItems',
        'createContextMenuItemComponent',
    ],
    serviceKey: 'contextMenuService',
    create: (host) => new ContextMenuController(host),
});
