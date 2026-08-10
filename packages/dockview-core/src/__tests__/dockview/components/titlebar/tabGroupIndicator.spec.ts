import {
    NoneTabGroupIndicator,
    WrapTabGroupIndicator,
    TabGroupIndicatorContext,
} from '../../../../dockview/components/titlebar/tabGroupIndicator';
import { TabGroup } from '../../../../dockview/tabGroup';
import {
    DEFAULT_TAB_GROUP_COLORS,
    TabGroupColorPalette,
} from '../../../../dockview/tabGroupAccent';

function createContext(
    overrides: Partial<TabGroupIndicatorContext> = {}
): TabGroupIndicatorContext {
    const tabsList = document.createElement('div');
    const palette = new TabGroupColorPalette(DEFAULT_TAB_GROUP_COLORS, true);
    return {
        tabsList,
        getTabGroups: () => [],
        getActivePanelId: () => undefined,
        getTabMap: () => new Map(),
        getChipElement: () => undefined,
        getDirection: () => 'horizontal',
        getColorPalette: () => palette,
        ...overrides,
    };
}

describe('NoneTabGroupIndicator', () => {
    test('applyShape sets backgroundColor and horizontal dimensions', () => {
        const ctx = createContext();
        const indicator = new NoneTabGroupIndicator(ctx);
        const underline = document.createElement('div');

        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });

        // Call the protected method via any cast
        (indicator as any).applyShape(
            underline,
            tg,
            0, // startEdge
            120, // span
            30, // containerCrossSize
            undefined, // activePanelId
            {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                toJSON: () => ({}),
            } as DOMRect,
            false // isVertical
        );

        // jsdom doesn't support CSS var() in style properties, so
        // we verify the dimensions and display are set correctly
        expect(underline.style.width).toBe('120px');
        expect(underline.style.height).toBe('2px');
        expect(underline.style.display).toBe('');
    });

    test('applyShape sets vertical dimensions when isVertical is true', () => {
        const ctx = createContext();
        const indicator = new NoneTabGroupIndicator(ctx);
        const underline = document.createElement('div');

        const tg = new TabGroup('tg-1', { label: 'Test', color: 'red' });

        (indicator as any).applyShape(
            underline,
            tg,
            0,
            200,
            30,
            undefined,
            {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                toJSON: () => ({}),
            } as DOMRect,
            true // isVertical
        );

        expect(underline.style.width).toBe('2px');
        expect(underline.style.height).toBe('200px');
    });

    test('applyShape hides underline when span is zero', () => {
        const ctx = createContext();
        const indicator = new NoneTabGroupIndicator(ctx);
        const underline = document.createElement('div');

        const tg = new TabGroup('tg-1', { label: 'Test', color: 'green' });

        (indicator as any).applyShape(
            underline,
            tg,
            0,
            0, // zero span
            30,
            undefined,
            {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                toJSON: () => ({}),
            } as DOMRect,
            false
        );

        expect(underline.style.display).toBe('none');
    });

    test('applyShape hides underline when span is negative', () => {
        const ctx = createContext();
        const indicator = new NoneTabGroupIndicator(ctx);
        const underline = document.createElement('div');

        const tg = new TabGroup('tg-1', { label: 'Test', color: 'purple' });

        (indicator as any).applyShape(
            underline,
            tg,
            0,
            -10,
            30,
            undefined,
            {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                toJSON: () => ({}),
            } as DOMRect,
            false
        );

        expect(underline.style.display).toBe('none');
    });

    test('applyShape clears leftover SVG content from mode switch', () => {
        const ctx = createContext();
        const indicator = new NoneTabGroupIndicator(ctx);
        const underline = document.createElement('div');

        // Simulate leftover SVG from WrapTabGroupIndicator
        const svg = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg'
        );
        underline.appendChild(svg);
        expect(underline.firstElementChild).toBeTruthy();

        const tg = new TabGroup('tg-1', { label: 'Test', color: 'cyan' });

        (indicator as any).applyShape(
            underline,
            tg,
            0,
            100,
            30,
            undefined,
            {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                toJSON: () => ({}),
            } as DOMRect,
            false
        );

        // SVG should be cleared
        expect(underline.firstElementChild).toBeNull();
        expect(underline.innerHTML).toBe('');
        // Dimensions should still be set
        expect(underline.style.width).toBe('100px');
        expect(underline.style.height).toBe('2px');
    });

    test('dispose clears underlines', () => {
        const ctx = createContext();
        const indicator = new NoneTabGroupIndicator(ctx);

        // Manually add an underline to verify disposal
        (indicator as any)._underlines.set(
            'tg-1',
            document.createElement('div')
        );
        expect(indicator.underlines.size).toBe(1);

        indicator.dispose();
        expect(indicator.underlines.size).toBe(0);
    });
});

