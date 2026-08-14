/**
 * Automated portion of the DV-85 spike: drives headless Chromium through the
 * Window Management API paths that ARE reachable without a real display.
 *
 * Verified findings this script demonstrates (Chromium 141):
 *  - The API is [SecureContext]-gated: about:blank probes report it absent.
 *    Serve over http://127.0.0.1 (a trustworthy origin) or https.
 *  - `--screen-info={WxH}{WxH^X,Y}` style flags give headless Chromium
 *    MULTIPLE virtual screens: screen.isExtended === true and
 *    getScreenDetails() enumerates them. Screen ENUMERATION is CI-testable.
 *  - Playwright's `grantPermissions` does not know 'window-management'
 *    (as of 1.62) and CDP `Browser.grantPermissions`/`Browser.setPermission`
 *    silently miss pages living in a NON-DEFAULT browser context. Recipe
 *    that works: `launchPersistentContext` (the default context) + CDP
 *    `Browser.setPermission({permission:{name:'window-management'}, ...})`.
 *  - With the grant in place, getScreenDetails() resolves; without it the
 *    promise HANGS forever in headless (the prompt that nobody can answer) —
 *    always wrap probes in a timeout race.
 *  - Headless has no real window manager: window.open positions are
 *    synthetic (cross-screen coordinates clamp arbitrarily) and the
 *    `fullscreen` window feature is inert. Real placement/fullscreen
 *    behaviour stays on the manual tier (window-management-harness.html on
 *    a 2-monitor machine).
 *
 * Run: npm i playwright-core && node playwright-probe.js [path-to-chromium]
 */
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXECUTABLE =
    process.argv[2] ??
    process.env.CHROMIUM_PATH ??
    '/opt/pw-browsers/chromium';
const PORT = 8127;
const ORIGIN = `http://127.0.0.1:${PORT}`;

async function main() {
    const server = http.createServer((req, res) => {
        res.setHeader('content-type', 'text/html');
        res.end('<!doctype html><title>probe</title><body>probe</body>');
    });
    await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dv-spike-'));
    const context = await chromium.launchPersistentContext(profile, {
        executablePath: EXECUTABLE,
        headless: true,
        args: [
            '--no-proxy-server',
            // Two virtual screens: primary at 0,0 plus 1600x900 at 1920,0.
            '--screen-info={0,0 1920x1080}{1920,0 1600x900}',
        ],
        timeout: 30000,
    });

    let failures = 0;
    const check = (name, ok, detail) => {
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
        if (!ok) failures += 1;
    };

    try {
        const page = context.pages()[0] ?? (await context.newPage());
        await page.goto(`${ORIGIN}/`, { timeout: 15000 });

        check(
            'secure context on 127.0.0.1',
            await page.evaluate(() => window.isSecureContext)
        );
        check(
            'getScreenDetails exposed',
            (await page.evaluate(() => typeof window.getScreenDetails)) ===
                'function'
        );

        const cdp = await context.newCDPSession(page);
        await cdp.send('Browser.setPermission', {
            permission: { name: 'window-management' },
            setting: 'granted',
            origin: ORIGIN,
        });
        const state = await page.evaluate(async () =>
            (await navigator.permissions.query({ name: 'window-management' }))
                .state
        );
        check('CDP Browser.setPermission lands', state === 'granted', state);

        const details = await page.evaluate(() =>
            Promise.race([
                window.getScreenDetails().then(
                    (d) => ({
                        isExtended: window.screen.isExtended,
                        screens: d.screens.map((s) => ({
                            left: s.left,
                            top: s.top,
                            width: s.width,
                            height: s.height,
                        })),
                    }),
                    (err) => ({ error: `${err.name}: ${err.message}` })
                ),
                new Promise((resolve) =>
                    setTimeout(() => resolve({ timedOut: true }), 5000)
                ),
            ])
        );
        check(
            'multi-screen enumeration via --screen-info',
            !!details.screens && details.screens.length === 2 && details.isExtended === true,
            JSON.stringify(details)
        );

        const a1 = await page.evaluate(() => {
            // The no-await rule (design doc §4.1): kick off details and open
            // in the SAME synchronous task.
            const pending = window.getScreenDetails();
            const child = window.open(
                '/',
                'dv-a1',
                'left=100,top=100,width=300,height=200'
            );
            return pending.then((d) => ({
                opened: !!child,
                screens: d.screens.length,
            }));
        });
        check(
            'A1 (granted): sync getScreenDetails+window.open not blocked',
            a1.opened === true && a1.screens === 2,
            JSON.stringify(a1)
        );

        console.log(
            '\nNOT covered here (manual tier, real 2-monitor machine): ' +
                'A1 in prompt state, A2 fullscreen popups, A3 OS-level ' +
                'cross-screen placement/clamping.'
        );
    } finally {
        await context.close();
        server.close();
        fs.rmSync(profile, { recursive: true, force: true });
    }

    process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error('probe crashed:', err);
    process.exit(1);
});
