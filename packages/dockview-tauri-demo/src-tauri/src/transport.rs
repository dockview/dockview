//! One command per `MultiWindowTransport` call, the Rust side of
//! `src/transport.ts`. The window a call names is the caller.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::lock;
use crate::orchestrator::drag_sessions::{DragEnd, DragSession, DragSessions, Release};
use crate::orchestrator::history_sequencer::{self, HistorySequencer, Request, Role, Step};
use crate::orchestrator::workspace_registry::WorkspaceRegistry;
use crate::persistence::Persistence;

pub fn drags(app: &AppHandle) -> MutexGuard<'_, DragSessions> {
    lock(app.state::<Mutex<DragSessions>>().inner())
}

pub fn workspace(app: &AppHandle) -> MutexGuard<'_, WorkspaceRegistry> {
    lock(app.state::<Mutex<WorkspaceRegistry>>().inner())
}

pub fn history(app: &AppHandle) -> MutexGuard<'_, HistorySequencer> {
    lock(app.state::<Mutex<HistorySequencer>>().inner())
}

/// To the source window: another window took its drag.
const RELEASE_EVENT: &str = "dockview:release";

const MOVED_EVENT: &str = "dockview:moved";
const HISTORY_EVENT: &str = "dockview:history";
/// To one window: a `HistoryRequest`.
const HISTORY_REQUEST_EVENT: &str = "dockview:history-request";

static DETACH_COUNT: AtomicUsize = AtomicUsize::new(0);

/// Skips labels restored from the workspace as well as open ones.
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

/// `panel.id` of a tab, or `group.group.views` of a group.
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
    reason: &'static str,
}

pub fn broadcast_history(app: &AppHandle) {
    let info = history(app).info();
    if let Err(err) = app.emit(HISTORY_EVENT, info) {
        eprintln!("history: could not broadcast: {err}");
    }
}

fn carry_out(app: &AppHandle, step: Step, reason: &'static str) -> Result<(), String> {
    // Stored first and under one lock, so neither the window's own report
    // nor a stale one is checked against half a step.
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
        // A listener for "any" target hears every window's events, so the
        // payload names its window too.
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

pub fn perform_undo(app: &AppHandle) -> Result<(), String> {
    let step = history(app).undo().map_err(|err| err.to_string())?;
    carry_out(app, step, "undo")
}

pub fn perform_redo(app: &AppHandle) -> Result<(), String> {
    let step = history(app).redo().map_err(|err| err.to_string())?;
    carry_out(app, step, "redo")
}

#[tauri::command]
pub fn report_local_step(app: AppHandle, window: tauri::Window) {
    history(&app).push_local(window.label());
    broadcast_history(&app);
}

#[tauri::command]
pub fn report_move(
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
        history_sequencer::Half {
            window: window.label().to_string(),
            before,
            after,
        },
    );
    broadcast_history(&app);
}

#[tauri::command]
pub fn undo(app: AppHandle) -> Result<(), String> {
    perform_undo(&app)
}

#[tauri::command]
pub fn redo(app: AppHandle) -> Result<(), String> {
    perform_redo(&app)
}

#[tauri::command]
pub fn get_history(app: AppHandle) -> history_sequencer::Info {
    history(&app).info()
}

#[tauri::command]
pub fn report_layout(
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

#[tauri::command]
pub fn load_layout(app: AppHandle, window: tauri::Window) -> Option<serde_json::Value> {
    workspace(&app).load_layout(window.label())
}

fn deliver(app: &AppHandle, release: Release) -> Result<(), String> {
    app.emit_to(&release.from, RELEASE_EVENT, &release)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn start_drag(
    app: AppHandle,
    window: tauri::Window,
    session: String,
    payload: serde_json::Value,
) {
    drags(&app).start(
        session,
        DragSession {
            from: window.label().to_string(),
            payload,
        },
    );
}

#[tauri::command]
pub fn peek_drag(app: AppHandle, session: String) -> Result<serde_json::Value, String> {
    drags(&app).peek(&session).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn accept_drag(app: AppHandle, window: tauri::Window, session: String) -> Result<(), String> {
    let to = window.label().to_string();
    let accept = drags(&app)
        .accept(&session, to.clone())
        .map_err(|err| err.to_string())?;
    let panels = payload_panels(&accept.payload);
    let from = accept.release.from.clone();
    workspace(&app).expect_move(&panels, &from, &to);
    deliver(&app, accept.release)?;
    // The source has let go, so a failed announcement is not a failed accept.
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

/// `DRAG_END_GRACE_MS` in `dockview-enterprise`.
const DRAG_END_GRACE: std::time::Duration = std::time::Duration::from_millis(1500);

#[tauri::command]
pub fn end_drag(app: AppHandle, session: String, detach: bool) {
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
                    match crate::build_dock_window(
                        &handle,
                        &label,
                        &format!("dockview — {label}"),
                        (900.0, 600.0),
                        None,
                    ) {
                        Ok(_) => {
                            workspace(&handle).expect_move(&panels, &release.from, &label);
                            let moved = MovedNotice {
                                session: release.session.clone(),
                                panels,
                                from: release.from.clone(),
                                to: label.clone(),
                                reason: "detach",
                            };
                            // The source's earlier steps would bring the
                            // panels back.
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

#[tauri::command]
pub fn take_detached_drag(app: AppHandle, window: tauri::Window) -> Option<serde_json::Value> {
    drags(&app).take_detached_drag(window.label())
}
