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
    DockviewApi,
    DockviewOptions,
    DockviewReadyEvent,
    DockviewDidDropEvent,
    DockviewWillDropEvent,
    createDockview,
    PROPERTY_KEYS_DOCKVIEW,
    DockviewFrameworkOptions,
    DockviewComponentOptions,
    CspNonceProvider,
    GetTabContextMenuItemsParams,
    GetTabGroupChipContextMenuItemsParams,
    BuiltInChipContextMenuItem,
    ContextMenuItemConfig,
    ContextMenuItem,
    DockviewTabGroupColorEntry,
    DockviewHeaderPosition,
    DockviewDndStrategy,
    DockviewPanelRenderer,
    DockviewTheme,
    DroptargetOverlayModel,
} from 'dockview';
import { AngularFrameworkComponentFactory } from '../utils/component-factory';
import { AngularRenderer } from '../utils/angular-renderer';
import { AngularLifecycleManager } from '../utils/lifecycle-utils';
import { AngularTabGroupChipRenderer } from './angular-tab-group-chip-renderer';
import { AngularGroupDragGhostRenderer } from './angular-group-drag-ghost-renderer';

export interface DockviewAngularOptions extends DockviewOptions {
    components: Record<string, Type<any>>;
    tabComponents?: Record<string, Type<any>>;
    watermarkComponent?: Type<any>;
    defaultTabComponent?: Type<any>;
    leftHeaderActionsComponent?: Type<any>;
    rightHeaderActionsComponent?: Type<any>;
    prefixHeaderActionsComponent?: Type<any>;
    getTabContextMenuItems?: (
        params: GetTabContextMenuItemsParams
    ) => (ContextMenuItem | { component: Type<any> })[];
}

