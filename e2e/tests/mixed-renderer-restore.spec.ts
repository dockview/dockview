import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * #1675 — a group whose active `onlyWhenVisible` panel precedes an inactive
 * `always` panel. Registering the inactive panel with the overlay render
 * container used to evict the active panel's directly-mounted content, so the
 * selected tab showed a blank body after `fromJSON` and after the
 * render-container swap a popout performs. The jsdom unit tests cover the
 * `fromJSON` / `addPanel` / `setRenderer` paths; the popout swap needs a
 * genuine second window, so it lives here.
 */
test.describe('mixed renderer restore (#1675)', () => {
    const ready = async (page: Page) => {
        await page.goto('/e2e/fixtures/index.html');
        await page.waitForFunction(() => (window as any).__ready === true);
    };

    const setup = (page: Page) =>
        page.evaluate(() => (window as any).__dv.setupMixedRenderers());

    const snapshot = (page: Page) =>
        page.evaluate(() => JSON.stringify((window as any).__dv.snapshot()));

    const activePanelId = (page: Page) =>
        page.evaluate(() => (window as any).__dv.activePanelId());

    // The active `onlyWhenVisible` panel renders directly inside the group's
    // content container; the inactive `always` panel lives in the overlay
    // render container (attached, hidden until activated).
    const expectActiveAMounted = async (page: Page) => {
        await expect(
            page.locator('.dv-content-container .dv-test-panel', {
                hasText: /^a$/,
            })
        ).toBeVisible();
        await expect(
            page.locator('.dv-render-overlay .dv-test-panel', {
                hasText: /^b$/,
            })
        ).toBeAttached();
        await expect(
            page.locator('.dv-render-overlay .dv-test-panel', {
                hasText: /^b$/,
            })
        ).toBeHidden();
    };

    test('restoring the layout keeps the active panel content mounted', async ({
        page,
    }) => {
        await ready(page);
        await setup(page);
        await expectActiveAMounted(page);

        const json = await snapshot(page);
        expect(JSON.parse(json).grid.root.data[0].data).toMatchObject({
            views: ['a', 'b'],
            activeView: 'a',
        });

        // Fresh component (as after a page reload), then restore.
        await ready(page);
        await page.evaluate(
            (state) => (window as any).__dv.restore(JSON.parse(state)),
            json
        );

        expect(await activePanelId(page)).toBe('a');
        await expectActiveAMounted(page);
    });

    const popoutMixedGroup = async (page: Page, context: BrowserContext) => {
        await ready(page);
        await setup(page);
        const [win] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(() => (window as any).__dv.popoutActiveGroup()),
        ]);
        await (win as Page).waitForLoadState();
        return win as Page;
    };

    test('popping the group out swaps render containers without blanking the active panel', async ({
        page,
        context,
    }) => {
        const win = await popoutMixedGroup(page, context);

        expect(await activePanelId(page)).toBe('a');
        await expectActiveAMounted(win);
        await expect(page.locator('.dv-test-panel')).toHaveCount(0);
    });

    test('closing the popout re-docks the group with the active panel mounted', async ({
        page,
        context,
    }) => {
        const win = await popoutMixedGroup(page, context);
        await expectActiveAMounted(win);

        await win.close({ runBeforeUnload: true });
        await expect
            .poll(() => page.evaluate(() => (window as any).__dv.popoutCount()))
            .toBe(0);

        expect(await activePanelId(page)).toBe('a');
        await expectActiveAMounted(page);
    });

    test('restoring a serialized popout renders the active panel in the re-opened window', async ({
        page,
        context,
    }) => {
        const win = await popoutMixedGroup(page, context);
        const json = await snapshot(page);
        expect(json).toContain('"popoutGroups"');
        await win.close({ runBeforeUnload: true });

        await ready(page);
        const [restored] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(async (state) => {
                (window as any).__dv.restore(JSON.parse(state));
                await (window as any).__dv.awaitPopoutRestore();
            }, json),
        ]);
        await (restored as Page).waitForLoadState();

        expect(await activePanelId(page)).toBe('a');
        await expectActiveAMounted(restored as Page);
    });
});
