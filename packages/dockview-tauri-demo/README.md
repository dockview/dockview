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
engine, and whether dockview would accept this origin as a popout target (asked
of dockview's own exported guard, `getPopoutUrlError`).

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
frontend. That webview has its own JavaScript context, so no DOM can be moved
into it from here.

**Cross-window drag** — drags a tab or a group from one native window's
dockview into another's, with the shell as the orchestrator. Reports the drag backend
in use, counts each stage of a drag, and logs what crossed. See
[Dragging between windows](#dragging-between-windows).

**Workspace** — what the shell has on record: the workspace file, when it was
last written, and every window with its frame and whether it has reported a
layout. Close the app and reopen it to see every window return. See
[Persisting the workspace](#persisting-the-workspace).

**Undo** — one undo history across every window. Ctrl+Z in any window undoes
the most recent step wherever it happened, a tab that crossed to another
window included, and the panel logs every move between windows. See
[Undo across windows](#undo-across-windows).

**Layout sync** — serializes the layout and fans it out over Tauri's event bus,
so windows on either side of the process boundary converge on the same
arrangement without sharing a DOM. What that whole-layout resync costs, and
what dockview would need for a group to run in a window it cannot script, is
measured in [docs/unscriptable-windows.md](docs/unscriptable-windows.md).

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

   There are two ways to answer. `Create` returns a Tauri-built window
   (labelled `popout-N`, titled from its document, sized from the
   `window.open` features on macOS and Windows); the demo uses it. `Allow` is
   wry's own per-platform window creation, kept behind `DOCKVIEW_POPOUT=allow`
   for comparison; on WebKitGTK it ignores the features and opens 200×200.

### Drag-and-drop: dockview's default, and why it matters across windows

The demo runs dockview's default `dndStrategy`, `'auto'`: HTML5 drag-and-drop
for mouse input, pointer events for touch and pen. The pointer backend is a
deliberate fallback, not the default, and the distinction matters here: only
an HTML5 drag rides an OS drag session, so only an HTML5 drag can leave the
window it started in. Pointer events stop at the window edge, which makes a
drag between a popout and the main window impossible on the pointer backend
no matter what the host does.

The demo used to force `'pointer'`, on the strength of an HTML5 tab drag in an
embedded webview that rendered a native drag image while the page never got
`dragover`. That symptom is host-specific and now measurable rather than
assumed:

- `?dnd=html5` or `?dnd=pointer` on the URL (or `VITE_DND` at build time)
  forces a backend.
- The Host panel reports the requested strategy and the backends it resolved
  to (`api.dndCapabilities`, since `'auto'` decides from the device), plus a
  live count of drop-overlay events (`api.onWillShowOverlay`): a drag that
  docks a panel without raising it is the pointer path; a count that rises
  during an HTML5 drag means `dragover` reached the page. Both come from
  dockview rather than from reading its DOM.
- Every window is built with `disable_drag_drop_handler()` (the
  `dragDropEnabled: false` window option). Tauri's own drag-drop interception
  is the documented reason HTML5 drag-and-drop misbehaves in WebView2, and
  the demo does not use file drops.

Measured on Linux (WebKitGTK 2.52.6, release build, driven under Xvfb with
`xdotool`) with the HTML5 backend: dragging the Scratch tab into another group
raised the drop-overlay count off zero and docked the panel, with `dragDropEnabled`
at its default and with it off; and dragging a tab out of a popout window
into the main window docked it there and closed the emptied popout. One
harness note: under Xvfb there is no pointing device, WebKit reports a coarse
primary pointer, and `'auto'` therefore resolves to the pointer backend, so
those runs force `VITE_DND=html5`; on a desktop `'auto'` gives HTML5 for the
mouse.

### Dragging between windows

The window side of all of this (the drag interceptor, the workspace and the
shared undo) is `installMultiWindow` from `dockview-enterprise`; this demo
supplies the Tauri transport it reaches the shell through (`src/transport.ts`)
and the shell itself. What follows describes the mechanism as it runs here.

Two native windows are two dockview instances in two JavaScript contexts, so
a tab cannot be dragged between them the way it is dragged between groups.
What does cross a window boundary is an OS drag session, and only an HTML5
drag rides one. The window side is `installMultiWindow` from
`dockview-enterprise`; the shell is the orchestrator, with one command per
call of the package's `MultiWindowTransport` (`src/transport.ts` maps them).
No call names its window: the shell reads it from the window the call arrived
on. No window owns any other:

1. **Drag start.** `onWillDragPanel` / `onWillDragGroup` put a session id on
   the drag's `DataTransfer` under `application/x-dockview-multi-window`,
   serialize what is dragged (a tab's `toJSON()`, or `api.serializeGroup`
   for a group) and hand it to the shell with `start_drag`. Serializing up
   front means the drop can be completed even if the source window is busy
   by then.
2. **Drag over.** The destination's dockview sees a drag it did not start
   and asks through `onUnhandledDragOver`; it is accepted when that type is
   present, so the normal drop overlay and compass show. A browser exposes a
   drag's types but not its data until the drop, which is why the type
   carries the meaning and the session id waits.
3. **Drop.** `onDidDrop` reads the session id, reads the payload with
   `peek_drag` to refuse one whose panel ids it already holds, accepts it
   with `accept_drag`, and rebuilds it where the drop landed with
   `addPanelFromJSON` or `addGroupFromJSON`: next to the target group or at
   a layout edge, or merged into the target group at the tab index the drop
   reports for a drop on its centre or tab bar. A group's id travels with
   it; every window uses `groupIdGenerator` with random ids so it does not
   collide on arrival.
4. **Release.** The first accept wins. The shell removes the session and
   emits `dockview:release` to the source window, which removes its copy of
   the panel or group. A second accept, or an accept for a drag the shell
   never saw, is refused and nothing is added.
5. **Drag end.** The source reports `end_drag`. With the panel's detach
   box ticked, an unaccepted drag becomes a new window that starts with what
   was dragged instead of its default panels (`take_detached_drag` on load),
   the orchestrator's replacement for a popout. It is off by default because
   HTML5 cannot tell a drop on the desktop from an Escape-cancelled drag.

What the whole gesture loses is renderer-held state: the panel is rebuilt
from its serialized `params`, so scroll position, half-typed text and focus
do not survive the crossing. A panel that wants to keep state across windows
has to put it in `params`.

The shell keeps a drag acceptable for 1.5 s after its source reports it
over. That is not a nicety: the source's `dragend` fires the instant the
drop lands in the other window, and the destination's accept is a separate
IPC message that routinely arrives after it. Measured before the grace
period existed, the accept lost that race and was refused as "not in flight".

Measured on Linux (WebKitGTK 2.52.6, debug build, two windows under Xvfb
driven by `scripts/measure-cross-window-drag.py`): dragging the Scratch tab
from the main window onto the right edge of the Host panel in the second
window announced the drag, placed one panel right of the target group in the
second window, and released the panel from the main window, in that order;
a centre drop merged it into the target group instead. Both windows ran the
HTML5 backend, forced with `VITE_DND=html5` since Xvfb reports a coarse
pointer. Every window but the main one names its probe panels with its own
label as a suffix, because a window that already holds a panel of the same
id refuses the drop, by design, before anything is accepted. Not measured:
WKWebView and WebView2, and a group-header drag, which the driver does not
yet perform.

To repeat it, with xdotool and Xvfb installed and the workspace packages
built (`yarn build && yarn build:bundle` at the root):

```sh
Xvfb :99 -screen 0 2400x1000x24 &
VITE_DND=html5 yarn dev &
cargo build --manifest-path src-tauri/Cargo.toml
DISPLAY=:99 python3 scripts/measure-cross-window-drag.py --screenshot after.png
# --where center|left|right|top|bottom|tab chooses the landing;
# --where detach releases the drag outside every window with detach on, so
# the shell opens a new window holding the tab; --undo and --restart extend
# the run.
```

The driver starts the shell with `DOCKVIEW_DEMO_AUTOTEST` set, which opens
the second window at a known position and makes each window report its
panel geometry and the drag log as JSON lines on stdout; the driver turns
the geometry into a pointer drag and judges the result from the log alone.
The log is the demo's: `src/transport.ts` wraps the transport and logs and
counts what passes through it, and the harness mirrors the console warnings
and errors dockview reports its failures with. The Cross-window drag panel's
counters tell the same story interactively: `drags started` rising with
nothing on the other side means the drag never reached the second window;
`drops refused` rising means the drop landed but was refused, and the log
says why.

### Persisting the workspace

Only the party that creates windows can bring them back, so the workspace
is the shell's: one JSON file naming every window, its frame, and its
dockview layout. The dockview part stays in each window, `toJSON` on the
way out and `fromJSON` on the way in; the shell stores the result without
reading it, bar one field: the keys of a layout's `panels` map, so it can
refuse a layout that would give two windows the same panel id, which a drag
between them relies on never happening.

- **Load.** On start the shell reads the file, creates each recorded window
  at its saved position and size, and each window, once dockview is ready,
  asks `load_layout` for its layout and applies it with `fromJSON`. A
  window with nothing on record builds its default panels. The data flows
  from the shell to the window, but the window makes the call: nothing can
  be pushed into a webview before it has loaded, and a reloaded window
  simply asks again.
- **Save.** Each window reports `report_layout` with `api.toJSON()` on a
  debounce; the shell records native moves and resizes itself; a background
  thread writes the file half a second after the last change, to a sibling
  file renamed over the old one, so a crash mid-write leaves the previous
  workspace intact. A final write runs on exit. Nothing is collected from
  windows at shutdown, since a closing webview offers no reliable last
  callback; the shell already holds everything.
- **Close.** Closing the main window closes the app and keeps every window
  on record. Closing any other window removes it, and the panels it held,
  from the workspace.
- **Where.** The app data directory, or the path in `DOCKVIEW_DEMO_WORKSPACE`,
  which the measurement driver points at a fresh temporary file so a run
  never starts from a previous run's layout. Popout windows are not on
  record: they belong to the dockview instance that opened them and travel
  inside its layout.

Measured on Linux (WebKitGTK 2.52.6, under Xvfb) with
`scripts/measure-cross-window-drag.py --restart`: after the Scratch tab had
crossed from the main window into the second, the shell was closed and
started again from the workspace file alone, and both windows came back at
their positions with the same panels, Scratch still in the second window.

### Undo across windows

Each window keeps dockview's own undo history (the enterprise
`layoutHistory` module) for the steps made in it: it records a full layout
before and after each step and restores with `reuseExistingPanels`. What no
window can know is the order of its steps against the moves between
windows, so the shell sequences. Its history is one ordered stack of
markers, "a step in window X" for every step a window reports pushing, and
a full entry for every move between windows, assembled from two halves:
the source's layout before and after it let go, the destination's before
and after it took the group. Undo pops the top: a marker tells that window
to run `api.undo()`; a move applies both windows' pre-move layouts,
destination first so no two windows hold the panels at once. Redo is the
mirror image. Ordering is what makes it safe: a window's older local step
is only reachable after the move that followed it has been undone, which
puts the moved panels back first, so a snapshot can never resurrect a
panel that now lives elsewhere.

Three things the windows do for this. They run `layoutHistory` with
`clearOnFromJSON: false`, since a layout the shell applies arrives through
`fromJSON` and must not wipe the local stack. They report a local push
through `onDidChangeHistory` (a rise in the undo count outside a shell
instruction) and ignore the changes a shell instruction causes. And they
route Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y to the shell; dockview binds no key
of its own. After every move, and every undo or redo of one, the shell
broadcasts `dockview:moved` with the panels and the two windows, which the
interceptor exposes as `onDidMoveAcrossWindows`: the one event app code
needs to follow panels between windows.

Two things learned the hard way. A move's two windows report their layouts
independently and in either order, so the destination can report the moved
panel before the source has reported it gone; the workspace now treats a
duplicate as the announced move rather than a conflict until the source's
report arrives. And a Tauri listener registered for "any" target hears
events emitted to every window, so the first undo applied both windows'
layouts in both windows; events the shell addresses to one window now name
it in the payload and are heard on that window's own target.

Accepted rough edge: a new step anywhere clears the global redo, and the
matching local redo entries in other windows become unreachable from the
shell. Harmless, and their `canRedo` is not shown.

Measured on Linux (WebKitGTK 2.52.6, under Xvfb) with
`scripts/measure-cross-window-drag.py --undo --restart`: after the Scratch
tab had crossed into the second window, undo through the shell put it back
in the main window and out of the second, redo moved it across again, and a
restart from the workspace file brought both windows back with the tab in
the second. The shell reads `undo` and `redo` lines on stdin under the
harness flag, since synthetic key events need a focus the headless display
does not give.

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
cloned in; both answers render it. Before either half was in place the
probes failed independently: the guard refused the `tauri:` scheme, and
`window.open` returned null because no window had an `on_new_window` handler.
Each alone is not enough, and closing needs two more pieces, both in
`src-tauri/src/lib.rs`:

- **The page closing the window.** dockview calls `close()` on a popout when
  its group is closed or redocked. wry answers WebKitGTK's `close` signal by
  destroying the webview widget only, leaving the window on screen blank, so
  the demo destroys the Tauri window from the widget's `destroy`. Windows
  destroys the window in wry itself. macOS is different: wry's UI delegate
  has no `webViewDidClose:`, so `close()` does nothing there and the opener,
  which has IPC, asks the shell instead (`close_popout`, keyed by a label the
  shell injects into the popout document). dockview reports every popout it
  lets go of through `api.onWillClosePopoutWindow`, while the window is still
  there, so `src/main.ts` routes them all through the shell with one listener;
  the `window.open` probe asks directly.
- **The user closing the window.** Nothing, as of dockview 8.4: a native close
  tears the webview down without running the page's unload handlers, so the
  `beforeunload` dockview once relied on never arrives, but it also polls the
  window's `closed` flag and that flag does flip when wry destroys the webview.
  The shell used to hold the close request, tell the page to unload and destroy
  the window afterwards; that is no longer needed.

Measured on Linux: the probe's window closes on `handle.close()`, closing a
popped-out group's last tab closes its window, and closing the popout window
from the window manager returns the group to the main window. That last one was
re-measured with nothing held on the Rust side (WebKitGTK 2.52.6, under Xvfb,
the popout closed with `wmctrl -c`): the opener's handle reported `closed`, and
the group was back in the main window a tick later, with every panel intact.
Windows created through Tauri's own API remain
separate contexts; sharing layout state across those over IPC is still the
route for them, which is what the Native windows and Layout sync panels are
for.

Enterprise features are governed by a licence key; set one with
`LicenseManager.setLicenseKey()` in `src/main.ts` when exercising them. See
<https://dockview.dev/enterprise>.

## Layout

```
docs/           design notes
src/            frontend
  main.ts       builds the dockview instance and its panels
  panels.ts     the five probe panels plus a scratch panel
  transport.ts  the Tauri transport behind dockview-enterprise's installMultiWindow
  autotest.ts   geometry and log reporting for the measurement driver
  host.ts       host-environment detection and the popout URL diagnosis
  probes.ts     window.open probes
  bridge.ts     lazy wrapper over the Tauri IPC surface
scripts/        measure-cross-window-drag.py drives a real drag between two windows
src-tauri/      Rust shell
  src/lib.rs           the host: windows, popouts, the harness
  src/transport.rs     one command per MultiWindowTransport call
  src/persistence.rs   the workspace file
  src/orchestrator/    a Tauri-free port of dockview-enterprise's MultiWindowOrchestrator pieces
popout.html     served at /popout.html, dockview's default popout target
```
