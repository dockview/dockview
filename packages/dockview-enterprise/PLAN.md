# Dockview Enterprise: candidate modules and features

Planning draft, 2026-10-07. Internal working document, not public documentation.

This plan proposes what to build next in `dockview-enterprise`, and what to
deliberately keep free. It is grounded in three inputs:

1. **The codebase as it stands at 8.4.1**: the module system
   (`defineModule`, `ServiceCollection`, `registerModules`), the ten
   enterprise modules already shipped, and the free baseline in core.
2. **Demand on GitHub**: all 74 open issues plus the most-reacted closed ones,
   grouped by theme (see "Demand evidence" at the end).
3. **Market research**: competing docking libraries (GoldenLayout, FlexLayout,
   rc-dock, Lumino, Infragistics, Telerik, jQWidgets, HERE/OpenFin,
   interop.io), open-core comparators (AG Grid, MUI X, Handsontable,
   FullCalendar, Bryntum), professional-app workspace UX (VS Code, JetBrains,
   Visual Studio, Bloomberg/LSEG, Grafana, JupyterLab), browser platform
   status, and enterprise procurement requirements (EAA / EN 301 549 V4.1.1,
   WCAG 2.2, EU CRA, SBOM).

## Gating rule

The rule from the enterprise launch post is kept as the filter for every item
below:

> The free version should aim to never be behind the competition. Enterprise is
> for capabilities no other library gives away, and for the ones used mostly by
> large enterprises.

Concretely: if FlexLayout, rc-dock, GoldenLayout or Lumino ship it free, it
goes in `dockview`. If only commercial desktop vendors (HERE, interop.io,
Infragistics Premium) or no library at all ship it, it is an enterprise
candidate.

## Where enterprise stands today

Shipped in v8: multi-row tabs, pinned tabs, advanced overflow, DnD compass,
smart guides, auto-hide edge groups, dock-to-edge, layout history, keyboard
docking and spatial navigation. Everything is a self-contained service module
with a `ServiceCollection` slot, option-to-module diagnostics, serialization
round-trip and an e2e spec.

Gaps versus the market, in order of how often they appear across competitors
and buyer research:

| Gap | Who has it | Dockview today |
| --- | --- | --- |
| Named workspaces / perspectives with a store, default + reset, versions | interop.io io.Manager, HERE snapshots, VS, JetBrains, JupyterLab, Grafana | `toJSON` / `fromJSON` only |
| Whole-desktop multi-window restore, screen-aware placement, native hosts | VS Code 1.86, HERE, interop.io, Infragistics Premium (Electron) | Popouts restore from JSON; no screen awareness; Tauri demo is a private testbed |
| Admin-provisioned / policy-locked layouts | HERE lock levels, Grafana provisioning, io.Manager entitlements | Boolean `locked` on groups and panels |
| Linked panels / colour channels | LSEG, Bloomberg Launchpad, TradingView, FDC3 user channels, Grafana shared crosshair | Tab group chips are cosmetic only |
| Stacked multi-group sidebars, vertical tab text | VS Code, JetBrains, FlexLayout borders | One group per edge |
| Global MRU quick switcher across groups and windows | VS Code Ctrl+Tab, JetBrains Switcher, Chrome Tab Search | Per-group overflow search |
| Tab decorations (badges, dirty, colour rules, hover cards) | Visual Studio, VS Code, Chrome | Custom tab components only |
| Accessibility Conformance Report, WCAG 2.2 statement | Telerik, DevExpress, Syncfusion | ARIA and live regions, no ACR |
| LTS line, CVE SLA, SBOM | AG Grid v32-lts, Handsontable 24-month LTS | Latest minor only |
| Testing kit, layout devtools, theme builder, Figma kit, design tokens | AG Grid, Telerik, Syncfusion | Internal e2e suite, CSS variables |

## Proposed enterprise modules, ranked

Each entry gives the case, the shape it would take in the existing module
system, and a rough size (S: under two weeks, M: two to six weeks, L: more than
six weeks, counting docs, tests and framework wrappers).

### 1. Workspaces: named layouts, default, reset, versions, storage adapter

**Case.** Every professional application surveyed has this as a first-class
feature, and the financial desktop vendors sell it as the product. Enterprise
customers persist layouts in databases for years, so they also need schema
versioning and migrations. Nothing in the open-source docking space ships an
opinionated manager; dockview has raw JSON only. This is the clearest
"capability nobody gives away" on the list and it composes directly with the
layout history module already shipped.

**Shape.**

