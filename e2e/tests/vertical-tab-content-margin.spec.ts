import { test, expect, Page } from '@playwright/test';

/**
 * The default tab keeps its title apart from the close button with a margin on
 * the title. A vertical header (left/right edge groups) turns its tabs with
 * `writing-mode: vertical-rl`, so the margin must follow the writing mode: a
 * physical `margin-right` would lie across the title's line, pushing the
 * title off the tab's centre and leaving no gap before the close button.
 * Real-browser only: jsdom does not lay out writing modes.
 * https://github.com/dockview/dockview/issues/1773
 */
test.describe('default tab title margin', () => {
    type Metrics = {
        writingMode: string;
        /** Title box offset from the tab's centre, across the title's line. */
        offCentre: number;
        /** Gap between the title box and the close button, along the line. */
        gap: number;
    };

    const measure = (page: Page): Promise<Metrics> =>
        page.evaluate(() => {
            const content = document.querySelector<HTMLElement>(
                '.dv-default-tab-content'
            )!;
            const tab = content.closest<HTMLElement>('.dv-default-tab')!;
            const action = tab.querySelector<HTMLElement>(
                '.dv-default-tab-action'
            )!;
            const writingMode = getComputedStyle(tab).writingMode;
            const vertical = writingMode.startsWith('vertical');
            const t = tab.getBoundingClientRect();
            const n = content.getBoundingClientRect();
            const c = action.getBoundingClientRect();
            return {
                writingMode,
                offCentre: vertical
                    ? (n.left + n.right - t.left - t.right) / 2
                    : (n.top + n.bottom - t.top - t.bottom) / 2,
                gap: vertical ? c.top - n.bottom : c.left - n.right,
            };
        });

    test('the title is centred with a 4px gap before the close button in both header orientations', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.addPanel('a'));
        await expect(page.locator('.dv-default-tab-content')).toHaveText('a');

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
