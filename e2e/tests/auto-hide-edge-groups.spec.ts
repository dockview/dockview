import { test, expect } from '@playwright/test';

/**
 * Auto-hide edge groups — the slide-out peek. Real-browser only: the
 * load-bearing rule is that peeking floats the panel over content WITHOUT
 * reflowing the grid (jsdom has no layout), and that BOTH render modes
 * (`onlyWhenVisible` and `always`) slide out.
 *
 * Interaction model (Visual Studio pinnable tool windows, click-driven — NO
 * hover): click a collapsed tab → peek it as a non-reflowing overlay with a
 * title bar (title + pin + close); click the tab again / outside / Esc → hide;
 * the pin button → dock (reflow once); the close button → close the panel.
 */
test.describe('auto-hide edge groups (peek)', () => {
    const setup = async (page, renderer) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(
            (r) => (window as any).__dv.setupAutoHideEdge(r),
            renderer
        );
    };
    const edgeTab = (page) =>
        page.locator('.dv-groupview-edge .dv-tab').first();
    const mainBox = (page) =>
        page.locator('.dv-test-panel', { hasText: 'main' }).boundingBox();

    test('clicking a collapsed edge tab peeks over the content without reflow', async ({
        page,
    }) => {
        await setup(page);
        const before = (await mainBox(page))!;

        await edgeTab(page).click();
        const overlay = page.locator('.dv-edge-peek');
        await expect(overlay).toBeVisible();
        expect((await overlay.boundingBox())!.width).toBeGreaterThan(100);
        await expect(overlay.locator('.dv-test-panel')).toBeVisible();

        await expect(page.locator('.dv-edge-peek-title')).toHaveText('Sidebar');
        await expect(page.locator('.dv-edge-peek-pin')).toBeVisible();
        await expect(page.locator('.dv-edge-peek-close')).toBeVisible();

        const during = (await mainBox(page))!;
        expect(Math.abs(during.width - before.width)).toBeLessThan(2);

        await page.mouse.click(900, 500);
        await expect(overlay).toHaveCount(0);
    });

    test("an 'always'-rendered panel also slides out over the peek", async ({
        page,
    }) => {
        await setup(page, 'always');
        const before = (await mainBox(page))!;

        // open via the api (deterministic) — the always-rendered content lives in
        // the shared render overlay and must re-anchor over the peek region.
        await page.evaluate(() => (window as any).__dv.peekEdge('left', true));
        const overlay = page.locator('.dv-edge-peek');
        await expect(overlay).toBeVisible();
        const ob = (await overlay.boundingBox())!;

        const sidebar = page.locator('.dv-test-panel', { hasText: 'sidebar' });
        await expect(sidebar).toBeVisible();
        const sb = (await sidebar.boundingBox())!;
        expect(sb.x).toBeGreaterThanOrEqual(ob.x - 3);
        expect(sb.x).toBeLessThan(ob.x + ob.width);

        // its parent stays the render overlay (always panels are never reparented)
        const stillInRenderOverlay = await sidebar.evaluate(
            (el) => !!el.closest('.dv-render-overlay')
        );
        expect(stillInRenderOverlay).toBe(true);

        // STACKING: the always content must paint ABOVE the peek's opaque
        // backdrop — position alone isn't enough (regression guard).
        const topIsContent = await page.evaluate(() => {
            const pk = document.querySelector('.dv-edge-peek')!;
            const r = pk.getBoundingClientRect();
            const el = document.elementFromPoint(
                r.x + r.width / 2,
                r.y + r.height / 2
            );
            return !!el?.closest('.dv-render-overlay');
        });
        expect(topIsContent).toBe(true);

        // no grid reflow while peeking
        expect(
            Math.abs((await mainBox(page))!.width - before.width)
        ).toBeLessThan(2);
    });

    test('clicking the peeked tab again hides it; moving the mouse away does not', async ({
        page,
    }) => {
        await setup(page);
        const before = (await mainBox(page))!;

        await edgeTab(page).click();
        const overlay = page.locator('.dv-edge-peek');
        await expect(overlay).toBeVisible();

        // no reflow, and (no hover model) the peek survives the mouse moving away
        expect(
            Math.abs((await mainBox(page))!.width - before.width)
        ).toBeLessThan(2);
        await page.mouse.move(900, 500);
        await expect(overlay).toBeVisible();

        // still no reflow
        await edgeTab(page).click();
        await expect(overlay).toHaveCount(0);
        expect(
            Math.abs((await mainBox(page))!.width - before.width)
        ).toBeLessThan(2);
    });

    test('pinning docks the group as a tool window — title bar on top, tabs at the bottom', async ({
        page,
    }) => {
        await setup(page);
        await edgeTab(page).click();
        await page.locator('.dv-edge-peek-pin').click(); // pin → dock

        // a docked title bar is rendered inside the (now expanded) group
        const dockedBar = page.locator(
            '.dv-groupview-edge .dv-edge-peek-header'
        );
        await expect(dockedBar).toBeVisible();
        await expect(dockedBar.locator('.dv-edge-peek-title')).toHaveText(
            'Sidebar'
        );

        // title bar above the content; tab strip below it (tabs moved to bottom)
        const geo = await page.evaluate(() => {
            const g = document.querySelector('.dv-groupview-edge')!;
            const bar = g
                .querySelector('.dv-edge-peek-header')!
                .getBoundingClientRect();
            const tabs = g
                .querySelector('.dv-tabs-and-actions-container')!
                .getBoundingClientRect();
            const content = g
                .querySelector('.dv-content-container')!
                .getBoundingClientRect();
            return {
                barBottom: bar.bottom,
                tabsTop: tabs.top,
                contentTop: content.top,
                contentBottom: content.bottom,
            };
        });
        expect(geo.barBottom).toBeLessThanOrEqual(geo.contentTop + 1);
        expect(geo.tabsTop).toBeGreaterThanOrEqual(geo.contentBottom - 1);

        // the docked pushpin auto-hides back to the strip
        await page.locator('.dv-groupview-edge .dv-edge-peek-pin').click();
        await expect(
            page.locator('.dv-groupview-edge .dv-edge-peek-header')
        ).toHaveCount(0);
        await expect(page.locator('.dv-edge-peek')).toHaveCount(0);
    });

    test('the close button closes the panel and removes the peek', async ({
        page,
    }) => {
        await setup(page);
        await edgeTab(page).click();
        await expect(page.locator('.dv-edge-peek')).toBeVisible();

        await page.locator('.dv-edge-peek-close').click();
        await expect(page.locator('.dv-edge-peek')).toHaveCount(0);
        await expect(
            page.locator('.dv-test-panel', { hasText: 'sidebar' })
        ).toHaveCount(0);
    });

    test('the pin button re-docks the edge group (reflows once)', async ({
        page,
    }) => {
        await setup(page);
        const before = (await mainBox(page))!;

        await page.evaluate(() => (window as any).__dv.peekEdge('left', true));
        await expect(page.locator('.dv-edge-peek')).toBeVisible();
        await page.locator('.dv-edge-peek-pin').click();

        await expect(page.locator('.dv-edge-peek')).toHaveCount(0);
        expect((await mainBox(page))!.width).toBeLessThan(before.width);
    });

    test('the peek reveals from the strip inner edge, not the screen edge', async ({
        page,
    }) => {
        await setup(page);
        await edgeTab(page).click();
        await expect(page.locator('.dv-edge-peek-clip')).toBeVisible();

        // A fixed `overflow:hidden` clip frame anchored at the strip's inner
        // edge bounds the sliding overlay — so no matter the animation phase,
        // nothing paints on the dock side of that edge (the old bug slid the
        // panel in from the screen edge across the strip).
        const geom = await page.evaluate(() => {
            const strip = document
                .querySelector('.dv-groupview-edge')!
                .getBoundingClientRect();
            const clip = document.querySelector('.dv-edge-peek-clip')!;
            const cb = clip.getBoundingClientRect();
            return {
                stripRight: strip.right,
                clipLeft: cb.left,
                clipWidth: cb.width,
                overflow: getComputedStyle(clip).overflow,
            };
        });
        expect(geom.overflow).toBe('hidden');
        expect(geom.clipLeft).toBeGreaterThanOrEqual(geom.stripRight - 1);
        expect(geom.clipWidth).toBeGreaterThan(100);
    });

    test("an 'always' panel's overlay is clipped to the reveal window during peek", async ({
        page,
    }) => {
        await setup(page, 'always');
        await page.evaluate(() => (window as any).__dv.peekEdge('left', true));
        await expect(page.locator('.dv-edge-peek')).toBeVisible();

        const sidebarClip = () =>
            page.evaluate(() => {
                const el = [
                    ...document.querySelectorAll('.dv-render-overlay'),
                ].find((e) => e.textContent?.includes('sidebar')) as
                    | HTMLElement
                    | undefined;
                return el ? getComputedStyle(el).clipPath : 'none';
            });

        // the always render overlay (a sibling, never reparented) is clipped to
        // the same reveal window so it can't slide in from the screen edge
        await expect.poll(sidebarClip).not.toBe('none');

        // ...and the clip is cleared once the peek closes
        await page.evaluate(() => (window as any).__dv.peekEdge('left', false));
        await expect(page.locator('.dv-edge-peek')).toHaveCount(0);
        await expect.poll(sidebarClip).toBe('none');
    });

    test('switching peeked always-tabs back and forth keeps content rendered', async ({
        page,
    }) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() =>
            (window as any).__dv.setupAutoHideEdgeMulti()
        );

        const tabs = page.locator('.dv-groupview-edge .dv-tab');
        await tabs.nth(0).click(); // peek Alpha
        await expect(page.locator('.dv-edge-peek')).toBeVisible();

        await tabs.nth(1).click();
        await tabs.nth(0).click();

        // The re-peeked panel's always-overlay must still render — exactly one
        // overlay visible + sized. The bug clobbered the force-show, leaving the
        // active panel hidden (zero visible → blank peek).
        const visibleOverlays = () =>
            page.evaluate(
                () =>
                    [...document.querySelectorAll('.dv-render-overlay')].filter(
                        (e) => {
                            const r = e.getBoundingClientRect();
                            return (
                                getComputedStyle(e).visibility !== 'hidden' &&
                                r.width > 10 &&
                                r.height > 10
                            );
                        }
                    ).length
            );
        await expect.poll(visibleOverlays).toBe(1);
    });
});

