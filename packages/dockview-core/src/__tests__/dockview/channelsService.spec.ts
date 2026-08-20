import { DockviewComponent } from '../../dockview/dockviewComponent';
import { ChannelsService } from '../../dockview/channelsService';
import { IContentRenderer } from '../../dockview/types';
import { IDisposable } from '../../lifecycle';

/**
 * Channels link panels without either panel knowing about the other: the user
 * decides what is connected by putting panels on the same channel. The
 * behaviours worth pinning down are the ones that make it feel built-in rather
 * than bolted on - retained context replayed on join, membership surviving
 * save/restore, and nothing at all happening until a host opts in.
 */

class Part implements IContentRenderer {
    element = document.createElement('div');
    constructor(public readonly id: string) {}
    init(): void {}
    layout(): void {}
    update(): void {}
    dispose(): void {}
}

/**
 * The popover anchor lives on the shell element, which is a sibling of
 * `dv.element` rather than a descendant, so queries run from the container.
 */
const containers = new WeakMap<DockviewComponent, HTMLElement>();

function createComponent(channels?: Record<string, unknown>) {
    const container = document.createElement('div');
    const dv = new DockviewComponent(container, {
        createComponent: (o: { id: string }) => new Part(o.id),
        channels,
    } as never);
    dv.layout(800, 600);
    containers.set(dv, container);
    return dv;
}

function query<T extends HTMLElement>(
    dv: DockviewComponent,
    selector: string
): T | null {
    return containers.get(dv)!.querySelector<T>(selector);
}

function queryAll<T extends HTMLElement>(
    dv: DockviewComponent,
    selector: string
): T[] {
    return Array.from(containers.get(dv)!.querySelectorAll<T>(selector));
}

function service(dv: DockviewComponent): ChannelsService {
    // The module ships in core, so it is always registered.
    return dv.channelsService as ChannelsService;
}

function indicator(dv: DockviewComponent, panelId: string): HTMLElement | null {
    return query(
        dv,
        `.dv-tab[data-tab-panel-id="${panelId}"] .dv-channel-indicator`
    );
}

