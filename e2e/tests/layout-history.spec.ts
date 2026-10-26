import { test, expect, Page } from '@playwright/test';

/**
 * Cross-window layout history (Phase D). Undo/redo restore the whole layout —
 * including popout windows, which re-open **asynchronously**. The recorder holds
 * its re-entrancy guard across that async re-open (so the re-open doesn't record
 * a spurious entry) and exposes `popoutRestorationPromise` to await it. None of
 * this is reachable in jsdom (no real second window).
 */
test.describe('cross-window layout history', () => {
    const ready = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => {
            (window as any).__dv.addPanel('alpha');
            (window as any).__dv.addPanel('beta');
        });
    };

    test('undo reverts a popout (group returns to the grid)', async ({
        page,
        context,
    }) => {
        await ready(page);

        const [win] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(() => (window as any).__dv.popoutActiveGroup()),
        ]);
        await (win as Page).waitForLoadState();
        expect(
            await page.evaluate(() => (window as any).__dv.popoutCount())
        ).toBe(1);

        await Promise.all([
            (win as Page).waitForEvent('close'),
            page.evaluate(() => (window as any).__dv.undo()),
        ]);
        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.popoutCount()))
            .toBe(0);
    });

    test('undo re-opens a closed popout window', async ({ page, context }) => {
        await ready(page);

        const [win1] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(() => (window as any).__dv.popoutActiveGroup()),
        ]);
        await (win1 as Page).waitForLoadState();

        // close the popout (records a removal whose pre-image still has the popout)
        await Promise.all([
            (win1 as Page).waitForEvent('close'),
            page.evaluate(() => (window as any).__dv.closeActivePopout()),
        ]);
        expect(
            await page.evaluate(() => (window as any).__dv.popoutCount())
        ).toBe(0);
        expect(await page.evaluate(() => (window as any).__dv.canUndo())).toBe(
            true
        );

        // undo → re-opens the popout window asynchronously
        const [win2] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(async () => {
                (window as any).__dv.undo();
                await (window as any).__dv.awaitPopoutRestore();
            }),
        ]);
        await (win2 as Page).waitForLoadState();
        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.popoutCount()))
            .toBe(1);

        // The re-open must not have left a spurious history entry that a single
        // redo can't account for — redo should cleanly close it again.
        await Promise.all([
            (win2 as Page).waitForEvent('close'),
            page.evaluate(() => (window as any).__dv.redo()),
        ]);
        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.popoutCount()))
            .toBe(0);
    });
});
