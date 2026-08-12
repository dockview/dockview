// @ts-check
/**
 * Feature beats — the vocabulary the prompt composer draws on.
 *
 * A "beat" is one self-contained demonstration of a single dockview capability,
 * built on the movie harness control surface (window.__movie, see
 * harness/movie.html). Each beat sets up whatever state it needs, shows the
 * feature with an eased cursor + caption, and tidies up so the next beat starts
 * from a coherent workspace. That self-containment is what lets the composer
 * (promptCompose.mjs) string an arbitrary subset together from a prompt and
 * still get a film that flows.
 *
 * A beat:
 *   {
 *     id,                       // stable id (also a --features token)
 *     title,                    // human label (for --list-features)
 *     aliases: [ ... ],         // substrings that select it from a prompt
 *     caption: [word, sub],     // the on-screen caption for the beat
 *     order,                    // sort key so a mixed selection flows well
 *     needsBase,                // build the base workspace before running?
 *     async run(ctx),           // the choreography
 *   }
 *
 * ctx = { page, dir, size, wait, movie, base } where:
 *   - movie(name, ...args)  invokes window.__movie[name](...)
 *   - dir                    the eased cursor choreographer (move/click/drag)
 *   - wait(ms)               pause
 *   - size                   { width, height } viewport
 *   - base                   { ids: [...] } panel ids present in the base layout
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Build the trading-desk base workspace, panel by panel, and size it. */
export async function buildBase({ page, wait, movie }) {
    await movie('add', 'chart', 'BTC/USD', 'chart');
    await wait(360);
    await movie('add', 'watch', 'Watchlist', 'watch', {
        referencePanel: 'chart',
        direction: 'left',
    });
    await wait(300);
    await movie('add', 'depth', 'Order Book', 'depth', {
        referencePanel: 'chart',
        direction: 'right',
    });
    await wait(300);
    await movie('add', 'positions', 'Positions', 'positions', {
        referencePanel: 'depth',
        direction: 'right',
    });
    await wait(300);
    await movie('add', 'tape', 'Orders', 'tape', {
        referencePanel: 'chart',
        direction: 'below',
    });
    await wait(260);
    await movie('add', 'heat', 'Correlation', 'heat', {
        referencePanel: 'tape',
        direction: 'within',
    });
    await wait(180);
    await movie('add', 'term', 'Newswire', 'terminal', {
        referencePanel: 'tape',
        direction: 'within',
    });
    await wait(260);
    await movie('add', 'nodes', 'Alerts', 'nodes', {
        referencePanel: 'positions',
        direction: 'below',
    });
    await wait(200);
    // A tabbed analytics group beside the alerts panel — distinct panel types
    // (signals / vol surface) so the desk reads as a varied, multi-panel desk.
    await movie('addTabs', 'nodes', [
        { id: 'perf', title: 'Signals', kind: 'lines' },
        { id: 'flow', title: 'Vol Surface', kind: 'bars' },
    ]);
    await movie('activate', 'perf');
    await wait(240);
    await page.evaluate(() => {
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
    await wait(120);
}

/** Right-click a tab by its title and click a context-menu item by its text. */
async function tabMenu({ page, dir, wait }, tabText, itemText) {
    await dir.move({
        to: { selector: `.dv-tab:has-text("${tabText}")` },
        duration: 620,
    });
    await wait(280);
    await dir.click({ button: 'right', hold: 90 });
    await page
        .locator('.dv-context-menu')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });
    await wait(560);
    await dir.click({
        to: { selector: `.dv-context-menu-item:has-text("${itemText}")` },
        duration: 520,
        hold: 80,
    });
}

// ---------------------------------------------------------------------------
// The beat catalogue
// ---------------------------------------------------------------------------

