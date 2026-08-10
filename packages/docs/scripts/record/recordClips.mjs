// @ts-check
/**
 * Automated demo-clip recorder / "director".
 *
 * Drives a real Chromium over the live docs dev server, moves the mouse on a
 * scripted, eased path (with a *synthetic* visible cursor, because Playwright's
 * real pointer is not captured in video), records the session, and converts the
 * result to an MP4 suitable for LinkedIn / forums.
 *
 * This is deliberately NOT a `playwright test` — it is a media tool. It reuses
 * the `playwright` browser API that ships with the repo's `@playwright/test`
 * devDependency (no new dependency) plus the system `ffmpeg` binary.
 *
 * Usage (dev server must be running: `yarn start`):
 *   yarn record-clips                      # all scenes
 *   yarn record-clips --scene demo-tour    # one scene
 *   yarn record-clips --scene demo-tour --crop --keep-webm
 *   yarn record-clips --url /demo?variant=desktop --scene demo-tour
 *
 * See ./README.md for the full flag list and how to add a scene.
 */

import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import {
    mkdirSync,
    rmSync,
    existsSync,
    renameSync,
    readFileSync,
} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenes } from './scenes.mjs';
import { storyboards } from './storyboards.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo root — the standalone harness loads the built UMD bundles from here by
// absolute path (mirrors the e2e fixture), served by our own static server.
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const HARNESS_DIR = '/packages/docs/scripts/record/harness';
const HARNESS_BUNDLES = [
    'packages/dockview/dist/dockview.js',
    'packages/dockview-enterprise/dist/dockview-enterprise.js',
    'packages/dockview-core/dist/styles/dockview.css',
];

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    /** @type {Record<string, string | boolean>} */
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
            out[key] = true;
        } else {
            out[key] = next;
            i++;
        }
    }
    return out;
}

const args = parseArgs(process.argv.slice(2));

const SERVER = String(args.server ?? 'http://localhost:3000').replace(/\/$/, '');
const OUT_DIR = String(args.out ?? path.join(__dirname, 'out'));
const DEFAULT_SIZE = parseSize(String(args.size ?? '1280x720'));
const THEME = args.theme ? String(args.theme) : undefined;
const CROP = Boolean(args.crop);
const KEEP_WEBM = Boolean(args['keep-webm']);
const HEADED = Boolean(args.headed);

// Motion speed multiplier (higher = faster). Travel durations are divided by
// this; deliberate pauses/settles are left alone.
const SPEED = Number(args.speed ?? 1.5);

// Static beat (seconds) kept before the choreography when trimming the head.
const LEAD_IN = 0.5;

function parseSize(s) {
    const m = /^(\d+)x(\d+)$/.exec(s);
    if (!m) throw new Error(`--size must look like 1280x720 (got "${s}")`);
    return { width: Number(m[1]), height: Number(m[2]) };
}

// ---------------------------------------------------------------------------
// Scene selection
// ---------------------------------------------------------------------------

function selectScenes() {
    const wanted = args.scene ? String(args.scene) : 'all';
    let list = wanted === 'all' ? scenes : scenes.filter((s) => s.id === wanted);
    if (list.length === 0) {
        const ids = scenes.map((s) => s.id).join(', ');
        throw new Error(`No scene matches "${wanted}". Available: ${ids}`);
    }
    // A one-off ad-hoc scene from --url (uses the first matched scene's steps
    // only when a single scene is targeted).
    if (args.url && list.length === 1) {
        list = [{ ...list[0], url: String(args.url) }];
    }
    return list;
}

// ---------------------------------------------------------------------------
// Synthetic cursor — injected before every navigation. It tracks Playwright's
// real (invisible) pointer via mousemove, so the choreography only has to drive
// `page.mouse.*` and the visible cursor follows for free.
// ---------------------------------------------------------------------------

