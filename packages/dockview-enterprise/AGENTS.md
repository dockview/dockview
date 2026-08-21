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
`dockview-core`, not here. `ContextMenu` was briefly hosted here in 8.0-8.2;
see #1610 for why it went back.)

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
