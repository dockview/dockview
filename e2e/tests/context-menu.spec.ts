import { test, expect, Page } from '@playwright/test';

/**
 * Tab context menu (ContextMenuModule) — real-browser behaviour the jsdom unit
 * tests cannot reach: a right-click (`contextmenu`) on a live tab element opens
 * a positioned popover in the group's popup host, and clicking a built-in item
 * ("Close", "Close Others") actually mutates the strip. jsdom has no real
 * pointer/contextmenu dispatch to a laid-out element and no popover geometry.
 */
test.describe('tab context menu', () => {
    const setup = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => {
            (window as any).__dv.addPanel('alpha');
            (window as any).__dv.addPanel('bravo');
            (window as any).__dv.addPanel('charlie');
        });
    };

    test('right-clicking a tab opens a menu with the configured items', async ({
        page,
    }) => {
        await setup(page);
        await expect(page.locator('.dv-tab')).toHaveCount(3);

        await page.locator('.dv-tab').first().click({ button: 'right' });

        const menu = page.locator('.dv-context-menu');
        await expect(menu).toBeVisible();
        await expect(menu).toHaveAttribute('role', 'menu');
        await expect(menu.locator('.dv-context-menu-item')).toHaveCount(3);
        await expect(menu).toContainText('Close');
    });

    test('clicking "Close" closes just that panel', async ({ page }) => {
        await setup(page);
        await page
            .locator('.dv-tab', { hasText: 'alpha' })
            .click({ button: 'right' });
        await expect(page.locator('.dv-context-menu')).toBeVisible();

        await page
            .locator('.dv-context-menu-item', { hasText: 'Close' })
            .first()
            .click();

        await expect(page.locator('.dv-context-menu')).toHaveCount(0);
        await expect(page.locator('.dv-tab')).toHaveCount(2);
        await expect(page.locator('.dv-tab', { hasText: 'alpha' })).toHaveCount(
            0
        );
        await expect(page.locator('.dv-tab', { hasText: 'bravo' })).toHaveCount(
            1
        );
    });

    test('clicking "Close Others" leaves only the clicked panel', async ({
        page,
    }) => {
        await setup(page);
        await page
            .locator('.dv-tab', { hasText: 'bravo' })
            .click({ button: 'right' });
        await expect(page.locator('.dv-context-menu')).toBeVisible();

        await page
            .locator('.dv-context-menu-item', { hasText: 'Close Others' })
            .click();

        await expect(page.locator('.dv-context-menu')).toHaveCount(0);
        await expect(page.locator('.dv-tab')).toHaveCount(1);
        await expect(page.locator('.dv-tab', { hasText: 'bravo' })).toHaveCount(
            1
        );
    });

    test('clicking "Close All" closes every panel in the group', async ({
        page,
    }) => {
        await setup(page);
        await page
            .locator('.dv-tab', { hasText: 'bravo' })
            .click({ button: 'right' });
        await expect(page.locator('.dv-context-menu')).toBeVisible();

        await page
            .locator('.dv-context-menu-item', { hasText: 'Close All' })
            .click();

        await expect(page.locator('.dv-context-menu')).toHaveCount(0);
        await expect(page.locator('.dv-tab')).toHaveCount(0);
    });

    test('clicking outside the menu dismisses it without closing anything', async ({
        page,
    }) => {
        await setup(page);
        await page.locator('.dv-tab').first().click({ button: 'right' });
        await expect(page.locator('.dv-context-menu')).toBeVisible();

        // A click away from the popover closes it (dismissable layer). Wait past
        // the popover's outside-pointerdown grace window (200ms) first.
        await page.waitForTimeout(250);
        await page.mouse.click(600, 450);
        await expect(page.locator('.dv-context-menu')).toHaveCount(0);
        await expect(page.locator('.dv-tab')).toHaveCount(3);
    });
});
