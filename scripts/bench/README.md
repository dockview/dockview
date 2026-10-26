# dockview-core performance harness

A small Playwright + Chrome-tracing benchmark for the layout hot paths in
`dockview-core`: the event **Emitter**, **window-resize** relayout, and **sash
dragging**. It drives the *built* UMD bundle in a real headless Chromium and
reports JS wall time alongside the real Chrome timeline categories (Layout /
Recalc-Style / GC), so it captures actual reflow — not just JS/CPU.

## Prerequisites

- A Chromium for Playwright: `npx playwright install chromium` (once).
  If your environment ships a Chromium at a fixed path instead, point the
  harness at it with `DOCKVIEW_BENCH_CHROME=/path/to/chrome`.
- A built bundle:
  ```sh
  yarn workspace dockview-core build:bundle
  ```
  (produces `packages/dockview-core/dist/dockview-core.js`)

## Usage

```sh
# single bundle — absolute numbers for the current build
node scripts/bench/bench.mjs
# or: yarn bench

# a specific bundle
node scripts/bench/bench.mjs path/to/dockview-core.js

# A/B two bundles — prints the delta (the regression-guard mode)
node scripts/bench/bench.mjs base.js branch.js
```

### Comparing two revisions (regression guard)

Build the baseline and the change into two files, then A/B them:

```sh
git stash                                   # or check out the base revision
yarn workspace dockview-core build:bundle
cp packages/dockview-core/dist/dockview-core.js /tmp/base.js
git stash pop                               # restore your change
yarn workspace dockview-core build:bundle
node scripts/bench/bench.mjs /tmp/base.js packages/dockview-core/dist/dockview-core.js
```

## Config (env)

| var | default | meaning |
| --- | --- | --- |
| `DOCKVIEW_BENCH_CHROME` | Playwright's | explicit Chromium executable path |
| `DOCKVIEW_BENCH_GROUPS` | `24` | dockview groups in the test layout |
| `DOCKVIEW_BENCH_TABS` | `3` | tabbed panels per group |
| `DOCKVIEW_BENCH_REPS` | `5` | repetitions; the **median** is reported |

## Interpreting the output

- **`wall`** — JS execution time including a forced synchronous reflow each
  iteration. This is the number a user feels as jank during a resize/drag.
- **`layout` / `recalc` / `gc`** — Chrome timeline totals over the run
  (Blink Layout, style recalculation, garbage collection). `layout` is the
  actual browser reflow cost.
- Only **relative** deltas within a single A/B invocation are trustworthy.
  Absolute numbers drift with machine load and CPU scaling between runs, so do
  not compare a `base` number from one invocation against a `branch` number
  from another — always A/B them in the same run.
- `sash drag` `layout` often reads ~0: dragging one sash dirties a small region
  that Blink lays out cheaply, so that workload's cost is dominated by `wall`.
- The Emitter `2 listeners` row is expected to be roughly flat — only the 0/1
  listener paths are fast-pathed.

The layout scales with `DOCKVIEW_BENCH_GROUPS`; several hot paths were O(groups)
before optimization, so a larger group count widens the gaps.
