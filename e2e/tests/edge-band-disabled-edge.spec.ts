import { test, expect, Page } from '@playwright/test';

/**
 * `dockToEdgeGroups` widens the root edge activation band so the drag-reveal
 * affordance's outer and inner sub-bands both fit. The widening applies only
 * to the enabled edges: a disabled edge keeps the default 10px band, or it
 * covers the tab bar of every group touching that edge.
 *
 * HTML5 backend unless stated: its `dragover` listeners run in the capture
 * phase, so the root target sees the event before any tab. Real-browser only:
 * the outcome depends on live header geometry.
 */
const setup = async (
    page: Page,
    edges: unknown,
    dnd: 'html5' | 'pointer' = 'html5'
) => {
    await page.goto(`/e2e/fixtures/index.html?dnd=${dnd}&compass=0`);
    await page.waitForFunction(() => (window as any).__ready === true);
    await page.evaluate(
        (e) => (window as any).__dv.setupTopRowWithEdgeGroups(e),
        edges
    );
};

const groupPanelIds = (page: Page) =>
    page.evaluate(() => (window as any).__dv.groupPanelIds());

/** Top (px) of the group holding the tab `id`. */
const groupTop = async (page: Page, id: string) =>
    (await page
        .locator('.dv-groupview', {
            has: page.locator('.dv-tab', { hasText: new RegExp(`^${id}$`) }),
        })
        .boundingBox())!.y;

/** Drag tab `from` and drop it `dy` px below the top of tab `onto`. */
const dragTabOntoTab = async (
    page: Page,
    from: string,
    onto: string,
    dy: number
) => {
    const src = (await page
        .locator('.dv-tab', { hasText: new RegExp(`^${from}$`) })
        .boundingBox())!;
    const dst = (await page
        .locator('.dv-tab', { hasText: new RegExp(`^${onto}$`) })
        .boundingBox())!;

    await page.mouse.move(src.x + 10, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + 18, src.y + src.height / 2, { steps: 3 });
    await page.mouse.move(dst.x + 10, dst.y + dy, { steps: 20 });
    return dst;
};

test('a tab dropped on a top-row tab bar joins that group when the top edge is disabled', async ({
    page,
}) => {
    await setup(page, { left: true, right: true, bottom: true });
    expect(await groupPanelIds(page)).toEqual([
        ['a1', 'a2'],
        ['b1', 'b2'],
    ]);

    const rootBox = (await page.locator('.dv-dockview').boundingBox())!;
    // Past the default 10px band, within the widened 32px one.
    const dst = await dragTabOntoTab(page, 'a2', 'b1', 20);
    expect(dst.y + 20 - rootBox.y).toBeGreaterThan(10);
    expect(dst.y + 20 - rootBox.y).toBeLessThan(32);

    // The tab's own drop target is showing, not the root's top-edge overlay.
    await expect(
        page.locator('.dv-drop-target-selection.dv-drop-target-top')
    ).toHaveCount(0);

    await page.mouse.up();

    await expect
        .poll(() => groupPanelIds(page))
        .toEqual([['a1'], ['a2', 'b1', 'b2']]);
});

/**
 * On an enabled edge a group header wins over the root band, under both
 * backends, so a tab bar touching the edge stays a tab bar. Docking stays
 * reachable over it through the drag-time edge drop strip: the outermost 8px
 * of the content area, layered above the headers.
 */
for (const dnd of ['html5', 'pointer'] as const) {
    test(`${dnd}: a tab dropped 20px into a tab bar on an enabled top edge joins that group`, async ({
        page,
    }) => {
        await setup(page, { top: true }, dnd);

        await dragTabOntoTab(page, 'a2', 'b1', 20);
        await expect(
            page.locator('.dv-drop-target-selection.dv-drop-target-top')
        ).toHaveCount(0);
        await expect(page.locator('.dv-auto-edge-band')).toHaveCount(0);
        await page.mouse.up();

        await expect
            .poll(() => groupPanelIds(page))
            .toEqual([['a1'], ['a2', 'b1', 'b2']]);
        expect(
            await page.evaluate(() =>
                (window as any).__dv.edgeGroupExists('top')
            )
        ).toBe(false);
    });

    test(`${dnd}: a tab dropped on the edge strip over a top-row header docks a top edge group`, async ({
        page,
    }) => {
        await setup(page, { top: true }, dnd);

        await dragTabOntoTab(page, 'a2', 'b1', 3);
        await expect(page.locator('.dv-edge-drop-strip')).toHaveCount(1);
        await expect(page.locator('.dv-auto-edge-band')).toBeVisible();
        await page.mouse.up();

        await expect
            .poll(() =>
                page.evaluate(() =>
                    (window as any).__dv.edgeGroupPanelIds('top')
                )
            )
            .toEqual(['a2']);
        // The strips are gone once the drag ends.
        await expect(page.locator('.dv-edge-drop-strip')).toHaveCount(0);
    });
}

test('no edge drop strip is shown on a disabled edge', async ({ page }) => {
    await setup(page, { left: true, right: true, bottom: true });

    await dragTabOntoTab(page, 'a2', 'b1', 3);
    const positions = await page.evaluate(() =>
        Array.from(
            document.querySelectorAll<HTMLElement>('.dv-edge-drop-strip')
        ).map((el) => el.dataset.position)
    );
    await page.mouse.up();
    expect(positions.sort()).toEqual(['bottom', 'left', 'right']);
});

test('an enabled edge still gets the widened band over panel content', async ({
    page,
}) => {
    await setup(page, { left: true });

    const rootBox = (await page.locator('.dv-dockview').boundingBox())!;
    const src = (await page
        .locator('.dv-tab', { hasText: /^b2$/ })
        .boundingBox())!;
    await page.mouse.move(src.x + 10, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + 18, src.y + src.height / 2, { steps: 3 });
    // Past the default 10px band and the 16px outer band, within the 32px one.
    await page.mouse.move(rootBox.x + 20, rootBox.y + rootBox.height / 2, {
        steps: 20,
    });
    await expect(
        page.locator('.dv-drop-target-selection.dv-drop-target-left')
    ).toHaveCount(1);
    await page.mouse.up();

    // The inner sub-band: a grid split at the left edge, not an edge group.
    await expect
        .poll(() => groupPanelIds(page))
        .toEqual([['a1', 'a2'], ['b1'], ['b2']]);
    expect(
        await page.evaluate(() => (window as any).__dv.edgeGroupExists('left'))
    ).toBe(false);
});

test('a drop hugging a disabled top edge splits the grid, it does not create an edge group', async ({
    page,
}) => {
    await setup(page, { left: true, right: true, bottom: true });

    const rootBox = (await page.locator('.dv-dockview').boundingBox())!;
    const src = (await page
        .locator('.dv-tab', { hasText: /^a2$/ })
        .boundingBox())!;
    await page.mouse.move(src.x + 10, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + 18, src.y + src.height / 2, { steps: 3 });
    // Inside the default band and the affordance's 16px outer band.
    await page.mouse.move(rootBox.x + rootBox.width * 0.7, rootBox.y + 4, {
        steps: 20,
    });

    await expect(page.locator('.dv-auto-edge-band')).toHaveCount(0);
    await page.mouse.up();

    await expect
        .poll(() => groupPanelIds(page))
        .toEqual([['a1'], ['b1', 'b2'], ['a2']]);
    // A grid split above the row.
    expect(await groupTop(page, 'a2')).toBeLessThan(await groupTop(page, 'b1'));
    expect(
        await page.evaluate(() => (window as any).__dv.edgeGroupExists('top'))
    ).toBe(false);
});
