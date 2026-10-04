import { test, expect } from '@playwright/test';

/**
 * Smooth tab reorder in a vertical header (the left/right edge groups).
 * Real-browser only: the reorder walks the tabs by their laid-out sizes and
 * opens the gap as a real CSS margin, neither of which jsdom produces. The
 * fixture opts into `tabAnimation: 'smooth'` via `?smooth=1` and into the
 * native backend via `?dnd=html5`.
 *
 * Regression: the drag-over half used to be hard-coded to the x axis, so in a
 * vertical strip the insertion index never moved off its first slot — the gap
 * opened sideways and the drop was swallowed.
 * https://github.com/dockview/dockview/issues/1640
 */
test.describe('vertical tab reorder (smooth)', () => {
    const setup = async (page) => {
        await page.goto('/e2e/fixtures/index.html?smooth=1&dnd=html5');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => {
            for (const id of ['a', 'b', 'c', 'd']) {
                (window as any).__dv.addPanel(id);
            }
            (window as any).__dv.setHeaderPosition('left');
        });
        await expect(page.locator('.dv-tabs-container-vertical')).toHaveCount(
            1
        );
    };

    const tabTitles = (page) =>
        page.locator(
            '.dv-tabs-container-vertical .dv-tab .dv-default-tab-content'
        );

    test('a tab dragged past the end of the strip lands at the end', async ({
        page,
    }) => {
        await setup(page);
        await expect(tabTitles(page)).toHaveText(['a', 'b', 'c', 'd']);

        // Synthetic HTML5 drag at real geometry: the strip is a column, so the
        // drop position is carried by clientY.
        await page.evaluate(async () => {
            const frame = () =>
                new Promise((r) => requestAnimationFrame(() => r(null)));
            const strip = document.querySelector('.dv-tabs-container-vertical')!;
            const tabs = Array.from(
                strip.querySelectorAll<HTMLElement>('.dv-tab')
            );
            const source = tabs[0];
            const dataTransfer = new DataTransfer();
            const x = source.getBoundingClientRect().x + 5;

            source.dispatchEvent(
                new DragEvent('dragstart', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer,
                })
            );
            // The source tab collapses in a rAF; the gap only opens after that.
            await frame();
            await frame();

            // Past the last tab, measured after the collapse reflow.
            const live = Array.from(
                strip.querySelectorAll<HTMLElement>('.dv-tab')
            );
            const clientY =
                live[live.length - 1].getBoundingClientRect().bottom - 4;

            for (const type of ['dragover', 'drop']) {
                strip.dispatchEvent(
                    new DragEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer,
                        clientX: x,
                        clientY,
                    })
                );
            }
            source.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
        });

        await expect(tabTitles(page)).toHaveText(['b', 'c', 'd', 'a']);
    });

    test('the insertion gap follows the cursor down the strip, not across it', async ({
        page,
    }) => {
        await setup(page);

        const probe = await page.evaluate(async () => {
            const frame = () =>
                new Promise((r) => requestAnimationFrame(() => r(null)));
            const strip = document.querySelector('.dv-tabs-container-vertical')!;
            const source = strip.querySelector<HTMLElement>('.dv-tab')!;
            const sourceHeight = source.getBoundingClientRect().height;
            const dataTransfer = new DataTransfer();
            const x = source.getBoundingClientRect().x + 5;

            source.dispatchEvent(
                new DragEvent('dragstart', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer,
                })
            );
            await frame();
            await frame();

            /** Hover at `clientY` and report where the gap opened. */
            const hoverAt = (clientY: number) => {
                strip.dispatchEvent(
                    new DragEvent('dragover', {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer,
                        clientX: x,
                        clientY,
                    })
                );
                const tabs = Array.from(
                    strip.querySelectorAll<HTMLElement>('.dv-tab')
                );
                return {
                    // A cleared gap is left at 0px until its transition ends,
                    // so only a positive margin counts as open.
                    openedAt: tabs.findIndex(
                        (t) => parseFloat(t.style.marginTop || '0') > 0
                    ),
                    openedBy: Math.max(
                        ...tabs.map((t) =>
                            parseFloat(t.style.marginTop || '0')
                        )
                    ),
                    anySideways: tabs.some(
                        (t) => parseFloat(t.style.marginLeft || '0') !== 0
                    ),
                };
            };

            // Walk the cursor down the collapsed strip, one tab at a time.
            const live = Array.from(
                strip.querySelectorAll<HTMLElement>('.dv-tab')
            ).filter((t) => t !== source);
            const steps = live.map((t) =>
                hoverAt(t.getBoundingClientRect().top + 4)
            );

            source.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
            return { steps, sourceHeight };
        });

        // The gap is sized to the dragged tab and never runs across the strip.
        const opened = probe.steps.filter((s) => s.openedAt !== -1);
        expect(opened.length).toBeGreaterThan(1);
        for (const step of opened) {
            expect(step.openedBy).toBeCloseTo(probe.sourceHeight, 0);
        }
        expect(probe.steps.some((s) => s.anySideways)).toBe(false);

        // And it tracks the cursor: moving down the strip moves the gap down
        // (it used to be pinned to the first slot whatever the cursor did).
        const slots = opened.map((s) => s.openedAt);
        expect(slots).toEqual([...slots].sort((a, b) => a - b));
        expect(new Set(slots).size).toBeGreaterThan(1);
    });
});