/**
 * Spaced-theme styling of the peek + docked tool window. The spaced themes turn
 * every group into a rounded, gapped card; the peek overlay and the docked
 * (pinned) chrome must follow suit rather than render as sharp, frame-coloured
 * boxes. Real-browser only (the CSS custom-property + computed-radius resolution
 * jsdom can't model).
 */
test.describe('auto-hide edge groups — spaced theme styling', () => {
    const setup = async (page, theme = 'abyssSpaced') => {
        await page.goto(`/e2e/fixtures/index.html?theme=${theme}`);
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => (window as any).__dv.setupAutoHideEdge());
    };
    const edgeTab = (page) =>
        page.locator('.dv-groupview-edge .dv-tab').first();
    const px = (v: string) => parseFloat(v);

    test('the peek title bar uses the tab-bar colour, not the near-black group frame', async ({
        page,
    }) => {
        await setup(page);
        await edgeTab(page).click();
        await expect(page.locator('.dv-edge-peek-header')).toBeVisible();

        const c = await page.evaluate(() => {
            const cs = (el: Element | null) =>
                el ? getComputedStyle(el).backgroundColor : '';
            const group = document.querySelector('.dv-groupview-edge');
            return {
                header: cs(document.querySelector('.dv-edge-peek-header')),
                strip: cs(
                    group!.querySelector('.dv-tabs-and-actions-container')
                ),
                // the group element paints the frame (--dv-group-view-background)
                frame: cs(group),
            };
        });
        // the title bar matches the tab strip (tab-bar colour), NOT the group
        // frame (the near-black inter-group gap colour that read as black)
        expect(c.header).toBe(c.strip);
        expect(c.header).not.toBe(c.frame);
    });

    test('the spaced peek is a rounded card (title bar + backdrop)', async ({
        page,
    }) => {
        await setup(page);
        await edgeTab(page).click();
        await expect(page.locator('.dv-edge-peek')).toBeVisible();

        const r = await page.evaluate(() => {
            const cs = (sel: string, prop: string) => {
                const el = document.querySelector(sel);
                return el
                    ? getComputedStyle(el).getPropertyValue(prop)
                    : '0px';
            };
            return {
                headerTop: cs(
                    '.dv-edge-peek-header',
                    'border-top-left-radius'
                ),
                overlayBottom: cs(
                    '.dv-edge-peek',
                    'border-bottom-left-radius'
                ),
                clipBottom: cs(
                    '.dv-edge-peek-clip',
                    'border-bottom-left-radius'
                ),
            };
        });
        expect(px(r.headerTop)).toBeGreaterThan(0);
        expect(px(r.overlayBottom)).toBeGreaterThan(0);
        expect(px(r.clipBottom)).toBeGreaterThan(0);
    });

    test('the docked tool window is a cohesive rounded card (no mid-card content notch)', async ({
        page,
    }) => {
        await setup(page);
        await edgeTab(page).click();
        await page.locator('.dv-edge-peek-pin').click(); // pin → dock

        const group = page.locator('.dv-groupview-edge');
        await expect(group).toHaveClass(/dv-edge-tool-window/);

        const r = await page.evaluate(() => {
            const g = document.querySelector('.dv-groupview-edge')!;
            const cs = (sel: string, prop: string) =>
                getComputedStyle(g.querySelector(sel)!).getPropertyValue(prop);
            return {
                // the title bar caps the top of the card
                headerTop: cs(
                    '.dv-edge-peek-header',
                    'border-top-left-radius'
                ),
                // the content is flush — its default bottom rounding (which would
                // carve a frame-coloured notch above the bottom tab strip) is off
                contentBottom: cs(
                    '.dv-content-container',
                    'border-bottom-left-radius'
                ),
                // the tab strip caps the bottom (and drops its top rounding)
                tabsTop: cs(
                    '.dv-tabs-and-actions-container',
                    'border-top-left-radius'
                ),
                tabsBottom: cs(
                    '.dv-tabs-and-actions-container',
                    'border-bottom-left-radius'
                ),
            };
        });
        expect(px(r.headerTop)).toBeGreaterThan(0);
        expect(px(r.contentBottom)).toBe(0);
        expect(px(r.tabsTop)).toBe(0);
        expect(px(r.tabsBottom)).toBeGreaterThan(0);
    });

    test('un-pinning removes the tool-window styling hook', async ({ page }) => {
        await setup(page);
        await edgeTab(page).click();
        await page.locator('.dv-edge-peek-pin').click(); // dock
        await expect(page.locator('.dv-groupview-edge')).toHaveClass(
            /dv-edge-tool-window/
        );

        // the docked pushpin auto-hides back to the strip
        await page.locator('.dv-groupview-edge .dv-edge-peek-pin').click();
        await expect(page.locator('.dv-groupview-edge')).not.toHaveClass(
            /dv-edge-tool-window/
        );
    });

    test('a non-spaced theme leaves the peek square (spaced rules stay scoped)', async ({
        page,
    }) => {
        await setup(page, 'abyss');
        await edgeTab(page).click();
        await expect(page.locator('.dv-edge-peek')).toBeVisible();

        const radius = await page.evaluate(() =>
            getComputedStyle(
                document.querySelector('.dv-edge-peek')!
            ).getPropertyValue('border-bottom-left-radius')
        );
        expect(px(radius)).toBe(0);
    });
});
