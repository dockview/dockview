import { DockviewPanelPlacement } from './options';

/** Throw for a placement combining fields that contradict each other. */
export function validatePanelPlacement(
    placement: DockviewPanelPlacement
): void {
    const hasTabGroup =
        placement.tabGroup !== undefined && placement.tabGroup !== null;
    if (hasTabGroup && placement.index !== undefined) {
        throw new Error(
            'dockview: index cannot be combined with tabGroup; use indexInTabGroup'
        );
    }
    if (!hasTabGroup && placement.indexInTabGroup !== undefined) {
        throw new Error('dockview: indexInTabGroup requires a tabGroup');
    }
}
