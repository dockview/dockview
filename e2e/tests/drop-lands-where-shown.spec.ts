import { test, expect, Page } from '@playwright/test';

/**
 * A panel dropped on a group's edge must land in the region the drop overlay
 * highlighted — inside that group, taking the half it drew — rather than
 * re-sharing the whole row/column it sits in.
 *
 * Regression for #1612 point 3: the new group was sized by `Sizing.Distribute`,
 * so in a column of two it took a third and started well above the group it was
 * dropped on, straddling the boundary and shrinking the untouched neighbour.
 * Reported as "the highlight resolved to the group above the target".
 *
 * Real-browser only: this is drop-zone resolution against live geometry.
 */
const quad = async (page: Page) => {
    await page.goto('/e2e/fixtures/index.html?compass=0');
    await page.waitForFunction(() => (window as any).__ready === true);
    await page.evaluate(() => (window as any).__dv.setupQuad());
};

const box = async (page: Page, tab: string) =>
    (await page
        .locator('.dv-groupview', {
            has: page.locator('.dv-tab', { hasText: new RegExp(`^${tab}$`) }),
        })
        .boundingBox())!;

test('a panel dropped on a group’s top edge lands inside that group', async ({
    page,
}) => {
    await quad(page);
    const target = await box(page, 'br');
    const above = await box(page, 'tr');

    const tab = (await page.locator('.dv-tab', { hasText: /^tl$/ }).boundingBox())!;
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
    await page.mouse.down();
    await page.mouse.move(tab.x + tab.width / 2 + 8, tab.y + tab.height / 2, { steps: 3 });
    // the target's top quadrant, clear of its tab strip
    await page.mouse.move(target.x + target.width / 2, target.y + 45, { steps: 18 });

    // The overlay previews the target's top half, over the target itself.
    const overlay = (await page.evaluate(() => {
        const el = document.querySelector(
            '.dv-drop-target-anchor, .dv-drop-target-selection'
        );
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { y: r.y, height: r.height };
    }))!;
    expect(overlay).not.toBeNull();
    expect(overlay.y).toBeGreaterThanOrEqual(target.y - 1);

    await page.mouse.up();
    await expect
        .poll(async () => (await box(page, 'tl')).height)
        .toBeLessThan(target.height);

    const landed = await box(page, 'tl');
    // Inside the target's old footprint, taking about its top half…
    expect(landed.y).toBeGreaterThanOrEqual(target.y - 1);
    expect(landed.y + landed.height).toBeLessThanOrEqual(
        target.y + target.height / 2 + 2
    );
    // …and the group above it is left alone.
    const untouched = await box(page, 'tr');
    expect(untouched.y).toBeCloseTo(above.y, 0);
    expect(untouched.height).toBeCloseTo(above.height, 0);
});