@Component({
    selector: 'dv-dockview',
    standalone: true,
    template: '<div #dockviewContainer class="dockview-container"></div>',
    styles: [
        `
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }

            .dockview-container {
                width: 100%;
                height: 100%;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DockviewAngularComponent implements OnInit, OnDestroy, OnChanges {
    @ViewChild('dockviewContainer', { static: true })
    private readonly containerRef!: ElementRef<HTMLDivElement>;

    @Input() components!: Record<string, Type<any> | TemplateRef<any>>;
    @Input() tabComponents?: Record<string, Type<any> | TemplateRef<any>>;
    @Input() watermarkComponent?: Type<any> | TemplateRef<any>;
    @Input() defaultTabComponent?: Type<any> | TemplateRef<any>;
    @Input() leftHeaderActionsComponent?: Type<any> | TemplateRef<any>;
    @Input() rightHeaderActionsComponent?: Type<any> | TemplateRef<any>;
    @Input() prefixHeaderActionsComponent?: Type<any> | TemplateRef<any>;
    @Input() tabGroupChipComponent?: Type<any>;
    @Input() groupDragGhostComponent?: Type<any>;

    // Core dockview options as inputs
    @Input() className?: string;
    @Input() orientation?: 'horizontal' | 'vertical';
    @Input() hideBorders?: boolean;
    @Input() defaultTabComponent_?: string;
    @Input() tabHeight?: number;
    @Input() disableFloatingGroups?: boolean;
    @Input() floatingGroupBounds?: 'boundedWithinViewport';
    @Input() popoutUrl?: string;
    @Input() nonce?: CspNonceProvider;
    @Input() debug?: boolean;
    @Input() locked?: boolean;
    @Input() disableAutoResizing?: boolean;
    @Input() singleTabMode?: 'fullwidth' | 'default';
    @Input() theme?: DockviewTheme;
    @Input() scrollbars?: 'native' | 'custom';
    @Input() disableTabsOverflowList?: boolean;
    @Input() defaultRenderer?: DockviewPanelRenderer;
    @Input() defaultHeaderPosition?: DockviewHeaderPosition;
    @Input() disableDnd?: boolean;
    @Input() dndStrategy?: DockviewDndStrategy;
    @Input() dndEdges?: false | DroptargetOverlayModel;
    @Input() noPanelsOverlay?: 'emptyGroup' | 'watermark';
    @Input() getTabContextMenuItems?: (
        params: GetTabContextMenuItemsParams
    ) => (ContextMenuItem | { component: Type<any> | TemplateRef<any> })[];
    @Input() getTabGroupChipContextMenuItems?: (
        params: GetTabGroupChipContextMenuItemsParams
    ) => (
        | BuiltInChipContextMenuItem
        | ContextMenuItemConfig
        | { component: Type<any> | TemplateRef<any> }
    )[];
    @Input() tabGroupColors?: DockviewTabGroupColorEntry[];
    @Input() tabGroupAccent?: 'palette' | 'off';
    // These option keys are in PROPERTY_KEYS_DOCKVIEW; without an @Input()
    // bindings like [overflow] raise NG0303 and never reach dockview-core.
    // Typed via indexed access so they track the core option shape.
    @Input() overflow?: DockviewOptions['overflow'];
    @Input() pinnedTabs?: DockviewOptions['pinnedTabs'];
    @Input() smartGuides?: DockviewOptions['smartGuides'];
    @Input() dndCompass?: DockviewOptions['dndCompass'];
    @Input() dropPositionResolver?: DockviewOptions['dropPositionResolver'];

    @Output() ready = new EventEmitter<DockviewReadyEvent>();
    @Output() didDrop = new EventEmitter<DockviewDidDropEvent>();
    @Output() willDrop = new EventEmitter<DockviewWillDropEvent>();

    private dockviewApi?: DockviewApi;
    private frameworkComponentFactory?: AngularFrameworkComponentFactory;
    private readonly lifecycleManager = new AngularLifecycleManager();
    private readonly injector = inject(Injector);
    private readonly environmentInjector = inject(EnvironmentInjector);

    /** Inputs that feed the framework component factory (not core options). */
    private static readonly COMPONENT_MAP_INPUTS = [
        'components',
        'tabComponents',
        'watermarkComponent',
        'defaultTabComponent',
        'leftHeaderActionsComponent',
        'rightHeaderActionsComponent',
        'prefixHeaderActionsComponent',
    ] as const;

    ngOnInit(): void {
        this.initializeDockview();
    }

    ngOnDestroy(): void {
        this.lifecycleManager.destroy();
        if (this.dockviewApi) {
            this.dockviewApi.dispose();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (this.dockviewApi) {
            const coreChanges: Partial<DockviewOptions> = {};
            let hasChanges = false;

            PROPERTY_KEYS_DOCKVIEW.forEach((key) => {
                if (changes[key] && !changes[key].isFirstChange()) {
                    (coreChanges as any)[key] = changes[key].currentValue;
                    hasChanges = true;
                }
            });

            if (
                changes['tabGroupChipComponent'] &&
                !changes['tabGroupChipComponent'].isFirstChange()
            ) {
                const chipComponent =
                    changes['tabGroupChipComponent'].currentValue;
                coreChanges.createTabGroupChipComponent = chipComponent
                    ? () =>
                          new AngularTabGroupChipRenderer(
                              chipComponent,
                              this.injector,
                              this.environmentInjector
                          )
                    : undefined;
                hasChanges = true;
            }

            if (
                changes['groupDragGhostComponent'] &&
                !changes['groupDragGhostComponent'].isFirstChange()
            ) {
                const ghostComponent =
                    changes['groupDragGhostComponent'].currentValue;
                coreChanges.createGroupDragGhostComponent = ghostComponent
                    ? () =>
                          new AngularGroupDragGhostRenderer(
                              ghostComponent,
                              this.injector,
                              this.environmentInjector
                          )
                    : undefined;
                hasChanges = true;
            }

            if (hasChanges) {
                this.dockviewApi.updateOptions(coreChanges);
            }

            // Refresh the framework component factory when any component-map
            // input is rebound, so a new `[components]` (etc.) map is honoured
            // rather than leaving the factory pinned to the init-time snapshot.
            const componentMapChanged =
                DockviewAngularComponent.COMPONENT_MAP_INPUTS.some(
                    (key) => changes[key] && !changes[key].isFirstChange()
                );
            if (componentMapChanged && this.frameworkComponentFactory) {
                this.frameworkComponentFactory.updateComponents({
                    components: this.components,
                    tabComponents: this.tabComponents,
                    watermarkComponent: this.watermarkComponent,
                    headerActionsComponents:
                        this.buildHeaderActionsComponents(),
                    defaultTabComponent: this.defaultTabComponent,
                });
            }
        }
    }

    getDockviewApi(): DockviewApi | undefined {
        return this.dockviewApi;
    }

    private initializeDockview(): void {
        if (!this.components) {
            throw new Error(
                'DockviewAngularComponent: components input is required'
            );
        }

        const coreOptions = this.extractCoreOptions();
        const frameworkOptions = this.createFrameworkOptions();

        this.dockviewApi = createDockview(this.containerRef.nativeElement, {
            ...coreOptions,
            ...frameworkOptions,
        });

        this.setupEventListeners();

        this.ready.emit({ api: this.dockviewApi });
    }

    private extractCoreOptions(): DockviewOptions {
        const coreOptions: Partial<DockviewComponentOptions> = {};

        PROPERTY_KEYS_DOCKVIEW.forEach((key) => {
            const value = (this as any)[key];
            if (value !== undefined) {
                (coreOptions as any)[key] = value;
            }
        });

        if (this.tabGroupChipComponent) {
            const chipComponent = this.tabGroupChipComponent;
            coreOptions.createTabGroupChipComponent = () => {
                return new AngularTabGroupChipRenderer(
                    chipComponent,
                    this.injector,
                    this.environmentInjector
                );
            };
        }

        if (this.groupDragGhostComponent) {
            const ghostComponent = this.groupDragGhostComponent;
            coreOptions.createGroupDragGhostComponent = () => {
                return new AngularGroupDragGhostRenderer(
                    ghostComponent,
                    this.injector,
                    this.environmentInjector
                );
            };
        }

        return coreOptions as DockviewOptions;
    }

    private buildHeaderActionsComponents(): Record<
        string,
        Type<any> | TemplateRef<any>
    > {
        const headerActionsComponents: Record<
            string,
            Type<any> | TemplateRef<any>
        > = {};
        if (this.leftHeaderActionsComponent) {
            headerActionsComponents['left'] = this.leftHeaderActionsComponent;
        }
        if (this.rightHeaderActionsComponent) {
            headerActionsComponents['right'] = this.rightHeaderActionsComponent;
        }
        if (this.prefixHeaderActionsComponent) {
            headerActionsComponents['prefix'] =
                this.prefixHeaderActionsComponent;
        }
        return headerActionsComponents;
    }

    private createFrameworkOptions(): DockviewFrameworkOptions {
        const headerActionsComponents = this.buildHeaderActionsComponents();

        const componentFactory = new AngularFrameworkComponentFactory(
            this.components,
            this.injector,
            this.environmentInjector,
            this.tabComponents,
            this.watermarkComponent,
            headerActionsComponents,
            this.defaultTabComponent
        );
        this.frameworkComponentFactory = componentFactory;

        return {
            createComponent: (options) => {
                return componentFactory.createDockviewComponent(options);
            },
            createTabComponent: (options) => {
                return componentFactory.createTabComponent(options);
            },
            createWatermarkComponent: this.watermarkComponent
                ? () => {
                      return componentFactory.createWatermarkComponent();
                  }
                : undefined,
            createLeftHeaderActionComponent: this.leftHeaderActionsComponent
                ? (group) => {
                      return componentFactory.createHeaderActionsComponent(
                          'left',
                          group
                      )!;
                  }
                : undefined,
            createRightHeaderActionComponent: this.rightHeaderActionsComponent
                ? (group) => {
                      return componentFactory.createHeaderActionsComponent(
                          'right',
                          group
                      )!;
                  }
                : undefined,
            createPrefixHeaderActionComponent: this.prefixHeaderActionsComponent
                ? (group) => {
                      return componentFactory.createHeaderActionsComponent(
                          'prefix',
                          group
                      )!;
                  }
                : undefined,
            createContextMenuItemComponent: (options) => {
                if (!options.component) {
                    return undefined;
                }
                const renderer = new AngularRenderer({
                    component: options.component as
                        | Type<any>
                        | TemplateRef<any>,
                    injector: this.injector,
                    environmentInjector: this.environmentInjector,
                });
                return renderer;
            },
        };
    }

    private setupEventListeners(): void {
        if (!this.dockviewApi) {
            return;
        }

        const api = this.dockviewApi;

        if (this.didDrop.observers.length > 0) {
            const disposable = api.onDidDrop((event) => {
                this.didDrop.emit(event);
            });
            this.lifecycleManager.addDisposable(disposable);
        }

        if (this.willDrop.observers.length > 0) {
            const disposable = api.onWillDrop((event) => {
                this.willDrop.emit(event);
            });
            this.lifecycleManager.addDisposable(disposable);
        }
    }
}
