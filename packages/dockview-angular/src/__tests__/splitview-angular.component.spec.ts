import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

import { SplitviewAngularComponent } from '../lib/splitview/splitview-angular.component';
import { SplitviewApi } from 'dockview';
import { setupTestBed, getTestComponents } from './__test_utils__/test-helpers';

/** Records every instance so the test can read the inputs it was given. */
@Component({
    standalone: true,
    selector: 'container-api-probe',
    template: '<div class="container-api-probe"></div>',
})
class ContainerApiProbeComponent {
    static instances: ContainerApiProbeComponent[] = [];
    containerApi?: SplitviewApi;
    constructor() {
        ContainerApiProbeComponent.instances.push(this);
    }
}

describe('SplitviewAngularComponent', () => {
    let component: SplitviewAngularComponent;
    let fixture: ComponentFixture<SplitviewAngularComponent>;
    let debugElement: DebugElement;

    beforeEach(async () => {
        setupTestBed();
        await TestBed.compileComponents();

        fixture = TestBed.createComponent(SplitviewAngularComponent);
        component = fixture.componentInstance;
        debugElement = fixture.debugElement;

        component.components = getTestComponents();
    });

    afterEach(() => {
        if (component && component.getSplitviewApi()) {
            component.getSplitviewApi()?.dispose();
        }
        fixture?.destroy();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should throw error if components input is not provided', () => {
        component.components = undefined as never;

        expect(() => {
            component.ngOnInit();
        }).toThrow('SplitviewAngularComponent: components input is required');
    });

    it('should initialize splitview api on ngOnInit', () => {
        component.ngOnInit();

        expect(component.getSplitviewApi()).toBeDefined();
        expect(component.getSplitviewApi()).toBeInstanceOf(Object);
    });

    it('should emit ready event with api', (done) => {
        component.ready.subscribe((event) => {
            expect(event.api).toBeDefined();
            expect(event.api).toBeInstanceOf(Object);
            done();
        });

        component.ngOnInit();
    });

    it('should render container element', () => {
        fixture.detectChanges();

        const containerElement = debugElement.query(
            By.css('.splitview-container')
        );
        expect(containerElement).toBeTruthy();
        expect(containerElement.nativeElement.tagName).toBe('DIV');
    });

    it('should dispose api on ngOnDestroy', () => {
        component.ngOnInit();
        const api = component.getSplitviewApi();
        const disposeSpy = jest.spyOn(api, 'dispose');

        component.ngOnDestroy();

        expect(disposeSpy).toHaveBeenCalled();
    });

    it('should handle input changes', () => {
        component.ngOnInit();
        const api = component.getSplitviewApi();
        const updateOptionsSpy = jest.spyOn(api, 'updateOptions');

        component.className = 'test-class';
        component.ngOnChanges({
            className: {
                currentValue: 'test-class',
                previousValue: undefined,
                firstChange: false,
                isFirstChange: () => false,
            },
        });

        expect(updateOptionsSpy).toHaveBeenCalledWith({
            className: 'test-class',
        });
    });

    it('should handle orientation changes', () => {
        component.ngOnInit();
        const api = component.getSplitviewApi();
        const updateOptionsSpy = jest.spyOn(api, 'updateOptions');

        component.orientation = 'vertical';
        component.ngOnChanges({
            orientation: {
                currentValue: 'vertical',
                previousValue: 'horizontal',
                firstChange: false,
                isFirstChange: () => false,
            },
        });

        expect(updateOptionsSpy).toHaveBeenCalledWith({
            orientation: 'vertical',
        });
    });

    it('should handle proportional layout changes', () => {
        component.ngOnInit();
        const api = component.getSplitviewApi();
        const updateOptionsSpy = jest.spyOn(api, 'updateOptions');

        component.proportionalLayout = true;
        component.ngOnChanges({
            proportionalLayout: {
                currentValue: true,
                previousValue: false,
                firstChange: false,
                isFirstChange: () => false,
            },
        });

        expect(updateOptionsSpy).toHaveBeenCalledWith({
            proportionalLayout: true,
        });
    });

    it('should handle disableAutoResizing changes', () => {
        component.ngOnInit();
        const api = component.getSplitviewApi();
        const updateOptionsSpy = jest.spyOn(api, 'updateOptions');

        component.disableAutoResizing = true;
        component.ngOnChanges({
            disableAutoResizing: {
                currentValue: true,
                previousValue: false,
                firstChange: false,
                isFirstChange: () => false,
            },
        });

        expect(updateOptionsSpy).toHaveBeenCalledWith({
            disableAutoResizing: true,
        });
    });

    it('should not call updateOptions on first change', () => {
        component.ngOnInit();
        const api = component.getSplitviewApi();
        const updateOptionsSpy = jest.spyOn(api, 'updateOptions');

        component.ngOnChanges({
            className: {
                currentValue: 'test-class',
                previousValue: undefined,
                firstChange: true,
                isFirstChange: () => true,
            },
        });

        expect(updateOptionsSpy).not.toHaveBeenCalled();
    });

    it('should set up component registry correctly', () => {
        expect(component.components).toEqual(getTestComponents());

        component.ngOnInit();

        expect(component.getSplitviewApi()).toBeDefined();
    });

    it('should handle multiple property changes at once', () => {
        component.ngOnInit();
        const api = component.getSplitviewApi();
        const updateOptionsSpy = jest.spyOn(api, 'updateOptions');

        component.className = 'test-class';
        component.proportionalLayout = true;
        component.ngOnChanges({
            className: {
                currentValue: 'test-class',
                previousValue: undefined,
                firstChange: false,
                isFirstChange: () => false,
            },
            proportionalLayout: {
                currentValue: true,
                previousValue: false,
                firstChange: false,
                isFirstChange: () => false,
            },
        });

        expect(updateOptionsSpy).toHaveBeenCalledWith({
            className: 'test-class',
            proportionalLayout: true,
        });
    });

    it('passes containerApi to panel components', () => {
        ContainerApiProbeComponent.instances = [];
        component.components = { probe: ContainerApiProbeComponent };
        fixture.detectChanges();

        const api = component.getSplitviewApi()!;
        api.layout(500, 500);
        api.addPanel({ id: 'p1', component: 'probe' });

        expect(ContainerApiProbeComponent.instances).toHaveLength(1);
        expect(
            ContainerApiProbeComponent.instances[0].containerApi
        ).toBeInstanceOf(SplitviewApi);
    });
});

