import { test, expect, Page } from '@playwright/test';

/**
 * Per-window live regions: a popout window gets its own aria-live regions, and
 * announcements route to the window that currently has focus — so a screen
 * reader user working in a popout actually hears them. None of this is
 * expressible in jsdom (the mock popout shares the main document).
 */
test.describe('cross-window live regions', () => {
    const popout = async (page: Page, context) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => {
            (window as any).__dv.addPanel('alpha');
            (window as any).__dv.addPanel('beta'); // beta active, same group
        });
        const [win] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(() => (window as any).__dv.popoutActiveGroup()),
        ]);
        await (win as Page).waitForLoadState();
        return win as Page;
    };

    test('a popout window has its own polite and assertive regions', async ({
        page,
        context,
    }) => {
        const win = await popout(page, context);

        await expect(win.locator('.dv-live-region')).toHaveCount(1);
        await expect(win.locator('.dv-live-region-assertive')).toHaveCount(1);
    });

    test('announcements route to the focused popout, not the opener', async ({
        page,
        context,
    }) => {
        const win = await popout(page, context);

        // Put focus in the popout, then close a panel there. The "closed"
        // announcement must land in the popout's region, not the opener's.
        await win.locator('.dv-test-panel').first().focus();
        await page.evaluate(() => (window as any).__dv.closePanel('beta'));

        await expect(win.locator('.dv-live-region')).toHaveText('beta closed');
        // It must never leak into the opener's region. (The opener's region
        // still holds the earlier "opened in a new window" note, which routed
        // to it because the main window had focus at popout time.)
        await expect(page.locator('.dv-live-region')).not.toHaveText(
            'beta closed'
        );
        await expect(page.locator('.dv-live-region')).toHaveText(
            'beta opened in a new window'
        );
    });
});
