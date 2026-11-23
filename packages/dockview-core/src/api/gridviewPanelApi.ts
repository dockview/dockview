import { Emitter, Event } from '../events';
import { IPanel } from '../panel/types';
import { FunctionOrValue } from '../types';
import { PanelApiImpl, PanelApi } from './panelApi';

export interface GridConstraintChangeEvent {
    readonly minimumWidth?: number;
    readonly minimumHeight?: number;
    readonly maximumWidth?: number;
    readonly maximumHeight?: number;
}

export interface GridConstraintChangeEvent2 {
    readonly minimumWidth?: FunctionOrValue<number>;
    readonly minimumHeight?: FunctionOrValue<number>;
    readonly maximumWidth?: FunctionOrValue<number>;
    readonly maximumHeight?: FunctionOrValue<number>;
}

export interface SizeEvent {
    readonly width?: number;
    readonly height?: number;
}

export interface GridviewPanelApi extends PanelApi {
    readonly onDidConstraintsChange: Event<GridConstraintChangeEvent>;
    setConstraints(value: GridConstraintChangeEvent2): void;
    setSize(event: SizeEvent): void;
}

export class GridviewPanelApiImpl
    extends PanelApiImpl
    implements GridviewPanelApi
{
    private readonly _onDidConstraintsChangeInternal =
        new Emitter<GridConstraintChangeEvent2>();
    readonly onDidConstraintsChangeInternal: Event<GridConstraintChangeEvent2> =
        this._onDidConstraintsChangeInternal.event;

    readonly _onDidConstraintsChange = new Emitter<GridConstraintChangeEvent>();
    readonly onDidConstraintsChange: Event<GridConstraintChangeEvent> =
        this._onDidConstraintsChange.event;

    private readonly _onDidSizeChange = new Emitter<SizeEvent>();
    readonly onDidSizeChange: Event<SizeEvent> = this._onDidSizeChange.event;

    constructor(id: string, component: string, panel?: IPanel) {
        super(id, component);

        this.addDisposables(
            this._onDidConstraintsChangeInternal,
            this._onDidConstraintsChange,
            this._onDidSizeChange
        );

        if (panel) {
            this.initialize(panel);
        }
    }

    public setConstraints(value: GridConstraintChangeEvent): void {
        this._onDidConstraintsChangeInternal.fire(value);
    }

    public setSize(event: SizeEvent): void {
        this._onDidSizeChange.fire(event);
    }
}
