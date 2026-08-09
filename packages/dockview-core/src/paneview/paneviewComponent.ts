import { PaneviewApi } from '../api/component.api';
import { Emitter, Event } from '../events';
import {
    CompositeDisposable,
    IDisposable,
    MutableDisposable,
} from '../lifecycle';
import { LayoutPriority, Orientation, Sizing } from '../splitview/splitview';
import { PaneviewComponentOptions, PaneviewDndOverlayEvent } from './options';
import { Paneview } from './paneview';
import { IPanePart, PaneviewPanel, IPaneviewPanel } from './paneviewPanel';
import {
    DraggablePaneviewPanel,
    PaneviewDidDropEvent,
} from './draggablePaneviewPanel';
import { DefaultHeader } from './defaultPaneviewHeader';
import { sequentialNumberGenerator } from '../math';
import { Resizable } from '../resizable';
import { Parameters } from '../panel/types';
import { Classnames } from '../dom';

const nextLayoutId = sequentialNumberGenerator();

const HEADER_SIZE = 22;
const MINIMUM_BODY_SIZE = 0;
const MAXIMUM_BODY_SIZE = Number.MAX_SAFE_INTEGER;

export interface SerializedPaneviewPanel {
    snap?: boolean;
    priority?: LayoutPriority;
    minimumSize?: number;
    maximumSize?: number;
    headerSize?: number;
    data: {
        id: string;
        component: string;
        title: string;
        headerComponent?: string;
        params?: { [index: string]: any };
    };
    size: number;
    expanded?: boolean;
    /** Absent/true = visible; false = the pane was hidden via setVisible and
     *  `size` holds its cached pre-hide size. */
    visible?: boolean;
}

export interface SerializedPaneview {
    size: number;
    views: SerializedPaneviewPanel[];
}

export class PaneFramework extends DraggablePaneviewPanel {
    constructor(
        private readonly options: {
            id: string;
            component: string;
            headerComponent: string | undefined;
            body: IPanePart;
            header: IPanePart;
            orientation: Orientation;
            isExpanded: boolean;
            disableDnd: boolean;
            accessor: IPaneviewComponent;
            headerSize: number;
            minimumBodySize: number;
            maximumBodySize: number;
        }
    ) {
        super({
            accessor: options.accessor,
            id: options.id,
            component: options.component,
            headerComponent: options.headerComponent,
            orientation: options.orientation,
            isExpanded: options.isExpanded,
            disableDnd: options.disableDnd,
            headerSize: options.headerSize,
            minimumBodySize: options.minimumBodySize,
            maximumBodySize: options.maximumBodySize,
        });
    }

    getBodyComponent() {
        return this.options.body;
    }

    getHeaderComponent() {
        return this.options.header;
    }
}

export interface AddPaneviewComponentOptions<T extends object = Parameters> {
    id: string;
    component: string;
    headerComponent?: string;
    params?: T;
    minimumBodySize?: number;
    maximumBodySize?: number;
    headerSize?: number;
    isExpanded?: boolean;
    title: string;
    index?: number;
    size?: number;
}

export interface IPaneviewComponent extends IDisposable {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly minimumSize: number;
    readonly maximumSize: number;
    readonly panels: IPaneviewPanel[];
    readonly options: PaneviewComponentOptions;
    readonly onDidAddView: Event<PaneviewPanel>;
    readonly onDidRemoveView: Event<PaneviewPanel>;
    readonly onDidDrop: Event<PaneviewDidDropEvent>;
    readonly onDidLayoutChange: Event<void>;
    readonly onDidLayoutFromJSON: Event<void>;
    readonly onUnhandledDragOver: Event<PaneviewDndOverlayEvent>;
    addPanel<T extends object = Parameters>(
        options: AddPaneviewComponentOptions<T>
    ): IPaneviewPanel;
    layout(width: number, height: number): void;
    toJSON(): SerializedPaneview;
    fromJSON(serializedPaneview: SerializedPaneview): void;
    focus(): void;
    removePanel(panel: IPaneviewPanel): void;
    getPanel(id: string): IPaneviewPanel | undefined;
    movePanel(from: number, to: number): void;
    updateOptions(options: Partial<PaneviewComponentOptions>): void;
    setVisible(panel: IPaneviewPanel, visible: boolean): void;
    clear(): void;
}

export class PaneviewComponent extends Resizable implements IPaneviewComponent {
    private readonly _id = nextLayoutId.next();
    private _options: PaneviewComponentOptions;
    private readonly _disposable = new MutableDisposable();
    private readonly _viewDisposables = new Map<string, IDisposable>();
    private _paneview!: Paneview;

    private readonly _onDidLayoutfromJSON = new Emitter<void>();
    readonly onDidLayoutFromJSON: Event<void> = this._onDidLayoutfromJSON.event;

    private readonly _onDidLayoutChange = new Emitter<void>();
    readonly onDidLayoutChange: Event<void> = this._onDidLayoutChange.event;

