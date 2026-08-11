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
| Permission | `navigator.permissions.query({ name: 'window-management' })` | states: `granted` / `prompt` / `denied` |
| Enumerate screens | `const details = await window.getScreenDetails()` | **requires a user gesture**; rejects with `NotAllowedError` if denied |
| Screen list | `details.screens: ScreenDetailed[]`, `details.currentScreen` | each has `availLeft/availTop/availWidth/availHeight`, `left/top/width/height`, `isPrimary`, `isInternal`, `label`, `devicePixelRatio` |
| Cross‑screen placement | `window.open(url, name, 'left=…,top=…,width=…,height=…')` | coordinates are in the **multi‑screen coordinate space** — negative/large values land on other monitors |
| Fullscreen on a screen | `element.requestFullscreen({ screen: screenDetailed })` | opens fullscreen on a _specific_ display |
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

**Single choke point.** `PopoutWindow.open()` (`popoutWindow.ts:92`) is the
**only** production `window.open` call site, and the placement `Box` is computed
one level up in `_doAddPopoutGroup.getBox()` (`dockviewComponent.ts:1892`).
Those two spots are the entire surface area for injecting screen‑aware
placement. Content is transferred by a raw cross‑document `appendChild` +
stylesheet cloning (no iframe/`adoptNode`), and each popout already owns a
realm‑scoped `ResizeObserver`, `OverlayRenderContainer`,
`DropTargetAnchorContainer` and `PopupService` — so per‑window state to hang
screen info off already exists in `PopoutGroupEntry`.
- **Options type** — `DockviewPopoutGroupOptions` (`dockviewComponent.ts:175`):
  `{ position?: Box; popoutUrl?; onDidOpen?; onWillClose? }`.

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
module like `PopoutWindowModule` (`popoutWindowService.ts:281`).

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

    /** Requests details (needs a user gesture the first time); caches the
     *  ScreenDetails and starts listening for topology changes. Resolves to a
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
- **Lazy, gesture‑bound** — `getScreenDetails()` must be called from a user
  gesture; expose `getScreens()` and call it from within the popout/fullscreen
  API paths (which are already gesture‑initiated). Cache the returned
  `ScreenDetails`; never call it eagerly on construction.
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

Resolution order in `addPopoutGroup`'s `getBox()`
(`dockviewComponent.ts:1885‑1912`):

1. If `screen` is set **and** `ScreenManager.isSupported` → resolve the
   `DockviewScreen`, compute `box = placementFor(screen, placement ?? {type:'center'})`.
2. Else if `position` set → use it (today's behaviour).
3. Else → today's `getBoundingClientRect()`‑derived box.

`fullscreen: true` defers a `requestFullscreen({ screen })` call to just after
the popout window's `load` (inside `PopoutWindow.open`, where we already have
the external document), guarded by capability + try/catch.

### 4.3 Fullscreen support in `PopoutWindow`

Add an optional `fullscreenScreen?: ScreenDetailed` to `PopoutWindowOptions`
(`popoutWindow.ts:6`). After the container is appended on `load`
(`popoutWindow.ts:157‑166`), if requested and supported:

```ts
externalDocument.documentElement
    .requestFullscreen({ screen: this.options.fullscreenScreen })
    .catch(() => { /* permission / gesture — degrade to normal window */ });
```

### 4.4 React to display topology changes

`DockviewComponent` subscribes to `screenManager.onDidChangeScreens` and, for
each open popout (`popoutWindowService.entries`):

- If the popout's screen was **removed**, re‑place it onto the current/primary
  screen via `placementFor` and move it (`window.moveTo/resizeTo`).
- Otherwise **clamp** its box to the (possibly resized) screen's work area so it
  is never stranded off‑screen.
- Re‑emit through a new public event `onDidChangeScreens` on the component + API.

This is the single most valuable robustness win: today a popout on a monitor
that gets unplugged is simply lost.

> Note on move tracking: dockview currently detects a popout being dragged by
> **polling** `screenX/screenY` every `requestAnimationFrame`
> (`onDidWindowMoveEnd`, `dom.ts:452`) — there is no native move event. Where
> the Window Management API is present, `currentscreenchange` gives a precise,
> event‑driven signal that a popout crossed onto a different display; use it to
> enrich `onDidPopoutGroupPositionChange` with the resolved `DockviewScreen`
> without replacing the existing polling fallback.

### 4.5 Public API additions

On `DockviewComponent` and mirrored in `component.api.ts` (`DockviewApi`):

```ts
// discovery
api.hasWindowManagement: boolean;                 // ScreenManager.isSupported
api.getScreens(): Promise<DockviewScreen[]>;      // gesture-bound
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
  `dockviewComponent.ts:3915‑3935`): if the saved screen is present in the
  current `screens` snapshot, place there; otherwise clamp the saved `position`
  to the nearest current screen's work area. Never restore a window fully
  off‑screen.
