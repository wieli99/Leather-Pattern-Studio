import { pathPlacements } from "../model/pathPlacements";
import { transformShape } from "../model/geometry";
import { stitchRunClosed } from "../model/stitchGeometry";
import { booleanShapes } from "../model/booleanShapes";
import { isClosedShape } from "../model/closedShape";
import type { BooleanOperation } from "../model/boolean";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { stitchTools, type StitchTool } from "./stitchTools";
import { copyTransferPlacements, shareReceivingGeometry, hitStitchHole, detachTransfer, makeTransfer, pieceFrame, stitchPiece, materialContains, copyStitchData, resolvedStitchGroups, receivingStitches, holeAppearance, holeMark, holeTouchesEdge } from "../model/stitchLayers";
import type { StitchTransfer } from "../generated/StitchTransfer";
import { hitsTransformShaft } from "./transformUi";
import {snapRigidMove,snapRotation} from "./rigidTransform";
import { reconcilePrintLayouts } from "../model/printLayout";
import { formatLength, unitSymbol, type UnitMode } from "../model/units";
import { resizeText } from "../model/text";
import type { ImportedImage } from "./imageImport";
import { DOCUMENT_VERSION } from "../model/project";
import { isIndicator } from "../model/indicators";
import { inheritedStateSource, objectTreeFromShapes, reconcileObjectTree, treeInDrawingOrder, flattenObjectTree, findObjectNode, mapObjectTree, moveObjectNodes, objectState, filterObjectTree, type ObjectNode } from "../model/objectTree";
import { shapeArea } from "../model/area";
import { mergeShapes } from "../model/merge";
import { offsetShape, type OffsetJoin } from "../model/offset";
import { flattenContours } from "../model/flattenOutline";
import { trimAt } from "../model/trim";
import {
  defaultStitchSettings,
  validateStitchSettings,
  type StitchSettings,
} from "../model/stitch";
import {
  worldStitchSide,
  stitchEdges,
  stitchClosed,
  insideStitchSide,
  stitchGeometry as computeStitches,
  resolveStitchRun,
  validateRunPositions,
  orderStitchEdges,
  reconcileStitches,
  type StitchGroup,
} from "../model/stitchGeometry";
import { rectanglePath, sharpAnchor, toggleAnchor } from "../model/sharpAnchor";
import { insertAnchor } from "../model/insertAnchor";
import { isCurve, zeroHandles, mirroredHandles } from "../model/curves";
import type { CurveHandles } from "../generated/CurveHandles";
import {
  smartSnap,
  type SmartGuide,
  snapCandidates,
  type SnapKind,
} from "./snapping";
import {
  construct,
  isCurveMode,
  pointCount,
  labels,
  variants,
  type Mode,
} from "./construction";
import {
  emptyDocument,
  parseProject,
  type Doc,
  type Shape,
  type Point,
  type Tool,
} from "../model/project";
import {
  cornerPoints,
  cornerRadii,
  setCornerRadius,
  anchors,
  stretchShape,
  boundary,
  shapeMatrix,
  applyMatrix,
  inverse,
  localCenter,
  multiply,
  bounds,
  center,
  distance,
  distanceToSegment,
  hitTest,
  moveShape,
  rotatePoint,
  rotateShape,
  worldPoints,
  contains,
  intersectsBox,
  nearestOutline,
  type Bounds,
} from "../model/geometry";
import { Core, type Snapshot } from "./core";
import { ProjectFiles, recovery, type Recovery } from "./persistence";
const fingerprint = (doc: Doc) => {
  const tree = reconcileObjectTree(doc.objectTree ?? objectTreeFromShapes(doc.shapes), doc.shapes);
  return JSON.stringify(parseProject(JSON.stringify({ ...doc, objectTree: tree, shapes: treeInDrawingOrder(tree, doc.shapes) })));
};
export type Gesture = {
  kind: "move" | "scale" | "rotate" | "vertex" | "corner" | "marquee" | "pan";
  start: Point;
  end: Point;
  original: Doc;
  selection: string[];
  pivot: Point;
  snapAnchor?: Point;
  displacement?: Point;
  axis?: "x" | "y";
  orientation?: number;
  baseValues?: { x: number; y: number; angle: number; sx: number; sy: number };
  shapeId?: string;
  vertex?: number;
  handleSide?: "incoming" | "outgoing";
  pan?: Point;
  crossing?: boolean;
  angle?: number;
  lastAngle?: number;
  factor?: number;
};
const defaultGridView = { zoom: 3, pan: { x: 80, y: 100 } };