const CURSOR_INIT_SCRIPT = `
(() => {
    const ID = '__dv_synthetic_cursor__';
    function install() {
        if (document.getElementById(ID)) return;
        const cursor = document.createElement('div');
        cursor.id = ID;
        Object.assign(cursor.style, {
            position: 'fixed',
            top: '0', left: '0',
            width: '22px', height: '22px',
            marginLeft: '-3px', marginTop: '-2px',
            pointerEvents: 'none',
            zIndex: '2147483647',
            transition: 'transform 40ms linear',
            willChange: 'transform',
            opacity: '0',
        });
        cursor.innerHTML =
            '<svg width="22" height="22" viewBox="0 0 24 24" ' +
            'style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">' +
            '<path d="M5 3l14 8-6 1.5L10 20 5 3z" fill="#fff" ' +
            'stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></svg>';
        document.body.appendChild(cursor);

        let ripple = null;
        const move = (x, y) => {
            cursor.style.opacity = '1';
            cursor.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        };
        document.addEventListener('mousemove', (e) => move(e.clientX, e.clientY), true);
        document.addEventListener('mousedown', (e) => {
            cursor.style.transform =
                'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(0.82)';
            ripple = document.createElement('div');
            Object.assign(ripple.style, {
                position: 'fixed',
                left: e.clientX + 'px', top: e.clientY + 'px',
                width: '10px', height: '10px', marginLeft: '-5px', marginTop: '-5px',
                border: '2px solid rgba(255,255,255,.9)', borderRadius: '50%',
                pointerEvents: 'none', zIndex: '2147483646',
                transition: 'transform 350ms ease-out, opacity 350ms ease-out',
            });
            document.body.appendChild(ripple);
            const r = ripple;
            requestAnimationFrame(() => {
                r.style.transform = 'scale(3.2)';
                r.style.opacity = '0';
            });
            setTimeout(() => r.remove(), 400);
        }, true);
        document.addEventListener('mouseup', (e) => {
            cursor.style.transform =
                'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(1)';
        }, true);
    }
    if (document.body) install();
    else document.addEventListener('DOMContentLoaded', install);
})();
`;

// ---------------------------------------------------------------------------
// Choreography engine
// ---------------------------------------------------------------------------

// Cubic ease-in-out — a stronger slow → fast → slow speed profile than quad,
// so the cursor accelerates off the mark and eases into its target.
const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Build a fresh choreographer bound to a page, tracking pointer position. */
function makeDirector(page, size) {
    let pointer = { x: Math.round(size.width / 2), y: Math.round(size.height / 2) };
    // Alternates the arc side each move so successive travels curve opposite
    // ways — reads as a relaxed human hand rather than a machine.
    let moveIndex = 0;

    async function resolve(target) {
        if (target && typeof target === 'object' && 'x' in target && 'y' in target) {
            return { x: target.x, y: target.y };
        }
        const { selector, nth = 0, edge = 'center', inset = 0.12 } = target;
        const loc = page.locator(selector).nth(nth);
        await loc.waitFor({ state: 'visible', timeout: 10_000 });
        const box = await loc.boundingBox();
        if (!box) throw new Error(`No bounding box for "${selector}" [${nth}]`);
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        switch (edge) {
            case 'east':
                return { x: box.x + box.width * (1 - inset), y: cy };
            case 'west':
                return { x: box.x + box.width * inset, y: cy };
            case 'north':
                return { x: cx, y: box.y + box.height * inset };
            case 'south':
                return { x: cx, y: box.y + box.height * (1 - inset) };
            default:
                return { x: cx, y: cy };
        }
    }

    // `arc` bows the path along a quadratic bézier for a natural hand-drawn
    // travel. Disable it for drags (`arc:false`) so a manipulation — e.g. a
    // sash resize — moves in a straight line with no cross-axis wobble.
    async function easeMove(to, duration = 700, { arc = true } = {}) {
        const from = { ...pointer };
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);
        const dur = Math.max(60, duration / SPEED);
        const steps = Math.max(10, Math.round(dur / 16));

        // Control point at the midpoint, pushed perpendicular to the straight
        // line. Offset scales with distance (capped) and flips side each move.
        const bow = arc ? Math.min(dist * 0.14, 90) * (moveIndex++ % 2 === 0 ? 1 : -1) : 0;
        const nx = dist > 0 ? -dy / dist : 0;
        const ny = dist > 0 ? dx / dist : 0;
        const cx = from.x + dx / 2 + nx * bow;
        const cy = from.y + dy / 2 + ny * bow;

        for (let i = 1; i <= steps; i++) {
            const s = easeInOutCubic(i / steps);
            const m = 1 - s;
            await page.mouse.move(
                m * m * from.x + 2 * m * s * cx + s * s * to.x,
                m * m * from.y + 2 * m * s * cy + s * s * to.y
            );
            await page.waitForTimeout(dur / steps);
        }
        pointer = { x: to.x, y: to.y };
    }

    async function withModifiers(modifiers, fn) {
        for (const m of modifiers) await page.keyboard.down(m);
        try {
            await fn();
        } finally {
            for (const m of modifiers.slice().reverse())
                await page.keyboard.up(m);
        }
    }

    return {
        async move(step) {
            await easeMove(await resolve(step.to), step.duration);
        },
        async click(step) {
            if (step.to) await easeMove(await resolve(step.to), step.duration);
            const button = step.button ?? 'left';
            const run = async () => {
                await page.mouse.down({ button });
                await page.waitForTimeout(step.hold ?? 60);
                await page.mouse.up({ button });
            };
            if (step.modifiers?.length) await withModifiers(step.modifiers, run);
            else await run();
        },
        async drag(step) {
            const from = await resolve(step.from);
            await easeMove(from, step.approach ?? 500);
            await page.waitForTimeout(step.grab ?? 200);
            // A single continuous press → move(s) → release. Pass `waypoints`
            // (a list of targets) to glide through several points WITHOUT
            // releasing — e.g. sailing a floating group around before it docks
            // on drop. `to` is shorthand for a single waypoint. `axis: 'x'|'y'`
            // locks the other axis to the grab point (clean sash resizes).
            const targets = step.waypoints ?? [step.to];
            const lock = (t) => {
                if (step.axis === 'x') return { x: t.x, y: from.y };
                if (step.axis === 'y') return { x: from.x, y: t.y };
                return t;
            };
            const run = async () => {
                await page.mouse.down();
                await page.waitForTimeout(step.hold ?? 140);
                // A tiny nudge first — many DnD backends need movement past a
                // threshold before a drag is recognised. Along the drag axis so
                // an axis-locked resize stays on its axis.
                const nudge = lock({ x: from.x + 4, y: from.y + 4 });
                await page.mouse.move(nudge.x, nudge.y);
                // Straight-line motion while held — no bézier bow, so there's no
                // cross-axis drift during a resize/dock drag.
                for (const t of targets) {
                    await easeMove(lock(await resolve(t)), step.duration ?? 1100, {
                        arc: false,
                    });
                    if (step.dwell) await page.waitForTimeout(step.dwell);
                }
                await page.waitForTimeout(step.settle ?? 260);
                await page.mouse.up();
            };
            if (step.modifiers?.length) await withModifiers(step.modifiers, run);
            else await run();
        },
        async pause(step) {
            await page.waitForTimeout(step.ms ?? 500);
        },
        async key(step) {
            await page.keyboard.press(step.press);
        },
    };
}

