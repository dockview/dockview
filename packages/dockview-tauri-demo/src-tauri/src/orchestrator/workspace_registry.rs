//! Mirrors `workspaceRegistry.ts` in `dockview-enterprise`.

use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const FORMAT_VERSION: u32 = 1;

/// A window's frame, in logical pixels.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Geometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowRecord {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub geometry: Option<Geometry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<Value>,
}

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

/// Until the source reports the panel gone, the destination may hold it too.
#[derive(Clone, Debug, PartialEq, Eq)]
struct PendingMove {
    panel: String,
    from: String,
    to: String,
}

#[derive(Default)]
pub struct WorkspaceRegistry {
    state: WorkspaceState,
    pending: Vec<PendingMove>,
}

impl WorkspaceRegistry {
    pub fn restore(state: WorkspaceState) -> Self {
        WorkspaceRegistry {
            state,
            pending: Vec::new(),
        }
    }

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

    pub fn window_ids(&self) -> Vec<String> {
        self.state
            .windows
            .iter()
            .map(|window| window.id.clone())
            .collect()
    }

    pub fn ensure_window(&mut self, label: &str) {
        entry(&mut self.state, label);
    }

    pub fn set_geometry(&mut self, label: &str, geometry: Geometry) {
        entry(&mut self.state, label).geometry = Some(geometry);
    }

    /// Refuses a layout holding another window's panel, unless a move explains it.
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

        // A source reporting without the panel completes the move.
        self.pending
            .retain(|entry| entry.from != label || incoming.contains(&entry.panel));

        entry(&mut self.state, label).layout = Some(layout);
        Ok(())
    }

    /// A layout the orchestrator itself applied.
    pub fn set_layout_unchecked(&mut self, label: &str, layout: Value) {
        entry(&mut self.state, label).layout = Some(layout);
    }

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

fn panel_ids(layout: &Value) -> Vec<String> {
    layout
        .get("panels")
        .and_then(Value::as_object)
        .map(|panels| panels.keys().cloned().collect())
        .unwrap_or_default()
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
        let mut workspace = WorkspaceRegistry::default();
        workspace.set_layout("main", layout(&["a"])).unwrap();

        assert_eq!(workspace.load_layout("main"), Some(layout(&["a"])));
        // Not consumed: a reloaded window asks again.
        assert_eq!(workspace.load_layout("main"), Some(layout(&["a"])));
        assert_eq!(workspace.load_layout("dock-2"), None);
    }

    #[test]
    fn a_layout_may_not_hold_another_windows_panel() {
        let mut workspace = WorkspaceRegistry::default();
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
        let mut workspace = WorkspaceRegistry::default();
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
        let mut workspace = WorkspaceRegistry::default();
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
        let mut workspace = WorkspaceRegistry::default();
        workspace.set_layout("main", layout(&["a", "b"])).unwrap();

        workspace.set_layout_unchecked("dock-2", layout(&["b"]));
        assert_eq!(workspace.load_layout("dock-2"), Some(layout(&["b"])));
    }

    #[test]
    fn a_window_may_re_report_its_own_panels() {
        let mut workspace = WorkspaceRegistry::default();
        workspace.set_layout("main", layout(&["a", "b"])).unwrap();

        assert!(workspace.set_layout("main", layout(&["a"])).is_ok());
    }

    #[test]
    fn a_move_between_windows_converges() {
        let mut workspace = WorkspaceRegistry::default();
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
        let mut workspace = WorkspaceRegistry::default();
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
        let mut workspace = WorkspaceRegistry::default();
        workspace.set_layout("dock-2", layout(&["c"])).unwrap();

        let removed = workspace.remove_window("dock-2");

        assert_eq!(removed.map(|window| window.id), Some("dock-2".into()));
        assert_eq!(workspace.window_ids(), Vec::<String>::new());
        assert_eq!(workspace.remove_window("dock-2"), None);
    }

    #[test]
    fn a_snapshot_restores_to_the_same_workspace() {
        let mut workspace = WorkspaceRegistry::default();
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

        let restored = WorkspaceRegistry::restore(workspace.snapshot());

        assert_eq!(restored.snapshot(), workspace.snapshot());
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
