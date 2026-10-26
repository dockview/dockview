import {
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewIDisposable as IDisposable,
    DockviewGroupPanel,
    DockviewOverflowOptions,
    DockviewActivePanelChangeEvent,
    AdvancedOverflowRenderParams,
    IAdvancedOverflowHost,
    IAdvancedOverflowService,
    defineModule,
} from 'dockview';
import { MruTracker } from './mruTracker';

const SEARCH_DEBOUNCE_MS = 80;

const CONTAINER_CLASS = 'dv-tabs-overflow-container';
const ADVANCED_CLASS = 'dv-tabs-overflow-advanced';
const SEARCH_CLASS = 'dv-tabs-overflow-search';
const LIST_CLASS = 'dv-tabs-overflow-list';
const OPTION_FOCUSED_CLASS = 'dv-tabs-overflow-option--focused';

interface ResolvedSearch {
    readonly enabled: boolean;
    readonly scope: 'group' | 'overflow';
    readonly placeholder: string;
}

/** Resolve the `overflow.search` option into a concrete config. */
function resolveSearch(
    overflow: DockviewOverflowOptions | undefined
): ResolvedSearch {
    const search = overflow?.search;
    if (search === true) {
        return { enabled: true, scope: 'group', placeholder: 'Search tabs' };
    }
    if (typeof search === 'object' && search !== null) {
        return {
            enabled: true,
            scope: search.scope === 'overflow' ? 'overflow' : 'group',
            placeholder: search.placeholder ?? 'Search tabs',
        };
    }
    return { enabled: false, scope: 'overflow', placeholder: '' };
}

/**
 * Case-insensitive substring predicate over a panel's title. Exported for unit
 * tests of the scope `group` vs `overflow` behaviour.
 */
export function matchesQuery(title: string, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
        return true;
    }
    return title.toLowerCase().includes(q);
}

/**
 * One popover's worth of advanced overflow UI: a focused search input, a
 * `role="listbox"` of filtered / MRU-ordered rows (each row reusing the core
 * `buildRow` so its DOM + behaviour match the free dropdown), and a keyboard
 * controller. Constructed per popover-open and disposed on close.
 */
export class OverflowListView extends CompositeDisposable {
    private readonly _body: HTMLElement;
    private readonly _list: HTMLElement;
    private readonly _input: HTMLInputElement | undefined;
    /** The element that holds DOM focus + `aria-activedescendant`. */
    private readonly _focusTarget: HTMLElement;
    private readonly _search: ResolvedSearch;

    /** Candidate panel ids (pre-filter, pre-order): the search scope's set. */
    private readonly _baseIds: string[];
    /** Pinned tabs that clipped out of the strip. Rendered in a "Pinned"
     *  section above the main list, and excluded from it to avoid a duplicate
     *  row when the search scope is the whole group. */
    private readonly _pinnedIds: string[];
    private readonly _titleOf = new Map<string, string>();

    /** The rendered rows in display order (group headers excluded). */
    private _rows: {
        id: string;
        element: HTMLElement;
        activate: () => void;
        dispose: () => void;
    }[] = [];
    private _activeIndex = -1;
    private _debounce: { win: Window; handle: number } | undefined;

    constructor(
        private readonly params: AdvancedOverflowRenderParams,
        overflow: DockviewOverflowOptions | undefined,
        private readonly mru: MruTracker,
        private readonly mruEnabled: boolean
    ) {
        super();

        this._search = resolveSearch(overflow);

        for (const panel of params.group.panels) {
            this._titleOf.set(panel.id, panel.title ?? panel.id);
        }

        this._pinnedIds = [...params.pinnedOverflowTabs];
        const pinnedSet = new Set(this._pinnedIds);

        this._baseIds = (
            this._search.enabled && this._search.scope === 'group'
                ? params.group.panels.map((p) => p.id)
                : [...params.overflowTabs]
        )
            // The pinned section renders these separately at the top; keep them
            // out of the main list so a `group`-scoped search shows no dup.
            .filter((id) => !pinnedSet.has(id));

        this._body = document.createElement('div');
        this._body.style.overflow = 'auto';
        this._body.className = `${CONTAINER_CLASS} ${ADVANCED_CLASS}`;

        if (this._search.enabled) {
            this._input = document.createElement('input');
            this._input.type = 'text';
            this._input.className = SEARCH_CLASS;
            this._input.placeholder = this._search.placeholder;
            this._input.setAttribute('role', 'combobox');
            this._input.setAttribute('aria-autocomplete', 'list');
            this._input.setAttribute('aria-expanded', 'true');
            this._body.appendChild(this._input);
            this._focusTarget = this._input;
        } else {
            // No input: the listbox itself is the focus target so keyboard nav
            // still works.
            this._focusTarget = document.createElement('div');
        }

        this._list = this._search.enabled
            ? document.createElement('div')
            : this._focusTarget;
        this._list.className = LIST_CLASS;
        this._list.setAttribute('role', 'listbox');
        this._list.id = 'dv-tabs-overflow-listbox';
        if (!this._search.enabled) {
            this._list.tabIndex = 0;
        }
        this._body.appendChild(this._list);

        this._focusTarget.setAttribute('aria-controls', this._list.id);

        // Keydown on the body (bubble phase) so it fires before PopupService's
        // window-level Enter/Escape dismissal, so we can intercept Enter to
        // activate the highlighted row before the popover closes.
        const onKeyDown = (event: KeyboardEvent): void =>
            this._onKeyDown(event);
        this._body.addEventListener('keydown', onKeyDown);

        const onInput = (): void => this._scheduleFilter();
        this._input?.addEventListener('input', onInput);

        this.addDisposables({
            dispose: () => {
                this._body.removeEventListener('keydown', onKeyDown);
                this._input?.removeEventListener('input', onInput);
                if (this._debounce) {
                    this._debounce.win.clearTimeout(this._debounce.handle);
                    this._debounce = undefined;
                }
            },
        });
    }

