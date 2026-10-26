import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DockviewAngularComponent } from '../lib/dockview/dockview-angular.component';
import { setupTestBed, getTestComponents } from './__test_utils__/test-helpers';

// #1594: initialising without dockview-enterprise must not log a missing-module
// error. Own file so the process-global missing-module dedup cache is empty and
// this is the first init that could surface the message.
describe('DockviewAngularComponent bare mount', () => {
    let component: DockviewAngularComponent;
    let fixture: ComponentFixture<DockviewAngularComponent>;

    beforeEach(async () => {
        setupTestBed();
        await TestBed.compileComponents();

        fixture = TestBed.createComponent(DockviewAngularComponent);
        component = fixture.componentInstance;
        component.components = getTestComponents();
    });

    afterEach(() => {
        component?.getDockviewApi()?.dispose();
        fixture?.destroy();
    });

    it('does not warn about a missing dockview-enterprise module (#1594)', () => {
        const errorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        try {
            component.ngOnInit();

            const enterpriseWarnings = errorSpy.mock.calls
                .map((call) => String(call[0]))
                .filter((message) => message.includes('dockview-enterprise'));

            expect(enterpriseWarnings).toEqual([]);
        } finally {
            errorSpy.mockRestore();
        }
    });
});
