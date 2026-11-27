import { DockviewPanelPlacement, TabStripTarget } from './options';
import { ITabGroup } from './tabGroup';

/**
 * The place a {@link DockviewPanelPlacement} asks for: `at`, or `{ index }`
 * for the `index` shorthand; `undefined` for neither. Throws for `index`
 * combined with `at`.
 */
export function resolvePanelPlacement(
    placement: DockviewPanelPlacement
): TabStripTarget | undefined {
    const { at, index } = placement;
    if (at !== undefined && index !== undefined) {
        throw new Error('dockview: index cannot be combined with at');
    }
    if (at === undefined) {
        return index === undefined ? undefined : { index };
    }
    return at;
}

/** The tab group `at` names, if any. */
export function tabGroupOfTarget<G extends ITabGroup | string>(
    at: TabStripTarget<G> | undefined
): G | undefined {
    return at?.tabGroup ?? undefined;
}

/** The flat index `at` names, if it is a top-level place. */
export function flatIndexOfTarget(
    at: TabStripTarget<ITabGroup | string> | undefined
): number | undefined {
    return tabGroupOfTarget(at) === undefined ? at?.index : undefined;
}
