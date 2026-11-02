import { test, expect } from '@playwright/test';

/**
 * Paneview separators (#956 follow-through). Paneview is built on a *vertical*
 * split-view and draws its own inter-pane separator via the pane header's
 * `border-top`. Two things must hold once the split-view separator is a border
 * (rather than the old `::before` overlay):
 *
 *  1. Panes still span the container width. `layoutViews()` clears the inline
 *     width for vertical views and relies on the split-view's `width: 100%`
 *     rule for the cross axis; dropping it collapses every pane.
 *  2. The split-view separator border must not double up with the pane header
 *     border — paneview suppresses it, and that reset has to out-specify the
 *     core separator rule.
 *
 * Real-browser only: needs the built stylesheet, a theme (so
 * `--dv-separator-border` is defined), and real computed geometry.
 */
test.describe('paneview separator', () => {
    test('panes keep full width and get no doubled split-view border', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/paneview.html');
        await page.waitForFunction(() => (window as any).__ready === true);

        const result = await page.evaluate(() => {
            const container = document.querySelector(
                '.dv-pane-container .dv-split-view-container.dv-vertical'
            ) as HTMLElement | null;
            if (!container) {
                return { found: false } as const;
            }
            const views = Array.from(
                container.querySelectorAll(
                    ':scope > .dv-view-container > .dv-view'
                )
            ) as HTMLElement[];
            if (views.length < 2) {
                return { found: false } as const;
            }
            return {
                found: true,
                count: views.length,
                // A non-first pane: width (cross axis) and the split-view
                // separator border that must be suppressed.
                secondWidth: views[1].getBoundingClientRect().width,
                secondBorderTop: getComputedStyle(views[1]).borderTopWidth,
                firstWidth: views[0].getBoundingClientRect().width,
            } as const;
        });

        expect(result.found).toBe(true);
        if (!result.found) {
            return;
        }

        expect(result.count).toBe(3);
        // Cross-axis width is preserved (rule #1): panes are not collapsed.
        expect(result.firstWidth).toBeGreaterThan(0);
        expect(result.secondWidth).toBeGreaterThan(0);
        // No doubled split-view separator border on the pane (rule #2). The
        // visible separator comes from the pane header's own border-top.
        expect(result.secondBorderTop).toBe('0px');
    });
});
