import {
    Type,
    Injector,
    EnvironmentInjector,
    ApplicationRef,
    ComponentRef,
    EmbeddedViewRef,
    TemplateRef,
    createComponent,
} from '@angular/core';
import {
    DockviewApi,
    DockviewCompositeDisposable,
    DockviewGroupLocation,
    DockviewGroupPanel,
    DockviewGroupPanelApi,
    IDockviewHeaderActionsProps,
    IDockviewPanel,
    IHeaderActionsRenderer,
} from 'dockview';

/**
 * Angular implementation of a header-actions renderer. Mirrors the React
 * `ReactHeaderActionsRendererPart`: dockview-core only provides `api`,
 * `containerApi`, and `group` at init time, so this renderer augments the
 * component instance with the rest of `IDockviewHeaderActionsProps`
 * (`panels`, `activePanel`, `isGroupActive`, `headerPosition`, `location`)
 * and subscribes to the relevant events to keep them up to date.
 */
export class AngularHeaderActionsRenderer implements IHeaderActionsRenderer {
    private readonly _element: HTMLElement;
    private componentRef: ComponentRef<unknown> | null = null;
    private viewRef: EmbeddedViewRef<unknown> | null = null;
    private readonly appRef: ApplicationRef;
    private subscriptions: DockviewCompositeDisposable | null = null;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(
        private readonly component: Type<unknown> | TemplateRef<unknown>,
        private readonly group: DockviewGroupPanel,
        private readonly injector: Injector,
        private readonly environmentInjector?: EnvironmentInjector
    ) {
        this._element = document.createElement('div');
        this._element.className = 'dv-angular-part';
        this._element.style.height = '100%';
        this._element.style.width = '100%';
        this.appRef = injector.get(ApplicationRef);
    }

    init(parameters: {
        containerApi: DockviewApi;
        api: DockviewGroupPanelApi;
    }): void {
        if (this.component instanceof TemplateRef) {
            // TemplateRef-based header actions cannot receive @Input()s;
            // render the template once and leave it static.
            this.viewRef = this.component.createEmbeddedView({}, this.injector);
            this._element.appendChild(this.viewRef.rootNodes[0] as HTMLElement);
            this.appRef.attachView(this.viewRef);
            this.viewRef.markForCheck();
            return;
        }

        this.componentRef = createComponent(this.component, {
            environmentInjector:
                this.environmentInjector ||
                (this.injector as EnvironmentInjector),
            elementInjector: this.injector,
        });

        const initialProps: IDockviewHeaderActionsProps = {
            api: parameters.api,
            containerApi: parameters.containerApi,
            panels: this.group.model.panels,
            activePanel: this.group.model.activePanel,
            isGroupActive: this.group.api.isActive,
            group: this.group,
            headerPosition: this.group.model.headerPosition,
            location: parameters.api.location,
        };
        this.assign(initialProps);

        const hostView = this.componentRef.hostView as EmbeddedViewRef<unknown>;
        const rootNode = hostView.rootNodes[0] as HTMLElement;
        this._element.appendChild(rootNode);
        this.appRef.attachView(hostView);
        this.componentRef.changeDetectorRef.markForCheck();

        this.subscriptions = new DockviewCompositeDisposable(
            this.group.model.onDidAddPanel(() => {
                this.assign({ panels: this.group.model.panels });
            }),
            this.group.model.onDidRemovePanel(() => {
                this.assign({ panels: this.group.model.panels });
            }),
            this.group.model.onDidChangeTabOrder(() => {
                this.assign({ panels: this.group.model.panels });
            }),
            this.group.model.onDidActivePanelChange(() => {
                this.assign({
                    activePanel: this.group.model.activePanel as
                        | IDockviewPanel
                        | undefined,
                });
            }),
            parameters.api.onDidActiveChange(() => {
                this.assign({ isGroupActive: this.group.api.isActive });
            }),
            parameters.api.onDidLocationChange((event) => {
                this.assign({
                    location: event.location as DockviewGroupLocation,
                });
            })
        );
    }

    dispose(): void {
        this.subscriptions?.dispose();
        this.subscriptions = null;
        if (this.componentRef) {
            this.appRef.detachView(this.componentRef.hostView);
            this.componentRef.destroy();
            this.componentRef = null;
        }
        if (this.viewRef) {
            this.appRef.detachView(this.viewRef);
            this.viewRef.destroy();
            this.viewRef = null;
        }
    }

    private assign(partial: Partial<IDockviewHeaderActionsProps>): void {
        if (!this.componentRef) {
            return;
        }
        const instance = this.componentRef.instance as Record<string, unknown>;
        for (const key of Object.keys(partial) as Array<
            keyof IDockviewHeaderActionsProps
        >) {
            instance[key] = partial[key];
        }
        this.componentRef.changeDetectorRef.markForCheck();
    }
}
