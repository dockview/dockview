//! The workspace: which windows exist, where they are, and what each one
//! holds. The orchestrator owns it because only the party that creates
//! windows can bring them back; a window cannot restore itself before it
//! exists.
//!
//! Each window's dockview layout is an opaque `serde_json::Value` produced
//! by `api.toJSON()` and consumed by `api.fromJSON()` in that window. This
//! module stores and hands those out; the one thing it reads from them is
//! the top-level `panels` map's keys, to refuse a layout that would give two
//! windows the same panel id, since a drag between them relies on ids being
//! unique across the whole workspace.
//!
//! Like `drags.rs`, this knows nothing about Tauri. The host decides when to
//! load and save, feeds in native geometry, and creates the windows.
//!
//! Mirrors `workspaceRegistry.ts` in `dockview-enterprise`; keep the two in
//! step.

use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The file format's version, bumped if `WorkspaceState` changes shape.
pub const FORMAT_VERSION: u32 = 1;

/// A native window's frame, in physical pixels.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Geometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// One window: the `WindowRecord` of `dockview-enterprise`, so the file has
/// the shape `MemoryOrchestrator.snapshot()` writes. The id is the Tauri
/// window label.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowRecord {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub geometry: Option<Geometry>,
    /// The window's `SerializedDockview`, opaque here. `None` until the
    /// window first reports one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<Value>,
}

/// What goes in the file. Windows keep creation order, so a restore opens
/// them in the order the user did.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceState {
    pub version: u32,
    pub windows: Vec<WindowRecord>,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        WorkspaceState {
            version: FORMAT_VERSION,
            windows: Vec::new(),
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum WorkspaceError {
    /// The layout names a panel another window already holds.
    DuplicatePanel { panel: String, window: String },
}

impl fmt::Display for WorkspaceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WorkspaceError::DuplicatePanel { panel, window } => {
                write!(f, "panel {panel} is already held by window {window}")
            }
        }
    }
}

impl std::error::Error for WorkspaceError {}

/// A panel on its way between two windows. While it is pending, the
/// destination may report a layout holding it although the source's stored
/// layout still does too: the two windows report independently and in
/// either order, so the duplicate is the move itself, not a conflict.
#[derive(Clone, Debug, PartialEq, Eq)]
struct PendingMove {
    panel: String,
    from: String,
    to: String,
}

/// The live workspace. One per host process.
#[derive(Default)]
pub struct Workspace {
    state: WorkspaceState,
    pending: Vec<PendingMove>,
}

impl Workspace {
    pub fn restore(state: WorkspaceState) -> Self {
        Workspace {
            state,
            pending: Vec::new(),
        }
    }

    /// Announce that `panels` are moving from one window to another, so the
    /// two windows' next reports are reconciled rather than refused. A
    /// pending move is forgotten once the source reports a layout without
    /// the panel.
    pub fn expect_move(&mut self, panels: &[String], from: &str, to: &str) {
        for panel in panels {
            self.pending.retain(|entry| entry.panel != *panel);
            self.pending.push(PendingMove {
                panel: panel.clone(),
                from: from.to_string(),
                to: to.to_string(),
            });
        }
    }

    pub fn snapshot(&self) -> WorkspaceState {
        self.state.clone()
    }

    /// The labels of the windows on record, in creation order.
    pub fn window_ids(&self) -> Vec<String> {
        self.state
            .windows
            .iter()
            .map(|window| window.id.clone())
            .collect()
    }

    /// Puts a window on record, with no geometry or layout yet. A window
    /// already on record is left alone.
    pub fn ensure_window(&mut self, label: &str) {
        entry(&mut self.state, label);
    }

    pub fn set_geometry(&mut self, label: &str, geometry: Geometry) {
        entry(&mut self.state, label).geometry = Some(geometry);
    }

    /// A window reports its layout. Refused if it names a panel another
    /// window holds, in which case nothing is recorded, unless that panel is
    /// on its way from that window to this one (see [`Workspace::expect_move`]).
    pub fn set_layout(&mut self, label: &str, layout: Value) -> Result<(), WorkspaceError> {
        let incoming = panel_ids(&layout);
        for other in self
            .state
            .windows
            .iter()
            .filter(|window| window.id != label)
        {
            if let Some(theirs) = other.layout.as_ref() {
                let theirs = panel_ids(theirs);
                if let Some(panel) = incoming.iter().find(|id| {
                    theirs.contains(id)
                        && !self.pending.iter().any(|entry| {
                            entry.panel == **id && entry.from == other.id && entry.to == label
                        })
                }) {
                    return Err(WorkspaceError::DuplicatePanel {
                        panel: panel.clone(),
                        window: other.id.clone(),
                    });
                }
            }
        }

        // A source that no longer holds a panel has completed its half of
        // the move; the panel needs no further allowance.
        self.pending
            .retain(|entry| entry.from != label || incoming.contains(&entry.panel));

        entry(&mut self.state, label).layout = Some(layout);
        Ok(())
    }

