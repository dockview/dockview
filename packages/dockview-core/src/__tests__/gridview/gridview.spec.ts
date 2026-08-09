import { Emitter, Event } from '../../events';
import { BranchNode } from '../../gridview/branchNode';
import {
    Gridview,
    IGridView,
    IViewSize,
    SerializedGridview,
    getGridLocation,
    orthogonal,
} from '../../gridview/gridview';
import { Orientation, Sizing } from '../../splitview/splitview';

class MockGridview implements IGridView {
    minimumWidth: number = 0;
    maximumWidth: number = Number.MAX_VALUE;
    minimumHeight: number = 0;
    maximumHeight: number = Number.MAX_VALUE;
    onDidChange: Event<IViewSize | undefined> = new Emitter<
        IViewSize | undefined
    >().event;
    element: HTMLElement = document.createElement('div');
    isVisible: boolean = true;
    width: number = 0;
    height: number = 0;

    constructor(private id?: string) {
        this.element.className = 'mock-grid-view';
        this.element.id = `${id ?? ''}`;
    }

    layout(width: number, height: number): void {
        this.width = width;
        this.height = height;
    }

    toJSON(): object {
        if (this.id) {
            return { id: this.id };
        }
        return {};
    }
}

describe('gridview', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
    });

    test('dispose of gridview', () => {
        expect(container.childNodes).toHaveLength(0);

        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );

        container.appendChild(gridview.element);

        expect(container.childNodes).toHaveLength(1);

        gridview.dispose();

        expect(container.childNodes).toHaveLength(0);
    });

    test('maximumWidth and maximumHeight return their respective axis', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view = new MockGridview();
        view.maximumWidth = 500;
        view.maximumHeight = Number.MAX_VALUE;

        gridview.addView(view, Sizing.Distribute, [0]);

        expect(gridview.maximumWidth).toBe(500);
        expect(gridview.maximumHeight).toBe(Number.MAX_VALUE);
    });

    test('a nested branch with all children hidden round-trips hidden, not visible at size 0', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        gridview.addView(new MockGridview(), Sizing.Distribute, [0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1]);
        // split the [1] leaf into a nested branch of two leaves
        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0]);

        // hide both children of the nested branch → the branch auto-hides
        gridview.setViewVisible([1, 0], false);
        gridview.setViewVisible([1, 1], false);

        const serialized = gridview.serialize();
        const branch = (serialized.root as any).data[1];
        expect(branch.type).toBe('branch');
        // branch carries its visibility + cached size
        expect(branch.visible).toBe(false);
        expect(branch.size).toBeGreaterThan(0);

        // round-trip into a fresh gridview; the branch must load hidden, so
        // re-serializing preserves visible:false (rather than a visible size-0
        // branch that no longer round-trips)
        const restored = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        restored.layout(1000, 1000);
        restored.deserialize(serialized, {
            fromJSON: () => new MockGridview(),
        });

        const reserialized = restored.serialize();
        const restoredBranch = (reserialized.root as any).data[1];
        expect(restoredBranch.type).toBe('branch');
        expect(restoredBranch.visible).toBe(false);
        expect(restoredBranch.size).toBeGreaterThan(0);
    });

    test('insertOrthogonalSplitviewAtRoot #1', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        gridview.addView(new MockGridview(), Sizing.Distribute, [0]);

        gridview.insertOrthogonalSplitviewAtRoot();

        gridview.addView(new MockGridview(), Sizing.Distribute, [1]);

        gridview.addView(new MockGridview(), Sizing.Distribute, [0, 1]);

        function checkOrientationFlipsAtEachLevel(root: BranchNode) {
            const orientation = root.orientation;
            const orthogonalOrientation = orthogonal(orientation);

            for (const child of root.children) {
                if (child.orientation !== orthogonalOrientation) {
                    fail('child cannot have the same orientation as parent');
                }
                if (child instanceof BranchNode) {
                    checkOrientationFlipsAtEachLevel(child);
                }
            }
        }

        checkOrientationFlipsAtEachLevel((gridview as any).root as BranchNode);
    });

    test('insertOrthogonalSplitviewAtRoot #2', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        gridview.addView(new MockGridview(), Sizing.Distribute, [0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1]);

        gridview.insertOrthogonalSplitviewAtRoot();

        gridview.addView(new MockGridview(), Sizing.Distribute, [1]);

        function checkOrientationFlipsAtEachLevel(root: BranchNode) {
            const orientation = root.orientation;
            const orthogonalOrientation = orthogonal(orientation);

            for (const child of root.children) {
                if (child.orientation !== orthogonalOrientation) {
                    fail('child cannot have the same orientation as parent');
                }
                if (child instanceof BranchNode) {
                    checkOrientationFlipsAtEachLevel(child);
                }
            }
        }

        checkOrientationFlipsAtEachLevel((gridview as any).root as BranchNode);
    });

    test('removeView: remove leaf from branch where branch becomes leaf and parent is root', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        gridview.addView(new MockGridview(), Sizing.Distribute, [0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1]);

        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0]);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: [
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                        ],
                        size: 500,
                        type: 'branch',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(3);

        gridview.removeView([1, 0], Sizing.Distribute);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(2);
    });

    test('removeView: remove leaf from branch where branch remains branch and parent is root', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        gridview.addView(new MockGridview(), Sizing.Distribute, [0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1]);

        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 1]);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: [
                            {
                                data: {},
                                size: 333,
                                type: 'leaf',
                            },
                            {
                                data: {},
                                size: 333,
                                type: 'leaf',
                            },
                            {
                                data: {},
                                size: 334,
                                type: 'leaf',
                            },
                        ],
                        size: 500,
                        type: 'branch',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(4);

        gridview.removeView([1, 0], Sizing.Distribute);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: [
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                        ],
                        size: 500,
                        type: 'branch',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(3);
    });

    test('removeView: remove leaf where parent is root', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        gridview.addView(new MockGridview(), Sizing.Distribute, [0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1]);

        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0]);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: [
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                        ],
                        size: 500,
                        type: 'branch',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(3);

        gridview.removeView([0], Sizing.Distribute);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'VERTICAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(2);
    });

    test('removeView: remove leaf from branch where branch becomes leaf and parent is not root', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        gridview.addView(new MockGridview(), Sizing.Distribute, [0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1]);

        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0, 0]);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: [
                            {
                                data: [
                                    {
                                        data: {},
                                        size: 250,
                                        type: 'leaf',
                                    },
                                    {
                                        data: {},
                                        size: 250,
                                        type: 'leaf',
                                    },
                                ],
                                size: 500,
                                type: 'branch',
                            },
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                        ],
                        size: 500,
                        type: 'branch',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(4);

        gridview.removeView([1, 0, 0], Sizing.Distribute);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: [
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                        ],
                        size: 500,
                        type: 'branch',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(3);
    });

    test('removeView: remove leaf from branch where branch remains branch and parent is not root', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        gridview.addView(new MockGridview(), Sizing.Distribute, [0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1]);

        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0, 0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0, 1]);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: [
                            {
                                data: [
                                    {
                                        data: {},
                                        size: 166,
                                        type: 'leaf',
                                    },
                                    {
                                        data: {},
                                        size: 166,
                                        type: 'leaf',
                                    },
                                    {
                                        data: {},
                                        size: 168,
                                        type: 'leaf',
                                    },
                                ],
                                size: 500,
                                type: 'branch',
                            },
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                        ],
                        size: 500,
                        type: 'branch',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(5);

        gridview.removeView([1, 0, 1], Sizing.Distribute);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: [
                            {
                                data: [
                                    {
                                        data: {},
                                        size: 250,
                                        type: 'leaf',
                                    },
                                    {
                                        data: {},
                                        size: 250,
                                        type: 'leaf',
                                    },
                                ],
                                size: 500,
                                type: 'branch',
                            },
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                        ],
                        size: 500,
                        type: 'branch',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(4);
    });

    test('removeView: remove leaf where parent is root', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        gridview.addView(new MockGridview(), Sizing.Distribute, [0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1]);

        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0, 0]);
        gridview.addView(new MockGridview(), Sizing.Distribute, [1, 0, 1]);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: [
                            {
                                data: [
                                    {
                                        data: {},
                                        size: 166,
                                        type: 'leaf',
                                    },
                                    {
                                        data: {},
                                        size: 166,
                                        type: 'leaf',
                                    },
                                    {
                                        data: {},
                                        size: 168,
                                        type: 'leaf',
                                    },
                                ],
                                size: 500,
                                type: 'branch',
                            },
                            {
                                data: {},
                                size: 500,
                                type: 'leaf',
                            },
                        ],
                        size: 500,
                        type: 'branch',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(5);

        gridview.removeView([1, 1], Sizing.Distribute);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [
                    {
                        data: {},
                        size: 500,
                        type: 'leaf',
                    },
                    {
                        data: {},
                        size: 166,
                        type: 'leaf',
                    },
                    {
                        data: {},
                        size: 166,
                        type: 'leaf',
                    },
                    {
                        data: {},
                        size: 168,
                        type: 'leaf',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
        expect(
            gridview.element.querySelectorAll('.mock-grid-view')
        ).toHaveLength(4);
    });

    test('that calling insertOrthogonalSplitviewAtRoot() for an empty view doesnt add any nodes', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'HORIZONTAL',
            root: {
                data: [],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });

        gridview.insertOrthogonalSplitviewAtRoot();

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'VERTICAL',
            root: {
                data: [],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });
    });

    test('re-structuring deep gridivew where a branchnode becomes of length one and is coverted to a leaf node', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        const view3 = new MockGridview('3');
        const view4 = new MockGridview('4');
        const view5 = new MockGridview('5');
        const view6 = new MockGridview('6');

        gridview.addView(view1, Sizing.Distribute, [0]);

        gridview.addView(view2, Sizing.Distribute, [1]);
        gridview.addView(view3, Sizing.Distribute, [1, 0]);
        gridview.addView(view4, Sizing.Distribute, [1, 1, 0]);
        gridview.addView(view5, Sizing.Distribute, [1, 1, 0, 0]);
        gridview.addView(view6, Sizing.Distribute, [1, 1, 0, 0, 0]);

        let el = gridview.element.querySelectorAll('.mock-grid-view');
        expect(el).toHaveLength(6);

        gridview.remove(view2);

        el = gridview.element.querySelectorAll('.mock-grid-view');
        expect(el).toHaveLength(5);
    });

    test('gridview nested proportional layouts', () => {
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        const view3 = new MockGridview('3');
        const view4 = new MockGridview('4');
        const view5 = new MockGridview('5');
        const view6 = new MockGridview('6');

        gridview.addView(view1, Sizing.Distribute, [0]);
        gridview.addView(view2, Sizing.Distribute, [1]);
        gridview.addView(view3, Sizing.Distribute, [1, 1]);
        gridview.addView(view4, Sizing.Distribute, [1, 1, 0]);
        gridview.addView(view5, Sizing.Distribute, [1, 1, 0, 0]);
        gridview.addView(view6, Sizing.Distribute, [1, 1, 0, 0, 0]);

        const views = [view1, view2, view3, view4, view5, view6];

        const dimensions = [
            { width: 500, height: 1000 },
            { width: 500, height: 500 },
            { width: 250, height: 500 },
            { width: 250, height: 250 },
            { width: 125, height: 250 },
            { width: 125, height: 250 },
        ];

        expect(
            views.map((view) => ({
                width: view.width,
                height: view.height,
            }))
        ).toEqual(dimensions);

        gridview.layout(2000, 1500);

        expect(
            views.map((view) => ({
                width: view.width,
                height: view.height,
            }))
        ).toEqual(
            dimensions.map(({ width, height }) => ({
                width: width * 2,
                height: height * 1.5,
            }))
        );

        gridview.layout(200, 2000);

        expect(
            views.map((view) => ({
                width: view.width,
                height: view.height,
            }))
        ).toEqual(
            dimensions.map(({ width, height }) => ({
                width: width * 0.2,
                height: height * 2,
            }))
        );
    });

    test('that maximizeView retains original dimensions when restored', () => {
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        let counter = 0;
        const subscription = gridview.onDidMaximizedNodeChange(() => {
            counter++;
        });

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        const view3 = new MockGridview('3');
        const view4 = new MockGridview('4');
        const view5 = new MockGridview('5');
        const view6 = new MockGridview('6');

        gridview.addView(view1, Sizing.Distribute, [0]);
        gridview.addView(view2, Sizing.Distribute, [1]);
        gridview.addView(view3, Sizing.Distribute, [1, 1]);
        gridview.addView(view4, Sizing.Distribute, [1, 1, 0]);
        gridview.addView(view5, Sizing.Distribute, [1, 1, 0, 0]);
        gridview.addView(view6, Sizing.Distribute, [1, 1, 0, 0, 0]);

        /**
         *   _____________________________________________
         *  |                     |                       |
         *  |                     |           2           |
         *  |                     |                       |
         *  |          1          |_______________________|
         *  |                     |         |      4      |
         *  |                     |    3    |_____________|
         *  |                     |         |   5  |   6  |
         *  |_____________________|_________|______|______|
         */

        const views = [view1, view2, view3, view4, view5, view6];

        const dimensions = [
            { width: 500, height: 1000 },
            { width: 500, height: 500 },
            { width: 250, height: 500 },
            { width: 250, height: 250 },
            { width: 125, height: 250 },
            { width: 125, height: 250 },
        ];

        function assertLayout() {
            expect(
                views.map((view) => ({
                    width: view.width,
                    height: view.height,
                }))
            ).toEqual(dimensions);
        }

        assertLayout();
        expect(gridview.hasMaximizedView()).toBeFalsy();
        expect(counter).toBe(0);

        /**
         * maximize each view individually and then return to the standard view
         * checking on each iteration that the original layout dimensions
         * are restored
         */
        for (let i = 0; i < views.length; i++) {
            const view = views[i];

            gridview.maximizeView(view);
            expect(counter).toBe(i * 2 + 1);
            expect(gridview.hasMaximizedView()).toBeTruthy();
            gridview.exitMaximizedView();
            expect(counter).toBe(i * 2 + 2);
            assertLayout();
        }

        subscription.dispose();
    });

    test('that maximizedView is exited when a views visibility is changed', () => {
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        const view3 = new MockGridview('3');

        gridview.addView(view1, Sizing.Distribute, [0]);
        gridview.addView(view2, Sizing.Distribute, [1]);
        gridview.addView(view3, Sizing.Distribute, [1, 1]);

        expect(gridview.hasMaximizedView()).toBeFalsy();
        gridview.maximizeView(view2);
        expect(gridview.hasMaximizedView()).toBeTruthy();

        gridview.setViewVisible([0], true);
        expect(gridview.hasMaximizedView()).toBeFalsy();
    });

    test('that maximizedView is exited when a view is moved', () => {
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        const view3 = new MockGridview('3');
        const view4 = new MockGridview('4');

        gridview.addView(view1, Sizing.Distribute, [0]);
        gridview.addView(view2, Sizing.Distribute, [1]);
        gridview.addView(view3, Sizing.Distribute, [1, 1]);
        gridview.addView(view4, Sizing.Distribute, [1, 1, 0]);

        expect(gridview.hasMaximizedView()).toBeFalsy();
        gridview.maximizeView(view2);
        expect(gridview.hasMaximizedView()).toBeTruthy();

        gridview.moveView([1, 1], 0, 1);
        expect(gridview.hasMaximizedView()).toBeFalsy();
    });

    test('that maximizedView is exited when a view is added', () => {
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        const view3 = new MockGridview('3');
        const view4 = new MockGridview('4');

        gridview.addView(view1, Sizing.Distribute, [0]);
        gridview.addView(view2, Sizing.Distribute, [1]);
        gridview.addView(view3, Sizing.Distribute, [1, 1]);

        expect(gridview.hasMaximizedView()).toBeFalsy();
        gridview.maximizeView(view2);
        expect(gridview.hasMaximizedView()).toBeTruthy();

        gridview.addView(view4, Sizing.Distribute, [1, 1, 0]);
        expect(gridview.hasMaximizedView()).toBeFalsy();
    });

    test('that maximizedView is exited when a view is removed', () => {
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        const view3 = new MockGridview('3');

        gridview.addView(view1, Sizing.Distribute, [0]);
        gridview.addView(view2, Sizing.Distribute, [1]);
        gridview.addView(view3, Sizing.Distribute, [1, 1]);

        expect(gridview.hasMaximizedView()).toBeFalsy();
        gridview.maximizeView(view2);
        expect(gridview.hasMaximizedView()).toBeTruthy();

        gridview.removeView([1, 1]);
        expect(gridview.hasMaximizedView()).toBeFalsy();
    });

    test('that maximizedView is cleared when layout is cleared', () => {
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        const view3 = new MockGridview('3');

        gridview.addView(view1, Sizing.Distribute, [0]);
        gridview.addView(view2, Sizing.Distribute, [1]);
        gridview.addView(view3, Sizing.Distribute, [1, 1]);

        expect(gridview.hasMaximizedView()).toBeFalsy();
        gridview.maximizeView(view2);
        expect(gridview.hasMaximizedView()).toBeTruthy();

        gridview.clear();

        expect(gridview.hasMaximizedView()).toBeFalsy();
    });

    test('that maximizedView is cleared when layout is disposed', () => {
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        const view3 = new MockGridview('3');

        gridview.addView(view1, Sizing.Distribute, [0]);
        gridview.addView(view2, Sizing.Distribute, [1]);
        gridview.addView(view3, Sizing.Distribute, [1, 1]);

        expect(gridview.hasMaximizedView()).toBeFalsy();
        gridview.maximizeView(view2);
        expect(gridview.hasMaximizedView()).toBeTruthy();

        gridview.dispose();

        expect(gridview.hasMaximizedView()).toBeFalsy();
    });

    test('that maximizedView is cleared when layout is reset', () => {
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        const view3 = new MockGridview('3');

        gridview.addView(view1, Sizing.Distribute, [0]);
        gridview.addView(view2, Sizing.Distribute, [1]);
        gridview.addView(view3, Sizing.Distribute, [1, 1]);

        expect(gridview.hasMaximizedView()).toBeFalsy();
        gridview.maximizeView(view2);
        expect(gridview.hasMaximizedView()).toBeTruthy();

        gridview.deserialize(
            {
                height: 1000,
                width: 1000,
                root: {
                    type: 'leaf',
                    data: [],
                },
                orientation: Orientation.HORIZONTAL,
            },
            {
                fromJSON: (data) => {
                    return new MockGridview('');
                },
            }
        );

        expect(gridview.hasMaximizedView()).toBeFalsy();
    });

    test('visibility check', () => {
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        const view3 = new MockGridview('3');
        const view4 = new MockGridview('4');
        const view5 = new MockGridview('5');
        const view6 = new MockGridview('6');

        gridview.addView(view1, Sizing.Distribute, [0]);
        gridview.addView(view2, Sizing.Distribute, [1]);
        gridview.addView(view3, Sizing.Distribute, [1, 1]);
        gridview.addView(view4, Sizing.Distribute, [1, 1, 0]);
        gridview.addView(view5, Sizing.Distribute, [1, 1, 0, 0]);
        gridview.addView(view6, Sizing.Distribute, [1, 1, 0, 0, 0]);

        /**
         *   _____________________________________________
         *  |                     |                       |
         *  |                     |           2           |
         *  |                     |                       |
         *  |          1          |_______________________|
         *  |                     |         |      4      |
         *  |                     |    3    |_____________|
         *  |                     |         |   5  |   6  |
         *  |_____________________|_________|______|______|
         */

        function assertVisibility(visibility: boolean[]) {
            expect(gridview.isViewVisible(getGridLocation(view1.element))).toBe(
                visibility[0]
            );
            expect(gridview.isViewVisible(getGridLocation(view2.element))).toBe(
                visibility[1]
            );
            expect(gridview.isViewVisible(getGridLocation(view3.element))).toBe(
                visibility[2]
            );
            expect(gridview.isViewVisible(getGridLocation(view4.element))).toBe(
                visibility[3]
            );
            expect(gridview.isViewVisible(getGridLocation(view5.element))).toBe(
                visibility[4]
            );
            expect(gridview.isViewVisible(getGridLocation(view6.element))).toBe(
                visibility[5]
            );
        }

        assertVisibility([true, true, true, true, true, true]);

        gridview.setViewVisible(getGridLocation(view5.element), false);
        assertVisibility([true, true, true, true, false, true]);

        gridview.setViewVisible(getGridLocation(view4.element), false);
        assertVisibility([true, true, true, false, false, true]);

        gridview.setViewVisible(getGridLocation(view1.element), false);
        assertVisibility([false, true, true, false, false, true]);

        gridview.setViewVisible(getGridLocation(view2.element), false);
        assertVisibility([false, false, true, false, false, true]);

        gridview.setViewVisible(getGridLocation(view3.element), false);
        assertVisibility([false, false, false, false, false, true]);

        gridview.setViewVisible(getGridLocation(view6.element), false);
        assertVisibility([false, false, false, false, false, false]);

        gridview.setViewVisible(getGridLocation(view1.element), true);
        assertVisibility([true, false, false, false, false, false]);

        gridview.setViewVisible(getGridLocation(view5.element), true);
        assertVisibility([true, false, false, false, true, false]);

        gridview.setViewVisible(getGridLocation(view6.element), true);
        assertVisibility([true, false, false, false, true, true]);

        gridview.setViewVisible(getGridLocation(view2.element), true);
        assertVisibility([true, true, false, false, true, true]);

        gridview.setViewVisible(getGridLocation(view3.element), true);
        assertVisibility([true, true, true, false, true, true]);

        gridview.setViewVisible(getGridLocation(view4.element), true);
        assertVisibility([true, true, true, true, true, true]);
    });

    describe('normalize', () => {
        test('should normalize after structure correctly', () => {
            // Since gridview already normalizes during remove operations,
            // we'll test the method directly with known scenarios
            const gridview = new Gridview(
                false,
                { separatorBorder: '' },
                Orientation.HORIZONTAL
            );
            gridview.layout(1000, 1000);

            const view1 = new MockGridview('1');
            const view2 = new MockGridview('2');

            gridview.addView(view1, Sizing.Distribute, [0]);
            gridview.addView(view2, Sizing.Distribute, [1]);

            const beforeNormalize = gridview.serialize();

            // Normalize should not change a balanced structure
            gridview.normalize();

            const afterNormalize = gridview.serialize();
            expect(afterNormalize).toEqual(beforeNormalize);
            expect(
                gridview.element.querySelectorAll('.mock-grid-view')
            ).toHaveLength(2);
        });

        test('should not normalize when root has single leaf child', () => {
            const gridview = new Gridview(
                false,
                { separatorBorder: '' },
                Orientation.HORIZONTAL
            );
            gridview.layout(1000, 1000);

            const view1 = new MockGridview('1');
            gridview.addView(view1, Sizing.Distribute, [0]);

            const beforeNormalize = gridview.serialize();

            gridview.normalize();

            const afterNormalize = gridview.serialize();

            expect(afterNormalize).toEqual(beforeNormalize);
        });

        test('should not normalize when root has multiple children', () => {
            const gridview = new Gridview(
                false,
                { separatorBorder: '' },
                Orientation.HORIZONTAL
            );
            gridview.layout(1000, 1000);

            const view1 = new MockGridview('1');
            const view2 = new MockGridview('2');
            const view3 = new MockGridview('3');

            gridview.addView(view1, Sizing.Distribute, [0]);
            gridview.addView(view2, Sizing.Distribute, [1]);
            gridview.addView(view3, Sizing.Distribute, [2]);

            const beforeNormalize = gridview.serialize();

            gridview.normalize();

            const afterNormalize = gridview.serialize();

            // Structure should remain unchanged since root has multiple children
            expect(afterNormalize).toEqual(beforeNormalize);
        });

        test('should not normalize when no root exists', () => {
            const gridview = new Gridview(
                false,
                { separatorBorder: '' },
                Orientation.HORIZONTAL
            );
            gridview.layout(1000, 1000);

            expect(() => gridview.normalize()).not.toThrow();

            // Should still be able to add views after normalizing empty gridview
            const view1 = new MockGridview('1');
            gridview.addView(view1, Sizing.Distribute, [0]);

            expect(
                gridview.element.querySelectorAll('.mock-grid-view')
            ).toHaveLength(1);
        });

        test('normalize method exists and is callable', () => {
            const gridview = new Gridview(
                false,
                { separatorBorder: '' },
                Orientation.HORIZONTAL
            );
            gridview.layout(1000, 1000);

            expect(typeof gridview.normalize).toBe('function');
            expect(() => gridview.normalize()).not.toThrow();
        });
    });

    test('that serialize does not cause an onDidMaximizedNodeChange event', () => {
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        let counter = 0;
        const subscription = gridview.onDidMaximizedNodeChange(() => {
            counter++;
        });

        gridview.serialize();

        expect(counter).toBe(0);

        subscription.dispose();
    });

    test('that calling serialize from within an onDidMaximizedNodeChange listener does not stack overflow when a view is maximized', () => {
        // regression for #1074: serialize() previously fired
        // onDidMaximizedNodeChange while toggling maximize state internally,
        // which caused infinite recursion if a listener re-entered serialize().
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(1000, 1000);

        const view1 = new MockGridview('1');
        const view2 = new MockGridview('2');
        gridview.addView(view1, Sizing.Distribute, [0]);
        gridview.addView(view2, Sizing.Distribute, [1]);

        gridview.maximizeView(view1);

        let invocations = 0;
        const subscription = gridview.onDidMaximizedNodeChange(() => {
            invocations++;
            gridview.serialize();
        });

        expect(() => gridview.serialize()).not.toThrow();
        expect(invocations).toBe(0);

        subscription.dispose();
    });
});
