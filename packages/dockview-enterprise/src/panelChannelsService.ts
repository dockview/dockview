import {
    DockviewCompositeDisposable as CompositeDisposable,
    DockviewEmitter as Emitter,
    DockviewEvent as Event,
    DockviewGroupPanel,
    DockviewMutableDisposable as MutableDisposable,
    defineModule,
    IDockviewPanel,
    IPanelChannelsHost,
    IPanelChannelsService,
    PanelChannelContext,
    PanelChannelDefinition,
    PanelChannelMessage,
    PanelChannelTransport,
    resolveMessages,
    resolvePanelChannels,
} from 'dockview';

/**
 * The default transport: a synchronous in-process bus. A published message is
 * delivered to `onMessage` subscribers before `publish` returns.
 */
export class InProcessTransport implements PanelChannelTransport {
    private readonly _onMessage = new Emitter<PanelChannelMessage>();
    readonly onMessage: Event<PanelChannelMessage> = this._onMessage.event;

    publish(message: PanelChannelMessage): void {
        this._onMessage.fire(message);
    }

    dispose(): void {
        this._onMessage.dispose();
    }
}

/**
 * Keeps one group's header accent in step with its active panel's channel:
 * re-resolves on active-panel change and on that panel's own channel change,
 * and clears the accent when disposed (the group went away or the service
 * shut down).
 */
class HeaderAccentController extends CompositeDisposable {
    private readonly _activePanelChannel = new MutableDisposable();

    constructor(
        private readonly group: DockviewGroupPanel,
        private readonly resolve: (
            panel: IDockviewPanel | undefined
        ) => PanelChannelDefinition | undefined
    ) {
        super();
        this.addDisposables(
            this._activePanelChannel,
            group.model.onDidActivePanelChange(() => this._track())
        );
        this._track();
    }

    refresh(): void {
        this.group.model.header.setChannelAccent(
            this.resolve(this.group.activePanel)
        );
    }

    private _track(): void {
        const panel = this.group.activePanel;
        this._activePanelChannel.dispose();
        if (panel) {
            this._activePanelChannel.value = panel.api.onDidChannelChange(() =>
                this.refresh()
            );
        }
        this.refresh();
    }

    override dispose(): void {
        super.dispose();
        this.group.model.header.setChannelAccent(undefined);
    }
}

/**
 * Panel channels: one named colour channel per panel, with `broadcast` fanning
 * a context out to the channel's other members over a pluggable transport
 * (in-process by default). Membership follows `panel.channel`, mutated only
 * through the host's gated `setPanelChannel`, so this service observes rather
 * than decides: it tracks members in join order, retains each channel's last
 * context for replay on join and restore, and drives the group-header accent.
 * Dormant unless `panelChannels.enabled` is set (nothing joins without it).
 */
export class PanelChannelsService implements IPanelChannelsService {
    private readonly _host: IPanelChannelsHost;
    private readonly _disposable: CompositeDisposable;
    private readonly _transport: PanelChannelTransport;
    /** Whether the transport was created here (and so is disposed here). */
    private readonly _ownsTransport: boolean;

    /** channel id → members keyed by panel id, in join order. */
    private readonly _members = new Map<string, Map<string, IDockviewPanel>>();
    private readonly _lastContext = new Map<string, PanelChannelContext>();
    /** Broadcasts issued from inside a delivery, dispatched FIFO after it. */
    private readonly _queue: PanelChannelMessage[] = [];
    private _dispatching = false;
    private readonly _headers = new Map<
        DockviewGroupPanel,
        HeaderAccentController
    >();
    private _channels: readonly PanelChannelDefinition[];
    /** Channel ids already reported as unconfigured after an options change. */
    private readonly _warnedStaleChannels = new Set<string>();

    get channels(): readonly PanelChannelDefinition[] {
        return this._channels;
    }

    constructor(host: IPanelChannelsHost) {
        this._host = host;
        this._channels = resolvePanelChannels(host.options);

        const supplied = host.options.panelChannels?.transport;
        this._transport = supplied ?? new InProcessTransport();
        this._ownsTransport = !supplied;

        this._disposable = new CompositeDisposable(
            // The single fan-out path, whichever side published.
            this._transport.onMessage((message) => this._receive(message)),
            host.onDidPanelChannelChange((event) =>
                this._onMembershipChange(event.panel, event.channel)
            ),
            // A close is not a leave: prune the member, keep the contexts.
            host.onDidRemovePanel((panel) => this._forget(panel.id)),
            // A restore sets `panel.channel` directly (not via the gated
            // setter), so rebuild membership from the restored panels.
            host.onDidLayoutFromJSON(() => this._rebuildFromPanels()),
            host.onDidAddGroup((group) => {
                this._headers.set(
                    group,
                    new HeaderAccentController(group, this._accentFor)
                );
            }),
            host.onDidRemoveGroup((group) => {
                this._headers.get(group)?.dispose();
                this._headers.delete(group);
            }),
            host.onDidOptionsChange(() => this._onOptionsChange())
        );
    }

    getChannel(id: string): PanelChannelDefinition | undefined {
        return this._channels.find((channel) => channel.id === id);
    }

    getMembers(channelId: string): readonly IDockviewPanel[] {
        return [...(this._members.get(channelId)?.values() ?? [])];
    }

    getLastContext(channelId: string): PanelChannelContext | undefined {
        return this._lastContext.get(channelId);
    }

    broadcast(source: IDockviewPanel, context: PanelChannelContext): boolean {
        const channelId = source.channel;
        if (channelId === undefined) {
            return false;
        }
        this._transport.publish({
            channelId,
            context,
            sourcePanelId: source.id,
            originId: this._host.id,
        });
        return true;
    }

