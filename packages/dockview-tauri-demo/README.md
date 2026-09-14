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
yarn tauri:dev      # desktop shell (needs a Rust toolchain)
yarn dev            # the same frontend in a browser, for comparison
```

`yarn tauri:build` produces a release bundle. Tauri's
[prerequisites](https://tauri.app/start/prerequisites/) cover the platform
toolchains; on Linux that means the WebKitGTK development packages.

The bundle icon is a single PNG. Run `yarn tauri icon` to generate the full
per-platform icon set if you need a signed, distributable build.

## What each panel is for

**Host** — what the page thinks it is running inside: origin, protocol, webview
engine, and whether dockview would accept this origin as a popout target.

**Popouts** — the popout mechanism, checked in pieces. It reports the popout URL
verdict, probes `window.open` directly (does a handle come back, and is the
document reachable), and pops out its own group.

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