// ---------------------------------------------------------------------------
// Hide docs chrome that would clutter a marketing clip
// ---------------------------------------------------------------------------

async function hidePageChrome(page, scene) {
    // Inject a persistent *stylesheet* rule rather than inline styles — React
    // re-renders clobber an element's inline `style`, but a `!important`
    // stylesheet rule keyed on the class survives and also catches elements
    // (re)created later (e.g. dockview re-adds its watermark on new roots).
    await page.evaluate(() => {
        const rules = [];
        // The newsletter widget is site-wide chrome with a hashed CSS-module
        // class — resolve the class at runtime, then hide it by rule.
        for (const el of document.querySelectorAll('body *')) {
            if (
                getComputedStyle(el).position === 'fixed' &&
                /Newsletter/.test(el.textContent || '')
            ) {
                const cls = (el.className || '')
                    .split(/\s+/)
                    .filter(Boolean)[0];
                if (cls) rules.push(`.${CSS.escape(cls)}{display:none!important}`);
            }
        }
        if (rules.length) {
            const style = document.createElement('style');
            style.textContent = rules.join('\n');
            document.head.appendChild(style);
        }
    });
    if (scene.hideCss) {
        await page.addStyleTag({ content: scene.hideCss });
    }
}

// ---------------------------------------------------------------------------
// Recording a single scene
// ---------------------------------------------------------------------------

const isHarnessScene = (scene) => scene.url.startsWith('harness://');

