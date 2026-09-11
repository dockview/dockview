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
at a `tauri://` URL — the guard resolves the popout URL against the page and
fails at the same check either way. One button takes the interactive path, the
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

1. **The page must be served over same-origin `http(s)`.** dockview rejects
   anything else, because a popout on a custom protocol still shares
   `window.opener` with the host page. Under `tauri dev` the webview loads the
   Vite dev server over http and the check passes. Release builds differ by
   platform: Windows and Android serve the app from `http://tauri.localhost`,
   while macOS and Linux serve it from `tauri://localhost` — where the check
   fails. The Host panel reports which case you are in.

2. **The opened window must be script-accessible.** Native windows built through
   Tauri's API are not: they are separate webviews with separate JavaScript
   contexts. That isolation is the point of the Native windows panel, and the
   reason the Layout sync panel moves serialized state rather than DOM.

### Drag-and-drop needs the pointer backend

dockview's default `dndStrategy` is `'auto'`: HTML5 drag-and-drop for mouse
input, pointer events for touch and pen. WebKitGTK implements HTML5
drag-and-drop only partly — a drag starts and the browser renders a (blank)
native drag image, but the drop targets never light up, so there is nothing to
drop onto. Measured in a release build: dragging a tab produced a drag ghost
and no overlay at all.

The demo therefore sets `dndStrategy: 'pointer'`, and with it the overlay
renders and the drop docks the panel normally. Anything hosting dockview in an
embedded webview will want the same, and the symptom if it is missed is easy to
misread: the drag looks like it is working right up until nothing happens.

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

and the two popout probes both fail, independently:

```
refused: tauri://localhost/popout.html — protocol "tauri:" is not http(s)
window.open returned null — the host blocked the popup or routed the URL elsewhere
```

The second is the one worth knowing: even with the origin check out of the way,
the host hands back no window at all, so popout groups are not merely gated on
this platform — there is nothing to put a group into. Sharing layout state
across native windows over IPC is the available route, not a stylistic
preference.

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
