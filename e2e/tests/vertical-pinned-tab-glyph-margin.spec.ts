import { test, expect, Page } from '@playwright/test';

/**
 * A pinned tab's pin glyph keeps a margin between itself and the title. As
 * with the title's own margin, a vertical header (left/right edge groups)
 * turns the tab with `writing-mode: vertical-rl`, so the margin must follow
 * the writing mode: a physical `margin-right` would lie across the glyph's
 * line, pushing it off the tab's centre and leaving no gap before the title.
 * Real-browser only: jsdom does not lay out writing modes.
 */
test.describe('pinned tab glyph margin', () => {
    type Metrics = {
        writingMode: string;
        /** Glyph box offset from the tab's centre, across the tab's line. */
        offCentre: number;
        /** Gap between the glyph box and the title box, along the line. */
        gap: number;
    };

    const measure = (page: Page): Promise<Metrics> =>
        page.evaluate(() => {
            const tab = document.querySelector<HTMLElement>(
                '.dv-tab.dv-tab--pinned'
            )!;
            const pin = tab.querySelector<HTMLElement>('.dv-tab-pin')!;
            const title = tab.querySelector<HTMLElement>('.dv-default-tab')!;
            const writingMode = getComputedStyle(tab).writingMode;
            const vertical = writingMode.startsWith('vertical');
            const t = tab.getBoundingClientRect();
            const p = pin.getBoundingClientRect();
            const n = title.getBoundingClientRect();
            return {
                writingMode,
                offCentre: vertical
                    ? (p.left + p.right - t.left - t.right) / 2
                    : (p.top + p.bottom - t.top - t.bottom) / 2,
                gap: vertical ? n.top - p.bottom : n.left - p.right,
            };
        });

    test('the glyph is centred with a 4px gap before the title in both header orientations', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(['a'], ['a'])
        );
        await expect(page.locator('.dv-tab.dv-tab--pinned .dv-tab-pin')).toHaveCount(1);

        const horizontal = await measure(page);
        expect(horizontal.writingMode).toBe('horizontal-tb');
        expect(horizontal.offCentre).toBeCloseTo(0, 0);
        expect(horizontal.gap).toBeCloseTo(4, 0);

        await page.evaluate(() =>
            (window as any).__dv.setHeaderPosition('left')
        );
        await expect(page.locator('.dv-tabs-container-vertical')).toHaveCount(
            1
        );

        const vertical = await measure(page);
        expect(vertical.writingMode).toBe('vertical-rl');
        expect(vertical.offCentre).toBeCloseTo(0, 0);
        expect(vertical.gap).toBeCloseTo(4, 0);
    });
});
