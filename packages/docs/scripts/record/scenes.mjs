// @ts-check
/**
 * Scene manifest for the demo-clip recorder (see ./recordClips.mjs).
 *
 * A scene is pure data:
 *   {
 *     id,                 // clip filename (<id>.mp4) and --scene selector
 *     url,                // path (served from --server) or absolute URL
 *     theme?,             // applied to /demo-style pages via ?theme=
 *     size?,              // 'WxH' override, else --size / 1280x720
 *     cropSelector?,      // element to crop to when --crop is passed
 *     hideCss?,           // CSS injected after load to hide chrome/watermarks
 *     settle?, tail?,     // ms to wait after load / after the last step
 *     steps: [ ... ]      // choreography, executed in order
 *   }
 *
 * Step actions (all coordinates in CSS px; motion is eased automatically):
 *   { action: 'move',  to, duration? }
 *   { action: 'click', to?, modifiers?, hold? }
 *   { action: 'drag',  from, to|waypoints[], axis?('x'|'y'), modifiers?, approach?, grab?, hold?, duration?, dwell?, settle? }
 *     (drags move in a straight line; `axis` locks the other axis to the grab
 *      point — use it for sash resizes so there's no cross-axis drift)
 *   { action: 'pause', ms }
 *   { action: 'key',   press }
 *
 * A `target` (to / from) is one of:
 *   { selector, nth?, edge?, inset? }   // edge: center|north|south|east|west
 *   { x, y }                            // absolute viewport coordinates
 *
 * IMPORTANT: only *pointer-driven* gestures record reliably — floating-group
 * moves (`.dv-floating-titlebar`) and sash resizes (`.dv-sash`). Cross-group tab
 * docking uses native HTML5 drag-and-drop, which a synthetic mouse cannot drive.
 */

