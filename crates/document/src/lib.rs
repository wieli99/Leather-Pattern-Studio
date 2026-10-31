use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use wasm_bindgen::prelude::*;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct Affine {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
    pub e: f64,
    pub f: f64,
}
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
    Curve,
    #[serde(rename = "control-curve")]
    ControlCurve,
    Rectangle,
    Circle,
    Ellipse,
    Arc,
    Text,
}
// Handle vectors are relative to their anchor, in local millimetres.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct CurveHandles {
    pub incoming: Point,
    pub outgoing: Point,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct Shape {
    pub id: String,
    #[serde(
        default,
        rename = "stitchOnly",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub stitch_only: Option<bool>,
    #[serde(default, rename = "fillColor", skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub fill_color: Option<String>,
    #[serde(
        default,
        rename = "fillOpacity",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub fill_opacity: Option<f64>,
    pub name: String,
    pub kind: Kind,
    pub points: Vec<Point>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub handles: Option<Vec<CurveHandles>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub text: Option<String>,
    #[serde(default, rename = "fontSize", skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub font_size: Option<f64>,
    #[serde(
        default,
        rename = "cornerRadii",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub corner_radii: Option<Vec<f64>>,
    pub radius: f64,
    pub rotation: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub transform: Option<Affine>,
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
pub struct Guide {
    pub id: String,
    pub axis: String,
    pub coordinate: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "lowercase")]
pub enum StitchStyle {
    French,
    Japanese,
    Round,
    Flat,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "lowercase")]
