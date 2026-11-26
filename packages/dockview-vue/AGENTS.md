# AGENTS.md - dockview-vue

Vue 3 bindings for dockview.

## Overview

- Uses Vue SFCs (`.vue` files) and composition API
- Peer dependency: `vue ^3.4.0`
- Runtime dependency: `dockview` (re-exports `dockview-core`)

## Build

- `build:js` - Vite build (produces ES, UMD, and CJS outputs)
- `build:types` - Type declarations via `vue-tsc` (`tsconfig.build-types.json`)
- `build:css` - Copies CSS from `dockview-core` (`node scripts/copy-css.js`)
- `build` - All three above in sequence
- `build:bundle` - No-op (`echo 'noop'`), Vite already produces all needed formats
- `clean` - Remove `dist/`, `.build/`, `.rollup.cache/`

## Testing

- `test` - Vitest (`vitest run`) with `@vue/test-utils`; the `dockview` package must be built first, as the SFC compiler resolves prop types from its `dist`
- Config: the `test` block in `vite.config.ts`

## Config Files

- `tsconfig.json` - Project references
- `tsconfig.app.json` - App/source config
- `tsconfig.build-types.json` - Declaration-only build config
- `vite.config.ts` - Vite build configuration

## Dependencies

- Depends on: `dockview` (must be built first; build chain: dockview-core -> dockview -> this)
