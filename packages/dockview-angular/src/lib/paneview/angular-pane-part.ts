import {
    Type,
    Injector,
    EnvironmentInjector,
    TemplateRef,
} from '@angular/core';
import {
    IPanePart,
    PanelUpdateEvent,
    PanePanelComponentInitParameter,
} from 'dockview';
import { AngularRenderer } from '../utils/angular-renderer';

export class AngularPanePart implements IPanePart {
    private readonly renderer: AngularRenderer;

    constructor(
        private readonly angularComponent: Type<any> | TemplateRef<any>,
        private readonly injector: Injector,
        private readonly environmentInjector?: EnvironmentInjector
    ) {
        this.renderer = new AngularRenderer({
            component: this.angularComponent,
            injector: this.injector,
            environmentInjector: this.environmentInjector,
            // a pane part also receives the panel's `title`, as React/Vue do
            extraInputs: ['title'],
        });
    }

    get element(): HTMLElement {
        return this.renderer.element;
    }

    init(parameters: PanePanelComponentInitParameter): void {
        this.renderer.init(parameters);
    }

    update(params: PanelUpdateEvent): void {
        this.renderer.update(params);
    }

    dispose(): void {
        this.renderer.dispose();
    }
}
