import { test, expect, Page } from '@playwright/test';

/**
 * Locked groups — a group with `locked` set rejects panel drops. Real-browser
 * only: the drop is decided from live pointer geometry over the target group,
 * and the rejection is observable as the compass never appearing and the layout
 * not changing.
 */
test.describe('locked group', () => {
    const setup = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupTwoGroups()); // one | two
    };

    const dragOntoSecondGroup = async (page: Page) => {
        const oneTab = (await page
            .locator('.dv-tab', { hasText: 'one' })
            .boundingBox())!;
        const target = (await page
            .locator('.dv-groupview')
            .nth(1)
            .boundingBox())!;
        await page.mouse.move(
            oneTab.x + oneTab.width / 2,
            oneTab.y + oneTab.height / 2
        );
        await page.mouse.down();
        await page.mouse.move(
            oneTab.x + oneTab.width / 2 + 6,
            oneTab.y + oneTab.height / 2,
            { steps: 3 }
        );
        await page.mouse.move(
            target.x + target.width / 2,
            target.y + target.height / 2,
            { steps: 12 }
        );
    };

    const groupCount = (page: Page) =>
        page.evaluate(() => (window as any).__dv.groupCount());

    test('a locked group rejects a tab dropped onto it', async ({ page }) => {
        await setup(page);
        await page.evaluate(() =>
            (window as any).__dv.setGroupLocked('two', true)
        );
        expect(await groupCount(page)).toBe(2);

        await dragOntoSecondGroup(page);
        // No compass appears over the locked group…
        await expect(page.locator('.dv-dnd-compass')).toHaveCount(0);
        await page.mouse.up();

        // …and the layout is unchanged (no merge).
        await expect.poll(() => groupCount(page)).toBe(2);
        await expect(
            page.locator('.dv-groupview').nth(1).locator('.dv-tab')
        ).toHaveText(['two']);
    });

    test('unlocking the group restores drops (control)', async ({ page }) => {
        await setup(page);
        // Lock then unlock — the same drag should now be accepted.
        await page.evaluate(() =>
            (window as any).__dv.setGroupLocked('two', true)
        );
        await page.evaluate(() =>
            (window as any).__dv.setGroupLocked('two', false)
        );

        await dragOntoSecondGroup(page);
        await expect(page.locator('.dv-dnd-compass')).toBeVisible();
        await page.mouse.up();

        await expect.poll(() => groupCount(page)).toBe(1);
        await expect(page.locator('.dv-tab')).toHaveText(['two', 'one']);
    });
});

/**
 * In smooth tab animation the tab strip, not the tabs, commits a drop on it,
 * on both drag backends. A locked group's strip takes nothing: no tab from
 * another group, and no reorder of its own tabs.
 */
for (const dnd of ['pointer', 'html5'] as const) {
    test.describe(`locked group, smooth mode, ${dnd} backend`, () => {
        const setup = async (page: Page) => {
            await page.goto(`/e2e/fixtures/index.html?smooth=1&dnd=${dnd}`);
            await page.waitForFunction(() => (window as any).__ready === true);
            // one, two | three, four
            await page.evaluate(() =>
                (window as any).__dv.setupTwoGroupsOfTwo()
            );
        };

        const center = async (page: Page, title: string) => {
            const box = (await page
                .locator('.dv-tab', { hasText: title })
                .boundingBox())!;
            return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        };

        const drag = async (page: Page, from: string, to: string) => {
            const a = await center(page, from);
            const b = await center(page, to);
            await page.mouse.move(a.x, a.y);
            await page.mouse.down();
            await page.mouse.move(a.x + 6, a.y, { steps: 3 });
            await page.mouse.move(b.x, b.y, { steps: 16 });
            await page.waitForTimeout(300);
            await page.mouse.move(b.x + 1, b.y);
            await page.mouse.up();
            await page.waitForTimeout(300);
        };

        const tabsOf = (page: Page, index: number) =>
            page.locator('.dv-groupview').nth(index).locator('.dv-tab');

        for (const locked of [false, true] as const) {
            test(`a tab from another group ${locked ? 'is refused by a locked' : 'moves into an unlocked'} group`, async ({
                page,
            }) => {
                await setup(page);
                await page.evaluate(
                    (l) => (window as any).__dv.setGroupLocked('three', l),
                    locked
                );

                await drag(page, 'one', 'four');

                if (locked) {
                    await expect(tabsOf(page, 1)).toHaveText(['three', 'four']);
                } else {
                    await expect(tabsOf(page, 1)).toContainText(['one']);
                }
            });

            test(`a reorder ${locked ? 'is refused in a locked' : 'works in an unlocked'} group`, async ({
                page,
            }) => {
                await setup(page);
                await page.evaluate(
                    (l) => (window as any).__dv.setGroupLocked('three', l),
                    locked
                );

                await drag(page, 'four', 'three');

                await expect(tabsOf(page, 1)).toHaveText(
                    locked ? ['three', 'four'] : ['four', 'three']
                );
            });
        }
    });
}
