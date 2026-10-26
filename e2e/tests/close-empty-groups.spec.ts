import { test, expect, Page } from '@playwright/test';

/**
 * `closeEmptyGroups: false` keeps a group in the grid when its only panel is
 * dragged out (#1687). Real-browser only: the unit tests dispatch drop events
 * at the drop zone directly, so the pointer backend, the drop overlay and the
 * kept group's laid-out footprint are only exercised here. The fixture opts
 * in via `?closeEmptyGroups=0`.
 */
type GroupState = {
    x: number;
    y: number;
    width: number;
    height: number;
    panels: string[];
    watermark: boolean;
};

const setup = async (page: Page, query: string) => {
    await page.goto(`/e2e/fixtures/index.html?compass=0${query}`);
    await page.waitForFunction(() => (window as any).__ready === true);
    return page.evaluate(
        () =>
            (window as any).__dv.setupTwoGroups() as {
                first: string;
                second: string;
            }
    );
};

const groupState = (page: Page, id: string) =>
    page.evaluate(
        (groupId) => (window as any).__dv.groupState(groupId) as GroupState | null,
        id
    );

const groupCount = (page: Page) =>
    page.evaluate(() => (window as any).__dv.groupCount() as number);

/** Pointer-drag the tab `title` to a point in the lower quadrant of `target`. */
const dragTabToBottomEdge = async (
    page: Page,
    title: string,
    target: GroupState
) => {
    const tab = (await page
        .locator('.dv-tab', { hasText: new RegExp(`^${title}$`) })
        .boundingBox())!;
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
    await page.mouse.down();
    await page.mouse.move(tab.x + tab.width / 2 + 8, tab.y + tab.height / 2, {
        steps: 3,
    });
    await page.mouse.move(
        target.x + target.width / 2,
        target.y + target.height - 30,
        { steps: 18 }
    );
    await expect(
        page.locator('.dv-drop-target-anchor, .dv-drop-target-selection')
    ).toHaveCount(1);
    await page.mouse.up();
};

test.describe('closeEmptyGroups: false', () => {
    test('dragging the only tab to another group’s edge leaves its group in place', async ({
        page,
    }) => {
        const { first, second } = await setup(page, '&closeEmptyGroups=0');
        const before = (await groupState(page, first))!;
        const target = (await groupState(page, second))!;

        await dragTabToBottomEdge(page, 'one', target);

        await expect.poll(() => groupCount(page)).toBe(3);
        const after = (await groupState(page, first))!;
        expect(after).not.toBeNull();
        expect(after.panels).toEqual([]);
        expect(after.watermark).toBe(true);
        await expect(
            page.locator('.dv-groupview', { has: page.locator('.dv-watermark') })
        ).toHaveCount(1);
        // The kept group still owns its slot in the grid.
        expect(after.x).toBeCloseTo(before.x, 0);
        expect(after.width).toBeCloseTo(before.width, 0);
        expect(after.height).toBeCloseTo(before.height, 0);
        // The panel landed in a new group inside the target's old footprint.
        const landedGroup = await page.evaluate(
            () => (window as any).__dv.groupOf('one') as string
        );
        expect(landedGroup).not.toBe(first);
        const landed = (await groupState(page, landedGroup))!;
        expect(landed.y).toBeGreaterThanOrEqual(target.y + target.height / 2 - 2);
    });

    test('dragging the only tab onto its own group’s edge splits it out', async ({
        page,
    }) => {
        const { first } = await setup(page, '&closeEmptyGroups=0');
        const before = (await groupState(page, first))!;

        await dragTabToBottomEdge(page, 'one', before);

        await expect.poll(() => groupCount(page)).toBe(3);
        const after = (await groupState(page, first))!;
        expect(after.panels).toEqual([]);
        expect(after.watermark).toBe(true);
        const landedGroup = await page.evaluate(
            () => (window as any).__dv.groupOf('one') as string
        );
        expect(landedGroup).not.toBe(first);
        const landed = (await groupState(page, landedGroup))!;
        // Stacked under the emptied group, within its old footprint.
        expect(landed.x).toBeCloseTo(before.x, 0);
        expect(landed.y).toBeGreaterThan(before.y);
        expect(landed.y + landed.height).toBeLessThanOrEqual(
            before.y + before.height + 2
        );
    });
});

test('by default the same drag relocates the emptied group', async ({
    page,
}) => {
    const { first, second } = await setup(page, '');
    const target = (await groupState(page, second))!;

    await dragTabToBottomEdge(page, 'one', target);

    // The lone panel takes its group with it: no new group, no empty one.
    await expect
        .poll(() =>
            page.evaluate(() => (window as any).__dv.groupOf('one') as string)
        )
        .toBe(first);
    expect(await groupCount(page)).toBe(2);
    expect((await groupState(page, first))!.panels).toEqual(['one']);
    await expect(page.locator('.dv-watermark')).toHaveCount(0);
});
