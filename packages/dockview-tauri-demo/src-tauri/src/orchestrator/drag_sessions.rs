//! Mirrors `dragSessions.ts` in `dockview-enterprise`.

use std::collections::HashMap;
use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DragSession {
    pub from: String,
    pub payload: Value,
}

#[derive(Clone, Debug, PartialEq)]
struct Tracked {
    drag: DragSession,
    /// `Some(detach)` once the source reported the drag over.
    ended: Option<bool>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Release {
    pub from: String,
    pub session: String,
    pub to: String,
    pub reason: &'static str,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Accept {
    pub payload: Value,
    pub release: Release,
}

#[derive(Clone, Debug, PartialEq)]
pub enum DragEnd {
    /// Accepted, or never announced.
    Settled,
    Discarded,
    Detached {
        window_id: String,
        payload: Value,
        release: Release,
    },
}

#[derive(Debug, PartialEq)]
pub enum DragError {
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

#[derive(Default)]
pub struct DragSessions {
    sessions: HashMap<String, Tracked>,
    detached: HashMap<String, Value>,
}

impl DragSessions {
    pub fn start(&mut self, session: String, drag: DragSession) {
        self.sessions.insert(session, Tracked { drag, ended: None });
    }

    pub fn peek(&self, session: &str) -> Result<Value, DragError> {
        self.sessions
            .get(session)
            .map(|tracked| tracked.drag.payload.clone())
            .ok_or_else(|| DragError::NotInFlight(session.to_string()))
    }

    /// The first accept wins.
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

    /// The drag stays acceptable until [`DragSessions::expire`]. Returns
    /// whether it is in flight.
    pub fn end(&mut self, session: &str, detach: bool) -> bool {
        match self.sessions.get_mut(session) {
            Some(tracked) => {
                tracked.ended = Some(detach);
                true
            }
            None => false,
        }
    }

    pub fn expire(&mut self, session: &str, new_window_id: impl FnOnce() -> String) -> DragEnd {
        // Not reported over yet: not ours to expire.
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
