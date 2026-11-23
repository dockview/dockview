import {
    Type,
    Injector,
    EnvironmentInjector,
    TemplateRef,
} from '@angular/core';
import {
    GridviewPanel,
    GridviewApi,
    GridviewComponent,
    GridviewInitParameters,
    IFrameworkPart,
} from 'dockview';
import { AngularRenderer } from '../utils/angular-renderer';

export class AngularGridviewPanel extends GridviewPanel {
    constructor(
        id: string,
        component: string,
        private readonly angularComponent: Type<any> | TemplateRef<any>,
        private readonly injector: Injector,
        private readonly environmentInjector?: EnvironmentInjector
    ) {
        super(id, component);
    }

    getComponent(): IFrameworkPart {
        const renderer = new AngularRenderer({
            component: this.angularComponent,
            injector: this.injector,
            environmentInjector: this.environmentInjector,
        });
        renderer.init({
            params: this._params?.params ?? {},
            api: this.api,
            containerApi: new GridviewApi(
                (this._params as GridviewInitParameters)
                    .accessor as GridviewComponent
            ),
        });
        this.element.appendChild(renderer.element);
        return renderer;
    }
}
