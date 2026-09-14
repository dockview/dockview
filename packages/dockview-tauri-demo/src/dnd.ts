export type DndStrategy = 'auto' | 'html5' | 'pointer';

/**
 * dockview's default, `'auto'`: HTML5 drag-and-drop for mouse input, pointer
 * events for touch and pen. HTML5 is the only backend whose drag crosses
 * windows - it rides an OS drag session - so a tab can travel between a
 * popout and the main window; pointer events stop at the window edge.
 * `?dnd=pointer` or `?dnd=html5` (or `VITE_DND` at build time) forces a
 * backend so each can be measured on its own per host.
 */
export function resolveDndStrategy(): DndStrategy {
    const requested =
        new URLSearchParams(location.search).get('dnd') ??
        import.meta.env.VITE_DND;
    return requested === 'pointer' || requested === 'html5'
        ? requested
        : 'auto';
}
