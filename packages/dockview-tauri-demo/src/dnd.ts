/**
 * Pointer events by default: WebKitGTK and WKWebView implement HTML5
 * drag-and-drop only partly - a drag starts, but the drop targets never
 * light up, so a tab cannot be docked. `?dnd=html5` (or `VITE_DND=html5` at
 * build time) switches backends so that claim can be re-measured per host.
 */
export function resolveDndStrategy(): 'html5' | 'pointer' {
    return new URLSearchParams(location.search).get('dnd') === 'html5' ||
        import.meta.env.VITE_DND === 'html5'
        ? 'html5'
        : 'pointer';
}
