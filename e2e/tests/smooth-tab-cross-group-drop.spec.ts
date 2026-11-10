import { test, expect, Page } from '@playwright/test';

/**
 * Dragging a single tab onto another group's tab strip with
 * `tabAnimation: 'smooth'`. In smooth mode a tab declines every internal drag
 * and leaves the commit to its strip, so this is a different path from the
 * default mode, where the tab's own drop target latches and commits. HTML5
 * commits it from the tabs list's `drop` listener; this covers the pointer
 * backend (what touch uses), which commits from `handlePointerDragEnd`.
 */
test.describe('smooth mode: a tab dropped on another group (pointer backend)', () => {
    const setup = async (page: Page, query = '') => {
        await page.goto(`/e2e/fixtures/index.html?smooth=1${query}`);
        await page.waitForFunction(() => (window as any).__ready === true);
        const ids = await page.evaluate(() =>
            (window as any).__dv.setupTwoGroupsOfTwo()
        );
        await expect(page.locator('.dv-tab')).toHaveCount(4);
        return ids as { left: string; right: string };
    };

    const groupOf = (page: Page, id: string) =>
        page.evaluate((panelId) => (window as any).__dv.groupOf(panelId), id);

    const groupCount = (page: Page) =>
        page.evaluate(() => (window as any).__dv.groupCount());

    const tabCenter = async (page: Page, title: string) => {
        const box = (await page
            .locator('.dv-tab', { hasText: title })
            .boundingBox())!;
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };

    const drag = async (
        page: Page,
        from: { x: number; y: number },
        to: { x: number; y: number }
    ) => {
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x + 6, from.y, { steps: 3 });
        await page.mouse.move(to.x, to.y, { steps: 16 });
        await page.waitForTimeout(400);
        await page.mouse.move(to.x + 1, to.y);
        await page.mouse.up();
        await page.waitForTimeout(300);
    };

    for (const target of ['three', 'four'] as const) {
        test(`a tab dropped on tab "${target}" of another group moves there`, async ({
            page,
        }) => {
            const { left, right } = await setup(page);
            expect(await groupOf(page, 'one')).toBe(left);

            await drag(
                page,
                await tabCenter(page, 'one'),
                await tabCenter(page, target)
            );

            expect(await groupOf(page, 'one')).toBe(right);
            expect(await groupCount(page)).toBe(2);
        });
    }

    // The strip sits inside the root's edge-dock band here, and the release
    // lands on the strip itself rather than on a tab. The strip commits the
    // move, so the edge target must not dock the group as well.
    test("a tab released on another group's strip padding moves there and does not dock", async ({
        page,
    }) => {
        const { left, right } = await setup(page, '&dndEdges=120');
        expect(await groupOf(page, 'one')).toBe(left);

        const list = (await page
            .locator('.dv-tabs-container')
            .nth(1)
            .boundingBox())!;
        const lastTab = (await page
            .locator('.dv-tab', { hasText: 'four' })
            .boundingBox())!;

        await drag(page, await tabCenter(page, 'one'), {
            x: Math.min(
                lastTab.x + lastTab.width + 40,
                list.x + list.width - 4
            ),
            y: lastTab.y + lastTab.height / 2,
        });

        expect(await groupOf(page, 'one')).toBe(right);
        expect(await groupCount(page)).toBe(2);
    });
});
