import { Emitter, Event } from '../../events';
import {
    getGridLocation,
    Gridview,
    IGridView,
    IViewSize,
} from '../../gridview/gridview';
import { Orientation, Sizing } from '../../splitview/splitview';

class MockView implements IGridView {
    readonly minimumWidth = 0;
    readonly maximumWidth = Number.MAX_VALUE;
    readonly minimumHeight = 0;
    readonly maximumHeight = Number.MAX_VALUE;
    readonly onDidChange: Event<IViewSize | undefined> = new Emitter<
        IViewSize | undefined
    >().event;
    readonly element = document.createElement('div');
    readonly isVisible = true;
    width = 0;
    height = 0;

    layout(width: number, height: number): void {
        this.width = width;
        this.height = height;
    }

    toJSON(): object {
        return {};
    }
}

/** a | b | c, 300px each, in a 900x600 horizontal gridview. */
function createRow(): { gridview: Gridview; views: MockView[] } {
    const gridview = new Gridview(
        false,
        { separatorBorder: '' },
        Orientation.HORIZONTAL
    );
    gridview.layout(900, 600);
    const views = [new MockView(), new MockView(), new MockView()];
    views.forEach((view, i) => gridview.addView(view, Sizing.Distribute, [i]));
    return { gridview, views };
}

