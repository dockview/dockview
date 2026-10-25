//! The orchestrator: the one party that knows which drag is in flight
//! between windows and which window has accepted it.
//!
//! Windows are peers. Each runs its own dockview instance in its own
//! JavaScript context, so a group moving between two of them is a copy:
//! serialized by the source when the drag starts, rebuilt by the destination
//! when the drop lands, and only then removed from the source. This module
//! holds that in-flight state and decides who wins. It knows nothing about
//! Tauri, windows or IPC: the shell wraps each method in a command and
//! delivers the [`Release`] notices this module hands back. That boundary is
//! deliberate, so the module can one day be lifted into a crate of its own
//! and sit behind any host, not only Tauri.
//!
//! The payload is opaque here: a `serde_json::Value`, the `DragPayload` of
//! `dockview-enterprise` (a tab's `toJSON()` or a group's `serializeGroup`
//! output). The orchestrator never looks inside it.
//!
//! Mirrors `dragSessions.ts` in `dockview-enterprise`; keep the two in step.

use std::collections::HashMap;
use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One drag in flight between windows.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DragSession {
    /// The window the drag started in; the one told to let go on an accept.
    pub from: String,
    /// What the drag carries, opaque here.
    pub payload: Value,
}

/// A session with what the source said when its drag ended, if it has.
#[derive(Clone, Debug, PartialEq)]
struct Tracked {
    drag: DragSession,
    /// `Some` once the source reported the drag over, with whether it asked
    /// for an unaccepted drag to become a new window.
    ended: Option<bool>,
}

/// Tells the source window that another window has taken its drag.
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Release {
    /// The window to deliver this to.
    pub from: String,
    pub session: String,
    /// The window that took the payload.
    pub to: String,
    /// `drop` on a window that accepted it, or `detach` into a window the
    /// shell opened for an unaccepted drag. Only a drop is a move the shared
    /// history records.
    pub reason: &'static str,
}

/// A successful accept: the payload for the accepting window, and the notice
/// for the source.
#[derive(Clone, Debug, PartialEq)]
pub struct Accept {
    pub payload: Value,
    pub release: Release,
}

/// What became of a drag the source reported over, once its grace period
/// ran out.
#[derive(Clone, Debug, PartialEq)]
pub enum DragEnd {
    /// Nothing was in flight under that id: a window accepted it (before or
    /// during the grace period), or the drag was never announced.
    Settled,
    /// The drag was unaccepted and has been forgotten.
    Discarded,
    /// The drag was unaccepted and the source asked for it to live on: the
    /// payload now waits under `window_id` for a window of that id to
    /// collect it with [`DragSessions::take_detached_drag`], and the source
    /// is told to let go.
    Detached {
        window_id: String,
        payload: Value,
        release: Release,
    },
}

#[derive(Debug, PartialEq)]
pub enum DragError {
    /// No drag under that session id: accepted already, ended, or never
    /// announced.
    NotInFlight(String),
}

impl fmt::Display for DragError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DragError::NotInFlight(session) => {
                write!(f, "drag session {session} is not in flight")
            }
        }
    }
}

impl std::error::Error for DragError {}

/// The in-flight state. One instance per host process.
#[derive(Default)]
pub struct DragSessions {
    /// Drags in flight, keyed by the session id the source put on the
    /// drag's `DataTransfer`. Removed on accept, or on expiry after the drag
    /// ended.
    sessions: HashMap<String, Tracked>,
    /// Payloads of detached drags, waiting for a window that has not loaded
    /// yet, keyed by that window's id.
    detached: HashMap<String, Value>,
}

impl DragSessions {
    /// The source announces a drag, handing over the payload so the drop can
    /// be completed from here alone, even if the source is busy or gone by
    /// then.
    pub fn start(&mut self, session: String, drag: DragSession) {
        self.sessions.insert(session, Tracked { drag, ended: None });
    }

    /// A destination reads the payload before deciding to accept it, so it
    /// can refuse one it cannot take without the source letting go.
    pub fn peek(&self, session: &str) -> Result<Value, DragError> {
        self.sessions
            .get(session)
            .map(|tracked| tracked.drag.payload.clone())
            .ok_or_else(|| DragError::NotInFlight(session.to_string()))
    }

    /// A destination accepts the drop. The first accept wins: the session is
    /// removed, so a second accepting window finds nothing.
    pub fn accept(&mut self, session: &str, to: String) -> Result<Accept, DragError> {
        let taken = self
            .sessions
            .remove(session)
            .ok_or_else(|| DragError::NotInFlight(session.to_string()))?;

        Ok(Accept {
            payload: taken.drag.payload,
            release: Release {
                from: taken.drag.from,
                session: session.to_string(),
                to,
                reason: "drop",
            },
        })
    }

    /// The source reports its drag over. The drag stays acceptable: the
    /// source's `dragend` fires the instant the drop lands, and the
    /// destination's accept is a separate message from another process that
    /// may well arrive after it. The host calls [`DragSessions::expire`] once a grace
    /// period has passed; `detach` is remembered until then. Returns
    /// whether anything was still in flight to wait for.
    pub fn end(&mut self, session: &str, detach: bool) -> bool {
        match self.sessions.get_mut(session) {
            Some(tracked) => {
                tracked.ended = Some(detach);
                true
            }
            None => false,
        }
    }