function buildUrl(scene, harnessBase) {
    let url = scene.url;
    if (isHarnessScene(scene)) {
        // harness://[file.html][?query] -> <static-server>/…/harness/<file>?query
        const rest = url.slice('harness://'.length);
        const qIdx = rest.indexOf('?');
        const file = (qIdx === -1 ? rest : rest.slice(0, qIdx)) || 'index.html';
        const query = qIdx === -1 ? '' : rest.slice(qIdx + 1);
        url = `${harnessBase}${HARNESS_DIR}/${file}${query ? '?' + query : ''}`;
    } else if (!/^https?:\/\//.test(url)) {
        url = SERVER + (url.startsWith('/') ? '' : '/') + url;
    }
    // Apply the theme param for pages that read ?theme= (harness, /demo).
    const theme = THEME ?? scene.theme;
    const themeable =
        isHarnessScene(scene) || url.includes('/demo') || url.includes('/record');
    if (theme && themeable) {
        const u = new URL(url);
        u.searchParams.set('theme', theme);
        if (url.includes('/demo') && !u.searchParams.has('variant')) {
            u.searchParams.set('variant', 'desktop');
        }
        url = u.toString();
    }
    return url;
}

async function recordScene(browser, scene, harnessBase) {
    const size = scene.size ? parseSize(scene.size) : DEFAULT_SIZE;
    const tmpDir = path.join(OUT_DIR, '.tmp', scene.id);
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });

    const context = await browser.newContext({
        viewport: size,
        deviceScaleFactor: 1,
        recordVideo: { dir: tmpDir, size },
    });
    await context.addInitScript(CURSOR_INIT_SCRIPT);

    const page = await context.newPage();
    // Video recording begins with the page; remember wall-clock zero so we can
    // trim the dead "loading" head (Docusaurus compiles a route on first hit).
    const videoT0 = Date.now();
    const url = buildUrl(scene, harnessBase);
    console.log(`\n▶ ${scene.id}\n  ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });

    const director = makeDirector(page, size);

    if (scene.storyboard) {
        // Cinematic movie scene: the storyboard builds the layout itself, so
        // wait for the movie harness to signal readiness (no dockview yet).
        await page.waitForFunction(() => window.__movieReady, {
            timeout: 15_000,
        });
        await page.waitForTimeout(scene.settle ?? 300);
        const headSeconds = Math.max(0, (Date.now() - videoT0) / 1000 - LEAD_IN);

        const fn = storyboards[scene.storyboard];
        if (!fn) throw new Error(`Unknown storyboard "${scene.storyboard}"`);
        await fn({
            page,
            dir: director,
            size,
            wait: (ms) => page.waitForTimeout(ms),
            // Invoke a window.__movie method in the page.
            movie: (name, ...args) =>
                page.evaluate(
                    ({ name, args }) => window.__movie[name](...args),
                    { name, args }
                ),
        });
        await page.waitForTimeout(scene.tail ?? 600);
        return await finishScene(scene, page, context, headSeconds, null);
    }

    // Wait for dockview to be present, then let it settle / animate in.
    await page
        .locator('.dv-groupview')
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(scene.settle ?? 1200);

    // Strip docs chrome that would clutter a marketing clip. The newsletter
    // widget uses a hashed CSS-module class, so hide it by its text; anything
    // else is scene-specific via `hideCss`.
    await hidePageChrome(page, scene);

    // Everything up to here is dead air — record where the choreography starts
    // so ffmpeg can drop the head.
    const headSeconds = Math.max(0, (Date.now() - videoT0) / 1000 - LEAD_IN);

    // Capture the crop rectangle before any teardown.
    let cropBox = null;
    if (CROP && scene.cropSelector) {
        cropBox = await page.locator(scene.cropSelector).first().boundingBox();
    }

    for (const step of scene.steps) {
        const fn = director[step.action];
        if (!fn) throw new Error(`Unknown step action "${step.action}"`);
        await fn(step);
    }
    await page.waitForTimeout(scene.tail ?? 600);

    return await finishScene(scene, page, context, headSeconds, cropBox);
}

// Finalise the recording: close the context (writes the .webm), transcode to
// MP4 (trimming the dead head, optional crop), tidy up.
async function finishScene(scene, page, context, headSeconds, cropBox) {
    const tmpDir = path.join(OUT_DIR, '.tmp', scene.id);
    const video = page.video();
    await context.close(); // finalises the .webm
    const webmPath = video ? await video.path() : null;
    if (!webmPath || !existsSync(webmPath)) {
        throw new Error(`No video produced for scene "${scene.id}"`);
    }

    const stableWebm = path.join(OUT_DIR, `${scene.id}.webm`);
    renameSync(webmPath, stableWebm);
    rmSync(tmpDir, { recursive: true, force: true });

    const mp4Path = path.join(OUT_DIR, `${scene.id}.mp4`);
    toMp4(stableWebm, mp4Path, cropBox, headSeconds);
    if (!KEEP_WEBM) rmSync(stableWebm, { force: true });

    console.log(`  ✓ ${path.relative(process.cwd(), mp4Path)}`);
    return mp4Path;
}

// ---------------------------------------------------------------------------
// ffmpeg post-processing
// ---------------------------------------------------------------------------

function toMp4(input, output, cropBox, trimStart = 0) {
    const even = (n) => Math.round(n) - (Math.round(n) % 2);
    const filters = [];
    if (cropBox) {
        const w = even(cropBox.width);
        const h = even(cropBox.height);
        const x = even(cropBox.x);
        const y = even(cropBox.y);
        filters.push(`crop=${w}:${h}:${x}:${y}`);
    }
    // Guarantee even dimensions for yuv420p.
    filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');

    const cmProbeArgs = [
        '-y',
        ...(trimStart > 0.05 ? ['-ss', trimStart.toFixed(2)] : []),
        '-i', input,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-vf', filters.join(','),
        '-an',
        output,
    ];
    const res = spawnSync('ffmpeg', cmProbeArgs, { stdio: 'inherit' });
    if (res.status !== 0) {
        throw new Error(
            `ffmpeg failed (exit ${res.status}). Is ffmpeg installed and on PATH?`
        );
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// A zero-dependency static file server rooted at the repo root, so the
// standalone harness can load the built bundles by absolute path. Only started
// when a `harness://` scene is recorded.
function startStaticServer(root) {
    const TYPES = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.map': 'application/json',
        '.svg': 'image/svg+xml',
    };
    const server = http.createServer((req, res) => {
        try {
            const urlPath = decodeURIComponent(req.url.split('?')[0]);
            const filePath = path.join(root, urlPath);
            if (!filePath.startsWith(root)) {
                res.writeHead(403);
                res.end();
                return;
            }
            const data = readFileSync(filePath);
            res.writeHead(200, {
                'content-type':
                    TYPES[path.extname(filePath)] || 'application/octet-stream',
            });
            res.end(data);
        } catch {
            res.writeHead(404);
            res.end('not found');
        }
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () =>
            resolve({
                base: `http://127.0.0.1:${server.address().port}`,
                close: () => new Promise((r) => server.close(r)),
            })
        );
    });
}