    private readonly _onDidDrop = new Emitter<PaneviewDidDropEvent>();
    readonly onDidDrop: Event<PaneviewDidDropEvent> = this._onDidDrop.event;

    private readonly _onDidAddView = new Emitter<PaneviewPanel>();
    readonly onDidAddView = this._onDidAddView.event;

    private readonly _onDidRemoveView = new Emitter<PaneviewPanel>();
    readonly onDidRemoveView = this._onDidRemoveView.event;

    private readonly _onUnhandledDragOver =
        new Emitter<PaneviewDndOverlayEvent>();
    readonly onUnhandledDragOver: Event<PaneviewDndOverlayEvent> =
        this._onUnhandledDragOver.event;

    private readonly _classNames: Classnames;

    get id(): string {
        return this._id;
    }

    get panels(): PaneviewPanel[] {
        return this.paneview.getPanes();
    }

    set paneview(value: Paneview) {
        this._paneview = value;

        this._disposable.value = new CompositeDisposable(
            this._paneview.onDidChange(() => {
                this._onDidLayoutChange.fire(undefined);
            }),
            this._paneview.onDidAddView((e) => this._onDidAddView.fire(e)),
            this._paneview.onDidRemoveView((e) => this._onDidRemoveView.fire(e))
        );
    }

    get paneview(): Paneview {
        return this._paneview;
    }

    get minimumSize(): number {
        return this.paneview.minimumSize;
    }

    get maximumSize(): number {
        return this.paneview.maximumSize;
    }

    get height(): number {
        return this.paneview.orientation === Orientation.HORIZONTAL
            ? this.paneview.orthogonalSize
            : this.paneview.size;
    }

    get width(): number {
        return this.paneview.orientation === Orientation.HORIZONTAL
            ? this.paneview.size
            : this.paneview.orthogonalSize;
    }

    get options(): PaneviewComponentOptions {
        return this._options;
    }

    constructor(container: HTMLElement, options: PaneviewComponentOptions) {
        super(document.createElement('div'), options.disableAutoResizing);
        this.element.style.height = '100%';
        this.element.style.width = '100%';

        this.addDisposables(
            this._onDidLayoutChange,
            this._onDidLayoutfromJSON,
            this._onDidDrop,
            this._onDidAddView,
            this._onDidRemoveView,
            this._onUnhandledDragOver
        );

        this._classNames = new Classnames(this.element);
        this._classNames.setClassNames(options.className ?? '');

        // the container is owned by the third-party, do not modify/delete it
        container.appendChild(this.element);

        this._options = options;

        this.paneview = new Paneview(this.element, {
            // only allow paneview in the vertical orientation for now
            orientation: Orientation.VERTICAL,
        });

        this.addDisposables(this._disposable);
    }

    setVisible(panel: PaneviewPanel, visible: boolean): void {
        const index = this.panels.indexOf(panel);
        this.paneview.setViewVisible(index, visible);
    }

    focus(): void {
        //noop
    }

    updateOptions(options: Partial<PaneviewComponentOptions>): void {
        if ('className' in options) {
            this._classNames.setClassNames(options.className ?? '');
        }

        if ('disableAutoResizing' in options) {
            this.disableResizing = options.disableAutoResizing ?? false;
        }

        this._options = { ...this.options, ...options };
    }

    addPanel<T extends object = Parameters>(
        options: AddPaneviewComponentOptions<T>
    ): IPaneviewPanel {
        const body = this.options.createComponent({
            id: options.id,
            name: options.component,
        });

        let header: IPanePart | undefined;

        if (options.headerComponent && this.options.createHeaderComponent) {
            header = this.options.createHeaderComponent({
                id: options.id,
                name: options.headerComponent,
            });
        }

        header ??= new DefaultHeader();

        const view = new PaneFramework({
            id: options.id,
            component: options.component,
            headerComponent: options.headerComponent,
            header,
            body,
            orientation: Orientation.VERTICAL,
            isExpanded: !!options.isExpanded,
            disableDnd: !!this.options.disableDnd,
            accessor: this,
            headerSize: options.headerSize ?? HEADER_SIZE,
            minimumBodySize: MINIMUM_BODY_SIZE,
            maximumBodySize: MAXIMUM_BODY_SIZE,
        });

        this.doAddPanel(view);

        const size: Sizing | number =
            typeof options.size === 'number' ? options.size : Sizing.Distribute;
        const index =
            typeof options.index === 'number' ? options.index : undefined;

        view.init({
            params: options.params ?? {},
            minimumBodySize: options.minimumBodySize,
            maximumBodySize: options.maximumBodySize,
            isExpanded: options.isExpanded,
            title: options.title,
            containerApi: new PaneviewApi(this),
            accessor: this,
        });

        this.paneview.addPane(view, size, index);

        view.orientation = this.paneview.orientation;

        return view;
    }

    removePanel(panel: PaneviewPanel): void {
        const views = this.panels;
        const index = views.indexOf(panel);
        this.paneview.removePane(index);

        this.doRemovePanel(panel);
    }