describe('channels', () => {
    describe('when not enabled', () => {
        test('renders nothing and serializes nothing', () => {
            const dv = createComponent();
            dv.addPanel({ id: 'p1', component: 'default' });

            expect(indicator(dv, 'p1')).toBeNull();

            service(dv).setChannel('p1', 'red');
            const state = JSON.parse(JSON.stringify(dv.toJSON()));
            // membership is still tracked, but the indicator never appears
            expect(indicator(dv, 'p1')).toBeNull();
            expect(state.panels['p1'].moduleState).toEqual({
                channels: { channel: 'red' },
            });
        });
    });

    describe('when enabled', () => {
        test('shows an indicator on every tab, unset by default', () => {
            const dv = createComponent({ enabled: true });
            dv.addPanel({ id: 'p1', component: 'default' });

            const el = indicator(dv, 'p1');
            expect(el).not.toBeNull();
            expect(el!.classList).toContain('dv-channel-indicator--unset');
            expect(el!.getAttribute('aria-label')).toBe('No channel');
        });

        test('the accessible name carries the channel name, not the colour', () => {
            const dv = createComponent({ enabled: true });
            dv.addPanel({ id: 'p1', component: 'default' });
            service(dv).setChannel('p1', 'green');

            const el = indicator(dv, 'p1')!;
            expect(el.getAttribute('aria-label')).toBe('Channel: Green');
            expect(el.title).toBe('Channel: Green');
            expect(el.classList).not.toContain('dv-channel-indicator--unset');
        });

        test('the picker sets the channel', () => {
            const dv = createComponent({ enabled: true });
            dv.addPanel({ id: 'p1', component: 'default' });

            indicator(dv, 'p1')!.dispatchEvent(
                new MouseEvent('click', { bubbles: true })
            );

            const items = queryAll(dv, '.dv-channel-picker-item');
            // six default channels plus "None"
            expect(items).toHaveLength(7);
            expect(items[items.length - 1].textContent).toContain('None');

            items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(service(dv).getChannel('p1')).toBe('red');
        });
    });

    describe('context', () => {
        test('reaches other panels on the same channel only', () => {
            const dv = createComponent({ enabled: true });
            ['sender', 'same', 'other', 'none'].forEach((id) =>
                dv.addPanel({ id, component: 'default' })
            );
            const svc = service(dv);
            svc.setChannel('sender', 'red');
            svc.setChannel('same', 'red');
            svc.setChannel('other', 'blue');

            const seen: Record<string, unknown[]> = {
                sender: [],
                same: [],
                other: [],
                none: [],
            };
            const subs: IDisposable[] = ['sender', 'same', 'other', 'none'].map(
                (id) => svc.addContextListener(id, (c) => seen[id].push(c))
            );

            svc.broadcast('sender', { ticker: 'AAPL' });

            expect(seen.same).toEqual([{ ticker: 'AAPL' }]);
            expect(seen.other).toEqual([]);
            expect(seen.none).toEqual([]);
            // a broadcaster does not receive its own context
            expect(seen.sender).toEqual([]);

            subs.forEach((s) => s.dispose());
        });

        test('is replayed when a panel joins, not held until the next broadcast', () => {
            const dv = createComponent({ enabled: true });
            dv.addPanel({ id: 'blotter', component: 'default' });
            dv.addPanel({ id: 'chart', component: 'default' });
            const svc = service(dv);

            svc.setChannel('blotter', 'red');
            svc.broadcast('blotter', { ticker: 'MSFT' });

            const seen: unknown[] = [];
            svc.addContextListener('chart', (c) => seen.push(c));
            expect(seen).toEqual([]);

            // joining the channel delivers what is already on it
            svc.setChannel('chart', 'red');
            expect(seen).toEqual([{ ticker: 'MSFT' }]);
        });

        test('a panel with no channel broadcasts nowhere', () => {
            const dv = createComponent({ enabled: true });
            dv.addPanel({ id: 'p1', component: 'default' });
            dv.addPanel({ id: 'p2', component: 'default' });
            const svc = service(dv);
            svc.setChannel('p2', 'red');

            const seen: unknown[] = [];
            svc.addContextListener('p2', (c) => seen.push(c));
            svc.broadcast('p1', { ticker: 'AAPL' });

            expect(seen).toEqual([]);
        });
    });

    describe('lifecycle', () => {
        test('membership survives save and restore', () => {
            const dv = createComponent({ enabled: true });
            dv.addPanel({ id: 'p1', component: 'default' });
            service(dv).setChannel('p1', 'purple');
            const saved = JSON.parse(JSON.stringify(dv.toJSON()));

            const restored = createComponent({ enabled: true });
            restored.fromJSON(saved);

            expect(service(restored).getChannel('p1')).toBe('purple');
            expect(indicator(restored, 'p1')!.getAttribute('aria-label')).toBe(
                'Channel: Purple'
            );
        });

        test('a channel the current set does not define clears rather than throws', () => {
            const dv = createComponent({ enabled: true });
            dv.addPanel({ id: 'p1', component: 'default' });
            service(dv).setChannel('p1', 'purple');
            const saved = JSON.parse(JSON.stringify(dv.toJSON()));

            // restored against a host that defines a different set
            const restored = createComponent({
                enabled: true,
                channels: [{ id: 'alpha', name: 'Alpha', color: '#000' }],
            });
            expect(() => restored.fromJSON(saved)).not.toThrow();
            expect(service(restored).getChannel('p1')).toBeUndefined();
        });

        test('removing a panel forgets its membership', () => {
            const dv = createComponent({ enabled: true });
            const panel = dv.addPanel({ id: 'p1', component: 'default' });
            const svc = service(dv);
            svc.setChannel('p1', 'red');

            dv.removePanel(panel);

            expect(svc.getChannel('p1')).toBeUndefined();
        });

        test('membership follows a panel between groups', () => {
            const dv = createComponent({ enabled: true });
            const p1 = dv.addPanel({ id: 'p1', component: 'default' });
            const p2 = dv.addPanel({ id: 'p2', component: 'default' });
            const svc = service(dv);
            svc.setChannel('p1', 'blue');

            p1.api.moveTo({ group: p2.group, position: 'right' });

            expect(svc.getChannel('p1')).toBe('blue');
            expect(indicator(dv, 'p1')!.getAttribute('aria-label')).toBe(
                'Channel: Blue'
            );
        });
    });

    test('onDidChangeChannel reports the transition', () => {
        const dv = createComponent({ enabled: true });
        dv.addPanel({ id: 'p1', component: 'default' });
        const svc = service(dv);

        const events: unknown[] = [];
        svc.onDidChangeChannel((e) => events.push(e));

        svc.setChannel('p1', 'red');
        svc.setChannel('p1', 'red'); // no-op
        svc.setChannel('p1', undefined);

        expect(events).toEqual([
            { panelId: 'p1', from: undefined, to: 'red' },
            { panelId: 'p1', from: 'red', to: undefined },
        ]);
    });
});
