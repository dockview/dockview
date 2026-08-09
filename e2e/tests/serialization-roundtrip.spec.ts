import { test, expect, Page } from '@playwright/test';

/**
 * Serialization round-trips for v8 features — snapshot a live layout, reload
 * into a fresh component, and restore. Real-browser only: the restored view
 * has to actually render (maximized hiding, edge-group shell, chip mount) for
 * these assertions to mean anything, which jsdom's no-layout DOM can't produce.
 *
 * (The popout and floating-group round-trips live in their own specs.)
 */
test.describe('serialization round-trips', () => {
    const ready = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
    };

    const reloadAndRestore = async (page: Page, json: string) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(
            (state) => (window as any).__dv.restore(JSON.parse(state)),
            json
        );
    };

    const snapshot = (page: Page) =>
        page.evaluate(() => JSON.stringify((window as any).__dv.snapshot()));

    test('a maximized group round-trips', async ({ page }) => {
        await ready(page);
        const maxId = await page.evaluate(() =>
            (window as any).__dv.setupTwoGroupsMaximizeFirst()
        );
        expect(
            await page.evaluate(() => (window as any).__dv.hasMaximizedGroup())
        ).toBe(true);
        expect(
            await page.evaluate(() => (window as any).__dv.maximizedGroupId())
        ).toBe(maxId);

        const json = await snapshot(page);
        expect(json).toContain('maximizedNode');

        await reloadAndRestore(page, json);

        await expect
            .poll(() =>
                page.evaluate(() => (window as any).__dv.hasMaximizedGroup())
            )
            .toBe(true);
        expect(
            await page.evaluate(() => (window as any).__dv.maximizedGroupId())
        ).toBe(maxId);
    });

    test('an edge group round-trips with its panel content', async ({
        page,
    }) => {
        await ready(page);
        await page.evaluate(() => (window as any).__dv.setupAutoHideEdge());
        expect(
            await page.evaluate(() =>
                (window as any).__dv.edgeGroupExists('left')
            )
        ).toBe(true);

        const json = await snapshot(page);
        expect(json).toContain('edgeGroups');

        await reloadAndRestore(page, json);

        await expect
            .poll(() =>
                page.evaluate(() =>
                    (window as any).__dv.edgeGroupExists('left')
                )
            )
            .toBe(true);
        expect(
            await page.evaluate(() =>
                (window as any).__dv.edgeGroupPanelIds('left')
            )
        ).toEqual(['sidebar']);
        // The edge group restores auto-hidden (collapsed), so its panel is
        // present in the DOM but not visible — the content component is still
        // rebuilt, and the docked `main` panel renders.
        await expect(
            page.locator('.dv-test-panel', { hasText: 'sidebar' })
        ).toBeAttached();
        await expect(
            page.locator('.dv-test-panel', { hasText: 'main' })
        ).toBeVisible();
    });

    test('a tab group chip round-trips with its label', async ({ page }) => {
        await ready(page);
        await page.evaluate(() => (window as any).__dv.setupTabGroupChip());
        await expect(page.locator('.dv-tab-group-chip')).toHaveText(
            'Monitoring'
        );

        const json = await snapshot(page);
        expect(json).toContain('tabGroups');

        await reloadAndRestore(page, json);

        await expect(page.locator('.dv-tab-group-chip')).toHaveText(
            'Monitoring'
        );
    });
});
