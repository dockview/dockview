import { test, expect } from '@playwright/test';

/**
 * Drag-revealed, zero-footprint edges (`autoEdgeGroups`). Real-browser only:
 * the two-band routing reads live drop geometry (which jsdom can't produce) and
 * the outcome depends on a real pointer drag. The harness uses the pointer DnD
 * backend and turns the compass off so the affordance's own resolver drives the
 * edge routing.
 *
 * Two bands: dropping in the OUTER band (hugging the layout edge) docks the
 * panel as a new edge group (shown by the `.dv-auto-edge-band` indicator line);
 * dropping just INSIDE it splits the grid as usual.
 */
test.describe('auto edge groups (drag reveal)', () => {
    const setup = async (page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupAutoEdgeGroups());
    };

    const mainContent = (page) =>
        page.locator('.dv-content-container', {
            has: page.locator('.dv-test-panel', { hasText: 'main' }),
        });
    const sideTab = (page) => page.locator('.dv-tab', { hasText: 'side' });

    const startDrag = async (page, tab) => {
        await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
        await page.mouse.down();
        // nudge to start the drag
        await page.mouse.move(
            tab.x + tab.width / 2 + 6,
            tab.y + tab.height / 2
        );
    };

    test('dragging a tab to the far edge reveals a collapsed edge group with the panel', async ({
        page,
    }) => {
        await setup(page);
        expect(
            await page.evaluate(() =>
                (window as any).__dv.edgeGroupExists('left')
            )
        ).toBe(false);

        const tab = (await sideTab(page).boundingBox())!;
        const content = (await mainContent(page).boundingBox())!;
        const outerX = content.x + 5; // within the 16px outer band
        const midY = content.y + content.height / 2;

        await startDrag(page, tab);
        await page.mouse.move(outerX, midY, { steps: 20 });

        // the outer band shows the edge indicator line (not the split overlay)
        await expect(page.locator('.dv-auto-edge-band')).toBeVisible();

        await page.mouse.up();

        // a collapsed left edge group now exists, holding the dragged panel —
        // the toggled state stays closed (the drop adds a tab to the strip)
        await expect
            .poll(() =>
                page.evaluate(() =>
                    (window as any).__dv.edgeGroupExists('left')
                )
            )
            .toBe(true);
        expect(
            await page.evaluate(() =>
                (window as any).__dv.edgeGroupCollapsed('left')
            )
        ).toBe(true);
        expect(
            await page.evaluate(() =>
                (window as any).__dv.edgeGroupPanelIds('left')
            )
        ).toContain('side');
        await expect(page.locator('.dv-auto-edge-band')).toHaveCount(0);
    });

    test('dropping just inside the edge splits the grid instead (no edge group, no indicator)', async ({
        page,
    }) => {
        await setup(page);

        const tab = (await sideTab(page).boundingBox())!;
        const content = (await mainContent(page).boundingBox())!;
        const innerX = content.x + 60; // past the outer band → normal split
        const midY = content.y + content.height / 2;

        await startDrag(page, tab);
        await page.mouse.move(innerX, midY, { steps: 20 });

        // inner band → core split overlay, never the edge indicator line
        await expect(page.locator('.dv-auto-edge-band')).toHaveCount(0);

        await page.mouse.up();

        // no edge group was created (the panel split the primary grid)
        expect(
            await page.evaluate(() =>
                (window as any).__dv.edgeGroupExists('left')
            )
        ).toBe(false);
    });

    test('with the compass ALSO on, the far edge still reveals an edge group', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() =>
            (window as any).__dv.setupAutoEdgeGroupsWithCompass()
        );

        const tab = (await sideTab(page).boundingBox())!;
        const content = (await mainContent(page).boundingBox())!;
        const outerX = content.x + 5; // true outer band
        const midY = content.y + content.height / 2;

        await startDrag(page, tab);
        await page.mouse.move(outerX, midY, { steps: 20 });

        // the edge-group indicator wins over the compass at the true edge
        await expect(page.locator('.dv-auto-edge-band')).toBeVisible();
        await page.mouse.up();

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
        ).toContain('side');
    });
});
