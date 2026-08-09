import {
    Component,
    ElementRef,
    EventEmitter,
    Injector,
    Input,
    OnDestroy,
    OnInit,
    Output,
    Type,
    ViewChild,
    ChangeDetectionStrategy,
    OnChanges,
    SimpleChanges,
    EnvironmentInjector,
    inject,
    TemplateRef,
} from '@angular/core';
import {
    PaneviewApi,
    PaneviewOptions,
    PaneviewDidDropEvent,
    createPaneview,
    PROPERTY_KEYS_PANEVIEW,
    PaneviewFrameworkOptions,
    PaneviewComponentOptions,
} from 'dockview';
import { AngularFrameworkComponentFactory } from '../utils/component-factory';
import { AngularLifecycleManager } from '../utils/lifecycle-utils';
import { PaneviewAngularReadyEvent } from './types';
import { AngularPanePart } from './angular-pane-part';

export interface PaneviewAngularOptions extends PaneviewOptions {
    components: Record<string, Type<any> | TemplateRef<any>>;
    headerComponents?: Record<string, Type<any> | TemplateRef<any>>;
}

@Component({
    selector: 'dv-paneview',
    standalone: true,
    template: '<div #paneviewContainer class="paneview-container"></div>',
    styles: [
        `
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }

            .paneview-container {
                width: 100%;
                height: 100%;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaneviewAngularComponent implements OnInit, OnDestroy, OnChanges {
    @ViewChild('paneviewContainer', { static: true })
    private readonly containerRef!: ElementRef<HTMLDivElement>;

    @Input() components!: Record<string, Type<any> | TemplateRef<any>>;
    @Input() headerComponents?: Record<string, Type<any> | TemplateRef<any>>;

    // Core paneview options as inputs
    @Input() className?: string;
    @Input() orientation?: 'horizontal' | 'vertical';
    @Input() hideBorders?: boolean;
    @Input() debug?: boolean;
    @Input() disableAutoResizing?: boolean;

    @Output() ready = new EventEmitter<PaneviewAngularReadyEvent>();
    @Output() drop = new EventEmitter<PaneviewDidDropEvent>();

    private paneviewApi?: PaneviewApi;
    private readonly lifecycleManager = new AngularLifecycleManager();
    private readonly injector = inject(Injector);
    private readonly environmentInjector = inject(EnvironmentInjector);

    ngOnInit(): void {
        this.initializePaneview();
    }

    ngOnDestroy(): void {
        this.lifecycleManager.destroy();
        if (this.paneviewApi) {
            this.paneviewApi.dispose();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (this.paneviewApi) {
            const coreChanges: Partial<PaneviewOptions> = {};
            let hasChanges = false;

            PROPERTY_KEYS_PANEVIEW.forEach((key) => {
                if (changes[key] && !changes[key].isFirstChange()) {
                    (coreChanges as any)[key] = changes[key].currentValue;
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                this.paneviewApi.updateOptions(coreChanges);
            }
        }
    }

    getPaneviewApi(): PaneviewApi | undefined {
        return this.paneviewApi;
    }

    private initializePaneview(): void {
        if (!this.components) {
            throw new Error(
                'PaneviewAngularComponent: components input is required'
            );
        }

        const coreOptions = this.extractCoreOptions();
        const frameworkOptions = this.createFrameworkOptions();

        this.paneviewApi = createPaneview(this.containerRef.nativeElement, {
            ...coreOptions,
            ...frameworkOptions,
        });

        this.setupEventListeners();

        this.ready.emit({ api: this.paneviewApi });
    }

    private extractCoreOptions(): PaneviewOptions {
        const coreOptions: Partial<PaneviewComponentOptions> = {};

        PROPERTY_KEYS_PANEVIEW.forEach((key) => {
            const value = (this as any)[key];
            if (value !== undefined) {
                (coreOptions as any)[key] = value;
            }
        });

        return coreOptions as PaneviewOptions;
    }

    private createFrameworkOptions(): PaneviewFrameworkOptions {
        const componentFactory = new AngularFrameworkComponentFactory(
            this.components,
            this.injector,
            this.environmentInjector,
            this.headerComponents
        );

        return {
            createComponent: (options) => {
                return componentFactory.createPaneviewComponent(options);
            },
            createHeaderComponent: this.headerComponents
                ? (options) => {
                      return new AngularPanePart(
                          this.headerComponents![options.name],
                          this.injector,
                          this.environmentInjector
                      );
                  }
                : undefined,
        };
    }

    private setupEventListeners(): void {
        if (!this.paneviewApi) {
            return;
        }

        const api = this.paneviewApi;

        if (this.drop.observers.length > 0) {
            const disposable = api.onDidDrop((event) => {
                this.drop.emit(event);
            });
            this.lifecycleManager.addDisposable(disposable);
        }
    }
}
