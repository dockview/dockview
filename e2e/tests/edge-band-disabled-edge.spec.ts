import { test, expect, Page } from '@playwright/test';

/**
 * Root edge band vs. tab bars touching the layout edge, with `dockToEdgeGroups`.
 * HTML5 backend unless stated (its capture-phase `dragover` reaches the root
 * before any tab). Real-browser only: depends on live header geometry.
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

/** On an enabled edge the tab bar wins; the 8px edge drop strip above it
 *  still docks. */
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

/**
 * The same rules for headers on the other sides: a tab bar touching an enabled
 * edge accepts drops, and the edge drop strip above it docks.
 */
const sideHeaders = [
    // [header position, edge it touches, dragged tab, target tab]
    ['left', 'left', 'b2', 'a1'],
    ['right', 'right', 'a2', 'b1'],
    ['bottom', 'bottom', 'a2', 'b1'],
] as const;

for (const dnd of ['html5', 'pointer'] as const) {
    for (const [headerPosition, edge, from, onto] of sideHeaders) {
        const open = async (page: Page) => {
            await page.goto(
                `/e2e/fixtures/index.html?dnd=${dnd}&compass=0&headerPosition=${headerPosition}`
            );
            await page.waitForFunction(() => (window as any).__ready === true);
            await page.evaluate(
                (e) =>
                    (window as any).__dv.setupTopRowWithEdgeGroups({
                        [e]: true,
                    }),
                edge
            );
        };

        /**
         * Drag `from` onto `onto`'s tab, `depth` px in from the layout edge.
         * Grab and drop on the tab titles, clear of the close buttons.
         */
        const dragToDepth = async (page: Page, depth: number) => {
            const root = (await page.locator('.dv-dockview').boundingBox())!;
            const title = (id: string) =>
                page
                    .locator('.dv-tab', { hasText: new RegExp(`^${id}$`) })
                    .locator('.dv-default-tab-content');
            const src = (await title(from).boundingBox())!;
            const dstTitle = (await title(onto).boundingBox())!;
            const dst = (await page
                .locator('.dv-tab', { hasText: new RegExp(`^${onto}$`) })
                .boundingBox())!;
            const cx = dstTitle.x + dstTitle.width / 2;
            const cy = dstTitle.y + dstTitle.height / 2;
            const point = {
                left: { x: root.x + depth, y: cy },
                right: { x: root.x + root.width - depth, y: cy },
                bottom: { x: cx, y: root.y + root.height - depth },
            }[edge];

            // The target tab must touch the edge, or the band was never in play.
            const tabDepth = {
                left: dst.x - root.x,
                right: root.x + root.width - (dst.x + dst.width),
                bottom: root.y + root.height - (dst.y + dst.height),
            }[edge];
            expect(tabDepth).toBeLessThan(2);

            await page.mouse.move(
                src.x + src.width / 2,
                src.y + src.height / 2
            );
            await page.mouse.down();
            await page.mouse.move(
                src.x + src.width / 2 + 8,
                src.y + src.height / 2 + 8,
                { steps: 3 }
            );
            await page.mouse.move(point.x, point.y, { steps: 20 });
            await page.mouse.up();
        };

        test(`${dnd}, ${headerPosition} headers: a tab dropped 20px into a tab bar on the enabled ${edge} edge joins that group`, async ({
            page,
        }) => {
            await open(page);
            await dragToDepth(page, 20);

            await expect
                .poll(async () =>
                    (await groupPanelIds(page)).find((ids: string[]) =>
                        ids.includes(onto)
                    )
                )
                .toContain(from);
            expect(
                await page.evaluate(
                    (e) => (window as any).__dv.edgeGroupExists(e),
                    edge
                )
            ).toBe(false);
        });

        test(`${dnd}, ${headerPosition} headers: a drop on the ${edge} edge strip over a tab bar docks an edge group`, async ({
            page,
        }) => {
            await open(page);
            await dragToDepth(page, 3);

            await expect
                .poll(() =>
                    page.evaluate(
                        (e) => (window as any).__dv.edgeGroupPanelIds(e),
                        edge
                    )
                )
                .toEqual([from]);
        });
    }
}
