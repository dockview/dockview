# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dockview is a zero-dependency layout manager supporting tabs, groups, grids and splitviews. It provides framework support for React, Vue, Angular, and JavaScript. The project is organized as an NX monorepo (package-based approach) with Yarn v1 workspaces.

See per-package `AGENTS.md` files under `packages/` for package-specific guidance.

## Development Commands

> **Use Yarn, not npm.** This repo is a **Yarn v1** workspaces monorepo. Install
> dependencies with `yarn install` (or just `yarn`) and run every script through
> `yarn <script>`. Do **not** run `npm install`/`npm ci`/`pnpm install` at the
> repo root — they ignore the workspace protocol and `yarn.lock`, and will
> corrupt the linked local packages. The `npm install dockview`/`dockview-react`
> lines elsewhere in this file are end-user consumer instructions for the
> published packages, not commands for developing in this repo.

### Build

-   `yarn build` - Build all publishable packages via NX (dockview-core, dockview, dockview-vue, dockview-react, dockview-angular)
-   `yarn clean` - Clean all packages
-   `npx nx run <package>:<script>` - Run a specific script for a single package (e.g. `npx nx run dockview-core:build`)

### Build Order

NX handles build ordering automatically via `dependsOn: ["^build"]`. The dependency chain is:

    dockview-core → dockview → dockview-react
    dockview-core → dockview → dockview-vue
    dockview-core → dockview → dockview-angular

### CSS Flow

-   `dockview-core` compiles SCSS to CSS via Gulp (`gulp sass`)
-   All other packages copy CSS from `dockview-core` using `scripts/copy-css.js`

### Testing

-   `yarn test` - Run Jest tests across all packages via NX
-   `yarn test:cov` - Run tests with coverage (root-level Jest invocation for SonarCloud unified coverage)

### Linting & Formatting

-   `yarn lint` - Run ESLint across all packages via NX
-   `yarn lint:fix` - Run ESLint with automatic fixing
-   `yarn format` - Run Prettier across all packages
-   `yarn format:check` - Check Prettier formatting

### Documentation

-   `yarn docs` - Generate TypeDoc documentation

### Release

-   `yarn release` - NX release (fixed versioning, all packages share same version)
-   `yarn release:version` - Bump version
-   `yarn release:publish` - Publish to npm

## Architecture

### Monorepo Structure

-   **packages/dockview-core** - Internal core layout engine (TypeScript, framework-agnostic, zero dependencies). Not a documented install target — consumers use `dockview` or a framework binding.
-   **packages/dockview** - Canonical JavaScript package (`npm install dockview`). Batteries-included: re-exports the core API and registers the separable feature modules. No `react` peer dependency.
-   **packages/dockview-react** - Canonical React bindings package — what docs, READMEs, and examples point users at (`npm install dockview-react`). Holds the actual React source and depends on `dockview`.
-   **packages/dockview-vue** - Vue 3 bindings and components
-   **packages/dockview-angular** - Angular bindings and components
-   **packages/docs** - Documentation website (Docusaurus v3)

### Key Components

#### Core Architecture (dockview-core)

-   **DockviewComponent** - Main container managing panels and groups
-   **DockviewGroupPanel** - Container for related panels with tabs
-   **DockviewPanel** - Individual content panels
-   **Gridview/Splitview/Paneview** - Different layout strategies
-   **API Layer** - Programmatic interfaces for each component type

#### Framework Integration

-   Framework-specific packages provide thin wrappers around core components
-   React package uses HOCs and hooks for component lifecycle management
-   Vue package provides Vue 3 composition API integration
-   All frameworks share the same core serialization/deserialization logic

#### Key Features

-   Drag and drop with customizable drop zones
-   Floating groups and popout windows
-   Edge groups (pinned to layout edges with collapse/expand)
-   Tab groups (colored chip-based visual tab organization)
-   Serialization/deserialization for state persistence
-   Theming system with CSS custom properties
-   Comprehensive API for programmatic control

### Build System

-   **NX** for monorepo orchestration (package-based, `useInferencePlugins: false`)
-   **Yarn v1** for package management and workspaces
-   **TypeScript** (`tsc`) for CJS + ESM compilation
-   **Gulp** for SCSS processing (dockview-core only)
-   **Rollup** for UMD bundles (dockview-core, dockview, dockview-react)
-   **Vite** for Vue package builds
-   **ng-packagr** for Angular Package Format builds

### Testing Strategy

-   Jest with ts-jest preset for TypeScript support
-   Testing Library for React component testing
-   Coverage reporting with SonarCloud integration
-   Each package has its own jest.config.ts extending root configuration

### Code Quality

-   **Bug fixes must not change expected behaviour.** A fix corrects the
    defect and nothing else — it must not alter behaviours that are working as
    intended, even when a broader "improvement" is tempting and tests still
    pass. If the only way to fix a bug is to change a long-standing, relied-upon
    behaviour (e.g. the even size redistribution when a panel/group closes), do
    **not** silently change the default: stop and raise it with the maintainer,
    and prefer gating any behavioural change behind an opt-in option. Passing
    tests are necessary but not sufficient here — the absence of a test
    asserting the old behaviour is not permission to change it.
