import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    EnvironmentInjector,
    EventEmitter,
    inject,
    Injector,
    Input,
    type OnDestroy,
    type OnInit,
    Output,
    type TemplateRef,
    type Type,
    ViewChild,
} from '@angular/core';
import {
    createWorkbench,
    type SideBarPosition,
    type WorkbenchActivityBarOptions,
    type WorkbenchApi,
    type WorkbenchBandOptions,
    type WorkbenchComponentOptions,
    type WorkbenchPanelOptions,
    type WorkbenchSideBarOptions,
} from 'dockview';
import { AngularFrameworkComponentFactory } from '../utils/component-factory';
import type { WorkbenchAngularReadyEvent } from './types';

@Component({
    selector: 'dv-workbench',
    standalone: true,
    template: '<div #workbenchContainer class="workbench-container"></div>',
    styles: [
        `
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }

            .workbench-container {
                width: 100%;
                height: 100%;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkbenchAngularComponent implements OnInit, OnDestroy {
    @ViewChild('workbenchContainer', { static: true })
    private readonly containerRef!: ElementRef<HTMLDivElement>;

    /** Components for the chrome bands, side bars and tool panel. */
    @Input() components!: Record<string, Type<any> | TemplateRef<any>>;
    /** Components for the editor area (embedded dockview). */
    @Input() editorComponents!: Record<string, Type<any> | TemplateRef<any>>;
    @Input() editorProps?: WorkbenchComponentOptions['dockview'];

    @Input() header?: WorkbenchBandOptions;
    @Input() toolbar?: WorkbenchBandOptions;
    @Input() statusBar?: WorkbenchBandOptions;
    @Input() activityBar?: WorkbenchActivityBarOptions;
    @Input() primarySideBar?: WorkbenchSideBarOptions;
    @Input() secondarySideBar?: WorkbenchSideBarOptions;
    @Input() panel?: WorkbenchPanelOptions;
    @Input() primarySideBarPosition?: SideBarPosition;
    @Input() className?: string;

    @Output() ready = new EventEmitter<WorkbenchAngularReadyEvent>();

    private workbenchApi?: WorkbenchApi;
    private readonly injector = inject(Injector);
    private readonly environmentInjector = inject(EnvironmentInjector);

    ngOnInit(): void {
        if (!this.components) {
            throw new Error(
                'WorkbenchAngularComponent: components input is required'
            );
        }
        if (!this.editorComponents) {
            throw new Error(
                'WorkbenchAngularComponent: editorComponents input is required'
            );
        }

        // The chrome bands are gridview panels; the editor panels are dockview
        // content renderers. Each set resolves through its own factory.
        const bandFactory = new AngularFrameworkComponentFactory(
            this.components,
            this.injector,
            this.environmentInjector
        );
        const editorFactory = new AngularFrameworkComponentFactory(
            this.editorComponents,
            this.injector,
            this.environmentInjector
        );

        this.workbenchApi = createWorkbench(this.containerRef.nativeElement, {
            header: this.header,
            toolbar: this.toolbar,
            statusBar: this.statusBar,
            activityBar: this.activityBar,
            primarySideBar: this.primarySideBar,
            secondarySideBar: this.secondarySideBar,
            panel: this.panel,
            primarySideBarPosition: this.primarySideBarPosition,
            className: this.className,
            createComponent: (options) =>
                bandFactory.createGridviewComponent(options),
            dockview: {
                ...(this.editorProps ?? {}),
                createComponent: (options) =>
                    editorFactory.createDockviewComponent(options),
            },
        });

        const { clientWidth, clientHeight } = this.containerRef.nativeElement;
        this.workbenchApi.layout(clientWidth, clientHeight);

        this.ready.emit({ api: this.workbenchApi });
    }

    ngOnDestroy(): void {
        this.workbenchApi?.dispose();
    }

    getWorkbenchApi(): WorkbenchApi | undefined {
        return this.workbenchApi;
    }
}
