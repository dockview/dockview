mod drags;
mod history;
mod workspace;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{
    webview::{NewWindowFeatures, NewWindowResponse},
    AppHandle, Emitter, Manager, RunEvent, State, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use drags::{DragEnd, DragSession, DragSessions, Release};
use history::{History, Request, Role, Step};
use workspace::{FileStore, Geometry, Workspace, WorkspaceState};

/// The orchestrator's three pieces, each behind one lock. None of them
/// panics while it is held, so a lock poisoned elsewhere still guards
/// consistent state.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn drags(app: &AppHandle) -> MutexGuard<'_, DragSessions> {
    lock(app.state::<Mutex<DragSessions>>().inner())
}

fn workspace(app: &AppHandle) -> MutexGuard<'_, Workspace> {
    lock(app.state::<Mutex<Workspace>>().inner())
}

fn history(app: &AppHandle) -> MutexGuard<'_, History> {
    lock(app.state::<Mutex<History>>().inner())
}

/// Event carrying a serialized dockview layout between native windows.
const LAYOUT_EVENT: &str = "dockview:layout";

/// Event telling the window a drag started in that another window has taken
/// the dragged group, so it can remove its own copy.
const RELEASE_EVENT: &str = "dockview:release";

/// Broadcast after panels moved between windows, by a drop or by undo or
/// redo of one, so app code has one event for it.
const MOVED_EVENT: &str = "dockview:moved";
/// Broadcast whenever the global history changes.
const HISTORY_EVENT: &str = "dockview:history";
/// Sent to one window: a `HistoryRequest` (undo or redo your own top step,
/// or take this layout).
const HISTORY_REQUEST_EVENT: &str = "dockview:history-request";

/// Labels for the windows a detach creates; see `POPOUT_COUNT`.
static DETACH_COUNT: AtomicUsize = AtomicUsize::new(0);

/// A label for a window a detach creates. Detached windows are on record in
/// the workspace and come back on the next start, so the count alone is not
/// enough: skip any label already recorded or open.
fn new_detach_label(app: &AppHandle) -> String {
    let recorded = workspace(app).window_ids();
    loop {
        let label = format!(
            "dock-detached-{}",
            DETACH_COUNT.fetch_add(1, Ordering::Relaxed)
        );
        if !recorded.contains(&label) && app.get_webview_window(&label).is_none() {
            return label;
        }
    }
}

