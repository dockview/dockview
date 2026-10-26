import { test, expect, Page } from '@playwright/test';

/**
 * Tab-group chips (TabGroupChipsModule) — real-browser behaviour: creating a
 * tab group via the public API renders a `.dv-tab-group-chip` in the live
 * header (the chip mounts on a microtask and paints alongside the grouped
 * tabs), and right-clicking that chip opens the chip context menu popover.
 * jsdom can assert the chip element exists but not that it is laid out and
 * hit-testable for a real contextmenu dispatch.
 */
test.describe('tab-group chips', () => {
    const setup = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        return page.evaluate(() => (window as any).__dv.setupTabGroupChip());
    };

    test('creating a tab group renders a labelled chip in the header', async ({
        page,
    }) => {
        await setup(page);

        const chip = page.locator('.dv-tab-group-chip');
        await expect(chip).toBeVisible();
        await expect(chip.locator('.dv-tab-group-chip-label')).toHaveText(
            'Monitoring'
        );
    });

    test('right-clicking the chip opens the chip context menu', async ({
        page,
    }) => {
        await setup(page);

        const chip = page.locator('.dv-tab-group-chip');
        await expect(chip).toBeVisible();
        await chip.click({ button: 'right' });

        const menu = page.locator('.dv-context-menu');
        await expect(menu).toBeVisible();
        await expect(menu).toHaveAttribute('role', 'menu');
        // The chip menu is distinct from the tab menu: it carries the
        // configured rename input + the custom action item.
        await expect(menu.locator('.dv-context-menu-rename')).toBeVisible();
        await expect(menu).toContainText('Custom Action');
    });

    test('the chip menu closes on an outside click', async ({ page }) => {
        await setup(page);

        const chip = page.locator('.dv-tab-group-chip');
        await chip.click({ button: 'right' });
        await expect(page.locator('.dv-context-menu')).toBeVisible();

        // Wait past the popover's outside-pointerdown grace window (200ms).
        await page.waitForTimeout(250);
        await page.mouse.click(600, 450);
        await expect(page.locator('.dv-context-menu')).toHaveCount(0);
        await expect(chip).toBeVisible();
    });

    test('a chip `component` menu item renders with its componentProps and tabGroup', async ({
        page,
    }) => {
        // `?chipcomponent=1` makes the chip menu return a `component` item; the
        // fixture's createContextMenuItemComponent renders it, so this exercises
        // the chip-menu component path end-to-end (jsdom unit tests mock the
        // renderer). The rendered text proves both componentProps.badge ("X")
        // and the chip's tabGroup.label ("Monitoring") reached the component.
        await page.goto('/e2e/fixtures/index.html?chipcomponent=1');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupTabGroupChip());

        const chip = page.locator('.dv-tab-group-chip');
        await expect(chip).toBeVisible();
        await chip.click({ button: 'right' });

        const menu = page.locator('.dv-context-menu');
        await expect(menu).toBeVisible();
        await expect(menu.locator('.chip-component-item')).toHaveText(
            'chip:X:Monitoring'
        );
    });
});

/**
 * #1410 — a tab group stays draggable after its first move. Committing a
 * group-chip move disposes the chip's drag sources; a within-group reorder
 * keeps the same chip element, so the sources must be re-armed or the chip
 * becomes stuck after one move (real-browser only: the pointer backend
 * computes drop zones from live geometry that jsdom can't produce).
 */
test.describe('tab-group chip repeated moves (#1410)', () => {
    const chipLabels = (page: Page) =>
        page.evaluate(() => (window as any).__dv.chipLabels());

    // Drag the chip with the given label onto a target tab (dropping past a
    // tab's inner edge inserts the whole group there), driving the pointer
    // backend the same way `dnd-docking.spec.ts` drives tab drags.
    const dragChipToTab = async (
        page: Page,
        label: string,
        edge: 'first-left' | 'last-right'
    ) => {
        const c = (await page
            .locator('.dv-tab-group-chip', { hasText: label })
            .boundingBox())!;
        const tab =
            edge === 'first-left'
                ? page.locator('.dv-tab').first()
                : page.locator('.dv-tab').last();
        const t = (await tab.boundingBox())!;
        const to =
            edge === 'first-left'
                ? { x: t.x + 3, y: t.y + t.height / 2 }
                : { x: t.x + t.width - 3, y: t.y + t.height / 2 };
        await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
        await page.mouse.down();
        await page.mouse.move(c.x + c.width / 2 + 6, c.y + c.height / 2, {
            steps: 3,
        });
        await page.mouse.move(to.x, to.y, { steps: 16 });
        await page.mouse.up();
    };

    test('a tab group can be moved, then moved again', async ({ page }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() =>
            (window as any).__dv.setupTwoTabGroupChips()
        );

        await expect(page.locator('.dv-tab-group-chip')).toHaveCount(2);
        expect(await chipLabels(page)).toEqual(['Feature', 'Monitoring']);

        // First move: drag Feature past the last tab → Feature lands after
        // Monitoring.
        await dragChipToTab(page, 'Feature', 'last-right');
        await expect
            .poll(() => chipLabels(page))
            .toEqual(['Monitoring', 'Feature']);

        // Second move: drag Feature back before the first tab. Before the fix
        // the chip's drag sources were disposed by the first move and never
        // re-armed, so this drag did nothing and the order stayed put.
        await dragChipToTab(page, 'Feature', 'first-left');
        await expect
            .poll(() => chipLabels(page))
            .toEqual(['Feature', 'Monitoring']);
    });
});

