import { formatLength, unitSymbol, type UnitMode } from "../model/units";
import { resizeText } from "../model/text";
import type { ImportedImage } from "./imageImport";
import { DOCUMENT_VERSION } from "../model/project";
import { isIndicator } from "../model/indicators";
import { inheritedStateSource, objectTreeFromShapes, reconcileObjectTree, treeInDrawingOrder, flattenObjectTree, findObjectNode, mapObjectTree, moveObjectNodes, objectState, filterObjectTree, type ObjectNode } from "../model/objectTree";
import { shapeArea } from "../model/area";
import { mergeShapes } from "../model/merge";
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
  stitchGeometry,
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
  core = new Core();
  files = new ProjectFiles();
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
    if (this.transformTool) {
      this.gesture = null;
      this.previewId++;
      this.notify();
    } else this.cancel();
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
  lastIndicator: Mode = "measurement";
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
  zoom = 3;
  pan = { x: 80, y: 100 };
  width = 900;
  height = 700;
  space = false;
  gesture: Gesture | null = null;
  message = "Starting geometry engine…";
  name = "Untitled.leather.json";
  restore: Recovery | undefined;
  listeners = new Set<() => void>();
  version = 0;
  timer: ReturnType<typeof setTimeout> | undefined;
  previewId = 0;
  previewRunning = false;
  queuedPreview: Doc | null = null;
  constructor() {
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
      this.revision,
      this.ready,
      this.message,
      this.busy,
      this.dirty,
      this.name,
      this.mode,
      this.lastRectangle,
      this.lastCircle,
      this.lastIndicator,
      this.lastPolygon,
      this.lastPolyline,
      this.selected.join(","),
      this.selectedGroups.join(","),
      this.panelRevision,
      this.pending.length,
      !!this.guideDrag,
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
    if (this.transformTool || this.stitchMode) this.cancel();
    const run = async () => {
      if (!this.ready) return;
      this.busy = true;
      this.notify();
      try {
        const before = this.revision;
        this.accept(
          await this.core.request(operation, this.revision, document),
        );
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
  stitchOriginal: Doc | null = null;
  stitchOriginalSettings: StitchSettings | null = null;
  stitchMode = false;
  stitchSelected: string[] = [];
  stitchSettings: StitchSettings = { ...defaultStitchSettings };
  stitchDraft: StitchGroup | null = null;
  stitchHover: StitchGroup | null = null;
  stitchAbsorbed: string[] = [];
  updateStitchHover() {
    if (this.stitchDraft) {
      this.stitchHover = null;
      return;
    }
    this.stitchAbsorbed = [];
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
  get convertiblePath() {
    if (this.selected.length !== 1) return undefined;
    return this.document.shapes.find(
      (s) =>
        s.id === this.selected[0] &&
        ["polyline", "curve", "control-curve"].includes(s.kind) &&
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
      stitchGeometry(shape, group);
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
      !this.gesture &&
      !this.guideDrag &&
      !this.busy
    );
  }
  get canStitch() {
    return (
      !this.selectionLocked &&
      (!this.selected.length ||
        this.active.some((shape) => stitchEdges(shape).length > 0))
    );
  }
  activateStitch() {
    if (!this.canStitch) return;
    this.cancel();
    this.tool = "select";
    this.mode = "select";
    this.stitchOriginal = this.document;
    this.stitchOriginalSettings = { ...this.stitchSettings };
    this.stitchMode = true;
    this.stitchSelected = [];
    this.notify();
  }
  get stitchGroups() {
    return this.document.stitchGroups ?? [];
  }
  stitchLineAt(raw: Point): StitchGroup | null {
    let closest = 8 / this.zoom,
      target: StitchGroup | null = null;
    for (const group of this.stitchGroups) {
      const shape = this.document.shapes.find((s) => s.id === group.shapeId);
      if (!shape || this.isHidden(shape.id) || this.isLocked(shape.id)) continue;
      try {
        const points = stitchGeometry(shape, group).points;
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
    if (line) return line;
    let best = 24 / this.zoom,
      target: StitchGroup | null = null;
    for (const s of this.document.shapes.filter((s) =>
      this.selected.includes(s.id) && !this.isHidden(s.id) && !this.isLocked(s.id),
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
          target = existing ?? {
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
            settings: { ...this.stitchSettings },
            closed: stitchClosed(s) && stitchEdges(s).length === 1,
          };
        }
    }
    return target;
  }
  stitchPlacement(target: StitchGroup, shift: boolean) {
    let next: StitchGroup = { ...target, id: crypto.randomUUID() };
    let absorbed: string[] = [];
    if (shift) {
      const source = this.document.shapes.find((s) => s.id === target.shapeId)!;
      const all = stitchEdges(source).map((e) => e.key),
        index = all.indexOf(target.edges[0]);
      const adjacent = [index - 1, index + 1]
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
          [...neighbors.flatMap((g) => g.edges), ...target.edges],
          master.edges[0],
        );
        next = {
          ...master,
          edges,
          closed: stitchClosed(source) && edges.length === all.length,
        };
        stitchGeometry(source, next);
        absorbed = neighbors.map((g) => g.id);
      }
    }
    stitchGeometry(
      this.document.shapes.find((s) => s.id === next.shapeId)!,
      next,
    );
    return { next, absorbed };
  }
  stitchClick(raw: Point, shift: boolean) {
    if (this.stitchDraft) {
      this.stitchError =
        "Apply or cancel settings before selecting another line.";
      this.notify();
      return;
    }
    const target = this.stitchTarget(raw);
    if (!target) return;
    if (target.id !== "preview") {
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
      const { next, absorbed } = this.stitchPlacement(target, shift);
      void this.commit({
        ...this.document,
        stitchGroups: [
          ...this.stitchGroups.filter((g) => !absorbed.includes(g.id)),
          next,
        ],
      }).then((ok) => {
        if (ok) {
          this.stitchSelected = [next.id];
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
    if (g) this.stitchDraft = { ...g, settings: { ...settings } };
    try {
      validateStitchSettings(settings, this.units);
      if (!g) this.stitchSettings = { ...settings };
      if (this.stitchDraft)
        stitchGeometry(
          this.document.shapes.find((s) => s.id === g!.shapeId)!,
          this.stitchDraft,
        );
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
    if (this.selectionLocked) return;
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
          stitchGeometry(
            next.shapes.find((s) => s.id === draft.shapeId)!,
            draft,
          );
      } catch (error) {
        this.stitchError = String(error);
        this.notify();
        return;
      }
      const defaults = { ...(draft?.settings ?? this.stitchSettings) };
      this.cancel();
      await this.commit(next);
      this.stitchSettings = defaults;
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
      return stitchGeometry(shape, group).holes.length;
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
        return stitchGeometry(this.document.shapes.find(s => s.id === g.shapeId)!, g).holes.length;
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
  async mergeStitches() {
    if (this.stitchSelected.length !== 2 || this.stitchDraft || this.busy)
      return;
    try {
      const [master, other] = this.stitchSelected.map((id) =>
        this.stitchGroups.find((g) => g.id === id)!,
      );
      if (!master || !other || master.shapeId !== other.shapeId)
        throw Error("Select two connected lines on the same shape.");
      const s = this.document.shapes.find((s) => s.id === master.shapeId)!;
      if (!stitchClosed(s) && master.side !== other.side)
        throw Error("Stitch lines must use the same side.");
      const edges = orderStitchEdges(
        s,
        [...master.edges, ...other.edges],
        master.edges[0],
      );
      const merged = {
        ...master,
        edges,
        closed: stitchClosed(s) && edges.length === stitchEdges(s).length,
      };
      stitchGeometry(s, merged);
      await this.commit({
        ...this.document,
        stitchGroups: this.stitchGroups
          .filter((g) => g.id !== other.id)
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
    await this.commit({
      ...this.document,
      stitchLinks: (this.document.stitchLinks ?? []).map(l => ({...l, members: l.members.filter(id => id !== g.id)})).filter(l => l.members.length >= 2),
      stitchGroups: [
        ...this.stitchGroups.filter((x) => x.id !== g.id),
        ...groups,
      ],
    });
    this.stitchSelected = [groups[0].id];
    this.notify();
  }
  async deleteStitches() {
    if (this.busy) return;
    const remaining = this.stitchGroups.filter(
      (g) => !this.stitchSelected.includes(g.id),
    );
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
  async commit(document: Doc) {
    document = this.normalizeTree(document);
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

  polygonSides = 3;
  adjustPolygonSides(delta: number) {
    this.polygonSides = Math.max(3, Math.min(100, this.polygonSides + delta));
    this.message = "Ready";
    this.notify();
  }
  setTool(tool: Mode | Tool) {
    this.setMode(tool === "line" ? "polyline" : (tool as Mode));
  }
  setMode(mode: Mode) {
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
    if (isIndicator(mode) || mode === "measurement") this.lastIndicator = mode;
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
        ? group === "indicator" ? this.lastIndicator : group === "rectangle"
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
      );
    } catch {
      return null;
    }
  }
  beginProperty() {
    if (this.selectionLocked) return;
    if (this.transformTool || this.stitchMode) return;
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
  private mergeCache: {
    key: string;
    result: ReturnType<typeof mergeShapes>;
  } | null = null;
  get mergeResult() {
    if (this.selectionLocked) return null;
    if (this.stitchGroups.some((g) => this.selected.includes(g.shapeId))) return null;
    const key = JSON.stringify([this.revision, this.selected]);
    if (this.mergeCache?.key !== key) {
      this.mergeCache = {
        key,
        result: mergeShapes(
          this.document.shapes.filter((s) => this.selected.includes(s.id)),
        ),
      };
    }
    return this.mergeCache.result;
  }
  activateMerge() {
    if (this.selectionLocked) return;
    const result = this.mergeResult;
    if (!result || this.busy) return;
    this.cancel();
    this.tool = "select";
    this.mode = "select";
    this.trimMode = true;
    this.mergeMode = true;
    const ids = new Set(this.selected);
    this.trimDraft = {
      ...this.document,
      shapes: this.document.shapes.flatMap((s) =>
        s.id === result.id ? [result] : ids.has(s.id) ? [] : [s],
      ),
    };
    this.preview = this.trimDraft;
    this.notify();
  }
  mergeMode = false;
  trimHighlight: Point[] | null = null;
  trimMode = false;
  trimDraft: Doc | null = null;
  async applyTrim() {
    if (this.selectionLocked) return;
    if (!this.trimDraft || this.transformError || this.busy) return;
    const next = this.trimDraft;
    const mergedId = this.mergeMode
      ? next.shapes.find((s) => this.selected.includes(s.id))?.id
      : undefined;
    this.cancel();
    if (await this.commit(next)) {
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
    this.mirrorAxis = null;
    this.mirrorLine = null;
    this.mirrorHover = null;
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
  snap(p: Point, disabled = false): Point {
    this.smartGuides = [];
    this.snapTarget = null;
    this.snapKind = null;
    if (disabled) return p;
    const tolerance = 8 / this.zoom;
    if (this.objects) {
      let best = tolerance;
      for (const s of this.document.shapes.filter(s => !this.isHidden(s.id))) {
        if (this.gesture?.selection.includes(s.id)) continue;
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
      for (const s of this.document.shapes.filter(s => !this.isHidden(s.id))) {
        if (this.gesture?.selection.includes(s.id)) continue;
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
          this.snapKind = "edge";
        }
      }
      if (this.snapTarget) return this.snapTarget;
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
          (shape) => !this.gesture?.selection.includes(shape.id),
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
  isHidden(id: string) { return objectState(this.document, id).hidden; }
  isLocked(id: string) { return objectState(this.document, id).locked; }
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
    ).shapes.filter((s) => this.selected.includes(s.id));
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
        distanceToSegment(raw, this.transformPivot, h.point) < 8 / this.zoom,
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
    this.selectedGroups = []; this.panelRevision++;
    this.clipboardPixel = { ...pixel };
    this.pointerInside = true;
    const raw = this.world(pixel);
    this.anchorPointer = raw;
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
      this.stitchClick(raw, shift);
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
      this.updateStitchHover();
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
      (pointCount(this.mode) === 2 || this.mode === "polyline") &&
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
        let dx = raw.x - g.start.x,
          dy = raw.y - g.start.y,
          best = Infinity,
          bestPriority = Infinity,
          adjust = { x: 0, y: 0 },
          target: Point | null = null;
        let source: Point | undefined;
        let targetGuides: SmartGuide[] = [];
        let targetKind: SnapKind | null = null;
        for (const s of g.original.shapes.filter(selected))
          for (const a of g.snapAnchor ? [] : anchors(s)) {
            const p = { x: a.x + dx, y: a.y + dy },
              q = this.snap(p, alt),
              d = distance(p, q);
            const priority =
              this.snapKind === "alignment"
                ? 1
                : this.snapKind === "grid"
                  ? 2
                  : 0;
            if (
              this.snapTarget &&
              (priority < bestPriority ||
                (priority === bestPriority && d < best))
            ) {
              bestPriority = priority;
              best = d;
              source = a;
              adjust = { x: q.x - p.x, y: q.y - p.y };
              target = this.snapTarget;
              targetKind = this.snapKind;
              targetGuides = this.smartGuides;
            }
          }
        if (source) g.snapAnchor = source;
        if (g.snapAnchor && !target) {
          const p = { x: g.snapAnchor.x + dx, y: g.snapAnchor.y + dy },
            q = this.snap(p, alt);
          adjust = { x: q.x - p.x, y: q.y - p.y };
          target = this.snapTarget;
          targetKind = this.snapKind;
          targetGuides = this.smartGuides;
        }
        dx += adjust.x;
        dy += adjust.y;
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
        const step = ctrl ? 10 : shift ? 5 : 1;
        const angle = alt ? rawAngle : Math.round(rawAngle / step) * step;
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
      if (g.kind === "vertex") {
        const original = rectanglePath(g.original.shapes.find((s) => selected(s))!);
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
      if (d.initial && pixel && distance(pixel,d.pixel) >= 4 && ["arrow","arrow-head","crosshair","size-ruler"].includes(this.mode)) this.pending=[d.point];
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
    if (next !== shape) await this.edit(id, { handles: next.handles });
  }
  async edit(id: string, changes: Partial<Shape>) {
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
              (changes.fontSize !== undefined || changes.text !== undefined)
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
        );
        if (
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
      !this.stitchMode && !this.trimMode && !this.mergeMode;
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
      !this.transformTool && !this.propertySession && !this.stitchMode && !this.trimMode && !this.mergeMode;
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
    return this.ready && !this.busy && this.pointerInside && !!this.clipboardPixel &&
      !this.gesture && !this.pending.length && !this.transformTool &&
      !this.propertySession && !this.stitchMode && !this.trimMode && !this.mergeMode;
  }
  copyObjects(): string | null {
    if (!this.canUseClipboard || (!this.active.length && !this.selectedGroups.length)) return null;
    this.copiedStyling = null;
    this.stylingClipboardFallback = false;
    this.notify();
    const ids = new Set(this.active.map(s => s.id));
    const groups = this.stitchGroups.filter(g => ids.has(g.shapeId));
    const groupIds = new Set(groups.map(g => g.id));
    return JSON.stringify({
      format: "leather-pattern-designer-clipboard", version: 1,
      anchor: this.world(this.clipboardPixel!),
      document: { version: DOCUMENT_VERSION, shapes: this.active, objectTree: filterObjectTree(this.tree, ids, new Set(this.selectedGroups)), stitchGroups: groups,
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
      const ids = new Map(source.shapes.map(s => [s.id, crypto.randomUUID()]));
      const groupIds = new Map((source.stitchGroups ?? []).map(g => [g.id, crypto.randomUUID()]));
      const copies = source.shapes.map(s => ({
        ...moveShape(s, anchor.x - payload.anchor.x, anchor.y - payload.anchor.y),
        id: ids.get(s.id)!, name: `${s.name} copy`, locked: false,
      }));
      const remap = (nodes: ObjectNode[]): ObjectNode[] => nodes.map(n => n.kind === "object"
        ? { ...n, id: ids.get(n.id)! } : { ...n, id: crypto.randomUUID(), locked: false, children: remap(n.children) });
      const copiedTree = remap(source.objectTree ?? objectTreeFromShapes(source.shapes));
      let linkId = Math.max(0, ...(this.document.stitchLinks ?? []).map(l => l.id));
      const success = await this.commit({
        ...this.document, objectTree: [...copiedTree, ...this.tree], shapes: [...this.document.shapes, ...copies],
        stitchGroups: [...this.stitchGroups, ...(source.stitchGroups ?? []).map(g => ({
          ...g, id: groupIds.get(g.id)!, shapeId: ids.get(g.shapeId)!,
        }))],
        stitchLinks: [...(this.document.stitchLinks ?? []), ...(source.stitchLinks ?? []).map(l => ({
          ...l, id: ++linkId, members: l.members.map(id => groupIds.get(id)!),
        }))],
      });
      if (success) { this.selectedGroups = []; this.selected = copies.map(s => s.id); this.notify(); }
    } catch (error) { this.fail(error); }
  }
  async duplicate() {
    this.cancel();
    const copies = this.active.map((s) => ({
      ...moveShape(s, 10, 10),
      id: crypto.randomUUID(),
      name: `${s.name} copy`, locked: false,
    }));
    if (!copies.length && !this.selectedGroups.length) return;
    const ids = new Map(this.active.map((s, i) => [s.id, copies[i].id]));
    const chosen = new Set([...this.selectedGroups, ...this.selected]);
    function copyNode(n: ObjectNode): ObjectNode {
      return n.kind === "object" ? { ...n, id: ids.get(n.id)! } :
        { ...n, id: crypto.randomUUID(), name: `${n.name} copy`, locked: false, children: n.children.map(copyNode) };
    }
    function duplicateNodes(nodes: ObjectNode[]): ObjectNode[] {
      return nodes.flatMap(n => chosen.has(n.id) ? [copyNode(n), n] :
        [n.kind === "group" ? { ...n, children: duplicateNodes(n.children) } : n]);
    }
    const success = await this.commit({
      ...this.document,
      shapes: [...this.document.shapes, ...copies],
      objectTree: duplicateNodes(this.tree),
      stitchGroups: [
        ...this.stitchGroups,
        ...this.active.flatMap((source, i) =>
          this.stitchGroups
            .filter((g) => g.shapeId === source.id)
            .map((g) => ({
              ...g,
              id: crypto.randomUUID(),
              shapeId: copies[i].id,
              edges: [...g.edges],
              settings: { ...g.settings },
            })),
        ),
      ],
    });
    if (success) {
      this.selectedGroups = [];
      this.selected = copies.map((s) => s.id);
      this.notify();
    }
  }
  fit(selection = false) {
    const shapes = (selection ? this.active : this.document.shapes).filter(s => !this.isHidden(s.id));
    if (!shapes.length) return;
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
  wheel(pixel: Point, dx: number, dy: number, zoom: boolean) {
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
  confirmReplace() {
    return (
      !this.dirty ||
      confirm("You have unsaved changes. Continue without saving?")
    );
  }
  async newProject() {
    if (this.fileBusy) return;
    if (!this.confirmReplace()) return;
    this.cancel();
    await this.transact("load", emptyDocument());
    this.files.handle = null;
    this.collapsedGroups.clear(); this.selectedGroups = []; this.panelRevision++;
    this.name = "Untitled.leather.json";
    this.savedBaseline = fingerprint(this.document);
    this.dirty = false;
    this.notify();
  }
  async open() {
    if (this.fileBusy) return;
    if (!this.confirmReplace()) return;
    this.fileBusy = true;
    try {
      const file = await this.files.open();
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
    if (!/\.json$/i.test(name)) name += ".leather.json";
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
      if (this.transformTool || this.stitchMode) this.cancel();
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
    if (this.fileBusy || !this.restore || !this.confirmReplace()) return;
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
  }
}