-   ESLint configuration extends recommended TypeScript rules
-   Prettier for code formatting
-   Linting targets source files in packages/\*/src/\*\* (excludes tests, docs, node_modules)
-   Current rules focus on TypeScript best practices while allowing some flexibility
-   **SonarCloud must introduce no new issues.** Every PR runs a SonarCloud
    analysis (the `sonar` check). A PR is not ready to merge while it reports
    any new issues, even if the Quality Gate still passes — treat "New issues:
    0" as the bar, not just a green gate. Before pushing, self-review the diff
    for the smells Sonar flags (redundant `?? {}` / `|| {}` in a spread,
    unused code, needless casts, cognitive-complexity spikes) and fix them in
    the same PR. If Sonar reports a new issue, fix it (or, if genuinely a false
    positive, mark it Won't Fix / Accepted in SonarCloud with a justification)
    before merging. Fetch the exact findings from
    `https://sonarcloud.io/api/issues/search?componentKeys=dockview_dockview&pullRequest=<PR>&issueStatuses=OPEN,CONFIRMED&resolved=false`
    rather than trusting the summary comment, which can lag a commit behind.

## Development Notes

### Working with Packages

-   Use NX commands for cross-package operations (`npx nx run-many -t <target>`)
-   Each package can be built independently via `npx nx run <package>:build`
-   Core package must be built before framework packages (NX handles this automatically)

### Adding New Features

-   Start with core package implementation
-   Add corresponding API methods in api/ directory
-   Create framework-specific wrappers as needed
-   Update TypeDoc documentation
-   Add tests in \_\_tests\_\_ directories
-   Run `yarn lint` to check code quality before committing

### State Management

-   Components use internal state with event-driven updates
-   Serialization provides snapshot-based state persistence
-   APIs provide reactive interfaces with event subscriptions

### Coding Conventions

-   When fixing a bug, write a failing test that reproduces it first, then make it pass.
-   Code comments describe the current state of the code, not its history. Don't reference the fix, PR, or what changed unless that context is critical to understanding the code as it stands.
-   Keep comments brief and concise.

### Public Documentation

-   **Refrain from mentioning `dockview-core` in public-facing documentation.** It is
    an internal module, not a supported install target. This covers the root README,
    the docs site, blog posts, release notes, and the published package READMEs.
-   Point consumers at `dockview` or a framework binding (`dockview-react`,
    `dockview-vue`, `dockview-angular`) instead. Where a dependency graph or build
    order would otherwise name it, describe the chain from `dockview` onwards.
-   Only refer to `dockview-core` where its internal nature is itself the point (for
    example, contributor-facing notes in this file), and say that it is internal when
    you do.
-   **The module system is an internal concept — don't mention it in public-facing
    documentation.** Avoid "modules", "feature modules" and `registerModules` in the
    surfaces listed above. Describe what the user gets and what they do ("importing
    the package enables the enterprise features"), not how registration works
    internally. Angular's `DockviewAngularModule` is an unrelated Angular NgModule
    and is fine to name.
-   **Don't enumerate the enterprise features** in READMEs or package docs. The
    canonical list lives on <https://dockview.dev/enterprise>; link to it instead.
    An inline list duplicates that page and drifts out of date as the feature set
    changes.
-   **Don't document the unlicensed behaviour.** Public docs should not say that
    dockview keeps working without a valid licence key, or describe the watermark.
    State that enterprise features are governed by a licence key and link to the
    enterprise page; don't present the key as optional.

## Release Management

### Creating Release Notes

Release notes are stored in `packages/docs/blog/` with the naming format `YYYY-MM-DD-dockview-X.Y.Z.md`.

To create release notes for a new version:

1. Check git commits since the last release: `git log --oneline --since="YYYY-MM-DD"`
2. Create a new markdown file following the established format:
   - Front matter with slug, title, and tags
   - Sections for Features, Miscs, and Breaking changes
   - Reference GitHub PR numbers for significant changes
   - Focus on user-facing changes, bug fixes, and new features

Example format:
```markdown
---
slug: dockview-X.Y.Z-release
title: Dockview X.Y.Z
tags: [release]
---

# Release Notes

Please reference docs @ [dockview.dev](https://dockview.dev).

## Features
- Feature description [#PR](link)

## Miscs
- Bug: Fix description [#PR](link)
- Chore: Maintenance description [#PR](link)

## Breaking changes
```

## Linear issue workflow

When the work maps to a Linear issue (the user names an issue identifier such as
`ABC-123`, or the task/branch references one), keep the issue's state in sync via
the Linear MCP tools. Linear's native GitHub integration is the source of truth
for status transitions; these steps make Claude's updates align with it and cover
the in-session gaps.

1.  **Starting work** — set the issue to **In Progress** (Linear `save_issue`
    with `state: "In Progress"`) before making changes. Skip if it's already
    In Progress / Done.
2.  **Opening a PR — link the issue(s).** How to link depends on how many
    issues the PR resolves:
    -   **Exactly one issue** — put the identifier in the **branch name** and
        the **PR title** (e.g. branch `matthew/dv-52-maximum-width`, title
        `fix(DV-52): maximumWidth axis swap`). Prefer the branch name Linear
        generates for the issue ("Copy git branch name") so linking is
        automatic on push. If the branch name can't carry the identifier — most
        often an agent branch assigned as `claude/...`, which Linear does not
        auto-link — fall back to a `Fixes <ID>` magic word in the description.
    -   **More than one issue** — a branch name/title can only carry one
        identifier, so instead add a Linear magic word for **every** issue in
        the PR **description**, one per line: `Fixes <ID>` / `Closes <ID>`
        (e.g. `Fixes ABC-123`).

    Magic words (`Fixes` / `Closes` / `Resolves`) are what auto-complete the
    issue on merge; a bare identifier in the title/branch links the PR but
    relies on the integration's PR-merged→Done status mapping to close it. When
    in doubt, include the magic word.
3.  **On merge** — when a watched PR merges (the merge webhook arrives during a
    session), set each resolved issue to **Done** (Linear `save_issue` with
    `state: "Done"`) as a backup in case the native integration's status
    mapping isn't configured. Idempotent — skip if already Done.

Do not change Linear state for issues the user hasn't asked you to work on, and
don't reopen or duplicate issues.
