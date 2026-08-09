import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

import { DockviewAngularComponent } from '../lib/dockview/dockview-angular.component';
import { DockviewApi } from 'dockview';
import { setupTestBed, getTestComponents } from './__test_utils__/test-helpers';

describe('DockviewAngularComponent', () => {
    let component: DockviewAngularComponent;
    let fixture: ComponentFixture<DockviewAngularComponent>;
    let debugElement: DebugElement;

    beforeEach(async () => {
        setupTestBed();
        await TestBed.compileComponents();

        fixture = TestBed.createComponent(DockviewAngularComponent);
        component = fixture.componentInstance;
        debugElement = fixture.debugElement;

        component.components = getTestComponents();
    });

    afterEach(() => {
        if (component && component.getDockviewApi()) {
            component.getDockviewApi()?.dispose();
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
        }).toThrow('DockviewAngularComponent: components input is required');
    });

    it('should initialize dockview api on ngOnInit', () => {
        component.ngOnInit();

        expect(component.getDockviewApi()).toBeDefined();
        expect(component.getDockviewApi()).toBeInstanceOf(Object);
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
            By.css('.dockview-container')
        );
        expect(containerElement).toBeTruthy();
        expect(containerElement.nativeElement.tagName).toBe('DIV');
    });

    it('should dispose api on ngOnDestroy', () => {
        component.ngOnInit();
        const api = component.getDockviewApi();
        const disposeSpy = jest.spyOn(api, 'dispose');

        component.ngOnDestroy();

        expect(disposeSpy).toHaveBeenCalled();
    });

    it('should handle input changes', () => {
        component.ngOnInit();
        const api = component.getDockviewApi();
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

    it('should set up component registry correctly', () => {
        expect(component.components).toEqual(getTestComponents());

        component.ngOnInit();

        expect(component.getDockviewApi()).toBeDefined();
    });

    it('forwards every PROPERTY_KEYS_DOCKVIEW input to dockview-core on update', () => {
        // Every PROPERTY_KEYS_DOCKVIEW entry needs an @Input() declared, or
        // PROPERTY_KEYS_DOCKVIEW.forEach reads `undefined` for it and it stays
        // silently unsettable from Angular templates.
        component.ngOnInit();
        const api = component.getDockviewApi()!;
        const updateOptionsSpy = jest.spyOn(api, 'updateOptions');

        const cases: Array<[string, unknown]> = [
            ['scrollbars', 'native'],
            ['disableTabsOverflowList', true],
            ['defaultRenderer', 'always'],
            ['defaultHeaderPosition', 'bottom'],
            ['disableDnd', true],
            ['dndStrategy', 'pointer'],
            ['noPanelsOverlay', 'emptyGroup'],
            ['theme', { name: 't', className: 'dv-t' }],
        ];

        for (const [key, value] of cases) {
            updateOptionsSpy.mockClear();
            (component as any)[key] = value;
            component.ngOnChanges({
                [key]: {
                    currentValue: value,
                    previousValue: undefined,
                    firstChange: false,
                    isFirstChange: () => false,
                },
            });
            expect(updateOptionsSpy).toHaveBeenCalledWith({ [key]: value });
        }
    });

    it('honours a rebound [components] map after init', () => {
        component.ngOnInit();
        const api = component.getDockviewApi()!;

        // rebind `components` to a brand-new object that adds a component under
        // a name absent from the init-time map
        const initial = component.components;
        component.components = {
            ...initial,
            'added-later': getTestComponents()['test-panel'],
        };
        component.ngOnChanges({
            components: {
                currentValue: component.components,
                previousValue: initial,
                firstChange: false,
                isFirstChange: () => false,
            },
        });

        // the factory must see the new map, so adding a panel with the new
        // component name resolves instead of throwing "not found in registry"
        expect(() =>
            api.addPanel({ id: 'p-added', component: 'added-later' })
        ).not.toThrow();
        expect(api.getPanel('p-added')).toBeDefined();
    });
});

@Component({
    standalone: false,
    template: `
        <dv-dockview
            [components]="components"
            [className]="className"
            [debug]="debug"
            (ready)="onReady($event)"
        >
        </dv-dockview>
    `,
})
class TestHostComponent {
    components = getTestComponents();
    className = 'test-host';
    debug = false;
    api?: DockviewApi;

    onReady(event: { api: DockviewApi }) {
        this.api = event.api;
    }
}

describe('DockviewAngularComponent Integration', () => {
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

        fixture.detectChanges();

        expect(hostComponent.api).toBeDefined();
    });
});
