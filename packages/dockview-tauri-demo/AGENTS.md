# AGENTS.md - dockview-tauri-demo

A private Tauri shell hosting dockview. It is a testbed for host-environment
behaviour — popout groups, native window isolation, cross-process layout sync —
not a published package and not a supported example.

## Shape

- `src/` — vanilla TypeScript against `dockview`, deliberately without a
  framework binding so the probes sit directly on the layer that popouts and
  window handling live in. `dockview-enterprise` is imported for its features.
- `src-tauri/` — the Rust shell. Commands: `host_info`, `open_dock_window`,
  `broadcast_layout`, `close_popout`, `workspace_info`, `autotest_report`,
  and one per `MultiWindowTransport` call, named after it (`start_drag`,
  `peek_drag`, `accept_drag`, `end_drag`, `take_detached_drag`,
  `report_move`, `load_layout`, `report_layout`, `report_local_step`,
  `undo`, `redo`, `get_history`). Those take the calling `tauri::Window`
  rather than a window id argument. Window creation lives in Rust so the
  capability set stays at `core:default`.
- `src-tauri/src/orchestrator/` — a port of `MultiWindowOrchestrator`'s pieces in
  `dockview-enterprise` (`packages/dockview-enterprise/src/multiWindow/orchestrator/`):
  `drag_sessions.rs` / `dragSessions.ts`, `workspace_registry.rs` /
  `workspaceRegistry.ts`, `history_sequencer.rs` / `historySequencer.ts`.
  Keep the two in step, including the shapes that cross: `MultiWindowDragPayload`
  (`panel` or `group`), the release's `reason` (`drop` or `detach`),
  `MultiWindowHistoryRequest`, `MultiWindowHistoryInfo` and the workspace file's `WindowRecord`.
  Nothing here imports Tauri: no `AppHandle`, no window handling, no event
  emission. `cargo test` covers it.
- `src-tauri/src/transport.rs` — one command per `MultiWindowTransport` call
  over the orchestrator, the Rust side of `src/transport.ts`.
- `src-tauri/src/persistence.rs` — the workspace file: the atomic
  `FileStore`, written on a debounce and on exit.
- `src-tauri/src/lib.rs` — the host: creating windows (from the workspace
  file at start), recording their frames, popouts, the harness and `run()`.
- The window side (cross-window drag, workspace, shared undo) is
  `installMultiWindow` from `dockview-enterprise`.
- `src/transport.ts` — the Tauri `MultiWindowTransport` over those commands
  and events, created before installing since the Tauri api loads lazily,
  plus the `ShellMultiWindow` wrapper whose log and counters the panels and
  the harness read. The package reports only failures, on the console;
  `src/autotest.ts` mirrors those into the harness log.
- Events the shell addresses to one window (`dockview:history-request`,
  `dockview:release`) name that window in the payload and
  are listened for on the window's own target, never with the global
  `listen`: a listener for "any" target hears events emitted to every
  window. Broadcasts (`dockview:moved`, `dockview:history`) use `listen`.
- `src/autotest.ts` and `scripts/measure-cross-window-drag.py` — the
  measurement harness. With `DOCKVIEW_DEMO_AUTOTEST` in the shell's
  environment a second window opens at a known position and each window
  reports panel geometry and the drag log as JSON lines on stdout; the
  driver turns that into an xdotool drag and judges it from the log, and
  with `--restart` closes the shell and checks both windows come back from
  the workspace file. It points `DOCKVIEW_DEMO_WORKSPACE` at a temporary
  file so no run starts from another's layout. It reads geometry through
  the public api (`panel.view.tab.element`), never by querying dockview's
  DOM.
- `popout.html` — dockview opens `/popout.html` by default, so the host has to
  serve it. It is a second Vite entry point.

## Build / Test

- `dev` / `build:web` — Vite. Requires the workspace packages to be built
  (`yarn build && yarn build:bundle` at the root): the demo imports
  `dockview/dist/styles/dockview.css` and the enterprise bundle from `dist/`.
- `tauri:dev` / `tauri:build` — the desktop shell, driven through the Rust
  `tauri-cli` (`cargo install tauri-cli --version "^2"`). Deliberately not the
  npm `@tauri-apps/cli`: its prebuilt binaries are ~36MB and would land in
  every `yarn install` in the repo, CI included, for a package almost nobody
  builds. Anyone building the shell already needs a Rust toolchain, so the CLI
  costs them nothing extra. Needs Tauri's platform prerequisites; CI does not
  build this.
- `typecheck` — `tsc --noEmit`. There is no JavaScript test target: what
  the frontend verifies cannot be asserted in jsdom. `cargo test --locked`
  in `src-tauri/` covers the orchestrator, and
  `scripts/measure-cross-window-drag.py` measures the real gesture between
  two windows under Xvfb (see the README).

## Conventions

- The frontend must keep working in a plain browser. Every Tauri entry point in
  `bridge.ts` is lazily imported and guarded by `isTauri()`, so the same build
  can be compared side by side in Chrome and in the shell. Do not import
  `@tauri-apps/api` at module scope.
- `src-tauri/Cargo.lock` is committed, as it is for any application crate.
  Update it through cargo rather than by hand, and keep `cargo check --locked`
  passing.
- The probe panels read dockview through its public API, never its DOM or CSS
  classes: `api.dndCapabilities` for the resolved drag-and-drop backends,
  `api.onWillShowOverlay` for drop-overlay activity. The selection shield is
  the one exception, sampled from `user-select` because it is applied and
  released inside a single drag with nothing public to observe.
- `host.ts` asks dockview's exported `getPopoutUrlError` for its verdict rather
  than restating the rules, so the panel cannot drift from the library while
  still explaining *why* a popout would be refused.
- `transport.ts` is the only file that knows both dockview-enterprise's
  multi-window install and Tauri: the install hangs off dockview's public
  hooks and reaches the shell only through the transport `transport.ts` builds
  from `bridge.ts`.
- Closing popout windows goes through `api.onWillClosePopoutWindow` in
  `src/main.ts`, registered once: it covers every popout the component opens,
  including the ones dockview opens for itself (the group context menu, a
  restored layout), which per-call `addPopoutGroup` options do not.
