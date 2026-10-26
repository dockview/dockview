// Cookie-consent banner and analytics gate for the docs site.
//
// This mirrors the enterprise licensing app (src/components/consent-manager.tsx
// in the dockview-licencing repo) so both apps share one consent decision
// across dockview.dev. The consent cookie name (dv_cc), domain (dockview.dev),
// categories and revision must stay identical on both sides; otherwise a
// visitor would be asked once per app instead of once per domain. The region a
// decision was taken in is kept in the cookie's `data` field, so the other app
// must merge into `data` rather than overwrite it.
//
// Google Analytics is gated on consent, and only in production, matching the
// shared privacy policy at /enterprise/privacy. This replaces the old
// fire-on-load gtag plugin that ran unconditionally in CI. The consent plugin
// itself initialises in every environment (the banner only shows in
// production) so the footer "Cookie settings" control also works in local
// development.
//
// The gate is applied by region. Visitors in the EEA, the UK and Switzerland
// get the opt-in banner: nothing is loaded until they accept. Everywhere else
// analytics is on by default and the footer "Cookie settings" control is the
// opt-out. See resolveRegime() for how a region is worked out and decide() for
// what happens when a returning visitor's region has changed.

import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
import 'vanilla-cookieconsent/dist/cookieconsent.css';

const GA_MEASUREMENT_ID = 'G-KXGC1C9ZHC';

let gaLoaded = false;
let analyticsAllowed = false;

// Inject gtag.js and initialise the GA4 property. Idempotent, so repeated
// consent callbacks are harmless.
function loadGoogleAnalytics() {
    if (gaLoaded) return;
    gaLoaded = true;

    window.dataLayer = window.dataLayer || [];
    // gtag.js recognises a command by the pushed value being an `arguments`
    // object; anything else, including a plain array, is treated as a
    // data-layer variable merge. A rest-parameter version therefore pushes
    // `['config', 'G-...']` as data and the config command never runs, so the
    // property receives nothing. Keep this a normal function that pushes
    // `arguments`, exactly as Google's snippet does.
    function gtag() {
        window.dataLayer.push(arguments);
    }
    window.gtag = gtag;

    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID);

    const script = document.createElement('script');
    script.async = true;
    script.src =
        'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    document.head.appendChild(script);
}

// Opt-in territories: the EU27 plus the rest of the EEA (Iceland,
// Liechtenstein, Norway), the UK and Switzerland. Extend this list rather than
// the logic if another territory needs the same treatment.
const STRICT_COUNTRIES = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
    'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
    'SI', 'ES', 'SE',
    'IS', 'LI', 'NO',
    'GB', 'CH',
]);

// EEA timezones that do not live under Europe/.
const STRICT_TIMEZONES = new Set([
    'Atlantic/Reykjavik',
    'Atlantic/Canary',
    'Atlantic/Madeira',
    'Atlantic/Azores',
    'Asia/Nicosia',
    'Asia/Famagusta',
]);

// Same-origin, so this only returns a country if dockview.dev is served
// through Cloudflare. It is deliberately not a third-party geolocation call:
// asking someone else for the visitor's location before the visitor has
// consented to anything would be a strange way to run a consent gate.
const GEO_TRACE_URL = '/cdn-cgi/trace';
const GEO_TIMEOUT_MS = 1500;
const GEO_SESSION_KEY = 'dv_geo_country';

// The visitor's own clock. No network, no third party, and unlike an IP
// address it is not changed by a VPN, so someone in Berlin on a US exit node
// is still treated as being in Berlin. Returns undefined when there is no
// signal at all.
function timezoneLooksStrict() {
    let timezone;
    try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
        return undefined;
    }
    if (!timezone) return undefined;
    // Europe/ covers more than the EEA (Europe/Moscow, Europe/Istanbul), which
    // only means a few extra people see a banner they did not have to.
    return timezone.startsWith('Europe/') || STRICT_TIMEZONES.has(timezone);
}

