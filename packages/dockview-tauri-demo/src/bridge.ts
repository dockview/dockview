/**
 * Thin wrapper over the Tauri IPC surface. Every entry point is lazy and
 * degrades to a no-op in a plain browser so the same build can be compared
 * side by side in Chrome and in the desktop shell.
 */

import { isTauri } from './host';

export const LAYOUT_EVENT = 'dockview:layout';

export interface NativeHostInfo {
    tauriVersion: string;
    webviewVersion: string;
    platform: string;
    arch: string;
    /**
     * Whether the running platform serves the app over `http(s)` in release
     * builds. Where it does not, dockview's popout guard rejects the URL.
     */
    httpOrigin: boolean;
}

export interface LayoutBroadcast {
    from: string;
    layout: unknown;
}

export async function windowLabel(): Promise<string> {
    if (!isTauri()) {
        return 'browser';
    }
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow().label;
}

export async function nativeHostInfo(): Promise<NativeHostInfo | null> {
    if (!isTauri()) {
        return null;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<NativeHostInfo>('host_info');
}

/**
 * Asks Rust to build a second native window running this same app. The new
 * webview is a separate context — it shares no JavaScript heap with this one,
 * which is exactly the isolation dockview's DOM-moving popouts cannot cross.
 */
export async function openNativeWindow(label: string): Promise<void> {
    if (!isTauri()) {
        throw new Error('native windows require the Tauri shell');
    }
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_dock_window', { label });
}

export async function broadcastLayout(
    from: string,
    layout: unknown
): Promise<void> {
    if (!isTauri()) {
        throw new Error('broadcasting requires the Tauri shell');
    }
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('broadcast_layout', { from, layout });
}

export async function onLayoutBroadcast(
    handler: (payload: LayoutBroadcast) => void
): Promise<() => void> {
    if (!isTauri()) {
        return () => {
            /* nothing subscribed */
        };
    }
    const { listen } = await import('@tauri-apps/api/event');
    return listen<LayoutBroadcast>(LAYOUT_EVENT, (event) =>
        handler(event.payload)
    );
}
