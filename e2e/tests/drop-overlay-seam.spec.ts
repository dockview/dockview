import { test, expect, Page } from '@playwright/test';

/**
 * The drop overlay must show the placement the drop will actually perform,
 * including on the frame the cursor crosses from a group's tab strip into its
 * content. Real-browser only: the seam is a pointer-backend hit-test handover
 * between two drop targets that share one anchored-overlay container, and
 * jsdom has no layout to produce it.
 *
 * Regression for #1612: the tab strip's reorder controller cleared that shared
 * container unconditionally on drag-leave, so the crossing frame wiped the
 * overlay the content target had just rendered while that target stayed
 * latched on `top` — the drop split above the group with nothing (or the
 * strip's stale "add as a tab here" highlight) shown for it.
 *
 * `?compass=0` uses the plain cursor-quadrant resolution; `abyssSpaced` mounts
 * the overlay in the shared anchor container (`dndOverlayMounting: 'absolute'`).
 */
test('the drop overlay survives the tab-strip → content seam', async ({
    page,
}) => {
    await page.goto('/e2e/fixtures/index.html?compass=0&theme=abyssSpaced');
    await page.waitForFunction(() => (window as any).__ready === true);
    await page.evaluate(() => (window as any).__dv.setupTwoGroups()); // one | two

    const target = (await page.locator('.dv-groupview').nth(1).boundingBox())!;
    const header = (await page
        .locator('.dv-tabs-and-actions-container')
        .nth(1)
        .boundingBox())!;

    const tab = (await page
        .locator('.dv-tab', { hasText: 'one' })
        .boundingBox())!;
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
    await page.mouse.down();
    await page.mouse.move(tab.x + tab.width / 2 + 8, tab.y + tab.height / 2, {
        steps: 3,
    });
    // Park over the target's header, then cross into its content in a single
    // move so the handover happens on the last frame before release.
    const x = target.x + target.width / 2;
    await page.mouse.move(x, header.y + header.height / 2, { steps: 8 });
    await page.mouse.move(x, header.y + header.height + 6);

    // A `top` preview: anchored to the group, about half its height.
    const overlay = await page.evaluate(() => {
        const el = document.querySelector('.dv-drop-target-anchor');
        if (!el) {
            return null;
        }
        const r = el.getBoundingClientRect();
        return { y: r.y, height: r.height };
    });
    expect(overlay).not.toBeNull();
    expect(overlay!.y).toBeCloseTo(target.y, 0);
    expect(overlay!.height).toBeGreaterThan(target.height * 0.4);
    expect(overlay!.height).toBeLessThan(target.height * 0.6);

    await page.mouse.up();

    // …and the drop performs that placement: 'one' lands in a new group
    // directly above the group it was dropped on ('two' moves down).
    const boxes = async () => ({
        one: (await page
            .locator('.dv-groupview', {
                has: page.locator('.dv-tab', { hasText: 'one' }),
            })
            .boundingBox())!,
        two: (await page
            .locator('.dv-groupview', {
                has: page.locator('.dv-tab', { hasText: 'two' }),
            })
            .boundingBox())!,
    });
    await expect
        .poll(async () => {
            const b = await boxes();
            return b.one.y < b.two.y && Math.abs(b.one.x - b.two.x) < 2;
        })
        .toBe(true);
});