pub enum StitchAlignment {
    Center,
    Start,
    End,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct StitchSettings {
    #[serde(
        default,
        rename = "roundDiameter",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub round_diameter: Option<f64>,
    #[serde(
        default,
        rename = "flatLength",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub flat_length: Option<f64>,
    #[serde(default, rename = "startClearance")]
    pub start_clearance: f64,
    #[serde(default, rename = "endClearance")]
    pub end_clearance: f64,
    pub style: StitchStyle,
    pub spacing: f64,
    pub inset: f64,
    pub alignment: StitchAlignment,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StitchGroup {
    pub id: String,
    pub shape_id: String,
    pub edges: Vec<String>,
    pub side: i32,
    pub settings: StitchSettings,
    #[serde(default)]
    pub closed: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct StitchLink {
    pub id: u32,
    pub members: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct Document {
    #[serde(default, rename = "stitchLinks")]
    pub stitch_links: Vec<StitchLink>,
    pub version: u32,
    pub shapes: Vec<Shape>,
    #[serde(default)]
    pub guides: Vec<Guide>,
    #[serde(default, rename = "stitchGroups")]
    pub stitch_groups: Vec<StitchGroup>,
}
// Logical boundary order mirrors the renderer, independent of viewport and transforms.
fn stitch_boundary(shape: &Shape) -> (Vec<String>, bool) {
    let closed = matches!(shape.kind, Kind::Rectangle | Kind::Circle | Kind::Ellipse)
        || matches!(
            shape.kind,
            Kind::Polyline | Kind::Curve | Kind::ControlCurve
        ) && shape.points.first() == shape.points.last()
        || shape.kind == Kind::Arc && shape.sweep.is_some_and(|s| s.abs() == 360.0);
    let kind = serde_json::to_value(&shape.kind).unwrap();
    let prefix = format!("{}:{}:", kind.as_str().unwrap(), shape.points.len());
    let mut keys = vec![];
    if shape.kind == Kind::Rectangle || shape.kind == Kind::Polyline && closed {
        let points = if shape.kind == Kind::Rectangle {
            let a = &shape.points[0];
            let b = &shape.points[1];
            vec![
                Point {
                    x: a.x.min(b.x),
                    y: a.y.min(b.y),
                },
                Point {
                    x: a.x.max(b.x),
                    y: a.y.min(b.y),
                },
                Point {
                    x: a.x.max(b.x),
                    y: a.y.max(b.y),
                },
                Point {
                    x: a.x.min(b.x),
                    y: a.y.max(b.y),
                },
            ]
        } else {
            shape.points[..shape.points.len() - 1].to_vec()
        };
        let n = points.len();
        let mut lengths = vec![];
        let mut factors = vec![];
        for i in 0..n {
            let p = &points[i];
            let prev = &points[(i + n - 1) % n];
            let next = &points[(i + 1) % n];
            let l = (prev.x - p.x).hypot(prev.y - p.y);
            let r = (next.x - p.x).hypot(next.y - p.y);
            let dot = if l * r > 0.0 {
                ((prev.x - p.x) * (next.x - p.x) + (prev.y - p.y) * (next.y - p.y)) / (l * r)
            } else {
                1.0
            };
            let angle = dot.clamp(-1.0, 1.0).acos();
            factors.push(
                if l > 1e-9 && r > 1e-9 && angle > 1e-9 && std::f64::consts::PI - angle > 1e-9 {
                    1.0 / (angle / 2.0).tan()
                } else {
                    0.0
                },
            );
            lengths.push(r);
        }
        let mut max = f64::INFINITY;
        for i in 0..n {
            let k = factors[i] + factors[(i + 1) % n];
            if k > 0.0 {
                max = max.min(lengths[i] / k);
            }
        }
        let uniform = shape.radius.min(if max.is_finite() { max } else { 0.0 });
        let requested = shape.corner_radii.clone().unwrap_or(vec![uniform; n]);
        let mut scale: f64 = 1.0;
        for i in 0..n {
            let used = requested[i] * factors[i] + requested[(i + 1) % n] * factors[(i + 1) % n];
            if used > lengths[i] {
                scale = scale.min(lengths[i] / used);
            }
        }
        for i in 0..n {
            let prev = (i + n - 1) % n;
            if lengths[prev] - (requested[prev] * factors[prev] + requested[i] * factors[i]) * scale
                > 1e-9
            {
                keys.push(format!("{prefix}edge:{i}"));
            }
            if requested[i] * scale > 0.0 && factors[i] > 0.0 {
                keys.push(format!("{prefix}corner:{i}"));
            }
        }
    } else if matches!(shape.kind, Kind::Circle | Kind::Ellipse | Kind::Arc) {
        keys.push(format!("{prefix}edge:0"));
    } else if shape.kind != Kind::Text {
        let mut pts = shape.points.clone();
        if shape.kind == Kind::Curve {
            pts.dedup_by(|a, b| (a.x - b.x).hypot(a.y - b.y) <= 1e-9);
        }
        for i in 0..pts.len() - 1 {
            let nonzero = (pts[i].x - pts[i + 1].x).hypot(pts[i].y - pts[i + 1].y) > 1e-9
                || shape.handles.as_ref().is_some_and(|h| {
                    h[i].outgoing.x != 0.0
                        || h[i].outgoing.y != 0.0
                        || h[i + 1].incoming.x != 0.0
                        || h[i + 1].incoming.y != 0.0
                });
            if nonzero {
                keys.push(format!("{prefix}edge:{i}"));
            }
        }
    }
    (keys, closed)
}

impl Document {
    pub fn validate(&self) -> Result<(), String> {
        if !matches!(self.version, 5 | 6 | 7 | 8 | 9 | 10 | 11) {
            return Err(format!(
                "Unsupported document version {} (supported: 5, 6, 7, 8, 9, 10, 11). Reload the application.",
                self.version
            ));
        }
        for s in &self.shapes {
            if let Some(radii) = &s.corner_radii {
                let count = if s.kind == Kind::Rectangle {
                    4
                } else if s.kind == Kind::Polyline
                    && s.points.len() >= 4
                    && s.points.first() == s.points.last()
                {
                    s.points.len() - 1
                } else {
                    0
                };
                if radii.len() != count
                    || count == 0
                    || radii.iter().any(|r| !r.is_finite() || *r < 0.0 || *r > 1e7)
                {
                    return Err("Invalid corner radii".into());
                }
            }
        }
        if self.shapes.len() > 10000 {
            return Err("Project exceeds 10000 shapes".into());
        }
        let mut guide_ids = HashSet::new();
        if self.guides.len() > 10000
            || self.guides.iter().any(|g| {
                g.id.is_empty()
                    || !guide_ids.insert(&g.id)
                    || !matches!(g.axis.as_str(), "x" | "y")
                    || !g.coordinate.is_finite()
            })
        {
            return Err("Invalid guidelines".into());
        }
        let mut ids = HashSet::new();
        for s in &self.shapes {
            if s.fill_color.as_ref().is_some_and(|c| {
                c.len() != 7
                    || !c.starts_with('#')
                    || !c.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
            }) || s
                .fill_opacity
                .is_some_and(|v| !v.is_finite() || !(0.0..=1.0).contains(&v))
            {
                return Err("Invalid fill".into());
            }
            if s.id.is_empty()
                || !ids.insert(&s.id)
                || s.name.len() > 800
                || s.points.len() < 2
                || s.points.len() > 10000
                || (!matches!(s.kind, Kind::Polyline | Kind::Curve | Kind::ControlCurve)
                    && s.points.len() != 2)
                || !s.radius.is_finite()
                || s.radius < 0.0
                || !s.rotation.is_finite()
            {
                return Err("Invalid shape".into());
            }
            if s.kind == Kind::Text
                && (s
                    .text
                    .as_ref()
                    .is_none_or(|t| t.trim().is_empty() || t.chars().count() > 10000)
                    || s.font_size.is_none_or(|n| !n.is_finite() || n <= 0.0))
            {
                return Err("Invalid text".into());
            }
            if s.kind == Kind::ControlCurve {
                let handles = s.handles.as_ref().ok_or("Missing curve handles")?;
                if handles.len() != s.points.len() {
                    return Err("Invalid curve handle count".into());
                }
            } else if s.handles.is_some() {
                return Err("Handles require a control point curve".into());
            }
            let mut geometry = s.points.clone();
            if let Some(handles) = &s.handles {
                for (p, h) in s.points.iter().zip(handles) {
                    for v in [&h.incoming, &h.outgoing] {
                        if !v.x.is_finite() || !v.y.is_finite() {
                            return Err("Invalid curve handle".into());
                        }
                        geometry.push(Point {
                            x: p.x + v.x,
                            y: p.y + v.y,
                        });
                    }
                }
            }
            if geometry
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
            if let Some(m) = &s.transform {
                let values = [m.a, m.b, m.c, m.d, m.e, m.f];
                if values.iter().any(|v| !v.is_finite()) || (m.a * m.d - m.b * m.c).abs() < 1e-12 {
                    return Err("Invalid affine transform".into());
                }
                let cx = if matches!(s.kind, Kind::Circle | Kind::Arc) {
                    s.points[0].x
                } else {
                    (s.points.iter().map(|p| p.x).fold(f64::INFINITY, f64::min)
                        + s.points
                            .iter()
                            .map(|p| p.x)
                            .fold(f64::NEG_INFINITY, f64::max))
                        / 2.0
                };
                let cy = if matches!(s.kind, Kind::Circle | Kind::Arc) {
                    s.points[0].y
                } else {
                    (s.points.iter().map(|p| p.y).fold(f64::INFINITY, f64::min)
                        + s.points
                            .iter()
                            .map(|p| p.y)
                            .fold(f64::NEG_INFINITY, f64::max))
                        / 2.0
                };
                let radius = geometry
                    .iter()
                    .map(|p| (p.x - cx).hypot(p.y - cy))
                    .fold(0.0, f64::max);
                if (m.a * cx + m.c * cy + m.e).abs() + radius * m.a.hypot(m.c) > 1e7
                    || (m.b * cx + m.d * cy + m.f).abs() + radius * m.b.hypot(m.d) > 1e7
                {
                    return Err("Transformed coordinate exceeds limit".into());
                }
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
        let mut link_ids = HashSet::new();
        let mut linked = HashSet::new();
        for link in &self.stitch_links {
            if link.id == 0 || !link_ids.insert(link.id) || link.members.len() < 2 {
                return Err("Invalid stitch link".into());
            }
            for member in &link.members {
                if !linked.insert(member) || !self.stitch_groups.iter().any(|g| &g.id == member) {
                    return Err("Invalid stitch link member".into());
                }
            }
        }
        let mut stitch_ids = HashSet::new();
        let mut attached = HashSet::new();
        if self.stitch_groups.len() > 10000 {
            return Err("Too many stitch groups".into());
        }
        for group in &self.stitch_groups {
            let v = &group.settings;
            let parent = self
                .shapes
                .iter()
                .find(|s| s.id == group.shape_id)
                .ok_or("Missing stitch parent")?;
            let (boundary, closed) = stitch_boundary(parent);
            let start = group
                .edges
                .first()
                .and_then(|key| boundary.iter().position(|k| k == key))
                .ok_or("Missing stitch edge")?;
            if group.edges.len() > boundary.len()
                || group.closed && (!closed || group.edges.len() != boundary.len())
                || group.edges.iter().enumerate().any(|(i, key)| {
                    (!closed && start + i >= boundary.len())
                        || *key != boundary[(start + i) % boundary.len()]
                })
            {
                return Err("Invalid stitch topology".into());
            }
            if group.id.is_empty()
                || !stitch_ids.insert(&group.id)
                || !self
                    .shapes
                    .iter()
                    .any(|s| s.id == group.shape_id && s.kind != Kind::Text)
                || group.edges.is_empty()
                || group.edges.len() > 20000
                || !matches!(group.side, -1 | 1)
                || [v.start_clearance, v.end_clearance].iter().any(|n| {
                    !n.is_finite() || *n < 0.0 || (n * 100.0 - (n * 100.0).round()).abs() > 1e-7
                })
                || [v.round_diameter, v.flat_length]
                    .into_iter()
                    .flatten()
                    .any(|n| !n.is_finite() || !(0.1..=5.0).contains(&n))
                || !v.spacing.is_finite()
                || v.spacing < 0.01
                || !v.inset.is_finite()
                || v.inset < 0.0
                || [v.spacing, v.inset]
                    .iter()
                    .any(|n| (n * 100.0 - (n * 100.0).round()).abs() > 1e-7)
                || group
                    .edges
                    .iter()
                    .any(|edge| edge.is_empty() || !attached.insert((&group.shape_id, edge)))
            {
                return Err("Invalid stitch group".into());
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
                version: 11,
                shapes: vec![],
                guides: vec![],
                stitch_groups: vec![],
                stitch_links: vec![],
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
    pub fn capabilities(&self) -> String {
        serde_json::json!({"documentVersions":[5,6,7,8,9,10,11]}).to_string()
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
                let mut next: Document = serde_json::from_str(json).map_err(|e| e.to_string())?;
                next.validate()?;
                next.version = 11;
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
    #[test]
    fn stitch_history_roundtrip_and_validation() {
        let mut doc: Document = serde_json::from_str(&sample()).unwrap();
        doc.version = 11;
        let group:StitchGroup=serde_json::from_str(r#"{"id":"st","shapeId":"a","edges":["line:2:edge:0"],"side":1,"settings":{"style":"french","spacing":3.85,"inset":3.0,"alignment":"center"},"closed":false}"#).unwrap();
        doc.stitch_groups.push(group);
        let mut editor = Editor::new();
        let json = serde_json::to_string(&doc).unwrap();
        editor.execute("preview", &json, 0).unwrap();
        assert!(editor.document.stitch_groups.is_empty());
        editor.execute("commit", &json, 0).unwrap();
        assert_eq!(editor.document, doc);
        assert!(editor.execute("commit", &json, 0).is_err());
        editor.execute("undo", "", 1).unwrap();
        assert!(editor.document.stitch_groups.is_empty());
        editor.execute("redo", "", 2).unwrap();
        assert_eq!(editor.document, doc);
        let mut bad = doc.clone();
        bad.stitch_groups[0].edges[0] = "line:2:edge:9".into();
        assert!(bad.validate().is_err());
        let mut bad = doc.clone();
        bad.stitch_groups[0].closed = true;
        assert!(bad.validate().is_err());
        let mut bad = doc.clone();
        bad.stitch_groups[0].settings.spacing = 0.0;
        assert!(bad.validate().is_err());
        let mut bad = doc.clone();
        bad.stitch_groups[0].settings.inset = 1.001;
        assert!(bad.validate().is_err());
        let mut bad = doc.clone();
        let mut duplicate = bad.stitch_groups[0].clone();
        duplicate.id = "copy".into();
        bad.stitch_groups.push(duplicate);
        assert!(bad.validate().is_err());
        let mut bad = doc.clone();
        bad.shapes.clear();
        assert!(bad.validate().is_err());
    }
    #[test]
    fn corner_radii_roundtrip_and_validation() {
        let json = r#"{"version":7,"shapes":[{"id":"r","name":"Rectangle","kind":"rectangle","points":[{"x":0,"y":0},{"x":40,"y":20}],"radius":0,"cornerRadii":[15,0,0,5],"rotation":0}]}"#;
        let mut editor = Editor::new();
        editor.execute("commit", json, 0).unwrap();
        assert_eq!(
            editor.document.shapes[0].corner_radii,
            Some(vec![15.0, 0.0, 0.0, 5.0])
        );
        let mut doc = editor.document.clone();
        doc.shapes[0].corner_radii = Some(vec![-1.0; 4]);
        assert!(doc.validate().is_err());
        doc.shapes[0].corner_radii = Some(vec![1.0; 3]);
        assert!(doc.validate().is_err());
        editor.execute("undo", "", 1).unwrap();
        assert!(editor.document.shapes.is_empty());
        editor.execute("redo", "", 2).unwrap();
        assert!(editor.document.shapes[0].corner_radii.is_some());
    }
    #[test]
    fn capabilities_and_version_errors() {
        let editor = Editor::default();
        assert!(editor.capabilities().contains("[5,6,7,8,9,10,11]"));
        let mut doc = editor.document.clone();
        doc.version = 99;
        assert!(doc
            .validate()
            .unwrap_err()
            .contains("Unsupported document version 99"));
    }
    fn sample() -> String {
        r#"{"version":7,"shapes":[{"id":"a","name":"Line","kind":"line","points":[{"x":0,"y":0},{"x":10,"y":5}],"radius":0,"rotation":0}]}"#.into()
    }
    #[test]
    fn arc_roundtrip_validation_and_history() {
        let mut e = Editor::new();
        let arc = r#"{"version":5,"shapes":[{"id":"arc","name":"Arc","kind":"arc","points":[{"x":0,"y":0},{"x":10,"y":0}],"radius":0,"rotation":30,"sweep":-270}]}"#;
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
    fn curves_roundtrip_validation_and_history() {
        let mut d: Document = serde_json::from_str(&sample()).unwrap();
        d.version = 11;
        d.shapes[0].kind = Kind::ControlCurve;
        d.shapes[0].handles = Some(vec![
            CurveHandles {
                incoming: Point { x: -5.0, y: -10.0 },
                outgoing: Point { x: 5.0, y: 10.0 },
            };
            2
        ]);
        let json = serde_json::to_string(&d).unwrap();
        let mut e = Editor::new();
        e.execute("preview", &json, 0).unwrap();
        assert!(e.past.is_empty());
        e.execute("commit", &json, 0).unwrap();
        assert_eq!(e.document, d);
        e.execute("undo", "", 1).unwrap();
        assert!(e.document.shapes.is_empty());
        e.execute("redo", "", 2).unwrap();
        assert_eq!(e.document, d);
        let mut bad = d.clone();
        bad.shapes[0].handles = None;
        assert!(bad.validate().is_err());
        bad.shapes[0].handles = Some(vec![]);
        assert!(bad.validate().is_err());
        for x in [f64::NAN, f64::INFINITY, 1e8] {
            let mut bad = d.clone();
            bad.shapes[0].handles.as_mut().unwrap()[0].incoming.x = x;
            assert!(bad.validate().is_err());
        }
        d.shapes[0].kind = Kind::Curve;
        assert!(d.validate().is_err());
        d.shapes[0].handles = None;
        d.shapes[0].points.push(Point { x: 30.0, y: 0.0 });
        assert!(d.validate().is_ok());
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
    fn affine_roundtrip_history_and_validation() {
        let mut doc: Document = serde_json::from_str(&sample()).unwrap();
        doc.version = 11;
        doc.shapes[0].transform = Some(Affine {
            a: 2.0,
            b: 0.3,
            c: 0.4,
            d: 0.5,
            e: 12.0,
            f: -5.0,
        });
        let json = serde_json::to_string(&doc).unwrap();
        let mut editor = Editor::new();
        editor.execute("preview", &json, 0).unwrap();
        assert!(editor.document.shapes.is_empty());
        editor.execute("commit", &json, 0).unwrap();
        assert_eq!(editor.document, doc);
        editor.execute("undo", "", 1).unwrap();
        editor.execute("redo", "", 2).unwrap();
        assert_eq!(editor.document, doc);
        doc.shapes[0].transform.as_mut().unwrap().e = 1e8;
        assert!(doc.validate().is_err());
        let m = doc.shapes[0].transform.as_mut().unwrap();
        m.e = 0.0;
        m.a = 0.0;
        m.b = 0.0;
        assert!(doc.validate().is_err());
    }
    #[test]
    fn no_op_has_no_history() {
        let mut e = Editor::new();
        e.execute("commit", r#"{"version":5,"shapes":[]}"#, 0)
            .unwrap();
        assert!(e.past.is_empty());
    }
}
