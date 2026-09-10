# AGENTS.md - docs

Documentation website built with Docusaurus v3.

## Writing Style

Documentation prose should read as though a person wrote it, not a language
model. When writing or editing docs:

- Do not use em dashes (`—`). Rewrite the sentence with a comma, colon,
  semicolon, parentheses, or a full stop, whichever fits. This is the single
  most common tell; avoid it everywhere, including frontmatter `description`
  fields, tables, and code comments.
- Drop filler and marketing words. Avoid "comprehensive", "a wide variety of",
  "out of the box", "seamlessly", "powerful", "robust", "unlocks", "leverage",
  "delve into", "first-class", "it's worth noting", "keep in mind". State the
  concrete thing instead.
- Prefer short, direct sentences. Cut words that carry no meaning; don't hedge
  or pad.
- Keep British spelling (behaviour, colour, localise) to match the existing
  docs.
- An en dash in a numeric range (`v5.0–5.2`) is correct and fine to keep.

## Build Commands

- `build` - Build templates then build Docusaurus site
- `start` - Start dev server (Docusaurus + ESM server via concurrently)
- `build-templates` - Generate framework example templates from source
- `build-templates:local` - Generate templates using local package references
- `typecheck` - Run TypeScript type checking

**Do NOT format the docs package.** It is deliberately excluded from Prettier / `nx format` / `format:check`. Don't run Prettier on files under `packages/docs/` and don't "fix" formatting warnings here — CI does not check it.

## Documentation Structure

### Auto-Generated Content

- `static/templates/` - Auto-generated from `templates/` source directory. Do not edit manually.
- Templates contain examples for plain TypeScript plus the supported frameworks: React, Vue, and Angular

### Live Examples (`<CodeRunner>` + `templates/`)

**This is where docs examples live.** A page embeds a live example with `<CodeRunner id="dockview/<id>" />`. That renders an iframe pointing at `/templates/dockview/<id>/<framework>/index.html`, generated from `templates/` by `scripts/buildTemplates.mjs`. So:

- The example SOURCE for `id` lives in `templates/dockview/<id>/{react,typescript,vue,angular}/` (each a small standalone app: `react/{package.json,tsconfig.json,src/index.tsx,src/app.tsx}`, `typescript/src/index.ts`, etc.). Copy an existing complete example (e.g. `templates/dockview/tab-overflow/` or `templates/dockview/layout-history/`) as the skeleton and only change the dockview options + panel setup.
- **New examples go in `templates/`, NOT `sandboxes/`.** `sandboxes/react/dockview/<id>/` folders are NOT what `CodeRunner` renders.
- The docs framework switcher's **"JavaScript" tab maps to the `typescript/` folder** — a `typescript/` variant is required for the default view to render. A missing framework folder 404s that tab (`buildTemplates.mjs` `continue`s past absent frameworks), so provide all four for full parity.

### Sandboxes (legacy)

- `sandboxes/` - **All per-feature example sandboxes were migrated to `templates/` and deleted.** The ONLY remaining sandboxes are `sandboxes/react/dockview/demo-dockview` and `demo-dockview-mobile`, both used exclusively by the `/demo` page (`src/pages/demo.tsx`) via `src/components/ui/exampleFrame.tsx` (a dynamic `import()`). Every docs `<CodeRunner>` embed now points at a `templates/` example.
- **All `templates/dockview/*` examples cover all four frameworks** (react/vue/angular/typescript), except `demo-dockview` (react+angular, deliberately exempt). Non-react variants are a single `src/index.ts`; the enterprise `LicenseManager` boilerplate belongs ONLY in templates whose feature is actually enterprise (grep the react variant — if it has no `LicenseManager`, the feature is free/core and the other variants must not add it either).
- Do NOT add new sandboxes — add a `templates/` example (all four frameworks). Some `package.json` deps that only served the deleted sandboxes may now be prunable — check before removing.

### Framework Examples

Any page that includes examples should provide implementations for:

- Vanilla TypeScript
- React
- Vue
- Angular

Use the React component `FrameworkSpecific` to organize and display framework-specific examples on documentation pages. Use `<CodeRunner id="dockview/<id>" />` for the runnable embed (sourced from `templates/`, per above).

## Supported Frameworks

The project supports the following frameworks:

- React
- Vue
- Angular
- Vanilla TypeScript (framework-agnostic)
