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
