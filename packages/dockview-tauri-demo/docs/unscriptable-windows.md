# Popout groups in a window dockview cannot script

A design note. It asks what dockview would need so an application can run a
group in a window whose JavaScript context the opener cannot reach, answers
each sub-question with a measurement, and recommends doing nothing to the API
yet.

Everything below was measured against this branch. The core package named
throughout is internal; consumers see `dockview`. Measurements ran as
throwaway Jest specs in that package under jsdom, and are reproducible from the
descriptions given: each one says what it did and what came back.

## The problem

dockview populates a popout by moving the group's DOM into the other window's
document. That needs a window sharing the opener's JavaScript context. Some
hosts cannot give one: an Electron window created in the main process, and
Tauri's `WebviewWindow` API, both produce a separate context. The demo's
Native windows panel is that boundary, and its Layout sync panel is the
workaround: move serialized state, not DOM.

Three candidate directions were on the table.

- **A. Serialization and identity primitives.** Per-group serialize and
  rehydrate, stable ids across instances, the events a remote instance needs
  to follow the owner. The application owns the transport.
- **B. A transport-agnostic sync interface in core.** dockview defines a
  send/receive contract for layout deltas and window lifecycle; the
  application plugs its IPC into it.
- **C. Neither.** Document the application-level pattern and leave the API
  alone.

