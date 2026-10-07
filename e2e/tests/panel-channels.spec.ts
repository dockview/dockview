import { test, expect, Page } from '@playwright/test';

/**
 * Panel channels — real-browser behaviour the jsdom unit tests cannot reach:
 * the marker and header accent actually painting in the channel colour, the
 * context-menu picker opening as a positioned popover, serialization through a
 * real page reload, and a member that lives in a genuine popout window.
 */
test.describe('panel channels', () => {
    const setup = async (page: Page, query = '') => {
        await page.goto('/e2e/fixtures/index.html' + query);
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(() => {
            (window as any).__dv.addPanel('alpha');
            (window as any).__dv.addPanelAt('beta', 'right');
        });
    };

    const dv = (page: Page) => ({
        join: (id: string, channel: string) =>
            page.evaluate(
                ([id, channel]) => (window as any).__dv.joinChannel(id, channel),
                [id, channel]
            ),
        leave: (id: string) =>
            page.evaluate((id) => (window as any).__dv.leaveChannel(id), id),
        channelOf: (id: string) =>
            page.evaluate((id) => (window as any).__dv.channelOf(id), id),
        broadcast: (id: string, context: object) =>
            page.evaluate(
                ([id, context]) => (window as any).__dv.broadcast(id, context),
                [id, context] as [string, object]
            ),
        received: (id: string) =>
            page.evaluate((id) => (window as any).__dv.received(id), id),
    });

    test('a linked tab shows a marker in the channel colour with an accessible name', async ({
        page,
    }) => {
        await setup(page);
        await dv(page).join('alpha', 'red');

        const tab = page.locator('.dv-tab--channel');
        await expect(tab).toHaveCount(1);
        await expect(tab).toHaveAttribute('data-channel', 'red');

        const marker = tab.locator('.dv-tab-channel');
        await expect(marker).toBeVisible();
        await expect(marker).toHaveAttribute('role', 'img');
        await expect(marker).toHaveAttribute('aria-label', 'Linked to Red');

        // The theme variable resolves to a real paint colour.
        const colour = await marker.evaluate(
            (el) => getComputedStyle(el).backgroundColor
        );
        expect(colour).toBe('rgb(229, 72, 77)');

        // The header of the linked panel's group carries the accent.
        const header = page.locator(
            '.dv-tabs-and-actions-container--channel'
        );
        await expect(header).toHaveCount(1);
        await expect(header).toHaveAttribute('data-channel', 'red');
    });

    test('linking from the context menu picker delivers a broadcast to the other member', async ({
        page,
    }) => {
        await setup(page, '?channelmenu=1');
        await dv(page).join('beta', 'red');

        // Right-click alpha → the picker is auto-injected → pick Red.
        await page
            .locator('.dv-tab', { hasText: 'alpha' })
            .click({ button: 'right' });
        const menu = page.locator('.dv-context-menu');
        await expect(menu).toBeVisible();
        await expect(
            menu.locator('.dv-context-menu-channel-label')
        ).toHaveText('Link to');
        const swatches = menu.locator('.dv-context-menu-channel-swatch');
        await expect(swatches).toHaveCount(8);
        await expect(
            menu.locator('.dv-context-menu-item', { hasText: 'Unlink' })
        ).toHaveAttribute('aria-disabled', 'true');

        await swatches.first().click();

        await expect(menu).toHaveCount(0);
        expect(await dv(page).channelOf('alpha')).toBe('red');
        await expect(page.locator('.dv-tab--channel')).toHaveCount(2);
        await expect(
            page.locator('.dv-tabs-and-actions-container--channel')
        ).toHaveCount(2);

        await dv(page).broadcast('alpha', { type: 'instrument', id: 'AAPL' });
        expect(await dv(page).received('beta')).toEqual([
            { context: { type: 'instrument', id: 'AAPL' }, replay: false, channel: 'red' },
        ]);
        // The sender is excluded.
        expect(await dv(page).received('alpha')).toEqual([]);

        // Unlink from the menu clears the marker and the accent.
        await page
            .locator('.dv-tab', { hasText: 'alpha' })
            .click({ button: 'right' });
        await page
            .locator('.dv-context-menu-item', { hasText: 'Unlink' })
            .click();
        expect(await dv(page).channelOf('alpha')).toBeUndefined();
        await expect(page.locator('.dv-tab--channel')).toHaveCount(1);
        await expect(
            page.locator('.dv-tabs-and-actions-container--channel')
        ).toHaveCount(1);
    });

    test('channel membership survives a snapshot, reload and restore', async ({
        page,
    }) => {
        await setup(page);
        await dv(page).join('beta', 'blue');
        const json = await page.evaluate(() =>
            JSON.stringify((window as any).__dv.snapshot())
        );
        expect(json).toContain('"channel":"blue"');

        await page.reload();
        await page.waitForFunction(() => (window as any).__ready === true);
        await page.evaluate(
            (state) => (window as any).__dv.restore(JSON.parse(state)),
            json
        );

        const tab = page.locator('.dv-tab--channel');
        await expect(tab).toHaveCount(1);
        await expect(tab).toContainText('beta');
        await expect(tab).toHaveAttribute('data-channel', 'blue');
        await expect(tab.locator('.dv-tab-channel')).toBeVisible();
    });

    test('a member in a popout window still receives broadcasts and shows the marker', async ({
        page,
        context,
    }) => {
        await setup(page);
        await dv(page).join('alpha', 'green');
        await dv(page).join('beta', 'green');

        // beta's group is active (added last): pop it out into a real window.
        const [popout] = await Promise.all([
            context.waitForEvent('page'),
            page.evaluate(() => (window as any).__dv.popoutActiveGroup()),
        ]);
        await (popout as Page).waitForLoadState();
        await expect(popout.locator('.dv-test-panel')).toContainText('beta');

        // The popout document renders the marker for its linked tab.
        const popoutTab = popout.locator('.dv-tab--channel');
        await expect(popoutTab).toHaveCount(1);
        await expect(popoutTab.locator('.dv-tab-channel')).toBeVisible();

        // A broadcast from the main window reaches the popped-out member.
        await dv(page).broadcast('alpha', { type: 'instrument', id: 'MSFT' });
        await expect
            .poll(() => dv(page).received('beta'))
            .toEqual([
                {
                    context: { type: 'instrument', id: 'MSFT' },
                    replay: false,
                    channel: 'green',
                },
            ]);
    });
});
