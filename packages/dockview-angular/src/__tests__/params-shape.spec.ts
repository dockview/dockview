import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PaneviewAngularComponent } from '../lib/paneview/paneview-angular.component';
import { SplitviewAngularComponent } from '../lib/splitview/splitview-angular.component';

/**
 * User `params` must only ever arrive on the component's `params` input:
 * never spread as top-level fields (a param named `api` would clobber the
 * real one) and never double-wrapped as `{ params: { params } }`.
 */
@Component({
    standalone: true,
    selector: 'probe-panel',
    template:
        '<div class="probe">wrapped={{ !!params?.params }}|a={{ params?.a }}|b={{ params?.b }}|params.api={{ params?.api }}|api.id={{ api?.id }}</div>',
})
class ProbePanelComponent {
    params?: Record<string, unknown>;
    api?: { id: string };
}

describe('params are delivered on the params input only', () => {
    it('paneview: updateParameters and layout keep params flat', () => {
        TestBed.configureTestingModule({ imports: [PaneviewAngularComponent] });
        const fixture = TestBed.createComponent(PaneviewAngularComponent);
        const component = fixture.componentInstance;
        component.components = { probe: ProbePanelComponent };
        fixture.detectChanges();

        const api = component.getPaneviewApi()!;
        const appRef = TestBed.inject(ApplicationRef);
        const probe = () =>
            fixture.nativeElement.querySelector('.probe')?.textContent;

        api.layout(500, 500);
        const panel = api.addPanel({
            id: 'p1',
            component: 'probe',
            title: 'Probe',
            params: { a: 1, api: 'NOT_AN_API' },
        });
        appRef.tick();
        expect(probe()).toBe(
            'wrapped=false|a=1|b=|params.api=NOT_AN_API|api.id=p1'
        );

        panel.api.updateParameters({ b: 2 });
        appRef.tick();
        expect(probe()).toBe(
            'wrapped=false|a=1|b=2|params.api=NOT_AN_API|api.id=p1'
        );

        api.layout(600, 600);
        appRef.tick();
        expect(probe()).toBe(
            'wrapped=false|a=1|b=2|params.api=NOT_AN_API|api.id=p1'
        );

        api.dispose();
    });

    it('splitview: layout does not spread params as top-level fields', () => {
        TestBed.configureTestingModule({
            imports: [SplitviewAngularComponent],
        });
        const fixture = TestBed.createComponent(SplitviewAngularComponent);
        const component = fixture.componentInstance;
        component.components = { probe: ProbePanelComponent };
        fixture.detectChanges();

        const api = component.getSplitviewApi()!;
        const appRef = TestBed.inject(ApplicationRef);
        const probe = () =>
            fixture.nativeElement.querySelector('.probe')?.textContent;

        api.layout(500, 500);
        api.addPanel({
            id: 'p1',
            component: 'probe',
            params: { a: 1, api: 'NOT_AN_API' },
        });
        appRef.tick();
        const expected = 'wrapped=false|a=1|b=|params.api=NOT_AN_API|api.id=p1';
        expect(probe()).toBe(expected);

        api.layout(600, 600);
        appRef.tick();
        expect(probe()).toBe(expected);

        api.dispose();
    });
});
