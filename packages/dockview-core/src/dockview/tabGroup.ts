import { Emitter, Event } from '../events';
import { CompositeDisposable } from '../lifecycle';

/**
 * The accent color associated with a tab group.
 *
 * This is any CSS color expression: a palette id (e.g. `'grey'`, `'blue'`),
 * a raw color literal (`'#abc123'`, `'rgb(0,0,0)'`), or `undefined` to inherit
 * the default. Resolution to a concrete CSS value is handled by the
 * dockview's `TabGroupColorPalette` (see `tabGroupAccent.ts`).
 *
 * This is a deliberate semantic alias for a public API type; inlining it to
 * `string` would be a breaking API change and lose the documented meaning.
 */
export type DockviewTabGroupColor = string;

export interface SerializedTabGroup {
    id: string;
    label?: string;
    color?: string;
    collapsed: boolean;
    panelIds: string[];
    componentParams?: Record<string, unknown>;
}

export interface TabGroupOptions {
    label?: string;
    color?: string;
    collapsed?: boolean;
    /**
     * Free-form data passed to a custom chip renderer
     * (`createTabGroupChipComponent`). Read via `tabGroup.componentParams`
     * inside the renderer's `init` / `update`. Must be JSON-serializable to
     * round-trip through layout serialization.
     */
    componentParams?: Record<string, unknown>;
}

export interface ITabGroup {
    readonly id: string;
    readonly label: string;
    readonly color: string | undefined;
    readonly collapsed: boolean;
    readonly panelIds: readonly string[];
    readonly size: number;
    readonly isEmpty: boolean;
    readonly componentParams: Record<string, unknown> | undefined;
    readonly onDidChange: Event<void>;
    readonly onDidPanelChange: Event<{
        panelId: string;
        type: 'add' | 'remove';
    }>;
    readonly onDidCollapseChange: Event<boolean>;
    readonly onDidDestroy: Event<void>;
    addPanel(panelId: string, index?: number): void;
    removePanel(panelId: string): boolean;
    indexOfPanel(panelId: string): number;
    containsPanel(panelId: string): boolean;
    setLabel(value: string): void;
    setColor(value: string | undefined): void;
    setComponentParams(value: Record<string, unknown> | undefined): void;
    collapse(): void;
    expand(): void;
    toggle(): void;
    toJSON(): SerializedTabGroup;
    dispose(): void;
}

export class TabGroup extends CompositeDisposable implements ITabGroup {
    private _label: string;
    private _color: string | undefined;
    private _collapsed = false;
    private _componentParams: Record<string, unknown> | undefined;
    private readonly _panelIds: string[] = [];

    private readonly _onDidChange = new Emitter<void>();
    readonly onDidChange: Event<void> = this._onDidChange.event;

    private readonly _onDidPanelChange = new Emitter<{
        panelId: string;
        type: 'add' | 'remove';
    }>();
    readonly onDidPanelChange = this._onDidPanelChange.event;

    private readonly _onDidCollapseChange = new Emitter<boolean>();
    readonly onDidCollapseChange: Event<boolean> =
        this._onDidCollapseChange.event;

    private readonly _onDidDestroy = new Emitter<void>();
    readonly onDidDestroy: Event<void> = this._onDidDestroy.event;

    get label(): string {
        return this._label;
    }

    get color(): string | undefined {
        return this._color;
    }

    get componentParams(): Record<string, unknown> | undefined {
        return this._componentParams;
    }

    setLabel(value: string): void {
        if (this.isDisposed || this._label === value) {
            return;
        }
        this._label = value;
        this._onDidChange.fire();
    }

    setColor(value: string | undefined): void {
        if (this.isDisposed) {
            return;
        }
        const next = value === '' ? undefined : value;
        if (this._color === next) {
            return;
        }
        this._color = next;
        this._onDidChange.fire();
    }

    setComponentParams(value: Record<string, unknown> | undefined): void {
        if (this.isDisposed) {
            return;
        }
        this._componentParams = value;
        this._onDidChange.fire();
    }

    get collapsed(): boolean {
        return this._collapsed;
    }

    get panelIds(): readonly string[] {
        return this._panelIds;
    }

    get size(): number {
        return this._panelIds.length;
    }

    get isEmpty(): boolean {
        return this._panelIds.length === 0;
    }

    constructor(
        readonly id: string,
        options?: TabGroupOptions
    ) {
        super();

        this._label = options?.label ?? '';
        this._color = options?.color === '' ? undefined : options?.color;
        this._collapsed = options?.collapsed ?? false;
        this._componentParams = options?.componentParams;

        this.addDisposables(
            this._onDidChange,
            this._onDidPanelChange,
            this._onDidCollapseChange,
            this._onDidDestroy
        );
    }

    addPanel(panelId: string, index?: number): void {
        if (this.isDisposed) {
            return;
        }
        if (this._panelIds.includes(panelId)) {
            return;
        }

        const insertIndex =
            index === undefined
                ? this._panelIds.length
                : Math.max(0, Math.min(index, this._panelIds.length));

        this._panelIds.splice(insertIndex, 0, panelId);
        this._onDidPanelChange.fire({ panelId, type: 'add' });
    }

    removePanel(panelId: string): boolean {
        if (this.isDisposed) {
            return false;
        }
        const index = this._panelIds.indexOf(panelId);
        if (index === -1) {
            return false;
        }
        this._panelIds.splice(index, 1);
        this._onDidPanelChange.fire({ panelId, type: 'remove' });
        return true;
    }

    indexOfPanel(panelId: string): number {
        return this._panelIds.indexOf(panelId);
    }

    containsPanel(panelId: string): boolean {
        return this._panelIds.includes(panelId);
    }

    collapse(): void {
        if (this.isDisposed || this._collapsed) {
            return;
        }
        this._collapsed = true;
        this._onDidCollapseChange.fire(true);
    }

    expand(): void {
        if (this.isDisposed || !this._collapsed) {
            return;
        }
        this._collapsed = false;
        this._onDidCollapseChange.fire(false);
    }

    toggle(): void {
        if (this._collapsed) {
            this.expand();
        } else {
            this.collapse();
        }
    }

    toJSON(): SerializedTabGroup {
        const result: SerializedTabGroup = {
            id: this.id,
            collapsed: this._collapsed,
            panelIds: [...this._panelIds],
        };
        if (this._label) {
            result.label = this._label;
        }
        if (this._color !== undefined) {
            result.color = this._color;
        }
        if (this._componentParams !== undefined) {
            result.componentParams = this._componentParams;
        }
        return result;
    }

    override dispose(): void {
        this._onDidDestroy.fire();
        super.dispose();
    }
}
