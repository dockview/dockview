/**
 * dockview-core performance harness.
 *
 * Drives the *built* UMD bundle in a real headless Chromium and measures the
 * hot paths that matter for a docking layout: the event Emitter, window-resize
 * relayout, and sash dragging. Reports JS wall time plus the real Chrome
 * timeline categories (Layout / Recalc-Style / GC) captured over CDP tracing.
 *
 * Usage:
 *   # build the bundle first
 *   yarn workspace dockview-core build:bundle
 *
 *   # single bundle — absolute numbers
 *   node scripts/bench/bench.mjs
 *   node scripts/bench/bench.mjs path/to/dockview-core.js
 *
 *   # A/B two bundles — prints the delta (e.g. base branch vs feature branch)
 *   node scripts/bench/bench.mjs base.js branch.js
 *
 * Env:
 *   DOCKVIEW_BENCH_CHROME   explicit Chromium executable (else Playwright's)
 *   DOCKVIEW_BENCH_GROUPS   dockview groups           (default 24)
 *   DOCKVIEW_BENCH_TABS     tabbed panels per group   (default 3)
 *   DOCKVIEW_BENCH_REPS     repetitions, median taken (default 5)
 *
 * See ./README.md for interpretation notes.
 */
import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DEFAULT_BUNDLE = join(
    REPO_ROOT,
    'packages/dockview-core/dist/dockview-core.js'
);

const GROUPS = Number(process.env.DOCKVIEW_BENCH_GROUPS ?? 24);
const TABS = Number(process.env.DOCKVIEW_BENCH_TABS ?? 3);
const REPS = Number(process.env.DOCKVIEW_BENCH_REPS ?? 5);
const RESIZE_ITERS = 2000;
const DRAG_ITERS = 1200;
const EMIT_FIRES = 5_000_000;

