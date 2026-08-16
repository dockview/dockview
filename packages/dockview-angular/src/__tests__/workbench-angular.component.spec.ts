import { TestBed } from '@angular/core/testing';

import type { DockviewApi } from 'dockview';
import { DockviewAngularComponent } from '../lib/dockview/dockview-angular.component';
import { getTestComponents, setupTestBed } from './__test_utils__/test-helpers';

describe('DockviewAngularComponent workbench', () => {
    let component: DockviewAngularComponent;

    beforeEach(async () => {
        setupTestBed();
        await TestBed.compileComponents();

        const fixture = TestBed.createComponent(DockviewAngularComponent);
        component = fixture.componentInstance;

        component.components = getTestComponents();
        component.workbench = {
            components: getTestComponents(),
        };
    });

    afterEach(() => {
        component?.getDockviewApi()?.dispose();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should throw if components input is not provided', () => {
        component.components = undefined as never;

        expect(() => component.ngOnInit()).toThrow(
            'DockviewAngularComponent: components input is required'
        );
    });

    it('should initialise the workbench api on ngOnInit', () => {
        component.workbench = {
            components: getTestComponents(),
            header: { component: 'test-panel' },
            primarySideBar: { component: 'test-panel' },
            toolPanel: { component: 'test-panel' },
        };

        component.ngOnInit();

        const api = component.getDockviewApi();
        expect(api).toBeDefined();
        expect(api!.workbench).toBeDefined();
    });

    it('should emit ready with a dockview api exposing the workbench', (done) => {
        component.ready.subscribe((event) => {
            expect(event.api).toBeDefined();
            expect(event.api.workbench).toBeDefined();
            expect(typeof event.api.workbench!.setPrimarySideBarPosition).toBe(
                'function'
            );
            done();
        });

        component.ngOnInit();
    });

    it('should expose a working editor dockview', () => {
        component.ngOnInit();

        const api = component.getDockviewApi() as DockviewApi;
        expect(() =>
            api.addPanel({ id: 'e1', component: 'test-panel' })
        ).not.toThrow();
        expect(api.getPanel('e1')).toBeDefined();
    });
});
