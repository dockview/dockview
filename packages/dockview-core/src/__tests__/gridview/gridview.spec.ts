import { Emitter, Event } from '../../events';
import { BranchNode } from '../../gridview/branchNode';
import {
    Gridview,
    IGridView,
    ISerializedBranchNode,
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

    test('a hidden view is laid out at zero under a margin', () => {
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.margin = 10;
        gridview.layout(1000, 1000);

        const views = [
            new MockGridview(),
            new MockGridview(),
            new MockGridview(),
        ];
        gridview.addView(views[0], Sizing.Distribute, [0]);
        gridview.addView(views[1], Sizing.Distribute, [1]);
        gridview.addView(views[2], Sizing.Distribute, [2]);

        gridview.setViewVisible([1], false);

        expect(views[1].width).toBe(0);
        // the two visible views share the one margin left between them
        expect(views[0].width + views[2].width).toBe(1000 - 10);
        gridview.dispose();
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

    describe('hidden views survive tree restructuring', () => {
        function createGridview(): Gridview {
            const gridview = new Gridview(
                false,
                { separatorBorder: '' },
                Orientation.HORIZONTAL
            );
            gridview.layout(1000, 1000);
            return gridview;
        }

        function isVisible(gridview: Gridview, view: MockGridview): boolean {
            return gridview.isViewVisible(getGridLocation(view.element));
        }

        test('flipping the orientation keeps a hidden view hidden', () => {
            const gridview = createGridview();
            const views = [
                new MockGridview(),
                new MockGridview(),
                new MockGridview(),
            ];
            gridview.addView(views[0], Sizing.Distribute, [0]);
            gridview.addView(views[1], Sizing.Distribute, [1]);
            gridview.addView(views[2], Sizing.Distribute, [2]);

            gridview.setViewVisible([1], false);
            gridview.orientation = Orientation.VERTICAL;

            expect(isVisible(gridview, views[1])).toBe(false);

            gridview.setViewVisible(getGridLocation(views[1].element), true);
            expect(views[1].height).toBeGreaterThan(0);
        });

        test('normalize() keeps a hidden view hidden', () => {
            const gridview = createGridview();
            const views = [new MockGridview(), new MockGridview()];
            gridview.addView(views[0], Sizing.Distribute, [0]);
            gridview.addView(views[1], Sizing.Distribute, [1]);
            gridview.insertOrthogonalSplitviewAtRoot();

            gridview.setViewVisible([0, 1], false);
            gridview.normalize();

            expect(isVisible(gridview, views[1])).toBe(false);

            gridview.setViewVisible(getGridLocation(views[1].element), true);
            expect(views[1].width).toBeGreaterThan(0);
        });

        test('removing a view keeps a hidden view hidden when its branch is merged into the grandparent', () => {
            const gridview = createGridview();
            const [first, removed, hidden, last] = [
                new MockGridview(),
                new MockGridview(),
                new MockGridview(),
                new MockGridview(),
            ];
            gridview.addView(first, Sizing.Distribute, [0]);
            gridview.addView(removed, Sizing.Distribute, [1]);
            gridview.addView(hidden, Sizing.Distribute, [1, 1]);
            gridview.addView(last, Sizing.Distribute, [1, 1, 1]);

            gridview.setViewVisible(getGridLocation(hidden.element), false);
            gridview.removeView(getGridLocation(removed.element));

            expect(isVisible(gridview, hidden)).toBe(false);

            gridview.setViewVisible(getGridLocation(hidden.element), true);
            expect(hidden.width).toBeGreaterThan(0);
        });

        test('flipping the orientation keeps the cached size of a view nested under a hidden branch', () => {
            const gridview = createGridview();
            const [a, b, c, d] = [
                new MockGridview(),
                new MockGridview(),
                new MockGridview(),
                new MockGridview(),
            ];
            // root(H) -> [a, P(V) -> [b, Q(H) -> [c, d]]]
            gridview.addView(a, Sizing.Distribute, [0]);
            gridview.addView(b, Sizing.Distribute, [1]);
            gridview.addView(c, Sizing.Distribute, [1, 1]);
            gridview.addView(d, Sizing.Distribute, [1, 1, 1]);

            // hiding every child of P hides P itself, so Q is laid out at 0
            gridview.setViewVisible(getGridLocation(c.element), false);
            gridview.setViewVisible(getGridLocation(d.element), false);
            gridview.setViewVisible(getGridLocation(b.element), false);
            expect(isVisible(gridview, c)).toBe(false);

            gridview.orientation = Orientation.VERTICAL;

            expect(isVisible(gridview, b)).toBe(false);
            expect(isVisible(gridview, c)).toBe(false);
            expect(isVisible(gridview, d)).toBe(false);

            // the cached sizes must survive the flip rather than being scaled to 0
            const root = gridview.serialize().root as ISerializedBranchNode;
            const q = root.data[1] as ISerializedBranchNode;
            const qChildren = (q.data[1] as ISerializedBranchNode).data;
            expect(qChildren[0].size).toBeGreaterThan(0);
            expect(qChildren[1].size).toBeGreaterThan(0);

            // show a sibling first so `c` cannot be rescued by filling empty space
            gridview.setViewVisible(getGridLocation(b.element), true);
            gridview.setViewVisible(getGridLocation(d.element), true);
            gridview.setViewVisible(getGridLocation(c.element), true);

            expect(c.width).toBeGreaterThan(0);
            expect(c.height).toBeGreaterThan(0);
        });

        test('removing a view keeps the children of a hidden sibling branch hidden when merged into the grandparent', () => {
            const gridview = createGridview();
            const [a, removed, x, y] = [
                new MockGridview(),
                new MockGridview(),
                new MockGridview(),
                new MockGridview(),
            ];
            // root(H) -> [a, P(V) -> [removed, S(H) -> [x, y]]]
            gridview.addView(a, Sizing.Distribute, [0]);
            gridview.addView(removed, Sizing.Distribute, [1]);
            gridview.addView(x, Sizing.Distribute, [1, 1]);
            gridview.addView(y, Sizing.Distribute, [1, 1, 1]);

            // hide the branch S as a whole, its children stay visible within it
            gridview.setViewVisible([1, 1], false);
            expect(gridview.isViewVisible([1, 1])).toBe(false);

            gridview.removeView(getGridLocation(removed.element));

            // S is flattened into the root; x and y must not reappear
            expect(isVisible(gridview, x)).toBe(false);
            expect(isVisible(gridview, y)).toBe(false);
            expect(a.width).toBe(1000);

            gridview.setViewVisible(getGridLocation(x.element), true);
            expect(isVisible(gridview, x)).toBe(true);
            expect(x.width).toBeGreaterThan(0);
        });
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

    test('removeView: remove nested leaf collapsing its parent branch', () => {
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

    test('removeView: collapsing a branch whose surviving sibling branch contains branches keeps sizes', () => {
        // root V[A, H1[B, V2[C, H3[D, E]]]] - removing B collapses H1 and
        // promotes V2's children (a leaf and a branch) into the root. The
        // promoted branch H3 must keep its extent along the root axis, not
        // its own-axis extent.
        const gridview = new Gridview(
            true,
            { separatorBorder: '' },
            Orientation.VERTICAL
        );
        gridview.layout(1000, 1000);

        const a = new MockGridview('A');
        const b = new MockGridview('B');
        const c = new MockGridview('C');
        const d = new MockGridview('D');
        const e = new MockGridview('E');

        gridview.addView(a, Sizing.Distribute, [0]);
        gridview.addView(b, Sizing.Distribute, [1]);
        gridview.addView(c, Sizing.Distribute, [1, 1]);
        gridview.addView(d, Sizing.Distribute, [1, 1, 1]);
        gridview.addView(e, Sizing.Distribute, [1, 1, 1, 1]);

        expect(a.height).toBe(500);
        expect(c.height).toBe(250);
        expect(d.height).toBe(250);
        expect(e.height).toBe(250);

        gridview.removeView([1, 0], Sizing.Distribute);

        expect(gridview.serialize()).toEqual({
            height: 1000,
            orientation: 'VERTICAL',
            root: {
                data: [
                    { data: { id: 'A' }, size: 500, type: 'leaf' },
                    { data: { id: 'C' }, size: 250, type: 'leaf' },
                    {
                        data: [
                            { data: { id: 'D' }, size: 500, type: 'leaf' },
                            { data: { id: 'E' }, size: 500, type: 'leaf' },
                        ],
                        size: 250,
                        type: 'branch',
                    },
                ],
                size: 1000,
                type: 'branch',
            },
            width: 1000,
        });

        expect(a.height).toBe(500);
        expect(c.height).toBe(250);
        expect(d.height).toBe(250);
        expect(e.height).toBe(250);
        expect(d.width).toBe(500);
        expect(e.width).toBe(500);
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
        test('the promoted branch keeps its proportions (#1692)', () => {
            const gridview = new Gridview(
                true,
                { separatorBorder: '' },
                Orientation.VERTICAL
            );
            gridview.layout(900, 600);

            const view1 = new MockGridview('1');
            const view2 = new MockGridview('2');
            const view3 = new MockGridview('3');

            // a vertical root whose only child is a horizontal row of three
            gridview.addView(view1, Sizing.Distribute, [0]);
            gridview.addView(view2, Sizing.Distribute, [0, 1]);
            gridview.addView(view3, Sizing.Distribute, [0, 2]);

            const views = [view1, view2, view3];
            expect(views.map((v) => v.width)).toEqual([300, 300, 300]);

            // the row is cloned into the root position
            gridview.normalize();
            expect(gridview.orientation).toBe(Orientation.HORIZONTAL);
            expect(gridview).toHaveLength(3);

            gridview.layout(600, 600);
            expect(views.map((v) => v.width)).toEqual([200, 200, 200]);

            gridview.layout(900, 600);
            expect(views.map((v) => v.width)).toEqual([300, 300, 300]);
        });

        test('a flipped grid keeps the proportions of its rebuilt branches (#1692)', () => {
            const gridview = new Gridview(
                true,
                { separatorBorder: '' },
                Orientation.HORIZONTAL
            );
            gridview.layout(900, 600);

            const view1 = new MockGridview('1');
            const view2 = new MockGridview('2');
            const view3 = new MockGridview('3');

            gridview.addView(view1, Sizing.Distribute, [0]);
            gridview.addView(view2, Sizing.Distribute, [1]);
            gridview.addView(view3, Sizing.Distribute, [2]);

            const views = [view1, view2, view3];
            expect(views.map((v) => v.width)).toEqual([300, 300, 300]);

            // the whole tree is rebuilt with the axes transposed
            gridview.orientation = Orientation.VERTICAL;
            expect(views.map((v) => v.height)).toEqual([200, 200, 200]);

            gridview.layout(900, 300);
            expect(views.map((v) => v.height)).toEqual([100, 100, 100]);

            gridview.layout(900, 600);
            expect(views.map((v) => v.height)).toEqual([200, 200, 200]);
        });

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

        test('promotes a branch child whose children include branches without resizing them', () => {
            // root H[V[A, H[B, C], D]] - after normalize the root is the
            // vertical branch and its children must keep their heights.
            const gridview = new Gridview(
                false,
                { separatorBorder: '' },
                Orientation.HORIZONTAL
            );
            gridview.layout(1000, 1000);

            const views = new Map<string, MockGridview>();
            const view = (id: string): MockGridview =>
                views.get(id) as MockGridview;
            gridview.deserialize(
                {
                    height: 1000,
                    width: 1000,
                    orientation: Orientation.HORIZONTAL,
                    root: {
                        type: 'branch',
                        size: 1000,
                        data: [
                            {
                                type: 'branch',
                                size: 1000,
                                data: [
                                    {
                                        type: 'leaf',
                                        size: 300,
                                        data: { id: 'A' },
                                    },
                                    {
                                        type: 'branch',
                                        size: 500,
                                        data: [
                                            {
                                                type: 'leaf',
                                                size: 500,
                                                data: { id: 'B' },
                                            },
                                            {
                                                type: 'leaf',
                                                size: 500,
                                                data: { id: 'C' },
                                            },
                                        ],
                                    },
                                    {
                                        type: 'leaf',
                                        size: 200,
                                        data: { id: 'D' },
                                    },
                                ],
                            },
                        ],
                    },
                },
                {
                    fromJSON: (node) => {
                        const id = (node.data as { id: string }).id;
                        const view = new MockGridview(id);
                        views.set(id, view);
                        return view;
                    },
                }
            );

            expect(view('A').height).toBe(300);
            expect(view('B').height).toBe(500);
            expect(view('D').height).toBe(200);

            gridview.normalize();
            gridview.layout(1000, 1000);

            expect(gridview.serialize()).toEqual({
                height: 1000,
                orientation: 'VERTICAL',
                root: {
                    data: [
                        { data: { id: 'A' }, size: 300, type: 'leaf' },
                        {
                            data: [
                                { data: { id: 'B' }, size: 500, type: 'leaf' },
                                { data: { id: 'C' }, size: 500, type: 'leaf' },
                            ],
                            size: 500,
                            type: 'branch',
                        },
                        { data: { id: 'D' }, size: 200, type: 'leaf' },
                    ],
                    size: 1000,
                    type: 'branch',
                },
                width: 1000,
            });
            expect(view('A').height).toBe(300);
            expect(view('B').height).toBe(500);
            expect(view('C').height).toBe(500);
            expect(view('D').height).toBe(200);
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

    /**
     * A branch caches its aggregate min/max over its children. The cache is
     * only honest if a change anywhere below the branch reaches it: hiding a
     * leaf two levels down changes the nested branch's minimum, which is a
     * term in every ancestor's aggregate.
     */
    describe('ancestor size caches follow nested changes', () => {
        class ConstrainedView extends MockGridview {
            private readonly _onDidChange = new Emitter<
                IViewSize | undefined
            >();
            override onDidChange = this._onDidChange.event;

            constructor(id: string, minimumHeight = 0) {
                super(id);
                this.minimumHeight = minimumHeight;
            }

            setMinimumHeight(value: number): void {
                this.minimumHeight = value;
                this._onDidChange.fire(undefined);
            }
        }

        /**
         * root V [ T, GP = H [ P = V [ L1(minH 300), L2(minH 300) ], Y ] ]
         */
        function createNestedGrid() {
            const gridview = new Gridview(
                false,
                { separatorBorder: '' },
                Orientation.VERTICAL
            );
            gridview.layout(1000, 1000);

            const t = new ConstrainedView('T');
            const y = new ConstrainedView('Y');
            const l1 = new ConstrainedView('L1', 300);
            const l2 = new ConstrainedView('L2', 300);

            gridview.addView(t, Sizing.Distribute, [0]);
            gridview.addView(y, Sizing.Distribute, [1]);
            // splits Y's slot into GP = H [ L1, Y ]
            gridview.addView(l1, Sizing.Distribute, [1, 0]);
            // splits L1's slot into P = V [ L1, L2 ]
            gridview.addView(l2, Sizing.Distribute, [1, 0, 1]);

            expect(getGridLocation(l2.element)).toEqual([1, 0, 1]);
            expect(gridview.minimumHeight).toBe(600);

            return { gridview, t, y, l1, l2 };
        }

        test('hiding and showing a leaf two levels down updates the root minimum', () => {
            const { gridview } = createNestedGrid();

            gridview.setViewVisible([1, 0, 1], false);
            expect(gridview.minimumHeight).toBe(300);

            gridview.setViewVisible([1, 0, 1], true);
            expect(gridview.minimumHeight).toBe(600);

            gridview.dispose();
        });

        test('the root splitview clamps a nested branch to its live minimum, not the stale one', () => {
            const { gridview, y } = createNestedGrid();

            gridview.setViewVisible([1, 0, 1], false);

            // GP's live minimum height is 300 (only L1 is visible inside P):
            // laid out at 400 the root must give GP 300, not the stale 600
            gridview.layout(1000, 400);
            expect(y.height).toBe(300);

            gridview.dispose();
        });

        test('a constraint change on a leaf two levels down updates the root minimum', () => {
            const { gridview, l1 } = createNestedGrid();

            l1.setMinimumHeight(500);
            expect(gridview.minimumHeight).toBe(800);

            l1.setMinimumHeight(300);
            expect(gridview.minimumHeight).toBe(600);

            gridview.dispose();
        });

        test('adding and removing a leaf inside a nested branch updates the root minimum', () => {
            const { gridview } = createNestedGrid();

            const l3 = new ConstrainedView('L3', 300);
            gridview.addView(l3, Sizing.Distribute, [1, 0, 2]);
            expect(gridview.minimumHeight).toBe(900);

            gridview.removeView([1, 0, 2]);
            expect(gridview.minimumHeight).toBe(600);

            gridview.dispose();
        });

        test('hiding every child of a nested branch hides the branch and drops it from the root minimum', () => {
            const { gridview } = createNestedGrid();

            gridview.setViewVisible([1, 0, 0], false);
            gridview.setViewVisible([1, 0, 1], false);
            expect(gridview.isViewVisible([1, 0])).toBe(false);
            expect(gridview.minimumHeight).toBe(0);

            gridview.setViewVisible([1, 0, 0], true);
            expect(gridview.isViewVisible([1, 0])).toBe(true);
            expect(gridview.minimumHeight).toBe(300);

            gridview.dispose();
        });
    });
});
