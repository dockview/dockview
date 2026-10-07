import { IDisposable } from '../lifecycle';
import { Event } from '../events';
import { toggleClass } from '../dom';
import { IDockviewPanel } from './dockviewPanel';
import { DockviewComponentOptions, PanelChannelDefinition } from './options';

/**
 * A context broadcast over a panel channel: a plain JSON object with a `type`
 * discriminator (FDC3-shaped). Contexts are treated as immutable; the same
 * object is handed to every receiver and retained as the channel's last value.
 */
export interface PanelChannelContext {
    type: string;
    [key: string]: unknown;
}

/** Delivered to a member panel's `api.onDidReceiveContext`. */
export interface PanelChannelContextEvent {
    readonly channel: PanelChannelDefinition;
    readonly context: PanelChannelContext;
    /** The panel that broadcast, or `undefined` for `api.broadcastToChannel`
     *  and for a replay of a context that was not panel-originated. */
    readonly source: IDockviewPanel | undefined;
    /** `true` when delivered as the channel's last value on join / restore
     *  rather than as a live broadcast. */
    readonly replay: boolean;
}

/** The wire shape a {@link PanelChannelTransport} carries. */
export interface PanelChannelMessage {
    readonly channelId: string;
    readonly context: PanelChannelContext;
    readonly sourcePanelId: string | undefined;
    /** The id of the component that published the message. */
    readonly originId: string;
}

/**
 * The message bus a channel broadcast rides on. The default transport is
 * in-process (synchronous); supply your own via `panelChannels.transport` to
 * bridge channels across windows or processes.
 */
export interface PanelChannelTransport extends IDisposable {
    publish(message: PanelChannelMessage): void;
    readonly onMessage: Event<PanelChannelMessage>;
}

/** The built-in channel set, used when `panelChannels.channels` is unset. */
export const DEFAULT_PANEL_CHANNELS: readonly PanelChannelDefinition[] = [
    { id: 'red', label: 'Red', color: 'var(--dv-channel-color-red)' },
    { id: 'orange', label: 'Orange', color: 'var(--dv-channel-color-orange)' },
    { id: 'yellow', label: 'Yellow', color: 'var(--dv-channel-color-yellow)' },
    { id: 'green', label: 'Green', color: 'var(--dv-channel-color-green)' },
    { id: 'cyan', label: 'Cyan', color: 'var(--dv-channel-color-cyan)' },
    { id: 'blue', label: 'Blue', color: 'var(--dv-channel-color-blue)' },
    {
        id: 'magenta',
        label: 'Magenta',
        color: 'var(--dv-channel-color-magenta)',
    },
    { id: 'purple', label: 'Purple', color: 'var(--dv-channel-color-purple)' },
];

/** The configured channel list (`panelChannels.channels`), or the defaults. */
export function resolvePanelChannels(
    options: DockviewComponentOptions
): readonly PanelChannelDefinition[] {
    return options.panelChannels?.channels ?? DEFAULT_PANEL_CHANNELS;
}

/**
 * Reflect a channel on an element: `className` and `data-channel` while
 * `channelId` is set, plus `--dv-channel-color` while the channel is still
 * configured (an unconfigured id keeps the class and attribute but drops the
 * colour). A custom property rather than a colour property, because the IDL
 * colour setters reject `var(...)` in some environments (jsdom included); the
 * SCSS reads it at use time.
 */
export function applyChannelAttributes(
    element: HTMLElement,
    className: string,
    channelId: string | undefined,
    channel: PanelChannelDefinition | undefined
): void {
    toggleClass(element, className, channelId !== undefined);
    if (channelId === undefined) {
        delete element.dataset.channel;
    } else {
        element.dataset.channel = channelId;
    }
    if (channel) {
        element.style.setProperty('--dv-channel-color', channel.color);
    } else {
        element.style.removeProperty('--dv-channel-color');
    }
}

/** The configured channel with `id`, or `undefined` when unknown or unset. */
export function findPanelChannel(
    options: DockviewComponentOptions,
    id: string | undefined
): PanelChannelDefinition | undefined {
    if (id === undefined) {
        return undefined;
    }
    return resolvePanelChannels(options).find((entry) => entry.id === id);
}