/** @type {Record<string, any>} */
export const beats = {
    // ---- Compose: assemble the workspace, panel by panel ----
    compose: {
        id: 'compose',
        tag: 'Composable layouts',
        title: 'Compose a layout panel by panel',
        aliases: ['compose', 'layout', 'assemble', 'build', 'split', 'grid'],
        caption: ['Compose', 'one engine · any layout'],
        order: 10,
        needsBase: false, // it *is* the base build
        async run(ctx) {
            await buildBase(ctx);
            await ctx.wait(2100);
        },
    },

    // ---- Float: undock a group into a floating window, sail it, dock back ----
    float: {
        id: 'float',
        tag: 'Floating panels',
        title: 'Float a group, then dock it back',
        aliases: [
            'float',
            'floating',
            'floating panel',
            'floating group',
            'floating window',
            'undock',
            'detach',
        ],
        caption: ['Float', 'right-click · Float'],
        order: 20,
        needsBase: true,
        async run(ctx) {
            const { page, dir, wait, movie, size } = ctx;
            const W = size.width;
            const H = size.height;
            // 1. Pan IN on the Order Book tab — the point of interaction.
            const tb = await page
                .locator('.dv-tab:has-text("Order Book")')
                .first()
                .boundingBox();
            await movie(
                'focusPoint',
                Math.round(tb.x + tb.width / 2),
                Math.round(tb.y + tb.height + 140),
                1.5
            );
            await wait(1300); // settle before interacting (boundingBox clicks)
            // 2. Right-click the (now enlarged) tab to open the context menu.
            await dir.move({
                to: { selector: '.dv-tab:has-text("Order Book")' },
                duration: 480,
            });
            await wait(220);
            await dir.click({ button: 'right', hold: 90 });
            await page
                .locator('.dv-context-menu')
                .first()
                .waitFor({ state: 'visible', timeout: 5000 });
            await wait(650); // hold on the menu, zoomed in
            // 3. Click Float, then glide the camera across to a gentle zoom on
            //    the new floating group — it is now the focus. One continuous
            //    move that follows the action to the panel. (The float lands at
            //    a known centre from the harness config, so this needs no
            //    transform-aware measurement.)
            await dir.click({
                to: { selector: '.dv-context-menu-item:has-text("Float")' },
                duration: 520,
                hold: 80,
            });
            await wait(420);
            const fx = Math.round(W * 0.026 + 630 + 280);
            const fy = Math.round(H * 0.026 + 300 + 205);
            await movie('focusPoint', fx, fy, 1.16);
            await wait(1750); // hold on the floating group
            // 4. Pan out, then dock it back at full view so the snap into the
            //    layout is visible.
            await movie('cameraReset');
            await wait(1250);
            await movie('caption', 'Dock', 'snap it anywhere');
            await dir.drag({
                from: { selector: '.dv-floating-titlebar' },
                to: { x: Math.round(W * 0.32), y: Math.round(H * 0.42) },
                duration: 820,
                settle: 320,
            });
            // Land the dock deterministically (a pointer drop can miss).
            await movie('dock', 'depth', 'chart', 'right');
            await movie('highlight', null);
            await wait(1000);
        },
    },

    // ---- Focus: maximise a group, then restore ----
    focus: {
        id: 'focus',
        tag: 'Maximise & restore',
        title: 'Maximise a group, then restore',
        aliases: [
            'focus',
            'maximis',
            'maximiz',
            'fullscreen',
            'full screen',
            'zoom',
            'expand',
        ],
        caption: ['Focus', 'maximise, then restore'],
        order: 30,
        needsBase: true,
        async run({ wait, movie }) {
            await movie('highlight', 'chart');
            await wait(440);
            await movie('maximize', 'chart');
            await wait(2800);
            await movie('exitMax');
            await movie('highlight', null);
            await wait(900);
        },
    },

    // ---- Analytics: cycle the colourful chart tabs (lines / bars / donut) ----
    analytics: {
        id: 'analytics',
        tag: 'Live charts',
        title: 'Any chart in any panel',
        aliases: [
            'analytics',
            'charts',
            'chart types',
            'dashboard',
            'graphs',
            'bar chart',
            'line chart',
            'donut',
            'pie',
            'visualis',
            'visualiz',
        ],
        caption: ['Any content', 'real panels in every view'],
        order: 34,
        needsBase: true,
        async run(ctx) {
            const { page, dir, wait, movie } = ctx;
            await movie('activate', 'perf');
            await movie('maximize', 'perf');
            await wait(1700);
            // Glide across the analytics tabs so each distinct panel shows.
            for (const [id, label] of [
                ['flow', 'Vol Surface'],
                ['nodes', 'Alerts'],
                ['perf', 'Signals'],
            ]) {
                await dir.move({
                    to: { selector: `.dv-tab:has-text("${label}")` },
                    duration: 520,
                });
                await dir.click({ hold: 70 });
                await movie('activate', id);
                await wait(1500);
            }
            await movie('exitMaxGroup', 'perf');
            await wait(800);
        },
    },

    // ---- Tab groups: colour + label a set of tabs, collapse, rename ----
    tabGroups: {
        id: 'tabGroups',
        tag: 'Tab groups',
        title: 'Group tabs with colour chips',
        aliases: [
            'tab group',
            'tabgroup',
            'tab groups',
            'chip',
            'colour tab',
            'color tab',
            'group tab',
        ],
        caption: ['Tab groups', 'colour, collapse and rename'],
        order: 40,
        needsBase: true,
        async run(ctx) {
            const { page, dir, wait, movie } = ctx;
            await movie('addTabs', 'term', [
                { id: 'tg_news', title: 'News', kind: 'terminal' },
                { id: 'tg_alerts', title: 'Alerts', kind: 'terminal' },
                { id: 'tg_risk', title: 'Risk', kind: 'terminal' },
            ]);
            await movie('activate', 'term');
            // Push the camera in on the console group so the small chip feature
            // reads large, with the rest of the desk kept as soft context.
            await movie('zoomTo', 'term', 0.96);
            await wait(1350); // let the pan settle before chip interactions
            await movie('tabGroup', 'term', 'Monitoring', 'blue', [
                'tg_news',
                'tg_alerts',
                'tg_risk',
            ]);
            await wait(1100);
            // Collapse, then expand the chip.
            await dir.move({ to: { selector: '.dv-tab-group-chip' }, duration: 560 });
            await dir.click({ hold: 70 });
            await wait(1100);
            await dir.click({ hold: 70 });
            await wait(900);
            // Rename via the chip context menu.
            await dir.move({ to: { selector: '.dv-tab-group-chip' }, duration: 520 });
            await dir.click({ button: 'right', hold: 85 });
            await page
                .locator('.dv-context-menu-rename')
                .first()
                .waitFor({ state: 'visible', timeout: 4000 });
            await wait(520);
            await dir.click({
                to: { selector: '.dv-context-menu-rename' },
                duration: 420,
                hold: 70,
            });
            await wait(320);
            await page
                .locator('.dv-context-menu-rename-input')
                .first()
                .fill('Risk Desk');
            await wait(600);
            await page.keyboard.press('Enter');
            await wait(1200);
            await movie('zoomReset');
            await wait(400);
            await movie('closeTabs', ['tg_news', 'tg_alerts', 'tg_risk']);
            await wait(700);
        },
    },

    // ---- Pinned tabs: keep key tabs anchored ----
    pinnedTabs: {
        id: 'pinnedTabs',
        tag: 'Pinned tabs',
        title: 'Pin tabs so they stay put',
        aliases: ['pin', 'pinned', 'pinned tab', 'anchor tab'],
        caption: ['Pinned tabs', 'keep the essentials in reach'],
        order: 45,
        needsBase: true,
        async run(ctx) {
            const { wait, movie } = ctx;
            await movie('addTabs', 'term', [
                { id: 'pt_a', title: 'Overview', kind: 'terminal' },
                { id: 'pt_b', title: 'Signals', kind: 'terminal' },
                { id: 'pt_c', title: 'Latency', kind: 'terminal' },
            ]);
            await movie('activate', 'term');
            await movie('maximize', 'term');
            await wait(900);
            await movie('pin', 'term');
            await wait(700);
            await movie('pin', 'pt_a');
            await wait(1400);
            await movie('exitMaxGroup', 'term');
            await movie('closeTabs', ['pt_a', 'pt_b', 'pt_c']);
            await wait(700);
        },
    },

    // ---- Header anywhere: move the tab header to any edge ----
    headerPosition: {
        id: 'headerPosition',
        tag: 'Header anywhere',
        title: 'Put the tab header on any edge',
        aliases: [
            'header',
            'header position',
            'tab position',
            'tabs on',
            'header anywhere',
        ],
        caption: ['Header anywhere', 'top · right · bottom · left'],
        order: 50,
        needsBase: true,
        async run(ctx) {
            const { wait, movie } = ctx;
            await movie('activate', 'term');
            await movie('maximize', 'term');
            await wait(800);
            await movie('headerPos', 'term', 'right');
            await wait(1150);
            await movie('headerPos', 'term', 'bottom');
            await wait(1150);
            await movie('headerPos', 'term', 'left');
            await wait(1150);
            await movie('headerPos', 'term', 'top');
            await wait(800);
            await movie('exitMaxGroup', 'term');
            await wait(700);
        },
    },

    // ---- Multi-row tabs: overflow wraps to rows ----
    multiRowTabs: {
        id: 'multiRowTabs',
        tag: 'Multi-row tabs',
        title: 'Wrap overflowing tabs to rows',
        aliases: [
            'multi row',
            'multi-row',
            'multirow',
            'wrap',
            'overflow',
            'many tabs',
            'row of tabs',
        ],
        caption: ['Multi-row tabs', 'overflow wraps to rows'],
        order: 55,
        needsBase: true,
        async run(ctx) {
            const { wait, movie } = ctx;
            const extra = [
                'Order Flow', 'P&L', 'Compliance', 'Depth', 'Signals',
                'Latency', 'Execution', 'Wires', 'Exposure', 'Greeks',
                'Volatility', 'Liquidity', 'Momentum', 'Spreads', 'Fills',
                'VWAP', 'Options', 'Futures', 'Swaps', 'Bonds',
            ].map((t, i) => ({ id: 'mr' + i, title: t, kind: 'terminal' }));
            await movie('activate', 'term');
            await movie('maximize', 'term');
            await wait(700);
            await movie('addTabs', 'term', extra);
            await wait(900);
            await movie('wrap', true);
            await wait(2300);
            await movie('wrap', false);
            await movie('closeTabs', extra.map((e) => e.id));
            await movie('exitMaxGroup', 'term');
            await wait(700);
        },
    },

    // ---- Edge groups: dock a tool window to a container edge ----
    edgeGroups: {
        id: 'edgeGroups',
        tag: 'Edge docking',
        title: 'Dock tool windows to an edge',
        aliases: [
            'edge group',
            'edge',
            'dock to edge',
            'tool window',
            'inspector',
            'sidebar',
        ],
        caption: ['Dock to any edge', 'edge-anchored tool windows'],
        order: 60,
        needsBase: true,
        async run(ctx) {
            const { wait, movie } = ctx;
            await movie('addEdge', 'right', { id: 'inspector', initialSize: 300 }, [
                { id: 'insp', title: 'Inspector', kind: 'positions' },
                { id: 'props', title: 'Properties', kind: 'terminal' },
            ]);
            await wait(700);
            await movie('cameraTo', '.dv-edge-group', 0.62, 0.12);
            await wait(1600);
            await movie('cameraReset');
            await wait(900);
        },
    },

    // ---- Auto-hide: collapse an edge group to a strip, click to peek ----
    autoHide: {
        id: 'autoHide',
        tag: 'Auto-hide',
        title: 'Auto-hide an edge group',
        aliases: ['auto hide', 'auto-hide', 'autohide', 'peek', 'collapse edge'],
        caption: ['Auto-hide', 'collapse to a strip · click to peek'],
        order: 65,
        needsBase: true,
        async run(ctx) {
            const { page, dir, wait, movie } = ctx;
            // Ensure there's an edge group to auto-hide.
            if (!(await page.locator('.dv-edge-group').count())) {
                await movie('addEdge', 'right', { id: 'inspector', initialSize: 300 }, [
                    { id: 'insp', title: 'Inspector', kind: 'positions' },
                    { id: 'props', title: 'Properties', kind: 'terminal' },
                ]);
                await wait(700);
            }
            await movie('autoHideEdge', 'right');
            await wait(1200);
            const t = page.locator('.dv-edge-group .dv-tab').first();
            const tb = await t.boundingBox();
            if (tb) {
                await dir.move({
                    to: {
                        x: Math.round(tb.x + tb.width / 2),
                        y: Math.round(tb.y + tb.height / 2),
                    },
                    duration: 500,
                });
                await dir.click({ hold: 80 });
            }
            await wait(1900);
            await movie('peekEdge', 'right', false);
            await wait(800);
        },
    },

    // ---- Empty state: a branded watermark for empty groups ----
    emptyState: {
        id: 'emptyState',
        tag: 'Empty states',
        title: 'Branded empty-group watermark',
        aliases: ['empty', 'watermark', 'placeholder', 'empty state', 'empty group'],
        caption: ['Empty states', 'branded watermarks for empty groups'],
        order: 70,
        needsBase: true,
        async run(ctx) {
            const { wait, movie } = ctx;
            await movie('addEmpty', 'nodes', 'right');
            await wait(1900);
        },
    },

    // ---- Nested: a floating window is itself a full dockview ----
    nested: {
        id: 'nested',
        tag: 'Nested groups',
        title: 'Groups all the way down',
        aliases: [
            'nested',
            'nesting',
            'groups all the way down',
            'dockview inside',
            'full dockview',
        ],
        caption: ['Groups all the way down', 'a floating window is a full dockview'],
        order: 35,
        needsBase: true,
        async run(ctx) {
            const { dir, wait, movie, size } = ctx;
            const W = size.width;
            const H = size.height;
            await movie('nestedFloat');
            await wait(700);
            await dir.drag({
                from: { selector: '.dv-floating-titlebar' },
                waypoints: [{ x: Math.round(W * 0.44), y: Math.round(H * 0.42) }],
                duration: 900,
            });
            await wait(500);
            await movie('cameraTo', '.dv-resize-container', 0.72);
            await wait(2000);
            await movie('cameraReset');
            await wait(700);
            await movie('closeNested');
            await wait(700);
        },
    },

    // ---- Popout: pop a group out to a second monitor ----
    popout: {
        id: 'popout',
        tag: 'Multi-monitor',
        title: 'Pop out to a second monitor',
        aliases: [
            'popout',
            'pop out',
            'pop-out',
            'second monitor',
            'any monitor',
            'multi monitor',
            'multi-monitor',
            'new window',
            'second screen',
        ],
        caption: ['Any monitor', 'pop out to a second screen'],
        order: 80,
        needsBase: true,
        async run({ wait, movie }) {
            // Draw the eye, then let the group visibly lift and sail off the
            // right edge — leaving the main viewport before it reappears on a
            // second screen.
            await movie('highlight', 'chart');
            await wait(500);
            await movie('flyOut', 'chart', 'chart', 'BTC/USD');
            await wait(1150);
            await movie('highlight', null);
            await movie('dualMonitor', true);
            await wait(1250);
            await movie('popout', 'chart', 'BTC/USD');
            await wait(2200);
            await movie('dualMonitor', false);
            await movie('endFly');
            await wait(1000);
        },
    },

    // ---- Theming: morph across themes ----
    theming: {
        id: 'theming',
        tag: 'Theming',
        title: 'Themeable to your brand',
        aliases: [
            'theme',
            'theming',
            'themes',
            'colour scheme',
            'color scheme',
            'brand',
            'dark mode',
            'light mode',
            'styling',
            'style',
        ],
        caption: ['Yours', 'themeable to your brand'],
        order: 90,
        needsBase: true,
        async run({ wait, movie }) {
            await movie('theme', 'dracula');
            await wait(1500);
            await movie('theme', 'nord');
            await wait(1500);
            await movie('theme', 'light');
            await wait(1500);
            await movie('theme', 'dark');
            await wait(1400);
            await movie('theme', 'abyss');
            await wait(1100);
        },
    },
};

/** All beats as an ordered array. */
export const beatList = Object.values(beats).sort((a, b) => a.order - b.order);
