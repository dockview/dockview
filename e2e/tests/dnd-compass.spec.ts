import { test, expect } from '@playwright/test';

/**
 * DnD compass — the aim-at-a-cell drop overlay. Real-browser only:
 * it reads the live drop-target geometry the drag loop works in, which jsdom
 * (no layout) can't produce. The harness uses the pointer DnD backend so a
 * panel drag is drivable.
 */
test.describe('DnD compass', () => {
    const setup = async (page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupDndCompass());
    };

    const rightContent = (page) =>
        page.locator('.dv-content-container', {
            has: page.locator('.dv-test-panel', { hasText: 'right' }),
        });

    test('dragging a tab over a group shows the compass and a cell-drop docks', async ({
        page,
    }) => {
        await setup(page);
        expect(
            await page.evaluate(() => (window as any).__dv.groupCount())
        ).toBe(2);

        const leftTab = page.locator('.dv-tab', { hasText: 'left' });
        const tab = (await leftTab.boundingBox())!;
        const content = (await rightContent(page).boundingBox())!;
        const cx = content.x + content.width / 2;
        const cy = content.y + content.height / 2;

        await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
        await page.mouse.down();
        // nudge to start the drag, then move onto the right group's centre
        await page.mouse.move(
            tab.x + tab.width / 2 + 6,
            tab.y + tab.height / 2
        );
        await page.mouse.move(cx, cy, { steps: 20 });

        // the compass cross is painted over the hovered group (5 inner + 4 outer)
        await expect(page.locator('.dv-dnd-compass')).toBeVisible();
        expect(await page.locator('.dv-dnd-compass-cell').count()).toBe(9);
        expect(await page.locator('.dv-dnd-compass-cell-edge').count()).toBe(4);

        // drop on the centre cell → merge into the right group
        await page.mouse.up();

        // the two groups collapsed into one (left panel tabbed into right)
        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.groupCount()))
            .toBe(1);
        await expect(page.locator('.dv-dnd-compass')).toHaveCount(0);
    });

    test('the compass holds position from an inner to an outer cell', async ({
        page,
    }) => {
        await setup(page);
        const tab = (await page
            .locator('.dv-tab', { hasText: 'left' })
            .boundingBox())!;
        const content = (await rightContent(page).boundingBox())!;
        const cx = content.x + content.width / 2;
        const cy = content.y + content.height / 2;

        await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
        await page.mouse.down();
        await page.mouse.move(
            tab.x + tab.width / 2 + 6,
            tab.y + tab.height / 2
        );

        const centre = rightContent(page).locator('.dv-dnd-compass-cell-center');

        // hover the centre (inner) cell, record where the cross sits
        await page.mouse.move(cx, cy, { steps: 20 });
        await expect(centre).toBeVisible();
        const atInner = (await centre.boundingBox())!;

        // sweep out to the far outer cell — the cross must not move (the drop
        // target removing its `.dv-drop-target` class once made it re-anchor)
        await page.mouse.move(cx + 84, cy, { steps: 10 });
        // guard the regression is actually exercised: confirm we reached an
        // outer (edge) cell, the only path that removes `.dv-drop-target`
        await expect(
            page.locator('.dv-dnd-compass-cell-edge.dv-dnd-compass-cell-active')
        ).toBeVisible();
        const atOuter = (await centre.boundingBox())!;

        expect(atOuter.x).toBeCloseTo(atInner.x, 0);
        expect(atOuter.y).toBeCloseTo(atInner.y, 0);

        await page.mouse.up();
    });

    test('feedback clears when the cursor moves into a dead zone', async ({
        page,
    }) => {
        await setup(page);
        const tab = (await page
            .locator('.dv-tab', { hasText: 'left' })
            .boundingBox())!;
        const content = (await rightContent(page).boundingBox())!;
        const cx = content.x + content.width / 2;
        const cy = content.y + content.height / 2;
        const band = page.locator('.dv-dnd-compass-edge-preview');

        await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
        await page.mouse.down();
        await page.mouse.move(
            tab.x + tab.width / 2 + 6,
            tab.y + tab.height / 2
        );

        await page.mouse.move(cx + 84, cy, { steps: 10 }); // outer-right cell
        await expect(band).toBeVisible();

        // move far off the cross (still inside the group) — feedback must clear
        await page.mouse.move(cx + 250, cy + 200, { steps: 10 });
        await expect(band).toHaveCount(0);
        await expect(page.locator('.dv-dnd-compass-cell-active')).toHaveCount(0);

        // ...and return when back on the cell
        await page.mouse.move(cx + 84, cy, { steps: 10 });
        await expect(band).toBeVisible();

        await page.mouse.up();
    });

    test('dropping on an outer cell docks against the whole layout (not a merge)', async ({
        page,
    }) => {
        await setup(page);

        const leftTab = page.locator('.dv-tab', { hasText: 'left' });
        const tab = (await leftTab.boundingBox())!;
        const content = (await rightContent(page).boundingBox())!;
        const cx = content.x + content.width / 2;
        const cy = content.y + content.height / 2;
        // the outer ring sits ~2 cells (CELL 38 + GAP 4 = 42 → 84px) out
        const outerRightX = cx + 84;

        await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
        await page.mouse.down();
        await page.mouse.move(
            tab.x + tab.width / 2 + 6,
            tab.y + tab.height / 2
        );
        await page.mouse.move(cx, cy, { steps: 15 });
        await expect(page.locator('.dv-dnd-compass')).toBeVisible();
        // aim at the outer-right cell → it lights up + the layout-edge region
        // is previewed
        await page.mouse.move(outerRightX, cy, { steps: 6 });
        await expect(
            page.locator('.dv-dnd-compass-cell-edge.dv-dnd-compass-cell-active')
        ).toBeVisible();
        await expect(page.locator('.dv-dnd-compass-edge-preview')).toBeVisible();
        await page.mouse.up();

        // the left panel docked to the layout's right edge as its OWN group —
        // still two groups (a centre-cell drop would have merged to one).
        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.groupCount()))
            .toBe(2);
        // ...and it actually moved to that edge: the 'left' tab, which started
        // left of 'right', is now to its right (a no-op dock would leave it left).
        const leftAfter = (await page
            .locator('.dv-tab', { hasText: 'left' })
            .boundingBox())!;
        const rightAfter = (await page
            .locator('.dv-tab', { hasText: 'right' })
            .boundingBox())!;
        expect(leftAfter.x).toBeGreaterThan(rightAfter.x);
        await expect(page.locator('.dv-dnd-compass')).toHaveCount(0);
    });
});
