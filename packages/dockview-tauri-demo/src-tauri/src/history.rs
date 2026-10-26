//! Mirrors `historySequencer.ts` in `dockview-enterprise`.

use std::fmt;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// No window's `layoutHistory.depth` should be lower.
pub const DEPTH: usize = 25;

/// A move still missing a half after this never completes.
pub const ABANDONED_MOVE: Duration = Duration::from_secs(10);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    From,
    To,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Half {
    pub window: String,
    pub before: Value,
    pub after: Value,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Entry {
    Local {
        window: String,
    },
    Move {
        session: String,
        panels: Vec<String>,
        /// When the first half arrived.
        opened: Instant,
        from: Option<Half>,
        to: Option<Half>,
    },
}

impl Entry {
    fn summarize(&self) -> StepInfo {
        match self {
            Entry::Local { window } => StepInfo::Local {
                window_id: window.clone(),
            },
            Entry::Move {
                panels, from, to, ..
            } => StepInfo::Move {
                panels: panels.clone(),
                from: from.as_ref().map(|half| half.window.clone()),
                to: to.as_ref().map(|half| half.window.clone()),
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum Request {
    Undo,
    Redo,
    ApplyLayout { layout: Value },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Action {
    pub window: String,
    pub request: Request,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Step {
    pub actions: Vec<Action>,
    pub moved: Option<Moved>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Moved {
    pub session: String,
    pub panels: Vec<String>,
    pub from: String,
    pub to: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StepInfo {
    Local {
        #[serde(rename = "windowId")]
        window_id: String,
    },
    Move {
        panels: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        from: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        to: Option<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub can_undo: bool,
    pub can_redo: bool,
    pub undo_count: usize,
    pub redo_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_undo: Option<StepInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_redo: Option<StepInfo>,
}

#[derive(Debug, PartialEq)]
pub enum HistoryError {
    Nothing,
    Incomplete(String),
    Abandoned(String),
}

impl fmt::Display for HistoryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HistoryError::Nothing => write!(f, "nothing to do"),
            HistoryError::Incomplete(session) => {
                write!(f, "move {session} is still being recorded")
            }
            HistoryError::Abandoned(session) => write!(
                f,
                "move {session} was never completed; the history before it is dropped"
            ),
        }
    }
}

impl std::error::Error for HistoryError {}

pub struct History {
    undo: Vec<Entry>,
    redo: Vec<Entry>,
    abandon_after: Duration,
}

impl Default for History {
    fn default() -> Self {
        History {
            undo: Vec::new(),
            redo: Vec::new(),
            abandon_after: ABANDONED_MOVE,
        }
    }
}

impl History {
    pub fn push_local(&mut self, window: &str) {
        self.push(Entry::Local {
            window: window.to_string(),
        });
    }

    /// The two halves of a move arrive in either order.
    pub fn record_move(&mut self, session: &str, panels: &[String], role: Role, half: Half) {
        let existing = self.undo.iter_mut().find(
            |entry| matches!(entry, Entry::Move { session: recorded, .. } if recorded == session),
        );

        match existing {
            Some(Entry::Move { from, to, .. }) => match role {
                Role::From => *from = Some(half),
                Role::To => *to = Some(half),
            },
            _ => {
                let (from, to) = match role {
                    Role::From => (Some(half), None),
                    Role::To => (None, Some(half)),
                };
                self.push(Entry::Move {
                    session: session.to_string(),
                    panels: panels.to_vec(),
                    opened: Instant::now(),
                    from,
                    to,
                });
            }
        }
    }

    pub fn undo(&mut self) -> Result<Step, HistoryError> {
        if let Some(Entry::Move {
            session,
            opened,
            from,
            to,
            ..
        }) = self.undo.last()
        {
            if (from.is_none() || to.is_none()) && opened.elapsed() >= self.abandon_after {
                // The steps before it restore layouts from before the move.
                let session = session.clone();
                self.undo.clear();
                return Err(HistoryError::Abandoned(session));
            }
        }
        let entry = self.undo.last().ok_or(HistoryError::Nothing)?;
        let step = match entry {
            Entry::Local { window } => Step {
                actions: vec![Action {
                    window: window.clone(),
                    request: Request::Undo,
                }],
                moved: None,
            },
            Entry::Move {
                session,
                panels,
                from,
                to,
                ..
            } => {
                let (from, to) = complete(session, from, to)?;
                // Destination first, so no two windows hold the panels at once.
                Step {
                    actions: vec![
                        apply(&to.window, &to.before),
                        apply(&from.window, &from.before),
                    ],
                    moved: Some(Moved {
                        session: session.clone(),
                        panels: panels.clone(),
                        from: to.window.clone(),
                        to: from.window.clone(),
                    }),
                }
            }
        };
        let entry = self.undo.pop().expect("checked above");
        self.redo.push(entry);
        Ok(step)
    }

    pub fn redo(&mut self) -> Result<Step, HistoryError> {
        let entry = self.redo.last().ok_or(HistoryError::Nothing)?;
        let step = match entry {
            Entry::Local { window } => Step {
                actions: vec![Action {
                    window: window.clone(),
                    request: Request::Redo,
                }],
                moved: None,
            },
            Entry::Move {
                session,
                panels,
                from,
                to,
                ..
            } => {
                let (from, to) = complete(session, from, to)?;
                Step {
                    actions: vec![
                        apply(&from.window, &from.after),
                        apply(&to.window, &to.after),
                    ],
                    moved: Some(Moved {
                        session: session.clone(),
                        panels: panels.clone(),
                        from: from.window.clone(),
                        to: to.window.clone(),
                    }),
                }
            }
        };
        let entry = self.redo.pop().expect("checked above");
        self.undo.push(entry);
        Ok(step)
    }

    pub fn info(&self) -> Info {
        Info {
            can_undo: !self.undo.is_empty(),
            can_redo: !self.redo.is_empty(),
            undo_count: self.undo.len(),
            redo_count: self.redo.len(),
            next_undo: self.undo.last().map(Entry::summarize),
            next_redo: self.redo.last().map(Entry::summarize),
        }
    }

    /// Drop the window's entries and every incomplete move, and everything
    /// older than a move dropped: those steps restore layouts from before it.
    pub fn forget_window(&mut self, window: &str) {
        let involves = |entry: &Entry| match entry {
            Entry::Local { window: w } => w == window,
            Entry::Move { from, to, .. } => match (from, to) {
                (Some(from), Some(to)) => from.window == window || to.window == window,
                _ => true,
            },
        };
        // Oldest first in both stacks.
        for stack in [&mut self.undo, &mut self.redo] {
            let cut = stack
                .iter()
                .rposition(|entry| matches!(entry, Entry::Move { .. }) && involves(entry))
                .map_or(0, |index| index + 1);
            let kept: Vec<Entry> = stack
                .drain(..)
                .skip(cut)
                .filter(|entry| !involves(entry))
                .collect();
            *stack = kept;
        }
    }

    fn push(&mut self, entry: Entry) {
        self.undo.push(entry);
        self.redo.clear();
        if self.undo.len() > DEPTH {
            self.undo.remove(0);
        }
    }
}

fn apply(window: &str, layout: &Value) -> Action {
    Action {
        window: window.to_string(),
        request: Request::ApplyLayout {
            layout: layout.clone(),
        },
    }
}

fn complete<'a>(
    session: &str,
    from: &'a Option<Half>,
    to: &'a Option<Half>,
) -> Result<(&'a Half, &'a Half), HistoryError> {
    match (from, to) {
        (Some(from), Some(to)) => Ok((from, to)),
        _ => Err(HistoryError::Incomplete(session.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn half(window: &str, before: &str, after: &str) -> Half {
        Half {
            window: window.into(),
            before: json!({ "state": before }),
            after: json!({ "state": after }),
        }
    }

    fn moved(history: &mut History) {
        history.record_move("s1", &["p".into()], Role::From, half("main", "A0", "A1"));
        history.record_move("s1", &["p".into()], Role::To, half("dock-2", "B0", "B1"));
    }

    #[test]
    fn a_local_step_undoes_and_redoes_in_its_window() {
        let mut history = History::default();
        history.push_local("main");

        assert_eq!(
            history.undo().unwrap().actions,
            vec![Action {
                window: "main".into(),
                request: Request::Undo,
            }]
        );
        assert_eq!(
            history.redo().unwrap().actions,
            vec![Action {
                window: "main".into(),
                request: Request::Redo,
            }]
        );
    }

    #[test]
    fn a_move_undoes_destination_first_then_source_with_before_layouts() {
        let mut history = History::default();
        moved(&mut history);

        let step = history.undo().unwrap();

        assert_eq!(
            step.actions,
            vec![
                apply("dock-2", &json!({ "state": "B0" })),
                apply("main", &json!({ "state": "A0" })),
            ]
        );
        assert_eq!(
            step.moved,
            Some(Moved {
                session: "s1".into(),
                panels: vec!["p".into()],
                from: "dock-2".into(),
                to: "main".into()
            })
        );
    }

    #[test]
    fn a_move_redoes_source_first_then_destination_with_after_layouts() {
        let mut history = History::default();
        moved(&mut history);
        history.undo().unwrap();

        let step = history.redo().unwrap();

        assert_eq!(
            step.actions,
            vec![
                apply("main", &json!({ "state": "A1" })),
                apply("dock-2", &json!({ "state": "B1" })),
            ]
        );
        assert_eq!(step.moved.unwrap().to, "dock-2");
    }

    #[test]
    fn the_halves_may_arrive_in_either_order() {
        let mut history = History::default();
        history.record_move("s1", &["p".into()], Role::To, half("dock-2", "B0", "B1"));
        history.record_move("s1", &["p".into()], Role::From, half("main", "A0", "A1"));

        assert_eq!(history.info().undo_count, 1);
        assert!(history.undo().is_ok());
    }

    #[test]
    fn an_incomplete_move_cannot_be_undone_yet() {
        let mut history = History::default();
        history.record_move("s1", &["p".into()], Role::From, half("main", "A0", "A1"));

        assert_eq!(history.undo(), Err(HistoryError::Incomplete("s1".into())));
        // Still on the stack for when the other half arrives.
        assert_eq!(history.info().undo_count, 1);
    }

    #[test]
    fn steps_unwind_in_the_order_they_happened_across_windows() {
        let mut history = History::default();
        history.push_local("main");
        moved(&mut history);
        history.push_local("dock-2");

        assert_eq!(
            history.undo().unwrap().actions,
            vec![Action {
                window: "dock-2".into(),
                request: Request::Undo,
            }]
        );
        assert!(history.undo().unwrap().moved.is_some());
        assert_eq!(
            history.undo().unwrap().actions,
            vec![Action {
                window: "main".into(),
                request: Request::Undo,
            }]
        );
        assert_eq!(history.undo(), Err(HistoryError::Nothing));
    }

    #[test]
    fn a_new_step_clears_redo() {
        let mut history = History::default();
        history.push_local("main");
        history.undo().unwrap();
        assert_eq!(history.info().redo_count, 1);

        history.push_local("dock-2");

        assert_eq!(history.info().redo_count, 0);
        assert_eq!(history.redo(), Err(HistoryError::Nothing));
    }

    #[test]
    fn the_stack_is_bounded() {
        let mut history = History::default();
        for _ in 0..(DEPTH + 10) {
            history.push_local("main");
        }
        assert_eq!(history.info().undo_count, DEPTH);
    }

    #[test]
    fn a_closed_window_takes_its_steps_with_it() {
        let mut history = History::default();
        history.push_local("main");
        moved(&mut history);
        history.push_local("dock-2");

        history.forget_window("dock-2");

        // main's step predates the move into dock-2, so it goes too: undoing
        // it would restore a layout that still holds p.
        let info = history.info();
        assert_eq!(info.undo_count, 0);
        assert_eq!(info.next_undo, None);

        history.push_local("main");
        history.forget_window("dock-2");
        assert_eq!(
            history.info().next_undo,
            Some(StepInfo::Local {
                window_id: "main".into()
            })
        );
    }

    #[test]
    fn info_summarizes_the_next_steps_in_the_frontend_shape() {
        let mut history = History::default();
        moved(&mut history);
        let summary = StepInfo::Move {
            panels: vec!["p".into()],
            from: Some("main".into()),
            to: Some("dock-2".into()),
        };
        assert_eq!(history.info().next_undo, Some(summary.clone()));
        history.undo().unwrap();
        let info = history.info();
        assert_eq!(info.next_redo, Some(summary));
        assert_eq!(
            serde_json::to_value(&info).unwrap(),
            json!({
                "canUndo": false,
                "canRedo": true,
                "undoCount": 0,
                "redoCount": 1,
                "nextRedo": {
                    "type": "move",
                    "panels": ["p"],
                    "from": "main",
                    "to": "dock-2"
                }
            })
        );
        assert_eq!(
            serde_json::to_value(apply("main", &json!({})).request).unwrap(),
            json!({ "type": "apply-layout", "layout": {} })
        );
    }

    #[test]
    fn a_move_missing_a_half_is_dropped_with_any_window() {
        let mut history = History::default();
        history.record_move("s1", &["p".into()], Role::From, half("main", "A0", "A1"));
        // The destination closed before reporting its half.
        history.push_local("main");
        history.undo().unwrap();
        assert_eq!(history.undo(), Err(HistoryError::Incomplete("s1".into())));

        history.forget_window("dock-2");

        assert_eq!(history.undo(), Err(HistoryError::Nothing));
        assert_eq!(
            history.redo().unwrap().actions,
            vec![Action {
                window: "main".into(),
                request: Request::Redo,
            }]
        );
    }

    #[test]
    fn a_dropped_move_takes_the_steps_beyond_it() {
        let mut history = History::default();
        // dock-3 closes a tab while it holds p, then p moves to dock-2.
        history.push_local("dock-3");
        history.record_move("s1", &["p".into()], Role::From, half("dock-3", "C0", "C1"));
        history.record_move("s1", &["p".into()], Role::To, half("dock-2", "B0", "B1"));
        history.push_local("main");

        history.forget_window("dock-2");

        assert_eq!(
            history.undo().unwrap().actions,
            vec![Action {
                window: "main".into(),
                request: Request::Undo,
            }]
        );
        assert_eq!(history.undo(), Err(HistoryError::Nothing));
    }

    #[test]
    fn a_move_never_completed_is_dropped_once_abandoned() {
        let mut history = History {
            abandon_after: Duration::ZERO,
            ..History::default()
        };
        history.push_local("main");
        history.record_move("s1", &["p".into()], Role::To, half("dock-2", "B0", "B1"));

        assert_eq!(history.undo(), Err(HistoryError::Abandoned("s1".into())));
        assert_eq!(history.info().undo_count, 0);
    }
}
