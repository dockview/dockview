import {
    DockviewAngularComponent,
    GridviewAngularComponent,
    PaneviewAngularComponent,
    SplitviewAngularComponent,
} from '../public-api';

describe('dockview-angular package', () => {
    it('should export all main components', () => {
        expect(DockviewAngularComponent).toBeDefined();
        expect(GridviewAngularComponent).toBeDefined();
        expect(PaneviewAngularComponent).toBeDefined();
        expect(SplitviewAngularComponent).toBeDefined();
    });
});