    /// The grace period after [`DragSessions::end`] is over. An unaccepted drag is
    /// discarded, or, if the source asked, parked under the window id
    /// `new_window_id` yields for a new window to collect.
    pub fn expire(&mut self, session: &str, new_window_id: impl FnOnce() -> String) -> DragEnd {
        // Still in flight and the source has not reported it over: not ours
        // to expire.
        let Some(ended) = self.sessions.get(session).and_then(|tracked| tracked.ended) else {
            return DragEnd::Settled;
        };
        let unaccepted = self.sessions.remove(session).expect("just looked up");
        if !ended {
            return DragEnd::Discarded;
        }

        let window_id = new_window_id();
        self.detached
            .insert(window_id.clone(), unaccepted.drag.payload.clone());

        DragEnd::Detached {
            release: Release {
                from: unaccepted.drag.from,
                session: session.to_string(),
                to: window_id.clone(),
                reason: "detach",
            },
            payload: unaccepted.drag.payload,
            window_id,
        }
    }

    /// A freshly loaded window collects the payload parked for it, if any.
    pub fn take_detached_drag(&mut self, window_id: &str) -> Option<Value> {
        self.detached.remove(window_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn drag(from: &str) -> DragSession {
        DragSession {
            from: from.to_string(),
            payload: json!({ "kind": "panel", "panel": { "id": "p" } }),
        }
    }

    #[test]
    fn an_accept_returns_the_payload_and_releases_the_source() {
        let mut drags = DragSessions::default();
        drags.start("s1".into(), drag("main"));

        let accept = drags.accept("s1", "dock-2".into()).unwrap();

        assert_eq!(accept.payload, drag("main").payload);
        assert_eq!(
            accept.release,
            Release {
                from: "main".into(),
                session: "s1".into(),
                to: "dock-2".into(),
                reason: "drop",
            }
        );
    }

    #[test]
    fn the_first_accept_wins() {
        let mut drags = DragSessions::default();
        drags.start("s1".into(), drag("main"));

        drags.accept("s1", "dock-2".into()).unwrap();

        assert_eq!(
            drags.accept("s1", "dock-3".into()),
            Err(DragError::NotInFlight("s1".into()))
        );
    }

    #[test]
    fn a_peek_leaves_the_drag_in_flight() {
        let mut drags = DragSessions::default();
        drags.start("s1".into(), drag("main"));

        assert_eq!(drags.peek("s1").unwrap(), drag("main").payload);
        assert!(drags.accept("s1", "dock-2".into()).is_ok());
    }

    #[test]
    fn an_unknown_session_is_refused() {
        let mut drags = DragSessions::default();

        assert_eq!(
            drags.peek("nope"),
            Err(DragError::NotInFlight("nope".into()))
        );
        assert_eq!(
            drags.accept("nope", "dock-2".into()),
            Err(DragError::NotInFlight("nope".into()))
        );
    }

    #[test]
    fn an_accept_during_the_grace_period_still_wins() {
        let mut drags = DragSessions::default();
        drags.start("s1".into(), drag("main"));

        // The source's dragend beats the destination's accept to the drags.
        assert!(drags.end("s1", false));
        assert!(drags.accept("s1", "dock-2".into()).is_ok());

        assert_eq!(drags.expire("s1", || "x".into()), DragEnd::Settled);
    }

    #[test]
    fn ending_an_accepted_drag_has_nothing_to_wait_for() {
        let mut drags = DragSessions::default();
        drags.start("s1".into(), drag("main"));
        drags.accept("s1", "dock-2".into()).unwrap();

        assert!(!drags.end("s1", true));
        assert_eq!(drags.expire("s1", || "x".into()), DragEnd::Settled);
    }

    #[test]
    fn expiring_a_drag_still_in_flight_leaves_it_alone() {
        let mut drags = DragSessions::default();
        drags.start("s1".into(), drag("main"));

        assert_eq!(drags.expire("s1", || "x".into()), DragEnd::Settled);
        assert!(drags.peek("s1").is_ok());
    }

    #[test]
    fn an_unaccepted_drag_is_discarded_on_expiry() {
        let mut drags = DragSessions::default();
        drags.start("s1".into(), drag("main"));
        drags.end("s1", false);

        assert_eq!(drags.expire("s1", || "x".into()), DragEnd::Discarded);
        assert_eq!(drags.peek("s1"), Err(DragError::NotInFlight("s1".into())));
    }

    #[test]
    fn a_detach_parks_the_payload_for_the_new_window() {
        let mut drags = DragSessions::default();
        drags.start("s1".into(), drag("main"));
        drags.end("s1", true);

        let ended = drags.expire("s1", || "dock-detached-0".into());

        assert_eq!(
            ended,
            DragEnd::Detached {
                window_id: "dock-detached-0".into(),
                payload: drag("main").payload,
                release: Release {
                    from: "main".into(),
                    session: "s1".into(),
                    to: "dock-detached-0".into(),
                    reason: "detach",
                }
            }
        );
        assert_eq!(
            drags.take_detached_drag("dock-detached-0"),
            Some(drag("main").payload)
        );
        // Collected once.
        assert_eq!(drags.take_detached_drag("dock-detached-0"), None);
    }

    #[test]
    fn a_window_with_nothing_parked_gets_none() {
        let mut drags = DragSessions::default();
        assert_eq!(drags.take_detached_drag("main"), None);
    }
}