// ---------------------------------------------------------------------------
// In-page harness: build a real DockviewComponent and expose the workloads.
// Serialised to a string and evaluated in the browser, so it must be
// self-contained and reference only browser globals + the UMD global.
// ---------------------------------------------------------------------------
function pageHarness(groups, tabs) {
    const dv = window['dockview-core'];
    if (!dv) {
        throw new Error(
            'UMD global "dockview-core" not found — is this the styles bundle?'
        );
    }

    // (A) Emitter isolation — the real bundled DockviewEmitter.
    window.__emitterBench = (fires) => {
        const E = dv.DockviewEmitter;
        const measure = (listeners) => {
            const e = new E();
            let acc = 0;
            for (let i = 0; i < listeners; i++) {
                e.event((v) => (acc += v));
            }
            const t0 = performance.now();
            for (let i = 0; i < fires; i++) e.fire(i);
            const ms = performance.now() - t0;
            e.dispose();
            if (acc === Number.NEGATIVE_INFINITY) console.log(acc);
            return ms;
        };
        return { zero: measure(0), one: measure(1), two: measure(2) };
    };

    // (B) real DockviewComponent with tabbed groups.
    class Content {
        constructor(id) {
            this.id = id;
            this.element = document.createElement('div');
            this.element.textContent = id;
        }
        init() {}
        layout() {}
        update() {}
        dispose() {}
    }
    class Tab {
        constructor() {
            this.element = document.createElement('div');
        }
        init() {}
        update() {}
        dispose() {}
    }

    const host = document.getElementById('app');
    const api = dv.createDockview(host, {
        createComponent: (o) => new Content(o.id),
        createTabComponent: () => new Tab(),
    });
    api.layout(1600, 1000);

    let lead = null;
    for (let g = 0; g < groups; g++) {
        const leadId = `g${g}_t0`;
        api.addPanel(
            g === 0
                ? { id: leadId, component: 'default' }
                : {
                      id: leadId,
                      component: 'default',
                      position: {
                          referencePanel: lead,
                          direction: g % 2 === 0 ? 'right' : 'below',
                      },
                  }
        );
        for (let t = 1; t < tabs; t++) {
            api.addPanel({
                id: `g${g}_t${t}`,
                component: 'default',
                position: { referencePanel: leadId, direction: 'within' },
            });
        }
        lead = leadId;
    }
    api.layout(1600, 1000);
    window.__host = host;

    // Window-resize storm: oscillate the container, forcing a synchronous
    // reflow each frame by reading a geometry property (models the browser
    // laying out once per animation frame during a window drag).
    window.__resizeStorm = (iters) => {
        const t0 = performance.now();
        for (let i = 0; i < iters; i++) {
            api.layout(1200 + ((i * 37) % 700), 800 + ((i * 53) % 400));
            void host.offsetHeight;
        }
        return performance.now() - t0;
    };

    // Sash drag: dispatch a real pointer drag on a top-level group boundary.
    window.__sashDrag = (iters) => {
        const sash = host.querySelector('.dv-sash-container > .dv-sash');
        if (!sash) return -1;
        const rect = sash.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        sash.dispatchEvent(
            new PointerEvent('pointerdown', {
                bubbles: true,
                clientX: cx,
                clientY: cy,
                button: 0,
                pointerId: 1,
            })
        );
        const t0 = performance.now();
        for (let i = 0; i < iters; i++) {
            document.dispatchEvent(
                new PointerEvent('pointermove', {
                    bubbles: true,
                    clientX: cx + Math.sin(i / 9) * 120,
                    clientY: cy,
                    pointerId: 1,
                })
            );
            void host.offsetHeight;
        }
        const wall = performance.now() - t0;
        document.dispatchEvent(
            new PointerEvent('pointerup', {
                bubbles: true,
                clientX: cx,
                clientY: cy,
                pointerId: 1,
            })
        );
        return wall;
    };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function parseTrace(events) {
    let layoutUs = 0;
    let recalcUs = 0;
    let gcUs = 0;
    for (const e of events) {
        if (e.ph !== 'X' && e.ph !== 'complete') continue;
        const d = e.dur || 0;
        if (e.name === 'Layout') layoutUs += d;
        else if (e.name === 'UpdateLayoutTree' || e.name === 'RecalculateStyles')
            recalcUs += d;
        else if (
            e.name === 'MinorGC' ||
            e.name === 'MajorGC' ||
            e.name === 'V8.GCFinalizeMC' ||
            e.name === 'BlinkGC.AtomicPhase'
        )
            gcUs += d;
    }
    return {
        layoutMs: layoutUs / 1000,
        recalcMs: recalcUs / 1000,
        gcMs: gcUs / 1000,
    };
}

async function traced(page, client, which, iters) {
    const events = [];
    const onData = (p) => events.push(...p.value);
    client.on('Tracing.dataCollected', onData);
    await client.send('Tracing.start', {
        traceConfig: {
            includedCategories: [
                'devtools.timeline',
                'disabled-by-default-devtools.timeline',
            ],
        },
        transferMode: 'ReportEvents',
    });
    const wallMs = await page.evaluate(
        ({ which, iters }) =>
            which === 'resize'
                ? window.__resizeStorm(iters)
                : window.__sashDrag(iters),
        { which, iters }
    );
    await new Promise((res) => {
        client.once('Tracing.tracingComplete', res);
        client.send('Tracing.end');
    });
    client.off('Tracing.dataCollected', onData);
    return { wallMs, ...parseTrace(events) };
}

async function benchBundle(bundlePath) {
    const source = readFileSync(bundlePath, 'utf8');
    const browser = await chromium.launch({
        executablePath: process.env.DOCKVIEW_BENCH_CHROME || undefined,
        args: ['--no-sandbox'],
    });
    const runs = { emit: [], resize: [], drag: [] };
    try {
        for (let rep = 0; rep < REPS; rep++) {
            const page = await browser.newPage();
            await page.setContent(
                '<!doctype html><html><body><div id="app" style="position:absolute;inset:0"></div></body></html>'
            );
            await page.addScriptTag({ content: source });
            await page.evaluate(`(${pageHarness})(${GROUPS}, ${TABS})`);
            const client = await page.context().newCDPSession(page);
            await page.evaluate((n) => window.__resizeStorm(n), 300); // warmup
            runs.emit.push(
                await page.evaluate((n) => window.__emitterBench(n), EMIT_FIRES)
            );
            runs.resize.push(await traced(page, client, 'resize', RESIZE_ITERS));
            runs.drag.push(await traced(page, client, 'drag', DRAG_ITERS));
            await client.detach();
            await page.close();
        }
    } finally {
        await browser.close();
    }
    const summarize = (list) => {
        const keys = Object.keys(list[0]);
        const out = {};
        for (const k of keys) out[k] = median(list.map((r) => r[k]));
        return out;
    };
    return {
        emit: summarize(runs.emit),
        resize: summarize(runs.resize),
        drag: summarize(runs.drag),
    };
}

const ms = (n) => `${n.toFixed(1)}ms`.padStart(11);
const delta = (base, next) => {
    if (base === 0) return 'n/a'.padStart(9);
    const sign = base >= next ? '-' : '+';
    return `${sign}${Math.abs(((base - next) / base) * 100).toFixed(1)}%`.padStart(9);
};

function reportSingle(name, r) {
    console.log(`\n== ${name} ==`);
    console.log(
        `Emitter.fire (${EMIT_FIRES.toLocaleString()} fires): ` +
            `0 listeners ${ms(r.emit.zero)}  1 listener ${ms(r.emit.one)}  2 listeners ${ms(r.emit.two)}`
    );
    for (const [wl, label] of [
        ['resize', `window-resize (${RESIZE_ITERS} relayouts)`],
        ['drag', `sash drag (${DRAG_ITERS} moves)`],
    ]) {
        const m = r[wl];
        console.log(
            `${label}: wall ${ms(m.wallMs)}  layout ${ms(m.layoutMs)}  recalc ${ms(m.recalcMs)}  gc ${ms(m.gcMs)}`
        );
    }
}

function reportAB(a, b) {
    console.log(
        `\ndockview-core bench — ${GROUPS} groups / ${GROUPS * TABS} panels, median of ${REPS}\n`
    );
    console.log(
        'Emitter.fire       base       branch     change'
    );
    for (const [k, label] of [
        ['zero', '0 listeners'],
        ['one', '1 listener'],
        ['two', '2 listeners'],
    ]) {
        console.log(
            '  ' +
                label.padEnd(14) +
                ms(a.emit[k]) +
                ms(b.emit[k]) +
                delta(a.emit[k], b.emit[k])
        );
    }
    for (const [wl, label] of [
        ['resize', `WINDOW-RESIZE (${RESIZE_ITERS} relayouts)`],
        ['drag', `SASH DRAG (${DRAG_ITERS} moves)`],
    ]) {
        console.log(`\n${label}\n  metric        base       branch     change`);
        for (const k of ['wallMs', 'layoutMs', 'recalcMs', 'gcMs']) {
            console.log(
                '  ' +
                    k.padEnd(12) +
                    ms(a[wl][k]) +
                    ms(b[wl][k]) +
                    delta(a[wl][k], b[wl][k])
            );
        }
    }
    console.log(
        '\nwall = JS time incl. forced reflow; layout/recalc/gc = Chrome timeline totals.'
    );
}

async function main() {
    const args = process.argv.slice(2);
    const bundles = args.length ? args : [DEFAULT_BUNDLE];
    for (const b of bundles) {
        if (!existsSync(b)) {
            console.error(
                `bundle not found: ${b}\n` +
                    'build it first: yarn workspace dockview-core build:bundle'
            );
            process.exit(1);
        }
    }

    if (bundles.length === 1) {
        reportSingle(bundles[0], await benchBundle(bundles[0]));
    } else {
        const [a, b] = [
            await benchBundle(bundles[0]),
            await benchBundle(bundles[1]),
        ];
        reportAB(a, b);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