export class Controller {
  drawingShift = false;
  setDrawingModifier(shift: boolean) {
    if (this.drawingShift === shift) return;
    this.drawingShift = shift;
    if (this.stitchMode) {
      this.updateStitchHover();
      this.notify();
    }
    if (
      this.tool !== "select" &&
      this.pointerInside &&
      !this.gesture &&
      !this.guideDrag
    ) {
      this.pointerMove(
        this.screen(this.anchorPointer),
        this.anchorAlt,
        this.measurementsVisible,
        shift,
      );
    }
    this.notify();
  }
  updateCornerModifiers(alt: boolean, ctrl: boolean, shift: boolean) {
    if (this.gesture?.kind === "corner")
      this.pointerMove(this.screen(this.anchorPointer), alt, ctrl, shift);
  }
  updateVertexModifiers(alt: boolean, ctrl: boolean, shift: boolean) {
    if (this.gesture?.kind === "vertex" && !this.gesture.handleSide &&
        (distance(this.gesture.start, this.anchorPointer) > 1e-9 ||
         distance(this.gesture.start, this.gesture.end) > 1e-9))
      this.pointerMove(this.screen(this.anchorPointer), alt, ctrl, shift);
  }
  selectedCorner: { shapeId: string; index: number } | null = null;
  cornerHandles() {
    if (this.tool !== "select" || this.transformTool !== "corner") return [];
    return this.active.flatMap((s) => {
      const pts = cornerPoints(s);
      return pts.flatMap((p, i) => {
        const prev = pts[(i + pts.length - 1) % pts.length],
          next = pts[(i + 1) % pts.length];
        const a = distance(p, prev),
          b = distance(p, next);
        const dx = (prev.x - p.x) / (a || 1) + (next.x - p.x) / (b || 1),
          dy = (prev.y - p.y) / (a || 1) + (next.y - p.y) / (b || 1),
          len = Math.hypot(dx, dy);
        if (len < 1e-9 || a < 1e-9 || b < 1e-9) return [];
        const m = shapeMatrix(s),
          origin = applyMatrix(m, p),
          direction = applyMatrix(m, { x: p.x + dx / len, y: p.y + dy / len });
        const scale = distance(origin, direction),
          inset = 14 / (this.zoom * (scale || 1));
        const point = applyMatrix(m, {
          x: p.x + (dx / len) * inset,
          y: p.y + (dy / len) * inset,
        });
        return [{ kind: "corner" as const, point, vertex: i, shapeId: s.id }];
      });
    });
  }
  measurementsVisible = false;
  setMeasurementModifier(ctrl: boolean) {
    if (this.measurementsVisible === ctrl) return;
    this.measurementsVisible = ctrl;
    this.notify();
  }
  core: Pick<Core, "request">;
  files = new ProjectFiles();
  printLayoutActive = false;
  projectEpoch = 0;
  document = emptyDocument();
  preview: Doc | null = null;
  revision = 0;
  canUndo = false;
  canRedo = false;
  ready = false;
  busy = false;
  dirty = false;
  savedBaseline = fingerprint(emptyDocument());
  transformTool: "move" | "rotate" | "scale" | "mirror" | "corner" | null = null;
  transformOriginal: Doc | null = null;
  transformPivot: Point = { x: 0, y: 0 };
  placingPivot = false;
  transformOrientation: "world" | "local" = "local";
  transformAxis: "x" | "y" | undefined;
  transformValues = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };
  transformError = "";
  transformGeneration = 0;
  transformDraft: Doc | null = null;
  offsetActive = false;
  offsetDistance = 3;
  offsetJoin: OffsetJoin = "sharp";
  offsetError = "";
  offsetDraft: Doc | null = null;
  offsetIds: string[] = [];
  offsetDrag: { start: Point; distance: number; normal: Point } | null = null;
  private offsetDragAt(raw: Point) {
    const originals = this.document.shapes.filter(s => this.selected.includes(s.id));
    const index = this.offsetIds.findIndex(id => {
      const shape = this.offsetDraft?.shapes.find(s => s.id === id);
      return shape && hitTest(shape, raw, 8 / this.zoom, this.units);
    });
    const source = originals[index];
    if (!source) return null;
    let best = Infinity, normal: Point | null = null;
    for (const {points,closed} of flattenContours(source, 0.05)) {
      const area = closed ? points.reduce((sum, a, i) => {
        const b = points[(i + 1) % points.length];
        return sum + a.x * b.y - a.y * b.x;
      }, 0) : 0;
      for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const d = distanceToSegment(raw, a, b);
        if (d >= best) continue;
        const dx = b.x - a.x, dy = b.y - a.y, size = Math.hypot(dx, dy);
        if (size < 1e-9) continue;
        best = d;
        const probe = {x:(a.x+b.x)/2-dy/size*0.001,y:(a.y+b.y)/2+dx/size*0.001};
        const side = source.kind === "compound" ? (contains(source,probe) ? 1 : -1) : closed ? Math.sign(area) : 1;
        normal = { x: side * dy / size, y: -side * dx / size };
      }
    }
    return normal;
  }
  get canOffset() {
    return this.ready && !this.busy && !this.printLayoutActive && this.selectionToolsAvailable &&
      !this.selectionLocked && this.active.length > 0 && this.active.every(s =>
        ["line", "polyline", "curve", "control-curve", "rectangle", "circle", "ellipse", "arc", "compound"].includes(s.kind) &&
        !s.stitchOnly && !this.isHidden(s.id));
  }
  activateOffset() {
    if (!this.canOffset) return;
    this.cancel();
    this.tool = "select";
    this.mode = "select";
    this.offsetActive = true;
    this.refreshOffset();
  }
  setOffsetDistance(value: number) {
    this.offsetDistance = value;
    this.refreshOffset();
  }
  setOffsetJoin(value: OffsetJoin) {
    this.offsetJoin = value;
    this.refreshOffset();
  }
  refreshOffset() {
    if (!this.offsetActive) return;
    this.offsetDraft = null;
    this.offsetIds = [];
    this.preview = null;
    try {
      if (!Number.isFinite(this.offsetDistance) || Math.abs(this.offsetDistance) < 1e-8)
        throw Error("Enter a non-zero finite offset distance.");
      const selected = new Set(this.selected);
      const copies = this.document.shapes.filter(s => selected.has(s.id)).map(s => {
        try { return { sourceId: s.id, shape: offsetShape(s, this.offsetDistance, this.offsetJoin) }; }
        catch (error) { throw Error(`${s.name}: ${String(error).replace(/^Error: /, "")}`); }
      });
      const bySource = new Map(copies.map(copy => [copy.sourceId, copy.shape]));
      const insert = (nodes: ObjectNode[]): ObjectNode[] => nodes.flatMap<ObjectNode>(node => {
        if (node.kind === "group") return [{ ...node, children: insert(node.children) }];
        const copy = bySource.get(node.id);
        return copy ? [{ kind: "object" as const, id: copy.id }, node] : [node];
      });
      const next = { ...this.document, shapes: [...this.document.shapes, ...copies.map(c => c.shape)], objectTree: insert(this.tree) };
      parseProject(JSON.stringify(this.normalizeTree(next)));
      this.offsetDraft = next;
      this.offsetIds = copies.map(c => c.shape.id);
      this.offsetError = "";
      this.preview = next;
    } catch (error) {
      this.offsetError = String(error).replace(/^Error: /, "");
    }
    this.notify();
  }
  async applyOffset() {
    if (!this.offsetActive || !this.offsetDraft || this.offsetError || this.busy) return;
    const next = this.offsetDraft, ids = this.offsetIds;
    this.cancel();
    if (await this.commit(next)) {
      this.selectedGroups = [];
      this.selected = ids;
      this.notify();
    }
  }
  get transformAngle() {
    const s = (this.transformOriginal?.shapes.filter((s) =>
      this.selected.includes(s.id),
    ) ?? this.active)[0];
    if (this.transformOrientation !== "local" || this.active.length !== 1)
      return 0;
    const m = shapeMatrix(s);
    return (Math.atan2(m.b, m.a) * 180) / Math.PI;
  }
  get gizmoAngle() {
    if (this.transformOrientation !== "local" || this.active.length !== 1)
      return 0;
    const m = shapeMatrix(this.active[0]);
    return (Math.atan2(m.b, m.a) * 180) / Math.PI;
  }
  pauseGesture() {
    if (this.offsetDrag) {
      const startingDistance = this.offsetDrag.distance;
      this.offsetDrag = null;
      this.setOffsetDistance(startingDistance);
    }
    const gesture = this.gesture;
    if (gesture && !this.transformTool && gesture.kind !== "pan") {
      this.preview = null;
      this.selected = gesture.selection;
    }
    if (gesture?.kind === "move" && this.transformTool) {
      this.transformPivot = {
        x: this.transformPivot.x + (gesture.displacement?.x ?? 0),
        y: this.transformPivot.y + (gesture.displacement?.y ?? 0),
      };
    }
    this.gesture = null;
    this.drawingDown = null;
    this.guideDrag = null;
    this.pointerInside = false;
    this.space = false;
    this.anchorAlt = false;
    this.drawingShift = false;
    this.measurementsVisible = false;
    this.smartGuides = [];
    this.snapTarget = null;
    this.snapKind = null;
    // Invalidate interrupted drag responses, but retain pending tool previews.
    if (gesture) this.previewId++;
    this.notify();
  }

  get transformValid() {
    if (this.transformTool === "mirror" && !this.mirrorAxis) return false;
    if (!this.preview) return !this.transformError;
    try {
      parseProject(JSON.stringify(this.normalizeTree(this.preview)));
      return !this.transformError;
    } catch {
      return false;
    }
  }
  rebaseTransform() {
    if (this.transformTool && this.preview && !this.transformError)
      this.transformOriginal = this.preview;
    this.transformValues = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };
  }
  setPivot(point: Point) {
    if (this.transformTool !== "mirror") this.rebaseTransform();
    this.transformPivot = point;
    this.placingPivot = false;
    if (this.transformTool === "mirror") this.refreshMirror();
    this.notify();
  }
  setOrientation(value: "world" | "local") {
    if (this.transformTool !== "mirror") this.rebaseTransform();
    this.transformOrientation = value;
    if (this.transformTool === "mirror") this.refreshMirror();
    this.preferences();
    this.notify();
  }
  resetPivot() {
    if (this.transformTool !== "mirror") this.rebaseTransform();
    const b = this.selectionBounds;
    this.transformPivot = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    if (this.transformTool === "mirror") this.refreshMirror();
    this.notify();
  }
  setCornerValue(value: number, all = false) {
    const target = this.selectedCorner;
    if (!target) return;
    if (!Number.isFinite(value) || value < 0) {
      this.transformError = "Enter a finite non-negative radius.";
      this.notify();
      return;
    }
    const doc = this.preview ?? this.document;
    const shape = doc.shapes.find((s) => s.id === target.shapeId);
    if (!shape) return;
    this.updateTransformPreview({
      ...doc,
      shapes: doc.shapes.map((s) =>
        s.id === shape.id ? setCornerRadius(s, target.index, value, all) : s,
      ),
    });
  }
  setTransformValues(values: Partial<typeof this.transformValues>) {
    if (!this.transformOriginal) return;
    const previous = { ...this.transformValues };
    this.transformValues = { ...this.transformValues, ...values };
    if (this.transformTool === "mirror") { this.refreshMirror(); return; }
    const v = this.transformValues,
      p = this.transformPivot;
    if (
      ![v.x, v.y, v.angle, v.sx, v.sy].every(Number.isFinite) ||
      v.sx <= 0 ||
      v.sy <= 0
    ) {
      this.transformError = "Enter finite values and positive scale factors.";
      this.notify();
      return;
    }
    if (this.transformTool === "scale" && this.active.some(s=>s.kind === "size-square") && v.sx !== v.sy) {
      const factor = values.sx !== undefined ? v.sx : v.sy;
      v.sx = factor; v.sy = factor;
    }
    const t = (this.transformAngle * Math.PI) / 180;
    if (
      this.transformTool === "move" &&
      Number.isFinite(previous.x) &&
      Number.isFinite(previous.y)
    ) {
      const dx = v.x - previous.x,
        dy = v.y - previous.y;
      this.transformPivot = {
        x: this.transformPivot.x + dx * Math.cos(t) - dy * Math.sin(t),
        y: this.transformPivot.y + dx * Math.sin(t) + dy * Math.cos(t),
      };
    }
    const next = {
      ...this.transformOriginal,
      shapes: this.transformOriginal.shapes.map((s) =>
        !this.selected.includes(s.id)
          ? s
          : this.transformTool === "move"
            ? moveShape(
                s,
                v.x * Math.cos(t) - v.y * Math.sin(t),
                v.x * Math.sin(t) + v.y * Math.cos(t),
              )
            : this.transformTool === "rotate"
              ? rotateShape(s, v.angle, p)
              : stretchShape(s, v.sx, v.sy, p, this.transformAngle),
      ),
    };
    this.updateTransformPreview(next);
  }
  updateTransformPreview(next: Doc) {
    const baseline = this.transformOriginal ?? this.document;
    if (this.transformTool === "corner")
      next = { ...next, stitchGroups: baseline.stitchGroups };
    next = reconcileStitches(next, baseline);
    this.transformDraft = next;
    try {
      parseProject(JSON.stringify(this.normalizeTree(next)));
      this.transformError = "";
      this.preview = next;
      void this.validatePreview(next);
    } catch (e) {
      this.transformError = String(e);
    }
    this.notify();
  }
  tool: Tool = "select";
  mode: Mode = "select";
  lastRectangle: Mode = "rectangle";
  lastMeasurement: Mode = "measurement";
  lastDrawing: Mode = "arrow";
  lastPolygon: Mode = "polygon";
  lastCircle: Mode = "circle";
  lastPolyline: Mode = "polyline";
  pendingHandles: CurveHandles[] = [];
  hoverHandle = "";
  drawingDown: { pixel: Point; point: Point; initial: boolean } | null = null;
  beforeClick: Point[] = [];
  doubleClickBase: Point[] = [];
  doubleClickClosed = false;
  doubleClickHandles: CurveHandles[] = [];
  transactionQueue: Promise<void> = Promise.resolve();
  pendingDocument: Doc | null = null;
  arcSweep = 0;
  arcRawSweep = 0;
  arcLast: number | undefined;
  propertySession: { original: Doc; next: Doc } | null = null;
  selected: string[] = [];
  hover = "";
  pending: Point[] = [];
  cursor: Point = { x: 0, y: 0 };
  snapTarget: Point | null = null;
  snapKind: SnapKind | null = null;
  pointerInside = false;
  private clipboardOrigin=crypto.randomUUID();
  private clipboardPixel: Point | null = null;
  smartGuides: SmartGuide[] = [];
  grid = true;
  objects = true;
  units: UnitMode = "mm";
  formatLength(value: number) { return formatLength(value, this.units); }
  get unitSymbol() { return unitSymbol(this.units); }
  gridSize = 1;
  guideDrag: { id: string; axis: "x" | "y"; coordinate: number } | null = null;
  gridStyle: "dots" | "lines" = "dots";
  rulers = false;
  theme = "dark";
  zoom = defaultGridView.zoom;
  pan = { ...defaultGridView.pan };
  width = 900;
  height = 700;
  space = false;
  gesture: Gesture | null = null;
  message = "Starting geometry engine…";
  name = "Untitled.leather";
  restore: Recovery | undefined;
  listeners = new Set<() => void>();
  version = 0;
  timer: ReturnType<typeof setTimeout> | undefined;
  previewId = 0;
  previewRunning = false;
  queuedPreview: Doc | null = null;
  constructor(core?: Pick<Core, "request">) {
    this.core = core ?? new Core();
    try {
      const p = JSON.parse(localStorage.getItem("leather-ui") ?? "{}");
      if (["mm", "in-fractional", "in-decimal"].includes(p.units)) this.units = p.units;
      for (const key of ["grid", "objects", "rulers"] as const)
        if (typeof p[key] === "boolean") this[key] = p[key];
      if (["world", "local"].includes(p.transformOrientation))
        this.transformOrientation = p.transformOrientation;
      if (Number.isFinite(p.gridSize) && p.gridSize > 0)
        this.gridSize = p.gridSize;
      if (["dots", "lines"].includes(p.gridStyle)) this.gridStyle = p.gridStyle;
      if (["dark", "light", "solarized", "nord", "contrast"].includes(p.theme))
        this.theme = p.theme;
    } catch {}
  }
  preferences() {
    if (!this.objects) this.smartGuides = [];
    try {
      localStorage.setItem(
        "leather-ui",
        JSON.stringify({
          transformOrientation: this.transformOrientation,
          grid: this.grid,
          objects: this.objects,
          units: this.units,
          gridSize: this.gridSize,
          gridStyle: this.gridStyle,
          rulers: this.rulers,
          theme: this.theme,
        }),
      );
    } catch {}
    this.notify();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.version;
  private dirtySource: Doc | null = null;
  private dirtyBaseline = "";
  uiSnapshot = () =>
    [
      JSON.stringify(this.pathCopy),
      this.booleanOperation,
      this.booleanPicker,
      this.booleanCutters.join(","),
      this.booleanError,
      this.booleanEmpty,
      this.trimMode,
      JSON.stringify(this.trimDraft),
      this.trimMode ? this.transformError : "",
      this.stitchMode,
      this.stitchMode ? this.version : 0,
      this.stitchSelected.join(","),
      JSON.stringify(this.stitchDraft),
      JSON.stringify(this.stitchSettings),
      this.stitchError,
      this.transformTool,
      this.transformTool ? this.version : 0,
      this.offsetActive,
      this.offsetActive ? this.version : 0,
      this.revision,
      this.ready,
      this.message,
      this.busy,
      this.dirty,
      this.name,
      this.mode,
      this.lastRectangle,
      this.lastCircle,
      this.lastMeasurement,
      this.lastDrawing,
      this.lastPolygon,
      this.lastPolyline,
      this.selected.join(","),
      this.selectedGroups.join(","),
      this.panelRevision,
      this.pending.length,
      this.selectionToolsAvailable,
      !!this.guideDrag,
      this.gesture?.kind,
      this.gesture?.handleSide,
      this.grid,
      this.objects,
      this.units,
      this.gridSize,
      this.gridStyle,
      this.rulers,
      this.theme,
      this.restore?.time,
      this.propertySession ? this.version : 0,
    ].join("|");
  cursorSnapshot = () =>
    `${this.formatLength(this.cursor.x)}, ${this.formatLength(this.cursor.y)} ${this.unitSymbol}|${this.message}|${this.zoom}`;
  hoverSnapshot = () =>
    `${this.tool}|${this.placingPivot}|${this.hoverHandle}|${this.gesture?.kind ?? ""}`;
  private anchorAlt = false;
  private anchorPointer: Point = { x: 0, y: 0 };
  setAnchorModifier(alt: boolean) {
    this.anchorAlt = alt;
    this.notify();
  }
  get anchorIndicator(): Point | null {
    if (
      !this.anchorAlt ||
      !this.pointerInside ||
      this.space ||
      this.tool !== "select" ||
      this.transformTool ||
      this.placingPivot ||
      this.gesture ||
      !this.ready ||
      this.busy
    )
      return null;
    const raw = this.anchorPointer;
    const hit = [...this.document.shapes.filter(s => !this.isHidden(s.id))]
      .reverse()
      .find((s) => !isIndicator(s.kind) && s.kind !== "text" && s.kind !== "measurement" && hitTest(s, raw, 8 / this.zoom, this.units));
    let point: Point | null = null;
    if (hit)
      insertAnchor(hit, raw, 8 / this.zoom, (p) => {
        point = p;
      });
    return point;
  }
  leavePointer() {
    this.stitchHover = null;
    this.pointerInside = false;
    this.smartGuides = [];
    this.snapTarget = null;
    this.snapKind = null;
    this.notify();
  }

  updateDirty() {
    const source =
      this.propertySession?.next ??
      this.pendingDocument ??
      this.stitchOriginal ??
      this.document;
    if (
      source !== this.dirtySource ||
      this.savedBaseline !== this.dirtyBaseline
    ) {
      this.dirtySource = source;
      this.dirtyBaseline = this.savedBaseline;
      this.dirty = fingerprint(source) !== this.savedBaseline;
    }
  }
  private frameNotification = false;
  private notifyPointer() {
    if (typeof requestAnimationFrame === "undefined") {
      this.notify();
      return;
    }
    if (this.frameNotification) return;
    this.frameNotification = true;
    requestAnimationFrame(() => {
      this.frameNotification = false;
      this.notify();
    });
  }
  notify() {
    this.updateDirty();
    this.version++;
    for (const fn of this.listeners) fn();
  }
  async initialize() {
    try {
      const initial = await this.core.request("snapshot", 0);
      if (initial.document.version !== DOCUMENT_VERSION)
        throw Error(
          `Application expects document version ${DOCUMENT_VERSION}, but geometry worker returned ${initial.document.version}. Reload the page (Ctrl+Shift+R).`,
        );
      this.accept(initial);
      this.ready = true;
      this.message = "Ready";
      try {
        this.restore = await recovery();
        if (!this.restore) {
          const legacy = localStorage.getItem("leather-recovery");
          if (legacy)
            this.restore = {
              document: parseProject(legacy),
              name: "Recovered.leather.json",
              time: Date.now(),
            };
        }
      } catch {
        this.message =
          "Recovery storage unavailable. Save project files regularly.";
      }
      this.notify();
    } catch (e) {
      this.fail(e);
    }
  }
  fail(e: unknown) {
    this.message = e instanceof Error ? e.message : String(e);
    this.notify();
  }
  accept(s: Snapshot) {
    this.document = s.document;
    this.revision = s.revision;
    this.canUndo = s.canUndo;
    this.canRedo = s.canRedo;
    this.selectedGroups = this.selectedGroups.filter(id => findObjectNode(this.tree, id)?.kind === "group");
    this.selected = [...new Set([
      ...this.selected.filter(id => s.document.shapes.some(shape => shape.id === id)),
      ...this.selectedGroups.flatMap(id => {
        const node = findObjectNode(this.tree, id);
        return node?.kind === "group" ? flattenObjectTree(node.children) : [];
      }),
    ])];
  }
  scheduleRecovery() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void recovery({
        document: this.stitchOriginal ?? this.document,
        name: this.name,
        time: Date.now(),
        collapsedGroupIds: [...this.collapsedGroups],
      }).catch(() =>
        this.fail(Error("Recovery storage failed. Save a project file.")),
      );
    }, 300);
  }
  async transact(operation: string, document?: Doc) {
    if ((operation === "commit" || operation === "preview") && document && !this.canCommitFromView(document)) {
      throw Error("Edit source geometry on Model");
    }
    if (this.transformTool || this.stitchMode || this.booleanOperation) this.cancel();
    const run = async () => {
      if (!this.ready) return;
      this.busy = true;
      this.notify();
      try {
        const before = this.revision;
        this.accept(
          await this.core.request(operation, this.revision, document),
        );
        if (operation === "load") {
          this.clipboardOrigin=crypto.randomUUID();
          this.projectEpoch++;
          this.printLayoutActive = false;
        }
        if (this.revision !== before) {
          this.dirty = true;
          this.scheduleRecovery();
        }
      } catch (e) {
        this.fail(e);
        throw e;
      } finally {
        this.preview = null;
        this.busy = false;
        this.notify();
      }
    };
    const task = this.transactionQueue.then(run);
    this.transactionQueue = task.catch(() => {});
    await task;
  }
  stitchGeometry(shape: Shape, group: StitchGroup) {
    return computeStitches(shape, group, this.stitchGroups.map(g => g.id === group.id ? group : g));
  }
  stitchTool: StitchTool | null = null;
  stitchToolPending = false;
  stitchOperationSelection: string[] = [];
  stitchSplitMethod: "all" | "junction" = "all";
  get stitchToolInfo() { return stitchTools.find(t=>t.id===this.stitchTool); }
  get stitchOperationGroups() {
    const doc=this.stitchOriginal ?? this.document;
    return this.stitchOperationSelection.flatMap(id=>{const group=doc.stitchGroups?.find(g=>g.id===id);return group ? [group] : [];});
  }
  stitchToolReason(tool: StitchTool): string {
    if(this.busy || this.stitchToolPending) return "Wait for the current operation.";
    if(this.selectionLocked) return "Unlock the selection first.";
    const doc=this.stitchOriginal ?? this.document;
    const ids=this.stitchTool && !["line","add","continue","convert"].includes(this.stitchTool) ? this.stitchOperationSelection : this.stitchSelected;
    const selectedIds=new Set(ids);
    if(tool==="link")for(const link of doc.stitchLinks ?? [])if(link.members.some(id=>selectedIds.has(id)))link.members.forEach(id=>selectedIds.add(id));
    const groups=[...selectedIds].flatMap(id=>{const group=doc.stitchGroups?.find(g=>g.id===id);return group ? [group] : [];});
    if(tool==="line" || tool==="add")return "";
    if(tool==="convert")return this.convertiblePath && !(doc.stitchGroups ?? []).some(g=>g.shapeId===this.convertiblePath!.id) ? "" : "Select one unstitched path to convert.";
    if(!groups.length || groups.length!==selectedIds.size)return "Select editable source stitching first.";
    if(groups.some(g=>this.isLocked(g.shapeId)))return "Unlock the stitching first.";
    const first=groups[0];
    if(tool==="transfer")return "";
    if(tool==="continue") {
      if(groups.length!==1 || first.holes)return "Select one editable section.";
      if(!first.settings.holeCount)return "Set a fixed hole count before continuing this section.";
      try {const geometry=computeStitches(doc.shapes.find(s=>s.id===first.shapeId)!,first,doc.stitchGroups);return geometry.distances.at(-1)!+first.settings.spacing<geometry.length-1e-6 ? "" : "Shorten this section or reserve end clearance first.";}catch{return "Correct invalid stitch geometry first.";}
    }
    if(tool==="path")return groups.length===1 && doc.shapes.find(s=>s.id===first.shapeId)?.stitchOnly ? "" : "Select one editable stitching path.";
    if(tool==="delete")return "";
    if(tool==="unlink")return (doc.stitchLinks ?? []).some(l=>l.members.some(id=>ids.includes(id))) ? "" : "Select a linked stitch line.";
    if(tool==="link") {
      if(groups.length<2)return "Select at least two lines with equal hole counts.";
      try {return new Set(groups.map(g=>computeStitches(doc.shapes.find(s=>s.id===g.shapeId)!,g,doc.stitchGroups).holes.length)).size===1 ? "" : "Selected lines must have equal hole counts.";}catch{return "Correct invalid stitch geometry first.";}
    }
    if(groups.some(g=>g.settings.holeCount || g.holes))return "Only full-length edge lines can be merged or split.";
    if(tool==="split")return groups.length===1 && first.edges.length>1 ? "" : "Select one line spanning multiple edges.";
    if(groups.length<2 || groups.some(g=>g.shapeId!==first.shapeId))return "Select at least two connected lines on the same piece, in connection order.";
    try {
      const shape=doc.shapes.find(s=>s.id===first.shapeId)!;
      if(!stitchClosed(shape) && groups.some(g=>g.side!==first.side))return "Select stitching on the same side.";
      orderStitchEdges(shape,groups.flatMap(g=>g.edges),first.edges[0]);
      const targets=(doc.stitchTransfers ?? []).filter(t=>ids.includes(t.masterId)).map(t=>t.targetId);
      if(new Set(targets).size!==targets.length)return "Remove overlapping receiving assignments before merging.";
      return "";
    }catch{return "Select at least two connected lines on the same piece, in connection order.";}
  }
  resetStitchOperation() {
    if(this.stitchOriginal)this.document=this.stitchOriginal;
    if(this.stitchOriginalSettings)this.stitchSettings={...this.stitchOriginalSettings};
    const ids=new Set(resolvedStitchGroups(this.document).map(g=>g.id));
    const previousSelection=this.stitchOperationSelection.filter(id=>ids.has(id));
    const currentSelection=this.stitchSelected.filter(id=>ids.has(id));
    this.stitchSelected=this.stitchTool && ["link","unlink","merge","split","delete","transfer"].includes(this.stitchTool) ? previousSelection : currentSelection.length ? currentSelection : previousSelection;
    this.stitchOperationSelection=[];this.stitchTool=null;
    this.stitchDraft=null;this.stitchHover=null;this.stitchAbsorbed=[];
    this.stitchTransferPlacement=null;this.editingStitchHoles=false;this.stitchHoleSelection=[];
    this.addingStitchRun=false;this.stitchError="";this.smartGuides=[];this.snapTarget=null;
  }
  cancelStitchOperation() {
    if(this.busy || this.stitchToolPending)return;
    this.resetStitchOperation();this.notify();
  }
  async activateStitchTool(tool: StitchTool) {
    if(this.stitchTool===tool || this.stitchToolReason(tool))return;
    this.resetStitchOperation();
    // Recheck against committed state after dropping the previous preview.
    const reason=this.stitchToolReason(tool);
    if(reason){this.stitchError=reason;this.notify();return;}
    if(tool==="path"){await this.editStitchPath();return;}
    this.stitchTool=tool;this.stitchOperationSelection=[...this.stitchSelected];
    this.stitchSplitMethod="all";
    this.stitchSplitJunction=this.stitchOperationGroups[0]?.closed ? 0 : 1;
    if(tool==="add")this.addingStitchRun=true;
    if(tool==="transfer")this.beginStitchTransfer();
    else if(tool==="continue"){this.stitchToolPending=true;await this.continueStitchRun();this.stitchToolPending=false;}
    else if(tool==="convert"){this.stitchToolPending=true;await this.convertPathToStitch();this.stitchToolPending=false;}
    else await this.previewStitchOperation();
    this.notify();
  }
  async previewStitchOperation() {
    const tool=this.stitchTool;
    if(!tool || !["link","unlink","merge","split","delete"].includes(tool) || this.busy || this.stitchToolPending)return;
    this.document=this.stitchOriginal!;this.stitchSelected=[...this.stitchOperationSelection];this.stitchError="";
    const reason=this.stitchToolReason(tool);
    if(reason){this.stitchError=reason;this.notify();return;}
    if(tool==="split" && this.stitchSplitMethod==="junction") {
      const group=this.stitchGroups.find(g=>g.id===this.stitchOperationSelection[0])!;
      this.stitchSplitJunction=Math.max(group.closed ? 0 : 1,Math.min(this.stitchSplitJunction,group.edges.length-1));
    }
    this.stitchToolPending=true;
    try {
      if(tool==="link" || tool==="unlink")await this.linkStitches(tool==="unlink");
      else if(tool==="merge")await this.mergeStitches();
      else if(tool==="split")await this.splitStitches(this.stitchSplitMethod==="junction" ? this.stitchSplitJunction : undefined);
      else await this.deleteStitches();
    } catch(reason) {
      this.document=this.stitchOriginal!;
      this.stitchSelected=[...this.stitchOperationSelection];
      this.stitchError=String(reason);
    } finally {this.stitchToolPending=false;this.notify();}
  }
  focusStitchLine(id: string) {
    if(this.busy || this.stitchToolPending)return;
    this.resetStitchOperation();
    if(resolvedStitchGroups(this.document).some(g=>g.id===id)) {
      this.stitchTool="line";this.stitchSelected=[id];
    }
    this.notify();
  }
  get canApplyStitchTool() {
    return !!this.stitchTool && !this.busy && !this.stitchToolPending && !this.stitchError && (!this.stitchTransferPlacement || this.stitchTransferPlacement.phase==="placed" && this.stitchTransferPreview.transfers.length>0);
  }
  stitchOriginal: Doc | null = null;
  stitchOriginalSettings: StitchSettings | null = null;
  stitchMode = false;
  editingStitchHoles = false;
  stitchHoleNumber = 1;
  stitchHoleNumbers: number[] = [1];
  addingStitchRun = false;
  stitchTransferHighlight: string | null = null;
  stitchHoleSelection: { groupId:string; number:number }[] = [];
  stitchTransferPlacement: { placementId:string; groupIds:string[]; center:Point; angle:number; rawAngle:number; phase?:"hover"|"placed" } | null = null;
  stitchSplitJunction = 1;
  stitchSelected: string[] = [];
  stitchSettings: StitchSettings = { ...defaultStitchSettings };
  stitchDraft: StitchGroup | null = null;
  stitchHover: StitchGroup | null = null;
  stitchAbsorbed: string[] = [];
  updateStitchHover() {
    if (!this.stitchTool || !["line","add"].includes(this.stitchTool)) {this.stitchHover=null;return;}
    if (this.stitchDraft) {
      this.stitchHover = null;
      return;
    }
    this.stitchAbsorbed = [];
    if (this.stitchTransferPlacement) return;
    const target = this.stitchTarget(this.anchorPointer);
    this.stitchHover = target;
    if (target?.id === "preview") {
      try {
        const result = this.stitchPlacement(target, this.drawingShift);
        this.stitchHover = { ...result.next, id: "preview" };
        this.stitchAbsorbed = result.absorbed;
        this.stitchError = "";
      } catch (error) {
        this.stitchHover = null;
        this.stitchError = String(error);
      }
    }
  }
  stitchError = "";
  updateStitchTransferHighlight(raw: Point) {
    this.stitchTransferHighlight=null;
    if(!this.stitchMode && !this.measurementsVisible)return;
    const ids=new Set((this.document.stitchTransfers ?? []).flatMap(t=>[t.id,t.masterId]));
    for(const group of resolvedStitchGroups(this.document)) {
      if(!ids.has(group.id))continue;
      const shape=this.document.shapes.find(s=>s.id===group.shapeId);
      if(!shape || this.isHidden(shape.id))continue;
      try {const holes=this.stitchGeometry(shape,group).holes,p=holes[Math.floor(holes.length/2)]?.point;if(p && distance(raw,{x:p.x+10/this.zoom,y:p.y+12/this.zoom})<10/this.zoom)this.stitchTransferHighlight=group.id;}catch{continue;}
    }
  }
  get selectedStitchLines() { return resolvedStitchGroups(this.document).filter(g=>this.stitchSelected.includes(g.id)); }
  get selectedTransfer() { return this.document.stitchTransfers?.find(t=>this.stitchSelected.includes(t.id)); }
  get transferStitchReason() {
    if (!this.stitchSelected.length) return "Select the stitch lines to transfer.";
    if (this.editingStitchHoles) return "Select stitch lines rather than individual holes.";
    if (this.stitchSelected.some(id=>!this.stitchGroups.some(g=>g.id===id))) return "Detach linked transfers before transferring them again.";

    return "";
  }
  beginStitchTransfer() {
    if (this.transferStitchReason || this.busy || this.stitchDraft || this.stitchError) return;
    this.stitchTool="transfer";
    this.stitchOperationSelection=[...this.stitchSelected];
    this.editingStitchHoles=false; this.addingStitchRun=false;
    this.stitchTransferPlacement={placementId:crypto.randomUUID(),groupIds:[...this.stitchSelected],center:{...this.anchorPointer},angle:0,rawAngle:0,phase:"hover"};
    this.stitchHover=null; this.stitchError=""; this.notify();
  }
  get transferSourceCenter(): Point {
    const ids=new Set(this.selectedTransferSources.map(s=>s.id));
    const box=bounds(this.document.shapes.filter(s=>ids.has(s.id)));
    return {x:box.x+box.width/2,y:box.y+box.height/2};
  }
  get selectedTransferSources(): Shape[] {
    const ids=new Set((this.stitchTransferPlacement?.groupIds ?? []).map(id=>this.stitchGroups.find(g=>g.id===id)).filter((g): g is StitchGroup=>!!g).map(g=>stitchPiece(this.document,g).id));
    return this.document.shapes.filter(s=>ids.has(s.id));
  }
  get stitchTransferGhosts(): Shape[] {
    const placement=this.stitchTransferPlacement;
    if(!placement)return [];
    const center=this.transferSourceCenter,angle=placement.angle*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle);
    const matrix={a:c,b:sn,c:-sn,d:c,e:placement.center.x-c*center.x+sn*center.y,f:placement.center.y-sn*center.x-c*center.y};
    return this.selectedTransferSources.map(source=>({...source,id:`stitch-transfer-preview:${source.id}`,rotation:0,transform:multiply(matrix,shapeMatrix(source))}));
  }
  get stitchTransferGhost(): Shape | null { return this.stitchTransferGhosts[0] ?? null; }
  updateStitchTransfer(raw: Point,alt=false) {
    this.queuedTransferPointer=null;
    const placement=this.stitchTransferPlacement;
    if (!placement) return;
    placement.center={...raw};
    this.smartGuides=[];this.snapTarget=null;
    if (!alt) {
      const ghosts=this.stitchTransferGhosts;
      const result=snapRigidMove([...this.document.shapes.filter(s=>!this.selectedTransferSources.some(source=>source.id===s.id) && !s.stitchParentId && !this.isHidden(s.id)),...ghosts],ghosts.map(s=>s.id),{x:0,y:0},{grid:this.grid,objects:this.objects,gridSize:this.gridSize,tolerance:8/this.zoom,guides:this.document.guides});
      placement.center={x:placement.center.x+result.delta.x,y:placement.center.y+result.delta.y};
      this.smartGuides=result.guides;
      if ("target" in result) this.snapTarget=result.target!;
    }
    this.stitchError=""; this.notify();
  }
  private transferPreviewCache: {doc:Doc;key:string;value:ReturnType<Controller["computeTransferPreview"]>} | null=null;
  private transferRenderCache: {doc:Doc;preview:ReturnType<Controller["computeTransferPreview"]>;value:Doc} | null=null;
  get stitchTransferPreview() {
    const p=this.stitchTransferPlacement;
    const key=p ? JSON.stringify([p.placementId,p.groupIds,p.center.x,p.center.y,p.angle]) : "";
    if(this.transferPreviewCache?.doc===this.document && this.transferPreviewCache.key===key)return this.transferPreviewCache.value;
    const value=this.computeTransferPreview();this.transferPreviewCache={doc:this.document,key,value};return value;
  }
  get stitchTransferRenderDocument():Doc {
    if(!this.stitchTransferPlacement)return this.preview ?? this.document;
    const preview=this.stitchTransferPreview;
    if(this.transferRenderCache?.doc===this.document && this.transferRenderCache.preview===preview)return this.transferRenderCache.value;
    const value={...this.document,stitchTransfers:[...(this.document.stitchTransfers ?? []),...preview.transfers]};
    shareReceivingGeometry(this.document,value,preview.transfers);
    this.transferRenderCache={doc:this.document,preview,value};return value;
  }
  private queuedTransferPointer: {placement:NonNullable<Controller["stitchTransferPlacement"]>;point:Point;alt:boolean}|null=null;
  private transferPointerFrame=false;
  queueStitchTransferPointer(point:Point,alt:boolean) {
    if(!this.stitchTransferPlacement || this.stitchTransferPlacement.phase==="placed")return;
    this.queuedTransferPointer={placement:this.stitchTransferPlacement,point,alt};
    if(this.transferPointerFrame)return;
    if(typeof requestAnimationFrame==="undefined"){this.flushTransferPointer();return;}
    this.transferPointerFrame=true;
    requestAnimationFrame(()=>{this.transferPointerFrame=false;this.flushTransferPointer();});
  }
  private flushTransferPointer() {
    const pending=this.queuedTransferPointer;this.queuedTransferPointer=null;
    if(pending?.placement===this.stitchTransferPlacement && pending?.placement.phase!=="placed")this.updateStitchTransfer(pending.point,pending.alt);
  }
  private transferGroupCenter(groupId:string): Point {
    const placement=this.stitchTransferPlacement!,pivot=this.transferSourceCenter;
    const source=pieceFrame(stitchPiece(this.document,this.stitchGroups.find(g=>g.id===groupId)!)).center;
    const a=placement.angle*Math.PI/180,c=Math.cos(a),sn=Math.sin(a),dx=source.x-pivot.x,dy=source.y-pivot.y;
    return {x:placement.center.x+c*dx-sn*dy,y:placement.center.y+sn*dx+c*dy};
  }
  private computeTransferPreview() {
    const placement=this.stitchTransferPlacement;
    if (!placement) return {transfers:[] as StitchTransfer[],results:[] as ReturnType<typeof receivingStitches>[],skipped:[] as string[]};
    const transfers:StitchTransfer[]=[],results:ReturnType<typeof receivingStitches>[]=[],skipped:string[]=[];
    const sourceIds=new Set(this.selectedTransferSources.map(s=>s.id)),box=bounds(this.stitchTransferGhosts);
    for (const target of this.document.shapes) {
      if (sourceIds.has(target.id) || target.stitchParentId || this.isHidden(target.id)) continue;
      const other=bounds([target]);
      if(box.x>other.x+other.width || other.x>box.x+box.width || box.y>other.y+other.height || other.y>box.y+box.height)continue;
      if (!stitchClosed(target) || target.stitchOnly || !stitchEdges(target).length) { skipped.push(`${target.name}: unsupported outline`); continue; }
      if (this.isLocked(target.id)) { skipped.push(`${target.name}: locked`); continue; }
      let included=0;
      for (const groupId of placement.groupIds) {
        try {
          const transfer={...makeTransfer(this.document,groupId,target,this.transferGroupCenter(groupId),placement.angle,placement.placementId),number:Math.max(0,...(this.document.stitchTransfers ?? []).map(t=>t.number ?? 0))+1,id:JSON.stringify([placement.placementId,groupId,target.id])};
          const result=receivingStitches(this.document,transfer);
          if(result.included) { transfers.push(transfer);results.push(result);included+=result.included; }
        } catch (reason) { skipped.push(`${target.name}: ${String(reason)}`); }
      }
      if(!included && !skipped.some(message=>message.startsWith(`${target.name}:`))) skipped.push(`${target.name}: no selected holes inside`);
    }
    return {transfers,results,skipped};
  }
  async placeStitchTransfer() {
    this.flushTransferPointer();
    if (!this.stitchTransferPlacement || this.busy) return;
    if(this.stitchTransferPlacement.phase!=="placed"){this.message="Left-click to place the preview first.";this.notify();return;}
    const preview=this.stitchTransferPreview;
    if (!preview.transfers.length) { this.stitchError=preview.skipped.join("; ") || "No receiving piece contains the selected stitching. Move the preview onto an unlocked closed piece.";this.notify();return; }
    const placement=this.stitchTransferPlacement;
    const next={...this.document,stitchTransfers:[...(this.document.stitchTransfers ?? []),...preview.transfers]};
    const before=this.document,baseline=this.stitchOriginal,originalSettings=this.stitchOriginalSettings;
    if (!(await this.commit(next))) return;
    this.stitchTransferPlacement=null;
    await this.applyStitch();
    if(this.stitchError) {this.document=before;this.stitchOriginal=baseline;this.stitchOriginalSettings=originalSettings;this.stitchSelected=[...placement.groupIds];this.stitchTransferPlacement=placement;this.stitchTool="transfer";this.notify();return;}
    this.stitchSelected=[...placement.groupIds];
    const names=[...new Set(preview.results.map(r=>r.target.name))];
    this.message=`Transferred stitching to ${names.join(", ")}.${preview.skipped.length ? ` Skipped: ${preview.skipped.join("; ")}.` : ""}`;
    this.notify();
  }
  async removeStitchTransfer(id: string,detach=false) {
    const transfer=this.document.stitchTransfers?.find(t=>t.id===id);
    if(!transfer || this.busy || this.isLocked(transfer.targetId))return;
    if(this.stitchMode && !this.stitchTool)this.stitchTool="line";
    try {
      const data=detach ? detachTransfer(this.document,transfer) : {shapes:[],groups:[]};
      if(await this.commit({...this.document,shapes:[...this.document.shapes,...data.shapes],objectTree:[...this.tree,...data.shapes.map(shape=>({kind:"object" as const,id:shape.id}))],stitchTransfers:this.document.stitchTransfers?.filter(t=>t.id!==id),stitchGroups:[...this.stitchGroups,...data.groups]})) this.stitchSelected=data.groups.map(g=>g.id);
    } catch(reason) {this.stitchError=String(reason);}
    this.notify();
  }
  async editStitchPath() {
    const group=this.stitchGroups.find(g=>g.id===this.stitchSelected[0]);
    const shape=this.document.shapes.find(s=>s.id===group?.shapeId);
    if(!shape?.stitchOnly || this.busy || this.stitchError)return;
    this.cancel();this.selected=[shape.id];this.notify();
  }
  escapeStitch() {
    if(this.busy || this.stitchToolPending)return;
    if(this.editingStitchHoles){this.editingStitchHoles=false;this.stitchHoleSelection=[];this.notify();return;}
    if(this.stitchTool || this.stitchTransferPlacement){this.cancelStitchOperation();return;}
    this.cancel();this.notify();
  }
  validateRunHoles(groups: StitchGroup[]) {
    validateRunPositions(groups,this.document.shapes);
  }
  async continueStitchRun() {
    const previous = this.stitchGroups.find(g => g.id === this.stitchSelected[0]);
    if (!previous || previous.holes || this.busy || this.stitchDraft) return;
    const next: StitchGroup = { ...previous, id: crypto.randomUUID(), holeOverrides: undefined, closed: false, continuation: { previousId: previous.id, gap: previous.settings.spacing }, settings: { ...previous.settings, holeCount: 1, alignment: "start", startClearance: 0, endClearance: 0 } };
    try {
      if (await this.commit({ ...this.document, stitchGroups: [...this.stitchGroups,next] })) {
        this.stitchSelected=[next.id]; this.stitchHoleNumber=1; this.stitchHoleNumbers=[1]; this.editingStitchHoles=false; this.addingStitchRun=false;
        try {this.validateRunHoles(this.stitchGroups);}catch(reason){this.stitchError=String(reason);}
      }
    } catch (error) { this.stitchError = String(error); }
    this.notify();
  }
  setContinuationGap(gap: number) {
    const g = this.stitchGroups.find(g => g.id === this.stitchSelected[0]);
    if (!g?.continuation) return;
    if (!Number.isFinite(gap) || gap <= 0) { this.stitchError = "Gap to next hole must be positive."; this.notify(); return; }
    const next = { ...g, continuation: { ...g.continuation, gap } };
    try {
      this.validateRunHoles(this.stitchGroups.map(p => p.id === g.id ? next : p));
      void this.commit({ ...this.document, stitchGroups: this.stitchGroups.map(p => p.id === g.id ? next : p) });
      this.stitchError = "";
    } catch (error) { this.stitchError = String(error); }
    this.notify();
  }
  get convertiblePath() {
    if (this.selected.length !== 1) return undefined;
    return this.document.shapes.find(
      (s) =>
        s.id === this.selected[0] &&
        stitchEdges(s).length > 0 &&
        !s.stitchOnly,
    );
  }
  async convertPathToStitch() {
    const shape = this.convertiblePath;
    if (!this.stitchMode || !shape || this.busy || this.stitchDraft) return;
    if (this.stitchGroups.some((g) => g.shapeId === shape.id)) {
      this.stitchError =
        "Remove existing stitching before converting this path.";
      this.notify();
      return;
    }
    try {
      const group: StitchGroup = {
        id: crypto.randomUUID(),
        shapeId: shape.id,
        edges: stitchEdges(shape).map((e) => e.key),
        side: 1,
        closed: stitchClosed(shape),
        settings: { ...this.stitchSettings, inset: 0 },
      };
      this.stitchGeometry(shape, group);
      const ok = await this.commit({
        ...this.document,
        shapes: this.document.shapes.map((s) =>
          s.id === shape.id ? { ...s, stitchOnly: true } : s,
        ),
        stitchGroups: [...this.stitchGroups, group],
      });
      if (ok) {
        this.stitchSelected = [group.id];
        this.stitchHover = null;
        this.stitchError = "";
      }
    } catch (error) {
      this.stitchError = String(error);
    }
    this.notify();
  }
  get selectionToolsAvailable() {
    return (
      !!this.selected.length &&
      !this.pending.length &&
      !this.drawingDown &&
      (!this.gesture || this.gesture.kind === "pan") &&
      !this.guideDrag &&
      !this.busy
    );
  }
  get canStitch() {
    return (
      this.ready && !this.busy && !this.fileBusy && !this.selectionLocked &&
      (!this.selected.length ||
        this.active.some((shape) => stitchEdges(shape).length > 0))
    );
  }
  activateStitch() {
    if (this.stitchMode) {if(!this.stitchTool)void this.activateStitchTool("line");return;}
    if (!this.canStitch) return;
    this.cancel();
    this.tool = "select";
    this.mode = "select";
    this.editingStitchHoles = false;
    this.stitchHoleSelection=[];this.stitchHoleNumbers=[1];this.stitchTransferHighlight=null;
    this.stitchOriginal = this.document;
    this.stitchOriginalSettings = { ...this.stitchSettings };
    this.stitchMode = true;
    this.stitchTool = "line";
    this.stitchOperationSelection=[];
    this.stitchSelected = [];
    this.notify();
  }
  get stitchGroups() {
    return this.document.stitchGroups ?? [];
  }
  stitchLineAt(raw: Point): StitchGroup | null {
    let closest = 8 / this.zoom,
      target: StitchGroup | null = null;
    for (const group of resolvedStitchGroups(this.document)) {
      const shape = this.document.shapes.find((s) => s.id === group.shapeId);
      if (!shape || this.isHidden(shape.id) || this.isLocked(shape.id)) continue;
      try {
        const geometry = this.stitchGeometry(shape, group), points = geometry.points;
        const pick = group;
        for (const [index,hole] of geometry.holes.entries()) {
          const d=distance(raw,hole.point);
          if(hitStitchHole(group,index,hole,raw,8/this.zoom) && d<closest+Math.max(holeMark(holeAppearance(group,index)).width,holeMark(holeAppearance(group,index)).height)/2){target=pick;closest=Math.min(closest,d);}
        }
        for (let i = 1; i < points.length; i++) {
          const d = distanceToSegment(raw, points[i - 1], points[i]);
          if (d < closest) {
            closest = d;
            target = group;
          }
        }
      } catch {
        /* Invalid geometry remains selectable through its source edge. */
      }
    }
    return target;
  }
  stitchTarget(raw: Point): StitchGroup | null {
    const line = this.stitchLineAt(raw);
    if (line && !this.addingStitchRun) return line;
    const freeSection=this.stitchTool==="line";
    let best = 24 / this.zoom,
      target: StitchGroup | null = null;
    for (const s of this.document.shapes.filter((s) =>
      !this.isHidden(s.id) && !this.isLocked(s.id),
    )) {
      for (const edge of stitchEdges(s))
        for (let i = 1; i < edge.points.length; i++) {
          const a = edge.points[i - 1],
            b = edge.points[i],
            d = distanceToSegment(raw, a, b);
          if (d >= best) continue;
          best = d;
          const existing = this.stitchGroups.find(
            (g) => g.shapeId === s.id && g.edges.includes(edge.key),
          );
          let occupied: StitchGroup | undefined;
          if(freeSection && !this.addingStitchRun)occupied=this.stitchGroups.filter(g=>g.shapeId===s.id && g.edges.includes(edge.key)).find(g=>{
            try {const points=this.stitchGeometry(s,g).points;return points.slice(1).some((b,index)=>{const a=points[index],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=((raw.x-a.x)*dx+(raw.y-a.y)*dy)/(length || 1);return length>1e-12 && t>=0 && t<=1 && distanceToSegment(raw,a,b)<=24/this.zoom;});}catch{return true;}
          });
          target = occupied ?? (this.addingStitchRun || freeSection ? undefined : existing) ?? {
            id: "preview",
            shapeId: s.id,
            edges: [edge.key],
            side: stitchClosed(s)
              ? insideStitchSide(s)
              : worldStitchSide(
                  s,
                  (b.x - a.x) * (raw.y - a.y) - (b.y - a.y) * (raw.x - a.x) >= 0
                    ? 1
                    : -1,
                ),
            settings: { ...this.stitchSettings, ...(this.addingStitchRun || existing ? { holeCount: 1, alignment: "start" as const } : {}) },
            closed: stitchClosed(s) && stitchEdges(s).length === 1,
          };
        }
    }
    return target;
  }
  stitchPlacement(target: StitchGroup, shift: boolean) {
    let next: StitchGroup = { ...target, id: crypto.randomUUID() };
    let absorbed: string[] = [];
    const onOccupiedEdge=this.stitchGroups.some(g=>g.shapeId===target.shapeId && g.edges.some(e=>target.edges.includes(e)));
    if (this.addingStitchRun || onOccupiedEdge) {
      const shape = this.document.shapes.find(s => s.id === next.shapeId)!;
      const path = computeStitches(shape,{...next,settings:{...next.settings,holeCount:undefined,startClearance:0,endClearance:0}}).points;
      let traversed = 0, best = Infinity, start = 0;
      for (let i=1; i<path.length; i++) {
        const a=path[i-1], b=path[i], length=distance(a,b);
        const t=Math.max(0,Math.min(1,((this.anchorPointer.x-a.x)*(b.x-a.x)+(this.anchorPointer.y-a.y)*(b.y-a.y))/((length*length)||1)));
        const point={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)}, d=distance(point,this.anchorPointer);
        if (d<best) { best=d; start=traversed+t*length; }
        traversed+=length;
      }
      next = { ...next, settings: { ...next.settings, startClearance: Math.min(start,Math.max(0,traversed-1e-6)), endClearance:0, alignment:"start", holeCount:1 } };
    }
    if(shift && onOccupiedEdge && this.stitchSelected.length===1) {
      const previous=this.stitchGroups.find(g=>g.id===this.stitchSelected[0])!;
      const shape=this.document.shapes.find(s=>s.id===next.shapeId)!;
      const last=this.stitchGeometry(shape,previous).distances.at(-1)!;
      const gap=(next.settings.startClearance ?? 0)-last;
      if(previous.shapeId!==next.shapeId || JSON.stringify(previous.edges)!==JSON.stringify(next.edges) || gap<=0)throw Error("Continue farther along the same edge, after the selected section.");
      next={...next,continuation:{previousId:previous.id,gap},settings:{...next.settings,spacing:previous.settings.spacing,inset:previous.settings.inset}};
    }
    if (shift && !onOccupiedEdge) {
      const source = this.document.shapes.find((s) => s.id === target.shapeId)!;
      const all = stitchEdges(source).map((e) => e.key),
        index = all.indexOf(target.edges[0]);
      const bridges:string[]=[],bridgeNeighbors:number[]=[];
      for(const direction of [-1,1]) {
        const corner=all[(index+direction+all.length)%all.length];
        const beyond=all[(index+2*direction+all.length)%all.length];
        if(corner?.includes(":corner:") && !this.stitchGroups.some(g=>g.shapeId===source.id && g.edges.includes(corner)) && this.stitchGroups.some(g=>g.shapeId===source.id && g.edges.includes(beyond))){bridges.push(corner);bridgeNeighbors.push(index+2*direction);}
      }
      const adjacent = [index - 1, index + 1,...bridgeNeighbors]
        .filter((i) => stitchClosed(source) || (i >= 0 && i < all.length))
        .map((i) => all[(i + all.length) % all.length]);
      const neighbors = this.stitchGroups.filter(
        (g) =>
          g.shapeId === source.id &&
          (stitchClosed(source) || g.side === target.side) &&
          g.edges.some((k) => adjacent.includes(k)),
      );
      const signature = (g: StitchGroup) =>
        JSON.stringify([
          g.settings.style,
          g.settings.alignment,
          g.settings.spacing,
          g.settings.inset,
          g.settings.startClearance ?? 0,
          g.settings.endClearance ?? 0,
        ]);
      if (
        neighbors.length === 2 &&
        signature(neighbors[0]) !== signature(neighbors[1])
      )
        throw Error(
          "Neighboring stitch lines have different settings. Match their settings before auto-merging.",
        );
      if (neighbors.length) {
        const master =
          this.stitchSelected
            .map((id) => neighbors.find((g) => g.id === id))
            .find((g) => g) ??
          [...neighbors].sort(
            (a, b) => all.indexOf(a.edges[0]) - all.indexOf(b.edges[0]),
          )[0];
        const edges = orderStitchEdges(
          source,
          [...neighbors.flatMap((g) => g.edges), ...bridges, ...target.edges],
          master.edges[0],
        );
        next = {
          ...master,
          edges,
          closed: stitchRunClosed(source,edges),
        };
        this.stitchGeometry(source, next);
        absorbed = neighbors.map((g) => g.id);
      }
    }
    this.stitchGeometry(
      this.document.shapes.find((s) => s.id === next.shapeId)!,
      next,
    );
    return { next, absorbed };
  }
  stitchClick(raw: Point,shift: boolean,alt=false,ctrl=false) {
    this.anchorPointer={...raw};
    if(this.busy || this.stitchToolPending)return;
    const tool=this.stitchTool;
    if(tool && ["link","unlink","merge","split","delete"].includes(tool)) {
      this.document=this.stitchOriginal!;this.stitchSelected=[...this.stitchOperationSelection];
      if(alt)this.stitchLineClick(raw,shift,true,false);
      else {
        const hit=this.stitchLineAt(raw);
        if(hit)this.stitchSelected=shift ? (this.stitchSelected.includes(hit.id) ? this.stitchSelected.filter(id=>id!==hit.id) : [...this.stitchSelected,hit.id]) : [hit.id];
      }
      this.stitchOperationSelection=[...this.stitchSelected];
      void this.previewStitchOperation();return;
    }
    if(tool==="continue" || tool==="convert")return;
    if(!tool)this.stitchTool="line";
    this.stitchLineClick(raw,shift,alt,ctrl);
  }
  private stitchLineClick(raw: Point,shift: boolean,alt=false,ctrl=false) {
    if (this.stitchTransferPlacement) { this.updateStitchTransfer(raw,alt);this.stitchTransferPlacement.phase="placed";this.notify();return; }
    if (this.stitchDraft) { this.stitchError="Apply or cancel invalid settings before changing selection.";this.notify();return; }
    if (alt) {
      const hit=this.stitchLineAt(raw);
      const piece=hit ? (this.document.stitchTransfers?.find(t=>t.id===hit.id) ? this.document.shapes.find(s=>s.id===hit.shapeId) : stitchPiece(this.document,hit)) : [...this.document.shapes].reverse().find(s=>!s.stitchParentId && !this.isHidden(s.id) && !this.isLocked(s.id) && (hitTest(s,raw,8/this.zoom,this.units) || (stitchClosed(s) && materialContains(s,raw))));
      if(piece) {
        const ids=resolvedStitchGroups(this.document).filter(g=>{
          const shape=this.document.shapes.find(s=>s.id===g.shapeId)!;
          return (shape.id===piece.id || shape.stitchParentId===piece.id) && !this.isHidden(shape.id) && !this.isLocked(shape.id);
        }).map(g=>g.id);
        this.stitchSelected=shift ? [...new Set([...this.stitchSelected,...ids])] : ids;
        this.editingStitchHoles=false;this.stitchHoleSelection=[];
      }
      this.notify();return;
    }
    if(ctrl) {
      let nearest=Infinity,picked:{groupId:string;number:number}|undefined;
      for(const group of resolvedStitchGroups(this.document)) {

        const shape=this.document.shapes.find(s=>s.id===group.shapeId)!;
        if(this.isHidden(shape.id)||this.isLocked(shape.id))continue;
        try {this.stitchGeometry(shape,group).holes.forEach((hole,index)=>{const d=distance(raw,hole.point);if(hitStitchHole(group,index,hole,raw,10/this.zoom) && d<nearest){nearest=d;picked={groupId:group.id,number:index+1};}});}catch{continue;}
      }
      if(picked && this.document.stitchTransfers?.some(t=>t.id===picked!.groupId)) {
        this.stitchSelected=[picked.groupId];this.editingStitchHoles=false;this.stitchHoleSelection=[];this.message="This transferred hole follows its source. Detach to edit it independently.";
      } else if(picked) {
        const pickedHole=picked;
        this.stitchHoleSelection=shift ? (this.stitchHoleSelection.some(h=>h.groupId===pickedHole.groupId && h.number===pickedHole.number) ? this.stitchHoleSelection.filter(h=>h.groupId!==pickedHole.groupId || h.number!==pickedHole.number) : [...this.stitchHoleSelection,pickedHole]) : [pickedHole];
        this.editingStitchHoles=this.stitchHoleSelection.length>0;
        this.stitchSelected=[...new Set(this.stitchHoleSelection.map(h=>h.groupId))];
        this.stitchHoleNumber=picked.number;this.stitchHoleNumbers=this.stitchHoleSelection.filter(h=>h.groupId===pickedHole.groupId).map(h=>h.number);
      }
      this.notify();return;
    }
    this.editingStitchHoles=false;this.stitchHoleSelection=[];
    if (this.stitchDraft) {
      this.stitchError =
        "Apply or cancel settings before selecting another line.";
      this.notify();
      return;
    }
    const target = this.stitchTarget(raw);
    if (!target) return;
    if (target.id !== "preview") {
      if (this.stitchSelected[0] !== target.id) { this.stitchHoleNumber=1; this.stitchHoleNumbers=[1]; }
      this.stitchSelected = shift
        ? this.stitchSelected.includes(target.id)
          ? this.stitchSelected.filter((id) => id !== target.id)
          : [...this.stitchSelected, target.id]
        : [target.id];
      this.stitchError = "";
      this.notify();
      return;
    }
    try {
      const { next, absorbed } = this.stitchPlacement(target, shift && !this.addingStitchRun);
      this.validateRunHoles([...this.stitchGroups.filter(g => !absorbed.includes(g.id)),next]);
      void this.commit({
        ...this.document,
        stitchGroups: [
          ...this.stitchGroups.filter((g) => !absorbed.includes(g.id)),
          next,
        ],
      }).then((ok) => {
        if (ok) {
          this.stitchSelected = [next.id];
          this.addingStitchRun = false;
          this.stitchHover = null;
          this.stitchAbsorbed = [];
        }
        this.notify();
      });
      this.stitchError = "";
    } catch (e) {
      this.stitchError = String(e);
      this.notify();
    }
  }
  setStitchSettings(settings: StitchSettings) {
    this.stitchError = "";
    const g = this.stitchGroups.find((g) => g.id === this.stitchSelected[0]);
    if (g) { const placementChanged=["spacing","inset","alignment","holeCount","startClearance","endClearance"].some(key=>settings[key as keyof StitchSettings]!==g.settings[key as keyof StitchSettings]); this.stitchDraft={...g,holes:placementChanged ? undefined : g.holes,settings:{...settings}}; }
    try {
      validateStitchSettings(settings, this.units);
      if (!g) this.stitchSettings = { ...settings };
      if (this.stitchDraft)
        this.stitchGeometry(
          this.document.shapes.find((s) => s.id === g!.shapeId)!,
          this.stitchDraft,
        );
      if (this.stitchDraft) this.validateRunHoles(this.stitchGroups.map(p => p.id === this.stitchDraft!.id ? this.stitchDraft! : p));
      if (this.stitchOriginal && this.stitchDraft) {
        const draft = this.stitchDraft;
        this.stitchSettings = { ...draft.settings };
        this.document = parseProject(
          JSON.stringify({
            ...this.document,
            stitchGroups: this.stitchGroups.map((g) =>
              g.id === draft.id ? draft : g,
            ),
          }),
        );
        this.stitchDraft = null;
      }
    } catch (e) {
      this.stitchError = String(e);
    }
    this.notify();
  }
  async applyStitch() {
    if(this.stitchTransferPlacement){await this.placeStitchTransfer();return;}
    if (this.selectionLocked || this.stitchToolPending || !this.stitchTool) return;
    if (this.stitchOriginal) {
      if (this.busy || this.stitchError) return;
      const draft = this.stitchDraft;
      const next = draft
        ? {
            ...this.document,
            stitchGroups: this.stitchGroups.map((g) =>
              g.id === draft.id ? draft : g,
            ),
          }
        : this.document;
      try {
        if (draft)
          this.stitchGeometry(
            next.shapes.find((s) => s.id === draft.shapeId)!,
            draft,
          );
      } catch (error) {
        this.stitchError = String(error);
        this.notify();
        return;
      }
      const defaults = { ...(draft?.settings ?? this.stitchSettings) };
      const original=this.stitchOriginal, originalSettings=this.stitchOriginalSettings, selected=[...this.stitchSelected], operation=this.stitchTool, operationSelection=[...this.stitchOperationSelection];
      this.cancel();
      if (!(await this.commit(next))) {
        this.document=next; this.stitchOriginal=original; this.stitchOriginalSettings=originalSettings;
        this.stitchMode=true; this.stitchTool=operation;this.stitchOperationSelection=operationSelection;this.stitchSelected=selected; this.stitchError=this.message || "The stitching session could not be applied.";
        this.notify(); return;
      }
      this.stitchSettings = defaults;
      this.activateStitch();
      this.stitchTool=null;this.stitchSelected=selected.filter(id=>resolvedStitchGroups(this.document).some(g=>g.id===id));
      this.notify();
      return;
    }
  }
  get canUnlinkStitches(): boolean {
    return (this.document.stitchLinks ?? []).some(link =>
      link.members.some(id => this.stitchSelected.includes(id)));
  }
  get stitchHoleInfo(): string {
    const id = this.stitchSelected[0];
    if (!id) return "";
    const count = (member: string) => {
      const group = this.stitchDraft?.id === member ? this.stitchDraft : this.stitchGroups.find(g => g.id === member);
      if (!group) throw Error("Missing stitch line");
      const shape = (this.preview ?? this.document).shapes.find(s => s.id === group.shapeId);
      if (!shape) throw Error("Missing shape");
      return this.stitchGeometry(shape, group).holes.length;
    };
    try {
      const holes = count(id);
      let info = `${holes} ${holes === 1 ? "hole" : "holes"}`;
      const link = (this.document.stitchLinks ?? []).find(link => link.members.includes(id));
      if (link?.members.length === 2) {
        try {
          const difference = holes - count(link.members.find(member => member !== id)!);
          if (difference) info += ` · ${Math.abs(difference)} ${difference < 0 ? "missing" : "too many"}`;
        } catch { /* The other member has no count to compare. */ }
      }
      return info;
    } catch {
      return "Hole count unavailable";
    }
  }
  get stitchLinkReason(): string {
    const ids = new Set(this.stitchSelected);
    for (const link of this.document.stitchLinks ?? [])
      if (link.members.some(id => ids.has(id))) for (const id of link.members) ids.add(id);
    if (ids.size < 2) return "Select at least two stitch lines.";
    try {
      const counts = [...ids].map(id => {
        const g = this.stitchGroups.find(g => g.id === id)!;
        return this.stitchGeometry(this.document.shapes.find(s => s.id === g.shapeId)!, g).holes.length;
      });
      return new Set(counts).size === 1 ? "" : "Linked lines must have the same number of holes.";
    } catch {
      return "Linked lines must have valid stitch geometry.";
    }
  }
  async linkStitches(unlink = false) {
    if (this.busy || this.stitchDraft || (unlink && !this.canUnlinkStitches)) return;
    const selected = new Set(this.stitchSelected);
    const links = this.document.stitchLinks ?? [];
    const touched = links.filter(l => l.members.some(id => selected.has(id)));
    if (!unlink) for (const l of touched) for (const id of l.members) selected.add(id);
    try {
      if (!unlink && this.stitchLinkReason) throw Error(this.stitchLinkReason);
      const remaining = links
        .map(link => ({
          ...link,
          members: link.members.filter(id => !selected.has(id)),
        }))
        .filter(link => link.members.length >= 2);
      if (!unlink) {
        remaining.push({
          id: touched.length
            ? Math.min(...touched.map(link => link.id))
            : Math.max(0, ...links.map(link => link.id)) + 1,
          members: [...selected],
        });
      }
      if (!(await this.commit({ ...this.document, stitchLinks: remaining }))) return;
      this.stitchError = "";
    } catch (error) {
      this.stitchError = String(error);
    }
    this.notify();
  }
  remapHoleOverrides(s: Shape, sources: StitchGroup[], targets: StitchGroup[]) {
    for (const target of targets) target.holeOverrides = {};
    for (const source of sources) {
      const holes = this.stitchGeometry(s, source).holes;
      for (const [number, settings] of Object.entries(source.holeOverrides ?? {})) {
        const hole = holes[Number(number) - 1];
        if (!hole) throw Error("Restore out-of-range overridden holes before changing stitch topology.");
        let best: { group: StitchGroup; number: string; distance: number } | undefined;
        for (const target of targets) this.stitchGeometry(s, target).holes.forEach((candidate, index) => {
          const distance = Math.hypot(candidate.point.x - hole.point.x, candidate.point.y - hole.point.y);
          if (!best || distance < best.distance) best = { group: target, number: String(index + 1), distance };
        });
        if (!best) throw Error("No resulting hole can retain this override.");
        const previous = best.group.holeOverrides![best.number];
        if (previous && JSON.stringify(previous) !== JSON.stringify(settings)) throw Error("Two different hole overrides would occupy the same hole.");
        best.group.holeOverrides![best.number] = settings;
      }
    }
  }
  async mergeStitches() {
    if (this.stitchSelected.length < 2 || this.stitchDraft || this.busy)
      return;
    try {
      const sources = this.stitchSelected.map((id) =>
        this.stitchGroups.find((g) => g.id === id)!,
      );
      const master=sources[0];
      if (!master || sources.some(g=>!g || g.shapeId!==master.shapeId))
        throw Error("Select at least two connected lines on the same shape.");
      if (sources.some(g=>g.settings.holeCount || g.holes)) throw Error("Only full-length edge lines can be merged. Counted runs stay independently adjustable.");
      const receivers=(this.document.stitchTransfers ?? []).filter(t => this.stitchSelected.includes(t.masterId)).map(t=>t.targetId);
      if (new Set(receivers).size !== receivers.length) throw Error("Both lines have a receiving assignment on the same piece. Remove one assignment before merging.");
      const s = this.document.shapes.find((s) => s.id === master.shapeId)!;
      if (!stitchClosed(s) && sources.some(g=>g.side!==master.side))
        throw Error("Stitch lines must use the same side.");
      let edges=[...master.edges];
      for(const group of sources.slice(1))edges=orderStitchEdges(s,[...edges,...group.edges],master.edges[0]);
      const merged = {
        ...master,
        edges,
        closed: stitchRunClosed(s,edges),
      };
      this.remapHoleOverrides(s, sources, [merged]);
      this.stitchGeometry(s, merged);
      await this.commit({
        ...this.document,
        stitchTransfers: this.document.stitchTransfers?.map(t => this.stitchSelected.includes(t.masterId) ? { ...t, masterId:master.id } : t),
        stitchGroups: this.stitchGroups
          .filter((g) => g.id===master.id || !this.stitchSelected.includes(g.id))
          .map((g) => (g.id === master.id ? merged : g)),
      });
      this.stitchSelected = [master.id];
      this.stitchError = "";
    } catch (e) {
      this.stitchError = String(e);
    }
    this.notify();
  }
  async splitStitches(junction?: number) {
    const g = this.stitchGroups.find((g) => g.id === this.stitchSelected[0]);
    if (!g || this.stitchDraft || this.busy) return;
    if (g.settings.holeCount || g.holes) { this.stitchError = "Only full-length edge lines can be split."; this.notify(); return; }
    let runs: string[][];
    if (junction === undefined) runs = g.edges.map((k) => [k]);
    else if (g.closed)
      runs = [[...g.edges.slice(junction), ...g.edges.slice(0, junction)]];
    else
      runs = [g.edges.slice(0, junction), g.edges.slice(junction)].filter(
        (r) => r.length,
      );
    const groups = runs.map((edges, i) => ({
      ...g,
      id: i ? crypto.randomUUID() : g.id,
      edges,
      closed: false,
    }));
    try { this.remapHoleOverrides(this.document.shapes.find(s => s.id === g.shapeId)!, [g], groups); }
    catch (error) { this.stitchError = String(error); this.notify(); return; }
    await this.commit({
      ...this.document,
      stitchTransfers: this.document.stitchTransfers?.flatMap(t => t.masterId === g.id ? groups.map((run,index) => ({ ...t, id:index ? crypto.randomUUID() : t.id, masterId:run.id })) : [t]),
      stitchLinks: (this.document.stitchLinks ?? []).map(l => ({...l, members: l.members.filter(id => id !== g.id)})).filter(l => l.members.length >= 2),
      stitchGroups: [
        ...this.stitchGroups.filter((x) => x.id !== g.id),
        ...groups,
      ],
    });
    this.stitchSelected = [groups[0].id];
    this.notify();
  }
  async deleteStitchSelection() {
    if(this.busy || this.stitchToolPending)return;
    if(this.editingStitchHoles){this.message="Select a stitch line before deleting stitching.";this.notify();return;}
    const selected=[...this.stitchSelected];
    this.resetStitchOperation();
    this.stitchSelected=selected.filter(id=>this.stitchGroups.some(g=>g.id===id));
    if(!this.stitchSelected.length){this.notify();return;}
    this.stitchTool="line";
    try {await this.deleteStitches();await this.applyStitch();}
    catch(reason){this.stitchError=String(reason);this.notify();}
  }
  async deleteStitches() {
    if(this.stitchTransferPlacement){this.escapeStitch();return;}
    if (this.busy) return;
    let remaining = this.stitchGroups.filter(g => !this.stitchSelected.includes(g.id));
    remaining = remaining.map(g => {
      if (!g.continuation || remaining.some(p => p.id === g.continuation!.previousId)) return g;
      return resolveStitchRun(this.document.shapes.find(s => s.id === g.shapeId)!, g, this.stitchGroups);
    });
    await this.commit({
      ...this.document,
      shapes: this.document.shapes.filter(
        (s) => !s.stitchOnly || remaining.some((g) => g.shapeId === s.id),
      ),
      stitchGroups: remaining,
    });
    this.stitchSelected = [];
    this.stitchDraft = null;
    this.notify();
  }
  async insertImage(image: ImportedImage) {
    this.cancel();
    const scale = Math.min(this.width / image.width, this.height / image.height) / this.zoom / 2;
    const width = image.width * scale, height = image.height * scale;
    const x = (this.width / 2 - this.pan.x) / this.zoom;
    const y = (this.height / 2 - this.pan.y) / this.zoom;
    const id = crypto.randomUUID();
    const shape: Shape = {
      id, name: image.name, kind: "image", image: image.data,
      points: [{ x: x - width / 2, y: y - height / 2 },
        { x: x + width / 2, y: y + height / 2 }],
      radius: 0, rotation: 0, fillOpacity: 1,
    };
    if (await this.commit({ ...this.document,
      shapes: [shape, ...this.document.shapes],
      objectTree: [...this.tree, { id, kind: "object" }],
    })) {
      this.setMode("select");
      this.selected = [id];
      this.notify();
    }
  }
  normalizeTree(document: Doc): Doc {
    const objectTree = reconcileObjectTree(document.objectTree ?? objectTreeFromShapes(document.shapes), document.shapes);
    return { ...document, objectTree, shapes: treeInDrawingOrder(objectTree, document.shapes) };
  }
  private canCommitFromView(document: Doc) {
    const sources = (doc: Doc) => fingerprint({ ...doc, printLayouts: [] });
    if (this.printLayoutActive && sources(document) !== sources(this.document)) {
      this.fail(Error("Edit source geometry on Model"));
      return false;
    }
    return true;
  }
  async commit(document: Doc) {
    if (this.pathCopy && document !== this.preview) this.cancel();
    if (this.offsetActive) this.cancel();
    try {
      if (!this.canCommitFromView(document)) return false;
      document = reconcilePrintLayouts(this.normalizeTree(reconcileStitches(document,this.document)));
    } catch (error) {
      this.preview = null;
      this.fail(error);
      return false;
    }
    if (this.stitchOriginal) {
      try {
        this.document = parseProject(
          JSON.stringify(this.normalizeTree(reconcileStitches(document, this.document))),
        );
        this.notify();
        return true;
      } catch (error) {
        this.stitchError = String(error);
        this.notify();
        return false;
      }
    }
    try {
      const validated = parseProject(
        JSON.stringify(this.normalizeTree(reconcileStitches(document, this.document))),
      );
      this.pendingDocument = validated;
      await this.transact("commit", validated);
      if (this.pendingDocument === validated) this.pendingDocument = null;
      return true;
    } catch (e) {
      this.pendingDocument = null;
      this.preview = null;
      this.fail(e);
      return false;
    }
  }
  async validatePreview(document: Doc) {
    this.queuedPreview = reconcileStitches(this.normalizeTree(document), this.document);
    if (this.previewRunning) return;
    this.previewRunning = true;
    try {
      while (this.queuedPreview && (this.gesture || this.transformTool)) {
        const next = this.queuedPreview;
        this.queuedPreview = null;
        const id = ++this.previewId;
        const generation = this.transformGeneration;
        try {
          const s = await this.core.request("preview", this.revision, next);
          if (
            id === this.previewId &&
            s.revision === this.revision &&
            (this.gesture || this.transformTool) &&
            generation === this.transformGeneration &&
            !this.queuedPreview
          ) {
            this.preview = s.document;
            this.notify();
          }
        } catch (e) {
          if (
            id === this.previewId &&
            !this.queuedPreview &&
            generation === this.transformGeneration &&
            this.transformTool
          ) {
            this.transformError = String(e);
            this.notify();
          }
        }
      }
    } finally {
      this.previewRunning = false;
      this.queuedPreview = null;
    }
  }

  measurementSections = 1;
  polygonSides = 3;
  adjustConstructionCount(delta: number) {
    if (this.mode === "measurement") {
      this.measurementSections = Math.max(1, Math.min(100, this.measurementSections + delta));
      this.notify();
      return;
    }
    this.polygonSides = Math.max(3, Math.min(100, this.polygonSides + delta));
    this.message = "Ready";
    this.notify();
  }
  setTool(tool: Mode | Tool) {
    this.setMode(tool === "line" ? "polyline" : (tool as Mode));
  }
  setMode(mode: Mode) {
    if (this.printLayoutActive && mode !== "select") return;
    this.cancel();
    this.mode = mode;
    this.tool =
      isIndicator(mode) || mode === "measurement" || mode === "text"
        ? mode
        : mode === "select"
          ? "select"
          : isCurveMode(mode)
            ? (mode as "curve" | "control-curve")
            : mode === "polyline" || mode.startsWith("polygon")
              ? "polyline"
              : mode.startsWith("rectangle")
                ? "rectangle"
                : mode.startsWith("ellipse")
                  ? "ellipse"
                  : mode.startsWith("arc")
                    ? "arc"
                    : "circle";
    if ((variants.measurement as readonly string[]).includes(mode)) this.lastMeasurement = mode;
    if ((variants.drawing as readonly string[]).includes(mode)) this.lastDrawing = mode;
    if ((variants.polygon as readonly string[]).includes(mode))
      this.lastPolygon = mode;
    if ((variants.polyline as readonly string[]).includes(mode))
      this.lastPolyline = mode;
    if ((variants.rectangle as readonly string[]).includes(mode))
      this.lastRectangle = mode;
    if ((variants.circle as readonly string[]).includes(mode))
      this.lastCircle = mode;
    this.message = "Ready";
    this.notify();
  }
  cycle(group: keyof typeof variants, direction = 1) {
    const list = variants[group] as readonly Mode[],
      current = list.indexOf(this.mode);
    this.setMode(
      current < 0
        ? group === "measurement" ? this.lastMeasurement : group === "drawing" ? this.lastDrawing : group === "rectangle"
          ? this.lastRectangle
          : group === "circle"
            ? this.lastCircle
            : group === "polyline"
              ? this.lastPolyline
              : this.lastPolygon
        : list[(current + direction + list.length) % list.length],
    );
  }
  polylineClick(count: number) {
    if (this.mode !== "polyline" && !isCurveMode(this.mode)) return;
    if (count === 1) {
      this.doubleClickBase = [...this.beforeClick];
      this.doubleClickClosed = !this.pending.length;
      this.doubleClickHandles = this.pendingHandles.slice(
        0,
        this.beforeClick.length,
      );
    }
    if (count === 2 && this.doubleClickClosed) {
      this.pending = [];
      this.notify();
      return;
    }
    if (count === 2 && this.pending.length) {
      this.pending = [...this.doubleClickBase];
      this.pendingHandles = [...this.doubleClickHandles];
      this.closePolyline();
    }
  }
  closePolyline() {
    if (this.pending.length < 3) {
      this.message = "Place at least three anchors before closing a path";
      this.notify();
      return;
    }
    if (this.mode === "control-curve")
      this.pendingHandles = [...this.pendingHandles, this.pendingHandles[0]];
    this.finish([...this.pending, this.pending[0]]);
  }
  measurementLocks: Record<string, number> = {};
  get measurementFields() {
    if (!this.pending.length || this.mode === "select" || this.mode === "text")
      return [];
    if (this.mode === "measurement" && this.pending.length === 2) return ["Offset"];
    if (
      ["size-square", "rectangle", "rectangle-center", "ellipse", "polygon-box"].includes(
        this.mode,
      )
    )
      return ["Width", "Height"];
    if (this.mode === "arc" && this.pending.length === 2) return ["Sweep"];
    if (
      ["rectangle-three", "ellipse-center"].includes(this.mode) &&
      this.pending.length === 2
    )
      return ["Height"];
    return [
      this.mode === "circle" || this.mode === "polygon" || this.mode === "arc"
        ? "Radius"
        : this.mode === "circle-two"
          ? "Diameter"
          : this.mode === "ellipse-center"
            ? "Width"
            : "Length",
      "Angle",
    ];
  }
  measurementValue(key: string) {
    const a = this.pending.at(-1)!;
    const resolved = this.constrainMeasurement(this.cursor);
    const dx = resolved.x - a.x,
      dy = resolved.y - a.y;
    if (key === "Sweep") return this.arcSweep;
    if (key === "Angle") return (Math.atan2(dy, dx) * 180) / Math.PI;
    if (this.measurementFields.length === 1) {
      const [a, b] = this.pending;
      const length = distance(a, b);
      return (
        (((this.cursor.x - a.x) * -(b.y - a.y) +
          (this.cursor.y - a.y) * (b.x - a.x)) /
          length) *
        (this.mode === "ellipse-center" ? 2 : 1)
      );
    }
    const factor = this.mode === "rectangle-center" ? 2 : 1;
    return key === "Width" && this.mode !== "ellipse-center"
      ? Math.abs(dx) * factor
      : key === "Height"
        ? Math.abs(dy) * factor
        : Math.hypot(dx, dy) * (this.mode === "ellipse-center" ? 2 : 1);
  }
  constrainMeasurement(p: Point): Point {
    if (!this.pending.length) return p;
    const locks = this.measurementLocks;
    const a = this.pending.at(-1)!;
    if (this.measurementFields.includes("Sweep")) {
      if (locks.Sweep !== undefined) this.arcSweep = locks.Sweep;
      return p;
    }
    if (this.measurementFields.length === 1) {
      const offset = this.mode === "measurement" ? locks.Offset : locks.Height;
      if (offset === undefined) return p;
      const [a, b] = this.pending,
        len = distance(a, b);
      const h = offset / (this.mode === "ellipse-center" ? 2 : 1);
      return {
        x: a.x - ((b.y - a.y) / len) * h,
        y: a.y + ((b.x - a.x) / len) * h,
      };
    }
    if (!Object.keys(locks).length) return p;
    let dx = p.x - a.x,
      dy = p.y - a.y;
    if (this.measurementFields.includes("Height")) {
      const square =
        (this.mode === "size-square" || this.drawingShift) &&
        ["size-square", "rectangle", "rectangle-center"].includes(this.mode);
      const width = locks.Width ?? (square ? locks.Height : undefined);
      const height = locks.Height ?? (square ? locks.Width : undefined);
      const factor = this.mode === "rectangle-center" ? 2 : 1;
      if (width !== undefined)
        dx = (Math.sign((locks._x ?? dx) || 1) * width) / factor;
      if (height !== undefined)
        dy = (Math.sign((locks._y ?? dy) || 1) * height) / factor;
    } else {
      const key = this.measurementFields[0];
      const r =
        locks[key] !== undefined
          ? locks[key] / (this.mode === "ellipse-center" ? 2 : 1)
          : Math.hypot(dx, dy);
      const angle =
        locks.Angle !== undefined
          ? (locks.Angle * Math.PI) / 180
          : Math.atan2(dy, dx);
      dx = r * Math.cos(angle);
      dy = r * Math.sin(angle);
    }
    return { x: a.x + dx, y: a.y + dy };
  }
  confirmMeasurement() {
    if (Object.values(this.measurementLocks).some((v) => !Number.isFinite(v)))
      return;
    this.addPoint(this.constrainMeasurement(this.cursor));
  }
  drawingPoint(raw: Point, alt: boolean, shift: boolean): Point {
    this.drawingShift = shift;
    if (
      shift &&
      this.pending.length === 1 &&
      ["size-square", "rectangle", "rectangle-center", "ellipse", "polygon-box"].includes(
        this.mode,
      )
    ) {
      const a = this.pending[0];
      const size = Math.max(Math.abs(raw.x - a.x), Math.abs(raw.y - a.y));
      this.smartGuides = [];
      this.snapTarget = null;
      return {
        x: a.x + (raw.x < a.x ? -size : size),
        y: a.y + (raw.y < a.y ? -size : size),
      };
    }
    const angleAnchor = this.pending[0] ?? this.drawingDown?.point;
    if (shift && angleAnchor && this.pending.length <= 1 &&
      ["arrow", "arrow-head", "crosshair", "size-ruler", "measurement"].includes(this.mode)) {
      const theta = Math.round(Math.atan2(raw.y-angleAnchor.y,raw.x-angleAnchor.x)/(Math.PI/4))*Math.PI/4;
      const radius = distance(angleAnchor,raw);
      const point = {x:angleAnchor.x+radius*Math.cos(theta),y:angleAnchor.y+radius*Math.sin(theta)};
      const snapped = this.snap(point,alt);
      if (Math.abs((snapped.x-angleAnchor.x)*Math.sin(theta)-(snapped.y-angleAnchor.y)*Math.cos(theta)) < 1e-7) return snapped;
      this.smartGuides=[]; this.snapTarget=null; this.snapKind=null;
      return point;
    }
    if (
      shift &&
      this.pending.length &&
      (this.mode === "polyline" ||
        isCurveMode(this.mode) ||
        (this.pending.length === 1 &&
          [
            "circle",
            "circle-two",
            "polygon",
            "ellipse-center",
            "arc",
            "arc-three",
          ].includes(this.mode)))
    ) {
      const a = this.pending[this.pending.length - 1],
        theta =
          (Math.round(Math.atan2(raw.y - a.y, raw.x - a.x) / (Math.PI / 4)) *
            Math.PI) /
          4,
        r = distance(a, raw),
        p = { x: a.x + r * Math.cos(theta), y: a.y + r * Math.sin(theta) },
        q = this.snap(p, alt);
      if (
        Math.abs(
          (q.x - a.x) * Math.sin(theta) - (q.y - a.y) * Math.cos(theta),
        ) < 1e-7
      )
        return q;
      this.smartGuides = [];
      this.snapTarget = null;
      return p;
    }
    return this.snap(raw, alt);
  }
  addPoint(p: Point) {
    p = this.constrainMeasurement(p);
    if (this.mode === "measurement" && this.pending.length === 1 &&
        distance(p, this.pending[0]) < 1e-9) {
      this.message = "Choose distinct measurement endpoints";
      this.notify();
      return;
    }
    this.measurementLocks = {};
    if (isCurveMode(this.mode)) {
      if (!this.pending.length || distance(p, this.pending.at(-1)!) > 1e-9) {
        this.pending.push(p);
        this.pendingHandles.push(zeroHandles());
      }
      this.message = "Ready";
      this.notify();
      return;
    }
    if (!this.pending.length) this.pending = [p];
    else if (this.mode === "polyline") {
      if (
        this.pending.length >= 3 &&
        distance(p, this.pending[0]) < 8 / this.zoom
      )
        this.finish([...this.pending, this.pending[0]]);
      else this.pending = [...this.pending, p];
    } else if (this.pending.length + 1 === pointCount(this.mode))
      this.finish([...this.pending, p]);
    else this.pending = [...this.pending, p];
    if (this.pending.length) this.message = "Ready";
    this.notify();
  }
  get constructionPreview(): Shape | null {
    if (
      (!this.pending.length && !(isCurveMode(this.mode) && this.drawingDown)) ||
      this.mode === "select"
    )
      return null;
    try {
      if (isCurveMode(this.mode)) {
        const d = this.drawingDown;
        const p = d?.point ?? this.constrainMeasurement(this.cursor);
        const points = this.pending.length ? [...this.pending, p] : [p, p];
        const shape = construct(this.mode, points);
        if (this.mode === "control-curve") {
          const v = d
            ? { x: this.cursor.x - p.x, y: this.cursor.y - p.y }
            : { x: 0, y: 0 };
          const h = mirroredHandles(v);
          shape.handles = this.pending.length
            ? [...this.pendingHandles, h]
            : [h, h];
        }
        return shape;
      }
      return construct(
        this.mode,
        [...this.pending, this.constrainMeasurement(this.cursor)],
        this.mode === "arc" ? this.arcSweep : undefined,
        this.polygonSides,
        this.measurementSections,
      );
    } catch {
      return null;
    }
  }
  beginProperty() {
    if (this.selectionLocked) return;
    if (this.transformTool || this.stitchMode || this.booleanOperation) return;
    if (!this.propertySession)
      this.propertySession = {
        original: this.pendingDocument ?? this.document,
        next: this.pendingDocument ?? this.document,
      };
  }
  async finishProperty(cancel = false) {
    const session = this.propertySession;
    if (!session) return;
    this.propertySession = null;
    this.previewId++;
    this.preview = null;
    if (!cancel) await this.commit(session.next);
    else this.notify();
  }

  get canEditCorners() {
    return this.active.some((s) => cornerPoints(s).length > 0);
  }
  mirrorAxis: string | null = null;
  mirrorHover: { axis: string; line: [Point, Point] } | null = null;
  mirrorLine: [Point, Point] | null = null;
  mirrorTargetAt(point: Point) {
    const pivot = this.transformPivot;
    const candidates: { axis: string; line: [Point, Point]; distance: number }[] = [];
    for (const shape of [...(this.transformOriginal?.shapes ?? [])].filter(s => !this.isHidden(s.id)).reverse()) {
      for (const line of boundary(shape).lines) {
        if (distance(...line) > 1e-9)
          candidates.push({ axis: "edge", line, distance: distanceToSegment(point, ...line) });
      }
    }
    if (distance(point, pivot) > 8 / this.zoom) {
      for (const [axis, degrees] of [["x", 0], ["y", 90], ["positive", 45], ["negative", -45]] as const) {
        const angle = (degrees + this.transformAngle) * Math.PI / 180;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        candidates.push({ axis, line: [pivot, { x: pivot.x + dx, y: pivot.y + dy }],
          distance: Math.abs((point.x-pivot.x)*dy-(point.y-pivot.y)*dx) });
      }
    }
    return candidates.filter(c => c.distance <= 8 / this.zoom).sort((a,b) => a.distance-b.distance)[0] ?? null;
  }
  setMirrorAxis(axis: string) {
    this.mirrorAxis = axis;
    this.mirrorLine = null;
    this.refreshMirror();
  }
  refreshMirror() {
    if (!this.transformOriginal || !this.mirrorAxis) return;
    if (this.mirrorAxis === "edge" && !this.mirrorLine) {
      this.preview = null;
      this.transformDraft = null;
      this.transformError = "Choose a straight edge.";
      this.notify();
      return;
    }
    const line = this.mirrorLine;
    const angle = line
      ? Math.atan2(line[1].y - line[0].y, line[1].x - line[0].x) * 180 / Math.PI
      : this.transformAngle + ({ x: 0, y: 90, positive: 45, negative: -45 }[this.mirrorAxis] ?? 0);
    const pivot = line ? line[0] : this.transformPivot;
    this.updateTransformPreview({
      ...this.transformOriginal,
      shapes: this.transformOriginal.shapes.map(s => this.selected.includes(s.id)
        ? stretchShape(s, 1, -1, pivot, angle) : s),
    });
  }
  async activateTransform(tool: "move" | "rotate" | "scale" | "mirror" | "corner") {
    if (this.selectionLocked) return;
    if (!this.ready || this.busy || !this.selected.length) return;
    if (tool === "corner" && !this.canEditCorners) return;
    if (this.propertySession) await this.finishProperty();
    this.cancel();
    this.tool = "select";
    this.mode = "select";
    this.transformTool = tool;
    this.transformOriginal = this.document;
    this.transformValues = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };
    if (tool !== "corner") this.resetPivot();
    else this.selectedCorner = null;
    if (tool === "mirror") { this.mirrorAxis = null; this.mirrorLine = null; this.mirrorHover = null; }
    this.notify();
  }
  async applyTransform() {
    if (!this.transformValid || !this.transformTool || this.busy) return;
    const next = this.transformDraft ?? this.preview;
    this.cancel();
    if (next && fingerprint(next) !== fingerprint(this.document))
      await this.commit(next);
  }
  private duplicateAlongPath(document: Doc, initialIds: Set<string>, matrix: Parameters<typeof transformShape>[1]): Doc {
    const data=copyStitchData(document,initialIds,true);
    const originals=[...document.shapes.filter(s=>initialIds.has(s.id) || !!s.stitchParentId && initialIds.has(s.stitchParentId)),...data.shapes];
    const ids=new Map(originals.map(s=>[s.id,crypto.randomUUID()]));
    const copies=originals.map(s=>({...transformShape(s,matrix),id:ids.get(s.id)!,name:`${s.name} copy`,locked:false,stitchParentId:s.stitchParentId ? ids.get(s.stitchParentId) : undefined}));

    const chosen = new Set([...initialIds,...originals.filter(s=>s.stitchParentId).map(s=>s.id)]);
    function copyNode(n: ObjectNode): ObjectNode {
      return n.kind === "object" ? { ...n, id: ids.get(n.id)! } :
        { ...n, id: crypto.randomUUID(), name: `${n.name} copy`, locked: false, children: n.children.map(copyNode) };
    }
    function duplicateNodes(nodes: ObjectNode[]): ObjectNode[] {
      return nodes.flatMap(n => chosen.has(n.id) ? [copyNode(n), n] :
        [n.kind === "group" ? { ...n, children: duplicateNodes(n.children) } : n]);
    }
    const {groups,transfers}=data;
    const groupIds = new Map(groups.map(g => [g.id,crypto.randomUUID()]));
    return {
      ...document, shapes:[...document.shapes,...copies], objectTree:[...duplicateNodes((document.objectTree ?? objectTreeFromShapes(document.shapes))),...data.shapes.map(s=>({kind:"object" as const,id:ids.get(s.id)!}))],
      stitchLinks:[...(document.stitchLinks ?? []),...(document.stitchLinks ?? []).map((l,index)=>({...l,id:Math.max(0,...(document.stitchLinks ?? []).map(l=>l.id))+index+1,members:l.members.filter(id=>groupIds.has(id)).map(id=>groupIds.get(id)!)})).filter(l=>l.members.length>=2)],
      stitchGroups:[...(document.stitchGroups ?? []),...groups.map(g => ({ ...g,id:groupIds.get(g.id)!,shapeId:ids.get(g.shapeId)!,continuation:g.continuation ? { ...g.continuation,previousId:groupIds.get(g.continuation.previousId)! } : undefined }))],
      stitchTransfers:[...(document.stitchTransfers ?? []),...copyTransferPlacements(document.stitchTransfers ?? [],transfers.map(t => ({ ...t,id:crypto.randomUUID(),masterId:groupIds.get(t.masterId) ?? t.masterId,targetId:ids.get(t.targetId)! })))],
    };
  }
  pathCopy: { source: string; path: string; picker: 'source' | 'path' | null; mode: 'spacing' | 'count'; spacing: number; count: number; rotate: boolean; error: string } | null = null;
  private pathCopySelection: string[] = [];
  get canCopyAlongPath() { return this.ready && !this.printLayoutActive && !this.selectedGroups.length && this.active.length === 1 && !this.isHidden(this.active[0].id) && !this.selectionLocked && !this.busy; }
  activatePathCopy() {
    if (!this.canCopyAlongPath) return;
    const source = this.active[0].id;
    this.cancel();
    this.pathCopySelection = [...this.selected];
    this.tool = "select";
    this.mode = "select";
    this.pathCopy = { source, path: '', picker: 'path', mode: 'spacing', spacing: 10, count: 5, rotate: true, error: '' };
    this.notify();
  }
  pickPathCopy(id: string) {
    const state = this.pathCopy;
    if (!state?.picker || this.busy) return;
    if (this.isHidden(id) || this.isLocked(id)) { state.error = 'Choose a visible, unlocked object.'; this.notify(); return; }
    if (state.picker === 'source') { state.source = id; state.picker = 'path'; }
    else { state.path = id; state.picker = null; }
    this.refreshPathCopy();
  }
  refreshPathCopy() {
    this.preview = null;
    const state = this.pathCopy;
    if (!state) return;
    state.error = '';
    if (!state.path || state.picker) { this.notify(); return; }
    try {
      const source = this.document.shapes.find(s => s.id === state.source)!;
      const path = this.document.shapes.find(s => s.id === state.path)!;
      if (this.isHidden(state.source) || this.isLocked(state.source) || this.isHidden(state.path) || this.isLocked(state.path)) throw Error('Choose visible, unlocked objects.');
      if (!source || !path || source.id === path.id) throw Error('Choose distinct source and path objects.');
      if (isIndicator(path.kind) || path.kind === 'text' || path.kind === 'measurement' || path.kind === 'compound') throw Error('Choose a single open or closed outline.');
      const matrices = pathPlacements(path, state.mode, state.mode === 'spacing' ? state.spacing : state.count, state.rotate, center(source));
      let next = this.document;
      for (const matrix of matrices) next = this.duplicateAlongPath(next, new Set([source.id]), matrix);
      this.preview = this.normalizeTree(next);
    } catch (error) { state.error = error instanceof Error ? error.message : String(error); }
    this.notify();
  }
  async applyPathCopy() {
    if (!this.pathCopy || this.pathCopy.picker || this.busy) return;
    this.refreshPathCopy();
    if (!this.preview || this.pathCopy.error) return;
    const next = this.preview;
    const ids = next.shapes.filter(s => !s.stitchParentId && !this.document.shapes.some(original => original.id === s.id)).map(s => s.id);
    if (await this.commit(next)) { this.cancel(); this.selected = ids; this.notify(); }
    else if (this.pathCopy) { this.pathCopy.error = "Could not apply copies. Review the document and try again."; this.notify(); }
  }
  booleanOperation: BooleanOperation | null = null;
  booleanTarget = "";
  booleanCutters: string[] = [];
  booleanPicker: "target" | "cutters" | null = null;
  booleanError = "";
  booleanEmpty = false;
  private booleanSelection: string[] = [];
  private booleanCache: { key: string; result: Shape | null } | null = null;
  get booleanLabel() {
    return (
      {
        union: "Join",
        subtract: "Subtract",
        intersect: "Intersect",
        exclude: "Exclude",
      } as const
    )[this.booleanOperation ?? "union"];
  }
  booleanEligible(id: string, allowOpen = false) {
    const shape = this.document.shapes.find((s) => s.id === id);
    return (
      !!shape &&
      (isClosedShape(shape) ||
        (allowOpen &&
          (isCurve(shape) ||
            (["line", "polyline"].includes(shape.kind) &&
              !shape.radius &&
              !shape.cornerRadii?.some(Boolean))))) &&
      !shape.stitchOnly &&
      !shape.stitchParentId &&
      !this.isLocked(id) &&
      !this.isHidden(id) &&
      !this.stitchGroups.some((g) => g.shapeId === id) &&
      !(this.document.stitchTransfers ?? []).some(
        (t) => t.masterId === id || t.targetId === id,
      )
    );
  }
  get canBoolean() {
    return (
      this.selected.length > 0 &&
      this.selected.every((id) => this.booleanEligible(id))
    );
  }
  get canJoin() {
    return (
      this.selected.length > 0 &&
      this.selected.every((id) => this.booleanEligible(id, true))
    );
  }
  setBooleanPicker(picker: "target" | "cutters") {
    if (!this.booleanOperation || this.busy) return;
    this.booleanPicker = this.booleanPicker === picker ? null : picker;
    this.refreshBoolean();
  }
  removeBooleanOperand(id: string) {
    if (!this.booleanOperation || this.busy) return;
    this.booleanCutters = this.booleanCutters.filter((x) => x !== id);
    this.refreshBoolean();
  }
  activateBoolean(operation: BooleanOperation) {
    if (!(operation === "union" ? this.canJoin : this.canBoolean) || this.busy)
      return;
    const ids = this.document.shapes
      .filter((s) => this.selected.includes(s.id))
      .map((s) => s.id);
    this.cancel();
    this.booleanSelection = [...this.selected];
    this.booleanOperation = operation;
    this.booleanTarget = ids[0];
    this.booleanCutters = ids.slice(1);
    this.booleanPicker = ids.length === 1 ? "cutters" : null;
    this.tool = "select";
    this.mode = "select";
    this.trimMode = true;
    this.mergeMode = true;
    this.transformError = "";
    this.refreshBoolean();
  }
  pickBoolean(id: string) {
    if (!this.booleanOperation || !this.booleanPicker) return;
    if (!this.booleanEligible(id, this.booleanOperation === "union")) {
      this.booleanError =
        this.booleanOperation === "union"
          ? "Choose a visible, unlocked closed outline or joinable path without active stitching."
          : "Choose a visible, unlocked closed outline without active stitching.";
      this.notify();
      return;
    }
    if (this.booleanPicker === "target") {
      if (id !== this.booleanTarget)
        this.booleanCutters.push(this.booleanTarget);
      this.booleanTarget = id;
      this.booleanCutters = this.booleanCutters.filter((x) => x !== id);
      this.booleanPicker = "cutters";
    } else if (id !== this.booleanTarget) {
      this.booleanCutters = this.booleanCutters.includes(id)
        ? this.booleanCutters.filter((x) => x !== id)
        : [...this.booleanCutters, id];
    }
    this.refreshBoolean();
  }
  refreshBoolean() {
    this.trimDraft = null;
    this.preview = null;
    this.booleanError = "";
    this.booleanEmpty = false;
    const ids = [this.booleanTarget, ...this.booleanCutters];
    if (this.booleanPicker === "target" || !this.booleanCutters.length) {
      this.notify();
      return;
    }
    try {
      if (
        !ids.every((id) =>
          this.booleanEligible(id, this.booleanOperation === "union"),
        )
      )
        throw Error(
          "Choose unlocked closed outlines without active stitching.",
        );
      const shapes = ids.map(
        (id) => this.document.shapes.find((s) => s.id === id)!,
      );
      const key = JSON.stringify([this.revision, this.booleanOperation, ids]);
      if (this.booleanCache?.key !== key) {
        const openJoin =
          this.booleanOperation === "union" && !shapes.every(isClosedShape);
        const result = openJoin
          ? mergeShapes(shapes)
          : booleanShapes(this.booleanOperation!, shapes);
        if (openJoin && !result)
          throw Error(
            "Open paths must form one connected chain of straight paths or curves. Do not mix open and closed outlines.",
          );
        this.booleanCache = { key, result };
      }
      const result = this.booleanCache.result;
      this.booleanEmpty = !result;
      this.trimDraft = this.normalizeTree({
        ...this.document,
        shapes: this.document.shapes.flatMap((s) =>
          s.id === this.booleanTarget
            ? result
              ? [result]
              : []
            : ids.includes(s.id)
              ? []
              : [s],
        ),
      });
      parseProject(JSON.stringify(this.trimDraft));
      this.preview = this.trimDraft;
    } catch (error) {
      this.booleanError =
        error instanceof Error ? error.message : String(error);
    }
    this.notify();
  }
  activateMerge() {
    this.activateBoolean("union");
  }
  mergeMode = false;
  trimHighlight: Point[] | null = null;
  trimMode = false;
  trimDraft: Doc | null = null;
  async applyTrim() {
    if (this.selectionLocked) return;
    if (!this.trimDraft || this.transformError || this.booleanError || (this.booleanOperation && this.booleanPicker === "target") || this.busy) return;
    const next = this.trimDraft;
    const mergedId = this.mergeMode
      ? next.shapes.find((s) => this.booleanOperation ? s.id === this.booleanTarget : this.selected.includes(s.id))?.id
      : undefined;
    const boolean = !!this.booleanOperation;
    this.cancel();
    if (await this.commit(next)) {
      if (boolean) this.selected = mergedId ? [mergedId] : [];
      if (mergedId) this.selected = [mergedId];
      this.notify();
    }
  }
  get canTrim() {
    return (
      !this.selectionLocked &&
      (!this.selected.length ||
        this.active.some((shape) => !isIndicator(shape.kind) && shape.kind !== "text" && shape.kind !== "measurement"))
    );
  }
  activateTrim() {
    if (!this.canTrim) return;
    this.cancel();
    this.tool = "select";
    this.mode = "select";
    this.trimMode = true;
    this.notify();
  }
  cancel() {
    if (this.pathCopy) this.selected = this.pathCopySelection;
    this.pathCopy = null;
    this.offsetDrag = null;
    this.offsetActive = false;
    this.offsetDraft = null;
    this.offsetIds = [];
    this.offsetError = "";
    this.mirrorAxis = null;
    this.mirrorLine = null;
    this.mirrorHover = null;
    if (this.booleanOperation) this.selected = this.booleanSelection;
    this.booleanOperation = null; this.booleanPicker = null; this.booleanCutters = [];
    this.booleanError = ""; this.booleanEmpty = false;
    this.mergeMode = false;
    this.trimMode = false;
    this.trimDraft = null;
    this.trimHighlight = null;
    if (this.stitchOriginal) {
      this.document = this.stitchOriginal;
      this.stitchOriginal = null;
      if (this.stitchOriginalSettings)
        this.stitchSettings = this.stitchOriginalSettings;
      this.stitchOriginalSettings = null;
    }
    this.stitchMode = false;
    this.stitchTool=null;this.stitchOperationSelection=[];
    this.editingStitchHoles=false;this.stitchHoleSelection=[];this.stitchTransferHighlight=null;
    this.stitchTransferPlacement=null;
    this.addingStitchRun = false;

    this.stitchDraft = null;
    this.stitchHover = null;
    this.stitchError = "";
    this.guideDrag = null;
    this.measurementLocks = {};
    this.transformGeneration++;
    this.transformDraft = null;
    this.transformError = "";
    this.placingPivot = false;
    this.transformAxis = undefined;
    this.hoverHandle = "";
    this.transformTool = null;
    this.transformOriginal = null;
    this.drawingDown = null;
    this.arcSweep = 0;
    this.arcRawSweep = 0;
    this.arcLast = undefined;
    this.previewId++;
    this.pending = [];
    this.pendingHandles = [];
    this.preview = null;
    this.gesture = null;
    this.smartGuides = [];
    this.snapTarget = null;
    this.snapKind = null;
    void this.core.request("cancel", this.revision).catch(() => {});
    this.notify();
  }
  screen(p: Point): Point {
    return { x: p.x * this.zoom + this.pan.x, y: p.y * this.zoom + this.pan.y };
  }
  world(p: Point): Point {
    return {
      x: (p.x - this.pan.x) / this.zoom,
      y: (p.y - this.pan.y) / this.zoom,
    };
  }
  snap(p: Point, disabled = false, excludedIds: readonly string[] = this.gesture?.selection ?? []): Point {
    this.smartGuides = [];
    this.snapTarget = null;
    this.snapKind = null;
    if (disabled) return p;
    const tolerance = 8 / this.zoom;
    if (this.objects) {
      let best = tolerance;
      for (const s of this.document.shapes.filter(s => !this.isHidden(s.id))) {
        if (excludedIds.includes(s.id)) continue;
        for (const candidate of snapCandidates(s)) {
          const d = distance(candidate.point, p);
          if (d < best) {
            best = d;
            this.snapTarget = candidate.point;
            this.snapKind = candidate.kind;
            this.smartGuides =
              candidate.kind === "center"
                ? (["x", "y"] as const).map((axis) => ({
                    axis,
                    coordinate: candidate.point[axis],
                    objectId: s.id,
                    bounds: bounds([s]),
                    alignment:
                      axis === "x" ? "Vertical center" : "Horizontal center",
                  }))
                : [];
          }
        }
      }
      if (this.snapTarget) return this.snapTarget;
      let edgeShape:Shape|undefined;
      for (const s of this.document.shapes.filter(s => !this.isHidden(s.id))) {
        if (excludedIds.includes(s.id)) continue;
        const box = bounds([s]);
        if (
          p.x < box.x - tolerance ||
          p.x > box.x + box.width + tolerance ||
          p.y < box.y - tolerance ||
          p.y > box.y + box.height + tolerance
        )
          continue;
        const q = nearestOutline(s, p, 0.25 / this.zoom),
          d = distance(q, p);
        if (d < best) {
          best = d;
          this.snapTarget = q;
          this.snapKind = "edge";edgeShape=s;
        }
      }
      if(this.snapTarget && edgeShape) {
        const original=this.snapTarget;
        const aligned=smartSnap(p,this.document.shapes.filter(s=>!this.isHidden(s.id) && !excludedIds.includes(s.id)),tolerance);
        const combined={...original};
        const guides=aligned.guides.filter(g=>Math.abs(original[g.axis]-p[g.axis])<1e-8);
        for(const guide of guides)combined[guide.axis]=guide.coordinate;
        if(guides.length && distance(nearestOutline(edgeShape,combined,0.25/this.zoom),combined)<1e-7){this.snapTarget=combined;this.smartGuides=guides;}
        return this.snapTarget;
      }

    }
    if (this.objects) {
      const q = { ...p };
      let found = false;
      for (const axis of ["x", "y"] as const) {
        const guide = (this.document.guides ?? [])
          .filter((g) => g.axis === axis && g.id !== this.guideDrag?.id)
          .sort(
            (a, b) =>
              Math.abs(a.coordinate - p[axis]) -
              Math.abs(b.coordinate - p[axis]),
          )[0];
        if (guide && Math.abs(guide.coordinate - p[axis]) < tolerance) {
          q[axis] = guide.coordinate;
          found = true;
        }
      }
      if (found) {
        this.snapTarget = q;
        this.snapKind = "alignment";
        return q;
      }
    }
    if (this.objects) {
      const result = smartSnap(
        p,
        this.document.shapes.filter(
          (shape) => !excludedIds.includes(shape.id),
        ),
        tolerance,
      );
      if (result.guides.length) {
        this.smartGuides = result.guides;
        this.snapTarget = result.point;
        this.snapKind = "alignment";
        return result.point;
      }
    }
    if (this.grid) {
      const q = {
        x: Math.round(p.x / this.gridSize) * this.gridSize,
        y: Math.round(p.y / this.gridSize) * this.gridSize,
      };
      if (distance(p, q) <= tolerance) {
        this.snapTarget = q;
        this.snapKind = "grid";
        return q;
      }
    }
    return p;
  }
  get tree(): ObjectNode[] { return this.document.objectTree ?? objectTreeFromShapes(this.document.shapes); }
  inheritedStateSource(id: string, field: "hidden" | "locked") { return inheritedStateSource(this.tree, id, field); }
  isHidden(id: string) { const shape=this.document.shapes.find(s=>s.id===id);return objectState(this.document,id).hidden || !!(shape?.stitchParentId && objectState(this.document,shape.stitchParentId).hidden); }
  isLocked(id: string) { const shape=this.document.shapes.find(s=>s.id===id);return objectState(this.document,id).locked || !!(shape?.stitchParentId && objectState(this.document,shape.stitchParentId).locked); }
  selectedGroups: string[] = [];
  collapsedGroups = new Set<string>();
  panelRevision = 0;
  selectGroup(id: string, additive = false) {
    if (!this.canToggleObjectState) return;
    const node = findObjectNode(this.tree, id);
    if (!node || node.kind !== "group") return;
    const ids = flattenObjectTree(node.children);
    if (!additive) { this.selected = ids; this.selectedGroups = [id]; }
    else if (this.selectedGroups.includes(id)) {
      this.selectedGroups = this.selectedGroups.filter(x => x !== id);
      this.selected = this.selected.filter(x => !ids.includes(x));
    } else { this.selectedGroups.push(id); this.selected = [...new Set([...this.selected, ...ids])]; }
    this.panelRevision++; this.notify();
  }
  toggleGroupExpanded(id: string) {
    if (this.collapsedGroups.has(id)) this.collapsedGroups.delete(id); else this.collapsedGroups.add(id);
    this.panelRevision++; this.scheduleRecovery(); this.notify();
  }
  async toggleGroupState(id: string, field: "hidden" | "locked") {
    if (!this.canToggleObjectState) return;
    const node = findObjectNode(this.tree, id);
    if (!node || node.kind !== "group") return;
    const tree = mapObjectTree(this.tree, n => n.id === id && n.kind === "group" ? { ...n, [field]: !n[field] } : n);
    if (await this.commit({ ...this.document, objectTree: tree })) {
      this.selected = this.selected.filter(x => !this.isHidden(x));
      this.selectedGroups = this.selectedGroups.filter(x => !this.isHidden(x));
      this.panelRevision++; this.notify();
    }
  }
  async renameGroup(id: string, name: string) {
    if (!this.canToggleObjectState || this.isLocked(id) || !name.trim() || name.trim().length > 200) return;
    await this.commit({ ...this.document, objectTree: mapObjectTree(this.tree, n => n.id === id && n.kind === "group" ? { ...n, name: name.trim() } : n) });
  }
  panelSelection(dragged: string): string[] {
    if (!this.selected.includes(dragged) && !this.selectedGroups.includes(dragged)) return [dragged];
    return [...this.selectedGroups, ...this.selected];
  }
  async movePanelItems(ids: string[], parent: string | null, index: number, revision = this.revision) {
    if (!this.canToggleObjectState || revision !== this.revision) return;
    try { await this.commit({ ...this.document, objectTree: moveObjectNodes(this.tree, ids, parent, index) }); }
    catch (error) { this.fail(error); }
  }
  async newGroup(fromSelection = !!(this.selected.length || this.selectedGroups.length)): Promise<string | undefined> {
    if (!this.canToggleObjectState) return;
    const id = crypto.randomUUID();
    let tree = this.tree;
    const selected = new Set([...this.selectedGroups, ...this.selected]);
    if (fromSelection && !selected.size) return;
    const picked: ObjectNode[] = [];
    function take(nodes: ObjectNode[]): ObjectNode[] {
      return nodes.flatMap(n => {
        if (selected.has(n.id)) { picked.push(n); return []; }
        return [n.kind === "group" ? { ...n, children: take(n.children) } : n];
      });
    }
    // Find the lowest common ancestor before extracting the selected roots.
    let parent: string | null = null;
    let siblings = tree;
    if (fromSelection) {
      while (true) {
        const containing = siblings.find(n => n.kind === "group" &&
          [...selected].every(x => !!findObjectNode(n.children, x)));
        if (!containing || containing.kind !== "group") break;
        parent = containing.id; siblings = containing.children;
      }
    }
    const first = fromSelection ? siblings.findIndex(n => selected.has(n.id) ||
      (n.kind === "group" && [...selected].some(x => !!findObjectNode(n.children, x)))) : 0;
    tree = fromSelection ? take(tree) : tree;
    const group: ObjectNode = { kind: "group", id, name: "Group", children: picked };
    function insert(nodes: ObjectNode[], current: string | null): ObjectNode[] {
      if (current === parent) return [...nodes.slice(0, Math.max(0, first)), group, ...nodes.slice(Math.max(0, first))];
      return nodes.map(n => n.kind === "group" ? { ...n, children: insert(n.children, n.id) } : n);
    }
    if (await this.commit({ ...this.document, objectTree: insert(tree, null) })) {
      this.selectedGroups = [id]; this.selected = flattenObjectTree(picked); this.panelRevision++; this.notify(); return id;
    }
  }
  async ungroup(id: string) {
    if (!this.canToggleObjectState) return;
    function remove(nodes: ObjectNode[]): ObjectNode[] {
      return nodes.flatMap(n => n.id === id && n.kind === "group" ? n.children :
        [n.kind === "group" ? { ...n, children: remove(n.children) } : n]);
    }
    await this.commit({ ...this.document, objectTree: remove(this.tree) });
    this.selectedGroups = this.selectedGroups.filter(x => x !== id); this.panelRevision++; this.notify();
  }
  get selectionLocked() {
    return this.document.shapes.some(s => this.isLocked(s.id) && this.selected.includes(s.id));
  }
  get active() {
    return (
      this.propertySession?.next ??
      this.preview ??
      this.pendingDocument ??
      this.document
    ).shapes.filter((s) => this.booleanOperation ? s.id === this.booleanTarget : this.selected.includes(s.id));
  }
  get selectionBounds() {
    return bounds(this.active, this.units);
  }
  handles(): {
    kind: "move" | "scale" | "rotate" | "vertex" | "corner";
    point: Point;
    shapeId?: string;
    vertex?: number;
    handleSide?: "incoming" | "outgoing";
    axis?: "x" | "y";
  }[] {
    if (!this.active.length || this.active.some(s => this.isLocked(s.id) || this.isHidden(s.id)) || this.transformTool === "mirror") return [];
    if (this.transformTool === "corner") return this.cornerHandles();
    const curveHandles: ReturnType<Controller["handles"]> = [];
    if (this.active.length === 1 && this.active[0].kind === "compound" && (!this.transformTool || this.transformTool === "move")) {
      const shape = this.active[0], matrix = shapeMatrix(shape);
      let vertex = 0;
      for (const contour of shape.contours!) for (let i=0;i<contour.length;i++,vertex++) {
        const c = contour[i], previous = contour[(i+contour.length-1)%contour.length];
        curveHandles.push({kind:"vertex",vertex,point:applyMatrix(matrix,c[0])});
        for (const [side,p] of [["incoming",previous[2]],["outgoing",c[1]]] as const)
          if (distance(p,c[0])>1e-9) curveHandles.push({kind:"vertex",vertex,handleSide:side,point:applyMatrix(matrix,p)});
      }
    }
    if (
      this.active.length === 1 &&
      isCurve(this.active[0]) &&
      (!this.transformTool || this.transformTool === "move")
    ) {
      const s = this.active[0],
        m = shapeMatrix(s);
      s.points.forEach((p, vertex) => {
        curveHandles.push({ kind: "vertex", point: applyMatrix(m, p), vertex });
        if (s.handles)
          for (const side of ["incoming", "outgoing"] as const) {
            const v = s.handles[vertex][side];
            if (Math.hypot(v.x, v.y) < 1e-9) continue;
            const q = { x: p.x + v.x, y: p.y + v.y };
            curveHandles.push({
              kind: "vertex",
              point: applyMatrix(m, q),
              vertex,
              handleSide: side,
            });
          }
      });
    }
    if (!this.transformTool) {
      if (
        this.active.length === 1 &&
        ["line", "polyline", "rectangle"].includes(this.active[0].kind)
      )
        (this.active[0].kind === "rectangle"
          ? cornerPoints(this.active[0]).map(p => applyMatrix(shapeMatrix(this.active[0]), p))
          : worldPoints(this.active[0])).forEach((point, vertex) =>
          curveHandles.push({ kind: "vertex", point, vertex }),
        );
      return curveHandles;
    }
    const p = this.transformPivot,
      t = (this.gizmoAngle * Math.PI) / 180,
      z = this.zoom;
    const point = (x: number, y: number) => ({
      x: p.x + (x * Math.cos(t) - y * Math.sin(t)) / z,
      y: p.y + (x * Math.sin(t) + y * Math.cos(t)) / z,
    });
    const result: ReturnType<Controller["handles"]> =
      this.transformTool === "rotate"
        ? [{ kind: "rotate", point: point(60, 0) }]
        : [
            { kind: this.transformTool, point: point(72, 0), axis: "x" },
            { kind: this.transformTool, point: point(0, -72), axis: "y" },
            {
              kind: this.transformTool,
              point: this.transformTool === "move" ? p : point(42, -42),
            },
          ];
    if (
      this.transformTool === "move" &&
      this.active.length === 1 &&
      ["line", "polyline", "rectangle"].includes(this.active[0].kind)
    )
      (this.active[0].kind === "rectangle"
          ? cornerPoints(this.active[0]).map(p => applyMatrix(shapeMatrix(this.active[0]), p))
          : worldPoints(this.active[0])).forEach((point, vertex) =>
        result.push({ kind: "vertex", point, vertex }),
      );
    return [...result, ...curveHandles];
  }
  handleAt(raw: Point) {
    if (this.active.some(s => this.isLocked(s.id) || this.isHidden(s.id))) return;
    if (
      this.transformTool === "rotate" &&
      Math.abs(distance(raw, this.transformPivot) * this.zoom - 60) < 9
    )
      return this.handles()[0];
    const handles = this.handles();
    const direct =
      handles.find(
        (h) => !h.handleSide && distance(h.point, raw) < 10 / this.zoom,
      ) ?? handles.find((h) => distance(h.point, raw) < 10 / this.zoom);
    if (direct) return direct;
    return handles.find(
      (h) =>
        h.axis &&
        hitsTransformShaft(raw, this.transformPivot, h.point, this.zoom),
    );
  }
  private textEditingId?: string;
  get editingTextId() {
    return this.textEditingId;
  }
  set editingTextId(id: string | undefined) {
    this.textEditingId = id;
    this.notify();
  }
  onTextRequested?: (point: Point) => void;
  get guideSnapLabel() {
    if (!this.guideDrag) return "";
    return this.smartGuides
      .map(
        (g) =>
          `${g.alignment} · ${this.document.shapes.find((s) => s.id === g.objectId)?.name ?? "Object"}`,
      )
      .join(" / ");
  }
  private guidePointer: Point | null = null;
  updateGuideModifiers(alt: boolean, ctrl: boolean, shift: boolean) {
    if (this.guideDrag && this.guidePointer)
      this.updateGuide(this.guidePointer, alt, ctrl, shift);
  }
  private updateGuide(
    pixel: Point,
    alt: boolean,
    ctrl: boolean,
    shift: boolean,
  ) {
    this.guidePointer = pixel;
    const g = this.guideDrag!;
    const raw = this.world(pixel),
      axis = g.axis;
    this.smartGuides = [];
    this.snapTarget = null;
    this.snapKind = null;
    let coordinate = raw[axis];
    if (!alt) {
      const tolerance = 8 / this.zoom;
      const candidates = this.objects
        ? this.document.shapes.flatMap((shape) =>
            (this.isHidden(shape.id) ? [] : snapCandidates(shape)).map((candidate) => ({
              shape,
              candidate,
              coordinate: candidate.point[axis],
            })),
          )
        : [];
      const nearest = candidates.sort(
        (a, b) =>
          Math.abs(a.coordinate - coordinate) -
          Math.abs(b.coordinate - coordinate),
      )[0];
      if (nearest && Math.abs(nearest.coordinate - coordinate) <= tolerance) {
        coordinate = nearest.coordinate;
        const box = bounds([nearest.shape]);
        const start = axis === "x" ? box.x : box.y;
        const size = axis === "x" ? box.width : box.height;
        const near = (value: number) => Math.abs(coordinate - value) < 1e-8;
        const alignment = near(start + size / 2)
          ? axis === "x"
            ? "Vertical center"
            : "Horizontal center"
          : near(start)
            ? axis === "x"
              ? "Left edge"
              : "Top edge"
            : near(start + size)
              ? axis === "x"
                ? "Right edge"
                : "Bottom edge"
              : nearest.candidate.kind === "vertex"
                ? "Endpoint / vertex"
                : nearest.candidate.kind[0].toUpperCase() +
                  nearest.candidate.kind.slice(1);
        this.smartGuides = [
          {
            axis,
            coordinate,
            bounds: box,
            objectId: nearest.shape.id,
            alignment,
          },
        ];
        this.snapKind = nearest.candidate.kind;
      } else {
        const result = this.objects
          ? smartSnap(raw, this.document.shapes.filter(s => !this.isHidden(s.id)), tolerance)
          : null;
        const guide = result?.guides.find((v) => v.axis === axis);
        if (guide) {
          coordinate = guide.coordinate;
          this.smartGuides = [guide];
          this.snapKind = "alignment";
        } else {
          const step = this.units === "mm" ? (ctrl ? 10 : shift ? 5 : 1) : 25.4 * (ctrl ? 1 : shift ? 1/4 : 1/16);
          coordinate = Math.round(coordinate / step) * step;
        }
      }
    }
    g.coordinate = coordinate;
    this.cursor = { ...raw, [axis]: coordinate };
    if (this.smartGuides.length) this.snapTarget = this.cursor;
    this.notify();
  }
  pointerDown(
    pixel: Point,
    button: number,
    shift: boolean,
    alt: boolean,
    ctrl = false,
  ) {
    if (!this.ready || this.busy) return;
    if (this.pathCopy && !this.space && button !== 1) {
      if (button === 2) { void this.applyPathCopy(); return; }
      const raw = this.world(pixel);
      const hit = [...this.document.shapes].reverse().find(s => !this.isHidden(s.id) && (hitTest(s,raw,8/this.zoom,this.units) || contains(s,raw)));
      if (hit) this.pickPathCopy(hit.id);
      return;
    }
    if (this.offsetActive && button === 2) { void this.applyOffset(); return; }
    if (this.offsetActive && button === 0 && !this.space) {
      const raw = this.world(pixel), normal = this.offsetDragAt(raw);
      if (normal) this.offsetDrag = { start: raw, distance: this.offsetDistance, normal };
      this.notify();
      return;
    }
    if (button !== 1 && !(button === 0 && this.space)) {
      this.selectedGroups = []; this.panelRevision++;
    }
    this.clipboardPixel = { ...pixel };
    this.pointerInside = true;
    const raw = this.world(pixel);
    this.anchorPointer = raw;
    if (this.booleanOperation && button === 0 && !this.space) {
      const hit = [...this.document.shapes].reverse().find(s => !this.isHidden(s.id) && (hitTest(s,raw,8/this.zoom,this.units) || contains(s,raw)));
      if (hit) this.pickBoolean(hit.id);
      return;
    }
    if (this.mergeMode && button === 0 && !this.space) return;
    if (this.trimMode && button === 2) { void this.applyTrim(); return; }
    if (this.trimMode && !this.mergeMode && button === 0 && !this.space) {
      const baseline = this.trimDraft ?? this.document;
      const visible = baseline.shapes.filter(s => !this.isHidden(s.id));
      const trimmed = trimAt(visible, raw, 8 / this.zoom, undefined, s => !this.isLocked(s.id));
      const shapes = trimmed ? [...trimmed, ...baseline.shapes.filter(s => this.isHidden(s.id))] : null;
      this.trimHighlight = null;
      if (shapes) {
        try {
          const next = reconcileStitches({ ...baseline, shapes }, baseline);
          parseProject(JSON.stringify(this.normalizeTree(next)));
          this.trimDraft = next;
          this.preview = next;
          this.transformError = "";
        } catch (error) { this.transformError = String(error); }
      }
      this.notify();
      return;
    }
    if (
      !this.stitchMode &&
      this.tool === "select" &&
      !this.transformTool &&
      !this.gesture &&
      !this.space &&
      !alt &&
      !ctrl &&
      button === 0
    ) {
      const line = this.stitchLineAt(raw);
      if (
        line &&
        !this.document.shapes.find((s) => s.id === line.shapeId)?.stitchOnly
      ) {
        this.activateStitch();
        this.selected = [line.shapeId];
        this.stitchSelected = [line.id];
        this.notify();
        return;
      }
    }
    if (this.stitchMode && button === 0 && !this.space) {
      this.stitchClick(raw,shift,alt,ctrl);
      return;
    }
    if (
      button === 0 &&
      !this.space &&
      !this.gesture &&
      !this.pending.length &&
      !this.transformTool
    ) {
      const axis =
        this.rulers && pixel.x > 22 && pixel.y < 22
          ? "y"
          : this.rulers && pixel.y > 22 && pixel.x < 22
            ? "x"
            : null;
      const existing =
        !axis && this.tool === "select" && !this.handleAt(raw)
          ? (this.document.guides ?? []).find(
              (g) => Math.abs(raw[g.axis] - g.coordinate) * this.zoom < 5,
            )
          : undefined;
      if (axis || existing) {
        this.guideDrag = existing
          ? { ...existing }
          : { id: crypto.randomUUID(), axis: axis!, coordinate: raw[axis!] };
        this.updateGuide(pixel, alt, ctrl, shift);
        return;
      }
    }
    if (button === 1 || (button === 0 && this.space)) {
      this.gesture = {
        kind: "pan",
        start: pixel,
        end: pixel,
        original: this.document,
        selection: [],
        pivot: raw,
        pan: { ...this.pan },
      };
      return;
    }
    if (button === 2 && (this.tool === "polyline" || isCurveMode(this.mode))) {
      this.finish();
      return;
    }
    if (button === 2 && this.stitchMode) {
      void this.applyStitch();
      return;
    }
    if (button === 2 && this.transformTool) {
      void this.applyTransform();
      return;
    }
    if (button !== 0) return;
    if (this.placingPivot) {
      this.setPivot(this.snap(raw, alt));
      return;
    }
    if (this.transformTool === "mirror") {
      const target = this.mirrorTargetAt(raw);
      if (target) {
        this.mirrorAxis = target.axis;
        this.mirrorLine = target.axis === "edge" ? target.line : null;
        this.refreshMirror();
      }
      return;
    }
    if (this.tool === "text") {
      this.onTextRequested?.(this.snap(raw, alt));
      return;
    }
    if (this.tool !== "select") {
      this.drawingDown = {
        pixel,
        point: this.drawingPoint(raw, alt, shift),
        initial: !this.pending.length,
      };
      this.notify();
      return;
    }
    const handle = this.handleAt(raw);
    if (alt && !this.transformTool && !handle) {
      const hit = [...this.document.shapes.filter(s => !this.isHidden(s.id))]
        .reverse()
        .find((s) => !isIndicator(s.kind) && s.kind !== "text" && s.kind !== "measurement" && hitTest(s, raw, 8 / this.zoom, this.units));
      if (hit) {
        const shape = insertAnchor(hit, raw, 8 / this.zoom);
        if (shape) {
          this.selected = [hit.id];
          void this.commit({
            ...this.document,
            shapes: this.document.shapes.map((s) =>
              s.id === hit.id ? shape : s,
            ),
          });
        }
      }
      return;
    }
    if (handle) {
      if (handle.kind === "corner") {
        this.selectedCorner = {
          shapeId: handle.shapeId!,
          index: handle.vertex!,
        };
        this.notify();
      }
      this.gesture = {
        kind: handle.kind,
        shapeId: handle.shapeId,
        start: raw,
        end: raw,
        original: this.preview ?? this.document,
        selection: [...this.selected],
        pivot: { ...this.transformPivot },
        axis: handle.axis ?? this.transformAxis,
        orientation: this.transformAngle,
        baseValues: { ...this.transformValues },
        vertex: handle.vertex,
        handleSide: handle.handleSide,
      };
      this.notify();
      return;
    }
    const hit = [...(this.preview ?? this.document).shapes]
      .reverse()
      .find(
        (s) => hitTest(s, raw, 8 / this.zoom, this.units) || (ctrl && contains(s, raw)),
      );
    if (
      this.transformTool &&
      (shift || !hit || !this.selected.includes(hit.id))
    )
      return;
    if (hit) {
      if (shift) {
        this.selected = this.selected.includes(hit.id)
          ? this.selected.filter((id) => id !== hit.id)
          : [...this.selected, hit.id];
      } else if (!this.selected.includes(hit.id)) this.selected = [hit.id];
      if (this.transformTool === "move" && this.selected.includes(hit.id))
        this.gesture = {
          kind: "move",
          start: raw,
          end: raw,
          original: this.preview ?? this.document,
          selection: [...this.selected],
          pivot: raw,
          axis: this.transformAxis,
          orientation: this.transformAngle,
          baseValues: { ...this.transformValues },
        };
    } else {
      const selection = shift ? [...this.selected] : [];
      this.selected = selection;
      this.gesture = {
        kind: "marquee",
        start: raw,
        end: raw,
        original: this.document,
        selection,
        pivot: raw,
        crossing: ctrl,
      };
    }
    this.notify();
  }
  pointerMove(pixel: Point, alt: boolean, ctrl = false, shift = false) {
    if (this.offsetDrag) {
      const drag = this.offsetDrag, raw = this.snap(this.world(pixel), alt, this.selected);
      this.setOffsetDistance(drag.distance + (raw.x - drag.start.x) * drag.normal.x + (raw.y - drag.start.y) * drag.normal.y);
      return;
    }
    if(!this.stitchTransferPlacement)this.updateStitchTransferHighlight(this.world(pixel));
    this.clipboardPixel = { ...pixel };
    this.mirrorHover = null;
    if (this.transformTool === "mirror" && !this.space && !this.placingPivot && !this.gesture) {
      this.pointerInside = true;
      this.anchorPointer = this.world(pixel);
      this.mirrorHover = this.mirrorTargetAt(this.anchorPointer);
      this.notify();
      return;
    }
    if (this.trimMode && !this.mergeMode && !this.space && !this.gesture) {
      this.pointerInside = true;
      this.anchorPointer = this.world(pixel);
      this.trimHighlight = null;
      trimAt((this.trimDraft ?? this.document).shapes.filter(s => !this.isHidden(s.id)), this.anchorPointer, 8 / this.zoom,
        span => { this.trimHighlight = span; }, s => !this.isLocked(s.id));
      this.notify();
      return;
    }
    if (this.stitchMode && !this.space && !this.gesture) {
      this.pointerInside = true;
      this.anchorPointer = this.world(pixel);
      this.drawingShift = shift;
      if(this.stitchTransferPlacement){this.queueStitchTransferPointer(this.anchorPointer,alt);return;}else this.updateStitchHover();
      this.notify();
      return;
    }
    if (this.guideDrag) {
      this.updateGuide(pixel, alt, ctrl, shift);
      return;
    }
    this.pointerInside = true;
    this.anchorAlt = alt;
    this.anchorPointer = this.world(pixel);
    const raw = this.world(pixel),
      g = this.gesture;
    this.cursor =
      g?.kind === "pan" ||
      g?.kind === "rotate" ||
      g?.kind === "move" ||
      g?.kind === "marquee"
        ? raw
        : this.drawingPoint(raw, alt, shift);
    if (this.mode === "control-curve" && this.drawingDown) {
      const a = this.drawingDown.point;
      const radius = distance(a, raw);
      const angle = shift
        ? (Math.round(Math.atan2(raw.y - a.y, raw.x - a.x) / (Math.PI / 4)) *
            Math.PI) /
          4
        : Math.atan2(raw.y - a.y, raw.x - a.x);
      this.cursor = {
        x: a.x + radius * Math.cos(angle),
        y: a.y + radius * Math.sin(angle),
      };
    }
    if (this.mode === "arc" && this.pending.length === 2) {
      const a = this.pending[0],
        b = this.pending[1],
        theta = Math.atan2(raw.y - a.y, raw.x - a.x),
        initial = Math.atan2(b.y - a.y, b.x - a.x);
      const last = this.arcLast ?? initial;
      let delta = theta - last;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      this.arcSweep = Math.max(
        -360,
        Math.min(360, this.arcRawSweep + (delta * 180) / Math.PI),
      );
      this.arcRawSweep = this.arcSweep;
      if (shift) this.arcSweep = Math.round(this.arcSweep / 45) * 45;
      this.arcLast = theta;
      if (this.measurementLocks.Sweep !== undefined)
        this.arcSweep = this.measurementLocks.Sweep;
    }
    if (
      this.drawingDown?.initial &&
      (pointCount(this.mode) === 2 || this.mode === "polyline" || this.mode === "measurement") &&
      distance(pixel, this.drawingDown.pixel) >= 4
    ) {
      this.pending = [this.drawingDown.point];
    }

    if (g?.kind === "pan") {
      this.pan = {
        x: g.pan!.x + pixel.x - g.start.x,
        y: g.pan!.y + pixel.y - g.start.y,
      };
      this.notifyPointer();
      return;
    }
    if (g) {
      g.end = this.cursor;
      if (g.kind === "marquee") {
        this.notifyPointer();
        return;
      }
      const selected = (s: Shape) => g.selection.includes(s.id);
      let document: Doc = g.original;
      if (g.kind === "move") {
        const movement={x:raw.x-g.start.x,y:raw.y-g.start.y};
        const snapped=alt ? {delta:movement,guides:[] as SmartGuide[],target:undefined} : snapRigidMove(g.original.shapes.filter(s=>!this.isHidden(s.id)),g.selection,movement,{grid:this.grid,objects:this.objects,gridSize:this.gridSize,tolerance:8/this.zoom,guides:g.original.guides,anchor:g.snapAnchor});
        if(!g.snapAnchor && "anchor" in snapped)g.snapAnchor=snapped.anchor;
        let dx=snapped.delta.x,dy=snapped.delta.y;
        const target=snapped.target ?? null,targetGuides=snapped.guides,targetKind:SnapKind|null=target ? "alignment" : null;
        if (g.axis) {
          const t = ((g.orientation ?? 0) * Math.PI) / 180,
            u =
              g.axis === "x"
                ? { x: Math.cos(t), y: Math.sin(t) }
                : { x: -Math.sin(t), y: Math.cos(t) },
            d = dx * u.x + dy * u.y;
          dx = d * u.x;
          dy = d * u.y;
        }
        g.displacement = { x: dx, y: dy };
        const orientation = ((g.orientation ?? 0) * Math.PI) / 180;
        this.transformValues = {
          ...this.transformValues,
          x:
            (g.baseValues?.x ?? 0) +
            dx * Math.cos(orientation) +
            dy * Math.sin(orientation),
          y:
            (g.baseValues?.y ?? 0) -
            dx * Math.sin(orientation) +
            dy * Math.cos(orientation),
        };
        this.message = `Move ${this.formatLength(this.transformValues.x)}, ${this.formatLength(this.transformValues.y)} ${this.unitSymbol}`;
        this.smartGuides = g.axis ? [] : targetGuides;
        this.snapTarget = g.axis ? null : target;
        this.snapKind = g.axis ? null : targetKind;
        document = {
          ...g.original,
          shapes: g.original.shapes.map((s) =>
            selected(s) ? moveShape(s, dx, dy) : s,
          ),
        };
      }
      if (g.kind === "scale") {
        const t = ((g.orientation ?? 0) * Math.PI) / 180;
        const component = (p: Point, axis: "x" | "y") => {
          const x = p.x - g.pivot.x,
            y = p.y - g.pivot.y;
          return axis === "x"
            ? x * Math.cos(t) + y * Math.sin(t)
            : -x * Math.sin(t) + y * Math.cos(t);
        };
        const factor = (g.factor = Math.max(
          0.001,
          g.axis
            ? component(raw, g.axis) / (component(g.start, g.axis) || 1)
            : distance(raw, g.pivot) / (distance(g.start, g.pivot) || 1),
        ));
        const uniform = this.active.some(s=>s.kind === "size-square");
        const sx = !uniform && g.axis === "y" ? 1 : factor,
          sy = !uniform && g.axis === "x" ? 1 : factor;
        this.transformValues = {
          ...this.transformValues,
          sx: sx * (g.baseValues?.sx ?? 1),
          sy: sy * (g.baseValues?.sy ?? 1),
        };
        document = {
          ...g.original,
          shapes: g.original.shapes.map((s) =>
            selected(s) ? stretchShape(s, sx, sy, g.pivot, g.orientation) : s,
          ),
        };
      }
      if (g.kind === "rotate") {
        const theta = Math.atan2(raw.y - g.pivot.y, raw.x - g.pivot.x);
        let delta =
          theta -
          (g.lastAngle ??
            Math.atan2(g.start.y - g.pivot.y, g.start.x - g.pivot.x));
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        g.lastAngle = theta;
        g.angle = (g.angle ?? 0) + (delta * 180) / Math.PI;
        const rawAngle = g.angle;
        const angle = snapRotation(rawAngle,{ctrlKey:ctrl,shiftKey:shift,altKey:alt});
        this.transformValues = {
          ...this.transformValues,
          angle: angle + (g.baseValues?.angle ?? 0),
        };
        this.message = `Rotation ${angle.toFixed(1)}°`;
        document = {
          ...g.original,
          shapes: g.original.shapes.map((s) =>
            selected(s) ? rotateShape(s, angle, g.pivot) : s,
          ),
        };
      }
      if (g.kind === "corner") {
        const original = g.original.shapes.find((s) => s.id === g.shapeId)!;
        const index = g.vertex!,
          pts = cornerPoints(original),
          p = pts[index];
        const a = pts[(index + pts.length - 1) % pts.length],
          b = pts[(index + 1) % pts.length];
        const dx =
            (a.x - p.x) / (distance(a, p) || 1) +
            (b.x - p.x) / (distance(b, p) || 1),
          dy =
            (a.y - p.y) / (distance(a, p) || 1) +
            (b.y - p.y) / (distance(b, p) || 1),
          len = Math.hypot(dx, dy);
        const inv = inverse(shapeMatrix(original)),
          start = applyMatrix(inv, g.start),
          end = applyMatrix(inv, raw);
        const angle = Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              ((a.x - p.x) * (b.x - p.x) + (a.y - p.y) * (b.y - p.y)) /
                (distance(a, p) * distance(b, p) || 1),
            ),
          ),
        );
        const delta =
          ((((end.x - start.x) * dx + (end.y - start.y) * dy) / (len || 1)) *
            Math.sin(angle / 2)) /
          (1 - Math.sin(angle / 2) || 1);
        const step = this.units === "mm" ? (ctrl ? 10 : shift ? 5 : 1) : 25.4 * (ctrl ? 1 : shift ? 1/4 : 1/16);
        const initialRadius = cornerRadii(original)[index];
        const value =
          distance(g.start, raw) * this.zoom < 2
            ? initialRadius
            : Math.max(0, Math.round((initialRadius + delta) / step) * step);
        const next =
          distance(g.start, raw) * this.zoom < 2 && !alt
            ? original
            : setCornerRadius(original, index, value, alt);
        this.message = `Corner radius ${this.formatLength(cornerRadii(next)[index])} ${this.unitSymbol}${alt ? " (all corners)" : ""}`;
        document = {
          ...g.original,
          shapes: g.original.shapes.map((s) =>
            s.id === original.id ? next : s,
          ),
        };
      }
      if (g.kind === "vertex" && g.original.shapes.find(s => selected(s))?.kind === "compound") {
        const original = g.original.shapes.find(s => selected(s))!;
        const matrix = shapeMatrix(original), local = applyMatrix(inverse(matrix),g.end);
        const contours = structuredClone(original.contours!);
        let index = g.vertex!;
        for (const contour of contours) {
          if (index >= contour.length) { index -= contour.length; continue; }
          const current = contour[index], previous = contour[(index+contour.length-1)%contour.length], anchor = current[0];
          if (g.handleSide) {
            if (g.handleSide === "incoming") previous[2] = local; else current[1] = local;
            if (!alt) {
              const mirrored = {x:2*anchor.x-local.x,y:2*anchor.y-local.y};
              if (g.handleSide === "incoming") current[1] = mirrored; else previous[2] = mirrored;
            }
          } else {
            const dx=local.x-anchor.x,dy=local.y-anchor.y;
            current[1]={x:current[1].x+dx,y:current[1].y+dy};
            previous[2]={x:previous[2].x+dx,y:previous[2].y+dy};
            current[0]=local;previous[3]=local;
          }
          break;
        }
        const box = bounds([{...original,contours,rotation:0,transform:undefined}]);
        const points = [{x:box.x,y:box.y},{x:box.x+box.width,y:box.y+box.height}];
        document={...g.original,shapes:g.original.shapes.map(s=>s.id===original.id?{...original,points,contours,rotation:0,transform:matrix}:s)};
      } else if (g.kind === "vertex") {
        const original = rectanglePath(g.original.shapes.find((s) => selected(s))!);
        if (shift && !g.handleSide) {
          const origin = applyMatrix(shapeMatrix(original), original.points[g.vertex!]);
          const angle = Math.round(Math.atan2(raw.y - origin.y, raw.x - origin.x) / (Math.PI / 4)) * Math.PI / 4;
          const radius = distance(origin, raw);
          const direction = { x: Math.cos(angle), y: Math.sin(angle) };
          const constrained = {
            x: origin.x + radius * direction.x,
            y: origin.y + radius * direction.y,
          };
          const snapped = this.snap(constrained, alt);
          const dx = snapped.x - origin.x, dy = snapped.y - origin.y;
          if (Math.abs(dx * direction.y - dy * direction.x) < 1e-7 &&
              dx * direction.x + dy * direction.y >= -1e-7) {
            g.end = snapped;
          } else {
            g.end = constrained;
            this.smartGuides = [];
            this.snapTarget = null;
            this.snapKind = null;
          }
          this.cursor = g.end;
        }
        if (!g.handleSide) {
          const origin = applyMatrix(shapeMatrix(original), original.points[g.vertex!]);
          this.message = `Move ${this.formatLength(g.end.x - origin.x)}, ${this.formatLength(g.end.y - origin.y)} ${this.unitSymbol}`;
        }
        const local = applyMatrix(inverse(shapeMatrix(original)), g.end);
        const closed =
          (original.kind === "polyline" || isCurve(original)) &&
          original.points.length > 2 &&
          distance(
            original.points[0],
            original.points[original.points.length - 1],
          ) < 1e-9;
        const points = original.points.map((p, i) =>
          (!g.handleSide && i === g.vertex) ||
          (closed && !g.handleSide &&
            (g.vertex === 0 || g.vertex === original.points.length - 1) &&
            (i === 0 || i === original.points.length - 1))
            ? local
            : p,
        );
        const oldCenter = localCenter(original),
          newShape = {
            ...original,
            points,
            ...(g.handleSide && original.handles
              ? {
                  handles: original.handles.map((h, i) => {
                    if (i !== g.vertex && !(closed && (g.vertex === 0 || g.vertex === original.points.length - 1) && (i === 0 || i === original.points.length - 1))) return h;
                    const v = {
                      x: local.x - original.points[i].x,
                      y: local.y - original.points[i].y,
                    };
                    if (alt) return { ...h, [g.handleSide!]: v };
                    return mirroredHandles(
                      g.handleSide === "incoming" ? { x: -v.x, y: -v.y } : v,
                    );
                  }),
                }
              : {}),
          },
          newCenter = localCenter(newShape),
          rotatedNew = rotatePoint(newCenter, oldCenter, original.rotation);
        const corrected = {
          ...newShape,
          points: newShape.points.map((p) => ({
            x: p.x + rotatedNew.x - newCenter.x,
            y: p.y + rotatedNew.y - newCenter.y,
          })),
        };

        document = {
          ...g.original,
          shapes: g.original.shapes.map((s) =>
            s.id === original.id ? corrected : s,
          ),
        };
      }
      if (this.transformTool) this.updateTransformPreview(document);
      else {
        this.preview = document;
        void this.validatePreview(document);
      }
    } else {
      this.hoverHandle =
        this.tool === "select" ? (this.handleAt(raw)?.kind ?? "") : "";
      this.hover =
        [...this.document.shapes.filter(s => !this.isHidden(s.id))]
          .reverse()
          .find((s) => hitTest(s, raw, 8 / this.zoom, this.units))?.id ?? "";
    }
    this.notifyPointer();
  }
  pointerUp(pixel?: Point, alt = false, shift = false, ctrl = false) {
    if (this.offsetDrag) {
      if (pixel) this.pointerMove(pixel, alt, ctrl, shift);
      this.offsetDrag = null;
      this.notify();
      return;
    }
    if (this.guideDrag) {
      if (pixel) this.updateGuide(pixel, alt, ctrl, shift);
      const g = this.guideDrag;
      this.guideDrag = null;
      this.smartGuides = [];
      this.snapTarget = null;
      this.snapKind = null;
      const inside =
        pixel &&
        pixel.x >= 0 &&
        pixel.y >= 0 &&
        pixel.x < this.width &&
        pixel.y < this.height;
      if (inside) {
        const guides = (this.document.guides ?? []).filter(
          (v) => v.id !== g.id,
        );
        if (!(this.rulers && (pixel.x < 22 || pixel.y < 22))) guides.push(g);
        void this.commit({ ...this.document, guides });
      }
      this.notify();
      return;
    }
    if (this.drawingDown) {
      const d = this.drawingDown;
      if (d.initial && pixel && distance(pixel,d.pixel) >= 4 && ["arrow","arrow-head","crosshair","size-ruler","measurement"].includes(this.mode)) this.pending=[d.point];
      this.drawingDown = null;
      const p = pixel
        ? this.drawingPoint(this.world(pixel), alt, shift)
        : d.point;
      if (
        d.initial &&
        pixel &&
        distance(pixel, d.pixel) >= 4 &&
        (pointCount(this.mode) === 2 || this.mode === "polyline")
      ) {
        this.pending = [];
        this.finish([d.point, p]);
        return;
      }
      if (isCurveMode(this.mode)) {
        this.beforeClick = [...this.pending];
        const anchor = this.mode === "control-curve" ? d.point : p;
        const count = this.pending.length;
        this.addPoint(anchor);
        if (this.mode === "control-curve" && this.pending.length > count) {
          let v =
            pixel && distance(pixel, d.pixel) >= 4
              ? {
                  x: this.world(pixel).x - anchor.x,
                  y: this.world(pixel).y - anchor.y,
                }
              : { x: 0, y: 0 };
          if (shift) {
            const angle =
              (Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) * Math.PI) / 4;
            const radius = Math.hypot(v.x, v.y);
            v = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
          }
          this.pendingHandles[this.pending.length - 1] = mirroredHandles(v);
        }
        this.notify();
        return;
      }
      this.beforeClick = [...this.pending];
      this.addPoint(p);
      return;
    }
    if (pixel && this.gesture?.kind === "vertex" && !this.gesture.handleSide &&
        (distance(this.gesture.start, this.world(pixel)) > 1e-9 ||
         distance(this.gesture.start, this.gesture.end) > 1e-9))
      this.pointerMove(pixel, alt, ctrl, shift);
    const g = this.gesture;
    if (!g) return;
    this.previewId++;
    this.gesture = null;
    this.smartGuides = [];
    this.snapTarget = null;
    this.snapKind = null;
    if (g.kind === "move" && this.transformTool) {
      this.transformPivot = {
        x: this.transformPivot.x + (g.displacement?.x ?? 0),
        y: this.transformPivot.y + (g.displacement?.y ?? 0),
      };
    }
    if (g.kind === "marquee") {
      const x = Math.min(g.start.x, g.end.x),
        y = Math.min(g.start.y, g.end.y),
        right = Math.max(g.start.x, g.end.x),
        bottom = Math.max(g.start.y, g.end.y);
      this.selected = [
        ...new Set([
          ...g.selection,
          ...this.document.shapes
            .filter((s) => {
              if (this.isHidden(s.id)) return false;
              const b = bounds([s], this.units);
              return g.crossing || ctrl
                ? intersectsBox(
                    s,
                    {
                      x,
                      y,
                      width: right - x,
                      height: bottom - y,
                    },
                    0.25 / this.zoom,
                    this.units,
                  )
                : b.x >= x &&
                    b.y >= y &&
                    b.x + b.width <= right &&
                    b.y + b.height <= bottom;
            })
            .map((s) => s.id),
        ]),
      ];
      this.notify();
      return;
    }
    if (this.preview && !this.transformTool) {
      const next = this.preview;
      this.preview = null;
      void this.commit(next);
    }
    this.notify();
  }
  finish(points = this.pending) {
    if (this.mode === "measurement" && points.length < 3) return;
    if (points.length < 2) return;
    if (this.mode === "select") return;
    try {
      const shape = construct(
        this.mode,
        points,
        this.mode === "arc" ? this.arcSweep : undefined,
        this.polygonSides,
        this.measurementSections,
      );
      if (this.mode === "control-curve")
        shape.handles = this.pendingHandles.slice(0, points.length);
      shape.id = crypto.randomUUID();
      shape.name = `${isCurveMode(this.mode) || isIndicator(this.mode) ? labels[this.mode] : shape.kind[0].toUpperCase() + shape.kind.slice(1)} ${this.document.shapes.length + 1}`;
      const next = {
        ...this.document,
        shapes: [...this.document.shapes, shape],
      };
      parseProject(JSON.stringify(this.normalizeTree(next)));
      this.pending = [];
      this.pendingHandles = [];
      this.smartGuides = [];
      this.snapTarget = null;
      this.snapKind = null;
      this.arcSweep = 0;
      this.arcRawSweep = 0;
      this.arcLast = undefined;
      void this.commit(next).then((success) => {
        if (!success) return;
        if (this.document.shapes.some((s) => s.id === shape.id))
          this.selected = [shape.id];
        this.message = "Ready";
        this.notify();
      });
    } catch (e) {
      this.fail(e);
    }
  }
  async toggleAnchorSmooth(id: string, index: number) {
    if (this.gesture || this.transformTool || this.busy) return;
    const shape = this.document.shapes.find((s) => s.id === id);
    if (!shape) return;
    const next = toggleAnchor(shape, index);
    if (next !== shape) await this.edit(id, next);
  }
  async makeAnchorSharp(id: string, index: number) {
    if (this.gesture || this.transformTool || this.busy) return;
    const shape = this.document.shapes.find((s) => s.id === id);
    if (!shape) return;
    const next = sharpAnchor(shape, index);
    if (next !== shape) await this.edit(id, shape.kind === "compound" ? {contours:next.contours} : { handles: next.handles });
  }
  async edit(id: string, changes: Partial<Shape>) {
    if (this.booleanOperation || this.pathCopy) return;
    if (this.selectionLocked) return;
    if (this.stitchMode) return;
    const source =
      this.propertySession?.next ?? this.pendingDocument ?? this.document;
    try {
      const next = parseProject(
        JSON.stringify({
          ...source,
          shapes: source.shapes.map((s) => {
            if (s.id !== id) return s;
            const updated = { ...s, ...changes };
            return s.kind === "text" &&
              (changes.fontSize !== undefined || changes.text !== undefined || changes.fontFamily !== undefined || changes.bold !== undefined || changes.italic !== undefined || changes.underline !== undefined || changes.strikethrough !== undefined || changes.textAlign !== undefined || changes.lineSpacing !== undefined)
              ? resizeText(updated)
              : updated;
          }),
        }),
      );
      if (this.propertySession) {
        this.propertySession.next = next;
        this.preview = next;
        this.notify();
        const session = this.propertySession,
          revision = this.revision,
          token = ++this.previewId;
        const result = await this.core.request(
          "preview",
          revision,
          reconcileStitches(next, this.document),
        ).catch((error) => {
          // A committed or superseded field can invalidate an in-flight preview.
          if (this.propertySession !== session || token !== this.previewId || this.revision !== revision) return null;
          throw error;
        });
        if (
          result &&
          this.propertySession === session &&
          token === this.previewId &&
          this.revision === revision
        ) {
          this.preview = result.document;
          this.notify();
        }
      } else await this.commit(next);
    } catch (e) {
      this.fail(e);
    }
  }
  delete() {
    if (this.selectionLocked) return;
    this.cancel();
    if (this.selectedGroups.some(id => this.isLocked(id))) return;
    const groups = new Set(this.selectedGroups);
    function removeGroups(nodes: ObjectNode[]): ObjectNode[] {
      return nodes.flatMap(n => groups.has(n.id) ? [] : [n.kind === "group" ? { ...n, children: removeGroups(n.children) } : n]);
    }
    if (this.selected.length || groups.size)
      void this.commit({
        ...this.document, objectTree: removeGroups(this.tree),
        shapes: this.document.shapes.filter(
          (s) => !this.selected.includes(s.id),
        ),
      });
  }
  copiedStyling: string | null = null;
  stylingClipboardFallback = false;
  get canToggleObjectState() {
    return this.ready && !this.busy && !this.gesture && !this.pending.length &&
      !this.drawingDown && !this.transformTool && !this.propertySession &&
      !this.pathCopy && !this.stitchMode && !this.trimMode && !this.mergeMode;
  }
  async toggleObjectState(id: string, field: "hidden" | "locked") {
    if (!this.canToggleObjectState) return;
    const shape = this.document.shapes.find(s => s.id === id);
    if (!shape) return;
    const success = await this.commit({ ...this.document, shapes: this.document.shapes.map(s =>
      s.id === id ? { ...s, [field]: !s[field] } : s) });
    if (success && field === "hidden" && !shape.hidden) {
      this.selected = this.selected.filter(x => x !== id);
      this.selectedGroups = this.selectedGroups.filter(groupId => {
        const node = findObjectNode(this.tree, groupId);
        return node?.kind !== "group" || !flattenObjectTree(node.children).includes(id);
      });
      this.panelRevision++;
    }
    this.notify();
  }
  get canStyle() {
    return this.ready && !this.busy && !this.gesture && !this.pending.length &&
      !this.transformTool && !this.propertySession && !this.pathCopy && !this.stitchMode && !this.trimMode && !this.mergeMode;
  }
  async copyStyling(id: string) {
    if (!this.canStyle) return;
    const shape = this.document.shapes.find(s => s.id === id);
    if (!shape || shapeArea(shape) === null) return;
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--shape").trim();
    const text = JSON.stringify({ format: "leather-pattern-designer-styling", version: 1,
      fillMode: shape.fillMode ?? "solid", strokeColor: shape.strokeColor ?? ctx.fillStyle, strokeOpacity: shape.strokeOpacity ?? 1, fillColor: shape.fillColor ?? ctx.fillStyle, fillOpacity: shape.fillOpacity ?? 0.05 });
    this.copiedStyling = text;
    this.stylingClipboardFallback = false;
    this.notify();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      this.stylingClipboardFallback = true;
      this.message = "Styling copied in this editor; system clipboard unavailable";
      this.notify();
    }
  }

  async pasteStyling(text?: string) {
    if (this.selectionLocked) return;
    if (!this.canStyle) return;
    const ids = [...this.selected], revision = this.revision;
    try {
      if (!text && !this.copiedStyling) return;
      const payload = JSON.parse(text ?? this.copiedStyling!);
      if (!this.canStyle || revision !== this.revision || ids.join() !== this.selected.join()) return;
      if (payload?.format !== "leather-pattern-designer-styling") {
        this.message = "No copied styling available"; this.notify(); return;
      }
      if (payload.version !== 1 || !/^#[0-9a-f]{6}$/i.test(payload.fillColor) ||
          typeof payload.fillOpacity !== "number" || !Number.isFinite(payload.fillOpacity) ||
          payload.fillOpacity < 0 || payload.fillOpacity > 1) throw Error("Invalid styling clipboard");
      if (payload.fillMode !== undefined && !["solid", "skiving", "glueing", "cutout"].includes(payload.fillMode)) throw Error("Invalid fill mode");
      if (payload.strokeColor !== undefined && (typeof payload.strokeColor !== "string" || !/^#[0-9a-f]{6}$/i.test(payload.strokeColor))) throw Error("Invalid outline color");
      if (payload.strokeOpacity !== undefined && (typeof payload.strokeOpacity !== "number" || !Number.isFinite(payload.strokeOpacity) || payload.strokeOpacity < 0 || payload.strokeOpacity > 1)) throw Error("Invalid outline opacity");
      let changed = false;
      const shapes = this.document.shapes.map(s => {
        if (!ids.includes(s.id) || shapeArea(s) === null ||
            (s.fillColor === payload.fillColor && s.fillOpacity === payload.fillOpacity && s.fillMode === payload.fillMode && s.strokeColor === payload.strokeColor && s.strokeOpacity === payload.strokeOpacity)) return s;
        changed = true;
        return { ...s, fillColor: payload.fillColor, fillOpacity: payload.fillOpacity, fillMode: payload.fillMode, strokeColor: payload.strokeColor, strokeOpacity: payload.strokeOpacity };
      });
      if (changed) await this.commit({ ...this.document, shapes });
    } catch (error) { this.fail(error); }
  }
  get canUseClipboard() {
    if (this.printLayoutActive) return false;
    return this.ready && !this.busy && !!this.clipboardPixel &&
      !this.gesture && !this.pending.length && !this.transformTool &&
      !this.propertySession && !this.pathCopy && !this.stitchMode && !this.trimMode && !this.mergeMode;
  }
  copyObjects(): string | null {
    if (!this.canUseClipboard || (!this.active.length && !this.selectedGroups.length)) return null;
    this.copiedStyling = null;
    this.stylingClipboardFallback = false;
    this.notify();
    const ids = new Set(this.active.map(s => s.id));
    const { groups, transfers, shapes:extraShapes } = copyStitchData(this.document,ids);
    const selectedShapes=[...this.document.shapes.filter(s=>ids.has(s.id) || !!s.stitchParentId && ids.has(s.stitchParentId)),...extraShapes];
    selectedShapes.forEach(s=>ids.add(s.id));
    const groupIds = new Set(groups.map(g => g.id));
    return JSON.stringify({
      format: "leather-pattern-designer-clipboard", version: 1,
      anchor: this.world(this.clipboardPixel!),
      origin:this.clipboardOrigin,
      externalTransfers:(this.document.stitchTransfers ?? []).filter(t=>ids.has(t.targetId) && !groupIds.has(t.masterId)),
      fallbackShapeIds:extraShapes.map(s=>s.id),
      document: { version: DOCUMENT_VERSION, shapes: selectedShapes.map(s=>({...s,stitchParentId:s.stitchParentId && ids.has(s.stitchParentId) ? s.stitchParentId : undefined})), objectTree: [...filterObjectTree(this.tree, ids, new Set(this.selectedGroups)),...extraShapes.map(s=>({kind:"object" as const,id:s.id}))], stitchGroups: groups, stitchTransfers:transfers,
        stitchLinks: (this.document.stitchLinks ?? []).map(l => ({
          ...l, members: l.members.filter(id => groupIds.has(id)),
        })).filter(l => l.members.length >= 2) },
    });
  }
  async pasteObjects(text: string) {
    if (!this.canUseClipboard) return;
    const anchor = this.world(this.clipboardPixel!);
    try {
      let payload;
      try { payload = JSON.parse(text); } catch { return; }
      if (payload?.format !== "leather-pattern-designer-clipboard") return;
      if (payload.version !== 1 || !Number.isFinite(payload.anchor?.x) ||
          !Number.isFinite(payload.anchor?.y)) throw Error("Invalid or unsupported object clipboard");
      const source = parseProject(JSON.stringify(payload.document));
      if (!source.shapes.length && !source.objectTree?.length) return;
      const external = payload.origin===this.clipboardOrigin && Array.isArray(payload.externalTransfers) ? payload.externalTransfers : [];
      const liveExternal=external.length>0 && external.every((t:StitchTransfer)=>this.stitchGroups.some(g=>g.id===t.masterId) && source.shapes.some(s=>s.id===t.targetId));
      if(liveExternal) {
        const fallbackIds=new Set(payload.fallbackShapeIds ?? []);
        source.shapes=source.shapes.filter(s=>!fallbackIds.has(s.id));
        source.stitchGroups=source.stitchGroups?.filter(g=>!fallbackIds.has(g.shapeId));
        source.objectTree=filterObjectTree(source.objectTree ?? [],new Set(source.shapes.map(s=>s.id)),new Set());
      }
      const ids = new Map(source.shapes.map(s => [s.id, crypto.randomUUID()]));
      const groupIds = new Map((source.stitchGroups ?? []).map(g => [g.id, crypto.randomUUID()]));
      const copies = source.shapes.map(s => ({
        ...moveShape(s, anchor.x - payload.anchor.x, anchor.y - payload.anchor.y),
        id: ids.get(s.id)!, name: `${s.name} copy`, locked: false,stitchParentId:s.stitchParentId ? ids.get(s.stitchParentId) : undefined,
      }));
      const remap = (nodes: ObjectNode[]): ObjectNode[] => nodes.map(n => n.kind === "object"
        ? { ...n, id: ids.get(n.id)! } : { ...n, id: crypto.randomUUID(), locked: false, children: remap(n.children) });
      const copiedTree = remap(source.objectTree ?? objectTreeFromShapes(source.shapes));
      let linkId = Math.max(0, ...(this.document.stitchLinks ?? []).map(l => l.id));
      const success = await this.commit({
        ...this.document, objectTree: [...copiedTree, ...this.tree], shapes: [...this.document.shapes, ...copies],
        stitchGroups: [...this.stitchGroups, ...(source.stitchGroups ?? []).map(g => ({
          ...g, id: groupIds.get(g.id)!, shapeId: ids.get(g.shapeId)!, continuation:g.continuation ? { ...g.continuation, previousId:groupIds.get(g.continuation.previousId)! } : undefined,
        }))],
        stitchTransfers:[...(this.document.stitchTransfers ?? []), ...copyTransferPlacements(this.document.stitchTransfers ?? [],[...(source.stitchTransfers ?? []),...(liveExternal ? external : [])].map((t:StitchTransfer) => ({ ...t,id:crypto.randomUUID(),masterId:groupIds.get(t.masterId) ?? t.masterId,targetId:ids.get(t.targetId)! })))],
        stitchLinks: [...(this.document.stitchLinks ?? []), ...(source.stitchLinks ?? []).map(l => ({
          ...l, id: ++linkId, members: l.members.map(id => groupIds.get(id)!),
        }))],
      });
      if (success) { this.selectedGroups = []; this.selected = copies.map(s => s.id); this.notify(); }
    } catch (error) { this.fail(error); }
  }
  async duplicate() {
    this.cancel();
    const initialIds=new Set(this.active.map(s=>s.id));
    const data=copyStitchData(this.document,initialIds,true);
    const originals=[...this.document.shapes.filter(s=>initialIds.has(s.id) || !!s.stitchParentId && initialIds.has(s.stitchParentId)),...data.shapes];
    const ids=new Map(originals.map(s=>[s.id,crypto.randomUUID()]));
    const copies=originals.map(s=>({...moveShape(s,10,10),id:ids.get(s.id)!,name:`${s.name} copy`,locked:false,stitchParentId:s.stitchParentId ? ids.get(s.stitchParentId) : undefined}));
    if(!copies.length && !this.selectedGroups.length)return;
    const chosen = new Set([...this.selectedGroups, ...this.selected,...originals.filter(s=>s.stitchParentId).map(s=>s.id)]);
    function copyNode(n: ObjectNode): ObjectNode {
      return n.kind === "object" ? { ...n, id: ids.get(n.id)! } :
        { ...n, id: crypto.randomUUID(), name: `${n.name} copy`, locked: false, children: n.children.map(copyNode) };
    }
    function duplicateNodes(nodes: ObjectNode[]): ObjectNode[] {
      return nodes.flatMap(n => chosen.has(n.id) ? [copyNode(n), n] :
        [n.kind === "group" ? { ...n, children: duplicateNodes(n.children) } : n]);
    }
    const {groups,transfers}=data;
    const groupIds = new Map(groups.map(g => [g.id,crypto.randomUUID()]));
    const success = await this.commit({
      ...this.document, shapes:[...this.document.shapes,...copies], objectTree:[...duplicateNodes(this.tree),...data.shapes.map(s=>({kind:"object" as const,id:ids.get(s.id)!}))],
      stitchLinks:[...(this.document.stitchLinks ?? []),...(this.document.stitchLinks ?? []).map((l,index)=>({...l,id:Math.max(0,...(this.document.stitchLinks ?? []).map(l=>l.id))+index+1,members:l.members.filter(id=>groupIds.has(id)).map(id=>groupIds.get(id)!)})).filter(l=>l.members.length>=2)],
      stitchGroups:[...this.stitchGroups,...groups.map(g => ({ ...g,id:groupIds.get(g.id)!,shapeId:ids.get(g.shapeId)!,continuation:g.continuation ? { ...g.continuation,previousId:groupIds.get(g.continuation.previousId)! } : undefined }))],
      stitchTransfers:[...(this.document.stitchTransfers ?? []),...copyTransferPlacements(this.document.stitchTransfers ?? [],transfers.map(t => ({ ...t,id:crypto.randomUUID(),masterId:groupIds.get(t.masterId) ?? t.masterId,targetId:ids.get(t.targetId)! })))],
    });
    if (success) {
      this.selectedGroups = [];
      this.selected = copies.filter(s=>!s.stitchParentId).map((s) => s.id);
      this.notify();
    }
  }
  fit(selection = false) {
    const shapes = (selection ? this.active : this.document.shapes).filter(s => !this.isHidden(s.id));
    if (!shapes.length) {
      if (!selection) {
        this.zoom = defaultGridView.zoom;
        this.pan = { ...defaultGridView.pan };
        this.notify();
      }
      return;
    }
    const b = bounds(shapes);
    this.zoom = Math.max(
      0.01,
      Math.min(
        100,
        (this.width - 100) / Math.max(1, b.width),
        (this.height - 100) / Math.max(1, b.height),
      ),
    );
    this.pan = {
      x: (this.width - b.width * this.zoom) / 2 - b.x * this.zoom,
      y: (this.height - b.height * this.zoom) / 2 - b.y * this.zoom,
    };
    this.notify();
  }
  wheel(pixel: Point, dx: number, dy: number, zoom: boolean, modifiers: {ctrlKey?:boolean;shiftKey?:boolean;altKey?:boolean}={}) {
    if(this.stitchTransferPlacement && !this.space && !zoom) {
      const placement=this.stitchTransferPlacement,step=modifiers.shiftKey ? 5 : 1;
      placement.rawAngle-=dy/100*step;
      placement.angle=snapRotation(placement.rawAngle,{shiftKey:modifiers.shiftKey,altKey:modifiers.altKey});
      if(placement.phase==="placed"){this.queuedTransferPointer=null;this.stitchError="";this.notify();}
      else this.updateStitchTransfer(this.world(pixel),!!modifiers.altKey);return;
    }
    if (zoom) {
      const p = this.world(pixel);
      this.zoom = Math.max(
        0.01,
        Math.min(100, this.zoom * Math.exp(-dy * 0.002)),
      );
      this.pan = { x: pixel.x - p.x * this.zoom, y: pixel.y - p.y * this.zoom };
    } else this.pan = { x: this.pan.x - dx, y: this.pan.y - dy };
    this.notify();
  }
  async confirmReplacement() {
    if (isTauri()) return !this.dirty || await invoke<boolean>("confirm_replace");
    return this.confirmReplace();
  }
  confirmReplace() {
    return (
      !this.dirty ||
      confirm("You have unsaved changes. Continue without saving?")
    );
  }
  async newProject() {
    if (this.fileBusy) return;
    this.fileBusy = true;
    try {
      if (!(await this.confirmReplacement())) return;
      this.cancel();
      await this.transact("load", emptyDocument());
      this.files.handle = null;
      this.collapsedGroups.clear(); this.selectedGroups = []; this.panelRevision++;
      this.name = "Untitled.leather";
      this.savedBaseline = fingerprint(this.document);
      this.dirty = false;
      this.notify();
    } finally {
      this.fileBusy = false;
    }
  }
  async open(requestId?: number) {
    if (this.fileBusy) return;
    const previousHandle = this.files.handle;
    this.fileBusy = true;
    try {
      if (!(await this.confirmReplacement())) return;
      const file = await this.files.open(requestId);
      if (!file) return;
      this.cancel();
      await this.transact("load", file.document);
      this.collapsedGroups = new Set(file.collapsedGroupIds ?? []);
      this.selectedGroups = []; this.panelRevision++;
      this.name = file.name;
      this.savedBaseline = fingerprint(this.document);
      this.dirty = false;
      this.scheduleRecovery();
      this.notify();
    } catch (e) {
      this.files.handle = previousHandle;
      this.fail(e);
    } finally {
      this.fileBusy = false;
    }
  }
  fileBusy = false;
  rename(value: string) {
    if (this.fileBusy) return;
    let name = value.trim();
    if (!name) return;
    if (!/\.(json|leather)$/i.test(name)) name += ".leather";
    if (name === this.name) return;
    this.name = name;
    this.files.handle = null;
    this.savedBaseline = "";
    this.updateDirty();
    this.scheduleRecovery();
    this.notify();
  }
  async save() {
    if (this.fileBusy) return;
    this.fileBusy = true;
    try {
      if (this.transformTool || this.stitchMode || this.booleanOperation) this.cancel();
      await this.finishProperty();
      await this.transactionQueue;
      const doc = this.document,
        result = await this.files.save(doc, this.name, [...this.collapsedGroups]);
      if (result.outcome === "cancelled") return;
      this.name = result.name;
      this.savedBaseline = fingerprint(doc);
      this.updateDirty();
      if (result.outcome === "saved") {
        this.message = "Project saved";
      } else {
        this.message = `Download started: ${result.name}. Keep this file; use Open to edit it again.`;
      }
      this.notify();
    } catch (e) {
      this.fail(e);
    } finally {
      this.fileBusy = false;
    }
  }
  async restoreProject() {
    if (this.fileBusy || !this.restore) return;
    this.fileBusy = true;
    try {
      if (!(await this.confirmReplacement())) return;
      const value = this.restore;
      this.restore = undefined;
      this.cancel();
      await this.transact("load", parseProject(JSON.stringify(value.document)));
      this.collapsedGroups = new Set(value.collapsedGroupIds ?? []);
      this.selectedGroups = []; this.panelRevision++;
      this.files.handle = null;
      this.name = value.name;
      this.savedBaseline = "";
      this.dirty = true;
      this.notify();
    } finally {
      this.fileBusy = false;
    }
  }
}
