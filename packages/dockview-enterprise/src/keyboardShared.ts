import { DockviewComponentOptions, KeyboardNavigationOptions } from 'dockview';

/**
 * Marks (on the dockview root element) that a keyboard move is in progress, so
 * the default navigation listener stands down while the advanced docking module
 * drives the keys. A neutral DOM signal keeps the two listeners coordinated
 * without either service holding a reference to the other.
 */
export const KEYBOARD_MOVE_ATTRIBUTE = 'data-dv-kbd-moving';

/**
 * Does `e` match a binding string like `'ctrl+]'` / `'shift+f6'`? Modifiers are
 * matched exactly (a binding without `shift` will not fire while Shift is held),
 * and the final part is compared to `KeyboardEvent.key`, lower-cased.
 */
export function matchesBinding(e: KeyboardEvent, binding: string): boolean {
    const parts = binding.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const mods = parts.slice(0, -1);
    return (
        e.ctrlKey === mods.includes('ctrl') &&
        e.shiftKey === mods.includes('shift') &&
        e.altKey === mods.includes('alt') &&
        e.metaKey === (mods.includes('meta') || mods.includes('cmd')) &&
        e.key.toLowerCase() === key
    );
}

/**
 * Resolve the `keyboardNavigation` opt-in to its options object, or `undefined`
 * when keyboard support is off. Both keyboard modules read the same opt-in.
 */
export function readKeyboardNavigation(
    options: DockviewComponentOptions
): KeyboardNavigationOptions | undefined {
    const opt = options.keyboardNavigation;
    if (!opt) {
        return undefined;
    }
    return opt === true ? {} : opt;
}
