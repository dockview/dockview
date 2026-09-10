import { Emitter, Event, AsapEvent } from '../events';
import { getGridLocation, Gridview, IGridView } from './gridview';
import { Position } from '../dnd/droptarget';
import { Disposable, IDisposable, IValueDisposable } from '../lifecycle';
import { sequentialNumberGenerator } from '../math';
import { ISplitviewStyles, Orientation, Sizing } from '../splitview/splitview';
import { IPanel } from '../panel/types';
import { MovementOptions2 } from '../dockview/options';
import { Resizable } from '../resizable';
import { Classnames } from '../dom';

const nextLayoutId = sequentialNumberGenerator();

/**
 * A direction in which a panel can be moved or placed relative to another panel.
 */
export type Direction = 'left' | 'right' | 'above' | 'below' | 'within';

export function toTarget(direction: Direction): Position {
    switch (direction) {
        case 'left':
            return 'left';
        case 'right':
            return 'right';
        case 'above':
            return 'top';
        case 'below':
            return 'bottom';
        case 'within':
        default:
            return 'center';
    }
}

export interface MaximizedChanged<T extends IGridPanelView> {
    panel: T;
    isMaximized: boolean;
}

export interface BaseGridOptions {
    readonly proportionalLayout: boolean;
    readonly orientation: Orientation;
    readonly styles?: ISplitviewStyles;
    readonly disableAutoResizing?: boolean;
    readonly locked?: boolean;
    readonly margin?: number;
    readonly className?: string;
}

export interface IGridPanelView extends IGridView, IPanel {
    setActive(isActive: boolean): void;
    readonly isActive: boolean;
}

export interface IBaseGrid<T extends IGridPanelView> extends IDisposable {
    readonly element: HTMLElement;
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly minimumHeight: number;
    readonly maximumHeight: number;
    readonly minimumWidth: number;
    readonly maximumWidth: number;
    readonly activeGroup: T | undefined;
    readonly size: number;
    readonly groups: T[];
    readonly onDidMaximizedChange: Event<MaximizedChanged<T>>;
    readonly onDidLayoutChange: Event<void>;
    getPanel(id: string): T | undefined;
    toJSON(): object;
    fromJSON(data: any): void;
    clear(): void;
    layout(width: number, height: number, force?: boolean): void;
    setVisible(panel: T, visible: boolean): void;
    isVisible(panel: T): boolean;
    maximizeGroup(panel: T): void;
    isMaximizedGroup(panel: T): boolean;
    exitMaximizedGroup(): void;
    hasMaximizedGroup(): boolean;
}

