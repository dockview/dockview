import { PaneviewApi } from '../api/component.api';
import { PaneviewPanelApiImpl } from '../api/paneviewPanelApi';
import { addClasses, removeClasses } from '../dom';
import { addDisposableListener, Emitter, Event } from '../events';
import {
    BasePanelView,
    BasePanelViewExported,
    BasePanelViewState,
} from '../gridview/basePanelView';
import { IDisposable } from '../lifecycle';
import {
    IFrameworkPart,
    PanelInitParameters,
    PanelUpdateEvent,
    Parameters,
} from '../panel/types';
import { IView, Orientation } from '../splitview/splitview';
import { PaneviewComponent } from './paneviewComponent';

export interface PanePanelViewState extends BasePanelViewState {
    headerComponent?: string;
    title: string;
}

export interface PanePanelInitParameter extends PanelInitParameters {
    minimumBodySize?: number;
    maximumBodySize?: number;
    isExpanded?: boolean;
    title: string;
    containerApi: PaneviewApi;
    accessor: PaneviewComponent;
}

export interface PanePanelComponentInitParameter
    extends PanePanelInitParameter {
    api: PaneviewPanelApiImpl;
}

export interface IPanePart extends IDisposable {
    readonly element: HTMLElement;
    update(params: PanelUpdateEvent): void;
    init(parameters: PanePanelComponentInitParameter): void;
}

export interface IPaneview extends IView {
    onDidChangeExpansionState: Event<boolean>;
}

export interface IPaneviewPanel
    extends BasePanelViewExported<PaneviewPanelApiImpl> {
    readonly minimumSize: number;
    readonly maximumSize: number;
    readonly minimumBodySize: number;
    readonly maximumBodySize: number;
    isExpanded(): boolean;
    setExpanded(isExpanded: boolean): void;
    headerVisible: boolean;
}

