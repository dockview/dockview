import { WrapTabGroupIndicator } from '../../dockview/components/titlebar/tabGroupIndicator';
import { mockGetBoundingClientRect } from '../__test_utils__/utils';

/**
 * The Chrome-style wrap indicator must sit on the edge of the tab strip that is
 * adjacent to the content, so it flips with the header position: bottom edge
 * for a top header, top edge for a bottom header, left edge for a left header,
 * right edge for a right header. These tests assert the generated SVG path's
 * anchored edge flips with `headerPosition`.
 */
describe('WrapTabGroupIndicator header-position geometry', () => {
    const ACTIVE_ID = 'p1';
    const CROSS_SIZE = 20;
    const MAIN_SIZE = 200;

    function buildPath(
        headerPosition: 'top' | 'bottom' | 'left' | 'right',
        direction: 'horizontal' | 'vertical'
    ): string {
        const tabElement = document.createElement('div');
        jest.spyOn(tabElement, 'getBoundingClientRect').mockImplementation(() =>
            mockGetBoundingClientRect({
                left: 50,
                top: 50,
                width: 30,
                height: 30,
            })
        );

        const ctx = {
            getTabMap: () =>
                new Map([
                    [
                        ACTIVE_ID,
                        {
                            value: { element: tabElement },
                            disposable: { dispose: jest.fn() },
                        },
                    ],
                ]),
            getChipElement: () => undefined,
            getDirection: () => direction,
            getHeaderPosition: () => headerPosition,
            // a palette that always resolves a concrete colour, so the path renders
            getColorPalette: () => ({ resolveValue: () => '#ff0000' }),
        };

        const indicator = new WrapTabGroupIndicator(ctx as any);
        const underline = document.createElement('div');
        const tg = { id: 'tg', color: 'red', panelIds: [ACTIVE_ID] };
        const containerRect = mockGetBoundingClientRect({
            left: 0,
            top: 0,
            width: MAIN_SIZE,
            height: CROSS_SIZE,
        });

        (indicator as any).applyShape(
            underline,
            tg,
            /* groupStart */ 0,
            /* groupSpan */ MAIN_SIZE,
            /* containerCrossSize */ CROSS_SIZE,
            ACTIVE_ID,
            containerRect,
            /* isVertical */ direction === 'vertical',
            // applyShape now takes the active tab's rect pre-measured by the
            // caller (the measure pass of _positionUnderlinesSync) rather than
            // reading it back itself.
            mockGetBoundingClientRect({
                left: 50,
                top: 50,
                width: 30,
                height: 30,
            })
        );

        return underline.querySelector('path')?.getAttribute('d') ?? '';
    }

    function startCoord(d: string, axis: 'x' | 'y'): number {
        // horizontal paths start `M 0,<y>`; vertical paths start `M <x>,0`
        const m = d.match(/^M\s+([\d.]+),([\d.]+)/);
        expect(m).not.toBeNull();
        return axis === 'x' ? Number(m![1]) : Number(m![2]);
    }

    test('horizontal: a top header anchors near the bottom edge, a bottom header near the top', () => {
        const top = buildPath('top', 'horizontal');
        const bottom = buildPath('bottom', 'horizontal');

        // wrap shape, not the straight-line fallback
        expect(top).toContain('Q');
        expect(top).not.toEqual(bottom);

        // top header → anchored near the bottom edge (large y); bottom → near top (small y)
        expect(startCoord(top, 'y')).toBeGreaterThan(startCoord(bottom, 'y'));
        expect(startCoord(bottom, 'y')).toBeLessThan(CROSS_SIZE / 2);
        expect(startCoord(top, 'y')).toBeGreaterThan(CROSS_SIZE / 2);
    });

    test('vertical: a left header anchors near the left edge, a right header near the right', () => {
        const left = buildPath('left', 'vertical');
        const right = buildPath('right', 'vertical');

        expect(left).toContain('Q');
        expect(left).not.toEqual(right);

        // left header → anchored near the left edge (small x); right → near right (large x)
        expect(startCoord(right, 'x')).toBeGreaterThan(startCoord(left, 'x'));
        expect(startCoord(left, 'x')).toBeLessThan(CROSS_SIZE / 2);
        expect(startCoord(right, 'x')).toBeGreaterThan(CROSS_SIZE / 2);
    });
});
