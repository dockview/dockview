# AGENTS.md - dockview-enterprise

The separately-published **enterprise** package: dockview's paid feature modules
plus the license gate. Depends only on `dockview` (the free package) at an exact
version and re-exports it (`export * from 'dockview'`), so it is a drop-in
superset of the free package. Importing it self-registers its modules + the
license check.

## Modules hosted here

`src/index.ts` exports each module + service and a `Modules` bundle array, then
calls `registerModules(Modules)` at import (a side effect — hence
`sideEffects: true` in package.json).

- `KeyboardNavigationModule` (`keyboardNavigationService.ts`) — `dependsOn`
  `AdvancedDnDModule` + `LiveRegionModule` (both in core)
- `LayoutHistoryModule` (`layoutHistoryService.ts`)
- `DndCompassModule` (`dndCompassService.ts`) — `dependsOn` `AdvancedDnDModule` (core)
- `SmartGuidesModule` (`smartGuidesService.ts`) — `dependsOn` `FloatingGroupModule` (core)
- `AutoHideEdgeGroupModule` (`autoHideEdgeGroupService.ts`) — `dependsOn` `EdgeGroupModule` (core)
- `AutoEdgeGroupModule` (`autoEdgeGroupService.ts`) — `dependsOn` `EdgeGroupModule` (core)
- `MultiRowTabsModule` (`multiRowTabsService.ts`)
- `PinnedTabsModule` (`pinnedTabsService.ts`)
- `AdvancedOverflowModule` (`advancedOverflowService.ts`)
- `KeyboardDockingModule` (`keyboardDockingService.ts`) — `dependsOn` `AdvancedDnDModule` + `LiveRegionModule` (core)
- `LicenseModule` (`licenseService.ts`) — the license gate; renders a corner
  watermark unless a valid key is set. Supported by
  `LicenseManager` (`licenseRegistry.ts`), the pure verifier
  (`licenseValidator.ts`), and the build-stamped `DOCKVIEW_RELEASE_DATE`
  (`releaseDate.ts`).

(`AdvancedDnD`, `TabGroupChips` and `ContextMenu` are FREE and live in
`dockview-core`, not here.)

## Multi-window layouts (`src/multiWindow/`)

Not a module: one function over the public `DockviewApi`, exported from the
index with nothing to register. The window side of a layout spread over
several windows or processes, reaching an orchestrator only through the
`MultiWindowTransport` interface (`transport.ts`). A transport belongs to one
window: `windowId` is a plain property and no call takes a window id.

Window side, each a `CompositeDisposable` with `Emitter` events like the rest
of dockview; failures go to `console.error`/`console.warn` with a `dockview:`
prefix, as core reports its own:

- `multiWindow.ts` (`installMultiWindow` returning a `MultiWindow`): the public
  install, composing the three internal pieces below. Only the `MultiWindow`
  type is exported.
- `crossWindowDnd.ts` (`CrossWindowDnd`): a drag's `DataTransfer` carries a
  session id; the orchestrator carries the payload (`MultiWindowDragPayload`: a panel's
  `toJSON()` or `serializeGroup` output); the drop rebuilds it with
  `addPanelFromJSON` / `addGroupFromJSON`.
- `windowWorkspace.ts` (`WindowWorkspace`): `fromJSON` in at start, `toJSON`
  out on every change.
- `sharedHistory.ts` (`SharedHistory`): reports local steps, carries out the
  `MultiWindowHistoryRequest`s that come back.

Orchestrator side, `orchestrator/`:

- `multiWindowOrchestrator.ts` (`MultiWindowOrchestrator`, exported): an orchestrator
  for one heap, composed from the pure `dragSessions.ts`,
  `workspaceRegistry.ts` and `historySequencer.ts` (not exported; tests import
  them directly), which the Tauri demo ports to Rust in
  `packages/dockview-tauri-demo/src-tauri/src/orchestrator/`. Keep the two
  in step.

Narrow drag events with a `'dataTransfer' in event` check, not
`instanceof DragEvent`: jsdom defines neither `DragEvent` nor `DataTransfer`,
and `multiWindow.spec.ts` drives real drags with a fake `DataTransfer`.

## How it fits the module system

- Core owns the contracts: the `ServiceCollection` slots and `IFooService` /
  `IFooHost` interfaces in `dockview-core` (`dockview/moduleContracts.ts`);
  option types stay in core (`dockview/options.ts`). The license slot is the one
  exception — it is declaration-merged onto `dockview`'s `ServiceCollection`
  from `licenseService.ts` (never declared in core).
- These files import everything they need from **`dockview`** (which re-exports
  all of `dockview-core`) — NOT from `dockview-core` directly. No `dist/` deep
  imports.
- Registration is global + automatic: this package calls
  `registerModules(Modules)` at import, so `import 'dockview-enterprise'`
  activates the modules + license for every `DockviewComponent` in the process.

## Build / Test

- `build` - `tsc` declarations only (`emitDeclarationOnly`; no CSS, styles live
  in core). The runtime JS ships as the rolldown bundles.
- `build:bundle` - rolldown; externalizes `dockview`. Emits the CJS/ESM package
  entries (`dist/package`) and UMD bundle, and stamps the build date into
  `releaseDate.ts` (replacing the `__DOCKVIEW_RELEASE_DATE__` token) for
  version-based license expiry.
- `test` - Jest with `@swc/jest` (jsdom). `src/__tests__/registerModules.ts` registers `Modules`
  globally so a default `DockviewComponent` in tests has the full feature set;
  ResizeObserver/PointerEvent jsdom mocks are reused from core. It also seeds a valid license key so `LicenseModule`'s
  watermark does not affect the feature suites.

## Dependencies

- Depends on: `dockview` (exact version). Build chain: `dockview-core` ->
  `dockview` -> `dockview-enterprise`.
