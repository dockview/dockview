import { test, expect, Page } from '@playwright/test';

/**
 * Locked groups — a group with `locked` set rejects panel drops. Real-browser
 * only: the drop is decided from live pointer geometry over the target group,
 * and the rejection is observable as the compass never appearing and the layout
 * not changing.
 */
test.describe('locked group', () => {
    const setup = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupTwoGroups()); // one | two
    };

    const dragOntoSecondGroup = async (page: Page) => {
        const oneTab = (await page
            .locator('.dv-tab', { hasText: 'one' })
            .boundingBox())!;
        const target = (await page
            .locator('.dv-groupview')
            .nth(1)
            .boundingBox())!;
        await page.mouse.move(
            oneTab.x + oneTab.width / 2,
            oneTab.y + oneTab.height / 2
        );
        await page.mouse.down();
        await page.mouse.move(
            oneTab.x + oneTab.width / 2 + 6,
            oneTab.y + oneTab.height / 2,
            { steps: 3 }
        );
        await page.mouse.move(
            target.x + target.width / 2,
            target.y + target.height / 2,
            { steps: 12 }
        );
    };

    const groupCount = (page: Page) =>
        page.evaluate(() => (window as any).__dv.groupCount());

    test('a locked group rejects a tab dropped onto it', async ({ page }) => {
        await setup(page);
        await page.evaluate(() =>
            (window as any).__dv.setGroupLocked('two', true)
        );
        expect(await groupCount(page)).toBe(2);

        await dragOntoSecondGroup(page);
        // No compass appears over the locked group…
        await expect(page.locator('.dv-dnd-compass')).toHaveCount(0);
        await page.mouse.up();

        // …and the layout is unchanged (no merge).
        await expect.poll(() => groupCount(page)).toBe(2);
        await expect(
            page.locator('.dv-groupview').nth(1).locator('.dv-tab')
        ).toHaveText(['two']);
    });

    test('unlocking the group restores drops (control)', async ({ page }) => {
        await setup(page);
        // Lock then unlock — the same drag should now be accepted.
        await page.evaluate(() =>
            (window as any).__dv.setGroupLocked('two', true)
        );
        await page.evaluate(() =>
            (window as any).__dv.setGroupLocked('two', false)
        );

        await dragOntoSecondGroup(page);
        await expect(page.locator('.dv-dnd-compass')).toBeVisible();
        await page.mouse.up();

        await expect.poll(() => groupCount(page)).toBe(1);
        await expect(page.locator('.dv-tab')).toHaveText(['two', 'one']);
    });
});
