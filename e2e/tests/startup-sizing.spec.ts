import { test, expect } from '@playwright/test';

/**
 * A layout built synchronously after `createDockview` - the shape the vanilla
 * docs template uses - must size against the container, not against zero.
 *
 * The ResizeObserver only reports asynchronously, so without an initial
 * measurement every split in that window resolves against a zero-sized
 * component and collapses to the minimum group width, permanently: a later
 * resize does not recover the proportions. Real-browser only; jsdom computes
 * no layout.
 */
test.describe('startup sizing', () => {
    const boxes = (page) =>
        page.$$eval('.dv-groupview', (nodes) =>
            nodes.map((node) => {
                const rect = node.getBoundingClientRect();
                return {
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                };
            })
        );

    test('panels added straight after creation split the container evenly', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/startup-sizing.html');
        await page.waitForFunction(() => (window as any).__ready === true);

        const viewport = page.viewportSize()!;
        const groups = await boxes(page);
        expect(groups).toHaveLength(3);

        // no group collapsed to the 100px minimum
        for (const group of groups) {
            expect(group.width).toBeGreaterThan(150);
        }

        // panel_1 / panel_3 stack in the left column, panel_2 fills the right;
        // the vertical split is halfway down and the columns are even
        const widths = groups.map((group) => group.width).sort((a, b) => a - b);
        expect(widths[0]).toBeCloseTo(viewport.width / 2, -1);
        expect(widths[2]).toBeCloseTo(viewport.width / 2, -1);
    });

    test('a splitview built the same way distributes its views evenly', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/startup-sizing.html?component=splitview');
        await page.waitForFunction(() => (window as any).__ready === true);

        const viewport = page.viewportSize()!;
        const views = await page.$$eval('.dv-view', (nodes) =>
            nodes.map((node) =>
                Math.round(node.getBoundingClientRect().width)
            )
        );

        expect(views).toHaveLength(3);
        for (const width of views) {
            expect(width).toBeCloseTo(viewport.width / 3, -1);
        }
    });

    test('a gridview built the same way splits its container evenly', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/startup-sizing.html?component=gridview');
        await page.waitForFunction(() => (window as any).__ready === true);

        const viewport = page.viewportSize()!;
        const views = await page.$$eval('.dv-view', (nodes) =>
            nodes.map((node) =>
                Math.round(node.getBoundingClientRect().width)
            )
        );

        expect(views).toHaveLength(2);
        for (const width of views) {
            expect(width).toBeCloseTo(viewport.width / 2, -1);
        }
    });
});