/// The panel ids a drag payload carries: one tab's `panel.id`, or a group's
/// `group.group.views` (the `DragPayload` of `dockview-enterprise`). The one
/// thing the shell reads out of a payload, for move events and for the
/// workspace's reconciliation of the two windows' reports.
fn payload_panels(payload: &serde_json::Value) -> Vec<String> {
    if let Some(id) = payload
        .pointer("/panel/id")
        .and_then(serde_json::Value::as_str)
    {
        return vec![id.to_string()];
    }
    payload
        .pointer("/group/group/views")
        .and_then(serde_json::Value::as_array)
        .map(|views| {
            views
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MovedNotice {
    session: String,
    panels: Vec<String>,
    from: String,
    to: String,
    /// `drop`, `detach`, `undo` or `redo`.
    reason: &'static str,
}

fn broadcast_history(app: &AppHandle) {
    let info = history(app).info();
    if let Err(err) = app.emit(HISTORY_EVENT, info) {
        eprintln!("history: could not broadcast: {err}");
    }
}

/// Carries out an undo or redo step the history handed back.
fn carry_out(app: &AppHandle, step: Step, reason: &'static str) -> Result<(), String> {
    // Every layout the step applies is stored before any window is told, so
    // a window's own report afterwards never reads as a duplicate, and under
    // one lock, so a stale report arriving meanwhile is checked against the
    // whole step rather than half of it.
    {
        let mut workspace = workspace(app);
        for action in &step.actions {
            if let Request::ApplyLayout { layout } = &action.request {
                workspace.set_layout_unchecked(&action.window, layout.clone());
                app.state::<Persistence>().mark_dirty();
            }
        }
    }
    for action in step.actions {
        // The payload names its window: a listener registered for "any"
        // target hears events emitted to every window, so the receiver
        // filters as well as the sender targeting.
        app.emit_to(
            &action.window,
            HISTORY_REQUEST_EVENT,
            serde_json::json!({ "window": action.window, "request": action.request }),
        )
        .map_err(|err| err.to_string())?;
    }
    if let Some(moved) = step.moved {
        app.emit(
            MOVED_EVENT,
            MovedNotice {
                session: moved.session,
                panels: moved.panels,
                from: moved.from,
                to: moved.to,
                reason,
            },
        )
        .map_err(|err| err.to_string())?;
    }
    broadcast_history(app);
    Ok(())
}

fn perform_undo(app: &AppHandle) -> Result<(), String> {
    let step = history(app).undo().map_err(|err| err.to_string())?;
    carry_out(app, step, "undo")
}

fn perform_redo(app: &AppHandle) -> Result<(), String> {
    let step = history(app).redo().map_err(|err| err.to_string())?;
    carry_out(app, step, "redo")
}

// The commands below are the `MultiWindowTransport` of `dockview-enterprise`,
// one per call, named after it. A call never names its window: it is the
// window the call arrived from.

/// A window recorded a step in its own history.
#[tauri::command]
fn report_local_step(app: AppHandle, window: tauri::Window) {
    history(&app).push_local(window.label());
    broadcast_history(&app);
}

/// A window reports its half of a move: its layout before and after.
#[tauri::command]
fn report_move(
    app: AppHandle,
    window: tauri::Window,
    session: String,
    role: Role,
    panels: Vec<String>,
    before: serde_json::Value,
    after: serde_json::Value,
) {
    history(&app).record_move(
        &session,
        &panels,
        role,
        history::Half {
            window: window.label().to_string(),
            before,
            after,
        },
    );
    broadcast_history(&app);
}

/// Undo the most recent step anywhere.
#[tauri::command]
fn undo(app: AppHandle) -> Result<(), String> {
    perform_undo(&app)
}

/// Redo the most recently undone step anywhere.
#[tauri::command]
fn redo(app: AppHandle) -> Result<(), String> {
    perform_redo(&app)
}

#[tauri::command]
fn get_history(app: AppHandle) -> history::Info {
    history(&app).info()
}

/// Set in the environment to run the measurement harness: a second window
/// opens at a known position, and the frontend reports its geometry and the
/// drag sessions' log as JSON lines on stdout for `scripts/measure-cross-window-drag.py`
/// to drive. See the README's "Dragging between windows".
const AUTOTEST_ENV: &str = "DOCKVIEW_DEMO_AUTOTEST";

/// A command from the harness to every window, such as switching detach on.
const AUTOTEST_EVENT: &str = "dockview:autotest";

fn autotest() -> bool {
    std::env::var_os(AUTOTEST_ENV).is_some()
}

/// Overrides where the workspace file lives; the harness points it at a
/// temporary file so a measurement never starts from a previous run.
const WORKSPACE_ENV: &str = "DOCKVIEW_DEMO_WORKSPACE";

/// How long after a change the workspace file is written. Changes come in
/// bursts (a drag is two layout reports and a few geometry events) and the
/// file is small, so this only coalesces, it does not risk much.
const SAVE_DEBOUNCE: Duration = Duration::from_millis(500);

/// The windows the workspace records: the ones running the frontend. Popout
/// windows belong to the dockview instance that opened them and travel
/// inside its layout.
fn is_dock_window(label: &str) -> bool {
    label == "main" || label.starts_with("dock-")
}

fn workspace_path(app: &AppHandle) -> PathBuf {
    if let Some(path) = std::env::var_os(WORKSPACE_ENV) {
        return PathBuf::from(path);
    }
    match app.path().app_data_dir() {
        Ok(dir) => dir.join("workspace.json"),
        Err(err) => {
            eprintln!("workspace: no app data dir ({err}); using the working directory");
            PathBuf::from("workspace.json")
        }
    }
}

/// The host's side of persistence: the store, whether anything changed since
/// the last write, and whether the app is on its way out (so windows closing
/// as part of the exit are not mistaken for the user closing them).
struct Persistence {
    store: FileStore,
    dirty: AtomicBool,
    exiting: AtomicBool,
    last_saved: Mutex<Option<SystemTime>>,
}

impl Persistence {
    fn mark_dirty(&self) {
        self.dirty.store(true, Ordering::Relaxed);
    }

    /// Writes the workspace if anything changed since the last write.
    fn save_if_dirty(&self, app: &AppHandle) {
        if !self.dirty.swap(false, Ordering::Relaxed) {
            return;
        }
        let snapshot = workspace(app).snapshot();
        match self.store.save(&snapshot) {
            Ok(()) => *lock(&self.last_saved) = Some(SystemTime::now()),
            Err(err) => {
                eprintln!(
                    "workspace: could not save {}: {err}",
                    self.store.path().display()
                );
                self.dirty.store(true, Ordering::Relaxed);
            }
        }
    }
}

/// Records a window's current frame, in logical pixels, which is what the
/// builder takes when the window is recreated.
fn record_geometry(app: &AppHandle, window: &tauri::Window) {
    let (Ok(position), Ok(size), Ok(scale)) = (
        window.outer_position(),
        window.inner_size(),
        window.scale_factor(),
    ) else {
        return;
    };
    let position = position.to_logical::<f64>(scale);
    let size = size.to_logical::<f64>(scale);
    let geometry = Geometry {
        x: position.x.round() as i32,
        y: position.y.round() as i32,
        width: size.width.round() as u32,
        height: size.height.round() as u32,
    };
    workspace(app).set_geometry(window.label(), geometry);
    app.state::<Persistence>().mark_dirty();
}

/// A window reports its dockview layout; the orchestrator keeps it and
/// writes the workspace shortly after. Refused, and nothing recorded, if the
/// layout names a panel another window holds.
#[tauri::command]
fn report_layout(
    app: AppHandle,
    window: tauri::Window,
    persistence: State<Persistence>,
    layout: serde_json::Value,
) -> Result<(), String> {
    workspace(&app)
        .set_layout(window.label(), layout)
        .map_err(|err| err.to_string())?;
    persistence.mark_dirty();
    Ok(())
}

/// A freshly loaded window asks what layout to start with: the one it last
/// reported, or the one the workspace file held for it. `None` means build
/// the defaults.
#[tauri::command]
fn load_layout(app: AppHandle, window: tauri::Window) -> Option<serde_json::Value> {
    workspace(&app).load_layout(window.label())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceWindowInfo {
    label: String,
    geometry: Option<Geometry>,
    has_layout: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceInfo {
    path: String,
    /// Milliseconds since the Unix epoch, or `None` if never written this run.
    last_saved: Option<u64>,
    windows: Vec<WorkspaceWindowInfo>,
}

/// What the Workspace panel shows.
#[tauri::command]
fn workspace_info(app: AppHandle, persistence: State<Persistence>) -> WorkspaceInfo {
    let snapshot = workspace(&app).snapshot();
    let last_saved = lock(&persistence.last_saved)
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|since| since.as_millis() as u64);
    WorkspaceInfo {
        path: persistence.store.path().display().to_string(),
        last_saved,
        windows: snapshot
            .windows
            .into_iter()
            .map(|window| WorkspaceWindowInfo {
                label: window.id,
                geometry: window.geometry,
                has_layout: window.layout.is_some(),
            })
            .collect(),
    }
}

/// Labels for the windows `window.open` creates; a label must be unique for
/// the life of the app, so this only ever counts up.
static POPOUT_COUNT: AtomicUsize = AtomicUsize::new(0);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostInfo {
    tauri_version: String,
    webview_version: String,
    platform: String,
    arch: String,
    /// Whether release builds on this platform serve the app over http(s).
    /// Where they do not, the app is served from `tauri://localhost`.
    http_origin: bool,
}

#[derive(Serialize, Clone)]
struct LayoutBroadcast {
    from: String,
    layout: serde_json::Value,
}

/// Delivers a release notice to the window it names.
fn deliver(app: &AppHandle, release: Release) -> Result<(), String> {
    app.emit_to(&release.from, RELEASE_EVENT, &release)
        .map_err(|err| err.to_string())
}

/// The source window announces a drag. Called from `onWillDragPanel` /
/// `onWillDragGroup`, before the pointer can have left the window.
#[tauri::command]
fn start_drag(app: AppHandle, window: tauri::Window, session: String, payload: serde_json::Value) {
    drags(&app).start(
        session,
        DragSession {
            from: window.label().to_string(),
            payload,
        },
    );
}

/// The destination window looks at a drag before accepting it, to refuse a
/// payload whose panel ids it already holds without taking it from the
/// source.
#[tauri::command]
fn peek_drag(app: AppHandle, session: String) -> Result<serde_json::Value, String> {
    drags(&app).peek(&session).map_err(|err| err.to_string())
}

/// The destination window accepts the drag it just received a drop for. The
/// first accept wins: the source is told to release its copy. A second
/// accept, or an accept for a drag the shell never saw, is refused.
#[tauri::command]
fn accept_drag(app: AppHandle, window: tauri::Window, session: String) -> Result<(), String> {
    let to = window.label().to_string();
    let accept = drags(&app)
        .accept(&session, to.clone())
        .map_err(|err| err.to_string())?;
    let panels = payload_panels(&accept.payload);
    let from = accept.release.from.clone();
    workspace(&app).expect_move(&panels, &from, &to);
    deliver(&app, accept.release)?;
    // The source has let go: from here the accept has happened, whatever
    // becomes of the announcement.
    if let Err(err) = app.emit(
        MOVED_EVENT,
        MovedNotice {
            session,
            panels,
            from,
            to,
            reason: "drop",
        },
    ) {
        eprintln!("accept_drag: could not announce the move: {err}");
    }
    Ok(())
}

/// How long a drag stays acceptable after its source reported it over. The
/// source's `dragend` fires the instant the drop lands in another window,
/// and that window's accept is a separate IPC message that routinely arrives
/// later. `DRAG_END_GRACE_MS` in `dockview-enterprise`: the windows assume
/// it is no longer than that.
const DRAG_END_GRACE: std::time::Duration = std::time::Duration::from_millis(1500);

/// The source window reports the end of its drag. Nothing happens yet: the
/// drag stays acceptable for `DRAG_END_GRACE`, after which an unaccepted one
/// is discarded, or, when the source asked, turned into a new window holding
/// the payload: the shell's replacement for a popout. The source learns
/// either outcome through the release event, or through silence.
#[tauri::command]
fn end_drag(app: AppHandle, session: String, detach: bool) {
    if !drags(&app).end(&session, detach) {
        return;
    }

    std::thread::spawn(move || {
        std::thread::sleep(DRAG_END_GRACE);
        let ended = drags(&app).expire(&session, || new_detach_label(&app));
        match ended {
            DragEnd::Detached {
                window_id: label,
                payload,
                release,
            } => {
                let handle = app.clone();
                let panels = payload_panels(&payload);
                let result = app.run_on_main_thread(move || {
                    match build_dock_window(
                        &handle,
                        &label,
                        &format!("dockview — {label}"),
                        (900.0, 600.0),
                        None,
                    ) {
                        Ok(_) => {
                            // As for an accept: the new window may report the
                            // panels before the source reports them gone.
                            workspace(&handle).expect_move(&panels, &release.from, &label);
                            let moved = MovedNotice {
                                session: release.session.clone(),
                                panels,
                                from: release.from.clone(),
                                to: label.clone(),
                                reason: "detach",
                            };
                            // A detach is no step to undo, and the source's
                            // earlier steps hold the panels it gave away:
                            // undoing one would bring them back while the new
                            // window holds them too. They end here.
                            history(&handle).forget_window(&release.from);
                            if let Err(err) = deliver(&handle, release) {
                                eprintln!("detach: could not release the source: {err}");
                            }
                            if let Err(err) = handle.emit(MOVED_EVENT, moved) {
                                eprintln!("detach: could not announce the move: {err}");
                            }
                            broadcast_history(&handle);
                        }
                        Err(err) => eprintln!("detach: could not open {label}: {err}"),
                    }
                });
                if let Err(err) = result {
                    eprintln!("detach: {err}");
                }
            }
            DragEnd::Settled | DragEnd::Discarded => {}
        }
    });
}

/// A freshly loaded window asks whether a detached drag is waiting for it;
/// the window's frontend collects it once dockview is ready, since nothing
/// can be pushed into a webview before it has loaded.
#[tauri::command]
fn take_detached_drag(app: AppHandle, window: tauri::Window) -> Option<serde_json::Value> {
    drags(&app).take_detached_drag(window.label())
}

#[tauri::command]
fn host_info() -> HostInfo {
    HostInfo {
        tauri_version: tauri::VERSION.to_string(),
        webview_version: tauri::webview_version().unwrap_or_else(|_| "unknown".to_string()),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        http_origin: cfg!(any(windows, target_os = "android")),
    }
}

/// Answers a page's `window.open` with a window whose webview is *related*
/// to the opener: same web process on WebKitGTK, same configuration on
/// WKWebView, same environment on WebView2. That relation is what makes the
/// returned handle scriptable, and a scriptable handle is what dockview's
/// popout groups move their DOM into. A window declared in `tauri.conf.json`
/// has no such handler, and `window.open` returns null from it.
fn open_related_window(
    app: &AppHandle,
    url: Url,
    features: NewWindowFeatures,
) -> NewWindowResponse<tauri::Wry> {
    // Two ways to answer. `Create` (the default) returns a Tauri-built
    // window: labelled, titled from its document, and sized from the
    // `window.open` features on macOS and Windows. `Allow` is wry's own
    // per-platform window creation, kept behind `DOCKVIEW_POPOUT=allow` for
    // comparison; on WebKitGTK it ignores the features and opens 200x200.
    if std::env::var("DOCKVIEW_POPOUT").as_deref() == Ok("allow") {
        return NewWindowResponse::Allow;
    }

    let label = format!("popout-{}", POPOUT_COUNT.fetch_add(1, Ordering::Relaxed));

    // `about:blank`: the engine itself navigates the new webview to the
    // requested URL; loading it here too would be a second navigation.
    let built = WebviewWindowBuilder::new(
        app,
        label.clone(),
        WebviewUrl::External("about:blank".parse().expect("static URL")),
    )
    .window_features(features)
    .title(url.as_str())
    // Lets the opener, which has IPC, name this window to `close_popout`.
    .initialization_script(format!(
        "window.__DOCKVIEW_POPOUT_LABEL__ = {};",
        serde_json::to_string(&label).expect("a string serializes")
    ))
    .on_document_title_changed(|window, title| {
        let _ = window.set_title(&title);
    })
    .build();

    match built {
        Ok(window) => {
            honour_script_close(&window);
            NewWindowResponse::Create { window }
        }
        Err(err) => {
            eprintln!("window.open for {url} refused: {err}");
            NewWindowResponse::Deny
        }
    }
}

/// Makes `window.close()` from the page close the native window. wry answers
/// WebKitGTK's `close` signal by destroying the webview widget only, which
/// leaves the window on screen, blank; closing the window from the widget's
/// `destroy` runs after that whatever the handler order. On Windows wry
/// destroys the window itself; on macOS its UI delegate has no
/// `webViewDidClose:`, so nothing closes it yet. dockview calls `close()` on
/// a popout when its group is closed or redocked.
fn honour_script_close(window: &WebviewWindow) {
    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::WidgetExt;
        let handle = window.clone();
        let result = window.with_webview(move |webview| {
            webview.inner().connect_destroy(move |_| {
                let _ = handle.destroy();
            });
        });
        if let Err(err) = result {
            eprintln!("popout: could not hook window.close: {err}");
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = window;
    }
}

/// Destroys a window this shell created for `window.open`. wry's macOS UI
/// delegate has no `webViewDidClose:`, so `handle.close()` from the opener
/// does nothing there; the opener asks here instead.
#[tauri::command]
fn close_popout(app: AppHandle, label: String) -> Result<(), String> {
    if !label.starts_with("popout-") {
        return Err(format!("{label} is not a popout window"));
    }
    match app.get_webview_window(&label) {
        Some(window) => window.destroy().map_err(|err| err.to_string()),
        None => Ok(()),
    }
}

/// Every window running the frontend is built here rather than declared in
/// `tauri.conf.json`, so each one answers `window.open` (see
/// `open_related_window`).
fn build_dock_window(
    app: &AppHandle,
    label: &str,
    title: &str,
    size: (f64, f64),
    geometry: Option<Geometry>,
) -> tauri::Result<WebviewWindow> {
    let handle = app.clone();
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(title)
        // Tauri's own drag-drop interception is the documented reason HTML5
        // drag-and-drop misbehaves in WebView2; the demo takes no file drops.
        .disable_drag_drop_handler()
        .on_new_window(move |url, features| open_related_window(&handle, url, features));

    builder = match geometry {
        Some(geometry) => builder
            .position(f64::from(geometry.x), f64::from(geometry.y))
            .inner_size(f64::from(geometry.width), f64::from(geometry.height)),
        None => builder.inner_size(size.0, size.1),
    };

    if autotest() {
        builder = builder.initialization_script("window.__DOCKVIEW_AUTOTEST__ = true;");
    }

    let window = builder.build()?;

    // On record from the moment it exists, frame included, so a workspace
    // saved before the window reports a layout, or before the user moves
    // it, still brings the window back where it was.
    workspace(app).ensure_window(label);
    record_geometry(app, &window.as_ref().window());

    Ok(window)
}

/// The frontend's side of the measurement harness: one JSON line per report
/// on stdout, where the driver script reads them.
#[tauri::command]
fn autotest_report(label: String, kind: String, payload: serde_json::Value) {
    use std::io::Write;
    let line = serde_json::json!({ "label": label, "kind": kind, "payload": payload });
    let mut stdout = std::io::stdout().lock();
    let _ = writeln!(stdout, "{line}");
    let _ = stdout.flush();
}

/// Builds another native window running the same frontend. The new webview is
/// a separate context: it shares no JavaScript heap with its opener, so panel
/// DOM cannot be moved into it the way a popout group would.
#[tauri::command]
async fn open_dock_window(app: AppHandle, label: String) -> Result<(), String> {
    build_dock_window(
        &app,
        &label,
        &format!("dockview — {label}"),
        (1000.0, 700.0),
        None,
    )
    .map_err(|err| err.to_string())?;

    Ok(())
}

/// Fans a serialized layout out to every window, including the sender, which
/// filters itself out by label.
#[tauri::command]
fn broadcast_layout(app: AppHandle, from: String, layout: serde_json::Value) -> Result<(), String> {
    app.emit(LAYOUT_EVENT, LayoutBroadcast { from, layout })
        .map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(Mutex::new(DragSessions::default()))
        .manage(Mutex::new(History::default()))
        .setup(|app| {
            let handle = app.handle().clone();

            // The workspace is the orchestrator's: it is read once here,
            // before any window exists, and every window is created from it.
            let store = FileStore::new(workspace_path(&handle));
            let restored = match store.load() {
                Ok(Some(state)) => state,
                Ok(None) => WorkspaceState::default(),
                Err(err) => {
                    eprintln!(
                        "workspace: could not read {}: {err}; starting fresh",
                        store.path().display()
                    );
                    WorkspaceState::default()
                }
            };
            let recorded: Vec<(String, Option<Geometry>)> = restored
                .windows
                .iter()
                .filter(|window| is_dock_window(&window.id))
                .map(|window| (window.id.clone(), window.geometry))
                .collect();
            app.manage(Mutex::new(Workspace::restore(restored)));
            app.manage(Persistence {
                store,
                dirty: AtomicBool::new(false),
                exiting: AtomicBool::new(false),
                last_saved: Mutex::new(None),
            });

            if !recorded.iter().any(|(label, _)| label == "main") {
                build_dock_window(&handle, "main", "dockview + Tauri", (1280.0, 820.0), None)?;
            }
            for (label, geometry) in &recorded {
                let title = if label == "main" {
                    "dockview + Tauri".to_string()
                } else {
                    format!("dockview — {label}")
                };
                build_dock_window(&handle, label, &title, (1000.0, 700.0), *geometry)?;
            }

            // The harness needs two windows at known places from the start.
            if autotest() {
                eprintln!("{AUTOTEST_ENV} is set: opening dock-2 and reporting on stdout");
                if !recorded.iter().any(|(label, _)| label == "dock-2") {
                    build_dock_window(
                        &handle,
                        "dock-2",
                        "dockview — dock-2",
                        (1000.0, 700.0),
                        Some(Geometry {
                            x: 1300,
                            y: 0,
                            width: 1000,
                            height: 700,
                        }),
                    )?;
                }
            }

            // The harness drives undo and redo over stdin, since it cannot
            // reach the commands and synthetic key events need a focus the
            // headless display does not give.
            if autotest() {
                let driver = handle.clone();
                std::thread::spawn(move || {
                    use std::io::BufRead;
                    for line in std::io::stdin().lock().lines() {
                        let result = match line.as_deref().map(str::trim) {
                            Ok("undo") => perform_undo(&driver),
                            Ok("redo") => perform_redo(&driver),
                            // Turn detach on in every window, which the
                            // driver cannot click for itself.
                            Ok("detach") => driver
                                .emit(AUTOTEST_EVENT, serde_json::json!({ "command": "detach" }))
                                .map_err(|err| err.to_string()),
                            Ok(_) => Ok(()),
                            Err(_) => break,
                        };
                        if let Err(err) = result {
                            eprintln!("autotest: {err}");
                        }
                    }
                });
            }

            // Writes coalesce here rather than on every event.
            std::thread::spawn(move || loop {
                std::thread::sleep(SAVE_DEBOUNCE);
                handle.state::<Persistence>().save_if_dirty(&handle);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            let label = window.label().to_string();
            if !is_dock_window(&label) {
                return;
            }
            let app = window.app_handle();
            match event {
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                    record_geometry(app, window);
                }
                WindowEvent::CloseRequested { .. } if label == "main" => {
                    // Closing the main window closes the app, keeping every
                    // window on record for next time. Tauri would otherwise
                    // keep running while any other window is open.
                    app.state::<Persistence>()
                        .exiting
                        .store(true, Ordering::Relaxed);
                    app.exit(0);
                }
                WindowEvent::Destroyed => {
                    let persistence = app.state::<Persistence>();
                    if label != "main" && !persistence.exiting.load(Ordering::Relaxed) {
                        // The user closed one window: it, and the panels it
                        // held, leave the workspace.
                        workspace(app).remove_window(&label);
                        history(app).forget_window(&label);
                        persistence.mark_dirty();
                        broadcast_history(app);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            host_info,
            open_dock_window,
            broadcast_layout,
            close_popout,
            start_drag,
            peek_drag,
            accept_drag,
            end_drag,
            take_detached_drag,
            report_move,
            load_layout,
            report_layout,
            workspace_info,
            report_local_step,
            undo,
            redo,
            get_history,
            autotest_report
        ])
        .build(tauri::generate_context!())
        .expect("error while building the dockview tauri demo");

    app.run(|app, event| match event {
        RunEvent::ExitRequested { .. } => {
            app.state::<Persistence>()
                .exiting
                .store(true, Ordering::Relaxed);
        }
        RunEvent::Exit => {
            // The last write: everything is already in memory, so nothing
            // has to be collected from the closing windows.
            app.state::<Persistence>().save_if_dirty(app);
        }
        _ => {}
    });
}
