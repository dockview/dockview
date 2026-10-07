import { test, expect, Page } from '@playwright/test';

/**
 * Stacked edge groups: more than one group on an edge, laid out along it with
 * a sash between them. Real-browser only: the stack is a nested splitview whose
 * outcome (member heights, the rail's width, a sash drag, where a drop lands)
 * is measured pixel geometry that jsdom's no-layout DOM can't produce.
 *
 * The compass is off so the plain cursor-quadrant resolution drives the drop
 * zones of an edge group's content (centre merges; the halves along the edge
 * split).
 */
test.describe('stacked edge groups', () => {
    const setup = async (page: Page, autoHide = false) => {
        await page.goto('/e2e/fixtures/index.html?compass=0');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(
            (ah) => (window as any).__dv.setupStackedEdge('left', ah),
            autoHide
        );
    };

    const box = async (page: Page, testId: string) =>
        (await page.locator(`[data-testid="${testId}"]`).boundingBox())!;
    const groupBox = (page: Page, id: string) => box(page, `dv-edge-group-${id}`);
    const rail = (page: Page) => box(page, 'dv-edge-stack-left');
    const ids = (page: Page): Promise<string[]> =>
        page.evaluate(() => (window as any).__dv.stackedEdgeGroupIds('left'));
    const groupOf = (page: Page, panelId: string): Promise<string | null> =>
        page.evaluate(
            (id) => (window as any).__dv.panelGroupId(id),
            panelId
        );
    const centreWidth = async (page: Page) =>
        (await page.locator('.dv-dockview').boundingBox())!.width;

    const dragTo = async (
        page: Page,
        tab: { x: number; y: number; width: number; height: number },
        x: number,
        y: number
    ) => {
        await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
        await page.mouse.down();
        // nudge to start the drag, then travel to the target
        await page.mouse.move(
            tab.x + tab.width / 2 + 6,
            tab.y + tab.height / 2
        );
        await page.mouse.move(x, y, { steps: 20 });
        await page.mouse.up();
    };

    test('a second group stacks below the first inside the edge rail', async ({
        page,
    }) => {
        await setup(page);
        expect(await ids(page)).toEqual(['edge-a', 'edge-b']);

        const a = await groupBox(page, 'edge-a');
        const b = await groupBox(page, 'edge-b');
        const stack = await rail(page);

        // same column, b beneath a, together filling the rail
        expect(Math.abs(a.x - b.x)).toBeLessThan(2);
        expect(Math.abs(a.width - b.width)).toBeLessThan(2);
        expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 1);
        expect(Math.abs(a.height - b.height)).toBeLessThan(8);
        expect(Math.abs(a.height + b.height - stack.height)).toBeLessThan(8);
        expect(stack.width).toBeCloseTo(260, -1);
    });

    test('dragging the sash between two groups moves their boundary', async ({
        page,
    }) => {
        await setup(page);
        const before = {
            a: await groupBox(page, 'edge-a'),
            b: await groupBox(page, 'edge-b'),
            centre: await centreWidth(page),
        };

        const sash = (await page
            .locator('[data-testid="dv-edge-stack-left"] .dv-sash')
            .first()
            .boundingBox())!;
        const cx = sash.x + sash.width / 2;
        const cy = sash.y + sash.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx, cy + 80, { steps: 10 });
        await page.mouse.up();

        const a = await groupBox(page, 'edge-a');
        const b = await groupBox(page, 'edge-b');
        expect(Math.abs(a.height - (before.a.height + 80))).toBeLessThan(8);
        expect(Math.abs(b.height - (before.b.height - 80))).toBeLessThan(8);
        // only the stack moved; the edge keeps its width
        expect(Math.abs((await centreWidth(page)) - before.centre)).toBeLessThan(
            2
        );
    });

    test('dropping a tab on the lower half of a group opens a new group after it', async ({
        page,
    }) => {
        await setup(page);
        const tab = (await page
            .locator('.dv-tab', { hasText: 'other' })
            .boundingBox())!;
        const a = await groupBox(page, 'edge-a');

        // well inside the content (clear of the vertical tab strip), low down
        await dragTo(page, tab, a.x + a.width - 40, a.y + a.height * 0.9);

        await expect.poll(() => ids(page)).toHaveLength(3);
        const order = await ids(page);
        expect(order[0]).toBe('edge-a');
        expect(order[2]).toBe('edge-b');
        expect(await groupOf(page, 'other')).toBe(order[1]);

        const created = await groupBox(page, order[1]);
        const b = await groupBox(page, 'edge-b');
        expect(created.y).toBeGreaterThan(a.y);
        expect(created.y + created.height).toBeLessThanOrEqual(b.y + 1);
    });

    test('dropping a tab on the centre of a group merges into it', async ({
        page,
    }) => {
        await setup(page);
        const tab = (await page
            .locator('.dv-tab', { hasText: 'other' })
            .boundingBox())!;
        const b = await groupBox(page, 'edge-b');

        await dragTo(page, tab, b.x + b.width - 40, b.y + b.height / 2);

        await expect.poll(() => groupOf(page, 'other')).toBe('edge-b');
        expect(await ids(page)).toEqual(['edge-a', 'edge-b']);
    });

    test('collapsing one group hands its height to its sibling', async ({
        page,
    }) => {
        await setup(page);
        const before = await rail(page);

        await page.evaluate(() =>
            (window as any).__dv.collapseEdgeGroupById('left', 'edge-a')
        );

        const a = await groupBox(page, 'edge-a');
        const b = await groupBox(page, 'edge-b');
        const stack = await rail(page);
        expect(a.height).toBeLessThan(60); // its tab strip only
        expect(Math.abs(a.height + b.height - stack.height)).toBeLessThan(8);
        expect(Math.abs(stack.width - before.width)).toBeLessThan(2);
        expect(
            await page.evaluate(() => (window as any).__dv.isEdgeCollapsed('left'))
        ).toBe(false);
    });

    test('collapsing every group collapses the edge to a strip', async ({
        page,
    }) => {
        await setup(page);

        await page.evaluate(() => {
            (window as any).__dv.collapseEdgeGroupById('left', 'edge-a');
            (window as any).__dv.collapseEdgeGroupById('left', 'edge-b');
        });

        expect((await rail(page)).width).toBeLessThan(60);
        expect(
            await page.evaluate(() => (window as any).__dv.isEdgeCollapsed('left'))
        ).toBe(true);
    });

    test('a stacked edge round-trips with its order and sizes', async ({
        page,
    }) => {
        await setup(page);
        await page.evaluate(() =>
            (window as any).__dv.setEdgeGroupSizeById('left', 'edge-a', {
                height: 180,
            })
        );
        const before = {
            a: await groupBox(page, 'edge-a'),
            b: await groupBox(page, 'edge-b'),
        };
        expect(before.a.height).toBeCloseTo(180, -1);

        const json = await page.evaluate(() =>
            JSON.stringify((window as any).__dv.snapshot())
        );
        expect(json).toContain('"groups"');

        await page.goto('/e2e/fixtures/index.html?compass=0');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(
            (state) => (window as any).__dv.restore(JSON.parse(state)),
            json
        );

        await expect.poll(() => ids(page)).toEqual(['edge-a', 'edge-b']);
        const a = await groupBox(page, 'edge-a');
        const b = await groupBox(page, 'edge-b');
        expect(Math.abs(a.height - before.a.height)).toBeLessThan(4);
        expect(Math.abs(b.height - before.b.height)).toBeLessThan(4);
        expect(await groupOf(page, 'b')).toBe('edge-b');
    });

    test('on a collapsed rail, clicking a tab peeks only that group', async ({
        page,
    }) => {
        await setup(page, true);
        await page.evaluate(() => {
            (window as any).__dv.autoHideEdgeGroupById('left', 'edge-a');
            (window as any).__dv.autoHideEdgeGroupById('left', 'edge-b');
        });
        expect((await rail(page)).width).toBeLessThan(60);

        await page
            .locator('[data-testid="dv-edge-group-edge-b"] .dv-tab')
            .first()
            .click();

        const peek = page.locator('.dv-edge-peek');
        await expect(peek).toHaveCount(1);
        await expect(page.locator('.dv-edge-peek-title')).toHaveText('b');
        // the peek floats over the content; the rail stays a strip
        expect((await rail(page)).width).toBeLessThan(60);
    });
});
