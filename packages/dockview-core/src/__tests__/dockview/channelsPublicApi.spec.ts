/**
 * Guards the *export surface* rather than the behaviour: everything here is
 * imported from the package entry point and annotated explicitly, the way a
 * consumer would. The channel contract types were initially reachable only
 * from an internal path, so `api.channels` could not be annotated at all;
 * a behavioural test would not have caught that.
 */
import {
    ChannelDefinition,
    ChannelChangeEvent,
    IChannelsService,
    ChannelsOptions,
    DEFAULT_CHANNELS,
    IPanelStateContributor,
    ITabDecoration,
} from '../../index';
import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';

class Part implements IContentRenderer {
    element = document.createElement('div');
    constructor(public readonly id: string) {}
    init(): void {}
    layout(): void {}
    update(): void {}
    dispose(): void {}
}

test('public channel API is importable and typed', () => {
    const myChannels: ChannelDefinition[] = [
        { id: 'trading', name: 'Trading', color: '#e5484d', glyph: 'T' },
    ];
    const options: ChannelsOptions = { enabled: true, channels: myChannels };

    const dv = new DockviewComponent(document.createElement('div'), {
        createComponent: (o: { id: string }) => new Part(o.id),
        channels: options,
    } as never);
    dv.layout(400, 300);
    dv.addPanel({ id: 'p1', component: 'default' });

    const channels: IChannelsService = dv.api.channels;

    const events: ChannelChangeEvent[] = [];
    channels.onDidChangeChannel((e) => events.push(e));

    channels.setChannel('p1', 'trading');
    expect(channels.getChannel('p1')).toBe('trading');
    expect(channels.panelsOnChannel('trading').map((p) => p.id)).toEqual([
        'p1',
    ]);
    expect(events).toEqual([{ panelId: 'p1', from: undefined, to: 'trading' }]);

    const received: unknown[] = [];
    const sub = channels.addContextListener('p1', (c) => received.push(c));
    channels.broadcast('p1', { ticker: 'AAPL' });
    sub.dispose();

    expect(channels.channels).toEqual(myChannels);
    expect(DEFAULT_CHANNELS.map((c) => c.id)).toEqual([
        'red',
        'orange',
        'yellow',
        'green',
        'blue',
        'purple',
    ]);

    // the two seams are importable as types
    const _a: IPanelStateContributor | undefined = undefined;
    const _b: ITabDecoration | undefined = undefined;
    expect([_a, _b]).toEqual([undefined, undefined]);
});