// One lookup per browsing session, cached so travel between sessions is still
// picked up. Returns a country code, or null when there is no signal.
async function detectCountry() {
    try {
        const cached = sessionStorage.getItem(GEO_SESSION_KEY);
        if (cached) return cached === 'none' ? null : cached;
    } catch (e) {
        // Private mode or storage disabled. Fall through and just ask.
    }

    let country = null;
    const controller =
        typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
        ? setTimeout(() => controller.abort(), GEO_TIMEOUT_MS)
        : null;

    try {
        const response = await fetch(GEO_TRACE_URL, {
            signal: controller ? controller.signal : undefined,
            cache: 'no-store',
            credentials: 'omit',
        });
        if (response.ok) {
            const match = /^loc=([A-Z]{2})$/m.exec(await response.text());
            if (match) country = match[1];
        }
    } catch (e) {
        // Timed out, blocked, offline, or not behind Cloudflare. No signal.
    } finally {
        if (timer) clearTimeout(timer);
    }

    try {
        sessionStorage.setItem(GEO_SESSION_KEY, country || 'none');
    } catch (e) {
        // Nothing to do; we just repeat the lookup next page load.
    }

    return country;
}

// 'strict' means opt-in: no analytics until the visitor accepts.
// A visitor is treated as strict if either signal says so, so the answer is
// only 'relaxed' when nothing suggests otherwise.
async function resolveRegime() {
    const timezoneStrict = timezoneLooksStrict();

    // Already strict, so skip the request entirely. Most EEA visitors never
    // cause a network call.
    if (timezoneStrict === true) return 'strict';

    const country = await detectCountry();
    if (country) {
        return STRICT_COUNTRIES.has(country) ? 'strict' : 'relaxed';
    }

    // No country and no usable clock: assume the rules apply.
    return timezoneStrict === false ? 'relaxed' : 'strict';
}

let started = false;