    /** Build the initial list and open the popover, focusing the search input. */
    open(): void {
        this._renderList('');
        this.params.context.open(this._body);

        const win = this._body.ownerDocument.defaultView;
        const focus = (): void => {
            this._focusTarget.focus();
        };
        // Focus on the next frame so the popover is mounted first.
        if (win) {
            win.requestAnimationFrame(focus);
        } else {
            focus();
        }
    }

    private _scheduleFilter(): void {
        const win = this._body.ownerDocument.defaultView;
        if (!win) {
            this._renderList(this._input?.value ?? '');
            return;
        }
        if (this._debounce) {
            win.clearTimeout(this._debounce.handle);
        }
        this._debounce = {
            win,
            handle: win.setTimeout(() => {
                this._debounce = undefined;
                this._renderList(this._input?.value ?? '');
            }, SEARCH_DEBOUNCE_MS),
        };
    }

    /** The base ids reordered by MRU (front = most recent), with never-activated
     *  ids kept in their base (free clipped / DOM) order as the tiebreak. */
    private _orderedIds(): string[] {
        if (!this.mruEnabled) {
            return this._baseIds;
        }
        const base = new Set(this._baseIds);
        const seen = new Set<string>();
        const result: string[] = [];
        for (const id of this.mru.order(this.params.group.id)) {
            if (base.has(id)) {
                result.push(id);
                seen.add(id);
            }
        }
        for (const id of this._baseIds) {
            if (!seen.has(id)) {
                result.push(id);
            }
        }
        return result;
    }

    /** Build a row for `id`, wire its listbox-option attributes, append it to
     *  the list, and register it for keyboard navigation. */
    private _appendRow(id: string): void {
        const row = this.params.context.buildRow(id);
        if (!row) {
            return;
        }
        const index = this._rows.length;
        row.element.setAttribute('role', 'option');
        row.element.id = `dv-tabs-overflow-option-${index}`;
        this._list.appendChild(row.element);
        this._rows.push({
            id,
            element: row.element,
            activate: row.activate,
            dispose: row.dispose,
        });
    }

    private _renderList(query: string): void {
        const { context } = this.params;

        while (this._list.firstChild) {
            this._list.firstChild.remove();
        }
        for (const row of this._rows) {
            row.dispose();
        }
        this._rows = [];

        // Pinned tabs that clipped out of the strip render first, under a
        // dedicated "Pinned" header, filtered by the same query. They keep
        // their pinned (strip) order rather than joining the MRU sort. Append
        // the rows first, then add the header only if at least one survived
        // (a panel can close between the overflow event and this render), so
        // there's no orphan header.
        const pinnedMatches = this._pinnedIds.filter((id) =>
            matchesQuery(this._titleOf.get(id) ?? id, query)
        );
        for (const id of pinnedMatches) {
            this._appendRow(id);
        }
        if (this._rows.length > 0) {
            this._list.insertBefore(
                context.buildPinnedHeader(),
                this._rows[0].element
            );
        }

        const filtered = this._orderedIds().filter((id) =>
            matchesQuery(this._titleOf.get(id) ?? id, query)
        );

        const renderedGroups = new Set<string>();
        for (const id of filtered) {
            const tgId = context.overflowGroupIdForPanel(id);
            if (tgId && !renderedGroups.has(tgId)) {
                renderedGroups.add(tgId);
                const header = context.buildGroupHeader(tgId);
                if (header) {
                    this._list.appendChild(header);
                }
            }

            this._appendRow(id);
        }

        this._setActiveIndex(this._rows.length > 0 ? 0 : -1);
    }

    private _setActiveIndex(index: number): void {
        if (this._activeIndex >= 0 && this._activeIndex < this._rows.length) {
            this._rows[this._activeIndex].element.classList.remove(
                OPTION_FOCUSED_CLASS
            );
            this._rows[this._activeIndex].element.setAttribute(
                'aria-selected',
                'false'
            );
        }
        this._activeIndex = index;
        if (index < 0 || index >= this._rows.length) {
            this._focusTarget.removeAttribute('aria-activedescendant');
            return;
        }
        const row = this._rows[index];
        row.element.classList.add(OPTION_FOCUSED_CLASS);
        row.element.setAttribute('aria-selected', 'true');
        this._focusTarget.setAttribute('aria-activedescendant', row.element.id);
        row.element.scrollIntoView?.({ block: 'nearest' });
    }

