import { test, expect, Page } from '@playwright/test';

/**
 * Sizing an edge group through its api (`groupApi.setSize`) — issue #1613,
 * where the call was silently dropped and only the sash could move the rail.
 *
 * Real-browser only: the shell splitview clamps a resize against the space it
 * actually has, and the first layout of a real dockview is driven by a
 * ResizeObserver — so both the pixel outcome and the "sized before the browser
 * has laid anything out" ordering need a real document. jsdom can only stand in
 * for that with explicit `layout()` calls.
 */
test.describe('edge group resize (api)', () => {
    const setup = async (page: Page, position: string = 'left') => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(
            (p) => (window as any).__dv.setupEdgeSizing(p),
            position
        );
    };

    const edgeBox = async (page: Page, id: string) => {
        const box = await page
            .locator(`[data-testid="dv-edge-group-${id}"]`)
            .boundingBox();
        return box!;
    };

    const setSize = (page: Page, position: string, size: object) =>
        page.evaluate(
            ([p, s]) => (window as any).__dv.setEdgeGroupSize(p, s),
            [position, size] as const
        );

    test('setSize({ width }) resizes a left edge group', async ({ page }) => {
        await setup(page, 'left');
        expect((await edgeBox(page, 'edge-left')).width).toBeCloseTo(260, -1);

        await setSize(page, 'left', { width: 420 });

        expect((await edgeBox(page, 'edge-left')).width).toBeCloseTo(420, -1);
    });

    test('setSize({ height }) resizes a bottom edge group', async ({
        page,
    }) => {
        await setup(page, 'bottom');
        const before = await edgeBox(page, 'edge-bottom');
        expect(before.height).toBeCloseTo(260, -1);

        await setSize(page, 'bottom', { height: 150 });

        const after = await edgeBox(page, 'edge-bottom');
        expect(after.height).toBeCloseTo(150, -1);
        // the rail spans the width of the shell either way; only its own axis moved
        expect(after.width).toBeCloseTo(before.width, -1);
    });

    test('the centre content gives up exactly the width the rail gains', async ({
        page,
    }) => {
        await setup(page, 'left');
        // the docked content area (the gridview the shell insets), not one of
        // the two groups inside it — they share the 160px between them
        const centre = page.locator('.dv-dockview');
        const before = (await centre.boundingBox())!;

        await setSize(page, 'left', { width: 420 });

        const after = (await centre.boundingBox())!;
        expect(before.width - after.width).toBeCloseTo(160, -1);
        expect(after.x - before.x).toBeCloseTo(160, -1);
    });

    test('setSize on a collapsed edge group applies when it expands', async ({
        page,
    }) => {
        await setup(page, 'left');
        await page.evaluate(() =>
            (window as any).__dv.collapseEdgeGroup('left')
        );
        const collapsed = await edgeBox(page, 'edge-left');
        expect(collapsed.width).toBeLessThan(60); // the tab strip only

        await setSize(page, 'left', { width: 420 });

        // still a strip: a collapsed group keeps its footprint
        expect((await edgeBox(page, 'edge-left')).width).toBeCloseTo(
            collapsed.width,
            -1
        );

        await page.evaluate(() => (window as any).__dv.expandEdgeGroup('left'));
        expect((await edgeBox(page, 'edge-left')).width).toBeCloseTo(420, -1);
    });

    test('initialSize is honoured for an edge group added before the first layout', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);

        // built synchronously: the ResizeObserver has not fired for this
        // dockview when the edge group is added
        await page.evaluate(() => (window as any).__dv.setupPreLayoutEdge());

        await expect(
            page.locator('[data-testid="dv-edge-group-pre-edge"]')
        ).toBeVisible();
        expect((await edgeBox(page, 'pre-edge')).width).toBeCloseTo(260, -1);
    });

    test('a setSize made before the first layout lands once it happens', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);

        await page.evaluate(() =>
            (window as any).__dv.setupPreLayoutEdge(420)
        );

        await expect(
            page.locator('[data-testid="dv-edge-group-pre-edge"]')
        ).toBeVisible();
        expect((await edgeBox(page, 'pre-edge')).width).toBeCloseTo(420, -1);
    });
});
