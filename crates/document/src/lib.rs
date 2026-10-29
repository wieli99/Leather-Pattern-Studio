use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use wasm_bindgen::prelude::*;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Line,
    Polyline,
    Rectangle,
    Circle,
    Ellipse,
    Arc,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct Shape {
    pub id: String,
    pub name: String,
    pub kind: Kind,
    pub points: Vec<Point>,
    pub radius: f64,
    pub rotation: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub sweep: Option<f64>,
    #[serde(
        rename = "legacyStitch",
        skip_serializing_if = "Option::is_none",
        default
    )]
    #[ts(type = "unknown")]
    pub legacy_stitch: Option<serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct Document {
    pub version: u32,
    pub shapes: Vec<Shape>,
}
impl Document {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 4 || self.shapes.len() > 10000 {
            return Err("Unsupported or oversized project".into());
        }
        let mut ids = HashSet::new();
        for s in &self.shapes {
            if s.id.is_empty()
                || !ids.insert(&s.id)
                || s.name.len() > 800
                || s.points.len() < 2
                || s.points.len() > 10000
                || (s.kind != Kind::Polyline && s.points.len() != 2)
                || !s.radius.is_finite()
                || s.radius < 0.0
                || !s.rotation.is_finite()
            {
                return Err("Invalid shape".into());
            }
            if s.points
                .iter()
                .any(|p| !p.x.is_finite() || !p.y.is_finite() || p.x.abs() > 1e7 || p.y.abs() > 1e7)
            {
                return Err("Invalid coordinate".into());
            }
            if s.kind == Kind::Arc
                && !s
                    .sweep
                    .is_some_and(|v| v.is_finite() && v.abs() > 1e-9 && v.abs() <= 360.0)
            {
                return Err("Invalid arc sweep".into());
            }
            let a = &s.points[0];
            let b = s.points.last().unwrap();
            if s.points.iter().all(|p| p == a) {
                return Err("Shape must have positive size".into());
            }
            if matches!(s.kind, Kind::Rectangle | Kind::Ellipse) && (a.x == b.x || a.y == b.y) {
                return Err("Width and height must be positive".into());
            }
            if s.kind == Kind::Rectangle
                && s.radius > ((a.x - b.x).abs().min((a.y - b.y).abs()) / 2.0)
            {
                return Err("Corner radius too large".into());
            }
        }
        Ok(())
    }
}
#[wasm_bindgen]
pub struct Editor {
    document: Document,
    past: Vec<Document>,
    future: Vec<Document>,
    revision: u32,
}
impl Default for Editor {
    fn default() -> Self {
        Self {
            document: Document {
                version: 4,
                shapes: vec![],
            },
            past: vec![],
            future: vec![],
            revision: 0,
        }
    }
}
#[wasm_bindgen]
impl Editor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }
    pub fn snapshot(&self) -> String {
        serde_json::json!({"revision":self.revision,"document":self.document,"canUndo":!self.past.is_empty(),"canRedo":!self.future.is_empty()}).to_string()
    }
    pub fn apply(
        &mut self,
        operation: &str,
        json: &str,
        expected_revision: u32,
    ) -> Result<String, JsValue> {
        self.execute(operation, json, expected_revision)
            .map_err(|e| JsValue::from_str(&e))
    }
}
impl Editor {
    fn execute(&mut self, op: &str, json: &str, expected: u32) -> Result<String, String> {
        if expected != self.revision {
            return Err("Stale document revision".into());
        }
        match op {
            "commit" | "load" | "preview" => {
                let next: Document = serde_json::from_str(json).map_err(|e| e.to_string())?;
                next.validate()?;
                if op == "preview" {
                    return Ok(
                        serde_json::json!({"revision":self.revision,"document":next}).to_string(),
                    );
                }
                if op == "load" {
                    self.past.clear();
                    self.future.clear();
                    self.document = next;
                    self.revision += 1;
                } else if next != self.document {
                    self.past.push(self.document.clone());
                    if self.past.len() > 200 {
                        self.past.remove(0);
                    }
                    self.future.clear();
                    self.document = next;
                    self.revision += 1;
                }
            }
            "undo" => {
                if let Some(p) = self.past.pop() {
                    self.future.push(self.document.clone());
                    self.document = p;
                    self.revision += 1;
                }
            }
            "redo" => {
                if let Some(n) = self.future.pop() {
                    self.past.push(self.document.clone());
                    self.document = n;
                    self.revision += 1;
                }
            }
            "cancel" => {}
            _ => return Err("Unknown operation".into()),
        };
        Ok(self.snapshot())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> String {
        r#"{"version":4,"shapes":[{"id":"a","name":"Line","kind":"line","points":[{"x":0,"y":0},{"x":10,"y":5}],"radius":0,"rotation":0}]}"#.into()
    }
    #[test]
    fn arc_roundtrip_validation_and_history() {
        let mut e = Editor::new();
        let arc = r#"{"version":4,"shapes":[{"id":"arc","name":"Arc","kind":"arc","points":[{"x":0,"y":0},{"x":10,"y":0}],"radius":0,"rotation":30,"sweep":-270}]}"#;
        e.execute("commit", arc, 0).unwrap();
        assert_eq!(e.document.shapes[0].sweep, Some(-270.0));
        let encoded = serde_json::to_string(&e.document).unwrap();
        let decoded: Document = serde_json::from_str(&encoded).unwrap();
        assert_eq!(decoded, e.document);
        e.execute("undo", "", 1).unwrap();
        assert!(e.document.shapes.is_empty());
        e.execute("redo", "", 2).unwrap();
        let mut invalid = e.document.clone();
        for sweep in [None, Some(0.0), Some(361.0), Some(f64::NAN)] {
            invalid.shapes[0].sweep = sweep;
            assert!(invalid.validate().is_err());
        }
    }
    #[test]
    fn history() {
        let mut e = Editor::new();
        e.execute("commit", &sample(), 0).unwrap();
        e.execute("undo", "", 1).unwrap();
        assert!(e.document.shapes.is_empty());
        e.execute("redo", "", 2).unwrap();
        assert_eq!(e.document.shapes.len(), 1);
    }
    #[test]
    fn stale() {
        let mut e = Editor::new();
        assert!(e.execute("commit", &sample(), 9).is_err());
        assert_eq!(e.revision, 0);
    }
    #[test]
    fn preview_does_not_commit() {
        let mut e = Editor::new();
        e.execute("preview", &sample(), 0).unwrap();
        assert_eq!(e.revision, 0);
        assert!(e.past.is_empty());
    }
    #[test]
    fn invalid_and_duplicate_ids() {
        let mut d: Document = serde_json::from_str(&sample()).unwrap();
        d.shapes.push(d.shapes[0].clone());
        assert!(d.validate().is_err());
        d.shapes.pop();
        d.shapes[0].points[1] = d.shapes[0].points[0].clone();
        assert!(d.validate().is_err());
    }
    #[test]
    fn no_op_has_no_history() {
        let mut e = Editor::new();
        e.execute("commit", r#"{"version":4,"shapes":[]}"#, 0)
            .unwrap();
        assert!(e.past.is_empty());
    }
}
