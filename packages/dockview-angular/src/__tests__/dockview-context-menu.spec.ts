import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, Input, Type } from '@angular/core';
import {
    CreateContextMenuItemComponentOptions,
    DockviewGroupPanel,
    IDockviewPanel,
    IContextMenuItemComponentProps,
    IChipContextMenuItemComponentProps,
    ITabGroup,
} from 'dockview';
import { DockviewAngularComponent } from '../lib/dockview/dockview-angular.component';
import { AngularRenderer } from '../lib/utils/angular-renderer';
import { setupTestBed, getTestComponents } from './__test_utils__/test-helpers';

@Component({
    selector: 'test-context-menu-item',
    template: '<div class="test-menu-item">My Item</div>',
})
class TestContextMenuItemComponent {}

@Component({
    selector: 'test-context-menu-item-with-inputs',
    template: '<div></div>',
})
class TestContextMenuItemWithInputsComponent {
    @Input() panel!: IDockviewPanel;
    @Input() group!: DockviewGroupPanel;
    @Input() api!: any;
    @Input() close!: () => void;
    @Input() componentProps?: object;
}

@Component({
    selector: 'test-chip-context-menu-item-with-inputs',
    template: '<div></div>',
})
class TestChipContextMenuItemWithInputsComponent {
    @Input() tabGroup!: ITabGroup;
    @Input() group!: DockviewGroupPanel;
    @Input() api!: any;
    @Input() close!: () => void;
    @Input() componentProps?: object;
}

describe('DockviewAngularComponent – context menu', () => {
    let component: DockviewAngularComponent;
    let fixture: ComponentFixture<DockviewAngularComponent>;

    beforeEach(async () => {
        setupTestBed();
        TestBed.overrideModule(
            (await import('../lib/dockview-angular.module'))
                .DockviewAngularModule,
            {}
        );
        await TestBed.compileComponents();

        fixture = TestBed.createComponent(DockviewAngularComponent);
        component = fixture.componentInstance;
        component.components = getTestComponents();
    });

    afterEach(() => {
        component.getDockviewApi()?.dispose();
        fixture.destroy();
        TestBed.resetTestingModule();
    });

    it('getTabContextMenuItems input is accepted without error', () => {
        const getTabContextMenuItems = jest
            .fn()
            .mockReturnValue(['close', 'closeAll']);
        component.getTabContextMenuItems = getTabContextMenuItems;

        expect(() => component.ngOnInit()).not.toThrow();
    });

    it('createContextMenuItemComponent returns an AngularRenderer for a component', () => {
        component.ngOnInit();

        const frameworkOptions = (component as any).createFrameworkOptions();
        const factory = frameworkOptions.createContextMenuItemComponent;

        expect(factory).toBeDefined();

        const renderer = factory({
            id: 'test-id',
            component: TestContextMenuItemComponent as Type<never>,
        } as CreateContextMenuItemComponentOptions);

        expect(renderer).toBeInstanceOf(AngularRenderer);
    });

    it('createContextMenuItemComponent returns undefined when no component provided', () => {
        component.ngOnInit();

        const frameworkOptions = (component as any).createFrameworkOptions();
        const factory = frameworkOptions.createContextMenuItemComponent;

        const renderer = factory({
            id: 'test-id',
            component: undefined,
        } as CreateContextMenuItemComponentOptions);

        expect(renderer).toBeUndefined();
    });

    it('AngularRenderer returned by factory can be initialised with context menu props', () => {
        component.ngOnInit();

        const frameworkOptions = (component as any).createFrameworkOptions();
        const factory = frameworkOptions.createContextMenuItemComponent;

        const renderer: AngularRenderer = factory({
            id: 'test-id',
            component: TestContextMenuItemComponent as Type<never>,
        } as CreateContextMenuItemComponentOptions);

        const props: IContextMenuItemComponentProps = {
            panel: {} as never,
            group: {} as never,
            api: {} as never,
            close: jest.fn(),
        };

        expect(() => renderer.init(props)).not.toThrow();
        renderer.dispose();
    });

    it('forwards panel, group, close, and componentProps to the Angular component @Inputs', () => {
        component.ngOnInit();

        const frameworkOptions = (component as any).createFrameworkOptions();
        const factory = frameworkOptions.createContextMenuItemComponent;

        const renderer: AngularRenderer<TestContextMenuItemWithInputsComponent> =
            factory({
                id: 'test-id',
                component:
                    TestContextMenuItemWithInputsComponent as Type<never>,
            } as CreateContextMenuItemComponentOptions);

        const panel = {} as IDockviewPanel;
        const group = {} as DockviewGroupPanel;
        const closeFn = jest.fn();
        const extraProps = { foo: 'bar' };

        const props: IContextMenuItemComponentProps = {
            panel,
            group,
            api: {} as never,
            close: closeFn,
            componentProps: extraProps,
        };

        renderer.init(props);

        const instance = renderer.component.instance;
        expect(instance.panel).toBe(panel);
        expect(instance.group).toBe(group);
        expect(instance.close).toBe(closeFn);
        expect(instance.componentProps).toBe(extraProps);

        renderer.dispose();
    });

    it('forwards tabGroup to the Angular component @Input for chip menu items', () => {
        // The panel test above covers the group/close/componentProps mapping; a
        // chip item differs only in carrying `tabGroup` in place of `panel`, so
        // this asserts just that the renderer forwards the tabGroup @Input.
        component.ngOnInit();
        const factory = (component as any).createFrameworkOptions()
            .createContextMenuItemComponent;
        const renderer: AngularRenderer<TestChipContextMenuItemWithInputsComponent> =
            factory({
                id: 'test-id',
                component:
                    TestChipContextMenuItemWithInputsComponent as Type<never>,
            } as CreateContextMenuItemComponentOptions);

        const tabGroup = {} as ITabGroup;
        renderer.init({
            tabGroup,
            group: {} as never,
            api: {} as never,
            close: jest.fn(),
        } as IChipContextMenuItemComponentProps);

        expect(renderer.component.instance.tabGroup).toBe(tabGroup);
        renderer.dispose();
    });
});
