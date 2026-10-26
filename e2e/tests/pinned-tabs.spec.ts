import { test, expect, Page } from '@playwright/test';

/**
 * Pinned tabs — real-browser behaviour the jsdom unit tests cannot reach:
 * geometry (the second row growing the header and reflowing content), compact
 * rendering (a hidden title actually collapsing the tab), and overflow (a
 * pinned tab excluded from the dropdown while the strip clips).
 */
test.describe('pinned tabs', () => {
    const setup = async (
        page: Page,
        opts: {
            mode?: 'separate-row';
            compact?: boolean;
            dnd?: 'html5';
        } = {}
    ) => {
        const query = new URLSearchParams();
        if (opts.mode) query.set('pinned', opts.mode);
        if (opts.compact) query.set('compact', '1');
        if (opts.dnd) query.set('dnd', opts.dnd);
        const qs = query.toString();
        await page.goto('/e2e/fixtures/index.html' + (qs ? `?${qs}` : ''));
        await page.waitForFunction(() => (window as any).__ready === true);
    };

    const box = (page: Page, selector: string) =>
        page.locator(selector).first().boundingBox();

    test('separate-row: the pinned row grows the header and reflows content', async ({
        page,
    }) => {
        await setup(page, { mode: 'separate-row' });
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(['a', 'b', 'c'], [])
        );

        const headerBefore = (await box(
            page,
            '.dv-tabs-and-actions-container'
        ))!;
        const contentBefore = (await box(page, '.dv-content-container'))!;
        expect(await page.locator('.dv-pinned-row').count()).toBe(0);

        await page.evaluate(() => (window as any).__dv.setPinned('a', true));
        await expect(page.locator('.dv-pinned-row')).toBeVisible();

        const pinnedRow = (await box(page, '.dv-pinned-row'))!;
        const mainStrip = (await box(page, '.dv-tabs-container'))!;
        const headerAfter = (await box(
            page,
            '.dv-tabs-and-actions-container'
        ))!;
        const contentAfter = (await box(page, '.dv-content-container'))!;

        expect(pinnedRow.y).toBeLessThan(mainStrip.y);

        const grow = headerAfter.height - headerBefore.height;
        const shrink = contentBefore.height - contentAfter.height;
        expect(grow).toBeGreaterThan(0);
        expect(shrink).toBeGreaterThan(0);
        expect(Math.abs(grow - shrink)).toBeLessThan(2);

        await expect(page.locator('.dv-pinned-row .dv-pinned-tab')).toHaveText(
            'a'
        );

        await page.evaluate(() => (window as any).__dv.setPinned('a', false));
        await expect(page.locator('.dv-pinned-row')).toHaveCount(0);
        const headerRestored = (await box(
            page,
            '.dv-tabs-and-actions-container'
        ))!;
        expect(
            Math.abs(headerRestored.height - headerBefore.height)
        ).toBeLessThan(2);
    });

    test('separate-row: dragging a pinned tab reorders the row', async ({
        page,
    }) => {
        await setup(page, { mode: 'separate-row' });
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(['a', 'b', 'c'], ['a', 'b', 'c'])
        );

        const rowTabs = page.locator('.dv-pinned-row .dv-pinned-tab');
        await expect(rowTabs).toHaveText(['a', 'b', 'c']);

        // Drive the row's HTML5 drag: drag 'a' past 'c' using real geometry.
        // (The row uses `draggable` + drag events, not the pointer backend, so
        // synthetic DragEvents at real coordinates exercise the real path.)
        await page.evaluate(() => {
            const tabs = Array.from(
                document.querySelectorAll('.dv-pinned-row .dv-pinned-tab')
            ) as HTMLElement[];
            const source = tabs[0];
            const last = tabs[tabs.length - 1];
            const rect = last.getBoundingClientRect();
            const dropX = rect.right + 5; // past the last tab's midpoint
            const dropY = rect.top + rect.height / 2;
            source.dispatchEvent(
                new DragEvent('dragstart', { bubbles: true, cancelable: true })
            );
            last.dispatchEvent(
                new DragEvent('dragover', {
                    bubbles: true,
                    cancelable: true,
                    clientX: dropX,
                    clientY: dropY,
                })
            );
            last.dispatchEvent(
                new DragEvent('drop', {
                    bubbles: true,
                    cancelable: true,
                    clientX: dropX,
                    clientY: dropY,
                })
            );
            source.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
        });

        // The pinned row (and the pinned block of the strip) reorder to [b,c,a].
        await expect(rowTabs).toHaveText(['b', 'c', 'a']);
        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.tabTitles()))
            .toEqual(['b', 'c', 'a']);
    });

    test('separate-row: dragging a main-strip tab into the row pins it', async ({
        page,
    }) => {
        // `?dnd=html5` so the main strip's native drag source populates the
        // shared payload the row reads via `getPanelData`.
        await setup(page, { mode: 'separate-row', dnd: 'html5' });
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(['a', 'b', 'c'], ['a'])
        );

        await expect(page.locator('.dv-pinned-row .dv-pinned-tab')).toHaveText([
            'a',
        ]);

        // Drag the (unpinned) main-strip tab 'c' into the pinned row.
        await page.evaluate(() => {
            const mainTab = Array.from(
                document.querySelectorAll('.dv-tabs-container .dv-tab')
            ).find((el) => el.textContent?.includes('c')) as HTMLElement;
            const row = document.querySelector('.dv-pinned-row') as HTMLElement;
            const rect = row.getBoundingClientRect();
            const dropX = rect.right - 2; // land at the end of the pinned block
            const dropY = rect.top + rect.height / 2;
            mainTab.dispatchEvent(
                new DragEvent('dragstart', { bubbles: true, cancelable: true })
            );
            row.dispatchEvent(
                new DragEvent('dragover', {
                    bubbles: true,
                    cancelable: true,
                    clientX: dropX,
                    clientY: dropY,
                })
            );
            row.dispatchEvent(
                new DragEvent('drop', {
                    bubbles: true,
                    cancelable: true,
                    clientX: dropX,
                    clientY: dropY,
                })
            );
            mainTab.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
        });

        await expect(page.locator('.dv-pinned-row .dv-pinned-tab')).toHaveText([
            'a',
            'c',
        ]);
        expect(
            await page.evaluate(() => (window as any).__dv.isPinned('c'))
        ).toBe(true);
    });

    test('separate-row: dragging a row tab out into the main strip unpins it', async ({
        page,
    }) => {
        await setup(page, { mode: 'separate-row', dnd: 'html5' });
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(['a', 'b', 'c'], ['a', 'b'])
        );
        await expect(page.locator('.dv-pinned-row .dv-pinned-tab')).toHaveText([
            'a',
            'b',
        ]);

        // Drag the row tab 'a' down onto the unpinned main-strip tab 'c'. The
        // row sets the same PanelTransfer the main tab would, so the strip's
        // native drop target accepts it; a drop in the unpinned region unpins.
        await page.evaluate(() => {
            const rowTab = Array.from(
                document.querySelectorAll('.dv-pinned-row .dv-pinned-tab')
            ).find((el) => el.textContent?.includes('a')) as HTMLElement;
            const mainC = Array.from(
                document.querySelectorAll('.dv-tabs-container .dv-tab')
            ).find(
                (el) =>
                    el.textContent?.includes('c') &&
                    (el as HTMLElement).offsetParent !== null
            ) as HTMLElement;
            const rect = mainC.getBoundingClientRect();
            // Right zone of 'c' → land past the pin boundary (unpinned region).
            const x = rect.right - 3;
            const y = rect.top + rect.height / 2;
            const fire = (el: Element, type: string) =>
                el.dispatchEvent(
                    new DragEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        clientX: x,
                        clientY: y,
                    })
                );
            fire(rowTab, 'dragstart');
            fire(mainC, 'dragenter');
            fire(mainC, 'dragover');
            fire(mainC, 'drop');
            rowTab.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
        });

        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.isPinned('a')))
            .toBe(false);
        await expect(page.locator('.dv-pinned-row .dv-pinned-tab')).toHaveText([
            'b',
        ]);
    });

    test('default: a pinned tab keeps its title and shows a pin glyph', async ({
        page,
    }) => {
        await setup(page);
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(['alpha', 'bravo'], ['alpha'])
        );

        const pinned = page.locator('.dv-tab--pinned');
        // The title is still shown (not compact by default)…
        await expect(pinned.locator('.dv-default-tab-content')).toBeVisible();
        await expect(pinned).toContainText('alpha');
        // …a pin glyph is rendered…
        await expect(pinned.locator('.dv-tab-pin .dv-svg')).toBeVisible();
        // …and the close button is hidden (pinning protects from a stray close).
        await expect(pinned.locator('.dv-default-tab-action')).toBeHidden();
    });

    test('compact: a pinned tab hides its title but keeps the pin glyph', async ({
        page,
    }) => {
        await setup(page, { compact: true });
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(['alpha', 'bravo'], ['alpha'])
        );

        // The compact pinned tab's title content is hidden…
        await expect(
            page.locator('.dv-tab--pinned-compact .dv-default-tab-content')
        ).toBeHidden();
        // …but the pin glyph is still visible (its only identity)…
        await expect(
            page.locator('.dv-tab--pinned-compact .dv-tab-pin .dv-svg')
        ).toBeVisible();

        // …and it is narrower than a normal (titled) tab.
        const compact = (await box(page, '.dv-tab--pinned-compact'))!;
        const normal = (await box(page, '.dv-tab:not(.dv-tab--pinned)'))!;
        expect(compact.width).toBeLessThan(normal.width);
    });

    test('overflow: a clipped pinned tab surfaces under the Pinned header, not the general list', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 250, height: 500 });
        await setup(page);

        const ids = Array.from({ length: 15 }, (_, i) => `panel-${i}`);
        // Pin more tabs than fit so the pinned block itself overflows: the
        // leading pinned tabs stay frozen at the left edge (inline sticky) while
        // the trailing ones clip out of the strip. A clipped pinned tab is the
        // only way DV-11's "Pinned" overflow section is reached — a single
        // pinned tab is held visible by sticky and never clips.
        const pinned = ids.slice(0, 8);
        await page.evaluate(
            ({ ids, pinned }) =>
                (window as any).__dv.setupPinned(ids, pinned),
            { ids, pinned }
        );

        const handle = page.locator('.dv-tabs-overflow-dropdown-default');
        await expect(handle).toBeVisible();
        await handle.click();

        const overflow = page.locator('.dv-tabs-overflow-container');
        await expect(overflow).toBeVisible();

        // Unpinned tabs overflow into the dropdown…
        await expect(overflow.locator('.dv-tab')).not.toHaveCount(0);

        // …and the clipped pinned tabs stay reachable, surfaced under a
        // dedicated "Pinned" header (DV-11) rather than dumped into the general
        // list. The row directly beneath the header is a clipped pinned tab, and
        // a clipped pinned tab (panel-7, the last of the pinned block) appears
        // exactly once — excluded from the unpinned rows, never duplicated.
        const pinnedHeader = overflow.locator('.dv-tabs-overflow-pinned-header');
        await expect(pinnedHeader).toBeVisible();
        await expect(pinnedHeader).toContainText('Pinned');
        await expect(
            overflow.locator('.dv-tabs-overflow-pinned-header + .dv-tab')
        ).toHaveText(/^panel-[0-7]$/);
        await expect(
            overflow.getByText('panel-7', { exact: true })
        ).toHaveCount(1);
    });

    test('a pinned tab sorts ahead of unpinned tabs', async ({ page }) => {
        await setup(page);
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(['a', 'b', 'c'], [])
        );
        expect(
            await page.evaluate(() => (window as any).__dv.tabTitles())
        ).toEqual(['a', 'b', 'c']);

        // Pinning the last tab jumps it to the front of the strip; the other
        // two keep their relative order behind it.
        await page.evaluate(() => (window as any).__dv.setPinned('c', true));
        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.tabTitles()))
            .toEqual(['c', 'a', 'b']);

        // Unpinning clears the pin marker; the tab keeps its current slot
        // (unpinning removes pinned status, it does not re-sort the strip).
        await page.evaluate(() => (window as any).__dv.setPinned('c', false));
        await expect(page.locator('.dv-tab--pinned')).toHaveCount(0);
        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.tabTitles()))
            .toEqual(['c', 'a', 'b']);
    });

    test('inline sticky: the pinned tab stays frozen at the left edge when the strip scrolls', async ({
        page,
    }) => {
        // Narrow viewport + many tabs so the strip overflows and scrolls
        // horizontally — the condition the inline sticky offsets exist for.
        await page.setViewportSize({ width: 360, height: 400 });
        await setup(page); // inline mode, stickyScroll on by default

        const ids = Array.from({ length: 12 }, (_, i) => `t${i}`);
        await page.evaluate(
            (ids) => (window as any).__dv.setupPinned(ids, []),
            ids
        );
        // Pin the first-added tab. It is already leftmost, so it must render at
        // the strip's left edge and stay frozen there as the strip scrolls.
        await page.evaluate(() => (window as any).__dv.setPinned('t0', true));
        await expect(page.locator('.dv-tab--pinned')).toContainText('t0');

        const drift = () =>
            page.evaluate(() => {
                const strip = document.querySelector('.dv-tabs-container')!;
                const pinned = document.querySelector('.dv-tab--pinned')!;
                const c = strip.getBoundingClientRect();
                const p = pinned.getBoundingClientRect();
                return {
                    fromLeft: Math.round(p.left - c.left),
                    stickyLeft: (pinned as HTMLElement).style.getPropertyValue(
                        '--dv-pinned-sticky-left'
                    ),
                    scrollWidth: strip.scrollWidth,
                    clientWidth: strip.clientWidth,
                };
            });

        // Precondition: the strip really does overflow (so sticky matters).
        const rest = await drift();
        expect(rest.scrollWidth).toBeGreaterThan(rest.clientWidth);
        expect(rest.fromLeft).toBeLessThan(8);

        // Scroll the strip right and fire the on-scroll self-heal recompute.
        // Reading the pinned tab's *stuck* offsetLeft and feeding it back into
        // the sticky offset used to compound it on every recompute, drifting the
        // pinned tab off the left edge until it rendered over the far-right tabs.
        for (const x of [80, 160, 240]) {
            await page.evaluate((x) => {
                const strip = document.querySelector('.dv-tabs-container')!;
                strip.scrollLeft = x;
                strip.dispatchEvent(new Event('scroll'));
            }, x);
        }

        // Still frozen at the left edge, offset unchanged — no drift.
        const after = await drift();
        expect(after.fromLeft).toBeLessThan(8);
        expect(after.stickyLeft).toBe('0px');
    });

    test('pinned state round-trips through serialization', async ({ page }) => {
        await setup(page);
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(
                ['alpha', 'bravo', 'charlie'],
                ['bravo']
            )
        );
        await expect(page.locator('.dv-tab--pinned')).toContainText('bravo');

        // The serialized layout carries the pinned flag…
        const json = await page.evaluate(() =>
            JSON.stringify((window as any).__dv.snapshot())
        );
        expect(json).toContain('"pinned":true');

        // …and re-loading that snapshot rebuilds the pinned tab as pinned.
        await page.evaluate(
            (state) => (window as any).__dv.restore(JSON.parse(state)),
            json
        );
        await expect(page.locator('.dv-tab--pinned')).toHaveCount(1);
        await expect(page.locator('.dv-tab--pinned')).toContainText('bravo');
    });

    test('pinning and unpinning from the tab context menu', async ({
        page,
    }) => {
        // `?pinmenu=1` swaps the harness tab menu to `['pin', 'separator',
        // 'close']` so the built-in pin item is drivable.
        await page.goto('/e2e/fixtures/index.html?pinmenu=1');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(['alpha', 'bravo'], [])
        );
        await expect(page.locator('.dv-tab--pinned')).toHaveCount(0);

        // Right-click "bravo" → the menu offers "Pin tab"; clicking it pins.
        await page
            .locator('.dv-tab', { hasText: 'bravo' })
            .click({ button: 'right' });
        await expect(page.locator('.dv-context-menu')).toBeVisible();
        await page
            .locator('.dv-context-menu-item', { hasText: 'Pin tab' })
            .click();
        await expect(page.locator('.dv-tab--pinned')).toContainText('bravo');

        // Right-clicking the now-pinned tab offers "Unpin tab"; clicking unpins.
        await page.locator('.dv-tab--pinned').click({ button: 'right' });
        await page
            .locator('.dv-context-menu-item', { hasText: 'Unpin tab' })
            .click();
        await expect(page.locator('.dv-tab--pinned')).toHaveCount(0);
    });

    test('auto-injects the Pin item into the tab menu without app wiring', async ({
        page,
    }) => {
        // `?pinautoinject=1` leaves the app's `getTabContextMenuItems` returning
        // only its close items — the module injects the Pin item itself.
        await page.goto('/e2e/fixtures/index.html?pinautoinject=1');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(['alpha', 'bravo'], [])
        );
        await expect(page.locator('.dv-tab--pinned')).toHaveCount(0);

        await page
            .locator('.dv-tab', { hasText: 'bravo' })
            .click({ button: 'right' });
        await expect(page.locator('.dv-context-menu')).toBeVisible();

        // Pin is prepended ahead of the app's own items.
        await expect(page.locator('.dv-context-menu-item').first()).toHaveText(
            'Pin tab'
        );

        await page
            .locator('.dv-context-menu-item', { hasText: 'Pin tab' })
            .click();
        await expect(page.locator('.dv-tab--pinned')).toContainText('bravo');
    });

    test('toggles the active tab pinned with the keyboard (Ctrl+Shift+Enter)', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() =>
            (window as any).__dv.setupPinned(['alpha', 'bravo'], [])
        );
        // bravo was added last → the active panel.
        await expect(page.locator('.dv-tab--pinned')).toHaveCount(0);

        // Put focus inside the dock so the binding fires (it acts on the active
        // panel, whichever tab holds focus).
        await page.evaluate(() =>
            document.querySelector<HTMLElement>('.dv-tab')?.focus()
        );
        await page.keyboard.press('Control+Shift+Enter');
        await expect(page.locator('.dv-tab--pinned')).toContainText('bravo');

        await page.evaluate(() =>
            document.querySelector<HTMLElement>('.dv-tab')?.focus()
        );
        await page.keyboard.press('Control+Shift+Enter');
        await expect(page.locator('.dv-tab--pinned')).toHaveCount(0);
    });
});
