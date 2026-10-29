import { test, expect, Page } from '@playwright/test';

/**
 * #1738: dragging a `renderer: 'always'` panel into a collapsed edge group
 * moved its tab into the strip but left its body painted, and interactive, at
 * the grid cell it came from. Real-browser only: the body is positioned from
 * measured geometry the jsdom tests cannot produce, and the drop itself is a
 * real pointer drag into the edge band.
 */
test.describe("'always' panel dropped into a collapsed edge group (#1738)", () => {
    const setup = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() =>
            (window as any).__dv.setupAlwaysIntoCollapsedEdge()
        );
    };

    const body = (page: Page) =>
        page.locator('.dv-test-panel', { hasText: 'tab' });
    const overlayOf = (page: Page) =>
        page.locator('.dv-render-overlay', {
            has: page.locator('.dv-test-panel', { hasText: 'tab' }),
        });
    const mainContent = (page: Page) =>
        page.locator('.dv-content-container', {
            has: page.locator('.dv-test-panel', { hasText: 'main' }),
        });

    /** What the user would hit at the body's previous centre. */
    const hitsBodyAt = (page: Page, x: number, y: number) =>
        page.evaluate(
            ([x, y]) => {
                const hit = document.elementFromPoint(x, y);
                return !!hit?.closest('.dv-render-overlay');
            },
            [x, y]
        );

    const dragTabToLeftEdge = async (page: Page) => {
        const tab = (await page
            .locator('.dv-tab', { hasText: 'tab' })
            .boundingBox())!;
        const content = (await mainContent(page).boundingBox())!;
        await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
        await page.mouse.down();
        await page.mouse.move(
            tab.x + tab.width / 2 + 6,
            tab.y + tab.height / 2
        );
        // the outer band hugging the content area's left edge docks to the strip
        await page.mouse.move(content.x + 5, content.y + content.height / 2, {
            steps: 20,
        });
        await expect(page.locator('.dv-auto-edge-band')).toBeVisible();
        await page.mouse.up();
    };

    test('the body hides with the collapsed strip instead of staying at its old cell', async ({
        page,
    }) => {
        await setup(page);
        const before = (await body(page).boundingBox())!;
        expect(before.width).toBeGreaterThan(100);
        const cx = before.x + before.width / 2;
        const cy = before.y + before.height / 2;
        expect(await hitsBodyAt(page, cx, cy)).toBe(true);

        await dragTabToLeftEdge(page);

        // the tab joined the collapsed strip
        await expect
            .poll(() =>
                page.evaluate(() =>
                    (window as any).__dv.edgeGroupPanelIds('left')
                )
            )
            .toContain('tab');
        expect(
            await page.evaluate(() =>
                (window as any).__dv.edgeGroupCollapsed('left')
            )
        ).toBe(true);

        // ...and the body went with it: not painted, not clickable
        await expect(overlayOf(page)).toBeHidden();
        expect(await hitsBodyAt(page, cx, cy)).toBe(false);
    });

    test('expanding the edge group shows the body over the edge content box', async ({
        page,
    }) => {
        await setup(page);
        await dragTabToLeftEdge(page);
        await expect(overlayOf(page)).toBeHidden();

        await page.evaluate(() => (window as any).__dv.expandEdge('left'));
        await expect(body(page)).toBeVisible();
        const b = (await body(page).boundingBox())!;
        const content = (await page
            .locator('[data-testid="dv-edge-group-edge-left"] .dv-content-container')
            .boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(content.x - 1);
        expect(b.x + b.width).toBeLessThanOrEqual(content.x + content.width + 1);
        expect(b.y).toBeGreaterThanOrEqual(content.y - 1);
        expect(b.y + b.height).toBeLessThanOrEqual(content.y + content.height + 1);
    });

    test('peeking the collapsed strip shows the body in the slide-out and hides it again on close', async ({
        page,
    }) => {
        await setup(page);
        await dragTabToLeftEdge(page);
        await expect(overlayOf(page)).toBeHidden();

        await page.evaluate(() => (window as any).__dv.peekEdge('left', true));
        await expect(page.locator('.dv-edge-peek')).toBeVisible();
        await expect(body(page)).toBeVisible();
        // once the slide-in settles the body sits inside the reveal window
        const clip = (await page.locator('.dv-edge-peek-clip').boundingBox())!;
        await expect
            .poll(async () => {
                const b = (await body(page).boundingBox())!;
                return (
                    b.x >= clip.x - 1 &&
                    b.x + b.width <= clip.x + clip.width + 1
                );
            })
            .toBe(true);

        await page.evaluate(() => (window as any).__dv.peekEdge('left', false));
        await expect(page.locator('.dv-edge-peek')).toHaveCount(0);
        await expect(overlayOf(page)).toBeHidden();
    });
});
