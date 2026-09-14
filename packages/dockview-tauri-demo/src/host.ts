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
 * Mirrors dockview's internal `getPopoutUrlError` guard so the demo can report
 * *why* a popout would be refused instead of only surfacing the throw.
 *
 * The guard requires the URL to be same-origin with the page by scheme and
 * host, and refuses the `javascript:`, `data:`, `blob:`, `vbscript:` and
 * `file:` schemes outright. A custom app scheme qualifies: a macOS/Linux
 * release build serves the app from `tauri://localhost`, and a popout at
 * `tauri://localhost/popout.html` is same-origin with it.
 */
const UNSAFE_PROTOCOLS = new Set([
    'javascript:',
    'data:',
    'blob:',
    'vbscript:',
    'file:',
]);

export function diagnosePopoutUrl(url = '/popout.html'): PopoutUrlDiagnosis {
    let resolved: URL;

    try {
        resolved = new URL(url, globalThis.location.href);
    } catch {
        return { supported: false, url, reason: 'not a parsable URL' };
    }

    if (UNSAFE_PROTOCOLS.has(resolved.protocol)) {
        return {
            supported: false,
            url: resolved.href,
            reason: `protocol "${resolved.protocol}" would run in the opener's context`,
        };
    }

    const page = globalThis.location;
    if (resolved.protocol !== page.protocol || resolved.host !== page.host) {
        return {
            supported: false,
            url: resolved.href,
            reason: `cross-origin with the host page (${page.protocol}//${page.host})`,
        };
    }

    return {
        supported: true,
        url: resolved.href,
        reason: `same-origin (${page.protocol}//${page.host})`,
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
