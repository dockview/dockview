import { test, expect, Page } from '@playwright/test';

/**
 * Corner resize (#1228): where a row sash meets a column sash, hovering marks
 * both sashes and a drag resizes along both axes at once. Real-browser only:
 * the junction is found from measured sash geometry, which jsdom's no-layout
 * DOM can't produce.
 *
 * Layout (`setupTwoByTwo`): the root splits into two columns, each column
 * splits into two rows, so the column sash and both row sashes meet at the
 * centre.
 */
test.describe('corner resize', () => {
    const setup = async (page: Page, query = '') => {
        await page.goto(`/e2e/fixtures/index.html${query}`);
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupTwoByTwo());
    };

    const box = async (page: Page, title: string) =>
        (await page
            .locator('.dv-groupview', {
                has: page.locator('.dv-tab', { hasText: title }),
            })
            .boundingBox())!;

    // Centre of the junction: on the column sash, level with the gap between
    // the top and bottom groups of the right column.
    const junction = async (page: Page) => {
        const sashes = await page
            .locator('.dv-sash')
            .evaluateAll((elements) =>
                elements.map((e) => e.getBoundingClientRect().toJSON())
            );
        const column = sashes.find((r) => r.height > r.width)!;
        const tr = await box(page, 'tr');
        const br = await box(page, 'br');
        return {
            x: column.x + column.width / 2,
            y: (tr.y + tr.height + br.y) / 2,
        };
    };

    const cornerSashCount = (page: Page) =>
        page.locator('.dv-sash.dv-sash-corner').count();

    test('hovering the junction marks both sashes as a corner', async ({
        page,
    }) => {
        await setup(page);
        const { x, y } = await junction(page);

        await page.mouse.move(x, y);
        await expect.poll(() => cornerSashCount(page)).toBe(2);
        await expect(
            page.locator('.dv-sash.dv-sash-corner').first()
        ).toHaveCSS('cursor', 'move');

        // away from the junction it is an ordinary single-axis sash
        await page.mouse.move(x + 200, y);
        await expect.poll(() => cornerSashCount(page)).toBe(0);
        await page.mouse.move(x, y - 200);
        await expect.poll(() => cornerSashCount(page)).toBe(0);
    });

    test('dragging the corner resizes along both axes', async ({ page }) => {
        await setup(page);
        const { x, y } = await junction(page);
        // grab from the row sash, just right of the column sash
        const startX = x + 3;

        await page.mouse.move(startX, y);
        await expect.poll(() => cornerSashCount(page)).toBe(2);
        const before = {
            tl: await box(page, 'tl'),
            tr: await box(page, 'tr'),
        };

        await page.mouse.down();
        await page.mouse.move(startX - 120, y + 80, { steps: 10 });
        await page.mouse.up();

        const tl = await box(page, 'tl');
        const tr = await box(page, 'tr');
        // the column sash moved left...
        expect(Math.abs(tl.width - (before.tl.width - 120))).toBeLessThan(4);
        // ...and the right column's row sash moved down with it (proportional
        // layout of the outer drag must not reset the inner one)
        expect(Math.abs(tr.height - (before.tr.height + 80))).toBeLessThan(4);
        // the left column's row sash is a separate sash and is untouched
        expect(Math.abs(tl.height - before.tl.height)).toBeLessThan(2);
    });

    test('with a theme gap the corner is grabbable from the column sash', async ({
        page,
    }) => {
        // spaced themes separate groups by a margin, so the row sashes stop
        // short of the column sash instead of meeting it
        await setup(page, '?theme=lightSpaced');
        const { x, y } = await junction(page);

        await page.mouse.move(x, y);
        await expect.poll(() => cornerSashCount(page)).toBe(2);
        const before = await box(page, 'tl');

        await page.mouse.down();
        await page.mouse.move(x + 60, y + 40, { steps: 10 });
        await page.mouse.up();

        const tl = await box(page, 'tl');
        expect(Math.abs(tl.width - (before.width + 60))).toBeLessThan(4);
        expect(Math.abs(tl.height - (before.height + 40))).toBeLessThan(4);
    });

    test('disableCornerResize turns it off', async ({ page }) => {
        await setup(page);
        await page.evaluate(() =>
            (window as any).__dv.setDisableCornerResize(true)
        );
        const before = await box(page, 'tr');
        const { x, y } = await junction(page);
        // on the right row sash, so a plain drag moves only that sash
        const startX = x + 3;

        await page.mouse.move(startX, y);
        expect(await cornerSashCount(page)).toBe(0);

        await page.mouse.down();
        await page.mouse.move(startX - 120, y + 80, { steps: 10 });
        await page.mouse.up();

        const tr = await box(page, 'tr');
        expect(Math.abs(tr.height - (before.height + 80))).toBeLessThan(4);
        expect(Math.abs(tr.width - before.width)).toBeLessThan(2);
    });

    test('works when mounted in a shadow root', async ({ page }) => {
        await setup(page, '?shadow=1');
        const { x, y } = await junction(page);

        await page.mouse.move(x, y);
        await expect.poll(() => cornerSashCount(page)).toBe(2);
    });
});
