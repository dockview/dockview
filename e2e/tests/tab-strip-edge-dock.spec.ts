import { test, expect, Page } from '@playwright/test';

/**
 * A pointer release inside the tab strip must commit one action, not two.
 *
 * `PointerDragController._findTargetUnder` returns the innermost *registered*
 * ancestor under the cursor. The strip registers pointer targets on tabs and
 * the void container only, so a release on the strip that is over neither -
 * the padding, or the gap the smooth-reorder animation opens - used to walk up
 * to the layout root, whose edge target docked the panel as a new group while
 * `handlePointerDragEnd` also committed the reorder.
 *
 * Real-browser only: jsdom has no layout engine, so `elementsFromPoint` always
 * returns `[]` and the unit suite has to stub it. Only here can the release
 * point be resolved against live geometry, which is the whole mechanism.
 *
 * `?dndEdges=120` widens the root's edge activation band so the strip falls
 * inside it; at the 10px default the strip sits clear of the band and the
 * double action is not reachable.
 */
const setup = async (page: Page) => {
    await page.goto('/e2e/fixtures/index.html?smooth=1&dndEdges=120&compass=0');
    await page.waitForFunction(() => (window as any).__ready === true);
    await page.evaluate(() => {
        for (const id of ['a', 'b', 'c']) {
            (window as any).__dv.addPanel(id);
        }
    });
};

const tabTitles = (page: Page) =>
    page.evaluate(() =>
        Array.from(document.querySelectorAll('.dv-tabs-container .dv-tab')).map(
            (el) => el.textContent?.trim() ?? ''
        )
    );

/**
 * Find a point in the strip that hits the tabs container itself rather than a
 * tab - the gap the drag has opened, or padding between tabs. Searches outward
 * from `nearX` so the release stays where the drag actually went, which is what
 * decides the reorder index. Returns null when the strip has no such point,
 * meaning the bug would be unreachable here.
 */
const gapPoint = (page: Page, nearX: number) =>
    page.evaluate((nx) => {
        const list = document.querySelector('.dv-tabs-container')!;
        const r = list.getBoundingClientRect();
        const y = r.y + r.height / 2;
        const lo = Math.ceil(r.x) + 1;
        const hi = Math.floor(r.right) - 1;
        for (let d = 0; d <= hi - lo; d++) {
            for (const x of [Math.round(nx) - d, Math.round(nx) + d]) {
                if (x < lo || x > hi) {
                    continue;
                }
                if (document.elementFromPoint(x, y) === list) {
                    return { x, y };
                }
            }
        }
        return null;
    }, nearX);

test('a tab released in the strip reorders without also docking at the edge', async ({
    page,
}) => {
    await setup(page);

    expect(await tabTitles(page)).toEqual(['a', 'b', 'c']);
    expect(await page.locator('.dv-groupview').count()).toBe(1);

    const a = (await page
        .locator('.dv-tab', { hasText: /^a$/ })
        .boundingBox())!;
    const c = (await page
        .locator('.dv-tab', { hasText: /^c$/ })
        .boundingBox())!;

    // Drag `a` to the far end of the strip so the reorder animation opens a
    // gap behind it, then release into that gap.
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2, {
        steps: 3,
    });
    await page.mouse.move(c.x + c.width - 4, c.y + c.height / 2, {
        steps: 20,
    });

    const gap = await gapPoint(page, c.x + c.width - 4);
    expect(
        gap,
        'no point inside the strip resolves to the tabs container; the release ' +
            'that triggers the double action is unreachable and this test proves nothing'
    ).not.toBeNull();

    // The strip must sit inside the root's edge band, or the root target was
    // never in play and a green result would mean nothing.
    const rootBox = (await page.locator('.dv-dockview').boundingBox())!;
    expect(gap!.y - rootBox.y).toBeLessThan(120);

    await page.mouse.move(gap!.x, gap!.y, { steps: 4 });

    // The gap tracks the cursor, so re-confirm the point still resolves to the
    // tabs container now that the cursor has settled on it - that is the exact
    // hit-test the fix changes.
    const onStrip = await page.evaluate(
        (p) =>
            document.elementFromPoint(p.x, p.y) ===
            document.querySelector('.dv-tabs-container'),
        gap!
    );
    expect(onStrip, 'release point is over a tab, not the strip itself').toBe(
        true
    );

    await page.mouse.up();

    // The reorder committed - `a` moved off the front...
    await expect
        .poll(async () => (await tabTitles(page))[0])
        .not.toBe('a');
    // ...all three tabs are still in the one strip, and nothing docked at the
    // layout edge as a second action.
    expect((await tabTitles(page)).sort()).toEqual(['a', 'b', 'c']);
    expect(await page.locator('.dv-groupview').count()).toBe(1);
});
