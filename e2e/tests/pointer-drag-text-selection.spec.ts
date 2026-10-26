import { test, expect } from '@playwright/test';

/**
 * A pointer-backend tab drag must not select the text it travels over.
 *
 * The HTML5 backend never has this problem because the browser owns the
 * gesture once a drag starts. The pointer backend leaves the button held, and
 * WebKit (Safari, WKWebView, WebKitGTK) begins a selection from a mousedown on
 * a `user-select: none` tab regardless — only a natively draggable element is
 * exempt — so every pointermove extends that selection into the panels under
 * the cursor. Chromium refuses the gesture at mousedown, so the assertion only
 * bites on the opt-in `webkit` project.
 */
test('a pointer-mode tab drag does not select the text it passes over', async ({
    page,
}) => {
    await page.goto('/e2e/fixtures/index.html?dnd=pointer');
    await page.waitForFunction(() => (window as any).__ready === true);
    await page.evaluate(() => (window as any).__dv.setupCrossGroupTabGroups());
    await expect(page.locator('.dv-tab', { hasText: 'blue' })).toBeVisible();

    const selection = () =>
        page.evaluate(() => {
            const s = window.getSelection();
            // `Selection.toString()` omits `user-select: none` text in WebKit,
            // so read the raw range too: it is what reappears after the drag
            // when the selection was merely hidden rather than prevented.
            return {
                visible: s?.toString().length ?? 0,
                range: s?.rangeCount ? s.getRangeAt(0).toString().length : 0,
            };
        });

    const tab = (await page
        .locator('.dv-tab', { hasText: 'blue' })
        .boundingBox())!;
    // The left group's visible panel: selectable text sits at its top-left.
    const leftPanel = (await page
        .locator('.dv-test-panel', { hasText: 'green' })
        .boundingBox())!;

    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
    await page.mouse.down();

    const path: Array<[number, number]> = [
        [tab.x + tab.width / 2, tab.y + tab.height + 40],
        [leftPanel.x + leftPanel.width / 2, leftPanel.y + leftPanel.height / 2],
        [leftPanel.x + 20, leftPanel.y + 12],
        [
            leftPanel.x + leftPanel.width - 20,
            leftPanel.y + leftPanel.height - 20,
        ],
    ];
    let overlaySeen = false;
    for (const [x, y] of path) {
        await page.mouse.move(x, y, { steps: 8 });
        await page.waitForTimeout(50);
        overlaySeen ||= (await page.locator('.dv-drop-target').count()) > 0;
        expect(await selection()).toEqual({ visible: 0, range: 0 });
    }
    // the gesture was a real drag, not a no-op press
    expect(overlaySeen).toBe(true);

    await page.mouse.up();
    await page.waitForTimeout(200);
    expect(await selection()).toEqual({ visible: 0, range: 0 });
});
