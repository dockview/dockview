import { addDisposableListener, Emitter, Event } from '../../../events';
import { CompositeDisposable } from '../../../lifecycle';
import {
    getPanelData,
    LocalSelectionTransfer,
    PanelTransfer,
} from '../../../dnd/dataTransfer';
import { toggleClass } from '../../../dom';
import { createPinButton } from '../../../svg';
import { DockviewComponent } from '../../dockviewComponent';
import { ITabRenderer } from '../../types';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import {
    DroptargetEvent,
    DroptargetOverlayModel,
    IDropTarget,
    Position,
    WillShowOverlayEvent,
} from '../../../dnd/droptarget';
import {
    DragSourceOptions,
    html5Backend,
    IDragSource,
    pointerBackend,
} from '../../../dnd/backend';
import { LongPressDetector } from '../../../dnd/pointer/longPress';
import { IDockviewPanel } from '../../dockviewPanel';
import { DockviewHeaderDirection } from '../../options';
import type { ITabDecoration } from '../../modules';
import { resolveDndCapabilities } from '../../dndCapabilities';

let _tabId = 0;
/** Stable DOM id referenced by the tabpanel's `aria-labelledby`. */
const nextTabId = (): string => `dv-tab-${_tabId++}`;

export class Tab extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private readonly dropTarget: IDropTarget;
    private readonly pointerDropTarget: IDropTarget;
    private content: ITabRenderer | undefined = undefined;
    private readonly html5DragSource: IDragSource;
    private readonly pointerDragSource: IDragSource;
    private readonly panelTransfer =
        LocalSelectionTransfer.getInstance<PanelTransfer>();
    private _direction: DockviewHeaderDirection = 'horizontal';
    private _pinIndicator: HTMLElement | undefined = undefined;
    /** Decoration key -> the element that decoration last returned. */
    private readonly _decorationElements = new Map<string, HTMLElement>();
    private readonly _decorationContainers: Partial<
        Record<'before' | 'after', HTMLElement>
    > = {};

    private readonly _onPointDown = new Emitter<MouseEvent>();
    readonly onPointerDown: Event<MouseEvent> = this._onPointDown.event;

    private readonly _onTabClick = new Emitter<MouseEvent>();
    readonly onTabClick: Event<MouseEvent> = this._onTabClick.event;

    private readonly _onDropped = new Emitter<DroptargetEvent>();
    readonly onDrop: Event<DroptargetEvent> = this._onDropped.event;

    private readonly _onDragStart = new Emitter<DragEvent | PointerEvent>();
    readonly onDragStart = this._onDragStart.event;

    private readonly _onDragEnd = new Emitter<DragEvent | PointerEvent>();
    readonly onDragEnd = this._onDragEnd.event;

    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;

    public get element(): HTMLElement {
        return this._element;
    }

    constructor(
        public readonly panel: IDockviewPanel,
        private readonly accessor: DockviewComponent,
        private readonly group: DockviewGroupPanel
    ) {
        super();

        const caps = resolveDndCapabilities(this.accessor.options);

        this._element = document.createElement('div');
        this._element.className = 'dv-tab';
        // Roving tabindex (WAI-ARIA Tabs pattern): only the active tab is in
        // the tab order; `setActive` flips this. Inactive tabs are reachable
        // via arrow keys, handled by the tab strip.
        this._element.tabIndex = -1;
        this._element.draggable = caps.html5;
        // WAI-ARIA Tabs pattern. `aria-controls` points at the group's single
        // tabpanel (the content container); `aria-selected` tracks activation.
        this._element.id = nextTabId();
        this._element.setAttribute('role', 'tab');
        this._element.setAttribute('aria-selected', 'false');
        // Give the tab an explicit accessible name (the panel title) so its
        // WAI-ARIA name isn't computed from its subtree. Otherwise it would
        // swallow the close button's "Close {title}" label, and the tabpanel
        // (which is `aria-labelledby` this tab) would inherit that clutter.
        // Kept in sync with `onDidTitleChange` below.
        this._element.setAttribute(
            'aria-label',
            this.panel.title ?? this.panel.id
        );
        // Panel identity on the tab element so the multi-row wrap controller can
        // map a wrapped tab (read for its `offsetTop` row) back to its panel id
        // when computing the surplus set that spills to the overflow dropdown.
        // Tab-specific attribute name so it doesn't collide with generic
        // `[data-panel-id]` lookups elsewhere (e.g. the overlay render container).
        // `dataset.tabPanelId` maps to the `data-tab-panel-id` attribute.
        this._element.dataset.tabPanelId = this.panel.id;
        const contentContainerId = this.group?.model?.contentContainerId;
        if (contentContainerId) {
            this._element.setAttribute('aria-controls', contentContainerId);
        }

        toggleClass(this.element, 'dv-inactive-tab', true);

        // Pinned tabs get a marker class (and, unless disabled, a compact
        // icon-only class). Driven off the panel's pinned state, and inert when
        // nothing is pinned (i.e. when the PinnedTabs module is absent).
        // Re-applied here because a reorder recreates the Tab.
        this._updatePinnedClasses();

        const canDisplayOverlay = (
            event: DragEvent | PointerEvent,
            position: Position
        ): boolean => {
            if (this.group.locked) {
                return false;
            }

            const data = getPanelData();

            if (this.accessor.id === data?.viewId) {
                // Smooth-reorder takes over the in-flight visual when active,
                // so individual tab overlays are suppressed for internal drags.
                if (this.accessor.options.theme?.tabAnimation === 'smooth') {
                    return false;
                }
                return true;
            }

            return this.group.model.canDisplayOverlay(event, position, 'tab');
        };

        this.dropTarget = html5Backend.createDropTarget(this._element, {
            acceptedTargetZones: ['left', 'right'],
            overlayModel: this._buildOverlayModel(),
            canDisplayOverlay,
            getOverrideTarget: () => group.model.dropTargetContainer?.model,
        });

        this.pointerDropTarget = pointerBackend.createDropTarget(
            this._element,
            {
                acceptedTargetZones: ['left', 'right'],
                overlayModel: this._buildOverlayModel(),
                canDisplayOverlay,
                getOverrideTarget: () => group.model.dropTargetContainer?.model,
            }
        );

        const sharedDragOptions: DragSourceOptions = {
            getData: () => {
                this.panelTransfer.setData(
                    [
                        new PanelTransfer(
                            this.accessor.id,
                            this.group.id,
                            this.panel.id
                        ),
                    ],
                    PanelTransfer.prototype
                );
                return {
                    dispose: () => {
                        this.panelTransfer.clearData(PanelTransfer.prototype);
                    },
                };
            },
            // 30/-10 matches the HTML5 setDragImage offset that has been
            // shipped for years; pointer backend wraps in PointerGhost,
            // HTML5 backend feeds into setDragImage.
            createGhost: () => ({
                element: this._buildGhostElement(),
                offsetX: 30,
                offsetY: -10,
            }),
            onDragStart: (event) => {
                this._onDragStart.fire(event);
                if (
                    !(event instanceof PointerEvent) &&
                    this.accessor.options.theme?.tabAnimation === 'smooth'
                ) {
                    // Delay collapse to next frame so the browser
                    // captures the full drag image first.
                    requestAnimationFrame(() => {
                        toggleClass(this.element, 'dv-tab--dragging', true);
                    });
                }
            },
            onDragEnd: (event) => {
                this._onDragEnd.fire(event);
            },
        };

        this.html5DragSource = html5Backend.createDragSource(this._element, {
            ...sharedDragOptions,
            disabled: !caps.html5,
        });

        this.pointerDragSource = pointerBackend.createDragSource(
            this._element,
            {
                ...sharedDragOptions,
                disabled: !caps.pointer,
                touchOnly: !caps.pointerHandlesMouse,
                isCancelled: () =>
                    !resolveDndCapabilities(this.accessor.options).pointer,
            }
        );

        // Both droptargets feed the same downstream stream; consumers don't
        // need to know which path produced the overlay.
        this.onWillShowOverlay = Event.any(
            this.dropTarget.onWillShowOverlay,
            this.pointerDropTarget.onWillShowOverlay
        );

        this.addDisposables(
            this._onPointDown,
            this._onTabClick,
            this._onDropped,
            this._onDragStart,
            this._onDragEnd,
            this.accessor.onDidOptionsChange(() => {
                const model = this._buildOverlayModel();
                this.dropTarget.setOverlayModel(model);
                this.pointerDropTarget.setOverlayModel(model);
                // `pinnedTabs.compact` may have changed.
                this._updatePinnedClasses();
            }),
            this.panel.api?.onDidChangePinned?.(() => {
                this._updatePinnedClasses();
            }) ?? { dispose: () => {} },
            this.panel.api?.onDidTitleChange?.((event) => {
                this._element.setAttribute(
                    'aria-label',
                    event.title ?? this.panel.id
                );
            }) ?? { dispose: () => {} },
            addDisposableListener(this._element, 'dragend', () => {
                // The shared onDragEnd handler already fires _onDragEnd via
                // the HTML5 backend; just strip the dragging class here.
                toggleClass(this.element, 'dv-tab--dragging', false);
            }),
            this.html5DragSource,
            addDisposableListener(this._element, 'pointerdown', (event) => {
                this._onPointDown.fire(event);
            }),
            addDisposableListener(this._element, 'click', (event) => {
                this._onTabClick.fire(event);
            }),
            addDisposableListener(this._element, 'contextmenu', (event) => {
                this.accessor.contextMenuService?.show(
                    this.panel,
                    this.group,
                    event
                );
            }),
            new LongPressDetector(this._element, {
                onLongPress: (event) => {
                    // Don't let a subsequent finger move arm a drag on top
                    // of the just-opened menu.
                    this.pointerDragSource.cancelPending();
                    this.accessor.contextMenuService?.show(
                        this.panel,
                        this.group,
                        event
                    );
                },
            }),
            this.dropTarget.onDrop((event) => {
                this._onDropped.fire(event);
            }),
            this.pointerDropTarget.onDrop((event) => {
                this._onDropped.fire(event);
            }),
            this.dropTarget,
            this.pointerDropTarget,
            this.pointerDragSource
        );

        for (const decoration of this.accessor.tabDecorations ?? []) {
            const onDidChange = decoration.onDidChangeTabDecoration;
            if (onDidChange === undefined) {
                continue;
            }
            this.addDisposables(
                onDidChange((event) => {
                    const panelId =
                        event && typeof event === 'object'
                            ? event.panelId
                            : undefined;
                    // A void event, or one without a panel id, re-renders every
                    // tab; a narrowed one only the tab it names.
                    if (panelId === undefined || panelId === this.panel.id) {
                        this._renderDecorations();
                    }
                })
            );
        }

        this._renderDecorations();
    }

    /**
     * Render every registered decoration into the container on its side of the
     * tab content. Decorations update in place (they are handed back the
     * element they last returned) and are only re-ordered in the DOM when the
     * desired order actually changed, so an open popover inside one isn't torn
     * down by an unrelated re-render.
     */
    private _renderDecorations(): void {
        const decorations = this.accessor.tabDecorations ?? [];

        if (decorations.length === 0 && this._decorationElements.size === 0) {
            return;
        }

        // A custom tabComponent owns its markup, so a decoration only appears
        // there if it explicitly opts in (see `renderWithCustomTab`).
        const hasCustomTab = !!this.panel.api?.tabComponent;
        const desired: Record<'before' | 'after', HTMLElement[]> = {
            before: [],
            after: [],
        };

        for (const decoration of decorations) {
            const key = decoration.decorationKey;
            const existing = this._decorationElements.get(key);
            const permitted =
                decoration.renderWithCustomTab === true || !hasCustomTab;

            const next = permitted
                ? decoration.renderTabDecoration(this.panel, existing)
                : null;

            if (next === null) {
                existing?.remove();
                this._decorationElements.delete(key);
                continue;
            }

            if (next !== existing) {
                existing?.remove();
                this._decorationElements.set(key, next);
                if (decoration.interactive) {
                    this._isolatePointerEvents(next);
                }
            }

            desired[decoration.placement ?? 'before'].push(next);
        }

        for (const placement of ['before', 'after'] as const) {
            const elements = desired[placement];

            if (elements.length === 0) {
                this._decorationContainers[placement]?.remove();
                continue;
            }

            const container = this._positionDecorationContainer(placement);
            const current = Array.from(container.children);
            const ordered =
                current.length === elements.length &&
                elements.every((element, i) => current[i] === element);

            if (!ordered) {
                // appendChild moves existing nodes, so appending in sorted
                // order is enough to fix the sequence.
                for (const element of elements) {
                    container.appendChild(element);
                }
            }
        }
    }

    /** Create the container if needed and put it on the right side of content. */
    private _positionDecorationContainer(
        placement: 'before' | 'after'
    ): HTMLElement {
        let container = this._decorationContainers[placement];

        if (container === undefined) {
            container = document.createElement('div');
            container.className = `dv-tab-decorations dv-tab-decorations--${placement}`;
            this._decorationContainers[placement] = container;
        }

        if (placement === 'after') {
            if (this._element.lastChild !== container) {
                this._element.appendChild(container);
            }
            return container;
        }

        // Anchor to the content element rather than `firstChild` so the
        // container sits after the pin glyph (which owns the leading slot) and
        // before the tab's content. `insertBefore(_, null)` appends, which is
        // corrected when `setContent` re-renders.
        const anchor = this.content?.element ?? null;
        if (
            container.parentElement !== this._element ||
            container.nextSibling !== anchor
        ) {
            this._element.insertBefore(container, anchor);
        }

        return container;
    }

    /**
     * Stop a decoration's pointer events reaching the tab, so clicking it
     * neither activates the tab nor starts a drag.
     */
    private _isolatePointerEvents(element: HTMLElement): void {
        element.draggable = false;

        for (const type of [
            'pointerdown',
            'mousedown',
            'click',
            'dragstart',
        ] as const) {
            this.addDisposables(
                addDisposableListener(element, type, (event) => {
                    event.stopPropagation();
                })
            );
        }
    }

    private _updatePinnedClasses(): void {
        const pinned = this.panel.api?.isPinned ?? false;
        // Compact (icon-only) is opt-in: dockview's default tab has no favicon,
        // so a pinned tab keeps its title by default and just gains a pin glyph.
        const compact =
            pinned && this.accessor.options.pinnedTabs?.compact === true;
        toggleClass(this.element, 'dv-tab--pinned', pinned);
        toggleClass(this.element, 'dv-tab--pinned-compact', compact);

        // A real inline pin glyph (inherits `currentColor` via `.dv-svg`),
        // more robust and themeable than a CSS mask, and the only visual
        // identity a compact pinned tab has. Only injected for the default tab
        // renderer: a custom `tabComponent` owns its own markup, so we don't
        // prepend a glyph or force flex layout on it (it still gets the
        // `dv-tab--pinned` class to style itself).
        const wantGlyph = pinned && !this.panel.api?.tabComponent;
        if (wantGlyph && !this._pinIndicator) {
            const indicator = document.createElement('div');
            indicator.className = 'dv-tab-pin';
            indicator.appendChild(createPinButton());
            this._element.insertBefore(indicator, this._element.firstChild);
            this._pinIndicator = indicator;
        } else if (!wantGlyph && this._pinIndicator) {
            this._pinIndicator.remove();
            this._pinIndicator = undefined;
        }
    }

    public setActive(isActive: boolean): void {
        toggleClass(this.element, 'dv-active-tab', isActive);
        toggleClass(this.element, 'dv-inactive-tab', !isActive);
        this._element.setAttribute(
            'aria-selected',
            isActive ? 'true' : 'false'
        );
        // Roving tabindex anchors to the active tab; arrow-key navigation in
        // the tab strip moves the rover from there.
        this._element.tabIndex = isActive ? 0 : -1;
    }

    public setContent(part: ITabRenderer): void {
        if (this.content) {
            this.content.element.remove();
        }
        this.content = part;
        this._element.appendChild(this.content.element);
        // Content was just appended past the decoration containers; re-render
        // to put them back on their correct side of it.
        this._renderDecorations();
    }

    private _buildOverlayModel(): DroptargetOverlayModel {
        // An app-supplied model (the dropOverlayModel option) takes precedence
        // over the theme-derived default for this tab.
        const custom = this.accessor.resolveDropOverlayModel?.(
            'tab',
            this.group
        );
        if (custom) {
            return custom;
        }
        // 'line' themes render a 4px insertion strip at the tab edge via the
        // anchor container's small-boundary path.  'fill' themes render a
        // half-width highlighted area, so we disable the small-boundary path
        // entirely (boundary = 0 ⟹ isSmall always false).
        const smallBoundary =
            this.accessor.options.theme?.dndTabIndicator === 'line'
                ? Number.POSITIVE_INFINITY
                : 0;
        return {
            activationSize: { value: 50, type: 'percentage' as const },
            smallWidthBoundary: smallBoundary,
            smallHeightBoundary: smallBoundary,
        };
    }

    public setDirection(direction: DockviewHeaderDirection): void {
        this._direction = direction;
        const zones =
            direction === 'vertical' ? ['top', 'bottom'] : ['left', 'right'];
        this.dropTarget.setTargetZones(zones as any);
        this.pointerDropTarget.setTargetZones(zones as any);
    }

    public updateDragAndDropState(): void {
        const caps = resolveDndCapabilities(this.accessor.options);
        this._element.draggable = caps.html5;
        this.html5DragSource.setDisabled(!caps.html5);
        this.pointerDragSource.setDisabled(!caps.pointer);
        this.pointerDragSource.setTouchOnly(!caps.pointerHandlesMouse);
    }

    /**
     * Vertical tabs are flipped to horizontal so the ghost stays readable
     * during the drag rather than appearing sideways-rotated.
     */
    private _buildGhostElement(): HTMLElement {
        const style = getComputedStyle(this.element);
        const newNode = this.element.cloneNode(true) as HTMLElement;
        const isVertical = this._direction === 'vertical';

        const verticalSkip = new Set([
            'writing-mode',
            'inline-size',
            'block-size',
            'min-inline-size',
            'min-block-size',
            'max-inline-size',
            'max-block-size',
            'margin-inline',
            'margin-inline-start',
            'margin-inline-end',
            'margin-block',
            'margin-block-start',
            'margin-block-end',
            'padding-inline',
            'padding-inline-start',
            'padding-inline-end',
            'padding-block',
            'padding-block-start',
            'padding-block-end',
        ]);

        Array.from(style).forEach((key) => {
            if (isVertical && verticalSkip.has(key)) {
                return;
            }
            newNode.style.setProperty(
                key,
                style.getPropertyValue(key),
                style.getPropertyPriority(key)
            );
        });

        if (isVertical) {
            newNode.style.setProperty('writing-mode', 'horizontal-tb');
            newNode.style.setProperty('width', style.height);
            newNode.style.setProperty('height', style.width);
        }

        newNode.style.position = 'absolute';
        newNode.classList.add('dv-tab-ghost-drag');

        return newNode;
    }
}
