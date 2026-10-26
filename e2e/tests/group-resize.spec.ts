import { test, expect, Page } from '@playwright/test';

/**
 * Group resizing via the main-window sash, and the size constraints that bound
 * it. Real-browser only: dragging the sash and the constraint clamp both act on
 * measured pixel geometry, which jsdom's no-layout DOM can't produce.
 * (popout-pointer-drag covers a sash *inside a popout*; this covers the main
 * window and the `setConstraints` clamp — historically fragile, see #717/#869.)
 */
test.describe('group resize (main-window sash)', () => {
    const setup = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupTwoGroups()); // one | two
    };

    const firstGroupWidth = async (page: Page) =>
        (await page.locator('.dv-groupview').first().boundingBox())!.width;

    const dragSash = async (page: Page, dx: number) => {
        const sash = (await page.locator('.dv-sash').first().boundingBox())!;
        const cx = sash.x + sash.width / 2;
        const cy = sash.y + sash.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + dx, cy, { steps: 10 });
        await page.mouse.up();
    };

    test('dragging the sash resizes the adjacent groups', async ({ page }) => {
        await setup(page);
        const before = await firstGroupWidth(page);

        await dragSash(page, 120);

        // The first group grew by ~120px (the boundary moved with the sash).
        const after = await firstGroupWidth(page);
        expect(after).toBeGreaterThan(before + 100);
        expect(Math.abs(after - (before + 120))).toBeLessThan(8);
    });

    test('a maximumWidth constraint clamps the sash resize', async ({
        page,
    }) => {
        await setup(page);
        // Cap the first group at 700px, then try to drag well past it.
        await page.evaluate(() =>
            (window as any).__dv.setGroupConstraints('one', {
                maximumWidth: 700,
            })
        );

        await dragSash(page, 200); // 640 + 200 = 840 requested

        // The group is clamped at its maximum, not grown to the drag distance.
        const after = await firstGroupWidth(page);
        expect(Math.abs(after - 700)).toBeLessThan(4);
    });

    // A size set with `setSize` on a visible group applies at once. A sash
    // drag after it is the newer intent, and hiding and showing the group
    // (maximize/restore of another group does both) must keep the dragged
    // width rather than resurrect the earlier request (#1688).
    test.describe('a setSize on a visible group is not re-applied after hide/show', () => {
        const setSizeThenDrag = async (page: Page) => {
            await setup(page);
            await page.evaluate(() =>
                (window as any).__dv.setGroupSize('one', { width: 300 })
            );
            expect(Math.abs((await firstGroupWidth(page)) - 300)).toBeLessThan(
                4
            );

            await dragSash(page, 200);

            const dragged = await firstGroupWidth(page);
            expect(Math.abs(dragged - 500)).toBeLessThan(8);
            return dragged;
        };

        test('after maximizing and restoring the other group', async ({
            page,
        }) => {
            const dragged = await setSizeThenDrag(page);

            await page.evaluate(() => (window as any).__dv.maximizeGroup('two'));
            await expect
                .poll(() => page.evaluate(() => (window as any).__dv.groupWidth('one')))
                .toBe(0);
            await page.evaluate(() =>
                (window as any).__dv.exitMaximizedGroup()
            );

            await expect
                .poll(() => firstGroupWidth(page))
                .toBeCloseTo(dragged, -1);
        });

        test('after hiding and showing the group', async ({ page }) => {
            const dragged = await setSizeThenDrag(page);

            await page.evaluate(() =>
                (window as any).__dv.setGroupVisible('one', false)
            );
            await expect
                .poll(() => page.evaluate(() => (window as any).__dv.groupWidth('one')))
                .toBe(0);
            await page.evaluate(() =>
                (window as any).__dv.setGroupVisible('one', true)
            );

            await expect
                .poll(() => firstGroupWidth(page))
                .toBeCloseTo(dragged, -1);
        });
    });
});
