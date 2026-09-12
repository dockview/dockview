/**
 * Describes the environment dockview has been dropped into. A Tauri webview is
 * not a browser tab: the page can be served from a custom protocol, the engine
 * differs per platform, and the rules around opening additional windows are
 * the host's, not the browser's.
 */

import { getPopoutUrlError } from 'dockview';

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
 * dockview's own verdict on a popout URL, with the reason surfaced rather than
 * thrown. The guard wants the same scheme and host as the page, so a custom app
 * scheme qualifies: a macOS/Linux release build serves the app from
 * `tauri://localhost`, and `tauri://localhost/popout.html` is same-origin there.
 */
export function diagnosePopoutUrl(url = '/popout.html'): PopoutUrlDiagnosis {
    const page = globalThis.location;
    const error = getPopoutUrlError(url);

    let resolved: string;
    try {
        resolved = new URL(url, page.href).href;
    } catch {
        return { supported: false, url, reason: 'not a parsable URL' };
    }

    return error
        ? {
              supported: false,
              url: resolved,
              // the message names the rule; the URL is reported separately
              reason: error.message
                  .replace(/^dockview: /, '')
                  .replace(/; got: .*$/, ''),
          }
        : {
              supported: true,
              url: resolved,
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
