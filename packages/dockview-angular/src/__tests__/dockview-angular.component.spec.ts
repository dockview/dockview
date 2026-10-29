import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApplicationRef, Component, DebugElement } from '@angular/core';
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
            ['dropSizing', 'distribute'],
            ['dndStrategy', 'pointer'],
            ['noPanelsOverlay', 'emptyGroup'],
            ['closeEmptyGroups', false],
            ['groupIdGenerator', () => 'g'],
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

@Component({
    standalone: true,
    selector: 'probe-panel',
    template: '<div class="probe-panel">panel</div>',
})
class ProbePanelComponent {}

@Component({
    standalone: true,
    selector: 'probe-tab',
    template: '<div class="probe-tab">tab</div>',
})
class ProbeTabComponent {}

@Component({
    standalone: true,
    selector: 'probe-tab-location',
    template: '<div class="probe-tab-location">{{ tabLocation }}</div>',
})
class ProbeTabLocationComponent {
    tabLocation?: string;
}

@Component({
    standalone: true,
    selector: 'probe-tab-alt',
    template: '<div class="probe-tab-alt">tab-alt</div>',
})
class ProbeTabAltComponent {}

@Component({
    standalone: true,
    selector: 'probe-watermark',
    template: '<div class="probe-watermark">watermark</div>',
})
class ProbeWatermarkComponent {}

@Component({
    standalone: true,
    selector: 'probe-left-actions',
    template: '<div class="probe-left-actions">left</div>',
})
class ProbeLeftActionsComponent {}

/**
 * Renderer inputs (`defaultTabComponent`, `watermarkComponent`, the header
 * action inputs) must reach dockview-core both at init and when rebound after
 * init: core only consults the Angular factory through the option it was
 * handed, so a stale or missing option means the Angular component is never
 * asked for (or is asked for after it was unbound).
 */
describe('DockviewAngularComponent renderer inputs', () => {
    let fixture: ComponentFixture<DockviewAngularComponent>;
    let appRef: ApplicationRef;

    // Inputs go through `setInput` so a later rebind is a non-first change,
    // exactly as a template binding behaves; a direct property assignment
    // would make the first `setInput` report `firstChange: true`.
    function init(inputs: Record<string, unknown> = {}): DockviewApi {
        TestBed.configureTestingModule({ imports: [DockviewAngularComponent] });
        fixture = TestBed.createComponent(DockviewAngularComponent);
        appRef = TestBed.inject(ApplicationRef);
        fixture.componentRef.setInput('components', {
            probe: ProbePanelComponent,
        });
        for (const [name, value] of Object.entries(inputs)) {
            fixture.componentRef.setInput(name, value);
        }
        fixture.detectChanges();
        const api = fixture.componentInstance.getDockviewApi()!;
        api.layout(500, 500);
        return api;
    }

    function rebind(name: string, value: unknown): void {
        fixture.componentRef.setInput(name, value);
        fixture.detectChanges();
    }

    function count(selector: string): number {
        return fixture.nativeElement.querySelectorAll(selector).length;
    }

    afterEach(() => {
        fixture.componentInstance.getDockviewApi()?.dispose();
        fixture.destroy();
    });

    describe('defaultTabComponent', () => {
        it('renders the default tab component for a panel without an explicit tabComponent', () => {
            const api = init({ defaultTabComponent: ProbeTabComponent });

            api.addPanel({ id: 'p1', component: 'probe' });
            appRef.tick();

            expect(count('.probe-tab')).toBe(1);
            expect(count('.dv-default-tab')).toBe(0);
        });

        it('lets an explicit tabComponent win over the default tab component', () => {
            const api = init({
                tabComponents: { custom: ProbeTabAltComponent },
                defaultTabComponent: ProbeTabComponent,
            });

            api.addPanel({
                id: 'p1',
                component: 'probe',
                tabComponent: 'custom',
            });
            appRef.tick();

            expect(count('.probe-tab-alt')).toBe(1);
            expect(count('.probe-tab')).toBe(0);
        });

        it('applies a defaultTabComponent rebound after init to panels added afterwards', () => {
            const api = init({ defaultTabComponent: undefined });

            api.addPanel({ id: 'p1', component: 'probe' });
            appRef.tick();
            expect(count('.dv-default-tab')).toBe(1);

            rebind('defaultTabComponent', ProbeTabComponent);
            api.addPanel({ id: 'p2', component: 'probe' });
            appRef.tick();
            expect(count('.probe-tab')).toBe(1);

            rebind('defaultTabComponent', ProbeTabAltComponent);
            api.addPanel({ id: 'p3', component: 'probe' });
            appRef.tick();
            expect(count('.probe-tab-alt')).toBe(1);
            expect(count('.probe-tab')).toBe(1);

            rebind('defaultTabComponent', undefined);
            api.addPanel({ id: 'p4', component: 'probe' });
            appRef.tick();
            expect(count('.dv-default-tab')).toBe(2);
        });

        it('passes tabLocation to the tab component', () => {
            const api = init({
                defaultTabComponent: ProbeTabLocationComponent,
            });

            api.addPanel({ id: 'p1', component: 'probe' });
            appRef.tick();

            expect(
                fixture.nativeElement.querySelector('.probe-tab-location')
                    .textContent
            ).toBe('header');
        });
    });

    describe('watermarkComponent', () => {
        it('set -> unset: a new empty group falls back to the built-in watermark', () => {
            const api = init({ watermarkComponent: ProbeWatermarkComponent });

            api.addGroup();
            appRef.tick();
            expect(count('.probe-watermark')).toBeGreaterThan(0);

            expect(() => rebind('watermarkComponent', undefined)).not.toThrow();
            expect(() => api.addGroup()).not.toThrow();
            appRef.tick();

            expect(count('.probe-watermark')).toBe(0);
            expect(count('.dv-watermark')).toBeGreaterThan(0);
        });

        it('unset -> set: a new empty group renders the Angular watermark', () => {
            const api = init({ watermarkComponent: undefined });

            api.addGroup();
            appRef.tick();
            expect(count('.probe-watermark')).toBe(0);

            rebind('watermarkComponent', ProbeWatermarkComponent);
            api.addGroup();
            appRef.tick();

            expect(count('.probe-watermark')).toBeGreaterThan(0);
        });
    });

    describe('leftHeaderActionsComponent', () => {
        it('set -> unset: a new group renders no Angular header actions', () => {
            const api = init({
                leftHeaderActionsComponent: ProbeLeftActionsComponent,
            });

            api.addGroup();
            appRef.tick();
            expect(count('.probe-left-actions')).toBe(1);

            expect(() =>
                rebind('leftHeaderActionsComponent', undefined)
            ).not.toThrow();
            expect(() => api.addGroup()).not.toThrow();
            appRef.tick();

            expect(count('.probe-left-actions')).toBe(0);
        });

        it('unset -> set: a new group renders the Angular header actions', () => {
            const api = init({ leftHeaderActionsComponent: undefined });

            api.addGroup();
            appRef.tick();
            expect(count('.probe-left-actions')).toBe(0);

            expect(() =>
                rebind('leftHeaderActionsComponent', ProbeLeftActionsComponent)
            ).not.toThrow();
            expect(() => api.addGroup()).not.toThrow();
            appRef.tick();

            expect(count('.probe-left-actions')).toBe(2);
        });
    });
});