    private _move(delta: number): void {
        if (this._rows.length === 0) {
            return;
        }
        const next =
            (this._activeIndex + delta + this._rows.length) % this._rows.length;
        this._setActiveIndex(next);
    }

    private _onKeyDown(event: KeyboardEvent): void {
        const { context } = this.params;
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this._move(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this._move(-1);
                break;
            case 'Home':
                event.preventDefault();
                this._setActiveIndex(this._rows.length > 0 ? 0 : -1);
                break;
            case 'End':
                event.preventDefault();
                this._setActiveIndex(this._rows.length - 1);
                break;
            case 'Enter': {
                const active = this._rows[this._activeIndex];
                if (active) {
                    // Stop the event before PopupService's window-level Enter
                    // dismissal sees it, or the popover would close *before* the
                    // row activates.
                    event.preventDefault();
                    event.stopPropagation();
                    active.activate();
                }
                break;
            }
            case 'Escape':
                event.preventDefault();
                event.stopPropagation();
                context.close();
                context.focusTrigger();
                break;
            case 'Tab':
                // Trap focus within the popover. There's a single focus
                // target (the search input or the listbox), so keep it there.
                event.preventDefault();
                break;
            default:
                break;
        }
    }
}

/**
 * Advanced overflow module service, one per component. Owns the MRU model
 * (component-scoped, so recency survives a group closing) and constructs an
 * {@link OverflowListView} per popover-open. Self-wires MRU tracking off the
 * host's group / active-panel events via {@link init}.
 */
export class AdvancedOverflowService
    extends CompositeDisposable
    implements IAdvancedOverflowService
{
    private readonly _mru = new MruTracker();
    private _activeView: OverflowListView | undefined;

    constructor(private readonly host: IAdvancedOverflowHost) {
        super();
        this.addDisposables({
            dispose: () => {
                this._activeView?.dispose();
                this._activeView = undefined;
            },
        });
    }

    /** The MRU model, exposed for the module's `init` wiring and unit tests. */
    get mru(): MruTracker {
        return this._mru;
    }

    /**
     * Attach MRU tracking to a group: seed its recency list from the current
     * tab order and prune closed panels. Returns a disposable that detaches on
     * group removal.
     */
    attachToGroup(group: DockviewGroupPanel): IDisposable {
        this._mru.attach(
            group.id,
            group.panels.map((p) => p.id)
        );
        return new CompositeDisposable(
            group.model.onDidRemovePanel((e) => this._mru.remove(e.panel.id)),
            { dispose: () => this._mru.detach(group.id) }
        );
    }

    /** Record a user-driven activation into the MRU model. */
    handleActivePanelChange(event: DockviewActivePanelChangeEvent): void {
        // A programmatic `setActive` (origin !== 'user') must not reorder
        // recency.
        if (event.origin !== 'user' || !event.panel) {
            return;
        }
        this._mru.activate(event.panel.group.id, event.panel.id);
    }

    renderOverflow(params: AdvancedOverflowRenderParams): void {
        this._activeView?.dispose();
        const view = new OverflowListView(
            params,
            this.host.options.overflow,
            this._mru,
            this.host.options.overflow?.mru === true
        );
        this._activeView = view;
        view.open();
    }
}

export const AdvancedOverflowModule = defineModule<
    'advancedOverflowService',
    IAdvancedOverflowHost
>({
    name: 'AdvancedOverflow',
    options: ['overflow'],
    serviceKey: 'advancedOverflowService',
    create: (host) => new AdvancedOverflowService(host),
    init: (host, service) => {
        // `service` is the concrete instance created above; the slot types it
        // as the narrow public interface (which exposes only `renderOverflow`),
        // so narrow back to reach the MRU lifecycle hooks.
        const svc = service as AdvancedOverflowService;
        // Self-attach MRU tracking to existing and future groups; tear down when
        // groups are removed. Mirrors TabGroupChipsModule's lifecycle.
        const perGroupDisposables = new Map<DockviewGroupPanel, IDisposable>();
        return new CompositeDisposable(
            host.onDidAddGroup((group) => {
                perGroupDisposables.set(group, svc.attachToGroup(group));
            }),
            host.onDidRemoveGroup((group) => {
                perGroupDisposables.get(group)?.dispose();
                perGroupDisposables.delete(group);
            }),
            host.onDidActivePanelChange((event) =>
                svc.handleActivePanelChange(event)
            ),
            {
                dispose: () => {
                    for (const d of perGroupDisposables.values()) {
                        d.dispose();
                    }
                    perGroupDisposables.clear();
                },
            }
        );
    },
});
