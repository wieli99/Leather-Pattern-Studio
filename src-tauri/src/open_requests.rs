use std::{collections::VecDeque, path::PathBuf};

#[derive(Default)]
pub struct OpenRequests {
    next_id: u32,
    requests: VecDeque<(u32, PathBuf)>,
    pub rejected_batch: bool,
}
impl OpenRequests {
    pub fn enqueue(&mut self, paths: Vec<PathBuf>) {
        if paths.len() > 1 {
            self.rejected_batch = true;
        } else if let Some(path) = paths.into_iter().next() {
            self.next_id = self
                .next_id
                .checked_add(1)
                .expect("file request id exhausted");
            self.requests.push_back((self.next_id, path));
        }
    }
    pub fn first(&self) -> Option<u32> {
        self.requests.front().map(|(id, _)| *id)
    }
    pub fn path(&self, id: u32) -> Option<PathBuf> {
        self.requests
            .iter()
            .find(|(key, _)| *key == id)
            .map(|(_, path)| path.clone())
    }
    pub fn acknowledge(&mut self, id: u32) {
        self.requests.retain(|(key, _)| *key != id);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn completion_or_cancellation_preserves_later_arrivals() {
        let mut queue = OpenRequests::default();
        queue.enqueue(vec!["first.leather".into()]);
        let first = queue.first().unwrap();
        queue.enqueue(vec!["second.leather".into()]);
        assert_eq!(queue.first(), Some(first));
        assert_eq!(queue.path(first), Some("first.leather".into()));
        queue.acknowledge(first);
        let second = queue.first().unwrap();
        assert_ne!(first, second);
        assert_eq!(queue.path(second), Some("second.leather".into()));
        queue.acknowledge(first);
        assert_eq!(queue.first(), Some(second));
    }
    #[test]
    fn rejected_batch_does_not_clear_existing_or_future_requests() {
        let mut queue = OpenRequests::default();
        queue.enqueue(vec!["keep.leather".into()]);
        let first = queue.first();
        queue.enqueue(vec!["a.leather".into(), "b.leather".into()]);
        assert!(queue.rejected_batch);
        assert_eq!(queue.first(), first);
        queue.enqueue(vec!["later.leather".into()]);
        queue.acknowledge(first.unwrap());
        assert_eq!(
            queue.path(queue.first().unwrap()),
            Some("later.leather".into())
        );
        assert!(queue.path(0).is_none());
    }
}
