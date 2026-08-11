# Demo clip recorder

Automated screen-capture of Dockview in action — a scripted mouse glides over a
live example and the session is recorded to an MP4, ready to drop into a LinkedIn
post, forum thread, or README.

It drives a real Chromium (via the `playwright` API that ships with the repo's
`@playwright/test` devDependency — no extra npm dependency) and transcodes the
result with the system `ffmpeg`.

## Describe it, get a film (prompt-driven)

The fastest path: describe the features you want and the recorder assembles a
cinematic reel on the cinematic movie stage (1080p) — an intro title card, the
requested feature beats in a sensible order, and a branded end card.

```bash
# from packages/docs
yarn record-clips --prompt "floating panels, then pop out to a second monitor, and theming"
yarn record-clips --features float,theming,popout --name my-clip
yarn record-clips --prompt "a full tour of everything"
yarn record-clips --list-features
```

- `--prompt "…"` matches your words against each feature's aliases (see
  `beats.mjs`) and includes every feature it finds; nothing matched falls back to
  a short default reel.
- `--features a,b,c` selects features explicitly by id (bypasses matching).
- `--name <id>` sets the output filename (`<id>.mp4`); defaults to `prompt`.
- `--headline / --subhead / --tagline / --eyebrow` override the title/end-card copy.
- Prompt clips need only the built bundles (no docs dev server).

Each feature is a self-contained **beat** in `beats.mjs` — it builds whatever it
needs, demonstrates one capability with an eased cursor + caption, and tidies up,
so any subset strung together still flows. `promptCompose.mjs` does the matching
and wraps the beats with the title / end cards. To add a capability, append a beat
to `beats.mjs` (give it `aliases` for prompt matching); it is instantly available
to `--prompt`, `--features` and the `everything` tour.

## Panels

The movie stage (`harness/movie.html`) renders the **real `/demo` trading panels**
(order book, chart, watchlist, positions, news, correlation, signals, …), so a
clip shows the genuine product, not mock widgets. They are the React components
from `sandboxes/react/dockview/demo-dockview/src`, bundled by
`harness/panels.bundle.js` from `demo-dockview/src/harnessPanels.tsx`, which
exposes `window.MovieWidgets.mount(el, kind, title)`. All panels render through
one shared market simulation (via React portals) so prices stay consistent across
the desk. Rebuild the bundle after changing a demo panel:

```bash
# from packages/docs
yarn build:harness-panels
```

A scene's panel `kind` (`chart`, `depth`, `positions`, `watch`, `heat`, …) maps
to a demo component in `harnessPanels.tsx`.

## Prerequisites

- **ffmpeg** on your `PATH` (`ffmpeg -version`).
- **Chromium** installed for Playwright (first time only):
  ```bash
  yarn playwright install chromium
  ```
- **For the standalone `harness://` shell scenes** (the recommended path): the built
  UMD bundles. Build once (they rarely change):
  ```bash
  yarn nx run-many -t build:bundle -p dockview dockview-enterprise
  ```
  The recorder serves these itself — no docs dev server needed for shell scenes.
- **For `/demo` and `templates/…` scenes only:** the docs dev server, in another
  terminal (`cd packages/docs && yarn start`), plus `yarn build-templates` for template
  scenes.

## Two ways to frame a clip

