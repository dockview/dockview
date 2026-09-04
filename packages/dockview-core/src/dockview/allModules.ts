import { DockviewModule } from './modules';
import { FloatingGroupModule } from './floatingGroupService';
import { PopoutWindowModule } from './popoutWindowService';
import { WatermarkModule } from './watermarkService';
import { EdgeGroupModule } from './edgeGroupService';
import { RootDropTargetModule } from './rootDropTargetService';
import { HeaderActionsModule } from './headerActionsService';
import { LiveRegionModule } from './liveRegionService';
import { AdvancedDnDModule } from './advancedDnDService';
import { TabGroupChipsModule } from './tabGroupChipsService';
import { ContextMenuModule } from './contextMenuService';

/**
 * Internal list of the built-in modules that ship with the core. Registered
 * automatically by DockviewComponent at construction time; not exported from
 * the package. Additional modules contributed by sibling packages (via
 * `registerModules(...)`) are appended at construction.
 */
export const AllModules: DockviewModule<any>[] = [
    FloatingGroupModule,
    PopoutWindowModule,
    WatermarkModule,
    EdgeGroupModule,
    RootDropTargetModule,
    HeaderActionsModule,
    LiveRegionModule,
    AdvancedDnDModule,
    TabGroupChipsModule,
    ContextMenuModule,
];