export const scenes = [
    // -----------------------------------------------------------------------
    // The marketing "moneyshot" — a ~45s trading-desk capability reel driven by
    // a storyboard against the full-screen movie harness. 1080p, no crop.
    // -----------------------------------------------------------------------
    {
        id: 'moneyshot',
        url: 'harness://movie.html',
        size: '1920x1080',
        storyboard: 'trading-moneyshot',
        settle: 300,
        tail: 400,
    },
    {
        id: 'capabilities',
        url: 'harness://movie.html',
        size: '1920x1080',
        storyboard: 'capabilities',
        settle: 300,
        tail: 400,
    },

    // -----------------------------------------------------------------------
    // Presentation-shell clips (standalone `harness://` HTML — NOT the docs
    // site). A titled, bordered window with fully controlled surroundings and
    // the docs licence key (no watermark). The stage fills the frame, so these
    // do NOT need --crop. NOTE: in this nested-container harness a synthetic
    // mouse reliably drives the floating-group drag + clicks, but NOT sash
    // resize or tab DnD (those need dockview's full-viewport mount — see the
    // `resize-panels` template scene for a working mouse-driven resize).
    // -----------------------------------------------------------------------
    {
        id: 'shell-floating',
        url: 'harness://?preset=floating&title=Floating%20panels%20in%20Dockview&subtitle=Drag%20a%20panel%20freely%20%E2%80%94%20then%20dock%20it%20back',
        theme: 'abyss',
        settle: 1200,
        tail: 900,
        steps: [
            {
                action: 'move',
                to: { selector: '.dv-floating-titlebar' },
                duration: 750,
            },
            { action: 'pause', ms: 350 },
            // One continuous drag that sails the float through several points
            // (it stays floating while held) and docks it on release.
            {
                action: 'drag',
                from: { selector: '.dv-floating-titlebar' },
                waypoints: [
                    { x: 470, y: 430 },
                    { x: 840, y: 300 },
                    { x: 300, y: 210 },
                ],
                duration: 900,
                dwell: 250,
            },
            { action: 'pause', ms: 700 },
        ],
    },
    {
        id: 'shell-dashboard',
        url: 'harness://?preset=dashboard&title=Build%20anything%20with%20Dockview&subtitle=Tabs%2C%20splits%2C%20floating%20panels%20%E2%80%94%20one%20layout%20engine&width=1060&height=600',
        theme: 'abyss',
        settle: 1500,
        tail: 900,
        steps: [
            // Reveal the chart tab.
            {
                action: 'move',
                to: { selector: '.dv-tab:has-text("Preview")' },
                duration: 650,
            },
            { action: 'click', hold: 70 },
            { action: 'pause', ms: 600 },
            // Sail the floating Notifications panel around.
            {
                action: 'move',
                to: { selector: '.dv-floating-titlebar' },
                duration: 600,
            },
            { action: 'pause', ms: 250 },
            {
                action: 'drag',
                from: { selector: '.dv-floating-titlebar' },
                waypoints: [
                    { x: 470, y: 470 },
                    { x: 760, y: 250 },
                    { x: 400, y: 360 },
                ],
                duration: 800,
                dwell: 220,
            },
            { action: 'pause', ms: 800 },
        ],
    },

    // -----------------------------------------------------------------------
    // Flagship: the polished trading demo. Float a tab out, sail it around,
    // then resize the layout.
    // -----------------------------------------------------------------------
    {
        id: 'demo-tour',
        url: '/demo?variant=desktop',
        theme: 'abyss',
        cropSelector: '[class*="dockview-theme"]',
        // Drop the "dockview — Unlicensed" watermark for a clean marketing clip.
        hideCss: '.dv-license-watermark { display: none !important; }',
        settle: 1400,
        tail: 700,
        steps: [
            { action: 'move', to: { selector: '.dv-tab', nth: 1 }, duration: 850 },
            { action: 'pause', ms: 450 },
            // Advertised demo gesture: Shift + click a tab to float it.
            {
                action: 'click',
                to: { selector: '.dv-tab', nth: 1 },
                modifiers: ['Shift'],
                hold: 90,
            },
            { action: 'pause', ms: 800 },
            {
                action: 'drag',
                from: { selector: '.dv-floating-titlebar' },
                to: { x: 840, y: 440 },
                approach: 650,
                duration: 1300,
            },
            { action: 'pause', ms: 450 },
            {
                action: 'drag',
                from: { selector: '.dv-floating-titlebar' },
                to: { x: 430, y: 250 },
                duration: 1150,
            },
            { action: 'pause', ms: 700 },
        ],
    },

    // -----------------------------------------------------------------------
    // Floating groups template — ships with a float on load. Drag it, then
    // nudge it toward another group so the smart guides / snapping show.
    // -----------------------------------------------------------------------
    {
        id: 'floating-groups',
        url: '/templates/dockview/floating-groups/typescript/index.html',
        cropSelector: '[class*="dockview-theme"]',
        settle: 1200,
        tail: 700,
        steps: [
            {
                action: 'move',
                to: { selector: '.dv-floating-titlebar' },
                duration: 700,
            },
            { action: 'pause', ms: 350 },
            {
                action: 'drag',
                from: { selector: '.dv-floating-titlebar' },
                to: { x: 900, y: 460 },
                duration: 1200,
            },
            { action: 'pause', ms: 400 },
            {
                action: 'drag',
                from: { selector: '.dv-floating-titlebar' },
                to: { x: 320, y: 200 },
                duration: 1150,
            },
            { action: 'pause', ms: 600 },
        ],
    },

    // -----------------------------------------------------------------------
    // Basic template — resize panels by dragging a sash. Always pointer-driven.
    // -----------------------------------------------------------------------
    {
        id: 'resize-panels',
        url: '/templates/dockview/basic/typescript/index.html',
        cropSelector: '[class*="dockview-theme"]',
        settle: 1000,
        tail: 600,
        steps: [
            { action: 'move', to: { selector: '.dv-sash', nth: 0 }, duration: 700 },
            { action: 'pause', ms: 350 },
            {
                action: 'drag',
                from: { selector: '.dv-sash', nth: 0 },
                to: { x: 400, y: 360 },
                axis: 'x',
                grab: 150,
                duration: 900,
            },
            { action: 'pause', ms: 300 },
            {
                action: 'drag',
                from: { selector: '.dv-sash', nth: 0 },
                to: { x: 760, y: 360 },
                axis: 'x',
                grab: 150,
                duration: 900,
            },
            { action: 'pause', ms: 600 },
        ],
    },
];
