import { TestBed } from '@angular/core/testing';

import type { WorkbenchApi } from 'dockview';
import { WorkbenchAngularComponent } from '../lib/workbench/workbench-angular.component';
import { getTestComponents, setupTestBed } from './__test_utils__/test-helpers';

describe('WorkbenchAngularComponent', () => {
    let component: WorkbenchAngularComponent;

    beforeEach(async () => {
        setupTestBed();
        await TestBed.compileComponents();

        const fixture = TestBed.createComponent(WorkbenchAngularComponent);
        component = fixture.componentInstance;

        component.components = getTestComponents();
        component.editorComponents = getTestComponents();
    });

    afterEach(() => {
        component?.getWorkbenchApi()?.dispose();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should throw if components input is not provided', () => {
        component.components = undefined as never;

        expect(() => component.ngOnInit()).toThrow(
            'WorkbenchAngularComponent: components input is required'
        );
    });

    it('should throw if editorComponents input is not provided', () => {
        component.editorComponents = undefined as never;

        expect(() => component.ngOnInit()).toThrow(
            'WorkbenchAngularComponent: editorComponents input is required'
        );
    });

    it('should initialise the workbench api on ngOnInit', () => {
        component.header = { component: 'test-panel' };
        component.primarySideBar = { component: 'test-panel' };
        component.panel = { component: 'test-panel' };

        component.ngOnInit();

        const api = component.getWorkbenchApi();
        expect(api).toBeDefined();
        expect(api!.dockview).toBeDefined();
    });

    it('should emit ready with the workbench api', (done) => {
        component.ready.subscribe((event) => {
            expect(event.api).toBeDefined();
            expect(typeof event.api.setPrimarySideBarPosition).toBe('function');
            done();
        });

        component.ngOnInit();
    });

    it('should expose a working editor dockview', () => {
        component.ngOnInit();

        const api = component.getWorkbenchApi() as WorkbenchApi;
        expect(() =>
            api.dockview.addPanel({ id: 'e1', component: 'test-panel' })
        ).not.toThrow();
        expect(api.dockview.getPanel('e1')).toBeDefined();
    });
});