function initConsent() {
    import('vanilla-cookieconsent').then((CookieConsent) => {
        const host = window.location.hostname;
        // Share the decision across dockview.dev and its subdomains in prod;
        // fall back to a host-only cookie on localhost or preview hosts.
        const cookieDomain =
            host === 'dockview.dev' || host.endsWith('.dockview.dev')
                ? 'dockview.dev'
                : host;

        // cookieconsent fires onConsent during run() whenever a valid decision
        // is already stored, which is earlier than the region check can finish.
        // That is fine for a decision the visitor made themselves, but an
        // implied acceptance has to wait: it is only valid while they are
        // somewhere that allows it, and that is what we are still checking.
        const priorState = () => {
            try {
                return CookieConsent.validConsent()
                    ? CookieConsent.getCookie('data') || {}
                    : null;
            } catch (e) {
                return null;
            }
        };

        let regionChecked = false;
        const canLoadNow = () => {
            if (regionChecked) return true;
            const prior = priorState();
            return !!(prior && prior.regime === 'strict' && !prior.implied);
        };

        const syncAnalytics = () => {
            analyticsAllowed =
                CookieConsent.acceptedCategory('analytics') &&
                process.env.NODE_ENV === 'production';

            if (analyticsAllowed && canLoadNow()) {
                loadGoogleAnalytics();
            } else if (gaLoaded && typeof window.gtag === 'function') {
                // Consent was withdrawn after gtag.js was injected. The script
                // cannot be removed from the page, so tell it to stop using
                // storage; onRouteDidUpdate below stops reporting too.
                window.gtag('consent', 'update', {
                    analytics_storage: 'denied',
                });
            }
        };

        // Record which regime a decision was taken under, and whether the
        // visitor actually took it. `implied` marks the relaxed-region default,
        // which is the only state decide() is allowed to overturn later.
        const stamp = (regime, implied) => {
            try {
                CookieConsent.setCookieData({
                    mode: 'update',
                    value: { regime, implied },
                });
            } catch (e) {
                console.error('[consent] could not record region', e);
            }
        };

        // Set while decide() applies a region default through the plugin, so
        // recordDecision() can tell that apart from the visitor choosing.
        let applyingDefault = false;
        let currentRegime = null;

        // Anything chosen through the banner or the preferences modal is a
        // real decision. Stamping it here covers the first-time visitor who
        // accepts from the banner, and stops a choice made in a relaxed region
        // from being treated as the region default once they move.
        const recordDecision = () => {
            if (applyingDefault || !currentRegime) return;
            if (!priorState()) return;
            stamp(currentRegime, false);
        };

        const decide = (regime) => {
            currentRegime = regime;
            const prior = priorState();

            if (!prior) {
                if (regime === 'strict') {
                    // Nothing is stored yet, so there is no cookie to stamp.
                    // recordDecision() records the region if they accept.
                    CookieConsent.show(true);
                } else {
                    applyingDefault = true;
                    CookieConsent.acceptCategory('all');
                    applyingDefault = false;
                    stamp(regime, true);
                }
                return;
            }

            if (prior.regime === regime) return;

            if (regime === 'strict' && prior.implied) {
                // Analytics was only ever on because the visitor was somewhere
                // that allows it by default. That cannot follow them into a
                // territory that requires opt-in, so withdraw it and ask.
                // acceptCategory([]) keeps only the necessary category, which
                // fires onChange and clears the _ga* cookies.
                applyingDefault = true;
                CookieConsent.acceptCategory([]);
                applyingDefault = false;
                stamp(regime, false);
                CookieConsent.show(true);
                return;
            }

            // Everything left is a decision the visitor made themselves. It
            // travels with them in both directions: an explicit rejection is
            // never quietly upgraded because they moved somewhere with looser
            // rules, and an explicit acceptance is not thrown away because
            // they moved somewhere stricter.
            stamp(regime, false);
        };

        // Docusaurus (react-helmet) rewrites the <html> class on render and
        // strips cookieconsent's show--consent / show--preferences classes, so
        // the modal never becomes visible. Mirror those classes onto <body>,
        // which Docusaurus leaves alone. cookieconsent's own CSS keys off any
        // ancestor of #cc-main, so this restores visibility without any style
        // duplication.
        const showClassFor = (modalName) =>
            modalName === 'preferencesModal'
                ? 'show--preferences'
                : 'show--consent';
        const mirrorShow = ({ modalName }) =>
            document.body.classList.add(showClassFor(modalName));
        const mirrorHide = ({ modalName }) =>
            document.body.classList.remove(showClassFor(modalName));

        // cookieconsent binds [data-cc] triggers with per-element listeners at
        // init time, so the footer "Cookie settings" button loses its handler
        // after a Docusaurus client-side navigation recreates it. Delegate from
        // the document so whichever button is currently mounted keeps working.
        document.addEventListener('click', (event) => {
            const trigger = event.target?.closest?.(
                '[data-cc="show-preferencesModal"]'
            );
            if (trigger) {
                event.preventDefault();
                CookieConsent.showPreferences();
            }
        });

        return CookieConsent.run({
            // decide() shows the banner, once the visitor's region is known.
            // In dev decide() never runs, so the plugin initialises (making
            // "Cookie settings" work) but stays silent.
            autoShow: false,
            guiOptions: {
                consentModal: { layout: 'box', position: 'bottom left' },
                preferencesModal: { layout: 'box' },
            },
            cookie: {
                name: 'dv_cc',
                domain: cookieDomain,
                expiresAfterDays: 182,
            },
            categories: {
                necessary: {
                    enabled: true,
                    readOnly: true,
                },
                analytics: {
                    enabled: false,
                    autoClear: {
                        cookies: [
                            { name: /^_ga/ }, // _ga and _ga_<container>
                            { name: '_gid' },
                            { name: '_gat' },
                        ],
                    },
                },
            },
            // Runs on first consent and on every load where analytics was
            // already accepted, then loads GA. Withdrawing fires onChange.
            onConsent: () => {
                syncAnalytics();
                recordDecision();
            },
            onChange: () => {
                syncAnalytics();
                recordDecision();
            },
            onModalShow: mirrorShow,
            onModalHide: mirrorHide,
            language: {
                default: 'en',
                translations: {
                    en: {
                        consentModal: {
                            title: 'We value your privacy',
                            description:
                                'We use strictly necessary cookies to run the site and to remember this choice. With your consent, we also use Google Analytics to measure how the site is used. See our <a href="/enterprise/privacy">privacy policy</a>.',
                            acceptAllBtn: 'Accept all',
                            acceptNecessaryBtn: 'Reject non-essential',
                            showPreferencesBtn: 'Manage preferences',
                        },
                        preferencesModal: {
                            title: 'Cookie preferences',
                            acceptAllBtn: 'Accept all',
                            acceptNecessaryBtn: 'Reject non-essential',
                            savePreferencesBtn: 'Save preferences',
                            closeIconLabel: 'Close',
                            sections: [
                                {
                                    title: 'Strictly necessary',
                                    description:
                                        'Required for the site to work, for example to remember your cookie choice. These cannot be switched off.',
                                    linkedCategory: 'necessary',
                                },
                                {
                                    title: 'Analytics',
                                    description:
                                        'Google Analytics helps us understand how visitors use the site so we can improve it. It is not loaded until you accept.',
                                    linkedCategory: 'analytics',
                                },
                                {
                                    title: 'More information',
                                    description:
                                        'For details on how we handle your data, see our <a href="/enterprise/privacy">privacy policy</a>.',
                                },
                            ],
                        },
                    },
                },
            },
        }).then(() => {
            // In development the plugin is initialised so that "Cookie
            // settings" works, but it never shows a banner on its own and
            // never loads GA, so there is nothing to decide.
            if (process.env.NODE_ENV !== 'production') return undefined;

            return resolveRegime().then((regime) => {
                decide(regime);
                // The region is settled, so anything still held back by
                // canLoadNow() can go ahead now.
                regionChecked = true;
                syncAnalytics();
            });
        });
    }).catch((e) => {
        console.error('[consent] cookieconsent failed to run', e);
    });
}

