import {
    ApplicationRef,
    ChangeDetectionStrategy,
    Component,
    DoCheck,
    NgZone,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DockviewAngularComponent } from '../lib/dockview/dockview-angular.component';
import { DockviewAngularModule } from '../lib/dockview-angular.module';
import { DockviewApi } from 'dockview';

/**
 * Guards the Angular binding's change-detection cost and interactivity.
 *
 * The renderer attaches each panel view to the application; if the panels were
 * checked on every CD tick, a dockview resize/drag (which triggers ticks via
 * zone.js) would run change detection across every panel — O(panels) per event.
 * These tests assert the fan-out is bounded, while proving that panels remain
 * interactive (clicks/inputs still update them), including panels created from
 * outside the Angular zone (the drag/drop creation path).
 */
const checks: Record<string, number> = {};

@Component({
    selector: 'cd-panel',
    template: '<div>{{ id }}</div>',
    standalone: false,
})
class CdCountPanel implements DoCheck {
    api: any;
    get id(): string {
        return this.api?.id ?? '?';
    }
    ngDoCheck(): void {
        checks[this.id] = (checks[this.id] ?? 0) + 1;
    }
}

@Component({
    selector: 'click-panel2',
    template: '<button (click)="n = n + 1">{{ n }}</button>',
    standalone: false,
})
class ClickCounterPanel {
    api: any;
    n = 0;
}

describe('dockview-angular change detection', () => {
    let appRef: ApplicationRef;
    let ngZone: NgZone;

    beforeEach(() => {
        for (const k of Object.keys(checks)) delete checks[k];
        TestBed.configureTestingModule({
            imports: [DockviewAngularModule],
            declarations: [CdCountPanel, ClickCounterPanel],
        });
        appRef = TestBed.inject(ApplicationRef);
        ngZone = TestBed.inject(NgZone);
    });

    function makeApi(
        n: number,
        component = 'cd-panel'
    ): { api: DockviewApi; host: HTMLElement } {
        const fixture = TestBed.createComponent(DockviewAngularComponent);
        const instance = fixture.componentInstance;
        instance.components = {
            'cd-panel': CdCountPanel,
            'click-panel2': ClickCounterPanel,
        } as never;
        let api: DockviewApi | undefined;
        instance.ready.subscribe((e) => (api = e.api));
        instance.ngOnInit();
        fixture.detectChanges();
        api!.layout(1000, 1000);
        for (let i = 0; i < n; i++) {
            api!.addPanel({ id: `p${i}`, component });
        }
        appRef.tick();
        return { api: api!, host: fixture.nativeElement as HTMLElement };
    }

    const total = () => Object.values(checks).reduce((a, b) => a + b, 0);

    test('a resize does not run change detection across all panels', () => {
        const { api } = makeApi(30);
        const before = total();
        api.layout(900, 700); // a resize touches no panel state
        appRef.tick(); // the tick a zone-driven app performs per event
        const checkedByResize = total() - before;

        // Baseline (unfixed) is 30 (every attached panel checked). The fix must
        // bring this to 0 — the resize dirties no panel.
        expect(checkedByResize).toBe(0);
    });

    test('clicking a button inside a panel updates it', () => {
        const { host } = makeApi(1, 'click-panel2');
        const button = host.querySelector('button')!;
        expect(button.textContent).toBe('0');

        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        appRef.tick();

        expect(button.textContent).toBe('1');
    });

    test('a panel created OUTSIDE the Angular zone is still interactive', () => {
        const { api, host } = makeApi(0);
        // mimic a panel born from a dockview-internal (out-of-zone) event
        ngZone.runOutsideAngular(() =>
            api.addPanel({ id: 'x', component: 'click-panel2' })
        );
        appRef.tick();

        const button = host.querySelector('button')!;
        expect(button.textContent).toBe('0');

        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        appRef.tick();

        expect(button.textContent).toBe('1');
    });
});