1. **Standalone presentation harness (recommended for marketing).**
   `harness/index.html` is a self-contained page — deliberately NOT part of the docs
   website, so there is no navbar or newsletter widget. It loads the built dockview
   bundles, sets the docs licence key (so there's **no enterprise watermark**), and
   renders a dockview inside a titled, bordered "window" with fully controlled
   surroundings. It's URL-driven — scenes use a `harness://` URL:
   `harness://?preset=<id>&title=<t>&subtitle=<s>&theme=<name>`. Presets (`ide`,
   `basic`, `tabs`, `floating`, `dashboard`) and their content live in
   `harness/index.html`. The `shell-*` scenes use this; it's the format the
   **`record-demo` skill** authors. **Gesture caveat:** because the harness mounts
   dockview in a nested container, a synthetic mouse reliably drives **floating-group
   drags and clicks**, but NOT sash resizes or tab DnD — those only respond on
   dockview's full-viewport mount (the templates). For a mouse-driven **resize** clip,
   use a template scene like `resize-panels`.
2. **A real page (`/demo` or a `templates/…` example).** Records the actual product
   surface. The recorder strips docs chrome (newsletter, unlicensed watermark) and can
   `--crop` to the dockview area. Note: these pages use HTML5 tab DnD, which a synthetic
   mouse can't drive — only floats/resizes/clicks record there.

## Usage

```bash
# from packages/docs
yarn record-clips                        # record every scene
yarn record-clips --scene demo-tour      # one scene
yarn record-clips --scene demo-tour --crop        # crop to the dockview area
yarn record-clips --scene demo-tour --keep-webm   # keep the raw .webm too
yarn record-clips --scene demo-tour --headed      # watch it happen
```

Clips land in `scripts/record/out/` (git-ignored) as `<scene-id>.mp4`.

### Flags

| Flag          | Default                 | Meaning                                          |
| ------------- | ----------------------- | ------------------------------------------------ |
| `--prompt`    | –                       | Compose a reel from a plain-English description.  |
| `--features`  | –                       | Compose a reel from explicit feature ids.        |
| `--name`      | `prompt`                | Output filename for a prompt/feature reel.       |
| `--list-features` | –                   | Print the feature catalogue and exit.            |
| `--scene`     | `all`                   | Scene id (see `scenes.mjs`) or `all`.            |
| `--url`       | –                       | Override the scene URL (single-scene only).      |
| `--chrome`    | auto                    | Path to a Chromium binary (else auto-detected).  |
| `--theme`     | scene's theme           | Theme for `/demo`-style pages (`?theme=`).       |
| `--size`      | `1280x720`              | Viewport / video size, `WxH`.                    |
| `--speed`     | `1.5`                   | Cursor speed multiplier (higher = faster travel).|
| `--server`    | `http://localhost:3000` | Base URL of the docs server (real-page scenes).  |
| `--out`       | `scripts/record/out`    | Output directory.                                |
| `--crop`      | off                     | Crop the MP4 to the scene's `cropSelector`.      |
| `--keep-webm` | off                     | Keep the raw Playwright `.webm` alongside MP4.   |
| `--headed`    | off                     | Run with a visible browser window.               |

## How it works

- **Synthetic cursor.** Playwright's real pointer isn't captured in video, so an
  init script injects a cursor `<div>` that tracks `mousemove` (with a click
  ripple). The choreography only drives `page.mouse.*`; the visible cursor follows.
- **Eased motion.** Travel follows a quadratic bézier arc (gentle curve, flipping
  side each move) with a cubic ease-in-out speed profile — accelerating off the mark
  and easing into the target — for a natural, human-looking glide. Tune pace with
  `--speed`.
- **Recording.** A browser context with `recordVideo` produces a `.webm`, which
  ffmpeg transcodes to H.264 MP4 (`yuv420p`, `+faststart`), optionally cropped, with the
  dead loading head trimmed.
- **Serving.** `harness://` scenes are served by a throwaway static server rooted at the
  repo root (so the harness can load the built bundles); `/…` scenes hit `--server`.

## Adding a scene

Append an entry to `scenes.mjs`. In the **harness**, a synthetic mouse drives
floating-group moves (`.dv-floating-titlebar`) and clicks reliably, but not sash/tab
DnD (nested-container limitation). On the **templates** (`resize-panels` etc.), sash
resizes (`.dv-sash`) work — those mount dockview full-viewport — but native HTML5 tab
DnD does not. So: floats + clicks in the harness; sash resizes on templates.

```js
{
    id: 'my-clip',
    url: 'harness://?preset=floating&title=My%20feature',
    theme: 'abyss',
    steps: [
        { action: 'move', to: { selector: '.dv-floating-titlebar' }, duration: 700 },
        { action: 'pause', ms: 400 },
        // A single continuous drag through several points (stays floating while
        // held); `to: {x,y}` is shorthand for one waypoint.
        { action: 'drag', from: { selector: '.dv-floating-titlebar' },
          waypoints: [{ x: 480, y: 420 }, { x: 300, y: 220 }], dwell: 250 },
    ],
}
```

See the header of `scenes.mjs` for the full step/target grammar.
