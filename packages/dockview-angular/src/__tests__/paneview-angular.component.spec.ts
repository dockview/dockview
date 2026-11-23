import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApplicationRef, Component, DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

import { PaneviewAngularComponent } from '../lib/paneview/paneview-angular.component';
import { PaneviewApi, PaneviewDidDropEvent } from 'dockview';
import { setupTestBed, getTestComponents } from './__test_utils__/test-helpers';

describe('PaneviewAngularComponent', () => {
    let component: PaneviewAngularComponent;
    let fixture: ComponentFixture<PaneviewAngularComponent>;
    let debugElement: DebugElement;

    beforeEach(async () => {
        setupTestBed();
        await TestBed.compileComponents();

        fixture = TestBed.createComponent(PaneviewAngularComponent);
        component = fixture.componentInstance;
        debugElement = fixture.debugElement;

        component.components = getTestComponents();
    });

    afterEach(() => {
        if (component && component.getPaneviewApi()) {
            component.getPaneviewApi()?.dispose();
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
        }).toThrow('PaneviewAngularComponent: components input is required');
    });

    it('should initialize paneview api on ngOnInit', () => {
        component.ngOnInit();

        expect(component.getPaneviewApi()).toBeDefined();
        expect(component.getPaneviewApi()).toBeInstanceOf(Object);
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
            By.css('.paneview-container')
        );
        expect(containerElement).toBeTruthy();
        expect(containerElement.nativeElement.tagName).toBe('DIV');
    });

    it('should dispose api on ngOnDestroy', () => {
        component.ngOnInit();
        const api = component.getPaneviewApi();
        const disposeSpy = jest.spyOn(api, 'dispose');

        component.ngOnDestroy();

        expect(disposeSpy).toHaveBeenCalled();
    });

    it('should handle input changes', () => {
        component.ngOnInit();
        const api = component.getPaneviewApi();
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

    it('should not call updateOptions on first change', () => {
        component.ngOnInit();
        const api = component.getPaneviewApi();
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

        expect(component.getPaneviewApi()).toBeDefined();
    });

    it('should handle multiple property changes at once', () => {
        component.ngOnInit();
        const api = component.getPaneviewApi();
        const updateOptionsSpy = jest.spyOn(api, 'updateOptions');

        component.className = 'test-class';
        component.disableAutoResizing = true;
        component.ngOnChanges({
            className: {
                currentValue: 'test-class',
                previousValue: undefined,
                firstChange: false,
                isFirstChange: () => false,
            },
            disableAutoResizing: {
                currentValue: true,
                previousValue: false,
                firstChange: false,
                isFirstChange: () => false,
            },
        });

        expect(updateOptionsSpy).toHaveBeenCalledWith({
            className: 'test-class',
            disableAutoResizing: true,
        });
    });

    it('should handle headerComponents input', () => {
        const headerComponents = {
            'test-header': getTestComponents()['test-tab'],
        };
        component.headerComponents = headerComponents;

        expect(component.headerComponents).toEqual(headerComponents);

        component.ngOnInit();
        expect(component.getPaneviewApi()).toBeDefined();
    });

    it('should set up drop event listeners', () => {
        let dropHandlerSet = false;

        component.drop.subscribe(() => {
            dropHandlerSet = true;
        });

        component.ngOnInit();

        const api = component.getPaneviewApi();
        expect(api).toBeDefined();
        expect(component.drop.observers.length).toBeGreaterThan(0);
    });

    it('should handle auto resizing configuration', () => {
        component.ngOnInit();
        const api = component.getPaneviewApi();
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
});

@Component({
    standalone: false,
    template: `
        <dv-paneview
            [components]="components"
            [headerComponents]="headerComponents"
            [className]="className"
            [disableAutoResizing]="disableAutoResizing"
            (ready)="onReady($event)"
            (drop)="onDrop($event)"
        >
        </dv-paneview>
    `,
})
class TestHostComponent {
    components = getTestComponents();
    headerComponents = { 'test-header': getTestComponents()['test-tab'] };
    className = 'test-host';
    disableAutoResizing = false;
    api?: PaneviewApi;
    lastDropEvent?: PaneviewDidDropEvent;

    onReady(event: { api: PaneviewApi }) {
        this.api = event.api;
    }

    onDrop(event: PaneviewDidDropEvent) {
        this.lastDropEvent = event;
    }
}

describe('PaneviewAngularComponent Integration', () => {
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
        hostComponent.disableAutoResizing = true;

        fixture.detectChanges();

        expect(hostComponent.api).toBeDefined();
    });

    it('should handle header components correctly', () => {
        fixture.detectChanges();

        expect(hostComponent.api).toBeDefined();
        expect(hostComponent.headerComponents).toBeDefined();
    });
});

@Component({
    standalone: true,
    selector: 'probe-pane-title',
    template: '<div class="probe-pane-title">{{ title }}</div>',
})
class ProbePaneTitleComponent {
    title?: string;
}

/**
 * Paneview body and header components receive the panel `title` as an input,
 * as the React and Vue paneview bindings do.
 */
describe('PaneviewAngularComponent title input', () => {
    it('forwards the panel title to body and header components', () => {
        TestBed.configureTestingModule({ imports: [PaneviewAngularComponent] });
        const fixture = TestBed.createComponent(PaneviewAngularComponent);
        const component = fixture.componentInstance;
        component.components = { probe: ProbePaneTitleComponent };
        component.headerComponents = { header: ProbePaneTitleComponent };
        fixture.detectChanges();

        const api = component.getPaneviewApi()!;
        api.layout(500, 500);
        api.addPanel({
            id: 'p1',
            component: 'probe',
            headerComponent: 'header',
            title: 'Probe Title',
        });
        TestBed.inject(ApplicationRef).tick();

        const texts = Array.from(
            fixture.nativeElement.querySelectorAll('.probe-pane-title')
        ).map((el) => (el as HTMLElement).textContent);
        expect(texts).toEqual(['Probe Title', 'Probe Title']);

        api.dispose();
        fixture.destroy();
    });
});
