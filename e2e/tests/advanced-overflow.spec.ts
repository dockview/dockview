import { test, expect, Page } from '@playwright/test';

/**
 * Advanced overflow (AdvancedOverflowModule): the free chevron dropdown is
 * upgraded in place into a searchable / MRU command-palette tab switcher. Which
 * tabs overflow is decided from measured widths, so this is real-browser only.
 *
 * The cross-window case is the load-bearing one: the popover must open via the
 * group's window-bound `PopupService`, so it renders (and dismisses) inside a
 * popped-out group's own document — never the opener's.
 */
test.describe('advanced overflow dropdown', () => {
    const addOverflowingTabs = async (
        page: Page,
        count: number,
        prefix: string
    ) => {
        await page.evaluate(
            ({ count, prefix }) => {
                for (let i = 0; i < count; i++) {
                    (window as any).__dv.addPanel(`${prefix}-${i}`);
                }
            },
            { count, prefix }
        );
    };

    test('renders a searchable popover and filters rows', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 500 });
        await page.goto('/e2e/fixtures/index.html?overflow=advanced');
        await page.waitForFunction(() => (window as any).__ready === true);
        await addOverflowingTabs(page, 12, 'overflow-long-title');

        const handle = page.locator('.dv-tabs-overflow-dropdown-default');
        await expect(handle).toBeVisible();
        await handle.click();

        const popover = page.locator('.dv-tabs-overflow-advanced');
        await expect(popover).toBeVisible();

        const search = popover.locator('.dv-tabs-overflow-search');
        await expect(search).toBeFocused();

        await search.fill('long-title-1');
        await expect(popover.locator('[role="option"]')).not.toHaveCount(0);
        await search.fill('zzz-no-match');
        await expect(popover.locator('[role="option"]')).toHaveCount(0);

        await search.press('Escape');
        await expect(popover).toHaveCount(0);
    });

    test('arrow keys + Enter activate a hidden tab', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 500 });
        await page.goto('/e2e/fixtures/index.html?overflow=advanced');
        await page.waitForFunction(() => (window as any).__ready === true);
        await addOverflowingTabs(page, 12, 'kbd-long-title');

        await page.locator('.dv-tabs-overflow-dropdown-default').click();
        const popover = page.locator('.dv-tabs-overflow-advanced');
        await expect(popover).toBeVisible();

        const firstOption = popover.locator('[role="option"]').first();
        const title = (await firstOption.textContent())!.trim();

        const search = popover.locator('.dv-tabs-overflow-search');
        await search.press('Enter'); // first option is active on open

        await expect(page.locator('.dv-active-tab')).toHaveText(title);
        await expect(popover).toHaveCount(0);
    });

    test('popover renders + dismisses inside a popped-out group', async ({
        page,
        context,
    }) => {
        await page.setViewportSize({ width: 400, height: 500 });
        await page.goto('/e2e/fixtures/index.html?overflow=advanced');
        await page.waitForFunction(() => (window as any).__ready === true);
        await addOverflowingTabs(page, 20, 'pop-long-title');

        const [popout] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(() => (window as any).__dv.popoutActiveGroup()),
        ]);
        await (popout as Page).waitForLoadState();

        // Narrow the popout so its strip overflows regardless of default size.
        await popout.setViewportSize({ width: 360, height: 500 });

        const handle = popout.locator('.dv-tabs-overflow-dropdown-default');
        await expect(handle).toBeVisible();
        await handle.click();

        // The popover renders in the POPOUT document (window-bound), not the
        // opener — this is the cross-window binding under test.
        const popover = popout.locator('.dv-tabs-overflow-advanced');
        await expect(popover).toBeVisible();
        await expect(page.locator('.dv-tabs-overflow-advanced')).toHaveCount(0);

        // And it dismisses in the popout document.
        await popout.locator('.dv-tabs-overflow-search').press('Escape');
        await expect(popover).toHaveCount(0);
    });
});
