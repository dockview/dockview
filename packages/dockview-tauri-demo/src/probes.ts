/**
 * Runtime probes for the two mechanisms dockview's popout groups depend on:
 * `window.open` returning a handle, and that handle's document being
 * script-accessible so panel DOM can be moved into it.
 */

export interface ProbeResult {
    ok: boolean;
    title: string;
    detail: string;
}

const PROBE_TARGET = 'dockview-tauri-probe';

export function probeWindowOpen(url = '/popout.html'): ProbeResult {
    let handle: Window | null;

    try {
        handle = globalThis.open(url, PROBE_TARGET, 'width=420,height=320');
    } catch (err) {
        return {
            ok: false,
            title: 'window.open threw',
            detail: describe(err),
        };
    }

    if (!handle) {
        return {
            ok: false,
            title: 'window.open returned null',
            detail: 'The host blocked the popup or routed the URL elsewhere (Tauri may hand it to the system browser). dockview treats this as a blocked popup and keeps the group docked.',
        };
    }

    try {
        // The move-the-DOM approach needs more than a handle: the opener has to
        // reach into the new document.
        const doc = handle.document;
        const reachable = !!doc?.body;
        handle.close();

        return reachable
            ? {
                  ok: true,
                  title: 'window.open is scriptable',
                  detail: 'The opener can reach the new window’s document, so dockview can move panel DOM into it.',
              }
            : {
                  ok: false,
                  title: 'window opened without a reachable document',
                  detail: 'A handle came back but it has no body to adopt panels into.',
              };
    } catch (err) {
        handle.close();
        return {
            ok: false,
            title: 'new window is not scriptable',
            detail: `${describe(err)} — the window exists in a separate context, so dockview cannot adopt panel DOM into it.`,
        };
    }
}

export function describe(err: unknown): string {
    if (err instanceof Error) {
        return `${err.name}: ${err.message}`;
    }
    return String(err);
}