- `WorkspacesModule` → `workspaceService`, `dependsOn` `LayoutHistoryModule`.
- Option `workspaces: { storage, default, autoSave, maxVersions, migrations }`.
- API on `DockviewApi`: `saveWorkspace(name)`, `applyWorkspace(name)`,
  `resetWorkspace()`, `listWorkspaces()`, `renameWorkspace`,
  `deleteWorkspace`, `exportWorkspace`, `importWorkspace`,
  `workspaceVersions(name)`, `restoreVersion(name, id)`,
  `onDidChangeWorkspace`, `onDidSaveWorkspace`.
- `IWorkspaceStorage` adapter interface with `localStorage`, in-memory and
  async (server) implementations. Scope keys for per-user and per-project.
- Immutable **Default** workspace supplied by the app, un-deletable, with
  "reset to default" (JetBrains, Visual Studio and Photoshop all do this).
- Auto-save on layout mutation with debounce, bounded version list, diff of
  two versions, restore creates a new version (Grafana model).
- Schema: stamp `schemaVersion` into `SerializedDockview`, ordered migration
  registry, dry-run `validateLayout(json)`, and an explicit policy for unknown
  panel components (placeholder panel vs drop vs reject). Unity and JupyterLab
  show the failure modes when this is missing.
- Keyboard: apply workspace 1 to 9 via a bindable chord; "recently closed
  panel" reopen uses the history stack.

**Size.** L. Storage adapter and manager are M; versioning and migrations are
M; docs and framework wrappers S.

### 2. Multi-window workspace: desktop snapshot, screen placement, native hosts

