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
    SplitviewApi,
    SplitviewOptions,
    createSplitview,
    PROPERTY_KEYS_SPLITVIEW,
    SplitviewFrameworkOptions,
    SplitviewComponentOptions,
} from 'dockview';
import { AngularFrameworkComponentFactory } from '../utils/component-factory';
import { AngularLifecycleManager } from '../utils/lifecycle-utils';
import { SplitviewAngularReadyEvent } from './types';

export interface SplitviewAngularOptions extends SplitviewOptions {
    components: Record<string, Type<any> | TemplateRef<any>>;
}

@Component({
    selector: 'dv-splitview',
    standalone: true,
    template: '<div #splitviewContainer class="splitview-container"></div>',
    styles: [
        `
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }

            .splitview-container {
                width: 100%;
                height: 100%;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SplitviewAngularComponent implements OnInit, OnDestroy, OnChanges {
    @ViewChild('splitviewContainer', { static: true })
    private readonly containerRef!: ElementRef<HTMLDivElement>;

    @Input() components!: Record<string, Type<any> | TemplateRef<any>>;

    // Core splitview options as inputs
    @Input() className?: string;
    @Input() orientation?: 'horizontal' | 'vertical';
    @Input() proportionalLayout?: boolean;
    @Input() hideBorders?: boolean;
    @Input() debug?: boolean;
    @Input() disableAutoResizing?: boolean;

    @Output() ready = new EventEmitter<SplitviewAngularReadyEvent>();

    private splitviewApi?: SplitviewApi;
    private readonly lifecycleManager = new AngularLifecycleManager();
    private readonly injector = inject(Injector);
    private readonly environmentInjector = inject(EnvironmentInjector);

    ngOnInit(): void {
        this.initializeSplitview();
    }

    ngOnDestroy(): void {
        this.lifecycleManager.destroy();
        if (this.splitviewApi) {
            this.splitviewApi.dispose();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (this.splitviewApi) {
            const coreChanges: Partial<SplitviewOptions> = {};
            let hasChanges = false;

            PROPERTY_KEYS_SPLITVIEW.forEach((key) => {
                if (changes[key] && !changes[key].isFirstChange()) {
                    (coreChanges as any)[key] = changes[key].currentValue;
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                this.splitviewApi.updateOptions(coreChanges);
            }
        }
    }

    getSplitviewApi(): SplitviewApi | undefined {
        return this.splitviewApi;
    }

    private initializeSplitview(): void {
        if (!this.components) {
            throw new Error(
                'SplitviewAngularComponent: components input is required'
            );
        }

        const coreOptions = this.extractCoreOptions();
        const frameworkOptions = this.createFrameworkOptions();

        this.splitviewApi = createSplitview(this.containerRef.nativeElement, {
            ...coreOptions,
            ...frameworkOptions,
        });

        this.ready.emit({ api: this.splitviewApi });
    }

    private extractCoreOptions(): SplitviewOptions {
        const coreOptions: Partial<SplitviewComponentOptions> = {};

        PROPERTY_KEYS_SPLITVIEW.forEach((key) => {
            const value = (this as any)[key];
            if (value !== undefined) {
                (coreOptions as any)[key] = value;
            }
        });

        return coreOptions as SplitviewOptions;
    }

    private createFrameworkOptions(): SplitviewFrameworkOptions {
        const componentFactory = new AngularFrameworkComponentFactory(
            this.components,
            this.injector,
            this.environmentInjector
        );

        return {
            createComponent: (options) => {
                return componentFactory.createSplitviewComponent(options);
            },
        };
    }
}
