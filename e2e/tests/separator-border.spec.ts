import { test, expect } from '@playwright/test';

/**
 * Separator rendering (#956). The seam between two split-view groups used to be
 * drawn as a `::before` pseudo-element overlaid on top of panel content at
 * `z-index: 5`, obscuring the content edge. It is now a `border-left`
 * (horizontal) / `border-top` (vertical) on the non-first `.dv-view`; because
 * `.dv-view` is `box-sizing: border-box` the border insets the content instead
 * of covering it.
 *
 * The border rules are scoped to the container's *direct* view children so the
 * separator never leaks onto the opposite axis of views in a nested,
 * oppositely-oriented split-view container.
 *
 * Real-browser only: it needs the built stylesheet applied and real computed
 * styles / pseudo-element resolution, neither of which jsdom models.
 */
test.describe('split-view separator', () => {
    test('is an inset border on the correct axis, not a content overlay', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);

        // Two groups side by side → a horizontal split-view container with a
        // separator seam between the first and second `.dv-view`. In dockview's
        // grid this horizontal container is itself nested inside an
        // oppositely-oriented (vertical) container, which is exactly the shape
        // that surfaces a leaking descendant selector.
        await page.evaluate(() => {
            (window as any).__dv.addPanel('alpha');
            (window as any).__dv.addPanelSplit('beta', 'alpha', 'right');
        });

        const result = await page.evaluate(() => {
            // Pick the horizontal separator container that actually holds the
            // two side-by-side groups.
            const container = Array.from(
                document.querySelectorAll(
                    '.dv-split-view-container.dv-horizontal.dv-separator-border'
                )
            ).find(
                (c) =>
                    c.querySelectorAll(
                        ':scope > .dv-view-container > .dv-view'
                    ).length === 2
            ) as HTMLElement | undefined;

            if (!container) {
                return { found: false } as const;
            }

            const second = container.querySelectorAll(
                ':scope > .dv-view-container > .dv-view'
            )[1] as HTMLElement;

            const style = getComputedStyle(second);
            const before = getComputedStyle(second, '::before');

            return {
                found: true,
                borderLeftWidth: style.borderLeftWidth,
                borderLeftStyle: style.borderLeftStyle,
                borderLeftColor: style.borderLeftColor,
                borderTopWidth: style.borderTopWidth,
                boxSizing: style.boxSizing,
                beforeContent: before.content,
            } as const;
        });

        expect(result.found).toBe(true);
        if (!result.found) {
            return;
        }

        // The separator is a real 1px solid inset border on the split axis…
        expect(result.borderLeftWidth).toBe('1px');
        expect(result.borderLeftStyle).toBe('solid');
        expect(result.boxSizing).toBe('border-box');
        // …painted with a visible (non-transparent) separator colour…
        expect(result.borderLeftColor).not.toBe('rgba(0, 0, 0, 0)');
        expect(result.borderLeftColor).not.toBe('transparent');
        // …and NOT drawn on the cross axis: the vertical-container border rule
        // must not leak into this nested horizontal container's views.
        expect(result.borderTopWidth).toBe('0px');
        // …and the old obscuring `::before` overlay is gone.
        expect(result.beforeContent).toBe('none');
    });
});
