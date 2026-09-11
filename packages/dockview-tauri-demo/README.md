# dockview-tauri-demo

A small [Tauri](https://tauri.app) desktop shell hosting dockview. It exists to
answer questions the browser test suite cannot: what a native webview does with
popout groups, what happens at the boundary between two native windows, and how
layout state can cross that boundary.

Not published — an internal testbed, not a supported example.

## Running it

The demo consumes the workspace packages, so build them first:

```sh
yarn install
yarn build && yarn build:bundle
```

Then, from this directory:

```sh
yarn dev            # the frontend in a browser, no Rust needed
yarn tauri:dev      # the desktop shell
```

The shell drives Tauri through the Rust CLI rather than the npm one, so that
its ~36MB of prebuilt binaries stay out of everyone else's `yarn install`.
Install it once:

```sh
cargo install tauri-cli --version "^2"
```

`yarn tauri:build` produces a release bundle; `cargo tauri build --no-bundle`
stops at the binary. Tauri's
[prerequisites](https://tauri.app/start/prerequisites/) cover the platform
toolchains; on Linux that means the WebKitGTK development packages:

```sh
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  librsvg2-dev libxdo-dev libssl-dev pkg-config build-essential
```

The bundle icon is a single PNG. Run `yarn tauri icon` to generate the full
per-platform icon set if you need a signed, distributable build.

## What each panel is for

**Host** — what the page thinks it is running inside: origin, protocol, webview
engine, and whether dockview would accept this origin as a popout target.

**Popouts** — the popout mechanism, checked in pieces. It reports the popout URL
verdict, probes `window.open` directly (does a handle come back, and is the
document reachable), and pops out its own group.

It also reproduces the refused-origin case from any origin, by aiming a popout
at a `tauri://` URL — from a page served over http that is another origin, so
the guard fails at the same check as a genuine cross-origin popout would. One button takes the interactive path, the
other saves a layout containing a popout, reopens it on the refused origin, and
reports whether every panel came back visible. Both run in a plain browser, so
the macOS/Linux release behaviour can be checked without packaging anything.

**Native windows** — asks Rust to build a second native window running the same
frontend. That webview has its own JavaScript context, so nothing can be moved
into it from here.

**Layout sync** — serializes the layout and fans it out over Tauri's event bus,
so windows on either side of the process boundary converge on the same
arrangement without sharing a DOM.

The frontend degrades in a plain browser: the Tauri-only panels report that the
shell is missing instead of failing.

## Where the host and the browser diverge

dockview opens popout groups with `window.open` and then moves the group's DOM
into the new document. Two things have to hold, and a native shell is where they
stop being free:

1. **The popout URL must be same-origin with the page.** dockview compares
   scheme and host and refuses `javascript:`, `data:`, `blob:`, `vbscript:`
   and `file:` outright, because a popout still shares `window.opener` with
   the host page. Under `tauri dev` the webview loads the Vite dev server over
   http. Release builds differ by platform: Windows and Android serve the app
   from `http://tauri.localhost`, macOS and Linux from `tauri://localhost`.
   Both are origins of their own, so `/popout.html` resolves same-origin in
   every case; the Host panel reports which one you are in.

2. **The opened window must be script-accessible.** That depends on how the
   window was created. Windows built through Tauri's `WebviewWindow` API are
   separate webviews with separate JavaScript contexts, which is the point of
   the Native windows panel and the reason the Layout sync panel moves
   serialized state rather than DOM. A window that the page opens with
   `window.open` is scriptable only if the host answers the request with a
   webview *related* to the opener: the same web process on WebKitGTK, the
   same configuration on WKWebView, the same environment on WebView2. Tauri
   exposes that as `WebviewWindowBuilder::on_new_window`; a window declared
   in `tauri.conf.json` has no handler, and `window.open` returns null from
   it. The demo therefore builds every window in Rust (`src-tauri/src/lib.rs`)
   and answers `window.open` there.

   There are two ways to answer, and the choice matters. `Allow` is wry's own
   per-platform window creation: it navigates nothing itself, so the engine
   loads the requested URL into the new webview exactly once; it sizes the
   window from the `window.open` features on macOS and Windows, but ignores
   them on WebKitGTK and opens 200×200. `Create` returns a Tauri-built window
   (labelled `popout-N`), which has to be given a URL: its `about:blank` load
   races the engine's load of the request, and where `about:blank` lands last
   it wipes the document dockview has already moved the group into, leaving a
   blank window. Measured: the order holds on WebKitGTK and does not on
   WKWebView, so the demo uses `Create` on Linux and `Allow` elsewhere.
   `DOCKVIEW_POPOUT=create` or `=allow` overrides that for comparison.

### Drag-and-drop: pointer by default, HTML5 switchable

dockview's default `dndStrategy` is `'auto'`: HTML5 drag-and-drop for mouse
input, pointer events for touch and pen. The demo sets `dndStrategy: 'pointer'`
because an HTML5 tab drag in an embedded webview can look like it is working
right up until nothing happens: the browser renders a native drag image, but
if the webview never delivers `dragover` to the page the drop targets do not
light up and there is nothing to drop onto. That was the experience that
prompted the default; it is host-specific, so the demo makes it measurable:

- `?dnd=html5` on the URL (or `VITE_DND=html5` at build time) switches the
  backend to HTML5.
- The Host panel reports the active backend, how many tabs are natively
  draggable, and a live `drop overlays seen` count — a drag that docks a panel
  with a count of 0 is the pointer path, a count that rises during an HTML5
  drag means `dragover` reached the page.
- Every window is built with `disable_drag_drop_handler()` (the
  `dragDropEnabled: false` window option). Tauri's own drag-drop interception
  is the documented reason HTML5 drag-and-drop misbehaves in WebView2, and
  the demo does not use file drops.

Measured on Linux (WebKitGTK 2.52.6, release build, driven under Xvfb with
`xdotool`): with the HTML5 backend, dragging the Scratch tab into another group
raised `drop overlays seen` to 1 and docked the panel, both with
`dragDropEnabled` at its default and with it off. So on this host the HTML5
backend works, and the "ghost but no overlay" symptom is not a WebKitGTK
limitation as such. macOS (WKWebView) and Windows (WebView2) are not measured
here; if either shows the symptom, `?dnd=html5` plus the Host readout will say
whether `dragover` is arriving at all.

### Measured in a release build

Running a packaged build on Linux (WebKitGTK, tauri 2.11.5, webview 2.52.6),
the Host panel reports:

```
runtime                     tauri
engine                      WebKitGTK
origin                      tauri://localhost
protocol                    tauri:
release origin is http(s)   false
```

and, with the guard comparing scheme and host and the Rust side answering
`window.open`, both popout probes pass and a real popout opens:

```
allowed: tauri://localhost/popout.html — same-origin (tauri://localhost)
window.open is scriptable — The opener can reach the new window's document, so
dockview can move panel DOM into it.
popout group opened
```

The popout is a second native window showing the group with dockview's styles
cloned in; on Linux both answers render it, the Tauri-built window at 800×600
and wry's at 200×200. Before either half was in place the
probes failed independently: the guard refused the `tauri:` scheme, and
`window.open` returned null because no window had an `on_new_window` handler.
Each alone is not enough. One seam remains: `window.close()` from script does
not close the window Tauri created, so the `window.open` probe leaves its
blank window behind and a popout group that is closed leaves an empty native
window. Windows created through Tauri's own API remain
separate contexts; sharing layout state across those over IPC is still the
route for them, which is what the Native windows and Layout sync panels are
for.

Enterprise features are governed by a licence key; set one with
`LicenseManager.setLicenseKey()` in `src/main.ts` when exercising them. See
<https://dockview.dev/enterprise>.

## Layout

```
src/            frontend
  main.ts       builds the dockview instance and its panels
  panels.ts     the four probe panels plus a scratch panel
  host.ts       host-environment detection and the popout URL diagnosis
  probes.ts     window.open probes
  bridge.ts     lazy wrapper over the Tauri IPC surface
src-tauri/      Rust shell: host info, native window creation, layout broadcast
popout.html     served at /popout.html, dockview's default popout target
```
