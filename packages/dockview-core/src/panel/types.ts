import { IDisposable } from '../lifecycle';
import { LayoutPriority } from '../splitview/splitview';

/**
 * A key-value object of anything that is a valid JavaScript Object.
 */
export interface Parameters {
    [key: string]: any;
}

export interface PanelInitParameters {
    params: Parameters;
}

export interface PanelUpdateEvent<T extends Parameters = Parameters> {
    params: Partial<T>;
}

export interface IPanel extends IDisposable {
    readonly id: string;
    init(params: PanelInitParameters): void;
    layout(width: number, height: number): void;
    update(event: PanelUpdateEvent<Parameters>): void;
    toJSON(): object;
    focus(): void;
}

export interface IFrameworkPart extends IDisposable {
    /**
     * Called with a {@link PanelUpdateEvent} (`{ params }`) holding the
     * panel's full, merged parameters. Fired after `updateParameters` and
     * after each layout.
     */
    update(params: Parameters): void;
}

export interface BaseComponentOptions<T extends object = Parameters> {
    id: string;
    component: string;
    params?: T;
    snap?: boolean;
    priority?: LayoutPriority;
    size?: number;
}