    /// Records a layout the orchestrator itself is applying to a window, as
    /// an undo or redo does. It is trusted as is: the orchestrator computed
    /// it from layouts it already held, and applies the two windows' halves
    /// in an order that never leaves a panel in both.
    pub fn set_layout_unchecked(&mut self, label: &str, layout: Value) {
        entry(&mut self.state, label).layout = Some(layout);
    }

    /// The layout a window should start with: what it last reported, or what
    /// the file held for it. Not consumed, so a reloaded window gets it again.
    pub fn load_layout(&self, label: &str) -> Option<Value> {
        self.state
            .windows
            .iter()
            .find(|window| window.id == label)
            .and_then(|window| window.layout.clone())
    }

    pub fn remove_window(&mut self, label: &str) -> Option<WindowRecord> {
        let index = self
            .state
            .windows
            .iter()
            .position(|window| window.id == label)?;
        Some(self.state.windows.remove(index))
    }
}

fn entry<'a>(state: &'a mut WorkspaceState, label: &str) -> &'a mut WindowRecord {
    if let Some(index) = state.windows.iter().position(|window| window.id == label) {
        return &mut state.windows[index];
    }
    state.windows.push(WindowRecord {
        id: label.to_string(),
        ..WindowRecord::default()
    });
    state.windows.last_mut().expect("just pushed")
}

/// The panel ids a `SerializedDockview` holds: the keys of its top-level
/// `panels` map. The only field of a layout this module reads.
fn panel_ids(layout: &Value) -> Vec<String> {
    layout
        .get("panels")
        .and_then(Value::as_object)
        .map(|panels| panels.keys().cloned().collect())
        .unwrap_or_default()
}

/// A JSON file, written atomically: the new contents go to a sibling file
/// first and are renamed over the old one, so a crash mid-write leaves the
/// previous workspace intact rather than a truncated file.
pub struct FileStore {
    path: PathBuf,
}