**Recommendation: C**, with one carve-out that is a measurement rather than an
API. The reasoning is in [Recommendation](#recommendation); the evidence that
decides it is [sub-question 5](#5-does-the-transport-belong-in-core).

## 1. Per-group serialization

**Can one group and its panels be serialized and rehydrated in a different
dockview instance today? No.**

`group.toJSON()` returns a `GroupPanelViewState`. Measured on a group holding
two panels:

```json
{ "views": ["p1", "p2"], "activeView": "p2", "id": "1" }
```

`views` is a list of panel **ids**. The panel state itself lives somewhere
else: the sibling `panels` map of the whole-layout `SerializedDockview`, keyed
by id. The group's size lives somewhere else again, in the grid leaf node that
wraps the group state. So a per-group payload is not one object, it is three
pieces the application has to assemble by hand:

| piece | where it lives |
| --- | --- |
| group shape, tab order, active tab | `group.toJSON()` |
| each panel's component, title, params, renderer, size constraints | `toJSON().panels[id]` |
| the group's size within its parent | the enclosing grid leaf node |

On the receiving side there is no entry point that accepts a group. The public
surface offers `addPanel`, `addGroup`, `addFloatingGroup`, `addPopoutGroup`,
`addEdgeGroup` and `fromJSON`. Only `fromJSON` takes serialized state, and it
replaces the layout rather than merging into it. Measured: an instance holding
one panel `local`, given a one-group layout built from another instance,
ended with `["p1", "p2"]`, `local` gone and its renderer disposed.

So rehydrating one foreign group costs the receiving instance its entire
layout. That is the gap direction A would close. It needs two additive things:
an envelope that carries a group together with its panels' state, and an entry
point that merges one into a live layout instead of replacing it.

## 2. Identity

**Ids are unique only within an instance, and allocation is per-instance and
deterministic, so collision between instances is the default rather than the
exception.**

Measured: two freshly constructed components, each given one panel, both
allocated group id `"1"`. Panel ids are consumer-chosen, so two windows running
the same application code will naturally agree on them.

What happens on collision depends entirely on which door the foreign state
comes through, and the doors disagree:

| door | behaviour on a live id | measured |
| --- | --- | --- |
| `addPanel` | throws | `dockview: panel with id q1 already exists` |
| `addGroup` with an `id` | warns, reassigns | `Duplicate group id 1. reassigning group id to avoid errors`, then id `"2"` |
| `fromJSON` | no collision possible; the layout is cleared first | - |
| `fromJSON` with `reuseExistingPanels: true` | **silently adopts the local panel** | local renderer survived; foreign params applied over it |

The last row is the dangerous one. Applying a foreign layout with
`reuseExistingPanels: true` onto an instance that already holds panel `p1` did
not create a foreign `p1`: it kept the local renderer instance and wrote the
foreign `params` onto it. Two windows showing "the same" panel would be showing
one window's content under the other window's parameters, with nothing
reporting that it happened.

Any serious remote-window model therefore needs id namespacing before it needs
anything else. That is a real prerequisite for A, and it is invisible until
someone tries.

## 3. Outbound sync

**`onDidMovePanel` plus the mutation boundary is not sufficient. Several
ordinary changes emit nothing a follower can act on.**

Measured, by recording every component-level event fired for each change:

| change | component-level events |
| --- | --- |
| move a panel between groups | `onWillMutateLayout`, `onDidActivePanelChange`, `onDidMovePanel`, `onDidMutateLayout` |
| reorder a tab within its group | `onWillMutateLayout`, `onDidActiveGroupChange`, `onDidActivePanelChange`, `onDidMovePanel`, `onDidMutateLayout` |
| `setTitle` | none |
| `updateParameters` | none |
| `setSize` on a group | none |
| `setActive` on a panel | `onDidActivePanelChange` |
| close a panel | `onWillMutateLayout`, `onDidRemovePanel`, `onDidActivePanelChange`, `onDidMutateLayout` |

Two things fall out of that table.

**Title and parameter changes are invisible at the component level.** Both
`onDidTitleChange` and `onDidParametersChange` exist only on the individual
panel's api, with no component-level counterpart, so a follower would have to
subscribe per panel and re-subscribe as panels come and go. Both changes do
reach `toJSON`: measured, a panel's serialized state went from
`{id, contentComponent, title: "Original"}` to
`{id, contentComponent, params: {counter: 7}, title: "Renamed"}`. The state is
serializable, it just is not announced.

**A reorder is announced but not described.** `MovePanelEvent` is
`{panel, from, to}` and carries no index. Reordering a tab fires
`onDidMovePanel` with `to === from`, which tells a follower that something
moved inside a group and nothing about where it landed.

There is one coarse signal that covers everything. `onDidLayoutChange` fired
for all six changes above, including `setTitle` and `updateParameters`. It is
an `AsapEvent`, so it is coalesced and microtask-deferred, and it carries no
payload. It is a "re-read the layout" ping and nothing more, which is precisely
what the demo built on top of.

Closing a popout window is the documented exception to the mutation boundary.
Measured order on close: `onWillClosePopoutWindow`, `onDidRemovePopoutGroup`,
`onDidMovePanel`, with no `onWillMutateLayout` / `onDidMutateLayout` pair,
matching what the events documentation already states.

## 4. Inbound

**There is no API that accepts a panel with state from outside.** The channel
is `addPanel({ id, component, title, params, renderer })`, and measured, all of
those round-trip through `toJSON` unchanged. Beyond `params` and `setTitle`,
the panel api exposes nothing for state: anything else a panel holds lives in
the consumer's renderer, and dockview never sees it.

Cross-instance drag is not a route either, even between two instances sharing
a document. The drop paths compare `data.viewId` against the component's own
id and treat a foreign drag as external, handing it to
`onUnhandledDragOver` / `onDidDrop` for the application to service. The
transfer object behind that comparison is a singleton living in one JavaScript
heap, and it carries ids rather than state, so it cannot cross a process
boundary under any circumstances.

**The UX consequence, plainly: there is no dragging between the main window and
an unscriptable window, and there never can be.** Only an HTML5 drag rides an
OS drag session, so only an HTML5 drag leaves the window it started in, and it
still needs both ends in one process. Returning a panel from such a window is a
button, a menu item or a keyboard command. Any design that assumes a user will
drag a tab back is designing a gesture that cannot exist. The demo already
shows a weaker version of the same wall: on a webview reporting a coarse
pointer, `dndStrategy: 'auto'` resolves to the pointer backend, where a drag
cannot leave the window even between two scriptable ones.

## 5. Does the transport belong in core?

**No, and the measurement that settles it is cheap.**

The demo's `LayoutSyncPanel` broadcasts `api.toJSON()` on a button press and
applies what arrives with `api.fromJSON(payload.layout)`. Measuring what that
loses, by taking a snapshot of an unchanged layout and applying it back:

| | plain `fromJSON` | `fromJSON` with `reuseExistingPanels: true` |
| --- | --- | --- |
| renderer instances | all disposed, all rebuilt | none disposed |
| renderer-held state (scroll, DOM) | lost | intact |
| half-typed text in an input | lost, element replaced | intact, same element |
| caret position | lost | intact |
| keyboard focus | lost | **lost** |
| active panel | preserved | preserved |
| active group | preserved | preserved |
| title and params | preserved | preserved |

The second column is the finding. **The loss the whole-layout path is being
judged on is almost entirely a missing option at the call site, not a missing
primitive in core.** `reuseExistingPanels` already stages live panels
aside, clears, and rehomes them, so the renderer instance and everything inside
it survives. The demo does not pass it.

That is the evidence against B. A transport-agnostic delta protocol in core
would be justified if whole-group snapshots were the wrong granularity. They
are not yet known to be: the cheapest available fix has not been tried.

Two problems survive the fix, and neither is a delta-protocol problem.

**Focus.** Measured, `reuseExistingPanels: true` kept the same input element
with its text and caret, and `document.activeElement` was still cleared. The
panel is detached and reattached while staging, and nothing restores focus
afterwards. No field of `SerializedDockview` describes focus.

**The follower opens its own popout windows.** A snapshot carrying
`popoutGroups` applied into a second instance called `window.open('/popout.html')`
and left a popout open in the follower. Broadcasting a whole layout to every
window therefore makes every window open a copy of every popout. In the demo
this is latent, because a popout only appears in a snapshot if someone popped
one out before pressing the button, but it is a duplication that no amount of
delta protocol would fix. It is a question about what "the layout" means when
there are several windows, and that is the application's question.

## 6. The two open seams

Core performs four host-owned operations on a popout window. Two have a hook
and two do not.

| operation | where | hook |
| --- | --- | --- |
| create | `window.open` in `popoutWindow.ts` | host-side, via the shell's own new-window handler |
| close | `window.close()` | `onWillClosePopoutWindow` |
| focus | `dockviewComponent.ts`, in the focus routing bound per popout | none |
| place and size | `window.open` features, read back through `dimensions()` | none |

**Focus.** Exactly two call sites, both inside the routing bound to a popout's
current anchor group: one on the anchor becoming active, one on `onWillFocus`.
Both call `_window.window?.focus()`. The minimal hook is an optional callback
on the component options, given the popout id and its `Window`, called instead
of `focus()` where one is supplied. It is minimal precisely because there is
only one thing to intercept.

**Placement.** The only input is the `window.open` features string built in
`popoutWindow.ts`; the only readback is `dimensions()`, which takes `screenX`,
`screenY`, `innerWidth` and `innerHeight` off the handle. The minimal hook is
the symmetric pair: a callback that places a window the host owns, and a
callback that reports where it actually is, used in place of `dimensions()`.

**Does the DOM-moving path need them too? Yes for placement, and that is the
part worth acting on.** The demo already shows one half: answering
`window.open` with `NewWindowResponse::Allow`, wry on WebKitGTK ignores the
features and opens 200x200. dockview asked for a box and got another one. Since
`dimensions()` reads the handle back rather than trusting the request, the
saved layout records what the handle reports, which is at least
self-consistent. What is **not** measured is whether the handle's geometry
describes the native window frame or only the webview inside it. In an embedded
webview those can differ, and if they do, a saved layout persists a position
that does not describe any window the user can see, on the path dockview
already supports today. That is a defect in the current feature, independent of
remote windows entirely.

The focus seam touches the DOM-moving path too, but only as an open question:
`window.focus()` on a webview handle is a request the shell may ignore, or may
satisfy without raising the native window. Nothing in the demo measures that
yet, so unlike placement there is no suspected defect to point at.

## 7. Failure modes

**Divergence.** The silent id capture in sub-question 2. A foreign group whose
panel ids match local ones merges into the local panels under
`reuseExistingPanels`, with no event and no warning.

**Echo.** Measured, applying a layout fires `will:load/api` through
`did:load/api`, so a follower can suppress its own rebroadcast by ignoring
`kind === 'load'`. But the popout restoration that a load schedules runs off a
timer, outside that transaction, and reports `popout/user`. Origin defaults to
`'user'` and the deferred work runs outside the api boundary that would have
tagged it `'api'`, so a follower filtering on origin rebroadcasts a change it
caused itself. The demo does not hit this today, because it broadcasts only on
a button press and filters by sender label. Anyone driving the broadcast off an
event, which is the obvious next step, hits it immediately.

**Ordering.** Nothing carries a sequence number. Two windows broadcasting
concurrently each apply the other's snapshot, and there is no rule that makes
them converge. Popout restoration makes it worse: restorations are staggered on
a per-index timer, and a second `fromJSON` calls `cancelPendingRestorations()`,
which disposes groups that were registered but never parented. A snapshot
arriving mid-restore truncates the previous one's popouts rather than
superseding it cleanly.

**A window closing mid-sync.** On the remote side nothing in core knows the
window existed, so there is nothing to clean up and nothing to report. On the
owner side the close fires `onWillClosePopoutWindow`, `onDidRemovePopoutGroup`
and `onDidMovePanel` with no mutation bracket, so an application driving off
the mutation boundary alone misses the close entirely. Anything mirroring
layout state has to listen to `onDidMovePanel`, as the events documentation
already says.

## Recommendation

**C.** Document the application-level pattern; add no API yet.

**B is refuted by measurement.** The whole-layout broadcast is not failing
because core lacks a delta protocol. It is failing because the call site omits
`reuseExistingPanels`, and because broadcasting a layout that contains popouts
duplicates them. Both are fixed in the application, and until that is done
there is no measured shortfall for a core transport to address. A send/receive
contract added now would be speculative API of exactly the kind the
`popoutWindowIdParam` option was, added and reverted in the same branch because
nothing consumed it.

**A is not refuted, but nothing consumes it either.** The gaps in
sub-questions 1 and 2 are real: a group cannot be serialized as a unit, cannot
be applied into a live layout, and its ids collide with any other instance by
construction. Those are the right primitives for a remote window. There is no
remote window. Shipping `addGroupFromJSON` and an id-namespacing option today
would ship an API with one hypothetical caller.

**The carve-out is a measurement, not an API.** The placement seam has a
suspected defect on the path dockview already supports. Settle it before
designing a hook for it.

### Smallest viable first step

All three are demo changes. None touches the public API.

1. Pass `{ reuseExistingPanels: true }` in `LayoutSyncPanel`, then re-measure
   what is still lost. On the measurements above, focus should be the only
   remaining loss.
2. Decide what a broadcast layout means for popouts, and either strip
   `popoutGroups` from the payload or say in the panel that each window owns
   its own. Today every receiving window opens a duplicate.
3. Measure the placement seam on the packaged Tauri build. Run with
   `DOCKVIEW_POPOUT=allow` on WebKitGTK, where the features are known to be
   ignored, and compare what `onDidPopoutGroupPositionChange` and a saved
   layout's `position` report against the native window's real frame as Rust
   sees it. If they disagree, that is a bug with a measurement behind it, and
   the placement hook earns its way in on that rather than on this note.

### What would change the recommendation

**Towards A.** A real application, not the demo, that wants a group in an
Electron main-process window or a Tauri `WebviewWindow` and has hit the
sub-question 1 and 2 walls with a worked-around implementation to show.
Strongest form: a case where assembling `{group state, panel state subset,
size}` from the public API is not merely tedious but cannot be done correctly,
so the split between `views: string[]` and the sibling `panels` map is
genuinely lossy rather than inconvenient.

**Towards A sooner.** Evidence that id collision bites without any remote
window at all, for example two dockview instances on one page exchanging
layouts and silently merging panels.

**Towards B.** A number. After step 1, a measurement showing that whole-group
snapshots are still too lossy or too slow at a realistic layout size, so that a
delta protocol has a defect to point at rather than a hypothesis.

**Against the carve-out.** Step 3 coming back showing the handle's geometry
does describe the native window frame. Then `dimensions()` is correct, there is
no placement defect, and the seam stays closed.