/**
 * Chip reorder across the docs "Tab Groups" strip (#1352): an expanded
 * Feature group, an ungrouped Billing tab and a collapsed Monitoring group.
 * A group pushed to the right of the strip must be draggable back to the
 * left, whichever drop zone the release lands on.
 *
 * Every case runs under both `dndStrategy` values (`?dnd=`, read by the
 * fixture): in smooth mode the commit runs at strip level, and those paths
 * are separate per backend — the tabs list's capturing `dragover`/`drop`
 * listeners for HTML5, the drag-end commit in `TabReorderController` for
 * pointer.
 */
test.describe('tab-group chip reorder across a mixed strip (#1352)', () => {
    const chipLabels = (page: Page) =>
        page.evaluate(() => (window as any).__dv.chipLabels());

    const setup = async (
        page: Page,
        dnd: 'html5' | 'pointer',
        animation: 'smooth' | 'default' = 'smooth'
    ) => {
        const smooth = animation === 'smooth' ? '&smooth=1' : '';
        await page.goto(`/e2e/fixtures/index.html?dnd=${dnd}${smooth}`);
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() =>
            (window as any).__dv.setupTemplateTabGroups()
        );
        await expect(page.locator('.dv-tab-group-chip')).toHaveCount(2);
    };

    // Drag a chip to an absolute x within the strip. The final one-pixel move
    // is a harness detail: Playwright's synthetic HTML5 drag coalesces the
    // interpolated moves, so the last `dragover` can land tens of pixels short
    // of the release point.
    const dragChipTo = async (page: Page, label: string, x: number) => {
        const chip = (await page
            .locator('.dv-tab-group-chip', { hasText: label })
            .boundingBox())!;
        const y = chip.y + chip.height / 2;
        await page.mouse.move(chip.x + chip.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(chip.x + chip.width / 2 + 6, y, { steps: 3 });
        await page.mouse.move(x, y, { steps: 16 });
        await page.waitForTimeout(400);
        await page.mouse.move(x + 1, y);
        await page.mouse.up();
    };

    // Push Feature past the last tab so Monitoring leads the strip.
    const moveFeatureToTheRight = async (page: Page) => {
        const last = (await page.locator('.dv-tab').last().boundingBox())!;
        await dragChipTo(page, 'Feature', last.x + last.width - 3);
        await expect
            .poll(() => chipLabels(page))
            .toEqual(['Monitoring', 'Feature']);
    };

    for (const dnd of ['html5', 'pointer'] as const) {
        test(`[${dnd}] a group moved right returns to the left of an ungrouped tab`, async ({
            page,
        }) => {
            await setup(page, dnd);
            await moveFeatureToTheRight(page);

            const billing = (await page
                .locator('.dv-tab', { hasText: 'Billing' })
                .boundingBox())!;
            await dragChipTo(page, 'Feature', billing.x + 3);
            await expect
                .poll(() => chipLabels(page))
                .toEqual(['Feature', 'Monitoring']);
        });

        test(`[${dnd}] a group moved right returns to the left of another group's chip`, async ({
            page,
        }) => {
            await setup(page, dnd);
            await moveFeatureToTheRight(page);

            const monitoring = (await page
                .locator('.dv-tab-group-chip', { hasText: 'Monitoring' })
                .boundingBox())!;
            await dragChipTo(
                page,
                'Feature',
                monitoring.x + monitoring.width / 2
            );
            await expect
                .poll(() => chipLabels(page))
                .toEqual(['Feature', 'Monitoring']);

            // The commit runs from a capturing listener that stops the event,
            // so the chip's own target never sees the drop that would tear its
            // overlay down.
            await expect(page.locator('.dv-drop-target')).toHaveCount(0);
        });

        test(`[${dnd}] a tab dropped on a chip lands before that group`, async ({
            page,
        }) => {
            // Default animation, so the chip's own drop target has to work:
            // smooth mode routes an internal drag through the strip-level
            // commit, which covers for a chip that never accepts the drop.
            await setup(page, dnd, 'default');
            const billing = (await page
                .locator('.dv-tab', { hasText: 'Billing' })
                .boundingBox())!;
            const monitoring = (await page
                .locator('.dv-tab-group-chip', { hasText: 'Monitoring' })
                .boundingBox())!;
            const y = billing.y + billing.height / 2;
            await page.mouse.move(billing.x + billing.width / 2, y);
            await page.mouse.down();
            await page.mouse.move(billing.x + billing.width / 2 - 6, y, {
                steps: 3,
            });
            await page.mouse.move(
                monitoring.x + monitoring.width / 2,
                y,
                { steps: 16 }
            );
            await page.waitForTimeout(400);
            await page.mouse.move(monitoring.x + monitoring.width / 2 + 1, y);
            await page.mouse.up();

            await expect
                .poll(() =>
                    page.evaluate(() => (window as any).__dv.tabTitles())
                )
                .toEqual([
                    'Dashboard',
                    'Settings',
                    'Users',
                    'Analytics',
                    'Billing',
                    'Reports',
                    'Notifications',
                    'Logs',
                ]);
        });

        test(`[${dnd}] a chip dropped over a tab of another group lands outside it`, async ({
            page,
        }) => {
            await setup(page, dnd);

            // Monitoring starts last; drop it over the first tab of the
            // Feature group. A group can never land inside another group, so
            // it takes the slot before Feature.
            const dashboard = (await page
                .locator('.dv-tab', { hasText: 'Dashboard' })
                .boundingBox())!;
            await dragChipTo(page, 'Monitoring', dashboard.x + 3);
            await expect
                .poll(() => chipLabels(page))
                .toEqual(['Monitoring', 'Feature']);
            await expect
                .poll(() => page.evaluate(() => (window as any).__dv.tabTitles()))
                .toEqual([
                    'Reports',
                    'Notifications',
                    'Logs',
                    'Dashboard',
                    'Settings',
                    'Users',
                    'Analytics',
                    'Billing',
                ]);
        });
    }
});