    broadcastToChannel(
        channelId: string,
        context: PanelChannelContext
    ): boolean {
        if (!this.getChannel(channelId)) {
            return false;
        }
        this._transport.publish({
            channelId,
            context,
            sourcePanelId: undefined,
            originId: this._host.id,
        });
        return true;
    }

    clearContexts(channelId?: string): void {
        if (channelId === undefined) {
            this._lastContext.clear();
        } else {
            this._lastContext.delete(channelId);
        }
    }

    dispose(): void {
        this._disposable.dispose();
        for (const header of this._headers.values()) {
            header.dispose();
        }
        this._headers.clear();
        this._members.clear();
        this._lastContext.clear();
        this._queue.length = 0;
        if (this._ownsTransport) {
            this._transport.dispose();
        }
    }

    /** The accent a group header shows for its active panel: the panel's
     *  channel, unless the header indicator is switched off. */
    private readonly _accentFor = (
        panel: IDockviewPanel | undefined
    ): PanelChannelDefinition | undefined => {
        if (this._host.options.panelChannels?.headerIndicator === false) {
            return undefined;
        }
        return panel?.channel === undefined
            ? undefined
            : this.getChannel(panel.channel);
    };

    private _onMembershipChange(
        panel: IDockviewPanel,
        channel: PanelChannelDefinition | undefined
    ): void {
        const messages = resolveMessages(this._host.options.messages);
        const title = panel.title ?? panel.id;

        this._forget(panel.id);
        if (!channel) {
            this._host.announce(messages.channelLeft(title));
            return;
        }

        this._join(channel.id, panel);
        this._host.announce(messages.channelJoined(title, channel.label));
        this._replay(panel, channel);
    }

    private _join(channelId: string, panel: IDockviewPanel): void {
        let members = this._members.get(channelId);
        if (!members) {
            members = new Map();
            this._members.set(channelId, members);
        }
        members.set(panel.id, panel);
    }

    private _forget(panelId: string): void {
        for (const members of this._members.values()) {
            members.delete(panelId);
        }
    }

    /** Deliver the channel's last context to one panel as a replay. */
    private _replay(
        panel: IDockviewPanel,
        channel: PanelChannelDefinition
    ): void {
        if (this._host.options.panelChannels?.replayLastContext === false) {
            return;
        }
        const context = this._lastContext.get(channel.id);
        if (!context) {
            return;
        }
        const event = { channel, context, source: undefined, replay: true };
        this._host.deliverContext(panel, event);
        this._host.fireDidChannelContext({ ...event, panels: [panel] });
    }

    private _rebuildFromPanels(): void {
        this._members.clear();
        const linked: [IDockviewPanel, PanelChannelDefinition][] = [];
        for (const panel of this._host.panels) {
            const channel =
                panel.channel === undefined
                    ? undefined
                    : this.getChannel(panel.channel);
            if (channel) {
                this._join(channel.id, panel);
                linked.push([panel, channel]);
            }
        }
        // Replay only once every member is registered, so a handler that reads
        // the membership during the replay sees the whole restored set.
        for (const [panel, channel] of linked) {
            this._replay(panel, channel);
        }
    }

    private _onOptionsChange(): void {
        this._channels = resolvePanelChannels(this._host.options);
        for (const panel of this._host.panels) {
            const id = panel.channel;
            if (
                id !== undefined &&
                !this.getChannel(id) &&
                !this._warnedStaleChannels.has(id)
            ) {
                this._warnedStaleChannels.add(id);
                console.warn(
                    `dockview: channel "${id}" is no longer configured; panels linked to it stay linked but receive no new contexts`
                );
            }
        }
        for (const header of this._headers.values()) {
            header.refresh();
        }
    }

    /** Serialise dispatches: a broadcast issued from inside a delivery handler
     *  waits for the current dispatch to finish, then runs in order. */
    private _receive(message: PanelChannelMessage): void {
        if (this._dispatching) {
            this._queue.push(message);
            return;
        }
        this._dispatching = true;
        try {
            this._dispatch(message);
            let next = this._queue.shift();
            while (next) {
                this._dispatch(next);
                next = this._queue.shift();
            }
        } finally {
            this._dispatching = false;
            this._queue.length = 0;
        }
    }

    private _dispatch(message: PanelChannelMessage): void {
        const channel = this.getChannel(message.channelId);
        if (!channel) {
            return;
        }
        // Retained before delivery so `getCurrentContext()` inside a handler
        // already reads the value being delivered.
        this._lastContext.set(channel.id, message.context);

        // Only a local source is excluded (and resolved to a panel): a foreign
        // component's panel ids are not ours.
        const local = message.originId === this._host.id;
        const sourceId = local ? message.sourcePanelId : undefined;
        const source =
            sourceId === undefined
                ? undefined
                : this._host.panels.find((panel) => panel.id === sourceId);
        const panels = this.getMembers(channel.id).filter(
            (panel) => panel.id !== sourceId
        );

        const event = {
            channel,
            context: message.context,
            source,
            replay: false,
        };
        for (const panel of panels) {
            this._host.deliverContext(panel, event);
        }
        this._host.fireDidChannelContext({ ...event, panels });
    }
}

export const PanelChannelsModule = defineModule<
    'panelChannelsService',
    IPanelChannelsHost
>({
    name: 'PanelChannels',
    options: ['panelChannels'],
    serviceKey: 'panelChannelsService',
    create: (host) => new PanelChannelsService(host),
});