**Case.** The largest cluster of open popout and floating issues is from
trading-desk style users: process isolation for 10 to 15 ticking popouts
(#1291), redock from inside the popout (#900), restore popout as floating
(#815), ghost groups and broken widgets after popout (#781, #792). VS Code
1.86 restores every floating window with bounds on restart, interop.io
recalculates bounds when a layout saved on an 8K display is restored on a
laptop, and Infragistics gates its Electron multi-window integration as a
premium feature. The private Tauri demo in this repo already probes native
window isolation and cross-process layout sync; productising it is the
shortest path to a feature no open-source library has.

**Shape.** Split into three modules so each can ship independently.

- `MultiWindowModule` → `multiWindowService`, `dependsOn` `PopoutWindowModule`.
  Desktop snapshot in `SerializedDockview` (per-popout bounds, screen id,
  zoom, always-on-top flag), restore with one user gesture per window,
  bounds clamping when the screen set changed, Window Management API
  placement where available (Chromium only, permission-gated) with graceful
  fallback. Document Picture-in-Picture as an "always on top" mode for a
  floating group (Chrome 116+, Firefox 151).
- `WindowBusModule` → `windowBusService`. Typed messages over
  `BroadcastChannel`, leader election over Web Locks, replay-on-join, payload
  validation. Used by multi-window and by linked channels (item 4). Enables
  dragging a tab between the main window and a popout.
- `HostAdapterModule` → `hostAdapterService`. `IHostAdapter` with Electron and
  Tauri implementations: native window creation, native window-state
  persistence, process-isolated popouts via iframe or webview hosting. This is
  also where the host-positioned "virtual" renderer requested in #841 lives:
  dockview calls back with a box and the host places a webview or native
  widget.

**Size.** L overall. MultiWindow M, WindowBus S, HostAdapter L (needs the
Tauri demo turned into a supported sample plus an Electron sample).

### 3. Layout policy: admin-provisioned, role-aware locked layouts

**Case.** HERE exposes granular locks (prevent close, drag, drag in, drag out,
popout) with a visible lock indicator; Grafana refuses UI saves of
provisioned dashboards unless explicitly allowed; SCADA products fix operator
navigation in docked views. On GitHub, users ask to hide panels for
permission gating (#1186) and to lock regrouping in single-tab mode (#728).
Dockview's boolean `locked` is far behind what regulated buyers describe and
nothing open-source ships this.

**Shape.**

- `LayoutPolicyModule` → `layoutPolicyService`.
- Option `layoutPolicy: { resolve: (panel | group) => PanelCapabilities,
  readOnly, indicator }` where capabilities are `close`, `move`, `reorder`,
  `dragIn`, `dragOut`, `popout`, `float`, `resize`, `maximize`, `pin`.
- Admin default layout plus user delta overlay: the app provides a base
  layout; user changes are stored as a delta and "reset to admin default"
  discards the delta. Mandatory panels cannot be closed and are re-created on
  restore if missing.
- Visible read-only indicator and announcements so the policy is discoverable
  (WCAG 2.4.11 and the HERE lock-button pattern).
- Hooks for the context menu and compass so disallowed targets are hidden
  rather than silently refused.

**Size.** M.

### 4. Linked panels: colour channels with context broadcast

**Case.** The single most distinctive behaviour in every financial desktop:
LSEG link colours, Bloomberg Launchpad groups, TradingView sync groups,
FDC3 user channels (eight default colours, a required visible indicator,
last value replayed on join). Observability tools converge on it as shared
crosshair and cursor sync. Dockview began as a layout manager for financial
applications, already has coloured tab group chips, and no open-source
docking library offers a channel model.

**Shape.**

- `PanelChannelsModule` → `panelChannelService`, `dependsOn`
  `TabGroupChipsModule` (core) and optionally `WindowBusModule` for
  cross-window delivery.
- Option `channels: { set: ChannelDefinition[], indicator, allowMultiple }`.
- Panel API: `panel.api.joinChannel(id)`, `leaveChannel()`, `channel`,
  `broadcast(context)`, `onDidReceiveContext`, `getCurrentContext()`.
- Chip or header indicator in the channel colour; context menu item "Link
  to…"; serialization round-trip of channel membership.
- An optional FDC3 desktop-agent bridge so apps on HERE or interop.io map
  dockview channels onto FDC3 user channels.

**Size.** M.

### 5. Stacked edge groups and edge-rail polish

**Case.** The top-reacted open feature thread (#765, with the comment "the only
major feature needed to reach parity with FlexLayout") and two production
forks (#1305, #1306) ask for multiple stacked groups per edge with a sash,
vertical text in side tab strips (#1121) and mutable edge constraints. VS
Code, JetBrains and FlexLayout borders all do this. Auto-hide and dock-to-edge
shipped in v8 but each edge still holds one group.

**Shape.**

- Extend `AutoEdgeGroupModule` and the core edge group service so
  `edgeGroups.left` is an ordered list of groups with a splitview between
  them; serialization migrates the single-group form.
- `vertical tab text` as a header option on edge groups.
- `setEdgeGroupConstraints()` lands in core as a free fix (#1305).

**Size.** M. Stacked groups are enterprise; mutable constraints are free.

### 6. Global quick switcher

**Case.** VS Code's MRU Ctrl+Tab, the JetBrains Switcher and Chrome Tab Search
all let keyboard users find a panel by name across groups and windows and
reopen recently closed ones. Advanced overflow already has per-group search
and MRU; promoting it to a component-wide, cross-window palette is a small
step with high visibility and a natural demo for the enterprise page.

**Shape.** `QuickSwitcherModule` → `quickSwitcherService`, `dependsOn`
`AdvancedOverflowModule`, `LayoutHistoryModule`. Reuses `OverflowListView`
and `MruTracker`. Option `quickSwitcher: { keybinding, includeClosed,
includePopouts }`. API `api.showQuickSwitcher()`.

**Size.** S.

### 7. Tab decorations

**Case.** Visual Studio colours tabs by project, extension or regex rule and
supports hover cards; VS Code shows preview tabs and dirty indicators; Chrome
shows hover thumbnails. Every IDE-like SaaS customer re-implements badges,
dirty dots and hover cards on top of custom tab components. A declarative
layer avoids that and keeps the WCAG 2.2 target-size and announcement rules
in one place.

**Shape.** `TabDecorationsModule` → `tabDecorationService`. Panel API
`panel.api.setDecoration({ badge, dirty, color, tooltip, preview })`,
option `tabDecorations: { colorRules, hoverCard, thumbnails }`. Serialization
of persistent decorations only.

**Size.** M.

### 8. Mobile and responsive mode

**Case.** Issue #930 (7 reactions, a further 8 on a comment) was deliberately
kept open after basic touch drag shipped. FlexLayout advertises iPad and
Android, GoldenLayout has a responsive mode. The free tier already has touch
and pen DnD, so the enterprise piece is the gesture and layout policy on
small screens.

**Shape.** `ResponsiveLayoutModule` → `responsiveLayoutService`. Breakpoint
option that collapses the grid to a tab bar or accordion, swipe-scroll for the
strip, long-press to drag, edge swipe for auto-hide groups, and a
`responsive` serialization that keeps the desktop layout intact for when the
viewport grows again.

**Size.** M.

### 9. Layout devtools inspector

**Case.** Large apps need to see the live layout tree, ids, sizes, policy
state, history and schema version, and support tickets arrive without this
context. TanStack's devtools shell shows the pattern. This is both a feature
and a support-cost reducer for the maintainer.

**Shape.** `DevtoolsModule` → `devtoolsService`, plus a small overlay UI.
`api.openInspector()`, `api.exportDiagnostics()` producing a JSON bundle
(layout, options, module list, licence state, recent mutations) to attach to
support requests.

**Size.** S to M.

### 10. Focus mode and duplicate panel

**Case.** Blender, Unity, JetBrains and VS Code all distinguish "maximise one
panel" from "hide chrome, keep layout". VS Code also mirrors an editor into a
second window. Frequently requested in IDE-like SaaS, lower demand on GitHub.

**Shape.** `FocusModeModule` with `api.enterFocusMode(panel)`, hides headers
and edge groups, keeps keyboard navigation, restores on Escape. A
`duplicatePanel` primitive that renders one panel instance into two groups or
windows with shared state belongs with the multi-window module.

**Size.** S for focus mode, M for duplicate.

## Keep free, do soon

These are the fixes that honour "never behind the competition". Several have
donor PRs or forks waiting.

| Item | Issues | Why free |
| --- | --- | --- |
| Cancelable `onWillClose` / `onWillRemovePanel` | #854, #1011 | Basic lifecycle, 6 reactions |
| Proportional (0 to 1) sizes in all size APIs | #814 | Table stakes; offered PR |
| `dropSizing: 'split' \| 'distribute'` | #1666 | Restores the pre-8.3 behaviour behind an option |
| `onDidSashChange` distinguishing user resize | #1073 | Needed by any persistence layer, including workspaces |
| Redock popout from inside the popout; restore popout as floating | #900, #815 | Popout correctness |
| Hide a single panel, persisted | #1186 | Permission gating is common in free apps too |
| Mutable edge group constraints | #1305 | Correctness of an existing free feature |
| Overflow trigger and popover renderers | #1284 | Self-filed, customisation of a free feature |
| `LayoutPriority.Fill` and freed-space priority | #1378, #590 | Allotment ships priority free; open donor PR #1389 |
| RTL | #388 | Compliance baseline; stalled PR #412 |
| State-preserving DOM moves via `moveBefore()` | none | Core quality; keeps iframes alive on dock, float, maximise. Chrome 133+, Firefox 144+, `insertBefore` fallback for Safari |

Closing housekeeping: #918 and #1377 are answered by the DnD compass, #1283
and most of #765 by auto-hide edge groups, #1648 by `dropOverlayModel`. Close
them with a pointer to the docs so demand signals stay accurate.

## Non-code enterprise offerings

These sell to procurement rather than to developers, cost little engineering,
and are what the comparators charge for.

1. **Accessibility conformance package.** Engineer to WCAG 2.2 AA, in
   particular 2.5.7 Dragging Movements (a non-drag single-pointer alternative
   for every drag: a "Move to…" context menu item that drives the compass by
   click), 2.4.11 Focus Not Obscured (auto-hide and floating groups),
   2.5.8 Target Size (close buttons, splitters, chips). Publish a VPAT 2.5
   INT Accessibility Conformance Report per major, mapping WCAG 2.2, Section
   508 and EN 301 549 V4.1.1, with the test matrix (axe-core, NVDA,
   VoiceOver). The EAA has applied since June 2025 and EN 301 549 V4.1.1 was
   published in September 2026; Telerik, DevExpress and Syncfusion all publish
   ACRs. Make the ACR an enterprise deliverable.
2. **Assurance bundle.** An LTS line with backported security fixes (AG Grid's
   `v32-lts` model; `SECURITY.md` currently patches the latest minor only), a
   contractual CVE response SLA, a CycloneDX SBOM attached to each release,
   a no-telemetry statement and the already-true offline licence validation
   statement. The EU Cyber Resilience Act reporting duties have applied since
   September 2026 and customers will push them down to suppliers.
3. **Support tiers.** Publish response targets (the market norm is 72 hours
   on the base tier and 24 hours with unlimited incidents on the priority
   tier) and a roadmap-vote seat for the top tier.
4. **Testing kit.** Publish stable test ids and a Playwright helper package
   (locators by panel and group id, layout matchers, DnD and keyboard action
   helpers) packaged from the existing `e2e/` suite. Recommend free, since
   AG Grid ships test ids free and it lowers adoption friction.
5. **Design tooling.** A DTCG design-token file for the theme variables
   (free), a Figma kit and a theme builder with live preview and CSS export
   (enterprise). Telerik tiers its theme builder; Syncfusion and AG Grid ship
   kits and builders as part of the paid offer.
6. **Agent surface.** An MCP server or small agent API that arranges and
   queries layouts (open panel, dock to, apply workspace, describe layout).
   Telerik and DevExpress added MCP servers to their suites in 2026; cheap to
   build on top of the public API and on-trend for the enterprise page.

## Suggested sequencing

| Wave | Enterprise | Free | Rationale |
| --- | --- | --- | --- |
| 1 (next minor) | Quick switcher (6), Layout policy (3) | `onWillClose`, proportional sizes, `dropSizing`, `onDidSashChange`, close stale issues | Two visible enterprise wins at low cost while the layout math fixes land |
| 2 | Workspaces (1) with schema versioning, Stacked edge groups (5) | Mutable edge constraints, Fill priority, hide panel, popout redock | Workspaces is the anchor feature of the next major release |
| 3 | WindowBus and Multi-window (2), Linked channels (4) | `moveBefore()` moves, RTL | Multi-window needs the bus; channels reuse it; together they are the financial-desktop story |
| 4 | Host adapters for Electron and Tauri (2), Tab decorations (7), Responsive mode (8) | Testing kit, token file | Desktop hosts productise the Tauri demo; decorations and responsive fill the IDE and mobile gaps |
| Ongoing | ACR, LTS line, SBOM, support tiers, devtools (9), theme builder, MCP server | | Procurement deliverables sold alongside the licence |

## Tiering and pricing notes

- Per-developer per-year with unlimited applications is already a
  differentiator: MUI X, AG Grid and Handsontable now split single- versus
  multi-application licences. Keep unlimited apps and say so prominently.
- The market median for a single enterprise component is roughly 600 to
  1,000 USD per developer per year, suites 1,100 to 1,650. Enterprise floors
  rose in 2026 (MUI X Pro up 66 percent, Sencha subscription-only, Tiptap
  removed its free plan).
- A second tier is justified once the assurance bundle exists: "Enterprise"
  (features, standard support) and "Enterprise Plus" (LTS line, CVE SLA, ACR
  and SBOM deliverables, 24-hour support, roadmap seat, host adapters).
  MUI X and Telerik both run this shape; keep the feature set identical
  between the two tiers so the split is about assurance, not capability.
- Licence keys already carry a `Plan` field, so tier gating needs no key
  format change.

## Implementation conventions for each new module

Follow the existing pattern so each module stays removable and testable:

1. Declare the service and host interfaces in core
   `dockview/moduleContracts.ts` and the slot in `ServiceCollection`; option
   types in core `dockview/options.ts` with an `OPTION_MODULE_RULES` entry.
2. Implement in `packages/dockview-enterprise/src/<name>Service.ts` with
   `defineModule`, declare `options` and `dependsOn`, add to `Modules` and to
   `ENTERPRISE_MODULE_NAMES` (the sync test enforces this).
3. Serialization round-trips through `SerializedDockview`; migrations for any
   shape change.
4. Jest unit spec, a Playwright spec under `e2e/tests`, a docs page under
   `packages/docs/docs`, and a row in the licence comparison table.
5. React, Vue and Angular wrappers only where the feature exposes a
   render slot (decorations, hover cards, inspector).

## Demand evidence

Open-issue themes, counts, and representative issues:

- Edge groups, pinning, auto-hide, sidebar rails: 7 (#765, #1283, #1306,
  #1305, #1121, #1671, #1667)
- Layout sizing, space distribution, size preservation: 16 (#814, #590,
  #1378, #708, #1666, #444, #634, #680, #692, #657, #974, #1230, #1030,
  #1019, #725, #1073)
- Floating groups, popout, multi-window: 11 (#1291, #900, #815, #753, #1018,
  #674, #817, #725, #728, #781, #792)
- Drag and drop: 9 (#918, #1377, #1228, #1648, #561, #636, #547, #734, #906)
- Panel lifecycle, events, visibility: 7 (#854, #1011, #1186, #945, #954,
  #1073, #636)
- Framework bindings and docs: 7 (#897, #1126, #865, #957, #659, #793, #833)
- Tabs and header customisation: 5 (#1284, #976, #335, #1121, #547)
- Rendering model: 3 (#841, #445, #729)
- Mobile and touch: 1 (#930); accessibility and keyboard: 2 (#1052, #1012);
  RTL: 1 (#388)

Competitor references in issues: FlexLayout (#765, #1121), Visual Studio
(#765, #918, #1283, #1377), VS Code (#1228, #1306, #1377, #1052), JetBrains
(#1121, #1306), rc-dock (#918, pgAdmin migrating), GoldenLayout (#841, from a
former maintainer asking for an actively maintained alternative), Bloomberg
style trading desks (#1291, #1377, #1378).

Two external teams maintain production forks and have offered code (#1377 and
#1378; #1305 and #1306). They are the first candidates for design partners on
items 1, 2 and 5.
