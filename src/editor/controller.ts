import { sharpAnchor, toggleAnchor } from "../model/sharpAnchor";
import { insertAnchor } from "../model/insertAnchor";
import { isCurve, zeroHandles, mirroredHandles } from "../model/curves";
import type { CurveHandles } from "../generated/CurveHandles";
import { snapCandidates, type SnapKind } from "./snapping";
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
  anchors,
  stretchShape,
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
const fingerprint = (doc: Doc) =>
  JSON.stringify(parseProject(JSON.stringify(doc)));
export type Gesture = {
  kind: "move" | "scale" | "rotate" | "vertex" | "marquee" | "pan";
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
  vertex?: number;
  handleSide?: "incoming" | "outgoing";
  pan?: Point;
  crossing?: boolean;
  angle?: number;
  lastAngle?: number;
  factor?: number;
};
export class Controller {
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
  savedBaseline = JSON.stringify(emptyDocument());
  transformTool: "move" | "rotate" | "scale" | null = null;
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
    if (!this.preview) return !this.transformError;
    try {
      parseProject(JSON.stringify(this.preview));
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
    this.rebaseTransform();
    this.transformPivot = point;
    this.placingPivot = false;
    this.notify();
  }
  setOrientation(value: "world" | "local") {
    this.rebaseTransform();
    this.transformOrientation = value;
    this.preferences();
    this.notify();
  }
  resetPivot() {
    this.rebaseTransform();
    const b = this.selectionBounds;
    this.transformPivot = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    this.notify();
  }
  setTransformValues(values: Partial<typeof this.transformValues>) {
    if (!this.transformOriginal) return;
    const previous = { ...this.transformValues };
    this.transformValues = { ...this.transformValues, ...values };
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
    this.transformDraft = next;
    try {
      parseProject(JSON.stringify(next));
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
  arcLast: number | undefined;
  propertySession: { original: Doc; next: Doc } | null = null;
  selected: string[] = [];
  hover = "";
  pending: Point[] = [];
  cursor: Point = { x: 0, y: 0 };
  snapTarget: Point | null = null;
  snapKind: SnapKind | null = null;
  pointerInside = false;
  grid = true;
  objects = true;
  gridSize = 1;
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
    try {
      localStorage.setItem(
        "leather-ui",
        JSON.stringify({
          transformOrientation: this.transformOrientation,
          grid: this.grid,
          objects: this.objects,
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
      this.transformTool,
      this.transformTool ? this.version : 0,
      this.revision,
      this.ready,
      this.busy,
      this.dirty,
      this.name,
      this.mode,
      this.lastRectangle,
      this.lastCircle,
      this.lastPolygon,
      this.lastPolyline,
      this.selected.join(","),
      this.pending.length,
      this.grid,
      this.objects,
      this.gridSize,
      this.gridStyle,
      this.rulers,
      this.theme,
      this.restore?.time,
      this.propertySession ? this.version : 0,
    ].join("|");
  cursorSnapshot = () =>
    `${this.cursor.x.toFixed(1)}, ${this.cursor.y.toFixed(1)} mm|${this.message}|${this.zoom}`;
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
    const hit = [...this.document.shapes]
      .reverse()
      .find((s) => s.kind !== "text" && hitTest(s, raw, 8 / this.zoom));
    let point: Point | null = null;
    if (hit)
      insertAnchor(hit, raw, 8 / this.zoom, (p) => {
        point = p;
      });
    return point;
  }
  leavePointer() {
    this.pointerInside = false;
    this.snapTarget = null;
    this.snapKind = null;
    this.notify();
  }

  updateDirty() {
    const source =
      this.propertySession?.next ?? this.pendingDocument ?? this.document;
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
      this.accept(await this.core.request("snapshot", 0));
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
    this.selected = this.selected.filter((id) =>
      s.document.shapes.some((s) => s.id === id),
    );
  }
  scheduleRecovery() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void recovery({
        document: this.document,
        name: this.name,
        time: Date.now(),
      }).catch(() =>
        this.fail(Error("Recovery storage failed. Save a project file.")),
      );
    }, 300);
  }
  async transact(operation: string, document?: Doc) {
    if (this.transformTool) this.cancel();
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
  async commit(document: Doc) {
    try {
      const validated = parseProject(JSON.stringify(document));
      this.pendingDocument = validated;
      await this.transact("commit", validated);
      if (this.pendingDocument === validated) this.pendingDocument = null;
    } catch (e) {
      this.preview = null;
      this.fail(e);
    }
  }
  async validatePreview(document: Doc) {
    this.queuedPreview = document;
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
      mode === "text"
        ? "text"
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
        ? group === "rectangle"
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
    if (
      ["rectangle", "rectangle-center", "ellipse", "polygon-box"].includes(
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
    const dx = this.cursor.x - a.x,
      dy = this.cursor.y - a.y;
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
      if (locks.Height === undefined) return p;
      const [a, b] = this.pending,
        len = distance(a, b);
      const h = locks.Height / (this.mode === "ellipse-center" ? 2 : 1);
      return {
        x: a.x - ((b.y - a.y) / len) * h,
        y: a.y + ((b.x - a.x) / len) * h,
      };
    }
    let dx = p.x - a.x,
      dy = p.y - a.y;
    if (this.measurementFields.includes("Height")) {
      const factor = this.mode === "rectangle-center" ? 2 : 1;
      if (locks.Width !== undefined)
        dx = (Math.sign((locks._x ?? dx) || 1) * locks.Width) / factor;
      if (locks.Height !== undefined)
        dy = (Math.sign((locks._y ?? dy) || 1) * locks.Height) / factor;
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
    if (this.mode === "polyline" && shift && this.pending.length) {
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
      this.snapTarget = null;
      return p;
    }
    return this.snap(raw, alt);
  }
  addPoint(p: Point) {
    p = this.constrainMeasurement(p);
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
    if (this.transformTool) return;
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

  async activateTransform(tool: "move" | "rotate" | "scale") {
    if (!this.ready || this.busy || !this.selected.length) return;
    if (this.propertySession) await this.finishProperty();
    this.cancel();
    this.tool = "select";
    this.mode = "select";
    this.transformTool = tool;
    this.transformOriginal = this.document;
    this.transformValues = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };
    this.resetPivot();
    this.notify();
  }
  async applyTransform() {
    if (!this.transformValid || !this.transformTool || this.busy) return;
    const next = this.transformDraft ?? this.preview;
    this.cancel();
    if (next && fingerprint(next) !== fingerprint(this.document))
      await this.commit(next);
  }
  cancel() {
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
    this.arcLast = undefined;
    this.previewId++;
    this.pending = [];
    this.pendingHandles = [];
    this.preview = null;
    this.gesture = null;
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
    this.snapTarget = null;
    this.snapKind = null;
    if (disabled) return p;
    const tolerance = 8 / this.zoom;
    if (this.objects) {
      let best = tolerance;
      for (const s of this.document.shapes) {
        if (this.gesture?.selection.includes(s.id)) continue;
        for (const candidate of snapCandidates(s)) {
          const d = distance(candidate.point, p);
          if (d < best) {
            best = d;
            this.snapTarget = candidate.point;
            this.snapKind = candidate.kind;
          }
        }
      }
      if (this.snapTarget) return this.snapTarget;
      for (const s of this.document.shapes) {
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
  get active() {
    return (
      this.propertySession?.next ??
      this.preview ??
      this.pendingDocument ??
      this.document
    ).shapes.filter((s) => this.selected.includes(s.id));
  }
  get selectionBounds() {
    return bounds(this.active);
  }
  handles(): {
    kind: "move" | "scale" | "rotate" | "vertex";
    point: Point;
    vertex?: number;
    handleSide?: "incoming" | "outgoing";
    axis?: "x" | "y";
  }[] {
    if (!this.selected.length) return [];
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
        ["line", "polyline"].includes(this.active[0].kind)
      )
        worldPoints(this.active[0]).forEach((point, vertex) =>
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
      ["line", "polyline"].includes(this.active[0].kind)
    )
      worldPoints(this.active[0]).forEach((point, vertex) =>
        result.push({ kind: "vertex", point, vertex }),
      );
    return [...result, ...curveHandles];
  }
  handleAt(raw: Point) {
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
  pointerDown(
    pixel: Point,
    button: number,
    shift: boolean,
    alt: boolean,
    ctrl = false,
  ) {
    if (!this.ready || this.busy) return;
    const raw = this.world(pixel);
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
    if (button === 2 && this.transformTool) {
      void this.applyTransform();
      return;
    }
    if (button !== 0) return;
    if (this.placingPivot) {
      this.setPivot(this.snap(raw, alt));
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
    if (alt && !this.transformTool) {
      const hit = [...this.document.shapes]
        .reverse()
        .find((s) => s.kind !== "text" && hitTest(s, raw, 8 / this.zoom));
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
    const handle = this.handleAt(raw);
    if (handle) {
      this.gesture = {
        kind: handle.kind,
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
        (s) => hitTest(s, raw, 8 / this.zoom) || (ctrl && contains(s, raw)),
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
        Math.min(360, this.arcSweep + (delta * 180) / Math.PI),
      );
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
          adjust = { x: 0, y: 0 },
          target: Point | null = null;
        let source: Point | undefined;
        let targetKind: SnapKind | null = null;
        for (const s of g.original.shapes.filter(selected))
          for (const a of g.snapAnchor ? [] : anchors(s)) {
            const p = { x: a.x + dx, y: a.y + dy },
              q = this.snap(p, alt),
              d = distance(p, q);
            if (this.snapTarget && d < best) {
              best = d;
              source = a;
              adjust = { x: q.x - p.x, y: q.y - p.y };
              target = this.snapTarget;
              targetKind = this.snapKind;
            }
          }
        if (source) g.snapAnchor = source;
        if (g.snapAnchor && !target) {
          const p = { x: g.snapAnchor.x + dx, y: g.snapAnchor.y + dy },
            q = this.snap(p, alt);
          adjust = { x: q.x - p.x, y: q.y - p.y };
          target = this.snapTarget;
          targetKind = this.snapKind;
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
        this.message = `Move ${this.transformValues.x.toFixed(1)}, ${this.transformValues.y.toFixed(1)} mm`;
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
        const sx = g.axis === "y" ? 1 : factor,
          sy = g.axis === "x" ? 1 : factor;
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
      if (g.kind === "vertex") {
        const original = g.original.shapes.find((s) => selected(s))!;
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
          (closed &&
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
                    if (i !== g.vertex) return h;
                    const v = {
                      x: local.x - original.points[i].x,
                      y: local.y - original.points[i].y,
                    };
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
        [...this.document.shapes]
          .reverse()
          .find((s) => hitTest(s, raw, 8 / this.zoom))?.id ?? "";
    }
    this.notifyPointer();
  }
  pointerUp(pixel?: Point, alt = false, shift = false, ctrl = false) {
    if (this.drawingDown) {
      const d = this.drawingDown;
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
          const v =
            pixel && distance(pixel, d.pixel) >= 4
              ? { x: p.x - anchor.x, y: p.y - anchor.y }
              : { x: 0, y: 0 };
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
              const b = bounds([s]);
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
      shape.name = `${isCurveMode(this.mode) ? labels[this.mode] : shape.kind[0].toUpperCase() + shape.kind.slice(1)} ${this.document.shapes.length + 1}`;
      const next = {
        ...this.document,
        shapes: [...this.document.shapes, shape],
      };
      parseProject(JSON.stringify(next));
      this.pending = [];
      this.pendingHandles = [];
      this.arcSweep = 0;
      this.arcLast = undefined;
      void this.commit(next).then(() => {
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
    if (next !== shape) await this.edit(id, { handles: next.handles });
  }
  async makeAnchorSharp(id: string, index: number) {
    if (this.gesture || this.transformTool || this.busy) return;
    const shape = this.document.shapes.find((s) => s.id === id);
    if (!shape) return;
    const next = sharpAnchor(shape, index);
    if (next !== shape) await this.edit(id, { handles: next.handles });
  }
  async edit(id: string, changes: Partial<Shape>) {
    const source =
      this.propertySession?.next ?? this.pendingDocument ?? this.document;
    try {
      const next = parseProject(
        JSON.stringify({
          ...source,
          shapes: source.shapes.map((s) =>
            s.id === id ? { ...s, ...changes } : s,
          ),
        }),
      );
      if (this.propertySession) {
        this.propertySession.next = next;
        this.preview = next;
        this.notify();
        const session = this.propertySession,
          revision = this.revision,
          token = ++this.previewId;
        const result = await this.core.request("preview", revision, next);
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
    this.cancel();
    if (this.selected.length)
      void this.commit({
        ...this.document,
        shapes: this.document.shapes.filter(
          (s) => !this.selected.includes(s.id),
        ),
      });
  }
  duplicate() {
    this.cancel();
    const copies = this.active.map((s) => ({
      ...moveShape(s, 10, 10),
      id: crypto.randomUUID(),
      name: `${s.name} copy`,
    }));
    if (!copies.length) return;
    void this.commit({
      ...this.document,
      shapes: [...this.document.shapes, ...copies],
    }).then(() => {
      this.selected = copies.map((s) => s.id);
      this.notify();
    });
  }
  fit(selection = false) {
    const shapes = selection ? this.active : this.document.shapes;
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
    if (!this.confirmReplace()) return;
    this.cancel();
    await this.transact("load", emptyDocument());
    this.files.handle = null;
    this.name = "Untitled.leather.json";
    this.savedBaseline = fingerprint(this.document);
    this.dirty = false;
    this.notify();
  }
  async open() {
    if (!this.confirmReplace()) return;
    try {
      const file = await this.files.open();
      if (!file) return;
      this.cancel();
      await this.transact("load", file.document);
      this.name = file.name;
      this.savedBaseline = fingerprint(this.document);
      this.dirty = false;
      this.scheduleRecovery();
      this.notify();
    } catch (e) {
      this.fail(e);
    }
  }
  async save(saveAs = false) {
    if (this.transformTool) this.cancel();
    await this.finishProperty();
    await this.transactionQueue;
    try {
      const doc = this.document,
        result = await this.files.save(doc, this.name, saveAs);
      if (result === "cancelled") return;
      if (result === "saved") {
        this.name = this.files.handle.name;
        this.savedBaseline = fingerprint(doc);
        this.updateDirty();
        this.message = "Project saved";
      } else {
        this.savedBaseline = fingerprint(doc);
        this.updateDirty();
        this.message =
          "Project download started. Keep the downloaded file as your saved copy.";
      }
      this.notify();
    } catch (e) {
      this.fail(e);
    }
  }
  async restoreProject() {
    if (!this.restore || !this.confirmReplace()) return;
    const value = this.restore;
    this.restore = undefined;
    this.cancel();
    await this.transact("load", parseProject(JSON.stringify(value.document)));
    this.name = value.name;
    this.savedBaseline = "";
    this.dirty = true;
    this.notify();
  }
}
