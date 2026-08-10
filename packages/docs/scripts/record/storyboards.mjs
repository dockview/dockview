// @ts-check
/**
 * Cinematic storyboards for the marketing reel — driven by recordClips.mjs
 * against the movie harness (harness/movie.html).
 *
 * A storyboard is `async ({ page, dir, size, wait, movie }) => {…}`:
 *   - `movie(name, ...args)` invokes `window.__movie[name](...args)` in the page
 *     (build layout, captions, theme, dual-monitor, end-card, …).
 *   - `dir` is the choreographer (eased `move`/`drag`) for the synthetic cursor.
 *   - `wait(ms)` pauses; `size` is the viewport.
 */

export const storyboards = {
    // ~70s extended capabilities reel — the full feature tour.
    'capabilities': async ({ page, dir, size, wait, movie }) => {
        const W = size.width;
        const H = size.height;
        const clickPeekTab = async () => {
            const t = page.locator('.dv-edge-group .dv-tab').first();
            const tb = await t.boundingBox();
            if (tb) {
                await dir.move({ to: { x: Math.round(tb.x + tb.width / 2), y: Math.round(tb.y + tb.height / 2) }, duration: 500 });
                await dir.click({ hold: 80 });
            }
        };

        // ===== ACT 1 — Compose =====
        await movie('add', 'chart', 'BTC/USD', 'chart');
        await wait(1300);
        await movie('caption', 'Compose', 'one engine · any layout');
        await movie('add', 'watch', 'Watchlist', 'watch', { referencePanel: 'chart', direction: 'left' });
        await wait(380);
        await movie('add', 'depth', 'Order Book', 'depth', { referencePanel: 'chart', direction: 'right' });
        await wait(380);
        await movie('add', 'positions', 'Positions', 'positions', { referencePanel: 'depth', direction: 'right' });
        await wait(380);
        await movie('add', 'tape', 'Time & Sales', 'tape', { referencePanel: 'chart', direction: 'below' });
        await wait(320);
        await movie('add', 'heat', 'Sector Heatmap', 'heat', { referencePanel: 'tape', direction: 'within' });
        await wait(200);
        await movie('add', 'term', 'Console', 'terminal', { referencePanel: 'tape', direction: 'within' });
        await wait(320);
        await movie('add', 'nodes', 'Global Network', 'nodes', { referencePanel: 'positions', direction: 'below' });
        await wait(300);
        await page.evaluate(() => {
            const m = window.__movie, s = (id, b) => { try { m.panels[id].api.setSize(b); } catch (e) {} };
            s('watch', { width: 320 }); s('positions', { width: 440 }); s('depth', { width: 380 });
            m.panels.chart.api.setActive();
        });
        await wait(1900);

        // ===== ACT 2 — Every group is a dockview (nested float) =====
        await movie('caption', 'Groups all the way down', 'a floating window is a full dockview');
        await movie('nestedFloat');
        await wait(700);
        // gently reposition it into open space…
        await dir.drag({
            from: { selector: '.dv-floating-titlebar' },
            waypoints: [{ x: Math.round(W * 0.44), y: Math.round(H * 0.42) }],
            duration: 950,
        });
        await wait(500);
        // …then push the camera in to reveal it's a full dockview inside.
        await movie('cameraTo', '.dv-resize-container', 0.72);
        await wait(2000);
        await movie('cameraReset');
        await wait(750);
        await movie('closeNested');
        await wait(700);

        // ===== ACT 3 — Within a group (animated zoom to a framed window) =====
        await movie('addTabs', 'term', [
            { id: 'ov', title: 'Overview', kind: 'chart' },
            { id: 'news', title: 'News', kind: 'terminal' },
            { id: 'alerts', title: 'Alerts', kind: 'terminal' },
            { id: 'risk', title: 'Risk', kind: 'terminal' },
        ]);
        await movie('activate', 'ov');
        await wait(300);
        await movie('caption', 'Inside a group', 'everything one group can do');
        // Maximise via the tab context menu (right-click → Maximise group).
        await dir.move({ to: { selector: '.dv-tab:has-text("Overview")' }, duration: 650 });
        await wait(300);
        await dir.click({ button: 'right', hold: 90 });
        await page.locator('.dv-context-menu').first().waitFor({ state: 'visible', timeout: 5000 });
        await wait(650);
        await dir.click({ to: { selector: '.dv-context-menu-item:has-text("Maximise group")' }, duration: 520, hold: 80 });
        await wait(600);
        // Only this one group is shown (native maximise); fade the rest to clean
        // black, then SHRINK the container into a framed window (checklist left).
        await movie('soloGroup', 'term');
        await wait(700);
        await movie('zoomTo', 'term', 0.86, 0.04);
        await wait(1200);
        await movie('featureList', [
            'Tab groups',
            'Pinned tabs',
            'Header anywhere',
            'Multi-row tabs',
        ]);
        await wait(900);
        // 1 — tab groups: create a colour chip, then add-to-group via the tab
        // context menu, collapse/expand the chip, and rename it.
        await movie('featureMark', 0);
        await movie('tabGroup', 'term', 'Monitoring', 'blue', ['news', 'alerts', 'risk']);
        await wait(1000);
        // right-click a tab → Add to tab group
        await dir.move({ to: { selector: '.dv-tab:has-text("Sector Heatmap")' }, duration: 600 });
        await dir.click({ button: 'right', hold: 85 });
        await page.locator('.dv-context-menu').first().waitFor({ state: 'visible', timeout: 4000 });
        await wait(550);
        await dir.click({ to: { selector: '.dv-context-menu-item:has-text("Add to tab group")' }, duration: 480, hold: 70 });
        await wait(1000);
        // click the chip → collapse, then click → expand
        await dir.move({ to: { selector: '.dv-tab-group-chip' }, duration: 550 });
        await dir.click({ hold: 70 });
        await wait(1200);
        await dir.click({ hold: 70 });
        await wait(1000);
        // rename the chip via its own context menu (right-click chip → Rename)
        await dir.move({ to: { selector: '.dv-tab-group-chip' }, duration: 550 });
        await dir.click({ button: 'right', hold: 85 });
        await page.locator('.dv-context-menu-rename').first().waitFor({ state: 'visible', timeout: 4000 });
        await wait(550);
        await dir.click({ to: { selector: '.dv-context-menu-rename' }, duration: 420, hold: 70 });
        await wait(350);
        await page.locator('.dv-context-menu-rename-input').first().fill('Risk Desk');
        await wait(600);
        await page.keyboard.press('Enter');
        await wait(1200);
        // 2 — pinned
        await movie('featureMark', 1);
        await movie('pin', 'tape');
        await movie('pin', 'term');
        await wait(1900);
        // 3 — header anywhere (top/right/bottom; 'left' would hit the checklist)
        await movie('featureMark', 2);
        await movie('headerPos', 'term', 'right');
        await wait(1250);
        await movie('headerPos', 'term', 'bottom');
        await wait(1250);
        await movie('headerPos', 'term', 'top');
        await wait(750);
        // 4 — multi-row: the panel is maximised (full width), so pour in enough
        // tabs to overflow → wrap to rows; close them after to keep it clean.
        await movie('featureMark', 3);
        const extra = [
            'Order Flow', 'P&L Summary', 'Compliance', 'Market Depth',
            'Signals', 'Latency', 'Execution', 'News & Wires', 'Risk & Exposure',
            'Greeks', 'Volatility', 'Liquidity', 'Momentum', 'Spreads', 'Fills',
            'VWAP', 'Options', 'Futures', 'Swaps', 'Bonds',
        ].map((t, i) => ({ id: 'xt' + i, title: t, kind: 'terminal' }));
        await movie('addTabs', 'term', extra);
        await movie('activate', 'ov');
        await wait(950);
        await movie('wrap', true);
        await wait(2300);
        await movie('wrap', false);
        await movie('closeTabs', extra.map((e) => e.id));
        await wait(600);
        await movie('featureMark', 4);
        await wait(800);
        await movie('featureHide');
        // Grow the container back, then un-maximise to the full workspace.
        await movie('zoomReset');
        await wait(500);
        await movie('unsolo');
        await movie('exitMaxGroup', 'term');
        await wait(1100);

        // ===== ACT 4 — Command the edges (camera on the right edge) =====
        await movie('caption', 'Dock to any edge', 'edge-anchored tool windows');
        await movie('addEdge', 'right', { id: 'inspector', initialSize: 300 }, [
            { id: 'insp', title: 'Inspector', kind: 'positions' },
            { id: 'props', title: 'Properties', kind: 'terminal' },
        ]);
        await wait(700);
        await movie('cameraTo', '.dv-edge-group', 0.62, 0.12);
        await wait(1600);
        // Reset the camera BEFORE peeking — the auto-hide peek overlay is
        // positioned in viewport space and drifts under an ancestor transform.
        await movie('cameraReset');
        await wait(900);
        await movie('caption', 'Auto-hide', 'collapse to a strip · click to peek');
        await movie('autoHideEdge', 'right');
        await wait(1200);
        await clickPeekTab();
        await wait(2000);
        await movie('peekEdge', 'right', false);
        await wait(800);
        await movie('caption', 'Empty states', 'branded watermarks for empty groups');
        await movie('addEmpty', 'nodes', 'right');
        await wait(1900);

        // ===== ACT 5 — Focus & scale =====
        await movie('caption', 'Focus', 'maximise, then restore');
        await movie('highlight', 'chart');
        await wait(400);
        await movie('maximize', 'chart');
        await wait(2600);
        await movie('exitMax');
        await movie('highlight', null);
        await wait(800);
        await movie('caption', 'Any monitor', 'pop out to a second screen');
        await wait(400);
        await movie('dualMonitor', true);
        await wait(1300);
        await movie('popout', 'chart', 'BTC/USD');
        await wait(2000);
        await movie('dualMonitor', false);
        await wait(900);

        // ===== ACT 6 — Yours (theme morph) =====
        await movie('caption', 'Yours', 'themeable to your brand');
        await wait(450);
        await movie('theme', 'dracula');
        await wait(1500);
        await movie('theme', 'nord');
        await wait(1500);
        await movie('theme', 'dark');
        await wait(1500);
        await movie('theme', 'abyss');
        await wait(1100);

        // ===== ACT 7 — End card =====
        await movie('caption', '');
        await movie('endcard', true, 'The layout engine for serious applications');
        await wait(3200);
    },


    // ~45s trading-desk capability reel: assemble → float → dock → focus →
    // dual-monitor pop-out → theme morph → end card.
    'trading-moneyshot': async ({ page, dir, size, wait, movie }) => {
        const W = size.width;
        const H = size.height;
        const setSizes = () =>
            page.evaluate(() => {
                const m = window.__movie;
                const s = (id, box) => {
                    try {
                        m.panels[id].api.setSize(box);
                    } catch (e) {}
                };
                s('watch', { width: 230 });
                s('positions', { width: 350 });
                s('depth', { width: 300 });
                m.panels.chart.api.setActive();
            });

        // ---- Beat A — cold open: a single panel ----
        await movie('add', 'chart', 'BTC/USD', 'chart');
        await wait(1500);

        // ---- Beat B — Compose: the workspace assembles panel by panel ----
        await movie('caption', 'Compose', 'one engine · any layout');
        await movie('add', 'watch', 'Watchlist', 'watch', {
            referencePanel: 'chart',
            direction: 'left',
        });
        await wait(430);
        await movie('add', 'depth', 'Order Book', 'depth', {
            referencePanel: 'chart',
            direction: 'right',
        });
        await wait(430);
        await movie('add', 'positions', 'Positions', 'positions', {
            referencePanel: 'depth',
            direction: 'right',
        });
        await wait(430);
        await movie('add', 'tape', 'Time & Sales', 'tape', {
            referencePanel: 'chart',
            direction: 'below',
        });
        await wait(360);
        await movie('add', 'heat', 'Sector Heatmap', 'heat', {
            referencePanel: 'tape',
            direction: 'within',
        });
        await wait(220);
        await movie('add', 'term', 'Console', 'terminal', {
            referencePanel: 'tape',
            direction: 'within',
        });
        await wait(360);
        await movie('add', 'nodes', 'Global Network', 'nodes', {
            referencePanel: 'positions',
            direction: 'below',
        });
        await wait(320);
        await setSizes();
        await wait(2400);

        // ---- Beat C — Float, via the tab context menu ----
        await movie('caption', 'Float', 'right-click · Float');
        // Move to the Order Book tab and right-click to open the menu.
        await dir.move({
            to: { selector: '.dv-tab:has-text("Order Book")' },
            duration: 650,
        });
        await wait(350);
        await dir.click({ button: 'right', hold: 90 });
        await page
            .locator('.dv-context-menu')
            .first()
            .waitFor({ state: 'visible', timeout: 5000 });
        await wait(650);
        // Glide down to the "Float" item and click it.
        await dir.click({
            to: { selector: '.dv-context-menu-item:has-text("Float")' },
            duration: 550,
            hold: 80,
        });
        await wait(550);
        // Sail the now-floating group.
        await dir.drag({
            from: { selector: '.dv-floating-titlebar' },
            waypoints: [
                { x: Math.round(W * 0.42), y: Math.round(H * 0.52) },
                { x: Math.round(W * 0.62), y: Math.round(H * 0.34) },
            ],
            duration: 850,
            dwell: 220,
        });
        await wait(700);

        // ---- Beat D — Dock: snap it back into the layout ----
        await movie('caption', 'Dock', 'snap it anywhere');
        await dir.drag({
            from: { selector: '.dv-floating-titlebar' },
            to: { x: Math.round(W * 0.32), y: Math.round(H * 0.42) },
            duration: 800,
            settle: 340,
        });
        // Land the dock via the API (a pointer drop can miss the target).
        await movie('dock', 'depth', 'chart', 'right');
        await movie('highlight', null);
        await wait(1100);

        // ---- Beat E — Focus: maximise, then restore ----
        await movie('caption', 'Focus', 'maximise, then restore');
        await movie('highlight', 'chart');
        await wait(450);
        await movie('maximize', 'chart');
        await wait(3000);
        await movie('exitMax');
        await movie('highlight', null);
        await wait(1000);

        // ---- Beat F — Any monitor: pop out to a second screen ----
        await movie('caption', 'Any monitor', 'pop out to a second screen');
        await wait(450);
        await movie('dualMonitor', true);
        await wait(1300);
        await movie('popout', 'chart', 'BTC/USD');
        await wait(2200);
        await movie('dualMonitor', false);
        await wait(1000);

        // ---- Beat G — Yours: morph across (dark) themes ----
        await movie('caption', 'Yours', 'themeable to your brand');
        await wait(500);
        await movie('theme', 'dracula');
        await wait(1600);
        await movie('theme', 'nord');
        await wait(1600);
        await movie('theme', 'dark');
        await wait(1600);
        await movie('theme', 'abyss');
        await wait(1200);

        // ---- Beat H — End card ----
        await movie('caption', '');
        await movie(
            'endcard',
            true,
            'The layout engine for serious applications'
        );
        await wait(3200);
    },
};
