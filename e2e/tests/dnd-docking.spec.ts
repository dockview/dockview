import { test, expect, Page } from '@playwright/test';

/**
 * Pointer drag-and-drop docking (dndStrategy: 'pointer'). Real-browser only:
 * the pointer backend attaches move/up listeners and computes drop zones from
 * live element geometry, which jsdom's no-layout DOM can't produce.
 *
 * The compass (content-centre / outer-cell) drops are covered by
 * `dnd-compass.spec.ts`; these cover the tab-strip seams it doesn't: reordering
 * within a strip, and merging by dropping onto another group's header.
 */
test.describe('pointer dnd docking', () => {
    const tabTitles = (page: Page) =>
        page.evaluate(() => (window as any).__dv.tabTitles());

    const dragTab = async (
        page: Page,
        fromTab: string,
        to: { x: number; y: number }
    ) => {
        const t = (await page
            .locator('.dv-tab', { hasText: fromTab })
            .boundingBox())!;
        await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
        await page.mouse.down();
        // small nudge to enter drag mode, then travel to the target
        await page.mouse.move(t.x + t.width / 2 + 6, t.y + t.height / 2, {
            steps: 3,
        });
        await page.mouse.move(to.x, to.y, { steps: 14 });
    };

    test('a tab reorders within its own strip', async ({ page }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => {
            for (const id of ['a', 'b', 'c']) (window as any).__dv.addPanel(id);
        });
        expect(await tabTitles(page)).toEqual(['a', 'b', 'c']);

        // Drag 'a' to the right past 'c' → it lands at the end of the strip.
        const c = (await page
            .locator('.dv-tab', { hasText: 'c' })
            .boundingBox())!;
        await dragTab(page, 'a', {
            x: c.x + c.width - 4,
            y: c.y + c.height / 2,
        });
        await page.mouse.up();

        // Same three tabs, same group, 'a' now last — no compass, no new group.
        await expect.poll(() => tabTitles(page)).toEqual(['b', 'c', 'a']);
        expect(
            await page.evaluate(() => (window as any).__dv.groupCount())
        ).toBe(1);
    });

    test('dropping a tab on another group’s header merges the groups', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupTwoGroups()); // one | two
        expect(
            await page.evaluate(() => (window as any).__dv.groupCount())
        ).toBe(2);

        // Drop 'one' onto the second group's tab strip (not the content
        // compass) → the two groups merge into one.
        const strip = (await page
            .locator('.dv-tabs-container')
            .nth(1)
            .boundingBox())!;
        await dragTab(page, 'one', {
            x: strip.x + strip.width - 6,
            y: strip.y + strip.height / 2,
        });
        await page.mouse.up();

        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.groupCount()))
            .toBe(1);
        await expect(page.locator('.dv-tab')).toHaveText(['two', 'one']);
    });
});
