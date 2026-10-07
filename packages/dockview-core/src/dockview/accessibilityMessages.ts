import { Position } from '../dnd/droptarget';

/**
 * The full set of localisable strings dockview speaks to assistive technology:
 * the LiveRegion announcements and the keyboard-docking narration. Each entry
 * returns the complete sentence so a translator owns wording *and* word order.
 *
 * Override any subset via the `messages` option; unset entries keep the
 * English defaults below. For fine-grained, per-event announcement overrides
 * (with access to the panel) use `getAnnouncement`, which takes precedence.
 */
export interface DockviewMessages {
    // --- LiveRegion announcements (the affected panel's title) ---
    panelOpened(title: string): string;
    panelClosed(title: string): string;
    groupMaximized(title: string): string;
    groupRestored(title: string): string;
    groupFloated(title: string): string;
    groupDocked(title: string): string;
    groupPoppedOut(title: string): string;

    // --- tab affordances ---
    /** Accessible name for a tab's close button, qualified with the panel title. */
    closeTab(title: string): string;
    /** Accessible name for a tab's close button when the panel has no title. */
    closeTabPlain(): string;

    // --- panel channels ---
    /** Heading of the context-menu channel picker. */
    channelLinkTo(): string;
    /** The context-menu item that unlinks a panel from its channel. */
    channelUnlink(): string;
    /** Accessible name of a tab's channel marker, qualified with the channel label. */
    channelIndicator(channel: string): string;
    /** A panel joined a channel. */
    channelJoined(title: string, channel: string): string;
    /** A panel left its channel. */
    channelLeft(title: string): string;

    // --- keyboard-docking narration ---
    /** Target phase: which group is highlighted, and how to proceed. */
    movePickTarget(
        source: string,
        target: string,
        current: number,
        total: number
    ): string;
    /** Edge phase: which drop position is selected, and how to proceed. */
    movePickEdge(position: Position, target: string): string;
    /** A move committed. */
    moveCommitted(source: string, target: string, position: Position): string;
    /** A move cancelled with Escape. */
    moveCancelled(): string;
    /** A move the layout rejected. */
    moveNotAllowed(): string;
    /** The panel was floated as a terminal move action. */
    moveFloated(source: string): string;
}

/** Where a drop position lands, phrased for the *edge prompt*. */
function edgeWhere(position: Position, target: string): string {
    return position === 'center'
        ? `Tab into ${target}`
        : `Split ${position} of ${target}`;
}

/** Where a drop position landed, phrased for the *commit* sentence. */
function committedWhere(position: Position, target: string): string {
    return position === 'center'
        ? `docked into ${target}`
        : `split ${position} of ${target}`;
}

export const DEFAULT_MESSAGES: DockviewMessages = {
    panelOpened: (title) => `${title} opened`,
    panelClosed: (title) => `${title} closed`,
    groupMaximized: (title) => `${title} maximized`,
    groupRestored: (title) => `${title} restored`,
    groupFloated: (title) => `${title} floated`,
    groupDocked: (title) => `${title} docked`,
    groupPoppedOut: (title) => `${title} opened in a new window`,

    closeTab: (title) => `Close ${title}`,
    closeTabPlain: () => `Close`,

    channelLinkTo: () => `Link to`,
    channelUnlink: () => `Unlink`,
    channelIndicator: (channel) => `Linked to ${channel}`,
    channelJoined: (title, channel) => `${title} linked to ${channel}`,
    channelLeft: (title) => `${title} unlinked`,

    movePickTarget: (source, target, current, total) =>
        `Moving ${source}. Target ${target}, ${current} of ${total}. Enter to choose where, Escape to cancel.`,
    movePickEdge: (position, target) =>
        `${edgeWhere(position, target)}. Arrows to change, Enter to confirm, Escape to go back.`,
    moveCommitted: (source, target, position) =>
        `${source} ${committedWhere(position, target)}.`,
    moveCancelled: () => `Move cancelled.`,
    moveNotAllowed: () => `That move is not allowed.`,
    moveFloated: (source) => `${source} floated.`,
};

/** Merge an app's partial overrides over the English defaults. */
export function resolveMessages(
    overrides?: Partial<DockviewMessages>
): DockviewMessages {
    return overrides ? { ...DEFAULT_MESSAGES, ...overrides } : DEFAULT_MESSAGES;
}