- Keep the current single‑group/`data` vs multi‑group/`grid` shape switch intact
  so **older layouts round‑trip byte‑stably** (the existing invariant at
  `popoutWindowService.ts:250‑263`).

## 6. Security & permissions

- Preserve `assertSameOriginPopoutUrl` (`popoutWindow.ts:19`) — unchanged.
- `window-management` is a powerful permission; **never** request it eagerly.
  Only `getScreenDetails()` inside an explicit consumer‑initiated action
  (`api.getScreens()` / `addPopoutGroup({screen})`), and always degrade
  gracefully on `NotAllowedError`.
- Respect the `nonce` / CSP plumbing already threaded through `addStyles`.
- Fullscreen requires transient activation; treat rejection as "open normally".

## 7. Cross‑browser / fallback matrix

| Environment | Behaviour |
|---|---|
| Chromium 100+, permission granted | Full feature set (enumerate, cross‑screen, fullscreen, topology events) |
| Chromium, permission `prompt`/`denied` | `getScreens()` → single synthetic screen; `screen` option ignored w/ warning; popouts still open (today's behaviour) |
| Firefox / Safari / old Chromium | `isSupported = false`; identical to today |
| jsdom (tests) | `getScreenDetails` absent → fallback path; deterministic |

The guiding rule: **every new field is optional and every new call is behind a
capability check**, so the existing popout behaviour is the universal fallback.

## 8. Implementation phases

Small, independently‑shippable, each green before the next.

- **Phase 0 — Types & façade (no behaviour change).** Add `DockviewScreen`,
  `ScreenPlacement`, `IScreenManager`, and `ScreenManager` with feature
  detection + fallback + unit tests (mock `getScreenDetails`). No wiring yet.
- **Phase 1 — Discovery API.** `api.hasWindowManagement`, `api.getScreens()`,
  `api.onDidChangeScreens`; module registration; component subscription plumbing.
- **Phase 2 — Targeted placement.** Extend `DockviewPopoutGroupOptions` with
  `screen` + `placement`; resolve in `addPopoutGroup.getBox()`; clamp to work
  area. Tests for coordinate math and fallback.
- **Phase 3 — Fullscreen on screen.** `fullscreenScreen` in `PopoutWindow`;
  `fullscreen` option; guarded `requestFullscreen({screen})`.
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

- **Permission UX** — the first `getScreenDetails()` shows a browser prompt.
  Consumers must call `getScreens()` from a real gesture; document this loudly.
- **Screen identity across sessions** — `label` is not a stable ID; restore must
  be best‑effort with off‑screen clamping as the safety net.
- **`window.open` coordinate quirks** — some platforms clamp or ignore
  cross‑screen coordinates without the permission; the work‑area clamp plus the
  fallback box mitigate this.
- **Fullscreen + popped‑out gridview** — confirm the nested gridview
  `ResizeObserver` (`observeGridviewSize`) relays correctly after a fullscreen
  transition (add a relayout on `fullscreenchange`).
- **Testing fidelity** — jsdom can't emulate real multi‑screen behaviour;
  coverage relies on mocks, so a manual test matrix (2‑monitor Chrome) is part
  of Phase 4/5 sign‑off.

## 11. Files touched (summary)

| File | Change |
|---|---|
| `src/dockview/screenManager.ts` | **new** façade service + module |
| `src/popoutWindow.ts` | `fullscreenScreen` option; guarded `requestFullscreen` |
| `src/dockview/dockviewComponent.ts` | extend options, resolve `screen` in `getBox()`, subscribe to screen changes, new events/getters |
| `src/dockview/popoutWindowService.ts` | screen hints in `serialize()`; screen‑aware restore |
| `src/api/component.api.ts` | `hasWindowManagement`, `getScreens()`, `onDidChangeScreens`, new option types |
| `src/dockview/options.ts` | (optional) global default `popoutUrl` already here; no new global needed |
| `__tests__/**` | new `screenManager.spec.ts`; extend popout specs |
| `packages/docs/docs/core/groups/popoutGroups.mdx` + sandbox | docs + example |
| `dockview-react` / `-vue` / `-angular` | re‑export new public types |
