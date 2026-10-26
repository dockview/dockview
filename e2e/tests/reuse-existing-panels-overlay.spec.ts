import { test, expect, Page } from '@playwright/test';

/**
 * `fromJSON(..., { reuseExistingPanels: true })` with `always`-rendered panels.
 *
 * Reused panels keep their overlay element across the rebuild, and an overlay
 * is positioned from a measured `getBoundingClientRect()`. jsdom reports 0x0
 * for every element and never lays anything out, so the unit tests have to mock
 * those rects — which means they assert what we *believe* the geometry to be.
 * These specs assert what a browser actually paints.
 *
 * The interesting states are transient (a frame or two), so each spec samples
 * per-frame across the rebuild rather than using polling assertions, which
 * would only ever observe the settled layout.
 */
test.describe('reuseExistingPanels overlay geometry', () => {
    const ready = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
    };

    const snapshot = (page: Page) =>
        page.evaluate(() => JSON.stringify((window as any).__dv.snapshot()));

    const sample = (page: Page, id: string, frames = 6) =>
        page.evaluate(
            ([panelId, count]) =>
                (window as any).__dv.sampleOverlayRects(panelId, count),
            [id, frames] as const
        );

    /**
     * An overlay attached twice before any positioning frame has run has no
     * geometry of its own. Revealing it in that state lets
     * `.dv-render-overlay`'s `width:100%;height:100%` default take over and the
     * panel covers the entire render container.
     *
     * This is the spec that fails on the unfixed engine — the overlay is
     * sampled at the full 1280x~700 container size instead of its group's half.
     */
    test('an overlay attached twice before its first positioning frame is not revealed unpositioned', async ({
        page,
    }) => {
        await ready(page);
        await page.evaluate(() => (window as any).__dv.setupReuseAlways());

        // `addPanel` + `fromJSON(reuse)` in a single tick.
        const [samples] = await Promise.all([
            sample(page, 'fresh'),
            page.evaluate(() =>
                (window as any).__dv.addAlwaysThenReuseSameTick('fresh')
            ),
        ]);

        expect(samples.length).toBeGreaterThan(0);

        for (const s of samples) {
            if (s.visibility === 'hidden') {
                continue; // not painted, so its geometry cannot be seen
            }
            // Painted means positioned: it must not span the container. The
            // width bound is the decisive one — 'fresh' joins one half of a
            // left/right split, so an unpositioned overlay reads as the full
            // container width. A height bound would only be measuring the tab
            // header, which is styling-dependent and too tight to assert on.
            expect(s.width).toBeLessThan(s.parentWidth * 0.9);
        }
    });

    /**
     * `deserializeEdgeGroups` rebuilt edge panels through the deserializer
     * instead of reclaiming the staged ones, so `reuseExistingPanels` was
     * honoured everywhere except edge groups.
     *
     * The unit tests cover panel identity and renderer lifetime, which jsdom
     * models faithfully. What it cannot show is the consequence in a rendered
     * page: the overlay is keyed by panel id, so the replacement shared the
     * original's overlay element and the two contents ended up stacked in it,
     * with the orphan's DOM state stranded there.
     *
     * Measured before the reclaim: `panelBuildCount` is 2, the overlay holds
     * two `.dv-test-panel` children, and the marker written before the restore
     * reads back as `['kept', null]` — stranded on the orphan, with the live
     * replacement blank.
     */
    test('a reused edge-group panel keeps its instance and its DOM state', async ({
        page,
    }) => {
        await ready(page);
        await page.evaluate(() => (window as any).__dv.setupEdgeReuse());
        await page.waitForTimeout(100);

        expect(
            await page.evaluate(() =>
                (window as any).__dv.panelBuildCount('sidebar')
            )
        ).toBe(1);

        // Write state into the live panel's content, the way a real panel
        // holds scroll position, form input or editor state. Reuse must carry
        // it across the rebuild; rebuilding silently drops it.
        await page.evaluate(() => {
            const el = document.querySelector(
                '.dv-render-overlay .dv-test-panel'
            ) as HTMLElement;
            el.dataset.marker = 'kept';
        });

        await page.evaluate(() =>
            (window as any).__dv.restoreReuse((window as any).__dv.snapshot())
        );
        await page.waitForTimeout(100);

        // No second renderer built under the same id.
        expect(
            await page.evaluate(() =>
                (window as any).__dv.panelBuildCount('sidebar')
            )
        ).toBe(1);

        const overlay = await page.evaluate(() => {
            const el = document.querySelector(
                '.dv-render-overlay'
            ) as HTMLElement;
            const contents = Array.from(
                el.querySelectorAll('.dv-test-panel')
            ) as HTMLElement[];
            const r = el.getBoundingClientRect();
            return {
                contentCount: contents.length,
                markers: contents.map((c) => c.dataset.marker ?? null),
                visibility: getComputedStyle(el).visibility,
                width: r.width,
                height: r.height,
            };
        });

        // One content element, not the original stacked under its replacement.
        expect(overlay.contentCount).toBe(1);
        // ...and it is the one carrying the state written before the restore.
        expect(overlay.markers).toEqual(['kept']);
        // The reclaimed panel is still painted over its edge group.
        expect(overlay.visibility).not.toBe('hidden');
        expect(overlay.width).toBeGreaterThan(0);
        expect(overlay.height).toBeGreaterThan(0);
    });

    /**
     * Regression guard rather than a reproduction: an identical-layout restore
     * retains geometry that is still correct, so this passes on the unfixed
     * engine too. It pins the invariant that a reused overlay is never painted
     * at container size at any point during a rebuild.
     */
    test('a reused overlay never covers the whole render container', async ({
        page,
    }) => {
        await ready(page);
        await page.evaluate(() => (window as any).__dv.setupReuseAlways());

        const state = await snapshot(page);

        const [samples] = await Promise.all([
            sample(page, 'left'),
            page.evaluate(
                (s) => (window as any).__dv.restoreReuse(JSON.parse(s)),
                state
            ),
        ]);

        expect(samples.length).toBeGreaterThan(0);

        // Two panels split left/right, so a correctly positioned overlay is
        // about half the container.
        for (const s of samples) {
            if (s.visibility === 'hidden') {
                continue;
            }
            expect(s.width).toBeLessThan(s.parentWidth * 0.9);
        }
    });

    /**
     * The original defect this chain of fixes started from: staging every
     * reused panel through a single temporary group. A group has one active
     * panel, so two visible `always`-rendered panels cannot both stay active
     * there — the loser is deactivated and its overlay hidden, and because
     * hiding is synchronous while showing waits for a positioning frame, it
     * stays blank across the rebuild.
     *
     * This is the browser counterpart of the two jsdom tests that cover the
     * same defect (`keeps always-rendered panels active while rebuilding`,
     * `keeps always-rendered overlays visible while rebuilding`). Those mock
     * `getBoundingClientRect`, so they assert visibility flags against a
     * layout that never happens; this asserts that Chromium actually keeps
     * both panels painted.
     *
     * Fails on the engine before #1600 with the non-active panel's overlay
     * `hidden` from the synchronous sample onwards.
     */
    test('both reused always-rendered overlays stay painted across the rebuild', async ({
        page,
    }) => {
        await ready(page);
        await page.evaluate(() => (window as any).__dv.setupReuseAlways());
        // Let the initial layout settle so anything blank afterwards is the
        // rebuild's doing rather than the first paint's.
        await page.waitForTimeout(100);

        const result = await page.evaluate(() =>
            (window as any).__dv.reuseRestoreAndSample(['left', 'right'], 6)
        );

        for (const id of ['left', 'right']) {
            const { sync, frames } = result[id];
            const samples = [sync, ...frames];

            // Every sample must exist: the overlay is reused, never recreated.
            for (const s of samples) {
                expect(s).not.toBeNull();
            }

            for (const s of samples) {
                // Painted, not blanked by the staging round-trip.
                expect(s.visibility).not.toBe('hidden');
                // ...and painted at a real size. A visible overlay collapsed
                // to zero is just as blank to the user as a hidden one.
                expect(s.width).toBeGreaterThan(0);
                expect(s.height).toBeGreaterThan(0);
                // Each panel owns one half of a left/right split, so neither
                // may span the render container.
                expect(s.width).toBeLessThan(s.parentWidth * 0.9);
            }
        }
    });

    /**
     * Restoring a layout that *moves* a reused panel carries geometry that is
     * now wrong, so the overlay is briefly painted at its pre-rebuild position
     * before the reposition lands. That brief stale paint is intended — the
     * alternative is blanking the panel for the whole rebuild.
     *
     * What must hold is that the window is *bounded* and the overlay ends up
     * over its own group. Measured here: the stale paint lasts two frames on
     * the unfixed engine and usually one once the superseded `attach` can no
     * longer swallow the reposition — but not reliably enough to assert an
     * exact frame count without flaking, so this asserts the bound instead.
     */
    test('a reused overlay settles over its own group when the layout moves it', async ({
        page,
    }) => {
        await ready(page);
        await page.evaluate(() => (window as any).__dv.setupReuseAlways());

        const state = await snapshot(page);

        // Move 'left' over to the right-hand side, then restore the snapshot
        // that puts it back.
        await page.evaluate(() => (window as any).__dv.swapReuseAlways());
        await page.waitForTimeout(100);

        const [samples] = await Promise.all([
            sample(page, 'left', 8),
            page.evaluate(
                (s) => (window as any).__dv.restoreReuse(JSON.parse(s)),
                state
            ),
        ]);

        const isCorrect = (s: any) =>
            s.visibility !== 'hidden' && s.left < s.parentWidth * 0.5;

        const firstCorrect = samples.findIndex(isCorrect);
        expect(firstCorrect).toBeGreaterThanOrEqual(0);
        expect(firstCorrect).toBeLessThanOrEqual(3);

        // ...and having settled, it stays put rather than oscillating.
        for (const s of samples.slice(firstCorrect)) {
            expect(isCorrect(s)).toBe(true);
            expect(s.width).toBeLessThan(s.parentWidth * 0.9);
        }
    });
});