// gtag.js reports a page_view only for the document it was loaded into.
// Docusaurus is a single page app, so every in-site navigation after that is
// invisible to GA unless we report it ourselves. @docusaurus/plugin-google-gtag
// used to do this; it went away when analytics moved behind the consent gate.
export function onRouteDidUpdate({ location, previousLocation }) {
    if (!analyticsAllowed || typeof window.gtag !== 'function') return;
    if (!previousLocation) return;

    // A hash-only change is an anchor jump within the same page, not a view.
    if (
        location.pathname === previousLocation.pathname &&
        location.search === previousLocation.search
    ) {
        return;
    }

    // Let react-helmet apply the new <title> before we read it.
    setTimeout(() => {
        window.gtag('event', 'page_view', {
            page_title: document.title,
            page_location: window.location.href,
            page_path: location.pathname + location.search,
        });
    }, 0);
}

if (ExecutionEnvironment.canUseDOM && !started) {
    started = true;
    // Defer a couple of frames so the banner is initialised against a settled
    // DOM rather than mid-render. Deliberately not `load`: that waits for every
    // sub-resource, and doc pages embed <CodeRunner> iframes, which delays the
    // banner and the first page_view by seconds on exactly the pages that carry
    // the most traffic. Hydration timing no longer matters here because the
    // modal classes are mirrored onto <body> and the preferences trigger is
    // delegated from the document.
    const start = () =>
        requestAnimationFrame(() => requestAnimationFrame(initConsent));
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
}
