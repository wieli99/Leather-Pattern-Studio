use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
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
    Image,
    Measurement,
    Arrow,
    #[serde(rename = "arrow-head")]
    ArrowHead,
    Crosshair,
    #[serde(rename = "size-square")]
    SizeSquare,
    #[serde(rename = "size-ruler")]
    SizeRuler,
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
    #[serde(
        default,
        rename = "stitchParentId",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub stitch_parent_id: Option<String>,
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hidden: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub locked: Option<bool>,
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
    #[serde(default, rename = "fillMode", skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub fill_mode: Option<String>,
    #[serde(
        default,
        rename = "strokeColor",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub stroke_color: Option<String>,
    #[serde(
        default,
        rename = "strokeOpacity",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub stroke_opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub image: Option<String>,
    pub name: String,
    pub kind: Kind,
    pub points: Vec<Point>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub handles: Option<Vec<CurveHandles>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub text: Option<String>,
    #[serde(default, rename = "headSize", skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub head_size: Option<f64>,
    #[serde(
        default,
        rename = "strokeWidth",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub stroke_width: Option<f64>,
    #[serde(
        default,
        rename = "measurementOffset",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub measurement_offset: Option<f64>,
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
    #[serde(default, rename = "holeCount", skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hole_count: Option<u32>,
    #[serde(default)]
    #[ts(optional)]
    pub reversed: Option<bool>,
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
pub struct StitchPreset {
    pub name: String,
    pub settings: StitchSettings,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StitchContinuation {
    pub previous_id: String,
    pub gap: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct StitchHole {
    pub point: Point,
    pub angle: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct StitchPlacement {
    pub offset: Point,
    pub angle: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StitchTransfer {
    pub id: String,
    pub master_id: String,
    pub target_id: String,
    #[serde(
        default,
        rename = "placementId",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub placement_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub number: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub pose: Option<StitchPlacement>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub master_points: Vec<Point>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub target_points: Vec<Point>,
    pub visible: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StitchGroup {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub continuation: Option<StitchContinuation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub holes: Option<Vec<StitchHole>>,
    #[serde(
        default,
        rename = "holeOverrides",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub hole_overrides: Option<std::collections::BTreeMap<String, StitchSettings>>,
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
pub struct PrintPage {
    pub column: i32,
    pub row: i32,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PrintSnapshot {
    pub shape: Shape,
    pub stitch_groups: Vec<StitchGroup>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PrintPlacement {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub snapshot: Option<PrintSnapshot>,
    pub id: String,
    pub source_id: String,
    pub x: f64,
    pub y: f64,
    pub rotation: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub mirrored: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hidden: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub locked: Option<bool>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PrintNode {
    Instance {
        id: String,
    },
    Group {
        id: String,
        name: String,
        x: f64,
        y: f64,
        rotation: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        mirrored: Option<bool>,
        #[serde(default, rename = "sourceId", skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        source_id: Option<String>,
        #[serde(
            default,
            rename = "excludedSourceIds",
            skip_serializing_if = "Option::is_none"
        )]
        #[ts(optional)]
        excluded_source_ids: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        unlinked: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        hidden: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        locked: Option<bool>,
        children: Vec<PrintNode>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct PrintLayout {
    pub id: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub margin: f64,
    #[ts(type = "'mm' | 'in-decimal' | 'in-fractional'")]
    pub units: String,
    pub pages: Vec<PrintPage>,
    pub instances: Vec<PrintPlacement>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tree: Option<Vec<PrintNode>>,
}
impl PrintLayout {
    fn validate(&self, shapes: &[Shape], source_groups: &[&str]) -> Result<(), String> {
        let fail = || "Invalid print layout".to_string();
        if self.id.is_empty()
            || self.name.trim().is_empty()
            || self.name.len() > 800
            || ![self.width, self.height, self.margin]
                .iter()
                .all(|n| n.is_finite())
            || self.margin < 0.0
            || self.width > 5000.0
            || self.height > 5000.0
            || self.width <= 2.0 * self.margin
            || self.height <= 2.0 * self.margin
            || !["mm", "in-decimal", "in-fractional"].contains(&self.units.as_str())
            || self.pages.is_empty()
            || self.pages.len() > 500
            || self.instances.len() > 10000
        {
            return Err(fail());
        }
        let mut pages = std::collections::HashSet::new();
        if self.pages.iter().any(|p| !pages.insert((p.column, p.row))) {
            return Err(fail());
        }
        let mut ids = std::collections::HashSet::new();
        for i in &self.instances {
            if i.id.is_empty()
                || !ids.insert(i.id.as_str())
                || (i.snapshot.is_none() && !shapes.iter().any(|s| s.id == i.source_id))
                || ![i.x, i.y, i.rotation].iter().all(|n| n.is_finite())
                || i.name
                    .as_ref()
                    .is_some_and(|n| n.trim().is_empty() || n.len() > 800)
            {
                return Err(fail());
            }
        }
        fn visit<'a>(
            nodes: &'a [PrintNode],
            depth: usize,
            seen: &mut std::collections::HashSet<&'a str>,
            ids: &std::collections::HashSet<&str>,
            groups: &[&str],
        ) -> Result<(), String> {
            if depth > 100 {
                return Err("Print tree too deep".into());
            }
            for node in nodes {
                match node {
                    PrintNode::Instance { id } => {
                        if !seen.insert(id) || !ids.contains(id.as_str()) {
                            return Err("Invalid print instance tree".into());
                        }
                    }
                    PrintNode::Group {
                        id,
                        name,
                        x,
                        y,
                        rotation,
                        source_id,
                        unlinked,
                        children,
                        ..
                    } => {
                        if id.is_empty()
                            || !seen.insert(id)
                            || ids.contains(id.as_str())
                            || name.trim().is_empty()
                            || name.len() > 800
                            || ![x, y, rotation].iter().all(|n| n.is_finite())
                            || (unlinked != &Some(true)
                                && source_id
                                    .as_ref()
                                    .is_some_and(|s| !groups.contains(&s.as_str())))
                        {
                            return Err("Invalid print group".into());
                        }
                        visit(children, depth + 1, seen, ids, groups)?;
                    }
                }
            }
            Ok(())
        }
        if let Some(tree) = &self.tree {
            let mut seen = std::collections::HashSet::new();
            visit(tree, 0, &mut seen, &ids, source_groups)?;
            if ids.iter().any(|id| !seen.contains(id)) {
                return Err("Print instance missing from tree".into());
            }
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[ts(export, export_to = "../../../src/generated/")]
pub struct Document {
    #[serde(
        default,
        rename = "stitchTransfers",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub stitch_transfers: Option<Vec<StitchTransfer>>,
    #[serde(
        default,
        rename = "stitchPresets",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub stitch_presets: Option<Vec<StitchPreset>>,
    #[serde(default, rename = "printLayouts")]
    pub print_layouts: Vec<PrintLayout>,
    #[serde(default, rename = "stitchLinks")]
    pub stitch_links: Vec<StitchLink>,
    pub version: u32,
    pub shapes: Vec<Shape>,
    #[serde(
        default,
        rename = "objectTree",
        skip_serializing_if = "Option::is_none"
    )]
    #[ts(optional)]
    pub object_tree: Option<Vec<ObjectNode>>,
    #[serde(default)]
    pub guides: Vec<Guide>,
    #[serde(default, rename = "stitchGroups")]
    pub stitch_groups: Vec<StitchGroup>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, ts_rs::TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/generated/")]
pub enum ObjectNode {
    Object {
        id: String,
    },
    Group {
        id: String,
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        hidden: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        locked: Option<bool>,
        children: Vec<ObjectNode>,
    },
}
impl ObjectNode {
    fn protected_group_names<'a>(&'a self, inherited: bool, out: &mut Vec<(&'a str, &'a str)>) {
        if let Self::Group {
            id,
            name,
            locked,
            children,
            ..
        } = self
        {
            let effective = inherited || *locked == Some(true);
            if effective {
                out.push((id, name));
            }
            for node in children {
                node.protected_group_names(effective, out);
            }
        }
    }
    fn group_name(&self, target: &str) -> Option<&str> {
        if let Self::Group {
            id, name, children, ..
        } = self
        {
            if id == target {
                return Some(name);
            }
            return children.iter().find_map(|node| node.group_name(target));
        }
        None
    }
    fn locked_ids(&self, inherited: bool, out: &mut Vec<String>) {
        match self {
            Self::Object { id } => {
                if inherited {
                    out.push(id.clone());
                }
            }
            Self::Group {
                locked, children, ..
            } => {
                for n in children {
                    n.locked_ids(inherited || *locked == Some(true), out);
                }
            }
        }
    }
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
    } else if !matches!(
        shape.kind,
        Kind::Image
            | Kind::Text
            | Kind::Measurement
            | Kind::Arrow
            | Kind::ArrowHead
            | Kind::Crosshair
            | Kind::SizeSquare
            | Kind::SizeRuler
    ) {
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
        if self.print_layouts.len() > 100 {
            return Err("Too many print layouts".into());
        }
        let mut layout_ids = std::collections::HashSet::new();
        fn groups<'a>(nodes: &'a [ObjectNode], out: &mut Vec<&'a str>) {
            for n in nodes {
                if let ObjectNode::Group { id, children, .. } = n {
                    out.push(id);
                    groups(children, out);
                }
            }
        }
        let mut source_groups = Vec::new();
        if let Some(tree) = &self.object_tree {
            groups(tree, &mut source_groups);
        }
        for layout in &self.print_layouts {
            if !layout_ids.insert(&layout.id) {
                return Err("Duplicate print layout".into());
            }
            layout.validate(&self.shapes, &source_groups)?;
            for item in &layout.instances {
                if let Some(snapshot) = &item.snapshot {
                    if snapshot.shape.id != item.source_id {
                        return Err("Invalid print snapshot source".into());
                    }
                    // Reuse all normal geometry, image and stitching validation in isolation.
                    Document {
                        stitch_presets: None,
                        stitch_transfers: None,
                        version: self.version,
                        shapes: vec![snapshot.shape.clone()],
                        stitch_groups: snapshot.stitch_groups.clone(),
                        print_layouts: vec![],
                        stitch_links: vec![],
                        object_tree: None,
                        guides: vec![],
                    }
                    .validate()?;
                }
            }
        }

        for s in &self.shapes {
            if s.kind == Kind::Image
                && (s.points.len() != 2
                    || s.points[0].x == s.points[1].x
                    || s.points[0].y == s.points[1].y)
            {
                return Err("Invalid image dimensions".into());
            }
            if s.kind == Kind::Image
                && !s.image.as_ref().is_some_and(|data| {
                    data.len() <= 10_000_000
                        && [
                            "data:image/png;base64,",
                            "data:image/jpeg;base64,",
                            "data:image/webp;base64,",
                            "data:image/svg+xml;base64,",
                        ]
                        .iter()
                        .any(|prefix| data.starts_with(prefix))
                })
            {
                return Err("Invalid image".into());
            }
        }
        if !matches!(
            self.version,
            5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21
        ) {
            return Err(format!(
                "Unsupported document version {} (supported: 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21). Reload the application.",
                self.version
            ));
        }
        if let Some(tree) = &self.object_tree {
            fn visit(
                nodes: &[ObjectNode],
                depth: usize,
                seen: &mut std::collections::HashSet<String>,
                leaves: &mut Vec<String>,
            ) -> Result<(), String> {
                if depth > 100 {
                    return Err("Group nesting too deep".into());
                }
                for node in nodes {
                    let id = match node {
                        ObjectNode::Object { id } | ObjectNode::Group { id, .. } => id,
                    };
                    if id.is_empty() || !seen.insert(id.clone()) {
                        return Err("Duplicate tree item".into());
                    }
                    match node {
                        ObjectNode::Object { id } => leaves.push(id.clone()),
                        ObjectNode::Group { name, children, .. } => {
                            if name.trim().is_empty() || name.len() > 800 {
                                return Err("Invalid group name".into());
                            }
                            visit(children, depth + 1, seen, leaves)?;
                        }
                    }
                }
                Ok(())
            }
            let mut seen = std::collections::HashSet::new();
            let mut leaves = Vec::new();
            visit(tree, 0, &mut seen, &mut leaves)?;
            if leaves.iter().rev().collect::<Vec<_>>()
                != self.shapes.iter().map(|s| &s.id).collect::<Vec<_>>()
            {
                return Err("Object tree does not match drawing order".into());
            }
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
            if s.fill_mode
                .as_ref()
                .is_some_and(|v| !matches!(v.as_str(), "solid" | "skiving" | "glueing" | "cutout"))
                || s.stroke_opacity
                    .is_some_and(|v| !v.is_finite() || !(0.0..=1.0).contains(&v))
                || s.stroke_color.as_ref().is_some_and(|v| {
                    v.len() != 7
                        || !v.starts_with('#')
                        || !v.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
                })
            {
                return Err("Invalid outline or fill mode".into());
            }
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
            if s.kind == Kind::Measurement
                && s.measurement_offset
                    .is_none_or(|v| !v.is_finite() || v.abs() > 1e7)
            {
                return Err("Invalid measurement offset".into());
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
            if s.stroke_width.is_some_and(|v| !v.is_finite() || v <= 0.0) {
                return Err("Invalid outline width".into());
            }
            if s.head_size
                .is_some_and(|v| !v.is_finite() || v <= 0.0 || v > 1e7)
            {
                return Err("Invalid arrowhead size".into());
            }
            let a = &s.points[0];
            let b = s.points.last().unwrap();
            if s.points.iter().all(|p| p == a) {
                return Err("Shape must have positive size".into());
            }
            if matches!(s.kind, Kind::Rectangle | Kind::Ellipse) && (a.x == b.x || a.y == b.y) {
                return Err("Width and height must be positive".into());
            }
            if s.kind == Kind::SizeSquare {
                let dx = (a.x - b.x).abs();
                let dy = (a.y - b.y).abs();
                if dx < 1e-9 || (dx - dy).abs() > 1e-8 * dx.max(1.0) {
                    return Err("Size guide must be square".into());
                }
                if let Some(m) = &s.transform {
                    let x = m.a.hypot(m.b);
                    let y = m.c.hypot(m.d);
                    if (x - y).abs() > 1e-8 * x.max(y)
                        || (m.a * m.c + m.b * m.d).abs() > 1e-8 * x * y
                    {
                        return Err("Size guide requires uniform scaling".into());
                    }
                }
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
        for shape in &self.shapes {
            if let Some(parent) = &shape.stitch_parent_id {
                let material = self
                    .shapes
                    .iter()
                    .find(|s| &s.id == parent)
                    .ok_or("Missing stitch guide parent")?;
                if shape.stitch_only != Some(true)
                    || material.stitch_only == Some(true)
                    || !stitch_boundary(material).1
                    || shape.id == *parent
                {
                    return Err("Invalid stitch guide attachment".into());
                }
            }
        }
        let mut stitch_ids = HashSet::new();
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
            if let Some(holes) = &group.holes {
                if !matches!(group.side, -1 | 1)
                    || group.closed
                    || !group.edges.is_empty() && parent.stitch_parent_id.is_none()
                    || matches!(
                        parent.kind,
                        Kind::Text
                            | Kind::Image
                            | Kind::Measurement
                            | Kind::Arrow
                            | Kind::ArrowHead
                            | Kind::Crosshair
                            | Kind::SizeSquare
                            | Kind::SizeRuler
                    )
                {
                    return Err("Invalid detached hole parent".into());
                }
                if group.id.is_empty()
                    || !stitch_ids.insert(&group.id)
                    || holes.is_empty()
                    || holes.len() > 100000
                    || holes.iter().any(|h| {
                        !h.point.x.is_finite() || !h.point.y.is_finite() || !h.angle.is_finite()
                    })
                {
                    return Err("Invalid detached holes".into());
                }
                continue;
            }
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
                || !self.shapes.iter().any(|s| {
                    s.id == group.shape_id
                        && !matches!(
                            s.kind,
                            Kind::Image
                                | Kind::Text
                                | Kind::Measurement
                                | Kind::Arrow
                                | Kind::ArrowHead
                                | Kind::Crosshair
                                | Kind::SizeSquare
                                | Kind::SizeRuler
                        )
                })
                || group.edges.is_empty()
                || group.edges.len() > 20000
                || !matches!(group.side, -1 | 1)
                || [v.start_clearance, v.end_clearance]
                    .iter()
                    .any(|n| !n.is_finite() || *n < 0.0)
                || [v.round_diameter, v.flat_length]
                    .into_iter()
                    .flatten()
                    .any(|n| !n.is_finite() || !(0.1..=5.0).contains(&n))
                || !v.spacing.is_finite()
                || v.spacing < 0.01
                || !v.inset.is_finite()
                || v.inset < 0.0
                || self.stitch_groups.iter().any(|other| {
                    other.id != group.id
                        && other.shape_id == group.shape_id
                        && other.edges == group.edges
                        && other.side == group.side
                        && other.settings == group.settings
                        && other.continuation == group.continuation
                })
                || group.edges.iter().any(|edge| edge.is_empty())
            {
                return Err("Invalid stitch group".into());
            }
        }
        let valid_settings = |v: &StitchSettings| {
            v.hole_count.map_or(true, |n| n > 0 && n <= 100000)
                && v.spacing.is_finite()
                && v.spacing >= 0.01
                && v.inset.is_finite()
                && v.inset >= 0.0
                && [v.start_clearance, v.end_clearance]
                    .iter()
                    .all(|n| n.is_finite() && *n >= 0.0)
                && [v.round_diameter, v.flat_length]
                    .into_iter()
                    .flatten()
                    .all(|n| n.is_finite() && (0.1..=5.0).contains(&n))
        };
        if let Some(presets) = &self.stitch_presets {
            let mut names = std::collections::HashSet::new();
            if presets.len() > 1000
                || presets.iter().any(|p| {
                    p.name.trim().is_empty()
                        || p.name.len() > 200
                        || !names.insert(&p.name)
                        || !valid_settings(&p.settings)
                })
            {
                return Err("Invalid stitch presets".into());
            }
        }
        for group in &self.stitch_groups {
            if let Some(overrides) = &group.hole_overrides {
                if overrides.iter().any(|(index, settings)| {
                    index
                        .parse::<u32>()
                        .map_or(true, |n| n == 0 || n > 100000 || n.to_string() != *index)
                        || !valid_settings(settings)
                }) {
                    return Err("Invalid hole override".into());
                }
            }
        }
        for group in &self.stitch_groups {
            if !valid_settings(&group.settings) {
                return Err("Invalid stitch settings".into());
            }
            let mut seen = HashSet::new();
            let mut current = group;
            while let Some(link) = &current.continuation {
                if !seen.insert(&current.id) || !link.gap.is_finite() || link.gap <= 0.0 {
                    return Err("Invalid stitch continuation".into());
                }
                let previous = self
                    .stitch_groups
                    .iter()
                    .find(|g| g.id == link.previous_id)
                    .ok_or("Missing preceding run")?;
                if current.shape_id != previous.shape_id
                    || current.edges != previous.edges
                    || current.side != previous.side
                {
                    return Err("Incompatible stitch continuation".into());
                }
                current = previous;
            }
        }
        if let Some(transfers) = &self.stitch_transfers {
            let mut ids = HashSet::new();
            let mut pairs = HashSet::new();
            if transfers.len() > 10000 {
                return Err("Too many stitching transfers".into());
            }
            let mut placement_numbers = HashMap::new();
            let mut number_placements = HashMap::new();
            for t in transfers {
                if let Some(number) = t.number {
                    let placement = t.placement_id.as_deref().unwrap_or(&t.id);
                    if number == 0
                        || placement_numbers
                            .insert(placement, number)
                            .is_some_and(|old| old != number)
                        || number_placements
                            .insert(number, placement)
                            .is_some_and(|old| old != placement)
                    {
                        return Err("Invalid transfer number".into());
                    }
                }
                let master = self
                    .stitch_groups
                    .iter()
                    .find(|g| g.id == t.master_id)
                    .ok_or("Missing master run")?;
                let target = self
                    .shapes
                    .iter()
                    .find(|s| s.id == t.target_id)
                    .ok_or("Missing receiving piece")?;
                if t.id.is_empty()
                    || !ids.insert(&t.id)
                    || !pairs.insert((&t.placement_id, &t.master_id, &t.target_id))
                    || self.stitch_groups.iter().any(|g| g.id == t.id)
                    || master.shape_id == t.target_id
                    || self
                        .shapes
                        .iter()
                        .find(|s| s.id == master.shape_id)
                        .and_then(|s| s.stitch_parent_id.as_ref())
                        .is_some_and(|id| id == &t.target_id)
                    || target.stitch_only.unwrap_or(false)
                    || !stitch_boundary(target).1
                    || t.pose.as_ref().is_some_and(|p| {
                        !p.offset.x.is_finite() || !p.offset.y.is_finite() || !p.angle.is_finite()
                    })
                    || t.pose.is_some() && t.placement_id.as_ref().is_none_or(|id| id.is_empty())
                {
                    return Err("Invalid stitching transfer".into());
                }
                let length = |p: &Vec<Point>| (p[1].x - p[0].x).hypot(p[1].y - p[0].y);
                if t.pose.is_none()
                    && (t.master_points.len() != 2
                        || t.target_points.len() != 2
                        || t.master_points
                            .iter()
                            .chain(&t.target_points)
                            .any(|p| !p.x.is_finite() || !p.y.is_finite())
                        || length(&t.master_points) < 1e-7
                        || length(&t.target_points) < 1e-7)
                {
                    return Err("Invalid legacy stitching transfer".into());
                }
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
                stitch_presets: None,
                stitch_transfers: None,
                print_layouts: vec![],
                version: 21,
                shapes: vec![],
                object_tree: Some(vec![]),
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
        serde_json::json!({"documentVersions":[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]})
            .to_string()
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
                if next.object_tree.is_none() {
                    next.object_tree = Some(
                        next.shapes
                            .iter()
                            .rev()
                            .map(|s| ObjectNode::Object { id: s.id.clone() })
                            .collect(),
                    );
                }
                next.validate()?;
                let mut inherited_locks = Vec::new();
                for node in self.document.object_tree.iter().flatten() {
                    node.locked_ids(false, &mut inherited_locks);
                }

                if op != "load" {
                    let mut names = Vec::new();
                    for node in self.document.object_tree.iter().flatten() {
                        node.protected_group_names(false, &mut names);
                    }
                    for (id, name) in names {
                        if let Some(next_name) = next
                            .object_tree
                            .iter()
                            .flatten()
                            .find_map(|node| node.group_name(id))
                        {
                            if next_name != name {
                                return Err("Unlock the group before renaming it".into());
                            }
                        }
                    }
                    for old in self
                        .document
                        .shapes
                        .iter()
                        .filter(|s| s.locked == Some(true) || inherited_locks.contains(&s.id))
                    {
                        let mut candidate = next
                            .shapes
                            .iter()
                            .find(|s| s.id == old.id)
                            .ok_or("Cannot delete a locked object")?
                            .clone();
                        candidate.locked = old.locked;
                        candidate.hidden = old.hidden;
                        if candidate != *old
                            || self
                                .document
                                .stitch_groups
                                .iter()
                                .filter(|g| g.shape_id == old.id)
                                .collect::<Vec<_>>()
                                != next
                                    .stitch_groups
                                    .iter()
                                    .filter(|g| g.shape_id == old.id)
                                    .collect::<Vec<_>>()
                            || self
                                .document
                                .stitch_links
                                .iter()
                                .filter(|l| {
                                    l.members.iter().any(|id| {
                                        self.document
                                            .stitch_groups
                                            .iter()
                                            .any(|g| g.id == *id && g.shape_id == old.id)
                                    })
                                })
                                .collect::<Vec<_>>()
                                != next
                                    .stitch_links
                                    .iter()
                                    .filter(|l| {
                                        l.members.iter().any(|id| {
                                            self.document
                                                .stitch_groups
                                                .iter()
                                                .any(|g| g.id == *id && g.shape_id == old.id)
                                        })
                                    })
                                    .collect::<Vec<_>>()
                        {
                            return Err("Unlock the object before editing it".into());
                        }
                    }
                }

                next.version = 21;
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
    fn counted_runs_and_receiving_layers_roundtrip_and_validate() {
        let value = serde_json::json!({"version":20,"shapes":[
            {"id":"master","name":"Master","kind":"line","points":[{"x":0,"y":5},{"x":100,"y":5}],"rotation":0,"radius":0},
            {"id":"receiver","name":"Receiver","kind":"rectangle","points":[{"x":200,"y":0},{"x":250,"y":20}],"rotation":0,"radius":0}],
            "stitchGroups":[{"id":"run","shapeId":"master","edges":["line:2:edge:0"],"side":1,"closed":false,"settings":{"style":"round","spacing":3.38,"inset":0,"alignment":"start","holeCount":2}}],
            "stitchTransfers":[{"id":"layer","masterId":"run","targetId":"receiver","visible":true,"masterPoints":[{"x":-50,"y":0},{"x":-40,"y":0}],"targetPoints":[{"x":-25,"y":-5},{"x":-15,"y":-5}]}]});
        let doc: Document = serde_json::from_value(value).unwrap();
        doc.validate().unwrap();
        let text = serde_json::to_string(&doc).unwrap();
        assert_eq!(serde_json::from_str::<Document>(&text).unwrap(), doc);
        let mut editor = Editor::new();
        editor.execute("commit", &text, 0).unwrap();
        editor.execute("undo", "", 1).unwrap();
        assert!(editor.document.stitch_transfers.is_none());
        editor.execute("redo", "", 2).unwrap();
        assert_eq!(editor.document.stitch_transfers, doc.stitch_transfers);
        let mut bad = doc.clone();
        bad.stitch_groups[0].continuation = Some(StitchContinuation {
            previous_id: "run".into(),
            gap: 1.0,
        });
        assert!(bad.validate().is_err());
        let mut bad = doc.clone();
        bad.stitch_groups[0].settings.hole_count = Some(0);
        assert!(bad.validate().is_err());
        let mut bad = doc.clone();
        bad.stitch_transfers.as_mut().unwrap()[0].master_id = "missing".into();
        assert!(bad.validate().is_err());
    }
    #[test]
    fn transfer_placements_and_detached_guides_validate() {
        let value = serde_json::json!({"version":21,"shapes":[
            {"id":"master","name":"Master","kind":"line","points":[{"x":0,"y":5},{"x":100,"y":5}],"rotation":0,"radius":0},
            {"id":"receiver","name":"Receiver","kind":"rectangle","points":[{"x":200,"y":0},{"x":300,"y":20}],"rotation":0,"radius":0}],
            "stitchGroups":[{"id":"run","shapeId":"master","edges":["line:2:edge:0"],"side":1,"closed":false,"settings":{"style":"round","spacing":3.38,"inset":0,"alignment":"start","holeCount":2}}],
            "stitchTransfers":[{"id":"one","placementId":"one","masterId":"run","targetId":"receiver","visible":true,"pose":{"offset":{"x":0,"y":0},"angle":0}},
                {"id":"two","placementId":"two","masterId":"run","targetId":"receiver","visible":true,"pose":{"offset":{"x":0,"y":5},"angle":90}}]});
        let mut doc: Document = serde_json::from_value(value).unwrap();
        doc.validate().unwrap();
        let text = serde_json::to_string(&doc).unwrap();
        assert_eq!(serde_json::from_str::<Document>(&text).unwrap(), doc);
        let mut invalid = doc.clone();
        invalid.stitch_transfers.as_mut().unwrap()[1].placement_id = Some("one".into());
        assert!(invalid.validate().is_err());
        let mut invalid = doc.clone();
        invalid.stitch_transfers.as_mut().unwrap()[0]
            .pose
            .as_mut()
            .unwrap()
            .angle = f64::INFINITY;
        assert!(invalid.validate().is_err());
        let mut invalid = doc.clone();
        invalid.stitch_transfers.as_mut().unwrap()[0].number = Some(0);
        assert!(invalid.validate().is_err());
        let mut invalid = doc.clone();
        for transfer in invalid.stitch_transfers.as_mut().unwrap() {
            transfer.number = Some(1);
        }
        assert!(invalid.validate().is_err());
        let mut guide = doc.shapes[0].clone();
        guide.id = "guide".into();
        guide.stitch_only = Some(true);
        guide.stitch_parent_id = Some("receiver".into());
        let mut group = doc.stitch_groups[0].clone();
        group.id = "detached".into();
        group.shape_id = guide.id.clone();
        doc.shapes.push(guide);
        doc.stitch_groups.push(group);
        doc.validate().unwrap();
        let mut invalid = doc.clone();
        invalid.stitch_transfers.as_mut().unwrap()[0].master_id = "detached".into();
        assert!(invalid.validate().is_err());
        doc.shapes.last_mut().unwrap().stitch_parent_id = Some("missing".into());
        assert!(doc.validate().is_err());
    }
    #[test]
    fn indicators_validate_roundtrip_and_history() {
        for kind in [
            "arrow",
            "arrow-head",
            "crosshair",
            "size-square",
            "size-ruler",
        ] {
            let json = serde_json::json!({"version":15,"shapes":[{
                "id":"i","name":"Indicator","kind":kind,"points":[{"x":0,"y":0},{"x":20,"y":20}],
                "rotation":0,"radius":0,"headSize":3
            }]});
            let mut doc: Document = serde_json::from_value(json).unwrap();
            doc.validate().unwrap();
            assert!(stitch_boundary(&doc.shapes[0]).0.is_empty());
            let mut editor = Editor::new();
            let text = serde_json::to_string(&doc).unwrap();
            editor.execute("commit", &text, 0).unwrap();
            editor.execute("undo", "", 1).unwrap();
            assert!(editor.document.shapes.is_empty());
            editor.execute("redo", "", 2).unwrap();
            assert_eq!(editor.document.shapes, doc.shapes);
            doc.shapes[0].head_size = Some(0.0);
            assert!(doc.validate().is_err());
        }
    }

    #[test]
    fn stitch_history_roundtrip_and_validation() {
        let mut doc: Document = serde_json::from_str(&sample()).unwrap();
        doc.version = 21;
        doc.object_tree = Some(
            doc.shapes
                .iter()
                .rev()
                .map(|s| ObjectNode::Object { id: s.id.clone() })
                .collect(),
        );
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
        bad.stitch_groups[0].settings.inset = 25.4 / 64.0;
        bad.stitch_groups[0].settings.spacing = 25.4 / 16.0;
        bad.stitch_groups[0].settings.start_clearance = 25.4 / 32.0;
        assert!(bad.validate().is_ok());
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
    fn persistent_measurement_validation_and_history() {
        let json = r#"{"version":14,"shapes":[{"id":"m","name":"Measurement","kind":"measurement","points":[{"x":0,"y":0},{"x":40,"y":0}],"measurementOffset":-12,"radius":0,"rotation":0}]}"#;
        let mut editor = Editor::new();
        editor.execute("commit", json, 0).unwrap();
        assert_eq!(editor.document.shapes[0].measurement_offset, Some(-12.0));
        let saved = editor.document.clone();
        editor.execute("undo", "", 1).unwrap();
        assert!(editor.document.shapes.is_empty());
        editor.execute("redo", "", 2).unwrap();
        assert_eq!(editor.document, saved);
        let mut bad = saved.clone();
        bad.shapes[0].measurement_offset = None;
        assert!(bad.validate().is_err());
        bad.shapes[0].measurement_offset = Some(f64::NAN);
        assert!(bad.validate().is_err());
        bad.shapes[0].measurement_offset = Some(0.0);
        bad.shapes[0].points[1] = bad.shapes[0].points[0].clone();
        assert!(bad.validate().is_err());
        assert!(stitch_boundary(&saved.shapes[0]).0.is_empty());
    }
    #[test]
    fn capabilities_and_version_errors() {
        let editor = Editor::default();
        assert!(editor
            .capabilities()
            .contains("[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]"));
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
        d.version = 21;
        d.object_tree = Some(
            d.shapes
                .iter()
                .rev()
                .map(|s| ObjectNode::Object { id: s.id.clone() })
                .collect(),
        );
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
    fn object_states_and_lock_protection() {
        let mut e = Editor::new();
        let mut d: Document = serde_json::from_str(&sample()).unwrap();
        d.shapes[0].locked = Some(true);
        e.execute("commit", &serde_json::to_string(&d).unwrap(), 0)
            .unwrap();
        d.shapes[0].name = "Blocked".into();
        assert!(e
            .execute("preview", &serde_json::to_string(&d).unwrap(), 1)
            .is_err());
        assert!(e
            .execute("commit", &serde_json::to_string(&d).unwrap(), 1)
            .is_err());
        d = e.document.clone();
        d.shapes[0].hidden = Some(true);
        e.execute("commit", &serde_json::to_string(&d).unwrap(), 1)
            .unwrap();
        e.execute("undo", "", 2).unwrap();
        assert_ne!(e.document.shapes[0].hidden, Some(true));
        d = e.document.clone();
        d.shapes.clear();
        assert!(e
            .execute("commit", &serde_json::to_string(&d).unwrap(), 3)
            .is_err());
    }
    #[test]
    fn group_inheritance_and_organization() {
        let mut e = Editor::new();
        let mut d: Document = serde_json::from_str(&sample()).unwrap();
        d.object_tree = Some(vec![ObjectNode::Group {
            id: "g".into(),
            name: "Group".into(),
            hidden: None,
            locked: Some(true),
            children: vec![ObjectNode::Object { id: "a".into() }],
        }]);
        e.execute("commit", &serde_json::to_string(&d).unwrap(), 0)
            .unwrap();
        d = e.document.clone();
        d.shapes[0].name = "Forbidden".into();
        assert!(e
            .execute("preview", &serde_json::to_string(&d).unwrap(), 1)
            .is_err());
        assert!(e
            .execute("commit", &serde_json::to_string(&d).unwrap(), 1)
            .is_err());
        d = e.document.clone();
        if let ObjectNode::Group { name, .. } = &mut d.object_tree.as_mut().unwrap()[0] {
            *name = "Forbidden".into();
        }
        assert!(e
            .execute("commit", &serde_json::to_string(&d).unwrap(), 1)
            .is_err());
        d = e.document.clone();
        d.object_tree = Some(vec![ObjectNode::Object { id: "a".into() }]);
        e.execute("commit", &serde_json::to_string(&d).unwrap(), 1)
            .unwrap();
        d.shapes[0].name = "Allowed".into();
        e.execute("commit", &serde_json::to_string(&d).unwrap(), 2)
            .unwrap();
        e.execute("undo", "", 3).unwrap();
        e.execute("undo", "", 4).unwrap();
        assert!(matches!(
            e.document.object_tree.as_ref().unwrap()[0],
            ObjectNode::Group { .. }
        ));
    }
    #[test]
    fn group_tree_rejects_duplicate_and_missing_members() {
        let mut d: Document = serde_json::from_str(&sample()).unwrap();
        d.object_tree = Some(vec![]);
        assert!(d.validate().is_err());
        d.object_tree = Some(vec![
            ObjectNode::Object { id: "a".into() },
            ObjectNode::Object { id: "a".into() },
        ]);
        assert!(d.validate().is_err());
        d.object_tree = Some(vec![ObjectNode::Object {
            id: "missing".into(),
        }]);
        assert!(d.validate().is_err());
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
        doc.version = 21;
        doc.object_tree = Some(
            doc.shapes
                .iter()
                .rev()
                .map(|s| ObjectNode::Object { id: s.id.clone() })
                .collect(),
        );
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

#[cfg(test)]
mod print_tests {
    use super::*;
    fn project() -> serde_json::Value {
        serde_json::json!({"version":18,"shapes":[{"id":"piece","name":"Piece","kind":"rectangle","points":[{"x":0,"y":0},{"x":40,"y":20}],"radius":0,"rotation":0}],"printLayouts":[{"id":"layout","name":"A4","width":210,"height":297,"margin":10,"units":"mm","pages":[{"column":0,"row":0}],"instances":[{"id":"copy","sourceId":"piece","x":95,"y":100,"rotation":0}],"tree":[{"kind":"instance","id":"copy"}]}]})
    }
    #[test]
    fn print_history_and_roundtrip() {
        let mut editor = Editor::new();
        editor.execute("load", &project().to_string(), 0).unwrap();
        let original = editor.document.clone();
        let mut changed = original.clone();
        changed.print_layouts[0].instances[0].x = 120.0;
        changed.print_layouts[0].instances[0].mirrored = Some(true);
        editor
            .execute("commit", &serde_json::to_string(&changed).unwrap(), 1)
            .unwrap();
        assert_eq!(editor.document.shapes, original.shapes);
        editor.execute("undo", "null", 2).unwrap();
        assert_eq!(editor.document, original);
        editor.execute("redo", "null", 3).unwrap();
        assert_eq!(editor.document, changed);
        let loaded: Document =
            serde_json::from_str(&serde_json::to_string(&changed).unwrap()).unwrap();
        assert_eq!(loaded, changed);
    }
    #[test]
    fn detached_print_snapshot_history_validation_and_source_deletion() {
        let mut editor = Editor::new();
        editor.execute("load", &project().to_string(), 0).unwrap();
        let original = editor.document.clone();
        let mut detached = original.clone();
        detached.print_layouts[0].instances[0].snapshot = Some(PrintSnapshot {
            shape: detached.shapes[0].clone(),
            stitch_groups: vec![],
        });
        editor
            .execute("commit", &serde_json::to_string(&detached).unwrap(), 1)
            .unwrap();
        editor.execute("undo", "null", 2).unwrap();
        assert_eq!(editor.document, original);
        editor.execute("redo", "null", 3).unwrap();
        assert_eq!(editor.document, detached);
        detached.shapes.clear();
        detached.object_tree = None;
        detached.validate().unwrap();
        let roundtrip: Document =
            serde_json::from_str(&serde_json::to_string(&detached).unwrap()).unwrap();
        assert_eq!(roundtrip, detached);
        detached.print_layouts[0].instances[0]
            .snapshot
            .as_mut()
            .unwrap()
            .shape
            .points
            .clear();
        assert!(detached.validate().is_err());
    }
    #[test]
    fn print_validation_rejects_broken_references_and_geometry() {
        for change in ["source", "margin", "duplicate", "tree", "pages"] {
            let mut doc = project();
            match change {
                "source" => {
                    doc["printLayouts"][0]["instances"][0]["sourceId"] =
                        serde_json::json!("missing")
                }
                "margin" => doc["printLayouts"][0]["margin"] = serde_json::json!(105),
                "duplicate" => {
                    let copy = doc["printLayouts"][0].clone();
                    doc["printLayouts"].as_array_mut().unwrap().push(copy);
                }
                "tree" => doc["printLayouts"][0]["tree"] = serde_json::json!([]),
                _ => doc["printLayouts"][0]["pages"] = serde_json::json!([]),
            }
            let doc: Document = serde_json::from_value(doc).unwrap();
            assert!(doc.validate().is_err(), "{change}");
        }
    }
    #[test]
    fn old_projects_start_without_layouts_and_source_deletion_is_atomic() {
        let mut editor = Editor::new();
        editor
            .execute("load", r#"{"version":5,"shapes":[]}"#, 0)
            .unwrap();
        assert_eq!(editor.document.version, 21);
        assert!(editor.document.print_layouts.is_empty());
        editor.execute("load", &project().to_string(), 1).unwrap();
        let original = editor.document.clone();
        let mut deleted = original.clone();
        deleted.shapes.clear();
        deleted.object_tree = Some(vec![]);
        deleted.print_layouts[0].instances.clear();
        deleted.print_layouts[0].tree = Some(vec![]);
        editor
            .execute("commit", &serde_json::to_string(&deleted).unwrap(), 2)
            .unwrap();
        editor.execute("undo", "null", 3).unwrap();
        assert_eq!(editor.document, original);
    }
}
