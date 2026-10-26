import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * dockview-vue + Vue `<keep-alive>`, in a real browser.
 *
 * Since PR #1380 (fixing #1369) dockview-vue mounts panels via `<Teleport>`, so
 * a panel stays a real descendant of `<DockviewVue>` in the Vue component tree.
 * That ancestry is what lets `<keep-alive>` reach panels: switching the active
 * panel DEACTIVATES/REACTIVATES the cached component (`onDeactivated`/
 * `onActivated`) instead of unmounting/remounting it, so in-panel state
 * survives. jsdom unit tests (packages/dockview-vue/src/__tests__/keepalive)
 * cover the single-window case; these cover it in a real browser AND across the
 * cross-window popout round-trip, which jsdom cannot model.
 *
 * The fixture (e2e/fixtures/vue.html) wraps each panel's content in
 * `<keep-alive>` driven by the panel's visibility, and exposes `window.__vue`.
 */
test.describe('dockview-vue <keep-alive>', () => {
    const open = async (page: Page) => {
        await page.goto('/e2e/fixtures/vue.html');
        await page.waitForFunction(() => (window as any).__ready === true);
    };

    test('switching the active panel deactivates/reactivates (not unmount/remount) and keeps state', async ({
        page,
    }) => {
        await open(page);

        // Two panels in one group; `one` stays active, `two` is added inactive.
        await page.evaluate(() => {
            (window as any).__vue.addPanel('one');
            (window as any).__vue.addPanel('two', { inactive: true });
        });

        // Panel mount is async under Teleport (Vue flush) — await the locator.
        const field = page.locator('[data-pid="one"] .field');
        await expect(field).toBeVisible();

        // Seed in-panel state on the visible panel by typing into its input.
        await field.fill('kept-alive-value');
        await expect(field).toHaveValue('kept-alive-value');

        const before = await page.evaluate(() =>
            (window as any).__vue.counters('one')
        );
        expect(before.mounted).toBe(1);
        expect(before.unmounted).toBe(0);

        await page.evaluate(() => (window as any).__vue.setActive('two'));
        await expect(page.locator('[data-pid="two"] .field')).toBeVisible();
        // While cached, panel one's content is removed from the DOM.
        await expect(field).toHaveCount(0);

        await page.evaluate(() => (window as any).__vue.setActive('one'));
        await expect(field).toBeVisible();

        const after = await page.evaluate(() =>
            (window as any).__vue.counters('one')
        );

        // keep-alive lifecycle fired — NOT a fresh mount/unmount cycle.
        expect(after.deactivated).toBeGreaterThanOrEqual(1);
        expect(after.activated).toBeGreaterThan(before.activated);
        expect(after.mounted).toBe(1); // never re-mounted
        expect(after.unmounted).toBe(0); // never destroyed

        // The in-panel state survived the round-trip (proves caching, not
        // remount — a remount would have reset the input to empty).
        await expect(field).toHaveValue('kept-alive-value');
    });

    test('popout round-trip keeps a kept-alive panel and its state, without remounting', async ({
        page,
        context,
    }) => {
        await open(page);

        await page.evaluate(() => {
            (window as any).__vue.addPanel('alpha');
            (window as any).__vue.addPanel('beta', { inactive: true });
        });

        const alpha = page.locator('[data-pid="alpha"] .field');
        await expect(alpha).toBeVisible();
        await alpha.fill('survives-popout');

        const before = await page.evaluate(() =>
            (window as any).__vue.counters('alpha')
        );
        expect(before.mounted).toBe(1);
        expect(before.unmounted).toBe(0);

        const [win] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(() => (window as any).__vue.popoutActiveGroup()),
        ]);
        await (win as Page).waitForLoadState();

        // The panel now renders inside the popout, with its state intact, and no
        // longer in the opener.
        const popoutAlpha = win.locator('[data-pid="alpha"] .field');
        await expect(popoutAlpha).toBeVisible();
        await expect(popoutAlpha).toHaveValue('survives-popout');
        await expect(page.locator('[data-pid="alpha"]')).toHaveCount(0);
        // Same component instance moved by Teleport — not destroyed+recreated.
        expect(
            await page.evaluate(() => (window as any).__vue.counters('alpha'))
        ).toMatchObject({ mounted: 1, unmounted: 0 });

        // Evacuate back to the main window. Closing the popout WINDOW runs core's
        // `disposePopoutWindow`, which moves the panels back to the main document
        // (moveGroupWithoutDestroying) before tearing the window down — the
        // panel-preserving path (cf. popout-lifecycle.spec). dockview re-docks on
        // `beforeunload`, so the close must run it.
        await win.close({ runBeforeUnload: true });

        await expect
            .poll(() =>
                page.evaluate(() => (window as any).__vue.popoutCount())
            )
            .toBe(0);

        // Back in the opener: present again, state STILL intact, and never
        // destroyed — the persistent teleport target wasn't stranded.
        await expect(alpha).toBeVisible();
        await expect(alpha).toHaveValue('survives-popout');
        expect(
            await page.evaluate(() => (window as any).__vue.counters('alpha'))
        ).toMatchObject({ mounted: 1, unmounted: 0 });
        expect(
            await page.evaluate(() => (window as any).__vue.groupCount())
        ).toBe(1);
    });

    test('provide/inject reaches a teleported panel and survives a popout round-trip', async ({
        page,
        context,
    }) => {
        await open(page);

        // Root `provide`s a value above the DockviewVue host; a teleported panel
        // must resolve it through the (live) component tree.
        await page.evaluate(() => (window as any).__vue.addPanel('one'));

        const injected = page.locator('[data-pid="one"] .injected');
        await expect(injected).toHaveText('from-root');
        expect(
            await page.evaluate(() => (window as any).__vue.injected('one'))
        ).toBe('from-root');

        // The injected value must still resolve after the panel is teleported
        // into a popout window (the tree ancestry is what popout mustn't sever).
        const [win] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(() => (window as any).__vue.popoutActiveGroup()),
        ]);
        await (win as Page).waitForLoadState();
        await expect(win.locator('[data-pid="one"] .injected')).toHaveText(
            'from-root'
        );

        // ...and after it is evacuated back to the main window.
        await win.close({ runBeforeUnload: true });
        await expect
            .poll(() =>
                page.evaluate(() => (window as any).__vue.popoutCount())
            )
            .toBe(0);
        await expect(injected).toHaveText('from-root');
    });

    test('closing a multi-group popout evacuates every group with state intact and no remounts', async ({
        page,
        context,
    }) => {
        await open(page);

        // A single group popped out, then a second group split into the popout's
        // own gridview — so the popout window hosts two groups.
        await page.evaluate(() => (window as any).__vue.addPanel('alpha'));
        await expect(page.locator('[data-pid="alpha"] .field')).toBeVisible();
        await page.locator('[data-pid="alpha"] .field').fill('alpha-state');

        const [win] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(() => (window as any).__vue.popoutActiveGroup()),
        ]);
        await (win as Page).waitForLoadState();

        await page.evaluate(() =>
            (window as any).__vue.splitIntoPopout('gamma')
        );

        // Both panels live in the popout; seed the second one there.
        const gammaInPopout = win.locator('[data-pid="gamma"] .field');
        await expect(gammaInPopout).toBeVisible();
        await gammaInPopout.fill('gamma-state');
        await expect(win.locator('.dv-tabs-container')).toHaveCount(2);
        await expect(page.locator('[data-pid="alpha"]')).toHaveCount(0);

        const beforeGamma = await page.evaluate(() =>
            (window as any).__vue.counters('gamma')
        );
        expect(beforeGamma).toMatchObject({ mounted: 1, unmounted: 0 });

        await win.close({ runBeforeUnload: true });

        await expect
            .poll(() =>
                page.evaluate(() => (window as any).__vue.popoutCount())
            )
            .toBe(0);
        await expect
            .poll(() => page.evaluate(() => (window as any).__vue.groupCount()))
            .toBe(2);

        // Both panels are back, with their state, and neither was destroyed —
        // no popout member was stranded on teardown.
        await expect(page.locator('[data-pid="alpha"] .field')).toHaveValue(
            'alpha-state'
        );
        await expect(page.locator('[data-pid="gamma"] .field')).toHaveValue(
            'gamma-state'
        );
        expect(
            await page.evaluate(() => (window as any).__vue.counters('alpha'))
        ).toMatchObject({ mounted: 1, unmounted: 0 });
        expect(
            await page.evaluate(() => (window as any).__vue.counters('gamma'))
        ).toMatchObject({ mounted: 1, unmounted: 0 });
    });
});
