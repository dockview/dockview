/**
 * Describes the environment dockview has been dropped into. A Tauri webview is
 * not a browser tab: the page can be served from a custom protocol, the engine
 * differs per platform, and the rules around opening additional windows are
 * the host's, not the browser's.
 */

export type WebviewEngine =
    | 'WKWebView'
    | 'WebKitGTK'
    | 'WebView2'
    | 'Blink'
    | 'Gecko'
    | 'unknown';

export interface HostReport {
    runtime: 'tauri' | 'browser';
    engine: WebviewEngine;
    href: string;
    origin: string;
    protocol: string;
    secureContext: boolean;
    userAgent: string;
    /** Whether dockview would accept this origin as a popout target. */
    popout: PopoutUrlDiagnosis;
}

export interface PopoutUrlDiagnosis {
    supported: boolean;
    url: string;
    reason: string;
}

export function isTauri(): boolean {
    return '__TAURI_INTERNALS__' in globalThis || '__TAURI__' in globalThis;
}

export function detectEngine(userAgent: string): WebviewEngine {
    if (/Edg\//.test(userAgent)) {
        return 'WebView2';
    }
    if (/Firefox\//.test(userAgent)) {
        return 'Gecko';
    }
    if (/Chrome\//.test(userAgent)) {
        return 'Blink';
    }
    if (/AppleWebKit\//.test(userAgent)) {
        // Tauri's Linux runtime reports a WebKitGTK build of Safari's UA; the
        // macOS one does not mention Linux.
        return /Linux|X11/.test(userAgent) ? 'WebKitGTK' : 'WKWebView';
    }
    return 'unknown';
}

/**
 * Mirrors dockview's internal `assertSameOriginPopoutUrl` guard so the demo can
 * report *why* a popout would be refused instead of only surfacing the throw.
 *
 * The guard requires a same-origin `http:`/`https:` URL. That holds under
 * `tauri dev` (the webview loads the Vite dev server over http) and under
 * Windows/Android release builds (`http://tauri.localhost`), but not under
 * macOS/Linux release builds, which serve the app from `tauri://localhost`.
 */
export function diagnosePopoutUrl(url = '/popout.html'): PopoutUrlDiagnosis {
    let resolved: URL;

    try {
        resolved = new URL(url, globalThis.location.href);
    } catch {
        return { supported: false, url, reason: 'not a parsable URL' };
    }

    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        return {
            supported: false,
            url: resolved.href,
            reason: `protocol "${resolved.protocol}" is not http(s) — dockview refuses popouts from custom protocols`,
        };
    }

    if (resolved.origin !== globalThis.location.origin) {
        return {
            supported: false,
            url: resolved.href,
            reason: `cross-origin with the host page (${globalThis.location.origin})`,
        };
    }

    return {
        supported: true,
        url: resolved.href,
        reason: 'same-origin http(s)',
    };
}

export function readHostReport(): HostReport {
    const userAgent = globalThis.navigator.userAgent;

    return {
        runtime: isTauri() ? 'tauri' : 'browser',
        engine: detectEngine(userAgent),
        href: globalThis.location.href,
        origin: globalThis.location.origin,
        protocol: globalThis.location.protocol,
        secureContext: globalThis.isSecureContext,
        userAgent,
        popout: diagnosePopoutUrl(),
    };
}
