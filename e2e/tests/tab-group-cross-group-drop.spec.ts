import { test, expect, Page } from '@playwright/test';

/**
 * Dragging a tab-group chip from one dockview group onto a *grouped* tab in
 * another group. This is a cross-group move, a different commit path from
 * reordering chips within a single strip, and it runs per backend: HTML5
 * commits from the tabs list's bubbling `drop` listener, the pointer backend
 * from the drop target that latches under the release.
 */
test.describe('tab-group chip dropped across groups', () => {
    const setup = async (page: Page, dnd: 'html5' | 'pointer') => {
        await page.goto(`/e2e/fixtures/index.html?dnd=${dnd}`);
        await page.waitForFunction(() => (window as any).__ready === true);
        const ids = await page.evaluate(() =>
            (window as any).__dv.setupCrossGroupTabGroups()
        );
        await expect(page.locator('.dv-tab-group-chip')).toHaveCount(2);
        return ids as { left: string; right: string };
    };

    const groupOf = (page: Page, id: string) =>
        page.evaluate((panelId) => (window as any).__dv.groupOf(panelId), id);

    for (const dnd of ['html5', 'pointer'] as const) {
        test(`[${dnd}] a chip dragged onto another group's grouped tab moves its panels`, async ({
            page,
        }) => {
            if (dnd === 'pointer') {
                /**
                 * Known defect. `Tab.canDisplayOverlay` refuses a drag
                 * carrying a `tabGroupId` over any grouped tab of the same
                 * dockview, to stop a chip advertising a landing inside a tab
                 * group. That rule is meant for reordering within one strip,
                 * but it also fires across groups, where the drop is a
                 * legitimate move: the tab's pointer drop target never
                 * latches, `_findTargetUnder` stops at the tab so no ancestor
                 * sees the release, and `handlePointerDragEnd` skips it
                 * because a cross-group drag carries `sourceIndex: -1`.
                 *
                 * HTML5 is unaffected - it commits from the bubbling `drop`
                 * listener on the tabs list - which is why only this variant
                 * is marked. Remove this once the guard is narrowed to
                 * same-group drags; the test then reports as unexpectedly
                 * passing.
                 */
                test.fail();
            }

            const { left, right } = await setup(page, dnd);

            expect(await groupOf(page, 'red')).toBe(left);
            expect(await groupOf(page, 'green')).toBe(left);

            const chip = (await page
                .locator('.dv-tab-group-chip', { hasText: 'Feature' })
                .boundingBox())!;
            // a grouped tab in the other group
            const target = (await page
                .locator('.dv-tab', { hasText: 'blue' })
                .boundingBox())!;

            const from = {
                x: chip.x + chip.width / 2,
                y: chip.y + chip.height / 2,
            };
            const to = {
                x: target.x + target.width / 2,
                y: target.y + target.height / 2,
            };

            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            await page.mouse.move(from.x + 6, from.y, { steps: 3 });
            await page.mouse.move(to.x, to.y, { steps: 16 });
            await page.waitForTimeout(400);
            await page.mouse.move(to.x + 1, to.y);
            await page.mouse.up();
            await page.waitForTimeout(300);

            // the drop commits: both panels of the dragged group land in the
            // group they were dropped on
            expect(await groupOf(page, 'red')).toBe(right);
            expect(await groupOf(page, 'green')).toBe(right);
        });
    }
});