describe('WrapTabGroupIndicator', () => {
    test('dispose clears underlines', () => {
        const ctx = createContext();
        const indicator = new WrapTabGroupIndicator(ctx);

        (indicator as any)._underlines.set(
            'tg-1',
            document.createElement('div')
        );
        expect(indicator.underlines.size).toBe(1);

        indicator.dispose();
        expect(indicator.underlines.size).toBe(0);
    });

    test('wrapped strip draws one underline segment per row a group spans', () => {
        const tabsList = document.createElement('div');
        tabsList.classList.add('dv-tabs-container--wrap');

        const makeTab = (top: number) => {
            const el = document.createElement('div');
            el.getBoundingClientRect = () =>
                ({
                    top,
                    bottom: top + 26,
                    left: 0,
                    right: 50,
                    width: 50,
                    height: 26,
                }) as DOMRect;
            return { value: { element: el } };
        };
        // two tabs of the group on different rows (top 0 and top 30)
        const tabMap = new Map<string, any>([
            ['a', makeTab(0)],
            ['b', makeTab(30)],
        ]);

        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });
        tg.addPanel('a');
        tg.addPanel('b');

        const ctx = createContext({
            tabsList,
            getTabGroups: () => [tg],
            getTabMap: () => tabMap as any,
            getActivePanelId: () => 'a',
            getHeaderPosition: () => 'top',
        });
        const indicator = new WrapTabGroupIndicator(ctx);
        indicator.syncUnderlineElements(new Set(['tg-1']));
        // simulate a leftover background from a prior non-wrap `none` render
        indicator.getUnderline('tg-1')!.style.backgroundColor = 'red';
        (indicator as any)._positionUnderlinesSync();

        const underline = indicator.getUnderline('tg-1')!;
        const path = underline.querySelector('path')!;
        const d = path.getAttribute('d') ?? '';
        // one straight segment per row → two `M` (move) commands
        const segments = (d.match(/M /g) ?? []).length;
        expect(segments).toBe(2);
        // stale non-wrap background is cleared (no colored block behind the SVG)
        expect(underline.style.backgroundColor).toBe('');

        indicator.dispose();
    });
});

