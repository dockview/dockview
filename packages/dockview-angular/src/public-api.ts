/*
 * Public API Surface of dockview-angular
 */

// Re-export everything from dockview (which re-exports dockview-core)
export * from 'dockview';

// Angular module
export * from './lib/dockview-angular.module';

// Components
export * from './lib/dockview/dockview-angular.component';
export * from './lib/gridview/gridview-angular.component';
export * from './lib/paneview/paneview-angular.component';
export * from './lib/splitview/splitview-angular.component';

// Types
export {
    DockviewAngularOptions,
    DockviewAngularEvents,
    IDockviewAngularPanelProps,
    IDockviewAngularPanelHeaderProps,
    IDockviewAngularWatermarkProps,
    IDockviewAngularHeaderActionsProps,
} from './lib/dockview/types';
export { IDockviewAngularTabGroupChipProps } from './lib/dockview/angular-tab-group-chip-renderer';
export { IDockviewAngularGroupDragGhostProps } from './lib/dockview/angular-group-drag-ghost-renderer';
export {
    GridviewAngularOptions,
    GridviewAngularEvents,
    GridviewAngularReadyEvent,
} from './lib/gridview/types';
export {
    PaneviewAngularOptions,
    PaneviewAngularEvents,
    PaneviewAngularReadyEvent,
} from './lib/paneview/types';
export {
    SplitviewAngularOptions,
    SplitviewAngularEvents,
    SplitviewAngularReadyEvent,
} from './lib/splitview/types';

// Utilities
export * from './lib/utils/angular-renderer';
export * from './lib/utils/component-factory';
export * from './lib/utils/lifecycle-utils';
