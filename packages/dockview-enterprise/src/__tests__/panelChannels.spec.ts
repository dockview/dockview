import {
    DockviewComponent,
    DockviewEmitter as Emitter,
    IContentRenderer,
    IDockviewPanel,
    PanelChannelContextEvent,
    PanelChannelMessage,
    PanelChannelTransport,
} from 'dockview-core';
import { setupMockWindow } from '../../../dockview-core/src/__tests__/__mocks__/mockWindow';
import { PanelChannelsService } from '../panelChannelsService';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        // noop
    }
    layout(): void {
        // noop
    }
    dispose(): void {
        // noop
    }
}

type ChannelOptions = DockviewComponent['options']['panelChannels'];

/**
 * Panel channels: one colour channel per panel, `broadcast` fanning a context
 * out to the other members, last-value replay on join / restore, and the tab
 * / header presentation. Owned by the PanelChannels module and dormant unless
 * `panelChannels.enabled` is set.
 */
describe('panel channels', () => {
    let container: HTMLElement;
    let dockview: DockviewComponent;
    let announcements: string[];

    const make = (
        panelChannels: ChannelOptions,
        extra: Partial<DockviewComponent['options']> = {}
    ): DockviewComponent => {
        container = document.createElement('div');
        document.body.appendChild(container);
        announcements = [];
        dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            panelChannels,
            announcer: (event) => announcements.push(event.message),
            ...extra,
        });
        dockview.layout(1000, 1000);
        return dockview;
    };

    afterEach(() => {
        dockview?.dispose();
        container?.remove();
    });

    const add = (id: string, position?: 'right') =>
        dockview.addPanel({
            id,
            component: 'default',
            title: id,
            position: position ? { direction: position } : undefined,
        });

    const received = (panel: IDockviewPanel): PanelChannelContextEvent[] => {
        const events: PanelChannelContextEvent[] = [];
        panel.api.onDidReceiveContext((e) => events.push(e));
        return events;
    };

    const tabEl = (panel: IDockviewPanel): HTMLElement => {
        const id = panel.api.group.model.header.getTabId(panel.id)!;
        return document.getElementById(id)!;
    };

    const headerEl = (panel: IDockviewPanel): HTMLElement =>
        panel.api.group.element.querySelector(
            '.dv-tabs-and-actions-container'
        )!;

    describe('join and leave', () => {
        test('joining sets the channel and fires the panel and component events', () => {
            make({ enabled: true });
            const a = add('a');
            announcements.length = 0;
            const panelEvents: (string | undefined)[] = [];
            const componentEvents: (string | undefined)[] = [];
            a.api.onDidChannelChange((e) => panelEvents.push(e.channel?.id));
            dockview.onDidPanelChannelChange((e) =>
                componentEvents.push(e.channel?.id)
            );

            a.api.joinChannel('red');

            expect(a.api.channel).toBe('red');
            expect(panelEvents).toEqual(['red']);
            expect(componentEvents).toEqual(['red']);
            expect(dockview.api.getChannelMembers('red')).toEqual([a]);
            expect(announcements).toEqual(['a linked to Red']);
        });

        test('leaving clears the channel and announces it', () => {
            make({ enabled: true });
            const a = add('a');
            a.api.joinChannel('red');
            announcements.length = 0;

            a.api.leaveChannel();

            expect(a.api.channel).toBeUndefined();
            expect(dockview.api.getChannelMembers('red')).toEqual([]);
            expect(announcements).toEqual(['a unlinked']);
        });

        test('a duplicate join is a no-op (no events, no replay)', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            b.api.joinChannel('red');
            b.api.broadcast({ type: 'x' });
            a.api.joinChannel('red');
            const events = received(a);
            let changes = 0;
            a.api.onDidChannelChange(() => changes++);

            a.api.joinChannel('red');

            expect(changes).toBe(0);
            expect(events).toEqual([]);
        });

        test('switching channel moves membership and fires one change event', () => {
            make({ enabled: true });
            const a = add('a');
            a.api.joinChannel('red');
            let changes = 0;
            a.api.onDidChannelChange(() => changes++);

            a.api.joinChannel('blue');

            expect(changes).toBe(1);
            expect(dockview.api.getChannelMembers('red')).toEqual([]);
            expect(dockview.api.getChannelMembers('blue')).toEqual([a]);
        });

        test('an unknown id throws', () => {
            make({ enabled: true });
            const a = add('a');
            expect(() => a.api.joinChannel('nope')).toThrow(
                'dockview: unknown channel "nope"'
            );
            expect(a.api.channel).toBeUndefined();
        });

        test('dormant without panelChannels.enabled', () => {
            make({});
            const a = add('a');
            announcements.length = 0;
            a.api.joinChannel('red');
            expect(a.api.channel).toBeUndefined();
            expect(announcements).toEqual([]);
        });

        test('a custom channel list replaces the defaults', () => {
            make({
                enabled: true,
                channels: [{ id: 'alpha', label: 'Alpha', color: '#123456' }],
            });
            const a = add('a');
            expect(dockview.api.getPanelChannels().map((c) => c.id)).toEqual([
                'alpha',
            ]);
            expect(() => a.api.joinChannel('red')).toThrow();
            a.api.joinChannel('alpha');
            expect(a.api.channel).toBe('alpha');
        });
    });

    describe('broadcast', () => {
        test('delivers to the other members only, in join order, synchronously', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            const c = add('c');
            const d = add('d');
            // Join out of panel order to prove delivery follows join order.
            c.api.joinChannel('red');
            a.api.joinChannel('red');
            b.api.joinChannel('red');
            d.api.joinChannel('blue');

            const order: string[] = [];
            for (const p of [a, b, c, d]) {
                p.api.onDidReceiveContext(() => order.push(p.id));
            }
            const events = received(a);

            b.api.broadcast({ type: 'instrument', id: 'AAPL' });

            expect(order).toEqual(['c', 'a']);
            expect(events).toHaveLength(1);
            expect(events[0].context).toEqual({
                type: 'instrument',
                id: 'AAPL',
            });
            expect(events[0].source).toBe(b);
            expect(events[0].replay).toBe(false);
            expect(events[0].channel.id).toBe('red');
        });

        test('getCurrentContext inside a handler already returns the new value', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            a.api.joinChannel('red');
            b.api.joinChannel('red');
            let seen: unknown;
            a.api.onDidReceiveContext(() => {
                seen = a.api.getCurrentContext();
            });

            b.api.broadcast({ type: 'x', n: 1 });

            expect(seen).toEqual({ type: 'x', n: 1 });
            expect(dockview.api.getChannelContext('red')).toEqual({
                type: 'x',
                n: 1,
            });
        });

        test('a broadcast issued inside a delivery is dispatched after the outer one (FIFO)', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            const c = add('c');
            a.api.joinChannel('red');
            b.api.joinChannel('red');
            c.api.joinChannel('red');

            const log: string[] = [];
            // `a` reacts to the first message by broadcasting a reply.
            a.api.onDidReceiveContext((e) => {
                log.push(`a:${e.context.type}`);
                if (e.context.type === 'first') {
                    a.api.broadcast({ type: 'reply' });
                }
            });
            b.api.onDidReceiveContext((e) => log.push(`b:${e.context.type}`));

            c.api.broadcast({ type: 'first' });

            // Every member sees `first` before anyone sees `reply`.
            expect(log).toEqual(['a:first', 'b:first', 'b:reply']);
        });

        test('nested broadcasts are dispatched in the order they were issued', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            a.api.joinChannel('red');
            b.api.joinChannel('red');

            const log: string[] = [];
            a.api.onDidReceiveContext((e) => {
                log.push(`a:${e.context.type}`);
                if (e.context.type === 'first') {
                    a.api.broadcast({ type: 'second' });
                    a.api.broadcast({ type: 'third' });
                }
            });
            b.api.onDidReceiveContext((e) => log.push(`b:${e.context.type}`));

            b.api.broadcast({ type: 'first' });

            expect(log).toEqual(['a:first', 'b:second', 'b:third']);
        });

        test('a panel on no channel broadcasts nothing', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            b.api.joinChannel('red');
            const events = received(b);

            a.api.broadcast({ type: 'x' });

            expect(events).toEqual([]);
            expect(dockview.api.getChannelContext('red')).toBeUndefined();
        });

        test('api.broadcastToChannel reaches every member with no source', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            a.api.joinChannel('red');
            b.api.joinChannel('red');
            const aEvents = received(a);
            const bEvents = received(b);
            const componentEvents: string[][] = [];
            dockview.api.onDidChannelContext((e) =>
                componentEvents.push(e.panels.map((p) => p.id))
            );

            dockview.api.broadcastToChannel('red', { type: 'x' });

            expect(aEvents).toHaveLength(1);
            expect(bEvents).toHaveLength(1);
            expect(aEvents[0].source).toBeUndefined();
            expect(componentEvents).toEqual([['a', 'b']]);
        });

        test('the component-level event reports the receivers of a live broadcast', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            a.api.joinChannel('red');
            b.api.joinChannel('red');
            const events: { panels: string[]; replay: boolean }[] = [];
            dockview.api.onDidChannelContext((e) =>
                events.push({
                    panels: e.panels.map((p) => p.id),
                    replay: e.replay,
                })
            );

            a.api.broadcast({ type: 'x' });

            expect(events).toEqual([{ panels: ['b'], replay: false }]);
        });

        test('a removed panel is pruned from membership; contexts are kept', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            a.api.joinChannel('red');
            b.api.joinChannel('red');
            a.api.broadcast({ type: 'x' });

            dockview.removePanel(a);

            expect(dockview.api.getChannelMembers('red')).toEqual([b]);
            expect(dockview.api.getChannelContext('red')).toEqual({
                type: 'x',
            });
        });

        test('clear() prunes membership and keeps contexts; clearChannelContexts drops them', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            a.api.joinChannel('red');
            b.api.joinChannel('blue');
            a.api.broadcast({ type: 'r' });
            b.api.broadcast({ type: 'b' });

            dockview.clear();

            expect(dockview.api.getChannelMembers('red')).toEqual([]);
            expect(dockview.api.getChannelContext('red')).toEqual({
                type: 'r',
            });

            dockview.api.clearChannelContexts('red');
            expect(dockview.api.getChannelContext('red')).toBeUndefined();
            expect(dockview.api.getChannelContext('blue')).toEqual({
                type: 'b',
            });

            dockview.api.clearChannelContexts();
            expect(dockview.api.getChannelContext('blue')).toBeUndefined();
        });

        test('contexts are delivered by reference, not cloned', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            a.api.joinChannel('red');
            b.api.joinChannel('red');
            const events = received(a);
            const context = { type: 'x', nested: { v: 1 } };

            b.api.broadcast(context);

            expect(events[0].context).toBe(context);
            expect(dockview.api.getChannelContext('red')).toBe(context);
        });
    });

    describe('replay', () => {
        test('joining replays the channel last context', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            b.api.joinChannel('red');
            b.api.broadcast({ type: 'x' });
            const events = received(a);
            const componentEvents: boolean[] = [];
            dockview.api.onDidChannelContext((e) =>
                componentEvents.push(e.replay)
            );

            a.api.joinChannel('red');

            expect(events).toHaveLength(1);
            expect(events[0].replay).toBe(true);
            expect(events[0].source).toBeUndefined();
            expect(events[0].context).toEqual({ type: 'x' });
            expect(componentEvents).toEqual([true]);
        });

        test('no replay when replayLastContext is false', () => {
            make({ enabled: true, replayLastContext: false });
            const a = add('a');
            const b = add('b');
            b.api.joinChannel('red');
            b.api.broadcast({ type: 'x' });
            const events = received(a);

            a.api.joinChannel('red');

            expect(events).toEqual([]);
        });

        test('switching channel replays the new channel, not the old one', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            const c = add('c');
            b.api.joinChannel('red');
            b.api.broadcast({ type: 'r' });
            c.api.joinChannel('blue');
            c.api.broadcast({ type: 'b' });
            a.api.joinChannel('red');
            const events = received(a);

            a.api.joinChannel('blue');

            expect(events.map((e) => e.context.type)).toEqual(['b']);
        });

        test('leaving stops delivery and replays nothing', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            a.api.joinChannel('red');
            b.api.joinChannel('red');
            const events = received(a);

            a.api.leaveChannel();
            b.api.broadcast({ type: 'x' });

            expect(events).toEqual([]);
        });
    });

    describe('serialization', () => {
        test('fromJSON restores membership and replays the last context', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b', 'right');
            a.api.joinChannel('red');
            b.api.joinChannel('red');
            a.api.broadcast({ type: 'x' });
            const json = dockview.toJSON();
            expect(json.grid.root).toBeDefined();

            const replays: string[] = [];
            dockview.api.onDidChannelContext((e) => {
                if (e.replay) {
                    replays.push(...e.panels.map((p) => p.id));
                }
            });

            dockview.fromJSON(json);

            const ra = dockview.getGroupPanel('a')!;
            const rb = dockview.getGroupPanel('b')!;
            expect(ra.api.channel).toBe('red');
            expect(rb.api.channel).toBe('red');
            expect(dockview.api.getChannelMembers('red')).toEqual([ra, rb]);
            expect(replays.sort()).toEqual(['a', 'b']);
            expect(tabEl(ra).classList.contains('dv-tab--channel')).toBe(true);

            // The rebuilt membership is live.
            const events = received(rb);
            ra.api.broadcast({ type: 'y' });
            expect(events.map((e) => e.context.type)).toEqual(['y']);
        });

        test('fromJSON with reuseExistingPanels rebuilds membership on the kept panels', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b', 'right');
            a.api.joinChannel('red');
            const json = dockview.toJSON();
            b.api.joinChannel('red');
            a.api.leaveChannel();

            dockview.fromJSON(json, { reuseExistingPanels: true });

            expect(dockview.getGroupPanel('a')).toBe(a);
            expect(a.api.channel).toBe('red');
            expect(b.api.channel).toBeUndefined();
            expect(dockview.api.getChannelMembers('red')).toEqual([a]);
        });

        test('a restored unknown channel id loads unlinked with one warning', () => {
            make({ enabled: true });
            add('a');
            add('b');
            const json = dockview.toJSON();
            for (const group of Object.values(json.panels)) {
                group.channel = 'vanished';
            }
            const warn = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => undefined);

            dockview.fromJSON(json);

            expect(dockview.getGroupPanel('a')!.api.channel).toBeUndefined();
            expect(dockview.getGroupPanel('b')!.api.channel).toBeUndefined();
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toMatch(/vanished/);
            warn.mockRestore();
        });
    });

    describe('transport', () => {
        class RecordingTransport implements PanelChannelTransport {
            readonly published: PanelChannelMessage[] = [];
            readonly disposed = jest.fn();
            private readonly _onMessage = new Emitter<PanelChannelMessage>();
            readonly onMessage = this._onMessage.event;
            publish(message: PanelChannelMessage): void {
                this.published.push(message);
            }
            inject(message: PanelChannelMessage): void {
                this._onMessage.fire(message);
            }
            dispose(): void {
                this.disposed();
            }
        }

        test('a supplied transport receives publishes and drives delivery', () => {
            const transport = new RecordingTransport();
            make({ enabled: true, transport });
            const a = add('a');
            const b = add('b');
            a.api.joinChannel('red');
            b.api.joinChannel('red');
            const events = received(b);

            a.api.broadcast({ type: 'x' });

            // Nothing is delivered until the transport says so.
            expect(events).toEqual([]);
            expect(transport.published).toEqual([
                {
                    channelId: 'red',
                    context: { type: 'x' },
                    sourcePanelId: 'a',
                    originId: dockview.id,
                },
            ]);

            transport.inject(transport.published[0]);
            expect(events.map((e) => e.context.type)).toEqual(['x']);
            expect(events[0].source).toBe(a);
        });

        test('a message from another origin is delivered to every member', () => {
            const transport = new RecordingTransport();
            make({ enabled: true, transport });
            const a = add('a');
            a.api.joinChannel('red');
            const events = received(a);

            transport.inject({
                channelId: 'red',
                context: { type: 'remote' },
                sourcePanelId: 'a',
                originId: 'some-other-component',
            });

            // Same panel id, different component: not excluded as the sender.
            expect(events).toHaveLength(1);
            expect(events[0].source).toBeUndefined();
        });

        test('a supplied transport is not disposed with the service', () => {
            const transport = new RecordingTransport();
            make({ enabled: true, transport });
            dockview.dispose();
            expect(transport.disposed).not.toHaveBeenCalled();
        });
    });

    describe('presentation', () => {
        test('the tab shows a channel marker with the colour and an accessible name', () => {
            make({ enabled: true });
            const a = add('a');

            a.api.joinChannel('red');

            const tab = tabEl(a);
            expect(tab.classList.contains('dv-tab--channel')).toBe(true);
            expect(tab.dataset.channel).toBe('red');
            expect(tab.style.getPropertyValue('--dv-channel-color')).toBe(
                'var(--dv-channel-color-red)'
            );
            const marker = tab.querySelector('.dv-tab-channel')!;
            expect(marker.getAttribute('role')).toBe('img');
            expect(marker.getAttribute('aria-label')).toBe('Linked to Red');

            a.api.leaveChannel();
            expect(tab.classList.contains('dv-tab--channel')).toBe(false);
            expect(tab.querySelector('.dv-tab-channel')).toBeNull();
            expect(tab.style.getPropertyValue('--dv-channel-color')).toBe('');
        });

        test('the group header accent tracks the active panel', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            a.api.joinChannel('red');
            b.api.joinChannel('blue');
            const header = headerEl(a);

            // `b` is active (added last).
            expect(header.dataset.channel).toBe('blue');
            expect(
                header.classList.contains(
                    'dv-tabs-and-actions-container--channel'
                )
            ).toBe(true);

            a.api.setActive();
            expect(header.dataset.channel).toBe('red');
            expect(header.style.getPropertyValue('--dv-channel-color')).toBe(
                'var(--dv-channel-color-red)'
            );

            a.api.leaveChannel();
            expect(header.dataset.channel).toBeUndefined();
            expect(
                header.classList.contains(
                    'dv-tabs-and-actions-container--channel'
                )
            ).toBe(false);
        });

        test('headerIndicator: false clears the accent via updateOptions', () => {
            make({ enabled: true });
            const a = add('a');
            a.api.joinChannel('red');
            const header = headerEl(a);
            expect(header.dataset.channel).toBe('red');

            dockview.updateOptions({
                panelChannels: { enabled: true, headerIndicator: false },
            });
            expect(header.dataset.channel).toBeUndefined();

            dockview.updateOptions({ panelChannels: { enabled: true } });
            expect(header.dataset.channel).toBe('red');
        });

        test('a channel removed by updateOptions warns once and uncolours the tab', () => {
            make({ enabled: true });
            const a = add('a');
            const b = add('b');
            a.api.joinChannel('red');
            b.api.joinChannel('red');
            const warn = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => undefined);

            dockview.updateOptions({
                panelChannels: {
                    enabled: true,
                    channels: [{ id: 'blue', label: 'Blue', color: 'blue' }],
                },
            });

            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toMatch(/"red"/);
            expect(a.api.channel).toBe('red');
            const tab = tabEl(a);
            expect(tab.classList.contains('dv-tab--channel')).toBe(true);
            expect(tab.style.getPropertyValue('--dv-channel-color')).toBe('');
            warn.mockRestore();
        });

        test('a popped-out member still receives broadcasts and shows the marker', async () => {
            const originalOpen = window.open;
            window.open = () => setupMockWindow();
            try {
                make({ enabled: true });
                const a = add('a');
                const b = add('b', 'right');
                a.api.joinChannel('red');
                b.api.joinChannel('red');

                await dockview.addPopoutGroup(b.api.group);
                expect(b.api.location.type).toBe('popout');

                const events = received(b);
                a.api.broadcast({ type: 'x' });

                expect(events.map((e) => e.context.type)).toEqual(['x']);
                expect(tabEl(b).classList.contains('dv-tab--channel')).toBe(
                    true
                );
            } finally {
                window.open = originalOpen;
            }
        });
    });

    describe('service', () => {
        test('the component exposes the registered service', () => {
            make({ enabled: true });
            expect(dockview.panelChannelsService).toBeInstanceOf(
                PanelChannelsService
            );
            expect(
                dockview.panelChannelsService!.channels.map((c) => c.id)
            ).toEqual([
                'red',
                'orange',
                'yellow',
                'green',
                'cyan',
                'blue',
                'magenta',
                'purple',
            ]);
        });

        test('dispose clears membership, contexts and header accents', () => {
            make({ enabled: true });
            const a = add('a');
            a.api.joinChannel('red');
            a.api.broadcast({ type: 'x' });
            const header = headerEl(a);
            const service = dockview.panelChannelsService!;

            service.dispose();

            expect(service.getMembers('red')).toEqual([]);
            expect(service.getLastContext('red')).toBeUndefined();
            expect(header.dataset.channel).toBeUndefined();
        });
    });
});
