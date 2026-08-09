import { test, expect, Page } from '@playwright/test';

/**
 * Floating group lifecycle — real-browser behaviour: a floating group renders
 * as a positioned overlay (`.dv-resize-container`) stacked above the docked
 * grid, and its geometry + content survive a serialization round-trip. The
 * overlay positioning depends on a real measured layout, which jsdom can't
 * produce.
 */
test.describe('floating groups', () => {
    const setup = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupFloating());
    };

    test('a floating group renders as a positioned overlay with its content', async ({
        page,
    }) => {
        await setup(page);

        expect(
            await page.evaluate(() => (window as any).__dv.floatingCount())
        ).toBe(1);
        const overlay = page.locator('.dv-resize-container');
        await expect(overlay).toHaveCount(1);

        await expect(overlay.locator('.dv-test-panel')).toContainText(
            'floater'
        );
        await expect(
            page.locator('.dv-test-panel', { hasText: 'main' })
        ).toBeVisible();

        // The overlay is offset from the container origin (a genuine float at
        // ~150,100), not pinned to the top-left like a docked group.
        const box = (await overlay.boundingBox())!;
        expect(box.x).toBeGreaterThan(20);
        expect(box.y).toBeGreaterThan(20);
    });

    test('a floated always-rendered panel paints its content above the floating window', async ({
        page,
    }) => {
        // Regression for the "blank floating window" bug: floating an
        // `always`-rendered panel (its content lives in the overlay render
        // container) mounted the overlay but dropped it *behind* the floating
        // window's opaque background, so the content was invisible until the
        // window was dragged (which re-applied the stacking via the aria-level
        // observer). Existing float tests use the default `onlyWhenVisible`
        // renderer, which mounts content inline and so never exercised this.
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupFloatingAlways());

        // Content renders in the overlay container, not inline in the group.
        const overlay = page.locator('.dv-render-overlay', {
            hasText: 'floater',
        });
        await expect(overlay).toHaveCount(1);

        // Hit-test the centre of the float: the topmost painted element there
        // must be the overlay content, not the floating window's own (empty)
        // content container occluding it. Playwright's `toBeVisible()` ignores
        // z-index occlusion, so an `elementFromPoint` probe is required to catch
        // this — it fails when `resize()` clobbers the overlay's floating
        // z-index back to the grid default.
        const probe = await page.evaluate(() => {
            const ov = Array.from(
                document.querySelectorAll('.dv-render-overlay')
            ).find((el) => /floater/.test(el.textContent || ''));
            if (!ov) {
                return { hit: false, overlayZ: null as string | null };
            }
            const r = ov.getBoundingClientRect();
            const top = document.elementFromPoint(
                r.left + r.width / 2,
                r.top + r.height / 2
            );
            return {
                hit: !!top && ov.contains(top),
                overlayZ: getComputedStyle(ov).zIndex,
            };
        });
        expect(probe.hit).toBe(true);

        // The overlay's resolved stacking must sit above the floating window
        // itself (the `.dv-resize-container`, z 999) — the `+1` that lifts a
        // float's content over its own window.
        const windowZ = await page.evaluate(
            () =>
                getComputedStyle(
                    document.querySelector('.dv-resize-container')!
                ).zIndex
        );
        expect(Number(probe.overlayZ)).toBeGreaterThan(Number(windowZ));
    });

    test('a panel split into a floating group paints its always-rendered content above the window', async ({
        page,
    }) => {
        // Regression for the split-into-float bug: dropping a panel into the
        // edge of a floating group creates a *non-anchor* member group inside
        // the window's nested gridview. The render-overlay z-index lookup only
        // matched the window's anchor group, so a split `always`-rendered
        // panel's content never got the `+1` lift over the window and rendered
        // behind it (blank). Resolving the window by membership fixes it.
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() =>
            (window as any).__dv.setupFloatingSplitAlways()
        );

        // The floating window now hosts two groups; both panels' content lives
        // in the overlay render container.
        await expect(page.locator('.dv-resize-container')).toHaveCount(1);
        const splitOverlay = page.locator('.dv-render-overlay', {
            hasText: 'splitter',
        });
        await expect(splitOverlay).toHaveCount(1);

        // Hit-test the centre of the split panel's overlay: the topmost painted
        // element there must be the overlay content itself, not the floating
        // window occluding it. `toBeVisible()` ignores z-index occlusion, so an
        // `elementFromPoint` probe is required.
        const probe = await page.evaluate(() => {
            const ov = Array.from(
                document.querySelectorAll('.dv-render-overlay')
            ).find((el) => /splitter/.test(el.textContent || ''));
            if (!ov) {
                return { hit: false, overlayZ: null as string | null };
            }
            const r = ov.getBoundingClientRect();
            const top = document.elementFromPoint(
                r.left + r.width / 2,
                r.top + r.height / 2
            );
            return {
                hit: !!top && ov.contains(top),
                overlayZ: getComputedStyle(ov).zIndex,
            };
        });
        expect(probe.hit).toBe(true);

        // The split panel's overlay must stack above the floating window
        // (`.dv-resize-container`) just like the anchor group's content does.
        const windowZ = await page.evaluate(
            () =>
                getComputedStyle(
                    document.querySelector('.dv-resize-container')!
                ).zIndex
        );
        expect(Number(probe.overlayZ)).toBeGreaterThan(Number(windowZ));
    });

    test('a floating group survives a serialization round-trip', async ({
        page,
    }) => {
        await setup(page);
        const before = (await page
            .locator('.dv-resize-container')
            .boundingBox())!;

        // Snapshot carries the floating group…
        const json = await page.evaluate(() =>
            JSON.stringify((window as any).__dv.snapshot())
        );
        expect(json).toContain('floatingGroups');

        // …and a fresh component restoring it rebuilds the float with its
        // content and geometry (unlike a popout, a float restores its content).
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(
            (state) => (window as any).__dv.restore(JSON.parse(state)),
            json
        );

        expect(
            await page.evaluate(() => (window as any).__dv.floatingCount())
        ).toBe(1);
        const overlay = page.locator('.dv-resize-container');
        await expect(overlay).toHaveCount(1);
        await expect(overlay.locator('.dv-test-panel')).toContainText(
            'floater'
        );

        // Geometry is preserved across the round-trip.
        const after = (await overlay.boundingBox())!;
        expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2);
        expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
        expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(2);
        expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);
    });
});
