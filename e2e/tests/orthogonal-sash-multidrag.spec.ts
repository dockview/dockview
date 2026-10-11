import { test, expect, Page } from '@playwright/test';

// #1228. Needs real layout. `setupTwoByTwo`: two columns of two rows.
test.describe('orthogonal sash multidrag', () => {
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

    const multidragSashCount = (page: Page) =>
        page.locator('.dv-sash.dv-sash-multidrag').count();

    test('hovering the junction marks both sashes', async ({
        page,
    }) => {
        await setup(page);
        const { x, y } = await junction(page);

        await page.mouse.move(x, y);
        await expect.poll(() => multidragSashCount(page)).toBe(2);
        await expect(
            page.locator('.dv-sash.dv-sash-multidrag').first()
        ).toHaveCSS('cursor', 'move');

        await page.mouse.move(x + 200, y);
        await expect.poll(() => multidragSashCount(page)).toBe(0);
        await page.mouse.move(x, y - 200);
        await expect.poll(() => multidragSashCount(page)).toBe(0);
    });

    test('dragging the junction resizes along both axes', async ({ page }) => {
        await setup(page);
        const { x, y } = await junction(page);
        const startX = x + 3;

        await page.mouse.move(startX, y);
        await expect.poll(() => multidragSashCount(page)).toBe(2);
        const before = {
            tl: await box(page, 'tl'),
            tr: await box(page, 'tr'),
        };

        await page.mouse.down();
        await page.mouse.move(startX - 120, y + 80, { steps: 10 });
        await page.mouse.up();

        const tl = await box(page, 'tl');
        const tr = await box(page, 'tr');
        expect(Math.abs(tl.width - (before.tl.width - 120))).toBeLessThan(4);
        expect(Math.abs(tr.height - (before.tr.height + 80))).toBeLessThan(4);
        expect(Math.abs(tl.height - before.tl.height)).toBeLessThan(2);
    });

    test('with a theme gap the junction is grabbable from the column sash', async ({
        page,
    }) => {
        await setup(page, '?theme=lightSpaced');
        const { x, y } = await junction(page);

        await page.mouse.move(x, y);
        await expect.poll(() => multidragSashCount(page)).toBe(2);
        const before = await box(page, 'tl');

        await page.mouse.down();
        await page.mouse.move(x + 60, y + 40, { steps: 10 });
        await page.mouse.up();

        const tl = await box(page, 'tl');
        expect(Math.abs(tl.width - (before.width + 60))).toBeLessThan(4);
        expect(Math.abs(tl.height - (before.height + 40))).toBeLessThan(4);
    });

    test('disableOrthogonalSashMultidrag turns it off', async ({ page }) => {
        await setup(page);
        await page.evaluate(() =>
            (window as any).__dv.setDisableOrthogonalSashMultidrag(true)
        );
        const before = await box(page, 'tr');
        const { x, y } = await junction(page);
        const startX = x + 3;

        await page.mouse.move(startX, y);
        expect(await multidragSashCount(page)).toBe(0);

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
        await expect.poll(() => multidragSashCount(page)).toBe(2);
    });
});