function assertBundlesBuilt() {
    const missing = HARNESS_BUNDLES.filter(
        (f) => !existsSync(path.join(REPO_ROOT, f))
    );
    if (missing.length) {
        console.error(
            `\n✗ Missing built bundles the harness needs:\n` +
                missing.map((f) => `    ${f}`).join('\n') +
                `\n\n  Build them once:\n\n` +
                `    yarn nx run-many -t build:bundle -p dockview dockview-enterprise\n`
        );
        process.exit(1);
    }
}

async function assertServerUp() {
    try {
        const res = await fetch(SERVER, { method: 'GET' });
        if (!res.ok && res.status >= 500) throw new Error(`status ${res.status}`);
    } catch (err) {
        console.error(
            `\n✗ Cannot reach the docs server at ${SERVER}.\n` +
                `  Start it first in another terminal:\n\n` +
                `    cd packages/docs && yarn start\n\n` +
                `  (or pass --server <baseURL>).\n`
        );
        process.exit(1);
    }
}

async function main() {
    const list = selectScenes();
    const needsHarness = list.some(isHarnessScene);
    const needsDocsServer = list.some((s) => !isHarnessScene(s));

    // Standalone-harness scenes are self-served from the repo root and only need
    // the built bundles; only the /demo and /templates scenes need `yarn start`.
    if (needsHarness) assertBundlesBuilt();
    if (needsDocsServer) await assertServerUp();

    mkdirSync(OUT_DIR, { recursive: true });

    const harness = needsHarness ? await startStaticServer(REPO_ROOT) : null;
    const browser = await chromium.launch({ headless: !HEADED });
    const made = [];
    try {
        for (const scene of list) {
            made.push(await recordScene(browser, scene, harness?.base));
        }
    } finally {
        await browser.close();
        if (harness) await harness.close();
    }

    console.log(`\nDone. ${made.length} clip(s) in ${OUT_DIR}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
