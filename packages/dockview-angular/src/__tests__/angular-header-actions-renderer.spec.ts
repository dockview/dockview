import { TestBed } from '@angular/core/testing';
import {
    ApplicationRef,
    Component,
    EnvironmentInjector,
    Injector,
} from '@angular/core';
import { AngularHeaderActionsRenderer } from '../lib/dockview/angular-header-actions-renderer';

@Component({
    standalone: false,
    selector: 'header-actions-host',
    template: `
        <div class="header-actions-host">
            <span class="panels">{{ panels?.length }}</span>
            <span class="active">{{ activePanel?.id || '-' }}</span>
            <span class="active-group">{{ isGroupActive ? 'yes' : 'no' }}</span>
            <span class="header-position">{{ headerPosition }}</span>
            <span class="location">{{ location?.type || '-' }}</span>
        </div>
    `,
})
class HeaderActionsHostComponent {
    api: any = undefined;
    containerApi: any = undefined;
    panels: { id: string }[] = [];
    activePanel?: { id: string };
    isGroupActive = false;
    group: any = undefined;
    headerPosition: string = 'top';
    location: any = undefined;
}

interface EventEmitter<T> {
    fire(value: T): void;
    subscribe(handler: (value: T) => void): { dispose(): void };
}

function makeEmitter<T>(): EventEmitter<T> {
    const handlers = new Set<(value: T) => void>();
    return {
        fire: (value) => handlers.forEach((h) => h(value)),
        subscribe: (handler) => {
            handlers.add(handler);
            return {
                dispose: () => {
                    handlers.delete(handler);
                },
            };
        },
    };
}

describe('AngularHeaderActionsRenderer', () => {
    let injector: Injector;
    let environmentInjector: EnvironmentInjector;
    let application: ApplicationRef;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [HeaderActionsHostComponent],
        }).compileComponents();

        injector = TestBed.inject(Injector);
        environmentInjector = TestBed.inject(EnvironmentInjector);
        application = TestBed.inject(ApplicationRef);
    });

    afterEach(() => {
        TestBed.resetTestingModule();
    });

    function makeStubGroup() {
        const onDidAddPanel = makeEmitter<void>();
        const onDidRemovePanel = makeEmitter<void>();
        const onDidChangeTabOrder = makeEmitter<void>();
        const onDidActivePanelChange = makeEmitter<void>();
        const onDidActiveChange = makeEmitter<void>();
        const onDidLocationChange = makeEmitter<{ location: any }>();

        const panels: { id: string }[] = [];
        const groupApi = {
            isActive: false,
            location: { type: 'grid' },
            onDidActiveChange: onDidActiveChange.subscribe,
            onDidLocationChange: onDidLocationChange.subscribe,
        };
        const group = {
            api: groupApi,
            model: {
                panels,
                activePanel: undefined as { id: string } | undefined,
                headerPosition: 'top',
                onDidAddPanel: onDidAddPanel.subscribe,
                onDidRemovePanel: onDidRemovePanel.subscribe,
                onDidChangeTabOrder: onDidChangeTabOrder.subscribe,
                onDidActivePanelChange: onDidActivePanelChange.subscribe,
            },
        };

        return {
            group,
            emitters: {
                onDidAddPanel,
                onDidRemovePanel,
                onDidChangeTabOrder,
                onDidActivePanelChange,
                onDidActiveChange,
                onDidLocationChange,
            },
        };
    }

    it('seeds the component with the full IDockviewHeaderActionsProps surface', () => {
        const { group } = makeStubGroup();
        const renderer = new AngularHeaderActionsRenderer(
            HeaderActionsHostComponent,
            group as any,
            injector,
            environmentInjector
        );

        const containerApi = { tag: 'container' } as any;
        renderer.init({ api: group.api as any, containerApi });
        application.tick();

        expect(renderer.element.querySelector('.panels')!.textContent).toBe(
            '0'
        );
        expect(renderer.element.querySelector('.active')!.textContent).toBe(
            '-'
        );
        expect(
            renderer.element.querySelector('.active-group')!.textContent
        ).toBe('no');
        expect(
            renderer.element.querySelector('.header-position')!.textContent
        ).toBe('top');
        expect(renderer.element.querySelector('.location')!.textContent).toBe(
            'grid'
        );

        renderer.dispose();
    });

    it('updates panels when the group emits add / remove events', () => {
        const { group, emitters } = makeStubGroup();
        const renderer = new AngularHeaderActionsRenderer(
            HeaderActionsHostComponent,
            group as any,
            injector,
            environmentInjector
        );

        renderer.init({
            api: group.api as any,
            containerApi: {} as any,
        });
        application.tick();

        group.model.panels.push({ id: 'p1' });
        emitters.onDidAddPanel.fire();
        application.tick();
        expect(renderer.element.querySelector('.panels')!.textContent).toBe(
            '1'
        );

        group.model.panels.length = 0;
        emitters.onDidRemovePanel.fire();
        application.tick();
        expect(renderer.element.querySelector('.panels')!.textContent).toBe(
            '0'
        );

        // a reorder within the group refreshes `panels` too
        group.model.panels.push({ id: 'b' });
        emitters.onDidChangeTabOrder.fire();
        application.tick();
        expect(renderer.element.querySelector('.panels')!.textContent).toBe(
            '1'
        );

        renderer.dispose();
    });

    it('tracks active panel, active group, and location changes', () => {
        const { group, emitters } = makeStubGroup();
        const renderer = new AngularHeaderActionsRenderer(
            HeaderActionsHostComponent,
            group as any,
            injector,
            environmentInjector
        );

        renderer.init({
            api: group.api as any,
            containerApi: {} as any,
        });
        application.tick();

        group.model.activePanel = { id: 'panel-7' };
        emitters.onDidActivePanelChange.fire();
        application.tick();
        expect(renderer.element.querySelector('.active')!.textContent).toBe(
            'panel-7'
        );

        group.api.isActive = true;
        emitters.onDidActiveChange.fire();
        application.tick();
        expect(
            renderer.element.querySelector('.active-group')!.textContent
        ).toBe('yes');

        emitters.onDidLocationChange.fire({ location: { type: 'floating' } });
        application.tick();
        expect(renderer.element.querySelector('.location')!.textContent).toBe(
            'floating'
        );

        renderer.dispose();
    });

    it('disposes subscriptions and view on dispose()', () => {
        const { group, emitters } = makeStubGroup();
        const renderer = new AngularHeaderActionsRenderer(
            HeaderActionsHostComponent,
            group as any,
            injector,
            environmentInjector
        );

        renderer.init({
            api: group.api as any,
            containerApi: {} as any,
        });
        application.tick();

        renderer.dispose();

        // After dispose, firing further events must not throw; disposal
        // should have unsubscribed every handler.
        expect(() => {
            group.model.panels.push({ id: 'late' });
            emitters.onDidAddPanel.fire();
            emitters.onDidActivePanelChange.fire();
            emitters.onDidActiveChange.fire();
            emitters.onDidLocationChange.fire({ location: { type: 'grid' } });
        }).not.toThrow();
    });
});
