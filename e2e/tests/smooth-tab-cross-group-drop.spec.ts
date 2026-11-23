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

    // Releases in the second strip's insertion gap: strip space, not a tab.
    const dragIntoStripGap = async (
        page: Page,
        from: { x: number; y: number }
    ) => {
        const four = (await page
            .locator('.dv-tab', { hasText: 'four' })
            .boundingBox())!;
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x + 6, from.y, { steps: 3 });
        await page.mouse.move(four.x + four.width - 3, four.y + 10, {
            steps: 16,
        });
        await page.waitForTimeout(400);

        const gapPoint = () =>
            page.evaluate(() => {
                const list = document.querySelectorAll(
                    '.dv-tabs-container'
                )[1] as HTMLElement;
                const r = list.getBoundingClientRect();
                const y = r.top + r.height / 2;
                for (let x = Math.ceil(r.left); x < r.right; x += 2) {
                    if (document.elementFromPoint(x, y) === list) {
                        return { x: x + 4, y };
                    }
                }
                return null;
            });

        const gap = await gapPoint();
        expect(gap).not.toBeNull();
        await page.mouse.move(gap!.x, gap!.y, { steps: 4 });
        await page.waitForTimeout(200);

        expect(
            await page.evaluate(
                ({ x, y }) =>
                    document.elementFromPoint(x, y) ===
                    document.querySelectorAll('.dv-tabs-container')[1],
                gap!
            )
        ).toBe(true);

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

        await dragIntoStripGap(page, await tabCenter(page, 'one'));

        expect(await groupOf(page, 'one')).toBe(right);
        expect(await groupCount(page)).toBe(2);
    });

    for (const release of ['tab', 'padding'] as const) {
        test(`a chip released on another group's ${release} moves its tab group there`, async ({
            page,
        }) => {
            const { right } = await setup(page, '&dndEdges=120');
            await page.evaluate(() =>
                (window as any).__dv.groupTabs(['one'], 'Moving')
            );
            const chip = page.locator('.dv-tab-group-chip', {
                hasText: 'Moving',
            });
            await expect(chip).toHaveCount(1);
            const chipBox = (await chip.boundingBox())!;

            const from = {
                x: chipBox.x + chipBox.width / 2,
                y: chipBox.y + chipBox.height / 2,
            };
            if (release === 'tab') {
                await drag(page, from, await tabCenter(page, 'three'));
            } else {
                await dragIntoStripGap(page, from);
            }

            expect(await groupOf(page, 'one')).toBe(right);
            expect(
                await page.evaluate(() =>
                    (window as any).__dv.isInTabGroup('one')
                )
            ).toBe(true);
            expect(await groupCount(page)).toBe(2);
        });
    }
});