describe('WrapTabGroupIndicator continuation markers', () => {
    const CONTINUATION = '.dv-tab-group-chip-continuation';

    // Build a tab whose rect sits on a given row (top) and column offset (left).
    const makeTab = (top: number, left = 0) => {
        const el = document.createElement('div');
        el.getBoundingClientRect = () =>
            ({
                top,
                bottom: top + 26,
                left,
                right: left + 50,
                width: 50,
                height: 26,
            }) as DOMRect;
        return { value: { element: el } };
    };

    function setup(
        tabMap: Map<string, any>,
        tg: TabGroup,
        wrap = true
    ): {
        indicator: WrapTabGroupIndicator;
        tabsList: HTMLElement;
    } {
        const tabsList = document.createElement('div');
        if (wrap) {
            tabsList.classList.add('dv-tabs-container--wrap');
        }
        const ctx = createContext({
            tabsList,
            getTabGroups: () => [tg],
            getTabMap: () => tabMap as any,
            getActivePanelId: () => undefined,
            getHeaderPosition: () => 'top',
        });
        const indicator = new WrapTabGroupIndicator(ctx);
        indicator.syncUnderlineElements(new Set([tg.id]));
        return { indicator, tabsList };
    }

    test('a group spanning two rows draws one continuation marker', () => {
        const tabMap = new Map<string, any>([
            ['a', makeTab(0, 0)],
            ['b', makeTab(30, 0)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });
        tg.addPanel('a');
        tg.addPanel('b');

        const { indicator, tabsList } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();

        // First row is the chip's row (no marker); one marker on row 2.
        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(1);

        indicator.dispose();
    });

    test('a group spanning three rows draws two continuation markers', () => {
        const tabMap = new Map<string, any>([
            ['a', makeTab(0)],
            ['b', makeTab(30)],
            ['c', makeTab(60)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'red' });
        tg.addPanel('a');
        tg.addPanel('b');
        tg.addPanel('c');

        const { indicator, tabsList } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();

        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(2);

        indicator.dispose();
    });

    test('a single-row group draws no continuation markers', () => {
        const tabMap = new Map<string, any>([
            ['a', makeTab(0, 0)],
            ['b', makeTab(0, 50)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'green' });
        tg.addPanel('a');
        tg.addPanel('b');

        const { indicator, tabsList } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();

        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(0);

        indicator.dispose();
    });

    test('marker sits at the leading edge of its row in the group colour', () => {
        const tabMap = new Map<string, any>([
            ['a', makeTab(0, 0)],
            ['b', makeTab(30, 12)], // row 2 run begins at left 12
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });
        tg.addPanel('a');
        tg.addPanel('b');

        const { indicator, tabsList } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();

        const marker = tabsList.querySelector(CONTINUATION) as HTMLElement;
        expect(marker.style.left).toBe('12px');
        // vertical centre of the 26px-tall row (30..56) minus half the 8px pip
        expect(marker.style.top).toBe(`${(30 + 56) / 2 - 4}px`);
        expect(marker.style.backgroundColor).toBeTruthy();

        indicator.dispose();
    });

    test('markers shrink when the group stops spanning multiple rows', () => {
        const tabMap = new Map<string, any>([
            ['a', makeTab(0)],
            ['b', makeTab(30)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });
        tg.addPanel('a');
        tg.addPanel('b');

        const { indicator, tabsList } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();
        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(1);

        // Both tabs now on the same row → marker pool shrinks to zero.
        tabMap.set('b', makeTab(0, 50));
        (indicator as any)._positionUnderlinesSync();
        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(0);

        indicator.dispose();
    });

    test('markers are removed when wrap mode is turned off', () => {
        const tabMap = new Map<string, any>([
            ['a', makeTab(0)],
            ['b', makeTab(30)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });
        tg.addPanel('a');
        tg.addPanel('b');

        const { indicator, tabsList } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();
        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(1);

        tabsList.classList.remove('dv-tabs-container--wrap');
        (indicator as any)._positionUnderlinesSync();
        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(0);

        indicator.dispose();
    });

    test('markers are removed when the group dissolves', () => {
        const tabMap = new Map<string, any>([
            ['a', makeTab(0)],
            ['b', makeTab(30)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });
        tg.addPanel('a');
        tg.addPanel('b');

        const { indicator, tabsList } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();
        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(1);

        // Group no longer active → its underline and markers are cleaned up.
        indicator.syncUnderlineElements(new Set());
        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(0);

        indicator.dispose();
    });

    test('dispose removes all continuation markers', () => {
        const tabMap = new Map<string, any>([
            ['a', makeTab(0)],
            ['b', makeTab(30)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });
        tg.addPanel('a');
        tg.addPanel('b');

        const { indicator, tabsList } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();
        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(1);

        indicator.dispose();
        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(0);
    });
});

describe('WrapTabGroupIndicator vertical columns (DV-14)', () => {
    const CONTINUATION = '.dv-tab-group-chip-continuation';

    // Build a tab whose rect sits in a given column (left) at a given position
    // down the column (top).
    const makeTab = (left: number, top: number) => {
        const el = document.createElement('div');
        el.getBoundingClientRect = () =>
            ({
                top,
                bottom: top + 26,
                left,
                right: left + 50,
                width: 50,
                height: 26,
            }) as DOMRect;
        return { value: { element: el } };
    };

    function setup(
        tabMap: Map<string, any>,
        tg: TabGroup,
        headerPosition: 'left' | 'right' = 'left'
    ): { indicator: WrapTabGroupIndicator; tabsList: HTMLElement } {
        const tabsList = document.createElement('div');
        tabsList.classList.add('dv-tabs-container--wrap');
        const ctx = createContext({
            tabsList,
            getTabGroups: () => [tg],
            getTabMap: () => tabMap as any,
            getActivePanelId: () => undefined,
            getDirection: () => 'vertical',
            getHeaderPosition: () => headerPosition,
        });
        const indicator = new WrapTabGroupIndicator(ctx);
        indicator.syncUnderlineElements(new Set([tg.id]));
        return { indicator, tabsList };
    }

    test('a group spanning two columns draws one vertical segment per column', () => {
        // column 1 at left 0 (tabs a,b); column 2 at left 40 (tabs c,d)
        const tabMap = new Map<string, any>([
            ['a', makeTab(0, 0)],
            ['b', makeTab(0, 30)],
            ['c', makeTab(40, 0)],
            ['d', makeTab(40, 30)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });
        ['a', 'b', 'c', 'd'].forEach((id) => tg.addPanel(id));

        const { indicator } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();

        const path = indicator.getUnderline('tg-1')!.querySelector('path')!;
        const d = path.getAttribute('d') ?? '';
        // two columns → two `M` (move) commands
        const moves = d.match(/M [\d.]+,[\d.]+/g) ?? [];
        expect(moves).toHaveLength(2);
        // each segment is vertical: the two points of a segment share their x
        const segments = d.trim().split(/M /).filter(Boolean);
        for (const seg of segments) {
            const coords = seg.match(/([\d.]+),([\d.]+)/g)!;
            const xs = coords.map((c) => c.split(',')[0]);
            expect(xs[0]).toBe(xs[1]); // constant x → vertical line
        }

        indicator.dispose();
    });

    test('a single-column group draws no continuation markers', () => {
        const tabMap = new Map<string, any>([
            ['a', makeTab(0, 0)],
            ['b', makeTab(0, 30)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'green' });
        tg.addPanel('a');
        tg.addPanel('b');

        const { indicator, tabsList } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();

        expect(tabsList.querySelectorAll(CONTINUATION)).toHaveLength(0);

        indicator.dispose();
    });

    test('a group spanning two columns draws one continuation marker at the second column top', () => {
        const tabMap = new Map<string, any>([
            ['a', makeTab(0, 0)],
            ['b', makeTab(0, 30)],
            ['c', makeTab(40, 0)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });
        ['a', 'b', 'c'].forEach((id) => tg.addPanel(id));

        const { indicator, tabsList } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();

        const markers = tabsList.querySelectorAll<HTMLElement>(CONTINUATION);
        expect(markers).toHaveLength(1);
        const marker = markers[0];
        // pip at the column top, centred horizontally on the 40..90 column
        expect(marker.style.top).toBe('0px');
        expect(marker.style.left).toBe(`${(40 + 90) / 2 - 4}px`);

        indicator.dispose();
    });

    test('the continuation marker skips the column holding the first tab (vertical-rl safe)', () => {
        // First panel 'a' is in the right-most column (left 40); the left column
        // (left 0) is the continuation one. Bucketing by reference, not by
        // min-left, must mark the left column, not the first.
        const tabMap = new Map<string, any>([
            ['a', makeTab(40, 0)],
            ['b', makeTab(40, 30)],
            ['c', makeTab(0, 0)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });
        ['a', 'b', 'c'].forEach((id) => tg.addPanel(id));

        const { indicator, tabsList } = setup(tabMap, tg);
        (indicator as any)._positionUnderlinesSync();

        const markers = tabsList.querySelectorAll<HTMLElement>(CONTINUATION);
        expect(markers).toHaveLength(1);
        // the marker is over the left column (centre of 0..50 → 25 − 4)
        expect(markers[0].style.left).toBe(`${(0 + 50) / 2 - 4}px`);

        indicator.dispose();
    });

    test('right header draws the segment on the column trailing edge', () => {
        const tabMap = new Map<string, any>([
            ['a', makeTab(0, 0)],
            ['b', makeTab(0, 30)],
        ]);
        const tg = new TabGroup('tg-1', { label: 'Test', color: 'blue' });
        tg.addPanel('a');
        tg.addPanel('b');

        const { indicator } = setup(tabMap, tg, 'right');
        (indicator as any)._positionUnderlinesSync();

        const d =
            indicator
                .getUnderline('tg-1')!
                .querySelector('path')!
                .getAttribute('d') ?? '';
        // right header → x at the column's right edge (right 50 − minLeft 0 − t/2)
        expect(d.startsWith('M 49,')).toBe(true);

        indicator.dispose();
    });
});

describe('indicator type identity', () => {
    test('NoneTabGroupIndicator and WrapTabGroupIndicator are distinct types', () => {
        const ctx = createContext();
        const none = new NoneTabGroupIndicator(ctx);
        const wrap = new WrapTabGroupIndicator(ctx);

        expect(none).toBeInstanceOf(NoneTabGroupIndicator);
        expect(none).not.toBeInstanceOf(WrapTabGroupIndicator);
        expect(wrap).toBeInstanceOf(WrapTabGroupIndicator);
        expect(wrap).not.toBeInstanceOf(NoneTabGroupIndicator);

        none.dispose();
        wrap.dispose();
    });
});

describe('_positionUnderlinesSync read/write batching', () => {
    // The single-bar path measures every group first, then writes every
    // underline — so writing one group's underline can never force a reflow for
    // the next group's measurement. This guards that invariant: no geometry
    // read (getBoundingClientRect) may happen after the first style write
    // (modelled by the applyShape call, which begins the write pass).
    test('all geometry reads happen before the first underline write', () => {
        const events: string[] = [];

        const makeTab = (left: number) => {
            const el = document.createElement('div');
            el.getBoundingClientRect = () => {
                events.push('read');
                return {
                    top: 0,
                    bottom: 30,
                    left,
                    right: left + 50,
                    width: 50,
                    height: 30,
                    x: left,
                    y: 0,
                    toJSON: () => ({}),
                } as DOMRect;
            };
            return { value: { element: el } };
        };

        // Two groups, each with an active tab, so both take the drawn-bar path
        // (which calls applyShape) rather than the hide/straight-line branch.
        const tabMap = new Map<string, any>([
            ['a1', makeTab(0)],
            ['a2', makeTab(60)],
            ['b1', makeTab(120)],
            ['b2', makeTab(180)],
        ]);

        const tgA = new TabGroup('tg-a', { label: 'A', color: 'blue' });
        tgA.addPanel('a1');
        tgA.addPanel('a2');
        const tgB = new TabGroup('tg-b', { label: 'B', color: 'red' });
        tgB.addPanel('b1');
        tgB.addPanel('b2');

        const tabsList = document.createElement('div'); // not wrapped
        const ctx = createContext({
            tabsList,
            getTabGroups: () => [tgA, tgB],
            getTabMap: () => tabMap as any,
            getActivePanelId: () => 'a1',
            getHeaderPosition: () => 'top',
        });

        const indicator = new WrapTabGroupIndicator(ctx);
        indicator.syncUnderlineElements(new Set(['tg-a', 'tg-b']));

        // The write pass is fronted by applyShape; record when it starts.
        jest.spyOn(indicator as any, 'applyShape').mockImplementation(function (
            this: any,
            ...args: any[]
        ) {
            events.push('write');
            return WrapTabGroupIndicator.prototype['applyShape'].apply(
                indicator,
                args as any
            );
        });

        (indicator as any)._positionUnderlinesSync();

        const firstWrite = events.indexOf('write');
        const lastRead = events.lastIndexOf('read');

        // both passes actually ran
        expect(firstWrite).toBeGreaterThan(-1);
        expect(lastRead).toBeGreaterThan(-1);
        // every read precedes the first write (no interleave across groups)
        expect(lastRead).toBeLessThan(firstWrite);

        jest.restoreAllMocks();
        indicator.dispose();
    });

    test('wrapped (multi-row): all reads happen before the first draw', () => {
        const events: string[] = [];

        const makeTab = (top: number, left: number) => {
            const el = document.createElement('div');
            el.getBoundingClientRect = () => {
                events.push('read');
                return {
                    top,
                    bottom: top + 26,
                    left,
                    right: left + 50,
                    width: 50,
                    height: 26,
                    x: left,
                    y: top,
                    toJSON: () => ({}),
                } as DOMRect;
            };
            return { value: { element: el } };
        };

        // Two groups, each spanning two rows, so each produces runs to draw.
        const tabMap = new Map<string, any>([
            ['a1', makeTab(0, 0)],
            ['a2', makeTab(30, 0)],
            ['b1', makeTab(0, 60)],
            ['b2', makeTab(30, 60)],
        ]);

        const tgA = new TabGroup('tg-a', { label: 'A', color: 'blue' });
        tgA.addPanel('a1');
        tgA.addPanel('a2');
        const tgB = new TabGroup('tg-b', { label: 'B', color: 'red' });
        tgB.addPanel('b1');
        tgB.addPanel('b2');

        const tabsList = document.createElement('div');
        tabsList.classList.add('dv-tabs-container--wrap');
        const ctx = createContext({
            tabsList,
            getTabGroups: () => [tgA, tgB],
            getTabMap: () => tabMap as any,
            getActivePanelId: () => undefined,
            getHeaderPosition: () => 'top',
        });

        const indicator = new WrapTabGroupIndicator(ctx);
        indicator.syncUnderlineElements(new Set(['tg-a', 'tg-b']));

        // The write pass is fronted by _drawWrappedUnderline.
        jest.spyOn(
            indicator as any,
            '_drawWrappedUnderline'
        ).mockImplementation(function (this: any, ...args: any[]) {
            events.push('write');
            return (WrapTabGroupIndicator.prototype as any)[
                '_drawWrappedUnderline'
            ].apply(indicator, args);
        });

        (indicator as any)._positionUnderlinesSync();

        const firstWrite = events.indexOf('write');
        const lastRead = events.lastIndexOf('read');
        expect(firstWrite).toBeGreaterThan(-1);
        expect(lastRead).toBeGreaterThan(-1);
        expect(lastRead).toBeLessThan(firstWrite);

        jest.restoreAllMocks();
        indicator.dispose();
    });
});
