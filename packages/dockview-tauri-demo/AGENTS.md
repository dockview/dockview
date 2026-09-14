# AGENTS.md - dockview-tauri-demo

A private Tauri shell hosting dockview. It is a testbed for host-environment
behaviour — popout groups, native window isolation, cross-process layout sync —
not a published package and not a supported example.

## Shape

- `src/` — vanilla TypeScript against `dockview`, deliberately without a
  framework binding so the probes sit directly on the layer that popouts and
  window handling live in. `dockview-enterprise` is imported for its features.
- `src-tauri/` — the Rust shell. Three commands: `host_info`,
  `open_dock_window`, `broadcast_layout`. Window creation lives in Rust so the
  capability set stays at `core:default`.
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
- `typecheck` — `tsc --noEmit`. There is no test target: what this package
  verifies cannot be asserted in jsdom.

## Conventions

- The frontend must keep working in a plain browser. Every Tauri entry point in
  `bridge.ts` is lazily imported and guarded by `isTauri()`, so the same build
  can be compared side by side in Chrome and in the shell. Do not import
  `@tauri-apps/api` at module scope.
- `src-tauri/Cargo.lock` is committed, as it is for any application crate.
  Update it through cargo rather than by hand, and keep `cargo check --locked`
  passing.
- `host.ts` mirrors dockview's internal `assertSameOriginPopoutUrl` guard. If
  that guard changes in `dockview-core`, mirror the change here — the whole
  point of the panel is to explain *why* a popout would be refused.
