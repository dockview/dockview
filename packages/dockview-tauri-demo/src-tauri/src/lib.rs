mod orchestrator;
mod persistence;
mod transport;

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::{
    webview::{NewWindowFeatures, NewWindowResponse},
    AppHandle, Emitter, Manager, RunEvent, State, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use orchestrator::drag_sessions::DragSessions;
use orchestrator::history_sequencer::HistorySequencer;
use orchestrator::workspace_registry::{Geometry, WorkspaceRegistry, WorkspaceState};
use persistence::{workspace_path, FileStore, Persistence, SAVE_DEBOUNCE};
use transport::{broadcast_history, history, perform_redo, perform_undo, workspace};

/// Nothing panics while holding an orchestrator lock, so a poisoned one is still consistent.
pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Event carrying a serialized dockview layout between native windows.
const LAYOUT_EVENT: &str = "dockview:layout";

/// Runs the measurement harness, `scripts/measure-cross-window-drag.py`.
const AUTOTEST_ENV: &str = "DOCKVIEW_DEMO_AUTOTEST";

const AUTOTEST_EVENT: &str = "dockview:autotest";

fn autotest() -> bool {
    std::env::var_os(AUTOTEST_ENV).is_some()
}

/// Popout windows travel inside their opener's layout instead.
fn is_dock_window(label: &str) -> bool {
    label == "main" || label.starts_with("dock-")
}

/// In logical pixels, which is what the builder takes.
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
pub(crate) fn build_dock_window(
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

    // On record from the start, so an early save still brings it back.
    workspace(app).ensure_window(label);
    record_geometry(app, &window.as_ref().window());

    Ok(window)
}

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
        .manage(Mutex::new(HistorySequencer::default()))
        .setup(|app| {
            let handle = app.handle().clone();

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
            app.manage(Mutex::new(WorkspaceRegistry::restore(restored)));
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

            // Synthetic key events need a focus the headless display lacks.
            if autotest() {
                let driver = handle.clone();
                std::thread::spawn(move || {
                    use std::io::BufRead;
                    for line in std::io::stdin().lock().lines() {
                        let result = match line.as_deref().map(str::trim) {
                            Ok("undo") => perform_undo(&driver),
                            Ok("redo") => perform_redo(&driver),
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
                    // Quit, keeping every window on record. Tauri would keep
                    // running while another window is open.
                    app.state::<Persistence>()
                        .exiting
                        .store(true, Ordering::Relaxed);
                    app.exit(0);
                }
                WindowEvent::Destroyed => {
                    let persistence = app.state::<Persistence>();
                    if label != "main" && !persistence.exiting.load(Ordering::Relaxed) {
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
            transport::start_drag,
            transport::peek_drag,
            transport::accept_drag,
            transport::end_drag,
            transport::take_detached_drag,
            transport::report_move,
            transport::load_layout,
            transport::report_layout,
            workspace_info,
            transport::report_local_step,
            transport::undo,
            transport::redo,
            transport::get_history,
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
            app.state::<Persistence>().save_if_dirty(app);
        }
        _ => {}
    });
}
