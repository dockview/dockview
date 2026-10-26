import { test, expect, Page } from '@playwright/test';

/**
 * Keyboard navigation (KeyboardNavigationModule, `keyboardNavigation: true`) —
 * real-browser behaviour the jsdom unit tests cannot fully model: a document
 * `keydown` for F6 / Shift+F6 dispatched from the real focused element cycles
 * the active group and moves DOM focus into the newly-active group's content.
 * jsdom has no real focus routing across laid-out group elements.
 */
test.describe('keyboard navigation (F6)', () => {
    const setup = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        const ids = await page.evaluate(() =>
            (window as any).__dv.setupTwoGroups()
        );
        await expect(
            page.locator('.dv-tabs-and-actions-container')
        ).toHaveCount(2);
        return ids as { first: string; second: string };
    };

    const activeGroupId = (page: Page) =>
        page.evaluate(() => (window as any).__dv.activeGroupId());

    test('F6 moves the active group to the next group and back', async ({
        page,
    }) => {
        const ids = await setup(page);

        await page.locator('.dv-tab', { hasText: 'one' }).click();
        await expect.poll(() => activeGroupId(page)).toBe(ids.first);

        await page.keyboard.press('F6');
        await expect.poll(() => activeGroupId(page)).toBe(ids.second);

        await page.keyboard.press('Shift+F6');
        await expect.poll(() => activeGroupId(page)).toBe(ids.first);
    });

    test('F6 moves DOM focus into the newly-active group', async ({ page }) => {
        const ids = await setup(page);

        await page.locator('.dv-tab', { hasText: 'one' }).click();
        await expect.poll(() => activeGroupId(page)).toBe(ids.first);

        await page.keyboard.press('F6');
        await expect.poll(() => activeGroupId(page)).toBe(ids.second);

        // DOM focus now lives inside the active (second) group's element — the
        // service focused its content after activating it. There is exactly one
        // `.dv-active-group`, and it is the one that holds focus.
        const focusInActiveGroup = await page.evaluate(() => {
            const active = document.activeElement;
            const activeGroup = document.querySelector('.dv-active-group');
            return !!(activeGroup && active && activeGroup.contains(active));
        });
        expect(focusInActiveGroup).toBe(true);
    });
});
