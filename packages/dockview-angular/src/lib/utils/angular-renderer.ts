import {
    ApplicationRef,
    ChangeDetectionStrategy,
    Component,
    ComponentRef,
    createComponent,
    EmbeddedViewRef,
    EnvironmentInjector,
    Injector,
    TemplateRef,
    Type,
    ViewChild,
    ViewContainerRef,
} from '@angular/core';
import { IContentRenderer, IFrameworkPart, Parameters } from 'dockview';

export interface AngularRendererOptions<T = unknown> {
    component: Type<T> | TemplateRef<T>;
    injector: Injector;
    environmentInjector?: EnvironmentInjector;
}

/**
 * An `OnPush` boundary that hosts a single dockview panel component in its
 * `ViewContainerRef`. Each panel view is attached to the application for change
 * detection; without this boundary every panel would be fully checked on every
 * CD tick, so a dockview resize/drag (which triggers ticks via zone.js) ran
 * change detection across *all* panels — O(panels) per event.
 *
 * Because the boundary is `OnPush`, a global tick that didn't touch this panel
 * finds it clean and skips it (and its hosted component) entirely. The panel is
 * still fully interactive: a DOM event inside it, an `@Input` change, or an
 * `async` pipe all mark the hosted component — and, walking up, this boundary —
 * dirty, so the next tick checks it. Panel content of any change-detection
 * strategy works, including components created outside the Angular zone.
 */
@Component({
    selector: 'dv-ng-cd-boundary',
    template: '<ng-container #vcr></ng-container>',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    host: { style: 'display:block;height:100%;width:100%;' },
})
class DockviewCdBoundary {
    @ViewChild('vcr', { read: ViewContainerRef, static: true })
    vcr!: ViewContainerRef;
}

export class AngularRenderer<T = unknown>
    implements IContentRenderer, IFrameworkPart
{
    private componentRef: ComponentRef<T> | null = null;
    private boundaryRef: ComponentRef<DockviewCdBoundary> | null = null;
    private viewRef: EmbeddedViewRef<T> | null = null;
    private _element: HTMLElement | null = null;
    private readonly appRef: ApplicationRef;

    constructor(private readonly options: AngularRendererOptions<T>) {
        this.appRef = options.injector.get(ApplicationRef);
    }

    get element(): HTMLElement {
        if (!this._element) {
            throw new Error('Angular renderer not initialized');
        }
        return this._element;
    }

    get component(): ComponentRef<T> | null {
        return this.componentRef;
    }
    get view(): EmbeddedViewRef<T> | null {
        return this.viewRef;
    }

    init(parameters: Parameters): void {
        // Forward the known user-facing fields from panel/tab renderers
        // and context menu item renderers. Other internal fields (e.g. 'title')
        // are excluded here; update() further guards with `key in instance`.
        const filtered: Record<string, unknown> = {};
        // Panel / tab renderer fields
        if ('params' in parameters) {
            filtered['params'] = parameters['params'];
        }
        if ('api' in parameters) {
            filtered['api'] = parameters['api'];
        }
        if ('containerApi' in parameters) {
            filtered['containerApi'] = parameters['containerApi'];
        }
        // Context menu item renderer fields: IContextMenuItemComponentProps
        // (tab menu, carries `panel`) and IChipContextMenuItemComponentProps
        // (chip menu, carries `tabGroup`).
        if ('panel' in parameters) {
            filtered['panel'] = parameters['panel'];
        }
        if ('tabGroup' in parameters) {
            filtered['tabGroup'] = parameters['tabGroup'];
        }
        if ('group' in parameters) {
            filtered['group'] = parameters['group'];
        }
        if ('close' in parameters) {
            filtered['close'] = parameters['close'];
        }
        if ('componentProps' in parameters) {
            filtered['componentProps'] = parameters['componentProps'];
        }

        if (this._element) {
            this.update(filtered);
        } else {
            this.render(filtered);
        }
    }

    update(params: Parameters): void {
        // Only component can have parameters
        if (!this.componentRef) {
            return;
        }

        const instance = this.componentRef.instance as Record<string, unknown>;

        for (const key of Object.keys(params)) {
            instance[key] = params[key];
        }

        if (this.viewRef) {
            this.viewRef.markForCheck();
        }
    }

    private render(parameters: Parameters): void {
        try {
            if (this.options.component instanceof TemplateRef) {
                this.setupView(this.options.component);
            } else {
                this.setupComponent(this.options.component, parameters);
            }
        } catch (error) {
            console.error('dockview: error creating Angular component', error);
            throw error;
        }
    }

    private setupComponent(component: Type<T>, parameters: Parameters): void {
        const environmentInjector =
            this.options.environmentInjector ||
            (this.options.injector as EnvironmentInjector);

        // Create the OnPush boundary and attach *it* (not the panel component)
        // to the application. Global CD ticks that don't touch this panel find
        // the boundary clean and skip it and the hosted component.
        this.boundaryRef = createComponent(DockviewCdBoundary, {
            environmentInjector,
            elementInjector: this.options.injector,
        });
        this.appRef.attachView(this.boundaryRef.hostView);
        // resolve the `@ViewChild` ViewContainerRef
        this.boundaryRef.changeDetectorRef.detectChanges();

        // Host the panel component inside the boundary's ViewContainerRef so it
        // is a CD child of the boundary (its markForCheck walks up to it).
        this.componentRef = this.boundaryRef.instance.vcr.createComponent(
            component,
            {
                injector: this.options.injector,
                environmentInjector,
            }
        );

        // Set initial parameters. NOTE: this runs before `viewRef` is assigned
        // below, so update()'s markForCheck is a no-op here; the initial render
        // is instead driven by the explicit detectChanges() at the end of this
        // method. Keep that ordering — assigning viewRef first would make
        // update() mark-for-check without a following tick and paint stale.
        this.update(parameters);

        this.viewRef = this.componentRef.hostView as EmbeddedViewRef<T>;
        // The panel's DOM node is the boundary's host element (which contains
        // the hosted component); dockview positions this.
        this._element = (this.boundaryRef.hostView as EmbeddedViewRef<unknown>)
            .rootNodes[0] as HTMLElement;

        // initial render of the hosted component
        this.boundaryRef.changeDetectorRef.detectChanges();
    }

    private setupView(template: TemplateRef<T>): void {
        this.viewRef = template.createEmbeddedView(
            <never>{},
            this.options.injector
        );
        this._element = this.viewRef.rootNodes[0] as HTMLElement;

        this.appRef.attachView(this.viewRef);
        this.viewRef.markForCheck();
    }

    dispose(): void {
        if (this.componentRef) {
            this.componentRef.destroy();
            this.componentRef = null;
        }
        if (this.boundaryRef) {
            // detach the boundary from the application's CD before destroying it
            this.appRef.detachView(this.boundaryRef.hostView);
            this.boundaryRef.destroy();
            this.boundaryRef = null;
        }
        if (this.viewRef) {
            this.viewRef.destroy();
            this.viewRef = null;
        }
        // Intentionally retain `_element` after dispose. Dockview's overlay
        // teardown reads `panel.view.content.element` while removing the node
        // from its overlay parent, so nulling here would make the getter throw
        // mid-cascade. The HTMLElement reference is cheap and will be GC'd
        // when the renderer itself is collected.
    }
}
