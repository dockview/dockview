import { test, expect, Page } from '@playwright/test';

/**
 * Tab strip vs. the root edge drop target on the pointer backend.
 *
 * `PointerDragController` routes a release to the innermost *registered*
 * target. Inside the strip that is the tabs, the group chips and the void
 * container, so a release over none of those — the hole the smooth reorder
 * opens where the dragged tab sat — resolves to the layout root's edge target,
 * docking the group at the layout edge on the same release that
 * `handlePointerDragEnd` commits the reorder. `Tabs` registers a declining
 * stop on the strip to keep the root out of that walk.
 *
 * Real-browser only. The unit coverage stubs `elementsFromPoint` and every
 * rect, so it asserts the geometry rather than observing it; only a real layout
 * shows that the hole exists and that the walk reaches the root through it.
 *
 * `?dndEdges=120` widens the root's activation band so the header sits inside
 * it — at the 10px default only the header's top edge overlaps, which makes the
 * release point hostage to theme metrics.
 */
test.describe('tab strip drop precedence (pointer)', () => {
    const tabTitles = (page: Page) =>
        page.evaluate(() => (window as any).__dv.tabTitles());

    /**
     * Scan the strip for a point that is inside `.dv-tabs-container` but not
     * over a tab or a chip — the animation hole. Returns null when the tabs
     * cover the strip completely, which would mean this seam is unreachable.
     */
    const findHoleInStrip = (page: Page) =>
        page.evaluate(() => {
            const strip = document.querySelector(
                '.dv-tabs-container'
            ) as HTMLElement;
            const box = strip.getBoundingClientRect();
            // Above the 4px scrollbar thumb, which is a sibling of the strip
            // and hit-tests to the scrollable wrapper, not to the strip.
            const y = box.top + (box.height - 4) / 2;
            for (let x = box.left + 1; x < box.right - 1; x += 2) {
                const el = document.elementsFromPoint(x, y)[0];
                if (el && !el.closest('.dv-tab') && strip.contains(el)) {
                    return { x, y };
                }
            }
            return null;
        });

    test('a release in the strip reorders without also docking at the edge', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html?smooth=1&dndEdges=120');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => {
            for (const id of ['a', 'b', 'c']) (window as any).__dv.addPanel(id);
        });
        expect(await tabTitles(page)).toEqual(['a', 'b', 'c']);
        expect(
            await page.evaluate(() => (window as any).__dv.groupCount())
        ).toBe(1);

        // Drag 'c' leftwards into the strip; the source tab collapses and the
        // gap follows the cursor, so the hole is somewhere left of centre.
        const c = (await page
            .locator('.dv-tab', { hasText: 'c' })
            .boundingBox())!;
        const strip = (await page
            .locator('.dv-tabs-container')
            .boundingBox())!;
        await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
        await page.mouse.down();
        await page.mouse.move(c.x + c.width / 2 + 6, c.y + c.height / 2, {
            steps: 3,
        });
        await page.mouse.move(
            strip.x + strip.width * 0.25,
            strip.y + strip.height / 2,
            { steps: 14 }
        );

        const hole = await findHoleInStrip(page);
        expect(
            hole,
            'no point inside the strip is free of tabs, so the root edge target is unreachable through it'
        ).not.toBeNull();

        await page.mouse.move(hole!.x, hole!.y, { steps: 4 });
        await page.mouse.up();

        // One action for the one release: the reorder. Had the root edge
        // target also fired, the drop would have split 'c' into a second group.
        // The scan returns the leftmost free point, which is ahead of 'a'.
        await expect.poll(() => tabTitles(page)).toEqual(['c', 'a', 'b']);
        expect(
            await page.evaluate(() => (window as any).__dv.groupCount())
        ).toBe(1);
    });
});
