import { Emitter, Event, addDisposableListener } from '../events';
import { CompositeDisposable, Disposable, IDisposable } from '../lifecycle';
import { DockviewComponentOptions } from './options';
import { IDockviewPanel } from './dockviewPanel';
import {
    ChannelChangeEvent,
    ChannelDefinition,
    IChannelsHost,
    IChannelsService,
} from './moduleContracts';
import {
    defineModule,
    ITabDecoration,
    IPanelStateContributor,
} from './modules';

/**
 * The standard set, mirroring FDC3's user channels so a layout's membership
 * means the same thing if an FDC3 agent is attached later. Override with
 * `channels.channels`.
 */
export const DEFAULT_CHANNELS: readonly ChannelDefinition[] = [
    { id: 'red', name: 'Red', color: '#e5484d', glyph: 'R' },
    { id: 'orange', name: 'Orange', color: '#f76b15', glyph: 'O' },
    { id: 'yellow', name: 'Yellow', color: '#ffc53d', glyph: 'Y' },
    { id: 'green', name: 'Green', color: '#30a46c', glyph: 'G' },
    { id: 'blue', name: 'Blue', color: '#0091ff', glyph: 'B' },
    { id: 'purple', name: 'Purple', color: '#8e4ec6', glyph: 'P' },
];

export interface ChannelsOptions {
    /** Off by default: the module is inert until asked for. */
    enabled?: boolean;
    /** Replaces {@link DEFAULT_CHANNELS}. */
    channels?: ChannelDefinition[];
    /** Show the per-tab indicator. Default `true` when enabled. */
    tabIndicator?: boolean;
    /**
     * Render the channel's glyph inside the indicator, so membership is
     * readable without colour vision. Default `false`; the accessible name and
     * tooltip always carry the channel name regardless.
     */
    indicatorGlyph?: boolean;
}

interface ResolvedOptions {
    enabled: boolean;
    channels: readonly ChannelDefinition[];
    tabIndicator: boolean;
    indicatorGlyph: boolean;
}

function resolveOptions(options: DockviewComponentOptions): ResolvedOptions {
    const o = options.channels;
    return {
        enabled: o?.enabled ?? false,
        channels:
            o?.channels && o.channels.length > 0
                ? o.channels
                : DEFAULT_CHANNELS,
        tabIndicator: o?.tabIndicator ?? true,
        indicatorGlyph: o?.indicatorGlyph ?? false,
    };
}

interface SerializedChannelState {
    channel: string;
}

/**
 * Colour-channel linking. Panels broadcast and listen without referencing each
 * other; the user decides what is connected by putting panels on the same
 * channel.
 *
 * This service is the single source of truth for membership. It is deliberately
 * not a general event bus: delivery is scoped to a channel, the last context per
 * channel is retained and replayed when a panel joins, and membership is keyed
 * by panel id so it survives group moves, floats and popouts untouched.
 */
