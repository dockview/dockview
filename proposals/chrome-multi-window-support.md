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

```ts
export type ScreenPlacement =
    | { type: 'center'; width?: number; height?: number }
    | { type: 'fill' }                       // fill the screen's work area
    | { type: 'box'; box: Box };             // explicit, relative to screen origin

export interface DockviewPopoutGroupOptions {
    position?: Box;                          // unchanged (main-screen relative)
    popoutUrl?: string;
    onDidOpen?: (event: { id: string; window: Window }) => void;
    onWillClose?: (event: { id: string; window: Window }) => void;

    // NEW — target a specific screen. Ignored (with a console warning) when the
    // Window Management API is unavailable; falls back to `position`.
    screen?: DockviewScreen | 'primary' | 'current' | number /* index */;
    placement?: ScreenPlacement;             // how to size/anchor on `screen`
    fullscreen?: boolean;                    // request fullscreen on `screen`
}
```

`screen` union semantics: `'current'` = the screen hosting the main window;
`'primary'` = `isPrimary`; a `number` indexes the array last returned by
`getScreens()` (out of range → fallback + one‑time warning); a
`DockviewScreen` object is matched by identity against the current snapshot
(stale object → re‑resolve by `id`, else fallback).

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

### 4.5 Public API additions

On `DockviewComponent` and mirrored in `component.api.ts` (`DockviewApi`):

```ts
// discovery
api.hasWindowManagement: boolean;                 // ScreenManager.isSupported
api.getScreens(): Promise<DockviewScreen[]>;      // prompts on first call ('prompt' state) — call from a gesture
api.onDidChangeScreens: Event<DockviewScreen[]>;

// placement helpers already flow through addPopoutGroup options.
```

`getScreens()` is the one method a consumer calls (from a click handler) to
build a "move to screen ▸" menu; the returned `DockviewScreen[]` values are the
exact objects accepted by `addPopoutGroup({ screen })`.

## 5. Serialization & restoration

`PopoutWindowService.serialize()` (`popoutWindowService.ts:233`) already stores
`position: entry.window.dimensions()` (global coords) and `url`. Extensions:

- Persist a **screen hint** alongside `position`: `screenLabel` +
  `screenBounds` (best‑effort; labels are not guaranteed stable across reboots).
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

## 8. Implementation phases

Small, independently‑shippable, each green before the next.

- **Phase 0 — Types & façade (no behaviour change).** Ambient declarations
  (`src/types/windowManagement.d.ts`), `DockviewScreen`, `ScreenPlacement`,
  `IScreenManager`, and `ScreenManager` with feature/permission detection
  (incl. the `'window-placement'` legacy fallback) + single‑screen fallback +
  unit tests (mock `getScreenDetails`). No wiring yet.
- **Phase 1 — Discovery API.** `ServiceCollection` slot, `ScreenManagerModule`
  in `allModules.ts`; `api.hasWindowManagement`, `api.getScreens()` (guarded
  with `assertModule`), `api.onDidChangeScreens`.
- **Phase 2 — Targeted placement.** Extend `DockviewPopoutGroupOptions` with
  `screen` + `placement`; resolve in `addPopoutGroup.getBox()` from the cached
  snapshot only (no‑await rule); open‑then‑`moveTo` rehoming for the `prompt`
  path; clamp to work area. Tests for coordinate math, clamping, and all
  fallback rungs.
- **Phase 3 — Fullscreen on screen.** `fullscreen` option → `popup,fullscreen`
  window feature when permission is granted; `{type:'fill'}` fallback;
  `fullscreenchange` relayout hook.
- **Phase 4 — Topology resilience.** Handle `onDidChangeScreens`: re‑clamp /
  re‑home popouts when screens change or are removed.
- **Phase 5 — Serialization.** Screen hints in `serialize()`; screen‑aware
  restore with off‑screen clamping; round‑trip tests.
- **Phase 6 — Docs, demo, framework wrappers.** Update
  `packages/docs/docs/core/groups/popoutGroups.mdx`, add a "move to screen"
  example to the docs sandbox, re‑export new types from
  `dockview-react` / `-vue` / `-angular`.

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

## 11. Files touched (summary)

| File | Change |
|---|---|
| `src/types/windowManagement.d.ts` | **new** ambient declarations for the Window Management API |
| `src/dockview/screenManager.ts` | **new** façade service + `ScreenManagerModule` (incl. `init()` topology subscription) |
| `src/dockview/modules.ts` | `screenManagerService` slot in `ServiceCollection` |
| `src/dockview/allModules.ts` | register `ScreenManagerModule` |
| `src/popoutWindow.ts` | `fullscreen` option → `popup,fullscreen` features; `fullscreenchange` relayout |
| `src/dockview/dockviewComponent.ts` | extend options, resolve `screen` in `getBox()`, open‑then‑`moveTo` rehoming, new events/getters |
| `src/dockview/popoutWindowService.ts` | screen hints in `serialize()`; screen‑aware restore |
| `src/api/component.api.ts` | `hasWindowManagement`, `getScreens()`, `onDidChangeScreens`, new option types |
| `src/dockview/options.ts` | (optional) global default `popoutUrl` already here; no new global needed |
| `__tests__/**` | new `screenManager.spec.ts`; extend popout specs |
| `packages/docs/docs/core/groups/popoutGroups.mdx` + sandbox | docs + example |
| `dockview-react` / `-vue` / `-angular` | re‑export new public types |
