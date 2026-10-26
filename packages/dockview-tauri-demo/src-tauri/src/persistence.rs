//! Where the workspace lives between runs: the file, and when it is written.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use tauri::{AppHandle, Manager};

use crate::lock;
use crate::orchestrator::workspace_registry::{WorkspaceState, FORMAT_VERSION};
use crate::transport::workspace;

/// Overrides the workspace file's path.
pub const WORKSPACE_ENV: &str = "DOCKVIEW_DEMO_WORKSPACE";

pub const SAVE_DEBOUNCE: Duration = Duration::from_millis(500);

pub fn workspace_path(app: &AppHandle) -> PathBuf {
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

pub struct Persistence {
    pub store: FileStore,
    pub dirty: AtomicBool,
    /// Windows closing as part of the exit stay on record.
    pub exiting: AtomicBool,
    pub last_saved: Mutex<Option<SystemTime>>,
}

impl Persistence {
    pub fn mark_dirty(&self) {
        self.dirty.store(true, Ordering::Relaxed);
    }

    pub fn save_if_dirty(&self, app: &AppHandle) {
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

/// Written to a sibling file and renamed, so a crash leaves the old one intact.
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
    use crate::orchestrator::workspace_registry::WindowRecord;
    use serde_json::json;

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
            layout: Some(json!({ "panels": { "a": {} } })),
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
}
