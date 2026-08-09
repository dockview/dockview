import { TestBed } from '@angular/core/testing';
import {
    ApplicationRef,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EnvironmentInjector,
    inject,
    Injector,
    TemplateRef,
    ViewChild,
} from '@angular/core';
import { AngularRenderer } from '../lib/utils/angular-renderer';

@Component({
    standalone: false,
    selector: 'test-component',
    template:
        '<div class="test-component">{{ params?.title }} - {{ params?.value }}</div>',
})
class TestComponent {
    params: { title?: string; value?: string } = {};
    api: any = undefined;
    containerApi: any = undefined;
}

@Component({
    standalone: false,
    selector: 'test-update-component',
    template: '<div class="test-update-component">Counter: {{ counter }}</div>',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestUpdateComponent {
    private readonly cd: ChangeDetectorRef = inject(ChangeDetectorRef);
    protected counter: number = 0;

    public updateCounter() {
        // use typical OnPush change handling
        this.counter++;
        this.cd.markForCheck();
    }
}

@Component({
    standalone: false,
    selector: 'test-template-holder-component',
    template: `
        <ng-template #template>
            <test-update-component />
        </ng-template>
    `,
})
class TemplateHolderComponent {
    @ViewChild('template', { static: true })
    public template?: TemplateRef<any>;
}

describe('AngularRenderer', () => {
    let injector: Injector;
    let environmentInjector: EnvironmentInjector;
    let application: ApplicationRef;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [
                TestComponent,
                TestUpdateComponent,
                TemplateHolderComponent,
            ],
        }).compileComponents();

        injector = TestBed.inject(Injector);
        environmentInjector = TestBed.inject(EnvironmentInjector);
        application = TestBed.inject(ApplicationRef);
    });

    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('should be testable when Angular dependencies are available', () => {
        expect(true).toBe(true);
    });

    it('should initialize and render component', () => {
        const renderer = new AngularRenderer<TestComponent>({
            component: TestComponent,
            injector,
            environmentInjector,
        });

        renderer.init({
            params: { title: 'Updated Title', value: 'test-value' },
            api: {},
            containerApi: {},
        });
        application.tick(); // trigger change detection

        expect(renderer.element).toBeTruthy();
        // element is now the OnPush boundary wrapper hosting the component
        expect(renderer.element.querySelector('test-component')).toBeTruthy();
        expect(renderer.element.innerHTML).toContain(
            'Updated Title - test-value'
        );
    });

    it('should update component properties', () => {
        const renderer = new AngularRenderer<TestComponent>({
            component: TestComponent,
            injector,
            environmentInjector,
        });

        renderer.init({
            params: { title: 'Initial Title' },
            api: {},
            containerApi: {},
        });
        renderer.update({
            params: { title: 'Updated Title', value: 'new-value' },
        });
        application.tick(); // trigger change detection

        expect(renderer.element).toBeTruthy();
        expect(renderer.element.innerHTML).toContain(
            'Updated Title - new-value'
        );
    });

    it('should dispose correctly', () => {
        const renderer = new AngularRenderer<TestComponent>({
            component: TestComponent,
            injector,
            environmentInjector,
        });

        renderer.init({ params: { title: 'Test Title' } });
        const element = renderer.element;

        expect(element).toBeTruthy();

        renderer.dispose();

        // Element reference is intentionally retained after dispose so that
        // dockview's overlay teardown can still detach the node from its
        // parent without the getter throwing mid-cascade. See issue #1220.
        expect(renderer.element).toBe(element);
        expect(renderer.component).toBeNull();
        expect(renderer.view).toBeNull();
    });

    it('should still expose its element after dispose (regression #1220)', () => {
        // Reproduces the disposal-order bug from issue #1220: dockview-core's
        // OverlayRenderContainer reads `panel.view.content.element` while
        // tearing down its own disposables, by which point the renderer has
        // already been disposed.
        const renderer = new AngularRenderer<TestComponent>({
            component: TestComponent,
            injector,
            environmentInjector,
        });

        renderer.init({ params: { title: 'Test Title' } });
        renderer.dispose();

        expect(() => renderer.element).not.toThrow();
        expect(renderer.element).toBeInstanceOf(HTMLElement);
    });

    it('still throws from the element getter when accessed before init', () => {
        const renderer = new AngularRenderer<TestComponent>({
            component: TestComponent,
            injector,
            environmentInjector,
        });

        expect(() => renderer.element).toThrow(
            'Angular renderer not initialized'
        );
    });

    it('should handle component creation errors gracefully', () => {
        jest.spyOn(console, 'error').mockImplementation();

        const renderer = new AngularRenderer({
            component: null as never,
            injector,
            environmentInjector,
        });

        expect(() => {
            renderer.init({});
        }).toThrow();
    });

    it('should not throw when updating after dispose', () => {
        const renderer = new AngularRenderer<TestComponent>({
            component: TestComponent,
            injector,
            environmentInjector,
        });

        renderer.init({ params: { title: 'Test Title' } });
        renderer.dispose();

        expect(() => {
            renderer.update({ params: { title: 'Updated Title' } });
        }).not.toThrow();
    });

    it('should handle multiple dispose calls', () => {
        const renderer = new AngularRenderer<TestComponent>({
            component: TestComponent,
            injector,
            environmentInjector,
        });

        renderer.init({ params: { title: 'Test Title' } });

        expect(() => {
            renderer.dispose();
            renderer.dispose();
            renderer.dispose();
        }).not.toThrow();
    });

    it('should render view from template', () => {
        const templateRenderer = new AngularRenderer({
            component: TemplateHolderComponent,
            injector,
            environmentInjector,
        });
        templateRenderer.init({});
        const template = (
            templateRenderer.component.instance as TemplateHolderComponent
        ).template;

        expect(template).toBeDefined();

        const renderer = new AngularRenderer({
            component: template,
            injector: templateRenderer.component.injector, // use container injector to ensure we have a view
        });
        renderer.init({});
        application.tick();

        expect(renderer.element.innerHTML).toContain('Counter: 0');
    });

    it('should render when component is marked for change detection', () => {
        const renderer = new AngularRenderer<TestUpdateComponent>({
            component: TestUpdateComponent,
            injector,
            environmentInjector,
        });

        renderer.init({});
        application.tick(); // trigger change detection

        expect(renderer.element.innerHTML).toContain('Counter: 0');
        renderer.component.instance.updateCounter();
        application.tick();
        expect(renderer.element.innerHTML).toContain('Counter: 1');
    });

    it('should only forward params, api, and containerApi from init', () => {
        const renderer = new AngularRenderer<TestComponent>({
            component: TestComponent,
            injector,
            environmentInjector,
        });

        renderer.init({
            params: { title: 'Hello' },
            api: { mockApi: true },
            containerApi: { mockContainerApi: true },
            title: 'should-be-filtered',
        });
        application.tick();

        const instance = renderer.component.instance;
        expect(instance.params).toEqual({ title: 'Hello' });
        expect(instance.api).toEqual({ mockApi: true });
        expect(instance.containerApi).toEqual({ mockContainerApi: true });
        expect((instance as any).title).toBeUndefined();
    });
});
