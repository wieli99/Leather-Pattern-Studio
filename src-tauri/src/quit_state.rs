use std::sync::atomic::{AtomicBool, Ordering};

/// A native Quit must use the editor's confirmation once its close bridge is ready.
#[derive(Default)]
pub struct QuitState {
    ready: AtomicBool,
    approved: AtomicBool,
}
impl QuitState {
    pub fn arm(&self) {
        self.approved.store(false, Ordering::SeqCst);
        self.ready.store(true, Ordering::SeqCst);
    }
    pub fn reset(&self) {
        self.ready.store(false, Ordering::SeqCst);
        self.approved.store(false, Ordering::SeqCst);
    }
    pub fn approve(&self) {
        self.approved.store(true, Ordering::SeqCst);
    }
    pub fn should_confirm(&self, has_editor: bool) -> bool {
        has_editor && self.ready.load(Ordering::SeqCst) && !self.approved.load(Ordering::SeqCst)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quit_before_editor_ready_or_after_editor_closed_needs_no_confirmation() {
        let state = QuitState::default();
        assert!(!state.should_confirm(true));
        state.arm();
        assert!(!state.should_confirm(false));
        assert!(state.should_confirm(true));
    }
    #[test]
    fn cancellation_does_not_grant_approval_and_reopening_resets_approval() {
        let state = QuitState::default();
        state.arm();
        assert!(state.should_confirm(true));
        assert!(state.should_confirm(true));
        state.approve();
        assert!(!state.should_confirm(true));
        state.reset();
        assert!(!state.should_confirm(true));
        state.arm();
        assert!(state.should_confirm(true));
    }
}