export abstract class BaseGrid<T extends IGridPanelView>
    extends Resizable
    implements IBaseGrid<T>
{
    private readonly _id = nextLayoutId.next();
    protected readonly _groups = new Map<string, IValueDisposable<T>>();
    protected readonly gridview: Gridview;

    protected _activeGroup: T | undefined;

    private readonly _onDidRemove = new Emitter<T>();
    readonly onDidRemove: Event<T> = this._onDidRemove.event;

    private readonly _onDidAdd = new Emitter<T>();
    readonly onDidAdd: Event<T> = this._onDidAdd.event;

    private readonly _onDidMaximizedChange = new Emitter<MaximizedChanged<T>>();
    readonly onDidMaximizedChange: Event<MaximizedChanged<T>> =
        this._onDidMaximizedChange.event;

    private readonly _onDidActiveChange = new Emitter<T | undefined>();
    readonly onDidActiveChange: Event<T | undefined> =
        this._onDidActiveChange.event;

    protected readonly _bufferOnDidLayoutChange = new AsapEvent();
    readonly onDidLayoutChange: Event<void> =
        this._bufferOnDidLayoutChange.onEvent;

    private readonly _onDidViewVisibilityChangeMicroTaskQueue = new AsapEvent();
    readonly onDidViewVisibilityChangeMicroTaskQueue =
        this._onDidViewVisibilityChangeMicroTaskQueue.onEvent;

    private readonly _classNames: Classnames;

    get id(): string {
        return this._id;
    }

    get size(): number {
        return this._groups.size;
    }

    get groups(): T[] {
        return Array.from(this._groups.values()).map((_) => _.value);
    }

    get width(): number {
        return this.gridview.width;
    }

    get height(): number {
        return this.gridview.height;
    }

    get minimumHeight(): number {
        return this.gridview.minimumHeight;
    }
    get maximumHeight(): number {
        return this.gridview.maximumHeight;
    }
    get minimumWidth(): number {
        return this.gridview.minimumWidth;
    }
    get maximumWidth(): number {
        return this.gridview.maximumWidth;
    }

    get activeGroup(): T | undefined {
        return this._activeGroup;
    }

    get locked(): boolean {
        return this.gridview.locked;
    }

    set locked(value: boolean) {
        this.gridview.locked = value;
    }

    constructor(container: HTMLElement, options: BaseGridOptions) {
        super(document.createElement('div'), options.disableAutoResizing);
        this.element.style.height = '100%';
        this.element.style.width = '100%';

        this._classNames = new Classnames(this.element);
        this._classNames.setClassNames(options.className ?? '');

        // the container is owned by the third-party, do not modify/delete it
        container.appendChild(this.element);

        this.gridview = new Gridview(
            !!options.proportionalLayout,
            options.styles,
            options.orientation,
            options.locked,
            options.margin
        );

        this.gridview.locked = !!options.locked;

        this.element.appendChild(this.gridview.element);

        this.layout(0, 0, true); // set some elements height/widths

        this.addDisposables(
            this.gridview.onDidMaximizedNodeChange((event) => {
                this._onDidMaximizedChange.fire({
                    panel: event.view as T,
                    isMaximized: event.isMaximized,
                });
            }),
            this.gridview.onDidViewVisibilityChange(() =>
                this._onDidViewVisibilityChangeMicroTaskQueue.fire()
            ),
            this.onDidViewVisibilityChangeMicroTaskQueue(() => {
                this.forceRelayout();
            }),
            Disposable.from(() => {
                this.element.remove();
            }),
            this.gridview.onDidChange(() => {
                this._bufferOnDidLayoutChange.fire();
            }),
            Event.any(
                this.onDidAdd,
                this.onDidRemove,
                this.onDidActiveChange
            )(() => {
                this._bufferOnDidLayoutChange.fire();
            }),
            this._onDidMaximizedChange,
            this._onDidViewVisibilityChangeMicroTaskQueue,
            this._bufferOnDidLayoutChange
        );
    }

    public abstract toJSON(): object;

    public abstract fromJSON(data: any): void;

    public abstract clear(): void;

    public setVisible(panel: T, visible: boolean): void {
        this.gridview.setViewVisible(getGridLocation(panel.element), visible);
        this._bufferOnDidLayoutChange.fire();
    }

    public isVisible(panel: T): boolean {
        return this.gridview.isViewVisible(getGridLocation(panel.element));
    }

    updateOptions(options: Partial<BaseGridOptions>) {
        if (typeof options.proportionalLayout === 'boolean') {
            // this.gridview.proportionalLayout = options.proportionalLayout; // not supported
        }
        if (options.orientation) {
            this.gridview.orientation = options.orientation;
        }
        if ('styles' in options) {
            // this.gridview.styles = options.styles; // not supported
        }
        if ('disableAutoResizing' in options) {
            this.disableResizing = options.disableAutoResizing ?? false;
        }
        if ('locked' in options) {
            this.locked = options.locked ?? false;
        }
        if ('margin' in options) {
            this.gridview.margin = options.margin ?? 0;
        }
        if ('className' in options) {
            this._classNames.setClassNames(options.className ?? '');
        }
    }

    maximizeGroup(panel: T): void {
        this.gridview.maximizeView(panel);
        this.doSetGroupActive(panel);
    }

    isMaximizedGroup(panel: T): boolean {
        return this.gridview.maximizedView() === panel;
    }

    exitMaximizedGroup(): void {
        this.gridview.exitMaximizedView();
    }

    hasMaximizedGroup(): boolean {
        return this.gridview.hasMaximizedView();
    }

    protected doAddGroup(
        group: T,
        location: number[] = [0],
        size?: number | Sizing,
        gridview: Gridview = this.gridview
    ): void {
        gridview.addView(group, size ?? Sizing.Distribute, location);

        this._onDidAdd.fire(group);
    }

    protected doRemoveGroup(
        group: T,
        options?: { skipActive?: boolean; skipDispose?: boolean }
    ): T {
        if (!this._groups.has(group.id)) {
            throw new Error('invalid operation');
        }

        const item = this._groups.get(group.id);

        const view = this.gridview.remove(group, Sizing.Distribute);

        if (item && !options?.skipDispose) {
            item.disposable.dispose();
            item.value.dispose();
            this._groups.delete(group.id);
            this._onDidRemove.fire(group);
        }

        if (!options?.skipActive && this._activeGroup === group) {
            const groups = Array.from(this._groups.values());

            this.doSetGroupActive(
                groups.length > 0 ? groups[0].value : undefined
            );
        }

        return view as T;
    }

    public getPanel(id: string): T | undefined {
        return this._groups.get(id)?.value;
    }

    public doSetGroupActive(group: T | undefined): void {
        if (this._activeGroup === group) {
            return;
        }
        if (this._activeGroup) {
            this._activeGroup.setActive(false);
        }

        if (group) {
            group.setActive(true);
        }

        this._activeGroup = group;

        this._onDidActiveChange.fire(group);
    }

    public removeGroup(group: T): void {
        this.doRemoveGroup(group);
    }

    public activateNext(options?: MovementOptions2): void {
        options ??= {};
        if (!options.group) {
            if (!this.activeGroup) {
                return;
            }
            options.group = this.activeGroup;
        }

        const location = getGridLocation(options.group.element);
        const next = this.gridview.next(location)?.view;
        this.doSetGroupActive(next as T);
    }

    public activatePrevious(options?: MovementOptions2): void {
        options ??= {};
        if (!options.group) {
            if (!this.activeGroup) {
                return;
            }
            options.group = this.activeGroup;
        }

        const location = getGridLocation(options.group.element);
        const next = this.gridview.previous(location)?.view;
        this.doSetGroupActive(next as T);
    }

    protected forceRelayout(): void {
        this.layout(this.width, this.height, true);
    }

    public layout(width: number, height: number, forceResize?: boolean): void {
        const different =
            forceResize || width !== this.width || height !== this.height;

        if (!different) {
            return;
        }

        this.gridview.element.style.height = `${height}px`;
        this.gridview.element.style.width = `${width}px`;

        this.gridview.layout(width, height);
    }

    public dispose(): void {
        this._onDidActiveChange.dispose();
        this._onDidAdd.dispose();
        this._onDidRemove.dispose();

        for (const group of this.groups) {
            group.dispose();
        }

        this.gridview.dispose();

        super.dispose();
    }
}
