# Proposal: True Multi‑Window Support (Chrome Window Management API)

> Status: **Proposal / plan** — no runtime behaviour changed by this document.
> Scope: `dockview-core` (with thin re‑exports through the framework wrappers).
> Reference: [`michaelwasserman/window-placement-demo`](https://github.com/michaelwasserman/window-placement-demo)
> and the [Window Management API](https://developer.mozilla.org/en-US/docs/Web/API/Window_Management_API).

---

## 1. Goal

Bring dockview's popout windows up to "true multi‑window" behaviour on browsers
that implement the **Window Management API** (Chromium 100+): enumerate the
user's physical screens, place popout groups precisely on a chosen screen
(including screens other than the one hosting the main window), open a popout
_fullscreen_ on a target screen, and keep everything correct as the display
topology changes (a monitor is unplugged, resolution changes, the window is
dragged to another screen).

This is **additive and progressively enhanced**: on browsers without the API
(Firefox, Safari, older Chromium, or when the `window-management` permission is
denied) dockview must behave exactly as it does today.

## 2. What the reference demo does

The window‑placement‑demo exercises the whole API surface. The primitives we
care about:

| Primitive | API | Notes |
|---|---|---|
| Feature detect | `window.screen.isExtended` | `true` when >1 screen; also gated by permission |
| Permission | `navigator.permissions.query({ name: 'window-management' })` | states: `granted` / `prompt` / `denied`. Older Chromium only knows the legacy name `'window-placement'` and throws `TypeError` for the new one — query with a try/fallback |
| Enumerate screens | `const details = await window.getScreenDetails()` | needs **transient activation only while permission is in `prompt` state**; once `granted` it may be called without a gesture (e.g. at startup for restore). Rejects with `NotAllowedError` when denied |
| Fullscreen popup | `window.open(url, name, 'popup,fullscreen,left=…,top=…')` | newer Chromium (132+): opens the popup *directly* fullscreen on the screen containing `left/top`; requires permission already granted |
| Screen list | `details.screens: ScreenDetailed[]`, `details.currentScreen` | each has `availLeft/availTop/availWidth/availHeight`, `left/top/width/height`, `isPrimary`, `isInternal`, `label`, `devicePixelRatio` |
| Cross‑screen placement | `window.open(url, name, 'left=…,top=…,width=…,height=…')` | coordinates are in the **multi‑screen coordinate space** — negative/large values land on other monitors |
| Fullscreen on a screen | `element.requestFullscreen({ screen: screenDetailed })` | opens fullscreen on a _specific_ display; **requires transient activation in the calling window** |
| Topology changes | `details.addEventListener('screenschange', …)` (screen added/removed), `details.addEventListener('currentscreenchange', …)`, and per‑screen `screen.addEventListener('change', …)` | fired on hotplug / resolution / arrangement changes |

The demo's core loop is: request `getScreenDetails()` once (behind a gesture),
cache the `ScreenDetails` object, read `screens` to render a picker, and on
`screenschange` re‑read the list and re‑place / re‑clamp windows.

## 3. Where dockview is today

Dockview **already has multi‑window popouts** — this proposal extends them, it
does not introduce windows from scratch. The existing machinery:

- **`packages/dockview-core/src/popoutWindow.ts`** — `PopoutWindow` wraps a
  single `window.open(url, target, features)` call. The `features` string is
  built from a `Box` (`top/left/width/height`) at
  `popoutWindow.ts:100‑112`. It moves a container `<div>` into the new
  document on `load`, copies stylesheets (`addStyles`), and tears down on
  `beforeunload`. `dimensions()` reads back `screenX/screenY/innerWidth/innerHeight`.
- **`packages/dockview-core/src/dockview/popoutWindowService.ts`** —
  `PopoutWindowService` tracks **many** open popout windows (`entries:
  PopoutGroupEntry[]`), each hosting its **own nested `Gridview`**, overlay
  render container, drop‑target container and `PopupService`. It handles
  serialization (`serialize()`), restoration scheduling, and a per‑realm
  `ResizeObserver` (`observeGridviewSize`).
- **`packages/dockview-core/src/dockview/dockviewComponent.ts`** —
  `addPopoutGroup(item, options)` (public entry at `:1825`, implementation at
  `:1855+`). Today the placement `Box` is computed from the source element's
  `getBoundingClientRect()` offset by `window.screenX/screenY`
  (`dockviewComponent.ts:1902‑1909`) — i.e. it is already expressed in global
  screen coordinates, but with **no awareness of _which_ screen** or of the
  available bounds of any screen. Group `location` becomes
  `{ type: 'popout', getWindow, popoutUrl }` (`:2106`).
- **Public API** — `packages/dockview-core/src/api/component.api.ts`:
  `api.addPopoutGroup(item, options)` (`:1182`), `api.getPopouts()` (`:841`),
  and events `onDidAddPopoutGroup` / `onDidRemovePopoutGroup` /
  `onDidPopoutGroupPositionChange` / `onDidPopoutGroupSizeChange` /
  `onDidOpenPopoutWindowFail`. The component also exposes
  `getPopoutWindows(): Window[]` (`dockviewComponent.ts:1849`), the narrow
  surface accessibility services use to mirror per‑window state — the natural
  place a screen‑aware layer reads live `Window` handles.
- **Options type** — `DockviewPopoutGroupOptions` (`dockviewComponent.ts:175`):
  `{ position?: Box; popoutUrl?; onDidOpen?; onWillClose? }`.

**Single choke point.** `PopoutWindow.open()` (`popoutWindow.ts:92`) is the
**only** production `window.open` call site, and the placement `Box` is computed
one level up in `_doAddPopoutGroup.getBox()` (`dockviewComponent.ts:1892`).
Those two spots are the entire surface area for injecting screen‑aware
placement. Content is transferred by a raw cross‑document `appendChild` +
stylesheet cloning (no iframe/`adoptNode`), and each popout already owns a
realm‑scoped `ResizeObserver`, `OverlayRenderContainer`,
`DropTargetAnchorContainer` and `PopupService` — so per‑window state to hang
screen info off already exists in `PopoutGroupEntry`.

**Gap analysis** — none of the following exist today:

1. No screen enumeration or `getScreenDetails()` usage anywhere
   (`grep` for `getScreenDetails|window-management|isExtended|requestFullscreen`
   → 0 hits in `packages/`).
2. `addPopoutGroup` cannot target a specific screen; the `Box` is always
   relative to the main window's current screen origin.
3. No fullscreen‑on‑screen capability.
4. No reaction to `screenschange` — popouts left on an unplugged monitor become
   inaccessible (off‑screen), and dockview never re‑clamps them.
5. No permission handling and no way for a consumer to discover the screen list.

## 4. Design

Introduce one new core service and extend the popout path to consume it. Keep
all Window‑Management calls behind a single façade so the rest of the codebase
never touches `getScreenDetails()` directly and testing is a matter of mocking
one object.

### 4.1 New service: `ScreenManager` (façade over the Window Management API)

New file `packages/dockview-core/src/dockview/screenManager.ts`, wired in as a
module like `PopoutWindowModule` (`popoutWindowService.ts:281`). Concretely,
the module system requires three touches:

- a new optional slot `screenManagerService?: IScreenManager` in
  `ServiceCollection` (`modules.ts:36`) — `defineModule`'s `serviceKey` is
  typed against this collection;
- `ScreenManagerModule` appended to the built‑in list in
  `src/dockview/allModules.ts:18` (components can still be constructed with a
  module subset in tests, so all consuming code must `?.`‑chain the slot);
- the **topology subscription lives in the module's `init()` hook**
  (`modules.ts:69`) — per the codebase convention, "the module owns its own
  reactivity": `init()` subscribes `onDidChangeScreens` → re‑clamp popouts
  (§4.4) and returns the disposable, rather than `DockviewComponent`
  subscribing in its constructor.

Per the `assertModule` conventions (`modules.ts:229‑253`): `api.getScreens()`
is a *command* → guard with `assertModule` (logs once if the module was
excluded); `hasWindowManagement` and `onDidChangeScreens` are *queries* →
silent fallbacks (`false` / never‑firing event).

**TypeScript note**: `getScreenDetails`, `ScreenDetails`, `ScreenDetailed` and
`Screen.isExtended` are **not in `lib.dom.d.ts`**, and dockview‑core has zero
runtime/type dependencies — so ship minimal ambient declarations in a new
`src/types/windowManagement.d.ts` (interface `ScreenDetailed extends Screen`,
`Window.getScreenDetails?`, etc.) rather than adding a types package.

```ts
export interface DockviewScreen {
    readonly id: string;          // stable-ish key derived from label+bounds
    readonly label: string;
    readonly isPrimary: boolean;
    readonly isInternal: boolean;
    readonly isCurrent: boolean;
    readonly bounds: Box;         // left/top/width/height (full)
    readonly workArea: Box;       // availLeft/availTop/availWidth/availHeight
    readonly devicePixelRatio: number;
    /** Underlying ScreenDetailed, when available (undefined in fallback mode). */
    readonly native?: ScreenDetailed;
}

export interface IScreenManager extends IDisposable {
    /** Feature + permission probe; never throws. */
    readonly isSupported: boolean;
    permissionState(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'>;

    /** Requests details (prompts — and so needs transient activation — only
     *  while permission is in the 'prompt' state); caches the ScreenDetails
     *  and starts listening for topology changes. Resolves to a
     *  single-screen fallback list when unsupported/denied. */
    getScreens(): Promise<DockviewScreen[]>;

    /** Synchronous snapshot of the last-known screens (may be a fallback). */
    readonly screens: readonly DockviewScreen[];
    readonly currentScreen: DockviewScreen | undefined;

    readonly onDidChangeScreens: Event<DockviewScreen[]>;

    /** Compute a placement Box for a popout on `screen`, given a desired size
     *  and anchoring rule ('center' | 'fill' | Box). Clamps to workArea. */
    placementFor(
        screen: DockviewScreen,
        request: ScreenPlacement
    ): Box;
}
```

Behaviour:

- **Feature detection** — `isSupported = typeof window.getScreenDetails ===
  'function'`. When false, `getScreens()` returns a **single synthetic
  `DockviewScreen`** built from `window.screen` (`availLeft/availWidth/…`) so
  callers have a uniform shape.
- **Permission probing** — `permissionState()` queries
  `{ name: 'window-management' }` and, on `TypeError` (older Chromium),
  retries with the legacy `{ name: 'window-placement' }`. Subscribe to the
  returned `PermissionStatus.onchange` so a later grant/revoke updates the
  snapshot without another prompt.
- **Lazy, permission‑aware** — `getScreenDetails()` needs transient activation
  only while permission is in the `prompt` state; once **granted** it may be
  called without a gesture. So: on construction, *query the permission only*
  (queries never prompt); if it is already `granted`, populate the screens
  snapshot eagerly (this is what makes gesture‑less paths like `fromJSON`
  restore screen‑aware). If it is `prompt`, defer the first
  `getScreenDetails()` to a consumer gesture (`api.getScreens()` from a click
  handler). Cache the returned `ScreenDetails` object thereafter.
- **Never await a prompt between gesture and `window.open`** — transient
  activation does not survive the user answering a permission prompt, so a
  popout opened *after* an awaited first‑time `getScreenDetails()` would be
  popup‑blocked. `addPopoutGroup({ screen })` therefore consumes only the
  **synchronous cached snapshot**: if screens are already known, place
  directly; if not, kick off `getScreenDetails()` and call `window.open` in
  the **same synchronous task** (no `await` in between — the prompt resolves
  asynchronously) at the fallback position, then, once details resolve, move
  the window to the target screen with `win.moveTo()/resizeTo()`
  (cross‑screen `moveTo` is permitted once the permission is granted).
  Document that consumers wanting first‑open precision should call
  `api.getScreens()` in an earlier gesture to pre‑grant.
- **Topology tracking** — after the first successful `getScreenDetails()`,
  attach `screenschange` / `currentscreenchange` listeners (and per‑screen
  `change`) via `addDisposableListener`, rebuild the `DockviewScreen[]`
  snapshot, and fire `onDidChangeScreens`. All listeners live on the service's
  `CompositeDisposable`.
- **Coordinate mapping** — `placementFor` translates a `ScreenPlacement`
  request into the multi‑screen `Box` window.open expects, clamped to the
  screen's `workArea` so a window can never open with its titlebar off the
  usable area.

### 4.2 Extend the popout options

Extend `DockviewPopoutGroupOptions` (`dockviewComponent.ts:175`) —
**backwards‑compatible, all new fields optional**:

Three new optional fields: `screen?: DockviewScreenTarget`,
`placement?: ScreenPlacement`, `fullscreen?: boolean` — full interface and type
definitions in §4.5.

`DockviewScreenTarget` semantics: `'current'` = the screen hosting the main
window; `'primary'` = `isPrimary`; a `number` indexes `api.screens` (out of
range → fallback + one‑time warning); a `DockviewScreen` object is matched by
identity against the current snapshot (stale object → re‑resolve by `id`, else
fallback).

Resolution order in `addPopoutGroup`'s `getBox()`
(`dockviewComponent.ts:1885‑1912`):

1. If `screen` is set **and** the screens snapshot is populated (which implies
   the permission is granted — without it Chromium *clamps* `window.open`
   coordinates to the current screen, so `isSupported` alone is not enough) →
   resolve the `DockviewScreen`, compute
   `box = placementFor(screen, placement ?? { type: 'center' })`.
2. If `screen` is set but the snapshot isn't ready → fall through to (3)/(4)
   for the initial open, then rehome via `moveTo/resizeTo` once
   `getScreens()` resolves (see §4.1's no‑await rule).
3. Else if `position` set → use it (today's behaviour).
4. Else → today's `getBoundingClientRect()`‑derived box.

### 4.3 Fullscreen support in `PopoutWindow`

A naive `requestFullscreen({ screen })` inside the popout's `load` handler
**does not work**: the Fullscreen API requires transient activation *in the
calling window*, and the user's gesture happened in the opener — it does not
propagate to the new window's load event, so the promise rejects.

Mechanism, in preference order (add `fullscreen?: boolean` to
`PopoutWindowOptions`, `popoutWindow.ts:6`):

1. **Fullscreen popup window feature** (newer Chromium, 132+, permission
   granted): append `popup,fullscreen` to the features string built at
   `popoutWindow.ts:100‑107`. The window opens *directly* fullscreen on the
   screen containing the `left/top` coordinates — no post‑open call needed.
   Capability‑probe by checking the permission is granted (there is no direct
   feature detect for a window feature; the fallback below covers rejection).
2. **Fallback**: open normally with `placement: { type: 'fill' }` (the
   screen's full work area) — visually close to fullscreen and universally
   supported. Optionally listen for the first user gesture *inside* the popout
   and upgrade via `requestFullscreen()` in that realm.

Either way, listen for `fullscreenchange` in the popout realm and trigger a
gridview relayout (the realm‑scoped `ResizeObserver` from
`observeGridviewSize` should catch it, but the explicit hook guards against
observer‑skip on fullscreen transitions).

### 4.4 React to display topology changes

`ScreenManagerModule`'s `init()` hook subscribes to
`screenManager.onDidChangeScreens` (see §4.1 — the module owns its own
reactivity) and, for each open popout (`popoutWindowService.entries`):

- If the popout's screen was **removed**, re‑place it onto the current/primary
  screen via `placementFor` and move it (`window.moveTo/resizeTo`).
- Otherwise **clamp** its box to the (possibly resized) screen's work area so it
  is never stranded off‑screen.
- Re‑emit through a new public event `onDidChangeScreens` on the component + API.

This is the single most valuable robustness win: today a popout on a monitor
that gets unplugged is simply lost.

> Note on move tracking: dockview currently detects a popout being dragged by
> **polling** `screenX/screenY` every `requestAnimationFrame`
> (`onDidWindowMoveEnd`, `dom.ts:452`) — there is no native move event. Beware:
> `currentscreenchange` fires on the `ScreenDetails` of the window that called
> `getScreenDetails()`, i.e. it tracks the **main window's** screen, not the
> popouts'. To know which screen a popout is on, compute geometric containment
> of `entry.window.dimensions()` (window centre point) against the cached
> screens snapshot inside the existing `onDidWindowMoveEnd` handler — no extra
> realm‑crossing `getScreenDetails()` call needed. Use that to enrich
> `onDidPopoutGroupPositionChange` with the resolved `DockviewScreen`.

### 4.5 Public API

All types exported from `dockview-core` (and re‑exported by the wrappers);
implementations ship per the packaging decision (§11). Naming follows the
existing conventions: `onDidX` event getters, `getX()` methods beside
`getWindow()` on the group API, commands `assertModule`‑guarded, queries
silent.

**Exported types:**

```ts
export interface DockviewScreen {
    readonly id: string;           // stable within a session; best-effort across
    readonly label: string;        // e.g. 'DELL U2720Q' — '' until permission granted
    readonly isPrimary: boolean;
    readonly isInternal: boolean;  // built-in laptop panel
    readonly isCurrent: boolean;   // hosts the main dockview window
    readonly bounds: Box;          // full bounds, multi-screen coordinate space
    readonly workArea: Box;        // bounds minus taskbars/docks
    readonly devicePixelRatio: number;
}

/** How to size/anchor a popout on its target screen. */
export type ScreenPlacement =
    | { type: 'center'; width?: number; height?: number }
    | { type: 'fill' }
    | { type: 'box'; box: Box };   // relative to the screen's workArea origin

/** Accepted anywhere a screen can be named. */
export type DockviewScreenTarget =
    | DockviewScreen               // from getScreens() / api.screens
    | 'primary'
    | 'current'
    | number;                      // index into api.screens

export type WindowManagementPermissionState =
    | 'granted' | 'prompt' | 'denied' | 'unsupported';

export interface DockviewScreensChangeEvent {
    readonly screens: readonly DockviewScreen[];
    readonly added: readonly DockviewScreen[];    // hotplugged this change
    readonly removed: readonly DockviewScreen[];  // unplugged this change
}
```

**`DockviewApi` (component level):**

```ts
interface DockviewApi {
    // --- queries: silent, safe without the module/API/permission ---

    /** True when the Window Management API exists AND the module is loaded. */
    readonly hasWindowManagement: boolean;

    /** Last-known snapshot; single synthetic screen until details resolve. */
    readonly screens: readonly DockviewScreen[];

    /** Where the permission stands; never prompts. */
    getWindowManagementPermission(): Promise<WindowManagementPermissionState>;

    /** Screen hotplug / resolution / arrangement changes. Never fires
     *  without the module + granted permission. */
    readonly onDidChangeScreens: Event<DockviewScreensChangeEvent>;

    // --- commands: assertModule-guarded ---

    /** Resolves the true screen list. Prompts when permission is 'prompt',
     *  so call from a user gesture (click handler). Resolves to the
     *  single-screen fallback when unsupported/denied. */
    getScreens(): Promise<DockviewScreen[]>;

    // --- existing method, extended options (see below) ---
    addPopoutGroup(
        item: IDockviewPanel | DockviewGroupPanel,
        options?: DockviewPopoutGroupOptions
    ): Promise<boolean>;
}
```

**`addPopoutGroup` options (extended, all new fields optional):**

```ts
export interface DockviewPopoutGroupOptions {
    position?: Box;                    // unchanged
    popoutUrl?: string;                // unchanged
    onDidOpen?: (event: { id: string; window: Window }) => void;
    onWillClose?: (event: { id: string; window: Window }) => void;

    /** Target screen. Without the module / API / permission: one deduped
     *  console error, then behaves as if unset. */
    screen?: DockviewScreenTarget;
    /** Sizing on the target screen. Default { type: 'center' } sized to the
     *  source element. Only meaningful with `screen`. */
    placement?: ScreenPlacement;
    /** Open fullscreen on the target screen (fullscreen window feature,
     *  falls back to filling the work area). */
    fullscreen?: boolean;
}
```

**`DockviewGroupPanelApi` (group level)** — sits beside the existing
`getWindow()` (`dockviewGroupPanelApi.ts:236`):

```ts
interface DockviewGroupPanelApi {
    /** The screen this group's window currently occupies (geometric
     *  containment of the window's centre against the snapshot).
     *  `undefined` until the snapshot is populated. Works for grid /
     *  floating groups too — they resolve to the main window's screen. */
    getScreen(): DockviewScreen | undefined;

    /** Move this popout window to another screen. Unlike opening, the
     *  window already exists, so this MAY await a first-time permission
     *  prompt safely (no popup blocker involved). Resolves false (with the
     *  usual deduped diagnostics) for non-popout groups, missing module,
     *  or denied permission. */
    moveToScreen(
        screen: DockviewScreenTarget,
        placement?: ScreenPlacement
    ): Promise<boolean>;

    /** Fullscreen toggle for a popout window. NOTE: requestFullscreen needs
     *  transient activation in the popout's own realm, so this only succeeds
     *  when called from an interaction inside that window (which is where
     *  panel content — and thus the consumer's click handlers — lives).
     *  Resolves false otherwise. */
    setFullscreen(value: boolean): Promise<boolean>;
    isFullscreen(): boolean;
}
```

**Enriched existing surfaces** (additive, optional fields):

```ts
// getPopouts() entries and position-change events learn their screen:
export interface PopoutGroup {
    readonly id: string;
    readonly group: DockviewGroupPanel;
    readonly window: Window;
    readonly screen?: DockviewScreen;          // NEW (undefined w/o snapshot)
}

export interface PopoutGroupChangePositionEvent {
    /* existing fields unchanged */
    readonly screen?: DockviewScreen;          // NEW
}
```

**Usage sketches:**

```ts
// 1. "Move to screen ▸" context menu (gesture → may prompt once)
const screens = await api.getScreens();
menu.items = screens.map((s) => ({
    label: s.label || (s.isPrimary ? 'Primary display' : 'Display'),
    checked: group.api.getScreen()?.id === s.id,
    onClick: () => group.api.moveToScreen(s),
}));

// 2. Open a panel popped-out and fullscreen on the first non-primary screen
await api.addPopoutGroup(panel, {
    screen: (await api.getScreens()).find((s) => !s.isPrimary) ?? 'current',
    fullscreen: true,
});

// 3. Feature-gate the UI
if (api.hasWindowManagement) {
    showMultiScreenControls();
}

// 4. React to a monitor being unplugged (rehoming is automatic; this is
//    for app-level UX like a toast)
api.onDidChangeScreens((e) => {
    if (e.removed.length > 0) {
        toast(`${e.removed[0].label || 'A display'} was disconnected`);
    }
});
```

Design notes:

- `getScreens()` (async, may prompt) vs `api.screens` (sync snapshot) mirrors
  the ScreenManager split in §4.1 and keeps the no‑await rule easy to follow:
  UI code awaits `getScreens()`; placement code reads `screens`.
- `moveToScreen` is deliberately **popout‑only** rather than "popout if
  needed": popping out has its own option set and failure modes
  (`addPopoutGroup({ screen })` covers that path), and an implicit
  grid→popout conversion on a mis‑targeted call would be surprising.
- `setFullscreen`'s realm constraint is documented rather than hidden because
  it is a hard platform rule; the common consumer pattern (a fullscreen button
  rendered inside the popped‑out panel) satisfies it naturally.
- Nothing here forces a prompt: every entry point degrades to today's
  behaviour, and only `getScreens()` / `moveToScreen()` /
  `addPopoutGroup({ screen })` — all gesture‑initiated consumer actions — can
  trigger one.

### 4.6 Host adapter for embedded runtimes (Electron etc.)

Dockview must not depend on Electron/Tauri — but embedded hosts have *better*
primitives than the web API, so the `ScreenManager` façade gets one injection
seam: a plain TypeScript interface the app can implement, with **no runtime
dependency in either direction**.

```ts
/** Implemented by the host app (e.g. over an Electron preload bridge).
 *  Everything optional degrades to the web-API path. */
export interface DockviewScreenAdapter {
    /** Replaces getScreenDetails() as the source of truth. */
    getScreens(): Promise<DockviewScreen[]> | DockviewScreen[];
    /** Replaces screenschange listening. Returns an unsubscribe. */
    subscribe?(listener: (screens: DockviewScreen[]) => void): () => void;
    /** Native window placement (e.g. BrowserWindow.setBounds via IPC).
     *  Falls back to win.moveTo/resizeTo when absent. */
    moveWindow?(window: Window, box: Box): boolean | Promise<boolean>;
    /** Native fullscreen (e.g. BrowserWindow.setFullScreen via IPC).
     *  Falls back to the web fullscreen path when absent. */
    setFullscreen?(window: Window, value: boolean): boolean | Promise<boolean>;
}
```

Wired as a component option (type lives in core; cost is one field):

```ts
interface DockviewComponentOptions {
    /* … */
    screenAdapter?: DockviewScreenAdapter;
}
```

`ScreenManager` resolves each capability through a **precedence chain**:
`adapter → Window Management API → single-screen fallback`. With an adapter
present there is no permission machinery at all — `hasWindowManagement` is
true, `getScreens()` never prompts, and the no‑await rule (§4.1) is moot
because the snapshot can be populated eagerly at startup.

**Why an Electron app would bother** (the web path *does* work there — the
renderer is Chromium and Electron grants permission requests by default):

- **Stable identity**: Electron's `Display.id` is stable across sessions,
  fixing the "screen labels aren't reliable restore keys" problem in §5
  outright — the adapter can surface it as `DockviewScreen.id`.
- **Native window control**: `BrowserWindow.setBounds` / `setFullScreen` via
  IPC are not subject to web clamping rules, work on frameless windows, and
  compose with app-owned window chrome.
- **Main-process events**: `screen.on('display-added'/'display-removed'/
  'display-metrics-changed')` is the same topology signal without renderer
  API coupling.

The app-side recipe (documentation, not dockview code): a preload script
exposes `getScreens`/`subscribe`/`moveWindow`/`setFullscreen` over
`contextBridge` + `ipcRenderer`, backed by the main-process `screen` module
and a `BrowserWindow` registry keyed by the popout's window name (dockview's
`window.open` target, which Electron surfaces in `setWindowOpenHandler` as
`details.frameName`). To let the handler recognise and style dockview popouts
(frameless, always‑on‑top, …), `addPopoutGroup` gains a pass‑through:

```ts
export interface DockviewPopoutGroupOptions {
    /* … */
    /** Extra window.open feature entries appended to the features string —
     *  e.g. { dockviewPopout: 1 } for an Electron setWindowOpenHandler to
     *  match on, or nonstandard features a host honours. */
    extraWindowFeatures?: Record<string, string | number | boolean>;
}
```

**Tauri (and other multi-webview hosts) — a different mechanism.** The
adapter can supply screens (`availableMonitors()`), but it cannot save the
popout mechanism itself: dockview popouts move live DOM nodes into the child
window, which requires `window.open` to return a **same-process, same-origin
`Window` with synchronous DOM access** — true in browsers and Electron, false
in Tauri, where each window is an isolated webview with its own JS context.
Making those hosts work requires intercepting the popout at a higher level —
that is §4.7's detached‑window protocol.

### 4.7 Popout interception

Two interception levels, both **strictly additive** — no existing option,
event payload, serialized shape, or the `DockviewGroupLocation` union
changes; every hook is a new optional field that, when absent, leaves
today's code path byte-for-byte identical.

#### Strategy A — window factory (same-document model preserved)

The cheap seam: let the host supply the `Window`, keep everything else.
`PopoutWindow.open()` (`popoutWindow.ts:112`) consults a factory before
falling back to `window.open`:

```ts
export interface PopoutWindowOpenRequest {
    readonly id: string;         // the window name dockview would pass to window.open
    readonly url: string;        // resolved same-origin popout url
    readonly box: Box;           // multi-screen coordinates
    readonly features: string;   // the features string dockview would use
    readonly screen?: DockviewScreen;
}

interface DockviewComponentOptions {
    /* … */
    /** Supply the popout Window yourself. Return null to signal "blocked"
     *  (dockview runs its existing blocked-popout recovery). The returned
     *  Window MUST be same-process and same-origin: dockview will drive its
     *  normal pipeline against it (load → move container → clone styles). */
    popoutWindowFactory?: (
        request: PopoutWindowOpenRequest
    ) => Window | null | Promise<Window | null>;
}
```

Because the contract is "hand me a same-origin `Window`", everything
downstream — DOM transfer, `addStyles`, `beforeunload` teardown, the nested
gridview, drag-and-drop between windows — keeps working untouched. `null`
routes into the existing `handleBlockedPopout` path, so failure handling is
already built. `assertSameOriginPopoutUrl` still guards the URL regardless of
who opens the window.

Who uses it: Electron apps that want creation to flow through their own
window logic; apps that pre-open or reuse windows; tests (today every popout
spec monkey-patches global `window.open` — the factory makes that injection
first-class).

#### Strategy B — detached-window protocol (multi-webview hosts)

For hosts where no same-origin `Window` can exist (Tauri, multi-webview
embedders), interception has to happen **above the DOM**: dockview hands the
host a *serialized* group and a placement, and the host owns the window. The
payload is `SerializedPopoutGroup` (`dockviewComponent.ts:220`) — the exact
shape popout serialization already writes (`data` for a single group, `grid`
for a nested layout), so nothing new needs inventing:

```ts
export interface DetachedWindowOpenRequest {
    readonly id: string;
    readonly state: SerializedPopoutGroup;  // panels as (component + params)
    readonly box: Box;
    readonly screen?: DockviewScreen;
}

export interface DetachedWindowHandle {
    /** Host → dockview: the external window closed. `state` (if given) is
     *  reabsorbed into the layout at the reference group, mirroring how a
     *  closing popout returns its group today. */
    readonly onDidClose: Event<{ state?: SerializedPopoutGroup }>;
    /** Optional: live state pushes so layout persistence stays current. */
    readonly onDidUpdateState?: Event<SerializedPopoutGroup>;
    /** Optional: live geometry for serialization. */
    dimensions?(): Box | null;
    /** Dockview → host: please close (e.g. component disposal). */
    close(): void;
}

export interface DockviewDetachedWindowHost {
    open(
        request: DetachedWindowOpenRequest
    ): DetachedWindowHandle | null | Promise<DetachedWindowHandle | null>;
}

interface DockviewComponentOptions {
    /* … */
    /** Enables the detached transport. See mode resolution below — hosts
     *  that also support same-origin windows (Electron) can use both
     *  transports side by side. */
    detachedWindowHost?: DockviewDetachedWindowHost;
}

export interface DockviewPopoutGroupOptions {
    /* … */
    /** Which transport this popout uses when both are available.
     *  'window'  → same-origin Window (live DOM, §4.7-A / default path)
     *  'detached'→ the detachedWindowHost protocol (§4.7-B) */
    mode?: 'window' | 'detached';
}
```

Mode resolution: explicit per‑call `mode` → component‑level default
(`defaultPopoutMode`, optional) → `'detached'` only when a
`detachedWindowHost` is configured and no same‑origin path exists →
`'window'`. A pure multi‑webview host (Tauri) simply never configures the
window path, so everything is detached; a browser app without a host is
all‑window; an Electron app can run both (below).

Main-window lifecycle: `addPopoutGroup` serializes the group, **removes it
from the local layout** (reference-group semantics preserved for the return
position, exactly like popouts), calls `host.open(...)`, and tracks the
handle in a small registry. Child-window side: the app boots its own
dockview instance and mounts the payload via a new convenience
`api.adoptDetachedState(state)` (a thin wrapper over the `fromJSON` restore
machinery, which already rebuilds groups from this shape). Transport between
the two windows (Tauri events, IPC, BroadcastChannel) is entirely the app's —
dockview never touches it.

New API around it (all additive): `api.getDetachedWindows()`,
`api.onDidAddDetachedWindow` / `api.onDidRemoveDetachedWindow`, and a
`detachedWindows` array in `SerializedDockview` (old readers ignore unknown
keys; layouts without detached windows serialize identically to today).

Honest constraints, stated up front in docs:

- Panels must be fully described by `(component, params)` — the **same
  contract `fromJSON` already imposes**; live runtime state that isn't in
  params does not cross the boundary.
- No drag-and-drop between main and detached windows (no shared DOM); moving
  panels across is an app-level serialize-and-send.
- The child window loads its own styles/theme (no stylesheet cloning).
- A detached group is **not in the local model**: it doesn't appear in
  `getPopouts()` or `groups`, and — deliberately — `DockviewGroupLocation`
  gains **no new variant**, because consumers exhaustively switch on
  `location.type` and a new variant would be a breaking type change.

Packaging: Strategy A is a core seam (tiny, pairs with `nonce`-style
options). Strategy B is a separate module (`DetachedWindows`) — free vs
enterprise is a product call; it composes with, but does not require,
`ScreenManagement` (the `screen`/`box` in the request come from the §4.1
snapshot when available, else the fallback box).

#### Worked scenario: process-isolated Electron over an event bus

The mixed-mode design above is aimed squarely at this shape of app: an
Electron workspace where some popouts stay in the opener's renderer process
(same-origin `window.open` children share it — that's why live DOM transfer
works) and others run as **separate BrowserWindows in their own renderer
processes** for crash isolation, sandboxing, or heavy content (GPU-hungry
canvases, untrusted plugin panels). The isolated windows cannot share DOM by
construction, so they ride the detached protocol:

- **Transport = the app's event bus, not dockview's.** The natural Electron
  wiring is `MessageChannelMain`: main creates a channel per detached window
  and hands one `MessagePort` to each renderer, giving the two dockview
  instances a direct pipe with no main-process relay (or the app uses its
  existing ipc bus — dockview only ever sees the `DetachedWindowHandle`).
- **Everything on the bus is model, never DOM.** The handle's
  `onDidUpdateState` pushes are `SerializedPopoutGroup` values; "move this
  panel to window 2" is serialize‑remove‑send‑add via the same
  `(component, params)` contract. Dockview's job is to make those model-level
  operations complete and symmetrical (`adoptDetachedState`, panel/group
  add-from-state), not to own the bus.
- **A coordinator falls out naturally.** The main dockview window acts as
  layout owner: it holds the reference positions, aggregates
  `onDidUpdateState` into `SerializedDockview.detachedWindows`, and persists
  one document covering every process. On app relaunch, restore replays
  `host.open(...)` per saved detached window — same code path as §5.
- **The two transports coexist per popout**: a stock-ticker panel pops out
  as a same-process window (its WebSocket and scroll state survive live); a
  third-party plugin panel pops out detached into a sandboxed process. Same
  `addPopoutGroup` call, one `mode` field apart.

### 4.8 Long-term direction: state-first, not DOM-free

Strategy B is not a bolt-on — it names the architectural end-state this
proposal is walking toward, so it's worth stating precisely. The long-term
strategy is **the serialized model becomes the contract; the DOM becomes one
transport**. That is different from "DOM independence" in one load-bearing
way:

Dockview already has a dual nature. Every layout exists twice: as the live
DOM instance (gridview trees holding real elements) and as the declarative
model (`SerializedDockview` / `GroupPanelViewState` — panels as
`(component, params)`), and `fromJSON` proves the model is sufficient to
rebuild everything. What §4.7 does is promote that model from "persistence
format" to "wire protocol": the detached host consumes it live, not just at
save/load time.

But the DOM-moving popout must remain a first-class transport, not a legacy
path, because it does something the model fundamentally cannot: **live
identity preservation**. A popped-out panel keeps its unserialized runtime
state — scroll positions, playing video, WebGL contexts, form inputs, a
mounted React tree. Serialize-and-rebuild loses all of that by definition
(the `fromJSON` contract: anything not in `params` is gone). So the two
mechanisms are not old-vs-new; they are two transports with different
guarantees:

| | Same-origin window (DOM move) | Detached (state protocol) |
|---|---|---|
| Runtime state | preserved live | rebuilt from `params` |
| Boundary | same process/origin only | any (webview, process, machine) |
| Cross-window dnd | yes | no (app-level) |
| Hosts | browsers, Electron (same process) | Tauri, process‑isolated Electron, anything |

The pragmatic sequencing, consistent with the zero-breaking-changes rule
(§4.8 below): grow the seam outward from serialization rather than
rewriting the engine. This proposal's pieces are deliberate steps on that
path — `ScreenManager` is already a DOM-independent service,
`DetachedWindowOpenRequest` makes the model a live contract, and
`adoptDetachedState()` is the first model-level mount API. A future step
(explicitly out of scope here) could formalize both transports behind one
internal `GroupHost` abstraction and make the model observable, at which
point headless layout, cross-machine sync, and collaborative layouts fall
out of the same seam — but nothing in this proposal needs to wait for that,
and none of it requires the live-DOM path to go away.

### 4.9 Backwards-compatibility guarantees

Restating the constraint that binds every section above — **zero breaking
changes**:

- Every new option (`screen`, `placement`, `fullscreen`, `mode`,
  `extraWindowFeatures`, `screenAdapter`, `popoutWindowFactory`,
  `detachedWindowHost`, `defaultPopoutMode`) is optional; omitting them all
  reproduces today's behaviour exactly.
- Existing event payloads gain only **optional** fields (`screen?` on
  `PopoutGroup` / `PopoutGroupChangePositionEvent`); no payload field is
  renamed, retyped, or removed.
- `DockviewGroupLocation` is untouched (see §4.7).
- Serialization: layouts written by older versions load unchanged; layouts
  written without the new features are **byte-identical** to today's output
  (screen hints and `detachedWindows` are emitted only when present, and the
  single-group `data` / multi-group `grid` invariant from
  `popoutWindowService.ts:250‑263` is preserved).
- `PopoutWindow` is not exported from the public index, so its constructor
  and options changes are internal.
- Consumer-implemented interfaces are all **new** (`DockviewScreenAdapter`,
  `DockviewDetachedWindowHost`); no existing public interface gains a
  required member.

## 5. Serialization & restoration

`PopoutWindowService.serialize()` (`popoutWindowService.ts:233`) already stores
`position: entry.window.dimensions()` (global coords) and `url`. Extensions:

- Persist a **screen hint** alongside `position`: `screenId` + `screenLabel` +
  `screenBounds` (best‑effort; web labels are not guaranteed stable across
  reboots — but a §4.6 adapter can supply genuinely stable ids, e.g. Electron's
  `Display.id`, making the hint reliable there).
- On restore (`fromJSON` → `addPopoutGroup` with `overridePopoutGridview`,
  `dockviewComponent.ts:3915‑3935`): restoration is **not gesture‑driven**, so
  it can only be screen‑aware when the permission is already `granted` (then
  the §4.1 eager snapshot is populated without a prompt — never prompt from
  `fromJSON`). If the saved screen is present in the current snapshot, place
  there; otherwise clamp the saved `position` to the nearest current screen's
  work area. Without the permission, restore uses the saved `position`
  verbatim, exactly as today. Never restore a window fully off‑screen when we
  have the data to know better.
- Keep the current single‑group/`data` vs multi‑group/`grid` shape switch intact
  so **older layouts round‑trip byte‑stably** (the existing invariant at
  `popoutWindowService.ts:250‑263`).

## 6. Security & permissions

- Preserve `assertSameOriginPopoutUrl` (`popoutWindow.ts:19`) — unchanged.
- `window-management` is a powerful permission; **never prompt eagerly**. On
  construction only *query* the state (queries never prompt); an eager
  `getScreenDetails()` call is made only when the permission is already
  `granted`. Prompts happen solely inside explicit consumer‑initiated actions
  (`api.getScreens()` / `addPopoutGroup({screen})`), and every path degrades
  gracefully on `NotAllowedError`.
- Respect the `nonce` / CSP plumbing already threaded through `addStyles`.
- Fullscreen requires transient activation; treat rejection as "open normally".

## 7. Cross‑browser / fallback matrix

| Environment | Behaviour |
|---|---|
| Chromium 100+, permission granted | Full feature set (enumerate, cross‑screen, fullscreen popups on 132+, topology events); snapshot populated eagerly, so even `fromJSON` restore is screen‑aware |
| Chromium, permission `prompt` | First gesture‑driven `getScreens()`/`addPopoutGroup({screen})` prompts; until granted, `window.open` coordinates are **clamped to the current screen** by the browser, so the popout opens at the fallback box and is rehomed via `moveTo` if/when the grant lands |
| Chromium, permission `denied` | `getScreens()` → single synthetic screen; `screen` option ignored w/ one‑time warning; popouts open exactly as today |
| Firefox / Safari / old Chromium | `isSupported = false`; identical to today |
| jsdom (tests) | `getScreenDetails` absent → fallback path; deterministic |

The guiding rule: **every new field is optional and every new call is behind a
capability check**, so the existing popout behaviour is the universal fallback.

**Browser support reality (as of early 2026).** The Window Management API is
implemented only in Chromium — which covers more than Google Chrome: Edge,
Opera, Arc, Vivaldi, Brave¹ and every other Chromium derivative, plus
**Electron**. Electron deserves a callout: dock-style apps embedded in
Electron are a major dockview use case, and there the host app can grant
`window-management` programmatically via
`session.setPermissionRequestHandler`, making the whole feature set work
deterministically with **no user prompt at all** — and §4.6's
`screenAdapter` seam lets such hosts swap in their native primitives
entirely. On the other side, Mozilla
has published a *negative* standards position on the API (fingerprinting
surface: screen count/geometry/labels) and WebKit has shown no adoption
signal — so Firefox/Safari support should be treated as "not coming", not
"not yet". That asymmetry is why the plan is strictly progressive
enhancement: Firefox/Safari users keep fully functional popouts, can drag
them to any monitor manually, and dockview still serializes/restores whatever
positions the browser honours (without the permission, cross‑screen
`window.open` coordinates are clamped — in Chromium to the current screen;
Firefox/Safari clamping varies by platform).

¹ Brave ships the API but its fingerprinting protections may degrade or gate
it; treat it as `prompt`/`denied` at runtime — which the permission flow
already handles.

## 8. Implementation phases

Small, independently‑shippable, each green before the next.

- **Phase 0 — Types & façade (no behaviour change).** Ambient declarations
  (`src/types/windowManagement.d.ts`), `DockviewScreen`, `ScreenPlacement`,
  `IScreenManager`, and `ScreenManager` with feature/permission detection
  (incl. the `'window-placement'` legacy fallback) + single‑screen fallback +
  unit tests (mock `getScreenDetails`). No wiring yet.
- **Phase 1 — Discovery API.** `ServiceCollection` slot, `ScreenManagerModule`
  registration; `api.hasWindowManagement`, `api.screens`,
  `api.getScreens()` (guarded with `assertModule`),
  `api.getWindowManagementPermission()`, `api.onDidChangeScreens`. The
  `screenAdapter` option and the `adapter → web API → fallback` precedence
  chain land here too (an adapter is just an alternative source for the same
  snapshot), plus its `OPTION_MODULE_RULES` entry — `screenAdapter` is a
  *component* option, so setting it without the module gets the standard
  diagnostic naming the module/package.
- **Phase 2 — Targeted placement.** Extend `DockviewPopoutGroupOptions` with
  `screen` + `placement` + `extraWindowFeatures`; resolve in
  `addPopoutGroup.getBox()` from the cached snapshot only (no‑await rule);
  open‑then‑`moveTo` rehoming for the `prompt` path (via
  `adapter.moveWindow` when present); clamp to work area. Group‑level
  `getScreen()` / `moveToScreen()`; `screen` on `PopoutGroup` and
  `PopoutGroupChangePositionEvent`. Tests for coordinate math, clamping, and
  all fallback rungs.
- **Phase 3 — Fullscreen on screen.** `fullscreen` option → `popup,fullscreen`
  window feature when permission is granted; `{type:'fill'}` fallback;
  group‑level `setFullscreen()` / `isFullscreen()`; `fullscreenchange`
  relayout hook.
- **Phase 4 — Topology resilience.** Handle `onDidChangeScreens`: re‑clamp /
  re‑home popouts when screens change or are removed.
- **Phase 5 — Serialization.** Screen hints in `serialize()`; screen‑aware
  restore with off‑screen clamping; round‑trip tests.
- **Phase 6 — Popout window factory (§4.7 Strategy A).** `popoutWindowFactory`
  option consulted in `PopoutWindow.open()`; `null` → existing blocked-popout
  path; migrate one popout spec to inject via the factory as proof. Small and
  independent — can land any time after Phase 0.
- **Phase 7 — Detached-window protocol (§4.7 Strategy B).** `DetachedWindows`
  module: `detachedWindowHost` option, handle registry,
  `api.adoptDetachedState()`, `detachedWindows` in serialization, events.
  Separable follow-up scope — nothing earlier depends on it.
- **Phase 8 — Docs, demo, framework wrappers.** Update
  `packages/docs/docs/core/groups/popoutGroups.mdx`, add a "move to screen"
  example to the docs sandbox, an Electron adapter + Tauri detached recipe
  page, re‑export new types from `dockview-react` / `-vue` / `-angular`.

## 9. Testing strategy

- Unit‑test `ScreenManager` against a mocked `getScreenDetails()` /
  `ScreenDetails` (multi‑screen, single‑screen, denied, unsupported), including
  `screenschange` re‑emission and `placementFor` clamping.
- Extend `__tests__/dockview/popoutWindowService.spec.ts` and
  `popoutLifecycle.spec.ts` for the `screen`/`placement` resolution and
  serialize/restore with screen hints (jsdom has no Window Management API, so
  these exercise the fallback + the injected mock).
- Guard against regressions in existing popout tests
  (`popoutWindow.spec.ts`, `popoutWindowService.spec.ts`) — none of their
  assertions should change.

## 10. Risks & open questions

- **Permission UX** — the first `getScreenDetails()` in `prompt` state shows a
  browser prompt and needs transient activation. Consumers must call
  `getScreens()` from a real gesture; document this loudly.
- **Transient‑activation budget** — `window.open` and permission prompts both
  draw on the same activation; the no‑await ordering in §4.1 is
  load‑bearing and needs a manual test on real Chrome (jsdom can't cover it).
- **Screen identity across sessions** — `label` is not a stable ID; restore must
  be best‑effort with off‑screen clamping as the safety net. (Optional
  refinement: also persist the position as a *fraction* of the saved screen's
  work area, so restore onto a same‑label screen with a different resolution
  lands proportionally.)
- **`window.open` coordinate clamping** — without the permission, Chromium
  clamps coordinates to the current screen (and some platforms clamp anyway);
  the work‑area clamp, the snapshot‑gated resolution order, and the
  open‑then‑`moveTo` rehoming mitigate this.
- **Fullscreen popups availability** — the `fullscreen` window feature is
  newer than the rest of the API (Chromium ~132); the `{type:'fill'}` fallback
  must be indistinguishable in layout behaviour.
- **Fullscreen + popped‑out gridview** — confirm the nested gridview
  `ResizeObserver` (`observeGridviewSize`) relays correctly after a fullscreen
  transition (add a relayout on `fullscreenchange`).
- **Testing fidelity** — jsdom can't emulate real multi‑screen behaviour;
  coverage relies on mocks, so a manual test matrix (2‑monitor Chrome) is part
  of Phase 4/5 sign‑off.

## 11. Packaging as an enterprise module

The feature fits the `dockview-enterprise` seam cleanly — the module system was
designed for exactly this split (see `modules.ts:1‑10` and the existing twelve
enterprise modules). What changes versus shipping it in core:

**Stays in core (`dockview-core`)** — core references only interfaces, never
implementations (`moduleContracts.ts:1‑6`):

- `IScreenManagerService` + `IScreenManagerHost` contracts appended to
  `src/dockview/moduleContracts.ts` (implementation‑free), plus the
  `screenManagerService?` slot in `ServiceCollection`.
- The **types** consumers see in option/API signatures — `DockviewScreen`,
  `ScreenPlacement`, the extended `DockviewPopoutGroupOptions` fields, and the
  ambient `windowManagement.d.ts` — must live in core, because core's public
  interfaces reference them (same pattern as `SmartGuidesOptions` living in
  core `options.ts` while the service ships in enterprise).
- The **seams**, all `?.`‑chained no‑ops when the module is absent (the
  established pattern, e.g. `_smartGuidesService?.` at
  `dockviewComponent.ts:905‑933`):
  - `getBox()` consults `this._screenManagerService?.` for `screen` resolution;
  - `PopoutWindow` accepts the `fullscreen` flag core resolves from the service;
  - `serialize()` asks the service `?.screenHintFor(entry)` — absent module →
    today's byte‑stable output;
  - `api.getScreens()` guarded with `assertModule` (a *command*),
    `hasWindowManagement` / `onDidChangeScreens` silent query fallbacks
    (`false` / `NO_EVENT`).
- `'ScreenManagement'` added to `ENTERPRISE_MODULE_NAMES` (`modules.ts:134`)
  so `assertModule`/`logMissingModule` automatically emit the
  "ships in dockview-enterprise … npm install dockview-enterprise" message —
  and to the sync test (`enterpriseModuleNames.spec.ts`).

**Moves to `dockview-enterprise`:**

- `src/screenManagerService.ts` — the `ScreenManager` implementation +
  `ScreenManagerModule = defineModule({ name: 'ScreenManagement', serviceKey:
  'screenManagerService', dependsOn: [PopoutWindowModule], … })`.
- The Phase 4 topology reaction ports **unchanged** — it was already designed
  to live in the module's `init()` hook.
- Export from the enterprise `Modules` list in `index.ts` → self‑registered on
  import, and automatically covered by the existing `LicenseModule`
  watermark‑unless‑licensed gate. Its own tests move to
  `packages/dockview-enterprise/src/__tests__/`; core keeps only seam tests
  (missing‑module warning, `?.` fallbacks).

**One wrinkle — per‑call options.** `OPTION_MODULE_RULES`
(`optionsModules.ts:64`) diagnoses *component* options set without their
module; `screen`/`placement`/`fullscreen` are **per‑call** fields on
`addPopoutGroup`, so they need the command‑path variant instead: `getBox()`
calls `logMissingModule('ScreenManagement', 'addPopoutGroup: screen')` (deduped
per reason) and falls through to the free placement path — the popout still
opens, just not screen‑targeted. If a component‑level option is ever added
(e.g. `multiScreen: { rehomeOnTopologyChange: true }`), it gets a normal
`OPTION_MODULE_RULES` entry plus the module's `options: […]` declaration.

**Honest product caveat.** This gates *convenience, not capability*: the free
`position: Box` already passes global screen coordinates straight through to
`window.open` (`dockviewComponent.ts:1905`), so an app that requests the
permission itself can hand‑roll cross‑screen placement today. The enterprise
value is the integrated bundle — screen discovery API, placement helpers,
fullscreen popouts, topology resilience, screen‑aware restore — which is
consistent with how the other enterprise modules position (free dnd exists;
`SmartGuides`/`DndCompass` refine it).

The phase plan (§8) is unchanged in content; Phases 0–1 split their file
targets between the two packages as above, and Phase 6 gains the enterprise
docs page treatment instead of (or alongside) the core docs update.

## 12. Files touched (summary)

Assuming the enterprise packaging from §11 (core‑only packaging differs just in
the first column: the service+module land in `src/dockview/screenManager.ts`
and are registered in `allModules.ts` instead).

| File | Change |
|---|---|
| core `src/types/windowManagement.d.ts` | **new** ambient declarations for the Window Management API |
| core `src/dockview/moduleContracts.ts` | `IScreenManagerService` + `IScreenManagerHost` contracts |
| core `src/dockview/modules.ts` | `screenManagerService` slot in `ServiceCollection`; `'ScreenManagement'` in `ENTERPRISE_MODULE_NAMES` |
| core `src/popoutWindow.ts` | `fullscreen` option → `popup,fullscreen` features; `fullscreenchange` relayout; `popoutWindowFactory` consultation |
| core `src/dockview/dockviewComponent.ts` | extend options, resolve `screen` in `getBox()` via `?.` seam, open‑then‑`moveTo` rehoming, new events/getters |
| core `src/dockview/popoutWindowService.ts` | screen hints in `serialize()` via `?.` seam; screen‑aware restore |
| core `src/api/component.api.ts` | `hasWindowManagement`, `getScreens()` (assertModule‑guarded), `onDidChangeScreens`, new option types |
| core `src/dockview/options.ts` | `screenAdapter`, `popoutWindowFactory`, `detachedWindowHost` component options |
| `src/dockview/detachedWindowService.ts` (package per product call) | **new** `DetachedWindows` module: handle registry, `adoptDetachedState`, serialization (Phase 7) |
| core `src/dockview/optionsModules.ts` | `OPTION_MODULE_RULES` entry for `screenAdapter` |
| core `src/api/dockviewGroupPanelApi.ts` | `getScreen()`, `moveToScreen()`, `setFullscreen()`, `isFullscreen()` |
| enterprise `src/screenManagerService.ts` | **new** `ScreenManager` implementation + `ScreenManagerModule` (incl. `init()` topology subscription) |
| enterprise `src/index.ts` | export module; add to self‑registered `Modules` list |
| core + enterprise `__tests__/**` | seam tests in core; `screenManagerService.spec.ts` in enterprise; extend popout specs; `enterpriseModuleNames.spec.ts` sync |
| `packages/docs/docs/core/groups/popoutGroups.mdx` + sandbox | docs + example |
| `dockview-react` / `-vue` / `-angular` | re‑export new public types |
