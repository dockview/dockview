import { test, expect, Page } from '@playwright/test';

/**
 * Layout history (undo/redo) for in-grid structural mutations — the counterpart
 * to the cross-window popout coverage in layout-history.spec.ts. These run in a
 * single window but still exercise the real recorder: each mutation snapshots
 * the live layout (`toJSON`) and undo/redo re-applies it (`fromJSON`). The
 * harness drives the component directly, so its mutations carry the default
 * `'user'` origin the recorder keeps on the undo stack (programmatic-origin
 * mutations are ignored by default).
 */
test.describe('layout history (in-grid undo/redo)', () => {
    const ready = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
    };
    const groupCount = (page: Page) =>
        page.evaluate(() => (window as any).__dv.groupCount());
    const canUndo = (page: Page) =>
        page.evaluate(() => (window as any).__dv.canUndo());
    const canRedo = (page: Page) =>
        page.evaluate(() => (window as any).__dv.canRedo());

    test('undo and redo a group split', async ({ page }) => {
        await ready(page);
        await page.evaluate(() => (window as any).__dv.addPanel('alpha'));
        await page.evaluate(() =>
            (window as any).__dv.addPanelAt('beta', 'right')
        );

        expect(await groupCount(page)).toBe(2);
        expect(await canUndo(page)).toBe(true);
        expect(await canRedo(page)).toBe(false);

        await page.evaluate(() => (window as any).__dv.undo());
        await expect.poll(() => groupCount(page)).toBe(1);
        expect(await canRedo(page)).toBe(true);

        await page.evaluate(() => (window as any).__dv.redo());
        await expect.poll(() => groupCount(page)).toBe(2);
    });

    test('undo restores a closed panel', async ({ page }) => {
        await ready(page);
        await page.evaluate(() => {
            (window as any).__dv.addPanel('alpha');
            (window as any).__dv.addPanel('beta');
        });
        await expect(page.locator('.dv-tab')).toHaveCount(2);

        await page.evaluate(() => (window as any).__dv.closePanel('beta'));
        await expect(page.locator('.dv-tab')).toHaveCount(1);

        await page.evaluate(() => (window as any).__dv.undo());
        await expect(page.locator('.dv-tab')).toHaveCount(2);
        await expect(
            page.locator('.dv-tab', { hasText: 'beta' })
        ).toHaveCount(1);
    });

    test('undo reverts a maximize', async ({ page }) => {
        await ready(page);
        await page.evaluate(() => {
            (window as any).__dv.addPanel('alpha');
            (window as any).__dv.addPanelAt('beta', 'right');
        });
        expect(await groupCount(page)).toBe(2);

        await page.evaluate(() => (window as any).__dv.maximizeGroup('beta'));
        await expect
            .poll(() =>
                page.evaluate(() => (window as any).__dv.isMaximized('beta'))
            )
            .toBe(true);

        await page.evaluate(() => (window as any).__dv.undo());
        await expect
            .poll(() =>
                page.evaluate(() => (window as any).__dv.isMaximized('beta'))
            )
            .toBe(false);
    });
});