describe('transient and replaced views', () => {
    test('a transient view beside a sibling puts every size back', () => {
        const { gridview, views } = createRow();
        const [a, b, c] = views;
        (gridview as any).root.setChildSizes([200, 300, 400]);
        expect(views.map((v) => v.width)).toEqual([200, 300, 400]);

        const transient = new MockView();
        const remove = gridview.addTransientView(
            transient,
            Sizing.Split(1),
            [2]
        );
        expect(transient.width).toBe(150);
        expect(b.width).toBe(150);

        remove();
        expect(transient.element.isConnected).toBe(false);
        expect([a, b, c].map((v) => v.width)).toEqual([200, 300, 400]);
    });

    test('a shared transient view takes an equal share, the others keeping their proportions', () => {
        const { gridview, views } = createRow();
        const [a, b, c] = views;
        (gridview as any).root.setChildSizes([200, 300, 400]);

        const transient = new MockView();
        const remove = gridview.addTransientView(
            transient,
            Sizing.Split(1),
            [2],
            { share: true }
        );

        expect(transient.width).toBe(225);
        expect([a, b, c].map((v) => v.width)).toEqual([150, 225, 300]);

        remove();
        expect([a, b, c].map((v) => v.width)).toEqual([200, 300, 400]);
    });

    test('a shared transient view that wraps a leaf halves it', () => {
        const { gridview, views } = createRow();
        const [, b] = views;

        const transient = new MockView();
        gridview.addTransientView(transient, Sizing.Split(0), [1, 1], {
            share: true,
        });

        expect([b.height, transient.height]).toEqual([300, 300]);
    });

    test('a transient view that wrapped a leaf leaves it as it was', () => {
        const { gridview, views } = createRow();
        const [, b] = views;

        const transient = new MockView();
        const remove = gridview.addTransientView(
            transient,
            Sizing.Split(0),
            [1, 1]
        );
        expect(getGridLocation(b.element)).toEqual([1, 0]);
        expect(b.height).toBe(300);

        remove();
        expect(getGridLocation(b.element)).toEqual([1]);
        expect(views.map((v) => [v.width, v.height])).toEqual([
            [300, 600],
            [300, 600],
            [300, 600],
        ]);
    });

    test('a replaced view hands its place and size over', () => {
        const { gridview, views } = createRow();
        const [a, b, c] = views;
        (gridview as any).root.setChildSizes([200, 300, 400]);

        const replacement = new MockView();
        gridview.replaceView(b, replacement);

        expect(getGridLocation(replacement.element)).toEqual([1]);
        expect(replacement.width).toBe(300);
        expect([a.width, c.width]).toEqual([200, 400]);
        expect(b.element.isConnected).toBe(false);
    });

    test('a hidden view replaced stays hidden, at the size it would come back at', () => {
        const { gridview, views } = createRow();
        const [, b] = views;
        gridview.setViewVisible([1], false);

        const replacement = new MockView();
        gridview.replaceView(b, replacement);

        expect(gridview.isViewVisible([1])).toBe(false);
        gridview.setViewVisible([1], true);
        expect(replacement.width).toBe(300);
    });

    describe('sharing across a branch that collapses once a hidden view goes', () => {
        /** Rows of a 600px-high column: [a | s], b, c; s hidden. */
        function createRows() {
            const gridview = new Gridview(
                false,
                { separatorBorder: '' },
                Orientation.VERTICAL
            );
            gridview.layout(900, 600);
            const [a, s, b, c] = [
                new MockView(),
                new MockView(),
                new MockView(),
                new MockView(),
            ];
            gridview.addView(a, Sizing.Distribute, [0]);
            gridview.addView(b, Sizing.Distribute, [1]);
            gridview.addView(c, Sizing.Distribute, [2]);
            gridview.addView(s, Sizing.Split(0), [0, 1]);
            gridview.setViewVisible([0, 1], false);
            return { gridview, a, s, b, c };
        }

        test('a leaf split with the room counts in the rows it joins', () => {
            const { gridview, a, s, b, c } = createRows();
            expect([a.height, b.height, c.height]).toEqual([200, 200, 200]);

            const room = new MockView();
            gridview.addTransientView(room, Sizing.Split(0), [0, 0, 0], {
                share: true,
                exclude: s,
            });
            expect([room.height, a.height, b.height, c.height]).toEqual([
                150, 150, 150, 150,
            ]);

            gridview.remove(s);
            expect(getGridLocation(room.element)).toEqual([0]);
            expect([room.height, a.height, b.height, c.height]).toEqual([
                150, 150, 150, 150,
            ]);
        });

        test('a room beside the branch counts the views it spreads into', () => {
            // [x | [y / z] ... ] with s hidden next to [y / z]: rows of y, z
            // will join the column.
            const gridview = new Gridview(
                false,
                { separatorBorder: '' },
                Orientation.VERTICAL
            );
            gridview.layout(900, 600);
            const [x, s, y, z] = [
                new MockView(),
                new MockView(),
                new MockView(),
                new MockView(),
            ];
            gridview.addView(x, Sizing.Distribute, [0]);
            gridview.addView(y, Sizing.Distribute, [1]);
            gridview.addView(s, Sizing.Split(0), [1, 0]);
            gridview.addView(z, Sizing.Split(0), [1, 1, 1]);
            gridview.setViewVisible([1, 0], false);
            expect([x.height, y.height, z.height]).toEqual([300, 150, 150]);

            const room = new MockView();
            gridview.addTransientView(room, Sizing.Distribute, [2], {
                share: true,
                exclude: s,
            });
            gridview.remove(s);

            expect(room.height).toBe(150);
            expect(x.height).toBe(225);
            expect(y.height + z.height).toBe(225);
            expect(getGridLocation(room.element)).toEqual([3]);
        });

        test('the sizes come back once the room goes', () => {
            const { gridview, a, s, b, c } = createRows();
            const remove = gridview.addTransientView(
                new MockView(),
                Sizing.Split(0),
                [0, 0, 0],
                { share: true, exclude: s }
            );
            remove();
            expect([a.height, b.height, c.height]).toEqual([200, 200, 200]);
        });
    });

    test('exact sizes hold when the root was wrapped across the drop axis', () => {
        // Rows [s] and [a | b | [c / d]]; the root is then nested in a row with a
        // room beside it, and s is hidden, as for a drop across the layout.
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.VERTICAL
        );
        gridview.layout(1200, 600);
        const [s, a, b, c, room] = [
            new MockView(),
            new MockView(),
            new MockView(),
            new MockView(),
            new MockView(),
        ];
        gridview.addView(s, Sizing.Distribute, [0]);
        gridview.addView(a, Sizing.Distribute, [1]);
        gridview.addView(b, Sizing.Split(0), [1, 1]);
        gridview.addView(c, Sizing.Split(1), [1, 2]);
        const d = new MockView();
        gridview.addView(d, Sizing.Split(0), [1, 2, 1]);
        gridview.setViewVisible([0], false);
        gridview.insertOrthogonalSplitviewAtRoot();
        gridview.addView(room, Sizing.Split(0), [1]);
        const before = [a, b, c, d, room].map((v) => v.width);

        gridview.remove(s, undefined, { exactSizes: true });

        expect([a, b, c, d, room].map((v) => v.width)).toEqual(before);
    });

    test('removing a hidden view with exact sizes keeps what spreads out as it was', () => {
        // [ [s / [a | b]] | c ]: a 200, b 400, c 300; s hidden.
        const gridview = new Gridview(
            false,
            { separatorBorder: '' },
            Orientation.HORIZONTAL
        );
        gridview.layout(900, 600);
        const [a, b, c, s] = [
            new MockView(),
            new MockView(),
            new MockView(),
            new MockView(),
        ];
        gridview.addView(a, Sizing.Distribute, [0]);
        gridview.addView(c, Sizing.Distribute, [1]);
        gridview.addView(s, Sizing.Split(0), [0, 0]);
        gridview.addView(b, Sizing.Split(0), [0, 1, 1]);
        (gridview as any).root.setChildSizes([600, 300]);
        (gridview as any).root.children[0].children[1].setChildSizes([
            200, 400,
        ]);
        gridview.setViewVisible([0, 0], false);

        gridview.remove(s, undefined, { exactSizes: true });

        expect([a, b, c].map((v) => getGridLocation(v.element))).toEqual([
            [0],
            [1],
            [2],
        ]);
        expect([a.width, b.width, c.width]).toEqual([200, 400, 300]);
    });
});
