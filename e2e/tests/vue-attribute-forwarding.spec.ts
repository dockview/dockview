import { test, expect, Page } from '@playwright/test';

/**
 * dockview-vue fallthrough attribute forwarding, in a real browser.
 *
 * Regression coverage for issue #1510: after 7.0.3 the view SFCs render two
 * root nodes (the host element plus `<DockviewPortals>`), turning each into a
 * fragment. Vue only auto-inherits fallthrough attributes (`class`, `style`,
 * ...) onto a SINGLE root, so `<dockview-vue style="...">` silently stopped
 * reaching the outer dockview container. The fix sets `inheritAttrs: false`
 * and binds `$attrs` onto the host `<div ref="el">`.
 *
 * The fixture (e2e/fixtures/vue-attrs.html) sizes the layout ONLY through a
 * `style` attribute on `<DockviewVue>` — no CSS sizes the host otherwise — so
 * if forwarding regresses the host collapses to 0x0 and nothing renders, which
 * the size assertions below catch. jsdom unit tests
 * (packages/dockview-vue/src/__tests__/dockview.spec) assert the attributes
 * land on the element; these prove the layout actually works as a result.
 */
test.describe('dockview-vue fallthrough attribute forwarding', () => {
    const open = async (page: Page) => {
        await page.goto('/e2e/fixtures/vue-attrs.html');
        await page.waitForFunction(() => (window as any).__ready === true);
    };

    test('forwards class and style from <DockviewVue> onto the host container', async ({
        page,
    }) => {
        await open(page);

        // The `class` fell through: the host element exists and is the outer
        // container that owns the dockview root (`.dv-dockview` descendant).
        const host = page.locator('.custom-dockview-host');
        await expect(host).toHaveCount(1);
        await expect(
            page.locator('.custom-dockview-host .dv-dockview')
        ).toHaveCount(1);

        // The `style` fell through: the inline outline is applied.
        expect(
            await page.evaluate(() => (window as any).__attrs.hostOutlineColor())
        ).toBe('rgb(255, 0, 0)');

        // ...and — the real point of #1510 — the `height/width: 100%` in that
        // style sized the host, so the layout actually rendered. Without the
        // forwarding fix the host would be 0x0 here.
        const rect = await page.evaluate(() =>
            (window as any).__attrs.hostRect()
        );
        expect(rect.width).toBeGreaterThan(100);
        expect(rect.height).toBeGreaterThan(100);

        await expect(page.locator('.vue-panel')).toBeVisible();
    });
});

/**
 * The same forwarding must hold for the other three view components
 * (gridview / splitview / paneview), which share the host-binding code path
 * via `useViewComponent`. Their SFCs statically size the host, so instead of
 * a size check these assert the forwarded `class` landed on the real host
 * (it owns the view's inner container) and the `style` outline applied.
 */
test.describe('dockview-vue fallthrough attribute forwarding (grid/split/pane)', () => {
    const open = async (page: Page) => {
        await page.goto('/e2e/fixtures/vue-attrs-views.html');
        await page.waitForFunction(() => (window as any).__ready === true);
    };

    for (const view of ['gridview', 'splitview', 'paneview'] as const) {
        test(`forwards class and style onto the ${view} host container`, async ({
            page,
        }) => {
            await open(page);

            const result = await page.evaluate(
                (v) => (window as any).__views[v](),
                view
            );

            // `class` fell through onto the host, which owns the inner
            // view container (`.dv-grid-view` / `.dv-split-view-container` /
            // `.dv-pane-container`).
            expect(result.ownsContainer).toBe(true);
            // `style` fell through.
            expect(result.outlineColor).toBe('rgb(255, 0, 0)');
        });
    }
});