export abstract class PaneviewPanel
    extends BasePanelView<PaneviewPanelApiImpl>
    implements IPaneview, IPaneviewPanel
{
    private readonly _onDidChangeExpansionState: Emitter<boolean> =
        new Emitter<boolean>({ replay: true });
    onDidChangeExpansionState = this._onDidChangeExpansionState.event;
    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;

    private _orthogonalSize = 0;
    private _size = 0;
    private _minimumBodySize: number;
    private _maximumBodySize: number;
    private _isExpanded = false;
    /**
     * The pane's main-axis size captured just before it was collapsed, so a
     * later re-expand can restore that size instead of the cross-axis width.
     */
    private _expandedSize: number | undefined;
    protected header?: HTMLElement;
    protected body?: HTMLElement;
    private bodyPart?: IPanePart;
    private headerPart?: IPanePart;
    private animationTimer: any;
    private _orientation: Orientation;

    private _headerVisible: boolean;

    readonly headerSize: number;
    readonly headerComponent: string | undefined;

    set orientation(value: Orientation) {
        this._orientation = value;
    }

    get orientation(): Orientation {
        return this._orientation;
    }

    get minimumSize(): number {
        const headerSize = this.headerSize;
        const expanded = this.isExpanded();
        const minimumBodySize = expanded ? this._minimumBodySize : 0;

        return headerSize + minimumBodySize;
    }

    get maximumSize(): number {
        const headerSize = this.headerSize;
        const expanded = this.isExpanded();
        const maximumBodySize = expanded ? this._maximumBodySize : 0;

        return headerSize + maximumBodySize;
    }

    get size(): number {
        return this._size;
    }

    get orthogonalSize(): number {
        return this._orthogonalSize;
    }

    set orthogonalSize(size: number) {
        this._orthogonalSize = size;
    }

    get minimumBodySize(): number {
        return this._minimumBodySize;
    }

    set minimumBodySize(value: number) {
        this._minimumBodySize = typeof value === 'number' ? value : 0;
    }

    get maximumBodySize(): number {
        return this._maximumBodySize;
    }

    set maximumBodySize(value: number) {
        this._maximumBodySize =
            typeof value === 'number' ? value : Number.POSITIVE_INFINITY;
    }

    get headerVisible(): boolean {
        return this._headerVisible;
    }

    set headerVisible(value: boolean) {
        this._headerVisible = value;
        this.header!.style.display = value ? '' : 'none';
    }

    constructor(options: {
        id: string;
        component: string;
        headerComponent: string | undefined;
        orientation: Orientation;
        isExpanded: boolean;
        isHeaderVisible: boolean;
        headerSize: number;
        minimumBodySize: number;
        maximumBodySize: number;
    }) {
        super(
            options.id,
            options.component,
            new PaneviewPanelApiImpl(options.id, options.component)
        );
        this.api.pane = this; // TODO cannot use 'this' before 'super'
        this.api.initialize(this);

        this.headerSize = options.headerSize;
        this.headerComponent = options.headerComponent;

        this._minimumBodySize = options.minimumBodySize;
        this._maximumBodySize = options.maximumBodySize;

        this._isExpanded = options.isExpanded;
        this._headerVisible = options.isHeaderVisible;

        this._onDidChangeExpansionState.fire(this.isExpanded()); // initialize value

        this._orientation = options.orientation;

        this.element.classList.add('dv-pane');

        this.addDisposables(
            this.api.onWillVisibilityChange((event) => {
                const { isVisible } = event;
                const { accessor } = this._params as PanePanelInitParameter;
                accessor.setVisible(this, isVisible);
            }),
            this.api.onDidSizeChange((event) => {
                this._onDidChange.fire({ size: event.size });
            }),
            addDisposableListener(
                this.element,
                'mouseenter',
                (ev: MouseEvent) => {
                    this.api._onMouseEnter.fire(ev);
                }
            ),
            addDisposableListener(
                this.element,
                'mouseleave',
                (ev: MouseEvent) => {
                    this.api._onMouseLeave.fire(ev);
                }
            )
        );

        this.addDisposables(
            this._onDidChangeExpansionState,
            this.onDidChangeExpansionState((isPanelExpanded) => {
                this.api._onDidExpansionChange.fire({
                    isExpanded: isPanelExpanded,
                });
            }),
            this.api.onDidFocusChange((e) => {
                if (!this.header) {
                    return;
                }
                if (e.isFocused) {
                    addClasses(this.header, 'focused');
                } else {
                    removeClasses(this.header, 'focused');
                }
            })
        );

        this.renderOnce();
    }

    setVisible(isVisible: boolean): void {
        this.api._onDidVisibilityChange.fire({ isVisible });
    }

    setActive(isActive: boolean): void {
        this.api._onDidActiveChange.fire({ isActive });
    }

    isExpanded(): boolean {
        return this._isExpanded;
    }

    setExpanded(expanded: boolean): void {
        if (this._isExpanded === expanded) {
            return;
        }

        this._isExpanded = expanded;

        if (expanded) {
            if (this.animationTimer) {
                clearTimeout(this.animationTimer);
            }
            if (this.body) {
                this.element.appendChild(this.body);
            }
        } else {
            // cache the current (expanded) main-axis size before collapsing so
            // a later re-expand can restore it
            this._expandedSize = this._size;
            this.animationTimer = setTimeout(() => {
                this.body?.remove();
            }, 200);
        }

        // On re-expand, request the cached expanded main-axis size rather than
        // `this.width` (the cross-axis dimension, which for a vertical paneview
        // is the container width and would squeeze siblings). Fall back to the
        // previous behaviour when the pane has never been collapsed.
        this._onDidChange.fire(
            expanded ? { size: this._expandedSize ?? this.width } : {}
        );
        this._onDidChangeExpansionState.fire(expanded);
    }

    layout(size: number, orthogonalSize: number): void {
        this._size = size;
        this._orthogonalSize = orthogonalSize;
        const [width, height] =
            this.orientation === Orientation.HORIZONTAL
                ? [size, orthogonalSize]
                : [orthogonalSize, size];
        super.layout(width, height);
    }

    init(parameters: PanePanelInitParameter): void {
        super.init(parameters);

        if (typeof parameters.minimumBodySize === 'number') {
            this.minimumBodySize = parameters.minimumBodySize;
        }
        if (typeof parameters.maximumBodySize === 'number') {
            this.maximumBodySize = parameters.maximumBodySize;
        }

        this.bodyPart = this.getBodyComponent();
        this.headerPart = this.getHeaderComponent();

        this.bodyPart.init({ ...parameters, api: this.api });
        this.headerPart.init({ ...parameters, api: this.api });

        this.body?.append(this.bodyPart.element);
        this.header?.append(this.headerPart.element);

        if (typeof parameters.isExpanded === 'boolean') {
            this.setExpanded(parameters.isExpanded);
        }
    }

    toJSON(): PanePanelViewState {
        const params = this._params as PanePanelInitParameter;
        return {
            ...super.toJSON(),
            headerComponent: this.headerComponent,
            title: params.title,
        };
    }

    private renderOnce(): void {
        this.header = document.createElement('div');
        this.header.tabIndex = 0;

        this.header.className = 'dv-pane-header';
        this.header.style.height = `${this.headerSize}px`;
        this.header.style.lineHeight = `${this.headerSize}px`;
        this.header.style.minHeight = `${this.headerSize}px`;
        this.header.style.maxHeight = `${this.headerSize}px`;

        this.element.appendChild(this.header);

        this.body = document.createElement('div');

        this.body.className = 'dv-pane-body';

        this.element.appendChild(this.body);
    }

    // TODO slightly hacky by-pass of the component to create a body and header component
    getComponent(): IFrameworkPart {
        return {
            // `BasePanelView` already hands the part a `PanelUpdateEvent`
            // (`{ params }`), which is exactly what `IPanePart.update` takes,
            // so forward it as-is rather than wrapping it a second time.
            update: (event: Parameters) => {
                this.bodyPart?.update(event as PanelUpdateEvent);
                this.headerPart?.update(event as PanelUpdateEvent);
            },
            dispose: () => {
                this.bodyPart?.dispose();
                this.headerPart?.dispose();
            },
        };
    }

    protected abstract getBodyComponent(): IPanePart;
    protected abstract getHeaderComponent(): IPanePart;
}
