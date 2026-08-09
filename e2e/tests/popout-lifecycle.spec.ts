import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Cross-window popout lifecycle — behaviours that only a real second window
 * exercises (jsdom's mock popout shares the opener's document, so a "popout"
 * there never truly leaves the main window):
 *
 *   - closing a popout re-docks its group's panels back into the opener;
 *   - a panel moved into a popout renders inside the popout, not the opener;
 *   - a live popout survives a serialization round-trip (toJSON → fromJSON
 *     re-opens the window and restores its content).
 *
 * The popout smoke test (`popout.spec.ts`) only proves a window opens; these
 * cover what happens to the layout afterwards.
 */
test.describe('cross-window popout lifecycle', () => {
    const twoPanelPopout = async (page: Page, context: BrowserContext) => {
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

    test('closing a popout re-docks its group into the opener', async ({
        page,
        context,
    }) => {
        const win = await twoPanelPopout(page, context);

        // While popped out, the content lives in the popout, not the opener.
        await expect(win.locator('.dv-test-panel')).toContainText('beta');
        await expect(page.locator('.dv-test-panel')).toHaveCount(0);

        // Close the popout *window* itself (not via the group API, which would
        // remove the group). dockview re-docks on the window's `beforeunload`,
        // so the close must run it (Playwright skips it by default).
        await win.close({ runBeforeUnload: true });

        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.popoutCount()))
            .toBe(0);

        await expect(page.locator('.dv-tab')).toHaveCount(2);
        await expect(page.locator('.dv-test-panel')).toContainText('beta');
        expect(
            await page.evaluate(() => (window as any).__dv.groupCount())
        ).toBe(1);
    });

    test('a panel moved into a popout renders inside the popout window', async ({
        page,
        context,
    }) => {
        const win = await twoPanelPopout(page, context);

        // Split a fresh panel into the popout's own gridview.
        await page.evaluate(() =>
            (window as any).__dv.splitIntoPopout('delta')
        );

        // Its content mounts in the popout, and the popout now holds two groups
        // (two tab strips) side by side — while the opener stays empty.
        await expect(
            win.locator('.dv-test-panel', { hasText: 'delta' })
        ).toBeVisible();
        await expect(win.locator('.dv-tabs-container')).toHaveCount(2);
        await expect(page.locator('.dv-test-panel')).toHaveCount(0);
    });

    test('closing a popout with a nested split re-docks both groups', async ({
        page,
        context,
    }) => {
        const win = await twoPanelPopout(page, context);
        // Split a second group into the popout, so it hosts two groups.
        await page.evaluate(() =>
            (window as any).__dv.splitIntoPopout('delta')
        );
        await win.locator('.dv-sash').first().waitFor();
        await expect(win.locator('.dv-groupview')).toHaveCount(2);

        await win.close({ runBeforeUnload: true });

        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.popoutCount()))
            .toBe(0);
        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.groupCount()))
            .toBe(2);
        await expect(page.locator('.dv-tab')).toHaveText([
            'delta',
            'alpha',
            'beta',
        ]);
        await expect(
            page.locator('.dv-test-panel', { hasText: 'delta' })
        ).toBeVisible();
        await expect(
            page.locator('.dv-test-panel', { hasText: 'beta' })
        ).toBeVisible();
    });

    // Capture a snapshot that contains a live popout, then simulate an app
    // reload (fresh component with no panels) and restore that snapshot — the
    // canonical "persist layout, reload the app, restore it" flow.
    const snapshotThenReloadAndRestore = async (
        page: Page,
        context: BrowserContext
    ): Promise<Page> => {
        const win = await twoPanelPopout(page, context);
        const json = await page.evaluate(() =>
            JSON.stringify((window as any).__dv.snapshot())
        );
        expect(json).toContain('"popoutGroups"');
        await win.close({ runBeforeUnload: true });

        // Fresh component (as after a page reload), then restore. The popout
        // re-opens asynchronously — awaited via popoutRestorationPromise.
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        const [restored] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(async (state) => {
                (window as any).__dv.restore(JSON.parse(state));
                await (window as any).__dv.awaitPopoutRestore();
            }, json),
        ]);
        await (restored as Page).waitForLoadState();
        return restored as Page;
    };

    test('restoring a serialized layout re-opens the popout with its tab strip', async ({
        page,
        context,
    }) => {
        const restored = await snapshotThenReloadAndRestore(page, context);

        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.popoutCount()))
            .toBe(1);
        await expect(restored.locator('.dv-tabs-container')).toHaveCount(1);
        await expect(restored.locator('.dv-tab')).toHaveText(['alpha', 'beta']);
    });

    test('restored popout renders its active panel content', async ({
        page,
        context,
    }) => {
        const restored = await snapshotThenReloadAndRestore(page, context);
        // The active panel's content must be mounted inside the popout — a
        // render-container swap on the (already-populated) restored group used
        // to leave the onlyWhenVisible content detached, so nothing rendered.
        await expect(restored.locator('.dv-test-panel')).toContainText('beta');
    });
});
