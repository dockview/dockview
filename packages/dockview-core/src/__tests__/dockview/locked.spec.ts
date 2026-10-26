import { DockviewComponent } from '../../dockview/dockviewComponent';
import { IContentRenderer } from '../../dockview/types';
import { setupMockWindow } from '../__mocks__/mockWindow';

class TestPanel implements IContentRenderer {
    element = document.createElement('div');
    init(): void {
        // noop
    }
    layout(): void {
        // noop
    }
    dispose(): void {
        // noop
    }
}

/**
 * `locked` stops the user resizing groups with the sashes between them. The
 * main grid disables its branch splitviews; the same has to reach every other
 * splitview the user can grab a sash in - the shell that hosts the edge groups
 * and the nested gridviews of floating and popout windows (#1671).
 */
describe('dockview locked option', () => {
    const DISABLED = 'dv-splitview-disabled';

    const originalOpen = window.open;

    afterEach(() => {
        window.open = originalOpen;
        jest.useRealTimers();
    });

    function createDockview(locked: boolean | undefined): DockviewComponent {
        const container = document.createElement('div');
        const dockview = new DockviewComponent(container, {
            createComponent: () => new TestPanel(),
            ...(locked === undefined ? {} : { locked }),
        });

        dockview.layout(1000, 600);

        dockview.addPanel({ id: 'panel_1', component: 'default' });
        dockview.addPanel({
            id: 'panel_2',
            component: 'default',
            position: { referencePanel: 'panel_1', direction: 'right' },
        });

        return dockview;
    }

    function isDisabled(element: Element | null | undefined): boolean {
        expect(element).toBeTruthy();
        return element!.classList.contains(DISABLED);
    }

    /** The splitview of the main grid's root branch. */
    function gridSplitview(dockview: DockviewComponent): Element | null {
        return dockview.element.querySelector(
            '.dv-branch-node > .dv-split-view-container'
        );
    }

    describe('edge groups', () => {
        /**
         * The shell's two splitviews: the outer one hosts the left/right edge
         * groups and the middle column's hosts the top/bottom ones.
         */
        function shellSplitviews(dockview: DockviewComponent): {
            outer: Element | null;
            middle: Element | null;
        } {
            const shell = dockview.rootElement;
            expect(shell).toBeTruthy();
            return {
                outer: shell.querySelector(':scope > .dv-split-view-container'),
                middle: shell.querySelector(
                    '.dv-shell-middle-column > .dv-split-view-container'
                ),
            };
        }

        test('is unlocked by default', () => {
            const dockview = createDockview(undefined);
            dockview.addEdgeGroup('left', { id: 'left', initialSize: 250 });
            dockview.addEdgeGroup('top', { id: 'top', initialSize: 100 });

            const { outer, middle } = shellSplitviews(dockview);
            expect(isDisabled(gridSplitview(dockview))).toBe(false);
            expect(isDisabled(outer)).toBe(false);
            expect(isDisabled(middle)).toBe(false);

            dockview.dispose();
        });

        test('locked: true disables the edge-group sashes along with the grid', () => {
            const dockview = createDockview(true);
            dockview.addEdgeGroup('left', { id: 'left', initialSize: 250 });
            dockview.addEdgeGroup('top', { id: 'top', initialSize: 100 });

            const { outer, middle } = shellSplitviews(dockview);
            expect(isDisabled(gridSplitview(dockview))).toBe(true);
            expect(isDisabled(outer)).toBe(true);
            expect(isDisabled(middle)).toBe(true);

            dockview.dispose();
        });

        test('updateOptions toggles the edge-group sashes at runtime', () => {
            const dockview = createDockview(undefined);
            dockview.addEdgeGroup('right', { id: 'right', initialSize: 250 });
            dockview.addEdgeGroup('bottom', {
                id: 'bottom',
                initialSize: 100,
            });

            const { outer, middle } = shellSplitviews(dockview);

            dockview.updateOptions({ locked: true });

            expect(dockview.locked).toBe(true);
            expect(isDisabled(gridSplitview(dockview))).toBe(true);
            expect(isDisabled(outer)).toBe(true);
            expect(isDisabled(middle)).toBe(true);

            // e.g. a React prop going from `true` to `undefined`
            dockview.updateOptions({ locked: undefined });

            expect(dockview.locked).toBe(false);
            expect(isDisabled(gridSplitview(dockview))).toBe(false);
            expect(isDisabled(outer)).toBe(false);
            expect(isDisabled(middle)).toBe(false);

            dockview.dispose();
        });

        test('the locked setter reaches the edge groups like updateOptions does', () => {
            const dockview = createDockview(undefined);
            dockview.addEdgeGroup('left', { id: 'left', initialSize: 250 });
            dockview.addEdgeGroup('top', { id: 'top', initialSize: 100 });

            const { outer, middle } = shellSplitviews(dockview);

            dockview.locked = true;

            expect(isDisabled(gridSplitview(dockview))).toBe(true);
            expect(isDisabled(outer)).toBe(true);
            expect(isDisabled(middle)).toBe(true);

            dockview.locked = false;

            expect(isDisabled(gridSplitview(dockview))).toBe(false);
            expect(isDisabled(outer)).toBe(false);
            expect(isDisabled(middle)).toBe(false);

            dockview.dispose();
        });

        test('an unrelated updateOptions leaves the lock untouched', () => {
            const dockview = createDockview(true);
            dockview.addEdgeGroup('left', { id: 'left', initialSize: 250 });

            dockview.updateOptions({ hideBorders: true });

            const { outer } = shellSplitviews(dockview);
            expect(isDisabled(gridSplitview(dockview))).toBe(true);
            expect(isDisabled(outer)).toBe(true);

            dockview.dispose();
        });
    });

    describe('floating and popout windows', () => {
        function createFloatingSplit(
            locked: boolean | undefined
        ): DockviewComponent {
            const dockview = createDockview(locked);

            const panel3 = dockview.addPanel({
                id: 'panel_3',
                component: 'default',
                floating: true,
            });

            // split panel_2's group into the floating window beside panel_3
            dockview.moveGroupOrPanel({
                from: { groupId: dockview.getGroupPanel('panel_2')!.group.id },
                to: { group: panel3.group, position: 'right' },
            });

            return dockview;
        }

        function floatingGridview(dockview: DockviewComponent) {
            const gridview = dockview.getGridviewForGroup(
                dockview.getGroupPanel('panel_3')!.group
            );
            expect(gridview).toBe(dockview.floatingGroups[0].gridview);
            return gridview;
        }

        test('a floating window is unlocked by default', () => {
            const dockview = createFloatingSplit(undefined);

            const gridview = floatingGridview(dockview);
            expect(gridview.locked).toBe(false);
            expect(
                isDisabled(
                    gridview.element.querySelector(
                        '.dv-branch-node > .dv-split-view-container'
                    )
                )
            ).toBe(false);

            dockview.dispose();
        });

        test('a floating window created while locked is locked', () => {
            const dockview = createFloatingSplit(true);

            const gridview = floatingGridview(dockview);
            expect(gridview.locked).toBe(true);
            expect(
                isDisabled(
                    gridview.element.querySelector(
                        '.dv-branch-node > .dv-split-view-container'
                    )
                )
            ).toBe(true);

            dockview.dispose();
        });

        test('updateOptions reaches an open floating window', () => {
            const dockview = createFloatingSplit(undefined);

            const gridview = floatingGridview(dockview);
            const splitview = gridview.element.querySelector(
                '.dv-branch-node > .dv-split-view-container'
            );

            dockview.updateOptions({ locked: true });

            expect(gridview.locked).toBe(true);
            expect(isDisabled(splitview)).toBe(true);

            dockview.updateOptions({ locked: false });

            expect(gridview.locked).toBe(false);
            expect(isDisabled(splitview)).toBe(false);

            dockview.dispose();
        });

        test('the locked setter reaches an open floating window', () => {
            const dockview = createFloatingSplit(undefined);

            const gridview = floatingGridview(dockview);

            dockview.locked = true;

            expect(gridview.locked).toBe(true);

            dockview.locked = false;

            expect(gridview.locked).toBe(false);

            dockview.dispose();
        });

        test('a floating window restored by fromJSON while locked is locked', () => {
            const dockview = createFloatingSplit(undefined);
            const json = dockview.toJSON();
            expect(json.floatingGroups).toHaveLength(1);

            dockview.updateOptions({ locked: true });
            dockview.fromJSON(json);

            expect(dockview.floatingGroups).toHaveLength(1);
            expect(floatingGridview(dockview).locked).toBe(true);

            dockview.dispose();
        });

        test('a popout window locked while its restore is pending opens locked', async () => {
            jest.useFakeTimers();
            window.open = () => setupMockWindow();

            const dockview = createDockview(undefined);
            const panel1 = dockview.getGroupPanel('panel_1')!;
            const panel2 = dockview.getGroupPanel('panel_2')!;

            await dockview.addPopoutGroup(panel1);
            // split panel_2's group into the popout -> 2-group popout window
            dockview.moveGroupOrPanel({
                from: { groupId: panel2.group.id },
                to: { group: panel1.group, position: 'right' },
            });

            const state = dockview.toJSON();
            expect(state.popoutGroups![0].grid).toBeDefined();

            dockview.clear();
            dockview.fromJSON(state);

            // fromJSON built the popout gridview synchronously but the window
            // only opens on a timer; the lock lands in between
            dockview.updateOptions({ locked: true });

            jest.advanceTimersByTime(500);
            await dockview.popoutRestorationPromise;

            const restored = dockview.getGroupPanel('panel_1')!;
            expect(restored.api.location.type).toBe('popout');
            expect(dockview.getGridviewForGroup(restored.group).locked).toBe(
                true
            );

            dockview.dispose();
        });

        test('popout windows follow the option, at creation and at runtime', async () => {
            window.open = () => setupMockWindow();

            const dockview = createDockview(true);
            const panel2 = dockview.getGroupPanel('panel_2')!;

            await dockview.addPopoutGroup(panel2);

            const gridview = dockview.getGridviewForGroup(panel2.group);
            expect(gridview).not.toBe(
                dockview.getGridviewForGroup(
                    dockview.getGroupPanel('panel_1')!.group
                )
            );
            expect(gridview.locked).toBe(true);

            dockview.updateOptions({ locked: false });

            expect(gridview.locked).toBe(false);

            dockview.updateOptions({ locked: true });

            expect(gridview.locked).toBe(true);

            dockview.dispose();
        });
    });
});
