import { test, expect } from '@playwright/test';

/**
 * Smart Guides — alignment guides + magnetic snapping for floating groups.
 * Real-browser only: the snap reads the live container/overlay geometry the
 * float drag loop works in, which jsdom (no layout) can't produce.
 *
 * Dragging one float so an edge/center lines up with another float (within
 * `snapDistance`) snaps it and paints alignment guides; bringing a float flush
 * over another suggests a dock/merge, committed on drop; guides are torn down
 * on drop.
 */
test.describe('smart guides (floating snap)', () => {
    const setup = async (page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupSmartGuides());
    };

    const overlayWith = (page, text: string) =>
        page.locator('.dv-resize-container', {
            has: page.locator('.dv-test-panel', { hasText: text }),
        });

    // Rects of the guide lines currently being painted (pooled hidden ones out).
    const visibleGuides = (
        page
    ): Promise<{ x: number; y: number; w: number; h: number }[]> =>
        page.evaluate(() =>
            Array.from(
                document.querySelectorAll<HTMLElement>('.dv-smart-guide')
            )
                .filter((l) => l.style.display === 'block')
                .map((l) => {
                    const r = l.getBoundingClientRect();
                    return { x: r.x, y: r.y, w: r.width, h: r.height };
                })
        );

    const near = (a: number, b: number, tol = 2): boolean =>
        Math.abs(a - b) < tol;

    test('snaps a dragged float edge to another float and draws a guide', async ({
        page,
    }) => {
        await setup(page);

        const mover = overlayWith(page, 'mover');
        const target = overlayWith(page, 'target');
        const handle = mover.locator('.dv-floating-titlebar');

        const targetBox = (await target.boundingBox())!;
        const moverBox = (await mover.boundingBox())!;
        const tb = (await handle.boundingBox())!;

        const startX = tb.x + tb.width / 2;
        const startY = tb.y + tb.height / 2;
        const grab = startX - moverBox.x;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // Tiny nudge locks a clean grab offset before the long drag.
        await page.mouse.move(startX + 1, startY);
        // Drag left only (Y unchanged → the floats never vertically overlap, so
        // no dock suggestion): land the left edge ~4px right of the target's.
        await page.mouse.move(targetBox.x + grab + 5, startY, { steps: 20 });

        const guides = await visibleGuides(page);
        expect(guides.some((g) => g.w <= 2 && near(g.x, targetBox.x))).toBe(
            true
        );

        const snapped = (await mover.boundingBox())!;
        expect(near(snapped.x, targetBox.x)).toBe(true);

        await page.mouse.up();

        // guides are an interaction overlay — gone once the drag ends
        await expect(page.locator('.dv-smart-guides')).toHaveCount(0);
        // still two separate floats — an edge alignment is not a merge
        expect(
            await page.evaluate(() => (window as any).__dv.floatingCount())
        ).toBe(2);
    });

    test('snap-together: dropping a float flush over another merges them', async ({
        page,
    }) => {
        await setup(page);
        expect(
            await page.evaluate(() => (window as any).__dv.floatingCount())
        ).toBe(2);

        const mover = overlayWith(page, 'mover');
        const target = overlayWith(page, 'target');
        const handle = mover.locator('.dv-floating-titlebar');

        const targetBox = (await target.boundingBox())!;
        const moverBox = (await mover.boundingBox())!;
        const tb = (await handle.boundingBox())!;

        const startX = tb.x + tb.width / 2;
        const startY = tb.y + tb.height / 2;
        const grabX = startX - moverBox.x;
        const grabY = startY - moverBox.y;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 1, startY + 1);
        // Drag the mover on top of the target (tops flush, fully overlapping) —
        // a tabset-merge suggestion.
        await page.mouse.move(
            targetBox.x + grabX + 4,
            targetBox.y + grabY + 4,
            { steps: 25 }
        );

        await expect(page.locator('.dv-smart-guide-preview')).toBeVisible();

        await page.mouse.up();

        // the two floats merged into one (mover docked into the target)
        await expect
            .poll(() =>
                page.evaluate(() => (window as any).__dv.floatingCount())
            )
            .toBe(1);
        await expect(page.locator('.dv-smart-guides')).toHaveCount(0);
    });

    test('holding Alt suspends snapping (the float follows the pointer)', async ({
        page,
    }) => {
        await setup(page);

        const mover = overlayWith(page, 'mover');
        const target = overlayWith(page, 'target');
        const handle = mover.locator('.dv-floating-titlebar');

        const targetBox = (await target.boundingBox())!;
        const moverBox = (await mover.boundingBox())!;
        const tb = (await handle.boundingBox())!;
        const startX = tb.x + tb.width / 2;
        const startY = tb.y + tb.height / 2;
        const grab = startX - moverBox.x;

        await page.keyboard.down('Alt');
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 1, startY);
        // would normally snap the left edge onto the target's — but Alt is held
        await page.mouse.move(targetBox.x + grab + 5, startY, { steps: 20 });

        // no guides, and the edge is NOT pulled onto the target (stays ~5px off)
        expect(await visibleGuides(page)).toHaveLength(0);
        const box = (await mover.boundingBox())!;
        expect(box.x).toBeGreaterThan(targetBox.x + 2);

        await page.mouse.up();
        await page.keyboard.up('Alt');
    });

    test('a magnetic snap fires the onDidSnapFloat event', async ({ page }) => {
        await setup(page);
        // Subscribe to the public snap event before dragging.
        await page.evaluate(() => (window as any).__dv.recordSnaps());

        const mover = overlayWith(page, 'mover');
        const target = overlayWith(page, 'target');
        const handle = mover.locator('.dv-floating-titlebar');

        const targetBox = (await target.boundingBox())!;
        const moverBox = (await mover.boundingBox())!;
        const tb = (await handle.boundingBox())!;
        const startX = tb.x + tb.width / 2;
        const startY = tb.y + tb.height / 2;
        const grab = startX - moverBox.x;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 1, startY);
        // Snap the left edge onto the target's (the X axis).
        await page.mouse.move(targetBox.x + grab + 5, startY, { steps: 20 });
        await page.mouse.up();

        const snaps = await page.evaluate(() => (window as any).__dv.snaps());
        expect(snaps.length).toBeGreaterThan(0);
        expect(snaps.some((s: any) => s.axes.includes('x'))).toBe(true);
    });

    test('no guide while dragging away from every edge', async ({ page }) => {
        await setup(page);

        const mover = overlayWith(page, 'mover');
        const handle = mover.locator('.dv-floating-titlebar');
        const tb = (await handle.boundingBox())!;
        const startX = tb.x + tb.width / 2;
        const startY = tb.y + tb.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // a small drag into open space, away from the target float + edges
        await page.mouse.move(startX + 40, startY + 30, { steps: 8 });

        expect(await visibleGuides(page)).toHaveLength(0);
        await expect(page.locator('.dv-smart-guide-preview')).toHaveCount(0);

        await page.mouse.up();
        await expect(page.locator('.dv-smart-guides')).toHaveCount(0);
    });
});
