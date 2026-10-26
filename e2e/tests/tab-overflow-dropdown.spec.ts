import { test, expect, Page } from '@playwright/test';

/**
 * Tab overflow dropdown — when a strip is too narrow for its tabs, the extras
 * collapse behind a dropdown handle; opening it and picking a hidden tab
 * activates that panel. Real-browser only: whether the strip overflows (and
 * which tabs are pushed into the dropdown) is decided from measured widths,
 * which jsdom can't produce.
 *
 * (pinned-tabs.spec.ts covers that a pinned tab is *excluded* from the
 * dropdown; this covers the open-and-select flow itself.)
 */
test.describe('tab overflow dropdown', () => {
    const setup = async (page: Page) => {
        await page.setViewportSize({ width: 300, height: 500 });
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => {
            for (let i = 0; i < 12; i++)
                (window as any).__dv.addPanel('panel-long-title-' + i);
        });
    };

    test('selecting a hidden tab from the dropdown activates it', async ({
        page,
    }) => {
        await setup(page);

        const handle = page.locator('.dv-tabs-overflow-dropdown-default');
        await expect(handle).toBeVisible();
        await handle.click();

        const overflow = page.locator('.dv-tabs-overflow-container');
        await expect(overflow).toBeVisible();
        await expect(overflow.locator('.dv-tab')).not.toHaveCount(0);

        const hiddenTab = overflow.locator('.dv-tab').first();
        const title = (await hiddenTab.textContent())!.trim();
        await hiddenTab.click();

        await expect(page.locator('.dv-active-tab')).toHaveText(title);
        await expect(overflow).toHaveCount(0);
    });

    /**
     * Regression: selecting a hidden tab must not scroll the *page*. The
     * activation used to call a bare `scrollIntoView()` (which defaults to
     * `block: 'start'`) on the now-active tab; when the dockview sits low in a
     * scrollable page that scrolled the document to pull the tab to the top,
     * dragging the whole dockview upward and largely out of the viewport. The
     * fix pins it to `block: 'nearest'` so only the tab strip reveals the tab
     * horizontally. jsdom has no layout/scrolling, so this needs a real browser.
     */
    test('selecting a hidden tab does not scroll the page', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 300, height: 500 });
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);

        // Put the dockview low in a scrollable page: a spacer above pushes the
        // tab strip ~200px down (still within the viewport), and the page is
        // taller than the viewport so the document itself can scroll.
        await page.evaluate(() => {
            const style = document.createElement('style');
            style.textContent =
                'html, body { height: auto; } #app { height: 250px; }';
            document.head.appendChild(style);
            const app = document.getElementById('app')!;
            const spacerTop = document.createElement('div');
            spacerTop.style.height = '200px';
            const spacerBottom = document.createElement('div');
            spacerBottom.style.height = '600px';
            app.parentNode!.insertBefore(spacerTop, app);
            app.after(spacerBottom);
            window.scrollTo(0, 0);
        });

        await page.evaluate(() => {
            for (let i = 0; i < 12; i++)
                (window as any).__dv.addPanel('panel-long-title-' + i);
        });

        // Preconditions: the page really is scrollable and starts at the top.
        expect(
            await page.evaluate(
                () => document.documentElement.scrollHeight > window.innerHeight
            )
        ).toBe(true);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);

        const handle = page.locator('.dv-tabs-overflow-dropdown-default');
        await expect(handle).toBeVisible();
        await handle.click();

        const overflow = page.locator('.dv-tabs-overflow-container');
        await expect(overflow).toBeVisible();
        const hiddenTab = overflow.locator('.dv-tab').first();
        const title = (await hiddenTab.textContent())!.trim();
        await hiddenTab.click();

        // Behaviour preserved: the picked tab activates and the dropdown closes.
        await expect(page.locator('.dv-active-tab')).toHaveText(title);
        await expect(overflow).toHaveCount(0);

        // The guard: the page did NOT scroll. Under the old bug the document
        // scrolled by ~200px (the tab strip's offset), yanking the dockview up.
        expect(await page.evaluate(() => window.scrollY)).toBeLessThan(50);
    });
});