    movePanel(from: number, to: number): void {
        this.paneview.moveView(from, to);
    }

    getPanel(id: string): PaneviewPanel | undefined {
        return this.panels.find((view) => view.id === id);
    }

    layout(width: number, height: number): void {
        const [size, orthogonalSize] =
            this.paneview.orientation === Orientation.HORIZONTAL
                ? [width, height]
                : [height, width];
        this.paneview.layout(size, orthogonalSize);
    }

    toJSON(): SerializedPaneview {
        const maximum = (value: number) =>
            value === Number.MAX_SAFE_INTEGER ||
            value === Number.POSITIVE_INFINITY
                ? undefined
                : value;
        const minimum = (value: number) => (value <= 0 ? undefined : value);

        const views: SerializedPaneviewPanel[] = this.paneview
            .getPanes()
            .map((view, i) => {
                // A pane hidden via setVisible(false) reports getViewSize 0;
                // its real (pre-hide) size lives in the cached visible size.
                // Serialize that plus a `visible: false` flag so it round-trips
                // hidden at its prior size rather than visible at size 0.
                const cachedVisibleSize =
                    this.paneview.getViewCachedVisibleSize(i);
                const hidden = typeof cachedVisibleSize === 'number';
                return {
                    size: hidden
                        ? cachedVisibleSize
                        : this.paneview.getViewSize(i),
                    data: view.toJSON(),
                    minimumSize: minimum(view.minimumBodySize),
                    maximumSize: maximum(view.maximumBodySize),
                    headerSize: view.headerSize,
                    expanded: view.isExpanded(),
                    ...(hidden ? { visible: false } : {}),
                };
            });

        return {
            views,
            size: this.paneview.size,
        };
    }

    fromJSON(serializedPaneview: SerializedPaneview): void {
        this.clear();

        const { views, size } = serializedPaneview;

        const queue: Function[] = [];

        const width = this.width;
        const height = this.height;

        this.paneview = new Paneview(this.element, {
            orientation: Orientation.VERTICAL,
            descriptor: {
                size,
                views: views.map((view) => {
                    const data = view.data;

                    const body = this.options.createComponent({
                        id: data.id,
                        name: data.component,
                    });

                    let header: IPanePart | undefined;

                    if (
                        data.headerComponent &&
                        this.options.createHeaderComponent
                    ) {
                        header = this.options.createHeaderComponent({
                            id: data.id,
                            name: data.headerComponent,
                        });
                    }

                    header ??= new DefaultHeader();

                    const panel = new PaneFramework({
                        id: data.id,
                        component: data.component,
                        headerComponent: data.headerComponent,
                        header,
                        body,
                        orientation: Orientation.VERTICAL,
                        isExpanded: !!view.expanded,
                        disableDnd: !!this.options.disableDnd,
                        accessor: this,
                        headerSize: view.headerSize ?? HEADER_SIZE,
                        minimumBodySize: view.minimumSize ?? MINIMUM_BODY_SIZE,
                        maximumBodySize: view.maximumSize ?? MAXIMUM_BODY_SIZE,
                    });

                    this.doAddPanel(panel);

                    queue.push(() => {
                        panel.init({
                            params: data.params ?? {},
                            minimumBodySize: view.minimumSize,
                            maximumBodySize: view.maximumSize,
                            title: data.title,
                            isExpanded: !!view.expanded,
                            containerApi: new PaneviewApi(this),
                            accessor: this,
                        });
                        panel.orientation = this.paneview.orientation;
                    });

                    setTimeout(() => {
                        // the original onDidAddView events are missed since they are fired before we can subcribe to them
                        this._onDidAddView.fire(panel);
                    }, 0);

                    return {
                        size: view.size,
                        view: panel,
                        visible: view.visible,
                    };
                }),
            },
        });

        this.layout(width, height);

        queue.forEach((f) => f());

        this._onDidLayoutfromJSON.fire();
    }

    clear(): void {
        for (const [_, value] of this._viewDisposables.entries()) {
            value.dispose();
        }
        this._viewDisposables.clear();

        this.paneview.dispose();
    }

    private doAddPanel(panel: PaneFramework): void {
        const disposable = new CompositeDisposable(
            panel.onDidDrop((event) => {
                this._onDidDrop.fire(event);
            }),
            panel.onUnhandledDragOver((event) => {
                this._onUnhandledDragOver.fire(event);
            })
        );

        this._viewDisposables.set(panel.id, disposable);
    }

    private doRemovePanel(panel: PaneviewPanel): void {
        const disposable = this._viewDisposables.get(panel.id);

        if (disposable) {
            disposable.dispose();
            this._viewDisposables.delete(panel.id);
        }
    }

    public dispose(): void {
        super.dispose();

        for (const [_, value] of this._viewDisposables.entries()) {
            value.dispose();
        }
        this._viewDisposables.clear();

        this.element.remove();

        this.paneview.dispose();
    }
}
