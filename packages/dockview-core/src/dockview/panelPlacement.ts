import { DockviewPanelPlacement } from './options';
import { ITabGroup } from './tabGroup';

/** A {@link DockviewPanelPlacement} as dockview applies it. */
export interface ResolvedPanelPlacement {
    readonly index?: number;
    readonly tabGroup?: ITabGroup | string;
    readonly indexInTabGroup?: number;
}

/** Resolve a placement, throwing for `index` combined with `at`. */
export function resolvePanelPlacement(
    placement: DockviewPanelPlacement
): ResolvedPanelPlacement {
    const { at, index } = placement;
    if (at !== undefined && index !== undefined) {
        throw new Error('dockview: index cannot be combined with at');
    }
    if (at === undefined) {
        return { index };
    }
    if (at.tabGroup !== undefined) {
        return { tabGroup: at.tabGroup, indexInTabGroup: at.index };
    }
    return { index: at.index };
}