impl FileStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        FileStore { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// `None` when nothing has been saved yet.
    pub fn load(&self) -> io::Result<Option<WorkspaceState>> {
        let text = match fs::read_to_string(&self.path) {
            Ok(text) => text,
            Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(err) => return Err(err),
        };
        let state: WorkspaceState = serde_json::from_str(&text)
            .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))?;
        if state.version != FORMAT_VERSION {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "workspace format {} is not the supported {FORMAT_VERSION}",
                    state.version
                ),
            ));
        }
        Ok(Some(state))
    }

    pub fn save(&self, state: &WorkspaceState) -> io::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let text = serde_json::to_string_pretty(state)
            .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))?;
        let staging = self.path.with_extension("json.tmp");
        fs::write(&staging, text)?;
        fs::rename(&staging, &self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn layout(panels: &[&str]) -> Value {
        let panels: serde_json::Map<String, Value> = panels
            .iter()
            .map(|id| (id.to_string(), json!({ "id": id, "contentComponent": "x" })))
            .collect();
        json!({ "grid": {}, "panels": panels })
    }

    #[test]
    fn a_reported_layout_is_the_initial_layout_next_time() {
        let mut workspace = Workspace::default();
        workspace.set_layout("main", layout(&["a"])).unwrap();

        assert_eq!(workspace.load_layout("main"), Some(layout(&["a"])));
        // Not consumed: a reloaded window asks again.
        assert_eq!(workspace.load_layout("main"), Some(layout(&["a"])));
        assert_eq!(workspace.load_layout("dock-2"), None);
    }

    #[test]
    fn a_layout_may_not_hold_another_windows_panel() {
        let mut workspace = Workspace::default();
        workspace.set_layout("main", layout(&["a", "b"])).unwrap();

        assert_eq!(
            workspace.set_layout("dock-2", layout(&["b", "c"])),
            Err(WorkspaceError::DuplicatePanel {
                panel: "b".into(),
                window: "main".into()
            })
        );
        // Nothing recorded for the refused window.
        assert_eq!(workspace.load_layout("dock-2"), None);
    }

    #[test]
    fn a_panel_on_its_way_may_be_reported_by_the_destination_first() {
        let mut workspace = Workspace::default();
        workspace.set_layout("main", layout(&["a", "b"])).unwrap();
        workspace.set_layout("dock-2", layout(&["c"])).unwrap();

        workspace.expect_move(&["b".into()], "main", "dock-2");

        // The destination's report lands before the source's.
        assert!(workspace.set_layout("dock-2", layout(&["c", "b"])).is_ok());
        assert!(workspace.set_layout("main", layout(&["a"])).is_ok());

        // The allowance is spent: a third window may not accept `b` now.
        assert_eq!(
            workspace.set_layout("dock-3", layout(&["b"])),
            Err(WorkspaceError::DuplicatePanel {
                panel: "b".into(),
                window: "dock-2".into()
            })
        );
    }

    #[test]
    fn an_allowance_is_only_for_the_announced_destination() {
        let mut workspace = Workspace::default();
        workspace.set_layout("main", layout(&["a", "b"])).unwrap();
        workspace.expect_move(&["b".into()], "main", "dock-2");

        assert_eq!(
            workspace.set_layout("dock-3", layout(&["b"])),
            Err(WorkspaceError::DuplicatePanel {
                panel: "b".into(),
                window: "main".into()
            })
        );
    }

    #[test]
    fn an_unchecked_layout_is_taken_as_is() {
        let mut workspace = Workspace::default();
        workspace.set_layout("main", layout(&["a", "b"])).unwrap();

        workspace.set_layout_unchecked("dock-2", layout(&["b"]));
        assert_eq!(workspace.load_layout("dock-2"), Some(layout(&["b"])));
    }

    #[test]
    fn a_window_may_re_report_its_own_panels() {
        let mut workspace = Workspace::default();
        workspace.set_layout("main", layout(&["a", "b"])).unwrap();

        assert!(workspace.set_layout("main", layout(&["a"])).is_ok());
    }

    #[test]
    fn a_move_between_windows_converges() {
        let mut workspace = Workspace::default();
        workspace.set_layout("main", layout(&["a", "b"])).unwrap();
        workspace.set_layout("dock-2", layout(&["c"])).unwrap();

        // The source reports first, then the destination.
        workspace.set_layout("main", layout(&["a"])).unwrap();
        workspace.set_layout("dock-2", layout(&["c", "b"])).unwrap();

        assert_eq!(workspace.load_layout("main"), Some(layout(&["a"])));
        assert_eq!(workspace.load_layout("dock-2"), Some(layout(&["c", "b"])));
    }

    #[test]
    fn windows_keep_creation_order_and_geometry() {
        let mut workspace = Workspace::default();
        workspace.ensure_window("main");
        workspace.set_geometry(
            "dock-2",
            Geometry {
                x: 1300,
                y: 0,
                width: 1000,
                height: 700,
            },
        );
        workspace.ensure_window("main");

        assert_eq!(workspace.window_ids(), vec!["main", "dock-2"]);
        assert_eq!(
            workspace.snapshot().windows[1].geometry,
            Some(Geometry {
                x: 1300,
                y: 0,
                width: 1000,
                height: 700
            })
        );
    }

    #[test]
    fn removing_a_window_forgets_it() {
        let mut workspace = Workspace::default();
        workspace.set_layout("dock-2", layout(&["c"])).unwrap();

        let removed = workspace.remove_window("dock-2");

        assert_eq!(removed.map(|window| window.id), Some("dock-2".into()));
        assert_eq!(workspace.window_ids(), Vec::<String>::new());
        assert_eq!(workspace.remove_window("dock-2"), None);
    }

    #[test]
    fn a_snapshot_restores_to_the_same_workspace() {
        let mut workspace = Workspace::default();
        workspace.set_layout("main", layout(&["a"])).unwrap();
        workspace.set_geometry(
            "main",
            Geometry {
                x: 0,
                y: 0,
                width: 1280,
                height: 820,
            },
        );

        let restored = Workspace::restore(workspace.snapshot());

        assert_eq!(restored.snapshot(), workspace.snapshot());
    }

    #[test]
    fn the_file_store_round_trips_and_starts_empty() {
        let dir = std::env::temp_dir().join(format!(
            "dockview-workspace-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let store = FileStore::new(dir.join("nested").join("workspace.json"));

        assert_eq!(store.load().unwrap(), None);

        let mut state = WorkspaceState::default();
        state.windows.push(WindowRecord {
            id: "main".into(),
            geometry: None,
            layout: Some(layout(&["a"])),
        });
        store.save(&state).unwrap();

        assert_eq!(store.load().unwrap(), Some(state));
        assert!(!store.path().with_extension("json.tmp").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_file_store_refuses_another_format_version() {
        let dir =
            std::env::temp_dir().join(format!("dockview-workspace-version-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("workspace.json");
        fs::write(&path, r#"{"version": 99, "windows": []}"#).unwrap();

        let err = FileStore::new(&path).load().unwrap_err();

        assert_eq!(err.kind(), io::ErrorKind::InvalidData);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_record_has_the_enterprise_shape() {
        let record = WindowRecord {
            id: "main".into(),
            geometry: None,
            layout: None,
        };
        assert_eq!(
            serde_json::to_value(&record).unwrap(),
            json!({ "id": "main" })
        );
    }
}