export class ChannelsService
    extends CompositeDisposable
    implements
        IChannelsService,
        IPanelStateContributor<SerializedChannelState>,
        ITabDecoration
{
    readonly panelStateKey = 'channels';

    readonly decorationKey = 'channels';
    /** Opens a picker, so its clicks must not activate or drag the tab. */
    readonly interactive = true;
    /** The only route to the picker, so it must survive a custom tab. */
    readonly renderWithCustomTab = true;

    private readonly _membership = new Map<string, string>();
    private readonly _listeners = new Map<
        string,
        Set<(context: unknown) => void>
    >();
    /** channel id -> last context broadcast on it. */
    private readonly _retained = new Map<string, unknown>();

    private readonly _onDidChangeChannel = new Emitter<ChannelChangeEvent>();
    readonly onDidChangeChannel: Event<ChannelChangeEvent> =
        this._onDidChangeChannel.event;

    private readonly _onDidChangeTabDecoration = new Emitter<{
        panelId?: string;
    }>();
    readonly onDidChangeTabDecoration = this._onDidChangeTabDecoration.event;

    constructor(private readonly host: IChannelsHost) {
        super();
        this.addDisposables(
            this._onDidChangeChannel,
            this._onDidChangeTabDecoration
        );
    }

    private get _options(): ResolvedOptions {
        // Read per call rather than cached, so `updateOptions` is honoured live.
        return resolveOptions(this.host.options);
    }

    get channels(): readonly ChannelDefinition[] {
        return this._options.channels;
    }

    getChannel(panelId: string): string | undefined {
        return this._membership.get(panelId);
    }

    setChannel(panelId: string, channelId: string | undefined): void {
        const from = this._membership.get(panelId);

        // A channel the current set doesn't define (a layout saved against a
        // different set) clears rather than throws.
        const resolved =
            channelId !== undefined &&
            this._options.channels.some((c) => c.id === channelId)
                ? channelId
                : undefined;

        if (from === resolved) {
            return;
        }

        if (resolved === undefined) {
            this._membership.delete(panelId);
        } else {
            this._membership.set(panelId, resolved);
        }

        this._onDidChangeChannel.fire({ panelId, from, to: resolved });
        this._onDidChangeTabDecoration.fire({ panelId });

        // Joining replays the channel's retained context, so linking two panels
        // takes effect immediately instead of on the next broadcast.
        if (resolved !== undefined && this._retained.has(resolved)) {
            this._deliver(panelId, this._retained.get(resolved));
        }
    }

    panelsOnChannel(channelId: string): IDockviewPanel[] {
        return this.host.panels.filter(
            (panel) => this._membership.get(panel.id) === channelId
        );
    }

    broadcast(panelId: string, context: unknown): void {
        const channel = this._membership.get(panelId);

        if (channel === undefined) {
            return;
        }

        this._retained.set(channel, context);

        // `Array.from(keys())` rather than iterating the Map directly: the ES5
        // target needs downlevelIteration for the latter, and a listener
        // unsubscribing mid-dispatch must not perturb the walk.
        for (const otherId of Array.from(this._listeners.keys())) {
            if (
                otherId !== panelId &&
                this._membership.get(otherId) === channel
            ) {
                this._deliver(otherId, context);
            }
        }
    }

    addContextListener(
        panelId: string,
        listener: (context: unknown) => void
    ): IDisposable {
        let set = this._listeners.get(panelId);

        if (set === undefined) {
            set = new Set();
            this._listeners.set(panelId, set);
        }

        set.add(listener);

        const channel = this._membership.get(panelId);
        if (channel !== undefined && this._retained.has(channel)) {
            listener(this._retained.get(channel));
        }

        return Disposable.from(() => {
            const current = this._listeners.get(panelId);
            current?.delete(listener);
            if (current?.size === 0) {
                this._listeners.delete(panelId);
            }
        });
    }

    /** Drop everything held for a panel that has gone. */
    forget(panelId: string): void {
        this._membership.delete(panelId);
        this._listeners.delete(panelId);
    }

    private _deliver(panelId: string, context: unknown): void {
        const set = this._listeners.get(panelId);
        if (set === undefined) {
            return;
        }
        for (const listener of Array.from(set)) {
            listener(context);
        }
    }

    // --- persistence -------------------------------------------------------

    serializePanelState(
        panel: IDockviewPanel
    ): SerializedChannelState | undefined {
        const channel = this._membership.get(panel.id);
        return channel === undefined ? undefined : { channel };
    }

    hydratePanelState(
        panel: IDockviewPanel,
        state: SerializedChannelState | undefined
    ): void {
        this.setChannel(panel.id, state?.channel);
    }

    // --- tab indicator -----------------------------------------------------

    renderTabDecoration(
        panel: IDockviewPanel,
        element: HTMLElement | undefined
    ): HTMLElement | null {
        const options = this._options;

        if (!options.enabled || !options.tabIndicator) {
            return null;
        }

        const channelId = this._membership.get(panel.id);
        const channel = options.channels.find((c) => c.id === channelId);

        const el =
            (element as HTMLButtonElement | undefined) ??
            this._createIndicator(panel);

        el.classList.toggle(
            'dv-channel-indicator--unset',
            channel === undefined
        );
        el.style.setProperty(
            '--dv-channel-color',
            channel?.color ?? 'transparent'
        );
        el.textContent =
            options.indicatorGlyph && channel !== undefined
                ? (channel.glyph ?? '')
                : '';

        // Colour alone is never the whole signal.
        const label =
            channel === undefined ? 'No channel' : `Channel: ${channel.name}`;
        el.setAttribute('aria-label', label);
        el.title = label;

        return el;
    }

    private _createIndicator(panel: IDockviewPanel): HTMLButtonElement {
        const el = document.createElement('button');
        el.className = 'dv-channel-indicator';
        el.type = 'button';

        this.addDisposables(
            addDisposableListener(el, 'click', (event) => {
                this._openPicker(panel, event as MouseEvent);
            })
        );

        return el;
    }

    private _openPicker(panel: IDockviewPanel, event: MouseEvent): void {
        const popupService = this.host.getPopupServiceForGroup(panel.group);
        const menu = document.createElement('div');
        menu.className = 'dv-channel-picker';
        menu.setAttribute('role', 'menu');

        const entries: Array<ChannelDefinition | undefined> = [
            ...this._options.channels,
            undefined,
        ];

        for (const channel of entries) {
            const item = document.createElement('button');
            item.className = 'dv-channel-picker-item';
            item.type = 'button';
            item.setAttribute('role', 'menuitem');

            const swatch = document.createElement('span');
            swatch.className = 'dv-channel-picker-swatch';
            if (channel === undefined) {
                swatch.classList.add('dv-channel-picker-swatch--none');
            } else {
                swatch.style.background = channel.color;
            }

            const label = document.createElement('span');
            label.textContent = channel?.name ?? 'None';

            item.appendChild(swatch);
            item.appendChild(label);

            if (this._membership.get(panel.id) === channel?.id) {
                item.classList.add('dv-channel-picker-item--selected');
                item.setAttribute('aria-checked', 'true');
            }

            item.addEventListener('click', () => {
                this.setChannel(panel.id, channel?.id);
                popupService.close();
            });

            menu.appendChild(item);
        }

        popupService.openPopover(menu, {
            x: event.clientX,
            y: event.clientY,
        });
    }
}

export const ChannelsModule = defineModule<'channelsService', IChannelsHost>({
    name: 'Channels',
    serviceKey: 'channelsService',
    create: (host) => new ChannelsService(host),
    init: (host, service) =>
        host.onDidRemovePanel((panel) => {
            // Membership and listeners must not outlive the panel.
            (service as ChannelsService).forget(panel.id);
        }),
});
