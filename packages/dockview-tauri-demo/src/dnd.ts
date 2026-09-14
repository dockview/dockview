export type DndStrategy = 'auto' | 'html5' | 'pointer';

/**
 * `?dnd=pointer` or `?dnd=html5` (or `VITE_DND` at build time) forces a backend
 * so each can be measured on its own per host; otherwise dockview's default
 * `'auto'`, which only an HTML5 drag can leave the window with.
 */
export function resolveDndStrategy(): DndStrategy {
    const requested =
        new URLSearchParams(location.search).get('dnd') ??
        import.meta.env.VITE_DND;
    return requested === 'pointer' || requested === 'html5'
        ? requested
        : 'auto';
}