@Component({
    standalone: false,
    template: `
        <dv-splitview
            [components]="components"
            [className]="className"
            [orientation]="orientation"
            [proportionalLayout]="proportionalLayout"
            [debug]="debug"
            [hideBorders]="hideBorders"
            [disableAutoResizing]="disableAutoResizing"
            (ready)="onReady($event)"
        >
        </dv-splitview>
    `,
})
class TestHostComponent {
    components = getTestComponents();
    className = 'test-host';
    orientation: 'horizontal' | 'vertical' = 'horizontal';
    proportionalLayout = false;
    debug = false;
    hideBorders = false;
    disableAutoResizing = false;
    api?: SplitviewApi;

    onReady(event: { api: SplitviewApi }) {
        this.api = event.api;
    }
}

describe('SplitviewAngularComponent Integration', () => {
    let hostComponent: TestHostComponent;
    let fixture: ComponentFixture<TestHostComponent>;

    beforeEach(async () => {
        setupTestBed();

        TestBed.configureTestingModule({
            declarations: [TestHostComponent],
        });

        await TestBed.compileComponents();

        fixture = TestBed.createComponent(TestHostComponent);
        hostComponent = fixture.componentInstance;
    });

    afterEach(() => {
        hostComponent.api?.dispose();
        fixture?.destroy();
    });

    it('should create and initialize through template', () => {
        fixture.detectChanges();

        expect(hostComponent).toBeTruthy();
        expect(hostComponent.api).toBeDefined();
    });

    it('should pass properties correctly', () => {
        hostComponent.className = 'custom-class';
        hostComponent.debug = true;
        hostComponent.orientation = 'vertical';
        hostComponent.proportionalLayout = true;
        hostComponent.hideBorders = true;
        hostComponent.disableAutoResizing = true;

        fixture.detectChanges();

        expect(hostComponent.api).toBeDefined();
    });
});
