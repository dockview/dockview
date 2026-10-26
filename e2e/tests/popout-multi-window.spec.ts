import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Cross-window popup-service routing (DV-43 / DV-47). A group's tab context
 * menu must render in the window that group actually lives in — the opener for
 * grid groups, the popout window for groups inside it — even when the group is
 * not the popout's anchor (DV-43) and after the anchor is docked back out and a
 * member is promoted (DV-47). jsdom reuses a single document, so only a real
 * second window can verify which document the menu mounts in.
 */
test.describe('popout multi-window popup routing', () => {
    async function popoutActiveGroup(
        page: Page,
        context: BrowserContext
    ): Promise<Page> {
        const [popout] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(() => (window as any).__dv.popoutActiveGroup()),
        ]);
        await popout.waitForLoadState();
        return popout;
    }

    test("DV-43: a non-anchor group's context menu renders in the popout window", async ({
        page,
        context,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.addPanel('alpha'));

        const popout = await popoutActiveGroup(page, context);

        // add a SECOND group ('beta') inside the popout — a non-anchor member
        await page.evaluate(() => (window as any).__dv.splitIntoPopout('beta'));
        await expect(
            popout.locator('.dv-tab', { hasText: 'beta' })
        ).toBeVisible();

        await popout
            .locator('.dv-tab', { hasText: 'beta' })
            .click({ button: 'right' });

        // the menu must mount in the popout document, not the opener
        await expect(popout.locator('.dv-context-menu')).toBeVisible();
        await expect(page.locator('.dv-context-menu')).toHaveCount(0);
    });

    test('DV-47: after the anchor docks back to the grid, the promoted member routes to the popout and the departed group to the opener', async ({
        page,
        context,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => {
            (window as any).__dv.addPanel('home'); // grid group that stays
            (window as any).__dv.addPanelAt('alpha', 'right'); // separate group
        });

        const popout = await popoutActiveGroup(page, context);
        await page.evaluate(() => (window as any).__dv.splitIntoPopout('beta'));
        await expect(
            popout.locator('.dv-tab', { hasText: 'beta' })
        ).toBeVisible();

        // dock the ORIGINAL anchor (alpha's group) back to the grid → the
        // window survives and promotes beta's group as the new anchor
        await page.evaluate(() =>
            (window as any).__dv.dockPopoutAnchorNextTo('home')
        );
        await expect(
            page.locator('.dv-tab', { hasText: 'alpha' })
        ).toBeVisible();
        await expect(
            popout.locator('.dv-tab', { hasText: 'beta' })
        ).toBeVisible();

        // the promoted member (beta) still routes its menu to the popout
        await popout
            .locator('.dv-tab', { hasText: 'beta' })
            .click({ button: 'right' });
        await expect(popout.locator('.dv-context-menu')).toBeVisible();
        await expect(page.locator('.dv-context-menu')).toHaveCount(0);
        await popout.keyboard.press('Escape');
        await expect(popout.locator('.dv-context-menu')).toHaveCount(0);

        // the departed group (alpha, now back in the grid) routes to the opener
        await page
            .locator('.dv-tab', { hasText: 'alpha' })
            .click({ button: 'right' });
        await expect(page.locator('.dv-context-menu')).toBeVisible();
        await expect(popout.locator('.dv-context-menu')).toHaveCount(0);
    });
});
