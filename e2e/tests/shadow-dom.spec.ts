import { test, expect, Page } from '@playwright/test';

/**
 * Dockview mounted inside an open shadow root — the web-component case (a Lit
 * host, say). Real-browser only: the bugs here are all about what the platform
 * retargets across a shadow boundary, which jsdom either doesn't model or the
 * unit tests have to stub (hit-testing on a shadow root, `composedPath` on a
 * real pointer event, popover geometry). The fixture mounts into a shadow root
 * via `?shadow=1`.
 *
 * Playwright's CSS engine pierces open shadow roots, so the locators below read
 * the same as in the light-DOM specs.
 */
test.describe('dockview inside a shadow root', () => {
    const setup = async (page: Page, query = '') => {
        await page.goto(`/e2e/fixtures/index.html?shadow=1${query}`);
        await page.waitForFunction(() => (window as any).__ready === true);
        // It really is in a shadow root, not the light DOM.
        expect(
            await page.evaluate(
                () =>
                    document
                        .getElementById('shadow-host')
                        ?.shadowRoot?.getElementById('app') != null
            )
        ).toBe(true);
    };

    test('a context menu item acts on the panel it was opened for', async ({
        page,
    }) => {
        // The reported bug (#1649): `pointerdown` from inside a shadow root
        // arrives at the window retargeted to the host, so the dismissable
        // layer counted the click as "outside" and closed the menu before the
        // item's handler ran — the item did nothing.
        await setup(page);
        await page.evaluate(() => {
            (window as any).__dv.addPanel('alpha');
            (window as any).__dv.addPanel('bravo');
        });
        await expect(page.locator('.dv-tab')).toHaveCount(2);

        await page
            .locator('.dv-tab', { hasText: 'alpha' })
            .click({ button: 'right' });
        const menu = page.locator('.dv-context-menu');
        await expect(menu).toBeVisible();

        await menu
            .locator('.dv-context-menu-item', { hasText: 'Close' })
            .first()
            .click();

        await expect(page.locator('.dv-tab')).toHaveCount(1);
        await expect(page.locator('.dv-tab')).toHaveText('bravo');
    });

    test('a pointer drag reorders a tab', async ({ page }) => {
        // `document.elementsFromPoint` stops at the shadow host, so the pointer
        // backend found no drop target and a drag did nothing.
        await setup(page);
        await page.evaluate(() => {
            for (const id of ['one', 'two', 'three']) {
                (window as any).__dv.addPanel(id);
            }
        });
        const tabs = page.locator('.dv-tab .dv-default-tab-content');
        await expect(tabs).toHaveText(['one', 'two', 'three']);

        const first = (await page
            .locator('.dv-tab')
            .first()
            .boundingBox())!;
        const last = (await page.locator('.dv-tab').last().boundingBox())!;

        // Land on the right half of the last tab: that is the half that reads
        // as "insert after me".
        const targetX = last.x + last.width * 0.75;
        const targetY = last.y + last.height / 2;
        await page.mouse.move(
            first.x + first.width / 2,
            first.y + first.height / 2
        );
        await page.mouse.down();
        const steps = 15;
        for (let i = 1; i <= steps; i++) {
            await page.mouse.move(
                first.x + first.width / 2 + ((targetX - first.x - first.width / 2) * i) / steps,
                targetY
            );
            await page.waitForTimeout(20);
        }
        await page.waitForTimeout(150);
        await page.mouse.up();

        await expect(tabs).toHaveText(['two', 'three', 'one']);
    });
});
