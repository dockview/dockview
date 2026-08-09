import { test, expect } from '@playwright/test';

/**
 * Multi-row (wrapping) tabs — Phase 2 wrap render mode. Real-browser only: it
 * depends on the tab strip actually wrapping and the header growing, which jsdom
 * (no layout) can't produce. The fixture opts into `overflow.mode: 'wrap'` via
 * `?overflow=wrap`.
 */
test.describe('multi-row tabs (wrap mode)', () => {
    const setup = async (page) => {
        await page.goto('/e2e/fixtures/index.html?overflow=wrap');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupWrapTabs(20));
    };

    test('tabs wrap onto multiple rows and the header grows', async ({
        page,
    }) => {
        await setup(page);

        const tabsList = page.locator('.dv-tabs-container').first();
        await expect(tabsList).toHaveClass(/dv-tabs-container--wrap/);

        // the tabs occupy more than one row (more than one distinct offsetTop)
        const rowCount = await page.evaluate(() => {
            const list = document.querySelector('.dv-tabs-container')!;
            const tops = new Set<number>();
            list.querySelectorAll<HTMLElement>('.dv-tab').forEach((t) =>
                tops.add(t.offsetTop)
            );
            return tops.size;
        });
        expect(rowCount).toBeGreaterThan(1);

        // the header grew past a single row (default row height is 44px)
        const header = (await page
            .locator('.dv-tabs-and-actions-container')
            .first()
            .boundingBox())!;
        expect(header.height).toBeGreaterThan(44);
    });

    test('wrapped rows fill the row height (no gap) and header chrome stays on the first row', async ({
        page,
    }) => {
        await setup(page);

        const m = await page.evaluate(() => {
            const header = document.querySelector(
                '.dv-tabs-and-actions-container'
            ) as HTMLElement;
            const tab = document.querySelector(
                '.dv-tabs-container .dv-tab'
            ) as HTMLElement;
            const right = document.querySelector(
                '.dv-right-actions-container'
            ) as HTMLElement;
            const rowH = parseFloat(
                getComputedStyle(header).getPropertyValue(
                    '--dv-tabs-and-actions-container-height'
                )
            );
            return {
                rowH,
                headerH: header.offsetHeight,
                tabH: tab.offsetHeight,
                rightH: right ? right.offsetHeight : 0,
            };
        });

        expect(m.rowH).toBeGreaterThan(0); // the row-height var resolves
        // header actually wrapped to more than one row
        expect(m.headerH).toBeGreaterThan(m.rowH);
        // each wrapped tab fills a full row — no gap below the tab
        expect(m.tabH).toBe(m.rowH);
        // header actions sit on the first row, not stretched across all rows
        expect(m.rightH).toBe(m.rowH);
        expect(m.rightH).toBeLessThan(m.headerH);
    });

    test('content shrinks to the area below the multi-row header', async ({
        page,
    }) => {
        await setup(page);

        const groupBox = (await page
            .locator('.dv-groupview')
            .first()
            .boundingBox())!;
        const headerBox = (await page
            .locator('.dv-tabs-and-actions-container')
            .first()
            .boundingBox())!;
        const contentBox = (await page
            .locator('.dv-content-container')
            .first()
            .boundingBox())!;

        expect(headerBox.height).toBeGreaterThan(44);

        // the active panel was laid out with the shrunk content area, not the
        // header-inclusive group box (the content-sizing seam + relayout)
        const reported = await page.evaluate(() =>
            (window as any).__dv.panelDimensions('wrap-tab-19')
        );
        expect(reported).toBeTruthy();
        expect(reported.height).toBeCloseTo(contentBox.height, 0);
        expect(reported.height).toBeCloseTo(
            groupBox.height - headerBox.height,
            0
        );
    });

    // `overflow.maxRows` caps the header height; the surplus rows spill into the
    // chevron dropdown. Real-browser only (row count is a layout fact).
    test('maxRows caps the header and spills the surplus into the dropdown', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html?overflow=wrap&maxRows=2');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupWrapTabs(20));

        const tabsList = page.locator('.dv-tabs-container').first();
        await expect(tabsList).toHaveClass(/dv-tabs-container--wrap-capped/);

        const m = await page.evaluate(() => {
            const list = document.querySelector(
                '.dv-tabs-container'
            ) as HTMLElement;
            const header = document.querySelector(
                '.dv-tabs-and-actions-container'
            ) as HTMLElement;
            const rowH = parseFloat(
                getComputedStyle(header).getPropertyValue(
                    '--dv-tabs-and-actions-container-height'
                )
            );
            return {
                rowH,
                headerH: header.offsetHeight,
                clientH: list.clientHeight,
                scrollH: list.scrollHeight,
            };
        });

        // The header grew past a single row but is capped at two.
        expect(m.headerH).toBeGreaterThan(m.rowH);
        expect(m.headerH).toBeLessThanOrEqual(m.rowH * 2 + 1);
        // The strip clips the surplus rows (natural content is taller than the
        // capped client box).
        expect(m.scrollH).toBeGreaterThan(m.clientH);
        // The surplus tabs appear in the overflow dropdown chevron.
        await expect(
            page.locator('.dv-tabs-overflow-dropdown-root').first()
        ).toBeVisible();
    });

    test('the overflow dropdown lists the surplus tabs (a suffix of the strip)', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html?overflow=wrap&maxRows=2');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupWrapTabs(20));

        const handle = page.locator('.dv-tabs-overflow-dropdown-default');
        await expect(handle).toBeVisible();
        await handle.click();

        const overflow = page.locator('.dv-tabs-overflow-container');
        await expect(overflow).toBeVisible();

        const listed = await overflow
            .locator('.dv-tab')
            .allInnerTexts()
            .then((texts) => texts.map((t) => t.trim()));

        // The surplus is a suffix: the last tab spilled, the first did not.
        expect(listed).toContain('wrap-tab-long-title-19');
        expect(listed).not.toContain('wrap-tab-long-title-0');

        await overflow
            .locator('.dv-tab', { hasText: 'wrap-tab-long-title-19' })
            .click();
        await expect(page.locator('.dv-active-tab')).toHaveText(
            'wrap-tab-long-title-19'
        );
        await expect(overflow).toHaveCount(0);
    });

    test('closing the surplus tabs reflows the cap away (dropdown disappears)', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html?overflow=wrap&maxRows=2');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupWrapTabs(20));

        await expect(
            page.locator('.dv-tabs-overflow-dropdown-root').first()
        ).toBeVisible();

        // Close most panels so the remainder fits within the 2-row cap.
        await page.evaluate(() => {
            for (let i = 4; i < 20; i++) {
                (window as any).__dv.closePanel('wrap-tab-' + i);
            }
        });

        // No surplus left → the dropdown is gone, but wrap is still active.
        await expect(
            page.locator('.dv-tabs-overflow-dropdown-root')
        ).toHaveCount(0);
        await expect(page.locator('.dv-tabs-container').first()).toHaveClass(
            /dv-tabs-container--wrap-capped/
        );
    });

    test('raising maxRows re-admits the surplus rows and grows the header', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html?overflow=wrap&maxRows=2');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupWrapTabs(20));

        const cappedHeader = (await page
            .locator('.dv-tabs-and-actions-container')
            .first()
            .boundingBox())!;

        // Raise the cap high enough to fit every row.
        await page.evaluate(() =>
            (window as any).__dv.setOverflow({ mode: 'wrap', maxRows: 20 })
        );

        // The header grew (more rows now fit) and the dropdown emptied.
        await expect
            .poll(async () => {
                const box = await page
                    .locator('.dv-tabs-and-actions-container')
                    .first()
                    .boundingBox();
                return box!.height;
            })
            .toBeGreaterThan(cappedHeader.height);

        await expect(
            page.locator('.dv-tabs-overflow-dropdown-root')
        ).toHaveCount(0);
    });

    test('no wrap class without the opt-in', async ({ page }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupWrapTabs(20));

        await expect(
            page.locator('.dv-tabs-container').first()
        ).not.toHaveClass(/dv-tabs-container--wrap/);
    });

    // Regression: even without `overflow.maxRows`, an unbounded wrap must not
    // grow the header past the group and render its extra rows off-screen. The
    // header is bounded by the group's height and the surplus rows spill into
    // the overflow dropdown, keeping every tab reachable.
    test('unbounded wrap is bounded by the group height: surplus rows spill to the dropdown, nothing off-screen', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html?overflow=wrap');
        await page.waitForFunction(() => (window as any).__ready === true);
        // A short group with many tabs: the rows can't all fit.
        await page.setViewportSize({ width: 500, height: 400 });
        await page.evaluate(() => (window as any).__dv.setupWrapTabs(80));

        const tabsList = page.locator('.dv-tabs-container').first();
        // The space cap clips the strip even though no `maxRows` was set.
        await expect(tabsList).toHaveClass(/dv-tabs-container--wrap-capped/);

        // Retry until the space-cap reflow + relayout settle.
        await expect(async () => {
            const m = await page.evaluate(() => {
                const group = document.querySelector(
                    '.dv-groupview'
                ) as HTMLElement;
                const header = document.querySelector(
                    '.dv-tabs-and-actions-container'
                ) as HTMLElement;
                const list = document.querySelector(
                    '.dv-tabs-container'
                ) as HTMLElement;
                const gb = group.getBoundingClientRect();
                const hb = header.getBoundingClientRect();
                const lb = list.getBoundingClientRect();
                const tabs = Array.from(
                    list.querySelectorAll<HTMLElement>('.dv-tab')
                );
                // Of the tabs still visible in the clipped strip, how many
                // escape the group box (render off-screen over the content)?
                const visibleEscaped = tabs.filter((t) => {
                    const r = t.getBoundingClientRect();
                    const inStrip =
                        r.bottom > lb.top + 0.5 && r.top < lb.bottom - 0.5;
                    return (
                        inStrip &&
                        (r.bottom > gb.bottom + 1 || r.top < gb.top - 1)
                    );
                }).length;
                return {
                    headerBottom: Math.round(hb.bottom),
                    groupBottom: Math.round(gb.bottom),
                    visibleEscaped,
                };
            });
            // The header never grows past the group's bottom edge ...
            expect(m.headerBottom).toBeLessThanOrEqual(m.groupBottom + 1);
            // ... so no visible tab renders off-screen.
            expect(m.visibleEscaped).toBe(0);
        }).toPass();

        // The surplus rows are reachable in the overflow dropdown.
        await expect(
            page.locator('.dv-tabs-overflow-dropdown-root').first()
        ).toBeVisible();
    });

    // Phase 3: 2-D cross-row drag reorder (smooth mode). A tab dragged from a
    // lower row to a slot on an upper row reorders across the row boundary.
    // Covers both animation modes: default (per-tab drop targets — the common
    // case) and smooth (the tabs-list / pointer-end commit path). `tabAnimation`
    // defaults to 'default', so both must work.
    const reorderAcrossRows = async (page, query: string) => {
        await page.goto(`/e2e/fixtures/index.html?${query}`);
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupWrapTabs(20));

        const tabOrder = () =>
            page.evaluate(() =>
                Array.from(
                    document.querySelectorAll('.dv-tabs-container .dv-tab')
                ).map((t) => (t as HTMLElement).innerText.trim())
            );

        const before = await tabOrder();
        expect(before.length).toBe(20);
        // sanity: tabs really wrapped to more than one row
        const rows = await page.evaluate(() => {
            const tops = new Set<number>();
            document
                .querySelectorAll<HTMLElement>('.dv-tabs-container .dv-tab')
                .forEach((t) => tops.add(t.offsetTop));
            return tops.size;
        });
        expect(rows).toBeGreaterThan(1);

        // drag the last tab (a lower row) to the front (first tab, upper row)
        const s = (await page
            .locator('.dv-tab', { hasText: 'wrap-tab-long-title-19' })
            .boundingBox())!;
        const t = (await page
            .locator('.dv-tab', { hasText: 'wrap-tab-long-title-0' })
            .boundingBox())!;

        await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
        await page.mouse.down();
        // nudge to start the drag
        await page.mouse.move(s.x + s.width / 2 + 6, s.y + s.height / 2);
        // move onto the left half of the first tab (insert before it)
        await page.mouse.move(t.x + 3, t.y + t.height / 2, { steps: 20 });
        await page.mouse.up();

        const after = await tabOrder();
        // the dragged tab moved to the front and the set is unchanged
        expect(after[0]).toContain('wrap-tab-long-title-19');
        expect([...after].sort()).toEqual([...before].sort());
        expect(after).not.toEqual(before);
    };

    test('a tab drags across rows to reorder (default mode)', async ({
        page,
    }) => {
        await reorderAcrossRows(page, 'overflow=wrap');
    });

    test('a tab drags across rows to reorder (smooth mode)', async ({
        page,
    }) => {
        await reorderAcrossRows(page, 'overflow=wrap&smooth=1');
    });

    // Arrow Up/Down move the roving focus between wrapped rows (core keeps
    // Left/Right within a row). Real geometry: the target is the tab in the
    // adjacent row whose horizontal centre is nearest the focused tab's.
    // --- DV-14: vertical (edge-group) headers wrap into COLUMNS ---
    // Real-browser only: depends on `writing-mode: vertical-rl` + `flex-wrap`
    // producing columns and the header growing in width — neither of which jsdom
    // lays out. The group's header is flipped to `left` after load.
    const setupVertical = async (page, query = 'overflow=wrap', count = 24) => {
        await page.goto(`/e2e/fixtures/index.html?${query}`);
        await page.waitForFunction(() => (window as any).__ready === true);
        // Add the tabs first (this creates the group), then flip the header to a
        // vertical position — which also drives the runtime direction-change
        // signal that re-applies wrap on the column axis (DV-14 / P1).
        await page.evaluate(
            (n) => (window as any).__dv.setupWrapTabs(n),
            count
        );
        await page.evaluate(() =>
            (window as any).__dv.setHeaderPosition('left')
        );
    };

    const columnCount = (page) =>
        page.evaluate(() => {
            const lefts = new Set<number>();
            document
                .querySelectorAll<HTMLElement>('.dv-tabs-container .dv-tab')
                .forEach((t) => lefts.add(t.offsetLeft));
            return lefts.size;
        });

    test('vertical header: tabs wrap into multiple columns and the header grows in width', async ({
        page,
    }) => {
        await setupVertical(page);

        const tabsList = page.locator('.dv-tabs-container').first();
        await expect(tabsList).toHaveClass(/dv-tabs-container-vertical/);
        await expect(tabsList).toHaveClass(/dv-tabs-container--wrap/);

        // the tabs occupy more than one column (more than one distinct offsetLeft)
        await expect.poll(() => columnCount(page)).toBeGreaterThan(1);

        // the header grew past a single column (default column width var)
        const m = await page.evaluate(() => {
            const header = document.querySelector(
                '.dv-tabs-and-actions-container'
            ) as HTMLElement;
            const colW = parseFloat(
                getComputedStyle(header).getPropertyValue(
                    '--dv-tabs-and-actions-container-height'
                )
            );
            return { colW, headerW: header.offsetWidth };
        });
        expect(m.colW).toBeGreaterThan(0);
        expect(m.headerW).toBeGreaterThan(m.colW);
    });

    test('vertical header: maxRows caps the header width and spills the surplus into the dropdown', async ({
        page,
    }) => {
        await setupVertical(page, 'overflow=wrap&maxRows=2');

        const tabsList = page.locator('.dv-tabs-container').first();
        await expect(tabsList).toHaveClass(/dv-tabs-container--wrap-capped/);

        const m = await page.evaluate(() => {
            const list = document.querySelector(
                '.dv-tabs-container'
            ) as HTMLElement;
            const header = document.querySelector(
                '.dv-tabs-and-actions-container'
            ) as HTMLElement;
            const colW = parseFloat(
                getComputedStyle(header).getPropertyValue(
                    '--dv-tabs-and-actions-container-height'
                )
            );
            return {
                colW,
                headerW: header.offsetWidth,
                clientW: list.clientWidth,
                scrollW: list.scrollWidth,
            };
        });

        // The header grew past a single column but is capped at two.
        expect(m.headerW).toBeGreaterThan(m.colW);
        expect(m.headerW).toBeLessThanOrEqual(m.colW * 2 + 1);
        // The strip clips the surplus columns (natural content is wider than the
        // capped client box).
        expect(m.scrollW).toBeGreaterThan(m.clientW);
        // The surplus tabs appear in the overflow dropdown chevron.
        await expect(
            page.locator('.dv-tabs-overflow-dropdown-root').first()
        ).toBeVisible();
    });

    test('vertical header: a tab drags across columns to reorder', async ({
        page,
    }) => {
        await setupVertical(page);

        const tabOrder = () =>
            page.evaluate(() =>
                Array.from(
                    document.querySelectorAll('.dv-tabs-container .dv-tab')
                ).map((t) => (t as HTMLElement).innerText.trim())
            );

        const before = await tabOrder();
        expect(before.length).toBe(24);
        await expect.poll(() => columnCount(page)).toBeGreaterThan(1);

        // drag the last tab (a later column) onto the first tab (first column)
        const s = (await page
            .locator('.dv-tab', { hasText: 'wrap-tab-long-title-23' })
            .boundingBox())!;
        const t = (await page
            .locator('.dv-tab', { hasText: 'wrap-tab-long-title-0' })
            .boundingBox())!;

        await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
        await page.mouse.down();
        await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2 + 6);
        // move onto the top half of the first tab (insert before it)
        await page.mouse.move(t.x + t.width / 2, t.y + 3, { steps: 20 });
        await page.mouse.up();

        const after = await tabOrder();
        expect(after[0]).toContain('wrap-tab-long-title-23');
        expect([...after].sort()).toEqual([...before].sort());
        expect(after).not.toEqual(before);
    });

    test('vertical header: no wrap class without the opt-in', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupWrapTabs(24));
        await page.evaluate(() =>
            (window as any).__dv.setHeaderPosition('left')
        );

        const list = page.locator('.dv-tabs-container').first();
        await expect(list).toHaveClass(/dv-tabs-container-vertical/);
        await expect(list).not.toHaveClass(/dv-tabs-container--wrap/);
    });

    // Header `right` is the mirror of `left`: columns wrap the same way but the
    // strip hugs the right edge and the content sits to its left. The existing
    // vertical coverage only drives `left`, so this guards the mirrored axis.
    const setupVerticalRight = async (page, count = 24) => {
        await page.goto('/e2e/fixtures/index.html?overflow=wrap');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(
            (n) => (window as any).__dv.setupWrapTabs(n),
            count
        );
        await page.evaluate(() =>
            (window as any).__dv.setHeaderPosition('right')
        );
    };

    test('vertical header (right): tabs wrap into columns, header hugs the right edge, content sits left', async ({
        page,
    }) => {
        await setupVerticalRight(page);

        const tabsList = page.locator('.dv-tabs-container').first();
        await expect(tabsList).toHaveClass(/dv-tabs-container-vertical/);
        await expect(tabsList).toHaveClass(/dv-tabs-container--wrap/);
        await expect.poll(() => columnCount(page)).toBeGreaterThan(1);

        const groupBox = (await page
            .locator('.dv-groupview')
            .first()
            .boundingBox())!;
        const headerBox = (await page
            .locator('.dv-tabs-and-actions-container')
            .first()
            .boundingBox())!;
        const contentBox = (await page
            .locator('.dv-content-container')
            .first()
            .boundingBox())!;

        // Multi-column header pinned to the group's right edge ...
        expect(headerBox.width).toBeGreaterThan(0);
        expect(Math.round(headerBox.x + headerBox.width)).toBeCloseTo(
            Math.round(groupBox.x + groupBox.width),
            0
        );
        // ... with the content filling the remaining width to its left.
        expect(Math.round(contentBox.x)).toBeCloseTo(Math.round(groupBox.x), 0);
        expect(contentBox.width).toBeCloseTo(
            groupBox.width - headerBox.width,
            0
        );
    });

    test('vertical header: content shrinks to the area beside the multi-column header', async ({
        page,
    }) => {
        // The vertical analogue of the horizontal "content shrinks below the
        // multi-row header" case: the active panel must be laid out against the
        // width left over beside the grown header, not the header-inclusive
        // group box.
        await setupVertical(page);
        await expect.poll(() => columnCount(page)).toBeGreaterThan(1);

        const groupBox = (await page
            .locator('.dv-groupview')
            .first()
            .boundingBox())!;
        const headerBox = (await page
            .locator('.dv-tabs-and-actions-container')
            .first()
            .boundingBox())!;
        const contentBox = (await page
            .locator('.dv-content-container')
            .first()
            .boundingBox())!;

        // The header grew wider than a single column.
        const colW = await page.evaluate(() =>
            parseFloat(
                getComputedStyle(
                    document.querySelector(
                        '.dv-tabs-and-actions-container'
                    ) as HTMLElement
                ).getPropertyValue('--dv-tabs-and-actions-container-height')
            )
        );
        expect(headerBox.width).toBeGreaterThan(colW);

        // The active panel was sized to the shrunk content area (group width
        // minus the multi-column header), not the full group width.
        const reported = await page.evaluate(() =>
            (window as any).__dv.panelDimensions('wrap-tab-23')
        );
        expect(reported).toBeTruthy();
        expect(reported.width).toBeCloseTo(contentBox.width, 0);
        expect(reported.width).toBeCloseTo(groupBox.width - headerBox.width, 0);
    });

    test('vertical header: wrapped columns are not clipped by the strip', async ({
        page,
    }) => {
        // "Renders well" invariant for lots of tabs: with an uncapped wrap the
        // strip must widen to hold every column so no tab box escapes it (the
        // failure mode is columns overflowing a fixed-width strip and vanishing).
        await setupVertical(page, 'overflow=wrap', 40);
        await expect.poll(() => columnCount(page)).toBeGreaterThan(1);

        const m = await page.evaluate(() => {
            const list = document.querySelector(
                '.dv-tabs-container'
            ) as HTMLElement;
            const box = list.getBoundingClientRect();
            const tabs = Array.from(
                list.querySelectorAll<HTMLElement>('.dv-tab')
            );
            const clipped = tabs.filter((t) => {
                const r = t.getBoundingClientRect();
                return r.left < box.left - 1 || r.right > box.right + 1;
            });
            return {
                tabCount: tabs.length,
                clipped: clipped.length,
                scrollWidth: list.scrollWidth,
                clientWidth: list.clientWidth,
            };
        });

        expect(m.tabCount).toBe(40);
        // No column overflows the strip's own width ...
        expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1);
        // ... so every tab stays visible inside it.
        expect(m.clipped).toBe(0);
    });

    // Regression: a vertical wrap header must re-grow its cross-size (width)
    // when a container resize reflows the tabs into more columns. Its `auto`
    // width can't account for the wrap (the strip wraps on its indefinite
    // percentage height), so without the module pinning the width the surplus
    // columns overflow the header and render over the panel content. The
    // `MultiRowTabsService` sizes the header to `columns x lineThickness` on the
    // reflow to keep every column inside it.
    const headerMetrics = (page) =>
        page.evaluate(() => {
            const header = document.querySelector(
                '.dv-tabs-and-actions-container'
            ) as HTMLElement;
            const content = document.querySelector(
                '.dv-content-container'
            ) as HTMLElement;
            const hb = header.getBoundingClientRect();
            const tabs = Array.from(
                document.querySelectorAll<HTMLElement>('.dv-tab')
            );
            return {
                cols: new Set(tabs.map((t) => t.offsetLeft)).size,
                headerWidth: Math.round(hb.width),
                contentLeft: Math.round(content.getBoundingClientRect().left),
                escaped: tabs.filter(
                    (t) => t.getBoundingClientRect().right > hb.right + 1
                ).length,
            };
        });

    test('vertical header: columns reflowed by a resize stay inside the header', async ({
        page,
    }) => {
        // Initial layout: 24 tabs under a left header wrap into a handful of
        // columns and the header grows to fit them — nothing overflows.
        await setupVertical(page);
        await expect.poll(() => columnCount(page)).toBeGreaterThan(1);
        const before = await headerMetrics(page);
        expect(before.escaped).toBe(0);

        // Shrink the viewport so the (shorter) group reflows the tabs into more
        // columns than the header was originally sized for. A vertical strip
        // wraps on its HEIGHT, so the height has to drop far enough to change
        // how many tabs fit in a column; trimming the width alone reflows
        // nothing. Retry the whole assertion until the reflow + header re-pin +
        // relayout settle (the pin lands a frame after the column count
        // changes).
        await page.setViewportSize({ width: 900, height: 400 });
        await expect(async () => {
            const after = await headerMetrics(page);
            // More columns than before ...
            expect(after.cols).toBeGreaterThan(before.cols);
            // ... the header re-grew to hold them ...
            expect(after.headerWidth).toBeGreaterThan(before.headerWidth);
            // ... every column stays inside it (nothing spills over content) ...
            expect(after.escaped).toBe(0);
            // ... and the content starts exactly at the widened header's edge.
            expect(after.contentLeft).toBeCloseTo(after.headerWidth, 0);
        }).toPass();
    });

    test('vertical header: the header shrinks back when a resize removes columns', async ({
        page,
    }) => {
        // Grow the header (more columns) then enlarge the viewport again: the
        // header must release the reclaimed width, not stay stuck wide.
        await setupVertical(page);
        await expect.poll(() => columnCount(page)).toBeGreaterThan(1);
        const initial = await headerMetrics(page);

        // Shrink (on the wrap axis, height) → strictly more columns, a wider
        // header (retry until settled).
        await page.setViewportSize({ width: 900, height: 400 });
        await expect(async () => {
            const m = await headerMetrics(page);
            expect(m.cols).toBeGreaterThan(initial.cols);
            expect(m.headerWidth).toBeGreaterThan(initial.headerWidth);
        }).toPass();
        const narrow = await headerMetrics(page);

        // Enlarge again → the columns (and the header width) must come back down.
        await page.setViewportSize({ width: 1280, height: 720 });
        await expect(async () => {
            const wide = await headerMetrics(page);
            expect(wide.cols).toBeLessThan(narrow.cols);
            expect(wide.headerWidth).toBeLessThan(narrow.headerWidth);
            expect(wide.escaped).toBe(0);
        }).toPass();
    });

    // Regression (vertical mirror): an unbounded column wrap must not grow the
    // header past the group's right edge and render its extra columns off-screen
    // over the content. The header is bounded by the group's width and the
    // surplus columns spill into the overflow dropdown.
    test('vertical header: unbounded wrap is bounded by the group width: surplus columns spill to the dropdown, nothing off-screen', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html?overflow=wrap');
        await page.waitForFunction(() => (window as any).__ready === true);
        // A short group so columns fill quickly, with many tabs so the columns
        // exceed the group width.
        await page.setViewportSize({ width: 700, height: 400 });
        await page.evaluate(() => (window as any).__dv.setupWrapTabs(80));
        await page.evaluate(() =>
            (window as any).__dv.setHeaderPosition('left')
        );

        const tabsList = page.locator('.dv-tabs-container').first();
        await expect(tabsList).toHaveClass(/dv-tabs-container--wrap-capped/);

        await expect(async () => {
            const m = await page.evaluate(() => {
                const group = document.querySelector(
                    '.dv-groupview'
                ) as HTMLElement;
                const header = document.querySelector(
                    '.dv-tabs-and-actions-container'
                ) as HTMLElement;
                const list = document.querySelector(
                    '.dv-tabs-container'
                ) as HTMLElement;
                const gb = group.getBoundingClientRect();
                const hb = header.getBoundingClientRect();
                const lb = list.getBoundingClientRect();
                const tabs = Array.from(
                    list.querySelectorAll<HTMLElement>('.dv-tab')
                );
                const visibleEscaped = tabs.filter((t) => {
                    const r = t.getBoundingClientRect();
                    const inStrip =
                        r.right > lb.left + 0.5 && r.left < lb.right - 0.5;
                    return (
                        inStrip &&
                        (r.right > gb.right + 1 || r.left < gb.left - 1)
                    );
                }).length;
                return {
                    headerRight: Math.round(hb.right),
                    groupRight: Math.round(gb.right),
                    visibleEscaped,
                };
            });
            // The header never grows past the group's right edge ...
            expect(m.headerRight).toBeLessThanOrEqual(m.groupRight + 1);
            // ... so no visible column renders off-screen over the content.
            expect(m.visibleEscaped).toBe(0);
        }).toPass();

        await expect(
            page.locator('.dv-tabs-overflow-dropdown-root').first()
        ).toBeVisible();
    });

    // --- Spaced themes: the wrapped tab must keep its pill inset ---
    // Spaced themes give tabs a `--dv-tab-margin`. Core pins each wrapped tab to
    // the full row-height/column-width; without the theme's compensating
    // subtraction the tab fills that whole size and its margin then pushes the
    // row band past one header unit (horizontal) / overflows the strip
    // (vertical) — the pill inset it has in single-row mode is lost. The
    // invariant is the ROW BAND (tab border-box + its cross-axis margins), not
    // the tab box alone: it must equal exactly one header unit. The default
    // theme has a zero tab margin, so only the spaced theme exercises this.
    test('spaced theme: each wrapped row band equals one header height (pill inset kept)', async ({
        page,
    }) => {
        await page.goto(
            '/e2e/fixtures/index.html?overflow=wrap&theme=abyssSpaced'
        );
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupWrapTabs(12));

        const m = await page.evaluate(() => {
            const header = document.querySelector(
                '.dv-tabs-and-actions-container'
            ) as HTMLElement;
            const tab = document.querySelector(
                '.dv-tabs-container .dv-tab'
            ) as HTMLElement;
            const rowH = parseFloat(
                getComputedStyle(header).getPropertyValue(
                    '--dv-tabs-and-actions-container-height'
                )
            );
            const cs = getComputedStyle(tab);
            const band =
                tab.offsetHeight +
                parseFloat(cs.marginTop) +
                parseFloat(cs.marginBottom);
            const rows = new Set<number>();
            document
                .querySelectorAll<HTMLElement>('.dv-tabs-container .dv-tab')
                .forEach((t) => rows.add(t.offsetTop));
            return {
                rowH,
                tabH: tab.offsetHeight,
                marginY:
                    parseFloat(cs.marginTop) + parseFloat(cs.marginBottom),
                band,
                headerH: header.offsetHeight,
                rowCount: rows.size,
            };
        });

        // The theme actually has a vertical tab margin (this is what the bug
        // hinged on — a zero-margin theme can't regress here).
        expect(m.marginY).toBeGreaterThan(0);
        // The tab keeps its pill inset: it is SHORTER than the full row unit ...
        expect(m.tabH).toBeLessThan(m.rowH);
        // ... and the row band (tab + margins) is exactly one row unit, so
        // wrapped rows don't overshoot (the pre-fix band was rowH + marginY).
        expect(m.band).toBeCloseTo(m.rowH, 0);
        // Tabs really wrapped, and the header is a whole number of row units.
        expect(m.rowCount).toBeGreaterThan(1);
        expect(m.headerH).toBeCloseTo(m.rowCount * m.rowH, 0);
    });

    test('spaced theme (vertical header): each wrapped column band equals one header width (pill inset kept)', async ({
        page,
    }) => {
        await setupVertical(page, 'overflow=wrap&theme=abyssSpaced', 12);
        await expect.poll(() => columnCount(page)).toBeGreaterThan(1);

        const m = await page.evaluate(() => {
            const header = document.querySelector(
                '.dv-tabs-and-actions-container'
            ) as HTMLElement;
            const tab = document.querySelector(
                '.dv-tabs-container .dv-tab'
            ) as HTMLElement;
            const colW = parseFloat(
                getComputedStyle(header).getPropertyValue(
                    '--dv-tabs-and-actions-container-height'
                )
            );
            const cs = getComputedStyle(tab);
            const band =
                tab.offsetWidth +
                parseFloat(cs.marginLeft) +
                parseFloat(cs.marginRight);
            return {
                colW,
                tabW: tab.offsetWidth,
                marginX:
                    parseFloat(cs.marginLeft) + parseFloat(cs.marginRight),
                band,
            };
        });

        expect(m.marginX).toBeGreaterThan(0);
        // The cross-axis mirror: the vertical tab keeps its pill inset (narrower
        // than the strip) and its column band fits exactly one header width, so
        // the strip doesn't overflow (the pre-fix band was colW + marginX).
        expect(m.tabW).toBeLessThan(m.colW);
        expect(m.band).toBeCloseTo(m.colW, 0);
    });

    test('Arrow Up/Down move focus between wrapped rows', async ({ page }) => {
        await setup(page);

        // Focus a tab on the first row and compute the geometrically-expected
        // neighbour one row below (nearest horizontal centre).
        const plan = await page.evaluate(() => {
            const tabs = Array.from(
                document.querySelectorAll<HTMLElement>(
                    '.dv-tabs-container .dv-tab'
                )
            );
            const geo = tabs.map((el) => ({
                el,
                top: el.offsetTop,
                centre: el.offsetLeft + el.offsetWidth / 2,
                text: el.innerText.trim(),
            }));
            const tops = Array.from(new Set(geo.map((g) => g.top))).sort(
                (a, b) => a - b
            );
            const row0 = geo.filter((g) => g.top === tops[0]);
            const row1 = geo.filter((g) => g.top === tops[1]);
            const focused = row0[Math.floor(row0.length / 2)];
            let expected = row1[0];
            for (const g of row1) {
                if (
                    Math.abs(g.centre - focused.centre) <
                    Math.abs(expected.centre - focused.centre)
                ) {
                    expected = g;
                }
            }
            focused.el.focus();
            return { focusedText: focused.text, expectedText: expected.text };
        });

        const activeText = () =>
            page.evaluate(() =>
                (document.activeElement as HTMLElement).innerText.trim()
            );

        await page.keyboard.press('ArrowDown');
        expect(await activeText()).toBe(plan.expectedText);

        // ArrowUp returns to the aligned tab on the row above.
        await page.keyboard.press('ArrowUp');
        expect(await activeText()).toBe(plan.focusedText);
    });
});
